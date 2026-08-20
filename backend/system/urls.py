from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, AnnouncementViewSet, SystemMaintenanceViewSet

router = DefaultRouter()
router.register(r'audit-log', AuditLogViewSet, basename='audit-log')
router.register(r'announcements', AnnouncementViewSet, basename='announcements')
router.register(r'maintenance', SystemMaintenanceViewSet, basename='system-maintenance')

urlpatterns = [
    path('', include(router.urls)),
]
