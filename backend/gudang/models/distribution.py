from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from gudang.models.master import Gudang, Barang, Ruang


class Permintaan(models.Model):
    STATUS_DRAFT = 'DRAFT'
    STATUS_MENUNGGU = 'MENUNGGU'
    STATUS_DISETUJUI = 'DISETUJUI'
    STATUS_SELESAI = 'SELESAI'
    STATUS_DITOLAK = 'DITOLAK'
    STATUS_BATAL = 'BATAL'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_MENUNGGU, 'Menunggu Persetujuan'),
        (STATUS_DISETUJUI, 'Disetujui Sebagian / Penuh'),
        (STATUS_SELESAI, 'Selesai (Sudah Diserahkan)'),
        (STATUS_DITOLAK, 'Ditolak'),
        (STATUS_BATAL, 'Dibatalkan'),
    ]

    nomor = models.CharField(max_length=50, unique=True, db_index=True)
    tanggal = models.DateField(default=timezone.now, db_index=True)
    ruang = models.ForeignKey(Ruang, on_delete=models.PROTECT, related_name='permintaan_gudang')
    ruang_nama = models.CharField(max_length=120, blank=True)
    catatan = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    alasan_tolak = models.TextField(blank=True)

    legacy_out_id = models.IntegerField(null=True, blank=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_permintaan_created'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_permintaan_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_permintaan'
        ordering = ['-tanggal', '-id']

    def save(self, *args, **kwargs):
        if self.ruang and not self.ruang_nama:
            self.ruang_nama = self.ruang.nama
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nomor} - {self.ruang_nama} ({self.status})"


class PermintaanItem(models.Model):
    permintaan = models.ForeignKey(Permintaan, on_delete=models.CASCADE, related_name='items')
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='permintaan_items')
    qty_minta = models.DecimalField(max_digits=12, decimal_places=3)
    satuan = models.CharField(max_length=20)
    qty_disetujui = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    qty_dikeluarkan = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    keterangan = models.CharField(max_length=255, blank=True)
    legacy_out_id = models.CharField(max_length=50, null=True, blank=True, db_index=True)

    class Meta:
        db_table = 'gdg_permintaan_item'
        indexes = [
            models.Index(fields=['permintaan', 'barang']),
            models.Index(fields=['legacy_out_id']),
        ]

    def __str__(self):
        return f"{self.permintaan.nomor} - {self.barang.nama}: Minta {self.qty_minta}"


class Pengeluaran(models.Model):
    STATUS_DRAFT = 'DRAFT'
    STATUS_DISETUJUI = 'DISETUJUI'
    STATUS_BATAL = 'BATAL'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_DISETUJUI, 'Disetujui & Dikeluarkan (Stok Berkurang)'),
        (STATUS_BATAL, 'Dibatalkan'),
    ]

    nomor = models.CharField(max_length=50, unique=True, db_index=True)
    permintaan = models.ForeignKey(
        Permintaan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pengeluaran_list'
    )
    gudang = models.ForeignKey(Gudang, on_delete=models.PROTECT, related_name='pengeluaran_list')
    ruang = models.ForeignKey(Ruang, on_delete=models.PROTECT, related_name='pengeluaran_gudang')
    ruang_nama = models.CharField(max_length=120, blank=True)
    tanggal = models.DateField(default=timezone.now, db_index=True)
    penerima_nama = models.CharField(max_length=100, blank=True, help_text="Nama petugas unit yang menerima fisik barang")
    total_nilai = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    catatan = models.TextField(blank=True)
    alasan_batal = models.TextField(blank=True)

    legacy_out_id = models.IntegerField(null=True, blank=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_pengeluaran_created'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_pengeluaran_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_pengeluaran'
        ordering = ['-tanggal', '-id']

    def save(self, *args, **kwargs):
        if self.ruang and not self.ruang_nama:
            self.ruang_nama = self.ruang.nama
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nomor} -> {self.ruang_nama} ({self.status})"


class PengeluaranItem(models.Model):
    pengeluaran = models.ForeignKey(Pengeluaran, on_delete=models.CASCADE, related_name='items')
    permintaan_item = models.ForeignKey(
        PermintaanItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='realisasi_items'
    )
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='pengeluaran_items')
    qty = models.DecimalField(max_digits=12, decimal_places=3)
    satuan = models.CharField(max_length=20)
    harga_unit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'), help_text="HPP bergerak saat barang dikeluarkan")
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    keterangan = models.CharField(max_length=255, blank=True)
    legacy_out_id = models.CharField(max_length=50, null=True, blank=True, db_index=True)

    class Meta:
        db_table = 'gdg_pengeluaran_item'
        indexes = [
            models.Index(fields=['pengeluaran', 'barang']),
            models.Index(fields=['legacy_out_id']),
        ]

    def __str__(self):
        return f"{self.pengeluaran.nomor} - {self.barang.nama}: {self.qty} {self.satuan}"
