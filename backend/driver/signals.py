from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from django.core.files.storage import default_storage
import os
from .models import FotoLaporanPerjalanan, LaporanPerjalanan, LogBBM, LogMaintenance
from keuangan.signals import delete_storage_file

@receiver(pre_delete, sender=FotoLaporanPerjalanan)
def delete_foto_file(sender, instance, **kwargs):
    """
    Hapus file fisik ketika FotoLaporanPerjalanan dihapus
    """
    delete_storage_file(instance.foto)


