from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase

from keuangan.models import AccountingPeriod, Akun, Jurnal, JurnalItem, Pelanggan, Pemasok
from keuangan.services import (
    AccountingPostingService,
    AccountingReportService,
    generate_journal_number,
    validate_period_open,
)
from users.models import Unit

User = get_user_model()


class AccountingEngineAndReportTests(TestCase):
    """
    Comprehensive Test Suite for FASE 2:
    Core AccountingPostingService & AccountingReportService.
    """

    @classmethod
    def setUpTestData(cls):
        call_command('seed_coa_rs')

        cls.superuser = User.objects.create_superuser(
            username='super',
            email='super@simak.local',
            password='password123',
        )
        cls.staff_user = User.objects.create_user(
            username='staf_biasa',
            email='staf@simak.local',
            password='password123',
            role='staf',
            is_akuntansi=False,
        )
        cls.manager_akuntansi = User.objects.create_user(
            username='manajer_akt',
            email='mgr@simak.local',
            password='password123',
            role='manajer',
            is_akuntansi=True,
        )

        cls.unit_igd = Unit.objects.create(nama='IGD')
        cls.unit_farmasi = Unit.objects.create(nama='Instalasi Farmasi')

        cls.pelanggan_bpjs = Pelanggan.objects.create(
            kode='CUST-BPJS',
            nama='BPJS Kesehatan Cabang',
            tipe='asuransi',
        )
        cls.pemasok_obat = Pemasok.objects.create(
            kode='SUP-KF',
            nama='PT Kimia Farma Trading',
            tipe='obat',
        )

    def test_01_generate_journal_number_format_and_sequence(self):
        tgl = date(2026, 11, 15)
        no_um_1 = generate_journal_number(Jurnal.JENIS_UMUM, tgl)
        self.assertEqual(no_um_1, 'JRN/UM/202611/0001')

        # Create a journal with no_um_1 so the next call increments to 0002
        AccountingPostingService.create_and_post_journal(
            tanggal=tgl,
            jenis_jurnal=Jurnal.JENIS_UMUM,
            nomor_jurnal=no_um_1,
            keterangan='Setoran modal awal',
            lines=[
                {'kode_akun': '1113', 'debit': Decimal('1000000.00'), 'kredit': Decimal('0.00')},
                {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('1000000.00')},
            ],
            user=self.superuser,
        )

        no_um_2 = generate_journal_number(Jurnal.JENIS_UMUM, tgl)
        self.assertEqual(no_um_2, 'JRN/UM/202611/0002')

        # Different journal type in the same month starts at 0001
        no_pb_1 = generate_journal_number(Jurnal.JENIS_PEMBELIAN, tgl)
        self.assertEqual(no_pb_1, 'JRN/PB/202611/0001')

        no_pj_1 = generate_journal_number(Jurnal.JENIS_PENJUALAN, tgl)
        self.assertEqual(no_pj_1, 'JRN/PJ/202611/0001')

    def test_02_reject_unbalanced_journal(self):
        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.create_and_post_journal(
                tanggal=date(2026, 11, 16),
                keterangan='Jurnal tidak balance',
                lines=[
                    {'kode_akun': '1113', 'debit': Decimal('500000.00'), 'kredit': Decimal('0.00')},
                    {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('450000.00')},
                ],
                user=self.superuser,
            )
        self.assertIn('Unbalanced', str(ctx.exception))

    def test_03_reject_header_non_postable_account(self):
        header_akun = Akun.objects.get(kode_akun='1100')
        self.assertFalse(header_akun.is_postable)

        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.create_and_post_journal(
                tanggal=date(2026, 11, 16),
                keterangan='Posting ke akun header',
                lines=[
                    {'kode_akun': '1100', 'debit': Decimal('250000.00'), 'kredit': Decimal('0.00')},
                    {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('250000.00')},
                ],
                user=self.superuser,
            )
        self.assertIn('is_postable=False', str(ctx.exception))

    def test_04_reject_reconcilable_ar_ap_without_partner(self):
        # 1122 = Piutang Klaim BPJS (is_reconcilable=True)
        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.create_and_post_journal(
                tanggal=date(2026, 11, 16),
                jenis_jurnal=Jurnal.JENIS_PENJUALAN,
                keterangan='Klaim BPJS tanpa partner',
                lines=[
                    {'kode_akun': '1122', 'debit': Decimal('1500000.00'), 'kredit': Decimal('0.00')},
                    {'kode_akun': '4104', 'debit': Decimal('0.00'), 'kredit': Decimal('1500000.00')},
                ],
                user=self.superuser,
            )
        self.assertIn('reconcilable', str(ctx.exception))

        # Now provide partner_type and partner_id -> must succeed
        jurnal = AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 11, 16),
            jenis_jurnal=Jurnal.JENIS_PENJUALAN,
            keterangan='Klaim BPJS dengan partner lengkap',
            lines=[
                {
                    'kode_akun': '1122',
                    'debit': Decimal('1500000.00'),
                    'kredit': Decimal('0.00'),
                    'partner_type': JurnalItem.PARTNER_PELANGGAN,
                    'partner_id': self.pelanggan_bpjs.id,
                },
                {'kode_akun': '4104', 'debit': Decimal('0.00'), 'kredit': Decimal('1500000.00')},
            ],
            user=self.superuser,
        )
        self.assertEqual(jurnal.status, Jurnal.STATUS_POSTED)

    def test_05_idempotency_on_source_type_and_source_id(self):
        lines = [
            {'kode_akun': '1131', 'debit': Decimal('2000000.00'), 'kredit': Decimal('0.00')},
            {
                'kode_akun': '2111',
                'debit': Decimal('0.00'),
                'kredit': Decimal('2000000.00'),
                'partner_type': JurnalItem.PARTNER_PEMASOK,
                'partner_id': self.pemasok_obat.id,
            },
        ]
        j1 = AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 11, 17),
            jenis_jurnal=Jurnal.JENIS_PEMBELIAN,
            keterangan='Penerimaan Barang GRN-001',
            source_type='gudang.PenerimaanBarang',
            source_id=101,
            source_number='GRN/202611/0001',
            lines=lines,
            user=self.superuser,
        )
        j2 = AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 11, 17),
            jenis_jurnal=Jurnal.JENIS_PEMBELIAN,
            keterangan='Duplicate call GRN-001',
            source_type='gudang.PenerimaanBarang',
            source_id=101,
            source_number='GRN/202611/0001',
            lines=lines,
            user=self.superuser,
        )
        self.assertEqual(j1.id, j2.id)
        self.assertEqual(
            Jurnal.objects.filter(source_type='gudang.PenerimaanBarang', source_id=101).count(),
            1,
        )

    def test_06_reverse_journal_swaps_lines_and_zeros_net_balance(self):
        tgl = date(2026, 11, 18)
        j_asal = AccountingPostingService.create_and_post_journal(
            tanggal=tgl,
            jenis_jurnal=Jurnal.JENIS_KAS_BANK,
            keterangan='Pembayaran Beban Listrik',
            source_type='keuangan.PettyCash',
            source_id=555,
            source_number='PC-555',
            lines=[
                {'kode_akun': '6201', 'debit': Decimal('750000.00'), 'kredit': Decimal('0.00')},
                {'kode_akun': '1111', 'debit': Decimal('0.00'), 'kredit': Decimal('750000.00')},
            ],
            user=self.superuser,
        )

        j_rev = AccountingPostingService.reverse_journal(
            jurnal_id=j_asal.id,
            tanggal_reversal=tgl,
            alasan='Salah input nominal tagihan PLN',
            user=self.superuser,
        )

        j_asal.refresh_from_db()
        self.assertEqual(j_asal.status, Jurnal.STATUS_REVERSED)
        self.assertEqual(j_rev.status, Jurnal.STATUS_POSTED)
        self.assertEqual(j_rev.reversal_of_id, j_asal.id)
        self.assertEqual(j_asal.reversed_by.id, j_rev.id)

        # Verify General Ledger for 6201 (Beban Listrik) has 0 closing balance
        gl_6201 = AccountingReportService.get_general_ledger(
            akun_id='6201',
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
        )
        self.assertEqual(gl_6201['total_debit'], Decimal('750000.00'))
        self.assertEqual(gl_6201['total_kredit'], Decimal('750000.00'))
        self.assertEqual(gl_6201['closing_balance'], Decimal('0.00'))

        # Re-reversing the same journal must fail
        with self.assertRaises(ValidationError):
            AccountingPostingService.reverse_journal(jurnal_id=j_asal.id, user=self.superuser)

    def test_07_period_lock_closed_and_soft_locked_enforcement(self):
        tgl_oct = date(2026, 10, 15)
        period_oct = validate_period_open(tgl_oct)
        self.assertEqual(period_oct.status, AccountingPeriod.STATUS_OPEN)

        # Set to SOFT_LOCKED -> regular staff rejected, manager_akuntansi allowed
        period_oct.status = AccountingPeriod.STATUS_SOFT_LOCKED
        period_oct.save(update_fields=['status'])

        with self.assertRaises(ValidationError) as ctx_soft:
            AccountingPostingService.create_and_post_journal(
                tanggal=tgl_oct,
                keterangan='Staf coba posting di soft locked',
                lines=[
                    {'kode_akun': '1113', 'debit': Decimal('100000.00'), 'kredit': Decimal('0.00')},
                    {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('100000.00')},
                ],
                user=self.staff_user,
            )
        self.assertIn('SOFT-LOCKED', str(ctx_soft.exception))

        # Manager Akuntansi succeeds in SOFT_LOCKED period
        j_mgr = AccountingPostingService.create_and_post_journal(
            tanggal=tgl_oct,
            keterangan='Manajer akuntansi posting penyesuaian di soft locked',
            lines=[
                {'kode_akun': '1113', 'debit': Decimal('100000.00'), 'kredit': Decimal('0.00')},
                {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('100000.00')},
            ],
            user=self.manager_akuntansi,
        )
        self.assertEqual(j_mgr.status, Jurnal.STATUS_POSTED)

        # Set to CLOSED -> even superuser is blocked from posting or reversing
        period_oct.status = AccountingPeriod.STATUS_CLOSED
        period_oct.save(update_fields=['status'])

        with self.assertRaises(ValidationError) as ctx_closed:
            AccountingPostingService.create_and_post_journal(
                tanggal=tgl_oct,
                keterangan='Superuser coba posting di closed period',
                lines=[
                    {'kode_akun': '1113', 'debit': Decimal('100000.00'), 'kredit': Decimal('0.00')},
                    {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('100000.00')},
                ],
                user=self.superuser,
            )
        self.assertIn('CLOSED', str(ctx_closed.exception))

    def test_08_general_ledger_trial_balance_pl_and_balance_sheet(self):
        # 1. Opening transaction in October 2026: Modal Awal Rp 50.000.000
        AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 10, 25),
            jenis_jurnal=Jurnal.JENIS_UMUM,
            keterangan='Setoran Modal Awal RS',
            lines=[
                {'kode_akun': '1113', 'debit': Decimal('50000000.00'), 'kredit': Decimal('0.00')},
                {'kode_akun': '3111', 'debit': Decimal('0.00'), 'kredit': Decimal('50000000.00')},
            ],
            user=self.superuser,
        )

        # 2. November 2026: Pendapatan IGD Rp 12.000.000 (Cost Center: unit_igd)
        AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 11, 5),
            jenis_jurnal=Jurnal.JENIS_PENJUALAN,
            keterangan='Pendapatan Layanan IGD & Obat',
            lines=[
                {
                    'kode_akun': '1122',
                    'debit': Decimal('12000000.00'),
                    'kredit': Decimal('0.00'),
                    'partner_type': JurnalItem.PARTNER_PELANGGAN,
                    'partner_id': self.pelanggan_bpjs.id,
                    'unit': self.unit_igd,
                },
                {
                    'kode_akun': '4104',
                    'debit': Decimal('0.00'),
                    'kredit': Decimal('8000000.00'),
                    'unit': self.unit_igd,
                },
                {
                    'kode_akun': '4103',
                    'debit': Decimal('0.00'),
                    'kredit': Decimal('4000000.00'),
                    'unit': self.unit_farmasi,
                },
            ],
            user=self.superuser,
        )

        # 3. November 2026: HPP Pemakaian Obat Rp 1.500.000 & Beban Operasional Rp 500.000
        AccountingPostingService.create_and_post_journal(
            tanggal=date(2026, 11, 10),
            jenis_jurnal=Jurnal.JENIS_PERSEDIAAN,
            keterangan='Pemakaian Obat & ATK',
            lines=[
                {
                    'kode_akun': '5101',
                    'debit': Decimal('1500000.00'),
                    'kredit': Decimal('0.00'),
                    'unit': self.unit_farmasi,
                },
                {
                    'kode_akun': '6204',
                    'debit': Decimal('500000.00'),
                    'kredit': Decimal('0.00'),
                    'unit': self.unit_igd,
                },
                {
                    'kode_akun': '1131',
                    'debit': Decimal('0.00'),
                    'kredit': Decimal('1500000.00'),
                },
                {
                    'kode_akun': '1113',
                    'debit': Decimal('0.00'),
                    'kredit': Decimal('500000.00'),
                },
            ],
            user=self.superuser,
        )

        # Verify General Ledger for Bank 1113 in November 2026:
        # Opening = 50.000.000, Kredit mutation = 500.000 -> Closing = 49.500.000
        gl_bank = AccountingReportService.get_general_ledger(
            akun_id='1113',
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
        )
        self.assertEqual(gl_bank['opening_balance'], Decimal('50000000.00'))
        self.assertEqual(gl_bank['total_debit'], Decimal('0.00'))
        self.assertEqual(gl_bank['total_kredit'], Decimal('500000.00'))
        self.assertEqual(gl_bank['closing_balance'], Decimal('49500000.00'))

        # Verify Trial Balance for November 2026 is balanced
        tb = AccountingReportService.get_trial_balance(
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
        )
        self.assertTrue(tb['is_balanced'])
        self.assertEqual(tb['total_opening_debit'], Decimal('50000000.00'))
        self.assertEqual(tb['total_opening_kredit'], Decimal('50000000.00'))
        self.assertEqual(tb['total_mutation_debit'], Decimal('14000000.00'))
        self.assertEqual(tb['total_mutation_kredit'], Decimal('14000000.00'))

        # Verify Profit & Loss (Overall November 2026)
        pl_all = AccountingReportService.get_profit_and_loss(
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
        )
        self.assertEqual(pl_all['total_pendapatan'], Decimal('12000000.00'))
        self.assertEqual(pl_all['total_harga_pokok'], Decimal('1500000.00'))
        self.assertEqual(pl_all['gross_profit'], Decimal('10500000.00'))
        self.assertEqual(pl_all['total_beban_operasional'], Decimal('500000.00'))
        self.assertEqual(pl_all['net_income'], Decimal('10000000.00'))

        # Verify Profit & Loss filtered by Cost Center (IGD only: Revenue 8M - Expense 500k = 7.5M)
        pl_igd = AccountingReportService.get_profit_and_loss(
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
            unit_id=self.unit_igd.id,
        )
        self.assertEqual(pl_igd['total_pendapatan'], Decimal('8000000.00'))
        self.assertEqual(pl_igd['total_beban_operasional'], Decimal('500000.00'))
        self.assertEqual(pl_igd['net_income'], Decimal('7500000.00'))

        # Verify Balance Sheet as of 2026-11-30 includes Current Year Earnings (10M)
        # Assets = 49.5M (Bank) + 12M (AR) - 1.5M (Inventory credit) = 60.000.000
        # Equity = 50M (Modal) + 10M (Laba Tahun Berjalan) = 60.000.000
        bs = AccountingReportService.get_balance_sheet(as_of_date=date(2026, 11, 30))
        self.assertTrue(bs['is_balanced'])
        self.assertEqual(bs['total_assets'], Decimal('60000000.00'))
        self.assertEqual(bs['current_year_earnings'], Decimal('10000000.00'))
        self.assertEqual(bs['total_equity'], Decimal('60000000.00'))
        self.assertEqual(bs['total_liabilities_and_equity'], Decimal('60000000.00'))

    def test_09_partner_aging_buckets_ar_and_ap(self):
        as_of = date(2026, 11, 30)

        # 1. Invoice 1: Not yet due (due 2026-12-10 -> current) Rp 3.000.000
        # 2. Invoice 2: 20 days overdue (due 2026-11-10 -> days_1_30) Rp 2.000.000
        # 3. Invoice 3: 45 days overdue (due 2026-10-16 -> days_31_60) Rp 1.000.000
        # 4. Invoice 4: 100 days overdue (due 2026-08-22 -> days_over_90) Rp 4.000.000
        buckets_input = [
            (date(2026, 11, 20), date(2026, 12, 10), Decimal('3000000.00')),
            (date(2026, 10, 20), date(2026, 11, 10), Decimal('2000000.00')),
            (date(2026, 9, 16), date(2026, 10, 16), Decimal('1000000.00')),
            (date(2026, 7, 22), date(2026, 8, 22), Decimal('4000000.00')),
        ]
        for idx, (tgl_jurnal, tgl_tempo, nominal) in enumerate(buckets_input, start=1):
            AccountingPostingService.create_and_post_journal(
                tanggal=tgl_jurnal,
                jenis_jurnal=Jurnal.JENIS_PENJUALAN,
                keterangan=f'Tagihan Klaim #{idx}',
                lines=[
                    {
                        'kode_akun': '1122',
                        'debit': nominal,
                        'kredit': Decimal('0.00'),
                        'partner_type': JurnalItem.PARTNER_PELANGGAN,
                        'partner_id': self.pelanggan_bpjs.id,
                        'tanggal_jatuh_tempo': tgl_tempo,
                    },
                    {
                        'kode_akun': '4104',
                        'debit': Decimal('0.00'),
                        'kredit': nominal,
                    },
                ],
                user=self.superuser,
            )

        aging = AccountingReportService.get_partner_aging(
            partner_type=JurnalItem.PARTNER_PELANGGAN,
            as_of_date=as_of,
        )
        summary = aging['summary']
        self.assertEqual(summary['current'], Decimal('3000000.00'))
        self.assertEqual(summary['days_1_30'], Decimal('2000000.00'))
        self.assertEqual(summary['days_31_60'], Decimal('1000000.00'))
        self.assertEqual(summary['days_61_90'], Decimal('0.00'))
        self.assertEqual(summary['days_over_90'], Decimal('4000000.00'))
        self.assertEqual(summary['total'], Decimal('10000000.00'))
        self.assertEqual(len(aging['partners']), 1)
        self.assertEqual(aging['partners'][0]['partner_name'], 'BPJS Kesehatan Cabang')

    def test_10_resolve_account_mapping_exact_and_fallback(self):
        # Exact match on CLAIM_REVENUE_COMPONENT with komponen_pendapatan='farmasi' -> 4103
        akun_obat = AccountingPostingService.resolve_account_mapping(
            event_code='CLAIM_REVENUE_COMPONENT',
            komponen_pendapatan='farmasi',
        )
        self.assertEqual(akun_obat.kode_akun, '4103')

        # Fallback to default CLAIM_REVENUE_DEFAULT when unknown component is passed -> 4113
        akun_default = AccountingPostingService.resolve_account_mapping(
            event_code='CLAIM_REVENUE_COMPONENT',
            komponen_pendapatan='komponen_tidak_terdaftar',
        )
        self.assertEqual(akun_default.kode_akun, '4113')
