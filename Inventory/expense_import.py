from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO
import math
import pandas as pd
from django.db import transaction
from .models import ImportedExpense

PAYER_COLUMNS = ['Rodrigo', 'Fran', 'Bure', 'WOE']
REQUIRED_COLUMNS = ['ID', 'Description', 'Date', 'Category', *PAYER_COLUMNS]


def text_value(value):
    return '' if pd.isna(value) else str(value).strip()


def money(value):
    if value is None or pd.isna(value) or str(value).strip() in ('', '-'):
        return Decimal('0.00')
    try:
        return Decimal(str(value).replace('$', '').replace(',', '').strip()).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f'Invalid expense amount: {value!r}') from exc


def excel_date(value):
    if value is None or pd.isna(value) or str(value).strip() in ('', '-'):
        return None
    if isinstance(value, (datetime, date)):
        return value.date() if isinstance(value, datetime) else value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
    parsed = pd.to_datetime(value, dayfirst=True, errors='coerce')
    return None if pd.isna(parsed) else parsed.date()


@transaction.atomic
def sync_expenses(excel_file):
    """Replace expenses from a *complete* workbook import (65 numbered rows in supplied file).

    A source ID is the primary identity: summaries (including row 67) are skipped.
    Validates the entire sheet before writing, preserving old data on an error.
    """
    if hasattr(excel_file, 'seek'):
        excel_file.seek(0)
    df = pd.read_excel(excel_file, sheet_name='EXPENSES', engine='openpyxl')
    df.columns = [str(c).strip() for c in df.columns]
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError('EXPENSES missing columns: ' + ', '.join(missing))

    imported = []
    seen = set()
    for _, row in df.iterrows():
        raw_id = row['ID']
        # A numeric expense ID identifies a transaction, unlike subtotal rows.
        if pd.isna(raw_id) or isinstance(raw_id, bool):
            continue
        try:
            source_id = int(raw_id)
        except (TypeError, ValueError, OverflowError):
            continue
        if str(raw_id).strip() not in (str(source_id), f'{source_id}.0') or source_id <= 0:
            continue
        if source_id in seen:
            raise ValueError(f'Duplicate EXPENSES ID: {source_id}')
        seen.add(source_id)
        description = text_value(row['Description'])
        category = text_value(row['Category'])
        if not description or not category:
            raise ValueError(f'Expense {source_id} missing description or category')
        imported.append(ImportedExpense(
            source_id=source_id,
            description=description,
            expense_date=excel_date(row['Date']),
            category=category,
            reference=text_value(row.get('Reference')),
            rodrigo=money(row['Rodrigo']),
            fran=money(row['Fran']),
            bure=money(row['Bure']),
            woe=money(row['WOE']),
        ))
    if not imported:
        raise ValueError('No numbered expenses found in EXPENSES; existing data preserved')

    ImportedExpense.objects.all().delete()
    ImportedExpense.objects.bulk_create(imported, batch_size=500)
    return len(imported)
