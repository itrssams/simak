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
    UtangSupplier, PembayaranUtang, DepositVendor,
    Tagihan, TagihanItem, PembayaranTagihan,
    RekeningBank, RiwayatSaldoRekening,
    AuditLog,
    PettyCash, LaporanPenggunaan, Reimbursement, SaldoPettyCash, RiwayatSaldoPettyCash, PengajuanPenambahanSaldo,
    Kendaraan, LogPerjalanan, LaporanPerjalanan, FotoLaporanPerjalanan, LogBBM, LogMaintenance,
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription,
    Announcement, AnnouncementRead,
    InventoryOption, InventoryAsset,
    LogistikBarang, LogistikPembelian, LogistikBatch, LogistikMutasi, LogistikPermintaan, LogistikOpname
)
from .audit import infer_target, make_description, target_display_from_user
from .audit import get_keuangan_target_display


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


class AuditLogSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    action_label = serializers.CharField(source='get_action_display', read_only=True)
    username = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    entity = serializers.CharField(source='entity_type', read_only=True)
    description = serializers.SerializerMethodField()
    path = serializers.SerializerMethodField()
    method = serializers.SerializerMethodField()
    status_code = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_display', 'username', 'role', 'action', 'action_label',
            'entity', 'entity_type', 'entity_id', 'entity_display', 'description',
            'path', 'method', 'status_code', 'ip_address', 'user_agent', 'status',
            'error_message', 'metadata', 'old_values', 'new_values', 'created_at',
        ]
        read_only_fields = fields

    def get_user_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return 'System'

    def get_username(self, obj):
        return obj.user.username if obj.user else ''

    def get_role(self, obj):
        return obj.user.role if obj.user else ''

    def get_description(self, obj):
        values = obj.new_values if isinstance(obj.new_values, dict) else {}
        path = values.get('path', '')
        method = values.get('method', '')
        status_code = values.get('status_code')
        if obj.action == 'login':
            return obj.description
        if not path:
            return obj.description

        app_label, entity, entity_id, extra_action, inferred_action = infer_target(path, method)
        metadata = dict(values)
        target = metadata.get('target') if isinstance(metadata.get('target'), dict) else {}
        if not target:
            target = {
                'app_label': app_label,
                'entity': entity,
                'entity_id': entity_id,
                'extra_action': extra_action,
                'target_display': '',
            }
            if entity == 'users' and entity_id:
                user = get_user_model().objects.filter(pk=entity_id).first()
                target['target_display'] = target_display_from_user(user)
                target['target_is_active'] = user.is_active if user else None
            elif app_label == 'keuangan' and entity_id:
                target['target_display'] = get_keuangan_target_display(entity, entity_id)
            metadata['target'] = target

        return make_description(
            obj.user,
            obj.action or inferred_action,
            entity or obj.entity_type,
            entity_id or obj.entity_id,
            extra_action,
            metadata,
            status_code,
        )

    def get_path(self, obj):
        return obj.new_values.get('path', '') if isinstance(obj.new_values, dict) else ''

    def get_method(self, obj):
        return obj.new_values.get('method', '') if isinstance(obj.new_values, dict) else ''

    def get_status_code(self, obj):
        return obj.new_values.get('status_code') if isinstance(obj.new_values, dict) else None

    def get_metadata(self, obj):
        return obj.new_values if isinstance(obj.new_values, dict) else {}


# ══════════════════════════════════════════════════════════════
# AKUN
# ══════════════════════════════════════════════════════════════

class AkunSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Akun
        fields = '__all__'


# ══════════════════════════════════════════════════════════════
# PELANGGAN & PEMASOK
# ══════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════
# TRANSAKSI
# ══════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════
# JURNAL
# ══════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════
# FAKTUR
# ══════════════════════════════════════════════════════════════

class FakturItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FakturItem
        fields = '__all__'


class FakturItemInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FakturItem
        fields = ['deskripsi', 'kuantitas', 'harga_satuan', 'subtotal']


class AlokasiDanaSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    digunakan = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    pemakaian = serializers.SerializerMethodField()
    
    class Meta:
        model  = AlokasiDana
        fields = [
            'id', 'id_pembiayaan', 'nama_pembiayaan', 'tanggal_penerimaan',
            'jumlah_penerimaan', 'bank', 'total_alokasi', 'sisa_alokasi',
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
    status           = serializers.SerializerMethodField()
    status_label     = serializers.SerializerMethodField()
    pasien_invoice   = serializers.SerializerMethodField()
    dibatalkan_oleh_nama = serializers.SerializerMethodField()

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
        total_piutang = self.get_total_piutang(obj)
        total_dibayar = self.get_total_dibayar(obj)
        sisa = total_piutang - total_dibayar
        if sisa <= 0:
            return 'lunas'
        elif total_dibayar == 0:
            return 'belum_bayar'
        else:
            return 'bayar_sebagian'

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


# ══════════════════════════════════════════════════════════════
# TAGIHAN
# ══════════════════════════════════════════════════════════════

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
            'nomor_faktur', 'vendor_id', 'vendor_nama', 'tanggal_faktur',
            'tanggal_jatuh_tempo', 'nominal', 'tanggal_titip',
            'keterangan_titip', 'status', 'status_label', 'total_dibayar',
            'sisa_utang', 'verified_by', 'verified_by_name', 'verified_at',
            'pembayaran', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'status_label', 'sumber_label', 'total_dibayar', 'sisa_utang',
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


# ══════════════════════════════════════════════════════════════
# REKENING BANK
# ══════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════
# PETTY CASH
# ══════════════════════════════════════════════════════════════

class LaporanPenggunaanSerializer(serializers.ModelSerializer):
    dikonfirmasi_oleh_name = serializers.CharField(source='dikonfirmasi_oleh.username', read_only=True)
    nota_url               = serializers.SerializerMethodField()

    class Meta:
        model  = LaporanPenggunaan
        fields = '__all__'
        read_only_fields = ['petty_cash', 'selisih', 'dikonfirmasi_oleh', 'created_at', 'updated_at']

    def get_nota_url(self, obj):
        request = self.context.get('request')
        if obj.nota and request:
            return request.build_absolute_uri(obj.nota.url)
        return None


class LaporanPenggunaanInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LaporanPenggunaan
        fields = ['tanggal_laporan', 'nominal_digunakan', 'rincian', 'nota']

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
        request = self.context.get('request')
        if obj.berkas and request:
            return request.build_absolute_uri(obj.berkas.url)
        return None


class PettyCashInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PettyCash
        fields = ['tanggal', 'keperluan', 'nominal', 'keterangan', 'berkas']

    def validate_nominal(self, value):
        if value <= 0:
            raise serializers.ValidationError('Nominal harus lebih dari 0.')
        return value


# ══════════════════════════════════════════════════════════════
# REIMBURSEMENT
# ══════════════════════════════════════════════════════════════

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
        request = self.context.get('request')
        if obj.berkas and request:
            return request.build_absolute_uri(obj.berkas.url)
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
        fields = ['tanggal', 'alasan']
 
# DRIVER

class KendaraanSerializer(serializers.ModelSerializer):
    jenis_label = serializers.CharField(source='get_jenis_display', read_only=True)
 
    class Meta:
        model  = Kendaraan
        fields = '__all__'
 
 
class LogPerjalananSerializer(serializers.ModelSerializer):
    driver_name   = serializers.CharField(source='driver.get_full_name', read_only=True)
    driver_username = serializers.CharField(source='driver.username', read_only=True)
    disetujui_oleh_name = serializers.CharField(source='disetujui_oleh.get_full_name', read_only=True, allow_null=True)
    kendaraan_info  = serializers.SerializerMethodField()
    laporan = serializers.SerializerMethodField()
 
    class Meta:
        model  = LogPerjalanan
        fields = '__all__'
        read_only_fields = ['driver', 'jarak_km', 'status', 'disetujui_oleh', 'catatan_tolak', 'created_at', 'updated_at']
 
    def get_kendaraan_info(self, obj):
        return f"{obj.kendaraan.plat_nomor} - {obj.kendaraan.nama}"
    
    def get_laporan(self, obj):
        if hasattr(obj, 'laporan'):
            return LaporanPerjalananSerializer(obj.laporan, context=self.context).data
        return None
 
 
class LogPerjalananInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogPerjalanan
        fields = ['kendaraan', 'tanggal', 'jam_berangkat', 'jam_kembali',
                  'tujuan', 'km_awal', 'km_akhir', 'penumpang', 'keterangan']

    def validate(self, attrs):
        km_awal = attrs.get('km_awal', getattr(self.instance, 'km_awal', None))
        km_akhir = attrs.get('km_akhir', getattr(self.instance, 'km_akhir', None))
        if km_awal is not None and km_akhir is not None and km_akhir < km_awal:
            raise serializers.ValidationError({'km_akhir': 'KM akhir tidak boleh lebih kecil dari KM awal.'})
        return attrs


class FotoLaporanPerjalananSerializer(serializers.ModelSerializer):
    foto_url = serializers.SerializerMethodField()
    
    class Meta:
        model = FotoLaporanPerjalanan
        fields = ['id', 'foto', 'foto_url', 'urutan', 'keterangan', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None


class LaporanPerjalananSerializer(serializers.ModelSerializer):
    foto = FotoLaporanPerjalananSerializer(many=True, read_only=True)
    
    class Meta:
        model = LaporanPerjalanan
        fields = ['id', 'log_perjalanan', 'tanggal_laporan', 'deskripsi', 'tujuan_tercapai', 'keterangan', 'foto', 'created_at', 'updated_at']
        read_only_fields = ['id', 'log_perjalanan', 'created_at', 'updated_at']


class LaporanPerjalananInputSerializer(serializers.ModelSerializer):
    foto_files = serializers.ListField(
        child=serializers.ImageField(),
        write_only=True,
        required=False
    )
    # Handle tujuan_tercapai yang di-FormData bisa jadi string "true"/"false"
    tujuan_tercapai = serializers.BooleanField(required=True)
    
    class Meta:
        model = LaporanPerjalanan
        fields = ['tanggal_laporan', 'deskripsi', 'tujuan_tercapai', 'keterangan', 'foto_files']
    
    def validate_tujuan_tercapai(self, value):
        # Handle string values from FormData
        if isinstance(value, str):
            if value.lower() in ('true', '1', 'yes', 'on'):
                return True
            elif value.lower() in ('false', '0', 'no', 'off'):
                return False
            else:
                raise serializers.ValidationError('Nilai harus true atau false.')
        return value
    
    def validate_foto_files(self, value):
        if not value:
            raise serializers.ValidationError('Minimal harus ada 1 foto laporan.')
        if len(value) > 10:
            raise serializers.ValidationError('Maksimal 10 foto saja.')
        return value
    
    
    def create(self, validated_data):
        foto_files = validated_data.pop('foto_files', [])
        
        if not foto_files:
            raise serializers.ValidationError({'foto_files': 'Minimal harus ada 1 foto laporan.'})
        
        laporan = LaporanPerjalanan.objects.create(**validated_data)
        
        for idx, foto_file in enumerate(foto_files, 1):
            FotoLaporanPerjalanan.objects.create(
                laporan=laporan,
                foto=foto_file,
                urutan=idx
            )
        
        return laporan
 
 
class LogBBMSerializer(serializers.ModelSerializer):
    driver_name    = serializers.CharField(source='driver.get_full_name', read_only=True)
    driver_username = serializers.CharField(source='driver.username', read_only=True)
    kendaraan_info  = serializers.SerializerMethodField()
    foto_url        = serializers.SerializerMethodField()
 
    class Meta:
        model  = LogBBM
        fields = '__all__'
        read_only_fields = ['driver', 'created_at']
 
    def get_kendaraan_info(self, obj):
        return f"{obj.kendaraan.plat_nomor} - {obj.kendaraan.nama}"
 
    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None
 
 
class LogBBMInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogBBM
        fields = ['kendaraan', 'tanggal', 'total_biaya', 'km_saat_isi', 'keterangan', 'foto']
    
    def update(self, instance, validated_data):
        """Delete old foto file before updating with new one"""
        from django.core.files.storage import default_storage
        
        # Check if foto was explicitly updated (including deletion)
        # If 'foto' is in validated_data, it means user is trying to update it
        if 'foto' in validated_data:
            # If old foto exists, delete it regardless of new value
            if instance.foto:
                try:
                    if default_storage.exists(instance.foto.name):
                        default_storage.delete(instance.foto.name)
                except Exception as e:
                    print(f"Error deleting old LogBBM foto: {str(e)}")
        
        return super().update(instance, validated_data)
 
 
class LogMaintenanceSerializer(serializers.ModelSerializer):
    dilaporkan_oleh_name = serializers.CharField(source='dilaporkan_oleh.get_full_name', read_only=True)
    kendaraan_info       = serializers.SerializerMethodField()
    jenis_label          = serializers.CharField(source='get_jenis_display', read_only=True)
    foto_url             = serializers.SerializerMethodField()

    class Meta:
        model  = LogMaintenance
        fields = '__all__'
        read_only_fields = ['dilaporkan_oleh', 'created_at']

    def get_kendaraan_info(self, obj):
        return f"{obj.kendaraan.plat_nomor} - {obj.kendaraan.nama}"

    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None
 
 
class LogMaintenanceInputSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogMaintenance
        fields = ['kendaraan', 'jenis', 'tanggal', 'biaya', 'deskripsi', 'foto']
    
    def update(self, instance, validated_data):
        """Delete old foto file before updating with new one"""
        from django.core.files.storage import default_storage
        
        # Check if foto was explicitly updated (including deletion)
        # If 'foto' is in validated_data, it means user is trying to update it
        if 'foto' in validated_data:
            # If old foto exists, delete it regardless of new value
            if instance.foto:
                try:
                    if default_storage.exists(instance.foto.name):
                        default_storage.delete(instance.foto.name)
                except Exception as e:
                    print(f"Error deleting old LogMaintenance foto: {str(e)}")
        
        return super().update(instance, validated_data)


class ITBackupRecordSerializer(serializers.ModelSerializer):
    backup_type_label = serializers.CharField(source='get_backup_type_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITBackupRecord
        fields = [
            'id', 'backup_type', 'backup_type_label', 'status', 'status_label',
            'file_name', 'storage_path', 'file_size_mb', 'started_at', 'finished_at',
            'notes', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)


class ITRepairRequestSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    priority_label = serializers.CharField(source='get_priority_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    requester_user_name = serializers.SerializerMethodField()
    requester_user_unit = serializers.SerializerMethodField()
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = ITRepairRequest
        fields = [
            'id', 'title', 'requester_user', 'requester_user_name', 'requester_user_unit',
            'requester_name', 'unit', 'category',
            'category_label', 'priority', 'priority_label', 'status', 'status_label',
            'description', 'resolution', 'sparepart', 'cost', 'foto', 'foto_url',
            'requested_at', 'completed_at',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_by', 'created_by_name', 'requester_user_name',
            'requester_user_unit', 'foto_url', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_requester_user_name(self, obj):
        return user_name(obj.requester_user)

    def get_requester_user_unit(self, obj):
        return user_unit_label(obj.requester_user)

    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None

    def validate(self, attrs):
        requester = attrs.get('requester_user') or getattr(self.instance, 'requester_user', None)
        if requester:
            attrs['requester_name'] = user_name(requester)
            attrs['unit'] = user_unit_label(requester)
        return attrs


class ITCredentialNoteSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    has_password = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITCredentialNote
        fields = [
            'id', 'name', 'category', 'category_label', 'url', 'username',
            'password', 'has_password', 'owner', 'notes', 'is_active',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'has_password', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_has_password(self, obj):
        return bool(obj.password)

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)


class ITCredentialNoteDetailSerializer(ITCredentialNoteSerializer):
    password_value = serializers.CharField(source='password', read_only=True)

    class Meta(ITCredentialNoteSerializer.Meta):
        fields = ITCredentialNoteSerializer.Meta.fields + ['password_value']


class ITRemoteAccessSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    has_access_password = serializers.SerializerMethodField()
    access_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITRemoteAccess
        fields = [
            'id', 'device_name', 'user_owner', 'unit', 'location',
            'anydesk_id', 'rustdesk_id', 'access_password', 'has_access_password',
            'status', 'status_label', 'notes', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'has_access_password', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_has_access_password(self, obj):
        return bool(obj.access_password)

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)


class ITRemoteAccessDetailSerializer(ITRemoteAccessSerializer):
    access_password_value = serializers.CharField(source='access_password', read_only=True)

    class Meta(ITRemoteAccessSerializer.Meta):
        fields = ITRemoteAccessSerializer.Meta.fields + ['access_password_value']


class ITSubscriptionSerializer(serializers.ModelSerializer):
    service_type_label = serializers.CharField(source='get_service_type_display', read_only=True)
    billing_cycle_label = serializers.CharField(source='get_billing_cycle_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    days_left = serializers.SerializerMethodField()

    class Meta:
        model = ITSubscription
        fields = [
            'id', 'name', 'service_type', 'service_type_label', 'vendor',
            'account_ref', 'url', 'pic', 'start_date', 'end_date',
            'billing_cycle', 'billing_cycle_label', 'cost',
            'status', 'status_label', 'reminder_days', 'days_left',
            'notes', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'days_left', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_days_left(self, obj):
        if not obj.end_date:
            return None
        from django.utils import timezone
        return (obj.end_date - timezone.localdate()).days


class AnnouncementSerializer(serializers.ModelSerializer):
    priority_label = serializers.CharField(source='get_priority_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'message', 'audience', 'priority', 'priority_label',
            'is_active', 'publish_at', 'expires_at',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'is_read',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'updated_at', 'is_read']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_is_read(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return AnnouncementRead.objects.filter(announcement=obj, user=user).exists()


class InventoryOptionSerializer(serializers.ModelSerializer):
    option_type_label = serializers.CharField(source='get_option_type_display', read_only=True)

    class Meta:
        model = InventoryOption
        fields = [
            'id', 'option_type', 'option_type_label', 'name',
            'is_active', 'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'option_type_label', 'created_at', 'updated_at']


class InventoryAssetSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    condition_status_name = serializers.CharField(source='condition_status.name', read_only=True)
    ownership_status_name = serializers.CharField(source='ownership_status.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = InventoryAsset
        fields = [
            'id', 'description', 'unit', 'unit_name', 'brand', 'location',
            'category', 'category_name', 'condition_status', 'condition_status_name',
            'foto', 'foto_url', 'manufacture_year', 'purchase_year',
            'purchase_price', 'recommended_action',
            'ownership_status', 'ownership_status_name',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'unit_name', 'category_name', 'condition_status_name',
            'ownership_status_name', 'foto_url', 'created_by',
            'created_by_name', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None

    def validate_option_type(self, attrs, field, expected_type):
        option = attrs.get(field) or getattr(self.instance, field, None)
        if option and option.option_type != expected_type:
            raise serializers.ValidationError({field: f'Pilihan harus bertipe {expected_type}.'})

    def validate(self, attrs):
        self.validate_option_type(attrs, 'unit', 'unit')
        self.validate_option_type(attrs, 'category', 'category')
        self.validate_option_type(attrs, 'condition_status', 'condition')
        self.validate_option_type(attrs, 'ownership_status', 'ownership')
        manufacture_year = attrs.get('manufacture_year', getattr(self.instance, 'manufacture_year', None))
        purchase_year = attrs.get('purchase_year', getattr(self.instance, 'purchase_year', None))
        if manufacture_year and (manufacture_year < 1900 or manufacture_year > 2100):
            raise serializers.ValidationError({'manufacture_year': 'Tahun pembuatan tidak valid.'})
        if purchase_year and (purchase_year < 1900 or purchase_year > 2100):
            raise serializers.ValidationError({'purchase_year': 'Tahun beli tidak valid.'})
        return attrs


class LogistikBarangSerializer(serializers.ModelSerializer):
    stok_minimum_alert = serializers.SerializerMethodField()

    class Meta:
        model = LogistikBarang
        fields = '__all__'
        read_only_fields = ['id', 'stok', 'created_by', 'created_at', 'updated_at', 'stok_minimum_alert']

    def get_stok_minimum_alert(self, obj):
        return obj.stok_minimum > 0 and obj.stok < obj.stok_minimum


class LogistikBatchSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama_barang', read_only=True)
    satuan = serializers.CharField(source='barang.satuan', read_only=True)
    stok_batch = serializers.IntegerField(read_only=True)

    class Meta:
        model = LogistikBatch
        fields = ['id', 'pembelian', 'barang', 'barang_nama', 'satuan', 'qty_pesan', 'qty', 'isi', 'harga', 'jml_mutasi', 'stok_batch', 'created_at']
        read_only_fields = ['id', 'jml_mutasi', 'stok_batch', 'created_at']


class LogistikPembelianSerializer(serializers.ModelSerializer):
    items = LogistikBatchSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LogistikPembelian
        fields = '__all__'
        read_only_fields = ['id', 'nomor', 'created_by', 'created_by_name', 'created_at', 'updated_at', 'items']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)


class LogistikMutasiSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama_barang', read_only=True)
    satuan = serializers.CharField(source='barang.satuan', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LogistikMutasi
        fields = '__all__'
        read_only_fields = ['id', 'nomor', 'batch', 'harga', 'created_by', 'created_by_name', 'created_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)


class LogistikPermintaanSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama_barang', read_only=True)
    satuan = serializers.CharField(source='barang.satuan', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LogistikPermintaan
        fields = '__all__'
        read_only_fields = ['id', 'qty_setuju', 'status', 'created_by', 'created_by_name', 'verified_by', 'verified_by_name', 'verified_at', 'created_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_verified_by_name(self, obj):
        return user_name(obj.verified_by)


class LogistikOpnameSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama_barang', read_only=True)
    stok_sistem = serializers.IntegerField(source='barang.stok', read_only=True)
    selisih = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LogistikOpname
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'stok_sistem', 'selisih']

    def get_selisih(self, obj):
        return obj.real_stock - obj.barang.stok

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

