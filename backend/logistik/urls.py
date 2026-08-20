from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LogistikBarangViewSet, LogistikVendorViewSet, LogistikSpbViewSet,
    LogistikSpbItemViewSet, LogistikPembelianViewSet, LogistikBatchViewSet,
    LogistikMutasiViewSet, LogistikPermintaanViewSet, LogistikOpnameViewSet
)

router = DefaultRouter()
router.register(r'barang', LogistikBarangViewSet, basename='logistik-barang')
router.register(r'vendor', LogistikVendorViewSet, basename='logistik-vendor')
router.register(r'spb', LogistikSpbViewSet, basename='logistik-spb')
router.register(r'spb-item', LogistikSpbItemViewSet, basename='logistik-spb-item')
router.register(r'pembelian', LogistikPembelianViewSet, basename='logistik-pembelian')
router.register(r'batch', LogistikBatchViewSet, basename='logistik-batch')
router.register(r'mutasi', LogistikMutasiViewSet, basename='logistik-mutasi')
router.register(r'permintaan', LogistikPermintaanViewSet, basename='logistik-permintaan')
router.register(r'opname', LogistikOpnameViewSet, basename='logistik-opname')

urlpatterns = [
    path('', include(router.urls)),
]
