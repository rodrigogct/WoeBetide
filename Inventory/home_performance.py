"""Read-only performance additions for WOE BETIDE Home Dashboard.

Uses recorded SaleItem prices and garment costs, same basis as the existing
Home revenue/gross profit. Requires the existing Inventory models.
"""
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from .models import Sale, SaleItem


def performance_efficiency_context(days, start, today=None):
    today = today or timezone.localdate()
    # ALL TIME: measure frequency from earliest recorded sale through today.
    # Otherwise the existing selected-period start is used.
    start = min(start, today)
    current = SaleItem.objects.filter(
        sale__sale_date__gte=start, sale__sale_date__lte=today
    ).select_related('garment')
    current_revenue = Decimal('0')
    current_cogs = Decimal('0')
    for item in current.iterator():
        current_revenue += item.sold_price or Decimal('0')
        current_cogs += item.garment.cost or Decimal('0')
    profit = current_revenue - current_cogs
    margin = 100 * profit / current_revenue if current_revenue else Decimal('0')

    selling_days = Sale.objects.filter(
        sale_date__gte=start, sale_date__lte=today,
        items__isnull=False
    ).values('sale_date').distinct().count()
    observed_days = max(1, (today - start).days + 1)
    result = {
        'gross_margin_pct': margin,
        'selling_days': selling_days,
        'observed_days': observed_days,
        'sales_frequency_pct': Decimal('100') * selling_days / observed_days,
        'performance_comparison_available': False,
        'revenue_change_pct': None,
        'profit_change_pct': None,
        'gross_margin_change_pp': None,
    }
    # Do not compare ALL TIME to a nonexistent historical equivalent period.
    if days == 'all':
        return result

    prior_end = start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=observed_days-1)
    prev = SaleItem.objects.filter(
        sale__sale_date__gte=prior_start, sale__sale_date__lte=prior_end
    ).select_related('garment')
    prev_revenue = Decimal('0')
    prev_cogs = Decimal('0')
    for item in prev.iterator():
        prev_revenue += item.sold_price or Decimal('0')
        prev_cogs += item.garment.cost or Decimal('0')
    prev_profit = prev_revenue - prev_cogs
    prev_margin = 100 * prev_profit / prev_revenue if prev_revenue else None
    result['performance_comparison_available'] = True
    if prev_revenue:
        result['revenue_change_pct'] = (current_revenue-prev_revenue)*100/prev_revenue
    if prev_profit > 0:
        result['profit_change_pct'] = (profit-prev_profit)*100/prev_profit
    if prev_margin is not None and current_revenue:
        result['gross_margin_change_pp'] = margin-prev_margin
    return result
