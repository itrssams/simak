from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import (
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription
)

def user_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username

def user_unit_label(user):
    if not user:
        return ''
    if user.unit:
        return user.unit.nama
    if getattr(user, 'is_driver', False):
        return 'Driver'
    if getattr(user, 'is_it', False):
        return 'IT'
    role_labels = {
        'direktur': 'Direktur',
        'wakil_direktur': 'Wakil Direktur',
        'manajer': 'Manajer',
        'kepala_seksi': 'Kepala Seksi',
        'karyawan': 'Karyawan Tanpa Unit',
    }
    return role_labels.get(user.role, 'Tanpa Unit')

class ITBackupRecordSerializer(serializers.ModelSerializer):
    backup_type_label = serializers.CharField(source='get_backup_type_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITBackupRecord
        fields = [
            'id', 'backup_type', 'backup_type_label', 'status', 'status_label',
            'filename', 'storage_path', 'file_size_mb', 'started_at', 'finished_at',
            'notes', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

class ITRepairRequestSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    priority_label = serializers.CharField(source='get_priority_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    requester_user_name = serializers.SerializerMethodField()
    requester_user_unit = serializers.SerializerMethodField()
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = ITRepairRequest
        fields = [
            'id', 'title', 'requester_user', 'requester_user_name', 'requester_user_unit',
            'requester_name', 'unit', 'category',
            'category_label', 'priority', 'priority_label', 'status', 'status_label',
            'description', 'resolution', 'sparepart', 'cost', 'foto', 'foto_url',
            'requested_at', 'completed_at',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_by', 'created_by_name', 'requester_user_name',
            'requester_user_unit', 'foto_url', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_requester_user_name(self, obj):
        return user_name(obj.requester_user)

    def get_requester_user_unit(self, obj):
        return user_unit_label(obj.requester_user)

    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None

    def validate(self, attrs):
        requester = attrs.get('requester_user') or getattr(self.instance, 'requester_user', None)
        if requester:
            attrs['requester_name'] = user_name(requester)
            attrs['unit'] = user_unit_label(requester)
        return attrs

class ITCredentialNoteSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    has_password = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITCredentialNote
        fields = [
            'id', 'name', 'category', 'category_label', 'url', 'username',
            'password', 'has_password', 'owner', 'notes', 'is_active',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'has_password', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_has_password(self, obj):
        return bool(obj.password)

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

class ITCredentialNoteDetailSerializer(ITCredentialNoteSerializer):
    password_value = serializers.CharField(source='password', read_only=True)

    class Meta(ITCredentialNoteSerializer.Meta):
        fields = ITCredentialNoteSerializer.Meta.fields + ['password_value']

class ITRemoteAccessSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    has_access_password = serializers.SerializerMethodField()
    access_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ITRemoteAccess
        fields = [
            'id', 'device_name', 'user_owner', 'unit', 'location',
            'anydesk_id', 'rustdesk_id', 'access_password', 'has_access_password',
            'status', 'status_label', 'notes', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'has_access_password', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_has_access_password(self, obj):
        return bool(obj.access_password)

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

class ITRemoteAccessDetailSerializer(ITRemoteAccessSerializer):
    access_password_value = serializers.CharField(source='access_password', read_only=True)

    class Meta(ITRemoteAccessSerializer.Meta):
        fields = ITRemoteAccessSerializer.Meta.fields + ['access_password_value']

class ITSubscriptionSerializer(serializers.ModelSerializer):
    service_type_label = serializers.CharField(source='get_service_type_display', read_only=True)
    billing_cycle_label = serializers.CharField(source='get_billing_cycle_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    days_left = serializers.SerializerMethodField()

    class Meta:
        model = ITSubscription
        fields = [
            'id', 'name', 'service_type', 'service_type_label', 'vendor',
            'account_ref', 'url', 'pic', 'start_date', 'end_date',
            'billing_cycle', 'billing_cycle_label', 'cost',
            'status', 'status_label', 'reminder_days', 'days_left',
            'notes', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'days_left', 'created_by', 'created_by_name', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_days_left(self, obj):
        if not obj.end_date:
            return None
        from django.utils import timezone
        return (obj.end_date - timezone.localdate()).days
