"""
Import schedule corrections from sheet 'TUKAR SHIF' in excel_oktober.xlsm into JadwalKoreksi
and rebuild JadwalDinas (final) for October 2026.
Usage:
    python import_jadwal_koreksi.py [--commit]
"""
import os
import argparse
import datetime
import openpyxl

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.db import transaction
from django.contrib.auth import get_user_model
from sdm.models import Pegawai, JadwalKoreksi, JadwalDinas, TukarDinas
from sdm.services.jadwal_service import (
    build_shifts_lookup,
    build_pegawai_lookup,
    find_pegawai,
    resolve_shift_for_pegawai,
    rebuild_jadwal_final,
)

User = get_user_model()


def infer_jenis(kode_upper: str, alasan: str) -> str:
    if kode_upper in ('I', 'IP', 'IS', 'IM'):
        return 'izin'
    if kode_upper == 'SA':
        return 'sakit'
    if kode_upper == 'CT':
        return 'cuti'
    alasan_low = (alasan or '').lower()
    if 'tukar hari' in alasan_low or 'lintas' in alasan_low:
        return 'tukar_hari'
    if 'ganti jaga' in alasan_low:
        return 'ganti_jaga'
    return 'tukar_shift'


def run(commit=False):
    excel_path = '/app/excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        print(f"Error: File Excel tidak ditemukan di {excel_path}")
        return

    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    if 'TUKAR SHIF' not in wb.sheetnames:
        print("Error: Sheet 'TUKAR SHIF' tidak ditemukan!")
        return

    ws = wb['TUKAR SHIF']
    shifts_lookup = build_shifts_lookup()
    pegawai_lookup = build_pegawai_lookup()

    # Build TukarDinas lookup by (pegawai_id, tanggal)
    tukar_lookup = {}
    for td in TukarDinas.objects.filter(status='disetujui'):
        if td.pemohon_id and td.tanggal_pemohon:
            tukar_lookup.setdefault((td.pemohon_id, td.tanggal_pemohon), td)
        if td.pengganti_id and td.tanggal_pengganti:
            tukar_lookup.setdefault((td.pengganti_id, td.tanggal_pengganti), td)

    superuser = User.objects.filter(is_superuser=True).first()

    total_rows_read = 0
    seen_keys = {}  # (pegawai_id, tanggal) -> row_num
    duplicates = []
    skipped_pin = []
    skipped_shift = []
    koreksi_to_create = []

    for r_idx, row in enumerate(ws.iter_rows(min_row=6, max_row=250, values_only=True), start=6):
        if not row or len(row) < 6:
            continue
        tgl_val = row[2]
        pin_val = row[3]
        nama_val = row[4]
        kode_val = row[5]
        ket_val = row[6] if len(row) > 6 else ''

        if tgl_val is None and pin_val is None and nama_val is None:
            continue
        if not isinstance(tgl_val, (datetime.datetime, datetime.date)):
            continue

        total_rows_read += 1
        tgl = tgl_val.date() if isinstance(tgl_val, datetime.datetime) else tgl_val
        pin_str = str(pin_val).strip() if pin_val is not None else ''
        nama_str = str(nama_val).strip() if nama_val else ''
        kode_str = str(kode_val).strip().upper() if kode_val else ''
        alasan_str = str(ket_val).strip() if ket_val else ''

        if tgl.year != 2026 or tgl.month != 10:
            print(f"  [INFO] Baris {r_idx} memiliki tanggal salah ketik di Excel ({tgl}, PIN={pin_str}, Nama={nama_str}, Kode={kode_str}) -> diabaikan (sama seperti rumus MATCH Excel)")
            continue

        # Match by PIN+Name (exact Excel behavior + protection against duplicate PIN 332)
        pegawai = find_pegawai(pin_str, nama_str, lookup=pegawai_lookup)
        if not pegawai:
            skipped_pin.append((r_idx, pin_str, nama_str, tgl, kode_str))
            continue

        shift_obj = resolve_shift_for_pegawai(pegawai, kode_str, shifts_lookup=shifts_lookup)
        if not shift_obj:
            skipped_shift.append((r_idx, pegawai.nama, pegawai.kategori, tgl, kode_str))
            continue

        key = (pegawai.id, tgl)
        if key in seen_keys:
            duplicates.append((r_idx, seen_keys[key], pegawai.nama, pegawai.pin, tgl, kode_str))
            continue
        seen_keys[key] = r_idx

        td = tukar_lookup.get(key)
        jenis = infer_jenis(kode_str, alasan_str)
        if td and jenis in ('tukar_shift', 'tukar_hari', 'ganti_jaga'):
            jenis = td.jenis

        koreksi_to_create.append(
            JadwalKoreksi(
                pegawai=pegawai,
                tanggal=tgl,
                shift=shift_obj,
                jenis=jenis,
                tukar=td,
                alasan=(alasan_str or f"Koreksi {kode_str} (Excel TUKAR SHIF baris {r_idx})")[:255],
                created_by=superuser,
            )
        )

    print("=== RINGKASAN IMPORT JADWAL KOREKSI (TUKAR SHIF) ===")
    print(f"  Baris dibaca dari sheet TUKAR SHIF : {total_rows_read}")
    print(f"  Koreksi unik siap disimpan         : {len(koreksi_to_create)}")
    print(f"  Duplikat (baris pertama menang)    : {len(duplicates)}")
    for d in duplicates:
        print(f"    - Baris {d[0]} diabaikan (sudah ada di baris {d[1]}): {d[2]} (PIN {d[3]}) tgl {d[4]} kode {d[5]}")
    print(f"  Di-skip karena PIN/Pegawai tak ada : {len(skipped_pin)}")
    for sp in skipped_pin:
        print(f"    - Baris {sp[0]}: PIN={sp[1]} Nama={sp[2]} tgl={sp[3]} kode={sp[4]}")
    print(f"  Di-skip karena Shift tak ditemukan : {len(skipped_shift)}")
    for ss in skipped_shift:
        print(f"    - Baris {ss[0]}: {ss[1]} ({ss[2]}) tgl={ss[3]} kode={ss[4]}")

    if commit:
        with transaction.atomic():
            JadwalKoreksi.objects.filter(tanggal__year=1900).delete()
            JadwalDinas.objects.filter(tanggal__year=1900).delete()
            deleted_count, _ = JadwalKoreksi.objects.filter(
                tanggal__year=2026,
                tanggal__month=10
            ).delete()
            if deleted_count:
                print(f"  Menghapus {deleted_count} data JadwalKoreksi Oktober 2026 lama...")

            JadwalKoreksi.objects.bulk_create(koreksi_to_create, batch_size=500)
            rebuild_res = rebuild_jadwal_final(
                start=datetime.date(2026, 10, 1),
                end=datetime.date(2026, 10, 31),
            )
            print(f"  Berhasil menyimpan {len(koreksi_to_create)} JadwalKoreksi!")
            print(f"  Hasil rebuild_jadwal_final: {rebuild_res}")
    else:
        print("  DRY RUN selesai. Gunakan --commit untuk menyimpan ke database.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Import October 2026 JadwalKoreksi from Excel TUKAR SHIF")
    parser.add_argument('--commit', action='store_true', help="Commit changes to database")
    args = parser.parse_args()
    run(commit=args.commit)
