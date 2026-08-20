from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from .models import InventoryAsset
from keuangan.signals import delete_storage_file, delete_replaced_file

@receiver(pre_delete, sender=InventoryAsset)
def delete_inventory_asset_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)

@receiver(pre_save, sender=InventoryAsset)
def delete_replaced_inventory_asset_file(sender, instance, **kwargs):
    delete_replaced_file(instance, InventoryAsset, 'foto')
