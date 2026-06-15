#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from keuangan.models import Faktur

faktur = Faktur.objects.first()
if faktur:
    print(f"Faktur ID: {faktur.id}")
    print(f"Nomor: {faktur.nomor_faktur}")
    print(f"Pelanggan: {faktur.pelanggan}")
    print(f"Pelanggan nama: {faktur.pelanggan.nama if faktur.pelanggan else 'None'}")
    print(f"ID Pembiayaan: '{faktur.id_pembiayaan}'")
    print(f"Nama Pembiayaan: '{faktur.nama_pembiayaan}'")
    print(f"Jenis: '{faktur.jenis}'")
    print(f"Beban: '{faktur.beban}'")
    print(f"Periode: '{faktur.periode}'")
else:
    print("No Faktur found")
