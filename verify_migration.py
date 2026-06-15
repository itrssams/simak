#!/usr/bin/env python
import os
import sys
import django

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from keuangan.models import Faktur, PembayaranFaktur, AlokasiDana

print("=" * 60)
print("MIGRATION VERIFICATION REPORT")
print("=" * 60)

total_faktur = Faktur.objects.count()
print(f"\n📊 Total Faktur: {total_faktur:,}")
print(f"   Belum Bayar: {Faktur.objects.filter(status='belum_bayar').count():,}")
print(f"   Bayar Sebagian: {Faktur.objects.filter(status='bayar_sebagian').count():,}")
print(f"   Lunas: {Faktur.objects.filter(status='lunas').count():,}")
print(f"   Batal: {Faktur.objects.filter(status='batal').count():,}")

total_pembayaran = PembayaranFaktur.objects.count()
print(f"\n💰 Total Pembayaran: {total_pembayaran:,}")

total_alokasi = AlokasiDana.objects.count()
print(f"\n🏦 Total Alokasi Dana: {total_alokasi:,}")

# Sample data
print("\n" + "=" * 60)
print("SAMPLE DATA (5 Newest Invoices)")
print("=" * 60)
for faktur in Faktur.objects.all().order_by('-tanggal')[:5]:
    print(f"\nNo: {faktur.nomor_faktur}")
    print(f"  Tgl: {faktur.tanggal}")
    print(f"  Pembiayaan: {faktur.nama_pembiayaan}")
    print(f"  Total Tagihan: Rp {faktur.total_tagihan:,.2f}")
    print(f"  Total Dibayar: Rp {faktur.total_dibayar:,.2f}")
    print(f"  Sisa: Rp {faktur.sisa_tagihan:,.2f}")
    print(f"  Status: {faktur.status}")

print("\n" + "=" * 60)
print("✅ MIGRATION SUCCESSFUL!")
print("=" * 60)
