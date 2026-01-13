from django import template

register = template.Library()

@register.filter
def cld_webp(url: str):
    """
    Force Cloudinary delivery as WebP with automatic quality.
    Deterministic, small files, no header negotiation issues.
    """
    if not url:
        return url

    marker = "/upload/"
    if marker not in url:
        return url

    return url.replace(marker, f"{marker}f_webp,q_auto/", 1)

