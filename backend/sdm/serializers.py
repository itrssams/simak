from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import IzinKeluar, IzinKeluarLog

User = get_user_model()


class IzinKeluarLogSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = IzinKeluarLog
        fields = [
            'id', 'izin',
            'jam_keluar_sebelum', 'jam_kembali_sebelum',
            'jam_keluar_sesudah', 'jam_kembali_sesudah',
            'alasan_penyesuaian', 'created_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['id', 'izin', 'created_at', 'created_by']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return '-'
        nama = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return nama or obj.created_by.username


class IzinKeluarSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    nama_lengkap = serializers.SerializerMethodField()
    unit_id = serializers.IntegerField(source='user.unit.id', read_only=True, allow_null=True)
    unit_nama = serializers.CharField(source='user.unit.nama', read_only=True, default='-')
    foto = serializers.SerializerMethodField()
    kategori_label = serializers.CharField(source='get_kategori_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    logs = IzinKeluarLogSerializer(many=True, read_only=True)

    class Meta:
        model = IzinKeluar
        fields = [
            'id', 'user_id', 'username', 'nama_lengkap', 'unit_id', 'unit_nama', 'foto',
            'tanggal', 'kategori', 'kategori_label', 'keperluan',
            'jam_keluar_awal', 'jam_kembali_awal',
            'jam_keluar', 'jam_kembali', 'jam_kembali_aktual',
            'status', 'status_label', 'is_adjusted', 'catatan_kembali',
            'logs', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'jam_keluar_awal', 'jam_kembali_awal',
            'status', 'is_adjusted', 'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return nama or obj.user.username

    def get_foto(self, obj):
        if not obj.user.foto:
            return None
        return obj.user.foto.url


class IzinKeluarCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IzinKeluar
        fields = ['id', 'tanggal', 'kategori', 'keperluan', 'jam_keluar', 'jam_kembali']
        read_only_fields = ['id']

    def validate(self, attrs):
        jam_keluar = attrs.get('jam_keluar')
        jam_kembali = attrs.get('jam_kembali')
        if jam_keluar and jam_kembali and jam_kembali <= jam_keluar:
            raise serializers.ValidationError({
                'jam_kembali': 'Jam rencana kembali harus lebih besar dari jam keluar.'
            })
        return attrs


class IzinKeluarAdjustSerializer(serializers.Serializer):
    jam_keluar = serializers.TimeField(required=False)
    jam_kembali = serializers.TimeField(required=False)
    alasan_penyesuaian = serializers.CharField(required=True, min_length=3)

    def validate(self, attrs):
        if not attrs.get('jam_keluar') and not attrs.get('jam_kembali'):
            raise serializers.ValidationError('Minimal tentukan jam keluar atau jam kembali yang disesuaikan.')
        jam_keluar = attrs.get('jam_keluar')
        jam_kembali = attrs.get('jam_kembali')
        if jam_keluar and jam_kembali and jam_kembali <= jam_keluar:
            raise serializers.ValidationError({
                'jam_kembali': 'Jam rencana kembali harus lebih besar dari jam keluar.'
            })
        return attrs


class IzinKeluarReturnSerializer(serializers.Serializer):
    jam_kembali_aktual = serializers.TimeField(required=False)
    catatan_kembali = serializers.CharField(required=False, allow_blank=True, default='')
