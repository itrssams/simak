import re

from datetime import timedelta

from decimal import Decimal

from rest_framework import serializers

from django.contrib.auth import get_user_model

from django.db import connection

from .models import (
    Akun, Transaksi, Jurnal, JurnalItem,
    Pelanggan, Pemasok,
    Faktur, FakturItem, PembayaranFaktur, AlokasiDana,
    IndukPembiayaan, PembiayaanIndukMapping,
    UtangSupplier, PembayaranUtang, DepositVendor,
    Tagihan, TagihanItem, PembayaranTagihan,
    RekeningBank, RiwayatSaldoRekening,
    
    PettyCash, LaporanPenggunaan, ItemLaporanPenggunaan, Reimbursement, SaldoPettyCash, RiwayatSaldoPettyCash, PengajuanPenambahanSaldo,
)

from system.audit import infer_target, make_description, target_display_from_user

from system.audit import get_keuangan_target_display

KUNJUNGAN_TOTAL_SQL = """
    COALESCE(a.adm,0)+COALESCE(a.jasa,0)+COALESCE(a.farmasi,0)+COALESCE(a.tindakan,0)+
    COALESCE(a.fisio,0)+COALESCE(a.lab,0)+COALESCE(a.lab_pa,0)+COALESCE(a.kamar,0)+
    COALESCE(a.rad,0)+COALESCE(a.bhp,0)+COALESCE(a.lainnya,0)+COALESCE(a.ambulan,0)+COALESCE(a.alat,0)
"""

def _dict_fetchall(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

def _detect_type_from_j_lay(j_lay):
    value = str(j_lay or '')
    if len(value) >= 20 and value[19:20] == '1':
        return 'OK'
    if len(value) >= 19 and value[18:19] == '1':
        return 'VK'
    if len(value) >= 18 and value[17:18] == '1':
        return 'Rawat Jalan'
    if len(value) >= 17 and value[16:17] == '1':
        return 'Rawat Inap'
    if len(value) >= 16 and value[15:16] == '1':
        return 'UGD'
    return 'Kunjungan'

def user_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username

def user_unit_label(user):
    if not user:
        return ''
    if user.unit:
        return user.unit.nama
    if getattr(user, 'is_driver', False):
        return 'Driver'
    if getattr(user, 'is_it', False):
        return 'IT'
    role_labels = {
        'direktur': 'Direktur',
        'wakil_direktur': 'Wakil Direktur',
        'manajer': 'Manajer',
        'kepala_seksi': 'Kepala Seksi',
        'karyawan': 'Karyawan Tanpa Unit',
    }
    return role_labels.get(user.role, 'Tanpa Unit')

def infer_riwayat_saldo_user(obj):
    ket = obj.keterangan or ''

    match = re.search(r'petty cash\s+([A-Z]+-\d+-\d+)', ket, re.I)
    if match:
        pc = PettyCash.objects.select_related('created_by', 'created_by__unit').filter(no_pengajuan=match.group(1)).first()
        if pc:
            return pc.created_by

    match = re.search(r'Reimbursement\s+([A-Z]+-\d+-\d+)', ket, re.I)
    if match:
        rb = Reimbursement.objects.select_related('created_by', 'created_by__unit').filter(no_reimbursement=match.group(1)).first()
        if rb:
            return rb.created_by

    match = re.search(r'pengajuan\s+([A-Z]+-\d+-\d+)', ket, re.I)
    if match:
        top_up = PengajuanPenambahanSaldo.objects.select_related('created_by', 'created_by__unit').filter(no_pengajuan=match.group(1)).first()
        if top_up:
            return top_up.created_by

    return None

class AkunSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Akun
        fields = '__all__'

class PelangganSerializer(serializers.ModelSerializer):
    tipe_label = serializers.CharField(source='get_tipe_display', read_only=True)

    class Meta:
        model  = Pelanggan
        fields = '__all__'

class PemasokSerializer(serializers.ModelSerializer):
    tipe_label = serializers.CharField(source='get_tipe_display', read_only=True)

    class Meta:
        model  = Pemasok
        fields = '__all__'

class TransaksiSerializer(serializers.ModelSerializer):
    akun_detail     = AkunSerializer(source='akun', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = Transaksi
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']

class TransaksiInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Transaksi
        fields = ['tanggal', 'nomor_referensi', 'keterangan', 'jenis', 'kategori_arus', 'sub_kategori', 'akun', 'jumlah']

class JurnalItemSerializer(serializers.ModelSerializer):
    akun_detail = AkunSerializer(source='akun', read_only=True)

    class Meta:
        model  = JurnalItem
        fields = '__all__'

class JurnalItemInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = JurnalItem
        fields = ['akun', 'keterangan', 'debit', 'kredit']

class JurnalSerializer(serializers.ModelSerializer):
    items           = JurnalItemSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    total_debit     = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_kredit    = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    is_balanced     = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Jurnal
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']

class JurnalInputSerializer(serializers.ModelSerializer):
    items = JurnalItemInputSerializer(many=True)

    class Meta:
        model  = Jurnal
        fields = ['nomor_jurnal', 'tanggal', 'keterangan', 'status', 'items']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        jurnal = Jurnal.objects.create(**validated_data)
        for item in items_data:
            JurnalItem.objects.create(jurnal=jurnal, **item)
        return jurnal

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', [])
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data:
            instance.items.all().delete()
            for item in items_data:
                JurnalItem.objects.create(jurnal=instance, **item)
        return instance

class FakturItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FakturItem
        fields = '__all__'

class FakturItemInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FakturItem
        fields = ['deskripsi', 'kuantitas', 'harga_satuan', 'subtotal']

class PembiayaanIndukMappingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    induk_nama = serializers.CharField(source='induk.nama', read_only=True)

    class Meta:
        model = PembiayaanIndukMapping
        fields = ['id', 'induk', 'induk_nama', 'id_pembiayaan', 'nama_pembiayaan', 'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

class IndukPembiayaanSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    total_anggota = serializers.IntegerField(source='anggota.count', read_only=True)
    anggota = PembiayaanIndukMappingSerializer(many=True, read_only=True)

    class Meta:
        model = IndukPembiayaan
        fields = ['id', 'nama', 'kode', 'keterangan', 'total_anggota', 'anggota', 'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

class AlokasiDanaSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    digunakan = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    pemakaian = serializers.SerializerMethodField()
    induk_pembiayaan_nama = serializers.CharField(source='induk_pembiayaan.nama', read_only=True)
    
    class Meta:
        model  = AlokasiDana
        fields = [
            'id', 'id_pembiayaan', 'nama_pembiayaan', 'induk_pembiayaan', 'induk_pembiayaan_nama', 'is_induk',
            'tanggal_penerimaan', 'jumlah_penerimaan', 'bank', 'total_alokasi', 'sisa_alokasi',
            'digunakan', 'pemakaian', 'created_by', 'created_by_name', 'created_at', 'updated_at', 'keterangan'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'total_alokasi', 'sisa_alokasi', 'digunakan']

    def get_pemakaian(self, obj):
        legacy_pemakaian = [
            {
                'id': bayar.id,
                'tanggal': bayar.tanggal,
                'jumlah': bayar.jumlah,
                'metode': bayar.metode,
                'keterangan': bayar.keterangan,
                'faktur': bayar.faktur_id,
                'nomor_faktur': getattr(bayar.faktur, 'nomor_faktur', ''),
                'created_by_name': bayar.created_by.username if bayar.created_by else '',
                'created_at': bayar.created_at,
            }
            for bayar in obj.pembayaran.all()
        ]
        wallet_pemakaian = [
            {
                'id': pakai.id,
                'tanggal': pakai.pembayaran.tanggal,
                'jumlah': pakai.jumlah,
                'metode': pakai.pembayaran.metode,
                'keterangan': pakai.pembayaran.keterangan,
                'faktur': pakai.pembayaran.faktur_id,
                'nomor_faktur': getattr(pakai.pembayaran.faktur, 'nomor_faktur', ''),
                'created_by_name': pakai.pembayaran.created_by.username if pakai.pembayaran.created_by else '',
                'created_at': pakai.created_at,
            }
            for pakai in obj.pemakaian_alokasi.select_related('pembayaran__faktur', 'pembayaran__created_by').all()
        ]
        return legacy_pemakaian + wallet_pemakaian

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        if instance and instance.digunakan > 0:
            locked_fields = {
                'id_pembiayaan', 'nama_pembiayaan', 'tanggal_penerimaan',
                'jumlah_penerimaan', 'bank',
            }
            changed = []
            for field in locked_fields:
                if field in attrs and attrs[field] != getattr(instance, field):
                    changed.append(field)
            if changed:
                raise serializers.ValidationError({
                    'detail': 'Alokasi yang sudah dipakai hanya boleh mengubah keterangan.'
                })
        return attrs

    def update(self, instance, validated_data):
        if instance.digunakan == 0 and 'jumlah_penerimaan' in validated_data:
            instance.total_alokasi = validated_data['jumlah_penerimaan']
        return super().update(instance, validated_data)

class PembayaranFakturSerializer(serializers.ModelSerializer):
    akun_detail     = AkunSerializer(source='akun', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    verified_by_name = serializers.CharField(source='verified_by.username', read_only=True)
    status_verifikasi_label = serializers.CharField(source='get_status_verifikasi_display', read_only=True)
    alokasi_dana_detail = AlokasiDanaSerializer(source='alokasi_dana', read_only=True)

    class Meta:
        model  = PembayaranFaktur
        fields = [
            'id', 'faktur', 'tanggal', 'jumlah', 'metode', 'keterangan', 'akun',
            'akun_detail', 'alokasi_dana', 'alokasi_dana_detail', 'created_by',
            'created_by_name', 'created_at', 'status_verifikasi', 'status_verifikasi_label',
            'verified_by', 'verified_by_name', 'verified_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'status_verifikasi', 'verified_by', 'verified_at']

class PembayaranFakturInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PembayaranFaktur
        fields = ['faktur', 'tanggal', 'jumlah', 'metode', 'keterangan', 'akun', 'alokasi_dana']

class FakturSerializer(serializers.ModelSerializer):
    items            = FakturItemSerializer(many=True, read_only=True)
    pembayaran       = PembayaranFakturSerializer(many=True, read_only=True)
    pelanggan_detail = PelangganSerializer(source='pelanggan', read_only=True)
    created_by_name  = serializers.CharField(source='created_by.username', read_only=True)
    sisa_tagihan     = serializers.SerializerMethodField()
    total_dibayar    = serializers.SerializerMethodField()
    total_piutang    = serializers.SerializerMethodField()
    total_real_rs    = serializers.SerializerMethodField()
    status           = serializers.SerializerMethodField()
    status_label     = serializers.SerializerMethodField()
    pasien_invoice   = serializers.SerializerMethodField()
    dibatalkan_oleh_nama = serializers.SerializerMethodField()

    def get_total_real_rs(self, obj):
        val = Decimal(str(obj.total_real_rs or 0))
        if val > 0:
            return val
        breakdown_total = (
            Decimal(str(obj.adm or 0)) + Decimal(str(obj.jasa or 0)) + Decimal(str(obj.farmasi or 0)) + Decimal(str(obj.tindakan or 0)) +
            Decimal(str(obj.fisio or 0)) + Decimal(str(obj.lab or 0)) + Decimal(str(obj.rad or 0)) + Decimal(str(obj.kamar or 0)) +
            Decimal(str(obj.bhp or 0)) + Decimal(str(obj.lainnya or 0)) + Decimal(str(obj.ambulan or 0)) + Decimal(str(obj.alat or 0))
        )
        if breakdown_total > 0:
            return breakdown_total
        return Decimal(str(obj.total_tagihan or 0)) + Decimal(str(obj.tanggungan_bpjs or 0))

    def get_dibatalkan_oleh_nama(self, obj):
        if obj.dibatalkan_oleh:
            return obj.dibatalkan_oleh.get_full_name() or obj.dibatalkan_oleh.username
        return None

    def get_total_dibayar(self, obj):
        return obj._get_verified_total_dibayar() if hasattr(obj, '_get_verified_total_dibayar') else obj.total_dibayar

    def get_sisa_tagihan(self, obj):
        if hasattr(obj, 'sisa_tagihan'):
            return obj.sisa_tagihan
        return Decimal('0')

    def get_total_piutang(self, obj):
        if obj.nomor_faktur:
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
                        [obj.nomor_faktur]
                    )
                    total_piutang, total_rows = cursor.fetchone()
                if total_rows:
                    if obj.is_cob and obj.tanggungan_bpjs:
                        return max(Decimal('0'), Decimal(str(total_piutang)) - Decimal(str(obj.tanggungan_bpjs)))
                    return total_piutang
            except Exception:
                pass
        return obj.sisa_tagihan

    def _get_effective_status(self, obj):
        """Hitung status LIVE (bukan cuma andelin field DB), karena
        jmlbyr di rssams.kunjung bisa berubah dari sistem lama (kasir/APP_SIAGA)
        tanpa lewat Django, sehingga field `status` tersimpan bisa stale
        walau sisa_tagihan/total_piutang (live query) udah 0."""
        if obj.status == 'batal':
            return 'batal'
        total_real = self.get_total_real_rs(obj)
        total_tagihan = Decimal(str(obj.total_tagihan or 0))
        total_piutang = self.get_total_piutang(obj)
        total_dibayar = self.get_total_dibayar(obj)
        sisa = total_piutang - total_dibayar
        if sisa <= 0:
            return 'lunas'
        if total_dibayar > 0 or total_piutang < total_real or total_piutang < total_tagihan:
            return 'bayar_sebagian'
        return 'belum_bayar'

    def get_status(self, obj):
        return self._get_effective_status(obj)

    def get_status_label(self, obj):
        effective_status = self._get_effective_status(obj)
        return dict(Faktur.STATUS_CHOICES).get(effective_status, effective_status)

    def get_pasien_invoice(self, obj):
        view = self.context.get('view')
        if getattr(view, 'action', None) == 'list' or not obj.nomor_faktur:
            return []
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        a.no, a.noreg, b.nama, b.sex, DATE(a.tgl_masuk) AS tgl_masuk,
                        DATE(a.tgl_keluar) AS tgl_keluar, a.id_pembiayaan,
                        c.pembiayaan AS nama_pembiayaan, a.cek, a.j_lay,
                        IFNULL(e.no_invoice, '') AS no_invoice,
                        ({KUNJUNGAN_TOTAL_SQL}) AS total_biaya,
                        a.dp3, a.jmlbyr
                    FROM rssams.kunjung a
                    INNER JOIN rssams.regpasien b ON a.noreg = b.noreg
                    LEFT JOIN rssams.pbiaya c ON a.id_pembiayaan = c.id_pembiayaan
                    INNER JOIN rssams.verif_kunjung e ON a.no = e.no
                    WHERE e.no_invoice = %s
                    ORDER BY a.tgl_masuk DESC, a.no DESC
                    """,
                    [obj.nomor_faktur]
                )
                rows = _dict_fetchall(cursor)
                for row in rows:
                    row['jenis_label'] = _detect_type_from_j_lay(row.get('j_lay'))
                    row['status_done'] = bool(row.get('cek'))
                    row['status_invoice'] = 'sudah' if row.get('no_invoice') else 'belum'
                    total_b = Decimal(str(row.get('total_biaya') or 0))
                    dp3_val = Decimal(str(row.get('dp3') or 0))
                    jmlbyr_val = Decimal(str(row.get('jmlbyr') or 0))
                    row['total_piutang'] = dp3_val if dp3_val > 0 else max(Decimal('0'), total_b - jmlbyr_val)
                    row['total_dibayar_pasien'] = jmlbyr_val
                return rows
        except Exception as e:
            import logging
            logging.getLogger(__name__).error('Error in get_pasien_invoice: %s', e)
            return []

    class Meta:
        model  = Faktur
        fields = [
            'id', 'nomor_faktur', 'tanggal', 'jatuh_tempo', 'pelanggan', 'pelanggan_detail',
            'id_pembiayaan', 'nama_pembiayaan', 'jenis', 'periode', 'beban',
            'adm', 'jasa', 'farmasi', 'tindakan', 'fisio', 'lab', 'rad', 'kamar',
            'bhp', 'lainnya', 'ambulan', 'alat', 'ppn_farmasi',
            'is_cob', 'tanggungan_bpjs', 'total_real_rs',
            'total_tagihan', 'total_dibayar', 'sisa_tagihan', 'total_piutang', 'status', 'status_label',
            'tgl_kirim', 'xround', 'items', 'pembayaran', 'keterangan', 'pasien_invoice',
            'alasan_batal', 'dibatalkan_oleh', 'dibatalkan_oleh_nama', 'dibatalkan_at',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'total_tagihan', 'total_dibayar', 'sisa_tagihan']

class FakturInputSerializer(serializers.ModelSerializer):
    items = FakturItemInputSerializer(many=True, required=False)

    class Meta:
        model  = Faktur
        fields = [
            'nomor_faktur', 'tanggal', 'jatuh_tempo', 'pelanggan',
            'id_pembiayaan', 'nama_pembiayaan', 'jenis', 'periode', 'beban',
            'adm', 'jasa', 'farmasi', 'tindakan', 'fisio', 'lab', 'rad', 'kamar',
            'bhp', 'lainnya', 'ambulan', 'alat', 'ppn_farmasi',
            'is_cob', 'tanggungan_bpjs', 'total_real_rs',
            'tgl_kirim', 'xround', 'keterangan', 'status', 'items'
        ]
        extra_kwargs = {
            'nomor_faktur': {'required': False, 'allow_blank': True},
            'jatuh_tempo': {'required': False},
        }

    def validate(self, attrs):
        tgl_kirim = attrs.get('tgl_kirim')
        if tgl_kirim:
            attrs['jatuh_tempo'] = tgl_kirim + timedelta(days=45)
        elif not self.instance and not attrs.get('jatuh_tempo'):
            attrs['jatuh_tempo'] = attrs.get('tanggal')
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        faktur = Faktur.objects.create(**validated_data)
        total = 0
        for item in items_data:
            subtotal = item['kuantitas'] * item['harga_satuan']
            item.pop('subtotal', None)
            FakturItem.objects.create(faktur=faktur, subtotal=subtotal, **item)
            total += subtotal
        if not total:
            total = sum([
                validated_data.get('adm', 0),
                validated_data.get('jasa', 0),
                validated_data.get('farmasi', 0),
                validated_data.get('tindakan', 0),
                validated_data.get('fisio', 0),
                validated_data.get('lab', 0),
                validated_data.get('rad', 0),
                validated_data.get('kamar', 0),
                validated_data.get('bhp', 0),
                validated_data.get('lainnya', 0),
                validated_data.get('ambulan', 0),
                validated_data.get('alat', 0),
                validated_data.get('ppn_farmasi', 0),
            ])
        faktur.total_real_rs = total
        if faktur.is_cob and faktur.tanggungan_bpjs:
            faktur.total_tagihan = max(Decimal('0'), Decimal(str(total)) - Decimal(str(faktur.tanggungan_bpjs)))
        else:
            faktur.total_tagihan = total
        faktur.save()
        return faktur

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', [])
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if items_data:
            instance.items.all().delete()
            total = 0
            for item in items_data:
                subtotal = item['kuantitas'] * item['harga_satuan']
                item.pop('subtotal', None)
                FakturItem.objects.create(faktur=instance, subtotal=subtotal, **item)
                total += subtotal
            total_real = total
        else:
            total_real = sum([
                instance.adm or 0,
                instance.jasa or 0,
                instance.farmasi or 0,
                instance.tindakan or 0,
                instance.fisio or 0,
                instance.lab or 0,
                instance.rad or 0,
                instance.kamar or 0,
                instance.bhp or 0,
                instance.lainnya or 0,
                instance.ambulan or 0,
                instance.alat or 0,
                instance.ppn_farmasi or 0,
            ])
        instance.total_real_rs = total_real
        if instance.is_cob and instance.tanggungan_bpjs:
            instance.total_tagihan = max(Decimal('0'), Decimal(str(total_real)) - Decimal(str(instance.tanggungan_bpjs)))
        else:
            instance.total_tagihan = total_real
        instance.save()
        return instance

class PembayaranUtangSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    nomor_faktur = serializers.CharField(source='utang.nomor_faktur', read_only=True)
    vendor_nama = serializers.CharField(source='utang.vendor_nama', read_only=True)
    nominal = serializers.DecimalField(source='utang.nominal', max_digits=25, decimal_places=2, read_only=True)
    sumber = serializers.CharField(source='utang.sumber', read_only=True)
    sumber_label = serializers.CharField(source='utang.get_sumber_display', read_only=True)
    nomor_spb = serializers.CharField(source='utang.nomor_spb', read_only=True)
    app_siaga_faktur_id = serializers.CharField(source='utang.app_siaga_faktur_id', read_only=True)
    tanggal_titip = serializers.DateField(source='utang.tanggal_titip', read_only=True)

    class Meta:
        model = PembayaranUtang
        fields = [
            'id', 'utang', 'nomor_faktur', 'vendor_nama', 'nominal',
            'sumber', 'sumber_label', 'nomor_spb', 'app_siaga_faktur_id',
            'tanggal_titip',
            'tanggal_rencana_bayar', 'tanggal_proses', 'tanggal_app',
            'jumlah_bayar', 'potongan_deposit', 'jumlah_kas_keluar',
            'keterangan', 'status', 'status_label',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'status_label', 'created_by', 'created_by_name', 'created_at']

class PembayaranUtangInputSerializer(serializers.ModelSerializer):
    class Meta:
        model = PembayaranUtang
        fields = ['utang', 'tanggal_rencana_bayar', 'tanggal_proses', 'tanggal_app', 'jumlah_bayar', 'potongan_deposit', 'jumlah_kas_keluar', 'keterangan']
        extra_kwargs = {
            'tanggal_proses': {'required': False, 'allow_null': True},
            'tanggal_app': {'required': False, 'allow_null': True},
            'tanggal_rencana_bayar': {'required': False, 'allow_null': True},
            'potongan_deposit': {'required': False},
            'jumlah_kas_keluar': {'required': False},
        }

    def validate(self, attrs):
        if attrs.get('jumlah_bayar', 0) <= 0:
            raise serializers.ValidationError({'jumlah_bayar': 'Jumlah bayar harus lebih dari 0.'})
        return attrs

class DepositVendorSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    sisa_deposit = serializers.DecimalField(max_digits=25, decimal_places=2, read_only=True)
    nomor_faktur = serializers.CharField(source='utang_asal.nomor_faktur', read_only=True, default='')
    nomor_spb = serializers.CharField(source='utang_asal.nomor_spb', read_only=True, default='')

    class Meta:
        model = DepositVendor
        fields = [
            'id', 'vendor_id', 'vendor_nama', 'utang_asal',
            'nomor_faktur', 'nomor_spb',
            'nominal_retur', 'terpakai', 'sisa_deposit',
            'keterangan', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'terpakai', 'sisa_deposit', 'created_by', 'created_by_name', 'created_at', 'updated_at']

class UtangSupplierSerializer(serializers.ModelSerializer):
    vendor_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    verified_by_name = serializers.CharField(source='verified_by.username', read_only=True)
    dibatalkan_by_name = serializers.CharField(source='dibatalkan_by.username', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    sumber_label = serializers.CharField(source='get_sumber_display', read_only=True)
    total_dibayar = serializers.DecimalField(max_digits=25, decimal_places=2, read_only=True)
    sisa_utang = serializers.DecimalField(max_digits=25, decimal_places=2, read_only=True)
    pembayaran = PembayaranUtangSerializer(many=True, read_only=True)

    class Meta:
        model = UtangSupplier
        fields = [
            'id', 'app_siaga_faktur_id', 'sumber', 'sumber_label',
            'nomor_spb', 'tanggal_spb',
            'nomor_faktur', 'vendor_id', 'vendor_nama', 'kategori', 'tanggal_faktur',
            'tanggal_jatuh_tempo', 'nominal', 'tanggal_titip',
            'keterangan_titip', 'status', 'status_label', 'total_dibayar',
            'sisa_utang', 'alasan_batal', 'dibatalkan_by', 'dibatalkan_by_name', 'dibatalkan_at',
            'verified_by', 'verified_by_name', 'verified_at',
            'pembayaran', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'status_label', 'sumber_label', 'total_dibayar', 'sisa_utang',
            'alasan_batal', 'dibatalkan_by', 'dibatalkan_by_name', 'dibatalkan_at',
            'verified_by', 'verified_by_name', 'verified_at', 'created_at', 'updated_at',
        ]

class TagihanItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TagihanItem
        fields = '__all__'

class TagihanItemInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TagihanItem
        fields = ['deskripsi', 'kuantitas', 'harga_satuan', 'subtotal']

class PembayaranTagihanSerializer(serializers.ModelSerializer):
    akun_detail     = AkunSerializer(source='akun', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model  = PembayaranTagihan
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at']

class PembayaranTagihanInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PembayaranTagihan
        fields = ['tagihan', 'tanggal', 'jumlah', 'metode', 'keterangan', 'akun']

class TagihanSerializer(serializers.ModelSerializer):
    items           = TagihanItemSerializer(many=True, read_only=True)
    pembayaran      = PembayaranTagihanSerializer(many=True, read_only=True)
    pemasok_detail  = PemasokSerializer(source='pemasok', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    sisa_tagihan    = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model  = Tagihan
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'total_tagihan', 'total_dibayar']

class TagihanInputSerializer(serializers.ModelSerializer):
    items = TagihanItemInputSerializer(many=True)

    class Meta:
        model  = Tagihan
        fields = ['nomor_tagihan', 'nomor_ref_pemasok', 'tanggal', 'jatuh_tempo', 'pemasok', 'keterangan', 'status', 'items']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        tagihan = Tagihan.objects.create(**validated_data)
        total = 0
        for item in items_data:
            subtotal = item['kuantitas'] * item['harga_satuan']
            item.pop('subtotal', None)
            TagihanItem.objects.create(tagihan=tagihan, subtotal=subtotal, **item)
            total += subtotal
        tagihan.total_tagihan = total
        tagihan.save()
        return tagihan

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', [])
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if items_data:
            instance.items.all().delete()
            total = 0
            for item in items_data:
                subtotal = item['kuantitas'] * item['harga_satuan']
                item.pop('subtotal', None)
                TagihanItem.objects.create(tagihan=instance, subtotal=subtotal, **item)
                total += subtotal
            instance.total_tagihan = total
        instance.save()
        return instance

class RiwayatSaldoRekeningSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True)

    class Meta:
        model  = RiwayatSaldoRekening
        fields = '__all__'
        read_only_fields = ['updated_by', 'created_at', 'selisih']

class RekeningBankSerializer(serializers.ModelSerializer):
    bank_label        = serializers.CharField(source='get_bank_display', read_only=True)
    updated_by_name   = serializers.CharField(source='updated_by.username', read_only=True)
    nama_bank_display = serializers.CharField(read_only=True)
    riwayat           = RiwayatSaldoRekeningSerializer(many=True, read_only=True)

    class Meta:
        model  = RekeningBank
        fields = '__all__'
        read_only_fields = ['updated_by', 'created_at', 'updated_at']

class RekeningBankInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RekeningBank
        fields = ['nama_rekening', 'bank', 'nama_bank', 'nomor_rekening', 'saldo', 'keterangan', 'is_active']

class UpdateSaldoSerializer(serializers.Serializer):
    saldo_baru = serializers.DecimalField(max_digits=18, decimal_places=2)
    keterangan = serializers.CharField(required=False, allow_blank=True)

    def validate_saldo_baru(self, value):
        if value < 0:
            raise serializers.ValidationError('Saldo tidak boleh negatif.')
        return value

class ItemLaporanPenggunaanSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemLaporanPenggunaan
        fields = ['id', 'kode_akun', 'nama_akun', 'pos_biaya', 'deskripsi', 'nilai', 'created_at']

class LaporanPenggunaanSerializer(serializers.ModelSerializer):
    dikonfirmasi_oleh_name = serializers.CharField(source='dikonfirmasi_oleh.username', read_only=True)
    nota_url               = serializers.SerializerMethodField()
    items                  = ItemLaporanPenggunaanSerializer(many=True, read_only=True)

    class Meta:
        model  = LaporanPenggunaan
        fields = '__all__'
        read_only_fields = ['petty_cash', 'selisih', 'dikonfirmasi_oleh', 'created_at', 'updated_at']

    def get_nota_url(self, obj):
        if not obj.nota:
            return None
        try:
            return obj.nota.url
        except Exception:
            return None

class LaporanPenggunaanInputSerializer(serializers.ModelSerializer):
    rincian = serializers.CharField(required=False, allow_blank=True, default='')
    nota    = serializers.FileField(required=True)
    class Meta:
        model  = LaporanPenggunaan
        fields = ['tanggal_laporan', 'tanggal_nota', 'nominal_digunakan', 'rincian', 'nota']

    def validate_nominal_digunakan(self, value):
        if value <= 0:
            raise serializers.ValidationError('Nominal digunakan harus lebih dari 0.')
        return value
    
    def validate_nominal(self, value):
        if value <= 0:
            raise serializers.ValidationError('Nominal harus lebih dari 0.')
        if value > 999999:
            raise serializers.ValidationError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.')
        return value

class PettyCashSerializer(serializers.ModelSerializer):
    created_by_name     = serializers.SerializerMethodField()
    disetujui_oleh_name = serializers.SerializerMethodField()
    dicairkan_oleh_name = serializers.SerializerMethodField()
    laporan_disetujui_oleh_name = serializers.SerializerMethodField()
    status_label        = serializers.CharField(source='get_status_display', read_only=True)
    berkas_url          = serializers.SerializerMethodField()
    laporan             = LaporanPenggunaanSerializer(read_only=True)

    class Meta:
        model  = PettyCash
        fields = '__all__'
        read_only_fields = ['no_pengajuan', 'status', 'catatan_tolak', 'created_by', 'disetujui_oleh', 'dicairkan_oleh', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else '-'

    def get_disetujui_oleh_name(self, obj):
        return obj.disetujui_oleh.get_full_name() or obj.disetujui_oleh.username if obj.disetujui_oleh else '-'

    def get_dicairkan_oleh_name(self, obj):
        return obj.dicairkan_oleh.get_full_name() or obj.dicairkan_oleh.username if obj.dicairkan_oleh else '-'

    def get_laporan_disetujui_oleh_name(self, obj):
        if not obj.laporan_disetujui_oleh:
            return '-'
        return obj.laporan_disetujui_oleh.get_full_name() or obj.laporan_disetujui_oleh.username

    def get_berkas_url(self, obj):
        if not obj.berkas:
            return None
        try:
            return obj.berkas.url
        except Exception:
            return None

class PettyCashInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PettyCash
        fields = ['tanggal', 'keperluan', 'nominal', 'keterangan', 'berkas']

    def validate_nominal(self, value):
        if value <= 0:
            raise serializers.ValidationError('Nominal harus lebih dari 0.')
        return value

class ReimbursementSerializer(serializers.ModelSerializer):
    created_by_name     = serializers.SerializerMethodField()
    disetujui_oleh_name = serializers.SerializerMethodField()
    dicairkan_oleh_name = serializers.SerializerMethodField()
    status_label        = serializers.CharField(source='get_status_display', read_only=True)
    berkas_url          = serializers.SerializerMethodField()

    class Meta:
        model  = Reimbursement
        fields = '__all__'
        read_only_fields = ['no_reimbursement', 'status', 'catatan_tolak', 'created_by', 'disetujui_oleh', 'dicairkan_oleh', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else '-'

    def get_disetujui_oleh_name(self, obj):
        return obj.disetujui_oleh.get_full_name() or obj.disetujui_oleh.username if obj.disetujui_oleh else '-'

    def get_dicairkan_oleh_name(self, obj):
        return obj.dicairkan_oleh.get_full_name() or obj.dicairkan_oleh.username if obj.dicairkan_oleh else '-'

    def get_berkas_url(self, obj):
        if not obj.berkas:
            return None
        try:
            return obj.berkas.url
        except Exception:
            return None

class ReimbursementInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Reimbursement
        fields = ['tanggal', 'keperluan', 'nominal', 'keterangan', 'berkas']

    def validate_nominal(self, value):
        if value <= 0:
            raise serializers.ValidationError('Nominal harus lebih dari 0.')
        if value > 999999:
            raise serializers.ValidationError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.')
        return value

    def validate_berkas(self, value):
        if not value:
            raise serializers.ValidationError('Berkas bukti wajib dilampirkan.')
        return value

class SaldoPettyCashSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()
 
    class Meta:
        model  = SaldoPettyCash
        fields = '__all__'
 
    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() or obj.updated_by.username if obj.updated_by else '-'

class RiwayatSaldoPettyCashSerializer(serializers.ModelSerializer):
    nama_pengaju = serializers.SerializerMethodField()
    unit_pengaju = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    created_by_unit = serializers.SerializerMethodField()
 
    class Meta:
        model  = RiwayatSaldoPettyCash
        fields = '__all__'
 
    def get_created_by_name(self, obj):
        return user_name(obj.created_by) or '-'

    def get_created_by_unit(self, obj):
        return user_unit_label(obj.created_by)

    def get_nama_pengaju(self, obj):
        if obj.nama_pengaju:
            return obj.nama_pengaju
        return user_name(infer_riwayat_saldo_user(obj))

    def get_unit_pengaju(self, obj):
        if obj.unit_pengaju:
            return obj.unit_pengaju
        return user_unit_label(infer_riwayat_saldo_user(obj))

class PengajuanPenambahanSaldoSerializer(serializers.ModelSerializer):
    created_by_name   = serializers.SerializerMethodField()
    created_by_unit   = serializers.SerializerMethodField()
    diproses_oleh_name = serializers.SerializerMethodField()
    riwayat_snapshot  = serializers.SerializerMethodField()
    riwayat_snapshot_start = serializers.SerializerMethodField()
 
    class Meta:
        model  = PengajuanPenambahanSaldo
        fields = '__all__'
        read_only_fields = [
            'no_pengajuan', 'status', 'nominal_diajukan',
            'catatan_tolak', 'created_by', 'diproses_oleh',
            'created_at', 'updated_at',
        ]
 
    def get_created_by_name(self, obj):
        return user_name(obj.created_by) or '-'

    def get_created_by_unit(self, obj):
        return user_unit_label(obj.created_by)
 
    def get_diproses_oleh_name(self, obj):
        return obj.diproses_oleh.get_full_name() or obj.diproses_oleh.username if obj.diproses_oleh else '-'
 
    def get_riwayat_snapshot(self, obj):
        # Ambil riwayat pengurangan saldo sejak penambahan saldo terakhir
        # sebelum pengajuan ini dibuat. Ini yang dibutuhkan direktur saat approval.
        qs = RiwayatSaldoPettyCash.objects.filter(
            jenis='pengurangan',
            created_at__lte=obj.created_at,
        )
        penambahan_terakhir = RiwayatSaldoPettyCash.objects.filter(
            jenis='penambahan',
            created_at__lt=obj.created_at,
        ).order_by('-created_at').first()
        if penambahan_terakhir:
            qs = qs.filter(created_at__gt=penambahan_terakhir.created_at)
        riwayat = qs.order_by('-created_at')[:50]
        return RiwayatSaldoPettyCashSerializer(riwayat, many=True).data

    def get_riwayat_snapshot_start(self, obj):
        penambahan_terakhir = RiwayatSaldoPettyCash.objects.filter(
            jenis='penambahan',
            created_at__lt=obj.created_at,
        ).order_by('-created_at').first()
        return penambahan_terakhir.created_at.isoformat() if penambahan_terakhir else None

class PengajuanPenambahanSaldoInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PengajuanPenambahanSaldo
        fields = ['tanggal', 'nominal_diajukan', 'alasan', 'keterangan']
        extra_kwargs = {
            'nominal_diajukan': {'required': True},
            'alasan': {'required': True},
        }