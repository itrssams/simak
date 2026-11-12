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
        from gudang.models import StokSaldo
        from django.db.models import Sum
        total = StokSaldo.objects.filter(barang=obj.barang).aggregate(total=Sum('qty'))['total']
        return float(total or 0)


class PermintaanSerializer(serializers.ModelSerializer):
    items = PermintaanItemSerializer(many=True, read_only=True)
    ruang_nama = serializers.CharField(source='ruang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()
    can_issue = serializers.SerializerMethodField()
    bon_pengeluaran_id = serializers.SerializerMethodField()
    bon_pengeluaran_nomor = serializers.SerializerMethodField()
    tanggal_penyerahan = serializers.SerializerMethodField()

    class Meta:
        model = Permintaan
        fields = [
            'id', 'nomor', 'tanggal', 'tanggal_penyerahan', 'ruang', 'ruang_nama',
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
        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True
        
        # Wajib memiliki hak akses kelola logistik (is_logistik) DAN berstatus Koordinator/Kasi ke atas
        has_logistik_access = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
        approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
        is_approver_role = getattr(user, 'role', '') in approver_roles

        return has_logistik_access and is_approver_role

    def get_can_issue(self, obj):
        # Tahap penyerahan fisik oleh logistik: HANYA jika sudah berstatus DISETUJUI oleh Kasi
        return obj.status == Permintaan.STATUS_DISETUJUI

    def _get_active_pengeluaran(self, obj):
        outs = [p for p in obj.pengeluaran_list.all() if p.status != Pengeluaran.STATUS_BATAL]
        if not outs:
            outs = list(obj.pengeluaran_list.all())
        return outs[0] if outs else None

    def get_bon_pengeluaran_id(self, obj):
        out = self._get_active_pengeluaran(obj)
        return out.id if out else None

    def get_bon_pengeluaran_nomor(self, obj):
        out = self._get_active_pengeluaran(obj)
        return out.nomor if out else None

    def get_tanggal_penyerahan(self, obj):
        out = self._get_active_pengeluaran(obj)
        return str(out.tanggal) if out and out.tanggal else None


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
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.status != Pengeluaran.STATUS_DRAFT:
            return False
        user = request.user
        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True
        return bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])

