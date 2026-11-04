"""
Seed script to import historical shift swaps from sheet 'TUKAR SHIF' in excel_oktober.xlsm into TukarDinas.
Usage:
    python seed_tukar_dinas.py [--commit]
"""
import os
import sys
import argparse
import datetime
import openpyxl

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import transaction
from django.contrib.auth import get_user_model
from sdm.models import Pegawai, Shift, JadwalDinas, TukarDinas

User = get_user_model()


def run(commit=False):
    excel_path = '/app/excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found at {excel_path}")
        return

    print(f"Opening workbook: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    if 'TUKAR SHIF' not in wb.sheetnames:
        print("Error: Sheet 'TUKAR SHIF' not found!")
        return

    sheet = wb['TUKAR SHIF']

    rows = []
    for r in sheet.iter_rows(min_row=6, max_row=200, values_only=True):
        if r and r[1] and isinstance(r[1], int) and r[4]:
            rows.append(r)

    print(f"Total rows extracted from sheet: {len(rows)}")

    pegawai_by_name = {p.nama.strip().lower(): p for p in Pegawai.objects.all()}
    pegawai_by_pin = {str(p.pin).strip(): p for p in Pegawai.objects.all() if p.pin}
    shifts_by_code = {s.kode.upper(): s for s in Shift.objects.all()}

    superuser = User.objects.filter(is_superuser=True).first()

    tukar_dinas_list = []
    matched_pairs = 0

    i = 0
    while i < len(rows):
        r1 = rows[i]
        r2 = rows[i + 1] if i + 1 < len(rows) else None
        tgl1 = r1[2]
        tgl2 = r2[2] if r2 else None

        if r2 and isinstance(tgl1, datetime.datetime) and isinstance(tgl2, datetime.datetime) and tgl1.year == 2026 and tgl2.year == 2026:
            pin1 = str(r1[3]).strip() if r1[3] else ''
            nama1 = str(r1[4]).strip()
            code1 = str(r1[5]).strip().upper() if r1[5] else 'P'
            alasan1 = str(r1[6]).strip() if r1[6] else 'Tukar Dinas'

            pin2 = str(r2[3]).strip() if r2[3] else ''
            nama2 = str(r2[4]).strip()
            code2 = str(r2[5]).strip().upper() if r2[5] else 'P'

            p1 = pegawai_by_name.get(nama1.lower()) or pegawai_by_pin.get(pin1)
            p2 = pegawai_by_name.get(nama2.lower()) or pegawai_by_pin.get(pin2)

            s_tujuan1 = shifts_by_code.get(code1)
            s_tujuan2 = shifts_by_code.get(code2)

            if p1 and p2 and s_tujuan1 and s_tujuan2:
                d1 = tgl1.date()
                d2 = tgl2.date()

                # Look up original shifts from JadwalDinas or fallback
                j1 = JadwalDinas.objects.filter(pegawai=p1, tanggal=d1).first()
                j2 = JadwalDinas.objects.filter(pegawai=p2, tanggal=d2).first()

                s_asal1 = j1.shift if j1 else s_tujuan2
                s_asal2 = j2.shift if j2 else s_tujuan1

                jenis = 'tukar_shift' if d1 == d2 else 'tukar_hari'

                tukar_dinas_list.append(
                    TukarDinas(
                        pemohon=p1,
                        tanggal_pemohon=d1,
                        shift_asal_pemohon=s_asal1,
                        shift_tujuan_pemohon=s_tujuan1,
                        pengganti=p2,
                        tanggal_pengganti=d2,
                        shift_asal_pengganti=s_asal2,
                        shift_tujuan_pengganti=s_tujuan2,
                        jenis=jenis,
                        status='disetujui',
                        alasan=alasan1,
                        disetujui_rekan=True,
                        rekan_disetujui_at=datetime.datetime.combine(d1, datetime.time(8, 0)),
                        disetujui_oleh=superuser,
                        disetujui_at=datetime.datetime.combine(d1, datetime.time(9, 0)),
                        catatan_atasan='Diverifikasi dari Berkas Tukar Shift SDM Oktober 2026'
                    )
                )
                matched_pairs += 1

            i += 2
        else:
            i += 1

    print(f"\nSummary:")
    print(f"  Matched pairs ready to import: {matched_pairs}")

    if commit:
        with transaction.atomic():
            TukarDinas.objects.filter(
                tanggal_pemohon__year=2026,
                tanggal_pemohon__month=10
            ).delete()

            TukarDinas.objects.bulk_create(tukar_dinas_list)
            print(f"  Successfully imported {len(tukar_dinas_list)} TukarDinas records to database!")
    else:
        print("  DRY RUN complete! Run with --commit to save to database.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Import October 2026 Tukar Dinas from Excel")
    parser.add_argument('--commit', action='store_true', help="Commit changes to database")
    args = parser.parse_args()
    run(commit=args.commit)

