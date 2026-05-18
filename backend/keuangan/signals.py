from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from django.core.files.storage import default_storage
import os
from .models import (
    FotoLaporanPerjalanan, LaporanPerjalanan, LogBBM, LogMaintenance,
    PettyCash, LaporanPenggunaan, Reimbursement,
    FotoPettyCash, FotoLaporanPenggunaan, FotoReimbursement,
    ITRepairRequest,
)


def delete_storage_file(file_field):
    if not file_field:
        return
    try:
        file_name = file_field.name
    except ValueError:
        return
    if file_name and default_storage.exists(file_name):
        try:
            default_storage.delete(file_name)
            delete_empty_parent_dirs(file_name)
        except Exception as e:
            print(f"Error deleting file {file_name}: {str(e)}")


def delete_empty_parent_dirs(file_name, max_depth=3):
    folder = os.path.dirname(file_name)
    for _ in range(max_depth):
        if not folder:
            break
        try:
            folders, files = default_storage.listdir(folder)
            if folders or files:
                break
            if hasattr(default_storage, 'path'):
                os.rmdir(default_storage.path(folder))
            else:
                default_storage.delete(folder)
        except Exception:
            break
        folder = os.path.dirname(folder)


def delete_replaced_file(instance, model_class, field_name):
    if not instance.pk:
        return
    try:
        old_file = getattr(model_class.objects.get(pk=instance.pk), field_name)
    except model_class.DoesNotExist:
        return
    new_file = getattr(instance, field_name)
    old_name = getattr(old_file, 'name', '')
    new_name = getattr(new_file, 'name', '')
    if old_name and old_name != new_name:
        delete_storage_file(old_file)


@receiver(pre_delete, sender=PettyCash)
def delete_petty_cash_file(sender, instance, **kwargs):
    delete_storage_file(instance.berkas)


@receiver(pre_delete, sender=LaporanPenggunaan)
def delete_laporan_penggunaan_file(sender, instance, **kwargs):
    delete_storage_file(instance.nota)


@receiver(pre_delete, sender=Reimbursement)
def delete_reimbursement_file(sender, instance, **kwargs):
    delete_storage_file(instance.berkas)


@receiver(pre_delete, sender=ITRepairRequest)
def delete_it_repair_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)


@receiver(pre_delete, sender=FotoPettyCash)
def delete_foto_petty_cash_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)


@receiver(pre_delete, sender=FotoLaporanPenggunaan)
def delete_foto_laporan_penggunaan_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)


@receiver(pre_delete, sender=FotoReimbursement)
def delete_foto_reimbursement_file(sender, instance, **kwargs):
    delete_storage_file(instance.foto)


@receiver(pre_save, sender=PettyCash)
def delete_replaced_petty_cash_file(sender, instance, **kwargs):
    delete_replaced_file(instance, PettyCash, 'berkas')


@receiver(pre_save, sender=LaporanPenggunaan)
def delete_replaced_laporan_penggunaan_file(sender, instance, **kwargs):
    delete_replaced_file(instance, LaporanPenggunaan, 'nota')


@receiver(pre_save, sender=Reimbursement)
def delete_replaced_reimbursement_file(sender, instance, **kwargs):
    delete_replaced_file(instance, Reimbursement, 'berkas')


@receiver(pre_save, sender=ITRepairRequest)
def delete_replaced_it_repair_file(sender, instance, **kwargs):
    delete_replaced_file(instance, ITRepairRequest, 'foto')


@receiver(pre_save, sender=FotoPettyCash)
def delete_replaced_foto_petty_cash_file(sender, instance, **kwargs):
    delete_replaced_file(instance, FotoPettyCash, 'foto')


@receiver(pre_save, sender=FotoLaporanPenggunaan)
def delete_replaced_foto_laporan_penggunaan_file(sender, instance, **kwargs):
    delete_replaced_file(instance, FotoLaporanPenggunaan, 'foto')


@receiver(pre_save, sender=FotoReimbursement)
def delete_replaced_foto_reimbursement_file(sender, instance, **kwargs):
    delete_replaced_file(instance, FotoReimbursement, 'foto')


@receiver(pre_delete, sender=FotoLaporanPerjalanan)
def delete_foto_file(sender, instance, **kwargs):
    """
    Hapus file fisik ketika FotoLaporanPerjalanan dihapus
    """
    delete_storage_file(instance.foto)


@receiver(pre_delete, sender=LaporanPerjalanan)
def delete_laporan_folder(sender, instance, **kwargs):
    """
    Hapus folder perjalanan ketika LaporanPerjalanan dihapus
    """
    try:
        # Get folder path dari foto
        if instance.foto.exists():
            # Ambil path folder dari salah satu foto
            first_foto = instance.foto.first()
            if first_foto and first_foto.foto:
                folder_path = os.path.dirname(first_foto.foto.name)
                
                # Delete all files in folder
                try:
                    folders, files = default_storage.listdir(folder_path)
                    for file in files:
                        file_path = os.path.join(folder_path, file)
                        if default_storage.exists(file_path):
                            default_storage.delete(file_path)
                    
                    # Try to delete empty folder (if filesystem supports it)
                    try:
                        default_storage.delete(folder_path)
                    except:
                        pass  # Folder might not be empty or not supported
                except:
                    pass
    except Exception as e:
        print(f"Error deleting laporan folder: {str(e)}")


@receiver(pre_delete, sender=LogBBM)
def delete_log_bbm_foto(sender, instance, **kwargs):
    """
    Hapus file foto ketika LogBBM dihapus
    """
    delete_storage_file(instance.foto)


@receiver(pre_delete, sender=LogMaintenance)
def delete_log_maintenance_foto(sender, instance, **kwargs):
    """
    Hapus file foto ketika LogMaintenance dihapus
    """
    delete_storage_file(instance.foto)
