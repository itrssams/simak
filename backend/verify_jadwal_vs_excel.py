"""
Verifikasi komprehensif Fase 0, Fase 0b, dan Fase 4:
1. Cek kesesuaian tabel jam Shift SIMAK vs 4 sheet kartu absensi Excel per kelompok.
2. Cek konsistensi kelompok shift pada seluruh baris JadwalMaster, JadwalKoreksi, dan JadwalDinas Oktober 2026.
3. Bandingkan JadwalDinas (final) SIMAK Oktober 2026 vs sheet 'JADWAL DINAS (3)' Excel per sel (PIN, tanggal).
4. Cek contoh spesifik: Tia Nur Azizah (7 Okt = S) dan Chopipah (7 Okt = P).
"""
import os
import datetime
import openpyxl

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from sdm.models import Pegawai, Shift, JadwalMaster, JadwalKoreksi, JadwalDinas
from sdm.services.jadwal_service import kelompok_shift_untuk, build_pegawai_lookup, find_pegawai


def verify_all():
    excel_path = '/app/excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'

    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)

    # 1. Verifikasi Kelompok Shift pada JadwalMaster, JadwalKoreksi, JadwalDinas
    print("=== 1. VERIFIKASI KELOMPOK SHIFT (FASE 0b) ===")
    for model_name, qs in [
        ('JadwalMaster', JadwalMaster.objects.filter(tanggal__year=2026, tanggal__month=10).select_related('pegawai', 'shift')),
        ('JadwalKoreksi', JadwalKoreksi.objects.filter(tanggal__year=2026, tanggal__month=10).select_related('pegawai', 'shift')),
        ('JadwalDinas', JadwalDinas.objects.filter(tanggal__year=2026, tanggal__month=10).select_related('pegawai', 'shift')),
    ]:
        violations = 0
        total = 0
        for row in qs:
            total += 1
            exp = kelompok_shift_untuk(row.pegawai)
            if row.shift.kelompok != exp:
                violations += 1
        print(f"  {model_name}: total={total}, pelanggaran kelompok={violations}")

    # 2. Verifikasi Jam Shift SIMAK vs Tabel Referensi Excel per Sheet
    print("\n=== 2. VERIFIKASI JAM SHIFT SIMAK VS EXCEL (FASE 0) ===")
    sheet_group_map = [
        ('ABSENSI', 'UMUM', 9, 20),
        ('sECURITY DAN dRIVER', 'SECURITY_DRIVER', 9, 20),
        ('KHUSUS CS', 'CS', 9, 18),
        ('Mitra Kerohanian', 'MITRA', 9, 18),
    ]
    shift_mismatches = 0
    for sname, kelompok, r_start, r_end in sheet_group_map:
        ws = wb[sname]
        for r in range(r_start, r_end + 1):
            kode_raw = ws.cell(r, 2).value
            t_in = ws.cell(r, 3).value
            t_out = ws.cell(r, 5).value
            if not kode_raw:
                continue
            kode = str(kode_raw).strip().upper()
            s_obj = Shift.objects.filter(kelompok=kelompok, kode=kode).first()
            if not s_obj:
                print(f"  [MISSING] {kelompok} kode {kode} (di sheet {sname})")
                shift_mismatches += 1
                continue
            if not s_obj.is_libur and isinstance(t_in, datetime.time) and isinstance(t_out, datetime.time):
                exp_in = (t_in.hour, t_in.minute)
                exp_out = (t_out.hour, t_out.minute)
                act_in = (s_obj.jam_masuk.hour, s_obj.jam_masuk.minute) if s_obj.jam_masuk else None
                act_out = (s_obj.jam_pulang.hour, s_obj.jam_pulang.minute) if s_obj.jam_pulang else None
                if exp_in != act_in or exp_out != act_out:
                    print(f"  [DIFF] {kelompok} {kode}: Excel={exp_in}-{exp_out} vs SIMAK={act_in}-{act_out}")
                    shift_mismatches += 1
    print(f"  Total selisih tabel jam shift: {shift_mismatches}")

    # 3. Verifikasi JadwalDinas vs Sheet 'JADWAL DINAS (3)'
    print("\n=== 3. VERIFIKASI JADWAL DINAS FINAL VS EXCEL 'JADWAL DINAS (3)' (FASE 4) ===")
    ws_final = wb['JADWAL DINAS (3)']
    pegawai_lookup = build_pegawai_lookup()

    jadwal_map = {}
    for jd in JadwalDinas.objects.filter(tanggal__year=2026, tanggal__month=10).select_related('shift', 'pegawai'):
        jadwal_map[(jd.pegawai_id, jd.tanggal.day)] = jd.shift.kode.strip().upper()

    mismatches = []
    excel_employees = set()
    checked_cells = 0

    for r_idx, row in enumerate(ws_final.iter_rows(min_row=9, max_row=146, values_only=True), start=9):
        if not row or (not row[2] and not row[3]):
            continue
        pin_val = row[2]
        nama_val = row[3]
        if pin_val is None and nama_val is None:
            continue
        pin_str = str(pin_val).strip() if pin_val is not None else ''
        nama_str = str(nama_val).strip() if nama_val else ''
        if not nama_str or nama_str.upper() in ('NAMA', 'TOTAL'):
            continue

        pegawai = find_pegawai(pin_str, nama_str, lookup=pegawai_lookup)
        if not pegawai:
            print(f"  [WARN] Pegawai di JADWAL DINAS (3) baris {r_idx} tidak ditemukan di SIMAK: PIN={pin_str}, Nama={nama_str}")
            continue

        excel_employees.add(pegawai.id)

        for day_num in range(1, 32):
            col_idx = 5 + day_num  # col 6 (G) = day 1
            val = row[col_idx] if col_idx < len(row) else None
            excel_code = '' if val is None or str(val).strip() in ('', '0') else str(val).strip().upper()
            # Typos in MASTER ('LS' and ',') propagate to JADWAL DINAS (3) if not overridden by TUKAR SHIF
            if excel_code in ('LS', ','):
                excel_code = ''
            # Alias PB <-> PR for UMUM / SECURITY_DRIVER
            simak_code = jadwal_map.get((pegawai.id, day_num), '')
            checked_cells += 1

            if excel_code != simak_code:
                # Check PB/PR alias equivalence
                if {excel_code, simak_code} == {'PB', 'PR'}:
                    continue
                mismatches.append((r_idx, pegawai.nama, pegawai.pin, day_num, excel_code, simak_code))

    print(f"  Pegawai di JADWAL DINAS (3) terverifikasi : {len(excel_employees)}")
    print(f"  Total sel diperiksa (142 x 31)            : {checked_cells}")
    print(f"  Total selisih kode shift                  : {len(mismatches)}")
    for m in mismatches[:20]:
        print(f"    - Baris {m[0]} {m[1]} (PIN {m[2]}) tgl {m[3]} Okt: Excel='{m[4]}' vs SIMAK='{m[5]}'")

    # Cek pegawai yang ada di MASTER (JadwalMaster) tapi tidak ada di JADWAL DINAS (3)
    master_emp_ids = set(JadwalMaster.objects.filter(tanggal__year=2026, tanggal__month=10).values_list('pegawai_id', flat=True).distinct())
    only_in_master = master_emp_ids - excel_employees
    if only_in_master:
        for pid in only_in_master:
            p = Pegawai.objects.get(id=pid)
            print(f"  [INFO] Pegawai ada di MASTER tapi tidak ada di JADWAL DINAS (3): {p.nama} (PIN {p.pin}, Unit: {p.unit_kerja})")

    # 4. Cek 2 contoh spesifik: Tia Nur Azizah & Chopipah pada 7 Okt 2026
    print("\n=== 4. CEK SAMPEL SPESIFIK (7 OKTOBER 2026) ===")
    for sample_name, exp_code in [('Tia Nur Azizah', 'S'), ('Chopipah', 'P')]:
        p = Pegawai.objects.filter(nama__icontains=sample_name).first()
        jd = JadwalDinas.objects.filter(pegawai=p, tanggal=datetime.date(2026, 10, 7)).select_related('shift', 'shift_master').first() if p else None
        act_code = jd.shift.kode if jd else None
        master_code = jd.shift_master.kode if (jd and jd.shift_master) else None
        sumber = jd.sumber if jd else None
        status_ok = "COCOK" if act_code == exp_code else "TIDAK COCOK"
        print(f"  - {sample_name} (7 Okt 2026): Master={master_code} -> Final={act_code} (Sumber={sumber}) | Target Excel={exp_code} [{status_ok}]")


if __name__ == '__main__':
    verify_all()
