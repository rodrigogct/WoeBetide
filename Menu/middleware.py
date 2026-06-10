from django.conf import settings
from django.shortcuts import redirect


class SitePasswordMiddleware:
    """
    Server-side password gate for drops, maintenance, or private launches.
    Protects public-facing pages unless the session has been unlocked.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(settings, "SITE_PASSWORD_ENABLED", False):
            return self.get_response(request)

        allowed_paths = [
            "/password/",
            "/admin/",
            "/static/",
            "/media/",
        ]

        if any(request.path.startswith(path) for path in allowed_paths):
            return self.get_response(request)

        if request.session.get("site_unlocked") is True:
            return self.get_response(request)

        return redirect("site_password")