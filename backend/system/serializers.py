from .audit import infer_target, make_description, target_display_from_user, get_keuangan_target_display
from .models import AuditLog, Announcement, AnnouncementRead
import re
from datetime import timedelta
from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import connection

class AuditLogSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    action_label = serializers.CharField(source='get_action_display', read_only=True)
    username = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    entity = serializers.CharField(source='entity_type', read_only=True)
    description = serializers.SerializerMethodField()
    path = serializers.SerializerMethodField()
    method = serializers.SerializerMethodField()
    status_code = serializers.SerializerMethodField()
    metadata = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_display', 'username', 'role', 'action', 'action_label',
            'entity', 'entity_type', 'entity_id', 'entity_display', 'description',
            'path', 'method', 'status_code', 'ip_address', 'user_agent', 'status',
            'error_message', 'metadata', 'old_values', 'new_values', 'created_at',
        ]
        read_only_fields = fields

    def get_user_display(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return 'System'

    def get_username(self, obj):
        return obj.user.username if obj.user else ''

    def get_role(self, obj):
        return obj.user.role if obj.user else ''

    def get_description(self, obj):
        values = obj.new_values if isinstance(obj.new_values, dict) else {}
        path = values.get('path', '')
        method = values.get('method', '')
        status_code = values.get('status_code')
        if obj.action == 'login':
            return obj.description
        if not path:
            return obj.description

        app_label, entity, entity_id, extra_action, inferred_action = infer_target(path, method)
        metadata = dict(values)
        target = metadata.get('target') if isinstance(metadata.get('target'), dict) else {}
        if not target:
            target = {
                'app_label': app_label,
                'entity': entity,
                'entity_id': entity_id,
                'extra_action': extra_action,
                'target_display': '',
            }
            if entity == 'users' and entity_id:
                user = get_user_model().objects.filter(pk=entity_id).first()
                target['target_display'] = target_display_from_user(user)
                target['target_is_active'] = user.is_active if user else None
            elif app_label == 'keuangan' and entity_id:
                target['target_display'] = get_keuangan_target_display(entity, entity_id)
            metadata['target'] = target

        return make_description(
            obj.user,
            obj.action or inferred_action,
            entity or obj.entity_type,
            entity_id or obj.entity_id,
            extra_action,
            metadata,
            status_code,
        )

    def get_path(self, obj):
        return obj.new_values.get('path', '') if isinstance(obj.new_values, dict) else ''

    def get_method(self, obj):
        return obj.new_values.get('method', '') if isinstance(obj.new_values, dict) else ''

    def get_status_code(self, obj):
        return obj.new_values.get('status_code') if isinstance(obj.new_values, dict) else None

    def get_metadata(self, obj):
        return obj.new_values if isinstance(obj.new_values, dict) else {}

class AnnouncementSerializer(serializers.ModelSerializer):
    priority_label = serializers.CharField(source='get_priority_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'message', 'audience', 'priority', 'priority_label',
            'is_active', 'publish_at', 'expires_at',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'is_read',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'updated_at', 'is_read']

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_is_read(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return AnnouncementRead.objects.filter(announcement=obj, user=user).exists()