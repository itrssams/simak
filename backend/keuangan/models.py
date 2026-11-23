from django.db import connection, models

from django.conf import settings

from django.core.exceptions import ValidationError

from django.utils import timezone

from decimal import Decimal

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
    KATEGORI_LAPORAN_CHOICES = [
        ('neraca', 'Neraca (Balance Sheet)'),
        ('laba_rugi', 'Laba Rugi (Income Statement)'),
    ]

    NERACA_TIPES = {
        'aset_lancar',
        'aset_tetap',
        'aset_lainnya',
        'kewajiban_lancar',
        'kewajiban_jangka_panjang',
        'ekuitas',
    }
    LABA_RUGI_TIPES = {
        'pendapatan',
        'harga_pokok',
        'beban_operasional',
        'beban_lainnya',
        'pendapatan_lainnya',
    }
    DEFAULT_KREDIT_TIPES = {
        'kewajiban_lancar',
        'kewajiban_jangka_panjang',
        'ekuitas',
        'pendapatan',
        'pendapatan_lainnya',
    }

    kode_akun        = models.CharField(max_length=20, unique=True)
    nama_akun        = models.CharField(max_length=120)
    parent           = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='children',
        help_text='Akun induk (Header) dalam hierarki Chart of Accounts',
    )
    tipe             = models.CharField(max_length=30, choices=TIPE_CHOICES, default='aset_lancar')
    kategori_laporan = models.CharField(max_length=20, choices=KATEGORI_LAPORAN_CHOICES, default='neraca')
    saldo_normal     = models.CharField(max_length=10, choices=SALDO_NORMAL_CHOICES, default='debit')
    is_postable      = models.BooleanField(
        default=True,
        help_text='False untuk akun Header/Induk yang tidak boleh dipilih langsung pada baris jurnal',
    )
    is_reconcilable  = models.BooleanField(
        default=False,
        help_text='True untuk akun Piutang, Utang, Bank, atau Deposit yang memerlukan pelacakan Partner/Buku Pembantu',
    )
    is_kas_setara    = models.BooleanField(default=False)
    keterangan       = models.TextField(blank=True, null=True)
    is_active        = models.BooleanField(default=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_akun'
        ordering = ['kode_akun']
        indexes = [
            models.Index(fields=['tipe', 'is_postable', 'is_active'], name='akun_tipe_post_act_idx'),
            models.Index(fields=['kategori_laporan', 'kode_akun'], name='akun_kat_kode_idx'),
        ]
        verbose_name = 'Akun'
        verbose_name_plural = 'Daftar Akun'

    @classmethod
    def infer_kategori_laporan(cls, tipe):
        return 'laba_rugi' if tipe in cls.LABA_RUGI_TIPES else 'neraca'

    @classmethod
    def infer_default_saldo_normal(cls, tipe):
        return 'kredit' if tipe in cls.DEFAULT_KREDIT_TIPES else 'debit'

    def clean(self):
        if self.pk and self.parent_id == self.pk:
            raise ValidationError({'parent': 'Akun tidak boleh menjadi induk bagi dirinya sendiri.'})
        curr = self.parent
        visited = {self.pk} if self.pk else set()
        while curr is not None:
            if curr.pk in visited:
                raise ValidationError({'parent': 'Terdeteksi siklus melingkar (circular hierarchy) pada induk akun.'})
            visited.add(curr.pk)
            curr = curr.parent

    def save(self, *args, **kwargs):
        self.kode_akun = str(self.kode_akun or '').strip()
        self.nama_akun = str(self.nama_akun or '').strip()
        self.kategori_laporan = self.infer_kategori_laporan(self.tipe)
        if not self.saldo_normal:
            self.saldo_normal = self.infer_default_saldo_normal(self.tipe)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.kode_akun} - {self.nama_akun}"


class AccountingPeriod(models.Model):
    STATUS_OPEN = 'open'
    STATUS_SOFT_LOCKED = 'soft_locked'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Terbuka (Open)'),
        (STATUS_SOFT_LOCKED, 'Terkunci Sementara (Soft Locked)'),
        (STATUS_CLOSED, 'Tutup Buku Permanen (Closed)'),
    ]

    BULAN_NAMES = {
        1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
        5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
        9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
    }

    tahun           = models.PositiveSmallIntegerField()
    bulan           = models.PositiveSmallIntegerField()
    nama_periode    = models.CharField(max_length=50, blank=True)
    tanggal_mulai   = models.DateField()
    tanggal_selesai = models.DateField()
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    closed_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_accounting_periods',
    )
    closed_at       = models.DateTimeField(null=True, blank=True)
    catatan         = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_accounting_period'
        unique_together = ('tahun', 'bulan')
        ordering = ['-tahun', '-bulan']
        indexes = [
            models.Index(fields=['tanggal_mulai', 'tanggal_selesai', 'status'], name='acc_period_range_sts_idx'),
        ]
        verbose_name = 'Periode Akuntansi'
        verbose_name_plural = 'Periode Akuntansi'

    def clean(self):
        if not (1 <= int(self.bulan or 0) <= 12):
            raise ValidationError({'bulan': 'Bulan harus berada di antara 1 sampai 12.'})
        if self.tanggal_mulai and self.tanggal_selesai and self.tanggal_selesai < self.tanggal_mulai:
            raise ValidationError({'tanggal_selesai': 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'})

    def save(self, *args, **kwargs):
        if not self.nama_periode and self.bulan in self.BULAN_NAMES and self.tahun:
            self.nama_periode = f"{self.BULAN_NAMES[self.bulan]} {self.tahun}"
        if self.status == self.STATUS_CLOSED and not self.closed_at:
            self.closed_at = timezone.now()
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nama_periode or f'{self.tahun}-{self.bulan:02d}'} ({self.status})"


class AccountMapping(models.Model):
    EVENT_CHOICES = [
        ('GRN_INVENTORY', 'Persediaan Masuk (Debit Penerimaan Barang / GRN)'),
        ('GRN_AP', 'Utang Usaha / GRNI (Kredit Penerimaan Barang Kredit)'),
        ('GRN_CASH', 'Kas / Bank Pembelian Tunai (Kredit Penerimaan Barang Tunai)'),
        ('GOODS_OUT_EXPENSE', 'Beban Pemakaian BHP / Logistik Unit (Debit Pengeluaran Gudang)'),
        ('STOCK_OPNAME_DIFF', 'Selisih Stock Opname Persediaan (Default)'),
        ('STOCK_OPNAME_GAIN', 'Pendapatan / Penyesuaian Selisih Lebih Stock Opname'),
        ('STOCK_OPNAME_LOSS', 'Beban Selisih Kurang Stock Opname'),
        ('CLAIM_AR', 'Piutang Pasien / Klaim Penjamin (Default)'),
        ('CLAIM_AR_BPJS', 'Piutang Klaim BPJS Kesehatan'),
        ('CLAIM_AR_ASURANSI', 'Piutang Klaim Asuransi & Perusahaan'),
        ('CLAIM_REVENUE_DEFAULT', 'Pendapatan Pelayanan RS (Default)'),
        ('CLAIM_REVENUE_COMPONENT', 'Pendapatan Pelayanan Per Komponen Tarif RS'),
        ('CLAIM_COB_DIFF', 'Selisih / Potongan Klaim COB BPJS'),
        ('AP_DEPOSIT_USED', 'Deposit Retur Vendor (Pemotongan Pembayaran Utang)'),
        ('PETTY_CASH_DEFAULT', 'Kas Kecil / Petty Cash (Default)'),
        ('KAS_BESAR_DEFAULT', 'Kas Besar Operasional (Default)'),
        ('REIMBURSEMENT_PAYABLE', 'Utang Reimbursement Karyawan'),
        ('DEPRECIATION_EXPENSE', 'Beban Penyusutan Aset Tetap'),
        ('DEPRECIATION_ACCUM', 'Akumulasi Penyusutan Aset Tetap'),
    ]

    event_code          = models.CharField(max_length=50, choices=EVENT_CHOICES, db_index=True)
    komponen_pendapatan = models.CharField(
        max_length=40,
        blank=True,
        default='',
        help_text="Opsional: kode komponen tarif Faktur ('adm', 'jasa', 'farmasi', 'tindakan', 'fisio', 'lab', 'rad', 'kamar', 'bhp', 'ambulan', 'alat', 'ppn_farmasi', 'lainnya')",
    )
    golongan_barang     = models.ForeignKey(
        'gudang.GolonganBarang',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account_mappings',
        help_text='Opsional: mapping akun spesifik per golongan barang gudang',
    )
    kategori_aset       = models.ForeignKey(
        'aset.AsetKategori',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account_mappings',
        help_text='Opsional: mapping akun spesifik per kategori aset tetap',
    )
    akun                = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='account_mappings')
    keterangan          = models.CharField(max_length=255, blank=True)
    is_active           = models.BooleanField(default=True)
    updated_by          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account_mapping_updates',
    )
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_account_mapping'
        ordering = ['event_code', 'komponen_pendapatan', 'id']
        indexes = [
            models.Index(fields=['event_code', 'is_active'], name='accmapping_event_act_idx'),
            models.Index(fields=['event_code', 'komponen_pendapatan'], name='accmapping_event_komp_idx'),
        ]
        verbose_name = 'Pemetaan Akun Otomatis'
        verbose_name_plural = 'Pemetaan Akun Otomatis'

    def clean(self):
        if self.akun_id and not self.akun.is_postable:
            raise ValidationError({'akun': f"Akun '{self.akun}' adalah akun Header (is_postable=False) dan tidak boleh dijadikan target mapping jurnal."})

    def save(self, *args, **kwargs):
        self.komponen_pendapatan = str(self.komponen_pendapatan or '').strip().lower()
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        suffix = f" [{self.komponen_pendapatan}]" if self.komponen_pendapatan else ""
        return f"{self.event_code}{suffix} -> {self.akun}"

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
        db_table = 'keuangan_pelanggan'
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
        db_table = 'keuangan_pemasok'
        ordering = ['nama']
        verbose_name = 'Pemasok'
        verbose_name_plural = 'Daftar Pemasok'

    def __str__(self):
        return f"{self.kode} - {self.nama}"

class Jurnal(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_POSTED = 'posted'
    STATUS_REVERSED = 'reversed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_POSTED, 'Diposting'),
        (STATUS_REVERSED, 'Dibalik (Reversed)'),
    ]

    JENIS_UMUM = 'umum'
    JENIS_PENJUALAN = 'penjualan'
    JENIS_PEMBELIAN = 'pembelian'
    JENIS_KAS_BANK = 'kas_bank'
    JENIS_PERSEDIAAN = 'persediaan'
    JENIS_PENYUSUTAN = 'penyusutan'
    JENIS_PENYESUAIAN = 'penyesuaian'
    JENIS_JURNAL_CHOICES = [
        (JENIS_UMUM, 'Jurnal Umum'),
        (JENIS_PENJUALAN, 'Jurnal Penjualan / Klaim'),
        (JENIS_PEMBELIAN, 'Jurnal Pembelian / Pengadaan'),
        (JENIS_KAS_BANK, 'Jurnal Kas & Bank'),
        (JENIS_PERSEDIAAN, 'Jurnal Persediaan & Pemakaian'),
        (JENIS_PENYUSUTAN, 'Jurnal Penyusutan Aset'),
        (JENIS_PENYESUAIAN, 'Jurnal Penyesuaian / Koreksi'),
    ]

    nomor_jurnal  = models.CharField(max_length=50, unique=True)
    tanggal       = models.DateField(db_index=True)
    jenis_jurnal  = models.CharField(max_length=25, choices=JENIS_JURNAL_CHOICES, default=JENIS_UMUM, db_index=True)
    keterangan    = models.TextField()
    source_type   = models.CharField(
        max_length=60,
        null=True,
        blank=True,
        default=None,
        db_index=True,
        help_text="Model sumber dokumen otomatis (misal 'gudang.Penerimaan', 'keuangan.Faktur'). NULL untuk jurnal manual/reversal.",
    )
    source_id     = models.PositiveBigIntegerField(null=True, blank=True, default=None, db_index=True)
    source_number = models.CharField(max_length=80, blank=True, default='')
    status        = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    reversal_of   = models.OneToOneField(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='reversed_by',
        help_text='Merujuk ke jurnal asal yang dibalik oleh jurnal reversal ini',
    )
    created_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='jurnal')
    posted_by     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jurnal_posted',
    )
    posted_at     = models.DateTimeField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_jurnal'
        ordering = ['-tanggal', '-created_at']
        indexes = [
            models.Index(fields=['status', 'tanggal'], name='jurnal_status_tgl_idx'),
            models.Index(fields=['jenis_jurnal', 'tanggal'], name='jurnal_jenis_tgl_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_type', 'source_id'],
                name='jurnal_source_type_id_uniq',
            ),
        ]
        verbose_name = 'Jurnal'
        verbose_name_plural = 'Entri Jurnal'

    def __str__(self):
        return f"{self.nomor_jurnal} - {self.keterangan}"

    @property
    def total_debit(self):
        return sum((item.debit for item in self.items.all()), Decimal('0.00'))

    @property
    def total_kredit(self):
        return sum((item.kredit for item in self.items.all()), Decimal('0.00'))

    @property
    def is_balanced(self):
        total_d = self.total_debit
        total_k = self.total_kredit
        return total_d > Decimal('0.00') and total_d == total_k

    def save(self, *args, **kwargs):
        if self.source_type is not None:
            cleaned_src = str(self.source_type).strip()
            self.source_type = cleaned_src if cleaned_src else None
        if self.source_type is None:
            self.source_id = None
        if self.reversal_of_id is not None:
            # Jurnal reversal tidak menduplikasi (source_type, source_id) dokumen sumber
            self.source_type = None
            self.source_id = None

        if self.pk:
            old = Jurnal.objects.filter(pk=self.pk).values(
                'status', 'nomor_jurnal', 'tanggal', 'jenis_jurnal', 'keterangan', 'source_type', 'source_id'
            ).first()
            if old:
                old_status = old['status']
                if old_status == self.STATUS_REVERSED:
                    raise ValidationError(
                        'Jurnal yang sudah dibalik (reversed) bersifat immutable dan tidak dapat diubah.'
                    )
                if old_status == self.STATUS_POSTED:
                    is_reversing_only = (
                        self.status == self.STATUS_REVERSED
                        and self.nomor_jurnal == old['nomor_jurnal']
                        and self.tanggal == old['tanggal']
                        and self.jenis_jurnal == old['jenis_jurnal']
                    )
                    if not is_reversing_only:
                        raise ValidationError(
                            'Jurnal yang sudah diposting bersifat immutable dan tidak dapat diubah atau di-unpost. '
                            'Gunakan mekanisme Jurnal Pembalik (Reversal).'
                        )

        if self.status == self.STATUS_POSTED and not self.posted_at:
            self.posted_at = timezone.now()

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status in (self.STATUS_POSTED, self.STATUS_REVERSED):
            raise ValidationError(
                'Jurnal yang sudah diposting atau dibalik (reversed) tidak dapat dihapus. '
                'Gunakan mekanisme Jurnal Pembalik (Reversal).'
            )
        return super().delete(*args, **kwargs)


class JurnalItem(models.Model):
    PARTNER_PELANGGAN = 'pelanggan'
    PARTNER_PEMASOK = 'pemasok'
    PARTNER_KARYAWAN = 'karyawan'
    PARTNER_TYPE_CHOICES = [
        (PARTNER_PELANGGAN, 'Pelanggan / Penjamin'),
        (PARTNER_PEMASOK, 'Pemasok / Vendor'),
        (PARTNER_KARYAWAN, 'Karyawan'),
    ]

    jurnal              = models.ForeignKey(Jurnal, on_delete=models.CASCADE, related_name='items')
    akun                = models.ForeignKey(Akun, on_delete=models.PROTECT, related_name='jurnal_items')
    keterangan          = models.CharField(max_length=255, blank=True)
    debit               = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    kredit              = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    partner_type        = models.CharField(max_length=20, choices=PARTNER_TYPE_CHOICES, null=True, blank=True, db_index=True)
    partner_id          = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    unit                = models.ForeignKey(
        'users.Unit',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jurnal_items',
        help_text='Unit Kerja / Cost Center',
    )
    tanggal_jatuh_tempo = models.DateField(null=True, blank=True, db_index=True)
    reconcile_ref       = models.CharField(max_length=60, null=True, blank=True, db_index=True)

    class Meta:
        db_table = 'keuangan_jurnal_item'
        indexes = [
            models.Index(fields=['akun', 'jurnal'], name='jurnalitem_akun_jurnal_idx'),
            models.Index(fields=['partner_type', 'partner_id'], name='jurnalitem_partner_idx'),
            models.Index(fields=['reconcile_ref'], name='jurnalitem_reconcile_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(debit__gte=0)
                    & models.Q(kredit__gte=0)
                    & ~(models.Q(debit__gt=0) & models.Q(kredit__gt=0))
                ),
                name='jurnal_item_debit_kredit_valid_chk',
            ),
        ]

    def __str__(self):
        return f"{self.akun} | D:{self.debit} K:{self.kredit}"

    def clean(self):
        debit_val = Decimal(str(self.debit or 0))
        kredit_val = Decimal(str(self.kredit or 0))
        if debit_val < Decimal('0.00') or kredit_val < Decimal('0.00'):
            raise ValidationError('Nilai debit dan kredit tidak boleh negatif.')
        if debit_val > Decimal('0.00') and kredit_val > Decimal('0.00'):
            raise ValidationError('Satu baris jurnal tidak boleh memiliki nilai debit dan kredit sekaligus (> 0).')
        if self.akun_id and not self.akun.is_postable:
            raise ValidationError(
                {'akun': f"Akun '{self.akun}' merupakan akun induk/header (is_postable=False) dan tidak boleh diposting langsung."}
            )

    def save(self, *args, **kwargs):
        if self.pk and self.jurnal_id:
            if Jurnal.objects.filter(
                pk=self.jurnal_id,
                status__in=[Jurnal.STATUS_POSTED, Jurnal.STATUS_REVERSED],
            ).exists():
                raise ValidationError(
                    'Baris jurnal pada entri yang sudah diposting atau dibalik (reversed) bersifat immutable.'
                )
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.jurnal_id and Jurnal.objects.filter(
            pk=self.jurnal_id,
            status__in=[Jurnal.STATUS_POSTED, Jurnal.STATUS_REVERSED],
        ).exists():
            raise ValidationError(
                'Baris jurnal pada entri yang sudah diposting atau dibalik (reversed) tidak dapat dihapus.'
            )
        return super().delete(*args, **kwargs)

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
        db_table = 'keuangan_transaksi'
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

    # COB (Coordination of Benefits / Penjaminan Ganda)
    is_cob          = models.BooleanField(default=False, help_text='Penjaminan ganda COB (BPJS + Asuransi)')
    tanggungan_bpjs = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Nominal INA-CBGs / Tanggungan BPJS')
    total_real_rs   = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Total biaya riil RS sebelum dipotong BPJS')

    keterangan    = models.TextField(blank=True)
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='belum_bayar')
    total_tagihan = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_dibayar = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tgl_kirim     = models.DateField(null=True, blank=True)
    xround        = models.CharField(max_length=1, default='N', help_text='Pembulatan Y/N')

    # Audit trail untuk pembatalan invoice (termasuk yang sudah dikirim)
    alasan_batal    = models.TextField(blank=True, default='')
    dibatalkan_oleh = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='faktur_dibatalkan',
    )
    dibatalkan_at   = models.DateTimeField(null=True, blank=True)

    created_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='faktur')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_faktur'
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
                    if self.is_cob and self.tanggungan_bpjs:
                        return max(Decimal('0'), Decimal(str(total_piutang)) - Decimal(str(self.tanggungan_bpjs)))
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
        # Calculate total_tagihan from cost breakdown & COB deduction
        total_real = (
            self.adm + self.jasa + self.farmasi + self.tindakan + self.fisio +
            self.lab + self.rad + self.kamar + self.bhp + self.lainnya + self.ambulan + self.alat
        )
        self.total_real_rs = total_real
        if self.is_cob and self.tanggungan_bpjs:
            self.total_tagihan = max(Decimal('0'), Decimal(str(total_real)) - Decimal(str(self.tanggungan_bpjs)))
        else:
            self.total_tagihan = total_real

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
        elif self.total_dibayar > 0 or effective_total < self.total_tagihan or (self.total_real_rs and effective_total < self.total_real_rs):
            self.status = 'bayar_sebagian'
        else:
            self.status = 'belum_bayar'
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

    class Meta:
        db_table = 'keuangan_faktur_item'

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
        db_table = 'keuangan_pembayaran_faktur'
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
    STATUS_DIAJUKAN = 'diajukan'
    STATUS_SEBAGIAN = 'sebagian'
    STATUS_SEBAGIAN_DIAJUKAN = 'sebagian_diajukan'
    STATUS_LUNAS = 'lunas'
    STATUS_DIBATALKAN = 'dibatalkan'
    STATUS_CHOICES = [
        (STATUS_BELUM_DIBAYAR, 'Belum Dibayar'),
        (STATUS_DIAJUKAN, 'Diajukan'),
        (STATUS_SEBAGIAN, 'Sebagian'),
        (STATUS_SEBAGIAN_DIAJUKAN, 'Sebagian Diajukan'),
        (STATUS_LUNAS, 'Lunas'),
        (STATUS_DIBATALKAN, 'Dibatalkan'),
    ]

    SUMBER_FARMASI = 'farmasi'
    SUMBER_LOGISTIK = 'logistik'
    SUMBER_MANUAL = 'manual'
    SUMBER_KEUANGAN = 'keuangan'
    SUMBER_CHOICES = [
        (SUMBER_FARMASI, 'Farmasi'),
        (SUMBER_LOGISTIK, 'Logistik'),
        (SUMBER_MANUAL, 'Manual'),
        (SUMBER_KEUANGAN, 'Keuangan'),
    ]

    app_siaga_faktur_id = models.CharField(max_length=32, help_text='ID dari tabel sumber (tran_beli_brg_farmasi atau tran_beli_brg_log)')
    sumber = models.CharField(max_length=10, choices=SUMBER_CHOICES, default=SUMBER_FARMASI, help_text='Asal transaksi: farmasi atau logistik')
    nomor_spb = models.CharField(max_length=50, blank=True)
    tanggal_spb = models.DateField(null=True, blank=True)
    nomor_faktur = models.CharField(max_length=100)
    vendor_id = models.IntegerField(help_text='ID rssams.rekanan.id_rekanan')
    vendor_nama = models.CharField(max_length=150, blank=True)
    kategori = models.CharField(max_length=100, blank=True, help_text='Kategori barang/faktur (e.g. ALAT KESEHATAN, OBAT DAN BHP, ATK)')
    tanggal_faktur = models.DateField(null=True, blank=True)
    tanggal_jatuh_tempo = models.DateField(null=True, blank=True)
    nominal = models.DecimalField(max_digits=25, decimal_places=2)
    tanggal_titip = models.DateField(null=True, blank=True)
    keterangan_titip = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_BELUM_DIBAYAR)
    alasan_batal = models.TextField(blank=True, help_text='Alasan pembatalan catatan utang/faktur')
    dibatalkan_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='utang_supplier_dibatalkan')
    dibatalkan_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='utang_supplier_verified')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_utang_supplier'
        ordering = ['-tanggal_faktur', '-created_at']
        indexes = [
            models.Index(fields=['vendor_id'], name='utang_vendor_idx'),
            models.Index(fields=['status'], name='utang_status_idx'),
            models.Index(fields=['tanggal_jatuh_tempo'], name='utang_jtempo_idx'),
            models.Index(fields=['sumber'], name='utang_sumber_idx'),
            models.Index(fields=['nomor_spb'], name='utang_nspb_idx'),
            models.Index(fields=['nomor_faktur'], name='utang_nfaktur_idx'),
            models.Index(fields=['app_siaga_faktur_id'], name='utang_siagafak_idx'),
            models.Index(fields=['kategori'], name='utang_kategori_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['app_siaga_faktur_id', 'sumber'],
                name='utang_faktur_sumber_uniq',
            )
        ]
        verbose_name = 'Utang Supplier'
        verbose_name_plural = 'Utang Supplier'

    def __str__(self):
        return f'{self.nomor_faktur} - {self.vendor_nama or self.vendor_id}'

    @property
    def total_dibayar(self):
        return self.pembayaran.filter(status__in=['realisasi_sebagian', 'realisasi_lunas', 'retur']).aggregate(total=models.Sum('jumlah_bayar'))['total'] or Decimal('0')

    @property
    def total_pending(self):
        return self.pembayaran.filter(status='pending').aggregate(total=models.Sum('jumlah_bayar'))['total'] or Decimal('0')

    @property
    def sisa_utang(self):
        if self.status == self.STATUS_DIBATALKAN:
            return Decimal('0')
        sisa = self.nominal - self.total_dibayar
        return max(sisa, Decimal('0'))

    def refresh_status(self, commit=True):
        if self.status == self.STATUS_DIBATALKAN:
            return self.status

        total_realisasi = self.total_dibayar if self.pk else Decimal('0')
        total_pending = self.total_pending if self.pk else Decimal('0')

        if total_realisasi >= self.nominal:
            self.status = self.STATUS_LUNAS
        elif total_realisasi > 0:
            if total_pending > 0:
                self.status = self.STATUS_SEBAGIAN_DIAJUKAN
            else:
                self.status = self.STATUS_SEBAGIAN
        else:
            if total_pending > 0:
                self.status = self.STATUS_DIAJUKAN
            else:
                self.status = self.STATUS_BELUM_DIBAYAR

        if commit:
            self.save(update_fields=['status', 'updated_at'])
        return self.status

class DepositVendor(models.Model):
    vendor_id = models.IntegerField(db_index=True, help_text='ID rssams.rekanan.id_rekanan')
    vendor_nama = models.CharField(max_length=150, blank=True)
    utang_asal = models.ForeignKey(UtangSupplier, on_delete=models.SET_NULL, null=True, blank=True, related_name='deposit_terbuat')
    nominal_retur = models.DecimalField(max_digits=25, decimal_places=2)
    terpakai = models.DecimalField(max_digits=25, decimal_places=2, default=Decimal('0'))
    keterangan = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='deposit_vendor_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_deposit_vendor'
        ordering = ['-created_at']
        verbose_name = 'Deposit Vendor (Retur)'
        verbose_name_plural = 'Deposit Vendor (Retur)'

    def __str__(self):
        return f'{self.vendor_nama} - Sisa Rp {self.sisa_deposit}'

    @property
    def sisa_deposit(self):
        sisa = self.nominal_retur - (self.terpakai or Decimal('0'))
        return max(sisa, Decimal('0'))

class PembayaranUtang(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_REALISASI_SEBAGIAN = 'realisasi_sebagian'
    STATUS_REALISASI_LUNAS = 'realisasi_lunas'
    STATUS_DITOLAK = 'ditolak'
    STATUS_RETUR = 'retur'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Dalam Pengajuan'),
        (STATUS_REALISASI_SEBAGIAN, 'Realisasi Sebagian'),
        (STATUS_REALISASI_LUNAS, 'Realisasi Pelunasan'),
        (STATUS_DITOLAK, 'Ditolak'),
        (STATUS_RETUR, 'Retur Barang'),
    ]

    utang = models.ForeignKey(UtangSupplier, on_delete=models.PROTECT, related_name='pembayaran')
    tanggal_rencana_bayar = models.DateField(null=True, blank=True)
    tanggal_proses = models.DateField()
    tanggal_app = models.DateField(null=True, blank=True)
    jumlah_bayar = models.DecimalField(max_digits=25, decimal_places=2)
    potongan_deposit = models.DecimalField(max_digits=25, decimal_places=2, default=Decimal('0'), help_text='Nominal potongan dari deposit retur vendor')
    jumlah_kas_keluar = models.DecimalField(max_digits=25, decimal_places=2, default=Decimal('0'), help_text='Nominal aktual kas/bank yang dikeluarkan')
    keterangan = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='pembayaran_utang')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'keuangan_pembayaran_utang'
        ordering = ['-tanggal_proses', '-created_at']
        indexes = [
            models.Index(fields=['utang', 'tanggal_proses'], name='payutang_utang_tgl_idx'),
            models.Index(fields=['status'], name='payutang_status_idx'),
            models.Index(fields=['created_at'], name='payutang_created_idx'),
        ]
        verbose_name = 'Pembayaran Utang'
        verbose_name_plural = 'Pembayaran Utang'

    def __str__(self):
        return f'{self.utang.nomor_faktur} - {self.jumlah_bayar} ({self.tanggal_proses})'

    def clean(self):
        if self.jumlah_bayar and self.jumlah_bayar <= 0:
            raise ValidationError('Jumlah bayar harus lebih dari 0.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
        if hasattr(self, 'utang') and self.utang:
            self.utang.refresh_status()

    def delete(self, *args, **kwargs):
        utang = self.utang
        super().delete(*args, **kwargs)
        utang.refresh_status()

class IndukPembiayaan(models.Model):
    nama        = models.CharField(max_length=150, unique=True, help_text='Nama Induk Pembiayaan / Payor Group')
    kode        = models.CharField(max_length=50, blank=True, help_text='Kode singkatan / identitas')
    keterangan  = models.TextField(blank=True)
    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='induk_pembiayaan_created')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_induk_pembiayaan'
        ordering = ['nama']
        verbose_name = 'Induk Pembiayaan'
        verbose_name_plural = 'Daftar Induk Pembiayaan'

    def __str__(self):
        return self.nama

class PembiayaanIndukMapping(models.Model):
    induk           = models.ForeignKey(IndukPembiayaan, on_delete=models.CASCADE, related_name='anggota')
    id_pembiayaan   = models.CharField(max_length=20, unique=True, db_index=True, help_text='ID dari rssams.pbiaya')
    nama_pembiayaan = models.CharField(max_length=150, blank=True, help_text='Nama pembiayaan/asuransi anak')
    created_by      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='pembiayaan_mapping_created')
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'keuangan_pembiayaan_induk_mapping'
        ordering = ['nama_pembiayaan']
        verbose_name = 'Pemetaan Induk Pembiayaan'
        verbose_name_plural = 'Pemetaan Induk Pembiayaan'

    def __str__(self):
        return f"{self.nama_pembiayaan} (ID: {self.id_pembiayaan}) -> {self.induk.nama}"

class AlokasiDana(models.Model):
    BANK_CHOICES = [
        ('bsi', 'BSI'),
        ('bri', 'BRI'),
        ('mandiri', 'Mandiri'),
        ('bca', 'BCA'),
    ]

    id_pembiayaan       = models.CharField(max_length=20, blank=True, default='', help_text='ID dari rssams.pbiaya atau kosong jika induk pool')
    nama_pembiayaan     = models.CharField(max_length=150, help_text='Nama pembiayaan/asuransi atau nama induk')
    induk_pembiayaan    = models.ForeignKey(IndukPembiayaan, on_delete=models.SET_NULL, null=True, blank=True, related_name='alokasi_dana', help_text='Jika alokasi ini adalah pool induk')
    is_induk            = models.BooleanField(default=False, help_text='True jika alokasi dana untuk seluruh anak di bawah induk')
    tanggal_penerimaan  = models.DateField()
    jumlah_penerimaan   = models.DecimalField(max_digits=15, decimal_places=2)
    bank                = models.CharField(max_length=20, choices=BANK_CHOICES)
    total_alokasi       = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    sisa_alokasi        = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    keterangan          = models.TextField(blank=True)

    created_by      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='alokasi_dana')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_alokasi_dana'
        ordering = ['-tanggal_penerimaan', '-created_at']
        verbose_name = 'Alokasi Dana'
        verbose_name_plural = 'Alokasi Dana'

    def __str__(self):
        prefix = "[INDUK] " if self.is_induk else ""
        return f"{prefix}{self.nama_pembiayaan} - {self.jumlah_penerimaan} ({self.bank})"

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
        db_table = 'keuangan_alokasi_dana_pemakaian'
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
        db_table = 'keuangan_tagihan'
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

    class Meta:
        db_table = 'keuangan_tagihan_item'

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
        db_table = 'keuangan_pembayaran_tagihan'
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
    akun_akuntansi = models.ForeignKey(
        Akun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rekening_bank_list',
        help_text='Akun CoA Bank terkait di Buku Besar',
    )
    keterangan     = models.TextField(blank=True)
    is_active      = models.BooleanField(default=True)
    updated_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='rekening_updates')
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_rekening_bank'
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
        db_table = 'keuangan_riwayat_saldo_rekening'
        ordering = ['-created_at']
        verbose_name = 'Riwayat Saldo Rekening'

    def __str__(self):
        return f"{self.rekening.nomor_rekening} | {self.saldo_sebelum} → {self.saldo_sesudah}"

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

def berkas_kb_path(instance, filename):
    return f'kas_besar/{instance.no_pengajuan}/{filename}'

def nota_kb_path(instance, filename):
    return f'kas_besar/nota/{instance.kas_besar.no_pengajuan}/{filename}'

def foto_laporan_kb_path(instance, filename):
    return f'kas_besar/laporan/{instance.laporan.kas_besar.no_pengajuan}/foto/{filename}'

def berkas_saldo_path(instance, filename):
    return f'petty_cash/lampiran_saldo/{instance.no_pengajuan}/{filename}'

class PettyCash(models.Model):
    STATUS_CHOICES = [
        ('pending',               'Pending'),
        ('disetujui',             'Disetujui'),
        ('ditolak',               'Ditolak'),
        ('dicairkan',             'Dicairkan'),
        ('menunggu_approval_laporan', 'Menunggu Approval Laporan'),
        ('dilaporkan',            'Dilaporkan'),
        ('menunggu_pengembalian', 'Menunggu Pengembalian'),
        ('menunggu_reimburse',    'Menunggu Reimbursement'),
        ('selesai',               'Selesai'),
        ('dibatalkan',            'Dibatalkan'),
    ]

    no_pengajuan   = models.CharField(max_length=20, unique=True, editable=False)
    tanggal        = models.DateField()
    keperluan      = models.TextField()
    nominal        = models.DecimalField(max_digits=15, decimal_places=2)
    nominal_awal   = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text='Nominal pengajuan awal sebelum penyesuaian reimburse lokal')
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
        db_table = 'petty_cash'
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
        if not self.nominal_awal and self.nominal is not None:
            self.nominal_awal = self.nominal
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_pengajuan} - {self.status}"

class LaporanPenggunaan(models.Model):
    petty_cash           = models.OneToOneField(PettyCash, on_delete=models.CASCADE, related_name='laporan')
    tanggal_laporan      = models.DateField()
    tanggal_nota         = models.DateField(null=True, blank=True, help_text='Tanggal nota / kuitansi riil belanja')
    nominal_digunakan    = models.DecimalField(max_digits=15, decimal_places=2)
    subtotal             = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    diskon               = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    selisih              = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rincian              = models.TextField()
    nota                 = models.FileField(upload_to=nota_pc_path, null=True, blank=True)
    pengembalian_selesai = models.BooleanField(default=False)
    dikonfirmasi_oleh    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='konfirmasi_laporan')
    created_at           = models.DateTimeField(auto_now_add=True)
    updated_at           = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'petty_cash_laporan_penggunaan'
        verbose_name = 'Laporan Penggunaan'
        verbose_name_plural = 'Laporan Penggunaan'

    def __str__(self):
        return f"Laporan {self.petty_cash.no_pengajuan}"

class ItemLaporanPenggunaan(models.Model):
    laporan     = models.ForeignKey(LaporanPenggunaan, on_delete=models.CASCADE, related_name='items')
    akun        = models.ForeignKey(
        Akun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='item_laporan_petty_cash',
        help_text='Referensi langsung ke Master Akun (CoA)',
    )
    kode_akun   = models.CharField(max_length=30)
    nama_akun   = models.CharField(max_length=150)
    pos_biaya   = models.CharField(max_length=100, blank=True)
    deskripsi   = models.TextField()
    qty         = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    harga_satuan = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    nilai       = models.DecimalField(max_digits=15, decimal_places=2)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'petty_cash_laporan_item'
        ordering = ['id']
        verbose_name = 'Item Laporan Penggunaan'
        verbose_name_plural = 'Item Laporan Penggunaan'

    def save(self, *args, **kwargs):
        if self.akun_id:
            if not self.kode_akun:
                self.kode_akun = self.akun.kode_akun
            if not self.nama_akun:
                self.nama_akun = self.akun.nama_akun
        elif self.kode_akun:
            clean_code = str(self.kode_akun).replace('.', '').strip()
            matched = Akun.objects.filter(kode_akun__in=[self.kode_akun.strip(), clean_code], is_postable=True).first()
            if matched:
                self.akun = matched
                if not self.nama_akun:
                    self.nama_akun = matched.nama_akun
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.kode_akun} - {self.nama_akun}: {self.nilai}"

class Reimbursement(models.Model):
    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('disetujui',  'Disetujui'),
        ('ditolak',    'Ditolak'),
        ('dicairkan',  'Dicairkan'),
        ('lunas',      'Lunas'),
        ('dibatalkan', 'Dibatalkan'),
    ]

    no_reimbursement = models.CharField(max_length=20, unique=True, editable=False)
    tanggal          = models.DateField(help_text="Tanggal pengajuan (hari ini)")
    tanggal_nota     = models.DateField(null=True, blank=True, help_text="Tanggal bukti transaksi nota/kuitansi fisik")
    keperluan        = models.TextField()
    nominal          = models.DecimalField(max_digits=15, decimal_places=2)
    keterangan       = models.TextField(blank=True)
    berkas           = models.FileField(upload_to=berkas_rb_path)
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    catatan_tolak    = models.TextField(blank=True)
    created_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='reimbursement_pengajuan')
    disetujui_oleh   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursement_disetujui')
    dicairkan_oleh   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursement_dicairkan')
    kas_besar        = models.ForeignKey('KasBesar', on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursements', help_text="Referensi Kas Besar jika reimbursement berasal dari kekurangan belanja")
    petty_cash       = models.ForeignKey('PettyCash', on_delete=models.SET_NULL, null=True, blank=True, related_name='reimbursements', help_text="Referensi Petty Cash jika reimbursement berasal dari kekurangan belanja")
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'petty_cash_reimbursement'
        ordering = ['-created_at']
        verbose_name = 'Reimbursement'
        verbose_name_plural = 'Reimbursement'

    def save(self, *args, **kwargs):
        from datetime import date
        if not self.tanggal:
            self.tanggal = date.today()
        if not self.no_reimbursement:
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
        db_table = 'petty_cash_foto_reimbursement'
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
        db_table = 'petty_cash_foto'
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
    foto = models.FileField(upload_to=foto_laporan_penggunaan_path)
    urutan = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'petty_cash_foto_laporan'
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Laporan Penggunaan'
        verbose_name_plural = 'Foto Laporan Penggunaan'

    def __str__(self):
        return f"Foto {self.urutan} - Laporan {self.laporan.petty_cash.no_pengajuan}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save if file is an image
        if self.foto:
            ext = str(self.foto.name).lower().split('.')[-1]
            if ext in ['jpg', 'jpeg', 'png', 'webp']:
                try:
                    from .utils_image import compress_image
                    compress_image(self.foto, max_width=1920, max_height=1920, quality=75)
                except Exception:
                    pass

        super().save(*args, **kwargs)

class KasBesar(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('menunggu_realisasi', 'Menunggu Realisasi'),
        ('disetujui', 'Disetujui'),
        ('ditolak', 'Ditolak'),
        ('dicairkan', 'Dicairkan'),
        ('menunggu_approval_laporan', 'Menunggu Approval Laporan'),
        ('dilaporkan', 'Dilaporkan'),
        ('menunggu_pengembalian', 'Menunggu Pengembalian'),
        ('menunggu_reimburse', 'Menunggu Reimbursement'),
        ('selesai', 'Selesai'),
        ('dibatalkan', 'Dibatalkan'),
    ]

    no_pengajuan = models.CharField(max_length=20, unique=True, editable=False)
    tanggal = models.DateField()
    keperluan = models.TextField()
    nominal = models.DecimalField(max_digits=15, decimal_places=2)
    keterangan = models.TextField(blank=True)
    berkas = models.FileField(upload_to=berkas_kb_path, null=True, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    catatan_tolak = models.TextField(blank=True)
    alasan_batal = models.TextField(blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='kas_besar_pengajuan')
    disetujui_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='kas_besar_disetujui')
    dicairkan_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='kas_besar_dicairkan')
    laporan_disetujui_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='kas_besar_laporan_disetujui')
    
    sumber_petty_cash = models.ForeignKey('PettyCash', on_delete=models.SET_NULL, null=True, blank=True, related_name='kas_besar_pengalihan', help_text="Referensi Petty Cash jika ini adalah hasil pengalihan")
    
    laporan_disetujui_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_kas_besar'
        ordering = ['-created_at']
        verbose_name = 'Kas Besar'
        verbose_name_plural = 'Kas Besar'

    def save(self, *args, **kwargs):
        if not self.no_pengajuan:
            from datetime import date
            today = date.today()
            prefix = f"KB-{today.strftime('%Y%m')}-"
            last = KasBesar.objects.filter(no_pengajuan__startswith=prefix).order_by('no_pengajuan').last()
            if last:
                last_num = int(last.no_pengajuan.split('-')[-1])
                self.no_pengajuan = f"{prefix}{str(last_num + 1).zfill(3)}"
            else:
                self.no_pengajuan = f"{prefix}001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.no_pengajuan} - {self.status}"

class LaporanPenggunaanKasBesar(models.Model):
    kas_besar = models.OneToOneField(KasBesar, on_delete=models.CASCADE, related_name='laporan')
    tanggal_laporan = models.DateField()
    tanggal_nota = models.DateField(null=True, blank=True, help_text='Tanggal nota / kuitansi riil belanja')
    nominal_digunakan = models.DecimalField(max_digits=15, decimal_places=2)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    diskon = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    selisih = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    rincian = models.TextField()
    nota = models.FileField(upload_to=nota_kb_path, null=True, blank=True)
    pengembalian_selesai = models.BooleanField(default=False)
    dikonfirmasi_oleh = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='konfirmasi_laporan_kb')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'keuangan_kas_besar_laporan'
        verbose_name = 'Laporan Penggunaan Kas Besar'
        verbose_name_plural = 'Laporan Penggunaan Kas Besar'

    def __str__(self):
        return f"Laporan {self.kas_besar.no_pengajuan}"

class ItemLaporanKasBesar(models.Model):
    laporan = models.ForeignKey(LaporanPenggunaanKasBesar, on_delete=models.CASCADE, related_name='items')
    akun = models.ForeignKey(
        Akun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='item_laporan_kas_besar',
        help_text='Referensi langsung ke Master Akun (CoA)',
    )
    kode_akun = models.CharField(max_length=30)
    nama_akun = models.CharField(max_length=150)
    pos_biaya = models.CharField(max_length=100, blank=True)
    deskripsi = models.TextField()
    qty = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    harga_satuan = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    nilai = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'keuangan_kas_besar_laporan_item'
        ordering = ['id']
        verbose_name = 'Item Laporan Kas Besar'
        verbose_name_plural = 'Item Laporan Kas Besar'

    def save(self, *args, **kwargs):
        if self.akun_id:
            if not self.kode_akun:
                self.kode_akun = self.akun.kode_akun
            if not self.nama_akun:
                self.nama_akun = self.akun.nama_akun
        elif self.kode_akun:
            clean_code = str(self.kode_akun).replace('.', '').strip()
            matched = Akun.objects.filter(kode_akun__in=[self.kode_akun.strip(), clean_code], is_postable=True).first()
            if matched:
                self.akun = matched
                if not self.nama_akun:
                    self.nama_akun = matched.nama_akun
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.kode_akun} - {self.nama_akun}: {self.nilai}"

class FotoLaporanKasBesar(models.Model):
    laporan = models.ForeignKey(LaporanPenggunaanKasBesar, on_delete=models.CASCADE, related_name='foto_list')
    foto = models.FileField(upload_to=foto_laporan_kb_path)
    urutan = models.PositiveIntegerField(default=1, help_text='Urutan foto')
    keterangan = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'keuangan_kas_besar_foto_laporan'
        ordering = ['urutan', 'created_at']
        verbose_name = 'Foto Laporan Kas Besar'
        verbose_name_plural = 'Foto Laporan Kas Besar'

    def __str__(self):
        return f"Foto {self.urutan} - Laporan {self.laporan.kas_besar.no_pengajuan}"

    def save(self, *args, **kwargs):
        # Auto-compress image on save if file is an image
        if self.foto:
            ext = str(self.foto.name).lower().split('.')[-1]
            if ext in ['jpg', 'jpeg', 'png', 'webp']:
                try:
                    from .utils_image import compress_image
                    compress_image(self.foto, max_width=1920, max_height=1920, quality=75)
                except Exception:
                    pass
        super().save(*args, **kwargs)

class SaldoPettyCash(models.Model):
    """Singleton — hanya ada 1 row (pk=1)"""
    saldo          = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    akun_akuntansi = models.ForeignKey(
        Akun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saldo_petty_cash_list',
        help_text='Akun CoA Kas Kecil terkait di Buku Besar',
    )
    updated_by     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='saldo_pc_updates'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'petty_cash_saldo'
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
        db_table = 'petty_cash_riwayat_saldo'
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
    keterangan       = models.TextField(blank=True, default='')
    nominal_diajukan = models.DecimalField(
        max_digits=15, decimal_places=2, null=True, blank=True,
        help_text='Diisi direktur saat menyetujui'
    )
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    catatan_tolak    = models.TextField(blank=True)
    berkas           = models.FileField(upload_to=berkas_saldo_path, null=True, blank=True, help_text='Lampiran print out / rekap Laporan PC')
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
        db_table = 'petty_cash_pengajuan_saldo'
        ordering        = ['-created_at']
        verbose_name    = 'Pengajuan Penambahan Saldo'
        verbose_name_plural = 'Pengajuan Penambahan Saldo'

    def save(self, *args, **kwargs):
        if not self.no_pengajuan:
            from datetime import date
            today  = date.today()
            prefix = f"PPC-{today.strftime('%Y%m')}-"
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


def foto_it_repair_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'it/repair/{period}/{filename}'

def foto_inventory_asset_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'inventaris/aset/{period}/{filename}'