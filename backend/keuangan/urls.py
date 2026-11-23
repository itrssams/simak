from django.urls import path, include
from .views import (
    LaporanPettyCashView, PembiayaanListView, PembiayaanDetailView,
    InvoiceDashboardView, KunjunganInvoiceView, InvoiceVerificationView,
    TransaksiViewSet,
    PelangganViewSet, PemasokViewSet, FakturViewSet, TagihanViewSet,
    AlokasiDanaViewSet, IndukPembiayaanViewSet,
    RekeningBankViewSet,
    PettyCashViewSet, ReimbursementViewSet, SaldoPettyCashViewSet, PengajuanPenambahanSaldoViewSet,
    KasBesarViewSet,
    UtangSupplierViewSet, PembayaranUtangViewSet, UtangMenungguVerifikasiView, UtangVendorOptionsView, UtangPelunasanDataLamaView,
    faktur_legacy_print_view, faktur_tanda_terima_print_view, faktur_rekap_print_view, faktur_rekap_excel_view,
)
from .accounting_views import (
    AkunViewSet,
    AccountingPeriodViewSet,
    AccountMappingViewSet,
    JurnalViewSet,
    BukuBesarReportView,
    NeracaSaldoReportView,
    LabaRugiReportView,
    NeracaReportView,
    AgingReportView,
    DepreciationPostView,
)
from rest_framework.routers import DefaultRouter
from logistik.views import LogistikVendorViewSet

router = DefaultRouter()
router.register(r'akun',             AkunViewSet,             basename='akun')
router.register(r'periode',          AccountingPeriodViewSet, basename='periode')
router.register(r'account-mapping',  AccountMappingViewSet,   basename='account-mapping')
router.register(r'transaksi',        TransaksiViewSet,        basename='transaksi')
router.register(r'jurnal',           JurnalViewSet,           basename='jurnal')
router.register(r'pelanggan',        PelangganViewSet,        basename='pelanggan')
router.register(r'pemasok',          PemasokViewSet,          basename='pemasok')
router.register(r'faktur',           FakturViewSet,           basename='faktur')
router.register(r'tagihan',          TagihanViewSet,          basename='tagihan')
router.register(r'alokasi-dana',     AlokasiDanaViewSet,      basename='alokasi-dana')
router.register(r'induk-pembiayaan', IndukPembiayaanViewSet,  basename='induk-pembiayaan')
router.register(r'rekening',         RekeningBankViewSet,     basename='rekening')
router.register(r'petty-cash',       PettyCashViewSet,        basename='petty-cash')
router.register(r'kas-besar',        KasBesarViewSet,         basename='kas-besar')
router.register(r'reimbursement',    ReimbursementViewSet,    basename='reimbursement')
router.register(r'saldo-petty-cash', SaldoPettyCashViewSet,   basename='saldo-petty-cash')
router.register(r'penambahan-saldo', PengajuanPenambahanSaldoViewSet, basename='penambahan-saldo')
router.register(r'utang-supplier',   UtangSupplierViewSet,    basename='utang-supplier')
router.register(r'pembayaran-utang', PembayaranUtangViewSet,  basename='pembayaran-utang')
router.register(r'catatan-utang/vendor', LogistikVendorViewSet, basename='utang-master-vendor')

urlpatterns = [
    path('faktur/rekap/', faktur_rekap_print_view, name='faktur-rekap-print'),
    path('faktur/tanda-terima/print/', faktur_tanda_terima_print_view, name='faktur-tanda-terima-print'),
    path('faktur/<int:pk>/print/', faktur_legacy_print_view, name='faktur-legacy-print'),
    path('it/', include('it.urls')),
    path('inventaris/', include('inventaris.urls')),
    path('logistik/', include('logistik.urls')),
    path('', include('system.urls')),
    path('', include('driver.urls')),
    path('', include(router.urls)),

    # Accounting Reports & Monthly Depreciation Endpoints (FASE 3)
    path('laporan/buku-besar/', BukuBesarReportView.as_view(), name='laporan-buku-besar'),
    path('laporan/neraca-saldo/', NeracaSaldoReportView.as_view(), name='laporan-neraca-saldo'),
    path('laporan/laba-rugi/', LabaRugiReportView.as_view(), name='laporan-laba-rugi'),
    path('laporan/neraca/', NeracaReportView.as_view(), name='laporan-neraca'),
    path('laporan/aging/', AgingReportView.as_view(), name='laporan-aging'),
    path('penyusutan/post/', DepreciationPostView.as_view(), name='penyusutan-post'),

    path('invoice-dashboard/', InvoiceDashboardView.as_view(), name='invoice-dashboard'),
    path('invoice-verification/', InvoiceVerificationView.as_view(), name='invoice-verification'),
    path('kunjungan-invoice/', KunjunganInvoiceView.as_view(), name='kunjungan-invoice'),
    path('pembiayaan-options/', PembiayaanListView.as_view(), name='pembiayaan-options'),
    path('pembiayaan-options/<int:id_pembiayaan>/', PembiayaanDetailView.as_view(), name='pembiayaan-detail'),
    path('catatan-utang/obat-bhp/menunggu-verifikasi/', UtangMenungguVerifikasiView.as_view(), name='utang-obat-bhp-menunggu'),
    path('catatan-utang/obat-bhp/lunaskan-data-lama/', UtangPelunasanDataLamaView.as_view(), name='utang-obat-bhp-lunaskan-data-lama'),
    path('catatan-utang/obat-bhp/vendor-options/', UtangVendorOptionsView.as_view(), name='utang-obat-bhp-vendor-options'),
    path('laporan-petty-cash/', LaporanPettyCashView.as_view(), name='laporan-petty-cash'),
    path('faktur/rekap/excel/', faktur_rekap_excel_view, name='faktur-rekap-excel'),
]
