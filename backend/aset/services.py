from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from .models import Aset, AsetRiwayat


def hitung_penyusutan_aset(aset, target_date=None):
    """
    Menghitung penyusutan garis lurus berdasarkan PMK No. 72 Tahun 2023.
    Aturan:
    - Dimulai pada bulan perolehan (Pasal 5).
    - Penyusutan bulanan = Harga Perolehan / Masa Manfaat (Bulan).
    - Disusutkan hingga Nilai Buku = 0 (tanpa nilai residu).
    """
    if target_date is None:
        target_date = timezone.now().date()

    harga = Decimal(str(aset.harga_perolehan or 0))
    masa_bulan = int(aset.masa_manfaat_bulan or 0)
    tgl_perolehan = aset.bulan_perolehan

    # Jika data belum lengkap atau kelompok tidak disusutkan
    if (
        aset.status_data == 'belum_lengkap' or
        harga <= 0 or
        masa_bulan <= 0 or
        tgl_perolehan is None or
        (aset.kelompok and not aset.kelompok.disusutkan)
    ):
        return {
            'is_calculable': False,
            'alasan': 'Data belum lengkap atau aset tidak disusutkan',
            'harga_perolehan': float(harga),
            'masa_manfaat_bulan': masa_bulan,
            'masa_manfaat_tahun': round(masa_bulan / 12, 1) if masa_bulan else 0,
            'beban_bulanan': 0.0,
            'bulan_terpakai': 0,
            'sisa_bulan': masa_bulan,
            'akumulasi_penyusutan': 0.0,
            'nilai_buku': float(harga),
            'persen_terdepresiasi': 0.0,
            'selesai_penyusutan': None,
            'sudah_habis': False,
        }

    beban_bulanan = (harga / Decimal(masa_bulan)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # Hitung selisih bulan inklusif dari bulan perolehan
    # Misal: Perolehan Sep 2025, Target Okt 2026 -> (2026-2025)*12 + (10 - 9) + 1 = 14 bulan
    if target_date < tgl_perolehan:
        diff_bulan = 0
    else:
        diff_bulan = (target_date.year - tgl_perolehan.year) * 12 + (target_date.month - tgl_perolehan.month) + 1

    bulan_terpakai = max(0, min(masa_bulan, diff_bulan))
    sisa_bulan = max(0, masa_bulan - bulan_terpakai)

    if bulan_terpakai >= masa_bulan:
        akumulasi = harga
        nilai_buku = Decimal('0.00')
        sudah_habis = True
    else:
        akumulasi = (Decimal(bulan_terpakai) * beban_bulanan).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if akumulasi > harga:
            akumulasi = harga
        nilai_buku = (harga - akumulasi).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        sudah_habis = False

    persen = float((akumulasi / harga * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)) if harga > 0 else 0.0

    # Estimasi tanggal selesai penyusutan (akhir bulan ke masa_bulan)
    tot_m = tgl_perolehan.month - 1 + masa_bulan
    end_year = tgl_perolehan.year + (tot_m // 12)
    end_month = (tot_m % 12) + 1
    selesai_penyusutan = f'{end_year}-{end_month:02d}'

    return {
        'is_calculable': True,
        'alasan': None,
        'harga_perolehan': float(harga),
        'masa_manfaat_bulan': masa_bulan,
        'masa_manfaat_tahun': round(masa_bulan / 12, 1),
        'beban_bulanan': float(beban_bulanan),
        'bulan_terpakai': bulan_terpakai,
        'sisa_bulan': sisa_bulan,
        'akumulasi_penyusutan': float(akumulasi),
        'nilai_buku': float(nilai_buku),
        'persen_terdepresiasi': persen,
        'selesai_penyusutan': selesai_penyusutan,
        'sudah_habis': sudah_habis,
    }


def generate_jadwal_penyusutan(aset):
    """
    Membuat breakdown jadwal penyusutan tahunan dan bulanan ala format Lampiran PMK 72/2023.
    """
    harga = Decimal(str(aset.harga_perolehan or 0))
    masa_bulan = int(aset.masa_manfaat_bulan or 0)
    tgl_perolehan = aset.bulan_perolehan

    if (
        aset.status_data == 'belum_lengkap' or
        harga <= 0 or
        masa_bulan <= 0 or
        tgl_perolehan is None or
        (aset.kelompok and not aset.kelompok.disusutkan)
    ):
        return {
            'is_calculable': False,
            'alasan': 'Data perolehan belum lengkap untuk membuat jadwal penyusutan.',
            'jadwal_tahunan': [],
            'jadwal_bulanan': [],
        }

    beban_bulanan = (harga / Decimal(masa_bulan)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    tarif_persen = float(aset.kelompok.tarif_garis_lurus) if aset.kelompok else round(100.0 / (masa_bulan / 12), 2)

    # 1. Jadwal Bulanan
    jadwal_bulanan = []
    akumulasi_jalan = Decimal('0.00')

    cur_year = tgl_perolehan.year
    cur_month = tgl_perolehan.month

    for b in range(1, masa_bulan + 1):
        is_last = (b == masa_bulan)
        if is_last:
            beban_bln_ini = harga - akumulasi_jalan
            akumulasi_jalan = harga
            nb = Decimal('0.00')
        else:
            beban_bln_ini = beban_bulanan
            akumulasi_jalan += beban_bln_ini
            nb = harga - akumulasi_jalan

        jadwal_bulanan.append({
            'bulan_ke': b,
            'periode': f'{cur_year}-{cur_month:02d}',
            'beban_bulan': float(beban_bln_ini),
            'akumulasi_penyusutan': float(akumulasi_jalan),
            'nilai_buku': float(nb),
        })

        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1

    # 2. Jadwal Tahunan (Pengelompokan persis format PMK)
    jadwal_tahunan = []
    from collections import defaultdict
    tahun_map = defaultdict(lambda: {'bulan_count': 0, 'beban_total': Decimal('0.00'), 'nb_akhir': Decimal('0.00'), 'ak_akhir': Decimal('0.00')})

    for item in jadwal_bulanan:
        y = int(item['periode'].split('-')[0])
        tahun_map[y]['bulan_count'] += 1
        tahun_map[y]['beban_total'] += Decimal(str(item['beban_bulan']))
        tahun_map[y]['nb_akhir'] = Decimal(str(item['nilai_buku']))
        tahun_map[y]['ak_akhir'] = Decimal(str(item['akumulasi_penyusutan']))

    for y in sorted(tahun_map.keys()):
        b_count = tahun_map[y]['bulan_count']
        jadwal_tahunan.append({
            'tahun': y,
            'porsi': f'{b_count}/12' if b_count < 12 else '12/12',
            'bulan_dihitung': b_count,
            'tarif_persen': tarif_persen,
            'beban_penyusutan': float(tahun_map[y]['beban_total']),
            'akumulasi_penyusutan': float(tahun_map[y]['ak_akhir']),
            'nilai_buku_akhir': float(tahun_map[y]['nb_akhir']),
        })

    return {
        'is_calculable': True,
        'harga_perolehan': float(harga),
        'masa_manfaat_bulan': masa_bulan,
        'masa_manfaat_tahun': round(masa_bulan / 12, 1),
        'tarif_persen': tarif_persen,
        'jadwal_tahunan': jadwal_tahunan,
        'jadwal_bulanan': jadwal_bulanan,
    }


def generate_kode_aset(jenis):
    """
    Format otomatis: [KATEGORI].[JENIS].[0001]
    Contoh: PE.AC.0001, PE.TV.0015, AM.USG.0002
    """
    prefix = f'{jenis.kategori.kode}.{jenis.kode}.'
    existing_kodes = Aset.objects.filter(kode_aset__startswith=prefix).values_list('kode_aset', flat=True)

    max_num = 0
    for kode in existing_kodes:
        parts = kode.split('.')
        if len(parts) >= 3 and parts[-1].isdigit():
            num = int(parts[-1])
            if num > max_num:
                max_num = num

    next_num = max_num + 1
    return f'{prefix}{next_num:04d}'


def catat_riwayat_kelayakan(aset, status_baru, user, status_lama=None, catatan='', foto=None):
    """
    Mencatat log riwayat saat unit atau admin mengubah status kelayakan aset.
    """
    if status_lama is None:
        status_lama = aset.status_kelayakan
    if status_lama == status_baru and not catatan and not foto:
        return None

    riwayat = AsetRiwayat.objects.create(
        aset=aset,
        aksi='perubahan_kelayakan',
        status_kelayakan_lama=status_lama,
        status_kelayakan_baru=status_baru,
        unit_lama=aset.unit.nama if aset.unit else '',
        unit_baru=aset.unit.nama if aset.unit else '',
        ruangan_lama=aset.lokasi_teks,
        ruangan_baru=aset.lokasi_teks,
        catatan=catatan or f'Status kelayakan diubah dari {status_lama} ke {status_baru}',
        foto=foto,
        dilakukan_oleh=user,
    )
    return riwayat


def catat_mutasi_ruangan(aset, unit_baru, ruangan_baru, user, catatan=''):
    """
    Mencatat log riwayat saat terjadi pemindahan ruangan / unit penanggung jawab.
    """
    unit_lama_nama = aset.unit.nama if aset.unit else ''
    unit_baru_nama = unit_baru.nama if unit_baru else unit_lama_nama
    ruangan_lama_nama = aset.lokasi_teks
    ruangan_baru_nama = ruangan_baru.nama if ruangan_baru else ''

    riwayat = AsetRiwayat.objects.create(
        aset=aset,
        aksi='mutasi_ruangan',
        status_kelayakan_lama=aset.status_kelayakan,
        status_kelayakan_baru=aset.status_kelayakan,
        unit_lama=unit_lama_nama,
        unit_baru=unit_baru_nama,
        ruangan_lama=ruangan_lama_nama,
        ruangan_baru=ruangan_baru_nama,
        catatan=catatan or f'Aset dimutasi dari {ruangan_lama_nama} ({unit_lama_nama}) ke {ruangan_baru_nama} ({unit_baru_nama})',
        dilakukan_oleh=user,
    )
    return riwayat



import os
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Kamus Referensi Alkes & Inventaris RS Siaga Al Munawwarah
LOCAL_HOSPITAL_DICTIONARY = [
    {
        'nama': 'Termometer Digital',
        'kode': 'TERMO',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K1',
        'penjelasan': 'Alat ukur suhu tubuh digital, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['termo', 'termometer', 'thermometer', 'termometre', 'suhu', 'panas badan', 'febris']
    },
    {
        'nama': 'Termometer Inframerah (Thermal Gun)',
        'kode': 'TERMO',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K1',
        'penjelasan': 'Alat ukur suhu non-kontak inframerah, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['thermogun', 'thermal gun', 'infrared', 'infra merah', 'tembak suhu']
    },
    {
        'nama': 'Tensimeter Digital (Sphygmomanometer)',
        'kode': 'TENSI',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Alat pemantau tekanan darah digital otomatis, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['tensi', 'tensimeter', 'tensimetr', 'tekanan darah', 'sphygmo', 'sfigmo', 'omron']
    },
    {
        'nama': 'Tensimeter Aneroid (Jarum Manual)',
        'kode': 'TENSI',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Tensimeter jarum jam manual dengan manset, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['tensi jarum', 'tensi manual', 'aneroid']
    },
    {
        'nama': 'Patient Monitor Vital Sign',
        'kode': 'MONIT',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Monitor tanda vital multi-parameter ICU/IGD, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['monitor', 'patient monitor', 'vital sign', 'rekam vital', 'bedside monitor']
    },
    {
        'nama': 'Elektrokardiograf (ECG / EKG 12 Lead)',
        'kode': 'ECG',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Perekam gelombang kelistrikan jantung, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['ecg', 'ekg', 'rekam jantung', 'alat jantung', 'electrocardiograph', 'bionet']
    },
    {
        'nama': 'USG Color Doppler 4D',
        'kode': 'USG',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K3',
        'penjelasan': 'Alat ultrasonografi pencitraan medis spesialis, masa manfaat 16 tahun (Kelompok 3)',
        'keywords': ['usg', 'ultrasound', 'doppler', 'usg 4d', 'usg kebidanan', 'ge healthcare']
    },
    {
        'nama': 'Suction Pump Medis',
        'kode': 'SUCT',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Pompa penyedot cairan/lendir operasi & tindakan, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['suction', 'sedot lendir', 'penyedot dahak', 'suction apparatus']
    },
    {
        'nama': 'Infusion Pump',
        'kode': 'INFUS',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Pengatur laju tetesan infus elektronik presisi, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['infuse pump', 'infusion pump', 'pompa infus', 'terumo']
    },
    {
        'nama': 'Syringe Pump',
        'kode': 'SYRINGE',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Pompa spuit pendorong obat cair injeksi mikro, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['syringe pump', 'pompa spuit', 'suntik mikro']
    },
    {
        'nama': 'Nebulizer Kompresor',
        'kode': 'NEBU',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Alat terapi inhalasi uap saluran pernapasan, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['nebu', 'nebulizer', 'uap asma', 'terapi uap', 'omron nebu']
    },
    {
        'nama': 'Defibrillator / AED',
        'kode': 'DEFIB',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Alat kejut jantung darurat henti jantung, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['defib', 'defibrillator', 'aed', 'kejut jantung', 'resusitasi']
    },
    {
        'nama': 'Bed Pasien Electric (3 Crank)',
        'kode': 'BED',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Ranjang rawat inap otomatis dengan motor listrik, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['bed', 'ranjang', 'tempat tidur', 'kasur pasien', 'bed elektrik', 'paramount']
    },
    {
        'nama': 'Bed Pasien Manual (2 Crank)',
        'kode': 'BED',
        'kategori_kode': 'FU',
        'kelompok_kode': 'K2',
        'penjelasan': 'Ranjang rawat inap engkol mekanik manual, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['bed manual', 'ranjang manual', 'kasur engkol']
    },
    {
        'nama': 'Kursi Roda Pasien Standar',
        'kode': 'RODA',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K1',
        'penjelasan': 'Alat bantu mobilisasi pasien manual lipat, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['kursi roda', 'wheelchair', 'roda pasien']
    },
    {
        'nama': 'Centrifuge Laboratorium',
        'kode': 'CENTRI',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Alat pemusing pemisah serum darah laboratorium, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['centrifuge', 'pemusing darah', 'sentrifus', 'lab darah']
    },
    {
        'nama': 'Mikroskop Laboratorium Binokuler',
        'kode': 'MIKRO',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Mikroskop optik penelitian spesimen lab, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['mikroskop', 'microscope', 'olympus', 'binokuler']
    },
    {
        'nama': 'Autoclave Sterilisator Medis',
        'kode': 'AUTO',
        'kategori_kode': 'AM',
        'kelompok_kode': 'K2',
        'penjelasan': 'Alat sterilisasi uap bertekanan tinggi ruang CSSD, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['autoclave', 'otoklaf', 'steril', 'sterilisator', 'cssd']
    },
    {
        'nama': 'AC Split Wall 1 PK',
        'kode': 'AC',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K2',
        'penjelasan': 'Pendingin ruangan inverter/standar 1 PK, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['ac', 'pendingin', 'air conditioner', 'daikin', 'sharp', 'panasonic', '1 pk']
    },
    {
        'nama': 'AC Split Wall 2 PK',
        'kode': 'AC',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K2',
        'penjelasan': 'Pendingin ruangan ruangan tindakan/VIP 2 PK, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['ac 2 pk', 'ac besar', 'pendingin 2 pk']
    },
    {
        'nama': 'Kulkas Vaksin & Reagen Medis',
        'kode': 'KLK-MED',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K2',
        'penjelasan': 'Lemari pendingin suhu terkontrol untuk vaksin dan obat, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['kulkas vaksin', 'kulkas medis', 'chiller obat', 'refrigerator farmasi']
    },
    {
        'nama': 'Kulkas Dua Pintu Non Medis',
        'kode': 'KLK',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K2',
        'penjelasan': 'Kulkas pantry / ruang istirahat staf, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['kulkas', 'kulkas 2 pintu', 'lemari es']
    },
    {
        'nama': 'Dispenser Air Minum Galon Bawah',
        'kode': 'DISP',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K1',
        'penjelasan': 'Dispenser air panas/dingin ruangan pasien & kantor, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['dispenser', 'galon', 'air minum', 'miyako', 'sanken']
    },
    {
        'nama': 'Komputer PC All-in-One (AIO)',
        'kode': 'PC',
        'kategori_kode': 'IT',
        'kelompok_kode': 'K1',
        'penjelasan': 'Unit komputer desktop staf perawat dan dokter, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['pc', 'komputer', 'aio', 'desktop', 'lenovo', 'asus', 'all in one']
    },
    {
        'nama': 'Printer Laser / Multifungsi',
        'kode': 'PRINT',
        'kategori_kode': 'IT',
        'kelompok_kode': 'K1',
        'penjelasan': 'Printer cetak berkas RM dan tagihan kasir, masa manfaat 4 tahun (Kelompok 1)',
        'keywords': ['printer', 'cetak', 'print', 'epson', 'canon', 'hp laserjet']
    },
    {
        'nama': 'Ambulans Transport Pasien',
        'kode': 'AMB',
        'kategori_kode': 'KD',
        'kelompok_kode': 'K2',
        'penjelasan': 'Kendaraan operasional rujukan pasien, masa manfaat 8 tahun (Kelompok 2)',
        'keywords': ['ambulans', 'ambulance', 'mobil jenazah', 'mobil rujukan', 'apv', 'hiace']
    },
    {
        'nama': 'Genset Standby Silent 100 kVA',
        'kode': 'GEN',
        'kategori_kode': 'PE',
        'kelompok_kode': 'K3',
        'penjelasan': 'Generator daya cadangan darurat rumah sakit, masa manfaat 16 tahun (Kelompok 3)',
        'keywords': ['genset', 'generator', 'listrik darurat', 'cummins', 'perkins', 'kva']
    }
]

AI_SUGGESTION_CACHE = {}


def search_local_dictionary(q):
    q_low = q.lower()
    matches = []
    
    # 1. Cek database master AsetJenis (300+ data resmi RS Siaga)
    try:
        from .models import AsetJenis
        from django.db.models import Q
        db_items = AsetJenis.objects.select_related('kategori', 'kelompok_default').filter(
            Q(nama__icontains=q_low) | Q(kode__icontains=q_low)
        )[:4]
        for db_item in db_items:
            matches.append({
                'nama': db_item.nama,
                'kode': db_item.kode,
                'kategori_kode': db_item.kategori.kode if db_item.kategori else 'PL',
                'kelompok_kode': db_item.kelompok_default.kode if db_item.kelompok_default else 'KEL1',
                'penjelasan': f"Master Data Resmi RS Siaga ({db_item.kategori.nama if db_item.kategori else 'Umum'})"
            })
    except Exception as e:
        logger.warning(f"Error querying AsetJenis in local search: {e}")

    # 2. Tambah dari kamus sinonim jika belum ada
    for item in LOCAL_HOSPITAL_DICTIONARY:
        if any(m['kode'] == item['kode'] for m in matches):
            continue
        if q_low in item['nama'].lower():
            matches.append(item)
            continue
        for kw in item.get('keywords', []):
            if q_low in kw or kw in q_low:
                matches.append(item)
                break
    return matches[:4]


def get_ai_asset_suggestions(query):
    """
    Rekomendasi nama baku alkes, kode prefix, kategori, dan kelas aset PMK 72
    menggunakan Google Gemini AI dengan fallback otomatis ke kamus lokal.
    """
    q_clean = query.strip()
    if not q_clean or len(q_clean) < 2:
        return {'source': 'empty', 'results': []}

    cache_key = q_clean.lower()
    if cache_key in AI_SUGGESTION_CACHE:
        return AI_SUGGESTION_CACHE[cache_key]

    api_key = getattr(settings, 'GEMINI_API_KEY', '') or os.getenv('GEMINI_API_KEY', '')

    # 1. Coba Gemini API jika API Key terpasang
    if api_key:
        candidate_models = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest']
        for model_name in candidate_models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                prompt = f"""Anda adalah asisten inventaris RS Siaga Al Munawwarah Samarinda.
Tugas Anda menstandarisasi nama jenis barang/alkes, membetulkan typo/istilah awam, serta memetakan ke kategori dan kelas aset PMK 72/2023.

Kategori Aset RS:
- AM: Alkes Medis
- PE: Peralatan Elektronik
- IT: Komputer & Jaringan
- FU: Furniture & Mebel
- KD: Kendaraan
- PP: Penunjang Pelayanan
- PL: Peralatan Lainnya

Kelas Aset PMK 72/2023:
- K1: Kelompok 1 (4 Tahun / 25%)
- K2: Kelompok 2 (8 Tahun / 12.5%)
- K3: Kelompok 3 (16 Tahun / 6.25%)
- K4: Kelompok 4 (20 Tahun / 5%)
- NON: Tidak Disusutkan

Input staf: "{q_clean}"

Kembalikan HANYA JSON array (maks 3 item):
[
  {{
    "nama": "Nama Baku Bebas Typo",
    "kode": "PREFIX3_4HURUF",
    "kategori_kode": "AM",
    "kelompok_kode": "K2",
    "penjelasan": "Alasan singkat"
  }}
]"""
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "responseMimeType": "application/json"
                    }
                }
                resp = requests.post(url, json=payload, timeout=6)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    text_content = resp_json['candidates'][0]['content']['parts'][0]['text']
                    parsed = json.loads(text_content)
                    if isinstance(parsed, list) and len(parsed) > 0:
                        res_obj = {'source': 'gemini_ai', 'results': parsed}
                        AI_SUGGESTION_CACHE[cache_key] = res_obj
                        return res_obj
                else:
                    logger.warning(f"Gemini model {model_name} returned {resp.status_code}")
            except Exception as e:
                logger.warning(f"Gemini API request failed for {model_name}: {e}")

    # 2. Fallback cerdas: Kamus Standar Alkes RS Internal
    local_results = search_local_dictionary(q_clean)
    res_obj = {'source': 'local_dictionary', 'results': local_results}
    AI_SUGGESTION_CACHE[cache_key] = res_obj
    return res_obj
