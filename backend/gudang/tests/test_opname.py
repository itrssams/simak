from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from users.models import User
from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang,
    StockOpname, StockOpnameItem, StokSaldo, StokLedger
)
from gudang.services.opname import OpnameService
from gudang.services.stock import StockService


class OpnameTestCase(TestCase):
    def setUp(self):
        self.gudang, _ = Gudang.objects.get_or_create(kode='GUDANG-TEST-OPN', defaults={'nama': 'Gudang Test Opname', 'is_default': True})
        self.gol, _ = GolonganBarang.objects.get_or_create(kode='B1-OPN', defaults={'nama': 'ATK Opn', 'prefix_kode': 'B1'})
        self.sat_pcs, _ = Satuan.objects.get_or_create(kode='PCS-OPN', defaults={'nama': 'Pieces'})

        self.b1, _ = Barang.objects.get_or_create(
            kode='B1-OPN-01',
            defaults={'nama': 'BUKU TULIS TEST', 'golongan': self.gol, 'satuan_dasar': self.sat_pcs}
        )
        self.b2, _ = Barang.objects.get_or_create(
            kode='B1-OPN-02',
            defaults={'nama': 'SPIDOL WHITEBOARD TEST', 'golongan': self.gol, 'satuan_dasar': self.sat_pcs}
        )

        StokLedger.objects.filter(barang__in=[self.b1, self.b2], reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang__in=[self.b1, self.b2]).delete()
        StokSaldo.objects.filter(barang__in=[self.b1, self.b2]).delete()

        self.user, _ = User.objects.get_or_create(username='petugas_opn', defaults={'role': 'karyawan'})

    def tearDown(self):
        StockOpname.objects.filter(gudang=self.gudang).delete()
        StokLedger.objects.filter(barang__in=[self.b1, self.b2], reversal_of__isnull=False).delete()
        StokLedger.objects.filter(barang__in=[self.b1, self.b2]).delete()
        StokSaldo.objects.filter(barang__in=[self.b1, self.b2]).delete()

    def test_saldo_awal_cut_over(self):
        # 1. Buat Saldo Awal Cut-Over untuk 2 barang
        opn = OpnameService.create_opname(
            tanggal=timezone.now().date(),
            jenis=StockOpname.JENIS_SALDO_AWAL,
            gudang=self.gudang,
            items_data=[
                {'barang': self.b1, 'qty_fisik': Decimal('100'), 'harga_unit': Decimal('5000')},
                {'barang': self.b2, 'qty_fisik': Decimal('50'), 'harga_unit': Decimal('8000')},
            ],
            catatan='Saldo Awal Cut-Over Resmi',
            user=self.user
        )

        self.assertEqual(opn.status, StockOpname.STATUS_DRAFT)
        self.assertTrue(opn.nomor.startswith('OPN-'))
        self.assertEqual(opn.total_nilai_fisik, Decimal('900000.00'))  # 500k + 400k

        # 2. Setujui dan Terapkan ke Stok
        opn = OpnameService.approve_opname(opn, user=self.user)
        self.assertEqual(opn.status, StockOpname.STATUS_DISETUJUI)

        # 3. Cek saldo barang di database
        s1 = StokSaldo.objects.get(barang=self.b1, gudang=self.gudang)
        self.assertEqual(s1.qty, Decimal('100.000'))
        self.assertEqual(s1.avg_cost, Decimal('5000.0000'))
        self.assertEqual(s1.nilai, Decimal('500000.00'))

        s2 = StokSaldo.objects.get(barang=self.b2, gudang=self.gudang)
        self.assertEqual(s2.qty, Decimal('50.000'))
        self.assertEqual(s2.avg_cost, Decimal('8000.0000'))
        self.assertEqual(s2.nilai, Decimal('400000.00'))

    def test_routine_opname_adjustments(self):
        # Saldo awal b1 = 100 pcs @ 5000
        StockService.record_in(
            barang=self.b1, gudang=self.gudang, qty=Decimal('100'), harga_unit=Decimal('5000'),
            sumber_tipe='INIT', sumber_id='1', user=self.user
        )

        # Hitung fisik: ternyata ada 105 pcs (lebih 5 pcs)
        opn = OpnameService.create_opname(
            tanggal=timezone.now().date(),
            jenis=StockOpname.JENIS_RUTIN,
            gudang=self.gudang,
            items_data=[
                {'barang': self.b1, 'qty_fisik': Decimal('105')},
            ],
            user=self.user
        )
        item = opn.items.first()
        self.assertEqual(item.qty_sistem, Decimal('100.000'))
        self.assertEqual(item.selisih, Decimal('5.000'))

        # Setujui opname
        OpnameService.approve_opname(opn, user=self.user)

        s1 = StokSaldo.objects.get(barang=self.b1, gudang=self.gudang)
        self.assertEqual(s1.qty, Decimal('105.000'))

