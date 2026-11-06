from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from .master import Barang, Gudang


class StokLedger(models.Model):
    """
    IMMUTABLE Stock Ledger: Jantung pencatatan stok.
    Tabel append-only. Dilarang UPDATE atau DELETE baris yang sudah ada.
    Koreksi transaksi selalu dilakukan dengan baris pembalik (Reversal).
    """
    JENIS_CHOICES = [
        ('IN', 'Penerimaan / Masuk'),
        ('OUT', 'Pengeluaran Unit'),
        ('ADJ_PLUS', 'Penyesuaian Opname (+)'),
        ('ADJ_MINUS', 'Penyesuaian Opname (-)'),
        ('REV_IN', 'Pembatalan Penerimaan'),
        ('REV_OUT', 'Pembatalan Pengeluaran'),
        ('SALDO_AWAL', 'Saldo Awal Cut-over'),
    ]

    gudang = models.ForeignKey(Gudang, on_delete=models.PROTECT, related_name='ledger_entries')
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='ledger_entries')
    tanggal_efektif = models.DateTimeField(default=timezone.now, db_index=True)
    jenis = models.CharField(max_length=20, choices=JENIS_CHOICES)
    
    # Kuantitas bertanda: positif untuk penambahan stok, negatif untuk pengurangan
    qty_dasar = models.DecimalField(max_digits=14, decimal_places=3)
    
    # Biaya satuan rata-rata bergerak saat transaksi terjadi
    nilai_unit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0'))
    
    # Nilai total bertanda: qty_dasar * nilai_unit
    nilai_total = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    
    # Snapshot saldo setelah baris ini (untuk kemudahan audit dan tracing kartu stok)
    saldo_qty_setelah = models.DecimalField(max_digits=14, decimal_places=3)
    saldo_nilai_setelah = models.DecimalField(max_digits=18, decimal_places=2)

    # Sumber dokumen referensi
    sumber_tipe = models.CharField(max_length=30)  # GRN, ISS, OPN, VOID, SALDO_AWAL
    sumber_id = models.CharField(max_length=50)
    sumber_nomor = models.CharField(max_length=50, blank=True)
    reversal_of = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='reversed_by')

    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='gdg_ledger_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gdg_stok_ledger'
        ordering = ['id']
        indexes = [
            models.Index(fields=['barang', 'gudang', 'tanggal_efektif', 'id'], name='gdg_ledger_b_g_tgl_idx'),
            models.Index(fields=['sumber_tipe', 'sumber_id'], name='gdg_ledger_sumber_idx'),
        ]

    def __str__(self):
        return f"[{self.id}] {self.jenis} {self.barang.nama}: {self.qty_dasar} @ {self.nilai_unit} ({self.sumber_nomor})"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Baris StokLedger bersifat immutable (tidak dapat diubah setelah disimpan).")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Baris StokLedger bersifat immutable (tidak dapat dihapus). Lakukan reversal dokumen.")


class StokSaldo(models.Model):
    """
    Cache saldo berjalan per barang per gudang.
    Wajib disinkronkan dan dihitung ulang melalui StockService di bawah row lock.
    """
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='saldo_stok')
    gudang = models.ForeignKey(Gudang, on_delete=models.PROTECT, related_name='saldo_stok')
    qty = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal('0'))
    nilai = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    avg_cost = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0'))
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_stok_saldo'
        unique_together = ('barang', 'gudang')

    def __str__(self):
        return f"{self.barang.nama} @ {self.gudang.kode}: {self.qty} (Rp {self.nilai})"

