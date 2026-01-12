
from Catalogue.utils import cart as cart_utils

def cart_count(request):
    try:
        return {"cart_count": cart_utils.get_cart_count(request.session)}
    except Exception:
        return {"cart_count": 0}
