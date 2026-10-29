"""Read-only stock and website catalogue preview for WOE BETIDE dashboard."""
from django.urls import reverse
from .models import Garment
from Catalogue.models import Item


def inventory_dashboard_context():
    eligible = Garment.objects.filter(
        status__in=[Garment.Status.AVAILABLE, Garment.Status.PUBLISHED]
    )
    linked_ids = Item.objects.filter(
        is_sold=False, is_archive=False, garment__isnull=False
    ).values_list('garment_id', flat=True)
    eligible_count = eligible.count()
    linked_count = eligible.filter(pk__in=linked_ids).count()
    not_published = eligible.exclude(pk__in=linked_ids).count()
    publication_coverage = round(100 * linked_count / eligible_count) if eligible_count else 0

    items = []
    qs = (Item.objects.filter(is_sold=False, is_archive=False)
          .exclude(img1__isnull=True).exclude(img1='')
          .select_related('garment').order_by('-created')[:6])
    for item in qs:
        try:
            image_url = item.img1.url
        except (ValueError, OSError):
            image_url = ''
        items.append({
            'name': item.name,
            'price': f'{item.price:,.2f}',
            'image_url': image_url,
            'garment_id': item.garment.garment_id if item.garment_id else '',
            'admin_url': reverse('admin:%s_%s_change' % (
                Item._meta.app_label, Item._meta.model_name
            ), args=[item.pk]),
        })

    mini_list = []
    for garment in eligible.select_related('website_item').order_by('-created_at')[:8]:
        website = getattr(garment, 'website_item', None)
        mini_list.append({
            'garment_id': garment.garment_id,
            'name': garment.name,
            'linked': bool(website and not website.is_sold and not website.is_archive),
        })

    return {
        'not_published': not_published,
        'linked_published_count': linked_count,
        'publication_coverage': publication_coverage,
        'recently_published': items,
        'inventory_preview': mini_list,
    }
