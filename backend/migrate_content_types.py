import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection

models_to_migrate = {
    # IT
    'itbackuprecord': 'it',
    'itrepairrequest': 'it',
    'itcredentialnote': 'it',
    'itremoteaccess': 'it',
    'itsubscription': 'it',
    # Inventaris
    'inventoryoption': 'inventaris',
    'inventoryasset': 'inventaris',
    # Logistik
    'logistikbarang': 'logistik',
    'logistikbatch': 'logistik',
    'logistikpembelian': 'logistik',
    'logistikmutasi': 'logistik',
    'logistikpermintaan': 'logistik',
    'logistikopname': 'logistik',
    # Driver
    'kendaraan': 'driver',
    'logperjalanan': 'driver',
    'laporanperjalanan': 'driver',
    'fotolaporanperjalanan': 'driver',
    'logbbm': 'driver',
    'logmaintenance': 'driver',
    # System
    'auditlog': 'system',
    'idempotencylog': 'system',
    'announcement': 'system',
    'announcementread': 'system',
}

with connection.cursor() as cursor:
    for model_name, new_app in models_to_migrate.items():
        # Get old ID
        cursor.execute("SELECT id FROM django_content_type WHERE app_label = 'keuangan' AND model = %s", [model_name])
        old_row = cursor.fetchone()
        if not old_row:
            continue
        old_id = old_row[0]

        # Get new ID
        cursor.execute("SELECT id FROM django_content_type WHERE app_label = %s AND model = %s", [new_app, model_name])
        new_row = cursor.fetchone()
        if not new_row:
            continue
        new_id = new_row[0]

        # Map old permissions to new permissions
        cursor.execute("SELECT id, codename FROM auth_permission WHERE content_type_id = %s", [old_id])
        old_perms = cursor.fetchall()

        for old_perm_id, codename in old_perms:
            cursor.execute("SELECT id FROM auth_permission WHERE content_type_id = %s AND codename = %s", [new_id, codename])
            new_perm_row = cursor.fetchone()
            if new_perm_row:
                new_perm_id = new_perm_row[0]
                # Update User and Group permissions
                cursor.execute("UPDATE IGNORE users_user_user_permissions SET permission_id = %s WHERE permission_id = %s", [new_perm_id, old_perm_id])
                cursor.execute("UPDATE IGNORE auth_group_permissions SET permission_id = %s WHERE permission_id = %s", [new_perm_id, old_perm_id])
                # Delete any remaining that couldn't be updated due to IGNORE (already exists)
                cursor.execute("DELETE FROM users_user_user_permissions WHERE permission_id = %s", [old_perm_id])
                cursor.execute("DELETE FROM auth_group_permissions WHERE permission_id = %s", [old_perm_id])
        
        # Update Admin log
        cursor.execute("UPDATE django_admin_log SET content_type_id = %s WHERE content_type_id = %s", [new_id, old_id])
        
        # Delete old permissions
        cursor.execute("DELETE FROM auth_permission WHERE content_type_id = %s", [old_id])
        
        # Delete old ContentType
        cursor.execute("DELETE FROM django_content_type WHERE id = %s", [old_id])

        print(f"Migrated ContentType for {model_name} from keuangan to {new_app}")

print('Selesai update ContentTypes.')
