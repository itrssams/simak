from django.contrib.auth.models import AbstractUser
from django.db import models


class Unit(models.Model):
    KATEGORI_CHOICES = [
        ('direksi',    'Direksi / Direktur Utama'),
        ('direktorat', 'Direktorat / Wadir'),
        ('bidang',     'Bidang / Bagian (Manajer)'),
        ('seksi',      'Seksi / Sub-Bagian (Kasi)'),
        ('unit',       'Unit / Instalasi Pelaksana'),
    ]

    nama         = models.CharField(max_length=100, unique=True)
    kategori     = models.CharField(max_length=30, choices=KATEGORI_CHOICES, default='unit')
    parent       = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    kepala_unit  = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='unit_yang_dipimpin')
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nama']
        verbose_name = 'Unit'
        verbose_name_plural = 'Daftar Unit'

    def __str__(self):
        return self.nama

    def get_ancestors(self):
        """Mengambil rantai unit induk ke atas hingga pucuk pimpinan"""
        ancestors = []
        curr = self.parent
        visited = {self.id}
        while curr and curr.id not in visited:
            ancestors.append(curr)
            visited.add(curr.id)
            curr = curr.parent
        return ancestors


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
    akses_catatan_utang = models.BooleanField(default=False)
    akses_kas_besar = models.BooleanField(default=False)
    akses_reimbursement = models.BooleanField(default=False)
    view_petty_cash = models.BooleanField(default=False)
    view_kas_besar = models.BooleanField(default=False)
    view_logistik = models.BooleanField(default=False)
    is_logistik = models.BooleanField(default=False)
    is_akuntansi = models.BooleanField(default=False)
    is_sdm = models.BooleanField(default=False)
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    foto = models.ImageField(upload_to='profile_photos/', null=True, blank=True)

    def __str__(self):
        return f"{self.username} ({self.role})"

    def get_approvers_chain(self):
        """
        Mengambil daftar user atasan (Kasi, Manajer, Wadir, Direktur)
        yang berhak memberikan single approval untuk user ini berdasarkan hierarki unit.
        """
        approvers = []
        if not self.unit:
            return list(User.objects.filter(is_active=True, role__in=['direktur', 'wakil_direktur']).exclude(id=self.id))

        # 1. Kepala unit saat ini (jika ada dan bukan diri sendiri)
        if self.unit.kepala_unit and self.unit.kepala_unit.is_active and self.unit.kepala_unit.id != self.id:
            approvers.append(self.unit.kepala_unit)

        # 2. Telusuri unit induk (parent) ke atas
        for parent_unit in self.unit.get_ancestors():
            if parent_unit.kepala_unit and parent_unit.kepala_unit.is_active and parent_unit.kepala_unit.id != self.id:
                if parent_unit.kepala_unit not in approvers:
                    approvers.append(parent_unit.kepala_unit)

        # 3. Sertakan Direksi sebagai eskalasi tertinggi
        direksi = User.objects.filter(is_active=True, role__in=['direktur', 'wakil_direktur']).exclude(id=self.id)
        for d in direksi:
            if d not in approvers:
                approvers.append(d)

        return approvers
