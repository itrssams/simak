from django.contrib import admin
from .models import AuditLog, Announcement, AnnouncementRead

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['entity_type', 'entity_id', 'action', 'user', 'created_at', 'status']
    search_fields = ['entity_type', 'entity_id', 'action', 'description']
    list_filter = ['action', 'status']
    readonly_fields = [field.name for field in AuditLog._meta.fields]

admin.site.register(Announcement)
admin.site.register(AnnouncementRead)
