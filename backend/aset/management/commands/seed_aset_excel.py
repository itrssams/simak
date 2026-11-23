import re
from datetime import date, datetime
from decimal import Decimal
import openpyxl

from django.core.management.base import BaseCommand
from django.db import transaction

from users.models import Unit
from aset.models import (
    AsetKelompok,
    AsetKategori,
    AsetJenis,
    AsetRuangan,
    Aset,
    AsetRiwayat,
)
from aset.services import generate_kode_aset


KELOMPOK_PMK72 = [
    {
        'kode': 'K1',
        'nama': 'Kelompok 1 (4 Tahun)',
        'masa_manfaat_tahun': Decimal('4.0'),
        'masa_manfaat_bulan': 48,
        'tarif_garis_lurus': Decimal('25.00'),
        'disusutkan': True,
        'keterangan': 'Harta berwujud bukan bangunan Kelompok 1 PMK 72/2023 (IT, perlengkapan ringan, elektronik ringan)',
        'sort_order': 1,
    },
    {
        'kode': 'K2',
        'nama': 'Kelompok 2 (8 Tahun)',
        'masa_manfaat_tahun': Decimal('8.0'),
        'masa_manfaat_bulan': 96,
        'tarif_garis_lurus': Decimal('12.50'),
        'disusutkan': True,
        'keterangan': 'Harta berwujud bukan bangunan Kelompok 2 PMK 72/2023 (alkes standar, AC, kulkas, furnitur, kendaraan)',
        'sort_order': 2,
    },
    {
        'kode': 'K3',
        'nama': 'Kelompok 3 (16 Tahun)',
        'masa_manfaat_tahun': Decimal('16.0'),
        'masa_manfaat_bulan': 192,
        'tarif_garis_lurus': Decimal('6.25'),
        'disusutkan': True,
        'keterangan': 'Harta berwujud bukan bangunan Kelompok 3 PMK 72/2023 (alat radiologi/USG berat, genset, IPAL)',
        'sort_order': 3,
    },
    {
        'kode': 'K4',
        'nama': 'Kelompok 4 (20 Tahun)',
        'masa_manfaat_tahun': Decimal('20.0'),
        'masa_manfaat_bulan': 240,
        'tarif_garis_lurus': Decimal('5.00'),
        'disusutkan': True,
        'keterangan': 'Harta berwujud bukan bangunan Kelompok 4 PMK 72/2023',
        'sort_order': 4,
    },
    {
        'kode': 'BG',
        'nama': 'Bangunan Permanen (20 Tahun)',
        'masa_manfaat_tahun': Decimal('20.0'),
        'masa_manfaat_bulan': 240,
        'tarif_garis_lurus': Decimal('5.00'),
        'disusutkan': True,
        'keterangan': 'Harta berwujud bangunan permanen PMK 72/2023',
        'sort_order': 5,
    },
    {
        'kode': 'NON',
        'nama': 'Tidak Disusutkan (Tanah)',
        'masa_manfaat_tahun': Decimal('0.0'),
        'masa_manfaat_bulan': 0,
        'tarif_garis_lurus': Decimal('0.00'),
        'disusutkan': False,
        'keterangan': 'Aset tanah / lahan yang tidak disusutkan secara fiskal',
        'sort_order': 6,
    },
]

KATEGORI_MAP = {
    'Alat Kesehatan': ('AM', 'Alat Kesehatan', 1),
    'Perangkat Elektronik': ('PE', 'Perangkat Elektronik', 2),
    'IT': ('IT', 'Komputer & Jaringan (IT)', 3),
    'Furnitur Medis': ('FM', 'Furnitur Medis', 4),
    'Furnitur Umum': ('FU', 'Furnitur Umum', 5),
    'Peralatan Penunjang': ('PP', 'Peralatan Penunjang', 6),
    'Kendaraan': ('KD', 'Kendaraan', 7),
    'Bangunan': ('TB', 'Tanah & Bangunan', 8),
    'Perlengkapan': ('PL', 'Perlengkapan', 9),
}

KNOWN_JENIS_CODES = {
    'AC': ('AC', 'K2'),
    'Dispenser': ('DISP', 'K1'),
    'Exhaust Fan': ('EXH', 'K1'),
    'Humidifier/Air Purifier': ('AIRP', 'K1'),
    'Kipas Angin': ('KIPAS', 'K1'),
    'Kulkas': ('KLK', 'K2'),
    'Mesin Cuci': ('MC', 'K2'),
    'Pengering': ('PENG', 'K2'),
    'TV': ('TV', 'K2'),
    'Ambulans': ('AMB', 'K2'),
    'Mobil': ('MBL', 'K2'),
    'Sepeda Motor': ('MTR', 'K1'),
    'Genset': ('GEN', 'K3'),
    'IPAL': ('IPAL', 'K3'),
    'PC': ('PC', 'K1'),
    'Mini PC': ('MINIPC', 'K1'),
    'Laptop': ('LAP', 'K1'),
    'Printer Dokumen': ('PRINT', 'K1'),
    'CCTV': ('CCTV', 'K1'),
    'Server': ('SRV', 'K2'),
    'UPS': ('UPS', 'K1'),
    'Lahan': ('LHN', 'NON'),
}

# Mapping Lokasi Excel -> (Unit.nama, Nama Ruangan Standar)
LOKASI_TO_UNIT_RUANGAN = {
    'Ruang UGD': ('IGD', 'Ruang UGD / IGD'),
    'Ruang OK 1': ('Kamar Bedah', 'Ruang OK 1'),
    'Ruang OK 2': ('Kamar Bedah', 'Ruang OK 2'),
    'Ruang Perawat OK': ('Kamar Bedah', 'Ruang Perawat OK'),
    'Ruang Dokter OK': ('Kamar Bedah', 'Ruang Dokter OK'),
    'OK': ('Kamar Bedah', 'Ruang OK'),
    'Ruang Radiologi': ('Radiologi', 'Ruang Radiologi'),
    'Radiologi': ('Radiologi', 'Ruang Radiologi'),
    'Ruang Perina': ('Perinatologi', 'Ruang Perinatologi'),
    'Perinatologi': ('Perinatologi', 'Ruang Perinatologi'),
    'Ruang VK Bidan': ('Kebidanan', 'Ruang VK Bidan'),
    'VK': ('Kebidanan', 'Ruang VK Bidan'),
    'Ruang Kls 2 Bidan': ('Kebidanan', 'Ruang Kelas 2 Bidan'),
    'Kls 2 Bidan': ('Kebidanan', 'Ruang Kelas 2 Bidan'),
    'Ruang Kls 3 Bidan': ('Kebidanan', 'Ruang Kelas 3 Bidan'),
    'Kls 3 Bidan': ('Kebidanan', 'Ruang Kelas 3 Bidan'),
    'Laktasi': ('Kebidanan', 'Ruang Laktasi'),
    'Ruang USG': ('Rawat Jalan', 'Ruang USG'),
    'Ruang Poli 2': ('Rawat Jalan', 'Ruang Poli 2'),
    'Ruang Poli 3': ('Rawat Jalan', 'Ruang Poli 3'),
    'Ruang Poli 4': ('Rawat Jalan', 'Ruang Poli 4'),
    'Ruang Poli 5': ('Rawat Jalan', 'Ruang Poli 5'),
    'Ruang Poli 6': ('Rawat Jalan', 'Ruang Poli 6'),
    'Ruang Poli 7': ('Rawat Jalan', 'Ruang Poli 7'),
    'Ruang Poli 8': ('Rawat Jalan', 'Ruang Poli 8'),
    'Ruang Poli 9': ('Rawat Jalan', 'Ruang Poli 9'),
    'Ruang Poli 10': ('Rawat Jalan', 'Ruang Poli 10'),
    'Antara Poli 2 & 3': ('Rawat Jalan', 'Area Poli 2 & 3'),
    'Antara Poli 4 & 6': ('Rawat Jalan', 'Area Poli 4 & 6'),
    'Ruang VIP 1': ('Rawat Inap', 'Ruang VIP 1'),
    'VIP 1': ('Rawat Inap', 'Ruang VIP 1'),
    'Ruang VIP 2': ('Rawat Inap', 'Ruang VIP 2'),
    'VIP 2': ('Rawat Inap', 'Ruang VIP 2'),
    'Ruang VIP 3': ('Rawat Inap', 'Ruang VIP 3'),
    'VIP 3': ('Rawat Inap', 'Ruang VIP 3'),
    'Ruang VIP 4': ('Rawat Inap', 'Ruang VIP 4'),
    'VIP 4': ('Rawat Inap', 'Ruang VIP 4'),
    'Ruang VIP 5': ('Rawat Inap', 'Ruang VIP 5'),
    'VIP 5': ('Rawat Inap', 'Ruang VIP 5'),
    'Ruang Kls 1/3': ('Rawat Inap', 'Ruang Kelas 1/3'),
    'Kls 1/3': ('Rawat Inap', 'Ruang Kelas 1/3'),
    'Ruang Kls 1/4': ('Rawat Inap', 'Ruang Kelas 1/4'),
    'Kls 1/4': ('Rawat Inap', 'Ruang Kelas 1/4'),
    'Ruang Kls 1/5': ('Rawat Inap', 'Ruang Kelas 1/5'),
    'Kls 1/5': ('Rawat Inap', 'Ruang Kelas 1/5'),
    'Ruang Kls 1/6': ('Rawat Inap', 'Ruang Kelas 1/6'),
    'Kls 1/6': ('Rawat Inap', 'Ruang Kelas 1/6'),
    'Ruang Kls 2 Pria': ('Rawat Inap', 'Ruang Kelas 2 Pria'),
    'Kls 2 Laki': ('Rawat Inap', 'Ruang Kelas 2 Pria'),
    'Ruang Kls 2 Wanita': ('Rawat Inap', 'Ruang Kelas 2 Wanita'),
    'Kls 2 Wanita': ('Rawat Inap', 'Ruang Kelas 2 Wanita'),
    'Ruang Kls 3 A Pria': ('Rawat Inap', 'Ruang Kelas 3 A Pria'),
    'Ruang Kls 3 B Pria': ('Rawat Inap', 'Ruang Kelas 3 B Pria'),
    'Kls 3 Laki': ('Rawat Inap', 'Ruang Kelas 3 Pria'),
    'Ruang Kls 3 Wanita': ('Rawat Inap', 'Ruang Kelas 3 Wanita'),
    'Kls 3 Wanita': ('Rawat Inap', 'Ruang Kelas 3 Wanita'),
    'Isolasi': ('Rawat Inap', 'Ruang Isolasi'),
    'Ruang HCU': ('HCU', 'Ruang HCU'),
    'Depan pintu msk HCU': ('HCU', 'Depan Pintu Masuk HCU'),
    'Nurses Station': ('Rawat Inap', 'Nurses Station'),
    'R.Istrhat Perawat Ranap': ('Rawat Inap', 'Ruang Istirahat Perawat Ranap'),
    'Ruang Dokter': ('Rawat Inap', 'Ruang Dokter'),
    'R. Dokter': ('Rawat Inap', 'Ruang Dokter'),
    'Ruang dr.Dwi': ('Rawat Jalan', 'Ruang dr. Dwi'),
    'Ruang Apotik': ('Farmasi', 'Ruang Apotik'),
    'Apotik': ('Farmasi', 'Ruang Apotik'),
    'Ruang Gudang Farmasi': ('Farmasi', 'Gudang Farmasi'),
    'Gudang Farmasi': ('Farmasi', 'Gudang Farmasi'),
    'Ruang Laboratorium': ('Laboratorium', 'Ruang Laboratorium'),
    'Laboratorium': ('Laboratorium', 'Ruang Laboratorium'),
    'Laundry': ('Kebersihan & Laundry', 'Ruang Laundry'),
    'CS': ('Kebersihan & Laundry', 'Ruang Cleaning Service'),
    'Ruang Rekam Medis': ('Rekam Medis', 'Ruang Rekam Medis'),
    'Rekam Medis': ('Rekam Medis', 'Ruang Rekam Medis'),
    'Ruang Case Mix': ('Casemix', 'Ruang Case Mix'),
    'Case Mix': ('Casemix', 'Ruang Case Mix'),
    'Ruang Pantry/Server 2': ('IT', 'Ruang Pantry / Server 2'),
    'R. Man Umum/Server 1': ('Umum', 'Ruang Manajemen Umum / Server 1'),
    'Pantry': ('Gizi', 'Ruang Pantry'),
    'Ruang Kantor': ('ADUM', 'Ruang Kantor'),
    'Kantor': ('ADUM', 'Ruang Kantor'),
    'Ruang Rapat': ('ADUM', 'Ruang Rapat'),
    'Ruang Direktur': ('Direksi', 'Ruang Direktur'),
    'FO': ('Pendaftaran', 'Front Office (FO)'),
    'Teknik': ('IPSRS', 'Ruang Teknik / IPSRS'),
    'Pos Security': ('Keamanan', 'Pos Security'),
}

INDO_MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'mei': 5, 'may': 5,
    'jun': 6, 'jul': 7, 'agu': 8, 'agt': 8, 'aug': 8,
    'sep': 9, 'okt': 10, 'oct': 10, 'nov': 11, 'des': 12, 'dec': 12,
}


def make_jenis_kode(nama, used_codes):
    if nama in KNOWN_JENIS_CODES:
        code, _ = KNOWN_JENIS_CODES[nama]
        if code not in used_codes:
            used_codes.add(code)
            return code

    # Bersihkan kurung agar kata inti jadi kode
    base_name = re.sub(r'\([^)]*\)', '', nama).strip() or nama
    words = re.findall(r'[A-Za-z0-9]+', base_name.upper())
    if not words:
        candidate = 'ITEM'
    elif len(words) == 1:
        candidate = words[0][:8]
    elif len(words) == 2:
        candidate = f'{words[0][:4]}{words[1][:4]}'[:10]
    else:
        candidate = ''.join(w[:3] for w in words[:3])[:10]

    if candidate not in used_codes:
        used_codes.add(candidate)
        return candidate

    idx = 2
    while True:
        alt = f'{candidate[:15]}{idx}'
        if alt not in used_codes:
            used_codes.add(alt)
            return alt
        idx += 1


def infer_kelompok_kode(nama, kat_name, kelompok_map):
    if nama in KNOWN_JENIS_CODES:
        return kelompok_map[KNOWN_JENIS_CODES[nama][1]]
    low = nama.lower()
    if kat_name == 'Bangunan':
        if 'lahan' in low or 'tanah' in low:
            return kelompok_map['NON']
        return kelompok_map['BG']
    if kat_name == 'Perlengkapan':
        return kelompok_map['K1']
    if kat_name == 'IT':
        if any(k in low for k in ('server', 'firewall', 'storage')):
            return kelompok_map['K2']
        return kelompok_map['K1']
    if kat_name == 'Kendaraan':
        if 'motor' in low:
            return kelompok_map['K1']
        return kelompok_map['K2']
    if kat_name == 'Peralatan Penunjang':
        if any(k in low for k in ('genset', 'ipal', 'gas medis', 'hydrant')):
            return kelompok_map['K3']
        return kelompok_map['K2']
    if kat_name == 'Alat Kesehatan':
        if any(k in low for k in ('usg', 'x-ray', 'xray', 'roentgen', 'ct ', 'radiologi', 'laparoskopi')):
            return kelompok_map['K3']
        return kelompok_map['K2']
    return kelompok_map['K2']


def parse_beli_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, int):
        if 1990 <= val <= 2100:
            return date(val, 1, 1)
        return None
    s = str(val).strip()
    if not s:
        return None
    if s.isdigit() and len(s) == 4:
        return date(int(s), 1, 1)
    m = re.match(r'^([A-Za-z]{3})[-/ ](\d{2,4})$', s)
    if m:
        mon = INDO_MONTHS.get(m.group(1).lower())
        yr = int(m.group(2))
        if yr < 100:
            yr += 2000
        if mon:
            return date(yr, mon, 1)
    return None


def parse_harga(val):
    if val is None:
        return Decimal('0')
    if isinstance(val, (int, float, Decimal)):
        return Decimal(str(val))
    digits = re.sub(r'[^\d]', '', str(val))
    if not digits:
        return Decimal('0')
    return Decimal(digits)


def extract_spesifikasi(merk):
    if not merk:
        return '-'
    m = re.search(r'(\d+(?:[.,]\d+)?\s*(?:PK|kg|"|pintu))', merk, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return '-'


class Command(BaseCommand):
    help = 'Seed Kelompok PMK 72, Kategori, Master Jenis Aset, Ruangan, dan Daftar Aset dari Excel RS Siaga.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--jenis-xlsx',
            default=r'C:\Users\mfasa\Downloads\Master Data Jenis Aset.xlsx',
            help='Path ke file Excel Master Data Jenis Aset',
        )
        parser.add_argument(
            '--aset-xlsx',
            default=r'C:\Users\mfasa\OneDrive\Desktop\Daftar Aset AC,TV,MC RSSAMS fix tambahan.xlsx',
            help='Path ke file Excel Daftar Aset',
        )
        parser.add_argument(
            '--reset-aset',
            action='store_true',
            help='Hapus seluruh data Aset & Ruangan sebelum seeding ulang (hanya jika belum ada transaksi perbaikan)',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        jenis_xlsx = options['jenis_xlsx']
        aset_xlsx = options['aset_xlsx']

        if options['reset_aset']:
            Aset.objects.all().delete()
            AsetRuangan.objects.all().delete()
            self.stdout.write(self.style.WARNING('Seluruh data Aset & AsetRuangan dihapus sebelum re-seed.'))

        # 1. Seed Kelompok PMK 72/2023
        kelompok_map = {}
        for item in KELOMPOK_PMK72:
            obj, _ = AsetKelompok.objects.update_or_create(
                kode=item['kode'],
                defaults={
                    'nama': item['nama'],
                    'masa_manfaat_tahun': item['masa_manfaat_tahun'],
                    'masa_manfaat_bulan': item['masa_manfaat_bulan'],
                    'tarif_garis_lurus': item['tarif_garis_lurus'],
                    'disusutkan': item['disusutkan'],
                    'keterangan': item['keterangan'],
                    'sort_order': item['sort_order'],
                },
            )
            kelompok_map[obj.kode] = obj
        self.stdout.write(self.style.SUCCESS(f'[OK] AsetKelompok siap: {len(kelompok_map)} kelas PMK 72/2023.'))

        # 2. Seed Kategori
        kat_obj_by_excel_name = {}
        for excel_name, (kode, nama, sort_order) in KATEGORI_MAP.items():
            obj, _ = AsetKategori.objects.update_or_create(
                kode=kode,
                defaults={'nama': nama, 'sort_order': sort_order},
            )
            kat_obj_by_excel_name[excel_name] = obj
        self.stdout.write(self.style.SUCCESS(f'[OK] AsetKategori siap: {len(kat_obj_by_excel_name)} kategori.'))

        # 3. Seed Master Data Jenis Aset (Excel)
        wb_jenis = openpyxl.load_workbook(jenis_xlsx, read_only=True, data_only=True)
        ws_jenis = wb_jenis['Sheet1']

        used_codes = set(AsetJenis.objects.values_list('kode', flat=True))
        jenis_by_name = {j.nama.lower(): j for j in AsetJenis.objects.select_related('kategori', 'kelompok_default')}
        jenis_created = 0
        jenis_updated = 0

        for idx, row in enumerate(ws_jenis.iter_rows(values_only=True), 1):
            if idx == 1 or not row or not row[1]:
                continue
            nama = str(row[1]).strip()
            kat_excel = str(row[2]).strip() if row[2] else 'Perlengkapan'
            kat_obj = kat_obj_by_excel_name.get(kat_excel) or kat_obj_by_excel_name['Perlengkapan']
            kel_obj = infer_kelompok_kode(nama, kat_excel, kelompok_map)

            existing = jenis_by_name.get(nama.lower())
            if existing:
                existing.kategori = kat_obj
                existing.kelompok_default = kel_obj
                existing.sort_order = idx - 1
                existing.save(update_fields=['kategori', 'kelompok_default', 'sort_order'])
                jenis_updated += 1
            else:
                kode = make_jenis_kode(nama, used_codes)
                obj = AsetJenis.objects.create(
                    kategori=kat_obj,
                    kode=kode,
                    nama=nama,
                    kelompok_default=kel_obj,
                    sort_order=idx - 1,
                )
                jenis_by_name[nama.lower()] = obj
                jenis_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'[OK] AsetJenis selesai: {jenis_created} dibuat, {jenis_updated} diperbarui (total DB: {AsetJenis.objects.count()}).'
        ))

        # 4. Preload & pastikan seluruh Unit yang dibutuhkan tersedia di Manajemen User
        unit_by_name = {u.nama.lower(): u for u in Unit.objects.all()}
        missing_units_config = [
            ('HCU', 'unit', 'Rawat Inap'),
            ('Perinatologi', 'unit', 'Kebidanan'),
        ]
        units_created = 0
        for u_nama, u_kat, parent_nama in missing_units_config:
            if u_nama.lower() not in unit_by_name:
                parent_obj = unit_by_name.get(parent_nama.lower()) if parent_nama else None
                u_obj = Unit.objects.create(
                    nama=u_nama,
                    kategori=u_kat,
                    parent=parent_obj,
                    is_active=True,
                )
                unit_by_name[u_nama.lower()] = u_obj
                units_created += 1
        if units_created:
            self.stdout.write(self.style.SUCCESS(f'[OK] Unit baru ditambahkan ke Manajemen User: {units_created} unit.'))
        default_unit = unit_by_name.get('umum') or Unit.objects.first()

        # 5. Seed Daftar Aset dari Excel
        wb_aset = openpyxl.load_workbook(aset_xlsx, read_only=True, data_only=True)
        ws_aset = wb_aset['Daftar']

        aset_created = 0
        aset_skipped = 0
        ruangan_created = 0

        for row_idx, row in enumerate(ws_aset.iter_rows(values_only=True), 1):
            if row_idx < 6 or not row:
                continue
            no_val = row[0]
            deskripsi_raw = str(row[1]).strip() if row[1] is not None else ''
            if not deskripsi_raw or deskripsi_raw.lower() == 'deskripsi aset':
                continue

            merk_raw = str(row[2]).strip() if row[2] is not None else ''
            lok_raw = str(row[4]).strip() if row[4] is not None else ''
            kelayakan_raw = str(row[6]).strip().upper() if row[6] is not None else ''
            thn_pembuatan_raw = row[8]
            beli_raw = row[9]
            hrg_raw = row[10]
            rekom_raw = str(row[11]).strip() if row[11] is not None else ''
            own_raw = str(row[12]).strip().lower() if row[12] is not None else 'milik sendiri'

            # Cari AsetJenis sesuai Deskripsi Aset
            jenis_obj = jenis_by_name.get(deskripsi_raw.lower())
            if not jenis_obj:
                self.stdout.write(self.style.WARNING(f'  [SKIP r{row_idx}] Jenis "{deskripsi_raw}" tidak ditemukan di Master Jenis.'))
                aset_skipped += 1
                continue

            import_marker = f'Import Excel Inventaris RSSAMS (No. {no_val})'
            if Aset.objects.filter(catatan__startswith=import_marker).exists():
                aset_skipped += 1
                continue

            # Mapping Lokasi -> Unit & AsetRuangan
            unit_name, ruangan_nama = LOKASI_TO_UNIT_RUANGAN.get(lok_raw, ('Umum', lok_raw or 'Area Umum RS'))
            unit_obj = unit_by_name.get(unit_name.lower()) or default_unit

            ruangan_obj, r_created = AsetRuangan.objects.get_or_create(
                unit=unit_obj,
                nama=ruangan_nama,
                defaults={'is_active': True},
            )
            if r_created:
                ruangan_created += 1

            status_kelayakan = kelayakan_raw if kelayakan_raw in ('A', 'B', 'C', 'D', 'E') else 'B'
            if status_kelayakan == 'E':
                status_aset = 'dalam_perbaikan'
            else:
                status_aset = 'aktif'

            status_kepemilikan = 'milik_sendiri'
            if 'sewa' in own_raw:
                status_kepemilikan = 'sewa'
            elif 'pinjam' in own_raw:
                status_kepemilikan = 'pinjam_pakai'
            elif 'hibah' in own_raw:
                status_kepemilikan = 'hibah'
            elif 'kso' in own_raw:
                status_kepemilikan = 'kso'

            thn_pembuatan = None
            if isinstance(thn_pembuatan_raw, int) and 1980 <= thn_pembuatan_raw <= 2100:
                thn_pembuatan = thn_pembuatan_raw
            elif isinstance(thn_pembuatan_raw, str) and thn_pembuatan_raw.strip().isdigit():
                thn_pembuatan = int(thn_pembuatan_raw.strip())

            bulan_perolehan = parse_beli_date(beli_raw)
            harga_perolehan = parse_harga(hrg_raw)
            status_data = 'lengkap' if (bulan_perolehan is not None and harga_perolehan > 0) else 'belum_lengkap'

            spesifikasi = extract_spesifikasi(merk_raw)
            lokasi_teks = lok_raw or ruangan_nama
            kode_aset = generate_kode_aset(jenis_obj, tahun=bulan_perolehan or thn_pembuatan)

            catatan_parts = [import_marker]
            if not kelayakan_raw:
                catatan_parts.append('Status kelayakan pada sumber Excel kosong (diset default B).')
            if status_data == 'belum_lengkap':
                catatan_parts.append('Tanggal beli atau harga beli pada Excel belum lengkap.')

            aset = Aset.objects.create(
                kode_aset=kode_aset,
                jenis=jenis_obj,
                deskripsi=deskripsi_raw,
                merk=merk_raw,
                spesifikasi=spesifikasi,
                perlu_kalibrasi=False,
                unit=unit_obj,
                ruangan=ruangan_obj,
                lokasi_teks=lokasi_teks,
                status_kelayakan=status_kelayakan,
                status_aset=status_aset,
                status_data=status_data,
                status_kepemilikan=status_kepemilikan,
                tahun_pembuatan=thn_pembuatan,
                bulan_perolehan=bulan_perolehan,
                harga_perolehan=harga_perolehan,
                kelompok=jenis_obj.kelompok_default,
                masa_manfaat_bulan=jenis_obj.kelompok_default.masa_manfaat_bulan if jenis_obj.kelompok_default else 0,
                rekomendasi_tindakan=rekom_raw or ('Perlu pengecekan / penggantian unit' if status_kelayakan in ('D', 'E') else 'Pemeliharaan berkala rutin'),
                catatan=' | '.join(catatan_parts),
            )

            AsetRiwayat.objects.create(
                aset=aset,
                aksi='dibuat',
                status_kelayakan_lama=status_kelayakan,
                status_kelayakan_baru=status_kelayakan,
                unit_lama=unit_obj.nama,
                unit_baru=unit_obj.nama,
                ruangan_lama=lokasi_teks,
                ruangan_baru=lokasi_teks,
                catatan=f'Registrasi awal aset melalui seed Excel ({kode_aset})',
            )
            aset_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'[OK] Seeding Aset selesai: {ruangan_created} ruangan dibuat, {aset_created} aset didaftarkan, {aset_skipped} baris dilewati.'
        ))
