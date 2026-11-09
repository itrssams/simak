import time
import threading
import logging
import datetime
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from zk import ZK

from ..models import MesinAbsen, KaryawanMesinMapping, LogPresensi, PresensiHarian, IzinKeluar, Pegawai

logger = logging.getLogger(__name__)
User = get_user_model()


def auto_match_user_by_name(name_on_machine):
    """
    Mencoba mencocokkan nama dari mesin absen dengan User SIMAK
    berdasarkan username, nama lengkap, atau substring kata.
    """
    if not name_on_machine:
        return None
    
    clean_name = name_on_machine.strip().lower()
    
    # 1. Coba exact username match
    user = User.objects.filter(is_active=True, username__iexact=clean_name).first()
    if user:
        return user
    
    # 2. Coba exact first_name or last_name match
    user = User.objects.filter(is_active=True).filter(
        first_name__iexact=clean_name
    ).first()
    if user:
        return user
        
    user = User.objects.filter(is_active=True).filter(
        last_name__iexact=clean_name
    ).first()
    if user:
        return user

    # 3. Coba substring pencarian di nama lengkap
    candidates = []
    for u in User.objects.filter(is_active=True):
        full = f"{u.first_name} {u.last_name}".lower()
        if clean_name in full or full in clean_name:
            candidates.append(u)
            
    if len(candidates) == 1:
        return candidates[0]
        
    return None


def determine_tap_type(waktu_tap, presensi):
    """
    Menentukan apakah suatu tap presensi merupakan tap 'masuk' atau 'pulang'.
    """
    if not presensi or not presensi.jam_masuk:
        return 'masuk'

    tap_time = waktu_tap.time()
    tgl = waktu_tap.date()
    
    dt_tap = datetime.datetime.combine(tgl, tap_time)
    dt_in = datetime.datetime.combine(tgl, presensi.jam_masuk)
    diff_in = abs((dt_tap - dt_in).total_seconds())

    if presensi.jam_pulang:
        dt_out = datetime.datetime.combine(tgl, presensi.jam_pulang)
        diff_out = abs((dt_tap - dt_out).total_seconds())
        if diff_out <= 300:
            return 'pulang'

    if diff_in <= 300:
        return 'masuk'

    if (dt_tap - dt_in).total_seconds() >= 2700:
        return 'pulang'

    return 'masuk'


def sync_mesin_absen(mesin_id=None, sync_users=False, force_all_logs=False):
    """
    Menghubungkan ke Mesin Absen (ZKTeco/Secure S-IPC via port 4370)
    Tarik data User dan data riwayat Tap Presensi ke database SIMAK.
    Mendukung fast-poll (sync_users=False) untuk deteksi real-time < 5 detik.
    """
    if mesin_id:
        mesin = MesinAbsen.objects.filter(id=mesin_id).first()
    else:
        mesin = MesinAbsen.objects.filter(is_active=True).first()
        
    if not mesin:
        mesin = MesinAbsen.objects.create(
            nama='Mesin Absen Utama (S-IPC)',
            ip_address='192.168.44.120',
            port=4370,
            comm_key=0,
            is_active=True
        )

    zk = ZK(mesin.ip_address, port=mesin.port, timeout=4, password=mesin.comm_key, force_udp=False, ommit_ping=True)
    conn = None

    try:
        conn = zk.connect()
        
        # 1. Update Device Info & Read Sizes
        try:
            conn.read_sizes()
            mesin.device_name = conn.get_device_name() or 'S-IPC'
            mesin.serial_number = conn.get_serialnumber() or ''
            mesin.mac_address = conn.get_mac() or ''
        except Exception:
            pass
            
        mesin.status_koneksi = 'connected'
        total_logs_in_machine = getattr(conn, 'records', None)

        # FAST CHECK: Jika tidak minta sync users dan tidak ada log baru di mesin, selesai instan (< 150ms)!
        if not force_all_logs and not sync_users and total_logs_in_machine is not None and mesin.total_log_mesin is not None:
            if total_logs_in_machine == mesin.total_log_mesin:
                mesin.last_sync_at = timezone.now()
                mesin.save(update_fields=['status_koneksi', 'last_sync_at'])
                return {
                    'success': True,
                    'message': 'Tidak ada log baru (up to date).',
                    'mesin': {
                        'id': mesin.id,
                        'nama': mesin.nama,
                        'ip_address': mesin.ip_address,
                        'status_koneksi': mesin.status_koneksi,
                        'last_sync_at': mesin.last_sync_at.isoformat(),
                    },
                    'total_logs_machine': total_logs_in_machine,
                    'new_logs_saved': 0,
                    'updated_daily_presensi': 0,
                }

        # 2. Tarik Users dari Mesin (Hanya jika diminta atau belum pernah ada data)
        auto_matched_count = 0
        users_from_machine = []
        if sync_users or not mesin.total_user_mesin:
            users_from_machine = conn.get_users()
            mesin.total_user_mesin = len(users_from_machine)
            
            for u in users_from_machine:
                pin = str(u.user_id).strip()
                name = str(u.name).strip() if u.name else ''
                
                mapping, created = KaryawanMesinMapping.objects.get_or_create(
                    mesin=mesin,
                    pin=pin,
                    defaults={'nama_di_mesin': name}
                )
                
                if mapping.nama_di_mesin != name and name:
                    mapping.nama_di_mesin = name
                    mapping.save(update_fields=['nama_di_mesin'])
                    
                if not mapping.pegawai:
                    pegawai_obj = Pegawai.objects.filter(pin=pin).first()
                    if pegawai_obj:
                        mapping.pegawai = pegawai_obj
                        if not mapping.user and pegawai_obj.user:
                            mapping.user = pegawai_obj.user
                        mapping.save(update_fields=['pegawai', 'user'])

                if not mapping.user and name:
                    matched_user = auto_match_user_by_name(name)
                    if matched_user:
                        mapping.user = matched_user
                        mapping.save(update_fields=['user'])
                        auto_matched_count += 1

        # 3. Cache Mapping PIN -> Pegawai & User ID
        from ..attendance_engine import build_pegawai_pin_map, process_attendance_for_date_range
        pegawai_pin_map = build_pegawai_pin_map()
        pin_to_user_map = dict(
            KaryawanMesinMapping.objects.filter(mesin=mesin, user__isnull=False)
            .values_list('pin', 'user_id')
        )

        # 4. Tarik Log Absensi (Attendance Records)
        all_attendances = conn.get_attendance()
        mesin.total_log_mesin = len(all_attendances)
        
        # Jika bukan force_all_logs, proses log terbaru (terutama hari ini)
        if not force_all_logs and len(all_attendances) > 50:
            attendances = all_attendances[-50:]
        else:
            attendances = all_attendances

        new_logs_count = 0
        affected_dates = set()
        affected_user_dates = set()
        new_today_logs = []
        today_date = timezone.localdate()

        for att in attendances:
            pin = str(att.user_id).strip()
            waktu = att.timestamp
            
            if timezone.is_naive(waktu):
                waktu_aware = timezone.make_aware(waktu, timezone.get_current_timezone())
            else:
                waktu_aware = waktu

            waktu_local = timezone.localtime(waktu_aware)

            pegawai_obj = pegawai_pin_map.get(pin) or pegawai_pin_map.get(pin.lstrip('0') or '0') or pegawai_pin_map.get(pin.zfill(3)) or pegawai_pin_map.get(pin.zfill(4))
            pegawai_id = pegawai_obj.id if pegawai_obj else None
            user_id = pin_to_user_map.get(pin) or (pegawai_obj.user_id if pegawai_obj else None)

            # Buat record log baru jika belum ada
            log_obj, created = LogPresensi.objects.get_or_create(
                pin=pin,
                waktu=waktu_aware,
                defaults={
                    'mesin': mesin,
                    'pegawai_id': pegawai_id,
                    'user_id': user_id,
                    'status_verifikasi': getattr(att, 'status', 1),
                    'tipe_punch': getattr(att, 'punch', 0),
                }
            )
            
            # Jika log lama belum ada pegawai/user dan sekarang sudah ada
            update_fields = []
            if not log_obj.pegawai_id and pegawai_id:
                log_obj.pegawai_id = pegawai_id
                update_fields.append('pegawai')
            if not log_obj.user_id and user_id:
                log_obj.user_id = user_id
                update_fields.append('user')
                created = True # Trigger recalculate
            if update_fields:
                log_obj.save(update_fields=update_fields)
                
            if created:
                new_logs_count += 1
                affected_dates.add(waktu_local.date())
                if user_id:
                    affected_user_dates.add((user_id, waktu_local.date()))
                
                # Kumpulkan tap baru hari ini untuk notifikasi Telegram
                if waktu_local.date() == today_date and pegawai_obj:
                    new_today_logs.append({
                        'pegawai': pegawai_obj,
                        'waktu_local': waktu_local,
                        'mesin_nama': mesin.nama
                    })

        # 5. Hitung Ulang Agregasi Presensi Harian menggunakan Attendance Engine RS
        updated_daily_count = 0
        if affected_dates:
            min_date = min(affected_dates)
            max_date = max(affected_dates)
            try:
                engine_res = process_attendance_for_date_range(min_date, max_date)
                updated_daily_count = engine_res.get('processed', 0)
            except Exception as eng_err:
                for u_id, tgl in affected_user_dates:
                    recalculate_presensi_harian(u_id, tgl)
                    updated_daily_count += 1

        # 6. Kirim Notifikasi Telegram Presensi Otomatis untuk Tap Hari Ini
        if new_today_logs:
            try:
                from .telegram_service import (
                    notify_presensi_telegram,
                    notify_sdm_tembusan,
                    is_monitored_for_sdm_tembusan
                )
                notified_keys = set()
                notified_sdm_keys = set()

                for item in new_today_logs:
                    pegawai = item['pegawai']
                    waktu_tap = item['waktu_local']
                    mesin_nama = item['mesin_nama']

                    presensi = PresensiHarian.objects.filter(pegawai=pegawai, tanggal=today_date).first()
                    tipe = determine_tap_type(waktu_tap, presensi)
                    notify_key = (pegawai.id, tipe)

                    # A. Notifikasi ke Pegawai yang bersangkutan (jika akun Telegram aktif)
                    if getattr(pegawai, 'telegram_chat_id', None) and getattr(pegawai, 'telegram_notif_aktif', True):
                        if notify_key not in notified_keys:
                            notify_presensi_telegram(
                                pegawai=pegawai,
                                waktu_tap=waktu_tap,
                                tipe=tipe,
                                presensi_harian=presensi,
                                mesin_nama=mesin_nama
                            )
                            notified_keys.add(notify_key)

                    # B. Tembusan Otomatis ke SDM (Pak Saleh) jika pegawai dalam radar pantauan (Radiologi / Fasa testing)
                    if is_monitored_for_sdm_tembusan(pegawai):
                        if notify_key not in notified_sdm_keys:
                            notify_sdm_tembusan(
                                pegawai=pegawai,
                                waktu_tap=waktu_tap,
                                tipe=tipe,
                                presensi_harian=presensi,
                                mesin_nama=mesin_nama
                            )
                            notified_sdm_keys.add(notify_key)

            except Exception as notif_err:
                logger.warning(f"[SyncMesin] Gagal kirim notifikasi Telegram: {str(notif_err)}")

        mesin.last_sync_at = timezone.now()
        mesin.save()

        return {
            'success': True,
            'message': 'Sinkronisasi mesin absen berhasil.',
            'mesin': {
                'id': mesin.id,
                'nama': mesin.nama,
                'ip_address': mesin.ip_address,
                'status_koneksi': mesin.status_koneksi,
                'serial_number': mesin.serial_number,
                'last_sync_at': mesin.last_sync_at.isoformat(),
            },
            'total_users_machine': len(users_from_machine) if users_from_machine else mesin.total_user_mesin,
            'auto_matched_users': auto_matched_count,
            'total_logs_machine': len(all_attendances),
            'new_logs_saved': new_logs_count,
            'updated_daily_presensi': updated_daily_count,
        }

    except Exception as e:
        mesin.status_koneksi = 'error'
        mesin.save(update_fields=['status_koneksi'])
        return {
            'success': False,
            'message': f"Gagal sinkronisasi mesin absen: {str(e)}",
            'mesin_id': mesin.id,
        }
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass




def recalculate_presensi_harian(user_id, tanggal):
    """
    Menghitung agregasi presensi harian untuk seorang pegawai pada tanggal tertentu
    berdasarkan log tap mesin absen dan status Izin Meninggalkan Kerja.
    """
    user = User.objects.filter(id=user_id).first()
    if not user:
        return None

    # Ambil semua log tap pegawai pada tanggal tersebut (urut waktu asc)
    start_dt = timezone.make_aware(datetime.datetime.combine(tanggal, datetime.time.min))
    end_dt = timezone.make_aware(datetime.datetime.combine(tanggal, datetime.time.max))

    logs = LogPresensi.objects.filter(
        user_id=user_id,
        waktu__range=(start_dt, end_dt)
    ).order_by('waktu')

    if not logs.exists():
        return None

    first_punch = timezone.localtime(logs.first().waktu)
    last_punch = timezone.localtime(logs.last().waktu) if logs.count() > 1 else None

    jam_masuk = first_punch.time()
    jam_pulang = last_punch.time() if last_punch else None

    # Standar Jam Kerja Rumah Sakit (Shift Normal):
    # Jam masuk standar: 08:00, toleransi s/d 08:15
    standar_masuk = datetime.time(8, 0, 0)
    toleransi_masuk = datetime.time(8, 15, 0)
    standar_pulang = datetime.time(16, 0, 0)

    menit_terlambat = 0
    if jam_masuk > toleransi_masuk:
        diff_menit = (jam_masuk.hour - 8) * 60 + jam_masuk.minute
        menit_terlambat = max(0, diff_menit)

    menit_pulang_cepat = 0
    if jam_pulang and jam_pulang < standar_pulang:
        diff_pulang = (16 - jam_pulang.hour) * 60 - jam_pulang.minute
        menit_pulang_cepat = max(0, diff_pulang)

    # Hitung total jam kerja
    total_jam_kerja = 0.0
    if jam_pulang:
        delta = datetime.datetime.combine(tanggal, jam_pulang) - datetime.datetime.combine(tanggal, jam_masuk)
        total_jam_kerja = round(delta.total_seconds() / 3600.0, 2)

    # Tentukan Status Kehadiran
    status_hadir = 'hadir'
    if menit_terlambat > 0:
        status_hadir = 'terlambat'
    elif menit_pulang_cepat > 0:
        status_hadir = 'pulang_cepat'

    # Cek apakah ada Izin Meninggalkan Kerja pada tanggal ini
    izin = IzinKeluar.objects.filter(
        user_id=user_id,
        tanggal=tanggal,
        status__in=['disetujui', 'selesai', 'berjalan']
    ).first()

    if izin:
        status_hadir = 'izin_keluar'

    presensi_obj, _ = PresensiHarian.objects.update_or_create(
        user=user,
        tanggal=tanggal,
        defaults={
            'jam_masuk': jam_masuk,
            'jam_pulang': jam_pulang,
            'status': status_hadir,
            'menit_keterlambatan': menit_terlambat,
            'menit_pulang_cepat': menit_pulang_cepat,
            'total_jam_kerja': total_jam_kerja,
            'izin_keluar': izin,
        }
    )

    return presensi_obj


_SCHEDULER_RUNNING = False

def sync_semua_mesin_aktif(sync_users=False, force_all_logs=False):
    """
    Menyinkronkan seluruh mesin absensi aktif secara berurutan.
    """
    active_machines = MesinAbsen.objects.filter(is_active=True).order_by('id')
    results = []
    for m in active_machines:
        try:
            res = sync_mesin_absen(mesin_id=m.id, sync_users=sync_users, force_all_logs=force_all_logs)
            results.append(res)
        except Exception as e:
            results.append({'mesin_id': m.id, 'success': False, 'message': str(e)})
    return results


def start_mesin_auto_sync_scheduler(interval_seconds=5):
    """
    Menjalankan background daemon thread yang secara berkala (default tiap 5 detik)
    menarik data presensi dari seluruh mesin absen aktif secara near-realtime.
    """
    global _SCHEDULER_RUNNING
    if _SCHEDULER_RUNNING:
        return
    _SCHEDULER_RUNNING = True

    def _loop():
        logger.info(f"[AutoSyncScheduler] Background auto-sync mesin absen berjalan REAL-TIME (tiap {interval_seconds}s)...")
        time.sleep(5)
        while True:
            try:
                sync_semua_mesin_aktif(sync_users=False, force_all_logs=False)
            except Exception as e:
                logger.warning(f"[AutoSyncScheduler] Sync loop error: {str(e)}")
            time.sleep(interval_seconds)

    thread = threading.Thread(target=_loop, daemon=True, name="MesinAbsenAutoSyncThread")
    thread.start()
    return thread


