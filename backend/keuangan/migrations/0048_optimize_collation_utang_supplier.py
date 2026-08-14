from django.db import migrations

def set_collation_forward(apps, schema_editor):
    if schema_editor.connection.vendor == 'mysql':
        with schema_editor.connection.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE utang_supplier MODIFY app_siaga_faktur_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL")
                cursor.execute("ALTER TABLE utang_supplier MODIFY nomor_spb VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL")
                cursor.execute("ALTER TABLE utang_supplier MODIFY nomor_faktur VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL")
            except Exception:
                pass

def set_collation_backward(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('keuangan', '0047_utangsupplier_utang_nspb_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(set_collation_forward, set_collation_backward),
    ]
