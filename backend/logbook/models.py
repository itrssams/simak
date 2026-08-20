from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime, date


class Logbook(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='logbooks',
        verbose_name='Pegawai / Pengguna'
    )
    tanggal = models.DateField(default=timezone.now, verbose_name='Tanggal Pekerjaan')
    jam_mulai = models.TimeField(verbose_name='Jam Mulai')
    jam_selesai = models.TimeField(verbose_name='Jam Selesai')
    deskripsi = models.TextField(verbose_name='Uraian / Deskripsi Pekerjaan')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'logbook_harian'
        ordering = ['-tanggal', '-jam_mulai', '-created_at']
        verbose_name = 'Logbook Harian'
        verbose_name_plural = 'Logbook Harian'
        indexes = [
            models.Index(fields=['-tanggal', 'user']),
            models.Index(fields=['tanggal']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.tanggal} ({self.jam_mulai.strftime('%H:%M')}-{self.jam_selesai.strftime('%H:%M')})"

    @property
    def durasi_menit(self):
        if not self.jam_mulai or not self.jam_selesai:
            return 0
        dummy_date = date(2000, 1, 1)
        dt_start = datetime.combine(dummy_date, self.jam_mulai)
        dt_end = datetime.combine(dummy_date, self.jam_selesai)
        diff = (dt_end - dt_start).total_seconds()
        if diff < 0:
            # Lewat tengah malam
            diff += 86400
        return int(diff // 60)

    @property
    def durasi_format(self):
        menit = self.durasi_menit
        if menit <= 0:
            return '0 mnt'
        jam = menit // 60
        sisa_menit = menit % 60
        if jam > 0 and sisa_menit > 0:
            return f"{jam} jam {sisa_menit} mnt"
        elif jam > 0:
            return f"{jam} jam"
        else:
            return f"{sisa_menit} mnt"
