from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from .models import ITRepairRequest
from keuangan.signals import delete_storage_file, delete_replaced_file

@receiver(pre_delete, sender=ITRepairRequest)
def delete_it_repair_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)

@receiver(pre_save, sender=ITRepairRequest)
def delete_replaced_it_repair_file(sender, instance, **kwargs):
    delete_replaced_file(instance, ITRepairRequest, 'foto')
