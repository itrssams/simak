from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('keuangan', '0031_pembayaranfaktur_verifikasi'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pembayaranfaktur',
            name='status_verifikasi',
            field=models.CharField(
                choices=[
                    ('menunggu', 'Menunggu Verifikasi'),
                    ('terverifikasi', 'Terverifikasi'),
                    ('ditolak', 'Ditolak'),
                    ('dibatalkan', 'Dibatalkan'),
                ],
                default='menunggu',
                max_length=20,
            ),
        ),
    ]
