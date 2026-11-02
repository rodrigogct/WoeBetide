"""Read-only Finances and Partners screens. No database migrations required.

Keep Inventory.Garment as inventory source and PartnerCapitalSnapshot as
partner-capital snapshot source. Cash and expense values are not inferred.
"""
from decimal import Decimal, InvalidOperation
from django.contrib.auth.decorators import login_required
from django.db.models import Sum
from django.shortcuts import render
from django.utils import timezone
from .models import Garment, SaleItem, PartnerCapitalSnapshot
from Catalogue.models import Item

ZERO = Decimal('0.00')

def fmt(value):
    return f'{(value or ZERO):,.2f}'

@login_required
def finances_page(request):
    eligible = Garment.objects.filter(status__in=[Garment.Status.AVAILABLE, Garment.Status.PUBLISHED])
    inventory_cost = eligible.aggregate(total=Sum('cost'))['total'] or ZERO
    # A connected active website price supersedes an old Excel listed price.
    # OneToOne ensures each garment contributes to valuation exactly once.
    retail_total = ZERO
    unpriced = 0
    linked_count = 0
    for garment in eligible.select_related('website_item').iterator():
        try:
            item = garment.website_item
        except Item.DoesNotExist:
            item = None
        if item is not None and not item.is_sold and not item.is_archive:
            linked_count += 1
            price = item.price
        else:
            price = garment.listed_price
        if price is None or price <= 0:
            unpriced += 1
        else:
            retail_total += price

    # Historical recorded sales only; never count a sold garment without a SaleItem.
    sale_totals = SaleItem.objects.aggregate(sales=Sum('sold_price'), cogs=Sum('garment__cost'))
    revenue = sale_totals['sales'] or ZERO
    cogs = sale_totals['cogs'] or ZERO
    profit = revenue - cogs
    return render(request, 'inventory/finances_dashboard.html', {
        'stock_units': eligible.count(),
        'inventory_cost': fmt(inventory_cost),
        'inventory_retail': fmt(retail_total),
        'potential_gross_profit': fmt(retail_total - inventory_cost),
        'missing_prices': unpriced,
        'linked_count': linked_count,
        'sales_revenue': fmt(revenue),
        'sales_profit': fmt(profit),
        'sales_margin': f'{profit * 100 / revenue:.1f}' if revenue else '0.0',
        'snapshot_date': timezone.localdate(),
    })

@login_required
def partners_page(request):
    snapshot = PartnerCapitalSnapshot.objects.filter(pk=1).first()
    partners = []
    total_net = ZERO
    total_target = ZERO
    total_shortfall = ZERO
    if snapshot:
        for row in snapshot.partners:
            try:
                net = Decimal(str(row['net_capital']))
                target = Decimal(str(row['should_pay']))
                balance = Decimal(str(row['balance']))
                gross = Decimal(str(row['gross_paid']))
                reimbursed = Decimal(str(row['reimbursements']))
                adjustment = Decimal(str(row['capital_adjustment']))
                target_pct = Decimal(str(row['target_pct']))
                actual_pct = Decimal(str(row['real_pct']))
            except (KeyError, InvalidOperation, TypeError, ValueError):
                continue
            total_net += net
            total_target += target
            total_shortfall += max(target-net, ZERO)
            partners.append({
                'name': row['name'],
                'gross_paid': fmt(gross),
                'reimbursed': fmt(reimbursed),
                'adjustment': fmt(adjustment),
                'net': fmt(net),
                'target': fmt(target),
                'target_pct': f'{target_pct:.1f}',
                'actual_pct': f'{actual_pct:.1f}',
                'remaining': fmt(max(target-net, ZERO)),
                'excess': fmt(max(net-target, ZERO)),
                'balance': f'{balance:+,.2f}',
                'balance_kind': 'shortfall' if balance < 0 else 'excess' if balance > 0 else 'settled',
                'progress': round(min(100, max(0, float(net / target * 100)))) if target > 0 else 100,
            })
    return render(request, 'inventory/partners_dashboard.html', {
        'has_snapshot': bool(snapshot),
        'partners': partners,
        'total_net': fmt(total_net),
        'total_target': fmt(total_target),
        'total_shortfall': fmt(total_shortfall),
        'snapshot': snapshot,
    })
