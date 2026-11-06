from django.core.management.base import BaseCommand
from gudang.models import Gudang, GolonganBarang, Satuan


class Command(BaseCommand):
    help = 'Seed master data awal (Gudang, GolonganBarang, Satuan baku)'

    def handle(self, *args, **options):
        self.stdout.write("Seeding master data gudang...")

        # 1. Gudang Default
        gudang, created = Gudang.objects.get_or_create(
            kode='GUDANG-UMUM',
            defaults={
                'nama': 'Gudang Logistik Umum',
                'is_default': True,
                'is_active': True,
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  + Gudang dibuat: {gudang}"))
        else:
            self.stdout.write(f"  = Gudang sudah ada: {gudang}")

        # 2. Golongan Barang (B1 - B8)
        golongan_list = [
            ('B1', 'ATK (Alat Tulis Kantor)', 'B1'),
            ('B2', 'BHP Kantor & Cetakan', 'B2'),
            ('B3', 'Alat Listrik & Rumah Tangga', 'B3'),
            ('B4', 'BHP Housekeeping & Kebersihan', 'B4'),
            ('B5', 'Material & Suku Cadang', 'B5'),
            ('B6', 'Bangunan & Fasilitas', 'B6'),
            ('B7', 'Tekstil & Seragam', 'B7'),
            ('B8', 'Lain-lain', 'B8'),
        ]
        for kode, nama, prefix in golongan_list:
            gol, created = GolonganBarang.objects.get_or_create(
                kode=kode,
                defaults={'nama': nama, 'prefix_kode': prefix, 'is_active': True}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"  + Golongan dibuat: {gol}"))

        # 3. Satuan Baku
        satuan_list = [
            ('PCS', 'Pieces / Satuan Terkecil'),
            ('BOX', 'Kotak / Box'),
            ('RIM', 'Rim (500 Lembar)'),
            ('PAK', 'Pak / Bungkus'),
            ('ROLL', 'Roll / Gulung'),
            ('BOTOL', 'Botol'),
            ('LITER', 'Liter'),
            ('KG', 'Kilogram'),
            ('METER', 'Meter'),
            ('LEMBAR', 'Lembar'),
            ('SET', 'Set'),
            ('UNIT', 'Unit'),
            ('KALENG', 'Kaleng'),
            ('BUKU', 'Buku'),
            ('MAP', 'Map Dokumen'),
            ('GELAS', 'Gelas'),
            ('ZAK', 'Zak / Karung'),
            ('SACHET', 'Sachet'),
            ('PASANG', 'Pasang'),
            ('LUSIN', 'Lusin (12 Pcs)'),
            ('BUAH', 'Buah'),
        ]
        for kode, nama in satuan_list:
            sat, created = Satuan.objects.get_or_create(
                kode=kode,
                defaults={'nama': nama, 'is_active': True}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"  + Satuan dibuat: {sat}"))

        self.stdout.write(self.style.SUCCESS("Selesai seeding master data gudang."))

