from django.db import connection, models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('action', 'Action'),
        ('login', 'Login'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=30)
    entity_id = models.IntegerField(default=0)
    entity_display = models.CharField(max_length=255, blank=True)
    old_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)
    description = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='success')
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id'], name='keuangan_au_entity__f2af1e_idx'),
            models.Index(fields=['user', '-created_at'], name='keuangan_au_user_id_bcbc70_idx'),
            models.Index(fields=['action', '-created_at'], name='keuangan_au_action_191ccc_idx'),
            models.Index(fields=['-created_at'], name='keuangan_au_created_b5330a_idx'),
        ]
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        actor = self.user.username if self.user else 'System'
        return f'{self.created_at:%Y-%m-%d %H:%M} | {actor} | {self.action} | {self.entity_type}'


class IdempotencyLog(models.Model):
    idempotency_key = models.CharField(max_length=120)
    request_path = models.CharField(max_length=500, blank=True)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(default=dict, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='idempotency_logs',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['idempotency_key', 'user'], name='keuangan_id_idempot_f20424_idx'),
            models.Index(fields=['-created_at'], name='keuangan_id_created_80e4ee_idx'),
        ]

    def __str__(self):
        return self.idempotency_key


class Akun(models.Model):
    TIPE_CHOICES = [
        ('aset_lancar', 'Aset Lancar'),
        ('aset_tetap', 'Aset Tetap'),
        ('aset_lainnya', 'Aset Lainnya'),
        ('kewajiban_lancar', 'Kewajiban Lancar'),
        ('kewajiban_jangka_panjang', 'Kewajiban Jangka Panjang'),
        ('ekuitas', 'Ekuitas'),
        ('pendapatan', 'Pendapatan'),
        ('harga_pokok', 'Harga Pokok Penjualan'),
        ('beban_operasional', 'Beban Operasional'),
        ('beban_lainnya', 'Beban Lainnya'),
        ('pendapatan_lainnya', 'Pendapatan Lainnya'),
    ]
    SALDO_NORMAL_CHOICES = [('debit', 'Debit'), ('kredit', 'Kredit')]

    kode_akun     = models.CharField(max_length=20, unique=True)
    nama_akun     = models.CharField(max_length=100)
    tipe          = models.CharField(max_length=30, choices=TIPE_CHOICES, default='aset_lancar')
    saldo_normal  = models.CharField(max_length=10, choices=SALDO_NORMAL_CHOICES, default='debit')
    is_kas_setara = models.BooleanField(default=False)
    keterangan    = models.TextField(blank=True, null=True)
    is_active     = models.BooleanField(default=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['kode_akun']
        verbose_name = 'Akun'
        verbose_name_plural = 'Daftar Akun'

    def __str__(self):
        return f"{self.kode_akun} - {self.nama_akun}"


class Pelanggan(models.Model):
    TIPE_CHOICES = [
        ('umum', 'Umum'),
        ('bpjs', 'BPJS'),
        ('asuransi', 'Asuransi Swasta'),
        ('perusahaan', 'Perusahaan'),
    ]

    kode            = models.CharField(max_length=20, unique=True)
    nama            = models.CharField(max_length=150)
    tipe            = models.CharField(max_length=20, choices=TIPE_CHOICES, default='umum')
    telepon         = models.CharField(max_length=20, blank=True, null=True)
    email           = models.EmailField(blank=True, null=True)
    alamat          = models.TextField(blank=True, null=True)
    no_kontrak      = models.CharField(max_length=50, blank=True, null=True)
    batas_kredit    = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_active       = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Pelanggan'
        verbose_name_plural = 'Daftar Pelanggan'

    def __str__(self):
        return f"{self.kode} - {self.nama}"


class Pemasok(models.Model):
    TIPE_CHOICES = [
        ('obat', 'Supplier Obat'),
        ('alkes', 'Supplier Alkes'),
        ('jasa', 'Jasa'),
        ('umum', 'Umum'),
    ]

    kode        = models.CharField(max_length=20, unique=True)
    nama        = models.CharField(max_length=150)
    tipe        = models.CharField(max_length=20, choices=TIPE_CHOICES, default='umum')
    telepon     = models.CharField(max_length=20, blank=True, null=True)
    email       = models.EmailField(blank=True, null=True)
    alamat      = models.TextField(blank=True, null=True)
    npwp        = models.CharField(max_length=30, blank=True, null=True)
    no_rekening = models.CharField(max_length=50, blank=True, null=True)
    bank        = models.CharField(max_length=50, blank=True, null=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Pemasok'
        verbose_name_plural = 'Daftar Pemasok'

    def __str__(self):
        return f"{self.kode} - {self.nama}"


class Jurnal(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('posted', 'Diposting')]

    nomor_jurnal = models.CharField(max_length=50, unique=True)
    tanggal      = models.DateField()
    keterangan   = models.TextField()
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='jurnal')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Jurnal'
        verbose_name_plural = 'Entri Jurnal'

    def __str__(self):
        return f"{self.nomor_jurnal} - {self.keterangan}"

    @property
    def total_debit(self):
        return sum(item.debit for item in self.items.all())

    @property
    def total_kredit(self):
        return sum(item.kredit for item in self.items.all())

    @property
    def is_balanced(self):
        return self.total_debit == self.total_kredit


class JurnalItem(models.Model):
    jurnal     = models.ForeignKey(Jurnal, on_delete=models.CASCADE, related_name='items')
    akun       = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='jurnal_items')
    keterangan = models.CharField(max_length=200, blank=True)
    debit      = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    kredit     = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.akun} | D:{self.debit} K:{self.kredit}"


class Transaksi(models.Model):
    JENIS_CHOICES = [('masuk', 'Kas Masuk'), ('keluar', 'Kas Keluar')]
    KATEGORI_ARUS_CHOICES = [
        ('operasi', 'Aktivitas Operasi'),
        ('investasi', 'Aktivitas Investasi & Kejadian Luar Biasa'),
        ('keuangan', 'Aktivitas Keuangan'),
        ('tidak_diklasifikasi', 'Tidak Diklasifikasi'),
    ]
    SUB_KATEGORI_CHOICES = [
        ('tagihan_muka_pelanggan', 'Tagihan Muka yang Diterima dari Pelanggan'),
        ('kas_masuk_operasi', 'Uang Kas yang Diterima dari Kegiatan Operasi'),
        ('tagihan_muka_pemasok', 'Tagihan Muka yang Dibuat untuk Pemasok'),
        ('kas_keluar_operasi', 'Uang Kas yang Dibayar untuk Kegiatan Operasi'),
        ('kas_masuk_investasi', 'Kas Masuk Investasi'),
        ('kas_keluar_investasi', 'Kas Keluar Investasi'),
        ('kas_masuk_keuangan', 'Kas Masuk Keuangan'),
        ('kas_keluar_keuangan', 'Kas Keluar Keuangan'),
        ('kas_masuk_lainnya', 'Kas Masuk Lainnya'),
        ('kas_keluar_lainnya', 'Kas Keluar Lainnya'),
    ]

    tanggal         = models.DateField()
    nomor_referensi = models.CharField(max_length=50, blank=True, null=True)
    keterangan      = models.TextField()
    jenis           = models.CharField(max_length=10, choices=JENIS_CHOICES)
    kategori_arus   = models.CharField(max_length=25, choices=KATEGORI_ARUS_CHOICES)
    sub_kategori    = models.CharField(max_length=30, choices=SUB_KATEGORI_CHOICES)
    akun            = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='transaksi')
    jumlah          = models.DecimalField(max_digits=15, decimal_places=2)
    created_by      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='transaksi')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Transaksi'
        verbose_name_plural = 'Daftar Transaksi'

    def __str__(self):
        return f"{self.tanggal} | {self.jenis} | {self.jumlah}"


class Faktur(models.Model):
    STATUS_CHOICES = [
        ('belum_bayar', 'Belum Bayar'),
        ('bayar_sebagian', 'Bayar Sebagian'),
        ('lunas', 'Lunas'),
        ('batal', 'Dibatalkan'),
    ]

    nomor_faktur    = models.CharField(max_length=50, unique=True)
    tanggal         = models.DateField()
    jatuh_tempo     = models.DateField()
    pelanggan       = models.ForeignKey(Pelanggan, on_delete=models.PROTECT, related_name='faktur', null=True, blank=True)

    # Fields untuk migrated data dari rssams.invoice
    id_pembiayaan   = models.CharField(max_length=20, blank=True, null=True, help_text='ID dari rssams.pbiaya')
    nama_pembiayaan = models.CharField(max_length=150, blank=True, null=True)
    jenis           = models.TextField(blank=True, null=True)
    periode         = models.CharField(max_length=100, blank=True, null=True)
    beban           = models.CharField(max_length=100, blank=True, null=True)

    # Cost breakdown
    adm       = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    jasa      = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    farmasi   = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tindakan  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    fisio     = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    lab       = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rad       = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    kamar     = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    bhp       = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    lainnya   = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    ambulan   = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    alat      = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    ppn_farmasi = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    keterangan    = models.TextField(blank=True)
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='belum_bayar')
    total_tagihan = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_dibayar = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tgl_kirim     = models.DateField(null=True, blank=True)
    xround        = models.CharField(max_length=1, default='N', help_text='Pembulatan Y/N')

    created_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='faktur')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Faktur'
        verbose_name_plural = 'Daftar Faktur'

    def __str__(self):
        if self.pelanggan:
            return f"{self.nomor_faktur} - {self.pelanggan.nama}"
        return f"{self.nomor_faktur} - {self.nama_pembiayaan}"

    def _get_effective_total_tagihan(self):
        if self.nomor_faktur:
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COALESCE(SUM(
                            COALESCE(a.adm,0) +
                            COALESCE(a.jasa,0) +
                            COALESCE(a.farmasi,0) +
                            COALESCE(a.tindakan,0) +
                            COALESCE(a.fisio,0) +
                            COALESCE(a.lab,0) +
                            COALESCE(a.kamar,0) +
                            COALESCE(a.rad,0) +
                            COALESCE(a.bhp,0) +
                            COALESCE(a.lainnya,0) +
                            COALESCE(a.ambulan,0) +
                            COALESCE(a.alat,0) -
                            COALESCE(a.jmlbyr,0)
                        ), 0) AS total_piutang,
                        COUNT(*) AS total_rows
                        FROM rssams.kunjung a
                        INNER JOIN rssams.verif_kunjung c ON a.no = c.no
                        WHERE c.no_invoice = %s
                        """,
                        [self.nomor_faktur],
                    )
                    total_piutang, total_rows = cursor.fetchone()
                if total_rows:
                    return total_piutang
            except Exception:
                pass
        return self.total_tagihan

    def _get_verified_total_dibayar(self):
        excluded_keterangan = 'Payment from app_siaga migration'
        return self.pembayaran.filter(
            status_verifikasi='terverifikasi'
        ).exclude(
            keterangan=excluded_keterangan
        ).aggregate(
            total=models.Sum('jumlah')
        )['total'] or Decimal('0')

    def save(self, *args, **kwargs):
        # Calculate total_tagihan from cost breakdown
        self.total_tagihan = (
            self.adm + self.jasa + self.farmasi + self.tindakan + self.fisio +
            self.lab + self.rad + self.kamar + self.bhp + self.lainnya + self.ambulan + self.alat
        )
        if self.status == 'batal':
            super().save(*args, **kwargs)
            return

        effective_total = self._get_effective_total_tagihan()
        # Kalau instance belum punya PK (baru dibuat & belum ke-insert),
        # belum mungkin ada pembayaran yang nempel ke sini, jadi langsung 0
        # tanpa perlu akses reverse relation `self.pembayaran` yang butuh PK.
        self.total_dibayar = self._get_verified_total_dibayar() if self.pk else Decimal('0')
        sisa = effective_total - self.total_dibayar
        if sisa <= 0:
            self.status = 'lunas'
        elif self.total_dibayar == 0:
            self.status = 'belum_bayar'
        else:
            self.status = 'bayar_sebagian'
        super().save(*args, **kwargs)

    @property
    def sisa_tagihan(self):
        effective_total = self._get_effective_total_tagihan()
        return effective_total - self._get_verified_total_dibayar()


class FakturItem(models.Model):
    faktur       = models.ForeignKey(Faktur, on_delete=models.CASCADE, related_name='items')
    deskripsi    = models.CharField(max_length=200)
    kuantitas    = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    harga_satuan = models.DecimalField(max_digits=15, decimal_places=2)
    subtotal     = models.DecimalField(max_digits=15, decimal_places=2)

    def save(self, *args, **kwargs):
        self.subtotal = self.kuantitas * self.harga_satuan
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.deskripsi} - {self.subtotal}"


class PembayaranFaktur(models.Model):
    METODE_CHOICES = [
        ('tunai', 'Tunai'),
        ('transfer', 'Transfer Bank'),
        ('bpjs', 'BPJS'),
        ('asuransi', 'Asuransi'),
    ]
    VERIFIKASI_CHOICES = [
        ('menunggu', 'Menunggu Verifikasi'),
        ('terverifikasi', 'Terverifikasi'),
        ('ditolak', 'Ditolak'),
        ('dibatalkan', 'Dibatalkan'),
    ]

    faktur     = models.ForeignKey(Faktur, on_delete=models.PROTECT, related_name='pembayaran')
    tanggal    = models.DateField()
    jumlah     = models.DecimalField(max_digits=15, decimal_places=2)
    metode     = models.CharField(max_length=20, choices=METODE_CHOICES, default='tunai')
    keterangan = models.CharField(max_length=200, blank=True)
    akun       = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='pembayaran_faktur', null=True, blank=True)
    alokasi_dana = models.ForeignKey('AlokasiDana', on_delete=models.SET_NULL, null=True, blank=True, related_name='pembayaran')
    status_verifikasi = models.CharField(max_length=20, choices=VERIFIKASI_CHOICES, default='menunggu')
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='pembayaran_faktur_verified')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='pembayaran_faktur')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Pembayaran Faktur'
        verbose_name_plural = 'Pembayaran Faktur'

    def __str__(self):
        return f"{self.faktur.nomor_faktur} - {self.jumlah} ({self.tanggal})"

    def save(self, *args, **kwargs):
        # Auto-update faktur.total_dibayar
        super().save(*args, **kwargs)
        self._update_faktur_status()
        # Update alokasi dana sisa if linked
        if self.alokasi_dana:
            self.alokasi_dana.save()

    def delete(self, *args, **kwargs):
        alokasi = self.alokasi_dana
        alokasi_terpakai = list(AlokasiDana.objects.filter(pemakaian_alokasi__pembayaran=self).distinct())
        super().delete(*args, **kwargs)
        self._update_faktur_status()
        if alokasi:
            alokasi.save()
        for item in alokasi_terpakai:
            item.save()

    def _update_faktur_status(self):
        """Auto-update Faktur total_dibayar and status from verified payments only."""
        faktur = self.faktur
        verified_total = faktur._get_verified_total_dibayar()
        faktur.total_dibayar = verified_total
        faktur.save()


class UtangSupplier(models.Model):
    STATUS_BELUM_DIBAYAR = 'belum_dibayar'
    STATUS_SEBAGIAN = 'sebagian'
    STATUS_LUNAS = 'lunas'
    STATUS_CHOICES = [
        (STATUS_BELUM_DIBAYAR, 'Belum Dibayar'),
        (STATUS_SEBAGIAN, 'Sebagian'),
        (STATUS_LUNAS, 'Lunas'),
    ]

    app_siaga_faktur_id = models.CharField(max_length=32, unique=True, help_text='ID rssams.tran_beli_brg_farmasi')
    nomor_spb = models.CharField(max_length=50, blank=True)
    tanggal_spb = models.DateField(null=True, blank=True)
    nomor_faktur = models.CharField(max_length=100)
    vendor_id = models.IntegerField(help_text='ID rssams.rekanan.id_rekanan')
    vendor_nama = models.CharField(max_length=150, blank=True)
    tanggal_faktur = models.DateField(null=True, blank=True)
    tanggal_jatuh_tempo = models.DateField(null=True, blank=True)
    nominal = models.DecimalField(max_digits=25, decimal_places=2)
    tanggal_titip = models.DateField(null=True, blank=True)
    keterangan_titip = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_BELUM_DIBAYAR)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='utang_supplier_verified')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'utang_supplier'
        ordering = ['-tanggal_faktur', '-created_at']
        indexes = [
            models.Index(fields=['app_siaga_faktur_id'], name='utang_app_siaga_idx'),
            models.Index(fields=['vendor_id'], name='utang_vendor_idx'),
            models.Index(fields=['status'], name='utang_status_idx'),
            models.Index(fields=['tanggal_jatuh_tempo'], name='utang_jtempo_idx'),
        ]
        verbose_name = 'Utang Supplier'
        verbose_name_plural = 'Utang Supplier'

    def __str__(self):
        return f'{self.nomor_faktur} - {self.vendor_nama or self.vendor_id}'

    @property
    def total_dibayar(self):
        return self.pembayaran.aggregate(total=models.Sum('jumlah_bayar'))['total'] or Decimal('0')

    @property
    def sisa_utang(self):
        sisa = self.nominal - self.total_dibayar
        return max(sisa, Decimal('0'))

    def refresh_status(self, commit=True):
        total = self.total_dibayar if self.pk else Decimal('0')
        if total == 0:
            self.status = self.STATUS_BELUM_DIBAYAR
        elif total < self.nominal:
            self.status = self.STATUS_SEBAGIAN
        else:
            self.status = self.STATUS_LUNAS
        if commit:
            self.save(update_fields=['status', 'updated_at'])
        return self.status


class PembayaranUtang(models.Model):
    utang = models.ForeignKey(UtangSupplier, on_delete=models.PROTECT, related_name='pembayaran')
    tanggal_rencana_bayar = models.DateField(null=True, blank=True)
    tanggal_proses = models.DateField()
    tanggal_app = models.DateField(null=True, blank=True)
    jumlah_bayar = models.DecimalField(max_digits=25, decimal_places=2)
    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='pembayaran_utang')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pembayaran_utang'
        ordering = ['-tanggal_proses', '-created_at']
        indexes = [
            models.Index(fields=['utang', 'tanggal_proses'], name='payutang_utang_tgl_idx'),
            models.Index(fields=['created_at'], name='payutang_created_idx'),
        ]
        verbose_name = 'Pembayaran Utang'
        verbose_name_plural = 'Pembayaran Utang'

    def __str__(self):
        return f'{self.utang.nomor_faktur} - {self.jumlah_bayar} ({self.tanggal_proses})'

    def clean(self):
        if self.jumlah_bayar <= 0:
            raise ValidationError('Jumlah bayar harus lebih dari 0.')

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        self.utang.refresh_status()

    def delete(self, *args, **kwargs):
        utang = self.utang
        super().delete(*args, **kwargs)
        utang.refresh_status()


class AlokasiDana(models.Model):
    BANK_CHOICES = [
        ('bsi', 'BSI'),
        ('bri', 'BRI'),
        ('mandiri', 'Mandiri'),
        ('bca', 'BCA'),
    ]

    id_pembiayaan   = models.CharField(max_length=20, help_text='ID dari rssams.pbiaya')
    nama_pembiayaan = models.CharField(max_length=150, help_text='Nama pembiayaan/asuransi')
    tanggal_penerimaan = models.DateField()
    jumlah_penerimaan  = models.DecimalField(max_digits=15, decimal_places=2)
    bank            = models.CharField(max_length=20, choices=BANK_CHOICES)
    total_alokasi   = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    sisa_alokasi    = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    keterangan      = models.TextField(blank=True)

    created_by      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='alokasi_dana')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal_penerimaan', '-created_at']
        verbose_name = 'Alokasi Dana'
        verbose_name_plural = 'Alokasi Dana'

    def __str__(self):
        return f"{self.nama_pembiayaan} - {self.jumlah_penerimaan} ({self.bank})"

    def save(self, *args, **kwargs):
        # Set total_alokasi = jumlah_penerimaan saat pertama kali
        if not self.total_alokasi:
            self.total_alokasi = self.jumlah_penerimaan
        # Calculate sisa_alokasi from related pembayaran
        digunakan = 0
        if self.pk:
            legacy_digunakan = self.pembayaran.aggregate(
                total=models.Sum('jumlah', filter=models.Q(status_verifikasi='terverifikasi'))
            )['total'] or 0
            wallet_digunakan = self.pemakaian_alokasi.aggregate(
                total=models.Sum('jumlah')
            )['total'] or 0
            digunakan = legacy_digunakan + wallet_digunakan
        self.sisa_alokasi = self.total_alokasi - digunakan
        super().save(*args, **kwargs)

    @property
    def digunakan(self):
        """Total alokasi yang sudah digunakan"""
        legacy_digunakan = self.pembayaran.aggregate(
            total=models.Sum('jumlah', filter=models.Q(status_verifikasi='terverifikasi'))
        )['total'] or 0
        wallet_digunakan = self.pemakaian_alokasi.aggregate(
            total=models.Sum('jumlah')
        )['total'] or 0
        return legacy_digunakan + wallet_digunakan


class AlokasiDanaPemakaian(models.Model):
    alokasi_dana = models.ForeignKey(AlokasiDana, on_delete=models.CASCADE, related_name='pemakaian_alokasi')
    pembayaran   = models.ForeignKey(PembayaranFaktur, on_delete=models.CASCADE, related_name='pemakaian_alokasi')
    jumlah       = models.DecimalField(max_digits=15, decimal_places=2)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        verbose_name = 'Pemakaian Alokasi Dana'
        verbose_name_plural = 'Pemakaian Alokasi Dana'

    def __str__(self):
        return f"{self.alokasi_dana_id} -> {self.pembayaran_id}: {self.jumlah}"


class Tagihan(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('diterima', 'Diterima'),
        ('sebagian', 'Dibayar Sebagian'),
        ('lunas', 'Lunas'),
        ('batal', 'Dibatalkan'),
    ]

    nomor_tagihan     = models.CharField(max_length=50, unique=True)
    nomor_ref_pemasok = models.CharField(max_length=50, blank=True)
    tanggal           = models.DateField()
    jatuh_tempo       = models.DateField()
    pemasok           = models.ForeignKey(Pemasok, on_delete=models.PROTECT, related_name='tagihan')
    keterangan        = models.TextField(blank=True)
    status            = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    total_tagihan     = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_dibayar     = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    created_by        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='tagihan')
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']
        verbose_name = 'Tagihan'
        verbose_name_plural = 'Daftar Tagihan'

    def __str__(self):
        return f"{self.nomor_tagihan} - {self.pemasok.nama}"

    @property
    def sisa_tagihan(self):
        return self.total_tagihan - self.total_dibayar


class TagihanItem(models.Model):
    tagihan      = models.ForeignKey(Tagihan, on_delete=models.CASCADE, related_name='items')
    deskripsi    = models.CharField(max_length=200)
    kuantitas    = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    harga_satuan = models.DecimalField(max_digits=15, decimal_places=2)
    subtotal     = models.DecimalField(max_digits=15, decimal_places=2)

    def save(self, *args, **kwargs):
        self.subtotal = self.kuantitas * self.harga_satuan
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.deskripsi} - {self.subtotal}"


class PembayaranTagihan(models.Model):
    METODE_CHOICES = [
        ('tunai', 'Tunai'),
        ('transfer', 'Transfer Bank'),
        ('giro', 'Giro'),
        ('cek', 'Cek'),
    ]

    tagihan    = models.ForeignKey(Tagihan, on_delete=models.PROTECT, related_name='pembayaran')
    tanggal    = models.DateField()
    jumlah     = models.DecimalField(max_digits=15, decimal_places=2)
    metode     = models.CharField(max_length=20, choices=METODE_CHOICES, default='transfer')
    keterangan = models.CharField(max_length=200, blank=True)
    akun       = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='pembayaran_tagihan')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='pembayaran_tagihan')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-tanggal']
        verbose_name = 'Pembayaran Tagihan'
        verbose_name_plural = 'Pembayaran Tagihan'

    def __str__(self):
        return f"{self.tagihan.nomor_tagihan} - {self.jumlah}"


class RekeningBank(models.Model):
    BANK_CHOICES = [
        ('bri', 'Bank BRI'),
        ('bsi', 'Bank BSI'),
        ('lainnya', 'Bank Lainnya'),
    ]

    nama_rekening  = models.CharField(max_length=150)
    bank           = models.CharField(max_length=20, choices=BANK_CHOICES)
    nama_bank      = models.CharField(max_length=100, blank=True)
    nomor_rekening = models.CharField(max_length=50, unique=True)
    saldo          = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    keterangan     = models.TextField(blank=True)
    is_active      = models.BooleanField(default=True)
    updated_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='rekening_updates')
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['bank', 'nama_rekening']
        verbose_name = 'Rekening Bank'
        verbose_name_plural = 'Daftar Rekening Bank'

    def __str__(self):
        return f"{self.get_bank_display()} - {self.nomor_rekening} ({self.nama_rekening})"

    @property
    def nama_bank_display(self):
        if self.bank == 'lainnya':
            return self.nama_bank or 'Bank Lainnya'
        return self.get_bank_display()


class RiwayatSaldoRekening(models.Model):
    rekening      = models.ForeignKey(RekeningBank, on_delete=models.CASCADE, related_name='riwayat')
    saldo_sebelum = models.DecimalField(max_digits=18, decimal_places=2)
    saldo_sesudah = models.DecimalField(max_digits=18, decimal_places=2)
    selisih       = models.DecimalField(max_digits=18, decimal_places=2)
    keterangan    = models.TextField(blank=True)
    updated_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='riwayat_rekening')
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Riwayat Saldo Rekening'

    def __str__(self):
        return f"{self.rekening.nomor_rekening} | {self.saldo_sebelum} → {self.saldo_sesudah}"


# ══════════════════════════════════════════════════════════════
# PETTY CASH
# ══════════════════════════════════════════════════════════════

def berkas_pc_path(instance, filename):
    return f'petty_cash/{instance.no_pengajuan}/{filename}'

def nota_pc_path(instance, filename):
    return f'petty_cash/nota/{instance.petty_cash.no_pengajuan}/{filename}'

def berkas_rb_path(instance, filename):
    return f'reimbursement/{instance.no_reimbursement}/{filename}'

def foto_reimbursement_path(instance, filename):
    return f'reimbursement/{instance.reimbursement.no_reimbursement}/foto/{filename}'

def foto_petty_cash_path(instance, filename):
    return f'petty_cash/{instance.petty_cash.no_pengajuan}/foto/{filename}'

def foto_laporan_penggunaan_path(instance, filename):
    return f'petty_cash/laporan/{instance.laporan.petty_cash.no_pengajuan}/foto/{filename}'


class PettyCash(models.Model):
    STATUS_CHOICES = [
        ('pending',               'Pending'),
        ('disetujui',             'Disetujui'),
        ('ditolak',               'Ditolak'),
        ('dicairkan',             'Dicairkan'),
        ('menunggu_approval_laporan', 'Menunggu Approval Laporan'),
        ('dilaporkan',            'Dilaporkan'),
        ('menunggu_pengembalian', 'Menunggu Pengembalian'),
        ('selesai',               'Selesai'),
    ]

    no_pengajuan   = models.CharField(max_length=20, unique=True, editable=False)
    tanggal        = models.DateField()
    keperluan      = models.TextField()
    nominal        = models.DecimalField(max_digits=15, decimal_places=2)
    keterangan     = models.TextField(blank=True)
    berkas         = models.FileField(upload_to=berkas_pc_path, null=True, blank=True)
    status         = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    catatan_tolak  = models.TextField(blank=True)
    created_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='petty_cash_pengajuan')
    disetujui_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='petty_cash_disetujui')
    dicairkan_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='petty_cash_dicairkan')
    laporan_disetujui_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='petty_cash_laporan_disetujui')
    laporan_disetujui_at = models.DateTimeField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Petty Cash'
        verbose_name_plural = 'Petty Cash'

    def save(self, *args, **kwargs):
        if not self.no_pengajuan:
            from datetime import date
            today  = date.today()
            prefix = f"PC-{today.strftime('%Y%m')}-"
            last   = PettyCash.objects.filter(no_pengajuan__startswith=prefix).order_by('no_pengajuan').last()
            self.no_pengajuan = f"{prefix}{str(int(last.no_pengajuan.split('-')[-1]) + 1).zfill(3)}" if last else f"{prefix}001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_pengajuan} - {self.status}"


class LaporanPenggunaan(models.Model):
    petty_cash           = models.OneToOneField(PettyCash, on_delete=models.CASCADE, related_name='laporan')
    tanggal_laporan      = models.DateField()
    nominal_digunakan    = models.DecimalField(max_digits=15, decimal_places=2)
    selisih              = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rincian              = models.TextField()
    nota                 = models.FileField(upload_to=nota_pc_path, null=True, blank=True)
    pengembalian_selesai = models.BooleanField(default=False)
    dikonfirmasi_oleh    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='konfirmasi_laporan')
    created_at           = models.DateTimeField(auto_now_add=True)
    updated_at           = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Laporan Penggunaan'
        verbose_name_plural = 'Laporan Penggunaan'

    def __str__(self):
        return f"Laporan {self.petty_cash.no_pengajuan}"


# ══════════════════════════════════════════════════════════════
# REIMBURSEMENT
# ══════════════════════════════════════════════════════════════

class Reimbursement(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('disetujui', 'Disetujui'),
        ('ditolak',   'Ditolak'),
        ('dicairkan', 'Dicairkan'),
    ]

    no_reimbursement = models.CharField(max_length=20, unique=True, editable=False)
    tanggal          = models.DateField()
    keperluan        = models.TextField()
    nominal          = models.DecimalField(max_digits=15, decimal_places=2)
    keterangan       = models.TextField(blank=True)
    berkas           = models.FileField(upload_to=berkas_rb_path)
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    catatan_tolak    = models.TextField(blank=True)
    created_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='reimbursement_pengajuan')
    disetujui_oleh   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursement_disetujui')
    dicairkan_oleh   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursement_dicairkan')
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Reimbursement'
        verbose_name_plural = 'Reimbursement'

    def save(self, *args, **kwargs):
        if not self.no_reimbursement:
            from datetime import date
            today  = date.today()
            prefix = f"RB-{today.strftime('%Y%m')}-"
            last   = Reimbursement.objects.filter(no_reimbursement__startswith=prefix).order_by('no_reimbursement').last()
            self.no_reimbursement = f"{prefix}{str(int(last.no_reimbursement.split('-')[-1]) + 1).zfill(3)}" if last else f"{prefix}001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_reimbursement} - {self.status}"


class FotoReimbursement(models.Model):
    reimbursement = models.ForeignKey(Reimbursement, on_delete=models.CASCADE, related_name='foto_list')
    foto = models.ImageField(upload_to=foto_reimbursement_path)
    urutan = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Reimbursement'
        verbose_name_plural = 'Foto Reimbursement'

    def __str__(self):
        return f"Foto {self.urutan} - {self.reimbursement.no_reimbursement}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save
        if self.foto:
            from .utils_image import compress_image
            compress_image(self.foto, max_width=1920, max_height=1920, quality=75)

        super().save(*args, **kwargs)


class FotoPettyCash(models.Model):
    petty_cash = models.ForeignKey(PettyCash, on_delete=models.CASCADE, related_name='foto_list')
    foto = models.ImageField(upload_to=foto_petty_cash_path)
    urutan = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Petty Cash'
        verbose_name_plural = 'Foto Petty Cash'

    def __str__(self):
        return f"Foto {self.urutan} - {self.petty_cash.no_pengajuan}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save
        if self.foto:
            from .utils_image import compress_image
            compress_image(self.foto, max_width=1920, max_height=1920, quality=75)

        super().save(*args, **kwargs)


class FotoLaporanPenggunaan(models.Model):
    laporan = models.ForeignKey(LaporanPenggunaan, on_delete=models.CASCADE, related_name='foto_list')
    foto = models.ImageField(upload_to=foto_laporan_penggunaan_path)
    urutan = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Laporan Penggunaan'
        verbose_name_plural = 'Foto Laporan Penggunaan'

    def __str__(self):
        return f"Foto {self.urutan} - Laporan {self.laporan.petty_cash.no_pengajuan}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save
        if self.foto:
            from .utils_image import compress_image
            compress_image(self.foto, max_width=1920, max_height=1920, quality=75)

        super().save(*args, **kwargs)

class SaldoPettyCash(models.Model):
    """Singleton — hanya ada 1 row (pk=1)"""
    saldo      = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='saldo_pc_updates'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Saldo Petty Cash'

    def __str__(self):
        return f'Saldo Petty Cash: {self.saldo}'

class RiwayatSaldoPettyCash(models.Model):
    JENIS_CHOICES = [
        ('penambahan',  'Penambahan'),
        ('pengurangan', 'Pengurangan'),
    ]
    nama_pengaju = models.CharField(max_length=150, blank=True)
    unit_pengaju = models.CharField(max_length=150, blank=True)
    jenis         = models.CharField(max_length=20, choices=JENIS_CHOICES)
    jumlah        = models.DecimalField(max_digits=15, decimal_places=2)
    saldo_sebelum = models.DecimalField(max_digits=15, decimal_places=2)
    saldo_sesudah = models.DecimalField(max_digits=15, decimal_places=2)
    keterangan    = models.TextField(blank=True)
    created_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='riwayat_saldo_pc'
    )
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering     = ['-created_at']
        verbose_name = 'Riwayat Saldo Petty Cash'

    def __str__(self):
        return f'{self.jenis} {self.jumlah} ({self.created_at.date()})'

class PengajuanPenambahanSaldo(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('disetujui', 'Disetujui'),
        ('ditolak',   'Ditolak'),
    ]

    no_pengajuan     = models.CharField(max_length=25, unique=True, editable=False)
    tanggal          = models.DateField()
    alasan           = models.TextField()
    nominal_diajukan = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        help_text='Diisi direktur saat menyetujui'
    )
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    catatan_tolak    = models.TextField(blank=True)
    created_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='pengajuan_penambahan_saldo'
    )
    diproses_oleh    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='proses_penambahan_saldo'
    )
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering        = ['-created_at']
        verbose_name    = 'Pengajuan Penambahan Saldo'
        verbose_name_plural = 'Pengajuan Penambahan Saldo'

    def save(self, *args, **kwargs):
        if not self.no_pengajuan:
            from datetime import date
            today  = date.today()
            prefix = f"PS-{today.strftime('%Y%m')}-"
            last   = PengajuanPenambahanSaldo.objects.filter(
                no_pengajuan__startswith=prefix
            ).order_by('no_pengajuan').last()
            if last:
                last_num = int(last.no_pengajuan.split('-')[-1])
                self.no_pengajuan = f"{prefix}{str(last_num + 1).zfill(3)}"
            else:
                self.no_pengajuan = f"{prefix}001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.no_pengajuan} - {self.status}'

# ══════════════════════════════════════════════════════════════
# Tambahkan ke keuangan/models.py
# ══════════════════════════════════════════════════════════════

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


def foto_laporan_perjalanan_path(instance, filename):
    return f'driver/perjalanan/{instance.laporan.log_perjalanan.no_perjalanan}/{filename}'


class LaporanPerjalanan(models.Model):
    log_perjalanan = models.OneToOneField(LogPerjalanan, on_delete=models.CASCADE, related_name='laporan')
    tanggal_laporan = models.DateField()
    deskripsi     = models.TextField(help_text='Deskripsi perjalanan dan aktivitas')
    tujuan_tercapai = models.BooleanField(default=True)
    keterangan    = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Laporan Perjalanan'
        verbose_name_plural = 'Laporan Perjalanan'

    def __str__(self):
        return f"Laporan {self.log_perjalanan.no_perjalanan}"


class FotoLaporanPerjalanan(models.Model):
    laporan = models.ForeignKey(LaporanPerjalanan, on_delete=models.CASCADE, related_name='foto')
    foto    = models.ImageField(upload_to=foto_laporan_perjalanan_path)
    urutan  = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
        ordering     = ['-tanggal', '-created_at']
        verbose_name = 'Log Maintenance'
        verbose_name_plural = 'Log Maintenance'

    def __str__(self):
        return f"{self.kendaraan.plat_nomor} | {self.get_jenis_display()} | {self.tanggal}"


class ITBackupRecord(models.Model):
    BACKUP_TYPE_CHOICES = [
        ('database', 'Database'),
        ('media', 'Media Upload'),
        ('full', 'Database + Media'),
        ('config', 'Konfigurasi'),
        ('other', 'Lainnya'),
    ]
    STATUS_CHOICES = [
        ('scheduled', 'Terjadwal'),
        ('running', 'Berjalan'),
        ('success', 'Berhasil'),
        ('failed', 'Gagal'),
        ('verified', 'Terverifikasi'),
    ]

    backup_type = models.CharField(max_length=20, choices=BACKUP_TYPE_CHOICES, default='database')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='success')
    file_name = models.CharField(max_length=255, blank=True)
    storage_path = models.CharField(max_length=500, blank=True)
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_backup_records')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at'], name='it_backup_status_idx'),
            models.Index(fields=['backup_type', '-created_at'], name='it_backup_type_idx'),
        ]

    def __str__(self):
        return f"{self.get_backup_type_display()} - {self.get_status_display()}"


def foto_it_repair_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'it/repair/{period}/{filename}'


class ITRepairRequest(models.Model):
    CATEGORY_CHOICES = [
        ('hardware', 'Hardware'),
        ('software', 'Software'),
        ('network', 'Jaringan'),
        ('printer', 'Printer'),
        ('account', 'Akun / Akses'),
        ('simak', 'SIMAK'),
        ('other', 'Lainnya'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Rendah'),
        ('normal', 'Normal'),
        ('high', 'Tinggi'),
        ('urgent', 'Darurat'),
    ]
    STATUS_CHOICES = [
        ('open', 'Baru'),
        ('in_progress', 'Diproses'),
        ('waiting', 'Menunggu'),
        ('done', 'Selesai'),
        ('cancelled', 'Dibatalkan'),
    ]

    title = models.CharField(max_length=180)
    requester_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_reported_repairs')
    requester_name = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    description = models.TextField(blank=True)
    resolution = models.TextField(blank=True)
    sparepart = models.CharField(max_length=255, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    foto = models.ImageField(upload_to=foto_it_repair_path, null=True, blank=True)
    requested_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_repair_requests')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-requested_at', '-created_at']
        indexes = [
            models.Index(fields=['status', 'priority'], name='it_ticket_status_idx'),
            models.Index(fields=['requested_at'], name='it_ticket_requested_idx'),
        ]

    def __str__(self):
        return self.title


class ITCredentialNote(models.Model):
    CATEGORY_CHOICES = [
        ('website', 'Website'),
        ('server', 'Server'),
        ('database', 'Database'),
        ('email', 'Email'),
        ('device', 'Perangkat'),
        ('vendor', 'Vendor'),
        ('other', 'Lainnya'),
    ]

    name = models.CharField(max_length=160)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='website')
    url = models.URLField(max_length=500, blank=True)
    username = models.CharField(max_length=180, blank=True)
    password = models.TextField(blank=True)
    owner = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_credential_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['category', 'is_active'], name='it_credential_cat_idx'),
            models.Index(fields=['name'], name='it_credential_name_idx'),
        ]

    def __str__(self):
        return self.name


class ITRemoteAccess(models.Model):
    STATUS_CHOICES = [
        ('active', 'Aktif'),
        ('inactive', 'Nonaktif'),
        ('maintenance', 'Maintenance'),
    ]

    device_name = models.CharField(max_length=160)
    user_owner = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=180, blank=True)
    anydesk_id = models.CharField(max_length=80, blank=True)
    rustdesk_id = models.CharField(max_length=80, blank=True)
    access_password = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_remote_access_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['device_name']
        indexes = [
            models.Index(fields=['status', 'device_name'], name='it_remote_status_idx'),
            models.Index(fields=['unit'], name='it_remote_unit_idx'),
        ]

    def __str__(self):
        return self.device_name


class ITSubscription(models.Model):
    SERVICE_TYPE_CHOICES = [
        ('domain', 'Domain'),
        ('hosting', 'Hosting'),
        ('ssl', 'SSL'),
        ('internet', 'Internet'),
        ('software', 'Software / Lisensi'),
        ('vendor', 'Vendor / Support'),
        ('other', 'Lainnya'),
    ]
    BILLING_CYCLE_CHOICES = [
        ('monthly', 'Bulanan'),
        ('quarterly', 'Triwulan'),
        ('semester', 'Semester'),
        ('yearly', 'Tahunan'),
        ('one_time', 'Sekali Bayar'),
    ]
    STATUS_CHOICES = [
        ('active', 'Aktif'),
        ('expiring', 'Hampir Habis'),
        ('expired', 'Expired'),
        ('cancelled', 'Dibatalkan'),
    ]

    name = models.CharField(max_length=180)
    service_type = models.CharField(max_length=30, choices=SERVICE_TYPE_CHOICES, default='software')
    vendor = models.CharField(max_length=160, blank=True)
    account_ref = models.CharField(max_length=180, blank=True)
    url = models.URLField(max_length=500, blank=True)
    pic = models.CharField(max_length=120, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CYCLE_CHOICES, default='yearly')
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    reminder_days = models.PositiveIntegerField(default=30)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_subscriptions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['end_date', 'name']
        indexes = [
            models.Index(fields=['status', 'end_date'], name='it_sub_status_end_idx'),
            models.Index(fields=['service_type', 'end_date'], name='it_sub_type_end_idx'),
        ]

    def __str__(self):
        return self.name


class Announcement(models.Model):
    PRIORITY_CHOICES = [
        ('normal', 'Normal'),
        ('important', 'Penting'),
        ('urgent', 'Darurat'),
    ]

    title = models.CharField(max_length=180)
    message = models.TextField()
    audience = models.CharField(max_length=180, default='all')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    is_active = models.BooleanField(default=True)
    publish_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='announcements')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-publish_at', '-created_at']
        indexes = [
            models.Index(fields=['is_active', 'publish_at'], name='announce_active_pub_idx'),
            models.Index(fields=['expires_at'], name='announce_expires_idx'),
        ]

    def __str__(self):
        return self.title


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='announcement_reads')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('announcement', 'user')
        ordering = ['-read_at']

    def __str__(self):
        return f'{self.user} read {self.announcement}'


class InventoryOption(models.Model):
    OPTION_TYPE_CHOICES = [
        ('unit', 'Unit'),
        ('category', 'Kategori Aset'),
        ('condition', 'Status Kelayakan'),
        ('ownership', 'Status Kepemilikan'),
    ]

    option_type = models.CharField(max_length=20, choices=OPTION_TYPE_CHOICES)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['option_type', 'sort_order', 'name']
        unique_together = ('option_type', 'name')
        indexes = [
            models.Index(fields=['option_type', 'is_active'], name='inv_option_type_active_idx'),
            models.Index(fields=['name'], name='inv_option_name_idx'),
        ]

    def __str__(self):
        return f'{self.get_option_type_display()} - {self.name}'


def foto_inventory_asset_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'inventaris/aset/{period}/{filename}'


class InventoryAsset(models.Model):
    description = models.TextField(verbose_name='Deskripsi Aset')
    unit = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_unit_assets', limit_choices_to={'option_type': 'unit'})
    brand = models.CharField(max_length=140, blank=True, verbose_name='Merek')
    location = models.CharField(max_length=180, blank=True, verbose_name='Lokasi')
    category = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_category_assets', limit_choices_to={'option_type': 'category'})
    condition_status = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_condition_assets', limit_choices_to={'option_type': 'condition'})
    foto = models.ImageField(upload_to=foto_inventory_asset_path, null=True, blank=True)
    manufacture_year = models.PositiveIntegerField(null=True, blank=True, verbose_name='Tahun Pembuatan')
    purchase_year = models.PositiveIntegerField(null=True, blank=True, verbose_name='Tahun Beli')
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name='Harga Beli')
    recommended_action = models.TextField(blank=True, verbose_name='Rekomendasi Tindakan')
    ownership_status = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_ownership_assets', limit_choices_to={'option_type': 'ownership'})
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='inventory_assets')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['unit', 'category'], name='inv_asset_unit_cat_idx'),
            models.Index(fields=['condition_status'], name='inv_asset_condition_idx'),
            models.Index(fields=['ownership_status'], name='inv_asset_owner_idx'),
            models.Index(fields=['purchase_year'], name='inv_asset_purchase_year_idx'),
        ]

    def __str__(self):
        return f'{self.description[:80]} - {self.unit.name}'


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
    qty = models.PositiveIntegerField()
    isi = models.PositiveIntegerField(default=1)
    harga = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    jml_mutasi = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
        ordering = ['-tanggal', '-created_at']


class LogistikOpname(models.Model):
    barang = models.ForeignKey(LogistikBarang, on_delete=models.PROTECT, related_name='opname_logistik')
    tanggal = models.DateField(default=timezone.localdate)
    real_stock = models.IntegerField()
    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logistik_opname_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-tanggal', '-created_at']