from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from .master import Gudang, Barang


class SuratPesanan(models.Model):
    STATUS_DRAFT = 'DRAFT'
    STATUS_MENUNGGU = 'MENUNGGU_APPROVAL'
    STATUS_DISETUJUI = 'DISETUJUI'
    STATUS_DITOLAK = 'DITOLAK'
    STATUS_SELESAI = 'SELESAI'
    STATUS_BATAL = 'BATAL'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_MENUNGGU, 'Menunggu Approval'),
        (STATUS_DISETUJUI, 'Disetujui'),
        (STATUS_DITOLAK, 'Ditolak'),
        (STATUS_SELESAI, 'Selesai'),
        (STATUS_BATAL, 'Dibatalkan'),
    ]

    nomor = models.CharField(max_length=50, unique=True, db_index=True)
    tanggal = models.DateField()
    vendor_id = models.IntegerField(null=True, blank=True)
    vendor_nama = models.CharField(max_length=150)
    catatan = models.TextField(blank=True)
    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    total_nilai = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_po_created'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_po_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    catatan_tolak = models.TextField(blank=True)
    alasan_batal = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_po'
        ordering = ['-tanggal', '-id']

    def __str__(self):
        return f"{self.nomor} - {self.vendor_nama} ({self.status})"

    def recalculate_total(self):
        total = sum([item.subtotal for item in self.items.all()])
        self.total_nilai = total
        self.save(update_fields=['total_nilai', 'updated_at'])


class SuratPesananItem(models.Model):
    po = models.ForeignKey(SuratPesanan, on_delete=models.CASCADE, related_name='items')
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='po_items')
    kemasan = models.CharField(max_length=50)
    isi = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal('1.000'))
    qty_kemasan = models.DecimalField(max_digits=14, decimal_places=3)
    qty_dasar = models.DecimalField(max_digits=14, decimal_places=3)
    harga_kemasan = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    harga_dasar = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    qty_diterima = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal('0.000'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gdg_po_item'
        ordering = ['id']

    def save(self, *args, **kwargs):
        if self.isi <= 0:
            self.isi = Decimal('1.000')
        self.qty_dasar = self.qty_kemasan * self.isi
        self.harga_dasar = self.harga_kemasan / self.isi
        self.subtotal = self.qty_kemasan * self.harga_kemasan
        super().save(*args, **kwargs)


class Penerimaan(models.Model):
    STATUS_DRAFT = 'DRAFT'
    STATUS_DISETUJUI = 'DISETUJUI'
    STATUS_BATAL = 'BATAL'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_DISETUJUI, 'Disetujui'),
        (STATUS_BATAL, 'Dibatalkan'),
    ]

    nomor = models.CharField(max_length=50, unique=True, db_index=True)
    po = models.ForeignKey(
        SuratPesanan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='penerimaan_list'
    )
    gudang = models.ForeignKey(Gudang, on_delete=models.PROTECT, related_name='penerimaan_list')
    tanggal = models.DateField()
    vendor_id = models.IntegerField(null=True, blank=True)
    vendor_nama = models.CharField(max_length=150)
    no_faktur = models.CharField(max_length=100, blank=True)
    tgl_jatuh_tempo = models.DateField(null=True, blank=True)
    metode_pembayaran = models.CharField(max_length=20, default='Kredit')
    total_nilai = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    tutup_po = models.BooleanField(default=True)
    kirim_keuangan = models.BooleanField(default=False)
    utang_supplier_id = models.IntegerField(null=True, blank=True)
    catatan = models.TextField(blank=True)
    alasan_batal = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_grn_created'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_grn_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_penerimaan'
        ordering = ['-tanggal', '-id']

    def __str__(self):
        return f"{self.nomor} - {self.vendor_nama} ({self.status})"

    def recalculate_total(self):
        total = sum([item.subtotal for item in self.items.all()])
        self.total_nilai = total
        self.save(update_fields=['total_nilai', 'updated_at'])


class PenerimaanItem(models.Model):
    penerimaan = models.ForeignKey(Penerimaan, on_delete=models.CASCADE, related_name='items')
    po_item = models.ForeignKey(
        SuratPesananItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grn_items'
    )
    barang = models.ForeignKey(Barang, on_delete=models.PROTECT, related_name='grn_items')
    kemasan = models.CharField(max_length=50)
    isi = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal('1.000'))
    qty_kemasan = models.DecimalField(max_digits=14, decimal_places=3)
    qty_dasar = models.DecimalField(max_digits=14, decimal_places=3)
    harga_kemasan = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    harga_dasar = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    batch_no = models.CharField(max_length=60, blank=True)
    exp_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gdg_penerimaan_item'
        ordering = ['id']

    def save(self, *args, **kwargs):
        if self.isi <= 0:
            self.isi = Decimal('1.000')
        self.qty_dasar = self.qty_kemasan * self.isi
        self.harga_dasar = self.harga_kemasan / self.isi
        self.subtotal = self.qty_kemasan * self.harga_kemasan
        super().save(*args, **kwargs)

