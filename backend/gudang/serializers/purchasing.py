from rest_framework import serializers
from decimal import Decimal
from gudang.models import (
    SuratPesanan, SuratPesananItem, Penerimaan, PenerimaanItem, Barang
)


class SuratPesananItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    barang_merk = serializers.CharField(source='barang.merk', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)
    sisa_kemasan = serializers.SerializerMethodField()
    sisa_dasar = serializers.SerializerMethodField()
    persen_terpenuhi = serializers.SerializerMethodField()

    class Meta:
        model = SuratPesananItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'barang_merk', 'satuan_dasar_kode',
            'kemasan', 'isi', 'qty_kemasan', 'qty_dasar',
            'harga_kemasan', 'harga_dasar', 'subtotal',
            'qty_diterima', 'sisa_kemasan', 'sisa_dasar', 'persen_terpenuhi'
        ]

    def get_sisa_kemasan(self, obj):
        sisa = max(Decimal('0'), obj.qty_dasar - obj.qty_diterima)
        return float(sisa / obj.isi if obj.isi > 0 else sisa)

    def get_sisa_dasar(self, obj):
        return float(max(Decimal('0'), obj.qty_dasar - obj.qty_diterima))

    def get_persen_terpenuhi(self, obj):
        if obj.qty_dasar <= 0:
            return 100.0
        pct = (obj.qty_diterima / obj.qty_dasar) * Decimal('100.0')
        return float(round(min(Decimal('100.0'), pct), 1))


class SuratPesananSerializer(serializers.ModelSerializer):
    items = SuratPesananItemSerializer(many=True, read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()
    can_submit = serializers.SerializerMethodField()
    penerimaan_list = serializers.SerializerMethodField()

    class Meta:
        model = SuratPesanan
        fields = [
            'id', 'nomor', 'tanggal', 'vendor_id', 'vendor_nama',
            'catatan', 'status', 'total_nilai', 'items',
            'created_by', 'created_by_nama', 'submitted_at',
            'approved_by', 'approved_by_nama', 'approved_at',
            'catatan_tolak', 'alasan_batal', 'created_at', 'updated_at',
            'can_approve', 'can_submit', 'penerimaan_list'
        ]

    def get_penerimaan_list(self, obj):
        return [
            {
                'id': p.id,
                'nomor': p.nomor,
                'tanggal': str(p.tanggal),
                'no_faktur': p.no_faktur or '-',
                'metode_pembayaran': p.metode_pembayaran,
                'total_nilai': float(p.total_nilai),
                'status': p.status,
                'created_by_nama': p.created_by.get_full_name() if p.created_by else '-'
            }
            for p in obj.penerimaan_list.all().order_by('-tanggal', '-id')
        ]

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        # Khusus superuser atau username 'super' bisa menyetujui semua PO berstatus menunggu
        if request.user.is_superuser or getattr(request.user, 'username', '') == 'super':
            return obj.status == SuratPesanan.STATUS_MENUNGGU
        if obj.status != SuratPesanan.STATUS_MENUNGGU:
            return False
        # For standard employees: creator cannot approve their own document (segregation of duties)
        if obj.created_by_id == request.user.id:
            return False
        role = getattr(request.user, 'role', None)
        return role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']

    def get_can_submit(self, obj):
        return obj.status == SuratPesanan.STATUS_DRAFT


class PenerimaanItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    barang_merk = serializers.CharField(source='barang.merk', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)
    po_qty_kemasan = serializers.SerializerMethodField()
    po_harga_kemasan = serializers.SerializerMethodField()
    selisih_harga = serializers.SerializerMethodField()

    class Meta:
        model = PenerimaanItem
        fields = [
            'id', 'po_item', 'barang', 'barang_nama', 'barang_kode', 'barang_merk', 'satuan_dasar_kode',
            'kemasan', 'isi', 'qty_kemasan', 'qty_dasar',
            'harga_kemasan', 'harga_dasar', 'subtotal',
            'po_qty_kemasan', 'po_harga_kemasan', 'selisih_harga',
            'batch_no', 'exp_date'
        ]

    def get_po_qty_kemasan(self, obj):
        return float(obj.po_item.qty_kemasan) if obj.po_item else None

    def get_po_harga_kemasan(self, obj):
        return float(obj.po_item.harga_kemasan) if obj.po_item else None

    def get_selisih_harga(self, obj):
        if not obj.po_item:
            return 0.0
        return float(obj.harga_kemasan - obj.po_item.harga_kemasan)


class PenerimaanSerializer(serializers.ModelSerializer):
    items = PenerimaanItemSerializer(many=True, read_only=True)
    po_nomor = serializers.CharField(source='po.nomor', read_only=True)
    gudang_nama = serializers.CharField(source='gudang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()

    class Meta:
        model = Penerimaan
        fields = [
            'id', 'nomor', 'po', 'po_nomor', 'gudang', 'gudang_nama',
            'tanggal', 'vendor_id', 'vendor_nama', 'no_faktur',
            'tgl_jatuh_tempo', 'metode_pembayaran', 'total_nilai',
            'status', 'tutup_po', 'kirim_keuangan', 'utang_supplier_id',
            'catatan', 'alasan_batal', 'items',
            'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve'
        ]

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.status != Penerimaan.STATUS_DRAFT:
            return False
        if request.user.is_superuser or getattr(request.user, 'username', '') == 'super':
            return True
        if obj.created_by_id == request.user.id:
            return False
        role = getattr(request.user, 'role', None)
        return role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']

