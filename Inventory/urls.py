from django.urls import path
from . import views
from .pos_checkout import pos_complete_sale
from .inventory_suggest import inventory_suggest

urlpatterns = [
    path("dashboard/", views.dashboard_home, name="dashboard_home"),
    path("dashboard/inventory/", views.inventory_list, name="inventory_list"),
    path("dashboard/sell/", views.sell_dashboard, name="sell_dashboard"),
    path("dashboard/sell/search/", views.pos_garment_search, name="pos_garment_search"),
    path("dashboard/import/", views.import_inventory_view, name="import_inventory"),
    

    path("dashboard/collections/", views.collections_dashboard, name="collections_dashboard"),
    path("dashboard/sales/", views.sales_dashboard, name="sales_dashboard"),
    path("dashboard/sales/<str:sale_id>/", views.sale_detail, name="sale_detail"),
    path("dashboard/payments/", views.payments_dashboard, name="payments_dashboard"),

    path("dashboard/sell/complete/",pos_complete_sale, name="pos_complete_sale"),
    path("dashboard/sell/<str:garment_id>/",views.sell_garment,name="sell_garment"),
    path("inventory/suggest/",inventory_suggest,name="inventory_suggest",),
]