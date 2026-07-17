from django.shortcuts import render

# Create your views here.
from .models import Garment
from django.contrib.auth.decorators import login_required
from django.db import transaction, models
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.db.models import Sum, Count

from .models import Garment, Sale, SaleItem, Payment


@login_required
def inventory_list(request):
    garments = Garment.objects.all().order_by("-created_at")

    status = request.GET.get("status")
    category = request.GET.get("category")
    collection = request.GET.get("collection")

    if status:
        garments = garments.filter(status=status)

    if category:
        garments = garments.filter(category=category)

    if collection:
        garments = garments.filter(collection__collection_id=collection)

    return render(request, "inventory/inventory_list.html", {
        "garments": garments
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

    garments = Garment.objects.exclude(
        status=Garment.Status.SOLD
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

def shop_all(request):
    garments = Garment.objects.filter(
        status=Garment.Status.PUBLISHED,
        is_visible_on_site=True
    ).order_by("-created_at")

    return render(request, "shop.html", {
        "garments": garments
    })