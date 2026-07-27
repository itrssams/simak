from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('keuangan', '0042_logistikbatch_qty_pesan_alter_logistikbatch_qty'),
    ]

    operations = [
        migrations.AddField(
            model_name='faktur',
            name='alasan_batal',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='faktur',
            name='dibatalkan_oleh',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='faktur_dibatalkan',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='faktur',
            name='dibatalkan_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
