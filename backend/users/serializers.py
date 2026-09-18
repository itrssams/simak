from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Unit

User = get_user_model()


class UnitSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model  = Unit
        fields = ['id', 'nama', 'is_active', 'created_at', 'user_count']
        read_only_fields = ['id', 'created_at']

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


class UserSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source='get_role_display', read_only=True)
    unit_nama  = serializers.CharField(source='unit.nama', read_only=True)
    foto       = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'role_label', 'is_driver', 'is_it', 'is_keuangan', 'is_petty_cash_cashier',
            'akses_catatan_utang', 'akses_kas_besar', 'akses_reimbursement',
            'view_petty_cash', 'view_kas_besar', 'view_logistik',
            'is_logistik', 'is_akuntansi', 'is_sdm', 'unit', 'unit_nama',
            'foto', 'is_active', 'is_staff', 'is_superuser', 'date_joined',
        ]
        read_only_fields = ['id', 'date_joined']

    def get_foto(self, obj):
        if not obj.foto:
            return None
        return obj.foto.url


class UserInputSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6)

    class Meta:
        model  = User
        fields = [
            'username', 'email', 'first_name', 'last_name',
            'role', 'is_driver', 'is_it', 'is_keuangan', 'is_petty_cash_cashier',
            'akses_catatan_utang', 'akses_kas_besar', 'akses_reimbursement',
            'view_petty_cash', 'view_kas_besar', 'view_logistik',
            'is_logistik', 'is_akuntansi', 'is_sdm', 'unit', 'is_active', 'password', 'foto',
        ]

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password wajib diisi saat membuat akun.'})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class UserPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=6)


class SelfProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class SelfChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=6)
    confirm_password = serializers.CharField(required=True, write_only=True, min_length=6)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Password saat ini tidak sesuai.')
        return value

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Konfirmasi password baru tidak cocok.'})
        if data['new_password'] == data['current_password']:
            raise serializers.ValidationError({'new_password': 'Password baru tidak boleh sama dengan password saat ini.'})
        return data
