import requests
from urllib.parse import urlparse, parse_qs
from django.utils.text import slugify
from Catalogue.models import Item


def normalize_handle(value: str) -> str:
    return slugify((value or "").strip())


def sync_shopify_variants(STORE, API_VERSION, ACCESS_TOKEN):
    base_url = f"https://{STORE}.myshopify.com/admin/api/{API_VERSION}/products.json"
    headers = {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
    }

    updated = 0
    not_found = []
    products = []

    params = {"limit": 250}

    try:
        while True:
            r = requests.get(base_url, headers=headers, params=params, timeout=30)
            r.raise_for_status()

            data = r.json().get("products", [])
            products.extend(data)

            link = r.headers.get("Link", "")
            if 'rel="next"' not in link:
                break

            next_params = None
            for part in link.split(","):
                if 'rel="next"' in part:
                    url_part = part.split(";")[0].strip().strip("<>")
                    qs = parse_qs(urlparse(url_part).query)
                    next_params = {
                        "limit": 250,
                        "page_info": qs.get("page_info", [""])[0],
                    }
                    break

            if not next_params:
                break

            params = next_params

    except requests.RequestException as e:
        return {
            "success": False,
            "status_code": getattr(getattr(e, "response", None), "status_code", None),
            "updated": 0,
            "not_found": [],
            "error": str(e),
        }

    handle_to_variant = {}
    for product in products:
        handle = normalize_handle(product.get("handle"))
        variants = product.get("variants", [])
        if handle and variants and variants[0].get("id"):
            handle_to_variant[handle] = str(variants[0]["id"])

    items = list(Item.objects.filter(is_sold=False, is_archive=False))
    to_update = []

    for item in items:
        preferred_handle = normalize_handle(item.shopify_handle) if item.shopify_handle else ""
        fallback_handle = normalize_handle(item.name)
        handle = preferred_handle or fallback_handle

        variant_id = handle_to_variant.get(handle)

        if variant_id:
            changed = False

            if item.shopify_variant_id != variant_id:
                item.shopify_variant_id = variant_id
                changed = True

            if item.shopify_handle != handle:
                item.shopify_handle = handle
                changed = True

            if changed:
                to_update.append(item)
                updated += 1
        else:
            not_found.append(handle)

    if to_update:
        Item.objects.bulk_update(
            to_update,
            ["shopify_variant_id", "shopify_handle"],
            batch_size=200,
        )

    return {
        "success": True,
        "status_code": 200,
        "updated": updated,
        "not_found": not_found,
        "error": None,
    }