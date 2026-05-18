from django.urls import path, include
from .views import LaporanPettyCashView
from rest_framework.routers import DefaultRouter
from .views import (
    AkunViewSet, TransaksiViewSet, JurnalViewSet,
    PelangganViewSet, PemasokViewSet, FakturViewSet, TagihanViewSet,
    RekeningBankViewSet,
    AuditLogViewSet,
    PettyCashViewSet, ReimbursementViewSet, SaldoPettyCashViewSet, PengajuanPenambahanSaldoViewSet,
    KendaraanViewSet, LogPerjalananViewSet, LogBBMViewSet, LogMaintenanceViewSet, RekapDriverView,
    ITBackupRecordViewSet, ITRepairRequestViewSet, ITCredentialNoteViewSet, ITRemoteAccessViewSet,
    ITSubscriptionViewSet, AnnouncementViewSet
)

router = DefaultRouter()
router.register(r'akun',          AkunViewSet,          basename='akun')
router.register(r'transaksi',     TransaksiViewSet,     basename='transaksi')
router.register(r'jurnal',        JurnalViewSet,        basename='jurnal')
router.register(r'pelanggan',     PelangganViewSet,     basename='pelanggan')
router.register(r'pemasok',       PemasokViewSet,       basename='pemasok')
router.register(r'faktur',        FakturViewSet,        basename='faktur')
router.register(r'tagihan',       TagihanViewSet,       basename='tagihan')
router.register(r'rekening',      RekeningBankViewSet,  basename='rekening')
router.register(r'audit-log',     AuditLogViewSet,      basename='audit-log')
router.register(r'petty-cash',    PettyCashViewSet,     basename='petty-cash')
router.register(r'reimbursement', ReimbursementViewSet, basename='reimbursement')
router.register(r'saldo-petty-cash',      SaldoPettyCashViewSet,         basename='saldo-petty-cash')
router.register(r'penambahan-saldo',      PengajuanPenambahanSaldoViewSet, basename='penambahan-saldo')
router.register(r'kendaraan',       KendaraanViewSet,      basename='kendaraan')
router.register(r'log-perjalanan',  LogPerjalananViewSet,  basename='log-perjalanan')
router.register(r'log-bbm',         LogBBMViewSet,         basename='log-bbm')
router.register(r'log-maintenance', LogMaintenanceViewSet, basename='log-maintenance')
router.register(r'announcements',   AnnouncementViewSet,   basename='announcements')
router.register(r'it/backups',      ITBackupRecordViewSet, basename='it-backups')
router.register(r'it/repair-requests', ITRepairRequestViewSet, basename='it-repair-requests')
router.register(r'it/credentials',  ITCredentialNoteViewSet, basename='it-credentials')
router.register(r'it/remote-access', ITRemoteAccessViewSet, basename='it-remote-access')
router.register(r'it/subscriptions', ITSubscriptionViewSet, basename='it-subscriptions')
urlpatterns = [
    path('', include(router.urls)),
    path('laporan-petty-cash/', LaporanPettyCashView.as_view(), name='laporan-petty-cash'),
    path('rekap-driver/', RekapDriverView.as_view(), name='rekap-driver'),
]
