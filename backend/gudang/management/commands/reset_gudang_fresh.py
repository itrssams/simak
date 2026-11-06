from django.core.management.base import BaseCommand
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Mereset sistem Gudang Logistik v.2 menjadi fresh 0 (menghapus master barang, transaksi, & riwayat lama)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Memulai proses reset data Gudang Logistik v.2 ke Fresh 0..."))

        tables_to_clear = [
            'gdg_pengeluaran_item',
            'gdg_pengeluaran',
            'gdg_permintaan_item',
            'gdg_permintaan',
            'gdg_penerimaan_item',
            'gdg_penerimaan',
            'gdg_po_item',
            'gdg_po',
            'gdg_stok_saldo',
            'gdg_stok_ledger',
            'gdg_legacy_mutasi',
            'gdg_barang_kemasan',
            'gdg_barang',
            'gdg_nomor_seq',
        ]

        with connection.cursor() as cursor:
            # Nonaktifkan foreign key checks sementara untuk reset tabel
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
            try:
                for table in tables_to_clear:
                    cursor.execute(f"TRUNCATE TABLE `{table}`;")
                    self.stdout.write(f"  [OK] Tabel `{table}` berhasil dikosongkan.")

                # Bersihkan juga record uji coba (TEST / DIST / OPN) dari master lookup
                cursor.execute("DELETE FROM gdg_gudang WHERE kode LIKE '%TEST%' OR kode LIKE '%DIST%' OR kode LIKE '%OPN%';")
                cursor.execute("DELETE FROM gdg_golongan WHERE kode LIKE '%TEST%' OR kode LIKE '%DIST%' OR kode LIKE '%OPN%';")
                cursor.execute("DELETE FROM gdg_satuan WHERE kode LIKE '%TEST%' OR kode LIKE '%DIST%' OR kode LIKE '%OPN%';")
                cursor.execute("DELETE FROM gdg_ruang WHERE kode LIKE '%TEST%' OR kode LIKE '%DIST%' OR kode LIKE '%OPN%';")
            finally:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

        # Verifikasi data yang dipertahankan
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM gdg_gudang;")
            count_gudang = cursor.fetchone()[0]

            cursor.execute("SELECT count(*) FROM gdg_golongan;")
            count_golongan = cursor.fetchone()[0]

            cursor.execute("SELECT count(*) FROM gdg_satuan;")
            count_satuan = cursor.fetchone()[0]

            cursor.execute("SELECT count(*) FROM gdg_ruang;")
            count_ruang = cursor.fetchone()[0]

            cursor.execute("SELECT count(*) FROM gdg_barang;")
            count_barang = cursor.fetchone()[0]

        self.stdout.write(self.style.SUCCESS(
            "\n"
            "==========================================================\n"
            "RESET FRESH SELESAI 100%!\n"
            "==========================================================\n"
            f"Master Barang   : {count_barang} barang (KOSONG / FRESH 0)\n"
            f"Transaksi & Saldo: KOSONG / FRESH 0\n"
            f"Penomoran Urut  : DI-RESET KE 0 (Akan mulai dari 00001)\n"
            "----------------------------------------------------------\n"
            "Fondasi Standar yang Dipertahankan:\n"
            f"- Gudang Default: {count_gudang} gudang (GUDANG-UMUM)\n"
            f"- Golongan Baku : {count_golongan} golongan (B1 s/d B8)\n"
            f"- Satuan Standar: {count_satuan} satuan (PCS, BOX, RIM, dll.)\n"
            f"- Ruangan RS    : {count_ruang} ruangan aktif\n"
            "==========================================================\n"
        ))
