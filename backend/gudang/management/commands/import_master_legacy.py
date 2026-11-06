from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from gudang.models import GolonganBarang, Satuan, Barang, BarangKemasan


class Command(BaseCommand):
    help = 'Impor master barang aktif dari rssams.dafbrg_log ke gdg_barang'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulasikan impor tanpa menyimpan ke database',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        self.stdout.write(f"Memulai impor master barang legacy (dry_run={dry_run})...")

        # Map legacy id_gol to v2 Golongan kode
        gol_map = {
            1: 'B1',  # Alat Tulis Kantor
            2: 'B2',  # Barang Cetakan
            3: 'B3',  # Alat Listrik
            4: 'B5',  # Material/Bahan
            5: 'B2',  # Benda Pos
            6: 'B4',  # Alat Kebersihan
            7: 'B4',  # Bahan Pembersih
        }

        # Normalize satuan
        satuan_clean_map = {
            '1': 'PCS',
            'BIJI': 'PCS',
            'BUAH': 'BUAH',
            'PCS': 'PCS',
            'KILOAN': 'KG',
            'KG': 'KG',
            'DOZEN': 'LUSIN',
            'LUSIN': 'LUSIN',
            'GELAS': 'GELAS',
            'BUKU': 'BUKU',
            'KALENG': 'KALENG',
            'MAP': 'MAP',
            'METER': 'METER',
            'IKAT': 'PAK',
        }

        # Cache golongans
        gol_objs = {g.kode: g for g in GolonganBarang.objects.all()}
        fallback_gol = gol_objs.get('B8') or GolonganBarang.objects.first()

        # Cache/prepare satuan
        def get_or_create_satuan(raw_sat):
            raw = str(raw_sat or '').strip().upper()
            cleaned = satuan_clean_map.get(raw, raw)
            if not cleaned:
                cleaned = 'PCS'
            sat, _ = Satuan.objects.get_or_create(
                kode=cleaned,
                defaults={'nama': cleaned, 'is_active': True}
            )
            return sat

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    id_brg, nama_barang, kemasan, isi, satuan, merk, 
                    id_gol, stock_buffer, kode_material, gol_baru
                FROM rssams.dafbrg_log
                WHERE del != 'Y'
                ORDER BY id_gol, id_brg
            """)
            legacy_rows = cursor.fetchall()

        self.stdout.write(f"Ditemukan {len(legacy_rows)} barang aktif dari rssams.dafbrg_log.")

        seq_by_prefix = {}
        created_count = 0
        updated_count = 0
        kemasan_count = 0

        with transaction.atomic():
            for row in legacy_rows:
                (id_brg, nama_brg, kemasan, isi, satuan_str, merk,
                 id_gol, stock_buffer, kode_material, gol_baru) = row

                # Resolve golongan
                target_gol_kode = gol_map.get(id_gol, 'B8')
                gol = gol_objs.get(target_gol_kode, fallback_gol)
                prefix = gol.prefix_kode or 'B8'

                # Satuan dasar
                satuan = get_or_create_satuan(satuan_str)

                # Generate unique clean code if kode_material is empty or invalid
                current_seq = seq_by_prefix.get(prefix, 0) + 1
                seq_by_prefix[prefix] = current_seq

                raw_kode = str(kode_material or '').strip()
                if raw_kode and not Barang.objects.filter(kode=raw_kode).exclude(legacy_id_brg=id_brg).exists():
                    final_kode = raw_kode
                else:
                    final_kode = f"{prefix}-{current_seq:04d}"

                clean_nama = str(nama_brg or '').strip().upper()
                clean_merk = str(merk or '').strip().upper()
                buffer_val = Decimal(str(stock_buffer or 0))

                if not dry_run:
                    barang, is_created = Barang.objects.update_or_create(
                        legacy_id_brg=id_brg,
                        defaults={
                            'kode': final_kode,
                            'nama': clean_nama,
                            'golongan': gol,
                            'satuan_dasar': satuan,
                            'merk': clean_merk,
                            'stok_minimum': buffer_val,
                            'is_active': True,
                        }
                    )
                    if is_created:
                        created_count += 1
                    else:
                        updated_count += 1

                    # Kemasan conversion if kemasan != satuan and isi > 0
                    kemasan_str = str(kemasan or '').strip().upper()
                    isi_val = Decimal(str(isi or 1))
                    if kemasan_str and kemasan_str != satuan.kode and isi_val > 0:
                        BarangKemasan.objects.update_or_create(
                            barang=barang,
                            nama_kemasan=kemasan_str,
                            defaults={
                                'isi_per_kemasan': isi_val,
                                'is_default_beli': True,
                            }
                        )
                        kemasan_count += 1
                else:
                    created_count += 1

            if dry_run:
                self.stdout.write(self.style.WARNING("DRY RUN SELESAI: Tidak ada perubahan yang disimpan."))

        self.stdout.write(self.style.SUCCESS(
            f"Impor selesai! {created_count} barang dibuat, {updated_count} diperbarui, "
            f"{kemasan_count} kemasan terdaftar."
        ))

