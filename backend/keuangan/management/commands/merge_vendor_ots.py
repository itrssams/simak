from django.core.management.base import BaseCommand
from django.db import connection, transaction
from keuangan.models import UtangSupplier, DepositVendor

# Explicit Mapping Table: (Target ID Master SIMRS, Source ID Duplicate OTS/Varian)
VENDOR_MERGE_MAPPING = [
    (3, 156, "ANUGERAH PHARMINDO LESTARI"),
    (44, 157, "ANUGRAH ARGON MEDICA"),
    (10, 158, "PT. BINA SAN PRIMA"),
    (21, 192, "RAJAWALI NUSINDO"),
    (5, 185, "MERAPI UTAMA PHARMA"),
    (15, 178, "KIMIA FARMA"),
    (13, 169, "ENSEVAL PUTERA MEGATRADING"),
    (46, 196, "PT. SUMBER REJEKI MEDIKA JAYA"),
    (19, 155, "ANTAR MITRA SEMBADA"),
    (7, 187, "MILLENIUM PHARMACON INTERNATIONAL"),
    (115, 195, "STARINDO MULTI SUKSES"),
    (42, 170, "FERTOMULIA PRATAMA"),
    (60, 221, "CV. SUKSES KALTIM"),
    (77, 171, "PT. GLOPER PRIMA MANDIRI"),
    (33, 197, "TEMPO. PT"),
    (2, 175, "INDOFARMA GLOBAL MEDIKA"),
    (12, 190, "PT. PENTA VALENT"),
    (49, 188, "PT. MIRACHEN IN ACI"),
    (82, 154, "PT. ALJOEN MAKMUR ABADI"),
    (52, 189, "PT. MURINDO MULTI SARANA"),
    (141, 200, "PT. YASA MAHKOTA MULIA"),
    (38, 199, "PT. UNITED DICO CITAS"),
    (149, 186, "PT. METTA KARYA HUTAMA"),
    (48, 164, "PT. COBRA DENTAL INDONESIA"),
    (26, 184, "MENSA BINA SUKSES"),
    (145, 176, "PT INDOMEDIKA SOLUSINDO"),
    (76, 153, "PT. ALEXA MEDIKA"),
    (130, 174, "PT.HYGEA SUMBER BINTANG"),
    (132, 167, "PT. EDY HARI SYAM"),
    (30, 193, "PT. SAPTA SARI TAMA"),
    (148, 162, "CAHAYA SINTESA FARMA"),
    (14, 165, "PT DAVIKA SEHAT SENTOSA"),
    (119, 168, "ENDO INDONESIA"),
    (131, 198, "TIGA PUTRA SUKSES ALKESINDO"),
    (118, 161, "CAB DENTAL"),
    (150, 179, "PT LAWSIM ZECHA"),
    (151, 166, "PT DEMAZ NOER ABADI"),
    (62, 63, "CV. BINA INSANI MANDIRI"),
]

class Command(BaseCommand):
    help = "Konsolidasi / Merge data vendor duplikat dari import OTS ke master rekanan SIMRS"

    def add_arguments(self, parser):
        parser.add_argument(
            '--commit',
            action='store_true',
            help='Eksekusi permanen ke database. Tanpa argumen ini, command hanya berjalan dalam mode simulasi (--dry-run).'
        )

    def handle(self, *args, **options):
        is_commit = options['commit']

        self.stdout.write(self.style.WARNING("=" * 80))
        if is_commit:
            self.stdout.write(self.style.SUCCESS("  [MODE EKSEKUSI / COMMIT AKTIF] - Perubahan AKAN disimpan ke database."))
        else:
            self.stdout.write(self.style.NOTICE("  [MODE SIMULASI / DRY-RUN] - Database TIDAK akan diubah."))
            self.stdout.write(self.style.NOTICE("  Tambahkan argumen --commit untuk melakukan eksekusi nyata."))
        self.stdout.write(self.style.WARNING("=" * 80 + "\n"))

        total_utang_migrated = 0
        total_deposit_migrated = 0
        total_rekanan_disabled = 0

        # Ambil nama master dari database agar akurat
        with connection.cursor() as cursor:
            cursor.execute("SELECT id_rekanan, nama FROM rssams.rekanan")
            rekanan_map = dict(cursor.fetchall())

        with transaction.atomic():
            for target_id, source_id, fallback_target_name in VENDOR_MERGE_MAPPING:
                target_name = rekanan_map.get(target_id, fallback_target_name)
                source_name = rekanan_map.get(source_id, f"ID {source_id}")

                # Cek jumlah faktur utang yang terkait source_id
                utang_qs = UtangSupplier.objects.filter(vendor_id=source_id)
                utang_count = utang_qs.count()

                # Cek deposit vendor yang terkait source_id
                deposit_qs = DepositVendor.objects.filter(vendor_id=source_id)
                deposit_count = deposit_qs.count()

                if is_commit:
                    if utang_count > 0:
                        utang_qs.update(vendor_id=target_id, vendor_nama=target_name)
                    if deposit_count > 0:
                        deposit_qs.update(vendor_id=target_id, vendor_nama=target_name)
                    
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE rssams.rekanan SET del = 'Y' WHERE id_rekanan = %s", [source_id])

                total_utang_migrated += utang_count
                total_deposit_migrated += deposit_count
                total_rekanan_disabled += 1

                self.stdout.write(
                    f"• Merge ID {source_id:3d} ('{source_name}') ➔ ID {target_id:3d} ('{target_name}'): "
                    f"{utang_count:4d} faktur utang, {deposit_count} deposit"
                )

            if not is_commit:
                # Force rollback in dry-run just in case
                transaction.set_rollback(True)

        self.stdout.write("\n" + self.style.WARNING("=" * 80))
        self.stdout.write(self.style.SUCCESS(f"  TOTAL REKAPITULASI:"))
        self.stdout.write(f"  - Total Faktur Utang Dialihkan : {total_utang_migrated:,} faktur")
        self.stdout.write(f"  - Total Deposit Dialihkan      : {total_deposit_migrated:,} deposit")
        self.stdout.write(f"  - Total Rekanan Di-nonaktifkan : {total_rekanan_disabled:,} rekanan (del='Y')")
        self.stdout.write(self.style.WARNING("=" * 80))

        if not is_commit:
            self.stdout.write(self.style.NOTICE("\n💡 Untuk menerapkan perubahan ini ke database secara permanen, jalankan:"))
            self.stdout.write(self.style.SUCCESS("   python manage.py merge_vendor_ots --commit\n"))
