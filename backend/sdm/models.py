from django.db import models
from django.conf import settings
from django.utils import timezone


class IzinKeluar(models.Model):
    KATEGORI_CHOICES = [
        ('dinas', 'Dinas Luar'),
        ('pribadi', 'Urusan Pribadi'),
        ('sakit', 'Sakit / Berobat'),
    ]

    STATUS_CHOICES = [
        ('berjalan', 'Sedang di Luar'),
        ('selesai', 'Sudah Kembali'),
        ('dibatalkan', 'Dibatalkan'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='izin_keluar_list'
    )
    tanggal = models.DateField(default=timezone.now)
    kategori = models.CharField(max_length=20, choices=KATEGORI_CHOICES, default='dinas')
    keperluan = models.TextField()

    # Rencana awal (tidak pernah berubah setelah dibuat untuk jejak audit)
    jam_keluar_awal = models.TimeField()
    jam_kembali_awal = models.TimeField()

    # Waktu aktif (dapat disesuaikan jika ada kendala di lapangan)
    jam_keluar = models.TimeField()
    jam_kembali = models.TimeField()

    # Waktu aktual saat karyawan menekan konfirmasi "Sudah Kembali"
    jam_kembali_aktual = models.TimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='berjalan')
    is_adjusted = models.BooleanField(default=False)
    catatan_kembali = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Izin Meninggalkan Tempat Kerja'
        verbose_name_plural = 'Daftar Izin Meninggalkan Tempat Kerja'

    def __str__(self):
        return f"Izin {self.user.username} - {self.tanggal} ({self.get_kategori_display()})"


class IzinKeluarLog(models.Model):
    izin = models.ForeignKey(
        IzinKeluar,
        on_delete=models.CASCADE,
        related_name='logs'
    )
    jam_keluar_sebelum = models.TimeField()
    jam_kembali_sebelum = models.TimeField()
    jam_keluar_sesudah = models.TimeField()
    jam_kembali_sesudah = models.TimeField()
    alasan_penyesuaian = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Log Penyesuaian Izin Keluar'
        verbose_name_plural = 'Log Penyesuaian Izin Keluar'

    def __str__(self):
        return f"Log #{self.id} for Izin #{self.izin_id} at {self.created_at}"
