import os
import datetime
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from .models import (
    Pegawai,
    Shift,
    JadwalDinas,
    MesinAbsen,
    LogPresensi,
    PresensiHarian,
    IzinKeluar
)

# ==============================================================================
# ATTENDANCE ENGINE – REKONSILIASI & PENGHITUNGAN PRESENSI RS SIAGA
# ==============================================================================

def get_default_mesin():
    """Mengambil instance mesin absen RS yang aktif (Gerbang Belakang S-IPC atau Gerbang Depan SE21-C)."""
    mesin = MesinAbsen.objects.filter(is_active=True).first()
    if not mesin:
        mesin, _ = MesinAbsen.objects.get_or_create(
            nama='Mesin Absen Gerbang Belakang (S-IPC)',
            defaults={
                'ip_address': '192.168.44.120',
                'port': 4370,
                'device_name': 'S-IPC',
                'is_active': True,
                'status_koneksi': 'connected'
            }
        )
    return mesin


def build_pegawai_pin_map():
    """
    Membangun map PIN -> Pegawai untuk pencocokan cepat.
    Mendukung format exact ('103'), lstrip zero ('3'), zfill 3 ('001'), dan zfill 4 ('0258').
    """
    pegawai_qs = Pegawai.objects.filter(is_active=True).select_related('user')
    pin_map = {}
    for p in pegawai_qs:
        if p.pin:
            clean_pin = str(p.pin).strip()
            pin_map[clean_pin] = p
            pin_map[clean_pin.lstrip('0') or '0'] = p
            pin_map[clean_pin.zfill(3)] = p
            pin_map[clean_pin.zfill(4)] = p
    return pin_map


def import_machine_logs_from_excel(excel_path='/app/excel_oktober.xlsm', dry_run=False):
    """
    Mengekstrak dan mengimpor log tap mesin absensi dari sheet '1-10', '11-17', dan '20-30'.
    Menghasilkan data mentah LogPresensi yang lengkap untuk bulan Oktober 2026.
    """
    import openpyxl

    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"File Excel tidak ditemukan di {excel_path}")

    wb = openpyxl.load_workbook(excel_path, read_only=True)
    mesin = get_default_mesin()
    pin_map = build_pegawai_pin_map()
    
    unique_taps = {}  # (pin, waktu, tipe_punch) -> {pegawai, waktu, tipe_punch}

    for sname in ['1-10', '11-17', '20-30']:
        if sname not in wb.sheetnames:
            continue
        ws = wb[sname]
        date_cols = {}  # col_idx -> datetime.date
        empty_rows = 0

        for row in ws.iter_rows(values_only=True):
            if not row or not any(row):
                empty_rows += 1
                if empty_rows > 10:
                    break
                continue
            empty_rows = 0

            if len(row) < 3:
                continue

            # Header baris tanggal
            if row[0] == 'No.' or row[1] == 'Fingerprint ID':
                for c_idx, val in enumerate(row):
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        tgl = val.date() if isinstance(val, datetime.datetime) else val
                        date_cols[c_idx] = tgl
                continue

            pin_raw = row[1]
            if not pin_raw or pin_raw == 'Fingerprint ID':
                continue

            pin_str = str(pin_raw).strip()
            pegawai = pin_map.get(pin_str) or pin_map.get(pin_str.lstrip('0') or '0') or pin_map.get(pin_str.zfill(3)) or pin_map.get(pin_str.zfill(4))

            for c_in, tgl in date_cols.items():
                c_out = c_in + 1
                t_in = row[c_in] if c_in < len(row) else None
                t_out = row[c_out] if c_out < len(row) else None

                # 1. Check-In Tap
                if isinstance(t_in, datetime.time):
                    dt_in = datetime.datetime.combine(tgl, t_in)
                    key_in = (pin_str, dt_in, 0)
                    if key_in not in unique_taps:
                        unique_taps[key_in] = {
                            'pin': pin_str,
                            'pegawai': pegawai,
                            'waktu': timezone.make_aware(dt_in) if timezone.is_naive(dt_in) else dt_in,
                            'tipe_punch': 0,
                            'status_verifikasi': 1
                        }

                # 2. Check-Out Tap
                if isinstance(t_out, datetime.time):
                    # Jika waktu pulang lebih kecil dari waktu masuk, berarti tap pulang di pagi hari berikutnya (overnight shift)
                    if isinstance(t_in, datetime.time) and t_out < t_in:
                        dt_out = datetime.datetime.combine(tgl + timedelta(days=1), t_out)
                    else:
                        dt_out = datetime.datetime.combine(tgl, t_out)

                    key_out = (pin_str, dt_out, 1)
                    if key_out not in unique_taps:
                        unique_taps[key_out] = {
                            'pin': pin_str,
                            'pegawai': pegawai,
                            'waktu': timezone.make_aware(dt_out) if timezone.is_naive(dt_out) else dt_out,
                            'tipe_punch': 1,
                            'status_verifikasi': 1
                        }

    total_extracted = len(unique_taps)
    if dry_run:
        return {
            'status': 'dry_run',
            'total_extracted': total_extracted,
            'sample': list(unique_taps.values())[:5]
        }

    # Bulk insert dengan pengecekan duplikasi
    created_count = 0
    batch = []
    
    # Ambil waktu minimum & maksimum untuk batch check existing
    all_times = [d['waktu'] for d in unique_taps.values()]
    min_time = min(all_times)
    max_time = max(all_times)

    existing_logs = set(
        LogPresensi.objects.filter(waktu__gte=min_time, waktu__lte=max_time)
        .values_list('pin', 'waktu', 'tipe_punch')
    )

    for data in unique_taps.values():
        key = (data['pin'], data['waktu'], data['tipe_punch'])
        if key not in existing_logs:
            batch.append(LogPresensi(
                mesin=mesin,
                pin=data['pin'],
                pegawai=data['pegawai'],
                user=data['pegawai'].user if data['pegawai'] else None,
                waktu=data['waktu'],
                tipe_punch=data['tipe_punch'],
                status_verifikasi=data['status_verifikasi']
            ))
            existing_logs.add(key)
            created_count += 1

            if len(batch) >= 1000:
                LogPresensi.objects.bulk_create(batch, ignore_conflicts=True)
                batch = []

    if batch:
        LogPresensi.objects.bulk_create(batch, ignore_conflicts=True)

    # Update counter mesin
    mesin.total_log_mesin = LogPresensi.objects.filter(mesin=mesin).count()
    mesin.last_sync_at = timezone.now()
    mesin.save(update_fields=['total_log_mesin', 'last_sync_at'])

    return {
        'status': 'success',
        'total_extracted': total_extracted,
        'created_count': created_count
    }


def calculate_attendance_record(pegawai, target_date, jadwal=None, logs_for_pegawai=None, izin_keluar=None):
    """
    Fungsi inti attendance engine untuk 1 pegawai pada 1 tanggal.
    Mencocokkan tap masuk & tap keluar dengan jadwal dinas efektif.
    Menghitung menit keterlambatan, menit pulang cepat, dan total jam kerja.
    """
    if jadwal is None:
        jadwal = JadwalDinas.objects.filter(
            pegawai=pegawai,
            tanggal=target_date
        ).select_related('shift').first()

    shift = jadwal.shift if jadwal else None

    # Default metrics
    jam_masuk = None
    jam_pulang = None
    menit_keterlambatan = 0
    menit_pulang_cepat = 0
    total_jam_kerja = Decimal('0.00')
    status = 'hadir'
    catatan_parts = []

    # 1. KASUS A: HARI LIBUR / NON-DUTY (L, OFF, CT, SA, I, IP, IS, IM, ST)
    if shift and (shift.is_libur or shift.kode.upper() in ['L', 'OFF', 'CT', 'SA', 'I', 'IP', 'IS', 'IM', 'ST']):
        kode_upper = shift.kode.upper()
        if kode_upper == 'CT':
            status = 'cuti'
            status_label = 'Cuti Tahunan'
        elif kode_upper == 'SA':
            status = 'sakit'
            status_label = 'Sakit (Surat Dokter)'
        elif kode_upper in ['IP', 'IS', 'IM']:
            status = 'izin'
            status_label = f"Izin Resmi ({kode_upper}) - ONTIME"
        elif kode_upper == 'I':
            status = 'izin'
            status_label = f"Izin Resmi ({kode_upper})"
        else:
            status = 'libur'
            status_label = 'Libur / Off Duty'

        # Cek apakah ada tap pada hari libur / izin
        if logs_for_pegawai:
            day_taps = [
                log.waktu for log in logs_for_pegawai
                if timezone.localtime(log.waktu).date() == target_date
            ]
            if day_taps:
                day_taps.sort()
                jam_masuk = timezone.localtime(day_taps[0]).time()
                if len(day_taps) > 1:
                    jam_pulang = timezone.localtime(day_taps[-1]).time()
                if kode_upper not in ['IP', 'IS', 'IM']:
                    status = 'hadir'
                    catatan_parts.append(f"Masuk saat jadwal {shift.kode}")

        return {
            'pegawai': pegawai,
            'user': pegawai.user,
            'tanggal': target_date,
            'shift': shift,
            'jadwal_dinas': jadwal,
            'jam_masuk': jam_masuk,
            'jam_pulang': jam_pulang,
            'status': status,
            'menit_keterlambatan': 0,
            'menit_pulang_cepat': 0,
            'total_jam_kerja': total_jam_kerja,
            'izin_keluar': None,
            'catatan': ' '.join(catatan_parts) if catatan_parts else status_label
        }

    # 2. KASUS B: SHIFT DINAS AKTIF (P, S, M, P1, P2, PR, PS, SM, dll)
    is_overnight = bool(shift and shift.is_overnight)

    # Ambil tap yang relevan untuk shift ini
    taps = []
    if logs_for_pegawai is not None:
        for log in logs_for_pegawai:
            local_dt = timezone.localtime(log.waktu)
            log_date = local_dt.date()
            if is_overnight:
                # Untuk shift malam (misal 21:00 - 07:00):
                # Tap masuk di malam hari tanggal target_date (>= 18:00)
                # Tap pulang di pagi hari tanggal target_date + 1 (<= 12:00)
                if log_date == target_date and local_dt.hour >= 18:
                    taps.append((local_dt, log.tipe_punch))
                elif log_date == target_date + timedelta(days=1) and local_dt.hour <= 12:
                    taps.append((local_dt, log.tipe_punch))
            else:
                if log_date == target_date:
                    taps.append((local_dt, log.tipe_punch))
    else:
        # Fallback query langsung dari DB jika logs_for_pegawai tidak dipassing
        q_filter = Q(pegawai=pegawai)
        if is_overnight:
            start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(18, 0)))
            end_dt = timezone.make_aware(datetime.datetime.combine(target_date + timedelta(days=1), datetime.time(12, 0)))
            q_filter &= Q(waktu__gte=start_dt, waktu__lte=end_dt)
        else:
            q_filter &= Q(waktu__date=target_date)

        for log in LogPresensi.objects.filter(q_filter).order_by('waktu'):
            taps.append((timezone.localtime(log.waktu), log.tipe_punch))

    # Ekstraksi Jam Masuk & Jam Pulang dari Taps
    if taps:
        # Urutkan berdasarkan waktu
        taps.sort(key=lambda x: x[0])

        if is_overnight:
            evening_taps = [t[0] for t in taps if t[0].date() == target_date]
            morning_taps = [t[0] for t in taps if t[0].date() == target_date + timedelta(days=1)]

            if evening_taps:
                jam_masuk = evening_taps[0].time()
            if morning_taps:
                jam_pulang = morning_taps[-1].time()
        else:
            # Shift normal di hari yang sama
            times_only = [t[0] for t in taps]
            first_tap_dt = times_only[0]
            last_tap_dt = times_only[-1]
            tap_spread_seconds = (last_tap_dt - first_tap_dt).total_seconds()

            # Pisahkan punch bertipe check-in dan check-out jika ada
            checkin_taps = [t[0] for t in taps if str(t[1]) == '0']
            checkout_taps = [t[0] for t in taps if str(t[1]) == '1']

            # Jika semua tap terkumpul dalam rentang waktu singkat (< 45 menit, misal tap berulang saat datang / pulang):
            if tap_spread_seconds < 2700:
                # Tentukan apakah cluster tap ini adalah kedatangan (masuk) atau kepulangan (pulang)
                is_closer_to_pulang = False

                if shift and shift.jam_masuk and shift.jam_pulang:
                    t_in_sec = shift.jam_masuk.hour * 3600 + shift.jam_masuk.minute * 60 + shift.jam_masuk.second
                    t_out_sec = shift.jam_pulang.hour * 3600 + shift.jam_pulang.minute * 60 + shift.jam_pulang.second
                    t_first_sec = first_tap_dt.hour * 3600 + first_tap_dt.minute * 60 + first_tap_dt.second
                    t_last_sec = last_tap_dt.hour * 3600 + last_tap_dt.minute * 60 + last_tap_dt.second

                    dist_in = abs(t_first_sec - t_in_sec)
                    dist_out = abs(t_last_sec - t_out_sec)
                    if dist_out < dist_in:
                        is_closer_to_pulang = True
                else:
                    # Default: jika tap terjadi pukul 12:00 ke atas
                    if first_tap_dt.hour >= 12:
                        is_closer_to_pulang = True

                if is_closer_to_pulang:
                    jam_pulang = last_tap_dt.time()
                    jam_masuk = None
                    catatan_parts.append("Tidak tap masuk")
                else:
                    jam_masuk = first_tap_dt.time()
                    jam_pulang = None
                    if target_date == timezone.localdate():
                        catatan_parts.append("Sedang berdinas")
                    else:
                        catatan_parts.append("Tidak tap pulang")
            else:
                # Taps terpisah >= 45 menit (memenuhi syarat jam masuk dan jam pulang)
                if checkin_taps and checkout_taps and (checkout_taps[-1] - checkin_taps[0]).total_seconds() >= 2700:
                    jam_masuk = checkin_taps[0].time()
                    jam_pulang = checkout_taps[-1].time()
                else:
                    jam_masuk = first_tap_dt.time()
                    jam_pulang = last_tap_dt.time()

    # 3. KALKULASI KETERLAMBATAN & PULANG CEPAT (Mengikuti Rumus Excel Kolom J & K)
    toleransi_telat = shift.toleransi_terlambat_menit if shift else 0
    toleransi_pulang = shift.toleransi_pulang_cepat_menit if shift else 0
    is_terlambat = False

    if jam_masuk and shift and shift.jam_masuk:
        dt_act_in = datetime.datetime.combine(target_date, jam_masuk)
        dt_exp_in = datetime.datetime.combine(target_date, shift.jam_masuk)

        if shift.batas_tepat_waktu is not None:
            dt_cutoff = datetime.datetime.combine(target_date, shift.batas_tepat_waktu)
            if dt_act_in > dt_cutoff:
                is_terlambat = True
                diff_mins = max(0, int((dt_act_in - dt_exp_in).total_seconds() // 60))
                menit_keterlambatan = diff_mins
                catatan_parts.append(f"Terlambat {menit_keterlambatan}m")
        else:
            if dt_act_in > dt_exp_in:
                diff_mins = int((dt_act_in - dt_exp_in).total_seconds() // 60)
                if diff_mins > toleransi_telat:
                    is_terlambat = True
                    menit_keterlambatan = diff_mins
                    catatan_parts.append(f"Terlambat {menit_keterlambatan}m")

    if jam_pulang and shift and shift.jam_pulang:
        if is_overnight:
            dt_act_out = datetime.datetime.combine(target_date + timedelta(days=1), jam_pulang)
            dt_exp_out = datetime.datetime.combine(target_date + timedelta(days=1), shift.jam_pulang)
        else:
            dt_act_out = datetime.datetime.combine(target_date, jam_pulang)
            dt_exp_out = datetime.datetime.combine(target_date, shift.jam_pulang)

        if dt_act_out < dt_exp_out:
            early_diff = int((dt_exp_out - dt_act_out).total_seconds() / 60)
            if early_diff > toleransi_pulang:
                menit_pulang_cepat = early_diff
                catatan_parts.append(f"Pulang cepat {menit_pulang_cepat}m")

    # 4. TOTAL JAM KERJA
    if jam_masuk and jam_pulang:
        if is_overnight:
            in_dt = datetime.datetime.combine(target_date, jam_masuk)
            out_dt = datetime.datetime.combine(target_date + timedelta(days=1), jam_pulang)
        else:
            in_dt = datetime.datetime.combine(target_date, jam_masuk)
            out_dt = datetime.datetime.combine(target_date, jam_pulang)

        if out_dt > in_dt:
            sec_work = (out_dt - in_dt).total_seconds()
            total_jam_kerja = Decimal(str(round(sec_work / 3600.0, 2)))

    # 5. STATUS PRESENSI AKHIR
    if not jam_masuk and not jam_pulang:
        status = 'tidak_hadir'
        catatan_parts.append('Belum Tap / Alfa')
    elif is_terlambat or menit_keterlambatan > 0:
        status = 'terlambat'
    elif menit_pulang_cepat > 0:
        status = 'pulang_cepat'
    else:
        status = 'hadir'

    # 6. PERIKSA IZIN KELUAR (IMTK)
    if izin_keluar is None and pegawai.user_id:
        izin_keluar = IzinKeluar.objects.filter(
            user_id=pegawai.user_id,
            tanggal=target_date,
            status__in=['disetujui', 'berjalan', 'selesai']
        ).first()

    return {
        'pegawai': pegawai,
        'user': pegawai.user,
        'tanggal': target_date,
        'shift': shift,
        'jadwal_dinas': jadwal,
        'jam_masuk': jam_masuk,
        'jam_pulang': jam_pulang,
        'status': status,
        'menit_keterlambatan': menit_keterlambatan,
        'menit_pulang_cepat': menit_pulang_cepat,
        'total_jam_kerja': total_jam_kerja,
        'izin_keluar': izin_keluar,
        'catatan': ', '.join(catatan_parts) if catatan_parts else 'Hadir Tepat Waktu'
    }


def process_attendance_for_date_range(start_date, end_date, pegawai_ids=None):
    """
    Menjalankan Attendance Engine untuk rentang tanggal tertentu.
    Memproses semua pegawai aktif secara efisien dengan batch lookup.
    """
    pegawai_qs = Pegawai.objects.filter(is_active=True).select_related('user')
    if pegawai_ids:
        pegawai_qs = pegawai_qs.filter(id__in=pegawai_ids)

    pegawai_list = list(pegawai_qs)
    if not pegawai_list:
        return {'processed': 0, 'created_or_updated': 0}

    # Pre-fetch semua JadwalDinas pada rentang tanggal (+ 1 hari buffer)
    buffer_end = end_date + timedelta(days=1)
    jadwal_map = {}
    for j in JadwalDinas.objects.filter(tanggal__gte=start_date, tanggal__lte=buffer_end, pegawai__in=pegawai_list).select_related('shift'):
        jadwal_map[(j.pegawai_id, j.tanggal)] = j

    # Pre-fetch semua LogPresensi pada rentang tanggal (+ 1 hari buffer)
    start_dt = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time(0, 0)))
    end_dt = timezone.make_aware(datetime.datetime.combine(buffer_end, datetime.time(23, 59, 59)))
    
    # Map PIN -> pegawai_id untuk mencocokkan log mesin yang belum terhubung relasi langsung
    pin_to_pegawai_id = {}
    for p in pegawai_list:
        if p.pin:
            p_str = str(p.pin).strip()
            pin_to_pegawai_id[p_str] = p.id
            pin_to_pegawai_id[p_str.lstrip('0') or '0'] = p.id
            pin_to_pegawai_id[p_str.zfill(3)] = p.id
            pin_to_pegawai_id[p_str.zfill(4)] = p.id

    logs_map = {}  # pegawai_id -> list of LogPresensi
    for log in LogPresensi.objects.filter(waktu__gte=start_dt, waktu__lte=end_dt).order_by('waktu'):
        pid = log.pegawai_id or pin_to_pegawai_id.get(log.pin)
        if pid:
            logs_map.setdefault(pid, []).append(log)

    # Pre-fetch semua IzinKeluar (IMTK) pada rentang tanggal
    izin_map = {}
    user_ids = [p.user_id for p in pegawai_list if p.user_id]
    if user_ids:
        for ik in IzinKeluar.objects.filter(
            user_id__in=user_ids,
            tanggal__gte=start_date,
            tanggal__lte=end_date,
            status__in=['disetujui', 'berjalan', 'selesai']
        ):
            izin_map[(ik.user_id, ik.tanggal)] = ik

    current_date = start_date
    records_to_save = []
    
    while current_date <= end_date:
        for p in pegawai_list:
            jadwal = jadwal_map.get((p.id, current_date))
            p_logs = logs_map.get(p.id, [])
            ik = izin_map.get((p.user_id, current_date)) if p.user_id else None
            rec = calculate_attendance_record(p, current_date, jadwal=jadwal, logs_for_pegawai=p_logs, izin_keluar=ik)
            records_to_save.append(rec)
        current_date += timedelta(days=1)

    # Simpan atau update ke PresensiHarian menggunakan bulk operations berkecepatan tinggi
    existing_records = {
        (p.pegawai_id, p.tanggal): p
        for p in PresensiHarian.objects.filter(
            tanggal__gte=start_date,
            tanggal__lte=end_date,
            pegawai__in=pegawai_list
        )
    }

    to_create = []
    to_update = []
    status_breakdown = {}

    for item in records_to_save:
        st = item['status']
        status_breakdown[st] = status_breakdown.get(st, 0) + 1
        key = (item['pegawai'].id, item['tanggal'])

        if key in existing_records:
            obj = existing_records[key]
            obj.user = item['user']
            obj.shift = item['shift']
            obj.jadwal_dinas = item['jadwal_dinas']
            obj.jam_masuk = item['jam_masuk']
            obj.jam_pulang = item['jam_pulang']
            obj.status = item['status']
            obj.menit_keterlambatan = item['menit_keterlambatan']
            obj.menit_pulang_cepat = item['menit_pulang_cepat']
            obj.total_jam_kerja = item['total_jam_kerja']
            obj.izin_keluar = item['izin_keluar']
            obj.catatan = item['catatan']
            to_update.append(obj)
        else:
            to_create.append(PresensiHarian(
                pegawai=item['pegawai'],
                tanggal=item['tanggal'],
                user=item['user'],
                shift=item['shift'],
                jadwal_dinas=item['jadwal_dinas'],
                jam_masuk=item['jam_masuk'],
                jam_pulang=item['jam_pulang'],
                status=item['status'],
                menit_keterlambatan=item['menit_keterlambatan'],
                menit_pulang_cepat=item['menit_pulang_cepat'],
                total_jam_kerja=item['total_jam_kerja'],
                izin_keluar=item['izin_keluar'],
                catatan=item['catatan']
            ))

    with transaction.atomic():
        if to_create:
            PresensiHarian.objects.bulk_create(to_create, batch_size=1000)
        if to_update:
            PresensiHarian.objects.bulk_update(
                to_update,
                fields=[
                    'user', 'shift', 'jadwal_dinas', 'jam_masuk', 'jam_pulang',
                    'status', 'menit_keterlambatan', 'menit_pulang_cepat',
                    'total_jam_kerja', 'izin_keluar', 'catatan'
                ],
                batch_size=1000
            )

    return {
        'status': 'success',
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'total_pegawai': len(pegawai_list),
        'total_processed': len(records_to_save),
        'created': len(to_create),
        'updated': len(to_update),
        'status_breakdown': status_breakdown
    }


def verify_engine_against_excel_october(sample_pins=None):
    """
    Memvalidasi hasil perhitungan Attendance Engine terhadap sheet 'ABSENSI' Excel Oktober 2026.
    Memeriksa akurasi jam masuk, jam pulang, dan status kehadiran.
    """
    import openpyxl

    excel_path = '/app/excel_oktober.xlsm'
    if not os.path.exists(excel_path):
        excel_path = 'excel_oktober.xlsm'

    wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
    ws = wb['ABSENSI']

    # Sample test PINs
    if not sample_pins:
        sample_pins = ['001']

    # Verifikasi untuk PIN 001 (dr. Sadik)
    results = []
    pegawai = Pegawai.objects.filter(pin__in=['001', '1']).first()
    if not pegawai:
        return {'status': 'error', 'message': 'Pegawai PIN 001 tidak ditemukan'}

    for r in range(25, 56):
        tgl_cell = ws.cell(r, 2).value
        shift_cell = ws.cell(r, 5).value
        status_in_cell = ws.cell(r, 10).value
        status_out_cell = ws.cell(r, 16).value
        
        if isinstance(tgl_cell, (datetime.datetime, datetime.date)):
            tgl = tgl_cell.date() if isinstance(tgl_cell, datetime.datetime) else tgl_cell
            
            # Hitung dengan engine
            engine_res = calculate_attendance_record(pegawai, tgl)
            
            results.append({
                'tanggal': tgl.isoformat(),
                'shift_excel': shift_cell,
                'shift_engine': engine_res['shift'].kode if engine_res['shift'] else None,
                'jam_masuk_engine': str(engine_res['jam_masuk']) if engine_res['jam_masuk'] else '-',
                'jam_pulang_engine': str(engine_res['jam_pulang']) if engine_res['jam_pulang'] else '-',
                'status_in_excel': status_in_cell,
                'status_engine': engine_res['status'],
                'menit_telat': engine_res['menit_keterlambatan'],
                'catatan': engine_res['catatan']
            })

    return {
        'pegawai': pegawai.nama,
        'pin': pegawai.pin,
        'total_hari': len(results),
        'detail': results
    }

