from django.contrib import admin
from .models import (
    Pegawai,
    Shift,
    JadwalMaster,
    JadwalKoreksi,
    JadwalDinas,
    TukarDinas,
    MesinAbsen,
    KaryawanMesinMapping,
    LogPresensi,
    PresensiHarian,
    IzinKeluar,
    IzinKeluarLog,
)


@admin.register(Pegawai)
class PegawaiAdmin(admin.ModelAdmin):
    list_display = ('pin', 'nama', 'unit_kerja', 'jabatan', 'kategori', 'is_active')
    list_filter = ('kategori', 'is_active', 'unit_kerja')
    search_fields = ('nama', 'pin', 'nik', 'unit_kerja')


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('kode', 'nama', 'kelompok', 'jam_masuk', 'jam_pulang', 'batas_tepat_waktu', 'toleransi_terlambat_menit', 'is_libur', 'is_active')
    list_filter = ('kelompok', 'is_libur', 'is_active')
    search_fields = ('kode', 'nama')


@admin.register(JadwalMaster)
class JadwalMasterAdmin(admin.ModelAdmin):
    list_display = ('tanggal', 'pegawai', 'shift', 'catatan', 'created_by')
    list_filter = ('tanggal', 'shift__kelompok')
    search_fields = ('pegawai__nama', 'pegawai__pin')


@admin.register(JadwalKoreksi)
class JadwalKoreksiAdmin(admin.ModelAdmin):
    list_display = ('tanggal', 'pegawai', 'shift', 'jenis', 'alasan', 'tukar', 'created_by')
    list_filter = ('jenis', 'tanggal', 'shift__kelompok')
    search_fields = ('pegawai__nama', 'pegawai__pin', 'alasan')


@admin.register(JadwalDinas)
class JadwalDinasAdmin(admin.ModelAdmin):
    list_display = ('tanggal', 'pegawai', 'shift', 'shift_master', 'sumber', 'catatan')
    list_filter = ('sumber', 'tanggal', 'shift__kelompok')
    search_fields = ('pegawai__nama', 'pegawai__pin')


@admin.register(TukarDinas)
class TukarDinasAdmin(admin.ModelAdmin):
    list_display = ('tanggal_pemohon', 'pemohon', 'shift_asal_pemohon', 'shift_tujuan_pemohon', 'pengganti', 'jenis', 'status')
    list_filter = ('status', 'jenis')
    search_fields = ('pemohon__nama', 'pengganti__nama', 'alasan')


admin.site.register(MesinAbsen)
admin.site.register(KaryawanMesinMapping)
admin.site.register(LogPresensi)
admin.site.register(PresensiHarian)
admin.site.register(IzinKeluar)
admin.site.register(IzinKeluarLog)

