from rest_framework import serializers
from .models import (
    LogistikBarang, LogistikBatch, LogistikPembelian,
    LogistikMutasi, LogistikPermintaan, LogistikOpname
)

def user_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username

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
