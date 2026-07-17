from django.shortcuts import render

# Create your views here.
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import models, transaction
from django.db.models import Sum, Count
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone

from .models import Collection, Garment, Sale, SaleItem, Payment
from .importers import import_inventory_excel

@login_required
def inventory_list(request):
    garments = Garment.objects.all().order_by("-created_at")

    query = request.GET.get("q", "")
    status = request.GET.get("status")
    category = request.GET.get("category")
    collection = request.GET.get("collection")

    if query:
        garments = garments.filter(
            models.Q(garment_id__icontains=query) |
            models.Q(name__icontains=query) |
            models.Q(size__icontains=query) |
            models.Q(category__icontains=query) |
            models.Q(collection__collection_id__icontains=query)
        )

    if status:
        garments = garments.filter(status=status)

    if category:
        garments = garments.filter(category=category)

    if collection:
        garments = garments.filter(collection__collection_id=collection)

    return render(request, "inventory/inventory_list.html", {
        "garments": garments,
        "query": query,
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
def dashboard_home(request):
    total_inventory = Garment.objects.count()
    available = Garment.objects.filter(status=Garment.Status.AVAILABLE).count()
    published = Garment.objects.filter(status=Garment.Status.PUBLISHED).count()
    sold = Garment.objects.filter(status=Garment.Status.SOLD).count()

    revenue = Garment.objects.filter(
        status=Garment.Status.SOLD
    ).aggregate(total=Sum("sold_price"))["total"] or 0

    cost_sold = Garment.objects.filter(
        status=Garment.Status.SOLD
    ).aggregate(total=Sum("cost"))["total"] or 0

    gross_profit = revenue - cost_sold

    return render(request, "inventory/dashboard_home.html", {
        "total_inventory": total_inventory,
        "available": available,
        "published": published,
        "sold": sold,
        "revenue": revenue,
        "gross_profit": gross_profit,
    })

@login_required
def sell_dashboard(request):
    query = request.GET.get("q", "")

    garments = Garment.objects.filter(
        status__in=[
            Garment.Status.AVAILABLE,
            Garment.Status.PUBLISHED,
        ]
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
    query = request.GET.get("q", "")

    sales = Sale.objects.all().order_by("-sale_date", "-created_at")

    if query:
        sales = sales.filter(
            models.Q(sale_id__icontains=query) |
            models.Q(channel__icontains=query) |
            models.Q(customer_name__icontains=query)
        )

    return render(request, "inventory/sales_dashboard.html", {
        "sales": sales,
        "query": query,
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