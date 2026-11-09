from django.db import models
from django.conf import settings
from django.utils import timezone


def foto_aset_path(instance, filename):
    kode = instance.kode_aset.replace('.', '_') if instance.kode_aset else 'draft'
    ext = filename.split('.')[-1]
    return f'aset/foto/{kode}_{timezone.now().strftime("%Y%m%d%H%M%S")}.{ext}'


def foto_riwayat_path(instance, filename):
    ext = filename.split('.')[-1]
    return f'aset/riwayat/{timezone.now().strftime("%Y%m")}_{timezone.now().strftime("%Y%m%d%H%M%S")}.{ext}'


def foto_perbaikan_path(instance, filename):
    ext = filename.split('.')[-1]
    kode = instance.aset.kode_aset.replace('.', '_') if (instance.aset and instance.aset.kode_aset) else 'pbk'
    return f'aset/perbaikan/{kode}_{timezone.now().strftime("%Y%m%d%H%M%S")}.{ext}'


class AsetKelompok(models.Model):
    """
    Klasifikasi Harta Berwujud berdasarkan PMK No. 72 Tahun 2023.
    """
    kode = models.CharField(max_length=20, unique=True)
    nama = models.CharField(max_length=100)
    masa_manfaat_tahun = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    masa_manfaat_bulan = models.PositiveIntegerField(default=0)
    tarif_garis_lurus = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # dalam persen, misal 25.00
    disusutkan = models.BooleanField(default=True)
    keterangan = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'aset_kelompok'
        ordering = ['sort_order', 'id']
        verbose_name = 'Kelas Aset (PMK 72/2023)'
        verbose_name_plural = 'Kelas Aset'

    def __str__(self):
        if self.disusutkan:
            return f'{self.nama} ({int(self.masa_manfaat_tahun)} Thn / {self.tarif_garis_lurus}%)'
        return f'{self.nama} (Tidak Disusutkan)'


class AsetKategori(models.Model):
    """
    Kategori besar aset rumah sakit (Alkes Medis, Elektronik, Furniture, IT, dll).
    """
    kode = models.CharField(max_length=10, unique=True)  # AM, PE, IT, FM, FU, PP, KD, TB, PL
    nama = models.CharField(max_length=120)
    keterangan = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'aset_kategori'
        ordering = ['sort_order', 'nama']
        verbose_name = 'Kategori Aset'
        verbose_name_plural = 'Kategori Aset'

    def __str__(self):
        return f'{self.kode} - {self.nama}'


class AsetJenis(models.Model):
    """
    Jenis barang spesifik (AC, TV, Dispenser, USG, Bed Pasien, PC, dll).
    Menentukan kelompok penyusutan PMK secara otomatis.
    """
    kategori = models.ForeignKey(AsetKategori, on_delete=models.PROTECT, related_name='jenis_list')
    kode = models.CharField(max_length=20, unique=True)  # AC, TV, DISP, KLK, MC, PENG, USG, BED, PC
    nama = models.CharField(max_length=120)
    kelompok_default = models.ForeignKey(AsetKelompok, on_delete=models.PROTECT, related_name='jenis_list', null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'aset_jenis'
        ordering = ['kategori__sort_order', 'sort_order', 'nama']
        verbose_name = 'Jenis Aset'
        verbose_name_plural = 'Jenis Aset'

    def __str__(self):
        return f'{self.nama} ({self.kode})'


class AsetRuangan(models.Model):
    """
    Master Ruangan / Lokasi fisik yang berada di bawah Unit tertentu.
    """
    nama = models.CharField(max_length=120)
    unit = models.ForeignKey('users.Unit', on_delete=models.CASCADE, related_name='aset_ruangan_list')
    lantai_gedung = models.CharField(max_length=80, blank=True, verbose_name='Lantai / Gedung')
    is_active = models.BooleanField(default=True)
    keterangan = models.TextField(blank=True)

    class Meta:
        db_table = 'aset_ruangan'
        ordering = ['unit__nama', 'nama']
        unique_together = ('unit', 'nama')
        verbose_name = 'Ruangan / Lokasi Aset'
        verbose_name_plural = 'Daftar Ruangan'

    def __str__(self):
        return f'{self.nama} [{self.unit.nama}]'


class Aset(models.Model):
    """
    Master Data Aset Fisik & Finansial.
    """
    STATUS_KELAYAKAN_CHOICES = [
        ('A', 'Sangat Layak (A) - 90-100%'),
        ('B', 'Layak (B) - 70-89%'),
        ('C', 'Cukup Layak (C) - 50-69%'),
        ('D', 'Kurang Layak (D) - 30-49%'),
        ('E', 'Tidak Layak (E) - <30%'),
    ]

    STATUS_ASET_CHOICES = [
        ('aktif', 'Aktif'),
        ('dalam_perbaikan', 'Dalam Perbaikan'),
        ('tidak_digunakan', 'Tidak Digunakan'),
        ('afkir', 'Afkir / Dihapuskan'),
        ('dijual', 'Dijual'),
        ('hilang', 'Hilang'),
    ]

    STATUS_DATA_CHOICES = [
        ('lengkap', 'Lengkap'),
        ('belum_lengkap', 'Data Belum Lengkap'),
    ]

    STATUS_KEPEMILIKAN_CHOICES = [
        ('milik_sendiri', 'Milik Sendiri'),
        ('sewa', 'Sewa'),
        ('pinjam_pakai', 'Pinjam Pakai'),
        ('hibah', 'Hibah'),
        ('kso', 'KSO / Kerjasama Operasional'),
    ]

    kode_aset = models.CharField(max_length=50, unique=True, db_index=True)
    jenis = models.ForeignKey(AsetJenis, on_delete=models.PROTECT, related_name='aset_list')
    deskripsi = models.CharField(max_length=255, verbose_name='Deskripsi / Nama Barang')
    merk = models.CharField(max_length=120, blank=True)
    spesifikasi = models.CharField(max_length=255, blank=True, verbose_name='Spesifikasi / Ukuran / Kapasitas')
    nomor_seri = models.CharField(max_length=120, blank=True, verbose_name='Nomor Seri / Rangka')
    nomor_registrasi = models.CharField(max_length=120, blank=True, verbose_name='Nomor Registrasi (Kemenkes / AKL / Unit)')
    perlu_kalibrasi = models.BooleanField(default=False, verbose_name='Perlu Kalibrasi Berkala')

    unit = models.ForeignKey('users.Unit', on_delete=models.PROTECT, related_name='aset_unit_list')
    ruangan = models.ForeignKey(AsetRuangan, on_delete=models.SET_NULL, null=True, blank=True, related_name='aset_list')
    lokasi_teks = models.CharField(max_length=180, blank=True, verbose_name='Lokasi / Ruangan')

    status_kelayakan = models.CharField(max_length=5, choices=STATUS_KELAYAKAN_CHOICES, default='A')
    status_aset = models.CharField(max_length=25, choices=STATUS_ASET_CHOICES, default='aktif')
    status_data = models.CharField(max_length=25, choices=STATUS_DATA_CHOICES, default='lengkap')
    status_kepemilikan = models.CharField(max_length=30, choices=STATUS_KEPEMILIKAN_CHOICES, default='milik_sendiri')

    tahun_pembuatan = models.PositiveIntegerField(null=True, blank=True)
    bulan_perolehan = models.DateField(null=True, blank=True, verbose_name='Bulan/Tahun Perolehan')
    harga_perolehan = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name='Harga Perolehan (Rp)')

    kelompok = models.ForeignKey(AsetKelompok, on_delete=models.PROTECT, related_name='aset_list', null=True, blank=True)
    masa_manfaat_bulan = models.PositiveIntegerField(default=0, verbose_name='Masa Manfaat (Bulan)')

    rekomendasi_tindakan = models.TextField(blank=True, verbose_name='Rekomendasi Tindakan')
    catatan = models.TextField(blank=True)
    foto = models.ImageField(upload_to=foto_aset_path, null=True, blank=True)
    foto_awal = models.ImageField(upload_to=foto_aset_path, null=True, blank=True, verbose_name='Foto Saat Registrasi')
    foto_terkini = models.ImageField(upload_to=foto_aset_path, null=True, blank=True, verbose_name='Foto Terkini (Unit)')

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='aset_dibuat')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='aset_diubah')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'aset_master'
        ordering = ['kode_aset']
        indexes = [
            models.Index(fields=['unit', 'status_aset'], name='aset_unit_status_idx'),
            models.Index(fields=['jenis', 'status_kelayakan'], name='aset_jenis_kelayakan_idx'),
            models.Index(fields=['status_data'], name='aset_status_data_idx'),
        ]
        verbose_name = 'Master Aset'
        verbose_name_plural = 'Master Aset'

    def save(self, *args, **kwargs):
        if self.foto and not self.foto_awal:
            self.foto_awal = self.foto
        elif self.foto_awal and not self.foto:
            self.foto = self.foto_awal
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.kode_aset} - {self.deskripsi} ({self.lokasi_teks or self.unit.nama})'


class AsetRiwayat(models.Model):
    """
    Log Riwayat Perubahan Status Kelayakan, Mutasi Ruangan, dan Update Data Aset.
    """
    AKSI_CHOICES = [
        ('dibuat', 'Aset Didaftarkan'),
        ('perubahan_kelayakan', 'Perubahan Status Kelayakan'),
        ('mutasi_ruangan', 'Mutasi Ruangan / Unit'),
        ('perbaikan', 'Tindakan Pemeliharaan / Servis'),
        ('update_data', 'Pembaruan Data Aset'),
        ('penghapusan', 'Penghapusan / Afkir'),
    ]

    aset = models.ForeignKey(Aset, on_delete=models.CASCADE, related_name='riwayat_list')
    aksi = models.CharField(max_length=30, choices=AKSI_CHOICES, default='update_data')

    status_kelayakan_lama = models.CharField(max_length=5, blank=True)
    status_kelayakan_baru = models.CharField(max_length=5, blank=True)

    unit_lama = models.CharField(max_length=120, blank=True)
    unit_baru = models.CharField(max_length=120, blank=True)

    ruangan_lama = models.CharField(max_length=180, blank=True)
    ruangan_baru = models.CharField(max_length=180, blank=True)

    catatan = models.TextField(blank=True)
    foto = models.ImageField(upload_to=foto_riwayat_path, null=True, blank=True)

    dilakukan_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'aset_riwayat'
        ordering = ['-created_at']
        verbose_name = 'Riwayat Aset'
        verbose_name_plural = 'Riwayat Aset'

    def __str__(self):
        return f'[{self.created_at.strftime("%Y-%m-%d %H:%M")}] {self.aset.kode_aset} - {self.get_aksi_display()}'



class AsetPerbaikan(models.Model):
    """
    Laporan Kerusakan & Riwayat Tindak Lanjut Perbaikan Aset.
    """
    TINGKAT_KERUSAKAN_CHOICES = [
        ('ringan', 'Ringan'),
        ('sedang', 'Sedang'),
        ('berat', 'Berat'),
    ]

    STATUS_PERBAIKAN_CHOICES = [
        ('belum_mulai', 'Belum Mulai'),
        ('inspeksi', 'Inspeksi / Penugasan Teknisi'),
        ('dalam_proses', 'Dalam Proses'),
        ('selesai', 'Selesai'),
    ]

    KONDISI_SETELAH_CHOICES = [
        ('berfungsi_normal', 'Berfungsi Normal'),
        ('masih_bermasalah', 'Masih Bermasalah'),
    ]

    aset = models.ForeignKey(Aset, on_delete=models.CASCADE, related_name='perbaikan_list')
    nomor_tiket = models.CharField(max_length=50, unique=True, blank=True, db_index=True)

    tanggal_laporan = models.DateField(default=timezone.now, verbose_name='Tanggal Laporan')
    tanggal_kerusakan = models.DateField(null=True, blank=True, verbose_name='Tanggal Kerusakan')
    rincian_kerusakan = models.TextField(verbose_name='Rincian / Gejala Kerusakan')
    tingkat_kerusakan = models.CharField(max_length=20, choices=TINGKAT_KERUSAKAN_CHOICES, default='ringan')

    status_perbaikan = models.CharField(max_length=25, choices=STATUS_PERBAIKAN_CHOICES, default='belum_mulai')
    tindak_lanjut = models.TextField(blank=True, verbose_name='Tindak Lanjut Penanganan')
    hasil_inspeksi = models.TextField(blank=True, verbose_name='Hasil Inspeksi Teknisi')
    kondisi_setelah_perbaikan = models.CharField(max_length=25, choices=KONDISI_SETELAH_CHOICES, null=True, blank=True)
    tindak_lanjut_berikutnya = models.TextField(blank=True, verbose_name='Tindak Lanjut Berikutnya (Wajib jika Masih Bermasalah)')

    foto_kerusakan = models.ImageField(upload_to=foto_perbaikan_path, null=True, blank=True)
    foto_setelah_perbaikan = models.ImageField(upload_to=foto_perbaikan_path, null=True, blank=True)

    estimasi_biaya = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name='Estimasi Biaya Perbaikan')
    biaya_perbaikan = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name='Biaya Riil Perbaikan')
    teknisi = models.CharField(max_length=120, blank=True, verbose_name='Teknisi / Pihak Ketiga')
    pelapor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='laporan_perbaikan_aset')
    tanggal_selesai = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'aset_perbaikan'
        ordering = ['-created_at']
        verbose_name = 'Laporan Kerusakan & Perbaikan'
        verbose_name_plural = 'Daftar Kerusakan & Perbaikan'

    def save(self, *args, **kwargs):
        if not self.nomor_tiket:
            today_str = timezone.now().strftime('%Y%m')
            count = AsetPerbaikan.objects.filter(nomor_tiket__startswith=f'PBK-{today_str}').count() + 1
            self.nomor_tiket = f'PBK-{today_str}-{count:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.nomor_tiket} - {self.aset.kode_aset} ({self.get_status_perbaikan_display()})'


class AsetPerbaikanLog(models.Model):
    """
    Log / Catatan Riwayat Kronologis Penanganan dan Tindak Lanjut Perbaikan.
    """
    perbaikan = models.ForeignKey(AsetPerbaikan, on_delete=models.CASCADE, related_name='log_list')
    status_sebelum = models.CharField(max_length=25, blank=True)
    status_sesudah = models.CharField(max_length=25)
    tindakan = models.TextField(verbose_name='Aktivitas / Catatan Penanganan')
    teknisi = models.CharField(max_length=120, blank=True)
    estimasi_biaya = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    biaya_riil = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    kondisi_setelah_perbaikan = models.CharField(max_length=25, blank=True)
    tindak_lanjut_berikutnya = models.TextField(blank=True)
    foto = models.ImageField(upload_to=foto_perbaikan_path, null=True, blank=True)
    dibuat_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'aset_perbaikan_log'
        ordering = ['-created_at']
        verbose_name = 'Log Riwayat Perbaikan'
        verbose_name_plural = 'Log Riwayat Perbaikan'

    def __str__(self):
        return f'[{self.created_at.strftime("%Y-%m-%d %H:%M")}] {self.perbaikan.nomor_tiket} ({self.status_sesudah})'
