from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static
from .views_shopify import orders_paid_webhook

urlpatterns = [
    path('vintage/', views.catalogue, name="Catalogue"),
    path('staff_picks/',views.catalogue, name="StaffPicks"),
    path('archive/', views.catalogue, name="Archive"),
    path("jewelry/", views.jewelry, name="Jewelry"),
    path('item/<int:item_id>/', views.item, name="Item"),
    path('archive_item/<int:item_id>/', views.item, name="ArchiveItem"),
    path('staff_item/<int:item_id>/', views.item, name="StaffItem"),
    path("jewelry/<int:jewelry_item_id>/", views.jewelry_item, name="JewelryItem"),
    path("webhooks/shopify/orders-paid/", orders_paid_webhook, name="shopify_orders_paid"),

    # Cart endpoints
    path('cart/', views.cart_view, name="Cart"),
    path('cart/count/', views.cart_count_api, name="CartCount"),
    path('cart/add/<int:item_id>/', views.add_to_cart, name="CartAdd"),
    path('cart/update/', views.update_cart, name="CartUpdate"),
    path('cart/remove/<str:variant_id>/', views.remove_from_cart, name="CartRemove"),
]

urlpatterns+= static(settings.MEDIA_URL, document_root = settings.MEDIA_ROOT)

