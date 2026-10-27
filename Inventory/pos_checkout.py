"""Atomic checkout for WOE BETIDE's physical POS. No model migrations required."""
import json
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone

from .models import Garment, Sale, SaleItem, Payment

CENT = Decimal('0.01')
ZERO = Decimal('0.00')
# Physical Clip charge: 3.4% plus 16% VAT on the fee. Check contract before enabling.
CLIP_FEE_RATE = Decimal('0.034')
FEE_VAT_RATE = Decimal('0.16')


def error(message, status=400):
    return JsonResponse({'success': False, 'error': message}, status=status)


def mxn(value):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount.as_tuple().exponent < -2:
            raise ValueError()
        return amount.quantize(CENT)
    except (TypeError, InvalidOperation, ValueError):
        raise ValueError('Invalid discount. Enter a nonnegative amount in MXN with up to two decimals.')


@login_required
@require_POST
@transaction.atomic
def pos_complete_sale(request):
    try:
        payload = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return error('Invalid checkout request.')
    if not isinstance(payload, dict):
        return error('Invalid checkout payload.')
    ids = payload.get('garment_ids')
    if (not isinstance(ids, list) or not 1 <= len(ids) <= 100 or
            not all(isinstance(i, str) and 0 < len(i) <= 40 for i in ids) or
            len(ids) != len(set(ids))):
        return error('Select between 1 and 100 different garments.')
    try:
        discount = mxn(payload.get('discount', '0'))
    except ValueError as exc:
        return error(str(exc))
    payment_method = payload.get('payment_method')
    if payment_method not in ('cash', 'clip', 'card', 'transfer'):
        return error('Select a valid payment method.')

    # Lock rows in a consistent order, making simultaneous POS checkouts safe on PostgreSQL.
    locked = list(Garment.objects.select_for_update().filter(garment_id__in=ids).order_by('pk'))
    if len(locked) != len(ids):
        return error('One or more garments no longer exist. Refresh the cart.', 409)
    by_id = {g.garment_id: g for g in locked}
    garments = [by_id[i] for i in ids]
    for garment in garments:
        if garment.status not in (Garment.Status.AVAILABLE, Garment.Status.PUBLISHED):
            return error(f'{garment.garment_id} is no longer available.', 409)
        if SaleItem.objects.filter(garment=garment).exists():
            return error(f'{garment.garment_id} has already been recorded in a sale.', 409)

    # Guard against an existing Shopify/Django website sale for a linked product.
    from django.apps import apps
    Item = apps.get_model('Catalogue', 'Item')
    linked_items = list(Item.objects.select_for_update().filter(garment__in=garments).order_by('pk'))
    for item in linked_items:
        if item.is_sold or item.is_archive:
            return error(f'The website listing for {item.garment.garment_id} is sold or archived.', 409)

    prices = [g.listed_price.quantize(CENT) for g in garments]
    if any(p < 0 for p in prices):
        return error('A garment has an invalid listed price.')
    subtotal = sum(prices, ZERO)
    if subtotal <= 0:
        return error('Checkout requires a positive subtotal.')
    if discount >= subtotal:
        return error('Discount must be smaller than the subtotal.')
    total = subtotal - discount

    # Proportional discount allocation; final line receives any rounding difference.
    remaining = discount
    line_prices = []
    for n, price in enumerate(prices):
        allocation = remaining if n == len(prices) - 1 else (discount * price / subtotal).quantize(CENT, rounding=ROUND_HALF_UP)
        if allocation > price:
            allocation = price
        remaining -= allocation
        line_prices.append(price - allocation)
    if sum(line_prices, ZERO) != total:
        return error('Unable to allocate the discount. Please try again.')

    sale = Sale.objects.create(
        sale_id='POS-' + uuid.uuid4().hex[:24].upper(),
        sale_date=timezone.localdate(),
        channel=Sale.Channel.PHYSICAL,
        created_by=request.user,
        notes=f'POS checkout | Discount: MXN {discount:.2f} | Method: {payment_method}',
    )
    for garment, sale_price in zip(garments, line_prices):
        SaleItem.objects.create(sale=sale, garment=garment, sold_price=sale_price)
        garment.status = Garment.Status.SOLD
        garment.sold_price = sale_price
        garment.is_visible_on_site = False
        garment.save(update_fields=['status', 'sold_price', 'is_visible_on_site', 'updated_at'])

    fees = (total * CLIP_FEE_RATE * (Decimal('1') + FEE_VAT_RATE)).quantize(CENT, rounding=ROUND_HALF_UP) if payment_method == 'clip' else ZERO
    amounts = dict.fromkeys(('cash', 'clip', 'card', 'transfer'), ZERO)
    amounts[payment_method] = total
    Payment.objects.create(sale=sale, fees=fees, **amounts)

    # Updates the Django catalogue record only; Shopify availability requires separate API sync.
    for item in linked_items:
        item.is_sold = True
        item.sold_at = timezone.now()
        item.sold_price = dict(zip([g.pk for g in garments], line_prices))[item.garment_id]
        if item.staff_pick:
            item.is_archive = True
        item.save(update_fields=['is_sold', 'sold_at', 'sold_price', 'is_archive', 'updated'])

    return JsonResponse({
        'success': True,
        'sale_id': sale.sale_id,
        'total': str(total),
        'fees': str(fees),
        'net_payment': str(total - fees),
        'sold_count': len(garments),
    })
