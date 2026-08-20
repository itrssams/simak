from django.db import connection, models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('action', 'Action'),
        ('login', 'Login'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=30)
    entity_id = models.IntegerField(default=0)
    entity_display = models.CharField(max_length=255, blank=True)
    old_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)
    description = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='success')
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_audit_log'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id'], name='keuangan_au_entity__f2af1e_idx'),
            models.Index(fields=['user', '-created_at'], name='keuangan_au_user_id_bcbc70_idx'),
            models.Index(fields=['action', '-created_at'], name='keuangan_au_action_191ccc_idx'),
            models.Index(fields=['-created_at'], name='keuangan_au_created_b5330a_idx'),
        ]
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        actor = self.user.username if self.user else 'System'
        return f'{self.created_at:%Y-%m-%d %H:%M} | {actor} | {self.action} | {self.entity_type}'

class IdempotencyLog(models.Model):
    idempotency_key = models.CharField(max_length=120)
    request_path = models.CharField(max_length=500, blank=True)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(default=dict, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='idempotency_logs',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_idempotency_log'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['idempotency_key', 'user'], name='keuangan_id_idempot_f20424_idx'),
            models.Index(fields=['-created_at'], name='keuangan_id_created_80e4ee_idx'),
        ]

    def __str__(self):
        return self.idempotency_key

class Announcement(models.Model):
    PRIORITY_CHOICES = [
        ('normal', 'Normal'),
        ('important', 'Penting'),
        ('urgent', 'Darurat'),
    ]

    title = models.CharField(max_length=180)
    message = models.TextField()
    audience = models.CharField(max_length=180, default='all')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    is_active = models.BooleanField(default=True)
    publish_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='announcements')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_announcement'
        ordering = ['-publish_at', '-created_at']
        indexes = [
            models.Index(fields=['is_active', 'publish_at'], name='announce_active_pub_idx'),
            models.Index(fields=['expires_at'], name='announce_expires_idx'),
        ]

    def __str__(self):
        return self.title

class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='announcement_reads')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_announcement_read'
        unique_together = ('announcement', 'user')
        ordering = ['-read_at']

    def __str__(self):
        return f'{self.user} read {self.announcement}'