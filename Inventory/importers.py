import pandas as pd

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from .models import Collection, Garment, Sale, SaleItem, Payment


def clean_text(value):
    if pd.isna(value):
        return ""
    return str(value).strip()

def clean_decimal(value):
    if pd.isna(value) or value == "":
        return Decimal("0")

    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return Decimal("0")

def clean_date(value):
    if pd.isna(value) or value == "":
        return None

    parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")

    if pd.isna(parsed):
        return None

    return parsed.date()

def map_status(value):
    value = clean_text(value).lower()

    if value == "available":
        return Garment.Status.AVAILABLE

    if value == "sold":
        return Garment.Status.SOLD

    if value in ["discarded", "archive", "archived"]:
        return Garment.Status.ARCHIVE

    return Garment.Status.DRAFT

def map_category(value):
    value = clean_text(value).lower()

    mapping = {
        "t-shirt": Garment.Category.TSHIRT,
        "tshirt": Garment.Category.TSHIRT,
        "tee": Garment.Category.TSHIRT,
        "sweatshirt": Garment.Category.SWEATSHIRT,
        "hoodie": Garment.Category.HOODIE,
        "jacket": Garment.Category.JACKET,
        "pants": Garment.Category.PANTS,
        "jeans": Garment.Category.PANTS,
        "jewelry": Garment.Category.JEWELRY,
    }

    return mapping.get(value, Garment.Category.OTHER)

def map_channel(value):
    value = clean_text(value).lower()

    mapping = {
        "website": Sale.Channel.WEBSITE,
        "online": Sale.Channel.WEBSITE,
        "popup": Sale.Channel.POPUP,
        "pop-up": Sale.Channel.POPUP,
        "instagram": Sale.Channel.INSTAGRAM,
        "ig": Sale.Channel.INSTAGRAM,
        "physical": Sale.Channel.PHYSICAL,
        "cash": Sale.Channel.PHYSICAL,
    }

    return mapping.get(value, Sale.Channel.OTHER)

REQUIRED_COLUMNS = [
    "ID",
    "Garment",
    "Year",
    "Type",
    "Size",
    "Width (cm)",
    "Length (cm)",
    "Color",
    "Status",
    "Unit cost",
    "Date bought (dd/MM/YY)",
    "Collection ID",
    "Cash",
    "Clip",
    "Card",
    "Transfer",
    "Revenue",
    "Sale method",
    "Sale date (dd/MM/YY)",
    "Sale ID",
]

def read_inventory_excel(excel_file):
    try:
        df = pd.read_excel(excel_file, sheet_name="INVENTORY")
    except ValueError:
        df = pd.read_excel(excel_file, sheet_name=0)

    df.columns = [str(col).strip() for col in df.columns]

    missing_columns = [
        col for col in REQUIRED_COLUMNS
        if col not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Missing columns: " + ", ".join(missing_columns)
        )

    return df

@transaction.atomic
def import_inventory_excel(excel_file):
    df = read_inventory_excel(excel_file)

    # This removes summary rows like "Sold Garments", "Available Garments", etc.
    df = df[pd.to_numeric(df["ID"], errors="coerce").notna()]

    created_garments = 0
    updated_garments = 0
    created_sales = 0
    created_or_updated_payments = 0
    processed_payments = set()

    for index, row in df.iterrows():
        excel_id = clean_text(row.get("ID"))
        garment_name = clean_text(row.get("Garment"))
        collection_id = clean_text(row.get("Collection ID"))

        if not excel_id or not garment_name:
            continue

        if not collection_id:
            collection_id = "NO-COLLECTION"

        date_bought = clean_date(row.get("Date bought (dd/MM/YY)"))

        if date_bought is None:
            date_bought = timezone.now().date()

        collection, _ = Collection.objects.update_or_create(
            collection_id=collection_id,
            defaults={
                "date_bought": date_bought,
                "source": "",
                "notes": "",
            },
        )

        try:
            clean_excel_id = int(float(excel_id))
        except ValueError:
            clean_excel_id = excel_id

        garment_id = f"WB-{collection_id}-{clean_excel_id}"

        width = clean_text(row.get("Width (cm)"))
        length = clean_text(row.get("Length (cm)"))
        color = clean_text(row.get("Color"))

        measurements = ""
        if width or length:
            measurements = f"Width: {width} cm | Length: {length} cm"

        notes_parts = []

        if color:
            notes_parts.append(f"Color: {color}")

        status = map_status(row.get("Status"))
        category = map_category(row.get("Type"))
        revenue = clean_decimal(row.get("Revenue"))

        sold_price = None
        if status == Garment.Status.SOLD and revenue > 0:
            sold_price = revenue

        # Safety: do not let an old Excel turn a sold item back into available.
        existing_garment = Garment.objects.filter(garment_id=garment_id).first()

        if existing_garment and existing_garment.status == Garment.Status.SOLD and status != Garment.Status.SOLD:
            status = Garment.Status.SOLD
            sold_price = existing_garment.sold_price

        garment, created = Garment.objects.update_or_create(
            garment_id=garment_id,
            defaults={
                "collection": collection,
                "name": garment_name,
                "category": category,
                "brand": "",
                "size": clean_text(row.get("Size")),
                "era": clean_text(row.get("Year")),
                "cost": clean_decimal(row.get("Unit cost")),
                "listed_price": revenue if revenue > 0 else Decimal("0"),
                "sold_price": sold_price,
                "condition": "",
                "description": "",
                "measurements": measurements,
                "notes": " | ".join(notes_parts),
                "status": status,
                "is_visible_on_site": False,
            },
        )

        if created:
            created_garments += 1
        else:
            updated_garments += 1

        if status != Garment.Status.SOLD:
            continue

        sale_id = clean_text(row.get("Sale ID"))

        if not sale_id:
            sale_id = f"SALE-{garment_id}"

        sale_date = clean_date(row.get("Sale date (dd/MM/YY)"))

        if sale_date is None:
            sale_date = timezone.now().date()

        sale, sale_created = Sale.objects.update_or_create(
            sale_id=sale_id,
            defaults={
                "sale_date": sale_date,
                "channel": map_channel(row.get("Sale method")),
                "customer_name": "",
                "notes": "",
                "created_by": None,
            },
        )

        if sale_created:
            created_sales += 1

        SaleItem.objects.update_or_create(
            garment=garment,
            defaults={
                "sale": sale,
                "sold_price": revenue,
            },
        )

        if sale_id not in processed_payments:
            Payment.objects.update_or_create(
                sale=sale,
                defaults={
                    "cash": clean_decimal(row.get("Cash")),
                    "clip": clean_decimal(row.get("Clip")),
                    "card": clean_decimal(row.get("Card")),
                    "transfer": clean_decimal(row.get("Transfer")),
                    "fees": Decimal("0"),
                },
            )

            processed_payments.add(sale_id)
            created_or_updated_payments += 1

    return {
        "created_garments": created_garments,
        "updated_garments": updated_garments,
        "created_sales": created_sales,
        "created_or_updated_payments": created_or_updated_payments,
    }