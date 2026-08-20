from django.db import connection, models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

def foto_it_repair_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'it/repair/{period}/{filename}'

class ITBackupRecord(models.Model):
    BACKUP_TYPE_CHOICES = [
        ('full', 'Full Backup'),
        ('incremental', 'Incremental Backup'),
        ('differential', 'Differential Backup'),
        ('database', 'Database Only'),
        ('files', 'Files Only'),
    ]
    STATUS_CHOICES = [
        ('success', 'Sukses'),
        ('failed', 'Gagal'),
        ('in_progress', 'Sedang Berjalan'),
        ('warning', 'Selesai (dengan Peringatan)'),
    ]

    backup_type = models.CharField(max_length=30, choices=BACKUP_TYPE_CHOICES, default='database')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='success')
    filename = models.CharField(max_length=255, blank=True)
    storage_path = models.CharField(max_length=500, blank=True)
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_backup_records')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'it_backup_record'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at'], name='it_backup_status_idx'),
            models.Index(fields=['backup_type', '-created_at'], name='it_backup_type_idx'),
        ]

    def __str__(self):
        return f"{self.get_backup_type_display()} - {self.get_status_display()}"

class ITRepairRequest(models.Model):
    CATEGORY_CHOICES = [
        ('hardware', 'Hardware'),
        ('software', 'Software'),
        ('network', 'Jaringan'),
        ('printer', 'Printer'),
        ('account', 'Akun / Akses'),
        ('simak', 'SIMAK'),
        ('other', 'Lainnya'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Rendah'),
        ('normal', 'Normal'),
        ('high', 'Tinggi'),
        ('urgent', 'Darurat'),
    ]
    STATUS_CHOICES = [
        ('open', 'Baru'),
        ('in_progress', 'Diproses'),
        ('waiting', 'Menunggu'),
        ('done', 'Selesai'),
        ('cancelled', 'Dibatalkan'),
    ]

    title = models.CharField(max_length=180)
    requester_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_reported_repairs')
    requester_name = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    description = models.TextField(blank=True)
    resolution = models.TextField(blank=True)
    sparepart = models.CharField(max_length=255, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    foto = models.ImageField(upload_to=foto_it_repair_path, null=True, blank=True)
    requested_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_repair_requests')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'it_repair_request'
        ordering = ['-requested_at', '-created_at']
        indexes = [
            models.Index(fields=['status', 'priority'], name='it_ticket_status_idx'),
            models.Index(fields=['requested_at'], name='it_ticket_requested_idx'),
        ]

    def __str__(self):
        return self.title

class ITCredentialNote(models.Model):
    CATEGORY_CHOICES = [
        ('website', 'Website'),
        ('server', 'Server'),
        ('database', 'Database'),
        ('email', 'Email'),
        ('device', 'Perangkat'),
        ('vendor', 'Vendor'),
        ('other', 'Lainnya'),
    ]

    name = models.CharField(max_length=160)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='website')
    url = models.URLField(max_length=500, blank=True)
    username = models.CharField(max_length=180, blank=True)
    password = models.TextField(blank=True)
    owner = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_credential_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'it_credential_note'
        ordering = ['name']
        indexes = [
            models.Index(fields=['category', 'is_active'], name='it_credential_cat_idx'),
            models.Index(fields=['name'], name='it_credential_name_idx'),
        ]

    def __str__(self):
        return self.name

class ITRemoteAccess(models.Model):
    STATUS_CHOICES = [
        ('active', 'Aktif'),
        ('inactive', 'Nonaktif'),
        ('maintenance', 'Maintenance'),
    ]

    device_name = models.CharField(max_length=160)
    user_owner = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=120, blank=True)
    location = models.CharField(max_length=180, blank=True)
    anydesk_id = models.CharField(max_length=80, blank=True)
    rustdesk_id = models.CharField(max_length=80, blank=True)
    access_password = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_remote_access_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'it_remote_access'
        ordering = ['device_name']
        indexes = [
            models.Index(fields=['status', 'device_name'], name='it_remote_status_idx'),
            models.Index(fields=['unit'], name='it_remote_unit_idx'),
        ]

    def __str__(self):
        return self.device_name

class ITSubscription(models.Model):
    SERVICE_TYPE_CHOICES = [
        ('domain', 'Domain'),
        ('hosting', 'Hosting'),
        ('ssl', 'SSL'),
        ('internet', 'Internet'),
        ('software', 'Software / Lisensi'),
        ('vendor', 'Vendor / Support'),
        ('other', 'Lainnya'),
    ]
    BILLING_CYCLE_CHOICES = [
        ('monthly', 'Bulanan'),
        ('quarterly', 'Triwulan'),
        ('semester', 'Semester'),
        ('yearly', 'Tahunan'),
        ('one_time', 'Sekali Bayar'),
    ]
    STATUS_CHOICES = [
        ('active', 'Aktif'),
        ('expiring', 'Hampir Habis'),
        ('expired', 'Expired'),
        ('cancelled', 'Dibatalkan'),
    ]

    name = models.CharField(max_length=180)
    service_type = models.CharField(max_length=30, choices=SERVICE_TYPE_CHOICES, default='software')
    vendor = models.CharField(max_length=160, blank=True)
    account_ref = models.CharField(max_length=180, blank=True)
    url = models.URLField(max_length=500, blank=True)
    pic = models.CharField(max_length=120, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CYCLE_CHOICES, default='yearly')
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    reminder_days = models.PositiveIntegerField(default=30)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='it_subscriptions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'it_subscription'
        ordering = ['end_date', 'name']
        indexes = [
            models.Index(fields=['status', 'end_date'], name='it_sub_status_end_idx'),
            models.Index(fields=['service_type', 'end_date'], name='it_sub_type_end_idx'),
        ]

    def __str__(self):
        return self.name
