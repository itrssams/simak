from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang, StokLedger, StokSaldo, NumberingSequence
)
from gudang.services.stock import StockService


class StockFoundationTestCase(TestCase):
    def setUp(self):
        self.gudang, _ = Gudang.objects.get_or_create(kode='GUDANG-TEST', defaults={'nama': 'Gudang Uji', 'is_default': True})
        self.gol, _ = GolonganBarang.objects.get_or_create(kode='B1', defaults={'nama': 'ATK', 'prefix_kode': 'B1'})
        self.sat_pcs, _ = Satuan.objects.get_or_create(kode='PCS', defaults={'nama': 'Pieces'})
        self.sat_box, _ = Satuan.objects.get_or_create(kode='BOX', defaults={'nama': 'Box'})
        self.barang, _ = Barang.objects.get_or_create(
            kode='B1-0001',
            defaults={
                'nama': 'KERTAS HVS A4 70GR',
                'golongan': self.gol,
                'satuan_dasar': self.sat_pcs,
                'merk': 'SIDU'
            }
        )
        StokLedger.objects.filter(barang=self.barang, reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang=self.barang).delete()
        StokSaldo.objects.filter(barang=self.barang).delete()

    def tearDown(self):
        StokLedger.objects.filter(barang=self.barang, reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang=self.barang).delete()
        StokSaldo.objects.filter(barang=self.barang).delete()

    def test_numbering_sequence(self):
        NumberingSequence.objects.filter(jenis__contains='TEST').delete()
        n1 = NumberingSequence.get_next('SEQ-TEST', tahun=2099)
        n2 = NumberingSequence.get_next('SEQ-TEST', tahun=2099)
        n3 = NumberingSequence.get_next('OTHER-TEST', tahun=2099)

        self.assertEqual(n1, 'SEQ-TEST-2099-00001')
        self.assertEqual(n2, 'SEQ-TEST-2099-00002')
        self.assertEqual(n3, 'OTHER-TEST-2099-00001')

    def test_stock_weighted_moving_average(self):
        # 1. Penerimaan 1: 100 PCS @ Rp 10.000
        l1 = StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('100'),
            harga_unit=Decimal('10000'),
            sumber_tipe='GRN',
            sumber_id='1',
            sumber_nomor='GRN-2026-00001'
        )

        saldo = StokSaldo.objects.get(barang=self.barang, gudang=self.gudang)
        self.assertEqual(saldo.qty, Decimal('100'))
        self.assertEqual(saldo.nilai, Decimal('1000000.00'))
        self.assertEqual(saldo.avg_cost, Decimal('10000.0000'))
        self.assertEqual(l1.saldo_qty_setelah, Decimal('100'))
        self.assertEqual(l1.saldo_nilai_setelah, Decimal('1000000.00'))

        # 2. Penerimaan 2: 50 PCS @ Rp 13.000
        # Total nilai = 1.000.000 + 650.000 = 1.650.000
        # Total qty = 150
        # Avg baru = 1.650.000 / 150 = 11.000
        l2 = StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('50'),
            harga_unit=Decimal('13000'),
            sumber_tipe='GRN',
            sumber_id='2',
            sumber_nomor='GRN-2026-00002'
        )

        saldo.refresh_from_db()
        self.assertEqual(saldo.qty, Decimal('150'))
        self.assertEqual(saldo.nilai, Decimal('1650000.00'))
        self.assertEqual(saldo.avg_cost, Decimal('11000.0000'))
        self.assertEqual(l2.saldo_qty_setelah, Decimal('150'))

        # 3. Pengeluaran: 30 PCS (harus keluar dengan avg Rp 11.000)
        # Nilai keluar = 30 * 11.000 = 330.000
        # Sisa nilai = 1.650.000 - 330.000 = 1.320.000
        # Sisa qty = 120
        l3 = StockService.record_out(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('30'),
            sumber_tipe='ISS',
            sumber_id='1',
            sumber_nomor='ISS-2026-00001'
        )

        saldo.refresh_from_db()
        self.assertEqual(saldo.qty, Decimal('120'))
        self.assertEqual(saldo.nilai, Decimal('1320000.00'))
        self.assertEqual(saldo.avg_cost, Decimal('11000.0000'))
        self.assertEqual(l3.qty_dasar, Decimal('-30'))
        self.assertEqual(l3.nilai_unit, Decimal('11000.0000'))
        self.assertEqual(l3.nilai_total, Decimal('-330000.00'))

    def test_stock_cannot_go_negative(self):
        # Coba keluarkan barang yang belum punya stok
        with self.assertRaises(ValidationError) as ctx:
            StockService.record_out(
                barang=self.barang,
                gudang=self.gudang,
                qty=Decimal('10'),
                sumber_tipe='ISS',
                sumber_id='99',
                sumber_nomor='ISS-TEST'
            )
        self.assertIn("tidak cukup", str(ctx.exception))

    def test_ledger_immutability(self):
        l = StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('10'),
            harga_unit=Decimal('5000'),
            sumber_tipe='GRN',
            sumber_id='1',
            sumber_nomor='GRN-TEST'
        )

        # Coba edit ledger -> harus ditolak
        with self.assertRaises(ValidationError):
            l.qty_dasar = Decimal('99')
            l.save()

        # Coba delete ledger -> harus ditolak
        with self.assertRaises(ValidationError):
            l.delete()

    def test_reversal_document(self):
        # 1. Penerimaan 50 PCS @ 10.000
        l_in = StockService.record_in(
            barang=self.barang,
            gudang=self.gudang,
            qty=Decimal('50'),
            harga_unit=Decimal('10000'),
            sumber_tipe='GRN',
            sumber_id='1',
            sumber_nomor='GRN-01'
        )

        # 2. Reversal penerimaan tersebut
        rev = StockService.record_reversal(
            ledger_target=l_in,
            alasan='Faktur salah input oleh vendor'
        )

        saldo = StokSaldo.objects.get(barang=self.barang, gudang=self.gudang)
        self.assertEqual(saldo.qty, Decimal('0'))
        self.assertEqual(saldo.nilai, Decimal('0'))
        self.assertEqual(rev.jenis, 'REV_IN')
        self.assertEqual(rev.qty_dasar, Decimal('-50'))
        self.assertEqual(rev.reversal_of, l_in)

