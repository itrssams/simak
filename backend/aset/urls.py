from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AsetKelompokViewSet, AsetKategoriViewSet, AsetJenisViewSet,
    AsetRuanganViewSet, AsetViewSet, AsetPerbaikanViewSet
)

router = DefaultRouter()
router.register(r'kelompok', AsetKelompokViewSet, basename='aset-kelompok')
router.register(r'kategori', AsetKategoriViewSet, basename='aset-kategori')
router.register(r'jenis', AsetJenisViewSet, basename='aset-jenis')
router.register(r'ruangan', AsetRuanganViewSet, basename='aset-ruangan')
router.register(r'perbaikan', AsetPerbaikanViewSet, basename='aset-perbaikan')
router.register(r'aset', AsetViewSet, basename='aset-master')

urlpatterns = [
    path('', include(router.urls)),
]

