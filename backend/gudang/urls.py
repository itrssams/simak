from django.urls import path, include
from rest_framework.routers import DefaultRouter
from gudang.views.master import (
    GudangViewSet, GolonganBarangViewSet, SatuanViewSet,
    BarangViewSet, RuangViewSet, LegacyMutasiViewSet, StokLedgerViewSet
)
from gudang.views.purchasing import (
    SuratPesananViewSet, PenerimaanViewSet, VendorViewSet
)
from gudang.views.distribution import (
    PermintaanViewSet, PengeluaranViewSet
)
from gudang.views.opname import StockOpnameViewSet
from gudang.views.reports import LaporanViewSet

router = DefaultRouter()
router.register('gudang', GudangViewSet, basename='gudang')
router.register('golongan', GolonganBarangViewSet, basename='golongan')
router.register('satuan', SatuanViewSet, basename='satuan')
router.register('barang', BarangViewSet, basename='barang')
router.register('ruang', RuangViewSet, basename='ruang')
router.register('legacy-mutasi', LegacyMutasiViewSet, basename='legacy-mutasi')
router.register('ledger', StokLedgerViewSet, basename='ledger')

router.register('po', SuratPesananViewSet, basename='po')
router.register('penerimaan', PenerimaanViewSet, basename='penerimaan')
router.register('vendor', VendorViewSet, basename='vendor')

router.register('permintaan', PermintaanViewSet, basename='permintaan')
router.register('pengeluaran', PengeluaranViewSet, basename='pengeluaran')
router.register('opname', StockOpnameViewSet, basename='opname')
router.register('laporan', LaporanViewSet, basename='laporan')

urlpatterns = [
    path('', include(router.urls)),
]
