from django import template

register = template.Library()

@register.filter
def cld_auto(url: str):
    if not url:
        return url
    return url.replace("/upload/", "/upload/f_auto,q_auto/", 1)
