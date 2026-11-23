from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple, Union

from django.core.exceptions import ValidationError
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce

from keuangan.models import Akun, Jurnal, JurnalItem

from .accounting_engine import ZERO, _coerce_date, _quantize_money

ACTIVE_LEDGER_STATUSES = (Jurnal.STATUS_POSTED, Jurnal.STATUS_REVERSED)


class AccountingReportService:
    """
    Reporting Query Engine for SIMAK Hospital Accounting (Odoo & Accurate Reference).
    Only includes immutable ledger entries (`status IN ('posted', 'reversed')`).
    Draft journals are strictly excluded from all financial reports.
    """

    @staticmethod
    def _signed_delta(saldo_normal: str, debit: Decimal, kredit: Decimal) -> Decimal:
        if saldo_normal == 'kredit':
            return kredit - debit
        return debit - kredit

    @classmethod
    def get_general_ledger(
        cls,
        akun_id: Union[int, str, Akun],
        start_date: Union[date, datetime, str],
        end_date: Union[date, datetime, str],
        unit_id: Optional[int] = None,
        partner_type: Optional[str] = None,
        partner_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Buku Besar (General Ledger) for a single `Akun`:
        - Computes `opening_balance` from all posted/reversed movements before `start_date`.
        - Lists chronological movements inside `[start_date, end_date]` with running balance.
        - Supports optional filtering by Cost Center (`unit_id`) and Sub-Ledger Partner.
        """
        if isinstance(akun_id, Akun):
            akun = akun_id
        elif isinstance(akun_id, str):
            akun = Akun.objects.filter(kode_akun=akun_id.strip()).first()
            if akun is None and akun_id.strip().isdigit():
                akun = Akun.objects.filter(pk=int(akun_id.strip())).first()
            if akun is None:
                raise ValidationError(f'Akun dengan kode/ID "{akun_id}" tidak ditemukan.')
        else:
            try:
                akun = Akun.objects.filter(pk=int(akun_id)).first()
            except (ValueError, TypeError) as exc:
                raise ValidationError(f'Akun dengan ID {akun_id!r} tidak ditemukan.') from exc
            if akun is None:
                akun = Akun.objects.filter(kode_akun=str(akun_id)).first()
            if akun is None:
                raise ValidationError(f'Akun dengan ID {akun_id!r} tidak ditemukan.')

        tgl_mulai = _coerce_date(start_date)
        tgl_selesai = _coerce_date(end_date)
        if tgl_mulai > tgl_selesai:
            raise ValidationError('`start_date` tidak boleh lebih besar dari `end_date`.')

        base_qs = JurnalItem.objects.filter(
            akun=akun,
            jurnal__status__in=ACTIVE_LEDGER_STATUSES,
        )
        if unit_id is not None:
            base_qs = base_qs.filter(unit_id=unit_id)
        if partner_type:
            base_qs = base_qs.filter(partner_type=partner_type)
        if partner_id is not None:
            base_qs = base_qs.filter(partner_id=partner_id)

        opening_agg = base_qs.filter(jurnal__tanggal__lt=tgl_mulai).aggregate(
            total_debit=Coalesce(Sum('debit'), ZERO),
            total_kredit=Coalesce(Sum('kredit'), ZERO),
        )
        open_debit = _quantize_money(opening_agg['total_debit'])
        open_kredit = _quantize_money(opening_agg['total_kredit'])
        opening_balance = cls._signed_delta(akun.saldo_normal, open_debit, open_kredit)

        period_items = (
            base_qs.filter(
                jurnal__tanggal__gte=tgl_mulai,
                jurnal__tanggal__lte=tgl_selesai,
            )
            .select_related('jurnal', 'unit')
            .order_by('jurnal__tanggal', 'jurnal__id', 'id')
        )

        running_balance = opening_balance
        total_debit = ZERO
        total_kredit = ZERO
        entries: List[Dict[str, Any]] = []

        for item in period_items:
            debit = _quantize_money(item.debit)
            kredit = _quantize_money(item.kredit)
            delta = cls._signed_delta(akun.saldo_normal, debit, kredit)
            running_balance += delta
            total_debit += debit
            total_kredit += kredit

            entries.append(
                {
                    'item_id': item.id,
                    'jurnal_id': item.jurnal_id,
                    'nomor_jurnal': item.jurnal.nomor_jurnal,
                    'tanggal': item.jurnal.tanggal,
                    'jenis_jurnal': item.jurnal.jenis_jurnal,
                    'status_jurnal': item.jurnal.status,
                    'source_type': item.jurnal.source_type,
                    'source_id': item.jurnal.source_id,
                    'source_number': item.jurnal.source_number,
                    'keterangan': item.keterangan or item.jurnal.keterangan,
                    'partner_type': item.partner_type,
                    'partner_id': item.partner_id,
                    'unit_id': item.unit_id,
                    'unit_nama': item.unit.nama if item.unit else None,
                    'debit': debit,
                    'kredit': kredit,
                    'running_balance': running_balance,
                }
            )

        return {
            'akun': {
                'id': akun.id,
                'kode_akun': akun.kode_akun,
                'nama_akun': akun.nama_akun,
                'tipe': akun.tipe,
                'kategori_laporan': akun.kategori_laporan,
                'saldo_normal': akun.saldo_normal,
            },
            'start_date': tgl_mulai,
            'end_date': tgl_selesai,
            'opening_balance': opening_balance,
            'total_debit': total_debit,
            'total_kredit': total_kredit,
            'closing_balance': running_balance,
            'entries': entries,
        }

    @classmethod
    def get_trial_balance(
        cls,
        start_date: Union[date, datetime, str],
        end_date: Union[date, datetime, str],
    ) -> Dict[str, Any]:
        """
        Neraca Saldo (Trial Balance) across all active accounts for `[start_date, end_date]`:
        - Computes Opening (Debit/Kredit), Mutation (Debit/Kredit), and Closing (Debit/Kredit).
        - Performs hierarchical parent-child rollup from postable leaf accounts to header accounts.
        - Verifies overall balance across leaf accounts.
        """
        tgl_mulai = _coerce_date(start_date)
        tgl_selesai = _coerce_date(end_date)
        if tgl_mulai > tgl_selesai:
            raise ValidationError('`start_date` tidak boleh lebih besar dari `end_date`.')

        accounts = list(
            Akun.objects.filter(is_active=True)
            .select_related('parent')
            .order_by('kode_akun')
        )

        opening_rows = (
            JurnalItem.objects.filter(
                jurnal__status__in=ACTIVE_LEDGER_STATUSES,
                jurnal__tanggal__lt=tgl_mulai,
            )
            .values('akun_id')
            .annotate(
                debit=Coalesce(Sum('debit'), ZERO),
                kredit=Coalesce(Sum('kredit'), ZERO),
            )
        )
        opening_map = {
            row['akun_id']: (
                _quantize_money(row['debit']),
                _quantize_money(row['kredit']),
            )
            for row in opening_rows
        }

        mutation_rows = (
            JurnalItem.objects.filter(
                jurnal__status__in=ACTIVE_LEDGER_STATUSES,
                jurnal__tanggal__gte=tgl_mulai,
                jurnal__tanggal__lte=tgl_selesai,
            )
            .values('akun_id')
            .annotate(
                debit=Coalesce(Sum('debit'), ZERO),
                kredit=Coalesce(Sum('kredit'), ZERO),
            )
        )
        mutation_map = {
            row['akun_id']: (
                _quantize_money(row['debit']),
                _quantize_money(row['kredit']),
            )
            for row in mutation_rows
        }

        node_map: Dict[int, Dict[str, Any]] = {}
        children_by_parent: Dict[Optional[int], List[int]] = {}

        for acc in accounts:
            op_d, op_k = opening_map.get(acc.id, (ZERO, ZERO))
            mut_d, mut_k = mutation_map.get(acc.id, (ZERO, ZERO))

            net_opening = op_d - op_k
            opening_debit = net_opening if net_opening > ZERO else ZERO
            opening_kredit = (-net_opening) if net_opening < ZERO else ZERO

            net_closing = (op_d + mut_d) - (op_k + mut_k)
            closing_debit = net_closing if net_closing > ZERO else ZERO
            closing_kredit = (-net_closing) if net_closing < ZERO else ZERO

            node_map[acc.id] = {
                'akun_id': acc.id,
                'kode_akun': acc.kode_akun,
                'nama_akun': acc.nama_akun,
                'parent_id': acc.parent_id,
                'tipe': acc.tipe,
                'kategori_laporan': acc.kategori_laporan,
                'saldo_normal': acc.saldo_normal,
                'is_postable': acc.is_postable,
                'raw_op_d': op_d,
                'raw_op_k': op_k,
                'raw_mut_d': mut_d,
                'raw_mut_k': mut_k,
                'opening_debit': opening_debit,
                'opening_kredit': opening_kredit,
                'mutation_debit': mut_d,
                'mutation_kredit': mut_k,
                'closing_debit': closing_debit,
                'closing_kredit': closing_kredit,
            }
            children_by_parent.setdefault(acc.parent_id, []).append(acc.id)

        # Rollup children raw movements into non-postable parent headers
        def _rollup(acc_id: int) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
            node = node_map[acc_id]
            op_d = node['raw_op_d']
            op_k = node['raw_op_k']
            mut_d = node['raw_mut_d']
            mut_k = node['raw_mut_k']

            for child_id in children_by_parent.get(acc_id, []):
                c_op_d, c_op_k, c_mut_d, c_mut_k = _rollup(child_id)
                op_d += c_op_d
                op_k += c_op_k
                mut_d += c_mut_d
                mut_k += c_mut_k

            if not node['is_postable'] and children_by_parent.get(acc_id):
                net_op = op_d - op_k
                node['opening_debit'] = net_op if net_op > ZERO else ZERO
                node['opening_kredit'] = (-net_op) if net_op < ZERO else ZERO
                node['mutation_debit'] = mut_d
                node['mutation_kredit'] = mut_k
                net_cl = (op_d + mut_d) - (op_k + mut_k)
                node['closing_debit'] = net_cl if net_cl > ZERO else ZERO
                node['closing_kredit'] = (-net_cl) if net_cl < ZERO else ZERO

            return op_d, op_k, mut_d, mut_k

        for root_id in children_by_parent.get(None, []):
            _rollup(root_id)

        total_opening_debit = ZERO
        total_opening_kredit = ZERO
        total_mutation_debit = ZERO
        total_mutation_kredit = ZERO
        total_closing_debit = ZERO
        total_closing_kredit = ZERO

        rows: List[Dict[str, Any]] = []
        for acc in accounts:
            node = node_map[acc.id]
            if node['is_postable']:
                total_opening_debit += node['opening_debit']
                total_opening_kredit += node['opening_kredit']
                total_mutation_debit += node['mutation_debit']
                total_mutation_kredit += node['mutation_kredit']
                total_closing_debit += node['closing_debit']
                total_closing_kredit += node['closing_kredit']

            rows.append(
                {
                    'akun_id': node['akun_id'],
                    'kode_akun': node['kode_akun'],
                    'nama_akun': node['nama_akun'],
                    'parent_id': node['parent_id'],
                    'tipe': node['tipe'],
                    'kategori_laporan': node['kategori_laporan'],
                    'saldo_normal': node['saldo_normal'],
                    'is_postable': node['is_postable'],
                    'opening_debit': node['opening_debit'],
                    'opening_kredit': node['opening_kredit'],
                    'mutation_debit': node['mutation_debit'],
                    'mutation_kredit': node['mutation_kredit'],
                    'closing_debit': node['closing_debit'],
                    'closing_kredit': node['closing_kredit'],
                }
            )

        return {
            'start_date': tgl_mulai,
            'end_date': tgl_selesai,
            'total_opening_debit': total_opening_debit,
            'total_opening_kredit': total_opening_kredit,
            'total_mutation_debit': total_mutation_debit,
            'total_mutation_kredit': total_mutation_kredit,
            'total_closing_debit': total_closing_debit,
            'total_closing_kredit': total_closing_kredit,
            'is_balanced': (
                total_opening_debit == total_opening_kredit
                and total_mutation_debit == total_mutation_kredit
                and total_closing_debit == total_closing_kredit
            ),
            'rows': rows,
        }

    @classmethod
    def get_profit_and_loss(
        cls,
        start_date: Union[date, datetime, str],
        end_date: Union[date, datetime, str],
        unit_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Laporan Laba Rugi (Profit & Loss Statement) for `[start_date, end_date]`:
        - Groups accounts with `kategori_laporan='laba_rugi'` into:
          `pendapatan`, `harga_pokok`, `beban_operasional`, `pendapatan_lainnya`, `beban_lainnya`.
        - Calculates `gross_profit` (Laba Kotor), `operating_income` (Laba Operasional),
          and `net_income` (Laba/Rugi Bersih).
        - Supports optional `unit_id` Cost Center filter.
        """
        tgl_mulai = _coerce_date(start_date)
        tgl_selesai = _coerce_date(end_date)
        if tgl_mulai > tgl_selesai:
            raise ValidationError('`start_date` tidak boleh lebih besar dari `end_date`.')

        item_filter = Q(
            jurnal__status__in=ACTIVE_LEDGER_STATUSES,
            jurnal__tanggal__gte=tgl_mulai,
            jurnal__tanggal__lte=tgl_selesai,
            akun__kategori_laporan='laba_rugi',
        )
        if unit_id is not None:
            item_filter &= Q(unit_id=unit_id)

        agg_rows = (
            JurnalItem.objects.filter(item_filter)
            .values('akun_id')
            .annotate(
                debit=Coalesce(Sum('debit'), ZERO),
                kredit=Coalesce(Sum('kredit'), ZERO),
            )
        )
        movement_map = {
            row['akun_id']: (
                _quantize_money(row['debit']),
                _quantize_money(row['kredit']),
            )
            for row in agg_rows
        }

        pl_accounts = list(
            Akun.objects.filter(kategori_laporan='laba_rugi', is_active=True, is_postable=True)
            .order_by('kode_akun')
        )

        sections: Dict[str, List[Dict[str, Any]]] = {
            'pendapatan': [],
            'harga_pokok': [],
            'beban_operasional': [],
            'pendapatan_lainnya': [],
            'beban_lainnya': [],
        }
        totals: Dict[str, Decimal] = {key: ZERO for key in sections}

        for acc in pl_accounts:
            debit, kredit = movement_map.get(acc.id, (ZERO, ZERO))
            # Revenue categories contribute (kredit - debit) so contra-revenue accounts
            # (e.g. 4201 Potongan/Selisih Klaim COB BPJS) naturally reduce total revenue.
            # Cost/Expense categories contribute (debit - kredit).
            if acc.tipe in ('pendapatan', 'pendapatan_lainnya'):
                amount = kredit - debit
            else:
                amount = debit - kredit

            if amount == ZERO and debit == ZERO and kredit == ZERO:
                continue

            bucket = acc.tipe if acc.tipe in sections else 'beban_lainnya'
            sections[bucket].append(
                {
                    'akun_id': acc.id,
                    'kode_akun': acc.kode_akun,
                    'nama_akun': acc.nama_akun,
                    'tipe': acc.tipe,
                    'saldo_normal': acc.saldo_normal,
                    'debit': debit,
                    'kredit': kredit,
                    'amount': amount,
                }
            )
            totals[bucket] += amount

        total_pendapatan = totals['pendapatan']
        total_hpp = totals['harga_pokok']
        gross_profit = total_pendapatan - total_hpp
        total_beban_operasional = totals['beban_operasional']
        operating_income = gross_profit - total_beban_operasional
        total_pendapatan_lainnya = totals['pendapatan_lainnya']
        total_beban_lainnya = totals['beban_lainnya']
        net_income = operating_income + total_pendapatan_lainnya - total_beban_lainnya

        return {
            'start_date': tgl_mulai,
            'end_date': tgl_selesai,
            'unit_id': unit_id,
            'sections': sections,
            'total_pendapatan': total_pendapatan,
            'total_harga_pokok': total_hpp,
            'gross_profit': gross_profit,
            'total_beban_operasional': total_beban_operasional,
            'operating_income': operating_income,
            'total_pendapatan_lainnya': total_pendapatan_lainnya,
            'total_beban_lainnya': total_beban_lainnya,
            'net_income': net_income,
        }

    @classmethod
    def get_balance_sheet(
        cls,
        as_of_date: Union[date, datetime, str],
    ) -> Dict[str, Any]:
        """
        Laporan Posisi Keuangan / Neraca (Balance Sheet) cumulative up to `as_of_date`:
        - Groups `kategori_laporan='neraca'` accounts into Assets, Liabilities, and Equity.
        - Automatically computes unclosed cumulative net income (`current_year_earnings` /
          Laba Tahun Berjalan) from all `laba_rugi` movements up to `as_of_date` and injects
          it into Equity so `total_assets == total_liabilities + total_equity`.
        """
        tgl_cutoff = _coerce_date(as_of_date)

        agg_rows = (
            JurnalItem.objects.filter(
                jurnal__status__in=ACTIVE_LEDGER_STATUSES,
                jurnal__tanggal__lte=tgl_cutoff,
                akun__kategori_laporan='neraca',
            )
            .values('akun_id')
            .annotate(
                debit=Coalesce(Sum('debit'), ZERO),
                kredit=Coalesce(Sum('kredit'), ZERO),
            )
        )
        movement_map = {
            row['akun_id']: (
                _quantize_money(row['debit']),
                _quantize_money(row['kredit']),
            )
            for row in agg_rows
        }

        bs_accounts = list(
            Akun.objects.filter(kategori_laporan='neraca', is_active=True, is_postable=True)
            .order_by('kode_akun')
        )

        asset_types = ('aset_lancar', 'aset_tetap', 'aset_lainnya')
        liability_types = ('kewajiban_lancar', 'kewajiban_jangka_panjang')

        sections: Dict[str, List[Dict[str, Any]]] = {
            'aset_lancar': [],
            'aset_tetap': [],
            'aset_lainnya': [],
            'kewajiban_lancar': [],
            'kewajiban_jangka_panjang': [],
            'ekuitas': [],
        }
        totals: Dict[str, Decimal] = {key: ZERO for key in sections}

        for acc in bs_accounts:
            debit, kredit = movement_map.get(acc.id, (ZERO, ZERO))
            # Assets carry natural debit balance (debit - kredit), so contra-asset accounts
            # like Accumulated Depreciation (122x, saldo_normal='kredit') reduce total assets.
            # Liabilities and Equity carry natural credit balance (kredit - debit).
            if acc.tipe in asset_types:
                balance = debit - kredit
            else:
                balance = kredit - debit

            if balance == ZERO and debit == ZERO and kredit == ZERO:
                continue

            bucket = acc.tipe if acc.tipe in sections else 'ekuitas'
            sections[bucket].append(
                {
                    'akun_id': acc.id,
                    'kode_akun': acc.kode_akun,
                    'nama_akun': acc.nama_akun,
                    'tipe': acc.tipe,
                    'saldo_normal': acc.saldo_normal,
                    'debit': debit,
                    'kredit': kredit,
                    'balance': balance,
                }
            )
            totals[bucket] += balance

        # Calculate cumulative unclosed Net Income (Laba/Rugi Tahun Berjalan) up to tgl_cutoff
        pl_agg = (
            JurnalItem.objects.filter(
                jurnal__status__in=ACTIVE_LEDGER_STATUSES,
                jurnal__tanggal__lte=tgl_cutoff,
                akun__kategori_laporan='laba_rugi',
            )
            .aggregate(
                total_debit=Coalesce(Sum('debit'), ZERO),
                total_kredit=Coalesce(Sum('kredit'), ZERO),
            )
        )
        pl_debit = _quantize_money(pl_agg['total_debit'])
        pl_kredit = _quantize_money(pl_agg['total_kredit'])
        current_year_earnings = pl_kredit - pl_debit

        total_assets = (
            totals['aset_lancar'] + totals['aset_tetap'] + totals['aset_lainnya']
        )
        total_liabilities = (
            totals['kewajiban_lancar'] + totals['kewajiban_jangka_panjang']
        )
        total_equity_accounts = totals['ekuitas']
        total_equity = total_equity_accounts + current_year_earnings
        total_liabilities_and_equity = total_liabilities + total_equity

        return {
            'as_of_date': tgl_cutoff,
            'sections': sections,
            'totals_by_section': totals,
            'total_assets': total_assets,
            'total_liabilities': total_liabilities,
            'total_equity_accounts': total_equity_accounts,
            'current_year_earnings': current_year_earnings,
            'total_equity': total_equity,
            'total_liabilities_and_equity': total_liabilities_and_equity,
            'is_balanced': total_assets == total_liabilities_and_equity,
        }

    @classmethod
    def get_partner_aging(
        cls,
        partner_type: str,
        as_of_date: Union[date, datetime, str],
    ) -> Dict[str, Any]:
        """
        Laporan Umur Piutang (AR Aging) / Umur Utang (AP Aging) per Partner up to `as_of_date`.
        Buckets:
          - `current`: <= 0 days overdue (Belum Jatuh Tempo)
          - `days_1_30`: 1 - 30 Hari
          - `days_31_60`: 31 - 60 Hari
          - `days_61_90`: 61 - 90 Hari
          - `days_over_90`: > 90 Hari
        """
        if partner_type not in (
            JurnalItem.PARTNER_PELANGGAN,
            JurnalItem.PARTNER_PEMASOK,
            JurnalItem.PARTNER_KARYAWAN,
        ):
            raise ValidationError(
                f'`partner_type` tidak valid: {partner_type!r}. '
                f'Gunakan "pelanggan", "pemasok", atau "karyawan".'
            )

        tgl_cutoff = _coerce_date(as_of_date)

        qs = (
            JurnalItem.objects.filter(
                jurnal__status__in=ACTIVE_LEDGER_STATUSES,
                jurnal__tanggal__lte=tgl_cutoff,
                akun__is_reconcilable=True,
                akun__is_kas_setara=False,
                partner_type=partner_type,
                partner_id__isnull=False,
            )
            .select_related('jurnal', 'akun')
            .order_by('partner_id', 'jurnal__tanggal', 'id')
        )

        if partner_type == JurnalItem.PARTNER_PELANGGAN:
            qs = qs.filter(akun__tipe='aset_lancar')
            is_receivable = True
        elif partner_type == JurnalItem.PARTNER_PEMASOK:
            qs = qs.filter(
                akun__tipe__in=('kewajiban_lancar', 'kewajiban_jangka_panjang')
            )
            is_receivable = False
        else:
            is_receivable = True

        # Resolve partner names from database where available
        partner_names: Dict[int, str] = {}
        if partner_type == JurnalItem.PARTNER_PELANGGAN:
            from keuangan.models import Pelanggan

            partner_names = dict(
                Pelanggan.objects.values_list('id', 'nama')
            )
        elif partner_type == JurnalItem.PARTNER_PEMASOK:
            from gudang.models import Vendor
            from keuangan.models import Pemasok

            partner_names = dict(
                Vendor.objects.values_list('id', 'nama')
            )
            partner_names.update(
                dict(Pemasok.objects.values_list('id', 'nama'))
            )

        partners_data: Dict[int, Dict[str, Any]] = {}
        summary = {
            'current': ZERO,
            'days_1_30': ZERO,
            'days_31_60': ZERO,
            'days_61_90': ZERO,
            'days_over_90': ZERO,
            'total': ZERO,
        }

        for item in qs:
            pid = item.partner_id
            debit = _quantize_money(item.debit)
            kredit = _quantize_money(item.kredit)
            net_amount = (debit - kredit) if is_receivable else (kredit - debit)
            if net_amount == ZERO:
                continue

            due_date = item.tanggal_jatuh_tempo or item.jurnal.tanggal
            age_days = (tgl_cutoff - due_date).days

            if age_days <= 0:
                bucket = 'current'
            elif age_days <= 30:
                bucket = 'days_1_30'
            elif age_days <= 60:
                bucket = 'days_31_60'
            elif age_days <= 90:
                bucket = 'days_61_90'
            else:
                bucket = 'days_over_90'

            if pid not in partners_data:
                partners_data[pid] = {
                    'partner_id': pid,
                    'partner_name': partner_names.get(pid, f'{partner_type.title()} #{pid}'),
                    'current': ZERO,
                    'days_1_30': ZERO,
                    'days_31_60': ZERO,
                    'days_61_90': ZERO,
                    'days_over_90': ZERO,
                    'total': ZERO,
                }

            partners_data[pid][bucket] += net_amount
            partners_data[pid]['total'] += net_amount
            summary[bucket] += net_amount
            summary['total'] += net_amount

        rows = [
            data
            for data in partners_data.values()
            if data['total'] != ZERO
        ]

        return {
            'partner_type': partner_type,
            'as_of_date': tgl_cutoff,
            'summary': summary,
            'partners': rows,
        }
