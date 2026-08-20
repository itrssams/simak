from django.db import connection, models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

class Kendaraan(models.Model):
    JENIS_CHOICES = [
        ('mobil',    'Mobil'),
        ('motor',    'Motor'),
        ('ambulans', 'Ambulans'),
        ('pickup',   'Pickup'),
        ('bus',      'Bus'),
        ('lainnya',  'Lainnya'),
    ]

    plat_nomor  = models.CharField(max_length=20, unique=True)
    nama        = models.CharField(max_length=100, help_text='Contoh: Avanza Putih, Ambulans 1')
    jenis       = models.CharField(max_length=20, choices=JENIS_CHOICES, default='mobil')
    is_active   = models.BooleanField(default=True)
    keterangan  = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_kendaraan'
        ordering     = ['jenis', 'nama']
        verbose_name = 'Kendaraan'
        verbose_name_plural = 'Daftar Kendaraan'

    def __str__(self):
        return f"{self.plat_nomor} - {self.nama} ({self.get_jenis_display()})"

def foto_perjalanan_path(instance, filename):
    return f'driver/perjalanan/{instance.driver.username}/{filename}'

def foto_bbm_path(instance, filename):
    return f'driver/bbm/{instance.driver.username}/{filename}'

def foto_maintenance_path(instance, filename):
        return f'driver/maintenance/{instance.kendaraan.plat_nomor}/{filename}'


class LogPerjalanan(models.Model):
    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('disetujui',  'Disetujui'),
        ('ditolak',    'Ditolak'),
        ('dilaporkan', 'Dilaporkan'),
        ('selesai',    'Selesai'),
    ]

    no_perjalanan = models.CharField(max_length=25, unique=True, editable=False, blank=True)
    driver      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='log_perjalanan')
    kendaraan   = models.ForeignKey(Kendaraan, on_delete=models.PROTECT, related_name='log_perjalanan')
    tanggal     = models.DateField()
    jam_berangkat = models.TimeField()
    jam_kembali   = models.TimeField(null=True, blank=True)
    tujuan      = models.CharField(max_length=255)
    km_awal     = models.PositiveIntegerField(help_text='KM odometer saat berangkat')
    km_akhir    = models.PositiveIntegerField(null=True, blank=True, help_text='KM odometer saat kembali')
    jarak_km    = models.PositiveIntegerField(null=True, blank=True, help_text='Otomatis dihitung')
    penumpang   = models.CharField(max_length=255, blank=True, help_text='Nama penumpang jika ada')
    keterangan  = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    catatan_tolak = models.TextField(blank=True)
    disetujui_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approval_log_perjalanan')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_log_perjalanan'
        ordering     = ['-tanggal', '-jam_berangkat']
        verbose_name = 'Log Perjalanan'
        verbose_name_plural = 'Log Perjalanan'

    def save(self, *args, **kwargs):
        if self.km_akhir and self.km_awal:
            if self.km_akhir < self.km_awal:
                raise ValidationError('KM akhir tidak boleh lebih kecil dari KM awal.')
            self.jarak_km = self.km_akhir - self.km_awal
        if not self.no_perjalanan:
            from datetime import date
            today  = date.today()
            prefix = f"LP-{today.strftime('%Y%m')}-"
            last   = LogPerjalanan.objects.filter(no_perjalanan__startswith=prefix).order_by('no_perjalanan').last()
            if last:
                last_num = int(last.no_perjalanan.split('-')[-1])
                self.no_perjalanan = f"{prefix}{str(last_num + 1).zfill(3)}"
            else:
                self.no_perjalanan = f"{prefix}001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_perjalanan} | {self.driver.username} | {self.tanggal}"

class LaporanPerjalanan(models.Model):
    log_perjalanan = models.OneToOneField(LogPerjalanan, on_delete=models.CASCADE, related_name='laporan')
    tanggal_laporan = models.DateField()
    deskripsi     = models.TextField(help_text='Deskripsi perjalanan dan aktivitas')
    tujuan_tercapai = models.BooleanField(default=True)
    keterangan    = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_laporan_perjalanan'
        verbose_name = 'Laporan Perjalanan'
        verbose_name_plural = 'Laporan Perjalanan'

    def __str__(self):
        return f"Laporan {self.log_perjalanan.no_perjalanan}"

def foto_laporan_perjalanan_path(instance, filename):
    return f'driver/perjalanan/{instance.laporan.log_perjalanan.no_perjalanan}/{filename}'

class FotoLaporanPerjalanan(models.Model):
    laporan = models.ForeignKey(LaporanPerjalanan, on_delete=models.CASCADE, related_name='foto')
    foto    = models.ImageField(upload_to=foto_laporan_perjalanan_path)
    urutan  = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'driver_foto_laporan'
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Laporan Perjalanan'
        verbose_name_plural = 'Foto Laporan Perjalanan'

    def __str__(self):
        return f"Foto {self.urutan} - {self.laporan.log_perjalanan.no_perjalanan}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save
        if self.foto:
            from .utils_image import compress_image
            compress_image(self.foto, max_width=1920, max_height=1920, quality=75)

        super().save(*args, **kwargs)

class LogBBM(models.Model):
    driver      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='log_bbm')
    kendaraan   = models.ForeignKey(Kendaraan, on_delete=models.PROTECT, related_name='log_bbm')
    tanggal     = models.DateField()
    total_biaya = models.DecimalField(max_digits=12, decimal_places=2)
    km_saat_isi = models.PositiveIntegerField(null=True, blank=True, help_text='KM odometer saat isi BBM')
    keterangan  = models.TextField(blank=True)
    foto        = models.ImageField(upload_to=foto_bbm_path, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'driver_log_bbm'
        ordering     = ['-tanggal', '-created_at']
        verbose_name = 'Log BBM'
        verbose_name_plural = 'Log BBM'

    def __str__(self):
        return f"{self.driver.username} | {self.tanggal} | {self.kendaraan.plat_nomor} | Rp {self.total_biaya:,.0f}"

class LogMaintenance(models.Model):
    JENIS_CHOICES = [
        ('servis_rutin', 'Servis Rutin'),
        ('ganti_oli',    'Ganti Oli'),
        ('ban',          'Ganti / Tambal Ban'),
        ('aki',          'Ganti Aki'),
        ('rem',          'Perbaikan Rem'),
        ('ac',           'Servis AC'),
        ('body',         'Perbaikan Body'),
        ('lainnya',      'Lainnya'),
    ]

    kendaraan   = models.ForeignKey(Kendaraan, on_delete=models.PROTECT, related_name='log_maintenance')
    dilaporkan_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='log_maintenance')
    jenis       = models.CharField(max_length=30, choices=JENIS_CHOICES)
    tanggal     = models.DateField()
    biaya       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deskripsi   = models.TextField(blank=True)
    foto        = models.ImageField(upload_to=foto_maintenance_path, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'driver_log_maintenance'
        ordering     = ['-tanggal', '-created_at']
        verbose_name = 'Log Maintenance'
        verbose_name_plural = 'Log Maintenance'

    def __str__(self):
        return f"{self.kendaraan.plat_nomor} | {self.get_jenis_display()} | {self.tanggal}"