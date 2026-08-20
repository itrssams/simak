-- Script ini harus dijalankan di database production (via phpMyAdmin atau command line MySQL)
-- SEBELUM menjalankan server Django yang baru (untuk menghindari error "Table doesn't exist")

-- Rename Tabel Modul Logistik
RENAME TABLE keuangan_logistikbarang TO logistik_barang;
RENAME TABLE keuangan_logistikbatch TO logistik_batch;
RENAME TABLE keuangan_logistikmutasi TO logistik_mutasi;
RENAME TABLE keuangan_logistikpermintaan TO logistik_permintaan;
RENAME TABLE keuangan_logistikopname TO logistik_opname;
RENAME TABLE keuangan_logistikpembelian TO logistik_logistikpembelian;

-- Rename Tabel Modul Driver
RENAME TABLE keuangan_kendaraan TO driver_kendaraan;
RENAME TABLE keuangan_logperjalanan TO driver_log_perjalanan;
RENAME TABLE keuangan_laporanperjalanan TO driver_laporan_perjalanan;
RENAME TABLE keuangan_fotolaporanperjalanan TO driver_foto_laporan;
RENAME TABLE keuangan_logbbm TO driver_log_bbm;
RENAME TABLE keuangan_logmaintenance TO driver_log_maintenance;

-- Rename Tabel Modul System
RENAME TABLE keuangan_auditlog TO system_audit_log;
RENAME TABLE keuangan_idempotencylog TO system_idempotency_log;
RENAME TABLE keuangan_announcement TO system_announcement;
RENAME TABLE keuangan_announcementread TO system_announcement_read;
