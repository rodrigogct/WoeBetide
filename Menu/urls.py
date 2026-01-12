from django.urls import path
from Menu import views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('menu/', views.menu, name="Menu"),
    path('about/', views.about, {'page': 'about'}, name="about"),
    path('shipping/', views.about, {'page': 'shipping'}, name='shipping'),
    path('terms/', views.about, {'page': 'terms'}, name='terms'),
    path('privacy/', views.about, {'page': 'privacy'}, name='privacy'),
]

urlpatterns+= static(settings.MEDIA_URL, document_root = settings.MEDIA_ROOT)

