import csv
import requests
from django.core.management.base import BaseCommand
from Catalogue.models import Item
from Catalogue.utils.shopify_sync import sync_shopify_variants
from django.conf import settings

class Command(BaseCommand):
    help = 'Sync Shopify variant IDs to Django items'

    def handle(self, *args, **options):
        result = sync_shopify_variants(
            STORE='tyu50q-za',
            API_VERSION='2024-01',
            ACCESS_TOKEN= settings.SHOPIFY_ADMIN_TOKEN
        )

        if not result["success"]:
            self.stdout.write(self.style.ERROR(
                f"Error fetching products: {result['status_code']}"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Updated {result['updated']} items"
            ))
            if result["not_found"]:
                self.stdout.write(self.style.WARNING(
                    f"Could not match: {', '.join(result['not_found'])}"
                ))
