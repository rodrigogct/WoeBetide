from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.dashboard_home, name="dashboard_home"),
    path("dashboard/inventory/", views.inventory_list, name="inventory_list"),
    path("dashboard/sell/", views.sell_dashboard, name="sell_dashboard"),
    path("dashboard/import/", views.import_inventory_view, name="import_inventory"),
    path(
        "dashboard/sell/<str:garment_id>/",
        views.sell_garment,
        name="sell_garment"
    ),
]