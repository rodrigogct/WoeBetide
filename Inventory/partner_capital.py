"""Read Excel DEBT summary into a persistent dashboard snapshot.

Uses the workbook's already-calculated DEBT A1:I5 values, not CAPEX
row totals, to avoid double-counting reimbursements and partner transfers.
"""
from decimal import Decimal, InvalidOperation
import pandas as pd
from django.db import transaction
from .models import PartnerCapitalSnapshot

PARTNERS = ("Rodrigo", "Fran", "Bure")
EXPECTED_COLUMNS = (
    "Partner", "Gross Paid Personally", "WOE BETIDE reimbursement",
    "Partners Capital Adjustment", "Net Capital Invested", "Should Pay",
    "Final Balance", "% Target", "% Real",
)

def _amount(value, label):
    if pd.isna(value):
        raise ValueError(f"Missing calculated Excel value for {label}. Save/recalculate your workbook first.")
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Non-numeric Excel value for {label}: {value!r}")

def read_partner_capital(excel_file):
    # Header row 1 and partner summary rows 2-4 in the actual workbook.
    table = pd.read_excel(excel_file, sheet_name="DEBT", header=0, nrows=4)
    columns = list(table.columns[:9])
    if len(columns) < 9 or any(str(columns[i]).strip() != col for i, col in enumerate(EXPECTED_COLUMNS)):
        raise ValueError("DEBT sheet partner summary headings do not match the expected A:I layout.")
    partners = []
    for name in PARTNERS:
        matching = table[table[columns[0]].astype(str).str.strip().str.casefold() == name.casefold()]
        if len(matching) != 1:
            raise ValueError(f"Expected exactly one summary row for {name} in DEBT A:I.")
        row = matching.iloc[0]
        partners.append({
            "name": name,
            "gross_paid": str(_amount(row.iloc[1], name + ' gross paid')),
            "reimbursements": str(_amount(row.iloc[2], name + ' reimbursements')),
            "capital_adjustment": str(_amount(row.iloc[3], name + ' capital adjustment')),
            "net_capital": str(_amount(row.iloc[4], name + ' net capital')),
            "should_pay": str(_amount(row.iloc[5], name + ' should pay')),
            "balance": str(_amount(row.iloc[6], name + ' final balance')),
            "target_pct": str(_amount(row.iloc[7], name + ' target percentage') * 100),
            "real_pct": str(_amount(row.iloc[8], name + ' real percentage') * 100),
        })
    return partners

@transaction.atomic
def sync_partner_capital(excel_file):
    # read_excel advances the upload stream; caller should seek(0) before/after.
    excel_file.seek(0)
    partners = read_partner_capital(excel_file)
    PartnerCapitalSnapshot.objects.update_or_create(
        pk=1,
        defaults={"partners": partners, "source_filename": excel_file.name},
    )
    excel_file.seek(0)
    return len(partners)

def capital_context():
    snapshot = PartnerCapitalSnapshot.objects.filter(pk=1).first()

    if snapshot is None:
        return {"partner_capital": None}

    partners = []

    for row in snapshot.partners:
        balance = Decimal(row["balance"])

        if balance > 0:
            balance_display = f"+${balance:,.2f}"
            balance_color = "positive"
        elif balance < 0:
            balance_display = f"-${abs(balance):,.2f}"
            balance_color = "negative"
        else:
            balance_display = "$0.00"
            balance_color = "neutral"

        partners.append({
            "name": row["name"],
            "gross_paid": f"{Decimal(row['gross_paid']):,.2f}",
            "reimbursements": f"{Decimal(row['reimbursements']):,.2f}",
            "capital_adjustment": f"{Decimal(row['capital_adjustment']):+,.2f}",
            "net_capital": f"{Decimal(row['net_capital']):,.2f}",
            "should_pay": f"{Decimal(row['should_pay']):,.2f}",
            "balance": balance_display,
            "balance_color": balance_color,
            "target_pct": f"{Decimal(row['target_pct']):.1f}",
            "real_pct": f"{Decimal(row['real_pct']):.1f}",
        })

    total = sum(
        (Decimal(x["net_capital"]) for x in snapshot.partners),
        Decimal("0")
    )

    return {
        "partner_capital": {
            "partners": partners,
            "total_capital": f"{total:,.2f}",
            "updated_at": snapshot.imported_at,
            "source_filename": snapshot.source_filename,
        }
    }
