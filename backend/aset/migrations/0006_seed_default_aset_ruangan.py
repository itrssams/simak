from django.db import migrations


DEFAULT_ROOMS_BY_UNIT = {
    'administrasi penunjang pelayanan': 'Ruang Administrasi Penunjang',
    'administrasi umum': 'Ruang Administrasi Umum',
    'adum': 'Ruang Administrasi Umum',
    'casemix': 'Ruang Case Mix',
    'direksi': 'Ruang Direksi',
    'driver': 'Area Parkir / Pos Driver',
    'farmasi': 'Ruang Apotik',
    'fisioterapi': 'Ruang Fisioterapi',
    'gizi': 'Ruang Gizi / Pantry',
    'gudang farmasi': 'Gudang Farmasi',
    'hcu / icu': 'Ruang HCU / ICU',
    'humas & marketing': 'Ruang Humas & Marketing',
    'humas & pengembangan': 'Ruang Humas & Pengembangan',
    'igd': 'Ruang UGD / IGD',
    'ipsrs': 'Ruang Teknik / IPSRS',
    'it': 'Ruang IT',
    'kamar bedah': 'Ruang OK',
    'kamar operasi (ok)': 'Ruang OK',
    'kasir': 'Ruang Kasir',
    'keamanan': 'Pos Security',
    'kebersihan & laundry': 'Ruang Laundry & Cleaning Service',
    'kebidanan': 'Ruang Kebidanan / VK',
    'kerohanian': 'Ruang Kerohanian / Musholla',
    'keuangan': 'Ruang Keuangan',
    'laboratorium': 'Ruang Laboratorium',
    'logistik': 'Ruang / Gudang Logistik',
    'pendaftaran': 'Front Office / Pendaftaran',
    'penunjang medis': 'Ruang Penunjang Medis',
    'radiologi': 'Ruang Radiologi',
    'rawat inap': 'Ruang Rawat Inap',
    'rawat jalan': 'Ruang Rawat Jalan',
    'rawat jalan (poli)': 'Ruang Rawat Jalan',
    'rekam medis': 'Ruang Rekam Medis',
    'sdm': 'Ruang SDM',
    'umum': 'Ruang Manajemen Umum',
    'vk & perinatologi': 'Ruang VK & Perinatologi',
}


def seed_default_unit_rooms(apps, schema_editor):
    Unit = apps.get_model('users', 'Unit')
    AsetRuangan = apps.get_model('aset', 'AsetRuangan')

    for unit in Unit.objects.filter(is_active=True).order_by('id'):
        if AsetRuangan.objects.filter(unit=unit).exists():
            continue
        unit_key = ' '.join((unit.nama or '').split()).lower()
        room_name = DEFAULT_ROOMS_BY_UNIT.get(unit_key) or f'Ruang {unit.nama.strip()}'
        AsetRuangan.objects.get_or_create(
            unit=unit,
            nama=room_name,
            defaults={
                'is_active': True,
                'keterangan': 'Ruangan default unit (otomatis dibuat untuk pendaftaran aset).',
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('aset', '0005_asetpengaturan_asetteknisi_aset_catatan_verifikasi_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_default_unit_rooms, reverse_code=migrations.RunPython.noop),
    ]
