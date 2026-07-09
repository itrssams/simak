from keuangan.models import PembayaranUtang, UtangSupplier
print("Total PembayaranUtang:", PembayaranUtang.objects.count())
print("Total UtangSupplier:", UtangSupplier.objects.count())
if UtangSupplier.objects.exists():
    utang = UtangSupplier.objects.first()
    print(f"\nUtang ID: {utang.id}")
    print(f"Pembayaran untuk utang ini: {utang.pembayaran.count()}")
    for p in utang.pembayaran.all():
        print(f"  - {p.tanggal_proses}: {p.jumlah_bayar}")
