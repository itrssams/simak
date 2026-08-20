from django.db import models
from django.conf import settings
from django.utils import timezone

class LogistikBarang(models.Model):
    nama_barang = models.CharField(max_length=160)
    kemasan = models.CharField(max_length=80, blank=True)
    satuan = models.CharField(max_length=40)
    isi = models.PositiveIntegerField(default=1)
    merk = models.CharField(max_length=100, blank=True)
    golongan = models.CharField(max_length=100, blank=True)
    stok = models.IntegerField(default=0)
    stok_minimum = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_barang_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'logistik_barang'
        ordering = ['nama_barang']
        indexes = [
            models.Index(fields=['nama_barang'], name='log_barang_nama_idx'),
            models.Index(fields=['is_active', 'stok'], name='log_barang_active_stok_idx'),
        ]

    def __str__(self):
        return self.nama_barang

    def refresh_stok(self):
        masuk = self.batch_logistik.aggregate(total=models.Sum(models.F('qty') * models.F('isi')))['total'] or 0
        keluar = self.mutasi_logistik.aggregate(total=models.Sum('qty'))['total'] or 0
        self.stok = masuk - keluar
        self.save(update_fields=['stok', 'updated_at'])
        return self.stok


class LogistikPembelian(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('selesai', 'Selesai')]

    nomor = models.CharField(max_length=30, unique=True, blank=True)
    tanggal = models.DateField(default=timezone.localdate)
    pemasok = models.CharField(max_length=150, blank=True)
    no_faktur = models.CharField(max_length=80, blank=True)
    keterangan = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_pembelian_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']

    def save(self, *args, **kwargs):
        if not self.nomor:
            today = timezone.localdate()
            prefix = f'GL-IN-{today:%Y%m}-'
            last = LogistikPembelian.objects.filter(nomor__startswith=prefix).order_by('nomor').last()
            num = int(last.nomor.split('-')[-1]) + 1 if last else 1
            self.nomor = f'{prefix}{num:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nomor


class LogistikBatch(models.Model):
    pembelian = models.ForeignKey(LogistikPembelian, on_delete=models.CASCADE, related_name='items')
    barang = models.ForeignKey(LogistikBarang, on_delete=models.PROTECT, related_name='batch_logistik')
    qty_pesan = models.PositiveIntegerField(default=0)
    qty = models.PositiveIntegerField(default=0)
    isi = models.PositiveIntegerField(default=1)
    harga = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    jml_mutasi = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'logistik_batch'
        ordering = ['id']

    @property
    def stok_batch(self):
        return (self.qty * self.isi) - self.jml_mutasi

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.barang.refresh_stok()

    def delete(self, *args, **kwargs):
        barang = self.barang
        super().delete(*args, **kwargs)
        barang.refresh_stok()


class LogistikMutasi(models.Model):
    nomor = models.CharField(max_length=30, blank=True)
    barang = models.ForeignKey(LogistikBarang, on_delete=models.PROTECT, related_name='mutasi_logistik')
    batch = models.ForeignKey(LogistikBatch, on_delete=models.PROTECT, related_name='mutasi_items', null=True, blank=True)
    tanggal = models.DateField(default=timezone.localdate)
    ruang = models.CharField(max_length=120)
    qty = models.PositiveIntegerField()
    harga = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_mutasi_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'logistik_mutasi'
        ordering = ['-tanggal', '-created_at']
        indexes = [models.Index(fields=['barang', 'tanggal'], name='log_mutasi_barang_tgl_idx')]

    def save(self, *args, **kwargs):
        if not self.nomor:
            today = timezone.localdate()
            prefix = f'GL-OUT-{today:%Y%m}-'
            last = LogistikMutasi.objects.filter(nomor__startswith=prefix).order_by('nomor').last()
            num = int(last.nomor.split('-')[-1]) + 1 if last else 1
            self.nomor = f'{prefix}{num:04d}'
        super().save(*args, **kwargs)


class LogistikPermintaan(models.Model):
    STATUS_CHOICES = [('menunggu', 'Menunggu'), ('disetujui', 'Disetujui'), ('ditolak', 'Ditolak')]

    barang = models.ForeignKey(LogistikBarang, on_delete=models.PROTECT, related_name='permintaan_logistik')
    tanggal = models.DateField(default=timezone.localdate)
    ruang = models.CharField(max_length=120)
    qty_minta = models.PositiveIntegerField()
    qty_setuju = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='menunggu')
    catatan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_permintaan_created')
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_permintaan_verified')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'logistik_permintaan'
        ordering = ['-tanggal', '-created_at']


class LogistikOpname(models.Model):
    barang = models.ForeignKey(LogistikBarang, on_delete=models.PROTECT, related_name='opname_logistik')
    tanggal = models.DateField(default=timezone.localdate)
    real_stock = models.IntegerField()
    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_opname_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'logistik_opname'
        ordering = ['-tanggal', '-created_at']
