from django.views.generic import DetailView
from django.shortcuts import render
from django.http import JsonResponse
from django.urls import reverse
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.http import require_POST, require_GET
from .utils import cart as cart_utils
from .models import Item, Jewerly
from django.db.models import F, Q, DecimalField
from decimal import Decimal
from django.db.models.functions import Cast
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
from Catalogue.utils import cart as cart_utils

from Catalogue.models import Item
from Catalogue.utils import cart as cart_utils

# Create your views here.

def catalogue(request):
    view_name = request.resolver_match.view_name  # e.g. 'Catalogue', 'Archive', 'StaffPicks'
    category = request.GET.get("category", "All")
    sort = request.GET.get("sort", "date_new")

    now = timezone.now()
    sold_cutoff = now - timedelta(settings.CATALOGUE_SOLD_TTL_DAYS)

    # Base queryset:
    if view_name == "Archive":
        # Archive shows ONLY items explicitly archived AND whose TTL has passed
        qs = Item.objects.filter(
            is_archive=True,
            is_sold=True,
            sold_at__lt=sold_cutoff,
        )
    elif view_name == "StaffPicks":
        # Staff picks follows the same visibility rule as main catalogue:
        # show if unsold (and not archived), OR sold but still within TTL
        qs = Item.objects.filter(staff_pick=True).filter(
            Q(is_sold=False, is_archive=False) |
            Q(is_sold=True, sold_at__gte=sold_cutoff)
        )
    else:
        qs = Item.objects.filter(
            Q(is_sold=False, is_archive=False) |
            Q(is_sold=True, sold_at__gte=sold_cutoff)
        )

    # Optional category filter (Tees/Jackets/Sweatshirts/All)
    if category and category != "All":
        qs = qs.filter(category=category)

    # Sorting
    if sort == "price_low":
        qs = qs.annotate(
            price_num=Cast("price", DecimalField(max_digits=10, decimal_places=2))
        ).order_by(F("price_num").asc(nulls_last=True), "-created")
    elif sort == "price_high":
        qs = qs.annotate(
            price_num=Cast("price", DecimalField(max_digits=10, decimal_places=2))).order_by(F("price_num").desc(nulls_last=True), "-created")
    elif sort == "date_old":
        if view_name == "Archive":
            qs = qs.order_by("sold_at", "created")
        else:
            qs = qs.order_by("created")
    else:  # date_new (default)
        if view_name == "Archive":
            qs = qs.order_by("-sold_at", "-created")
        else:
            qs = qs.order_by("-created")

    return render(request, "catalogue.html", {
        "items": qs,
        "is_archive": (view_name == "Archive"),
        "sort": sort,
    })

def item(request, item_id):
    view_name = request.resolver_match.view_name

    # 1. Get the item or 404
    item = get_object_or_404(Item, pk=item_id)
    
    # 2. Get category from query param or fallback to item's own category
    category = request.GET.get('category', item.category)

    # 3. Build related items list
    related_items = Item.objects.filter(is_sold=False).exclude(pk=item_id)

    if category != 'All':
        related_items = related_items.filter(category=category, id__gt=item_id)

    related_items = related_items.order_by('-id')[:4]

    # If fewer than 4 related items, backfill from top
    if len(related_items) < 4:
        remaining = 4 - len(related_items)
        additional_items = (
            Item.objects.filter(is_sold=False)
            .exclude(pk=item_id)
            .exclude(pk__in=[item.pk for item in related_items])
            .filter(category=category if category != 'All' else None)
            .order_by('id')[:remaining]
        )
        related_items = list(related_items) + list(additional_items)

    # 4. Adjust related items to recommend only staff_picks
    related_staff_items =  Item.objects.filter(is_sold=False, staff_pick=True).exclude(pk=item_id).order_by('-id')[:4]

    # 5. Adjust related items to recommend only archive_items
    related_archive_items =  Item.objects.filter(is_sold=True, is_archive=True).exclude(pk=item_id).order_by('-id')[:4]

    # Loop to create a list of different images for a specific item 
    images = []
    for i in range(2, 8):  # img2 to img7
        img = getattr(item, f"img{i}", None)
        if img:
            images.append(img)


    return render(request, 'item.html', {
        "item": item,
        "images": images,
        "related_items": related_items if view_name != 'StaffItem' else None,
        "related_staff_items": related_staff_items if view_name == 'StaffItem' else None,
        "related_archive_items": related_archive_items if view_name == 'ArchiveItem' else None,
    })

MAX_QTY_PER_ITEM = 1  # one-off vintage pieces

def _wants_json(request):
    # tiny helper for fetch() calls; keeps HTML form fallback working
    return "application/json" in request.headers.get("Accept", "") or request.headers.get("X-Requested-With") == "XMLHttpRequest"

# @require_POST
# def add_to_cart(request, item_id):
#     item = get_object_or_404(Item, pk=item_id)
#     # clamp requested qty to [0, MAX_QTY_PER_ITEM]
#     req_qty = max(0, min(int(request.POST.get("qty", 1)), MAX_QTY_PER_ITEM))

#     # merge with existing but cap to MAX_QTY_PER_ITEM
#     cart = cart_utils.get_cart(request.session)
#     vid = str(item.shopify_variant_id)
#     current = int(cart.get(vid, {}).get("qty", 0))
#     new_qty = min(MAX_QTY_PER_ITEM, current + req_qty)

#     if new_qty <= 0:
#         cart_utils.remove_item(request.session, vid)
#     else:
#         cart_utils.set_qty(request.session, vid, new_qty)

#     if _wants_json(request):
#         return JsonResponse({"ok": True, "variant_id": vid, "qty": new_qty, "count": cart_utils.get_cart_count(request.session)})
#     return redirect("Cart")

@require_POST
def add_to_cart(request, item_id):
    item = get_object_or_404(Item, pk=item_id)

    # Don’t allow sold/archived items into cart
    if item.is_sold or item.is_archive:
        if _wants_json(request):
            return JsonResponse({"ok": False, "error": "sold"}, status=409)
        return redirect("Item", item.id)

    req_qty = max(0, min(int(request.POST.get("qty", 1)), MAX_QTY_PER_ITEM))

    cart, _ = cart_utils.sanitize_cart_session(request)
    vid = str(item.shopify_variant_id)

    current = int(cart.get(vid, {}).get("qty", 0))
    new_qty = min(MAX_QTY_PER_ITEM, current + req_qty)

    if new_qty <= 0:
        cart_utils.remove_item(request.session, vid)
    else:
        cart_utils.set_qty(request.session, vid, new_qty)

    if _wants_json(request):
        return JsonResponse({"ok": True, "variant_id": vid, "qty": new_qty, "count": cart_utils.get_cart_count(request.session)})
    return redirect("Cart")

# @require_POST
# def update_cart(request):
#     # Accepts fields like qty[<variant_id>] = N
#     for key, value in request.POST.items():
#         if key.startswith("qty[") and key.endswith("]"):
#             vid = key[4:-1]
#             try:
#                 qty = int(value or 0)
#             except ValueError:
#                 qty = 0
#             # clamp to [0, MAX_QTY_PER_ITEM]; 0 will remove via utils.set_qty()
#             qty = max(0, min(qty, MAX_QTY_PER_ITEM))
#             cart_utils.set_qty(request.session, vid, qty)

#     if _wants_json(request):
#         return JsonResponse({"ok": True, "count": cart_utils.get_cart_count(request.session)})
#     return redirect("Cart")

@require_POST
def update_cart(request):
    cart, _ = cart_utils.sanitize_cart_session(request)

    for key, value in request.POST.items():
        if key.startswith("qty[") and key.endswith("]"):
            vid = key[4:-1]

            # If item is sold, force remove
            if Item.objects.filter(shopify_variant_id=vid, is_sold=True).exists():
                cart_utils.remove_item(request.session, vid)
                continue

            try:
                qty = int(value or 0)
            except ValueError:
                qty = 0

            qty = max(0, min(qty, MAX_QTY_PER_ITEM))
            cart_utils.set_qty(request.session, vid, qty)

    if _wants_json(request):
        return JsonResponse({"ok": True, "count": cart_utils.get_cart_count(request.session)})
    return redirect("Cart")

@require_POST
def remove_from_cart(request, variant_id):
    cart_utils.remove_item(request.session, variant_id)
    if _wants_json(request):
        return JsonResponse({"ok": True, "count": cart_utils.get_cart_count(request.session)})
    return redirect("Cart")

@require_GET
def cart_count_api(request):
    cart_utils.sanitize_cart_session(request)
    return JsonResponse({"count": cart_utils.get_cart_count(request.session)})

def cart_view(request):

    cart, removed = cart_utils.sanitize_cart_session(request)
    items = Item.objects.filter(shopify_variant_id__in=cart.keys())
    item_map = {str(i.shopify_variant_id): i for i in items}  # ✅ key as str

    # cart = cart_utils.get_cart(request.session)
    # items = Item.objects.filter(shopify_variant_id__in=cart.keys())
    # item_map = {i.shopify_variant_id: i for i in items}

    lines = []
    for vid, data in cart.items():
        item = item_map.get(vid)
        if not item:
            continue

        qty = int(data.get("qty", 0)) if isinstance(data, dict) else int(data)
        price = Decimal(str(item.price)) if item.price else Decimal("0.00")
        line_total = price * qty

        lines.append({
            "variant_id": vid,
            "qty": qty,
            "title": item.name,
            "image_url": item.img1.url if item.img1 else "",
            "price": price,
            "line_total": line_total,
            "url": reverse("Item", args=[item.id]), 
        })

    grand_total = sum(line["line_total"] for line in lines)

    pairs = [f"{l['variant_id']}:{l['qty']}" for l in lines]
    checkout_url = f"{settings.SHOP_URL}/cart/{','.join(pairs)}" if pairs else "#"

    return render(request, "cart.html", {
        "lines": lines,
        "checkout_url": checkout_url,
        "grand_total": grand_total, 
    })









def jewerly(request):
    jewerly_items = Jewerly.objects.all()

    return render(request, 'catalogue.html',
                  {"jewerly_items": jewerly_items})

def jewerly_item(request, jewerly_item_id):
    jewerly_item = get_object_or_404(Jewerly, pk=jewerly_item_id)
    related_jewerly_item = Jewerly.objects.filter(id__gt=jewerly_item_id).order_by('id')[:4]

    if len(related_jewerly_item) < 4:
        remaining_items = 4 - len(related_jewerly_item)
        additional_items = Jewerly.objects.exclude(pk=jewerly_item_id).order_by('id')[:remaining_items]
        related_jewerly_item = list(related_jewerly_item) + list(additional_items)

    return render(request, 'item.html', 
                  {"jewerly_item": jewerly_item, 
                   "related_jewerly_items": related_jewerly_item})
