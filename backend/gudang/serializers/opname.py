from rest_framework import serializers
from decimal import Decimal
from gudang.models import StockOpname, StockOpnameItem, Barang, StokSaldo


class StockOpnameItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)

    class Meta:
        model = StockOpnameItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'satuan_dasar_kode',
            'qty_sistem', 'qty_fisik', 'selisih', 'satuan',
            'harga_unit', 'subtotal_fisik', 'subtotal_selisih', 'keterangan'
        ]


class StockOpnameSerializer(serializers.ModelSerializer):
    items = StockOpnameItemSerializer(many=True, read_only=True)
    gudang_nama = serializers.CharField(source='gudang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()

    class Meta:
        model = StockOpname
        fields = [
            'id', 'nomor', 'tanggal', 'gudang', 'gudang_nama',
            'jenis', 'status', 'catatan',
            'total_selisih_qty', 'total_nilai_fisik', 'items',
            'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve'
        ]

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.status != StockOpname.STATUS_DRAFT:
            return False
        user = request.user
        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True
        has_logistik = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
        approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur'}
        return has_logistik and (getattr(user, 'role', '') in approver_roles)

