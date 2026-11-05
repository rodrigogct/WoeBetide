
# Shared reporting-period preference for WOE BETIDE.

VALID_REPORTING_DAYS = {
    "7",
    "30",
    "90",
    "all",
}

DEFAULT_REPORTING_DAYS = "30"
SESSION_KEY = "wb_reporting_days"


def get_reporting_days(request):
    """
    Return the selected reporting period.

    A valid ?days= value updates the session.
    Otherwise, reuse the last valid selection.
    """

    requested = request.GET.get("days")

    if requested in VALID_REPORTING_DAYS:
        request.session[SESSION_KEY] = requested
        return requested

    saved = str(
        request.session.get(
            SESSION_KEY,
            DEFAULT_REPORTING_DAYS,
        )
    )

    if saved in VALID_REPORTING_DAYS:
        return saved

    return DEFAULT_REPORTING_DAYS
