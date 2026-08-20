from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ITBackupRecordViewSet, ITRepairRequestViewSet, ITCredentialNoteViewSet,
    ITRemoteAccessViewSet, ITSubscriptionViewSet
)

router = DefaultRouter()
router.register(r'backups', ITBackupRecordViewSet, basename='it-backups')
router.register(r'repair-requests', ITRepairRequestViewSet, basename='it-repair-requests')
router.register(r'credentials', ITCredentialNoteViewSet, basename='it-credentials')
router.register(r'remote-access', ITRemoteAccessViewSet, basename='it-remote-access')
router.register(r'subscriptions', ITSubscriptionViewSet, basename='it-subscriptions')

urlpatterns = [
    path('', include(router.urls)),
]
