from django.core.management.base import BaseCommand
from django.db import connection, transaction
from gudang.models import Ruang
from users.models import Unit


class Command(BaseCommand):
    help = 'Impor daftar ruangan dari rssams.kode_ruang ke gdg_ruang'

    def handle(self, *args, **options):
        self.stdout.write("Memulai impor ruangan...")

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id_ruang, ruangan, leveluser
                FROM rssams.kode_ruang
                ORDER BY id_ruang
            """)
            rows = cursor.fetchall()

        created_count = 0
        updated_count = 0

        with transaction.atomic():
            for r in rows:
                id_ruang, nama, leveluser = r
                clean_nama = str(nama or '').strip()
                if not clean_nama:
                    continue

                kode = f"R-{id_ruang:03d}"
                # Try finding matching unit in users.Unit by name similarity
                matched_unit = Unit.objects.filter(nama__icontains=clean_nama).first()

                obj, created = Ruang.objects.update_or_create(
                    legacy_id_ruang=id_ruang,
                    defaults={
                        'kode': kode,
                        'nama': clean_nama,
                        'unit': matched_unit,
                        'is_active': True,
                    }
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Selesai! {created_count} ruang baru dibuat, {updated_count} diperbarui."
        ))

