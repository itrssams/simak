from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import KendaraanViewSet, LogPerjalananViewSet, LogBBMViewSet, LogMaintenanceViewSet, RekapDriverView

router = DefaultRouter()
router.register(r'kendaraan', KendaraanViewSet, basename='kendaraan')
router.register(r'log-perjalanan', LogPerjalananViewSet, basename='log-perjalanan')
router.register(r'log-bbm', LogBBMViewSet, basename='log-bbm')
router.register(r'log-maintenance', LogMaintenanceViewSet, basename='log-maintenance')

urlpatterns = [
    path('rekap-driver/', RekapDriverView.as_view()),
    path('', include(router.urls)),
]
