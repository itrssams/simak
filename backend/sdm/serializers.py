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

    # Approval Fields
    approved_by_id = serializers.IntegerField(source='approved_by.id', read_only=True, allow_null=True)
    approved_by_nama = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()
    approvers_list = serializers.SerializerMethodField()

    class Meta:
        model = IzinKeluar
        fields = [
            'id', 'user_id', 'username', 'nama_lengkap', 'unit_id', 'unit_nama', 'foto',
            'tanggal', 'kategori', 'kategori_label', 'keperluan',
            'jam_keluar_awal', 'jam_kembali_awal',
            'jam_keluar', 'jam_kembali', 'jam_kembali_aktual',
            'status', 'status_label', 'is_adjusted', 'catatan_kembali',
            'approved_by_id', 'approved_by_nama', 'approved_at', 'catatan_approval',
            'can_approve', 'approvers_list',
            'logs', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'jam_keluar_awal', 'jam_kembali_awal',
            'status', 'is_adjusted', 'approved_by', 'approved_at',
            'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return nama or obj.user.username

    def get_foto(self, obj):
        if not obj.user.foto:
            return None
        return obj.user.foto.url

    def get_approved_by_nama(self, obj):
        if not obj.approved_by:
            return None
        nama = f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
        return nama or obj.approved_by.username

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if obj.status != 'menunggu_approval':
            return False
        from .views import user_can_approve_izin
        return user_can_approve_izin(request.user, obj)

    def get_approvers_list(self, obj):
        approvers = obj.user.get_approvers_chain()
        return [
            {
                'id': u.id,
                'nama': f"{u.first_name} {u.last_name}".strip() or u.username,
                'role': u.get_role_display()
            }
            for u in approvers
        ]


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


# ==============================================================================
# SERIALIZERS UNTUK MESIN ABSEN & PRESENSI PEGAWAI
# ==============================================================================

from .models import MesinAbsen, KaryawanMesinMapping, LogPresensi, PresensiHarian


class MesinAbsenSerializer(serializers.ModelSerializer):
    status_koneksi_label = serializers.CharField(source='get_status_koneksi_display', read_only=True)

    class Meta:
        model = MesinAbsen
        fields = [
            'id', 'nama', 'ip_address', 'port', 'comm_key',
            'serial_number', 'device_name', 'mac_address',
            'is_active', 'status_koneksi', 'status_koneksi_label',
            'total_user_mesin', 'total_log_mesin', 'last_sync_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'serial_number', 'device_name', 'mac_address', 'last_sync_at', 'created_at', 'updated_at']


class KaryawanMesinMappingSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True, allow_null=True)
    username = serializers.CharField(source='user.username', read_only=True, default='-')
    nama_lengkap = serializers.SerializerMethodField()
    unit_nama = serializers.CharField(source='user.unit.nama', read_only=True, default='-')
    role = serializers.CharField(source='user.role', read_only=True, default='-')
    foto = serializers.SerializerMethodField()

    class Meta:
        model = KaryawanMesinMapping
        fields = [
            'id', 'mesin', 'pin', 'nama_di_mesin',
            'user', 'user_id', 'username', 'nama_lengkap', 'unit_nama', 'role', 'foto',
            'is_active', 'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        if not obj.user:
            return '-'
        nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return nama or obj.user.username

    def get_foto(self, obj):
        if obj.user and obj.user.foto:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.user.foto.url)
            return obj.user.foto.url
        return None


class LogPresensiSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='-')
    nama_lengkap = serializers.SerializerMethodField()
    mesin_nama = serializers.CharField(source='mesin.nama', read_only=True, default='-')

    class Meta:
        model = LogPresensi
        fields = [
            'id', 'mesin', 'mesin_nama', 'pin', 'user', 'username', 'nama_lengkap',
            'waktu', 'status_verifikasi', 'tipe_punch', 'created_at'
        ]

    def get_nama_lengkap(self, obj):
        if not obj.user:
            return '-'
        nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return nama or obj.user.username


class PresensiHarianSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    nama_lengkap = serializers.SerializerMethodField()
    unit_id = serializers.IntegerField(source='user.unit.id', read_only=True, allow_null=True)
    unit_nama = serializers.CharField(source='user.unit.nama', read_only=True, default='-')
    role = serializers.CharField(source='user.role', read_only=True, default='-')
    foto = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    izin_info = serializers.SerializerMethodField()

    class Meta:
        model = PresensiHarian
        fields = [
            'id', 'user_id', 'username', 'nama_lengkap', 'unit_id', 'unit_nama', 'role', 'foto',
            'tanggal', 'jam_masuk', 'jam_pulang', 'status', 'status_label',
            'menit_keterlambatan', 'menit_pulang_cepat', 'total_jam_kerja',
            'izin_keluar', 'izin_info', 'catatan', 'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return nama or obj.user.username

    def get_foto(self, obj):
        if obj.user.foto:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.user.foto.url)
            return obj.user.foto.url
        return None

    def get_izin_info(self, obj):
        if not obj.izin_keluar:
            return None
        return {
            'id': obj.izin_keluar.id,
            'kategori': obj.izin_keluar.get_kategori_display(),
            'keperluan': obj.izin_keluar.keperluan,
            'jam_keluar': str(obj.izin_keluar.jam_keluar),
            'jam_kembali': str(obj.izin_keluar.jam_kembali),
            'status': obj.izin_keluar.status,
        }
