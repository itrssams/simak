from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Akun, Transaksi
from .models import (
    AuditLog, RekeningBank, RiwayatSaldoRekening,
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription,
    Announcement, AnnouncementRead,
)

@admin.register(Akun)
class AkunAdmin(admin.ModelAdmin):
    list_display  = ['kode_akun', 'nama_akun', 'tipe', 'saldo_normal', 'is_kas_setara', 'is_active']
    list_filter   = ['tipe', 'saldo_normal', 'is_kas_setara', 'is_active']
    search_fields = ['kode_akun', 'nama_akun']


@admin.register(Transaksi)
class TransaksiAdmin(admin.ModelAdmin):
    list_display   = ['tanggal', 'keterangan', 'jenis', 'kategori_arus', 'akun', 'jumlah', 'created_by']
    list_filter    = ['jenis', 'kategori_arus', 'tanggal']
    search_fields  = ['keterangan', 'nomor_referensi']
    date_hierarchy = 'tanggal'

@admin.register(RekeningBank)
class RekeningBankAdmin(admin.ModelAdmin):
    list_display = ['nama_rekening', 'bank', 'nomor_rekening', 'saldo', 'is_active', 'updated_at']

@admin.register(RiwayatSaldoRekening)
class RiwayatSaldoRekeningAdmin(admin.ModelAdmin):
    list_display = ['rekening', 'saldo_sebelum', 'saldo_sesudah', 'selisih', 'created_at']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'action', 'entity_type', 'entity_id', 'status']
    list_filter = ['action', 'entity_type', 'status', 'created_at']
    search_fields = ['user__username', 'description', 'entity_display']
    readonly_fields = [field.name for field in AuditLog._meta.fields]


@admin.register(ITBackupRecord)
class ITBackupRecordAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'backup_type', 'status', 'file_name', 'created_by']
    list_filter = ['backup_type', 'status', 'created_at']
    search_fields = ['file_name', 'storage_path', 'notes']


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


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ['publish_at', 'title', 'priority', 'is_active', 'expires_at', 'created_by']
    list_filter = ['priority', 'is_active', 'publish_at', 'expires_at']
    search_fields = ['title', 'message', 'created_by__username']


@admin.register(AnnouncementRead)
class AnnouncementReadAdmin(admin.ModelAdmin):
    list_display = ['announcement', 'user', 'read_at']
    list_filter = ['read_at']
    search_fields = ['announcement__title', 'user__username']
