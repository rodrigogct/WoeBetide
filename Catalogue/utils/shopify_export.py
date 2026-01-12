# Catalogue/utils.py
import csv
import os
from django.conf import settings
from Catalogue.models import Item

def generate_shopify_csv():
    from Catalogue.models import Item

    items = Item.objects.filter(is_sold=False, is_archive=False)
    csv_path = os.path.join(settings.MEDIA_ROOT, 'shopify_export.csv')

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)

        # CSV header — image columns commented out
        writer.writerow([
            "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published",
            "Option1 Name", "Option1 Value", "Variant SKU", "Variant Grams",
            "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy",
            "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
            "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
            # "Image Src", "Image Position", "Image Alt Text"
        ])

        for item in items:
            # 🟥 Temporarily skip the img1 check so all items are included
            # if not item.img1:
            #     continue

            handle = item.name.lower().replace(" ", "-").replace("'", "")

            # Only update in memory — don't save here
            # item.shopify_handle = handle

            # 🟨 Image URL removed
            # try:
            #     image_url = f"https://settings.SHOP_URL{item.img1.url}"
            # except ValueError:
            #     image_url = ""

            writer.writerow([
                handle,
                item.name,
                item.description,
                "WOE BETIDE",
                item.category,
                f"{item.category}, {item.size}",
                "TRUE",
                "Size",
                item.size,
                "", "", "shopify", "1", "deny", "manual",
                item.price, "", "TRUE", "TRUE", "",
                # image_url,
                # 1,
                # item.name
            ])
