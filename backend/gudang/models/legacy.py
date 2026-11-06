from django.db import models
from .master import Barang


class LegacyMutasi(models.Model):
    """
    Tabel arsip read-only mutasi keluar-masuk logistik dari sistem lama (app_siaga / dafbrg_log / item_logistik / item_out_log).
    TIDAK mempengaruhi stok dan TIDAK masuk ke perhitungan saldo baru.
    Tampil khusus pada Tab 'Riwayat Lama' di Kartu Stok.
    """
    legacy_id_brg = models.PositiveIntegerField(db_index=True)
    barang = models.ForeignKey(Barang, on_delete=models.SET_NULL, null=True, blank=True, related_name='riwayat_legacy')
    jenis = models.CharField(max_length=20)  # MASUK, KELUAR, OPNAME
    tanggal = models.DateTimeField(db_index=True)
    qty_dasar = models.DecimalField(max_digits=14, decimal_places=3)
    harga_dasar = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    ruang_nama = models.CharField(max_length=120, blank=True)
    vendor_nama = models.CharField(max_length=150, blank=True)
    dokumen_legacy = models.CharField(max_length=50, blank=True)
    catatan = models.TextField(blank=True)
    sumber_tabel = models.CharField(max_length=50)

    class Meta:
        db_table = 'gdg_legacy_mutasi'
        ordering = ['-tanggal', '-id']

    def __str__(self):
        return f"[LEGACY] {self.jenis} brg={self.legacy_id_brg} qty={self.qty_dasar} ({self.tanggal})"

