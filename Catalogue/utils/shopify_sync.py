import requests
from Catalogue.models import Item

def sync_shopify_variants(STORE, API_VERSION, ACCESS_TOKEN):
    base_url = f"https://{STORE}.myshopify.com/admin/api/{API_VERSION}/products.json"
    headers = {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
    }

    updated = 0
    not_found = []
    products = []

    # ----- fetch all products with pagination -----
    params = {"limit": 250}
    while True:
        r = requests.get(base_url, headers=headers, params=params)
        if r.status_code != 200:
            return {"success": False, "status_code": r.status_code, "updated": 0, "not_found": []}

        data = r.json().get("products", [])
        products.extend(data)

        link = r.headers.get("Link", "")
        if 'rel="next"' not in link:
            break

        from urllib.parse import urlparse, parse_qs
        for part in link.split(","):
            if 'rel="next"' in part:
                url_part = part.split(";")[0].strip().strip("<>")
                qs = parse_qs(urlparse(url_part).query)
                params = {"limit": 250, "page_info": qs.get("page_info", [""])[0]}
                break

    # ----- build handle -> first variant_id map from Shopify -----
    handle_to_variant = {}
    for p in products:
        handle = p.get("handle")
        variants = p.get("variants", [])
        if handle and variants:
            handle_to_variant[handle] = str(variants[0].get("id"))

    # ----- match Django items by *THE SAME HANDLE AS CSV* -----
    for item in Item.objects.all():
        # 🟢 usar la MISMA lógica que generate_shopify_csv
        handle = item.name.lower().replace(" ", "-").replace("'", "")
        variant_id = handle_to_variant.get(handle)

        if variant_id:
            item.shopify_variant_id = variant_id
            item.shopify_handle = handle  # ahora sí en sync con CSV y Shopify
            item.save(update_fields=["shopify_variant_id", "shopify_handle"])
            updated += 1
        else:
            not_found.append(handle)

    return {
        "success": True,
        "status_code": 200,
        "updated": updated,
        "not_found": not_found,
    }
