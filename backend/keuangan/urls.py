from django.urls import path, include
from .views import LaporanPettyCashView, PembiayaanListView, PembiayaanDetailView, InvoiceDashboardView, KunjunganInvoiceView, InvoiceVerificationView
from rest_framework.routers import DefaultRouter
from .views import (
    AkunViewSet, TransaksiViewSet, JurnalViewSet,
    PelangganViewSet, PemasokViewSet, FakturViewSet, TagihanViewSet,
    AlokasiDanaViewSet,
    RekeningBankViewSet,
    AuditLogViewSet,
    PettyCashViewSet, ReimbursementViewSet, SaldoPettyCashViewSet, PengajuanPenambahanSaldoViewSet,
    KendaraanViewSet, LogPerjalananViewSet, LogBBMViewSet, LogMaintenanceViewSet, RekapDriverView,
    ITBackupRecordViewSet, ITRepairRequestViewSet, ITCredentialNoteViewSet, ITRemoteAccessViewSet,
    ITSubscriptionViewSet, AnnouncementViewSet,
    InventoryOptionViewSet, InventoryAssetViewSet,
    LogistikBarangViewSet, LogistikPembelianViewSet, LogistikBatchViewSet,
    LogistikMutasiViewSet, LogistikPermintaanViewSet, LogistikOpnameViewSet, LogistikVendorViewSet,
    UtangSupplierViewSet, PembayaranUtangViewSet, UtangMenungguVerifikasiView, UtangVendorOptionsView,
    faktur_legacy_print_view, faktur_tanda_terima_print_view, faktur_rekap_print_view, faktur_rekap_excel_view,
)

router = DefaultRouter()
router.register(r'akun',          AkunViewSet,          basename='akun')
router.register(r'transaksi',     TransaksiViewSet,     basename='transaksi')
router.register(r'jurnal',        JurnalViewSet,        basename='jurnal')
router.register(r'pelanggan',     PelangganViewSet,     basename='pelanggan')
router.register(r'pemasok',       PemasokViewSet,       basename='pemasok')
router.register(r'faktur',        FakturViewSet,        basename='faktur')
router.register(r'tagihan',       TagihanViewSet,       basename='tagihan')
router.register(r'alokasi-dana',  AlokasiDanaViewSet,   basename='alokasi-dana')
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
router.register(r'inventory/options', InventoryOptionViewSet, basename='inventory-options')
router.register(r'inventory/assets',  InventoryAssetViewSet,  basename='inventory-assets')
router.register(r'logistik/barang', LogistikBarangViewSet, basename='logistik-barang')
router.register(r'logistik/vendor', LogistikVendorViewSet, basename='logistik-vendor')
router.register(r'logistik/pembelian', LogistikPembelianViewSet, basename='logistik-pembelian')
router.register(r'logistik/batch', LogistikBatchViewSet, basename='logistik-batch')
router.register(r'logistik/mutasi', LogistikMutasiViewSet, basename='logistik-mutasi')
router.register(r'logistik/permintaan', LogistikPermintaanViewSet, basename='logistik-permintaan')
router.register(r'logistik/opname', LogistikOpnameViewSet, basename='logistik-opname')
router.register(r'utang-supplier', UtangSupplierViewSet, basename='utang-supplier')
router.register(r'pembayaran-utang', PembayaranUtangViewSet, basename='pembayaran-utang')
router.register(r'it/backups',      ITBackupRecordViewSet, basename='it-backups')
router.register(r'it/repair-requests', ITRepairRequestViewSet, basename='it-repair-requests')
router.register(r'it/credentials',  ITCredentialNoteViewSet, basename='it-credentials')
router.register(r'it/remote-access', ITRemoteAccessViewSet, basename='it-remote-access')
router.register(r'it/subscriptions', ITSubscriptionViewSet, basename='it-subscriptions')
urlpatterns = [
    path('faktur/rekap/', faktur_rekap_print_view, name='faktur-rekap-print'),
    path('faktur/tanda-terima/print/', faktur_tanda_terima_print_view, name='faktur-tanda-terima-print'),
    path('faktur/<int:pk>/print/', faktur_legacy_print_view, name='faktur-legacy-print'),

    path('', include(router.urls)),

    path('invoice-dashboard/', InvoiceDashboardView.as_view(), name='invoice-dashboard'),
    path('invoice-verification/', InvoiceVerificationView.as_view(), name='invoice-verification'),
    path('kunjungan-invoice/', KunjunganInvoiceView.as_view(), name='kunjungan-invoice'),
    path('pembiayaan-options/', PembiayaanListView.as_view(), name='pembiayaan-options'),
    path('pembiayaan-options/<int:id_pembiayaan>/', PembiayaanDetailView.as_view(), name='pembiayaan-detail'),
    path('catatan-utang/obat-bhp/menunggu-verifikasi/', UtangMenungguVerifikasiView.as_view(), name='utang-obat-bhp-menunggu'),
    path('catatan-utang/obat-bhp/vendor-options/', UtangVendorOptionsView.as_view(), name='utang-obat-bhp-vendor-options'),
    path('laporan-petty-cash/', LaporanPettyCashView.as_view(), name='laporan-petty-cash'),
    path('faktur/rekap/excel/', faktur_rekap_excel_view, name='faktur-rekap-excel'),
    path('faktur/rekap/', faktur_rekap_print_view, name='faktur-rekap-print'),
    path('rekap-driver/', RekapDriverView.as_view(), name='rekap-driver'),
]
