from rest_framework import serializers
from .models import Logbook


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

        if jam_mulai and jam_selesai:
            if jam_mulai == jam_selesai:
                raise serializers.ValidationError({'jam_selesai': 'Jam selesai tidak boleh sama persis dengan jam mulai.'})

        return data
