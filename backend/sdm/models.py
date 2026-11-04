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
# MODEL MASTER PEGAWAI & PROFIL KEPEGAWAIAN RS
# ==============================================================================

class Pegawai(models.Model):
    """
    Direktori master seluruh pegawai RS Siaga Al Munawwaroh (150+ pegawai).
    Menghubungkan identitas fisik (PIN mesin absen) dengan unit kerja, jabatan,
    kategori shift, dan akun login SIMAK (jika ada).
    """
    KATEGORI_CHOICES = [
        ('SHIFT', 'Shift (Nakes / Medis / Pelayanan)'),
        ('NON_SHIFT', 'Non-Shift (Manajemen / Kantor)'),
        ('CS', 'Cleaning Service'),
        ('SECURITY_DRIVER', 'Security & Driver'),
        ('MITRA', 'Mitra Kerja / Kerohanian'),
    ]

    STATUS_KEPEGAWAIAN_CHOICES = [
        ('tetap', 'Pegawai Tetap'),
        ('kontrak', 'Pegawai Kontrak'),
        ('mitra', 'Mitra / Outsourcing'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='profil_pegawai',
        help_text='Akun login SIMAK (opsional, jika pegawai memiliki hak akses sistem)'
    )
    nama = models.CharField(max_length=150, db_index=True)
    nik = models.CharField(max_length=50, blank=True, default='')
    pin = models.CharField(max_length=50, unique=True, db_index=True, help_text='PIN / ID Enroll pada Mesin Absen')
    jabatan = models.CharField(max_length=100, blank=True, default='')
    unit_kerja = models.CharField(max_length=100, blank=True, default='')
    kategori = models.CharField(max_length=30, choices=KATEGORI_CHOICES, default='SHIFT')
    status_kepegawaian = models.CharField(max_length=20, choices=STATUS_KEPEGAWAIAN_CHOICES, default='kontrak')
    no_telepon = models.CharField(max_length=30, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Pegawai RS'
        verbose_name_plural = 'Daftar Pegawai RS'

    def __str__(self):
        return f"{self.nama} (PIN: {self.pin}) - {self.unit_kerja or self.jabatan}"


# ==============================================================================
# MODEL MASTER SHIFT & POLA JAM KERJA RS
# ==============================================================================

class Shift(models.Model):
    """
    Master Shift dan pola jam kerja seluruh profesi di RS Siaga Al Munawwaroh.
    Mendukung shift medis/nakes, non-shift kantor/direksi, cleaning service,
    security & driver, serta status libur/cuti/izin.
    """
    KELOMPOK_CHOICES = [
        ('UMUM', 'Umum / Medis / Pelayanan / Kantor'),
        ('CS', 'Cleaning Service (CS)'),
        ('SECURITY_DRIVER', 'Security & Driver'),
        ('MITRA', 'Mitra Kerohanian'),
    ]

    kode = models.CharField(max_length=20, db_index=True, help_text='Kode Shift, misal: P, P1, P2, S, M, L, CT')
    nama = models.CharField(max_length=100, help_text='Nama Shift, misal: Pagi Shift (07:30 - 14:30)')
    kelompok = models.CharField(max_length=30, choices=KELOMPOK_CHOICES, default='UMUM')
    
    jam_masuk = models.TimeField(null=True, blank=True, help_text='Jam masuk shift (kosong jika libur/cuti)')
    jam_pulang = models.TimeField(null=True, blank=True, help_text='Jam pulang shift (kosong jika libur/cuti)')
    batas_tepat_waktu = models.TimeField(
        null=True,
        blank=True,
        help_text='Batas absolut tap masuk agar tetap dianggap tepat waktu sesuai rumus Excel (jika kosong gunakan jam_masuk + toleransi)'
    )
    
    is_overnight = models.BooleanField(
        default=False,
        help_text='True jika shift lintas hari (misal Malam 21:30 - 07:30 keesokan harinya)'
    )
    is_libur = models.BooleanField(
        default=False,
        help_text='True untuk Libur (L), Cuti (CT), Sakit (SA), Izin (I)'
    )
    
    toleransi_terlambat_menit = models.IntegerField(
        default=0,
        help_text='Toleransi menit keterlambatan sebelum dianggap terlambat (misal toleransi 1 menit atau 15 menit)'
    )
    toleransi_pulang_cepat_menit = models.IntegerField(
        default=0,
        help_text='Toleransi menit pulang awal yang diperbolehkan'
    )
    
    warna = models.CharField(
        max_length=20,
        default='#10b981',
        help_text='Kode warna hex untuk badge di kalender roster (misal #10b981)'
    )
    keterangan = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    urutan = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['kelompok', 'urutan', 'kode']
        unique_together = [('kelompok', 'kode')]
        verbose_name = 'Master Shift'
        verbose_name_plural = 'Daftar Master Shift'

    def __str__(self):
        if self.is_libur:
            return f"[{self.kode}] {self.nama} ({self.get_kelompok_display()})"
        return f"[{self.kode}] {self.nama} ({self.jam_masuk} - {self.jam_pulang}) - {self.get_kelompok_display()}"


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
    Menghubungkan nomor PIN / Enroll ID di mesin absen dengan akun Pegawai RS dan/atau User SIMAK.
    """
    mesin = models.ForeignKey(MesinAbsen, on_delete=models.CASCADE, related_name='mappings', null=True, blank=True)
    pin = models.CharField(max_length=50, db_index=True)
    nama_di_mesin = models.CharField(max_length=100, blank=True, default='')
    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mesin_mappings',
        help_text='Profil master Pegawai RS yang memiliki PIN ini'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mesin_absen_mappings',
        help_text='Akun login SIMAK (jika pegawai sudah memiliki akun login)'
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
        target_str = self.pegawai.nama if self.pegawai else (self.user.get_full_name() if self.user else 'Belum Dipasangkan')
        return f"PIN {self.pin} ({self.nama_di_mesin}) -> {target_str}"


class LogPresensi(models.Model):
    """
    Log mentah (raw punch records) dari mesin absensi.
    Diproteksi unik per (pin, waktu) agar tidak terjadi duplikasi rekaman saat sync berkala.
    """
    mesin = models.ForeignKey(MesinAbsen, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs')
    pin = models.CharField(max_length=50, db_index=True)
    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='presensi_logs'
    )
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
        nama = self.pegawai.nama if self.pegawai else f"PIN {self.pin}"
        return f"Tap {nama} at {self.waktu}"


class PresensiHarian(models.Model):
    """
    Agregasi presensi harian per pegawai untuk kemudahan rekapitulasi SDM & Direksi.
    """
    STATUS_CHOICES = [
        ('hadir',         'Hadir Tepat Waktu'),
        ('terlambat',     'Terlambat'),
        ('pulang_cepat',  'Pulang Cepat'),
        ('tidak_hadir',   'Tidak Hadir / Belum Tap'),
        ('libur',         'Libur / Off Duty'),
        ('cuti',          'Cuti'),
        ('sakit',         'Sakit'),
        ('izin',          'Izin'),
        ('izin_keluar',   'Izin Keluar (IMTK)'),
    ]

    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='presensi_harian_list'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='presensi_harian_list'
    )
    shift = models.ForeignKey(
        'Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='presensi_harian_list'
    )
    jadwal_dinas = models.ForeignKey(
        'JadwalDinas',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
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
        ordering = ['-tanggal', 'pegawai__nama']
        verbose_name = 'Presensi Harian'
        verbose_name_plural = 'Daftar Presensi Harian'

    def __str__(self):
        nama = self.pegawai.nama if self.pegawai else (self.user.username if self.user else '-')
        return f"Presensi {nama} - {self.tanggal} ({self.get_status_display()})"


class JadwalMaster(models.Model):
    """
    Jadwal Dinas Dasar (Master) Bulanan yang disusun oleh SDM.
    Menjadi sumber dasar (sheet MASTER) sebelum diterapkan koreksi / tukar shift.
    """
    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        related_name='jadwal_master_list'
    )
    tanggal = models.DateField(db_index=True)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name='jadwal_master_list'
    )
    catatan = models.CharField(max_length=200, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jadwal_master_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tanggal', 'pegawai__nama']
        unique_together = [('pegawai', 'tanggal')]
        verbose_name = 'Jadwal Master'
        verbose_name_plural = 'Roster Jadwal Master'

    def __str__(self):
        return f"Master {self.pegawai.nama} - {self.tanggal} ({self.shift.kode})"


class JadwalKoreksi(models.Model):
    """
    Tabel koreksi jadwal dinas per sel (pegawai + tanggal), setara sheet 'TUKAR SHIF' di Excel.
    Menyimpan perubahan dari tukar shift, izin, sakit, cuti, maupun koreksi manual SDM.
    """
    JENIS_CHOICES = [
        ('tukar_shift', 'Tukar Shift'),
        ('tukar_hari',  'Tukar Hari'),
        ('ganti_jaga',  'Ganti Jaga'),
        ('izin',        'Izin'),
        ('sakit',       'Sakit'),
        ('cuti',        'Cuti'),
        ('manual',      'Koreksi Manual'),
    ]

    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        related_name='jadwal_koreksi_list'
    )
    tanggal = models.DateField(db_index=True)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name='jadwal_koreksi_list'
    )
    jenis = models.CharField(max_length=30, choices=JENIS_CHOICES, default='tukar_shift')
    tukar = models.ForeignKey(
        'TukarDinas',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='koreksi_list'
    )
    alasan = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jadwal_koreksi_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', 'pegawai__nama']
        unique_together = [('pegawai', 'tanggal')]
        verbose_name = 'Jadwal Koreksi'
        verbose_name_plural = 'Daftar Koreksi Jadwal Dinas'

    def __str__(self):
        return f"Koreksi {self.pegawai.nama} - {self.tanggal} -> {self.shift.kode} ({self.get_jenis_display()})"


class JadwalDinas(models.Model):
    """
    Roster / Jadwal Dinas Bulanan Karyawan Rumah Sakit (Final / Efektif).
    Merupakan hasil perhitungan otomatis dari JadwalMaster + JadwalKoreksi.
    """
    SUMBER_CHOICES = [
        ('master',  'Jadwal Master'),
        ('koreksi', 'Koreksi / Tukar Shift'),
    ]

    pegawai = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        related_name='jadwal_dinas_list'
    )
    tanggal = models.DateField(db_index=True)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name='jadwal_list'
    )
    shift_master = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jadwal_dinas_master_ref',
        help_text='Shift dasar pada JadwalMaster sebelum dikoreksi'
    )
    sumber = models.CharField(
        max_length=20,
        choices=SUMBER_CHOICES,
        default='master',
        db_index=True
    )
    koreksi = models.ForeignKey(
        JadwalKoreksi,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jadwal_dinas_final'
    )
    catatan = models.CharField(max_length=200, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jadwal_dinas_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tanggal', 'pegawai__nama']
        unique_together = [('pegawai', 'tanggal')]
        verbose_name = 'Jadwal Dinas'
        verbose_name_plural = 'Roster Jadwal Dinas'

    def __str__(self):
        return f"{self.pegawai.nama} - {self.tanggal} ({self.shift.kode})"


class TukarDinas(models.Model):
    """
    Model Pengajuan & Verifikasi Tukar Dinas Staf (Shift Swap).
    Mendukung pertukaran shift antar dua pegawai dalam satu tanggal atau lintas tanggal.
    """
    STATUS_CHOICES = [
        ('menunggu_rekan',   'Menunggu Persetujuan Rekan'),
        ('menunggu_atasan',  'Menunggu Verifikasi Karu / SDM'),
        ('disetujui',        'Disetujui'),
        ('ditolak',          'Ditolak'),
        ('dibatalkan',       'Dibatalkan'),
    ]

    JENIS_CHOICES = [
        ('tukar_shift', 'Tukar Shift (Tanggal Sama)'),
        ('tukar_hari',  'Tukar Hari Dinas (Lintas Tanggal)'),
        ('ganti_jaga',  'Ganti Jaga / Pengganti Tunggal'),
    ]

    # Pemohon (Pegawai 1)
    pemohon = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        related_name='tukar_dinas_diajukan'
    )
    tanggal_pemohon = models.DateField(db_index=True)
    shift_asal_pemohon = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name='tukar_dinas_asal_pemohon'
    )
    shift_tujuan_pemohon = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name='tukar_dinas_tujuan_pemohon'
    )

    # Rekan Pengganti (Pegawai 2)
    pengganti = models.ForeignKey(
        Pegawai,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='tukar_dinas_diterima'
    )
    tanggal_pengganti = models.DateField(null=True, blank=True)
    shift_asal_pengganti = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='tukar_dinas_asal_pengganti'
    )
    shift_tujuan_pengganti = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='tukar_dinas_tujuan_pengganti'
    )

    jenis = models.CharField(max_length=30, choices=JENIS_CHOICES, default='tukar_shift')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='menunggu_atasan')
    alasan = models.TextField(help_text='Alasan tukar dinas', blank=True, default='')

    # Approval tracking
    disetujui_rekan = models.BooleanField(default=True)
    rekan_disetujui_at = models.DateTimeField(null=True, blank=True)

    disetujui_oleh = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tukar_dinas_disetujui'
    )
    disetujui_at = models.DateTimeField(null=True, blank=True)
    catatan_atasan = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal_pemohon', '-created_at']
        verbose_name = 'Tukar Dinas'
        verbose_name_plural = 'Pengajuan Tukar Dinas'

    def __str__(self):
        pengganti_nama = self.pengganti.nama if self.pengganti else '-'
        return f"Tukar Dinas {self.pemohon.nama} ↔ {pengganti_nama} ({self.tanggal_pemohon})"



