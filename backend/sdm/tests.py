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
