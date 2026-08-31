from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum, Count
from keuangan.models import Faktur, PembayaranFaktur, AlokasiDana, AlokasiDanaPemakaian


class Command(BaseCommand):
    help = (
        'Reset seluruh Alokasi Pembiayaan dan batalkan/hapus pembayaran piutang SIMAK '
        '(KECUALI pembayaran hasil migrasi app_siaga).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--commit',
            action='store_true',
            help='Eksekusi perubahan secara permanen ke database. Tanpa flag ini, perintah berjalan dalam mode DRY-RUN.',
        )

    def handle(self, *args, **options):
        is_commit = options['commit']
        mode_label = '🚀 COMMIT (EKSEKUSI NYATA)' if is_commit else '🔍 DRY-RUN (SIMULASI - TANPA PERUBAHAN DB)'

        self.stdout.write(self.style.WARNING(f'\n{"="*70}'))
        self.stdout.write(self.style.WARNING(f' MODE: {mode_label}'))
        self.stdout.write(self.style.WARNING(f'{"="*70}\n'))

        # 1. Alokasi Dana & Pemakaian
        total_alokasi_dana = AlokasiDana.objects.count()
        sum_alokasi_dana = AlokasiDana.objects.aggregate(t=Sum('jumlah_penerimaan'))['t'] or Decimal('0')
        total_pemakaian_alokasi = AlokasiDanaPemakaian.objects.count()

        # 2. Pembayaran Faktur
        app_siaga_keterangan = 'Payment from app_siaga migration'
        pembayaran_app_siaga_qs = PembayaranFaktur.objects.filter(keterangan=app_siaga_keterangan)
        pembayaran_simak_qs = PembayaranFaktur.objects.exclude(keterangan=app_siaga_keterangan)

        total_pembayaran_app_siaga = pembayaran_app_siaga_qs.count()
        sum_pembayaran_app_siaga = pembayaran_app_siaga_qs.aggregate(t=Sum('jumlah'))['t'] or Decimal('0')

        total_pembayaran_simak = pembayaran_simak_qs.count()
        sum_pembayaran_simak = pembayaran_simak_qs.aggregate(t=Sum('jumlah'))['t'] or Decimal('0')
        simak_by_status = list(pembayaran_simak_qs.values('status_verifikasi').annotate(c=Count('id')))

        # 3. Faktur yang terdampak
        affected_faktur_ids = list(pembayaran_simak_qs.values_list('faktur_id', flat=True).distinct())
        total_faktur_terdampak = len(affected_faktur_ids)

        faktur_before_status = list(
            Faktur.objects.filter(id__in=affected_faktur_ids)
            .values('status')
            .annotate(c=Count('id'))
        )

        self.stdout.write('📊 RINGKASAN DATA YANG AKAN DI-ROLLBACK:\n')
        self.stdout.write(f'  1. Alokasi Dana:')
        self.stdout.write(f'     - Total data Alokasi Dana dihapus : {total_alokasi_dana:,} baris (Rp {sum_alokasi_dana:,.2f})')
        self.stdout.write(f'     - Total relasi Pemakaian dihapus   : {total_pemakaian_alokasi:,} baris')

        self.stdout.write(f'\n  2. Pembayaran Faktur / Piutang:')
        self.stdout.write(f'     - Pembayaran SIMAK yang DIHAPUS   : {total_pembayaran_simak:,} baris (Rp {sum_pembayaran_simak:,.2f})')
        for s in simak_by_status:
            self.stdout.write(f'       • Status {s["status_verifikasi"]:<15}: {s["c"]:,} baris')
        self.stdout.write(self.style.SUCCESS(
            f'     - Pembayaran APP_SIAGA DIJAGA/AMAN: {total_pembayaran_app_siaga:,} baris (Rp {sum_pembayaran_app_siaga:,.2f})'
        ))

        self.stdout.write(f'\n  3. Faktur / Invoice Piutang:')
        self.stdout.write(f'     - Jumlah Faktur terdampak         : {total_faktur_terdampak:,} faktur')
        self.stdout.write(f'     - Status Faktur saat ini          : {faktur_before_status}')

        if not is_commit:
            self.stdout.write(self.style.NOTICE(
                f'\n⚠️  Ini adalah simulasi (DRY-RUN). Database belum diubah.'
                f'\n👉 Untuk mengeksekusi secara permanen, jalankan:'
                f'\n   python manage.py reset_alokasi_dan_pembayaran_piutang --commit\n'
            ))
            return

        # EKSEKUSI NYATA DALAM TRANSACTION ATOMIC
        self.stdout.write(self.style.WARNING('\n⏳ Memulai eksekusi rollback...'))
        with transaction.atomic():
            # Hapus pemakaian alokasi
            deleted_pemakaian, _ = AlokasiDanaPemakaian.objects.all().delete()
            self.stdout.write(f'  ✓ Berhasil menghapus {deleted_pemakaian} baris AlokasiDanaPemakaian.')

            # Hapus alokasi dana
            deleted_alokasi, _ = AlokasiDana.objects.all().delete()
            self.stdout.write(f'  ✓ Berhasil menghapus {deleted_alokasi} baris AlokasiDana.')

            # Hapus pembayaran SIMAK
            deleted_pembayaran, _ = PembayaranFaktur.objects.exclude(keterangan=app_siaga_keterangan).delete()
            self.stdout.write(f'  ✓ Berhasil menghapus {deleted_pembayaran} baris PembayaranFaktur SIMAK.')

            # Recalculate status faktur
            self.stdout.write('  ⏳ Menghitung ulang status faktur piutang...')
            updated_count = 0
            for faktur in Faktur.objects.filter(id__in=affected_faktur_ids):
                # Total dibayar dari verified SIMAK sekarang 0
                faktur.total_dibayar = faktur._get_verified_total_dibayar()
                faktur.save()
                updated_count += 1

            self.stdout.write(f'  ✓ Berhasil memperbarui {updated_count:,} faktur.')

        faktur_after_status = list(
            Faktur.objects.filter(id__in=affected_faktur_ids)
            .values('status')
            .annotate(c=Count('id'))
        )
        self.stdout.write(f'\n  Status Faktur setelah rollback : {faktur_after_status}')
        self.stdout.write(self.style.SUCCESS(f'\n{"="*70}'))
        self.stdout.write(self.style.SUCCESS(' ✅ ROLLBACK PENAGIHAN & ALOKASI BERHASIL DILAKUKAN SECARA SEMPURNA!'))
        self.stdout.write(self.style.SUCCESS(f'{"="*70}\n'))
