from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime, date


class UraianTugas(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='uraian_tugas_list'
    )
    deskripsi = models.TextField(verbose_name='Uraian Tugas / Job Description')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'logbook_uraian_tugas'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.deskripsi[:50]}"


class Logbook(models.Model):
    STATUS_CHOICES = [
        ('perlu_verifikasi', 'Perlu Verifikasi'),
        ('disetujui', 'Disetujui'),
        ('ditolak', 'Ditolak'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='logbooks',
        verbose_name='Pegawai / Pengguna'
    )
    tanggal = models.DateField(default=timezone.now, verbose_name='Tanggal Pekerjaan')
    jam_mulai = models.TimeField(verbose_name='Jam Mulai')
    jam_selesai = models.TimeField(verbose_name='Jam Selesai')
    
    # E-Logbook style fields
    uraian_tugas = models.ForeignKey(
        UraianTugas, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='logbooks'
    )
    nama_aktivitas = models.CharField(max_length=300, blank=True, verbose_name='Nama Aktivitas')
    deskripsi = models.TextField(verbose_name='Uraian / Deskripsi Pekerjaan')
    nilai_output = models.IntegerField(default=0, verbose_name='Nilai Output')
    satuan_output = models.CharField(max_length=100, blank=True, verbose_name='Satuan Output')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='perlu_verifikasi')
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='verified_logbooks'
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    catatan_verifikasi = models.TextField(blank=True, verbose_name='Catatan Verifikasi')

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


class Task(models.Model):
    STATUS_CHOICES = [
        ('on_progress', 'On Progress'),
        ('on_hold',     'On Hold'),
        ('done',        'Done'),
    ]
    
    no_task      = models.CharField(max_length=25, unique=True, editable=False)
    user         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tasks')
    judul        = models.CharField(max_length=200)
    deskripsi    = models.TextField(blank=True)
    status       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='on_progress')
    started_at   = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    total_menit_kerja  = models.IntegerField(default=0)
    total_menit_lembur = models.IntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'logbook_task'
        ordering = ['-updated_at', '-created_at']

    def save(self, *args, **kwargs):
        if not self.no_task:
            today_str = timezone.now().strftime('%Y%m')
            last_task = Task.objects.filter(no_task__startswith=f'TK-{today_str}').order_by('-no_task').first()
            if last_task:
                last_num = int(last_task.no_task.split('-')[-1])
                new_num = last_num + 1
            else:
                new_num = 1
            self.no_task = f'TK-{today_str}-{new_num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_task} - {self.judul}"


class SesiKerja(models.Model):
    task         = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='sesi_list')
    mulai        = models.DateTimeField()
    selesai      = models.DateTimeField(null=True, blank=True)
    durasi_kerja  = models.IntegerField(default=0, help_text='Menit dalam jam kerja')
    durasi_lembur = models.IntegerField(default=0, help_text='Menit di luar jam kerja')
    created_at   = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'logbook_sesi_kerja'
        ordering = ['mulai']

    def __str__(self):
        return f"Sesi {self.task.no_task} ({self.mulai.strftime('%Y-%m-%d %H:%M')})"
