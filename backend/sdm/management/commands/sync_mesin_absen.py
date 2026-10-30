from django.core.management.base import BaseCommand
from sdm.services.zk_service import sync_mesin_absen

class Command(BaseCommand):
    help = 'Tarik data user dan log riwayat tap dari Mesin Absen (ZKTeco / Secure S-IPC) ke database SIMAK'

    def handle(self, *args, **options):
        self.stdout.write("Menghubungkan ke Mesin Absensi...")
        res = sync_mesin_absen()
        if res.get('success'):
            self.stdout.write(self.style.SUCCESS(
                f"[OK] {res.get('message')}\n"
                f"  - Mesin: {res['mesin']['nama']} ({res['mesin']['ip_address']})\n"
                f"  - Total User Mesin: {res['total_users_machine']}\n"
                f"  - Auto Matched SIMAK Users: {res['auto_matched_users']}\n"
                f"  - Total Log Mesin: {res['total_logs_machine']}\n"
                f"  - Log Baru Disimpan: {res['new_logs_saved']}\n"
                f"  - Hari Presensi Diupdate: {res['updated_daily_presensi']}"
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f"[FAIL] {res.get('message')}"
            ))

