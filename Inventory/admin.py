from django.contrib import admin
from import_export.admin import ImportExportModelAdmin
from .models import Collection, Garment, Sale, SaleItem, Payment
from .resources import GarmentResource

@admin.register(Collection)
class CollectionAdmin(admin.ModelAdmin):
    list_display = ("collection_id", "date_bought", "source")
    search_fields = ("collection_id", "source")

@admin.register(Garment)
class GarmentAdmin(ImportExportModelAdmin):
    resource_class = GarmentResource

    list_display = (
        "garment_id",
        "name",
        "category",
        "size",
        "cost",
        "listed_price",
        "sold_price",
        "status",
        "is_visible_on_site",
        "collection",
    )

    list_filter = (
        "status",
        "category",
        "collection",
        "is_visible_on_site",
    )

    search_fields = (
        "garment_id",
        "name",
        "brand",
        "size",
    )

    list_editable = (
        "status",
        "is_visible_on_site",
        "listed_price",
    )

class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 1

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "sale_id",
        "sale_date",
        "channel",
        "customer_name",
        "created_by",
    )

    list_filter = (
        "channel",
        "sale_date",
    )

    search_fields = (
        "sale_id",
        "customer_name",
    )

    inlines = [SaleItemInline]

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "cash",
        "clip",
        "card",
        "transfer",
        "fees",
        "gross_total",
        "net_total",
    )

    search_fields = (
        "sale__sale_id",
    )