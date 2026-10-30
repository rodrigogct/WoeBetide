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

from .models import Collection, Garment, Sale, SaleItem, Payment
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
        messages.error(request, "You do not have permission to import inventory.")
        return redirect("dashboard_home")

    if request.method == "POST":
        excel_file = request.FILES.get("excel_file")

        if not excel_file:
            messages.error(request, "Please upload an Excel file.")
            return redirect("import_inventory")

        if not excel_file.name.endswith((".xlsx", ".xls")):
            messages.error(request, "Please upload a valid Excel file.")
            return redirect("import_inventory")

        try:
            result = import_inventory_excel(excel_file)

            # Reset Excel file before reading the DEBT sheet
            excel_file.seek(0)

            try:
                sync_partner_capital(excel_file)
            except (ValueError, KeyError) as exc:
                messages.warning(
                    request,
                    f"Inventory imported, but partner capital was not updated: {exc}"
                )

            messages.success(
                request,
                (
                    "Import complete. "
                    f"Created garments: {result['created_garments']}. "
                    f"Updated garments: {result['updated_garments']}. "
                    f"Created sales: {result['created_sales']}. "
                    f"Created/updated payments: {result['created_or_updated_payments']}."
                )
            )

            return redirect("dashboard_home")

        except Exception as error:
            messages.error(request, f"Import failed: {error}")
            return redirect("import_inventory")

    return render(request, "inventory/import_inventory.html")

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
    collections = Collection.objects.all().order_by("-date_bought")

    rows = []

    for collection in collections:
        garments = collection.garments.all()
        sold_garments = garments.filter(status=Garment.Status.SOLD)
        available_garments = garments.filter(status=Garment.Status.AVAILABLE)

        total_items = garments.count()
        sold_count = sold_garments.count()
        available_count = available_garments.count()

        total_cost = garments.aggregate(total=Sum("cost"))["total"] or 0
        revenue = sold_garments.aggregate(total=Sum("sold_price"))["total"] or 0
        gross_profit = revenue - total_cost

        sell_through = 0
        if total_items > 0:
            sell_through = round((sold_count / total_items) * 100, 1)

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

@login_required
def sales_dashboard(request):
    """Sales history. Search/filter the full DB; preview only 10 by default."""
    from datetime import timedelta
    from decimal import Decimal
    from django.db.models import Q
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
        sales = sales.filter(sale_date__gte=timezone.localdate() - timedelta(days=int(period) - 1),
                             sale_date__lte=timezone.localdate())

    # Aggregate all filtered records (not just the visible preview).
    # Preserve the old Sales table's calculated fee assumptions, clearly label estimates.
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
        fee_basis = 'Estimated'
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
    # Prefetch avoids per-sale items/garment/payment database queries.
    from django.db.models import Prefetch
    all_sales = sales.prefetch_related('payment', Prefetch('items', queryset=SaleItem.objects.select_related('garment')))
    rows = [build_row(sale) for sale in all_sales]
    totals = {
        'gross_revenue': sum((r['gross_revenue'] for r in rows), ZERO),
        'gross_profit': sum((r['gross_profit'] for r in rows), ZERO),
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
    sale = get_object_or_404(Sale, sale_id=sale_id)

    return render(request, "inventory/sale_detail.html", {
        "sale": sale,
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
