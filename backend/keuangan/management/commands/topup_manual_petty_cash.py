from datetime import date, datetime, time
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from keuangan.models import (
    SaldoPettyCash,
    RiwayatSaldoPettyCash,
    PengajuanPenambahanSaldo,
    UtangSupplier,
    PembayaranUtang,
)


BATCH_1_NOS = {
    'PC-202610-001', 'PC-202610-003', 'PC-202610-004', 'PC-202610-005',
    'PC-202610-006', 'PC-202610-007', 'PC-202610-010', 'PC-202610-011',
    'PC-202610-012', 'PC-202610-014', 'PC-202610-015', 'PC-202610-016',
    'PC-202610-017',
}

BATCH_2_NOS = {
    'PC-202610-002', 'PC-202610-008', 'PC-202610-009', 'PC-202610-013',
    'PC-202610-018', 'PC-202610-019', 'PC-202610-020', 'PC-202610-021',
    'PC-202610-022', 'PC-202610-024', 'PC-202610-025', 'PC-202610-026',
}

BATCH_3_NOS = {
    'PC-202610-027', 'PC-202610-028', 'PC-202610-029', 'PC-202610-030',
    'PC-202610-031', 'PC-202610-032', 'PC-202610-034', 'PC-202610-035',
    'PC-202610-036', 'PC-202611-002', 'PC-202611-003', 'PC-202611-005',
}

MANUAL_TOPUPS = [
    {
        'no_pengajuan': 'PPC-202610-002',
        'tanggal': date(2026, 10, 21),
        'nominal': Decimal('4476500.00'),
        'saldo_sebelum': Decimal('523500.00'),
        'saldo_sesudah': Decimal('5000000.00'),
        'alasan': 'Pengisian kembali saldo Petty Cash Periode 14 - 21 Oktober 2026 (Sisa Rp 523.500)',
        'keterangan': 'Penambahan saldo Petty Cash manual 21 Oktober 2026 sebesar Rp 4.476.500 (sebelumnya sisa Rp 523.500)',
    },
    {
        'no_pengajuan': 'PPC-202610-003',
        'tanggal': date(2026, 10, 23),
        'nominal': Decimal('4314485.00'),
        'saldo_sebelum': Decimal('685515.00'),
        'saldo_sesudah': Decimal('5000000.00'),
        'alasan': 'Pengisian kembali saldo Petty Cash Periode 22 - 23 Oktober 2026 (Sisa Rp 685.515)',
        'keterangan': 'Penambahan saldo Petty Cash manual 23 Oktober 2026 sebesar Rp 4.314.485 (sebelumnya sisa Rp 685.515)',
    },
    {
        'no_pengajuan': 'PPC-202611-001',
        'tanggal': date(2026, 11, 3),
        'nominal': Decimal('4815936.00'),
        'saldo_sebelum': Decimal('184064.00'),
        'saldo_sesudah': Decimal('5000000.00'),
        'alasan': 'Pengisian kembali saldo Petty Cash Periode 26 Oktober - 03 November 2026 (Sisa Rp 184.064)',
        'keterangan': 'Penambahan saldo Petty Cash manual 03 November 2026 sebesar Rp 4.815.936 (sebelumnya sisa Rp 184.064)',
    },
]


def get_historical_batch_datetime(no_pengajuan: str):
    """
    Kembalikan datetime historis (pukul 12:00 WITA) jika nomor pengajuan Petty Cash
    termasuk dalam 3 batch top-up manual (21 Okt, 23 Okt, 3 Nov 2026) agar masuk
    ke siklus Top-Up yang sesuai pada rekap riwayat saldo.
    """
    tz = timezone.get_current_timezone()
    if no_pengajuan in BATCH_1_NOS:
        return timezone.make_aware(datetime.combine(date(2026, 10, 21), time(12, 0, 0)), tz)
    if no_pengajuan in BATCH_2_NOS:
        return timezone.make_aware(datetime.combine(date(2026, 10, 23), time(12, 0, 0)), tz)
    if no_pengajuan in BATCH_3_NOS:
        return timezone.make_aware(datetime.combine(date(2026, 11, 3), time(12, 0, 0)), tz)
    return None


class Command(BaseCommand):
    help = 'Mencatat 3 penambahan saldo (top-up) Petty Cash manual (21 Okt, 23 Okt, 3 Nov 2026) beserta sinkronisasi siklus.'

    def handle(self, *args, **options):
        User = get_user_model()
        tz = timezone.get_current_timezone()

        kasir_user = (
            User.objects.filter(username='ulfa').first()
            or User.objects.filter(id=12).first()
            or User.objects.filter(is_superuser=True).first()
        )
        wadir_user = (
            User.objects.filter(username='nevi').first()
            or User.objects.filter(id=2).first()
            or kasir_user
        )
        keuangan_user = (
            User.objects.filter(username='evi').first()
            or User.objects.filter(id=7).first()
            or kasir_user
        )

        kasir_display = kasir_user.get_full_name() or kasir_user.username if kasir_user else 'Kasir'

        with transaction.atomic():
            saldo_obj, _ = SaldoPettyCash.objects.get_or_create(pk=1, defaults={'saldo': Decimal('5000000.00')})
            total_added = Decimal('0.00')

            for item in MANUAL_TOPUPS:
                tgl = item['tanggal']
                nominal = item['nominal']
                no_ppc = item['no_pengajuan']
                topup_dt = timezone.make_aware(datetime.combine(tgl, time(23, 59, 0)), tz)

                # 1. PengajuanPenambahanSaldo
                ps = PengajuanPenambahanSaldo.objects.filter(
                    tanggal=tgl, nominal_diajukan=nominal
                ).first() or PengajuanPenambahanSaldo.objects.filter(no_pengajuan=no_ppc).first()

                if not ps:
                    ps = PengajuanPenambahanSaldo(
                        no_pengajuan=no_ppc,
                        tanggal=tgl,
                        alasan=item['alasan'],
                        keterangan=item['keterangan'],
                        nominal_diajukan=nominal,
                        status='disetujui',
                        created_by=kasir_user,
                        diproses_oleh=wadir_user,
                    )
                    ps.save()
                    PengajuanPenambahanSaldo.objects.filter(pk=ps.pk).update(
                        created_at=topup_dt,
                        updated_at=topup_dt,
                    )
                    self.stdout.write(self.style.SUCCESS(f'[+] PengajuanPenambahanSaldo dibuat: {ps.no_pengajuan} ({tgl}) - Rp {nominal:,.0f}'))
                else:
                    self.stdout.write(f'[=] PengajuanPenambahanSaldo sudah ada: {ps.no_pengajuan} ({tgl}) - Rp {nominal:,.0f}')

                # 2. UtangSupplier & PembayaranUtang (agar tidak menggantung di antrean Menunggu Verifikasi)
                faktur_id = f'KEU-{ps.id}'
                utang = UtangSupplier.objects.filter(app_siaga_faktur_id=faktur_id).first()
                if not utang:
                    utang = UtangSupplier.objects.create(
                        app_siaga_faktur_id=faktur_id,
                        sumber=UtangSupplier.SUMBER_KEUANGAN,
                        nomor_spb=ps.no_pengajuan,
                        tanggal_spb=tgl,
                        nomor_faktur=ps.alasan,
                        vendor_id=0,
                        vendor_nama=f'Petty Cash - {kasir_display}',
                        kategori='PENGISIAN PETTY CASH',
                        tanggal_faktur=tgl,
                        tanggal_jatuh_tempo=tgl,
                        nominal=nominal,
                        tanggal_titip=tgl,
                        keterangan_titip=ps.alasan,
                        status=UtangSupplier.STATUS_LUNAS,
                        verified_by=keuangan_user,
                        verified_at=topup_dt,
                    )
                    UtangSupplier.objects.filter(pk=utang.pk).update(
                        created_at=topup_dt,
                        updated_at=topup_dt,
                    )

                if not PembayaranUtang.objects.filter(utang=utang).exists():
                    pb = PembayaranUtang.objects.create(
                        utang=utang,
                        tanggal_rencana_bayar=tgl,
                        tanggal_proses=tgl,
                        tanggal_app=tgl,
                        jumlah_bayar=nominal,
                        potongan_deposit=Decimal('0.00'),
                        jumlah_kas_keluar=nominal,
                        keterangan=f'Pembayaran PENGISIAN PETTY CASH {ps.alasan}',
                        status='realisasi_lunas',
                        created_by=keuangan_user,
                    )
                    PembayaranUtang.objects.filter(pk=pb.pk).update(created_at=topup_dt)

                # 3. RiwayatSaldoPettyCash (jenis='penambahan')
                riwayat = RiwayatSaldoPettyCash.objects.filter(
                    jenis='penambahan',
                    jumlah=nominal,
                ).first()

                ket_riwayat = f'Pencairan pengisian saldo kas kecil ({ps.no_pengajuan}) - {ps.alasan}'
                if not riwayat:
                    riwayat = RiwayatSaldoPettyCash.objects.create(
                        jenis='penambahan',
                        jumlah=nominal,
                        saldo_sebelum=item['saldo_sebelum'],
                        saldo_sesudah=item['saldo_sesudah'],
                        keterangan=ket_riwayat,
                        created_by=keuangan_user,
                        nama_pengaju=f'Petty Cash - {kasir_display}',
                        unit_pengaju='Keuangan / Kasir Kas Kecil',
                    )
                    RiwayatSaldoPettyCash.objects.filter(pk=riwayat.pk).update(created_at=topup_dt)
                    total_added += nominal
                    self.stdout.write(self.style.SUCCESS(
                        f'[+] RiwayatSaldoPettyCash ditambahkan: {tgl} +Rp {nominal:,.0f} '
                        f'(Saldo Sebelum: Rp {item["saldo_sebelum"]:,.0f} -> Sesudah: Rp {item["saldo_sesudah"]:,.0f})'
                    ))
                else:
                    RiwayatSaldoPettyCash.objects.filter(pk=riwayat.pk).update(
                        saldo_sebelum=item['saldo_sebelum'],
                        saldo_sesudah=item['saldo_sesudah'],
                        keterangan=ket_riwayat,
                        created_at=topup_dt,
                    )
                    self.stdout.write(f'[=] RiwayatSaldoPettyCash sudah ada & disinkronkan: {tgl} +Rp {nominal:,.0f}')

            # 4. Sinkronkan tanggal mutasi pengurangan yang sudah terlanjur dikonfirmasi (jika ada)
            all_historical_nos = BATCH_1_NOS | BATCH_2_NOS | BATCH_3_NOS
            for r_out in RiwayatSaldoPettyCash.objects.filter(jenis='pengurangan'):
                for no_pc in all_historical_nos:
                    if no_pc in (r_out.keterangan or ''):
                        target_dt = get_historical_batch_datetime(no_pc)
                        if target_dt and r_out.created_at != target_dt:
                            RiwayatSaldoPettyCash.objects.filter(pk=r_out.pk).update(created_at=target_dt)
                        break

            # 5. Update SaldoPettyCash.saldo
            if total_added > 0:
                saldo_sebelum_update = saldo_obj.saldo
                saldo_obj.saldo += total_added
                saldo_obj.updated_by = keuangan_user
                saldo_obj.save()
                self.stdout.write(self.style.SUCCESS(
                    f'[+] SaldoPettyCash diperbarui: Rp {saldo_sebelum_update:,.0f} + Rp {total_added:,.0f} = Rp {saldo_obj.saldo:,.0f}'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'[=] Tidak ada penambahan baru. SaldoPettyCash saat ini: Rp {saldo_obj.saldo:,.0f}'
                ))
