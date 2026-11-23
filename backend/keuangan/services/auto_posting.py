import calendar
import logging
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from keuangan.models import (
    AccountMapping,
    Akun,
    Faktur,
    Jurnal,
    JurnalItem,
    KasBesar,
    PembayaranFaktur,
    PembayaranUtang,
    PettyCash,
    RekeningBank,
    SaldoPettyCash,
    UtangSupplier,
)

from .accounting_engine import TWO_PLACES, ZERO, AccountingPostingService, _quantize_money

logger = logging.getLogger(__name__)


def _is_coa_configured() -> bool:
    """
    Returns True if Master CoA & AccountMapping have been seeded/configured.
    Allows legacy operational unit tests that do not seed CoA to run without crashing
    unless `strict=True` is passed explicitly.
    """
    return Akun.objects.filter(is_active=True, is_postable=True).exists() and (
        AccountMapping.objects.filter(is_active=True).exists()
    )


class AutoPostingService:
    """
    FASE 3 — Auto-Posting Hooks Antar-Modul Operasional SIMAK:
      1. Gudang — Penerimaan Barang (GRN Approval + Auto-sync UtangSupplier)
      2. Gudang — Pengeluaran Barang ke Unit (Bon Serah Terima) & Stock Opname
      3. Keuangan — Faktur/Klaim & Verifikasi Pembayaran Faktur
      4. Keuangan — Realisasi Pembayaran Utang Supplier
      5. Keuangan — Pertanggungjawaban Petty Cash & Kas Besar Selesai
    """

    @staticmethod
    def _try_reverse_existing_journal(
        source_type: str,
        source_id: int,
        user: Any = None,
        alasan: str = '',
    ) -> Optional[Jurnal]:
        existing = Jurnal.objects.filter(
            source_type=source_type,
            source_id=source_id,
            status=Jurnal.STATUS_POSTED,
        ).first()
        if existing is None:
            return None
        return AccountingPostingService.reverse_journal(
            jurnal_id=existing.id,
            tanggal_reversal=timezone.localdate(),
            alasan=alasan or f'Pembatalan dokumen sumber {source_type}#{source_id}',
            user=user,
        )

    # =========================================================================
    # 1. GUDANG — PENERIMAAN BARANG (GRN)
    # =========================================================================
    @classmethod
    @transaction.atomic
    def post_grn_approved(
        cls,
        grn: Any,
        user: Any = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat GRN (`gudang.Penerimaan`) disetujui:
        1. Jika transaksi kredit/tempo dan belum tertaut ke `UtangSupplier`, otomatis buat/sinkronkan
           record `UtangSupplier` dan simpan `grn.utang_supplier_id`.
        2. Posting jurnal pembelian (`jenis_jurnal='pembelian'`, `source_type='gudang.Penerimaan'`):
           - Debit: Akun Persediaan (`GRN_INVENTORY`, per `golongan_barang` jika dimapping)
           - Kredit: Akun Utang Usaha (`GRN_AP`, partner pemasok) atau Kas/Bank (`GRN_CASH`) jika tunai.
        """
        grn.recalculate_total()
        total_net = _quantize_money(grn.total_nilai)
        is_cash = str(getattr(grn, 'metode_pembayaran', 'Kredit') or 'Kredit').strip().lower() in (
            'tunai',
            'cash',
        )

        # 1. Auto-sync UtangSupplier for credit GRN
        if not is_cash and total_net > ZERO and not grn.utang_supplier_id:
            app_faktur_id = f'GRN-{grn.id}'
            utang, _ = UtangSupplier.objects.update_or_create(
                app_siaga_faktur_id=app_faktur_id,
                sumber=UtangSupplier.SUMBER_LOGISTIK,
                defaults={
                    'nomor_spb': grn.po.nomor if getattr(grn, 'po', None) else grn.nomor,
                    'tanggal_spb': grn.po.tanggal if getattr(grn, 'po', None) else grn.tanggal,
                    'nomor_faktur': grn.no_faktur or grn.nomor,
                    'vendor_id': int(grn.vendor_id or 0),
                    'vendor_nama': (grn.vendor_nama or 'Supplier Logistik')[:150],
                    'kategori': 'LOGISTIK & GUDANG',
                    'tanggal_faktur': grn.tanggal,
                    'tanggal_jatuh_tempo': grn.tgl_jatuh_tempo or grn.tanggal,
                    'tanggal_titip': grn.tanggal,
                    'nominal': total_net,
                    'keterangan_titip': (
                        grn.catatan or f'Auto-sync Penerimaan Barang {grn.nomor}'
                    ),
                    'status': UtangSupplier.STATUS_BELUM_DIBAYAR,
                    'verified_by': user if getattr(user, 'is_authenticated', False) else None,
                    'verified_at': timezone.now(),
                },
            )
            grn.utang_supplier_id = utang.id
            grn.save(update_fields=['utang_supplier_id', 'updated_at'])

        if total_net <= ZERO:
            return None

        if not strict and not _is_coa_configured():
            return None

        items = list(grn.items.select_related('barang', 'barang__golongan').all())
        if not items:
            return None

        # Hitung nilai net per item (prorata diskon jika diskon_total > 0)
        has_discount = grn.diskon_total > ZERO and grn.subtotal_bruto > ZERO
        positive_items = [it for it in items if _quantize_money(it.subtotal) > ZERO]
        remaining_net = total_net

        debit_by_account: Dict[int, Dict[str, Any]] = {}
        for idx, it in enumerate(positive_items):
            if has_discount:
                if idx == len(positive_items) - 1:
                    item_net = max(ZERO, remaining_net)
                else:
                    item_net = (
                        Decimal(str(it.subtotal)) * total_net / Decimal(str(grn.subtotal_bruto))
                    ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
                    remaining_net -= item_net
            else:
                item_net = _quantize_money(it.subtotal)

            if item_net <= ZERO:
                continue

            golongan = getattr(it.barang, 'golongan', None)
            akun_inv = AccountingPostingService.resolve_account_mapping(
                'GRN_INVENTORY',
                golongan_barang=golongan,
            )
            if akun_inv.id not in debit_by_account:
                debit_by_account[akun_inv.id] = {
                    'akun': akun_inv,
                    'debit': ZERO,
                    'kredit': ZERO,
                    'keterangan': f'Penerimaan Persediaan {grn.nomor} ({grn.vendor_nama})',
                }
            debit_by_account[akun_inv.id]['debit'] += item_net

        lines: List[Dict[str, Any]] = list(debit_by_account.values())
        if not lines:
            return None

        # Pastikan total debit persis sama dengan total_net
        sum_debit = sum((line['debit'] for line in lines), ZERO)
        if sum_debit != total_net:
            lines[-1]['debit'] += total_net - sum_debit

        partner_id = int(grn.vendor_id or grn.utang_supplier_id or grn.id)

        if is_cash:
            akun_kredit = AccountingPostingService.resolve_account_mapping('GRN_CASH')
            lines.append(
                {
                    'akun': akun_kredit,
                    'debit': ZERO,
                    'kredit': total_net,
                    'keterangan': f'Pembelian Tunai GRN {grn.nomor} - {grn.vendor_nama}',
                }
            )
        else:
            akun_ap = AccountingPostingService.resolve_account_mapping('GRN_AP')
            lines.append(
                {
                    'akun': akun_ap,
                    'debit': ZERO,
                    'kredit': total_net,
                    'partner_type': JurnalItem.PARTNER_PEMASOK,
                    'partner_id': partner_id,
                    'tanggal_jatuh_tempo': grn.tgl_jatuh_tempo or grn.tanggal,
                    'reconcile_ref': grn.no_faktur or grn.nomor,
                    'keterangan': (
                        f'Utang Penerimaan {grn.nomor} - {grn.vendor_nama} '
                        f'(Faktur: {grn.no_faktur or "-"})'
                    ),
                }
            )

        return AccountingPostingService.create_and_post_journal(
            tanggal=grn.tanggal,
            jenis_jurnal=Jurnal.JENIS_PEMBELIAN,
            keterangan=(
                f'Penerimaan Barang {grn.nomor} dari {grn.vendor_nama} '
                f'(Faktur: {grn.no_faktur or "-"})'
            ),
            lines=lines,
            source_type='gudang.Penerimaan',
            source_id=grn.id,
            source_number=grn.nomor,
            user=user,
        )

    # =========================================================================
    # 2A. GUDANG — PENGELUARAN BARANG KE UNIT
    # =========================================================================
    @classmethod
    @transaction.atomic
    def post_goods_out_approved(
        cls,
        pengeluaran: Any,
        user: Any = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat `gudang.Pengeluaran` disetujui/diserahkan ke unit:
        - Debit: Akun Beban Pemakaian (`GOODS_OUT_EXPENSE`, per `golongan_barang`) dengan `unit` Cost Center
        - Kredit: Akun Persediaan (`GRN_INVENTORY`, per `golongan_barang`) sebesar nilai HPP (`avg_cost`)
        """
        total_nilai = _quantize_money(pengeluaran.total_nilai)
        if total_nilai <= ZERO:
            return None

        if not strict and not _is_coa_configured():
            return None

        unit = None
        if getattr(pengeluaran, 'permintaan', None) and getattr(pengeluaran.permintaan, 'ruang', None):
            unit = getattr(pengeluaran.permintaan.ruang, 'unit', None)
        if unit is None and getattr(pengeluaran, 'ruang', None):
            unit = getattr(pengeluaran.ruang, 'unit', None)

        items = list(pengeluaran.items.select_related('barang', 'barang__golongan').all())
        debit_by_key: Dict[Any, Dict[str, Any]] = {}
        kredit_by_key: Dict[Any, Dict[str, Any]] = {}

        for it in items:
            sub = _quantize_money(it.subtotal)
            if sub <= ZERO:
                continue
            golongan = getattr(it.barang, 'golongan', None)
            akun_exp = AccountingPostingService.resolve_account_mapping(
                'GOODS_OUT_EXPENSE',
                golongan_barang=golongan,
            )
            akun_inv = AccountingPostingService.resolve_account_mapping(
                'GRN_INVENTORY',
                golongan_barang=golongan,
            )

            d_key = (akun_exp.id, unit.id if unit else None)
            if d_key not in debit_by_key:
                debit_by_key[d_key] = {
                    'akun': akun_exp,
                    'debit': ZERO,
                    'kredit': ZERO,
                    'unit': unit,
                    'keterangan': f'Pemakaian Barang Unit {pengeluaran.ruang_nama} ({pengeluaran.nomor})',
                }
            debit_by_key[d_key]['debit'] += sub

            k_key = (akun_inv.id, unit.id if unit else None)
            if k_key not in kredit_by_key:
                kredit_by_key[k_key] = {
                    'akun': akun_inv,
                    'debit': ZERO,
                    'kredit': ZERO,
                    'unit': unit,
                    'keterangan': f'Pengeluaran Persediaan {pengeluaran.nomor} ke {pengeluaran.ruang_nama}',
                }
            kredit_by_key[k_key]['kredit'] += sub

        lines = list(debit_by_key.values()) + list(kredit_by_key.values())
        if len(lines) < 2:
            return None

        return AccountingPostingService.create_and_post_journal(
            tanggal=pengeluaran.tanggal,
            jenis_jurnal=Jurnal.JENIS_PERSEDIAAN,
            keterangan=f'Pengeluaran Barang Gudang {pengeluaran.nomor} ke {pengeluaran.ruang_nama}',
            lines=lines,
            source_type='gudang.Pengeluaran',
            source_id=pengeluaran.id,
            source_number=pengeluaran.nomor,
            user=user,
        )

    # =========================================================================
    # 2B. GUDANG — STOCK OPNAME
    # =========================================================================
    @classmethod
    @transaction.atomic
    def post_stock_opname_approved(
        cls,
        opname: Any,
        user: Any = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat `gudang.StockOpname` disetujui dan memiliki selisih nilai (`subtotal_selisih != 0`):
        - Selisih Kurang (< 0 / Rugi): Debit `STOCK_OPNAME_LOSS` (fallback `STOCK_OPNAME_DIFF`), Kredit `GRN_INVENTORY`
        - Selisih Lebih (> 0 / Untung): Debit `GRN_INVENTORY`, Kredit `STOCK_OPNAME_GAIN` (fallback `STOCK_OPNAME_DIFF`)
        """
        if not strict and not _is_coa_configured():
            return None

        items = list(opname.items.select_related('barang', 'barang__golongan').all())
        lines: List[Dict[str, Any]] = []

        for it in items:
            selisih_val = _quantize_money(it.subtotal_selisih)
            if selisih_val == ZERO and it.selisih != ZERO and it.harga_unit > ZERO:
                selisih_val = _quantize_money(Decimal(str(it.selisih)) * Decimal(str(it.harga_unit)))
            if selisih_val == ZERO:
                continue

            golongan = getattr(it.barang, 'golongan', None)
            akun_inv = AccountingPostingService.resolve_account_mapping(
                'GRN_INVENTORY',
                golongan_barang=golongan,
            )

            if selisih_val < ZERO:
                loss_amt = abs(selisih_val)
                try:
                    akun_loss = AccountingPostingService.resolve_account_mapping(
                        'STOCK_OPNAME_LOSS',
                        golongan_barang=golongan,
                    )
                except ValidationError:
                    akun_loss = AccountingPostingService.resolve_account_mapping(
                        'STOCK_OPNAME_DIFF',
                        golongan_barang=golongan,
                    )
                lines.append(
                    {
                        'akun': akun_loss,
                        'debit': loss_amt,
                        'kredit': ZERO,
                        'keterangan': f'Selisih Kurang Opname {opname.nomor}: {it.barang.nama}',
                    }
                )
                lines.append(
                    {
                        'akun': akun_inv,
                        'debit': ZERO,
                        'kredit': loss_amt,
                        'keterangan': f'Penyesuaian Persediaan Opname {opname.nomor}: {it.barang.nama}',
                    }
                )
            else:
                gain_amt = selisih_val
                try:
                    akun_gain = AccountingPostingService.resolve_account_mapping(
                        'STOCK_OPNAME_GAIN',
                        golongan_barang=golongan,
                    )
                except ValidationError:
                    akun_gain = AccountingPostingService.resolve_account_mapping(
                        'STOCK_OPNAME_DIFF',
                        golongan_barang=golongan,
                    )
                lines.append(
                    {
                        'akun': akun_inv,
                        'debit': gain_amt,
                        'kredit': ZERO,
                        'keterangan': f'Penyesuaian Lebih Persediaan Opname {opname.nomor}: {it.barang.nama}',
                    }
                )
                lines.append(
                    {
                        'akun': akun_gain,
                        'debit': ZERO,
                        'kredit': gain_amt,
                        'keterangan': f'Selisih Lebih Opname {opname.nomor}: {it.barang.nama}',
                    }
                )

        if len(lines) < 2:
            return None

        return AccountingPostingService.create_and_post_journal(
            tanggal=opname.tanggal,
            jenis_jurnal=Jurnal.JENIS_PERSEDIAAN,
            keterangan=f'Penyesuaian Stock Opname {opname.nomor} ({opname.get_jenis_display()})',
            lines=lines,
            source_type='gudang.StockOpname',
            source_id=opname.id,
            source_number=opname.nomor,
            user=user,
        )

    # =========================================================================
    # 3A. KEUANGAN — FAKTUR / KLAIM PENJAMIN
    # =========================================================================
    @staticmethod
    def _resolve_faktur_ar_account(faktur: Faktur) -> Akun:
        pelanggan = getattr(faktur, 'pelanggan', None)
        nama_gabungan = (
            f"{getattr(pelanggan, 'nama', '')} {faktur.nama_pembiayaan or ''}"
        ).lower()
        tipe_pelanggan = (getattr(pelanggan, 'tipe', '') or '').lower()

        if 'bpjs' in nama_gabungan or tipe_pelanggan == 'bpjs':
            try:
                return AccountingPostingService.resolve_account_mapping('CLAIM_AR_BPJS')
            except ValidationError:
                pass
        elif tipe_pelanggan in ('asuransi', 'perusahaan') or faktur.id_pembiayaan:
            try:
                return AccountingPostingService.resolve_account_mapping('CLAIM_AR_ASURANSI')
            except ValidationError:
                pass

        return AccountingPostingService.resolve_account_mapping('CLAIM_AR')

    @staticmethod
    def _resolve_faktur_partner_id(faktur: Faktur) -> int:
        if faktur.pelanggan_id:
            return int(faktur.pelanggan_id)
        if faktur.id_pembiayaan and str(faktur.id_pembiayaan).strip().isdigit():
            return int(str(faktur.id_pembiayaan).strip())
        return int(faktur.id)

    @classmethod
    @transaction.atomic
    def post_faktur_finalized(
        cls,
        faktur: Faktur,
        user: Any = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat `Faktur` difinalisasi / dikirim (status != 'batal' dan total_tagihan > 0):
        - Debit: Akun Piutang (`CLAIM_AR_BPJS` / `CLAIM_AR_ASURANSI` / `CLAIM_AR`) sebesar `total_tagihan`
        - Debit (jika COB `is_cob=True` & `tanggungan_bpjs > 0`): `CLAIM_COB_DIFF` sebesar `tanggungan_bpjs`
        - Kredit: Akun Pendapatan per 13 komponen tarif (`CLAIM_REVENUE_COMPONENT`) yang nilainya > 0.
        """
        if faktur.status == 'batal':
            return None

        total_tagihan = _quantize_money(faktur.total_tagihan)
        if total_tagihan <= ZERO:
            return None

        if not strict and not _is_coa_configured():
            return None

        akun_ar = cls._resolve_faktur_ar_account(faktur)
        partner_id = cls._resolve_faktur_partner_id(faktur)
        tgl_jurnal = faktur.tgl_kirim or faktur.tanggal or timezone.localdate()
        tgl_tempo = faktur.jatuh_tempo or tgl_jurnal

        # Hitung 13 komponen pendapatan
        base_12 = {
            'adm': _quantize_money(faktur.adm),
            'jasa': _quantize_money(faktur.jasa),
            'farmasi': _quantize_money(faktur.farmasi),
            'tindakan': _quantize_money(faktur.tindakan),
            'fisio': _quantize_money(faktur.fisio),
            'lab': _quantize_money(faktur.lab),
            'rad': _quantize_money(faktur.rad),
            'kamar': _quantize_money(faktur.kamar),
            'bhp': _quantize_money(faktur.bhp),
            'ambulan': _quantize_money(faktur.ambulan),
            'alat': _quantize_money(faktur.alat),
            'lainnya': _quantize_money(faktur.lainnya),
        }
        ppn_farmasi = _quantize_money(faktur.ppn_farmasi)
        sum_12 = sum(base_12.values(), ZERO)
        tanggungan_bpjs = (
            _quantize_money(faktur.tanggungan_bpjs)
            if getattr(faktur, 'is_cob', False)
            else ZERO
        )

        components: Dict[str, Decimal] = dict(base_12)
        if ppn_farmasi > ZERO:
            # Cek apakah ppn_farmasi sudah termasuk di dalam field `farmasi` atau terpisah
            if (sum_12 - tanggungan_bpjs) == total_tagihan and components['farmasi'] >= ppn_farmasi:
                components['farmasi'] -= ppn_farmasi
                components['ppn_farmasi'] = ppn_farmasi
            else:
                components['ppn_farmasi'] = ppn_farmasi

        lines: List[Dict[str, Any]] = [
            {
                'akun': akun_ar,
                'debit': total_tagihan,
                'kredit': ZERO,
                'partner_type': JurnalItem.PARTNER_PELANGGAN,
                'partner_id': partner_id,
                'tanggal_jatuh_tempo': tgl_tempo,
                'reconcile_ref': faktur.nomor_faktur,
                'keterangan': f'Piutang Klaim Invoice {faktur.nomor_faktur}',
            }
        ]

        sum_components = sum((val for val in components.values() if val > ZERO), ZERO)
        target_credit_total = total_tagihan

        if tanggungan_bpjs > ZERO and sum_components == (total_tagihan + tanggungan_bpjs):
            akun_cob = AccountingPostingService.resolve_account_mapping('CLAIM_COB_DIFF')
            lines.append(
                {
                    'akun': akun_cob,
                    'debit': tanggungan_bpjs,
                    'kredit': ZERO,
                    'keterangan': f'Potongan Tanggungan BPJS (COB) Invoice {faktur.nomor_faktur}',
                }
            )
            target_credit_total = total_tagihan + tanggungan_bpjs

        credit_lines: List[Dict[str, Any]] = []
        for comp_code, comp_val in components.items():
            if comp_val <= ZERO:
                continue
            akun_rev = AccountingPostingService.resolve_account_mapping(
                'CLAIM_REVENUE_COMPONENT',
                komponen_pendapatan=comp_code,
            )
            credit_lines.append(
                {
                    'akun': akun_rev,
                    'debit': ZERO,
                    'kredit': comp_val,
                    'keterangan': f'Pendapatan {comp_code.upper()} Invoice {faktur.nomor_faktur}',
                }
            )

        if not credit_lines:
            akun_rev_default = AccountingPostingService.resolve_account_mapping(
                'CLAIM_REVENUE_DEFAULT'
            )
            credit_lines.append(
                {
                    'akun': akun_rev_default,
                    'debit': ZERO,
                    'kredit': target_credit_total,
                    'keterangan': f'Pendapatan Pelayanan Invoice {faktur.nomor_faktur}',
                }
            )
        else:
            current_credit = sum((c['kredit'] for c in credit_lines), ZERO)
            diff = target_credit_total - current_credit
            if diff > ZERO:
                akun_rev_default = AccountingPostingService.resolve_account_mapping(
                    'CLAIM_REVENUE_DEFAULT'
                )
                credit_lines.append(
                    {
                        'akun': akun_rev_default,
                        'debit': ZERO,
                        'kredit': diff,
                        'keterangan': f'Penyesuaian Pendapatan Invoice {faktur.nomor_faktur}',
                    }
                )
            elif diff < ZERO:
                akun_cob = AccountingPostingService.resolve_account_mapping('CLAIM_COB_DIFF')
                lines.append(
                    {
                        'akun': akun_cob,
                        'debit': abs(diff),
                        'kredit': ZERO,
                        'keterangan': f'Selisih / Potongan Klaim Invoice {faktur.nomor_faktur}',
                    }
                )

        lines.extend(credit_lines)

        penjamin_label = (
            faktur.pelanggan.nama
            if faktur.pelanggan
            else (faktur.nama_pembiayaan or 'Penjamin')
        )
        return AccountingPostingService.create_and_post_journal(
            tanggal=tgl_jurnal,
            jenis_jurnal=Jurnal.JENIS_PENJUALAN,
            keterangan=f'Tagihan Klaim / Faktur {faktur.nomor_faktur} - {penjamin_label}',
            lines=lines,
            source_type='keuangan.Faktur',
            source_id=faktur.id,
            source_number=faktur.nomor_faktur,
            user=user,
        )

    # =========================================================================
    # 3B. KEUANGAN — VERIFIKASI PEMBAYARAN FAKTUR
    # =========================================================================
    @staticmethod
    def _resolve_bank_or_cash_account(
        explicit_akun: Optional[Akun] = None,
        bank_code: Optional[str] = None,
        rekening_bank_id: Optional[int] = None,
        fallback_event: str = 'KAS_BESAR_DEFAULT',
    ) -> Akun:
        if explicit_akun and explicit_akun.is_active and explicit_akun.is_postable:
            return explicit_akun

        if rekening_bank_id:
            rek = (
                RekeningBank.objects.select_related('akun_akuntansi')
                .filter(pk=rekening_bank_id, akun_akuntansi__isnull=False)
                .first()
            )
            if rek and rek.akun_akuntansi.is_active and rek.akun_akuntansi.is_postable:
                return rek.akun_akuntansi

        if bank_code:
            rek = (
                RekeningBank.objects.select_related('akun_akuntansi')
                .filter(bank=str(bank_code).lower().strip(), is_active=True, akun_akuntansi__isnull=False)
                .first()
            )
            if rek and rek.akun_akuntansi.is_active and rek.akun_akuntansi.is_postable:
                return rek.akun_akuntansi

        rek_any = (
            RekeningBank.objects.select_related('akun_akuntansi')
            .filter(is_active=True, akun_akuntansi__isnull=False)
            .first()
        )
        if rek_any and rek_any.akun_akuntansi.is_active and rek_any.akun_akuntansi.is_postable:
            return rek_any.akun_akuntansi

        bank_coa = Akun.objects.filter(
            kode_akun__in=['1113', '1114', '1112'],
            is_active=True,
            is_postable=True,
        ).first()
        if bank_coa:
            return bank_coa

        return AccountingPostingService.resolve_account_mapping(fallback_event)

    @classmethod
    @transaction.atomic
    def post_pembayaran_faktur_verified(
        cls,
        pembayaran: PembayaranFaktur,
        user: Any = None,
        selisih_cob: Decimal = ZERO,
        rekening_bank_id: Optional[int] = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat `PembayaranFaktur` diverifikasi (`status_verifikasi='terverifikasi'`):
        - Debit: Akun Bank / Kas sebesar `pembayaran.jumlah`
        - Debit (opsional jika ada potongan/selisih COB pada pelunasan): `CLAIM_COB_DIFF` sebesar `selisih_cob`
        - Kredit: Akun Piutang (`CLAIM_AR_BPJS` / `CLAIM_AR_ASURANSI` / `CLAIM_AR`) sebesar `jumlah + selisih_cob`
        """
        jumlah_bayar = _quantize_money(pembayaran.jumlah)
        potongan_cob = _quantize_money(selisih_cob)
        if jumlah_bayar <= ZERO:
            return None

        if not strict and not _is_coa_configured():
            return None

        faktur = pembayaran.faktur
        bank_code = None
        if pembayaran.alokasi_dana_id and pembayaran.alokasi_dana:
            bank_code = pembayaran.alokasi_dana.bank
        else:
            first_use = (
                pembayaran.pemakaian_alokasi.select_related('alokasi_dana').first()
                if hasattr(pembayaran, 'pemakaian_alokasi')
                else None
            )
            if first_use and first_use.alokasi_dana:
                bank_code = first_use.alokasi_dana.bank

        akun_bank = cls._resolve_bank_or_cash_account(
            explicit_akun=pembayaran.akun,
            bank_code=bank_code,
            rekening_bank_id=rekening_bank_id,
            fallback_event='KAS_BESAR_DEFAULT',
        )
        akun_ar = cls._resolve_faktur_ar_account(faktur)
        partner_id = cls._resolve_faktur_partner_id(faktur)

        lines: List[Dict[str, Any]] = [
            {
                'akun': akun_bank,
                'debit': jumlah_bayar,
                'kredit': ZERO,
                'keterangan': f'Penerimaan Pembayaran Faktur {faktur.nomor_faktur}',
            }
        ]

        if potongan_cob > ZERO:
            akun_cob = AccountingPostingService.resolve_account_mapping('CLAIM_COB_DIFF')
            lines.append(
                {
                    'akun': akun_cob,
                    'debit': potongan_cob,
                    'kredit': ZERO,
                    'keterangan': f'Selisih / Potongan Klaim COB Faktur {faktur.nomor_faktur}',
                }
            )

        total_piutang_lunas = jumlah_bayar + max(ZERO, potongan_cob)
        lines.append(
            {
                'akun': akun_ar,
                'debit': ZERO,
                'kredit': total_piutang_lunas,
                'partner_type': JurnalItem.PARTNER_PELANGGAN,
                'partner_id': partner_id,
                'reconcile_ref': faktur.nomor_faktur,
                'keterangan': f'Pelunasan Piutang Faktur {faktur.nomor_faktur}',
            }
        )

        return AccountingPostingService.create_and_post_journal(
            tanggal=pembayaran.tanggal or timezone.localdate(),
            jenis_jurnal=Jurnal.JENIS_KAS_BANK,
            keterangan=(
                f'Penerimaan Pembayaran Invoice {faktur.nomor_faktur} '
                f'({pembayaran.keterangan or pembayaran.get_metode_display()})'
            ),
            lines=lines,
            source_type='keuangan.PembayaranFaktur',
            source_id=pembayaran.id,
            source_number=faktur.nomor_faktur,
            user=user,
        )

    # =========================================================================
    # 4. KEUANGAN — REALISASI PEMBAYARAN UTANG SUPPLIER
    # =========================================================================
    @classmethod
    @transaction.atomic
    def post_pembayaran_utang_realized(
        cls,
        pembayaran: PembayaranUtang,
        user: Any = None,
        rekening_bank_id: Optional[int] = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat `PembayaranUtang` direalisasikan (`realisasi_sebagian` / `realisasi_lunas`):
        - Debit: Akun Utang Usaha (`GRN_AP`, `partner_type='pemasok'`, `partner_id=vendor_id`) sebesar `jumlah_bayar`
        - Kredit 1: Akun Bank (`rekening_bank.akun_akuntansi`) sebesar `jumlah_kas_keluar`
        - Kredit 2: Akun Deposit Retur Vendor (`AP_DEPOSIT_USED`, `partner_type='pemasok'`) jika `potongan_deposit > 0`
        """
        jumlah_bayar = _quantize_money(pembayaran.jumlah_bayar)
        if jumlah_bayar <= ZERO:
            return None

        if not strict and not _is_coa_configured():
            return None

        utang = pembayaran.utang
        potongan_deposit = _quantize_money(pembayaran.potongan_deposit)
        if potongan_deposit < ZERO:
            potongan_deposit = ZERO
        if potongan_deposit > jumlah_bayar:
            potongan_deposit = jumlah_bayar

        jumlah_kas_keluar = _quantize_money(jumlah_bayar - potongan_deposit)
        if pembayaran.jumlah_kas_keluar != jumlah_kas_keluar:
            pembayaran.jumlah_kas_keluar = jumlah_kas_keluar
            PembayaranUtang.objects.filter(pk=pembayaran.pk).update(
                jumlah_kas_keluar=jumlah_kas_keluar
            )

        partner_id = int(utang.vendor_id or utang.id)

        # Tentukan akun debit berdasarkan kategori utang
        if utang.kategori == 'PENGISIAN PETTY CASH':
            saldo_pc = SaldoPettyCash.objects.select_related('akun_akuntansi').filter(pk=1).first()
            akun_debit = (
                saldo_pc.akun_akuntansi
                if (saldo_pc and saldo_pc.akun_akuntansi)
                else AccountingPostingService.resolve_account_mapping('PETTY_CASH_DEFAULT')
            )
            debit_line = {
                'akun': akun_debit,
                'debit': jumlah_bayar,
                'kredit': ZERO,
                'keterangan': f'Pengisian Kembali Saldo Petty Cash ({utang.nomor_spb or utang.nomor_faktur})',
            }
        elif utang.kategori == 'REIMBURSEMENT':
            akun_debit = AccountingPostingService.resolve_account_mapping('REIMBURSEMENT_PAYABLE')
            debit_line = {
                'akun': akun_debit,
                'debit': jumlah_bayar,
                'kredit': ZERO,
                'partner_type': JurnalItem.PARTNER_KARYAWAN,
                'partner_id': partner_id,
                'reconcile_ref': utang.nomor_faktur or utang.nomor_spb,
                'keterangan': f'Pelunasan Utang Reimbursement ({utang.nomor_faktur or utang.nomor_spb})',
            }
        else:
            akun_debit = AccountingPostingService.resolve_account_mapping('GRN_AP')
            debit_line = {
                'akun': akun_debit,
                'debit': jumlah_bayar,
                'kredit': ZERO,
                'partner_type': JurnalItem.PARTNER_PEMASOK,
                'partner_id': partner_id,
                'reconcile_ref': utang.nomor_faktur or utang.nomor_spb,
                'keterangan': f'Pembayaran Utang {utang.vendor_nama} (Faktur: {utang.nomor_faktur})',
            }

        lines: List[Dict[str, Any]] = [debit_line]

        if jumlah_kas_keluar > ZERO:
            akun_bank = cls._resolve_bank_or_cash_account(
                rekening_bank_id=rekening_bank_id,
                fallback_event='GRN_CASH',
            )
            lines.append(
                {
                    'akun': akun_bank,
                    'debit': ZERO,
                    'kredit': jumlah_kas_keluar,
                    'keterangan': f'Pengeluaran Bank Pembayaran Utang {utang.nomor_faktur}',
                }
            )

        if potongan_deposit > ZERO:
            akun_deposit = AccountingPostingService.resolve_account_mapping('AP_DEPOSIT_USED')
            lines.append(
                {
                    'akun': akun_deposit,
                    'debit': ZERO,
                    'kredit': potongan_deposit,
                    'partner_type': JurnalItem.PARTNER_PEMASOK,
                    'partner_id': partner_id,
                    'reconcile_ref': utang.nomor_faktur or utang.nomor_spb,
                    'keterangan': f'Pemakaian Deposit Retur Vendor {utang.vendor_nama}',
                }
            )

        tgl_jurnal = pembayaran.tanggal_proses or timezone.localdate()
        return AccountingPostingService.create_and_post_journal(
            tanggal=tgl_jurnal,
            jenis_jurnal=Jurnal.JENIS_KAS_BANK,
            keterangan=(
                f'Realisasi Pembayaran Utang {utang.vendor_nama} — '
                f'Faktur {utang.nomor_faktur or utang.nomor_spb}'
            ),
            lines=lines,
            source_type='keuangan.PembayaranUtang',
            source_id=pembayaran.id,
            source_number=utang.nomor_faktur or utang.nomor_spb,
            user=user,
        )

    # =========================================================================
    # 5. KEUANGAN — PETTY CASH & KAS BESAR SELESAI
    # =========================================================================
    @staticmethod
    def _resolve_expense_item_account(item: Any) -> Akun:
        if getattr(item, 'akun_id', None) and item.akun and item.akun.is_active and item.akun.is_postable:
            return item.akun

        raw_code = str(getattr(item, 'kode_akun', '') or '').strip()
        clean_code = raw_code.replace('.', '').strip()
        if raw_code or clean_code:
            matched = Akun.objects.filter(
                kode_akun__in=[c for c in (raw_code, clean_code) if c],
                is_active=True,
                is_postable=True,
            ).first()
            if matched:
                return matched

        fallback = Akun.objects.filter(
            kode_akun__in=['6209', '6201', '5102'],
            is_active=True,
            is_postable=True,
        ).first()
        if fallback:
            return fallback

        return AccountingPostingService.resolve_account_mapping('GOODS_OUT_EXPENSE')

    @classmethod
    @transaction.atomic
    def post_petty_cash_completed(
        cls,
        petty_cash: PettyCash,
        user: Any = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat pertanggungjawaban `PettyCash` berstatus `selesai`:
        - Debit: Akun Beban per masing-masing item rincian (`ItemLaporanPenggunaan`) + `unit` pemohon
        - Kredit: `SaldoPettyCash.akun_akuntansi` (atau fallback `PETTY_CASH_DEFAULT`)
        """
        if not strict and not _is_coa_configured():
            return None

        laporan = getattr(petty_cash, 'laporan', None)
        target_total = _quantize_money(
            laporan.nominal_digunakan if laporan is not None else petty_cash.nominal
        )
        if target_total <= ZERO:
            return None

        unit = getattr(petty_cash.created_by, 'unit', None) if petty_cash.created_by_id else None
        tgl_jurnal = (
            (laporan.tanggal_laporan or laporan.tanggal_nota)
            if laporan is not None
            else petty_cash.tanggal
        ) or timezone.localdate()

        debit_lines: List[Dict[str, Any]] = []
        if laporan is not None:
            items = list(laporan.items.select_related('akun').all())
            positive_items = [it for it in items if _quantize_money(it.nilai) > ZERO]
            sum_items = sum((_quantize_money(it.nilai) for it in positive_items), ZERO)
            remaining = target_total

            for idx, it in enumerate(positive_items):
                akun_exp = cls._resolve_expense_item_account(it)
                if sum_items != target_total and sum_items > ZERO:
                    if idx == len(positive_items) - 1:
                        amt = max(ZERO, remaining)
                    else:
                        amt = (_quantize_money(it.nilai) * target_total / sum_items).quantize(
                            TWO_PLACES, rounding=ROUND_HALF_UP
                        )
                        remaining -= amt
                else:
                    amt = _quantize_money(it.nilai)

                if amt <= ZERO:
                    continue

                debit_lines.append(
                    {
                        'akun': akun_exp,
                        'debit': amt,
                        'kredit': ZERO,
                        'unit': unit,
                        'keterangan': (
                            f'{it.deskripsi or petty_cash.keperluan} ({petty_cash.no_pengajuan})'
                        )[:255],
                    }
                )

        if not debit_lines:
            akun_default_exp = (
                Akun.objects.filter(kode_akun='6209', is_active=True, is_postable=True).first()
                or AccountingPostingService.resolve_account_mapping('GOODS_OUT_EXPENSE')
            )
            debit_lines.append(
                {
                    'akun': akun_default_exp,
                    'debit': target_total,
                    'kredit': ZERO,
                    'unit': unit,
                    'keterangan': f'Realisasi Petty Cash {petty_cash.no_pengajuan}: {petty_cash.keperluan}'[:255],
                }
            )

        saldo_pc = SaldoPettyCash.objects.select_related('akun_akuntansi').filter(pk=1).first()
        if saldo_pc and saldo_pc.akun_akuntansi and saldo_pc.akun_akuntansi.is_active and saldo_pc.akun_akuntansi.is_postable:
            akun_pc = saldo_pc.akun_akuntansi
        else:
            akun_pc = AccountingPostingService.resolve_account_mapping('PETTY_CASH_DEFAULT')

        lines = debit_lines + [
            {
                'akun': akun_pc,
                'debit': ZERO,
                'kredit': target_total,
                'unit': unit,
                'keterangan': f'Pengeluaran Kas Kecil {petty_cash.no_pengajuan}',
            }
        ]

        return AccountingPostingService.create_and_post_journal(
            tanggal=tgl_jurnal,
            jenis_jurnal=Jurnal.JENIS_KAS_BANK,
            keterangan=f'Pertanggungjawaban Petty Cash {petty_cash.no_pengajuan} — {petty_cash.keperluan}',
            lines=lines,
            source_type='keuangan.PettyCash',
            source_id=petty_cash.id,
            source_number=petty_cash.no_pengajuan,
            user=user,
        )

    @classmethod
    @transaction.atomic
    def post_kas_besar_completed(
        cls,
        kas_besar: KasBesar,
        user: Any = None,
        rekening_bank_id: Optional[int] = None,
        strict: bool = False,
    ) -> Optional[Jurnal]:
        """
        Saat pertanggungjawaban `KasBesar` berstatus `selesai`:
        - Debit: Akun Beban per masing-masing item rincian (`ItemLaporanKasBesar`) + `unit` pemohon
        - Kredit: `RekeningBank.akun_akuntansi` atau `KAS_BESAR_DEFAULT`
        """
        if not strict and not _is_coa_configured():
            return None

        laporan = getattr(kas_besar, 'laporan', None)
        target_total = _quantize_money(
            laporan.nominal_digunakan if laporan is not None else kas_besar.nominal
        )
        if target_total <= ZERO:
            return None

        unit = getattr(kas_besar.created_by, 'unit', None) if kas_besar.created_by_id else None
        tgl_jurnal = (
            (laporan.tanggal_laporan or laporan.tanggal_nota)
            if laporan is not None
            else kas_besar.tanggal
        ) or timezone.localdate()

        debit_lines: List[Dict[str, Any]] = []
        if laporan is not None:
            items = list(laporan.items.select_related('akun').all())
            positive_items = [it for it in items if _quantize_money(it.nilai) > ZERO]
            sum_items = sum((_quantize_money(it.nilai) for it in positive_items), ZERO)
            remaining = target_total

            for idx, it in enumerate(positive_items):
                akun_exp = cls._resolve_expense_item_account(it)
                if sum_items != target_total and sum_items > ZERO:
                    if idx == len(positive_items) - 1:
                        amt = max(ZERO, remaining)
                    else:
                        amt = (_quantize_money(it.nilai) * target_total / sum_items).quantize(
                            TWO_PLACES, rounding=ROUND_HALF_UP
                        )
                        remaining -= amt
                else:
                    amt = _quantize_money(it.nilai)

                if amt <= ZERO:
                    continue

                debit_lines.append(
                    {
                        'akun': akun_exp,
                        'debit': amt,
                        'kredit': ZERO,
                        'unit': unit,
                        'keterangan': (
                            f'{it.deskripsi or kas_besar.keperluan} ({kas_besar.no_pengajuan})'
                        )[:255],
                    }
                )

        if not debit_lines:
            akun_default_exp = (
                Akun.objects.filter(kode_akun='6209', is_active=True, is_postable=True).first()
                or AccountingPostingService.resolve_account_mapping('GOODS_OUT_EXPENSE')
            )
            debit_lines.append(
                {
                    'akun': akun_default_exp,
                    'debit': target_total,
                    'kredit': ZERO,
                    'unit': unit,
                    'keterangan': f'Realisasi Kas Besar {kas_besar.no_pengajuan}: {kas_besar.keperluan}'[:255],
                }
            )

        akun_kb = AccountingPostingService.resolve_account_mapping('KAS_BESAR_DEFAULT')
        if rekening_bank_id:
            rek = (
                RekeningBank.objects.select_related('akun_akuntansi')
                .filter(pk=rekening_bank_id, akun_akuntansi__isnull=False)
                .first()
            )
            if rek and rek.akun_akuntansi.is_active and rek.akun_akuntansi.is_postable:
                akun_kb = rek.akun_akuntansi

        lines = debit_lines + [
            {
                'akun': akun_kb,
                'debit': ZERO,
                'kredit': target_total,
                'unit': unit,
                'keterangan': f'Pengeluaran Kas Besar {kas_besar.no_pengajuan}',
            }
        ]

        return AccountingPostingService.create_and_post_journal(
            tanggal=tgl_jurnal,
            jenis_jurnal=Jurnal.JENIS_KAS_BANK,
            keterangan=f'Pertanggungjawaban Kas Besar {kas_besar.no_pengajuan} — {kas_besar.keperluan}',
            lines=lines,
            source_type='keuangan.KasBesar',
            source_id=kas_besar.id,
            source_number=kas_besar.no_pengajuan,
            user=user,
        )


class DepreciationPostingService:
    """
    6. ASET — Service Penyusutan Bulanan (`DepreciationPostingService`):
    Menghitung penyusutan bulanan seluruh aset aktif berdasarkan metode garis lurus PMK 72/2023,
    lalu mem-posting 1 jurnal gabungan per periode (`jenis_jurnal='penyusutan'`,
    `source_type='aset.MonthlyDepreciation'`, `source_id=tahun*100 + bulan`).
    """

    @classmethod
    @transaction.atomic
    def post_monthly_depreciation(
        cls,
        tahun: int,
        bulan: int,
        user: Any = None,
    ) -> Jurnal:
        from aset.models import Aset

        try:
            tahun_int = int(tahun)
            bulan_int = int(bulan)
        except (TypeError, ValueError) as exc:
            raise ValidationError('Parameter `tahun` dan `bulan` harus berupa angka.') from exc

        if not (1 <= bulan_int <= 12):
            raise ValidationError('Parameter `bulan` harus berada di antara 1 sampai 12.')

        last_day = calendar.monthrange(tahun_int, bulan_int)[1]
        period_end_date = date(tahun_int, bulan_int, last_day)
        source_id = tahun_int * 100 + bulan_int
        source_number = f'DEPR/{tahun_int}{bulan_int:02d}'

        # Idempotency check early if already posted
        existing = Jurnal.objects.filter(
            source_type='aset.MonthlyDepreciation',
            source_id=source_id,
        ).exclude(status=Jurnal.STATUS_REVERSED).first()
        if existing is not None:
            return existing

        active_assets = list(
            Aset.objects.filter(status_aset__in=['aktif', 'dalam_perbaikan'])
            .exclude(status_data='belum_lengkap')
            .select_related('jenis', 'jenis__kategori', 'kelompok', 'unit')
            .order_by('kode_aset')
        )

        debit_groups: Dict[Any, Dict[str, Any]] = {}
        kredit_groups: Dict[int, Dict[str, Any]] = {}
        depreciated_count = 0

        for aset in active_assets:
            harga = _quantize_money(aset.harga_perolehan)
            masa_bulan = int(aset.masa_manfaat_bulan or 0)
            tgl_perolehan = aset.bulan_perolehan

            if (
                harga <= ZERO
                or masa_bulan <= 0
                or tgl_perolehan is None
                or (aset.kelompok and not aset.kelompok.disusutkan)
            ):
                continue

            # Hitung bulan ke-N sejak bulan perolehan (1-based inklusif sesuai PMK 72/2023)
            bulan_ke = (tahun_int - tgl_perolehan.year) * 12 + (bulan_int - tgl_perolehan.month) + 1
            if bulan_ke < 1 or bulan_ke > masa_bulan:
                continue

            beban_reguler = (harga / Decimal(masa_bulan)).quantize(
                TWO_PLACES, rounding=ROUND_HALF_UP
            )
            if bulan_ke == masa_bulan:
                akum_sebelum = (beban_reguler * Decimal(masa_bulan - 1)).quantize(
                    TWO_PLACES, rounding=ROUND_HALF_UP
                )
                beban_bulan_ini = max(ZERO, harga - akum_sebelum)
            else:
                beban_bulan_ini = beban_reguler

            if beban_bulan_ini <= ZERO:
                continue

            kategori = aset.jenis.kategori if aset.jenis else None
            akun_exp = AccountingPostingService.resolve_account_mapping(
                'DEPRECIATION_EXPENSE',
                kategori_aset=kategori,
            )
            akun_accum = AccountingPostingService.resolve_account_mapping(
                'DEPRECIATION_ACCUM',
                kategori_aset=kategori,
            )

            d_key = (akun_exp.id, aset.unit_id)
            if d_key not in debit_groups:
                unit_label = aset.unit.nama if aset.unit else 'RS'
                debit_groups[d_key] = {
                    'akun': akun_exp,
                    'debit': ZERO,
                    'kredit': ZERO,
                    'unit_id': aset.unit_id,
                    'keterangan': f'Beban Penyusutan Aset {tahun_int}-{bulan_int:02d} ({unit_label})',
                }
            debit_groups[d_key]['debit'] += beban_bulan_ini

            if akun_accum.id not in kredit_groups:
                kredit_groups[akun_accum.id] = {
                    'akun': akun_accum,
                    'debit': ZERO,
                    'kredit': ZERO,
                    'keterangan': f'Akumulasi Penyusutan Aset Tetap Periode {tahun_int}-{bulan_int:02d}',
                }
            kredit_groups[akun_accum.id]['kredit'] += beban_bulan_ini
            depreciated_count += 1

        if depreciated_count == 0 or not debit_groups or not kredit_groups:
            raise ValidationError(
                f'Tidak ditemukan aset tetap aktif yang memiliki beban penyusutan pada periode {tahun_int}-{bulan_int:02d}.'
            )

        lines = list(debit_groups.values()) + list(kredit_groups.values())

        return AccountingPostingService.create_and_post_journal(
            tanggal=period_end_date,
            jenis_jurnal=Jurnal.JENIS_PENYUSUTAN,
            keterangan=(
                f'Penyusutan Bulanan Aset Tetap (PMK 72/2023) Periode {tahun_int}-{bulan_int:02d} '
                f'({depreciated_count} aset)'
            ),
            lines=lines,
            source_type='aset.MonthlyDepreciation',
            source_id=source_id,
            source_number=source_number,
            user=user,
        )
