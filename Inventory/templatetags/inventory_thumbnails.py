"""Inventory-page-only Cloudinary URL optimization; originals are untouched."""
from django import template
from urllib.parse import urlsplit, urlunsplit

register = template.Library()

@register.filter
def inventory_thumbnail(url, width=320):
    if not url:
        return ''
    url = str(url)
    parts = urlsplit(url)
    # Only transform known Cloudinary delivery URLs; leave other storage providers alone.
    if parts.hostname not in ('res.cloudinary.com',):
        return url
    marker = '/image/upload/'
    if marker not in parts.path:
        return url
    try:
        width = max(80, min(int(width), 640))
    except (ValueError, TypeError):
        width = 320
    prefix, suffix = parts.path.split(marker, 1)
    # Insert a delivery transformation; no changes to Cloudinary originals.
    new_path = prefix + marker + f'f_auto,q_auto:eco,w_{width},c_limit/' + suffix
    return urlunsplit((parts.scheme,parts.netloc,new_path,parts.query,parts.fragment))
