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

from .models import (
    MesinAbsen,
    KaryawanMesinMapping,
    LogPresensi,
    PresensiHarian,
    Pegawai,
    Shift,
    JadwalMaster,
    JadwalKoreksi,
    JadwalDinas,
    TukarDinas,
)
from .services.jadwal_service import kelompok_shift_untuk


class ShiftSerializer(serializers.ModelSerializer):
    kelompok_label = serializers.CharField(source='get_kelompok_display', read_only=True)
    jam_kerja_display = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            'id', 'kode', 'nama', 'kelompok', 'kelompok_label',
            'jam_masuk', 'jam_pulang', 'batas_tepat_waktu', 'jam_kerja_display',
            'is_overnight', 'is_libur',
            'toleransi_terlambat_menit', 'toleransi_pulang_cepat_menit',
            'warna', 'keterangan', 'is_active', 'urutan',
            'created_at', 'updated_at'
        ]

    def get_jam_kerja_display(self, obj):
        if obj.is_libur:
            return 'Libur / Off Duty'
        if obj.jam_masuk and obj.jam_pulang:
            masuk = obj.jam_masuk.strftime('%H:%M')
            pulang = obj.jam_pulang.strftime('%H:%M')
            over = ' (Lintas Hari)' if obj.is_overnight else ''
            return f"{masuk} - {pulang}{over}"
        return '-'


class PegawaiSerializer(serializers.ModelSerializer):
    kategori_label = serializers.CharField(source='get_kategori_display', read_only=True)
    status_kepegawaian_label = serializers.CharField(source='get_status_kepegawaian_display', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True, default=None)
    kelompok_shift = serializers.SerializerMethodField()

    class Meta:
        model = Pegawai
        fields = [
            'id', 'user', 'user_username', 'nama', 'nik', 'pin',
            'jabatan', 'unit_kerja', 'kategori', 'kategori_label', 'kelompok_shift',
            'status_kepegawaian', 'status_kepegawaian_label',
            'no_telepon', 'is_active', 'created_at', 'updated_at'
        ]

    def get_kelompok_shift(self, obj):
        return kelompok_shift_untuk(obj)


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
    unit_nama = serializers.SerializerMethodField()
    role = serializers.CharField(source='user.role', read_only=True, default='-')
    foto = serializers.SerializerMethodField()
    pegawai_id = serializers.IntegerField(source='pegawai.id', read_only=True, allow_null=True)
    pegawai_nama = serializers.CharField(source='pegawai.nama', read_only=True, default=None)
    pegawai_nik = serializers.CharField(source='pegawai.nik', read_only=True, default=None)
    pegawai_unit = serializers.CharField(source='pegawai.unit_kerja', read_only=True, default=None)
    pegawai_jabatan = serializers.CharField(source='pegawai.jabatan', read_only=True, default=None)
    pegawai_kategori = serializers.CharField(source='pegawai.get_kategori_display', read_only=True, default=None)

    class Meta:
        model = KaryawanMesinMapping
        fields = [
            'id', 'mesin', 'pin', 'nama_di_mesin',
            'pegawai', 'pegawai_id', 'pegawai_nama', 'pegawai_nik', 'pegawai_unit', 'pegawai_jabatan', 'pegawai_kategori',
            'user', 'user_id', 'username', 'nama_lengkap', 'unit_nama', 'role', 'foto',
            'is_active', 'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        if obj.pegawai:
            return obj.pegawai.nama
        if obj.user:
            nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return nama or obj.user.username
        return '-'

    def get_unit_nama(self, obj):
        if obj.pegawai and obj.pegawai.unit_kerja:
            return obj.pegawai.unit_kerja
        if obj.user and getattr(obj.user, 'unit', None):
            return obj.user.unit.nama
        return '-'

    def get_foto(self, obj):
        if obj.user and obj.user.foto:
            request = self.context.get('request')
            if request:
                try:
                    return request.build_absolute_uri(obj.user.foto.url)
                except Exception:
                    pass
            return getattr(obj.user.foto, 'url', None)
        return None


class LogPresensiSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='-')
    nama_lengkap = serializers.SerializerMethodField()
    unit_nama = serializers.SerializerMethodField()
    jabatan = serializers.SerializerMethodField()
    nama_di_mesin = serializers.SerializerMethodField()
    mesin_nama = serializers.CharField(source='mesin.nama', read_only=True, default='-')
    pegawai_id = serializers.IntegerField(source='pegawai.id', read_only=True, allow_null=True)

    class Meta:
        model = LogPresensi
        fields = [
            'id', 'mesin', 'mesin_nama', 'pin', 'nama_di_mesin', 'pegawai_id',
            'user', 'username', 'nama_lengkap', 'unit_nama', 'jabatan',
            'waktu', 'status_verifikasi', 'tipe_punch', 'created_at'
        ]

    def get_nama_lengkap(self, obj):
        if obj.pegawai:
            return obj.pegawai.nama
        if obj.user:
            nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return nama or obj.user.username
        return '-'

    def get_unit_nama(self, obj):
        if obj.pegawai and obj.pegawai.unit_kerja:
            return obj.pegawai.unit_kerja
        if obj.user and getattr(obj.user, 'unit', None):
            return obj.user.unit.nama
        return '-'

    def get_jabatan(self, obj):
        if obj.pegawai and obj.pegawai.jabatan:
            return obj.pegawai.jabatan
        if obj.user:
            return obj.user.role
        return '-'

    def get_nama_di_mesin(self, obj):
        cache = self.context.get('mapping_pin_cache')
        if cache is not None:
            return cache.get(str(obj.pin).strip(), '-')
        mapping = KaryawanMesinMapping.objects.filter(pin=obj.pin).first()
        return mapping.nama_di_mesin if mapping and mapping.nama_di_mesin else '-'


class PresensiHarianSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True, allow_null=True)
    username = serializers.CharField(source='user.username', read_only=True, default='-')
    pegawai_id = serializers.IntegerField(source='pegawai.id', read_only=True, allow_null=True)
    pegawai_nama = serializers.CharField(source='pegawai.nama', read_only=True, default='-')
    pegawai_pin = serializers.CharField(source='pegawai.pin', read_only=True, default='-')
    nama_lengkap = serializers.SerializerMethodField()
    unit_id = serializers.IntegerField(source='user.unit.id', read_only=True, allow_null=True)
    unit_nama = serializers.SerializerMethodField()
    role = serializers.CharField(source='user.role', read_only=True, default='-')
    foto = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    
    # Shift info
    shift_kode = serializers.CharField(source='shift.kode', read_only=True, allow_null=True)
    shift_nama = serializers.CharField(source='shift.nama', read_only=True, allow_null=True)
    shift_jam_masuk = serializers.TimeField(source='shift.jam_masuk', read_only=True, allow_null=True)
    shift_jam_pulang = serializers.TimeField(source='shift.jam_pulang', read_only=True, allow_null=True)
    shift_warna = serializers.CharField(source='shift.warna', read_only=True, default='#6366f1')
    shift_is_overnight = serializers.BooleanField(source='shift.is_overnight', read_only=True, default=False)

    izin_info = serializers.SerializerMethodField()

    class Meta:
        model = PresensiHarian
        fields = [
            'id', 'user_id', 'username', 'pegawai_id', 'pegawai_nama', 'pegawai_pin',
            'nama_lengkap', 'unit_id', 'unit_nama', 'role', 'foto',
            'tanggal', 'jam_masuk', 'jam_pulang', 'status', 'status_label',
            'shift_kode', 'shift_nama', 'shift_jam_masuk', 'shift_jam_pulang',
            'shift_warna', 'shift_is_overnight',
            'menit_keterlambatan', 'menit_pulang_cepat', 'total_jam_kerja',
            'izin_keluar', 'izin_info', 'catatan', 'created_at', 'updated_at'
        ]

    def get_nama_lengkap(self, obj):
        if obj.pegawai and obj.pegawai.nama:
            return obj.pegawai.nama
        if obj.user:
            nama = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return nama or obj.user.username
        return '-'

    def get_unit_nama(self, obj):
        if obj.pegawai and obj.pegawai.unit_kerja:
            return obj.pegawai.unit_kerja
        if obj.user and obj.user.unit:
            return obj.user.unit.nama
        return '-'

    def get_foto(self, obj):
        if obj.user and obj.user.foto:
            request = self.context.get('request')
            if request:
                try:
                    return request.build_absolute_uri(obj.user.foto.url)
                except Exception:
                    pass
            return getattr(obj.user.foto, 'url', None)
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


class JadwalMasterSerializer(serializers.ModelSerializer):
    pegawai_nama = serializers.CharField(source='pegawai.nama', read_only=True)
    pegawai_pin = serializers.CharField(source='pegawai.pin', read_only=True)
    pegawai_unit = serializers.CharField(source='pegawai.unit_kerja', read_only=True)
    pegawai_jabatan = serializers.CharField(source='pegawai.jabatan', read_only=True)
    pegawai_kategori = serializers.CharField(source='pegawai.kategori', read_only=True)

    shift_kode = serializers.CharField(source='shift.kode', read_only=True)
    shift_nama = serializers.CharField(source='shift.nama', read_only=True)
    shift_warna = serializers.CharField(source='shift.warna', read_only=True)
    shift_jam_masuk = serializers.TimeField(source='shift.jam_masuk', read_only=True)
    shift_jam_pulang = serializers.TimeField(source='shift.jam_pulang', read_only=True)
    shift_is_overnight = serializers.BooleanField(source='shift.is_overnight', read_only=True)
    shift_is_libur = serializers.BooleanField(source='shift.is_libur', read_only=True)

    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = JadwalMaster
        fields = [
            'id', 'pegawai', 'pegawai_nama', 'pegawai_pin', 'pegawai_unit', 'pegawai_jabatan', 'pegawai_kategori',
            'tanggal', 'shift', 'shift_kode', 'shift_nama', 'shift_warna',
            'shift_jam_masuk', 'shift_jam_pulang', 'shift_is_overnight', 'shift_is_libur',
            'catatan', 'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return '-'
        return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username


class JadwalKoreksiSerializer(serializers.ModelSerializer):
    pegawai_nama = serializers.CharField(source='pegawai.nama', read_only=True)
    pegawai_pin = serializers.CharField(source='pegawai.pin', read_only=True)
    pegawai_unit = serializers.CharField(source='pegawai.unit_kerja', read_only=True)
    pegawai_jabatan = serializers.CharField(source='pegawai.jabatan', read_only=True)
    pegawai_kategori = serializers.CharField(source='pegawai.kategori', read_only=True)

    shift_kode = serializers.CharField(source='shift.kode', read_only=True)
    shift_nama = serializers.CharField(source='shift.nama', read_only=True)
    shift_warna = serializers.CharField(source='shift.warna', read_only=True)
    shift_jam_masuk = serializers.TimeField(source='shift.jam_masuk', read_only=True)
    shift_jam_pulang = serializers.TimeField(source='shift.jam_pulang', read_only=True)
    shift_is_overnight = serializers.BooleanField(source='shift.is_overnight', read_only=True)
    shift_is_libur = serializers.BooleanField(source='shift.is_libur', read_only=True)

    jenis_label = serializers.CharField(source='get_jenis_display', read_only=True)
    shift_master_kode = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = JadwalKoreksi
        fields = [
            'id', 'pegawai', 'pegawai_nama', 'pegawai_pin', 'pegawai_unit', 'pegawai_jabatan', 'pegawai_kategori',
            'tanggal', 'shift', 'shift_kode', 'shift_nama', 'shift_warna',
            'shift_jam_masuk', 'shift_jam_pulang', 'shift_is_overnight', 'shift_is_libur',
            'shift_master_kode', 'jenis', 'jenis_label', 'tukar', 'alasan',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_shift_master_kode(self, obj):
        master_map = self.context.get('master_map')
        if master_map is not None:
            m = master_map.get((obj.pegawai_id, obj.tanggal))
            return m.shift.kode if m else '-'
        m = JadwalMaster.objects.filter(pegawai_id=obj.pegawai_id, tanggal=obj.tanggal).select_related('shift').first()
        return m.shift.kode if m else '-'

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return '-'
        return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username


class JadwalDinasSerializer(serializers.ModelSerializer):
    pegawai_nama = serializers.CharField(source='pegawai.nama', read_only=True)
    pegawai_pin = serializers.CharField(source='pegawai.pin', read_only=True)
    pegawai_unit = serializers.CharField(source='pegawai.unit_kerja', read_only=True)
    pegawai_jabatan = serializers.CharField(source='pegawai.jabatan', read_only=True)
    pegawai_kategori = serializers.CharField(source='pegawai.kategori', read_only=True)
    
    shift_kode = serializers.CharField(source='shift.kode', read_only=True)
    shift_nama = serializers.CharField(source='shift.nama', read_only=True)
    shift_warna = serializers.CharField(source='shift.warna', read_only=True)
    shift_jam_masuk = serializers.TimeField(source='shift.jam_masuk', read_only=True)
    shift_jam_pulang = serializers.TimeField(source='shift.jam_pulang', read_only=True)
    shift_is_overnight = serializers.BooleanField(source='shift.is_overnight', read_only=True)
    shift_is_libur = serializers.BooleanField(source='shift.is_libur', read_only=True)

    shift_master_kode = serializers.CharField(source='shift_master.kode', read_only=True, default=None)
    shift_master_nama = serializers.CharField(source='shift_master.nama', read_only=True, default=None)
    jenis_koreksi = serializers.CharField(source='koreksi.jenis', read_only=True, default=None)
    jenis_koreksi_label = serializers.CharField(source='koreksi.get_jenis_display', read_only=True, default=None)
    alasan_koreksi = serializers.CharField(source='koreksi.alasan', read_only=True, default=None)
    
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = JadwalDinas
        fields = [
            'id', 'pegawai', 'pegawai_nama', 'pegawai_pin', 'pegawai_unit', 'pegawai_jabatan', 'pegawai_kategori',
            'tanggal', 'shift', 'shift_kode', 'shift_nama', 'shift_warna',
            'shift_jam_masuk', 'shift_jam_pulang', 'shift_is_overnight', 'shift_is_libur',
            'shift_master', 'shift_master_kode', 'shift_master_nama',
            'sumber', 'koreksi', 'jenis_koreksi', 'jenis_koreksi_label', 'alasan_koreksi',
            'catatan', 'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return '-'
        return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username


class TukarDinasSerializer(serializers.ModelSerializer):
    pemohon_nama = serializers.CharField(source='pemohon.nama', read_only=True)
    pemohon_pin = serializers.CharField(source='pemohon.pin', read_only=True)
    pemohon_unit = serializers.CharField(source='pemohon.unit_kerja', read_only=True)
    pemohon_jabatan = serializers.CharField(source='pemohon.jabatan', read_only=True)

    pengganti_nama = serializers.CharField(source='pengganti.nama', read_only=True, default='-')
    pengganti_pin = serializers.CharField(source='pengganti.pin', read_only=True, default='-')
    pengganti_unit = serializers.CharField(source='pengganti.unit_kerja', read_only=True, default='-')
    pengganti_jabatan = serializers.CharField(source='pengganti.jabatan', read_only=True, default='-')

    shift_asal_pemohon_kode = serializers.CharField(source='shift_asal_pemohon.kode', read_only=True)
    shift_asal_pemohon_nama = serializers.CharField(source='shift_asal_pemohon.nama', read_only=True)
    shift_asal_pemohon_warna = serializers.CharField(source='shift_asal_pemohon.warna', read_only=True)

    shift_tujuan_pemohon_kode = serializers.CharField(source='shift_tujuan_pemohon.kode', read_only=True)
    shift_tujuan_pemohon_nama = serializers.CharField(source='shift_tujuan_pemohon.nama', read_only=True)
    shift_tujuan_pemohon_warna = serializers.CharField(source='shift_tujuan_pemohon.warna', read_only=True)

    shift_asal_pengganti_kode = serializers.CharField(source='shift_asal_pengganti.kode', read_only=True, default='-')
    shift_asal_pengganti_nama = serializers.CharField(source='shift_asal_pengganti.nama', read_only=True, default='-')
    shift_asal_pengganti_warna = serializers.CharField(source='shift_asal_pengganti.warna', read_only=True, default='#94a3b8')

    shift_tujuan_pengganti_kode = serializers.CharField(source='shift_tujuan_pengganti.kode', read_only=True, default='-')
    shift_tujuan_pengganti_nama = serializers.CharField(source='shift_tujuan_pengganti.nama', read_only=True, default='-')
    shift_tujuan_pengganti_warna = serializers.CharField(source='shift_tujuan_pengganti.warna', read_only=True, default='#94a3b8')

    status_label = serializers.CharField(source='get_status_display', read_only=True)
    jenis_label = serializers.CharField(source='get_jenis_display', read_only=True)
    disetujui_oleh_name = serializers.SerializerMethodField()

    class Meta:
        model = TukarDinas
        fields = [
            'id', 'pemohon', 'pemohon_nama', 'pemohon_pin', 'pemohon_unit', 'pemohon_jabatan',
            'tanggal_pemohon', 'shift_asal_pemohon', 'shift_asal_pemohon_kode', 'shift_asal_pemohon_nama', 'shift_asal_pemohon_warna',
            'shift_tujuan_pemohon', 'shift_tujuan_pemohon_kode', 'shift_tujuan_pemohon_nama', 'shift_tujuan_pemohon_warna',
            'pengganti', 'pengganti_nama', 'pengganti_pin', 'pengganti_unit', 'pengganti_jabatan',
            'tanggal_pengganti', 'shift_asal_pengganti', 'shift_asal_pengganti_kode', 'shift_asal_pengganti_nama', 'shift_asal_pengganti_warna',
            'shift_tujuan_pengganti', 'shift_tujuan_pengganti_kode', 'shift_tujuan_pengganti_nama', 'shift_tujuan_pengganti_warna',
            'jenis', 'jenis_label', 'status', 'status_label', 'alasan',
            'disetujui_rekan', 'rekan_disetujui_at',
            'disetujui_oleh', 'disetujui_oleh_name', 'disetujui_at', 'catatan_atasan',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_disetujui_oleh_name(self, obj):
        if not obj.disetujui_oleh:
            return '-'
        return f"{obj.disetujui_oleh.first_name} {obj.disetujui_oleh.last_name}".strip() or obj.disetujui_oleh.username


