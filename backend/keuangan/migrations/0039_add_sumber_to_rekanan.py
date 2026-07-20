# Generated manually to ensure sumber and kategori columns exist in rssams.rekanan

from django.db import migrations, connection


def add_rekanan_columns(apps, schema_editor):
    with connection.cursor() as cursor:
        table_name = None
        cols = []
        try:
            cursor.execute("SHOW COLUMNS FROM rssams.rekanan")
            cols = [row[0].lower() for row in cursor.fetchall()]
            table_name = "rssams.rekanan"
        except Exception:
            try:
                cursor.execute("SHOW COLUMNS FROM rekanan")
                cols = [row[0].lower() for row in cursor.fetchall()]
                table_name = "rekanan"
            except Exception:
                pass

        if table_name and cols:
            if 'sumber' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN sumber VARCHAR(50) DEFAULT 'farmasi'")
                except Exception:
                    pass
            if 'kategori' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN kategori VARCHAR(100) DEFAULT ''")
                except Exception:
                    pass


def reverse_func(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('keuangan', '0038_utangsupplier_sumber_manual'),
    ]

    operations = [
        migrations.RunPython(add_rekanan_columns, reverse_func),
    ]
