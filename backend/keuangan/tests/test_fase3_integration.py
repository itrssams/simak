from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from aset.models import Aset, AsetJenis, AsetKategori, AsetKelompok
from gudang.models import Barang, GolonganBarang, Gudang, Ruang, Satuan, StockOpname, Vendor
from gudang.services.distribution import DistributionService
from gudang.services.opname import OpnameService
from gudang.services.purchasing import PurchasingService
from keuangan.models import (
    AccountMapping,
    AccountingPeriod,
    Akun,
    DepositVendor,
    Faktur,
    ItemLaporanPenggunaan,
    Jurnal,
    LaporanPenggunaan,
    Pelanggan,
    PembayaranFaktur,
    PembayaranUtang,
    PettyCash,
    RekeningBank,
    SaldoPettyCash,
    UtangSupplier,
)
from keuangan.services import AutoPostingService, DepreciationPostingService
from users.models import Unit

User = get_user_model()


class Fase3AccountingIntegrationTests(TestCase):
    """
    End-to-End Integration Test Suite for FASE 3:
    - Bagian A: Auto-Posting Hooks across Gudang (GRN, Pengeluaran, StockOpname),
      Keuangan (Faktur, PembayaranFaktur, PembayaranUtang, PettyCash), and Aset (Monthly Depreciation).
    - Bagian B: REST API Endpoints for CoA Tree, AccountingPeriod, AccountMapping,
      Jurnal & Reversal, Financial Reports (Buku Besar, Neraca Saldo, Laba Rugi, Neraca, Aging),
      and Depreciation Trigger.
    """

    @classmethod
    def setUpTestData(cls):
        call_command('seed_coa_rs')

        cls.unit_igd = Unit.objects.create(nama='IGD')
        cls.unit_logistik = Unit.objects.create(nama='Logistik Umum')

        cls.superuser = User.objects.create_superuser(
            username='super',
            email='super@simak.local',
            password='password123',
            unit=cls.unit_logistik,
        )
        cls.creator_user = User.objects.create_user(
            username='petugas_gudang',
            email='gudang@simak.local',
            password='password123',
            role='staf',
            is_logistik=True,
            unit=cls.unit_igd,
        )
        cls.approver_user = User.objects.create_user(
            username='manajer_keu',
            email='manajer@simak.local',
            password='password123',
            role='manajer',
            is_keuangan=True,
            is_akuntansi=True,
            is_logistik=True,
            unit=cls.unit_logistik,
        )

        # Gudang Master Data
        cls.gudang = Gudang.get_default()
        cls.satuan_pcs, _ = Satuan.objects.get_or_create(
            kode='PCS',
            defaults={'nama': 'Pieces'},
        )
        cls.golongan_atk, _ = GolonganBarang.objects.get_or_create(
            kode='ATK',
            defaults={'nama': 'Alat Tulis Kantor'},
        )
        cls.barang_kertas = Barang.objects.create(
            kode='BRG-A4',
            nama='Kertas HVS A4 80gr',
            golongan=cls.golongan_atk,
            satuan_dasar=cls.satuan_pcs,
            stok_minimum=Decimal('10.000'),
        )
        cls.ruang_igd = Ruang.objects.create(
            kode='RNG-IGD',
            nama='Ruang IGD Utama',
            unit=cls.unit_igd,
        )
        cls.vendor_atk = Vendor.objects.create(
            kode='VND-001',
            nama='PT Sumber Kertas Jaya',
        )

        # Keuangan Master Data
        cls.pelanggan_asuransi = Pelanggan.objects.create(
            kode='ASR-01',
            nama='PT Asuransi Jiwa Sehat',
            tipe='asuransi',
        )
        cls.akun_bank_bsi = Akun.objects.get(kode_akun='1113')
        cls.rekening_bsi = RekeningBank.objects.create(
            nama_rekening='RS Siaga Operasional',
            bank='bsi',
            nomor_rekening='7779989978',
            saldo=Decimal('500000000.00'),
            akun_akuntansi=cls.akun_bank_bsi,
            is_active=True,
        )
        cls.akun_kas_kecil = Akun.objects.get(kode_akun='1111')
        cls.saldo_pc, _ = SaldoPettyCash.objects.update_or_create(
            pk=1,
            defaults={
                'saldo': Decimal('10000000.00'),
                'akun_akuntansi': cls.akun_kas_kecil,
            },
        )

        # Aset Master Data (PMK 72/2023)
        cls.kelompok_k1, _ = AsetKelompok.objects.get_or_create(
            kode='K1',
            defaults={
                'nama': 'Kelompok 1 (4 Tahun)',
                'masa_manfaat_tahun': Decimal('4.0'),
                'masa_manfaat_bulan': 48,
                'tarif_garis_lurus': Decimal('25.00'),
                'disusutkan': True,
            },
        )
        cls.kategori_it, _ = AsetKategori.objects.get_or_create(
            kode='IT',
            defaults={'nama': 'Perangkat IT & Komputer'},
        )
        cls.jenis_server, _ = AsetJenis.objects.get_or_create(
            kode='SRV',
            defaults={
                'kategori': cls.kategori_it,
                'nama': 'Server Rackmount',
                'kelompok_default': cls.kelompok_k1,
            },
        )
        cls.aset_server = Aset.objects.create(
            kode_aset='IT.SRV.0001',
            jenis=cls.jenis_server,
            deskripsi='Server SIMAK Database Primary',
            unit=cls.unit_igd,
            status_kelayakan='A',
            status_aset='aktif',
            status_data='lengkap',
            bulan_perolehan=date(2026, 1, 1),
            harga_perolehan=Decimal('24000000.00'),
            kelompok=cls.kelompok_k1,
            masa_manfaat_bulan=48,
        )

    def test_01_gudang_grn_goods_out_and_stock_opname_auto_posting(self):
        tgl = date(2026, 11, 10)

        # 1. Create & Approve Credit GRN (100 PCS @ Rp 50.000 = Rp 5.000.000)
        grn = PurchasingService.create_grn(
            tanggal=tgl,
            vendor_nama=self.vendor_atk.nama,
            vendor_id=self.vendor_atk.id,
            no_faktur='FAK-ATK-001',
            tgl_jatuh_tempo=date(2026, 12, 10),
            metode_pembayaran='Kredit',
            items_data=[
                {
                    'barang': self.barang_kertas,
                    'kemasan': 'PCS',
                    'isi': 1,
                    'qty_kemasan': 100,
                    'harga_kemasan': Decimal('50000.00'),
                }
            ],
            user=self.creator_user,
        )
        PurchasingService.approve_grn(grn, user=self.approver_user)
        grn.refresh_from_db()

        # Verify UtangSupplier was auto-created & linked
        self.assertIsNotNone(grn.utang_supplier_id)
        utang = UtangSupplier.objects.get(pk=grn.utang_supplier_id)
        self.assertEqual(utang.nominal, Decimal('5000000.00'))

        # Verify Purchase Journal was auto-posted
        j_grn = Jurnal.objects.filter(
            source_type='gudang.Penerimaan',
            source_id=grn.id,
        ).first()
        self.assertIsNotNone(j_grn)
        self.assertEqual(j_grn.status, Jurnal.STATUS_POSTED)
        self.assertTrue(j_grn.is_balanced)
        self.assertEqual(j_grn.total_debit, Decimal('5000000.00'))

        # 2. Create Permintaan -> Approve -> Create Pengeluaran (20 PCS @ Rp 50.000 = Rp 1.000.000) -> Approve
        permintaan = DistributionService.create_permintaan(
            ruang=self.ruang_igd,
            items_data=[{'barang': self.barang_kertas, 'qty_minta': 20}],
            user=self.creator_user,
            tanggal=tgl,
        )
        DistributionService.approve_permintaan(permintaan, user=self.approver_user)
        p_item = permintaan.items.first()

        pengeluaran = DistributionService.create_pengeluaran(
            ruang=self.ruang_igd,
            permintaan=permintaan,
            items_data=[
                {
                    'barang': self.barang_kertas,
                    'permintaan_item': p_item,
                    'qty': 20,
                }
            ],
            user=self.creator_user,
            tanggal=tgl,
        )
        DistributionService.approve_pengeluaran(pengeluaran, user=self.approver_user)

        # Verify Goods Out Inventory Journal was auto-posted with Cost Center (unit_igd)
        j_out = Jurnal.objects.filter(
            source_type='gudang.Pengeluaran',
            source_id=pengeluaran.id,
        ).first()
        self.assertIsNotNone(j_out)
        self.assertEqual(j_out.status, Jurnal.STATUS_POSTED)
        self.assertTrue(j_out.is_balanced)
        self.assertEqual(j_out.total_debit, Decimal('1000000.00'))
        debit_item = j_out.items.filter(debit__gt=0).first()
        self.assertEqual(debit_item.unit_id, self.unit_igd.id)
        self.assertEqual(debit_item.akun.kode_akun, '5102')

        # 3. Stock Opname Rutin: System has 80 PCS, physical count is 78 PCS (selisih -2 PCS = -Rp 100.000)
        opname = OpnameService.create_opname(
            tanggal=tgl,
            jenis=StockOpname.JENIS_RUTIN,
            gudang=self.gudang,
            items_data=[{'barang': self.barang_kertas, 'qty_fisik': 78}],
            user=self.creator_user,
        )
        OpnameService.approve_opname(opname, user=self.approver_user)

        j_opn = Jurnal.objects.filter(
            source_type='gudang.StockOpname',
            source_id=opname.id,
        ).first()
        self.assertIsNotNone(j_opn)
        self.assertEqual(j_opn.status, Jurnal.STATUS_POSTED)
        self.assertTrue(j_opn.is_balanced)
        self.assertEqual(j_opn.total_debit, Decimal('100000.00'))

    def test_02_faktur_claim_and_payment_auto_posting(self):
        # Create Faktur with COB breakdown: Real RS = 10.000.000, BPJS COB = 3.000.000 -> Net Tagihan = 7.000.000
        faktur = Faktur.objects.create(
            nomor_faktur='260001',
            tanggal=date(2026, 11, 12),
            jatuh_tempo=date(2026, 12, 27),
            pelanggan=self.pelanggan_asuransi,
            jasa=Decimal('3000000.00'),
            tindakan=Decimal('4000000.00'),
            farmasi=Decimal('2000000.00'),
            lab=Decimal('1000000.00'),
            is_cob=True,
            tanggungan_bpjs=Decimal('3000000.00'),
            tgl_kirim=date(2026, 11, 12),
            created_by=self.approver_user,
        )
        self.assertEqual(faktur.total_tagihan, Decimal('7000000.00'))

        j_faktur = AutoPostingService.post_faktur_finalized(faktur, user=self.approver_user)
        self.assertIsNotNone(j_faktur)
        self.assertTrue(j_faktur.is_balanced)
        # Debit = 7M (Piutang Asuransi 1123) + 3M (Selisih COB 4201) = 10M; Credit = 3M + 4M + 2M + 1M = 10M
        self.assertEqual(j_faktur.total_debit, Decimal('10000000.00'))
        self.assertEqual(j_faktur.total_kredit, Decimal('10000000.00'))

        # Verify payment of Rp 7.000.000
        pembayaran = PembayaranFaktur.objects.create(
            faktur=faktur,
            tanggal=date(2026, 11, 20),
            jumlah=Decimal('7000000.00'),
            metode='transfer',
            akun=self.akun_bank_bsi,
            status_verifikasi='terverifikasi',
            verified_by=self.approver_user,
            created_by=self.approver_user,
        )
        j_pay = AutoPostingService.post_pembayaran_faktur_verified(
            pembayaran,
            user=self.approver_user,
        )
        self.assertIsNotNone(j_pay)
        self.assertTrue(j_pay.is_balanced)
        self.assertEqual(j_pay.total_debit, Decimal('7000000.00'))

    def test_03_pembayaran_utang_with_vendor_deposit_auto_posting(self):
        utang = UtangSupplier.objects.create(
            app_siaga_faktur_id='MAN-UTG-01',
            sumber=UtangSupplier.SUMBER_MANUAL,
            nomor_faktur='INV-SUP-009',
            vendor_id=self.vendor_atk.id,
            vendor_nama=self.vendor_atk.nama,
            tanggal_faktur=date(2026, 11, 5),
            tanggal_jatuh_tempo=date(2026, 12, 5),
            nominal=Decimal('4000000.00'),
            status=UtangSupplier.STATUS_BELUM_DIBAYAR,
        )
        DepositVendor.objects.create(
            vendor_id=self.vendor_atk.id,
            vendor_nama=self.vendor_atk.nama,
            utang_asal=utang,
            nominal_retur=Decimal('500000.00'),
            terpakai=Decimal('0.00'),
        )
        pembayaran_utang = PembayaranUtang.objects.create(
            utang=utang,
            tanggal_proses=date(2026, 11, 18),
            jumlah_bayar=Decimal('4000000.00'),
            potongan_deposit=Decimal('500000.00'),
            jumlah_kas_keluar=Decimal('3500000.00'),
            status=PembayaranUtang.STATUS_REALISASI_LUNAS,
            created_by=self.approver_user,
        )

        j_utang = AutoPostingService.post_pembayaran_utang_realized(
            pembayaran_utang,
            user=self.approver_user,
            rekening_bank_id=self.rekening_bsi.id,
        )
        self.assertIsNotNone(j_utang)
        self.assertTrue(j_utang.is_balanced)
        self.assertEqual(j_utang.total_debit, Decimal('4000000.00'))
        self.assertEqual(j_utang.total_kredit, Decimal('4000000.00'))
        # Check credit lines: 3.5M Bank (1113) + 500k Deposit Retur Vendor (1141)
        kredit_kodes = sorted(
            list(j_utang.items.filter(kredit__gt=0).values_list('akun__kode_akun', flat=True))
        )
        self.assertEqual(kredit_kodes, ['1113', '1141'])

    def test_04_petty_cash_completed_auto_posting(self):
        pc = PettyCash.objects.create(
            tanggal=date(2026, 11, 14),
            keperluan='Pembelian ATK & Konsumsi Rapat IGD',
            nominal=Decimal('350000.00'),
            status='selesai',
            created_by=self.creator_user,
        )
        laporan = LaporanPenggunaan.objects.create(
            petty_cash=pc,
            tanggal_laporan=date(2026, 11, 15),
            nominal_digunakan=Decimal('350000.00'),
            subtotal=Decimal('350000.00'),
            rincian='ATK dan Konsumsi',
            pengembalian_selesai=True,
        )
        ItemLaporanPenggunaan.objects.create(
            laporan=laporan,
            kode_akun='6201',
            nama_akun='Beban ATK',
            deskripsi='Kertas & Spidol',
            qty=Decimal('1'),
            harga_satuan=Decimal('150000.00'),
            nilai=Decimal('150000.00'),
        )
        ItemLaporanPenggunaan.objects.create(
            laporan=laporan,
            kode_akun='6102',
            nama_akun='Beban Konsumsi',
            deskripsi='Snack Rapat IGD',
            qty=Decimal('1'),
            harga_satuan=Decimal('200000.00'),
            nilai=Decimal('200000.00'),
        )

        j_pc = AutoPostingService.post_petty_cash_completed(pc, user=self.approver_user)
        self.assertIsNotNone(j_pc)
        self.assertTrue(j_pc.is_balanced)
        self.assertEqual(j_pc.total_debit, Decimal('350000.00'))
        # Verify ItemLaporanPenggunaan auto-linked its FK `akun`
        for item in laporan.items.all():
            self.assertIsNotNone(item.akun_id)
        # Verify credit is Kas Kecil (1111)
        kredit_item = j_pc.items.filter(kredit__gt=0).first()
        self.assertEqual(kredit_item.akun.kode_akun, '1111')

    def test_05_monthly_depreciation_service_and_rest_api_endpoints(self):
        client = APIClient()
        client.force_authenticate(user=self.superuser)

        # 1. Trigger Monthly Depreciation via POST /api/keuangan/penyusutan/post/
        # Server Rp 24.000.000 / 48 months = Rp 500.000 / month
        res_depr = client.post(
            '/api/keuangan/penyusutan/post/',
            {'tahun': 2026, 'bulan': 11},
            format='json',
        )
        self.assertEqual(res_depr.status_code, 201)
        self.assertEqual(Decimal(str(res_depr.data['jurnal']['total_debit'])), Decimal('500000.00'))
        self.assertTrue(res_depr.data['jurnal']['is_balanced'])

        # 2. Master CoA Tree endpoint: GET /api/keuangan/akun/tree/
        res_tree = client.get('/api/keuangan/akun/tree/')
        self.assertEqual(res_tree.status_code, 200)
        self.assertGreaterEqual(res_tree.data['count'], 90)
        self.assertTrue(len(res_tree.data['tree']) >= 5)

        # 3. Manual Journal Creation (draft) -> Post -> Reverse via API
        res_create_j = client.post(
            '/api/keuangan/jurnal/',
            {
                'tanggal': '2026-11-19',
                'jenis_jurnal': 'umum',
                'keterangan': 'Setoran Modal Yayasan via API',
                'status': 'draft',
                'items': [
                    {'akun': self.akun_bank_bsi.id, 'debit': '15000000.00', 'kredit': '0.00'},
                    {
                        'akun': Akun.objects.get(kode_akun='3111').id,
                        'debit': '0.00',
                        'kredit': '15000000.00',
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(res_create_j.status_code, 201)
        jurnal_id = res_create_j.data['id']
        self.assertEqual(res_create_j.data['status'], 'draft')

        res_post_j = client.post(f'/api/keuangan/jurnal/{jurnal_id}/post/', format='json')
        self.assertEqual(res_post_j.status_code, 200)
        self.assertEqual(res_post_j.data['jurnal']['status'], 'posted')

        res_rev_j = client.post(
            f'/api/keuangan/jurnal/{jurnal_id}/reverse/',
            {'tanggal_reversal': '2026-11-20', 'alasan': 'Uji reversal via API'},
            format='json',
        )
        self.assertEqual(res_rev_j.status_code, 201)
        self.assertEqual(res_rev_j.data['reversal_journal']['status'], 'posted')

        # 4. Financial Report Endpoints
        res_gl = client.get(
            '/api/keuangan/laporan/buku-besar/',
            {'kode_akun': '6303', 'start_date': '2026-11-01', 'end_date': '2026-11-30'},
        )
        self.assertEqual(res_gl.status_code, 200)
        self.assertEqual(Decimal(str(res_gl.data['closing_balance'])), Decimal('500000.00'))

        res_tb = client.get(
            '/api/keuangan/laporan/neraca-saldo/',
            {'start_date': '2026-11-01', 'end_date': '2026-11-30'},
        )
        self.assertEqual(res_tb.status_code, 200)
        self.assertTrue(res_tb.data['is_balanced'])

        res_pl = client.get(
            '/api/keuangan/laporan/laba-rugi/',
            {'start_date': '2026-11-01', 'end_date': '2026-11-30'},
        )
        self.assertEqual(res_pl.status_code, 200)

        res_bs = client.get('/api/keuangan/laporan/neraca/', {'as_of_date': '2026-11-30'})
        self.assertEqual(res_bs.status_code, 200)
        self.assertTrue(res_bs.data['is_balanced'])

        res_aging = client.get(
            '/api/keuangan/laporan/aging/',
            {'partner_type': 'pelanggan', 'as_of_date': '2026-11-30'},
        )
        self.assertEqual(res_aging.status_code, 200)

        # 5. Period Lock/Close/Reopen & AccountMapping Bulk Update Endpoints
        period = AccountingPeriod.objects.filter(tahun=2026, bulan=11).first()
        self.assertIsNotNone(period)
        res_lock = client.post(f'/api/keuangan/periode/{period.id}/soft-lock/', format='json')
        self.assertEqual(res_lock.status_code, 200)
        self.assertEqual(res_lock.data['period']['status'], 'soft_locked')

        res_close = client.post(f'/api/keuangan/periode/{period.id}/close/', format='json')
        self.assertEqual(res_close.status_code, 200)
        self.assertEqual(res_close.data['period']['status'], 'closed')

        res_reopen = client.post(f'/api/keuangan/periode/{period.id}/reopen/', format='json')
        self.assertEqual(res_reopen.status_code, 200)
        self.assertEqual(res_reopen.data['period']['status'], 'open')

        mapping_row = AccountMapping.objects.filter(event_code='PETTY_CASH_DEFAULT').first()
        res_map = client.post(
            '/api/keuangan/account-mapping/bulk-update/',
            {
                'mappings': [
                    {
                        'id': mapping_row.id,
                        'kode_akun': '1111',
                        'keterangan': 'Kas Kecil Default Updated via API',
                    }
                ]
            },
            format='json',
        )
        self.assertEqual(res_map.status_code, 200)
