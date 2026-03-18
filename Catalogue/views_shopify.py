import base64
import hashlib
import hmac
import json
import logging
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import Item

logger = logging.getLogger(__name__)


def _verify_shopify_hmac(request) -> bool:
    secret = (settings.SHOPIFY_WEBHOOK_SECRET or "").encode("utf-8")
    received = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not secret or not received:
        logger.warning("Missing Shopify webhook secret or HMAC header.")
        return False

    digest = hmac.new(secret, request.body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, received)


@csrf_exempt
def orders_paid_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    if not _verify_shopify_hmac(request):
        logger.warning("Invalid Shopify webhook HMAC.")
        return HttpResponseForbidden("Invalid HMAC")

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception as e:
        logger.exception("Could not decode Shopify webhook payload: %s", e)
        return HttpResponse(status=400)

    logger.info("Received Shopify paid webhook: order_id=%s", payload.get("id"))

    sold_time = timezone.now()

    for li in payload.get("line_items", []):
        variant_id = li.get("variant_id")
        price = li.get("price")
        title = li.get("title")

        logger.info(
            "Processing line item: title=%s variant_id=%s price=%s",
            title, variant_id, price
        )

        if not variant_id:
            logger.warning("Line item missing variant_id: %s", li)
            continue

        try:
            item = Item.objects.get(shopify_variant_id=str(variant_id))
        except Item.DoesNotExist:
            logger.warning(
                "No Django Item matched Shopify variant_id=%s title=%s",
                variant_id, title
            )
            continue

        if not item.is_sold:
            item.is_sold = True
            item.sold_at = sold_time
            item.sold_price = Decimal(str(price)) if price else None

            if item.staff_pick:
                item.is_archive = True

            item.save(update_fields=["is_sold", "sold_at", "sold_price", "is_archive", "updated"])

            logger.info(
                "Marked item as sold: item_id=%s name=%s variant_id=%s",
                item.id, item.name, variant_id
            )
        else:
            logger.info(
                "Item already marked sold: item_id=%s name=%s",
                item.id, item.name
            )

    return HttpResponse(status=200)