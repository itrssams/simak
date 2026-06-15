# Generated manually for Alokasi Pembiayaan transaction entries

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('keuangan', '0028_alter_pembayaranfaktur_options_faktur_adm_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='alokasidana',
            unique_together=set(),
        ),
    ]
