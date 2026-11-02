from django.shortcuts import render

# Create your views here.
from decimal import Decimal
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import models, transaction
from django.db.models import Sum, Count
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from .dashboard_metrics import dashboard_home
from .partner_capital import sync_partner_capital
from Catalogue.models import Item
from django.db import transaction

from .models import Collection, Garment, Sale, SaleItem, Payment, SourceWorkbook
from .importers import import_inventory_excel

@login_required
def inventory_list(request):
    query = request.GET.get("q", "").strip()
    status = request.GET.get("status", "").strip().lower()
    category = request.GET.get("category", "").strip()
    collection = request.GET.get("collection", "").strip()

    eligible = [Garment.Status.AVAILABLE, Garment.Status.PUBLISHED]
    active_website_items = Item.objects.filter(is_sold=False, is_archive=False)
    linked_active_ids = active_website_items.filter(
        garment__status__in=eligible
    ).values_list("garment_id", flat=True)

    available_count = Garment.objects.filter(status=Garment.Status.AVAILABLE).count()
    sold_count = Garment.objects.filter(status=Garment.Status.SOLD).count()
    published_count = active_website_items.count()  # Actual catalogue listings
    eligible_count = Garment.objects.filter(status__in=eligible).count()
    linked_count = Garment.objects.filter(status__in=eligible, pk__in=linked_active_ids).count()
    not_published_count = eligible_count - linked_count
    publication_coverage = round(linked_count * 100 / eligible_count, 1) if eligible_count else 0

    garments = Garment.objects.select_related("collection", "website_item").order_by("-created_at")
    if query:
        garments = garments.filter(
            models.Q(garment_id__icontains=query)
            | models.Q(name__icontains=query)
            | models.Q(brand__icontains=query)
            | models.Q(size__icontains=query)
            | models.Q(category__icontains=query)
            | models.Q(collection__collection_id__icontains=query)
        )

    if status == "sellable":
        garments = garments.filter(status__in=eligible)
    elif status == "published":
        # 'Published' means linked to an active website listing, not Garment.status.
        garments = garments.filter(pk__in=linked_active_ids)
    elif status == "not_published":
        garments = garments.filter(status__in=eligible).exclude(pk__in=linked_active_ids)
    elif status in {"available", "sold", "archive", "draft", "reserved"}:
        garments = garments.filter(status=status)

    if category:
        garments = garments.filter(category=category)
    if collection:
        garments = garments.filter(collection__collection_id=collection)

    # Search and filters always run against the entire inventory before limiting display.
    matching_count = garments.count()
    show_all = request.GET.get("show") == "all"
    if not show_all:
        garments = garments[:10]

    recent_items = list(
        active_website_items.exclude(img1__isnull=True).exclude(img1="")
        .select_related("garment").order_by("-created")[:6]
    )

    return render(request, "inventory/inventory_list.html", {
        "garments": garments,
        "matching_count": matching_count,
        "show_all": show_all,
        "query": query,
        "status_filter": status,
        "category_filter": category,
        "collection_filter": collection,
        "available_count": available_count,
        "published_count": published_count,
        "not_published_count": not_published_count,
        "sold_count": sold_count,
        "linked_count": linked_count,
        "publication_coverage": publication_coverage,
        "recent_items": recent_items,
    })

@login_required
@transaction.atomic
def sell_garment(request, garment_id):
    garment = get_object_or_404(Garment, garment_id=garment_id)

    if garment.status == Garment.Status.SOLD:
        return redirect("inventory_list")

    if request.method == "POST":
        sold_price = request.POST.get("sold_price")
        channel = request.POST.get("channel")

        cash = request.POST.get("cash") or 0
        clip = request.POST.get("clip") or 0
        card = request.POST.get("card") or 0
        transfer = request.POST.get("transfer") or 0
        fees = request.POST.get("fees") or 0

        sale_count = Sale.objects.count() + 1
        sale_id = f"S{sale_count:03d}"

        sale = Sale.objects.create(
            sale_id=sale_id,
            sale_date=timezone.now().date(),
            channel=channel,
            created_by=request.user,
        )

        SaleItem.objects.create(
            sale=sale,
            garment=garment,
            sold_price=sold_price,
        )

        Payment.objects.create(
            sale=sale,
            cash=cash,
            clip=clip,
            card=card,
            transfer=transfer,
            fees=fees,
        )

        garment.status = Garment.Status.SOLD
        garment.sold_price = sold_price
        garment.is_visible_on_site = False
        garment.save()

        return redirect("inventory_list")

    return render(request, "inventory/sell_garment.html", {
        "garment": garment
    })

@login_required
def sell_dashboard(request):
    query = request.GET.get("q", "")

    garments = Garment.objects.filter(
        status=Garment.Status.AVAILABLE
    ).order_by("-created_at")

    if query:
        garments = garments.filter(
            models.Q(garment_id__icontains=query) |
            models.Q(name__icontains=query) |
            models.Q(brand__icontains=query) |
            models.Q(size__icontains=query) |
            models.Q(collection__collection_id__icontains=query)
        )

    return render(request, "inventory/sell_dashboard.html", {
        "garments": garments,
        "query": query,
    })

@login_required
def import_inventory_view(request):

    if not request.user.is_superuser:
        messages.error(
            request,
            "You do not have permission to import inventory."
        )
        return redirect("dashboard_home")

    if request.method == "POST":

        excel_file = request.FILES.get("excel_file")

        if not excel_file:
            messages.error(
                request,
                "Please upload an Excel file."
            )
            return redirect("import_inventory")

        if not excel_file.name.lower().endswith(".xlsx"):
            messages.error(
                request,
                "Please upload a valid .xlsx Excel file."
            )
            return redirect("import_inventory")

        # Read the original file before the import consumes it.
        MAX_FILE_SIZE = 15 * 1024 * 1024

        if excel_file.size > MAX_FILE_SIZE:
            messages.error(
                request,
                "Excel files must be 15 MB or smaller."
            )
            return redirect("import_inventory")

        try:
            raw_bytes = excel_file.read()
            excel_file.seek(0)

            # Import the workbook and save it as one transaction.
            with transaction.atomic():

                # 1. Import inventory, sales, and payments.
                result = import_inventory_excel(excel_file)

                # 2. Reset the file before reading the DEBT sheet.
                excel_file.seek(0)

                try:
                    sync_partner_capital(excel_file)

                except (ValueError, KeyError) as exc:
                    messages.warning(
                        request,
                        (
                            "Inventory imported, but partner capital "
                            f"was not updated: {exc}"
                        )
                    )

                # 3. Save the original workbook in PostgreSQL.
                # Only runs after the main import succeeds.
                SourceWorkbook.objects.create(
                    filename=excel_file.name,
                    file_data=raw_bytes,
                    imported_by=request.user,
                )

            messages.success(
                request,
                (
                    "Import complete. "
                    f"Created garments: {result['created_garments']}. "
                    f"Updated garments: {result['updated_garments']}. "
                    f"Created sales: {result['created_sales']}. "
                    "Created/updated payments: "
                    f"{result['created_or_updated_payments']}. "
                    "Source Excel saved successfully."
                )
            )

            return redirect("dashboard_home")

        except Exception as error:
            messages.error(
                request,
                f"Import failed: {error}"
            )
            return redirect("import_inventory")

    return render(
        request,
        "inventory/import_inventory.html"
    )

def shop_all(request):
    garments = Garment.objects.filter(
        status=Garment.Status.PUBLISHED,
        is_visible_on_site=True
    ).order_by("-created_at")

    return render(request, "shop.html", {
        "garments": garments
    })

@login_required
def collections_dashboard(request):
    from django.http import Http404
    from decimal import Decimal

    ZERO = Decimal('0.00')

    def money(amount):
        return f'{amount:,.2f}'

    # SaleItem is the authoritative transaction price when present. For legacy
    # imported sold garments without SaleItem, use Garment.sold_price instead.
    garment_list = list(Garment.objects.select_related('collection').filter(
        collection__isnull=False
    ).order_by('garment_id'))
    sale_prices = dict(SaleItem.objects.filter(
        garment_id__in=[g.pk for g in garment_list]
    ).values_list('garment_id', 'sold_price'))

    collections = list(Collection.objects.all().order_by('-date_bought', '-pk'))
    by_collection = {c.pk: [] for c in collections}
    for garment in garment_list:
        by_collection[garment.collection_id].append(garment)

    def calculate(collection, garments):
        sold = [g for g in garments if g.status == Garment.Status.SOLD]
        unsold = [g for g in garments if g.status not in (Garment.Status.SOLD, Garment.Status.ARCHIVE)]
        archived = [g for g in garments if g.status == Garment.Status.ARCHIVE]

        total_cost = sum((g.cost or ZERO for g in garments), ZERO)
        sold_cost = sum((g.cost or ZERO for g in sold), ZERO)
        revenue = sum((sale_prices.get(g.pk, g.sold_price) or ZERO for g in sold), ZERO)
        gross_profit = revenue - sold_cost
        sell_through = (Decimal(len(sold)) / Decimal(len(garments)) * 100) if garments else ZERO
        recovery = (revenue / total_cost * 100) if total_cost > 0 else None
        realized_roi = (gross_profit / sold_cost * 100) if sold_cost > 0 else None

        return {
            'collection': collection,
            'total_items': len(garments),
            'sold_count': len(sold),
            'available_count': len(unsold),
            'archived_count': len(archived),
            'total_cost_value': total_cost,
            'sold_cost_value': sold_cost,
            'revenue_value': revenue,
            'gross_profit_value': gross_profit,
            'total_cost': money(total_cost),
            'revenue': money(revenue),
            'gross_profit': money(gross_profit),
            'sell_through': f'{sell_through:.1f}',
            'capital_recovery': f'{recovery:.1f}' if recovery is not None else None,
            'realized_roi': f'{realized_roi:.1f}' if realized_roi is not None else None,
        }

    rows = [calculate(c, by_collection[c.pk]) for c in collections]

    # Drill-down is on the same existing URL, e.g. /dashboard/collections/?collection=12
    collection_key = request.GET.get('collection', '').strip()
    selected_collection = None
    detail_items = []

    if collection_key:
        selected_collection = next(
            (c for c in collections if c.collection_id == collection_key), None
        )
        if selected_collection is None:
            raise Http404('Collection not found')

        selected_row = next(r for r in rows if r['collection'].pk == selected_collection.pk)
        selected_garments = by_collection[selected_collection.pk]
        summary_source = [selected_row]

        for g in selected_garments:
            sold_price = (sale_prices.get(g.pk, g.sold_price) or ZERO) if g.status == Garment.Status.SOLD else None
            detail_items.append({
                'garment': g,
                'status': g.get_status_display(),
                'cost': money(g.cost or ZERO),
                'listed_price': money(g.listed_price) if g.listed_price is not None else None,
                'sold_price': money(sold_price) if sold_price is not None else None,
                'gross_profit': money(sold_price - (g.cost or ZERO)) if sold_price is not None else None,
            })
    else:
        summary_source = rows

    total_cost = sum((r['total_cost_value'] for r in summary_source), ZERO)
    revenue = sum((r['revenue_value'] for r in summary_source), ZERO)
    sold_cost = sum((r['sold_cost_value'] for r in summary_source), ZERO)
    total_items = sum(r['total_items'] for r in summary_source)
    sold_count = sum(r['sold_count'] for r in summary_source)
    available_count = sum(r['available_count'] for r in summary_source)
    profit = revenue - sold_cost

    summary = {
        'collection_count': len(summary_source),
        'total_cost': money(total_cost),
        'revenue': money(revenue),
        'gross_profit': money(profit),
        'capital_recovery': f'{revenue / total_cost * 100:.1f}' if total_cost > 0 else None,
        'sell_through': f'{Decimal(sold_count) / Decimal(total_items) * 100:.1f}' if total_items else None,
        'realized_roi': f'{profit / sold_cost * 100:.1f}' if sold_cost > 0 else None,
        'available_items': available_count,
        'sold_items': sold_count,
        'total_items': total_items,
    }

    return render(request, 'inventory/collections_dashboard.html', {
        'rows': rows,
        'summary': summary,
        'selected_collection': selected_collection,
        'detail_items': detail_items,
    })

@login_required
def sales_dashboard(request):
    """Sales history. Search/filter the full DB; preview only 10 by default."""
    from datetime import timedelta
    from decimal import Decimal
    from django.db.models import Q, Prefetch
    from django.utils import timezone

    ZERO = Decimal('0.00')
    query = request.GET.get('q', '').strip()[:120]
    channel = request.GET.get('channel', 'all')
    period = request.GET.get('days', 'all')
    show_all = request.GET.get('full') == '1'
    valid_channels = {c.value for c in Sale.Channel}
    if channel not in valid_channels and channel not in ('all', 'physical', 'online'):
        channel = 'all'
    if period not in ('all', '7', '30', '90'):
        period = 'all'

    sales = Sale.objects.all().order_by('-sale_date', '-created_at', '-pk')
    if query:
        sales = sales.filter(
            Q(sale_id__icontains=query) |
            Q(notes__icontains=query) |
            Q(customer_name__icontains=query) |
            Q(channel__icontains=query) |
            Q(items__garment__garment_id__icontains=query) |
            Q(items__garment__name__icontains=query)
        ).distinct()
    if channel == 'physical':
        sales = sales.filter(channel__in=[Sale.Channel.PHYSICAL, Sale.Channel.POPUP])
    elif channel == 'online':
        sales = sales.filter(channel=Sale.Channel.WEBSITE)
    elif channel != 'all':
        sales = sales.filter(channel=channel)
    if period != 'all':
        today = timezone.localdate()
        sales = sales.filter(sale_date__gte=today - timedelta(days=int(period) - 1), sale_date__lte=today)

    CLIP_RATE = Decimal('0.034')
    IVA_RATE = Decimal('0.16')
    SHOPIFY_RATE = Decimal('0.036')
    def build_row(sale):
        items = list(sale.items.all())
        gross = sum((item.sold_price or ZERO for item in items), ZERO)
        cost = sum((item.garment.cost or ZERO for item in items), ZERO)
        payment = getattr(sale, 'payment', None)
        cash = (payment.cash or ZERO) if payment else ZERO
        transfer = (payment.transfer or ZERO) if payment else ZERO
        clip = (payment.clip or ZERO) if payment else ZERO
        card = (payment.card or ZERO) if payment else ZERO
        recorded_fees = (payment.fees or ZERO) if payment else ZERO
        if clip > 0:
            fee_type = 'Clip (est.)'
            fee = clip * CLIP_RATE
            iva = fee * IVA_RATE
        elif card > 0:
            fee_type = 'Shopify/Card (est.)'
            fee = card * SHOPIFY_RATE
            iva = ZERO
        else:
            fee_type = 'None'
            fee = ZERO
            iva = ZERO
        return {
            'sale': sale, 'sold_items': len(items), 'total_cost': cost,
            'gross_revenue': gross, 'cash': cash, 'transfer': transfer,
            'clip': clip, 'card': card, 'commission_type': fee_type,
            'commission': fee, 'iva': iva, 'net_revenue': gross - fee - iva,
            'gross_profit': gross - cost, 'recorded_fees': recorded_fees,
            'payment_present': payment is not None,
            'channel_label': sale.get_channel_display(),
        }

    total_count = sales.count()
    all_sales = sales.prefetch_related('payment', Prefetch('items', queryset=SaleItem.objects.select_related('garment')))
    rows = [build_row(sale) for sale in all_sales]
    revenue = sum((r['gross_revenue'] for r in rows), ZERO)
    profit = sum((r['gross_profit'] for r in rows), ZERO)
    totals = {
        'gross_revenue': revenue,
        'gross_profit': profit,
        'gross_margin_pct': profit * 100 / revenue if revenue > ZERO else ZERO,
        'net_revenue': sum((r['net_revenue'] for r in rows), ZERO),
        'units_sold': sum(r['sold_items'] for r in rows),
    }
    visible_rows = rows if show_all or query else rows[:10]
    return render(request, 'inventory/sales_dashboard.html', {
        'rows': visible_rows, 'query': query, 'channel': channel, 'days': period,
        'show_all': show_all or bool(query), 'total_count': total_count,
        'visible_count': len(visible_rows), 'totals': totals,
    })

@login_required
def sale_detail(request, sale_id):
    """Read-only one-sale breakdown using the same sales KPI definitions."""
    from decimal import Decimal
    from django.db.models import Prefetch

    ZERO = Decimal('0.00')
    sale = get_object_or_404(
        Sale.objects.prefetch_related(
            Prefetch('items', queryset=SaleItem.objects.select_related('garment', 'garment__collection', 'garment__website_item'))
        ).select_related('payment'),
        sale_id=sale_id,
    )
    lines = list(sale.items.all())
    gross = sum((line.sold_price or ZERO for line in lines), ZERO)
    cogs = sum((line.garment.cost or ZERO for line in lines), ZERO)
    gross_profit = gross - cogs
    items = []
    for line in lines:
        garment = line.garment
        linked = getattr(garment, 'website_item', None)
        image = garment.img1 or (linked.img1 if linked else None)
        try:
            image_url = image.url if image else None
        except (ValueError, OSError):
            image_url = None
        items.append({'line': line, 'image_url': image_url, 'cost': garment.cost or ZERO,
                      'gross_profit': (line.sold_price or ZERO) - (garment.cost or ZERO)})
    payment = getattr(sale, 'payment', None)
    return render(request, 'inventory/sale_detail.html', {
        'sale': sale,
        'items': items,
        'payment': payment,
        'totals': {
            'gross_revenue': gross, 'gross_profit': gross_profit,
            'gross_margin_pct': gross_profit * 100 / gross if gross > ZERO else ZERO,
            'units_sold': len(items),
        },
    })

@login_required
def payments_dashboard(request):
    payments = Payment.objects.select_related("sale").all().order_by("-sale__sale_date")

    totals = payments.aggregate(
        total_cash=Sum("cash"),
        total_clip=Sum("clip"),
        total_card=Sum("card"),
        total_transfer=Sum("transfer"),
        total_fees=Sum("fees"),
    )

    total_cash = totals["total_cash"] or 0
    total_clip = totals["total_clip"] or 0
    total_card = totals["total_card"] or 0
    total_transfer = totals["total_transfer"] or 0
    total_fees = totals["total_fees"] or 0

    gross_total = total_cash + total_clip + total_card + total_transfer
    net_total = gross_total - total_fees

    return render(request, "inventory/payments_dashboard.html", {
        "payments": payments,
        "total_cash": total_cash,
        "total_clip": total_clip,
        "total_card": total_card,
        "total_transfer": total_transfer,
        "total_fees": total_fees,
        "gross_total": gross_total,
        "net_total": net_total,
    })
    collections = Collection.objects.all().order_by("-date_bought")

    rows = []

    for collection in collections:
        garments = collection.garments.all()
        sold_garments = garments.filter(status=Garment.Status.SOLD)

        total_items = garments.count()
        sold_count = sold_garments.count()
        available_count = garments.filter(status=Garment.Status.AVAILABLE).count()

        total_cost = garments.aggregate(total=Sum("cost"))["total"] or 0
        revenue = sold_garments.aggregate(total=Sum("sold_price"))["total"] or 0
        gross_profit = revenue - total_cost

        sell_through = 0
        if total_items > 0:
            sell_through = sold_count / total_items * 100

        rows.append({
            "collection": collection,
            "total_items": total_items,
            "sold_count": sold_count,
            "available_count": available_count,
            "total_cost": total_cost,
            "revenue": revenue,
            "gross_profit": gross_profit,
            "sell_through": sell_through,
        })

    return render(request, "inventory/collections_dashboard.html", {
        "rows": rows,
    })

# Excel-backed garment lookup for the POS.
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.contrib.auth.decorators import login_required

@login_required
@require_GET
def pos_garment_search(request):
    query = request.GET.get("q", "").strip()[:100]

    if not query:
        return JsonResponse({"results": []})

    qs = Garment.objects.filter(
        status__in=[
            Garment.Status.AVAILABLE,
            Garment.Status.PUBLISHED,
        ]
    )

    qs = qs.filter(
        Q(garment_id__icontains=query)
        | Q(name__icontains=query)
        | Q(brand__icontains=query)
        | Q(category__icontains=query)
        | Q(collection__collection_id__icontains=query)
    )

    qs = qs.annotate(
        relevance=Case(
            When(garment_id__iexact=query, then=Value(0)),
            When(garment_id__iendswith=f"-{query}", then=Value(1)),
            When(garment_id__istartswith=query, then=Value(2)),
            When(name__iexact=query, then=Value(3)),
            When(name__istartswith=query, then=Value(4)),
            When(garment_id__icontains=query, then=Value(5)),
            When(name__icontains=query, then=Value(6)),
            When(brand__iexact=query, then=Value(7)),
            When(brand__icontains=query, then=Value(8)),
            When(category__icontains=query, then=Value(9)),
            When(collection__collection_id__icontains=query, then=Value(10)),
            default=Value(99),
            output_field=IntegerField(),
        )
    ).order_by("relevance", "garment_id")[:5]

    results = []

    for garment in qs:
        try:
            image_url = garment.img1.url if garment.img1 else None
        except (ValueError, OSError):
            image_url = None

        results.append({
            "id": garment.garment_id,
            "name": garment.name,
            "price": str(garment.listed_price),
            "image_url": image_url,
            "status": garment.status,
        })

    return JsonResponse({"results": results})
