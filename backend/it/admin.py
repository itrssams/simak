from django.contrib import admin
from .models import ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription

@admin.register(ITBackupRecord)
class ITBackupRecordAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'backup_type', 'status', 'filename', 'created_by']
    list_filter = ['backup_type', 'status', 'created_at']
    search_fields = ['filename', 'storage_path', 'notes']

@admin.register(ITRepairRequest)
class ITRepairRequestAdmin(admin.ModelAdmin):
    list_display = ['requested_at', 'title', 'requester_name', 'unit', 'priority', 'status', 'cost']
    list_filter = ['category', 'priority', 'status', 'requested_at']
    search_fields = ['title', 'requester_name', 'unit', 'description', 'resolution', 'sparepart']

@admin.register(ITCredentialNote)
class ITCredentialNoteAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'username', 'owner', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'url', 'username', 'owner', 'notes']

@admin.register(ITRemoteAccess)
class ITRemoteAccessAdmin(admin.ModelAdmin):
    list_display = ['device_name', 'user_owner', 'unit', 'anydesk_id', 'rustdesk_id', 'status']
    list_filter = ['status', 'unit']
    search_fields = ['device_name', 'user_owner', 'unit', 'location', 'anydesk_id', 'rustdesk_id']

@admin.register(ITSubscription)
class ITSubscriptionAdmin(admin.ModelAdmin):
    list_display = ['name', 'service_type', 'vendor', 'end_date', 'billing_cycle', 'cost', 'status']
    list_filter = ['service_type', 'billing_cycle', 'status', 'end_date']
    search_fields = ['name', 'vendor', 'account_ref', 'pic', 'url', 'notes']
