from Catalogue.models import Item, Jewerly

# shop/utils/cart.py
CART_KEY = "wb_cart"  # session key

def get_cart(session):
    return session.get(CART_KEY, {})

def get_cart_count(session):
    cart = session.get(CART_KEY, {})
    total = 0
    for v in cart.values():
        if isinstance(v, dict):
            total += int(v.get("qty", 0))
        else:
            total += int(v or 0)
    return total

def save_cart(session, cart):
    session[CART_KEY] = cart
    session.modified = True

def add_item(session, variant_id, qty=1):
    cart = get_cart(session)
    line = cart.get(str(variant_id), {"qty": 0})
    line["qty"] += int(qty)
    cart[str(variant_id)] = line
    save_cart(session, cart)

def set_qty(session, variant_id, qty):
    cart = get_cart(session)
    if int(qty) <= 0:
        cart.pop(str(variant_id), None)
    else:
        cart[str(variant_id)] = {"qty": int(qty)}
    save_cart(session, cart)

def remove_item(session, variant_id):
    cart = get_cart(session)
    cart.pop(str(variant_id), None)
    save_cart(session, cart)

def sanitize_cart_session(request):
    from Catalogue.models import Item  # local import avoids circular issues

    cart = get_cart(request.session)
    if not cart:
        return cart, []

    vids = list(cart.keys())
    qs = Item.objects.filter(shopify_variant_id__in=vids)

    existing_ids = set(str(v) for v in qs.values_list("shopify_variant_id", flat=True))
    sold_ids = set(str(v) for v in qs.filter(is_sold=True).values_list("shopify_variant_id", flat=True))

    removed = []
    for vid in list(cart.keys()):
        if vid not in existing_ids or vid in sold_ids:
            cart.pop(vid, None)
            removed.append(vid)

    save_cart(request.session, cart)
    return cart, removed
