from django.db import transaction
from sdm.models import Pegawai, Shift, JadwalMaster, JadwalKoreksi, JadwalDinas


def kelompok_shift_untuk(pegawai_or_kategori) -> str:
    """
    Memetakan Pegawai atau nilai kategori Pegawai ke Shift.kelompok:
    - SHIFT, NON_SHIFT -> UMUM
    - CS -> CS
    - SECURITY_DRIVER -> SECURITY_DRIVER
    - MITRA -> MITRA
    """
    if hasattr(pegawai_or_kategori, 'kategori'):
        kategori = pegawai_or_kategori.kategori
    else:
        kategori = str(pegawai_or_kategori or '').strip().upper()

    if kategori in ('SHIFT', 'NON_SHIFT', 'UMUM', ''):
        return 'UMUM'
    if kategori in ('CS', 'SECURITY_DRIVER', 'MITRA'):
        return kategori
    return 'UMUM'


def validate_shift_for_pegawai(pegawai: Pegawai, shift: Shift) -> None:
    """
    Memastikan shift.kelompok sesuai dengan kelompok shift pegawai.
    Melempar ValueError dengan pesan jelas jika tidak sesuai.
    """
    expected = kelompok_shift_untuk(pegawai)
    if shift.kelompok != expected:
        raise ValueError(
            f"Shift [{shift.kode}] berasal dari kelompok '{shift.get_kelompok_display()}' ({shift.kelompok}), "
            f"sedangkan pegawai '{pegawai.nama}' termasuk kelompok '{expected}'."
        )


def build_shifts_lookup():
    """
    Membangun dictionary lookup (kelompok, kode_upper) -> Shift
    untuk pencarian cepat tanpa query berulang.
    """
    lookup = {}
    for s in Shift.objects.all():
        lookup[(s.kelompok, s.kode.strip().upper())] = s
    return lookup


def build_pegawai_lookup():
    """
    Membangun struktur lookup Pegawai yang aman terhadap:
    - PIN dengan leading zero ('0334' vs '334')
    - Nama kembar beda PIN ('Putriani' PIN 335 vs 325, 'Nur Aisa' PIN 334 vs 323)
    - Selisih PIN di Excel vs DB ('YUDA DARMA PUTRA' PIN 332 di Excel vs 324 di DB)
    """
    exact_pin_name = {}
    exact_pin = {}
    variant_pin = {}
    by_name = {}

    all_pegawai = list(Pegawai.objects.all().order_by('id'))
    for p in all_pegawai:
        nama_low = p.nama.strip().lower()
        # Simpan yang pertama muncul agar tidak tertimpa duplikat ID lebih besar
        by_name.setdefault(nama_low, p)
        if p.pin:
            raw_p = str(p.pin).strip()
            exact_pin[raw_p] = p
            exact_pin_name[(raw_p, nama_low)] = p

    for p in all_pegawai:
        if p.pin:
            raw_p = str(p.pin).strip()
            for var in (raw_p.lstrip('0') or '0', raw_p.zfill(3), raw_p.zfill(4)):
                if var not in exact_pin:
                    variant_pin.setdefault(var, p)

    return {
        'exact_pin_name': exact_pin_name,
        'exact_pin': exact_pin,
        'variant_pin': variant_pin,
        'by_name': by_name,
    }


def find_pegawai(pin_raw, nama_raw='', lookup=None):
    """
    Mencari Pegawai dengan urutan prioritas:
    1. Exact (PIN, Nama)
    2. Variant PIN (lstrip '0' / zfill) + Exact Nama
    3. Exact Nama (menangani kasus typo PIN di Excel seperti Yuda Darma Putra PIN 332 vs Mita PIN 332)
    4. Exact PIN
    5. Variant PIN
    """
    if lookup is None:
        lookup = build_pegawai_lookup()

    pin_str = str(pin_raw).strip() if pin_raw is not None else ''
    nama_low = str(nama_raw).strip().lower() if nama_raw else ''

    # 1. Exact (PIN, Nama)
    if pin_str and nama_low and (pin_str, nama_low) in lookup['exact_pin_name']:
        return lookup['exact_pin_name'][(pin_str, nama_low)]

    # 2. Variant PIN + Exact Nama
    if pin_str and nama_low:
        for var in (pin_str.lstrip('0') or '0', pin_str.zfill(3), pin_str.zfill(4)):
            if (var, nama_low) in lookup['exact_pin_name']:
                return lookup['exact_pin_name'][(var, nama_low)]
            cand = lookup['exact_pin'].get(var) or lookup['variant_pin'].get(var)
            if cand and cand.nama.strip().lower() == nama_low:
                return cand

    # 3. Exact Nama
    if nama_low and nama_low in lookup['by_name']:
        return lookup['by_name'][nama_low]

    # 4. Exact PIN
    if pin_str and pin_str in lookup['exact_pin']:
        return lookup['exact_pin'][pin_str]

    # 5. Variant PIN
    if pin_str:
        for var in (pin_str.lstrip('0') or '0', pin_str.zfill(3), pin_str.zfill(4)):
            cand = lookup['variant_pin'].get(var) or lookup['exact_pin'].get(var)
            if cand:
                return cand

    return None


def resolve_shift_for_pegawai(pegawai_or_kategori, raw_kode: str, shifts_lookup=None):
    """
    Mencari objek Shift berdasarkan kelompok pegawai dan kode shift (case-insensitive).
    Menangani alias kode sesuai aturan Excel:
    - 'ST' <-> 'St' / 'ST'
    - 'PB' -> 'PB' untuk CS, atau alias ke 'PR' untuk UMUM & SECURITY_DRIVER
    - 'PR' -> 'PR' untuk UMUM & SECURITY_DRIVER, atau alias ke 'PB' untuk CS
    """
    if not raw_kode:
        return None

    kelompok = kelompok_shift_untuk(pegawai_or_kategori)
    kode = str(raw_kode).strip().upper()

    if shifts_lookup is None:
        shifts_lookup = build_shifts_lookup()

    shift_obj = shifts_lookup.get((kelompok, kode))
    if shift_obj:
        return shift_obj

    # Alias handling sesuai Excel
    if kode == 'PB' and kelompok in ('UMUM', 'SECURITY_DRIVER'):
        return shifts_lookup.get((kelompok, 'PR'))
    if kode == 'PR' and kelompok == 'CS':
        return shifts_lookup.get((kelompok, 'PB'))

    return None


def rebuild_jadwal_final(pegawai_ids=None, start=None, end=None):
    """
    Menghitung ulang dan menyinkronkan tabel JadwalDinas (final) dari:
        JadwalMaster (dasar) + JadwalKoreksi (override per sel)
    Aturan (setara rumus INDEX/MATCH + VLOOKUP di sheet 'JADWAL DINAS (3)' Excel):
    - Jika ada JadwalKoreksi pada (pegawai, tanggal) -> pakai shift koreksi, sumber='koreksi'
    - Jika tidak ada koreksi tetapi ada JadwalMaster -> pakai shift master, sumber='master'
    - Jika keduanya tidak ada -> hapus baris JadwalDinas pada (pegawai, tanggal) tersebut.
    Berjalan dalam transaction.atomic dan bersifat idempoten.
    """
    master_qs = JadwalMaster.objects.select_related('shift', 'pegawai', 'created_by')
    koreksi_qs = JadwalKoreksi.objects.select_related('shift', 'pegawai', 'tukar', 'created_by')
    existing_qs = JadwalDinas.objects.select_related('shift', 'shift_master', 'koreksi')

    if pegawai_ids is not None:
        p_ids = list(pegawai_ids)
        master_qs = master_qs.filter(pegawai_id__in=p_ids)
        koreksi_qs = koreksi_qs.filter(pegawai_id__in=p_ids)
        existing_qs = existing_qs.filter(pegawai_id__in=p_ids)

    if start is not None:
        master_qs = master_qs.filter(tanggal__gte=start)
        koreksi_qs = koreksi_qs.filter(tanggal__gte=start)
        existing_qs = existing_qs.filter(tanggal__gte=start)

    if end is not None:
        master_qs = master_qs.filter(tanggal__lte=end)
        koreksi_qs = koreksi_qs.filter(tanggal__lte=end)
        existing_qs = existing_qs.filter(tanggal__lte=end)

    master_map = {(m.pegawai_id, m.tanggal): m for m in master_qs}
    koreksi_map = {(k.pegawai_id, k.tanggal): k for k in koreksi_qs}
    existing_map = {(j.pegawai_id, j.tanggal): j for j in existing_qs}

    all_keys = set(master_map.keys()) | set(koreksi_map.keys())
    stale_ids = [
        j.id for key, j in existing_map.items()
        if key not in all_keys
    ]

    to_create = []
    to_update = []
    from_master_count = 0
    from_koreksi_count = 0

    for key in sorted(all_keys, key=lambda x: (x[1], x[0])):
        pid, tgl = key
        m = master_map.get(key)
        k = koreksi_map.get(key)

        shift_master_obj = m.shift if m else None

        if k is not None:
            final_shift = k.shift
            sumber = 'koreksi'
            koreksi_obj = k
            catatan = k.alasan or f"Koreksi ({k.get_jenis_display()})"
            created_by = k.created_by or (m.created_by if m else None)
            from_koreksi_count += 1
        else:
            final_shift = m.shift
            sumber = 'master'
            koreksi_obj = None
            catatan = m.catatan or 'Jadwal Master'
            created_by = m.created_by
            from_master_count += 1

        existing = existing_map.get(key)
        if existing is not None:
            changed = (
                existing.shift_id != final_shift.id or
                existing.shift_master_id != (shift_master_obj.id if shift_master_obj else None) or
                existing.sumber != sumber or
                existing.koreksi_id != (koreksi_obj.id if koreksi_obj else None) or
                existing.catatan != catatan
            )
            if changed:
                existing.shift = final_shift
                existing.shift_master = shift_master_obj
                existing.sumber = sumber
                existing.koreksi = koreksi_obj
                existing.catatan = catatan
                if created_by:
                    existing.created_by = created_by
                to_update.append(existing)
        else:
            to_create.append(
                JadwalDinas(
                    pegawai_id=pid,
                    tanggal=tgl,
                    shift=final_shift,
                    shift_master=shift_master_obj,
                    sumber=sumber,
                    koreksi=koreksi_obj,
                    catatan=catatan[:200] if catatan else '',
                    created_by=created_by,
                )
            )

    with transaction.atomic():
        deleted_count = 0
        if stale_ids:
            deleted_count, _ = JadwalDinas.objects.filter(id__in=stale_ids).delete()
        if to_create:
            JadwalDinas.objects.bulk_create(to_create, batch_size=1000)
        if to_update:
            JadwalDinas.objects.bulk_update(
                to_update,
                fields=['shift', 'shift_master', 'sumber', 'koreksi', 'catatan', 'created_by'],
                batch_size=1000,
            )

    return {
        'total_final': len(all_keys),
        'from_master': from_master_count,
        'from_koreksi': from_koreksi_count,
        'created': len(to_create),
        'updated': len(to_update),
        'deleted': deleted_count,
    }
