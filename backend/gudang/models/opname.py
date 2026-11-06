from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from gudang.models.master import Gudang, Barang


class StockOpname(models.Model):
    JENIS_SALDO_AWAL = 'SALDO_AWAL'
    JENIS_RUTIN = 'RUTIN'
    JENIS_CHOICES = [
        (JENIS_SALDO_AWAL, 'Saldo Awal Cut-Over'),
        (JENIS_RUTIN, 'Stock Opname Fisik Rutin'),
    ]

    STATUS_DRAFT = 'DRAFT'
    STATUS_DISETUJUI = 'DISETUJUI'
    STATUS_BATAL = 'BATAL'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_DISETUJUI, 'Disetujui & Diterapkan ke Stok'),
        (STATUS_BATAL, 'Dibatalkan'),
    ]

    nomor = models.CharField(max_length=50, unique=True, db_index=True)
    tanggal = models.DateField(default=timezone.now, db_index=True)
    gudang = models.ForeignKey(Gudang, on_delete=models.PROTECT, related_name='opname_list')
    jenis = models.CharField(max_length=20, choices=JENIS_CHOICES, default=JENIS_SALDO_AWAL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    catatan = models.TextField(blank=True)
    total_selisih_qty = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    total_nilai_fisik = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_opname_created'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_opname_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_opname'
        ordering = ['-tanggal', '-id']

    def __str__(self):
        return f"{self.nomor} ({self.jenis} - {self.status})"


class StockOpnameItem(models.Model):
    opname = models.ForeignKey(StockOpname, on_delete=models.CASCADE, related_name='items')
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='opname_items')
    qty_sistem = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    qty_fisik = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    selisih = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    satuan = models.CharField(max_length=20)
    harga_unit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    subtotal_fisik = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    subtotal_selisih = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    keterangan = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'gdg_opname_item'
        indexes = [
            models.Index(fields=['opname', 'barang']),
        ]

    def __str__(self):
        return f"{self.opname.nomor} - {self.barang.nama}: Fisik {self.qty_fisik}"

