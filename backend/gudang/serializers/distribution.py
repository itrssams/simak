from rest_framework import serializers
from decimal import Decimal
from gudang.models import (
    Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem, Ruang, Barang
)


class PermintaanItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)
    stok_tersedia = serializers.SerializerMethodField()

    class Meta:
        model = PermintaanItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'satuan_dasar_kode',
            'qty_minta', 'satuan', 'qty_disetujui', 'qty_dikeluarkan',
            'keterangan', 'stok_tersedia'
        ]

    def get_stok_tersedia(self, obj):
        saldo = getattr(obj.barang, 'saldo_stok', None)
        if saldo and hasattr(saldo, 'first'):
            first = saldo.first()
            return float(first.qty) if first else 0
        from gudang.models import StokSaldo
        s = StokSaldo.objects.filter(barang=obj.barang).first()
        return float(s.qty) if s else 0


class PermintaanSerializer(serializers.ModelSerializer):
    items = PermintaanItemSerializer(many=True, read_only=True)
    ruang_nama = serializers.CharField(source='ruang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()
    can_issue = serializers.SerializerMethodField()
    bon_pengeluaran_id = serializers.SerializerMethodField()
    bon_pengeluaran_nomor = serializers.SerializerMethodField()

    class Meta:
        model = Permintaan
        fields = [
            'id', 'nomor', 'tanggal', 'ruang', 'ruang_nama',
            'catatan', 'status', 'alasan_tolak', 'legacy_out_id',
            'items', 'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve', 'can_issue',
            'bon_pengeluaran_id', 'bon_pengeluaran_nomor'
        ]

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        # Hanya permintaan berstatus MENUNGGU yang bisa diverifikasi/disetujui
        if obj.status != Permintaan.STATUS_MENUNGGU:
            return False
        user = request.user
        if user.is_superuser or user.username == 'super':
            return True
        kasi_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
        return getattr(user, 'role', '') in kasi_roles or getattr(user, 'is_staff', False)

    def get_can_issue(self, obj):
        # Tahap penyerahan fisik oleh logistik: HANYA jika sudah berstatus DISETUJUI oleh Kasi
        return obj.status == Permintaan.STATUS_DISETUJUI

    def get_bon_pengeluaran_id(self, obj):
        out = obj.pengeluaran_list.order_by('-id').first()
        return out.id if out else None

    def get_bon_pengeluaran_nomor(self, obj):
        out = obj.pengeluaran_list.order_by('-id').first()
        return out.nomor if out else None


class PengeluaranItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)

    class Meta:
        model = PengeluaranItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'satuan_dasar_kode',
            'permintaan_item', 'qty', 'satuan', 'harga_unit', 'subtotal',
            'keterangan'
        ]


class PengeluaranSerializer(serializers.ModelSerializer):
    items = PengeluaranItemSerializer(many=True, read_only=True)
    permintaan_nomor = serializers.CharField(source='permintaan.nomor', read_only=True)
    ruang_nama = serializers.CharField(source='ruang.nama', read_only=True)
    gudang_nama = serializers.CharField(source='gudang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()

    class Meta:
        model = Pengeluaran
        fields = [
            'id', 'nomor', 'permintaan', 'permintaan_nomor',
            'gudang', 'gudang_nama', 'ruang', 'ruang_nama',
            'tanggal', 'penerima_nama', 'total_nilai', 'status',
            'catatan', 'alasan_batal', 'legacy_out_id', 'items',
            'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve'
        ]

    def get_can_approve(self, obj):
        return obj.status == Pengeluaran.STATUS_DRAFT

