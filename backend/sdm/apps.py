import os
import sys
from django.apps import AppConfig


class SdmConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sdm'
    verbose_name = 'Sumber Daya Manusia'

    def ready(self):
        # Hindari eksekusi saat running command CLI (migrasi, shell, testing, dll)
        if os.getenv('SDM_DISABLE_WORKERS', '').lower() in ('1', 'true', 'yes'):
            return
        if any(cmd in sys.argv for cmd in [
            'makemigrations', 'migrate', 'collectstatic', 'test', 'help',
            'shell', 'check', 'createsuperuser', 'dbshell',
        ]):
            return

        # Selalu hidupkan daemon thread yang menjaga status runtime (aktif/jeda dikendalikan DB/ENV secara dinamis)
        try:
            from .services.telegram_service import start_telegram_bot_listener, start_telegram_sdm_bot_listener
            start_telegram_bot_listener()
            start_telegram_sdm_bot_listener()
        except Exception:
            pass

        try:
            from .services.zk_service import start_mesin_auto_sync_scheduler
            start_mesin_auto_sync_scheduler(interval_seconds=5)
        except Exception:
            pass
