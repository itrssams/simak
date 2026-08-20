from django.contrib import admin
from .models import InventoryOption, InventoryAsset

@admin.register(InventoryOption)
class InventoryOptionAdmin(admin.ModelAdmin):
    list_display = ['option_type', 'name', 'is_active', 'sort_order']
    list_filter = ['option_type', 'is_active']
    search_fields = ['name']

@admin.register(InventoryAsset)
class InventoryAssetAdmin(admin.ModelAdmin):
    list_display = ['description', 'unit', 'category', 'condition_status', 'ownership_status', 'purchase_year', 'purchase_price']
    list_filter = ['unit', 'category', 'condition_status', 'ownership_status', 'purchase_year']
    search_fields = ['description', 'brand', 'location', 'recommended_action']
