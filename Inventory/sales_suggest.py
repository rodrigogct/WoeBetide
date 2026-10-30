"""Live autocomplete for Sales. Add to Inventory/ and register URL in urls.py."""
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Case, When, Value, IntegerField
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .models import Sale

@login_required
@require_GET
def sales_suggest(request):
    query = request.GET.get('q', '').strip()[:100]
    if not query:
        return JsonResponse({'results': []})
    matches = (Sale.objects.filter(
        Q(sale_id__icontains=query) |
        Q(channel__icontains=query) |
        Q(customer_name__icontains=query) |
        Q(notes__icontains=query) |
        Q(items__garment__garment_id__icontains=query) |
        Q(items__garment__name__icontains=query)
    ).distinct().annotate(
        relevance=Case(
            When(sale_id__iexact=query, then=Value(0)),
            When(sale_id__istartswith=query, then=Value(1)),
            When(customer_name__istartswith=query, then=Value(2)),
            When(items__garment__garment_id__iexact=query, then=Value(3)),
            When(items__garment__name__istartswith=query, then=Value(4)),
            default=Value(5), output_field=IntegerField(),
        )
    ).order_by('relevance', '-sale_date', '-created_at').values(
        'sale_id', 'sale_date', 'channel', 'customer_name'
    )[:5])
    return JsonResponse({'results': [
        {'id': s['sale_id'], 'date': s['sale_date'].isoformat(),
         'channel': s['channel'], 'customer': s['customer_name']}
        for s in matches
    ]})
