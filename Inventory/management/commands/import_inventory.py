from django.core.management.base import BaseCommand

from Inventory.importers import import_inventory_excel


class Command(BaseCommand):
    help = "Import WOE BETIDE Excel inventory into Django models."

    def add_arguments(self, parser):
        parser.add_argument("excel_path", type=str)

    def handle(self, *args, **options):
        excel_path = options["excel_path"]

        result = import_inventory_excel(excel_path)

        self.stdout.write(self.style.SUCCESS("Import complete."))
        self.stdout.write(f"Created garments: {result['created_garments']}")
        self.stdout.write(f"Updated garments: {result['updated_garments']}")
        self.stdout.write(f"Created sales: {result['created_sales']}")
        self.stdout.write(f"Created/updated payments: {result['created_or_updated_payments']}")
