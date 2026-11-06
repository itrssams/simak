from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from users.models import User
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

