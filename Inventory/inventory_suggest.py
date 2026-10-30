"""Inventory autocomplete, following Sell's relevance-ranked five-result search.

Unlike Sell, Inventory deliberately includes sold, archived and draft garments.
"""
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import Garment
from .templatetags.inventory_thumbnails import inventory_thumbnail


@login_required
@require_GET
def inventory_suggest(request):
    query = request.GET.get("q", "").strip()[:100]
    if not query:
        return JsonResponse({"results": []})

    qs = (
        Garment.objects
        .select_related("website_item")
        .filter(
            Q(garment_id__icontains=query)
            | Q(name__icontains=query)
            | Q(brand__icontains=query)
            | Q(category__icontains=query)
            | Q(size__icontains=query)
            | Q(collection__collection_id__icontains=query)
        )
        .annotate(
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
                When(size__icontains=query, then=Value(10)),
                default=Value(99),
                output_field=IntegerField(),
            )
        )
        .order_by("relevance", "garment_id")[:5]
    )

    results = []
    for garment in qs:
        # Reverse one-to-one relation raises RelatedObjectDoesNotExist when
        # the garment has not been linked to a Catalogue.Item yet.
        linked = getattr(garment, "website_item", None)
        image = (linked.img1 if linked and linked.img1 else garment.img1)
        image_url = None
        if image:
            try:
                image_url = inventory_thumbnail(image.url, 120)
            except (ValueError, OSError, AttributeError):
                pass

        results.append({
            "id": garment.garment_id,
            "name": garment.name,
            "size": garment.size or "—",
            "status": garment.status,
            "price": str(garment.listed_price or 0),
            "image_url": image_url,
        })

    return JsonResponse({"results": results})
