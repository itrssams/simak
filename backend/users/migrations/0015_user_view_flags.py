# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0014_user_akses_reimbursement'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='view_petty_cash',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='view_kas_besar',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='view_logistik',
            field=models.BooleanField(default=False),
        ),
    ]
