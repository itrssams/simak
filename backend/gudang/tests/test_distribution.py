from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from rest_framework.test import APIClient
from users.models import User, Unit
from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang, Ruang,
    Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem,
    StokSaldo, StokLedger
)
from gudang.services.stock import StockService
from gudang.services.distribution import DistributionService


class DistributionTestCase(TestCase):
    def setUp(self):
        self.gudang, _ = Gudang.objects.get_or_create(kode='GUDANG-TEST-DIST', defaults={'nama': 'Gudang Test Dist', 'is_default': True})
        self.gol, _ = GolonganBarang.objects.get_or_create(kode='B1-DIST', defaults={'nama': 'ATK Dist', 'prefix_kode': 'B1'})
        self.sat_pcs, _ = Satuan.objects.get_or_create(kode='PCS-DIST', defaults={'nama': 'Pieces'})
        self.ruang, _ = Ruang.objects.get_or_create(kode='R-IGD-TEST', defaults={'nama': 'IGD TEST'})

        self.barang, _ = Barang.objects.get_or_create(
            kode='B1-DIST-01',
            defaults={
                'nama': 'PULPEN STANDAR TEST',
                'golongan': self.gol,
                'satuan_dasar': self.sat_pcs,
                'merk': 'STANDAR'
            }
        )

        StokLedger.objects.filter(barang=self.barang, reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang=self.barang).delete()
        StokSaldo.objects.filter(barang=self.barang).delete()

        self.user_unit, _ = User.objects.get_or_create(username='petugas_igd', defaults={'role': 'karyawan'})
        self.user_gudang, _ = User.objects.get_or_create(username='petugas_gudang', defaults={'role': 'karyawan'})

    def tearDown(self):
        Pengeluaran.objects.filter(ruang=self.ruang).delete()
        Permintaan.objects.filter(ruang=self.ruang).delete()
        StokLedger.objects.filter(barang=self.barang, reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang=self.barang).delete()
        StokSaldo.objects.filter(barang=self.barang).delete()

    def test_distribution_flow_with_stock_deduction(self):
        # 1. Isi stok awal barang: 50 PCS @ Rp 3.000
        StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('50'),
            harga_unit=Decimal('3000'),
            sumber_tipe='INIT',
            sumber_id='1',
            sumber_nomor='INIT-01',
            user=self.user_gudang
        )

        # 2. Ruangan mengajukan permintaan: 10 PCS
        req = DistributionService.create_permintaan(
            ruang=self.ruang,
            items_data=[{
                'barang': self.barang,
                'qty_minta': Decimal('10')
            }],
            user=self.user_unit,
            auto_submit=True
        )

        self.assertEqual(req.status, Permintaan.STATUS_MENUNGGU)
        self.assertTrue(req.nomor.startswith('REQ-'))

        # 3. Petugas gudang menyetujui permintaan
        req = DistributionService.approve_permintaan(req, user=self.user_gudang)
        self.assertEqual(req.status, Permintaan.STATUS_DISETUJUI)

        req_item = req.items.first()

        # 4. Buat draft pengeluaran fisik (bon serah terima)
        out = DistributionService.create_pengeluaran(
            ruang=self.ruang,
            permintaan=req,
            gudang=self.gudang,
            items_data=[{
                'barang': self.barang,
                'permintaan_item': req_item,
                'qty': Decimal('10')
            }],
            penerima_nama='Sdr. Budi (Perawat IGD)',
            user=self.user_gudang
        )

        self.assertEqual(out.status, Pengeluaran.STATUS_DRAFT)
        self.assertTrue(out.nomor.startswith('OUT-'))

        # 5. Serah terima fisik & persetujuan pengeluaran (Stok dipotong)
        out = DistributionService.approve_pengeluaran(out, user=self.user_gudang)

        self.assertEqual(out.status, Pengeluaran.STATUS_DISETUJUI)
        self.assertEqual(out.total_nilai, Decimal('30000.00'))  # 10 PCS * Rp 3.000

        # Verifikasi saldo stok berkurang dari 50 menjadi 40
        saldo = StokSaldo.objects.get(barang=self.barang, gudang=self.gudang)
        self.assertEqual(saldo.qty, Decimal('40.000'))
        self.assertEqual(saldo.nilai, Decimal('120000.00'))

        # Verifikasi permintaan berubah menjadi SELESAI
        req.refresh_from_db()
        self.assertEqual(req.status, Permintaan.STATUS_SELESAI)

    def test_out_rejected_if_stock_insufficient(self):
        # Stok awal hanya 5 PCS
        StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('5'),
            harga_unit=Decimal('3000'),
            sumber_tipe='INIT',
            sumber_id='2',
            sumber_nomor='INIT-02',
            user=self.user_gudang
        )

        # Coba keluarkan 10 PCS -> harus gagal
        out = DistributionService.create_pengeluaran(
            ruang=self.ruang,
            gudang=self.gudang,
            items_data=[{
                'barang': self.barang,
                'qty': Decimal('10')
            }],
            user=self.user_gudang
        )

        with self.assertRaises(ValidationError):
            DistributionService.approve_pengeluaran(out, user=self.user_gudang)

    def test_create_permintaan_auto_resolves_ruang_for_unit_without_ruang(self):
        StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('10'),
            harga_unit=Decimal('3000'),
            sumber_tipe='INIT',
            sumber_id='3',
            sumber_nomor='INIT-03',
            user=self.user_gudang
        )
        unit_penunjang, _ = Unit.objects.get_or_create(
            nama='Penunjang Medis Test',
            defaults={'kategori': 'bidang', 'is_active': True}
        )
        Ruang.objects.filter(unit=unit_penunjang).delete()
        pemohon, _ = User.objects.get_or_create(
            username='ade_test',
            defaults={'role': 'kepala_seksi', 'unit': unit_penunjang}
        )
        pemohon.unit = unit_penunjang
        pemohon.save(update_fields=['unit'])

        client = APIClient()
        client.force_authenticate(user=pemohon)
        res = client.post(
            '/api/gudang/permintaan/',
            {
                'items': [{'barang': self.barang.id, 'qty_minta': 2, 'satuan': self.sat_pcs.kode}],
                'catatan': 'Kebutuhan unit tanpa ruang awal',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.content)
        created_ruang = Ruang.objects.filter(unit=unit_penunjang).first()
        self.assertIsNotNone(created_ruang)
        self.assertEqual(res.data['ruang'], created_ruang.id)
        Permintaan.objects.filter(ruang=created_ruang).delete()
        created_ruang.delete()

    def test_zero_stock_split_followup_and_per_item_rejection_flow(self):
        # Siapkan 3 barang:
        # 1) self.barang -> stok 10 (akan di-ACC parsial 4 oleh Mas Febri tanpa backorder)
        # 2) barang_kosong -> stok 0 (akan masuk antrean SEDANG_DIAJUKAN lalu restock & ACC susulan)
        # 3) barang_ditolak -> stok 10 (akan ditolak dengan alasan jelas)
        barang_kosong, _ = Barang.objects.get_or_create(
            kode='B1-DIST-02',
            defaults={'nama': 'TINTA PRINTER TEST', 'golongan': self.gol, 'satuan_dasar': self.sat_pcs, 'merk': 'STD'}
        )
        barang_ditolak, _ = Barang.objects.get_or_create(
            kode='B1-DIST-03',
            defaults={'nama': 'MAP PLASTIK TEST', 'golongan': self.gol, 'satuan_dasar': self.sat_pcs, 'merk': 'STD'}
        )
        StokLedger.objects.filter(barang__in=[barang_kosong, barang_ditolak], reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang__in=[barang_kosong, barang_ditolak]).delete()
        StokSaldo.objects.filter(barang__in=[barang_kosong, barang_ditolak]).delete()

        default_gudang = Gudang.get_default()
        StockService.record_in(
            barang=self.barang, gudang=default_gudang, qty=Decimal('10'), harga_unit=Decimal('2000'),
            sumber_tipe='INIT', sumber_id='10', sumber_nomor='INIT-10', user=self.user_gudang
        )
        StockService.record_in(
            barang=barang_ditolak, gudang=default_gudang, qty=Decimal('10'), harga_unit=Decimal('1000'),
            sumber_tipe='INIT', sumber_id='11', sumber_nomor='INIT-11', user=self.user_gudang
        )

        # User approver (Mas Febri)
        approver, _ = User.objects.get_or_create(
            username='febri_kasi_test',
            defaults={'role': 'kepala_seksi', 'is_logistik': True}
        )
        approver.role = 'kepala_seksi'
        approver.is_logistik = True
        approver.save(update_fields=['role', 'is_logistik'])

        client = APIClient()
        client.force_authenticate(user=self.user_unit)

        # 1. Unit mengajukan 3 barang termasuk barang_kosong (stok 0) -> HARUS BERHASIL
        res_create = client.post(
            '/api/gudang/permintaan/',
            {
                'ruang': self.ruang.id,
                'items': [
                    {'barang': self.barang.id, 'qty_minta': 8, 'satuan': self.sat_pcs.kode},
                    {'barang': barang_kosong.id, 'qty_minta': 5, 'satuan': self.sat_pcs.kode},
                    {'barang': barang_ditolak.id, 'qty_minta': 3, 'satuan': self.sat_pcs.kode},
                ],
                'catatan': 'Permintaan campuran stok ada dan kosong',
            },
            format='json',
        )
        self.assertEqual(res_create.status_code, 201, res_create.content)
        req_id = res_create.data['id']
        items_by_barang = {it['barang']: it for it in res_create.data['items']}
        pi_ready = items_by_barang[self.barang.id]
        pi_empty = items_by_barang[barang_kosong.id]
        pi_reject = items_by_barang[barang_ditolak.id]

        # 2. Approver (Mas Febri) mencoba Tolak tanpa alasan -> ditolak sistem
        client.force_authenticate(user=approver)
        res_bad_reject = client.post(
            f'/api/gudang/permintaan/{req_id}/approve/',
            {
                'items': [
                    {'id': pi_ready['id'], 'keputusan': 'SETUJUI', 'qty_disetujui': 4},
                    {'id': pi_empty['id'], 'keputusan': 'AJUKAN', 'qty_disetujui': 0},
                    {'id': pi_reject['id'], 'keputusan': 'TOLAK', 'qty_disetujui': 0, 'alasan_tolak': ''},
                ]
            },
            format='json',
        )
        self.assertEqual(res_bad_reject.status_code, 400)

        # 3. Approver memberi keputusan per baris:
        #    - self.barang -> SETUJUI 4 (dari 8 diminta, kontrol ketat tanpa backorder)
        #    - barang_kosong -> AJUKAN (SEDANG_DIAJUKAN)
        #    - barang_ditolak -> TOLAK dengan alasan jelas
        res_acc = client.post(
            f'/api/gudang/permintaan/{req_id}/approve/',
            {
                'items': [
                    {'id': pi_ready['id'], 'keputusan': 'SETUJUI', 'qty_disetujui': 4},
                    {'id': pi_empty['id'], 'keputusan': 'AJUKAN', 'qty_disetujui': 0},
                    {'id': pi_reject['id'], 'keputusan': 'TOLAK', 'qty_disetujui': 0, 'alasan_tolak': 'Tidak sesuai kebutuhan ruang'},
                ]
            },
            format='json',
        )
        self.assertEqual(res_acc.status_code, 200, res_acc.content)
        self.assertEqual(res_acc.data['status'], Permintaan.STATUS_PROSES_SEBAGIAN)
        self.assertTrue(res_acc.data['can_issue'])
        acc_map = {it['id']: it for it in res_acc.data['items']}
        self.assertEqual(acc_map[pi_ready['id']]['status'], PermintaanItem.STATUS_DISETUJUI)
        self.assertEqual(Decimal(str(acc_map[pi_ready['id']]['qty_disetujui'])), Decimal('4'))
        self.assertEqual(acc_map[pi_empty['id']]['status'], PermintaanItem.STATUS_SEDANG_DIAJUKAN)
        self.assertEqual(acc_map[pi_reject['id']]['status'], PermintaanItem.STATUS_DITOLAK)
        self.assertEqual(acc_map[pi_reject['id']]['alasan_tolak'], 'Tidak sesuai kebutuhan ruang')

        # 4. Tahap 1 penyerahan fisik (hanya self.barang qty 4), Permintaan tetap PROSES_SEBAGIAN
        res_serah1 = client.post(
            f'/api/gudang/permintaan/{req_id}/serahkan/',
            {'penerima_nama': 'Ns. Sari IGD'},
            format='json',
        )
        self.assertEqual(res_serah1.status_code, 200, res_serah1.content)
        p1 = res_serah1.data['permintaan']
        self.assertEqual(p1['status'], Permintaan.STATUS_PROSES_SEBAGIAN)
        self.assertFalse(p1['can_issue'])
        self.assertEqual(len(p1['pengeluaran_list']), 1)
        s1_map = {it['id']: it for it in p1['items']}
        self.assertEqual(s1_map[pi_ready['id']]['status'], PermintaanItem.STATUS_SELESAI)
        self.assertEqual(Decimal(str(s1_map[pi_ready['id']]['qty_dikeluarkan'])), Decimal('4'))

        # 5. Alert dashboard: barang_kosong masih awaiting_stock
        res_alerts1 = client.get('/api/gudang/permintaan/procurement-alerts/')
        self.assertEqual(res_alerts1.status_code, 200)
        awaiting_ids = [x['id'] for x in res_alerts1.data['awaiting_stock']]
        self.assertIn(pi_empty['id'], awaiting_ids)

        # 6. Stok barang_kosong masuk via Penerimaan (GRN) -> 3 unit (kurang dari minta 5)
        StockService.record_in(
            barang=barang_kosong, gudang=default_gudang, qty=Decimal('3'), harga_unit=Decimal('50000'),
            sumber_tipe='GRN', sumber_id='99', sumber_nomor='GRN-99', user=approver
        )
        res_alerts2 = client.get('/api/gudang/permintaan/procurement-alerts/')
        ready_ids = [x['id'] for x in res_alerts2.data['ready_for_followup']]
        self.assertIn(pi_empty['id'], ready_ids)

        # 7. Mas Febri melakukan ACC susulan dengan kontrol qty (setujui 2 dari 3 stok tersedia)
        res_followup = client.post(
            f'/api/gudang/permintaan/{req_id}/approve-followup/',
            {
                'items': [
                    {'id': pi_empty['id'], 'keputusan': 'SETUJUI', 'qty_disetujui': 2}
                ]
            },
            format='json',
        )
        self.assertEqual(res_followup.status_code, 200, res_followup.content)
        self.assertEqual(res_followup.data['status'], Permintaan.STATUS_DISETUJUI)
        self.assertTrue(res_followup.data['can_issue'])

        # 8. Tahap 2 penyerahan fisik -> menerbitkan Bon OUT ke-2 & Permintaan resmi SELESAI
        res_serah2 = client.post(
            f'/api/gudang/permintaan/{req_id}/serahkan/',
            {'penerima_nama': 'Ns. Budi IGD'},
            format='json',
        )
        self.assertEqual(res_serah2.status_code, 200, res_serah2.content)
        p2 = res_serah2.data['permintaan']
        self.assertEqual(p2['status'], Permintaan.STATUS_SELESAI)
        self.assertEqual(len(p2['pengeluaran_list']), 2)

        StokLedger.objects.filter(barang__in=[barang_kosong, barang_ditolak], reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang__in=[barang_kosong, barang_ditolak]).delete()
        StokSaldo.objects.filter(barang__in=[barang_kosong, barang_ditolak]).delete()

    def test_close_procurement_item_resolves_permintaan_status(self):
        barang_kosong, _ = Barang.objects.get_or_create(
            kode='B1-DIST-04',
            defaults={'nama': 'KERTAS HVS TEST', 'golongan': self.gol, 'satuan_dasar': self.sat_pcs, 'merk': 'STD'}
        )
        StokLedger.objects.filter(barang=barang_kosong, reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang=barang_kosong).delete()
        StokSaldo.objects.filter(barang=barang_kosong).delete()

        approver, _ = User.objects.get_or_create(
            username='febri_kasi_test',
            defaults={'role': 'kepala_seksi', 'is_logistik': True}
        )
        approver.role = 'kepala_seksi'
        approver.is_logistik = True
        approver.save(update_fields=['role', 'is_logistik'])

        req = DistributionService.create_permintaan(
            ruang=self.ruang,
            items_data=[{'barang': barang_kosong, 'qty_minta': Decimal('5')}],
            user=self.user_unit,
            auto_submit=True,
        )
        pi = req.items.first()
        DistributionService.approve_permintaan(
            req,
            user=approver,
            items_approval=[{'id': pi.id, 'keputusan': 'AJUKAN', 'qty_disetujui': 0}],
        )
        req.refresh_from_db()
        self.assertEqual(req.status, Permintaan.STATUS_PROSES_SEBAGIAN)

        client = APIClient()
        client.force_authenticate(user=approver)
        res_close = client.post(
            f'/api/gudang/permintaan/{req.id}/close-item/',
            {'item_id': pi.id, 'alasan': 'Barang dihentikan / tidak diadakan'},
            format='json',
        )
        self.assertEqual(res_close.status_code, 200, res_close.content)
        self.assertEqual(res_close.data['status'], Permintaan.STATUS_DITOLAK)
        self.assertEqual(res_close.data['items'][0]['status'], PermintaanItem.STATUS_BATAL_PENGADAAN)

    def test_unit_and_logistik_can_cancel_unfinished_permintaan(self):
        unit_igd, _ = Unit.objects.get_or_create(nama='UNIT TEST CANCEL IGD')
        unit_lain, _ = Unit.objects.get_or_create(nama='UNIT TEST LAIN')
        self.ruang.unit = unit_igd
        self.ruang.save(update_fields=['unit'])

        creator, _ = User.objects.get_or_create(
            username='pemohon_cancel_test',
            defaults={'role': 'karyawan', 'unit': unit_igd},
        )
        creator.unit = unit_igd
        creator.save(update_fields=['unit'])

        colleague, _ = User.objects.get_or_create(
            username='rekan_cancel_test',
            defaults={'role': 'karyawan', 'unit': unit_igd},
        )
        colleague.unit = unit_igd
        colleague.save(update_fields=['unit'])

        outsider, _ = User.objects.get_or_create(
            username='unit_lain_cancel_test',
            defaults={'role': 'karyawan', 'unit': unit_lain},
        )
        outsider.unit = unit_lain
        outsider.save(update_fields=['unit'])

        approver, _ = User.objects.get_or_create(
            username='approver_cancel_test',
            defaults={'role': 'kepala_seksi', 'is_logistik': True},
        )
        approver.role = 'kepala_seksi'
        approver.is_logistik = True
        approver.save(update_fields=['role', 'is_logistik'])

        StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('20'),
            harga_unit=Decimal('5000'),
            sumber_tipe='INIT',
            sumber_id='10',
            sumber_nomor='INIT-CANCEL',
            user=approver,
        )

        # 1. Buat & setujui permintaan (belum diserahkan) -> unit rekan sekantor bisa membatalkan
        req = DistributionService.create_permintaan(
            ruang=self.ruang,
            items_data=[{'barang': self.barang, 'qty_minta': Decimal('4')}],
            user=creator,
            auto_submit=True,
        )
        pi = req.items.first()
        DistributionService.approve_permintaan(
            req,
            user=approver,
            items_approval=[{'id': pi.id, 'keputusan': 'SETUJUI', 'qty_disetujui': 4}],
        )

        # Draft bon pengeluaran yang belum disetujui ikut dibatalkan saat permintaan dibatalkan
        draft_out = DistributionService.create_pengeluaran(
            ruang=self.ruang,
            permintaan=req,
            gudang=self.gudang,
            items_data=[{'barang': self.barang, 'permintaan_item': pi, 'qty': Decimal('4')}],
            penerima_nama='Perawat IGD',
            user=approver,
        )

        client_other = APIClient()
        client_other.force_authenticate(user=outsider)
        res_other = client_other.post(
            f'/api/gudang/permintaan/{req.id}/batal/',
            {'alasan': 'Bukan unit kami'},
            format='json',
        )
        self.assertIn(res_other.status_code, (403, 404))

        client_unit = APIClient()
        client_unit.force_authenticate(user=colleague)
        res_list = client_unit.get(f'/api/gudang/permintaan/{req.id}/')
        self.assertEqual(res_list.status_code, 200)
        self.assertTrue(res_list.data['can_cancel'])

        res_cancel = client_unit.post(
            f'/api/gudang/permintaan/{req.id}/batal/',
            {'alasan': 'Salah input barang, diganti amprahan baru'},
            format='json',
        )
        self.assertEqual(res_cancel.status_code, 200, res_cancel.content)
        self.assertEqual(res_cancel.data['status'], Permintaan.STATUS_BATAL)
        self.assertFalse(res_cancel.data['can_cancel'])
        self.assertEqual(res_cancel.data['alasan_tolak'], 'Salah input barang, diganti amprahan baru')

        draft_out.refresh_from_db()
        self.assertEqual(draft_out.status, Pengeluaran.STATUS_BATAL)

        # 2. Permintaan yang sudah SELESAI diserahkan tidak dapat dibatalkan
        req_done = DistributionService.create_permintaan(
            ruang=self.ruang,
            items_data=[{'barang': self.barang, 'qty_minta': Decimal('2')}],
            user=creator,
            auto_submit=True,
        )
        pi_done = req_done.items.first()
        DistributionService.approve_permintaan(
            req_done,
            user=approver,
            items_approval=[{'id': pi_done.id, 'keputusan': 'SETUJUI', 'qty_disetujui': 2}],
        )
        out_done = DistributionService.create_pengeluaran(
            ruang=self.ruang,
            permintaan=req_done,
            gudang=self.gudang,
            items_data=[{'barang': self.barang, 'permintaan_item': pi_done, 'qty': Decimal('2')}],
            penerima_nama='Perawat IGD',
            user=approver,
        )
        DistributionService.approve_pengeluaran(out_done, user=approver)
        req_done.refresh_from_db()
        self.assertEqual(req_done.status, Permintaan.STATUS_SELESAI)

        res_cancel_done = client_unit.post(
            f'/api/gudang/permintaan/{req_done.id}/batal/',
            {'alasan': 'Coba batal setelah selesai'},
            format='json',
        )
        self.assertEqual(res_cancel_done.status_code, 400)

        # 3. Pengeluaran DRAFT dapat dibatalkan, namun Pengeluaran DISETUJUI tidak dapat dibatalkan
        req2 = DistributionService.create_permintaan(
            ruang=self.ruang,
            items_data=[{'barang': self.barang, 'qty_minta': Decimal('1')}],
            user=creator,
            auto_submit=True,
        )
        pi2 = req2.items.first()
        out_draft2 = DistributionService.create_pengeluaran(
            ruang=self.ruang,
            permintaan=req2,
            gudang=self.gudang,
            items_data=[{'barang': self.barang, 'permintaan_item': pi2, 'qty': Decimal('1')}],
            penerima_nama='Perawat IGD',
            user=approver,
        )
        client_logistik = APIClient()
        client_logistik.force_authenticate(user=approver)
        res_out_batal = client_logistik.post(
            f'/api/gudang/pengeluaran/{out_draft2.id}/batal/',
            {'alasan': 'Draft dibatalkan petugas'},
            format='json',
        )
        self.assertEqual(res_out_batal.status_code, 200, res_out_batal.content)
        self.assertEqual(res_out_batal.data['status'], Pengeluaran.STATUS_BATAL)
        self.assertEqual(res_out_batal.data['alasan_batal'], 'Draft dibatalkan petugas')

        res_out_done_batal = client_logistik.post(
            f'/api/gudang/pengeluaran/{out_done.id}/batal/',
            {'alasan': 'Sudah dipotong stok'},
            format='json',
        )
        self.assertEqual(res_out_done_batal.status_code, 400)




