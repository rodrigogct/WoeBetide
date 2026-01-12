from django.db.models.signals import post_save
from django.dispatch import receiver
from Catalogue.models import Item
from Catalogue.utils.shopify_export import generate_shopify_csv

@receiver(post_save, sender=Item)
def regenerate_shopify_csv(sender, instance, **kwargs):
    generate_shopify_csv()
