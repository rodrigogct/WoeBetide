from django import template
register = template.Library()

def _cld(url, transform):
    if not url or "/upload/" not in url:
        return url
    return url.replace("/upload/", f"/upload/{transform}/", 1)

@register.filter
def cld_catalog(url):
    return _cld(url, "f_webp,q_auto,a_auto,w_640,c_limit")

@register.filter
def cld_item(url):
    return _cld(url, "f_webp,q_auto,a_auto,w_840,c_limit")

@register.filter
def cld_cart_thumb(url):
    return _cld(url, "f_webp,q_auto,a_auto,w_128,c_limit")
