"""Read-only, database-backed WOE BETIDE dashboard metrics.

The reporting window filters by Sale.sale_date. Historic sold garments without
SaleItem records are excluded from revenue/profit to avoid fabricated totals.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q, Sum
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone

from .models import Garment, Sale, SaleItem, Payment
from Catalogue.models import Item
from .partner_capital import capital_context

ZERO = Decimal('0.00')
VALID_PERIODS = {'7': 7, '30': 30, '90': 90}

def money(value):
    return f'{(value or ZERO):,.2f}'

@login_required
def dashboard_home(request):
    period = request.GET.get('days', 'all')
    today = timezone.localdate()
    if period == 'all':
        days = 'all'
        start = (Sale.objects.order_by('sale_date')
                 .values_list('sale_date', flat=True).first() or today)
    else:
        days = VALID_PERIODS.get(period, 30)
        start = today - timedelta(days=days - 1)

    sale_items = SaleItem.objects.filter(
        sale__sale_date__range=(start, today)
    ).select_related('sale', 'garment')
    # Daily and channel aggregation in a single iteration; no per-sale queries.
    daily = defaultdict(lambda: {'online': ZERO, 'physical': ZERO, 'other': ZERO})
    totals = {'online': ZERO, 'physical': ZERO, 'other': ZERO}
    revenue = ZERO
    cogs = ZERO
    units = 0
    for line in sale_items.iterator():
        amount = line.sold_price or ZERO
        revenue += amount
        cogs += line.garment.cost or ZERO
        units += 1
        channel = line.sale.channel
        bucket = ('online' if channel == Sale.Channel.WEBSITE else
                  'physical' if channel in (Sale.Channel.POPUP, Sale.Channel.PHYSICAL) else
                  'other')
        totals[bucket] += amount
        daily[line.sale.sale_date][bucket] += amount

    # Cards: stock quantities are current, not filtered by the reporting window.
    available = Garment.objects.filter(status=Garment.Status.AVAILABLE).count()
    published = Item.objects.filter(is_sold=False, is_archive=False).count()
    stock = available + Garment.objects.filter(status=Garment.Status.PUBLISHED).count()
    sold_all_time = Garment.objects.filter(status=Garment.Status.SOLD).count()
    missing_photo = Garment.objects.filter(status__in=['available', 'published']).filter(
        Q(img1__isnull=True) | Q(img1='')
    ).count()
    missing_measurements = Garment.objects.filter(status__in=['available', 'published']).filter(
        Q(measurements__isnull=True) | Q(measurements='')
    ).count()

    linked_published_ids = Item.objects.filter(
        is_sold=False,
        is_archive=False,
        garment__isnull=False,
    ).values_list("garment_id", flat=True)

    not_published = Garment.objects.filter(
        status__in=[
            Garment.Status.AVAILABLE,
            Garment.Status.PUBLISHED,
        ]
    ).exclude(
        pk__in=linked_published_ids
    ).count()

    # Daily for short periods; monthly for All Time so no transactions vanish
    # from the chart when a multi-year daily series is visually subsampled.
    all_time = str(days) == "all"
    if all_time:
        monthly = defaultdict(lambda: {'online': ZERO, 'physical': ZERO, 'other': ZERO})
        for date, bucket in daily.items():
            key = date.replace(day=1)
            for channel, value in bucket.items():
                monthly[key][channel] += value
        start_month = start.replace(day=1)
        cursor = start_month
        chart = []
        while cursor <= today:
            values = monthly[cursor]
            chart.append({
                'date': cursor.strftime('%b %Y'),
                'online': float(values['online']),
                'physical': float(values['physical']),
                'other': float(values['other']),
            })
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    else:
        chart = []
        cursor = start
        while cursor <= today:
            values = daily[cursor]
            chart.append({
                'date': cursor.isoformat(),
                'online': float(values['online']),
                'physical': float(values['physical']),
                'other': float(values['other']),
            })
            cursor += timedelta(days=1)

    max_day = max((x['online'] + x['physical'] + x['other'] for x in chart), default=0)
    y_max = max(1, float(max_day))
    y_labels = [f'{y_max * f:,.0f}' for f in (1, .75, .5, .25, 0)]
    label_indexes = sorted({round((len(chart) - 1) * n / 5) for n in range(6)})
    labels = [chart[i]['date'] for i in label_indexes] if chart else []

    # Payments are presented separately from sales revenue to avoid double counting.
    payment_stats = Payment.objects.filter(sale__sale_date__range=(start, today)).aggregate(
        cash=Sum('cash'), clip=Sum('clip'), card=Sum('card'),
        transfer=Sum('transfer'), fees=Sum('fees'),
    )
    payments_gross = sum((payment_stats.get(k) or ZERO for k in ('cash', 'clip', 'card', 'transfer')), ZERO)
    payments_fees = payment_stats.get('fees') or ZERO

    # For event KPIs, a popup *day* is a proxy, not necessarily an individual event.
    popup_daily = list(SaleItem.objects.filter(
        sale__channel=Sale.Channel.POPUP,
        sale__sale_date__range=(start, today),
    ).values('sale__sale_date').annotate(total=Sum('sold_price')).order_by('sale__sale_date'))
    latest_popup = popup_daily[-1] if popup_daily else None
    best_popup = max(popup_daily, key=lambda x: x['total']) if popup_daily else None
    popup_average = (sum((p['total'] for p in popup_daily), ZERO) / len(popup_daily)) if popup_daily else None

    latest_items = list(SaleItem.objects.select_related('sale', 'garment').order_by(
        '-sale__sale_date', '-sale__created_at', '-pk'
    )[:5])
    total_channels = sum(totals.values(), ZERO)
    context = {
        'days': days, 'start_date': start, 'end_date': today,
        'revenue': money(revenue), 'gross_profit': money(revenue - cogs),
        'units_sold': units, 'stock': stock, 'available': available,
        'published': published, 'sold_all_time': sold_all_time,
        'online_revenue': money(totals['online']),
        'physical_revenue': money(totals['physical']),
        'other_revenue': money(totals['other']),
        'online_pct': round(float(totals['online'] / total_channels * 100)) if total_channels else 0,
        'physical_pct': round(float(totals['physical'] / total_channels * 100)) if total_channels else 0,
        'other_pct': round(float(totals['other'] / total_channels * 100)) if total_channels else 0,
        'chart_data': chart, 'chart_labels': labels, 'chart_y_labels': y_labels,
        'payments_net': money(payments_gross - payments_fees),
        'payments_fees': money(payments_fees),
        'payments_gross': money(payments_gross),
        'missing_photo': missing_photo, 'missing_measurements': missing_measurements,
        'not_published': not_published,
        'last_popup': latest_popup, 'best_popup': best_popup,
        'popup_average': money(popup_average) if popup_average is not None else None,
        'recent_activity': latest_items,
        'add_garment_url': reverse('admin:%s_%s_add' % (Garment._meta.app_label, Garment._meta.model_name)),
    }
    context.update(capital_context())

    return render(request, 'inventory/dashboard_home.html', context)
