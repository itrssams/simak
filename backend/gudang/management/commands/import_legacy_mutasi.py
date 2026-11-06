from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils.timezone import make_aware, is_naive
from gudang.models import Barang, LegacyMutasi
import datetime


class Command(BaseCommand):
    help = 'Salin riwayat transaksi legacy ke gdg_legacy_mutasi untuk tab Riwayat Lama'

    def handle(self, *args, **options):
        self.stdout.write("Memulai salin riwayat mutasi lama...")

        # Cache barang map legacy_id_brg -> Barang obj
        barang_map = {b.legacy_id_brg: b for b in Barang.objects.filter(legacy_id_brg__isnull=False)}

        def parse_dt(val):
            if not val:
                return datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc)
            if isinstance(val, datetime.date) and not isinstance(val, datetime.datetime):
                val = datetime.datetime.combine(val, datetime.time.min)
            if is_naive(val):
                return make_aware(val)
            return val

        # 1. Salin dari item_logistik (Penerimaan)
        self.stdout.write("Membaca data dari rssams.item_logistik...")
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    il.id_brg, il.id, il.qty, il.isi, il.harga,
                    tb.rekanan, COALESCE(tb.tgl_spk, il.tgl_entri) as tgl
                FROM rssams.item_logistik il
                LEFT JOIN rssams.tran_beli_brg_log tb ON il.id = tb.id
                WHERE il.id_brg IS NOT NULL
            """)
            in_rows = cursor.fetchall()

        in_objs = []
        for r in in_rows:
            id_brg, no_spb, qty, isi, harga, rekanan, tgl = r
            qty_val = Decimal(str(qty or 0))
            isi_val = Decimal(str(isi or 1))
            if isi_val <= 0:
                isi_val = Decimal('1')
            qty_dasar = qty_val * isi_val
            harga_dasar = Decimal(str(harga or 0)) / isi_val
            barang = barang_map.get(id_brg)

            in_objs.append(LegacyMutasi(
                legacy_id_brg=id_brg,
                barang=barang,
                jenis='MASUK',
                tanggal=parse_dt(tgl),
                qty_dasar=qty_dasar,
                harga_dasar=harga_dasar,
                vendor_nama=str(rekanan or '')[:150],
                dokumen_legacy=str(no_spb or '')[:50],
                catatan='',
                sumber_tabel='item_logistik'
            ))

        # 2. Salin dari item_out_log (Pengeluaran Unit)
        self.stdout.write("Membaca data dari rssams.item_out_log...")
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    io.id_brg, io.id, io.qty,
                    kr.ruangan, io.tgl, io.status
                FROM rssams.item_out_log io
                LEFT JOIN rssams.kode_ruang kr ON io.id_ruang = kr.id_ruang
                WHERE io.id_brg IS NOT NULL
            """)
            out_rows = cursor.fetchall()

        out_objs = []
        for r in out_rows:
            id_brg, no_out, qty, ruang, tgl, status = r
            qty_dasar = -abs(Decimal(str(qty or 0)))
            barang = barang_map.get(id_brg)

            out_objs.append(LegacyMutasi(
                legacy_id_brg=id_brg,
                barang=barang,
                jenis='KELUAR',
                tanggal=parse_dt(tgl),
                qty_dasar=qty_dasar,
                harga_dasar=None,
                ruang_nama=str(ruang or '')[:120],
                dokumen_legacy=str(no_out or '')[:50],
                catatan=f"Status: {status or '-'}",
                sumber_tabel='item_out_log'
            ))

        total_objs = in_objs + out_objs
        self.stdout.write(f"Total {len(in_objs)} mutasi masuk & {len(out_objs)} mutasi keluar akan disalin.")

        with transaction.atomic():
            LegacyMutasi.objects.all().delete()
            batch_size = 1000
            for i in range(0, len(total_objs), batch_size):
                LegacyMutasi.objects.bulk_create(total_objs[i:i + batch_size])

        self.stdout.write(self.style.SUCCESS(
            f"Selesai! {len(total_objs)} riwayat legacy berhasil disalin ke gdg_legacy_mutasi."
        ))
