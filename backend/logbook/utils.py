from datetime import datetime, date, time, timedelta

# Jadwal Jam Kerja RS Siaga Al Munawwarah
# weekday(): 0=Senin, 1=Selasa, ..., 5=Sabtu, 6=Minggu
JADWAL_KERJA = {
    0: (time(8, 0), time(16, 0)),   # Senin    08:00 - 16:00
    1: (time(8, 0), time(16, 0)),   # Selasa   08:00 - 16:00
    2: (time(8, 0), time(16, 0)),   # Rabu     08:00 - 16:00
    3: (time(8, 0), time(16, 0)),   # Kamis    08:00 - 16:00
    4: (time(8, 0), time(16, 0)),   # Jumat    08:00 - 16:00
    5: (time(8, 0), time(13, 0)),   # Sabtu    08:00 - 13:00
    6: None,                        # Minggu   LIBUR
}

def hitung_durasi_sesi(dt_mulai, dt_selesai):
    """
    Menghitung durasi jam kerja dan durasi lembur (dalam menit)
    berdasarkan JADWAL_KERJA antara dt_mulai dan dt_selesai.
    Kedua parameter harus berupa datetime timezone-aware (local time).
    """
    total_kerja = 0
    total_lembur = 0

    if not dt_mulai or not dt_selesai or dt_selesai <= dt_mulai:
        return 0, 0

    current_date = dt_mulai.date()
    end_date = dt_selesai.date()

    # Hapus tzinfo sementara untuk mempermudah math
    dt_mulai = dt_mulai.replace(tzinfo=None)
    dt_selesai = dt_selesai.replace(tzinfo=None)

    while current_date <= end_date:
        if current_date == dt_mulai.date():
            start_time = dt_mulai.time()
        else:
            start_time = time(0, 0)

        sesi_start_dt = max(datetime.combine(current_date, start_time), dt_mulai)
        
        if current_date == dt_selesai.date():
            sesi_end_dt = dt_selesai
        else:
            sesi_end_dt = datetime.combine(current_date + timedelta(days=1), time(0, 0))

        menit_sesi = int((sesi_end_dt - sesi_start_dt).total_seconds() // 60)
        
        if menit_sesi <= 0:
            current_date += timedelta(days=1)
            continue

        jadwal = JADWAL_KERJA.get(current_date.weekday())

        if jadwal is None:
            # Libur -> seluruhnya lembur
            total_lembur += menit_sesi
        else:
            jam_masuk, jam_pulang = jadwal
            # Konversi jam_masuk dan jam_pulang menjadi datetime hari ini
            jadwal_start_dt = datetime.combine(current_date, jam_masuk)
            jadwal_end_dt = datetime.combine(current_date, jam_pulang)

            # Hitung irisan (overlap)
            overlap_start = max(sesi_start_dt, jadwal_start_dt)
            overlap_end = min(sesi_end_dt, jadwal_end_dt)

            overlap_secs = (overlap_end - overlap_start).total_seconds()
            
            if overlap_secs > 0:
                menit_kerja = int(overlap_secs // 60)
            else:
                menit_kerja = 0

            menit_lembur = menit_sesi - menit_kerja
            
            total_kerja += menit_kerja
            total_lembur += menit_lembur

        current_date += timedelta(days=1)

    return total_kerja, total_lembur
