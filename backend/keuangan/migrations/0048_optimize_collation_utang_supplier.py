from django.db import migrations

def set_collation_forward(apps, schema_editor):
    if schema_editor.connection.vendor == 'mysql':
        with schema_editor.connection.cursor() as cursor:
            try:
                cursor.execute("ALTER TABLE utang_supplier CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci")
                cursor.execute("ALTER TABLE pembayaran_utang CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci")
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
