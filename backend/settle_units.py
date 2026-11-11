"""
Script to settle hospital operational units into users_unit and link gdg_ruang.
Can run against local database (via Django ORM) or remote PROD database (via MySQLdb).
"""
import os
import sys
from datetime import datetime

NEW_UNITS = [
    ('Rawat Inap', 'unit'),
    ('IGD', 'unit'),
    ('Kamar Bedah', 'unit'),
    ('Kebidanan', 'unit'),
    ('Rawat Jalan', 'unit'),
    ('Farmasi', 'unit'),
    ('Laboratorium', 'unit'),
    ('Radiologi', 'unit'),
    ('Fisioterapi', 'unit'),
    ('Gizi', 'unit'),
    ('Pendaftaran', 'unit'),
    ('Kasir', 'unit'),
    ('IPSRS', 'unit'),
    ('Keamanan', 'unit'),
    ('Kebersihan & Laundry', 'unit'),
    ('Driver', 'unit'),
    ('Kerohanian', 'unit'),
    ('Direksi', 'direksi'),
]

ROOM_TO_UNIT_MAP = {
    'R-001': 'Rawat Jalan',
    'R-002': 'Rawat Jalan',
    'R-003': 'Rawat Jalan',
    'R-004': 'Rawat Jalan',
    'R-005': 'Rawat Jalan',
    'R-006': 'Rawat Jalan',
    'R-007': 'Rawat Jalan',
    'R-008': 'Fisioterapi',
    'R-009': 'Rawat Jalan',
    'R-010': 'Rawat Jalan',
    'R-011': 'Rawat Jalan',
    'R-012': 'Rawat Jalan',
    'R-013': 'Rawat Jalan',
    'R-014': 'Fisioterapi',
    'R-015': 'Rawat Jalan',
    'R-016': 'IGD',
    'R-017': 'Rawat Inap',
    'R-018': 'Rawat Jalan',
    'R-019': 'Kebidanan',
    'R-020': 'Kamar Bedah',
    'R-021': 'Rawat Inap',
    'R-022': 'Rawat Jalan',
    'R-023': 'Rawat Jalan',
    'R-024': 'Rawat Jalan',
    'R-025': 'Rawat Jalan',
    'R-026': 'Rawat Jalan',
    'R-027': 'Rawat Jalan',
    'R-028': 'Rawat Jalan',
    'R-029': 'Rawat Jalan',
    'R-030': 'Gizi',
    'R-050': 'Kasir',
    'R-051': 'Laboratorium',
    'R-052': 'Radiologi',
    'R-053': 'Farmasi',
    'R-054': 'Farmasi',
    'R-055': 'Pendaftaran',
    'R-056': 'Casemix',
    'R-057': 'Keuangan',
    'R-058': 'Keuangan',
    'R-059': 'Rekam Medis',
    'R-060': 'IPSRS',
    'R-061': 'SDM',
    'R-062': 'IT',
    'R-063': 'Humas & Pengembangan',
    'R-064': 'Rawat Jalan',
    'R-065': 'Keamanan',
    'R-066': 'Kebersihan & Laundry',
    'R-067': 'IPSRS',
    'R-099': 'Logistik',
    'R-100': 'Umum',
    'R-105': 'ADUM',
    'R-110': 'Rekam Medis'
}


def run_local():
    print("=== RUNNING ON LOCAL DATABASE (DJANGO ORM) ===")
    sys.path.insert(0, r'd:\Kerjaan\Ngoding\simak\backend')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    import django
    django.setup()

    from users.models import Unit
    from gudang.models import Ruang

    # 1. Populate missing units
    created_count = 0
    for name, kategori in NEW_UNITS:
        obj, created = Unit.objects.get_or_create(
            nama=name,
            defaults={'kategori': kategori, 'is_active': True}
        )
        if created:
            created_count += 1
            print(f"[LOCAL] Created unit: ID {obj.id} - {obj.nama} ({obj.kategori})")
        else:
            print(f"[LOCAL] Unit already exists: ID {obj.id} - {obj.nama} ({obj.kategori})")

    print(f"[LOCAL] Total new units created: {created_count}")

    # 2. Map rooms to units
    unit_dict = {u.nama: u for u in Unit.objects.all()}
    updated_rooms = 0
    for kode, unit_name in ROOM_TO_UNIT_MAP.items():
        unit_obj = unit_dict.get(unit_name)
        if not unit_obj:
            print(f"[LOCAL] ERROR: Unit '{unit_name}' not found for room {kode}")
            continue
        try:
            ruang = Ruang.objects.get(kode=kode)
            if ruang.unit_id != unit_obj.id:
                old_unit_id = ruang.unit_id
                ruang.unit = unit_obj
                ruang.save(update_fields=['unit'])
                updated_rooms += 1
                print(f"[LOCAL] Updated room {kode} ({ruang.nama}): unit_id {old_unit_id} -> {unit_obj.id} ({unit_obj.nama})")
            else:
                pass
        except Ruang.DoesNotExist:
            print(f"[LOCAL] Room {kode} does not exist in DB!")

    print(f"[LOCAL] Total rooms updated: {updated_rooms}")
    null_count = Ruang.objects.filter(unit__isnull=True).count()
    print(f"[LOCAL] Rooms with NULL unit: {null_count}")


def run_prod():
    print("\n=== RUNNING ON PROD DATABASE (192.168.44.116) ===")
    import MySQLdb

    conn = MySQLdb.connect(
        host='192.168.44.116',
        user='itrssams',
        passwd='IT@rssams2025',
        db='simak',
        port=3306,
        charset='utf8mb4'
    )
    cur = conn.cursor()

    # 1. Fetch existing units
    cur.execute("SELECT id, nama, kategori FROM users_unit")
    existing_units = {row[1]: row[0] for row in cur.fetchall()}

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    created_count = 0
    for name, kategori in NEW_UNITS:
        if name not in existing_units:
            sql = """
                INSERT INTO users_unit (nama, kategori, is_active, created_at, updated_at)
                VALUES (%s, %s, 1, %s, %s)
            """
            cur.execute(sql, (name, kategori, now_str, now_str))
            unit_id = cur.lastrowid
            existing_units[name] = unit_id
            created_count += 1
            print(f"[PROD] Created unit: ID {unit_id} - {name} ({kategori})")
        else:
            print(f"[PROD] Unit already exists: ID {existing_units[name]} - {name}")

    conn.commit()
    print(f"[PROD] Total new units created: {created_count}")

    # 2. Map rooms to units
    updated_rooms = 0
    for kode, unit_name in ROOM_TO_UNIT_MAP.items():
        unit_id = existing_units.get(unit_name)
        if not unit_id:
            print(f"[PROD] ERROR: Unit '{unit_name}' not found for room {kode}")
            continue

        cur.execute("SELECT id, nama, unit_id FROM gdg_ruang WHERE kode = %s", (kode,))
        row = cur.fetchone()
        if not row:
            print(f"[PROD] Room {kode} not found in DB!")
            continue

        room_id, room_nama, curr_unit_id = row
        if curr_unit_id != unit_id:
            cur.execute("UPDATE gdg_ruang SET unit_id = %s, updated_at = %s WHERE id = %s", (unit_id, now_str, room_id))
            updated_rooms += 1
            print(f"[PROD] Updated room {kode} ({room_nama}): unit_id {curr_unit_id} -> {unit_id} ({unit_name})")

    conn.commit()
    print(f"[PROD] Total rooms updated: {updated_rooms}")

    cur.execute("SELECT count(*) FROM gdg_ruang WHERE unit_id IS NULL")
    null_count = cur.fetchone()[0]
    print(f"[PROD] Rooms with NULL unit: {null_count}")

    conn.close()


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if target in ('local', 'all'):
        run_local()
    if target in ('prod', 'all'):
        run_prod()
