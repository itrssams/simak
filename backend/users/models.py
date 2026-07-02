from django.contrib.auth.models import AbstractUser
from django.db import models


class Unit(models.Model):
    nama      = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Unit'
        verbose_name_plural = 'Daftar Unit'

    def __str__(self):
        return self.nama


class User(AbstractUser):
    ROLE_CHOICES = [
        ('karyawan',        'Karyawan'),
        ('kepala_seksi',    'Kepala Seksi'),
        ('manajer',         'Manajer'),
        ('wakil_direktur',  'Wakil Direktur'),
        ('direktur',        'Direktur'),
    ]

    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='karyawan')
    is_driver = models.BooleanField(default=False)
    is_it = models.BooleanField(default=False)
    is_keuangan = models.BooleanField(default=False)
    is_petty_cash_cashier = models.BooleanField(default=False)
    akses_catatan_utang_obat_bhp = models.BooleanField(default=False)
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')

    def __str__(self):
        return f"{self.username} ({self.role})"
