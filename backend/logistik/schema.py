"""
Skema tambahan workflow approval Logistik pada tabel legacy `rssams.*`.

Tabel-tabel ini dipakai bersama aplikasi SIMRS lama, jadi perubahan dibuat
aditif saja: hanya ADD COLUMN dengan DEFAULT yang mempertahankan perilaku lama.

- tran_beli_brg_log.approval_status DEFAULT 'Disetujui'
    Baris lama / baris yang dibuat aplikasi SIMRS lama (tanpa kolom ini) otomatis
    dianggap sudah disetujui sehingga stoknya tetap terhitung seperti sebelumnya.
    Hanya penerimaan yang dibuat lewat workflow baru yang diawali 'Draft'.
- tran_beli_brg_log.kirim_keuangan DEFAULT 'Y'
    Baris lama tetap muncul di antrean Catatan Utang. Penerimaan workflow baru
    ditandai 'N' sehingga tidak masuk Catatan Utang.

Modul ini sengaja tidak mengimpor views apa pun (hindari circular import dengan
keuangan.views).
"""
import logging

from django.db import connection

logger = logging.getLogger(__name__)

WORKFLOW_COLUMNS = {
    'logistik_spb': [
        ('catatan_tolak', 'TEXT NULL'),
        ('submitted_at', 'DATETIME NULL'),
        ('approved_by', 'INT NULL'),
        ('approved_by_name', 'VARCHAR(150) NULL'),
        ('approved_at', 'DATETIME NULL'),
        ('alasan_batal', 'TEXT NULL'),
        ('dibatalkan_at', 'DATETIME NULL'),
        ('created_by', 'INT NULL'),
        ('created_by_name', 'VARCHAR(150) NULL'),
    ],
    'tran_beli_brg_log': [
        ('approval_status', "VARCHAR(20) NOT NULL DEFAULT 'Disetujui'"),
        ('kirim_keuangan', "CHAR(1) NOT NULL DEFAULT 'Y'"),
        ('catatan_tolak', 'TEXT NULL'),
        ('submitted_at', 'DATETIME NULL'),
        ('approved_by', 'INT NULL'),
        ('approved_by_name', 'VARCHAR(150) NULL'),
        ('approved_at', 'DATETIME NULL'),
        ('created_by', 'INT NULL'),
        ('created_by_name', 'VARCHAR(150) NULL'),
    ],
}

_ready = False


def _existing_columns(cursor, table):
    cursor.execute(f'SHOW COLUMNS FROM rssams.{table}')
    return {row[0].lower() for row in cursor.fetchall()}


def ensure_workflow_schema():
    """
    Pastikan kolom workflow ada. Idempotent dan di-cache setelah sukses.

    Return True bila semua kolom siap, False bila gagal. Tidak pernah melempar
    exception: pemanggil dari modul lain (mis. Keuangan) harus tetap berjalan
    walau DDL gagal, dan memakai return value untuk memutuskan fallback.
    """
    global _ready
    if _ready:
        return True
    try:
        with connection.cursor() as cursor:
            # Tabel legacy rssams mungkin memiliki data tanggal '0000-00-00'.
            # Relaksasi sql_mode sesi agar ALTER TABLE tidak ditolak oleh NO_ZERO_DATE / STRICT_TRANS_TABLES.
            cursor.execute("SELECT @@SESSION.sql_mode")
            orig_mode_row = cursor.fetchone()
            orig_mode = orig_mode_row[0] if orig_mode_row else ''
            try:
                cursor.execute("SET SESSION sql_mode = ''")
                for table, columns in WORKFLOW_COLUMNS.items():
                    existing = _existing_columns(cursor, table)
                    for name, ddl in columns:
                        if name in existing:
                            continue
                        try:
                            cursor.execute(f'ALTER TABLE rssams.{table} ADD COLUMN {name} {ddl}')
                        except Exception as exc:  # balapan antar worker: kolom sudah dibuat
                            if 'duplicate column' not in str(exc).lower():
                                raise
            finally:
                if orig_mode:
                    try:
                        cursor.execute("SET SESSION sql_mode = %s", [orig_mode])
                    except Exception:
                        pass

            # Verifikasi akhir: jangan cache keberhasilan sebelum benar-benar ada.
            for table, columns in WORKFLOW_COLUMNS.items():
                existing = _existing_columns(cursor, table)
                missing = [name for name, _ in columns if name not in existing]
                if missing:
                    logger.error('Kolom workflow logistik belum lengkap di %s: %s', table, missing)
                    return False
    except Exception:
        logger.exception('Gagal memastikan skema workflow logistik')
        return False
    _ready = True
    return True
