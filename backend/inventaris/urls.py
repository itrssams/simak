from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InventoryOptionViewSet, InventoryAssetViewSet

router = DefaultRouter()
router.register(r'options', InventoryOptionViewSet, basename='inventory-options')
router.register(r'assets', InventoryAssetViewSet, basename='inventory-assets')

urlpatterns = [
    path('', include(router.urls)),
]
