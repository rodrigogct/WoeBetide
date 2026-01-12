from django.contrib import admin
from .models import Item, Jewerly
from django.contrib import admin
from django.urls import path
from django.shortcuts import render, redirect
from django.contrib import messages
from django.conf import settings
from django.http import HttpResponseRedirect
from django.http import HttpResponseRedirect, HttpResponseNotAllowed
import csv
from django.utils import timezone
from Catalogue.utils.shopify_sync import sync_shopify_variants
from django.utils.html import format_html
# Register your models here.

class AdminItem(admin.ModelAdmin):
    list_display = ['name', 'category', 'is_sold', 'sold_price', 'shopify_variant_id', 'shopify_handle']
    list_filter = ['is_sold', 'category', 'is_featured']
    search_fields = ['name', 'description']
    readonly_fields = ("img2", 'sold_at','sold_price','created', 'updated')

    fieldsets = (
        (None, {
            "fields": (
                "name",
                "category",
                "staff_pick", "is_featured", "is_sold", 'sold_at',"is_archive",
                "price", "sold_price","description",
                "size", "width", "length", "sleeve",
                ("img1", "img2"),
                "img3", "img4", "img5", "img6", "img7",
                "shopify_variant_id", "shopify_handle",
                "created", "updated",
            )
        }),
    )

    change_list_template = "admin/change_list_with_csv_upload.html"

    def save_model(self, request, obj, form, change):
        # Keep sold_at in sync with the checkbox
        if "is_sold" in form.changed_data:
            if obj.is_sold:
                # Only set if empty; don't overwrite a manual backdate
                if not obj.sold_at:
                    obj.sold_at = timezone.now()
            else:
                # Un-selling clears the timestamp
                obj.sold_at = None

        if "img1" in form.changed_data:
            # reset derived images so your pipeline regenerates them
            if obj.img2:
                obj.img2.delete(save=False)
            if obj.img3:
                obj.img3.delete(save=False)
            obj.img2 = None
            obj.img3 = None
        super().save_model(request, obj, form, change)

    def get_urls(self):
        urls = super().get_urls()
        app_label = self.model._meta.app_label
        model_name = self.model._meta.model_name
        return [
            path(
                "import-variant-ids/",
                self.admin_site.admin_view(self.import_variant_ids),
                name=f"{app_label}_{model_name}_import_variant_ids",
            ),
        ] + urls

    def import_variant_ids(self, request):
        # Allow only POST
        if request.method != "POST":
            return HttpResponseNotAllowed(["POST"])

        # Enforce model-level permission
        if not self.has_change_permission(request):
            self.message_user(request, "Permission denied.", level=messages.ERROR)
            return HttpResponseRedirect("../")

        result = sync_shopify_variants(
            STORE=settings.SHOPIFY_STORE,
            API_VERSION=settings.SHOPIFY_API_VERSION,
            ACCESS_TOKEN=settings.SHOPIFY_ADMIN_TOKEN,
        )

        if not result.get("success"):
            self.message_user(request, f"Error fetching products: {result.get('status_code','unknown')}", messages.ERROR)
        else:
            self.message_user(request, f"✅ Updated {result.get('updated',0)} items.", messages.SUCCESS)
            nf = result.get("not_found") or []
            if nf:
                preview = ", ".join(map(str, nf[:5]))
                self.message_user(request, f"⚠️ Could not match: {preview}{'...' if len(nf)>5 else ''}", messages.WARNING)

        return HttpResponseRedirect("../")
admin.site.register(Item, AdminItem)

class AdminJewerly(admin.ModelAdmin): 
    readonly_fields=('created','updated')
admin.site.register(Jewerly, AdminJewerly)


