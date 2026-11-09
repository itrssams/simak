import sys
import os

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from sdm.models import LogPresensi, PresensiHarian, Pegawai, JadwalDinas, Shift
from django.utils import timezone

today = timezone.localdate()
print(f"Current server date: {today}")

# Latest logs today
logs_today = LogPresensi.objects.filter(waktu__date=today).order_by('-waktu')[:10]
print("\n--- Latest 10 Logs Today ---")
for l in logs_today:
    waktu_local = timezone.localtime(l.waktu)
    nama = l.pegawai.nama if l.pegawai else f"PIN {l.pin}"
    mesin_nama = l.mesin.nama if l.mesin else "-"
    print(f"{waktu_local.strftime('%H:%M:%S WITA')} | PIN: {l.pin} | Nama: {nama} | Mesin: {mesin_nama}")

print("\n--- Detailed Pegawai Check ---")
for pin in ["1000", "2025"]:
    peg = Pegawai.objects.filter(pin=pin).first()
    if not peg:
        print(f"Pegawai with PIN {pin} not found")
        continue
    print(f"\n==========================================")
    print(f"Pegawai: {peg.nama} (PIN: {peg.pin})")
    
    # Check JadwalDinas
    jadwals = JadwalDinas.objects.filter(pegawai=peg, tanggal=today)
    if jadwals.exists():
        for j in jadwals:
            s = j.shift
            print(f"  Jadwal: Shift={s.nama if s else 'None'}, Masuk={s.jam_masuk if s else '-'}, Pulang={s.jam_pulang if s else '-'}, Toleransi={s.toleransi_terlambat_menit if s else 0}m")
    else:
        print("  Jadwal: Tidak ada jadwal dinas spesifik hari ini")
        
    # Check PresensiHarian
    pres = PresensiHarian.objects.filter(pegawai=peg, tanggal=today).first()
    if pres:
        print(f"  PresensiHarian:")
        print(f"    Jam Masuk={pres.jam_masuk}")
        print(f"    Jam Pulang={pres.jam_pulang}")
        print(f"    Status={pres.status}")
        print(f"    Menit Terlambat={pres.menit_keterlambatan}")
        print(f"    Menit Pulang Cepat={pres.menit_pulang_cepat}")
        print(f"    Shift: {pres.shift.nama if pres.shift else '-'}")
        print(f"    Catatan={pres.catatan}")
    else:
        print("  PresensiHarian: Belum dibuat")

    # Check all logs today for this pin
    user_logs = LogPresensi.objects.filter(pin=pin, waktu__date=today).order_by('waktu')
    print(f"  Total Tap Logs Today: {user_logs.count()}")
    for ul in user_logs:
        wl = timezone.localtime(ul.waktu)
        print(f"    Tap: {wl.strftime('%H:%M:%S WITA')} ({ul.mesin.nama if ul.mesin else '-'}) - Verif: {ul.status_verifikasi}")
