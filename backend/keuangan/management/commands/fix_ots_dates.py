from django.core.management.base import BaseCommand
from django.db.models import F
from keuangan.models import PembayaranUtang

class Command(BaseCommand):
    help = 'Memperbaiki tanggal_proses dan tanggal_rencana_bayar yang salah pada riwayat OTS berdasarkan tanggal_app'

    def handle(self, *args, **options):
        # Cari pembayaran OTS yang tanggal prosesnya tidak sama dengan tanggal app
        qs = PembayaranUtang.objects.filter(
            keterangan__startswith='Realisasi Saldo Awal OTS'
        ).exclude(
            tanggal_proses=F('tanggal_app')
        )
        
        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("Tidak ada data OTS yang perlu diperbaiki. Semua tanggal sudah sinkron."))
            return
            
        self.stdout.write(f"Ditemukan {count} riwayat pembayaran OTS dengan tanggal yang tidak sinkron. Memperbaiki...")
        
        # Update bulk: samakan tanggal_proses dan tanggal_rencana dengan tanggal_app
        updated = qs.update(
            tanggal_proses=F('tanggal_app'), 
            tanggal_rencana_bayar=F('tanggal_app')
        )
        
        self.stdout.write(self.style.SUCCESS(f"Sukses! Berhasil memperbaiki {updated} riwayat pembayaran OTS!"))
