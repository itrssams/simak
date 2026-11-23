from datetime import date
import calendar

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from keuangan.models import (
    Akun,
    AccountingPeriod,
    AccountMapping,
    RekeningBank,
    SaldoPettyCash,
)


# Format tuple:
# (kode_akun, nama_akun, parent_kode, tipe, saldo_normal, is_postable, is_reconcilable, is_kas_setara)
COA_TEMPLATE_RS = [
    # =========================================================================
    # 1000 - ASET (NERACA)
    # =========================================================================
    ('1000', 'ASET', None, 'aset_lancar', 'debit', False, False, False),
    ('1100', 'ASET LANCAR', '1000', 'aset_lancar', 'debit', False, False, False),
    ('1110', 'Kas dan Setara Kas', '1100', 'aset_lancar', 'debit', False, False, False),
    ('1111', 'Kas Kecil (Petty Cash)', '1110', 'aset_lancar', 'debit', True, False, True),
    ('1112', 'Kas Besar Operasional', '1110', 'aset_lancar', 'debit', True, False, True),
    ('1113', 'Bank BSI Operasional', '1110', 'aset_lancar', 'debit', True, True, True),
    ('1114', 'Bank BRI Operasional', '1110', 'aset_lancar', 'debit', True, True, True),
    ('1115', 'Bank Mandiri Operasional', '1110', 'aset_lancar', 'debit', True, True, True),
    ('1116', 'Bank BCA Operasional', '1110', 'aset_lancar', 'debit', True, True, True),

    ('1120', 'Piutang Pelayanan & Klaim', '1100', 'aset_lancar', 'debit', False, False, False),
    ('1121', 'Piutang Pasien Umum & Penjamin', '1120', 'aset_lancar', 'debit', True, True, False),
    ('1122', 'Piutang Klaim BPJS Kesehatan', '1120', 'aset_lancar', 'debit', True, True, False),
    ('1123', 'Piutang Klaim Asuransi & Perusahaan', '1120', 'aset_lancar', 'debit', True, True, False),
    ('1129', 'Cadangan Kerugian Piutang', '1120', 'aset_lancar', 'kredit', True, False, False),

    ('1130', 'Persediaan Rumah Sakit', '1100', 'aset_lancar', 'debit', False, False, False),
    ('1131', 'Persediaan Obat & BHP Medis', '1130', 'aset_lancar', 'debit', True, False, False),
    ('1132', 'Persediaan Alat Kesehatan Habis Pakai', '1130', 'aset_lancar', 'debit', True, False, False),
    ('1133', 'Persediaan Logistik Umum & Rumah Tangga', '1130', 'aset_lancar', 'debit', True, False, False),
    ('1134', 'Persediaan Bahan Gizi & Dapur', '1130', 'aset_lancar', 'debit', True, False, False),

    ('1140', 'Uang Muka & Biaya Dibayar di Muka', '1100', 'aset_lancar', 'debit', False, False, False),
    ('1141', 'Deposit / Retur Pembelian Vendor', '1140', 'aset_lancar', 'debit', True, True, False),
    ('1142', 'Biaya Dibayar di Muka', '1140', 'aset_lancar', 'debit', True, False, False),

    ('1200', 'ASET TETAP', '1000', 'aset_tetap', 'debit', False, False, False),
    ('1210', 'Harga Perolehan Aset Tetap', '1200', 'aset_tetap', 'debit', False, False, False),
    ('1211', 'Tanah & Bangunan Rumah Sakit', '1210', 'aset_tetap', 'debit', True, False, False),
    ('1212', 'Alat Kesehatan & Medis', '1210', 'aset_tetap', 'debit', True, False, False),
    ('1213', 'Peralatan Elektronik, IT & Inventaris', '1210', 'aset_tetap', 'debit', True, False, False),
    ('1214', 'Kendaraan & Ambulans', '1210', 'aset_tetap', 'debit', True, False, False),

    ('1220', 'Akumulasi Penyusutan Aset Tetap', '1200', 'aset_tetap', 'kredit', False, False, False),
    ('1221', 'Akumulasi Penyusutan Bangunan', '1220', 'aset_tetap', 'kredit', True, False, False),
    ('1222', 'Akumulasi Penyusutan Alat Kesehatan', '1220', 'aset_tetap', 'kredit', True, False, False),
    ('1223', 'Akumulasi Penyusutan Elektronik, IT & Inventaris', '1220', 'aset_tetap', 'kredit', True, False, False),
    ('1224', 'Akumulasi Penyusutan Kendaraan & Ambulans', '1220', 'aset_tetap', 'kredit', True, False, False),

    # =========================================================================
    # 2000 - KEWAJIBAN (NERACA)
    # =========================================================================
    ('2000', 'KEWAJIBAN', None, 'kewajiban_lancar', 'kredit', False, False, False),
    ('2100', 'KEWAJIBAN JANGKA PENDEK', '2000', 'kewajiban_lancar', 'kredit', False, False, False),
    ('2111', 'Utang Usaha Supplier Obat & Alkes', '2100', 'kewajiban_lancar', 'kredit', True, True, False),
    ('2112', 'Utang Usaha Supplier Logistik & Umum', '2100', 'kewajiban_lancar', 'kredit', True, True, False),
    ('2113', 'Utang Penerimaan Barang Belum Difakturkan (GRNI)', '2100', 'kewajiban_lancar', 'kredit', True, True, False),
    ('2121', 'Utang Reimbursement Karyawan', '2100', 'kewajiban_lancar', 'kredit', True, True, False),
    ('2122', 'Utang Jasa Medis Dokter & Nakes', '2100', 'kewajiban_lancar', 'kredit', True, True, False),
    ('2131', 'Utang Pajak (PPN / PPh)', '2100', 'kewajiban_lancar', 'kredit', True, False, False),
    ('2141', 'Pendapatan Klaim Diterima di Muka / Alokasi Dana', '2100', 'kewajiban_lancar', 'kredit', True, True, False),

    ('2200', 'KEWAJIBAN JANGKA PANJANG', '2000', 'kewajiban_jangka_panjang', 'kredit', False, False, False),
    ('2211', 'Utang Pembiayaan & Bank Jangka Panjang', '2200', 'kewajiban_jangka_panjang', 'kredit', True, True, False),

    # =========================================================================
    # 3000 - EKUITAS (NERACA)
    # =========================================================================
    ('3000', 'EKUITAS', None, 'ekuitas', 'kredit', False, False, False),
    ('3100', 'Modal & Saldo Laba', '3000', 'ekuitas', 'kredit', False, False, False),
    ('3111', 'Modal Disetor / Yayasan', '3100', 'ekuitas', 'kredit', True, False, False),
    ('3112', 'Saldo Laba Ditahan', '3100', 'ekuitas', 'kredit', True, False, False),
    ('3113', 'Laba (Rugi) Tahun Berjalan', '3100', 'ekuitas', 'kredit', True, False, False),
    ('3119', 'Ekuitas Saldo Awal (Opening Balance Equity)', '3100', 'ekuitas', 'kredit', True, False, False),

    # =========================================================================
    # 4000 - PENDAPATAN PELAYANAN RS (LABA RUGI)
    # =========================================================================
    ('4000', 'PENDAPATAN PELAYANAN RUMAH SAKIT', None, 'pendapatan', 'kredit', False, False, False),
    ('4100', 'Pendapatan Pelayanan Medis & Penunjang', '4000', 'pendapatan', 'kredit', False, False, False),
    ('4101', 'Pendapatan Administrasi Pasien', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4102', 'Pendapatan Jasa Medis & Visite', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4103', 'Pendapatan Farmasi & Obat', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4104', 'Pendapatan Tindakan Medis', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4105', 'Pendapatan Fisioterapi & Rehabilitasi', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4106', 'Pendapatan Laboratorium', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4107', 'Pendapatan Radiologi', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4108', 'Pendapatan Kamar & Akomodasi Rawat Inap', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4109', 'Pendapatan BHP Medis', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4110', 'Pendapatan Layanan Ambulans', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4111', 'Pendapatan Sewa & Pemakaian Alat Medis', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4112', 'Pendapatan PPN Farmasi', '4100', 'pendapatan', 'kredit', True, False, False),
    ('4113', 'Pendapatan Pelayanan Lainnya', '4100', 'pendapatan', 'kredit', True, False, False),

    ('4200', 'Potongan & Selisih Klaim Pelayanan', '4000', 'pendapatan', 'debit', False, False, False),
    ('4201', 'Selisih Klaim INA-CBGs / COB BPJS', '4200', 'pendapatan', 'debit', True, False, False),
    ('4202', 'Potongan & Diskon Tagihan Pasien', '4200', 'pendapatan', 'debit', True, False, False),

    # =========================================================================
    # 5000 - HARGA POKOK PELAYANAN (LABA RUGI)
    # =========================================================================
    ('5000', 'BEBAN POKOK PELAYANAN (HPP)', None, 'harga_pokok', 'debit', False, False, False),
    ('5100', 'HPP Persediaan & Pelayanan Medis', '5000', 'harga_pokok', 'debit', False, False, False),
    ('5101', 'HPP Pemakaian Obat & BHP Medis', '5100', 'harga_pokok', 'debit', True, False, False),
    ('5102', 'HPP Pemakaian Logistik & Rumah Tangga Unit', '5100', 'harga_pokok', 'debit', True, False, False),
    ('5103', 'Beban Selisih Stock Opname Persediaan', '5100', 'harga_pokok', 'debit', True, False, False),

    # =========================================================================
    # 6000 - BEBAN OPERASIONAL & UMUM (LABA RUGI)
    # =========================================================================
    ('6000', 'BEBAN OPERASIONAL RUMAH SAKIT', None, 'beban_operasional', 'debit', False, False, False),
    ('6100', 'Beban Pegawai & SDM', '6000', 'beban_operasional', 'debit', False, False, False),
    ('6101', 'Beban Gaji, Insentif & Tunjangan SDM', '6100', 'beban_operasional', 'debit', True, False, False),
    ('6102', 'Beban Kesejahteraan, Konsumsi & Perjalanan Dinas', '6100', 'beban_operasional', 'debit', True, False, False),

    ('6200', 'Beban Operasional & Pemeliharaan', '6000', 'beban_operasional', 'debit', False, False, False),
    ('6201', 'Beban ATK & Perlengkapan Kantor', '6200', 'beban_operasional', 'debit', True, False, False),
    ('6202', 'Beban Listrik, Air, Internet & Langganan IT', '6200', 'beban_operasional', 'debit', True, False, False),
    ('6203', 'Beban BBM & Operasional Kendaraan / Ambulans', '6200', 'beban_operasional', 'debit', True, False, False),
    ('6204', 'Beban Pemeliharaan & Perbaikan Aset / Gedung', '6200', 'beban_operasional', 'debit', True, False, False),
    ('6209', 'Beban Operasional Umum Lainnya', '6200', 'beban_operasional', 'debit', True, False, False),

    ('6300', 'Beban Penyusutan Aset Tetap', '6000', 'beban_operasional', 'debit', False, False, False),
    ('6301', 'Beban Penyusutan Bangunan', '6300', 'beban_operasional', 'debit', True, False, False),
    ('6302', 'Beban Penyusutan Alat Kesehatan', '6300', 'beban_operasional', 'debit', True, False, False),
    ('6303', 'Beban Penyusutan Elektronik, IT & Inventaris', '6300', 'beban_operasional', 'debit', True, False, False),
    ('6304', 'Beban Penyusutan Kendaraan & Ambulans', '6300', 'beban_operasional', 'debit', True, False, False),

    # =========================================================================
    # 7000 - PENDAPATAN & BEBAN LAIN-LAIN (LABA RUGI)
    # =========================================================================
    ('7000', 'PENDAPATAN & BEBAN LAIN-LAIN', None, 'pendapatan_lainnya', 'kredit', False, False, False),
    ('7100', 'Pendapatan Lain-Lain', '7000', 'pendapatan_lainnya', 'kredit', False, False, False),
    ('7101', 'Pendapatan Jasa Giro / Bunga Bank', '7100', 'pendapatan_lainnya', 'kredit', True, False, False),
    ('7102', 'Pendapatan Selisih Lebih Stock Opname', '7100', 'pendapatan_lainnya', 'kredit', True, False, False),

    ('7200', 'Beban Lain-Lain', '7000', 'beban_lainnya', 'debit', False, False, False),
    ('7201', 'Beban Administrasi Bank & Pajak Bunga', '7200', 'beban_lainnya', 'debit', True, False, False),
]


# (event_code, komponen_pendapatan, target_kode_akun, keterangan)
DEFAULT_ACCOUNT_MAPPINGS = [
    ('GRN_INVENTORY', '', '1133', 'Persediaan Logistik & Gudang Umum (Default Penerimaan GRN)'),
    ('GRN_AP', '', '2112', 'Utang Usaha Supplier Logistik & Umum (Default Kredit GRN)'),
    ('GRN_CASH', '', '1112', 'Kas Besar Operasional (Pembelian GRN Tunai)'),
    ('GOODS_OUT_EXPENSE', '', '5102', 'HPP Pemakaian Logistik & Rumah Tangga Unit (Bon Pengeluaran Gudang)'),
    ('STOCK_OPNAME_DIFF', '', '5103', 'Beban Selisih Stock Opname Persediaan'),
    ('STOCK_OPNAME_GAIN', '', '7102', 'Pendapatan Selisih Lebih Stock Opname'),
    ('STOCK_OPNAME_LOSS', '', '5103', 'Beban Selisih Kurang Stock Opname'),
    ('CLAIM_AR', '', '1121', 'Piutang Pasien Umum & Penjamin (Default Invoice)'),
    ('CLAIM_AR_BPJS', '', '1122', 'Piutang Klaim BPJS Kesehatan'),
    ('CLAIM_AR_ASURANSI', '', '1123', 'Piutang Klaim Asuransi & Perusahaan'),
    ('CLAIM_REVENUE_DEFAULT', '', '4113', 'Pendapatan Pelayanan RS (Default)'),
    ('CLAIM_COB_DIFF', '', '4201', 'Selisih Klaim INA-CBGs / COB BPJS'),
    ('AP_DEPOSIT_USED', '', '1141', 'Deposit / Retur Pembelian Vendor'),
    ('PETTY_CASH_DEFAULT', '', '1111', 'Kas Kecil (Petty Cash)'),
    ('KAS_BESAR_DEFAULT', '', '1112', 'Kas Besar Operasional'),
    ('REIMBURSEMENT_PAYABLE', '', '2121', 'Utang Reimbursement Karyawan'),
    ('DEPRECIATION_EXPENSE', '', '6303', 'Beban Penyusutan Aset Tetap (Default)'),
    ('DEPRECIATION_ACCUM', '', '1223', 'Akumulasi Penyusutan Aset Tetap (Default)'),

    # 13 Komponen Pendapatan Faktur / Invoice RS
    ('CLAIM_REVENUE_COMPONENT', 'adm', '4101', 'Komponen Tarif: Administrasi'),
    ('CLAIM_REVENUE_COMPONENT', 'jasa', '4102', 'Komponen Tarif: Jasa Medis'),
    ('CLAIM_REVENUE_COMPONENT', 'farmasi', '4103', 'Komponen Tarif: Farmasi'),
    ('CLAIM_REVENUE_COMPONENT', 'tindakan', '4104', 'Komponen Tarif: Tindakan Medis'),
    ('CLAIM_REVENUE_COMPONENT', 'fisio', '4105', 'Komponen Tarif: Fisioterapi'),
    ('CLAIM_REVENUE_COMPONENT', 'lab', '4106', 'Komponen Tarif: Laboratorium'),
    ('CLAIM_REVENUE_COMPONENT', 'rad', '4107', 'Komponen Tarif: Radiologi'),
    ('CLAIM_REVENUE_COMPONENT', 'kamar', '4108', 'Komponen Tarif: Kamar Rawat Inap'),
    ('CLAIM_REVENUE_COMPONENT', 'bhp', '4109', 'Komponen Tarif: BHP Medis'),
    ('CLAIM_REVENUE_COMPONENT', 'ambulan', '4110', 'Komponen Tarif: Ambulans'),
    ('CLAIM_REVENUE_COMPONENT', 'alat', '4111', 'Komponen Tarif: Pemakaian Alat'),
    ('CLAIM_REVENUE_COMPONENT', 'ppn_farmasi', '4112', 'Komponen Tarif: PPN Farmasi'),
    ('CLAIM_REVENUE_COMPONENT', 'lainnya', '4113', 'Komponen Tarif: Lainnya'),
]


class Command(BaseCommand):
    help = 'Seed template Chart of Accounts (CoA) standar Rumah Sakit Indonesia beserta AccountMapping & periode berjalan secara idempotent.'

    @transaction.atomic
    def handle(self, *args, **options):
        akun_map = {}
        created_coa = 0
        updated_coa = 0

        # 1. Seed / Update CoA berurutan dari induk ke anak
        for (
            kode,
            nama,
            parent_kode,
            tipe,
            saldo_normal,
            is_postable,
            is_reconcilable,
            is_kas_setara,
        ) in COA_TEMPLATE_RS:
            parent_obj = akun_map.get(parent_kode) if parent_kode else None
            if parent_kode and not parent_obj:
                parent_obj = Akun.objects.filter(kode_akun=parent_kode).first()

            kategori_laporan = Akun.infer_kategori_laporan(tipe)
            obj, created = Akun.objects.update_or_create(
                kode_akun=kode,
                defaults={
                    'nama_akun': nama,
                    'parent': parent_obj,
                    'tipe': tipe,
                    'kategori_laporan': kategori_laporan,
                    'saldo_normal': saldo_normal,
                    'is_postable': is_postable,
                    'is_reconcilable': is_reconcilable,
                    'is_kas_setara': is_kas_setara,
                    'is_active': True,
                },
            )
            akun_map[kode] = obj
            if created:
                created_coa += 1
            else:
                updated_coa += 1

        # 2. Seed Default AccountMapping
        created_map = 0
        updated_map = 0
        for event_code, komponen, target_kode, ket in DEFAULT_ACCOUNT_MAPPINGS:
            target_akun = akun_map.get(target_kode) or Akun.objects.filter(kode_akun=target_kode).first()
            if not target_akun:
                continue
            _, created = AccountMapping.objects.update_or_create(
                event_code=event_code,
                komponen_pendapatan=komponen,
                golongan_barang=None,
                kategori_aset=None,
                defaults={
                    'akun': target_akun,
                    'keterangan': ket,
                    'is_active': True,
                },
            )
            if created:
                created_map += 1
            else:
                updated_map += 1

        # 3. Link SaldoPettyCash & RekeningBank ke akun_akuntansi default bila belum terisi
        akun_pc = akun_map.get('1111')
        if akun_pc:
            SaldoPettyCash.objects.filter(akun_akuntansi__isnull=True).update(akun_akuntansi=akun_pc)

        bank_code_map = {
            'bsi': '1113',
            'bri': '1114',
            'mandiri': '1115',
            'bca': '1116',
        }
        for bank_key, kode_akun in bank_code_map.items():
            akun_bank = akun_map.get(kode_akun)
            if akun_bank:
                RekeningBank.objects.filter(
                    bank=bank_key,
                    akun_akuntansi__isnull=True,
                ).update(akun_akuntansi=akun_bank)

        # 4. Pastikan periode akuntansi bulan berjalan tersedia (status open)
        today = timezone.localdate()
        last_day = calendar.monthrange(today.year, today.month)[1]
        period, _ = AccountingPeriod.objects.get_or_create(
            tahun=today.year,
            bulan=today.month,
            defaults={
                'tanggal_mulai': date(today.year, today.month, 1),
                'tanggal_selesai': date(today.year, today.month, last_day),
                'status': AccountingPeriod.STATUS_OPEN,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Berhasil seed CoA RS: {created_coa} akun baru, {updated_coa} akun diperbarui | '
                f'AccountMapping: {created_map} baru, {updated_map} diperbarui | '
                f'Periode aktif: {period.nama_periode}.'
            )
        )
