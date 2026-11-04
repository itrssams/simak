import os
import sys
import django
import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from sdm.attendance_engine import (
    import_machine_logs_from_excel,
    process_attendance_for_date_range,
    verify_engine_against_excel_october
)
from sdm.models import LogPresensi, PresensiHarian

print("=== 1. IMPORT MACHINE LOGS FROM EXCEL ===", flush=True)
import_res = import_machine_logs_from_excel('excel_oktober.xlsm', dry_run=False)
print(f"Total Extracted: {import_res.get('total_extracted')}", flush=True)
print(f"Created Logs: {import_res.get('created_count')}", flush=True)
print(f"Total LogPresensi in DB: {LogPresensi.objects.count()}", flush=True)

print("\n=== 2. PROCESS ATTENDANCE FOR OCTOBER 2026 ===", flush=True)
start_d = datetime.date(2026, 10, 1)
end_d = datetime.date(2026, 10, 31)
process_res = process_attendance_for_date_range(start_d, end_d)
print(f"Total PresensiHarian Processed: {process_res.get('total_processed')}", flush=True)
print(f"Created: {process_res.get('created')}", flush=True)
print(f"Updated: {process_res.get('updated')}", flush=True)
print(f"Status Breakdown: {process_res.get('status_breakdown')}", flush=True)

print("\n=== 3. VERIFY ENGINE AGAINST EXCEL ABSENSI ===", flush=True)
verify_res = verify_engine_against_excel_october()
print(f"Pegawai: {verify_res.get('pegawai')} (PIN {verify_res.get('pin')})", flush=True)
print(f"Total Hari Diverifikasi: {verify_res.get('total_hari')}", flush=True)
print("Sample 7 Hari Pertama Hasil Engine vs Excel Absensi:", flush=True)
for d in verify_res.get('detail', [])[:7]:
    print(f"  Tgl {d['tanggal']}: Shift={d['shift_engine']} | Masuk={d['jam_masuk_engine']} Pulang={d['jam_pulang_engine']} | Status={d['status_engine']} (Excel: {d['status_in_excel']}) | {d['catatan']}", flush=True)

print("\n=== ALL STEPS COMPLETED SUCCESSFULLY ===", flush=True)
