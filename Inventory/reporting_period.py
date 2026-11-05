

from datetime import timedelta
from django.utils import timezone

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

def get_reporting_window(request):
    """
    Return the shared reporting period and its date boundaries.

    The selected period is saved in the Django session.
    """

    selection = get_reporting_days(request)
    end_date = timezone.localdate()

    if selection == "all":
        return {
            "days": "all",
            "start_date": None,
            "end_date": end_date,
        }

    number_of_days = int(selection)

    start_date = end_date - timedelta(
        days=number_of_days - 1
    )

    return {
        "days": number_of_days,
        "start_date": start_date,
        "end_date": end_date,
    }
