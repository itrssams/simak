from django.db import models
from django.conf import settings


class Gudang(models.Model):
    kode = models.CharField(max_length=30, unique=True)
    nama = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_gudang'
        ordering = ['kode']

    def __str__(self):
        return f"{self.kode} - {self.nama}"

    @classmethod
    def get_default(cls):
        g, _ = cls.objects.get_or_create(
            kode='GUDANG-UMUM',
            defaults={'nama': 'Gudang Logistik Umum', 'is_default': True}
        )
        return g


class GolonganBarang(models.Model):
    kode = models.CharField(max_length=20, unique=True)
    nama = models.CharField(max_length=100)
    prefix_kode = models.CharField(max_length=10, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_golongan'
        ordering = ['kode']

    def __str__(self):
        return f"{self.kode} - {self.nama}"


class Satuan(models.Model):
    kode = models.CharField(max_length=30, unique=True)
    nama = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_satuan'
        ordering = ['kode']

    def save(self, *args, **kwargs):
        self.kode = str(self.kode or '').strip().upper()
        if not self.nama:
            self.nama = self.kode
        super().save(*args, **kwargs)

    def __str__(self):
        return self.kode


class Barang(models.Model):
    kode = models.CharField(max_length=50, unique=True, blank=True)
    nama = models.CharField(max_length=160)
    golongan = models.ForeignKey(GolonganBarang, on_delete=models.PROTECT, related_name='barang')
    satuan_dasar = models.ForeignKey(Satuan, on_delete=models.PROTECT, related_name='barang_satuan_dasar')
    merk = models.CharField(max_length=100, blank=True)
    stok_minimum = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    stok_maksimum = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    lead_time_hari = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    legacy_id_brg = models.PositiveIntegerField(null=True, blank=True, unique=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='gdg_barang_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_barang'
        ordering = ['nama']
        indexes = [
            models.Index(fields=['nama'], name='gdg_brg_nama_idx'),
            models.Index(fields=['is_active', 'golongan'], name='gdg_brg_act_gol_idx'),
        ]

    def save(self, *args, **kwargs):
        self.nama = str(self.nama or '').strip().upper()
        self.merk = str(self.merk or '').strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.kode}] {self.nama}"


class BarangKemasan(models.Model):
    barang = models.ForeignKey(Barang, on_delete=models.CASCADE, related_name='kemasan_list')
    nama_kemasan = models.CharField(max_length=50)
    isi_per_kemasan = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    is_default_beli = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gdg_barang_kemasan'
        unique_together = ('barang', 'nama_kemasan')

    def save(self, *args, **kwargs):
        self.nama_kemasan = str(self.nama_kemasan or '').strip().upper()
        if self.isi_per_kemasan <= 0:
            raise ValueError("Isi per kemasan harus lebih dari 0")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.barang.nama} - {self.nama_kemasan} (isi {self.isi_per_kemasan})"


class Ruang(models.Model):
    kode = models.CharField(max_length=30, unique=True)
    nama = models.CharField(max_length=120)
    unit = models.ForeignKey('users.Unit', on_delete=models.SET_NULL, null=True, blank=True, related_name='ruang_gudang')
    legacy_id_ruang = models.PositiveIntegerField(null=True, blank=True, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_ruang'
        ordering = ['nama']

    def __str__(self):
        return self.nama


class Vendor(models.Model):
    kode = models.CharField(max_length=50, blank=True, null=True, unique=True, db_index=True)
    nama = models.CharField(max_length=150, db_index=True)
    kategori = models.CharField(max_length=100, default='UMUM', blank=True, db_index=True)
    kontak_person = models.CharField(max_length=100, blank=True, verbose_name="Kontak Person / PIC")
    telepon = models.CharField(max_length=50, blank=True)
    email = models.EmailField(max_length=100, blank=True)
    alamat = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    legacy_id_rekanan = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gdg_vendor_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gdg_vendor'
        ordering = ['nama']
        indexes = [
            models.Index(fields=['nama'], name='gdg_vnd_nama_idx'),
            models.Index(fields=['is_active', 'kategori'], name='gdg_vnd_act_kat_idx'),
        ]

    def save(self, *args, **kwargs):
        self.nama = str(self.nama or '').strip().upper()
        if self.kategori:
            self.kategori = str(self.kategori).strip().upper()
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new and not self.kode:
            self.kode = f"VND-{self.id:04d}"
            Vendor.objects.filter(pk=self.pk).update(kode=self.kode)

    def __str__(self):
        return f"[{self.kode or self.id}] {self.nama}"

