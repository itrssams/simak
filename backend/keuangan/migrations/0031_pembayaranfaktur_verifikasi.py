from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def mark_existing_payments_verified(apps, schema_editor):
    PembayaranFaktur = apps.get_model('keuangan', 'PembayaranFaktur')
    for pembayaran in PembayaranFaktur.objects.all().iterator():
        pembayaran.status_verifikasi = 'terverifikasi'
        pembayaran.verified_by_id = pembayaran.created_by_id
        pembayaran.verified_at = pembayaran.created_at
        pembayaran.save(update_fields=['status_verifikasi', 'verified_by', 'verified_at'])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('keuangan', '0030_alokasi_dana_pemakaian'),
    ]

    operations = [
        migrations.AddField(
            model_name='pembayaranfaktur',
            name='status_verifikasi',
            field=models.CharField(
                choices=[
                    ('menunggu', 'Menunggu Verifikasi'),
                    ('terverifikasi', 'Terverifikasi'),
                    ('ditolak', 'Ditolak'),
                ],
                default='terverifikasi',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='pembayaranfaktur',
            name='verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pembayaranfaktur',
            name='verified_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='pembayaran_faktur_verified',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(mark_existing_payments_verified, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='pembayaranfaktur',
            name='status_verifikasi',
            field=models.CharField(
                choices=[
                    ('menunggu', 'Menunggu Verifikasi'),
                    ('terverifikasi', 'Terverifikasi'),
                    ('ditolak', 'Ditolak'),
                ],
                default='menunggu',
                max_length=20,
            ),
        ),
    ]
