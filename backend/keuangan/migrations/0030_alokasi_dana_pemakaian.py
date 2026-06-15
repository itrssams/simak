# Generated manually for aggregate pembiayaan wallet usage

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('keuangan', '0029_remove_alokasi_dana_unique_together'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlokasiDanaPemakaian',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('jumlah', models.DecimalField(decimal_places=2, max_digits=15)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('alokasi_dana', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pemakaian_alokasi', to='keuangan.alokasidana')),
                ('pembayaran', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pemakaian_alokasi', to='keuangan.pembayaranfaktur')),
            ],
            options={
                'verbose_name': 'Pemakaian Alokasi Dana',
                'verbose_name_plural': 'Pemakaian Alokasi Dana',
                'ordering': ['created_at', 'id'],
            },
        ),
    ]
