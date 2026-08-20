from django.db import connection, models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

def foto_inventory_asset_path(instance, filename):
    period = instance.created_at.strftime('%Y%m') if instance.created_at else timezone.now().strftime('%Y%m')
    return f'inventaris/aset/{period}/{filename}'

class InventoryOption(models.Model):
    OPTION_TYPE_CHOICES = [
        ('unit', 'Unit'),
        ('category', 'Kategori Aset'),
        ('condition', 'Status Kelayakan'),
        ('ownership', 'Status Kepemilikan'),
    ]

    option_type = models.CharField(max_length=20, choices=OPTION_TYPE_CHOICES)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventaris_option'
        ordering = ['option_type', 'sort_order', 'name']
        unique_together = ('option_type', 'name')
        indexes = [
            models.Index(fields=['option_type', 'is_active'], name='inv_option_type_active_idx'),
            models.Index(fields=['name'], name='inv_option_name_idx'),
        ]

    def __str__(self):
        return f'{self.get_option_type_display()} - {self.name}'

class InventoryAsset(models.Model):
    description = models.TextField(verbose_name='Deskripsi Aset')
    unit = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_unit_assets', limit_choices_to={'option_type': 'unit'})
    brand = models.CharField(max_length=140, blank=True, verbose_name='Merek')
    location = models.CharField(max_length=180, blank=True, verbose_name='Lokasi')
    category = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_category_assets', limit_choices_to={'option_type': 'category'})
    condition_status = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_condition_assets', limit_choices_to={'option_type': 'condition'})
    foto = models.ImageField(upload_to=foto_inventory_asset_path, null=True, blank=True)
    manufacture_year = models.PositiveIntegerField(null=True, blank=True, verbose_name='Tahun Pembuatan')
    purchase_year = models.PositiveIntegerField(null=True, blank=True, verbose_name='Tahun Beli')
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name='Harga Beli')
    recommended_action = models.TextField(blank=True, verbose_name='Rekomendasi Tindakan')
    ownership_status = models.ForeignKey(InventoryOption, on_delete=models.PROTECT, related_name='inventory_ownership_assets', limit_choices_to={'option_type': 'ownership'})
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='inventory_assets')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventaris_asset'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['unit', 'category'], name='inv_asset_unit_cat_idx'),
            models.Index(fields=['condition_status'], name='inv_asset_condition_idx'),
            models.Index(fields=['ownership_status'], name='inv_asset_owner_idx'),
            models.Index(fields=['purchase_year'], name='inv_asset_purchase_year_idx'),
        ]

    def __str__(self):
        return f'{self.description[:80]} - {self.unit.name}'
