from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from datetime import time, date
from sdm.models import IzinKeluar, IzinKeluarLog
from users.models import Unit

User = get_user_model()


class SdmIzinKeluarTestCase(TestCase):
    def setUp(self):
        self.unit = Unit.objects.create(nama='IT Center')
        self.user_karyawan = User.objects.create_user(
            username='karyawan1',
            password='password123',
            first_name='Karyawan',
            last_name='Satu',
            role='karyawan',
            unit=self.unit,
            is_sdm=False
        )
        self.user_sdm = User.objects.create_user(
            username='sdm_staff',
            password='password123',
            first_name='Staff',
            last_name='SDM',
            role='karyawan',
            unit=self.unit,
            is_sdm=True
        )
        self.user_lain = User.objects.create_user(
            username='karyawan2',
            password='password123',
            first_name='Karyawan',
            last_name='Dua',
            role='karyawan',
            unit=self.unit,
            is_sdm=False
        )
        self.client = APIClient()

    def test_create_izin_and_adjustment_and_return(self):
        # 1. Karyawan login & create izin
        self.client.force_authenticate(user=self.user_karyawan)
        payload = {
            'tanggal': str(date.today()),
            'kategori': 'dinas',
            'keperluan': 'Mengantar berkas dinas ke Dinkes',
            'jam_keluar': '09:00',
            'jam_kembali': '11:00',
        }
        res = self.client.post('/api/sdm/izin-keluar/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        izin_id = res.data['id']

        izin = IzinKeluar.objects.get(id=izin_id)
        self.assertEqual(izin.status, 'berjalan')
        self.assertEqual(str(izin.jam_keluar_awal)[:5], '09:00')
        self.assertEqual(str(izin.jam_kembali_awal)[:5], '11:00')
        self.assertEqual(izin.is_adjusted, False)

        # 2. Sesuaikan jam karena macet
        adjust_payload = {
            'jam_kembali': '12:30',
            'alasan_penyesuaian': 'Macet total di simpang jalan'
        }
        res_adj = self.client.post(f'/api/sdm/izin-keluar/{izin_id}/sesuaikan-jam/', adjust_payload, format='json')
        self.assertEqual(res_adj.status_code, status.HTTP_200_OK)

        izin.refresh_from_db()
        self.assertEqual(izin.is_adjusted, True)
        self.assertEqual(str(izin.jam_kembali)[:5], '12:30')
        # Waktu awal tetap terjaga
        self.assertEqual(str(izin.jam_kembali_awal)[:5], '11:00')

        # Cek log jejak audit
        self.assertEqual(izin.logs.count(), 1)
        log = izin.logs.first()
        self.assertEqual(str(log.jam_kembali_sebelum)[:5], '11:00')
        self.assertEqual(str(log.jam_kembali_sesudah)[:5], '12:30')
        self.assertEqual(log.alasan_penyesuaian, 'Macet total di simpang jalan')
        self.assertEqual(log.created_by, self.user_karyawan)

        # 3. Konfirmasi Kembali
        return_payload = {
            'jam_kembali_aktual': '12:25',
            'catatan_kembali': 'Urusan selesai tepat waktu setelah macet'
        }
        res_ret = self.client.post(f'/api/sdm/izin-keluar/{izin_id}/konfirmasi-kembali/', return_payload, format='json')
        self.assertEqual(res_ret.status_code, status.HTTP_200_OK)

        izin.refresh_from_db()
        self.assertEqual(izin.status, 'selesai')
        self.assertEqual(str(izin.jam_kembali_aktual)[:5], '12:25')

    def test_permission_and_visibility(self):
        # Buat izin untuk karyawan 1
        izin1 = IzinKeluar.objects.create(
            user=self.user_karyawan,
            tanggal=date.today(),
            kategori='dinas',
            keperluan='Dinas Luar 1',
            jam_keluar_awal=time(8, 0),
            jam_kembali_awal=time(10, 0),
            jam_keluar=time(8, 0),
            jam_kembali=time(10, 0),
            status='berjalan'
        )

        # Karyawan 2 login -> tidak boleh melihat izin milik karyawan 1
        self.client.force_authenticate(user=self.user_lain)
        res_lain = self.client.get('/api/sdm/izin-keluar/')
        self.assertEqual(res_lain.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_lain.data), 0)

        # Karyawan 2 tidak boleh export excel
        res_export_denied = self.client.get('/api/sdm/izin-keluar/export-excel/')
        self.assertEqual(res_export_denied.status_code, status.HTTP_403_FORBIDDEN)

        # Staf SDM login -> bisa melihat izin seluruh RS
        self.client.force_authenticate(user=self.user_sdm)
        res_sdm = self.client.get('/api/sdm/izin-keluar/')
        self.assertEqual(res_sdm.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_sdm.data), 1)
        self.assertEqual(res_sdm.data[0]['id'], izin1.id)

        # Staf SDM bisa export excel
        res_export_sdm = self.client.get('/api/sdm/izin-keluar/export-excel/')
        self.assertEqual(res_export_sdm.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res_export_sdm['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )


class JadwalRebuildAndEngineTestCase(TestCase):
    def setUp(self):
        import datetime
        from django.utils import timezone
        from sdm.models import Pegawai, Shift, JadwalMaster, JadwalKoreksi, JadwalDinas, LogPresensi

        self.pegawai = Pegawai.objects.create(
            nama='Nakes Uji',
            pin='9901',
            kategori='SHIFT',
            unit_kerja='IGD'
        )
        self.shift_p, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='P',
            defaults={
                'nama': 'Shift Pagi',
                'jam_masuk': time(7, 30),
                'jam_pulang': time(14, 30),
                'batas_tepat_waktu': time(7, 30, 0),
                'toleransi_terlambat_menit': 0,
                'is_libur': False,
            }
        )
        self.shift_s, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='S',
            defaults={
                'nama': 'Shift Siang',
                'jam_masuk': time(14, 30),
                'jam_pulang': time(21, 30),
                'batas_tepat_waktu': time(14, 30, 0),
                'toleransi_terlambat_menit': 0,
                'is_libur': False,
            }
        )
        self.shift_p1, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='P1',
            defaults={
                'nama': 'Pagi Non-Shift',
                'jam_masuk': time(8, 0),
                'jam_pulang': time(16, 0),
                'batas_tepat_waktu': time(8, 0, 59),
                'toleransi_terlambat_menit': 1,
                'is_libur': False,
            }
        )
        self.shift_p2, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='P2',
            defaults={
                'nama': 'Pagi Sabtu',
                'jam_masuk': time(8, 0),
                'jam_pulang': time(13, 0),
                'batas_tepat_waktu': time(7, 59, 59),
                'toleransi_terlambat_menit': 0,
                'is_libur': False,
            }
        )
        self.shift_ps, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='PS',
            defaults={
                'nama': 'Pagi-Siang',
                'jam_masuk': time(7, 0),
                'jam_pulang': time(21, 0),
                'batas_tepat_waktu': time(7, 30, 0),
                'toleransi_terlambat_menit': 0,
                'is_libur': False,
            }
        )
        self.shift_ip, _ = Shift.objects.update_or_create(
            kelompok='UMUM',
            kode='IP',
            defaults={
                'nama': 'Izin Pagi',
                'is_libur': True,
            }
        )
        self.shift_cs_p, _ = Shift.objects.update_or_create(
            kelompok='CS',
            kode='P',
            defaults={
                'nama': 'Pagi CS',
                'jam_masuk': time(7, 0),
                'jam_pulang': time(14, 0),
                'batas_tepat_waktu': time(7, 0, 0),
                'is_libur': False,
            }
        )

    def test_rebuild_master_koreksi_and_idempotency(self):
        from sdm.models import JadwalMaster, JadwalKoreksi, JadwalDinas
        from sdm.services.jadwal_service import rebuild_jadwal_final, validate_shift_for_pegawai

        tgl = date(2026, 10, 7)

        # (a) Hanya Master
        JadwalMaster.objects.create(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_p)
        res1 = rebuild_jadwal_final(pegawai_ids=[self.pegawai.id], start=tgl, end=tgl)
        self.assertEqual(res1['from_master'], 1)
        jd = JadwalDinas.objects.get(pegawai=self.pegawai, tanggal=tgl)
        self.assertEqual(jd.shift, self.shift_p)
        self.assertEqual(jd.shift_master, self.shift_p)
        self.assertEqual(jd.sumber, 'master')

        # (b) Master + Koreksi -> Koreksi menang
        kor = JadwalKoreksi.objects.create(
            pegawai=self.pegawai,
            tanggal=tgl,
            shift=self.shift_s,
            jenis='tukar_shift',
            alasan='Tukar dengan rekan'
        )
        res2 = rebuild_jadwal_final(pegawai_ids=[self.pegawai.id], start=tgl, end=tgl)
        self.assertEqual(res2['from_koreksi'], 1)
        jd.refresh_from_db()
        self.assertEqual(jd.shift, self.shift_s)
        self.assertEqual(jd.shift_master, self.shift_p)
        self.assertEqual(jd.sumber, 'koreksi')
        self.assertEqual(jd.koreksi, kor)

        # (d) Idempotent (jalankan ulang tanpa perubahan -> 0 create, 0 update)
        res_idem = rebuild_jadwal_final(pegawai_ids=[self.pegawai.id], start=tgl, end=tgl)
        self.assertEqual(res_idem['created'], 0)
        self.assertEqual(res_idem['updated'], 0)

        # (c) Koreksi dihapus -> kembali ke Master
        kor.delete()
        rebuild_jadwal_final(pegawai_ids=[self.pegawai.id], start=tgl, end=tgl)
        jd.refresh_from_db()
        self.assertEqual(jd.shift, self.shift_p)
        self.assertEqual(jd.sumber, 'master')
        self.assertIsNone(jd.koreksi)

        # Validasi kelompok shift
        with self.assertRaises(ValueError):
            validate_shift_for_pegawai(self.pegawai, self.shift_cs_p)

    def test_excel_attendance_rules(self):
        import datetime
        from django.utils import timezone
        from sdm.models import JadwalDinas, LogPresensi
        from sdm.attendance_engine import calculate_attendance_record

        def make_logs(tgl, t_in, t_out):
            dt1 = timezone.make_aware(datetime.datetime.combine(tgl, t_in))
            dt2 = timezone.make_aware(datetime.datetime.combine(tgl, t_out))
            return [
                LogPresensi(pegawai=self.pegawai, pin=self.pegawai.pin, waktu=dt1, tipe_punch=0),
                LogPresensi(pegawai=self.pegawai, pin=self.pegawai.pin, waktu=dt2, tipe_punch=1),
            ]

        tgl = date(2026, 10, 8)
        # 1. P 07:30 -> tepat waktu, 07:31 -> telat 1m
        jd_p = JadwalDinas(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_p)
        r_ok = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p, logs_for_pegawai=make_logs(tgl, time(7, 30), time(14, 35)))
        self.assertEqual(r_ok['status'], 'hadir')
        self.assertEqual(r_ok['menit_keterlambatan'], 0)

        r_late = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p, logs_for_pegawai=make_logs(tgl, time(7, 31), time(14, 35)))
        self.assertEqual(r_late['status'], 'terlambat')
        self.assertEqual(r_late['menit_keterlambatan'], 1)

        # 2. P1 08:00 -> tepat waktu, 08:01 -> telat 1m
        jd_p1 = JadwalDinas(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_p1)
        r_p1_ok = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p1, logs_for_pegawai=make_logs(tgl, time(8, 0), time(16, 5)))
        self.assertEqual(r_p1_ok['status'], 'hadir')
        self.assertEqual(r_p1_ok['menit_keterlambatan'], 0)

        r_p1_late = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p1, logs_for_pegawai=make_logs(tgl, time(8, 1), time(16, 5)))
        self.assertEqual(r_p1_late['status'], 'terlambat')
        self.assertEqual(r_p1_late['menit_keterlambatan'], 1)

        # 3. P2 08:00 -> terlambat (tap harus < 08:00), 07:59 -> hadir
        jd_p2 = JadwalDinas(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_p2)
        r_p2_ok = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p2, logs_for_pegawai=make_logs(tgl, time(7, 59), time(13, 5)))
        self.assertEqual(r_p2_ok['status'], 'hadir')
        r_p2_late = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_p2, logs_for_pegawai=make_logs(tgl, time(8, 0), time(13, 5)))
        self.assertEqual(r_p2_late['status'], 'terlambat')

        # 4. PS (jam masuk 07:00, batas 07:30) -> tap 07:25 hadir, tap 07:31 telat 31m
        jd_ps = JadwalDinas(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_ps)
        r_ps_ok = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_ps, logs_for_pegawai=make_logs(tgl, time(7, 25), time(21, 5)))
        self.assertEqual(r_ps_ok['status'], 'hadir')
        self.assertEqual(r_ps_ok['menit_keterlambatan'], 0)
        r_ps_late = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_ps, logs_for_pegawai=make_logs(tgl, time(7, 31), time(21, 5)))
        self.assertEqual(r_ps_late['status'], 'terlambat')
        self.assertEqual(r_ps_late['menit_keterlambatan'], 31)

        # 5. IP -> selalu izin ONTIME, telat 0 menit meskipun ada tap
        jd_ip = JadwalDinas(pegawai=self.pegawai, tanggal=tgl, shift=self.shift_ip)
        r_ip = calculate_attendance_record(self.pegawai, tgl, jadwal=jd_ip, logs_for_pegawai=make_logs(tgl, time(9, 15), time(14, 30)))
        self.assertEqual(r_ip['status'], 'izin')
        self.assertEqual(r_ip['menit_keterlambatan'], 0)

