from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.dashboard_home, name="dashboard_home"),
    path("dashboard/inventory/", views.inventory_list, name="inventory_list"),
    path(
        "dashboard/sell/<str:garment_id>/",
        views.sell_garment,
        name="sell_garment"
    ),
]