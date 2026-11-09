import os
import sys
from django.apps import AppConfig


class SdmConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sdm'
    verbose_name = 'Sumber Daya Manusia'

    def ready(self):
        # Hindari eksekusi ganda saat running command migrasi, shell, dll
        if any(cmd in sys.argv for cmd in ['makemigrations', 'migrate', 'collectstatic', 'test', 'help']):
            return

        # Start Telegram Bot Long-Polling Listener (Bot Utama @simak_rssiaga_bot)
        try:
            from .services.telegram_service import start_telegram_bot_listener, start_telegram_sdm_bot_listener
            start_telegram_bot_listener()
            start_telegram_sdm_bot_listener()
        except Exception:
            pass

        # Start Mesin Absensi Periodic Auto-Sync Real-Time (tiap 5 detik)
        try:
            from .services.zk_service import start_mesin_auto_sync_scheduler
            start_mesin_auto_sync_scheduler(interval_seconds=5)
        except Exception:
            pass
