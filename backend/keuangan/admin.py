from django.contrib import admin
from .models import Akun, Transaksi
from .models import (
    RekeningBank, RiwayatSaldoRekening
)

@admin.register(Akun)
class AkunAdmin(admin.ModelAdmin):
    list_display  = ['kode_akun', 'nama_akun', 'tipe', 'saldo_normal', 'is_kas_setara', 'is_active']
    list_filter   = ['tipe', 'saldo_normal', 'is_kas_setara', 'is_active']
    search_fields = ['kode_akun', 'nama_akun']


@admin.register(Transaksi)
class TransaksiAdmin(admin.ModelAdmin):
    list_display   = ['tanggal', 'keterangan', 'jenis', 'kategori_arus', 'akun', 'jumlah', 'created_by']
    list_filter    = ['jenis', 'kategori_arus', 'tanggal']
    search_fields  = ['keterangan', 'nomor_referensi']
    date_hierarchy = 'tanggal'

@admin.register(RekeningBank)
class RekeningBankAdmin(admin.ModelAdmin):
    list_display = ['nama_rekening', 'bank', 'nomor_rekening', 'saldo', 'is_active', 'updated_at']

@admin.register(RiwayatSaldoRekening)
class RiwayatSaldoRekeningAdmin(admin.ModelAdmin):
    list_display = ['rekening', 'saldo_sebelum', 'saldo_sesudah', 'selisih', 'created_at']



















