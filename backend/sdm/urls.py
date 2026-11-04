from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    IzinKeluarViewSet,
    PegawaiViewSet,
    ShiftViewSet,
    JadwalDinasViewSet,
    JadwalKoreksiViewSet,
    TukarDinasViewSet,
    MesinAbsenViewSet,
    KaryawanMesinMappingViewSet,
    LogPresensiViewSet,
    PresensiHarianViewSet,
)

router = DefaultRouter()
router.register(r'pegawai', PegawaiViewSet, basename='sdm-pegawai')
router.register(r'shift', ShiftViewSet, basename='sdm-shift')
router.register(r'roster', JadwalDinasViewSet, basename='sdm-roster')
router.register(r'jadwal-koreksi', JadwalKoreksiViewSet, basename='sdm-jadwal-koreksi')
router.register(r'tukar-dinas', TukarDinasViewSet, basename='sdm-tukar-dinas')
router.register(r'izin-keluar', IzinKeluarViewSet, basename='izin-keluar')
router.register(r'mesin', MesinAbsenViewSet, basename='sdm-mesin')
router.register(r'mapping-karyawan', KaryawanMesinMappingViewSet, basename='sdm-mapping-karyawan')
router.register(r'logs', LogPresensiViewSet, basename='sdm-logs')
router.register(r'presensi', PresensiHarianViewSet, basename='sdm-presensi')

urlpatterns = [
    path('', include(router.urls)),
]
