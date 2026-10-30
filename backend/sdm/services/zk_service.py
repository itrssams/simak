import datetime
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from zk import ZK

from ..models import MesinAbsen, KaryawanMesinMapping, LogPresensi, PresensiHarian, IzinKeluar

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


def sync_mesin_absen(mesin_id=None):
    """
    Menghubungkan ke Mesin Absen (ZKTeco/Secure S-IPC via port 4370)
    Tarik data User dan data riwayat Tap Presensi ke database SIMAK.
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

    zk = ZK(mesin.ip_address, port=mesin.port, timeout=5, password=mesin.comm_key, force_udp=False, ommit_ping=True)
    conn = None

    try:
        conn = zk.connect()
        
        # 1. Update Device Info
        try:
            mesin.device_name = conn.get_device_name() or 'S-IPC'
            mesin.serial_number = conn.get_serialnumber() or ''
            mesin.mac_address = conn.get_mac() or ''
        except Exception:
            pass
            
        mesin.status_koneksi = 'connected'

        # 2. Tarik Users dari Mesin
        users_from_machine = conn.get_users()
        mesin.total_user_mesin = len(users_from_machine)
        
        users_synced_count = 0
        auto_matched_count = 0
        
        for u in users_from_machine:
            pin = str(u.user_id).strip()
            name = str(u.name).strip() if u.name else ''
            
            mapping, created = KaryawanMesinMapping.objects.get_or_create(
                mesin=mesin,
                pin=pin,
                defaults={'nama_di_mesin': name}
            )
            
            # Update nama jika ada perubahan di mesin
            if mapping.nama_di_mesin != name and name:
                mapping.nama_di_mesin = name
                mapping.save(update_fields=['nama_di_mesin'])
                
            # Jika belum dipasangkan dengan User SIMAK, coba auto-match
            if not mapping.user and name:
                matched_user = auto_match_user_by_name(name)
                if matched_user:
                    mapping.user = matched_user
                    mapping.save(update_fields=['user'])
                    auto_matched_count += 1
                    
            users_synced_count += 1

        # 3. Cache Mapping PIN -> User ID
        pin_to_user_map = dict(
            KaryawanMesinMapping.objects.filter(mesin=mesin, user__isnull=False)
            .values_list('pin', 'user_id')
        )

        # 4. Tarik Log Absensi (Attendance Records)
        attendances = conn.get_attendance()
        mesin.total_log_mesin = len(attendances)
        
        new_logs_count = 0
        affected_user_dates = set()

        for att in attendances:
            pin = str(att.user_id).strip()
            waktu = att.timestamp
            
            if timezone.is_naive(waktu):
                waktu_aware = timezone.make_aware(waktu, timezone.get_current_timezone())
            else:
                waktu_aware = waktu

            user_id = pin_to_user_map.get(pin)

            # Buat record log baru jika belum ada
            log_obj, created = LogPresensi.objects.get_or_create(
                pin=pin,
                waktu=waktu_aware,
                defaults={
                    'mesin': mesin,
                    'user_id': user_id,
                    'status_verifikasi': getattr(att, 'status', 1),
                    'tipe_punch': getattr(att, 'punch', 0),
                }
            )
            
            # Jika log lama belum ada user_id-nya dan sekarang sudah ter-mapping, update user_id
            if not log_obj.user_id and user_id:
                log_obj.user_id = user_id
                log_obj.save(update_fields=['user'])
                created = True # Trigger recalculate
                
            if created:
                new_logs_count += 1
                if user_id:
                    affected_user_dates.add((user_id, waktu_aware.date()))

        # 5. Hitung Ulang Agregasi Presensi Harian untuk User & Tanggal Terkait
        updated_daily_count = 0
        for user_id, tgl in affected_user_dates:
            recalculate_presensi_harian(user_id, tgl)
            updated_daily_count += 1

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
            'total_users_machine': len(users_from_machine),
            'auto_matched_users': auto_matched_count,
            'total_logs_machine': len(attendances),
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
