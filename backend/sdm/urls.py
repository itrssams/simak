from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IzinKeluarViewSet

router = DefaultRouter()
router.register(r'izin-keluar', IzinKeluarViewSet, basename='izin-keluar')

urlpatterns = [
    path('', include(router.urls)),
]
