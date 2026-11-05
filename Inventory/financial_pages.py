from decimal import Decimal, InvalidOperation
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, F, ExpressionWrapper, DecimalField, Q
from django.shortcuts import render
from django.utils import timezone
from datetime import date
from calendar import monthrange
from django.db.models.functions import Coalesce
from .models import Garment, SaleItem, PartnerCapitalSnapshot, ImportedExpense
from Catalogue.models import Item
from .partner_capital import capital_context
from .reporting_period import get_reporting_window
from django.db.models.functions import TruncMonth
from django.utils.text import slugify

ZERO = Decimal('0.00')

def fmt(value):
    return f'{(value or ZERO):,.2f}'

@login_required
def finances_page(request):
    eligible = Garment.objects.filter(status__in=[Garment.Status.AVAILABLE, Garment.Status.PUBLISHED])
    inventory_cost = eligible.aggregate(total=Sum('cost'))['total'] or ZERO
    # A connected active website price supersedes an old Excel listed price.
    # OneToOne ensures each garment contributes to valuation exactly once.
    retail_total = ZERO
    unpriced = 0
    linked_count = 0
    for garment in eligible.select_related('website_item').iterator():
        try:
            item = garment.website_item
        except Item.DoesNotExist:
            item = None
        if item is not None and not item.is_sold and not item.is_archive:
            linked_count += 1
            price = item.price
        else:
            price = garment.listed_price
        if price is None or price <= 0:
            unpriced += 1
        else:
            retail_total += price

    # Historical recorded sales only; never count a sold garment without a SaleItem.
    sale_totals = SaleItem.objects.aggregate(sales=Sum('sold_price'), cogs=Sum('garment__cost'))
    revenue = sale_totals['sales'] or ZERO
    cogs = sale_totals['cogs'] or ZERO
    profit = revenue - cogs
    # Expenses represent the original Excel's indirect expense records; do NOT
    # label them full operating expenses until equipment/production treatment is reviewed.
    # Global reporting period is remembered across Home, Sales, and Finances.
    reporting = get_reporting_window(request)
    requested_period = request.GET.get('period', 'all')
    selected_period = 'all'
    period_start = reporting['start_date']
    period_end = reporting['end_date']
    expense_window_label = (
        'All time' if reporting['days'] == 'all'
        else f"Last {reporting['days']} days"
    )

    # Existing monthly expense filter remains an explicit override.
    if requested_period != 'all':
        try:
            year_text, month_text = requested_period.split('-')
            year, month = int(year_text), int(month_text)
            if not 2020 <= year <= 2100 or not 1 <= month <= 12:
                raise ValueError
            period_start = date(year, month, 1)
            period_end = date(year, month, monthrange(year, month)[1])
            selected_period = f'{year:04d}-{month:02d}'
            expense_window_label = date(year, month, 1).strftime('%B %Y')
        except (ValueError, TypeError):
            pass

    expenses = ImportedExpense.objects.all()
    matching_sales = SaleItem.objects.all()
    if period_start is not None:
        # Undated expenses appear only in the All Time expense view.
        expenses = expenses.filter(expense_date__range=(period_start, period_end))
        matching_sales = matching_sales.filter(sale__sale_date__range=(period_start, period_end))
    else:
        # Exclude future-dated records, matching the shared window's end date.
        expenses = expenses.filter(
            Q(expense_date__lte=period_end) |
            Q(expense_date__isnull=True)
        )
        matching_sales = matching_sales.filter(sale__sale_date__lte=period_end)

    totals = expenses.aggregate(rodrigo=Sum('rodrigo'), fran=Sum('fran'),
                                bure=Sum('bure'), woe=Sum('woe'))
    funded = sum((totals[k] or ZERO for k in ('rodrigo', 'fran', 'bure')), ZERO)
    woe_paid = totals['woe'] or ZERO
    expense_total = funded + woe_paid
    period_revenue = matching_sales.aggregate(total=Sum('sold_price'))['total'] or ZERO
    ratio = (expense_total * 100 / period_revenue) if period_revenue else None

    # Bar chart: show literal Excel category names; use consistent muted colors.
    category_colors = {
        'Events & Pop-ups': '#945D40', 'Manufacturing': '#81554D',
        'Equipment': '#4B6156', 'Marketing & Ads': '#684B80',
        'Studio & Facilities': '#5B608A', 'Shipping & Logistics': '#39747A',
        'Packaging & Labels': '#826A35', 'Website': '#365D87',
    }

    expense_category_legend = [
        {
            "name": name,
            "color_class": f"wbe-cat-{slugify(name)}",
        }
        for name in category_colors
    ]

    categories_raw = expenses.values('category').annotate(
        r=Sum('rodrigo'), f=Sum('fran'), b=Sum('bure'), w=Sum('woe'))
    categories = []
    for row in categories_raw:
        amount = sum((row[k] or ZERO for k in ('r','f','b','w')), ZERO)
        categories.append({'name': row['category'], 'amount': amount,
                           'amount_display': fmt(amount),
                           'color': category_colors.get(row['category'], '#87918A'),
                           'share': (amount * 100 / expense_total) if expense_total else ZERO})
    categories.sort(key=lambda c: c['amount'], reverse=True)
    for row in categories:
        row['share_display'] = f"{row['share']:.1f}"
        row['width'] = f"{min(100, float(row['share'])):.3f}"

    # Monthly expenses, stacked by category.
    # Include all funding sources: Rodrigo, Fran, Bure, and WOE.
    # Undated expenses are excluded from this historical chart.

    anchor = period_start or timezone.localdate().replace(day=1)

    def month_start(offset):
        index = anchor.year * 12 + anchor.month - 1 + offset
        year, month_index = divmod(index, 12)
        return date(year, month_index + 1, 1)

    first_month = month_start(-11)
    last_month = month_start(0)
    last_day = date(
        last_month.year,
        last_month.month,
        monthrange(last_month.year, last_month.month)[1],
    )

    grouped = (
        ImportedExpense.objects
        .filter(expense_date__range=(first_month, last_day))
        .annotate(month=TruncMonth("expense_date"))
        .values("month", "category")
        .annotate(
            r=Sum("rodrigo"),
            f=Sum("fran"),
            b=Sum("bure"),
            w=Sum("woe"),
        )
        .order_by("month", "category")
    )

    # Actual expenses by month and category.
    month_categories = {}

    for row in grouped:
        month_key = (
            row["month"].year,
            row["month"].month,
        )

        amount = sum(
            (row[k] or ZERO for k in ("r", "f", "b", "w")),
            ZERO,
        )

        category = row["category"] or "Other"

        bucket = month_categories.setdefault(month_key, {})

        bucket[category] = bucket.get(category, ZERO) + amount

    monthly = []

    for offset in range(-11, 1):
        current = month_start(offset)
        key = (current.year, current.month)

        amounts = month_categories.get(key, {})
        total = sum(amounts.values(), ZERO)

        segments = []

        for name, amount in sorted(
            amounts.items(),
            key=lambda item: item[1],
            reverse=True,
        ):
            if amount <= ZERO:
                continue

            share = (
                float(amount / total * 100)
                if total > ZERO
                else 0
            )

            category_key = slugify(name)

            if name not in category_colors:
                category_key = "other"

            segments.append({
                "name": name,
                "amount_display": fmt(amount),
                "share": round(share, 4),
                "color_class": f"wbe-cat-{category_key}",
            })

        monthly.append({
            "label": current.strftime("%b %y"),
            "amount": total,
            "amount_display": fmt(total),
            "segments": segments,
        })

    monthly_max = max(
        (row["amount"] for row in monthly),
        default=ZERO,
    )

    for row in monthly:
        if monthly_max > ZERO and row["amount"] > ZERO:
            row["height"] = round(
                max(
                    4,
                    float(row["amount"] / monthly_max * 100),
                ),
                4,
            )
        else:
            row["height"] = 0

    recent = []
    for e in expenses.order_by('-expense_date', '-source_id')[:10]:
        recent.append({'source_id': e.source_id, 'description': e.description,
                       'date': e.expense_date, 'category': e.category,
                       'rodrigo': fmt(e.rodrigo), 'fran': fmt(e.fran),
                       'bure': fmt(e.bure), 'woe': fmt(e.woe),
                       'total': fmt(e.total)})

    available_periods = []
    # Offer every month between the oldest dated expense and today.
    earliest = ImportedExpense.objects.exclude(expense_date__isnull=True).order_by('expense_date').values_list('expense_date', flat=True).first()
    if earliest:
        first = earliest.year * 12 + earliest.month - 1
        last = timezone.localdate().year * 12 + timezone.localdate().month - 1
        for m in range(max(first, last - 119), max(last, first) + 1):
            year, month_index = divmod(m, 12)
            available_periods.append({'value': f'{year:04d}-{month_index+1:02d}',
                                      'label': date(year, month_index+1, 1).strftime('%B %Y')})
        available_periods.reverse()

    return render(request, 'inventory/finances_dashboard.html', {
        'stock_units': eligible.count(),
        'inventory_cost': fmt(inventory_cost),
        'inventory_retail': fmt(retail_total),
        'potential_gross_profit': fmt(retail_total - inventory_cost),
        'missing_prices': unpriced,
        'linked_count': linked_count,
        'sales_revenue': fmt(revenue),
        'sales_profit': fmt(profit),
        'sales_margin': f'{profit * 100 / revenue:.1f}' if revenue else '0.0',
        'snapshot_date': timezone.localdate(),
        'expense_data_available': ImportedExpense.objects.exists(),
        **reporting,
        'expense_window_label': expense_window_label,
        'expense_period': selected_period,
        'expense_periods': available_periods,
        'expense_total': fmt(expense_total),
        'expense_woe': fmt(woe_paid),
        'expense_partner': fmt(funded),
        'expense_ratio': f'{ratio:.1f}' if ratio is not None else None,
        'expense_categories': categories,
        'expense_monthly': monthly,
        'recent_expenses': recent,
        'expense_count': expenses.count(),
        'expense_undated': ImportedExpense.objects.filter(expense_date__isnull=True).count(),
        "expense_category_legend": expense_category_legend,

    })

@login_required
def partners_page(request):
    snapshot = PartnerCapitalSnapshot.objects.filter(pk=1).first()
    partners = []
    total_net = ZERO
    total_target = ZERO
    total_shortfall = ZERO
    if snapshot:
        for row in snapshot.partners:
            try:
                net = Decimal(str(row['net_capital']))
                target = Decimal(str(row['should_pay']))
                balance = Decimal(str(row['balance']))
                gross = Decimal(str(row['gross_paid']))
                reimbursed = Decimal(str(row['reimbursements']))
                adjustment = Decimal(str(row['capital_adjustment']))
                target_pct = Decimal(str(row['target_pct']))
                actual_pct = Decimal(str(row['real_pct']))
            except (KeyError, InvalidOperation, TypeError, ValueError):
                continue
            total_net += net
            total_target += target
            total_shortfall += max(target - net, ZERO)

            # Determine contribution progress color.
            if target <= ZERO:
                progress_status = 'neutral'
            elif net > target:
                progress_status = 'overpaid'
            elif net == target:
                progress_status = 'paid'
            elif net >= target * Decimal('0.75'):
                progress_status = 'warning'
            else:
                progress_status = 'danger'

            partners.append({
                'name': row['name'],
                'gross_paid': fmt(gross),
                'reimbursed': fmt(reimbursed),
                'adjustment': fmt(adjustment),
                'net': fmt(net),
                'target': fmt(target),
                'target_pct': f'{target_pct:.1f}',
                'actual_pct': f'{actual_pct:.1f}',
                'remaining': fmt(max(target-net, ZERO)),
                'excess': fmt(max(net-target, ZERO)),
                'balance': f'{balance:+,.2f}',
                'balance_kind': 'shortfall' if balance < 0 else 'excess' if balance > 0 else 'settled',
                'progress': round(min(100, max(0, float(net / target * 100)))) if target > 0 else 100,
                'progress_status': progress_status,
            })
    return render(request, 'inventory/partners_dashboard.html', {
        'has_snapshot': bool(snapshot),
        'partners': partners,
        'total_net': fmt(total_net),
        'total_target': fmt(total_target),
        'total_shortfall': fmt(total_shortfall),
        'snapshot': snapshot,
        **capital_context(),
    })

