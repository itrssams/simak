from .models import Kendaraan, LogPerjalanan, LaporanPerjalanan, FotoLaporanPerjalanan, LogBBM, LogMaintenance
import re
from datetime import timedelta
from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import connection

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