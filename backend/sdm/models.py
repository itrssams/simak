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
        ('menunggu_approval', 'Menunggu Persetujuan'),
        ('disetujui',         'Disetujui'),
        ('ditolak',           'Ditolak'),
        ('berjalan',          'Sedang di Luar'),
        ('selesai',           'Sudah Kembali'),
        ('dibatalkan',        'Dibatalkan'),
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

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='menunggu_approval')
    is_adjusted = models.BooleanField(default=False)
    catatan_kembali = models.TextField(blank=True, default='')

    # Approval atasan (Single Approval)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='izin_keluar_disetujui'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    catatan_approval = models.TextField(blank=True, default='')

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


# ==============================================================================
# MODEL INTEGRASI MESIN ABSENSI (ZKTeco / Secure S-IPC) & PRESENSI PEGAWAI
# ==============================================================================

class MesinAbsen(models.Model):
    STATUS_KONEKSI_CHOICES = [
        ('connected',    'Terhubung (Online)'),
        ('disconnected', 'Terputus (Offline)'),
        ('error',        'Error Koneksi'),
    ]

    nama = models.CharField(max_length=100, default='Mesin Absen Utama (S-IPC)')
    ip_address = models.CharField(max_length=50, default='192.168.44.120')
    port = models.IntegerField(default=4370)
    comm_key = models.IntegerField(default=0, help_text='Password komunikasi (0 jika default)')
    serial_number = models.CharField(max_length=100, blank=True, default='')
    device_name = models.CharField(max_length=100, blank=True, default='')
    mac_address = models.CharField(max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True)
    status_koneksi = models.CharField(max_length=20, choices=STATUS_KONEKSI_CHOICES, default='disconnected')
    total_user_mesin = models.IntegerField(default=0)
    total_log_mesin = models.IntegerField(default=0)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Mesin Absen'
        verbose_name_plural = 'Daftar Mesin Absen'

    def __str__(self):
        return f"{self.nama} ({self.ip_address}:{self.port})"


class KaryawanMesinMapping(models.Model):
    """
    Menghubungkan nomor PIN / Enroll ID di mesin absen dengan akun User SIMAK.
    """
    mesin = models.ForeignKey(MesinAbsen, on_delete=models.CASCADE, related_name='mappings', null=True, blank=True)
    pin = models.CharField(max_length=50, db_index=True)
    nama_di_mesin = models.CharField(max_length=100, blank=True, default='')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mesin_absen_mappings'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['pin']
        unique_together = [('mesin', 'pin')]
        verbose_name = 'Mapping Karyawan Mesin'
        verbose_name_plural = 'Daftar Mapping Karyawan Mesin'

    def __str__(self):
        user_str = self.user.get_full_name() if self.user else 'Belum Dipasangkan'
        return f"PIN {self.pin} ({self.nama_di_mesin}) -> {user_str}"


class LogPresensi(models.Model):
    """
    Log mentah (raw punch records) dari mesin absensi.
    Diproteksi unik per (pin, waktu) agar tidak terjadi duplikasi rekaman saat sync berkala.
    """
    mesin = models.ForeignKey(MesinAbsen, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs')
    pin = models.CharField(max_length=50, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='presensi_logs'
    )
    waktu = models.DateTimeField(db_index=True)
    status_verifikasi = models.IntegerField(default=1, help_text='1: Fingerprint, 0: Password, 2: Kartu')
    tipe_punch = models.IntegerField(default=0, help_text='0: Masuk, 1: Pulang, 4: Lembur Masuk, 5: Lembur Pulang')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-waktu']
        unique_together = [('pin', 'waktu')]
        verbose_name = 'Log Presensi Mesin'
        verbose_name_plural = 'Daftar Log Presensi Mesin'

    def __str__(self):
        return f"Tap PIN {self.pin} at {self.waktu}"


class PresensiHarian(models.Model):
    """
    Agregasi presensi harian per user untuk kemudahan rekapitulasi SDM & Direksi.
    """
    STATUS_CHOICES = [
        ('hadir',         'Hadir Tepat Waktu'),
        ('terlambat',     'Terlambat'),
        ('pulang_cepat',  'Pulang Cepat'),
        ('izin_keluar',   'Izin Keluar'),
        ('tidak_hadir',   'Tidak Hadir / Alfa'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='presensi_harian_list'
    )
    tanggal = models.DateField(db_index=True)
    jam_masuk = models.TimeField(null=True, blank=True)
    jam_pulang = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='hadir')
    menit_keterlambatan = models.IntegerField(default=0)
    menit_pulang_cepat = models.IntegerField(default=0)
    total_jam_kerja = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    izin_keluar = models.ForeignKey(
        IzinKeluar,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='presensi_terkait'
    )
    catatan = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', 'user__first_name']
        unique_together = [('user', 'tanggal')]
        verbose_name = 'Presensi Harian'
        verbose_name_plural = 'Daftar Presensi Harian'

    def __str__(self):
        return f"Presensi {self.user.username} - {self.tanggal} ({self.get_status_display()})"

