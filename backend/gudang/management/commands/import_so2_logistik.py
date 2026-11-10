import os
from decimal import Decimal
import openpyxl
from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model

from gudang.models import (
    Barang, GolonganBarang, Satuan, Ruang, Gudang,
    StockOpname, StockOpnameItem, StokSaldo, Permintaan, Pengeluaran
)
from gudang.services.opname import OpnameService
from gudang.services.distribution import DistributionService


class Command(BaseCommand):
    help = "Import stok logistik dari file Excel LOGISTIK.xlsx (Sheet SO KE 2 dan Kartu Stok Sementara)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=r'C:\Users\mfasa\Downloads\LOGISTIK.xlsx',
            help='Path ke file LOGISTIK.xlsx'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulasikan proses import tanpa menyimpan perubahan ke database'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        dry_run = options['dry_run']

        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File tidak ditemukan: {file_path}"))
            return

        self.stdout.write(self.style.NOTICE(f"=== MEMULAI IMPORT STOK LOGISTIK ({'DRY-RUN' if dry_run else 'LIVE COMMIT'}) ==="))
        self.stdout.write(f"File: {file_path}")

        User = get_user_model()
        admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        gudang_utama = Gudang.get_default()

        wb = openpyxl.load_workbook(file_path, data_only=True)
        if 'SO KE 2' not in wb.sheetnames:
            self.stderr.write(self.style.ERROR("Sheet 'SO KE 2' tidak ditemukan dalam file Excel!"))
            return

        ws_so = wb['SO KE 2']

        with transaction.atomic():
            # ─────────────────────────────────────────────────────────────
            # 1. Pastikan Satuan & Buat Master Barang yang Belum Ada
            # ─────────────────────────────────────────────────────────────
            self.stdout.write("\n1. Memeriksa master barang dari sheet 'SO KE 2'...")
            sat_map = {'KOTAK': 'BOX', 'PACK': 'PAK'}
            for s in Satuan.objects.all():
                sat_map[s.kode.upper()] = s.kode

            new_barang_count = 0
            for r in range(3, 293):
                raw_nama = str(ws_so.cell(r, 3).value or '').strip().upper()
                sat_excel = str(ws_so.cell(r, 8).value or '').strip().upper()
                if not raw_nama:
                    continue

                # Khusus baris 285 (FORM. MCU dengan satuan SET agar tidak bentrok dengan B2-0017 RANGKAP)
                if raw_nama == 'FORM. MCU' and sat_excel == 'SET':
                    nama = 'FORM. MCU (SET)'
                else:
                    nama = raw_nama

                b = Barang.objects.filter(nama=nama).first()
                if not b:
                    # Klasifikasi otomatis ke Golongan Barang
                    if any(k in nama for k in [
                        'FORM', 'ASSESMENT', 'CPPT', 'LEMBAR', 'BERITA ACARA',
                        'MONITORING', 'PENGAJUAN', 'PENILAIAN', 'KONSULTASI',
                        'COVER MCU', 'KERTAS COVER'
                    ]):
                        gol_kode = 'B2'
                    elif any(k in nama for k in ['TISU', 'SAPU LIDI', 'WIPER LANTAI']):
                        gol_kode = 'B4'
                    elif any(k in nama for k in ['KIPAS ANGIN', 'USB SHARING', 'KABEL DUK']):
                        gol_kode = 'B3'
                    elif 'TIMER MESIN CUCI' in nama:
                        gol_kode = 'B5'
                    elif 'TUTUP KUNCI BULAT' in nama:
                        gol_kode = 'B6'
                    else:
                        gol_kode = 'B1'

                    gol = GolonganBarang.objects.filter(kode=gol_kode).first()
                    clean_sat = sat_map.get(sat_excel, 'PCS')
                    sat = Satuan.objects.filter(kode=clean_sat).first() or Satuan.objects.filter(kode='PCS').first()

                    prefix = gol.prefix_kode or gol.kode
                    last_b = Barang.objects.filter(kode__startswith=f'{prefix}-').order_by('-kode').first()
                    seq = (int(last_b.kode.split('-')[-1]) + 1) if last_b and '-' in last_b.kode else 1
                    kode = f'{prefix}-{seq:04d}'
                    while Barang.objects.filter(kode=kode).exists():
                        seq += 1
                        kode = f'{prefix}-{seq:04d}'

                    b = Barang.objects.create(
                        kode=kode,
                        nama=nama,
                        golongan=gol,
                        satuan_dasar=sat,
                        created_by=admin_user
                    )
                    new_barang_count += 1
                    self.stdout.write(f"   [+] Dibuat Barang baru: [{b.kode}] {b.nama} ({b.satuan_dasar.kode}) - {gol.nama}")

            self.stdout.write(self.style.SUCCESS(f"   Total barang baru ditambahkan: {new_barang_count}"))

            # ─────────────────────────────────────────────────────────────
            # 2. Siapkan Data Stock Opname (Saldo Awal Cut-Over)
            # ─────────────────────────────────────────────────────────────
            self.stdout.write("\n2. Menyiapkan data Stock Opname Saldo Awal (Cut-Over)...")

            # Saldo awal untuk 5 barang yang memiliki mutasi di Kartu Stok Sementara
            kartu_stok_initial = {
                'KERTAS HVS A4': Decimal('20'),
                'TISU': Decimal('100'),
                'PLASTIK LAMINATING': Decimal('19'),
                'KERTAS NCR': Decimal('10'),
                'STICKER THERMAL 78 X 30': Decimal('5'),
            }

            # Barang di SO2 yang ada keluar/masuk tapi tidak ada di Kartu Stok Sementara (ambil saldo akhir langsung)
            so2_final_override = {
                'ISI STAPLES 10': Decimal('0'),
                'PULPEN HITAM': Decimal('24'),
                'SPIDOL NON PERMANENT HITAM': Decimal('1'),
                'STICKY NOTE': Decimal('0'),
            }

            opname_items = []
            seen_barang_ids = set()

            for r in range(3, 293):
                raw_nama = str(ws_so.cell(r, 3).value or '').strip().upper()
                sat_excel = str(ws_so.cell(r, 8).value or '').strip().upper()
                if not raw_nama:
                    continue

                if raw_nama == 'FORM. MCU' and sat_excel == 'SET':
                    nama = 'FORM. MCU (SET)'
                else:
                    nama = raw_nama

                b = Barang.objects.filter(nama=nama).first()
                if not b:
                    continue

                if b.id in seen_barang_ids:
                    continue
                seen_barang_ids.add(b.id)

                if nama in kartu_stok_initial:
                    qty = kartu_stok_initial[nama]
                    ket = f"Saldo Awal (Sebelum Mutasi Kartu Stok): {qty} {b.satuan_dasar.kode}"
                elif nama in so2_final_override:
                    qty = so2_final_override[nama]
                    ket = f"Saldo Akhir SO-2 (Baris {r}): {qty} {b.satuan_dasar.kode}"
                else:
                    raw_sisa = ws_so.cell(r, 7).value
                    raw_jml = ws_so.cell(r, 4).value
                    qty_val = raw_sisa if raw_sisa is not None else raw_jml
                    qty = Decimal(str(qty_val or 0))
                    ket = f"Saldo Awal SO-2 Baris {r}"

                opname_items.append({
                    'barang': b,
                    'qty_fisik': qty,
                    'satuan': b.satuan_dasar.kode,
                    'keterangan': ket
                })

            self.stdout.write(f"   Total item dalam dokumen Stock Opname: {len(opname_items)}")

            # Buat / perbarui Stock Opname Saldo Awal OPN-2026-00001
            op = StockOpname.objects.filter(id=1).first()
            if op and op.status == StockOpname.STATUS_DRAFT:
                op.items.all().delete()
                op.catatan = "Saldo Awal Cut-Over Logistik RS Siaga Al Munawwarah (SO Ke-2)"
                op.tanggal = "2026-11-01"
                op.save()
            else:
                op = StockOpname.objects.create(
                    nomor="OPN-2026-00001",
                    tanggal="2026-11-01",
                    gudang=gudang_utama,
                    jenis=StockOpname.JENIS_SALDO_AWAL,
                    status=StockOpname.STATUS_DRAFT,
                    catatan="Saldo Awal Cut-Over Logistik RS Siaga Al Munawwarah (SO Ke-2)",
                    created_by=admin_user
                )

            for item in opname_items:
                StockOpnameItem.objects.create(
                    opname=op,
                    barang=item['barang'],
                    qty_sistem=Decimal('0.000'),
                    qty_fisik=item['qty_fisik'],
                    selisih=item['qty_fisik'],
                    satuan=item['satuan'],
                    keterangan=item['keterangan']
                )

            op.total_selisih_qty = sum(it['qty_fisik'] for it in opname_items)
            op.save()

            # Setujui Stock Opname (memasukkan saldo awal ke StokSaldo & mencatat StokLedger INIT)
            OpnameService.approve_opname(op, user=admin_user)
            self.stdout.write(self.style.SUCCESS(f"   Stock Opname {op.nomor} berhasil disetujui & diterapkan ke saldo!"))

            # ─────────────────────────────────────────────────────────────
            # 3. Proses Transaksi Sheet 'Kartu Stok Sementara' via Permintaan & Pengeluaran
            # ─────────────────────────────────────────────────────────────
            self.stdout.write("\n3. Memproses mutasi pengeluaran dari sheet 'Kartu Stok Sementara'...")

            ks_requests = [
                (
                    '2026-11-09', 'ADUM', 'Umum',
                    'Pengeluaran operasional ADUM',
                    [('KERTAS HVS A4', Decimal('1'), 'RIM')]
                ),
                (
                    '2026-11-09', 'Apotik', 'Petugas Apotik',
                    'Kebutuhan operasional Apotik (Kertas NCR & Sticker Thermal)',
                    [
                        ('KERTAS NCR', Decimal('2'), 'ROLL'),
                        ('STICKER THERMAL 78 X 30', Decimal('2'), 'ROLL')
                    ]
                ),
                (
                    '2026-11-10', 'Laboratorium', 'Suci',
                    'Kebutuhan operasional Laboratorium (Suci)',
                    [('KERTAS HVS A4', Decimal('2'), 'RIM')]
                ),
                (
                    '2026-11-10', 'HUMAS', 'Fandi',
                    'Kebutuhan operasional Humas (Fandi)',
                    [('KERTAS HVS A4', Decimal('1'), 'RIM')]
                ),
                (
                    '2026-11-10', 'UGD', 'Suci',
                    'Kebutuhan operasional UGD (Suci)',
                    [
                        ('KERTAS HVS A4', Decimal('1'), 'RIM'),
                        ('TISU', Decimal('1'), 'PCS')
                    ]
                ),
                (
                    '2026-11-10', 'Kebersihan & Laundry', 'Petugas CS',
                    'Kebutuhan CS Kebersihan (Tisu)',
                    [('TISU', Decimal('1'), 'PCS')]
                ),
                (
                    '2026-11-10', 'Keuangan', 'Ulfa',
                    'Kebutuhan operasional Keuangan (Ulfa)',
                    [('TISU', Decimal('1'), 'PCS')]
                ),
                (
                    '2026-11-10', 'ADUM', 'Umum',
                    'Pengeluaran operasional ADUM (Plastik Laminating)',
                    [('PLASTIK LAMINATING', Decimal('1'), 'PCS')]
                ),
            ]

            for tgl, r_nama, penerima, cat, items in ks_requests:
                ruang = Ruang.objects.filter(nama__iexact=r_nama).first()
                if not ruang:
                    ruang = Ruang.objects.filter(nama__icontains=r_nama).first()

                items_data = []
                for b_nama, q, sat in items:
                    b = Barang.objects.filter(nama=b_nama).first()
                    items_data.append({'barang': b, 'qty_minta': q, 'satuan': sat})

                # 1. Buat Permintaan
                req = DistributionService.create_permintaan(
                    ruang=ruang,
                    items_data=items_data,
                    user=admin_user,
                    tanggal=tgl,
                    catatan=cat,
                    auto_submit=True
                )
                # 2. Setujui Permintaan
                DistributionService.approve_permintaan(req, user=admin_user)

                # 3. Buat Bon Pengeluaran Fisik
                out_items = []
                for pi in req.items.all():
                    out_items.append({
                        'barang': pi.barang,
                        'permintaan_item': pi,
                        'qty': pi.qty_disetujui,
                        'satuan': pi.satuan
                    })
                out = DistributionService.create_pengeluaran(
                    ruang=ruang,
                    items_data=out_items,
                    user=admin_user,
                    permintaan=req,
                    tanggal=tgl,
                    penerima_nama=penerima,
                    catatan=cat
                )
                # 4. Setujui Pengeluaran (Potong Stok & Catat Kartu Stok / Ledger)
                DistributionService.approve_pengeluaran(out, user=admin_user)
                self.stdout.write(f"   [✓] {req.nomor} & {out.nomor} ({tgl}) - Ruang {ruang.nama} - Penerima: {penerima} -> SELESAI")

            self.stdout.write(self.style.SUCCESS("   Seluruh mutasi Kartu Stok Sementara berhasil dibukukan!"))

            # ─────────────────────────────────────────────────────────────
            # 4. Verifikasi Hasil Akhir Stok
            # ─────────────────────────────────────────────────────────────
            self.stdout.write("\n" + "=" * 65)
            self.stdout.write("HASIL AKHIR VERIFIKASI STOK SETELAH MUTASI:")
            self.stdout.write("=" * 65)
            check_list = [
                ('KERTAS HVS A4', Decimal('15')),
                ('TISU', Decimal('97')),
                ('PLASTIK LAMINATING', Decimal('18')),
                ('KERTAS NCR', Decimal('8')),
                ('STICKER THERMAL 78 X 30', Decimal('3')),
                ('PULPEN HITAM', Decimal('24')),
                ('ISI STAPLES 10', Decimal('0')),
                ('SPIDOL NON PERMANENT HITAM', Decimal('1')),
                ('STICKY NOTE', Decimal('0')),
            ]

            all_match = True
            for nama, expected_qty in check_list:
                b = Barang.objects.filter(nama=nama).first()
                saldo = StokSaldo.objects.filter(barang=b).first()
                actual_qty = saldo.qty if saldo else Decimal('0')
                is_match = (actual_qty == expected_qty)
                if not is_match:
                    all_match = False
                status_txt = self.style.SUCCESS("PAS / MATCH") if is_match else self.style.ERROR(f"MISMATCH (Harus {expected_qty})")
                self.stdout.write(f" - {nama:<28} : {actual_qty:>6} {b.satuan_dasar.kode:<6} [{status_txt}]")

            self.stdout.write("=" * 65)

            if dry_run:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\n[DRY-RUN] Seluruh perubahan di-ROLLBACK (database tidak berubah)."))
            else:
                self.stdout.write(self.style.SUCCESS("\n[BERHASIL] Seluruh transaksi telah di-COMMIT ke database local!"))

