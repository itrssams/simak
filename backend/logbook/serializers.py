from rest_framework import serializers
from .models import Logbook, Task, SesiKerja


class LogbookSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_nama = serializers.SerializerMethodField()
    user_role = serializers.CharField(source='user.role', read_only=True)
    user_role_label = serializers.CharField(source='user.get_role_display', read_only=True)
    unit_id = serializers.IntegerField(source='user.unit.id', read_only=True, allow_null=True)
    unit_nama = serializers.CharField(source='user.unit.nama', read_only=True, default='-')
    durasi_menit = serializers.IntegerField(read_only=True)
    durasi_format = serializers.CharField(read_only=True)

    class Meta:
        model = Logbook
        fields = [
            'id',
            'user_id',
            'user_username',
            'user_nama',
            'user_role',
            'user_role_label',
            'unit_id',
            'unit_nama',
            'tanggal',
            'jam_mulai',
            'jam_selesai',
            'deskripsi',
            'durasi_menit',
            'durasi_format',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_user_nama(self, obj):
        if not obj.user:
            return '-'
        full_name = f"{obj.user.first_name or ''} {obj.user.last_name or ''}".strip()
        return full_name or obj.user.username


class LogbookInputSerializer(serializers.ModelSerializer):
    class Meta:
        model = Logbook
        fields = [
            'tanggal',
            'jam_mulai',
            'jam_selesai',
            'deskripsi',
        ]

    def validate_deskripsi(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Uraian / deskripsi pekerjaan wajib diisi.')
        return value.strip()

    def validate(self, data):
        jam_mulai = data.get('jam_mulai') or getattr(self.instance, 'jam_mulai', None)
        jam_selesai = data.get('jam_selesai') or getattr(self.instance, 'jam_selesai', None)
        tanggal = data.get('tanggal') or getattr(self.instance, 'tanggal', None)

        if jam_mulai and jam_selesai:
            if jam_mulai == jam_selesai:
                raise serializers.ValidationError({'jam_selesai': 'Jam selesai tidak boleh sama persis dengan jam mulai.'})
                
            # Cek overlap jam
            if 'request' in self.context:
                user = self.context['request'].user
                existing = Logbook.objects.filter(user=user, tanggal=tanggal)
                if self.instance:
                    existing = existing.exclude(pk=self.instance.pk)
                
                # Convert to absolute minutes for overlap check
                def to_mins(t):
                    return t.hour * 60 + t.minute
                    
                new_start = to_mins(jam_mulai)
                new_end = to_mins(jam_selesai)
                if new_end < new_start:
                    new_end += 24 * 60  # Lintas tengah malam
                    
                for entry in existing:
                    e_start = to_mins(entry.jam_mulai)
                    e_end = to_mins(entry.jam_selesai)
                    if e_end < e_start:
                        e_end += 24 * 60
                        
                    # Overlap condition: max(start1, start2) < min(end1, end2)
                    if max(new_start, e_start) < min(new_end, e_end):
                        raise serializers.ValidationError({
                            'jam_mulai': f'Jam tumpang tindih dengan "{entry.deskripsi}" '
                                         f'({entry.jam_mulai.strftime("%H:%M")} - {entry.jam_selesai.strftime("%H:%M")})'
                        })

        return data


class SesiKerjaSerializer(serializers.ModelSerializer):
    class Meta:
        model = SesiKerja
        fields = ['id', 'mulai', 'selesai', 'durasi_kerja', 'durasi_lembur', 'created_at']
        read_only_fields = ['id', 'created_at']


class TaskSerializer(serializers.ModelSerializer):
    sesi_list = SesiKerjaSerializer(many=True, read_only=True)
    has_active_session = serializers.SerializerMethodField()
    durasi_kerja_format = serializers.SerializerMethodField()
    durasi_lembur_format = serializers.SerializerMethodField()
    user_nama = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'no_task', 'judul', 'deskripsi', 'status', 'started_at', 'completed_at',
            'total_menit_kerja', 'total_menit_lembur', 'created_at', 'updated_at',
            'sesi_list', 'has_active_session', 'durasi_kerja_format', 'durasi_lembur_format',
            'user_nama'
        ]
        read_only_fields = ['id', 'no_task', 'started_at', 'completed_at', 'created_at', 'updated_at', 'total_menit_kerja', 'total_menit_lembur']

    def get_has_active_session(self, obj):
        return obj.sesi_list.filter(selesai__isnull=True).exists()

    def _format_menit(self, menit):
        if menit <= 0: return '0 mnt'
        jam = menit // 60
        s = menit % 60
        if jam > 0 and s > 0: return f"{jam}j {s}m"
        elif jam > 0: return f"{jam}j"
        return f"{s}m"

    def get_durasi_kerja_format(self, obj):
        return self._format_menit(obj.total_menit_kerja)

    def get_durasi_lembur_format(self, obj):
        return self._format_menit(obj.total_menit_lembur)
        
    def get_user_nama(self, obj):
        if not obj.user:
            return '-'
        full_name = f"{obj.user.first_name or ''} {obj.user.last_name or ''}".strip()
        return full_name or obj.user.username


class TaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['judul', 'deskripsi']

    def validate_judul(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Judul task wajib diisi.')
        return value.strip()
