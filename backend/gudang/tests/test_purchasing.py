from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone

from users.models import User
from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang,
    SuratPesanan, SuratPesananItem, Penerimaan, StokSaldo, StokLedger
)
from gudang.services.purchasing import PurchasingService


class PurchasingTestCase(TestCase):
    def setUp(self):
        self.gudang, _ = Gudang.objects.get_or_create(kode='GUDANG-TEST-PO', defaults={'nama': 'Gudang Test PO', 'is_default': True})
        self.gol, _ = GolonganBarang.objects.get_or_create(kode='B1-TEST', defaults={'nama': 'ATK Test', 'prefix_kode': 'B1'})
        self.sat_pcs, _ = Satuan.objects.get_or_create(kode='PCS-TEST', defaults={'nama': 'Pieces'})

        self.barang, _ = Barang.objects.get_or_create(
            kode='B1-9999',
            defaults={
                'nama': 'KERTAS A4 TEST',
                'golongan': self.gol,
                'satuan_dasar': self.sat_pcs,
                'merk': 'SIDU'
            }
        )
        StokSaldo.objects.filter(barang=self.barang).delete()
        StokLedger.objects.filter(barang=self.barang).delete()

        self.user_maker, _ = User.objects.get_or_create(username='maker_gudang', defaults={'role': 'karyawan'})
        self.user_kasi, _ = User.objects.get_or_create(username='kasi_gudang', defaults={'role': 'kepala_seksi'})

    def tearDown(self):
        Penerimaan.objects.filter(vendor_nama__icontains='PT TOKO ATK MAJU').delete()
        SuratPesanan.objects.filter(vendor_nama__icontains='PT TOKO ATK MAJU').delete()
        StokSaldo.objects.filter(barang=self.barang).delete()
        StokLedger.objects.filter(barang=self.barang).delete()

    def test_po_workflow_and_approval(self):
        # 1. Create PO (Draft)
        items = [{
            'barang': self.barang,
            'kemasan': 'BOX',
            'isi': Decimal('10'),
            'qty_kemasan': Decimal('5'),  # 50 PCS
            'harga_kemasan': Decimal('100000'),  # Rp 100.000 / BOX = Rp 10.000 / PCS
        }]

        po = PurchasingService.create_po(
            tanggal=timezone.now().date(),
            vendor_nama='PT TOKO ATK MAJU',
            items_data=items,
            user=self.user_maker
        )

        self.assertEqual(po.status, SuratPesanan.STATUS_DRAFT)
        self.assertEqual(po.total_nilai, Decimal('500000.00'))
        self.assertTrue(po.nomor.startswith('PO-'))

        # 2. Submit PO
        po = PurchasingService.submit_po(po, self.user_maker)
        self.assertEqual(po.status, SuratPesanan.STATUS_MENUNGGU)

        # 3. Creator cannot approve their own PO
        with self.assertRaises(ValidationError):
            PurchasingService.approve_po(po, self.user_maker)

        # 4. Kasi can approve PO
        po = PurchasingService.approve_po(po, self.user_kasi)
        self.assertEqual(po.status, SuratPesanan.STATUS_DISETUJUI)
        self.assertEqual(po.approved_by, self.user_kasi)

    def test_grn_approval_increases_stock_independently(self):
        # 1. Buat PO yang disetujui
        po = PurchasingService.create_po(
            tanggal=timezone.now().date(),
            vendor_nama='PT TOKO ATK MAJU',
            items_data=[{
                'barang': self.barang,
                'kemasan': 'BOX',
                'isi': Decimal('10'),
                'qty_kemasan': Decimal('2'),  # 20 PCS
                'harga_kemasan': Decimal('50000'),  # Total Rp 100.000, unit Rp 5.000
            }],
            user=self.user_maker
        )
        PurchasingService.submit_po(po, self.user_maker)
        PurchasingService.approve_po(po, self.user_kasi)

        po_item = po.items.first()

        # 2. Buat Penerimaan (GRN) dari PO
        grn = PurchasingService.create_grn(
            tanggal=timezone.now().date(),
            vendor_nama=po.vendor_nama,
            po=po,
            gudang=self.gudang,
            no_faktur='FAKTUR-001',
            tgl_jatuh_tempo=timezone.now().date(),
            metode_pembayaran='Kredit',
            items_data=[{
                'barang': self.barang,
                'po_item': po_item,
                'kemasan': 'BOX',
                'isi': Decimal('10'),
                'qty_kemasan': Decimal('2'),
                'harga_kemasan': Decimal('50000'),
            }],
            user=self.user_maker
        )

        self.assertEqual(grn.status, Penerimaan.STATUS_DRAFT)

        # 3. Setujui Penerimaan oleh Kasi
        grn = PurchasingService.approve_grn(grn, self.user_kasi)

        self.assertEqual(grn.status, Penerimaan.STATUS_DISETUJUI)

        # Saldo stok harus bertambah 20 PCS @ Rp 5.000
        saldo = StokSaldo.objects.get(barang=self.barang, gudang=self.gudang)
        self.assertEqual(saldo.qty, Decimal('20'))
        self.assertEqual(saldo.nilai, Decimal('100000.00'))
        self.assertEqual(saldo.avg_cost, Decimal('5000.0000'))

        # PO harus berstatus SELESAI karena 20 PCS terpenuhi
        po.refresh_from_db()
        self.assertEqual(po.status, SuratPesanan.STATUS_SELESAI)

    def test_grn_with_discount_rows_prorates_hpp_accurately(self):
        barang_b, _ = Barang.objects.get_or_create(
            kode='B1-9998',
            defaults={
                'nama': 'PULPEN TEST GRN',
                'golongan': self.gol,
                'satuan_dasar': self.sat_pcs,
                'merk': 'STD'
            }
        )
        StokSaldo.objects.filter(barang=barang_b).delete()
        StokLedger.objects.filter(barang=barang_b).delete()

        po = PurchasingService.create_po(
            tanggal=timezone.now().date(),
            vendor_nama='PT TOKO ATK MAJU',
            items_data=[
                {
                    'barang': self.barang,
                    'kemasan': 'BOX',
                    'isi': Decimal('10'),
                    'qty_kemasan': Decimal('1'),  # 10 PCS * 10.000 = 100.000
                    'harga_kemasan': Decimal('100000'),
                },
                {
                    'barang': barang_b,
                    'kemasan': 'BOX',
                    'isi': Decimal('10'),
                    'qty_kemasan': Decimal('2'),  # 20 PCS * 10.000 = 200.000
                    'harga_kemasan': Decimal('100000'),
                },
            ],
            user=self.user_maker
        )
        PurchasingService.submit_po(po, self.user_maker)
        PurchasingService.approve_po(po, self.user_kasi)
        po_items = list(po.items.order_by('id'))

        # Validasi baris diskon tidak lengkap -> gagal
        with self.assertRaises(ValidationError):
            PurchasingService.create_grn(
                tanggal=timezone.now().date(),
                vendor_nama=po.vendor_nama,
                po=po,
                gudang=self.gudang,
                items_data=[
                    {'barang': self.barang, 'po_item': po_items[0], 'kemasan': 'BOX', 'isi': Decimal('10'), 'qty_kemasan': Decimal('1'), 'harga_kemasan': Decimal('100000')},
                ],
                diskon_items=[{'deskripsi': 'Diskon Faktur', 'nilai': 0}],
                user=self.user_maker,
            )

        # Validasi diskon melebihi subtotal bruto -> gagal
        with self.assertRaises(ValidationError):
            PurchasingService.create_grn(
                tanggal=timezone.now().date(),
                vendor_nama=po.vendor_nama,
                po=po,
                gudang=self.gudang,
                items_data=[
                    {'barang': self.barang, 'po_item': po_items[0], 'kemasan': 'BOX', 'isi': Decimal('10'), 'qty_kemasan': Decimal('1'), 'harga_kemasan': Decimal('100000')},
                ],
                diskon_items=[{'deskripsi': 'Diskon Kebesaran', 'nilai': 150000}],
                user=self.user_maker,
            )

        # GRN valid dengan 2 baris diskon (20.000 + 10.000 = 30.000 dari bruto 300.000 -> net 270.000 = 90%)
        grn = PurchasingService.create_grn(
            tanggal=timezone.now().date(),
            vendor_nama=po.vendor_nama,
            po=po,
            gudang=self.gudang,
            no_faktur='FAKTUR-DISC-01',
            metode_pembayaran='Tunai',
            items_data=[
                {'barang': self.barang, 'po_item': po_items[0], 'kemasan': 'BOX', 'isi': Decimal('10'), 'qty_kemasan': Decimal('1'), 'harga_kemasan': Decimal('100000')},
                {'barang': barang_b, 'po_item': po_items[1], 'kemasan': 'BOX', 'isi': Decimal('10'), 'qty_kemasan': Decimal('2'), 'harga_kemasan': Decimal('100000')},
            ],
            diskon_items=[
                {'deskripsi': 'Diskon Rekanan', 'nilai': 20000},
                {'deskripsi': 'Potongan Nota', 'nilai': 10000},
            ],
            user=self.user_maker,
        )
        self.assertEqual(grn.subtotal_bruto, Decimal('300000.00'))
        self.assertEqual(grn.diskon_total, Decimal('30000.00'))
        self.assertEqual(grn.total_nilai, Decimal('270000.00'))
        self.assertEqual(len(grn.diskon_items), 2)

        grn = PurchasingService.approve_grn(grn, self.user_kasi)
        self.assertEqual(grn.status, Penerimaan.STATUS_DISETUJUI)

        saldo_a = StokSaldo.objects.get(barang=self.barang, gudang=self.gudang)
        saldo_b = StokSaldo.objects.get(barang=barang_b, gudang=self.gudang)
        self.assertEqual(saldo_a.nilai, Decimal('90000.00'))
        self.assertEqual(saldo_a.avg_cost, Decimal('9000.0000'))
        self.assertEqual(saldo_b.nilai, Decimal('180000.00'))
        self.assertEqual(saldo_b.avg_cost, Decimal('9000.0000'))
        self.assertEqual(saldo_a.nilai + saldo_b.nilai, grn.total_nilai)

        StokSaldo.objects.filter(barang=barang_b).delete()
        StokLedger.objects.filter(barang=barang_b).delete()
