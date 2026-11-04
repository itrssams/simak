"""
Seed script to import October 2026 Monthly Roster from MASTER sheet of excel_oktober.xlsm into JadwalMaster
and rebuild JadwalDinas (final).
Usage:
    python seed_roster.py [--commit]
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
from sdm.models import Pegawai, Shift, JadwalMaster, JadwalDinas
from sdm.services.jadwal_service import (
    build_shifts_lookup,
    build_pegawai_lookup,
    find_pegawai,
    resolve_shift_for_pegawai,
    rebuild_jadwal_final,
)


def run(commit=False):
    excel_path = '/app/excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found at {excel_path}")
        return

    print(f"Opening workbook: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    if 'MASTER' not in wb.sheetnames:
        print("Error: Sheet 'MASTER' not found!")
        return

    sheet = wb['MASTER']
    shifts_lookup = build_shifts_lookup()
    pegawai_lookup = build_pegawai_lookup()

    master_to_create = []
    matched_employees = 0
    total_assignments = 0
    ignored_typos = []

    year = 2026
    month = 10

    for r_idx, row in enumerate(sheet.iter_rows(min_row=9, max_row=188, values_only=True), start=9):
        if not row or not row[1] or not isinstance(row[1], int):
            continue

        pin = str(row[2]).strip() if row[2] is not None else ''
        nama = str(row[3]).strip() if row[3] else ''

        pegawai = find_pegawai(pin, nama, lookup=pegawai_lookup)
        if not pegawai:
            print(f"Warning: Pegawai not found for row {r_idx} (PIN={pin}, Nama={nama})")
            continue

        matched_employees += 1

        for day_num in range(1, 32):
            col_idx = 5 + day_num  # day 1 is col 6 (G)
            if col_idx >= len(row):
                break

            val = row[col_idx]
            if val is None or str(val).strip() in ('', '0'):
                continue

            code = str(val).strip().upper()
            if code in (',', 'LS'):
                ignored_typos.append((pegawai.nama, pegawai.pin, day_num, val))
                print(f"Info: Ignored typo code '{val}' in MASTER for {pegawai.nama} (PIN {pegawai.pin}) on 2026-10-{day_num:02d}")
                continue

            shift_obj = resolve_shift_for_pegawai(pegawai, code, shifts_lookup=shifts_lookup)
            if not shift_obj:
                print(f"Warning: Unknown shift '{code}' for {pegawai.nama} ({pegawai.kategori}) on day {day_num}")
                continue

            tanggal = datetime.date(year, month, day_num)
            master_to_create.append(
                JadwalMaster(
                    pegawai=pegawai,
                    tanggal=tanggal,
                    shift=shift_obj,
                    catatan='Imported from Excel MASTER Oktober 2026'
                )
            )
            total_assignments += 1

    print(f"\nSummary:")
    print(f"  Employees matched: {matched_employees}")
    print(f"  Ignored typos in MASTER: {len(ignored_typos)}")
    print(f"  Total JadwalMaster records to create: {total_assignments}")

    if commit:
        with transaction.atomic():
            # Remove test row from JadwalDinas if any
            test_del, _ = JadwalDinas.objects.filter(catatan__icontains='Ganti shift via test').delete()
            if test_del:
                print(f"  Removed {test_del} test row(s) ('Ganti shift via test') from JadwalDinas")

            deleted_count, _ = JadwalMaster.objects.filter(
                tanggal__year=year,
                tanggal__month=month
            ).delete()
            if deleted_count > 0:
                print(f"  Cleaned up {deleted_count} existing JadwalMaster records for {month}/{year}")

            batch_size = 1000
            for i in range(0, len(master_to_create), batch_size):
                JadwalMaster.objects.bulk_create(master_to_create[i:i + batch_size])

            rebuild_res = rebuild_jadwal_final(
                start=datetime.date(year, month, 1),
                end=datetime.date(year, month, 31),
            )
            print(f"  Successfully saved {len(master_to_create)} JadwalMaster records and rebuilt JadwalDinas: {rebuild_res}")
    else:
        print("  DRY RUN complete! Run with --commit to save to database.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Import October 2026 Master Roster from Excel")
    parser.add_argument('--commit', action='store_true', help="Commit changes to database")
    args = parser.parse_args()
    run(commit=args.commit)
