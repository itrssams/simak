from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    IzinKeluarViewSet,
    MesinAbsenViewSet,
    KaryawanMesinMappingViewSet,
    LogPresensiViewSet,
    PresensiHarianViewSet,
)

router = DefaultRouter()
router.register(r'izin-keluar', IzinKeluarViewSet, basename='izin-keluar')
router.register(r'mesin', MesinAbsenViewSet, basename='sdm-mesin')
router.register(r'mapping-karyawan', KaryawanMesinMappingViewSet, basename='sdm-mapping-karyawan')
router.register(r'logs', LogPresensiViewSet, basename='sdm-logs')
router.register(r'presensi', PresensiHarianViewSet, basename='sdm-presensi')

urlpatterns = [
    path('', include(router.urls)),
]
