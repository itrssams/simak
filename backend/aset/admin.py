from django.contrib import admin
from .models import AsetKelompok, AsetKategori, AsetJenis, AsetRuangan, Aset, AsetRiwayat


@admin.register(AsetKelompok)
class AsetKelompokAdmin(admin.ModelAdmin):
    list_display = ('kode', 'nama', 'masa_manfaat_tahun', 'masa_manfaat_bulan', 'tarif_garis_lurus', 'disusutkan')


@admin.register(AsetKategori)
class AsetKategoriAdmin(admin.ModelAdmin):
    list_display = ('kode', 'nama', 'sort_order')


@admin.register(AsetJenis)
class AsetJenisAdmin(admin.ModelAdmin):
    list_display = ('kode', 'nama', 'kategori', 'kelompok_default')
    list_filter = ('kategori', 'kelompok_default')
    search_fields = ('kode', 'nama')


@admin.register(AsetRuangan)
class AsetRuanganAdmin(admin.ModelAdmin):
    list_display = ('nama', 'unit', 'lantai_gedung', 'is_active')
    list_filter = ('unit', 'is_active')
    search_fields = ('nama', 'unit__nama')


@admin.register(Aset)
class AsetAdmin(admin.ModelAdmin):
    list_display = ('kode_aset', 'deskripsi', 'merk', 'unit', 'ruangan', 'status_kelayakan', 'status_aset', 'status_data', 'harga_perolehan')
    list_filter = ('status_kelayakan', 'status_aset', 'status_data', 'unit', 'jenis__kategori')
    search_fields = ('kode_aset', 'deskripsi', 'merk', 'spesifikasi', 'nomor_seri', 'lokasi_teks')


@admin.register(AsetRiwayat)
class AsetRiwayatAdmin(admin.ModelAdmin):
    list_display = ('aset', 'aksi', 'status_kelayakan_lama', 'status_kelayakan_baru', 'dilakukan_oleh', 'created_at')
    list_filter = ('aksi', 'created_at')
    search_fields = ('aset__kode_aset', 'catatan')

