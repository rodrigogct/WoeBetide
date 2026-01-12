import base64
import hashlib
import hmac
import json
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import Item

def _verify_shopify_hmac(request) -> bool:
    secret = (settings.SHOPIFY_WEBHOOK_SECRET or "").encode("utf-8")
    received = request.headers.get("X-Shopify-Hmac-Sha256", "")

    if not secret or not received:
        return False

    digest = hmac.new(secret, request.body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, received)


@csrf_exempt
def orders_paid_webhook(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    if not _verify_shopify_hmac(request):
        return HttpResponseForbidden("Invalid HMAC")

    payload = json.loads(request.body.decode("utf-8"))

    sold_time = timezone.now()

    for li in payload.get("line_items", []):
        variant_id = li.get("variant_id")
        price = li.get("price")

        if not variant_id:
            continue

        try:
            item = Item.objects.get(shopify_variant_id=str(variant_id))

            # Idempotent update (safe if webhook repeats)
            if not item.is_sold:
                item.is_sold = True
                item.sold_at = sold_time
                item.sold_price = Decimal(price) if price else None

                if item.staff_pick:
                    item.is_archive = True

                item.save()

        except Item.DoesNotExist:
            continue

    return HttpResponse(status=200)
