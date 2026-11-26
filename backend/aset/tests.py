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
    AsetPengaturan,
    AsetTeknisi,
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

    def _extract_list(self, data):
        return data.get('results', []) if isinstance(data, dict) else list(data)

    def test_aset_mandatory_fields_and_optional_exceptions(self):
        self.client.force_authenticate(user=self.admin)

        # Gagal jika deskripsi kosong (validasi field level) atau merk/spesifikasi/lokasi_teks kosong
        res_fail_desc = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(deskripsi=''),
            format='multipart',
        )
        self.assertEqual(res_fail_desc.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('deskripsi', res_fail_desc.data)

        missing_core = self._valid_asset_payload(merk='', spesifikasi='', lokasi_teks='')
        res_fail = self.client.post('/api/aset/aset/', missing_core, format='multipart')
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('merk', res_fail.data)
        self.assertIn('spesifikasi', res_fail.data)
        self.assertIn('lokasi_teks', res_fail.data)

        # Berhasil tanpa nomor_seri, nomor_registrasi, foto_terkini,
        # serta tanpa tanggal/harga perolehan, rekomendasi_tindakan, dan catatan
        minimal_payload = self._valid_asset_payload(
            bulan_perolehan='',
            harga_perolehan='',
            rekomendasi_tindakan='',
            catatan='',
        )
        res_min = self.client.post('/api/aset/aset/', minimal_payload, format='multipart')
        self.assertEqual(res_min.status_code, status.HTTP_201_CREATED)
        aset_min = Aset.objects.get(pk=res_min.data['id'])
        self.assertIsNone(aset_min.bulan_perolehan)
        self.assertEqual(aset_min.harga_perolehan, Decimal('0.00'))
        self.assertEqual(aset_min.status_data, 'belum_lengkap')
        self.assertEqual(aset_min.rekomendasi_tindakan, '')
        self.assertEqual(aset_min.catatan, '')

        # Berhasil dengan seluruh kolom terisi lengkap
        valid_payload = self._valid_asset_payload(deskripsi='USG 4D Lengkap')
        res_ok = self.client.post('/api/aset/aset/', valid_payload, format='multipart')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['nomor_seri'], '')
        self.assertEqual(res_ok.data['nomor_registrasi'], '')
        aset_ok = Aset.objects.get(pk=res_ok.data['id'])
        self.assertEqual(aset_ok.status_data, 'lengkap')
        self.assertEqual(aset_ok.status_verifikasi, 'terverifikasi')

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

    def test_dashboard_summary_kelayakan_aggregation_and_multi_filter(self):
        self.client.force_authenticate(user=self.admin)

        grades = ['A', 'A', 'A', 'B', 'D', 'E', 'E']
        for idx, grade in enumerate(grades, start=1):
            Aset.objects.create(
                jenis=self.jenis,
                kode_aset=f'TST.USG.{idx:04d}',
                deskripsi=f'Unit USG {idx}',
                merk='Mindray',
                spesifikasi='Portable',
                unit=self.unit,
                ruangan=self.ruangan,
                lokasi_teks='Poli',
                status_kelayakan=grade,
                status_aset='aktif',
                status_kepemilikan='milik_sendiri',
                harga_perolehan=Decimal('1000000.00'),
                status_data='lengkap',
            )

        summary_res = self.client.get('/api/aset/aset/dashboard_summary/')
        self.assertEqual(summary_res.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_res.data['total_aset'], 7)
        self.assertEqual(summary_res.data['kelayakan_counts'], {
            'A': 3,
            'B': 1,
            'C': 0,
            'D': 1,
            'E': 2,
        })
        self.assertEqual(summary_res.data['perlu_tindakan_count'], 3)

        de_res = self.client.get('/api/aset/aset/?status_kelayakan=D&status_kelayakan=E')
        self.assertEqual(de_res.status_code, status.HTTP_200_OK)
        results = de_res.data.get('results', []) if isinstance(de_res.data, dict) else de_res.data
        self.assertEqual(len(results), 3)
        self.assertEqual({r['status_kelayakan'] for r in results}, {'D', 'E'})

    def test_auto_generate_kode_aset_per_tahun_perolehan_and_reset(self):
        from .services import generate_kode_aset

        self.client.force_authenticate(user=self.admin)

        # Data aset format lama (tanpa segmen tahun) tidak mengganggu urutan tahun baru
        Aset.objects.create(
            jenis=self.jenis,
            kode_aset='TST_AM.TST_USG.0005',
            deskripsi='USG Legacy',
            merk='Mindray',
            spesifikasi='Legacy',
            unit=self.unit,
            ruangan=self.ruangan,
            lokasi_teks='Poli Legacy',
            status_kelayakan='B',
            status_aset='aktif',
            status_kepemilikan='milik_sendiri',
            bulan_perolehan=date(2022, 5, 1),
            harga_perolehan=Decimal('10000000.00'),
            status_data='lengkap',
        )

        # Aset ke-1 tahun perolehan 2026 -> mulai dari 0001
        res_2026_1 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2026 Unit A',
                bulan_perolehan='2026-03-10',
                nomor_seri='SN-2026-01',
            ),
            format='multipart',
        )
        self.assertEqual(res_2026_1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_2026_1.data['kode_aset'], 'TST_AM.TST_USG.2026.0001')

        # Aset ke-2 tahun perolehan 2026 -> lanjut ke 0002
        res_2026_2 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2026 Unit B',
                bulan_perolehan='2026-11-21',
                nomor_seri='SN-2026-02',
            ),
            format='multipart',
        )
        self.assertEqual(res_2026_2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_2026_2.data['kode_aset'], 'TST_AM.TST_USG.2026.0002')

        # Input manual di tahun 2026 dengan nomor lompat -> auto berikutnya melanjutkan di atasnya
        res_manual = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2026 Unit Manual',
                bulan_perolehan='2026-12-01',
                nomor_seri='SN-2026-10',
                kode_aset='TST_AM.TST_USG.2026.0010',
            ),
            format='multipart',
        )
        self.assertEqual(res_manual.status_code, status.HTTP_201_CREATED)

        res_2026_11 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2026 Unit C',
                bulan_perolehan='2026-12-05',
                nomor_seri='SN-2026-11',
            ),
            format='multipart',
        )
        self.assertEqual(res_2026_11.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_2026_11.data['kode_aset'], 'TST_AM.TST_USG.2026.0011')

        # Ganti tahun perolehan ke 2027 -> reset kembali ke 0001
        res_2027_1 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2027 Unit A',
                bulan_perolehan='2027-01-05',
                nomor_seri='SN-2027-01',
            ),
            format='multipart',
        )
        self.assertEqual(res_2027_1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_2027_1.data['kode_aset'], 'TST_AM.TST_USG.2027.0001')

        # Tahun perolehan mundur (backdate 2024) mengikuti tahun bulan_perolehan
        res_2024_1 = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                deskripsi='USG 2024 Unit Backdate',
                bulan_perolehan='2024-06-15',
                nomor_seri='SN-2024-01',
            ),
            format='multipart',
        )
        self.assertEqual(res_2024_1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_2024_1.data['kode_aset'], 'TST_AM.TST_USG.2024.0001')

        # Jenis aset berbeda tetap punya nomor urut terpisah per jenis & tahun
        kat_pe = AsetKategori.objects.create(kode='TST_PE', nama='Elektronik Test')
        jenis_ac = AsetJenis.objects.create(
            kategori=kat_pe,
            kode='TST_AC',
            nama='AC Split Test',
            kelompok_default=self.kelompok,
        )
        res_ac = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(
                jenis=jenis_ac.id,
                deskripsi='AC Split Daikin',
                bulan_perolehan='2026-04-01',
                nomor_seri='SN-AC-2026-01',
            ),
            format='multipart',
        )
        self.assertEqual(res_ac.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ac.data['kode_aset'], 'TST_PE.TST_AC.2026.0001')

        # Pemanggilan langsung tanpa tahun fallback ke tahun berjalan
        current_year = timezone.now().year
        self.assertTrue(
            generate_kode_aset(jenis_ac).startswith(f'TST_PE.TST_AC.{current_year}.')
        )

    def test_unit_self_registration_toggle_and_verification_flow(self):
        User = get_user_model()
        unit_lain = Unit.objects.create(nama='Unit Lain Test')
        verifikator_febry = User.objects.create_user(
            username='febry_verifier',
            password='password123',
            unit=unit_lain,
            is_aset_admin=True,
        )

        # 1. Pengaturan default terbuka -> user unit bisa mendaftarkan aset
        self.client.force_authenticate(user=self.staff)
        res_cfg = self.client.get('/api/aset/aset/pengaturan/')
        self.assertEqual(res_cfg.status_code, status.HTTP_200_OK)
        self.assertTrue(res_cfg.data['izinkan_pendaftaran_unit'])

        # Unit mencoba mengirim unit_lain, harus terkunci ke unit milik user sendiri (self.unit)
        payload = self._valid_asset_payload(
            unit=unit_lain.id,
            deskripsi='Infusion Pump Unit',
            bulan_perolehan='',
            harga_perolehan='',
            rekomendasi_tindakan='',
            catatan='',
        )
        res_unit_post = self.client.post('/api/aset/aset/', payload, format='multipart')
        self.assertEqual(res_unit_post.status_code, status.HTTP_201_CREATED)
        aset_unit = Aset.objects.get(pk=res_unit_post.data['id'])
        self.assertEqual(aset_unit.unit_id, self.unit.id)
        self.assertEqual(aset_unit.status_verifikasi, 'menunggu_verifikasi')

        # Aset menunggu verifikasi tidak masuk statistik resmi maupun query KIR terverifikasi
        res_summary = self.client.get('/api/aset/aset/dashboard_summary/')
        self.assertEqual(res_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(res_summary.data['total_aset'], 0)
        self.assertEqual(res_summary.data['menunggu_verifikasi_count'], 1)

        res_kir = self.client.get('/api/aset/aset/?status_verifikasi=terverifikasi')
        self.assertEqual(res_kir.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._extract_list(res_kir.data)), 0)

        # Belum boleh lapor perbaikan atau update kelayakan sebelum diverifikasi
        res_pbk_block = self.client.post(
            '/api/aset/perbaikan/',
            {'aset': aset_unit.id, 'rincian_kerusakan': 'Tes belum verif', 'tingkat_kerusakan': 'ringan'},
            format='json',
        )
        self.assertEqual(res_pbk_block.status_code, status.HTTP_400_BAD_REQUEST)

        res_kel_block = self.client.post(
            f'/api/aset/aset/{aset_unit.id}/update_kelayakan/',
            {'status_kelayakan': 'B'},
            format='json',
        )
        self.assertEqual(res_kel_block.status_code, status.HTTP_400_BAD_REQUEST)

        # Unit tetap bisa mengedit pengajuannya selama belum diverifikasi
        res_unit_edit = self.client.patch(
            f'/api/aset/aset/{aset_unit.id}/',
            {'deskripsi': 'Infusion Pump Terumo Unit'},
            format='multipart',
        )
        self.assertEqual(res_unit_edit.status_code, status.HTTP_200_OK)
        aset_unit.refresh_from_db()
        self.assertEqual(aset_unit.deskripsi, 'Infusion Pump Terumo Unit')

        # 2. Verifikator menolak tanpa alasan -> 400; dengan alasan -> status ditolak
        self.client.force_authenticate(user=verifikator_febry)
        res_tolak_empty = self.client.post(
            f'/api/aset/aset/{aset_unit.id}/tolak_verifikasi/',
            {'catatan_verifikasi': ''},
            format='json',
        )
        self.assertEqual(res_tolak_empty.status_code, status.HTTP_400_BAD_REQUEST)

        res_tolak = self.client.post(
            f'/api/aset/aset/{aset_unit.id}/tolak_verifikasi/',
            {'catatan_verifikasi': 'Lengkapi tipe seri pompa infus'},
            format='json',
        )
        self.assertEqual(res_tolak.status_code, status.HTTP_200_OK)
        aset_unit.refresh_from_db()
        self.assertEqual(aset_unit.status_verifikasi, 'ditolak')

        # Unit mengedit ulang aset ditolak -> status kembali menunggu_verifikasi
        self.client.force_authenticate(user=self.staff)
        res_reedit = self.client.patch(
            f'/api/aset/aset/{aset_unit.id}/',
            {'spesifikasi': 'TE-171 Volumetric'},
            format='multipart',
        )
        self.assertEqual(res_reedit.status_code, status.HTTP_200_OK)
        aset_unit.refresh_from_db()
        self.assertEqual(aset_unit.status_verifikasi, 'menunggu_verifikasi')

        # 3. Verifikator menyetujui -> masuk statistik resmi dan terkunci dari edit unit biasa
        self.client.force_authenticate(user=verifikator_febry)
        res_verify = self.client.post(
            f'/api/aset/aset/{aset_unit.id}/verifikasi/',
            {'catatan_verifikasi': 'Data fisik sesuai'},
            format='json',
        )
        self.assertEqual(res_verify.status_code, status.HTTP_200_OK)
        aset_unit.refresh_from_db()
        self.assertEqual(aset_unit.status_verifikasi, 'terverifikasi')

        res_summary_after = self.client.get('/api/aset/aset/dashboard_summary/')
        self.assertEqual(res_summary_after.data['total_aset'], 1)
        self.assertEqual(res_summary_after.data['menunggu_verifikasi_count'], 0)

        # Unit tidak lagi bisa edit setelah terverifikasi, & tidak boleh ubah toggle pengaturan
        self.client.force_authenticate(user=self.staff)
        res_locked_edit = self.client.patch(
            f'/api/aset/aset/{aset_unit.id}/',
            {'deskripsi': 'Coba Ubah'},
            format='multipart',
        )
        self.assertEqual(res_locked_edit.status_code, status.HTTP_403_FORBIDDEN)

        res_toggle_forbidden = self.client.patch(
            '/api/aset/aset/pengaturan/',
            {'izinkan_pendaftaran_unit': False},
            format='json',
        )
        self.assertEqual(res_toggle_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Admin menutup pendaftaran unit -> unit diblokir, admin tetap bisa membuat aset
        self.client.force_authenticate(user=verifikator_febry)
        res_close = self.client.patch(
            '/api/aset/aset/pengaturan/',
            {'izinkan_pendaftaran_unit': False},
            format='json',
        )
        self.assertEqual(res_close.status_code, status.HTTP_200_OK)
        self.assertFalse(res_close.data['izinkan_pendaftaran_unit'])

        self.client.force_authenticate(user=self.staff)
        res_unit_blocked = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(deskripsi='Coba Saat Ditutup', bulan_perolehan='', harga_perolehan=''),
            format='multipart',
        )
        self.assertEqual(res_unit_blocked.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=verifikator_febry)
        res_admin_open = self.client.post(
            '/api/aset/aset/',
            self._valid_asset_payload(deskripsi='Admin Input Langsung', bulan_perolehan='', harga_perolehan=''),
            format='multipart',
        )
        self.assertEqual(res_admin_open.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Aset.objects.get(pk=res_admin_open.data['id']).status_verifikasi, 'terverifikasi')

    def test_perbaikan_multiselect_status_and_teknisi_options(self):
        User = get_user_model()
        unit_ipsrs = Unit.objects.create(nama='IPSRS Test Unit')
        User.objects.create_user(
            username='teknisi_ipsrs_tst',
            first_name='Budi',
            last_name='IPSRS',
            password='password123',
            unit=unit_ipsrs,
        )
        AsetTeknisi.objects.create(nama='Rina Elektromedis', kategori='elektromedis', is_active=True)

        aset = Aset.objects.create(
            jenis=self.jenis,
            kode_aset='TST.USG.2026.0777',
            deskripsi='USG Multi Filter',
            merk='Mindray',
            spesifikasi='DC-40',
            unit=self.unit,
            ruangan=self.ruangan,
            lokasi_teks='Poli',
            status_kelayakan='B',
            status_aset='dalam_perbaikan',
            status_kepemilikan='milik_sendiri',
            status_data='belum_lengkap',
            status_verifikasi='terverifikasi',
        )

        statuses = ['belum_mulai', 'inspeksi', 'dalam_proses', 'selesai']
        for idx, st in enumerate(statuses, start=1):
            AsetPerbaikan.objects.create(
                nomor_tiket=f'PBK-TST-{idx:04d}',
                aset=aset,
                tanggal_laporan=date.today(),
                rincian_kerusakan=f'Keluhan {st}',
                tingkat_kerusakan='sedang',
                status_perbaikan=st,
                pelapor=self.staff,
            )

        self.client.force_authenticate(user=self.admin)

        # Multiselect via comma-separated query param
        res_multi = self.client.get('/api/aset/perbaikan/?status_perbaikan=belum_mulai,dalam_proses')
        self.assertEqual(res_multi.status_code, status.HTTP_200_OK)
        items_multi = self._extract_list(res_multi.data)
        self.assertEqual({x['status_perbaikan'] for x in items_multi}, {'belum_mulai', 'dalam_proses'})

        # Multiselect via repeated query params
        res_repeat = self.client.get('/api/aset/perbaikan/?status_perbaikan=inspeksi&status_perbaikan=selesai')
        self.assertEqual(res_repeat.status_code, status.HTTP_200_OK)
        items_repeat = self._extract_list(res_repeat.data)
        self.assertEqual({x['status_perbaikan'] for x in items_repeat}, {'inspeksi', 'selesai'})

        # Dropdown teknisi + elektromedis options
        res_tek = self.client.get('/api/aset/perbaikan/teknisi_options/')
        self.assertEqual(res_tek.status_code, status.HTTP_200_OK)
        names = {t['label'] for t in res_tek.data}
        self.assertIn('Budi IPSRS', names)
        self.assertIn('Rina Elektromedis', names)

    def test_seed_area_tunggu_poli_naming(self):
        from .management.commands.seed_aset_excel import LOKASI_TO_UNIT_RUANGAN

        self.assertEqual(LOKASI_TO_UNIT_RUANGAN['Antara Poli 2 & 3'][1], 'Area Tunggu Poli 2 & 3')
        self.assertEqual(LOKASI_TO_UNIT_RUANGAN['Antara Poli 4 & 6'][1], 'Area Tunggu Poli 4 & 6')


