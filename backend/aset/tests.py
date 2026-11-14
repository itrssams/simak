from io import BytesIO
from datetime import date, timedelta
from decimal import Decimal
import tempfile
from PIL import Image

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import Unit
from .models import (
    AsetKelompok,
    AsetKategori,
    AsetJenis,
    AsetRuangan,
    Aset,
    AsetPerbaikan,
    AsetPerbaikanLog,
)


def make_test_image(name='test.png'):
    buf = BytesIO()
    img = Image.new('RGB', (10, 10), color='blue')
    img.save(buf, format='PNG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/png')


TEMP_MEDIA_DIR = tempfile.mkdtemp()


@override_settings(ALLOWED_HOSTS=['*'], MEDIA_ROOT=TEMP_MEDIA_DIR)
class AsetAndPerbaikanTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.unit = Unit.objects.create(nama='Unit Test Aset')
        self.admin = User.objects.create_user(
            username='admin_aset_test',
            password='password123',
            unit=self.unit,
            is_superuser=True,
            is_staff=True,
        )
        self.staff = User.objects.create_user(
            username='staff_unit_test',
            password='password123',
            unit=self.unit,
        )

        self.kelompok = AsetKelompok.objects.create(
            kode='TST_GOL1',
            nama='Kelompok 1 Test (4 Tahun)',
            masa_manfaat_tahun=4,
            masa_manfaat_bulan=48,
            tarif_garis_lurus=Decimal('25.00'),
        )
        self.kategori = AsetKategori.objects.create(kode='TST_AM', nama='Alkes Test')
        self.jenis = AsetJenis.objects.create(
            kategori=self.kategori,
            kode='TST_USG',
            nama='Mesin USG Test',
            kelompok_default=self.kelompok,
        )
        self.ruangan = AsetRuangan.objects.create(
            nama='Ruang Poli Test',
            unit=self.unit,
            lantai_gedung='Lantai 2',
        )

    def _valid_asset_payload(self, **overrides):
        payload = {
            'jenis': self.jenis.id,
            'deskripsi': 'USG 4D Doppler',
            'merk': 'Mindray',
            'spesifikasi': 'Portable 4D Probe',
            'unit': self.unit.id,
            'ruangan': self.ruangan.id,
            'lokasi_teks': 'Ruang Poli 1',
            'status_kelayakan': 'A',
            'status_aset': 'aktif',
            'status_kepemilikan': 'milik_sendiri',
            'bulan_perolehan': '2026-01-15',
            'harga_perolehan': '25000000',
            'rekomendasi_tindakan': 'Kalibrasi berkala setiap tahun',
            'catatan': 'Garansi distributor resmi 2 tahun',
            'foto_awal': make_test_image('awal.png'),
        }
        payload.update(overrides)
        return payload

    def test_aset_mandatory_fields_and_optional_exceptions(self):
        self.client.force_authenticate(user=self.admin)

        # Gagal jika rekomendasi_tindakan / catatan kosong
        missing_payload = self._valid_asset_payload(rekomendasi_tindakan='', catatan='')
        res = self.client.post('/api/aset/aset/', missing_payload, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rekomendasi_tindakan', res.data)
        self.assertIn('catatan', res.data)

        # Berhasil tanpa nomor_seri, nomor_registrasi, dan foto_terkini
        valid_payload = self._valid_asset_payload()
        res_ok = self.client.post('/api/aset/aset/', valid_payload, format='multipart')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['nomor_seri'], '')
        self.assertEqual(res_ok.data['nomor_registrasi'], '')

    def test_aset_anti_duplikat_creation(self):
        self.client.force_authenticate(user=self.admin)

        res1 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(nomor_seri='SN-USG-001', kode_aset='AM.USG.0001'),
            format='multipart',
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Duplikat nomor seri
        res_dup_sn = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(nomor_seri='SN-USG-001', kode_aset='AM.USG.0002'),
            format='multipart',
        )
        self.assertEqual(res_dup_sn.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('nomor_seri', res_dup_sn.data)

        # Duplikat kode aset
        res_dup_kd = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(nomor_seri='SN-USG-002', kode_aset='AM.USG.0001'),
            format='multipart',
        )
        self.assertEqual(res_dup_kd.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('kode_aset', res_dup_kd.data)

        # Duplikat kombinasi deskripsi + merk + unit + ruangan tanpa nomor seri
        res2 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(deskripsi='Monitor Pasien', merk='Philips'),
            format='multipart',
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

        res_dup_combo = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(deskripsi='Monitor Pasien', merk='Philips'),
            format='multipart',
        )
        self.assertEqual(res_dup_combo.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('deskripsi', res_dup_combo.data)

    def test_perbaikan_lifecycle_locked_date_and_accurate_logs(self):
        aset = Aset.objects.create(
            kode_aset='AM.USG.0099',
            jenis=self.jenis,
            deskripsi='USG Diagnostic',
            merk='GE',
            spesifikasi='Color Doppler',
            unit=self.unit,
            ruangan=self.ruangan,
            lokasi_teks='Poli 2',
            status_kelayakan='A',
            status_aset='aktif',
            status_kepemilikan='milik_sendiri',
            bulan_perolehan=date(2025, 1, 1),
            harga_perolehan=Decimal('50000000'),
            kelompok=self.kelompok,
            masa_manfaat_bulan=48,
            rekomendasi_tindakan='Rutin cek probe',
            catatan='Aset aktif',
        )

        # 1. Buat laporan sebagai staff unit dengan mencoba mengirim tanggal_laporan masa lalu -> harus tetap terkunci TODAY
        self.client.force_authenticate(user=self.staff)
        yesterday = (timezone.now().date() - timedelta(days=5)).isoformat()
        create_res = self.client.post(
            '/api/aset/perbaikan/',
            {
                'aset': aset.id,
                'tanggal_laporan': yesterday,
                'tanggal_kerusakan': yesterday,
                'rincian_kerusakan': 'Layar berkedip dan tidak muncul gambar',
                'tingkat_kerusakan': 'sedang',
            },
            format='json',
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        tiket_id = create_res.data['id']
        self.assertEqual(create_res.data['tanggal_laporan'], timezone.now().date().isoformat())
        self.assertEqual(create_res.data['status_perbaikan'], 'belum_mulai')
        self.assertEqual(AsetPerbaikanLog.objects.filter(perbaikan_id=tiket_id).count(), 1)

        # 2. Pindah ke inspeksi tanpa teknisi -> ditolak
        self.client.force_authenticate(user=self.admin)
        fail_inspeksi = self.client.patch(
            f'/api/aset/perbaikan/{tiket_id}/',
            {'status_perbaikan': 'inspeksi', 'teknisi': ''},
            format='json',
        )
        self.assertEqual(fail_inspeksi.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('teknisi', fail_inspeksi.data)

        # Berhasil pindah ke inspeksi dengan teknisi
        ok_inspeksi = self.client.patch(
            f'/api/aset/perbaikan/{tiket_id}/',
            {'status_perbaikan': 'inspeksi', 'teknisi': 'PT Medika Servis - Budi'},
            format='json',
        )
        self.assertEqual(ok_inspeksi.status_code, status.HTTP_200_OK)
        self.assertEqual(ok_inspeksi.data['status_perbaikan'], 'inspeksi')

        # 3. Pindah ke dalam_proses tanpa tindak_lanjut -> ditolak
        fail_proses = self.client.patch(
            f'/api/aset/perbaikan/{tiket_id}/',
            {
                'status_perbaikan': 'dalam_proses',
                'hasil_inspeksi': 'Kabel probe longgar & board power lemah',
                'tindak_lanjut': '',
                'estimasi_biaya': '1500000',
            },
            format='json',
        )
        self.assertEqual(fail_proses.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('tindak_lanjut', fail_proses.data)

        # Berhasil pindah ke dalam_proses dengan hasil_inspeksi, tindak_lanjut, & estimasi_biaya
        ok_proses = self.client.patch(
            f'/api/aset/perbaikan/{tiket_id}/',
            {
                'status_perbaikan': 'dalam_proses',
                'hasil_inspeksi': 'Kabel probe longgar & board power lemah',
                'tindak_lanjut': 'Penggantian board power unit dan kalibrasi konektor probe',
                'estimasi_biaya': '1500000',
            },
            format='json',
        )
        self.assertEqual(ok_proses.status_code, status.HTTP_200_OK)

        # 4. Catat progres berkala saat dalam_proses -> pastikan log mencatat catatan baru, bukan mengulang hasil_inspeksi lama
        ok_progres = self.client.patch(
            f'/api/aset/perbaikan/{tiket_id}/',
            {
                'status_perbaikan': 'dalam_proses',
                'tindak_lanjut': 'Sparepart board power tiba dan sedang dipasang oleh teknisi',
            },
            format='json',
        )
        self.assertEqual(ok_progres.status_code, status.HTTP_200_OK)

        # 5. Finish pop-up -> isi kondisi setelah perbaikan (teks), update kelayakan, dan biaya riil
        finish_res = self.client.post(
            f'/api/aset/perbaikan/{tiket_id}/finish/',
            {
                'kondisi_ringkas': 'Menyala normal, suhu stabil dan tidak ada kebocoran',
                'status_kelayakan_baru': 'B',
                'biaya_riil': '1350000',
                'catatan_penutupan': 'Unit diuji 2 jam dan berjalan normal',
            },
            format='json',
        )
        self.assertEqual(finish_res.status_code, status.HTTP_200_OK)
        aset.refresh_from_db()
        self.assertEqual(aset.status_kelayakan, 'B')
        self.assertEqual(aset.status_aset, 'aktif')

        # 6. Verifikasi seluruh log kronologis tercatat akurat (5 log: buat, inspeksi, dalam_proses, progres, finish)
        logs = list(AsetPerbaikanLog.objects.filter(perbaikan_id=tiket_id).order_by('id'))
        self.assertEqual(len(logs), 5)
        self.assertEqual([(l.status_sebelum, l.status_sesudah) for l in logs], [
            ('', 'belum_mulai'),
            ('belum_mulai', 'inspeksi'),
            ('inspeksi', 'dalam_proses'),
            ('dalam_proses', 'dalam_proses'),
            ('dalam_proses', 'selesai'),
        ])
        self.assertIn('Penugasan teknisi: PT Medika Servis - Budi', logs[1].tindakan)
        self.assertIn('Hasil Inspeksi: Kabel probe longgar & board power lemah', logs[2].tindakan)
        self.assertIn('Tindak Lanjut: Penggantian board power unit', logs[2].tindakan)
        self.assertEqual(logs[3].tindakan, 'Sparepart board power tiba dan sedang dipasang oleh teknisi')
        self.assertIn('Menyala normal, suhu stabil', logs[4].tindakan)
        self.assertEqual(logs[4].biaya_riil, Decimal('1350000.00'))
        self.assertEqual(logs[4].kondisi_setelah_perbaikan, 'berfungsi_normal')

        # Pastikan GET detail tiket mengembalikan log_list lengkap
        detail_res = self.client.get(f'/api/aset/perbaikan/{tiket_id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data['log_list']), 5)

