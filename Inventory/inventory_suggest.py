"""Add the import below to Inventory/views.py: from .inventory_suggest import inventory_suggest"""
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .models import Garment
from .templatetags.inventory_thumbnails import inventory_thumbnail

@login_required
@require_GET
def inventory_suggest(request):
    query = request.GET.get('q','').strip()[:100]
    if not query:
        return JsonResponse({'results':[]})
    qs = (Garment.objects.select_related('website_item').filter(
        Q(garment_id__icontains=query) | Q(name__icontains=query) |
        Q(brand__icontains=query) | Q(category__icontains=query) |
        Q(size__icontains=query) | Q(collection__collection_id__icontains=query)
    ).annotate(relevance=Case(
        When(garment_id__iexact=query,then=Value(0)),
        When(garment_id__iendswith='-'+query,then=Value(1)),
        When(garment_id__istartswith=query,then=Value(2)),
        When(name__iexact=query,then=Value(3)),
        When(name__istartswith=query,then=Value(4)),
        When(garment_id__icontains=query,then=Value(5)),
        When(name__icontains=query,then=Value(6)),
        default=Value(20),output_field=IntegerField()
    )).order_by('relevance','garment_id')[:5])
    results=[]
    for garment in qs:
        img = None
        linked = garment.website_item
        if linked and linked.img1:
            img = linked.img1
        elif garment.img1:
            img = garment.img1
        try:
            url=inventory_thumbnail(img.url,120) if img else None
        except (ValueError,OSError):
            url=None
        results.append({'id':garment.garment_id,'name':garment.name,'size':garment.size or '—',
                        'status':garment.status,'price':str(garment.listed_price or 0),'image_url':url})
    return JsonResponse({'results':results})
