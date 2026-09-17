from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ITBackupRecordViewSet, ITRepairRequestViewSet, ITCredentialNoteViewSet,
    ITRemoteAccessViewSet, ITSubscriptionViewSet, ApotikCorrectionView
)
from .transaction_correction import TransactionCorrectionView

router = DefaultRouter()
router.register(r'backups', ITBackupRecordViewSet, basename='it-backups')
router.register(r'repair-requests', ITRepairRequestViewSet, basename='it-repair-requests')
router.register(r'credentials', ITCredentialNoteViewSet, basename='it-credentials')
router.register(r'remote-access', ITRemoteAccessViewSet, basename='it-remote-access')
router.register(r'subscriptions', ITSubscriptionViewSet, basename='it-subscriptions')

urlpatterns = [
    path('apotik/correction/<str:action_type>/', ApotikCorrectionView.as_view(), name='it-apotik-correction'),
    path('transaction-correction/<str:action_type>/', TransactionCorrectionView.as_view(), name='it-transaction-correction'),
    path('', include(router.urls)),
]
