import calendar
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Union

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from keuangan.models import AccountMapping, AccountingPeriod, Akun, Jurnal, JurnalItem

TWO_PLACES = Decimal('0.01')
ZERO = Decimal('0.00')

JOURNAL_PREFIX_MAP: Dict[str, str] = {
    Jurnal.JENIS_UMUM: 'UM',
    Jurnal.JENIS_PENJUALAN: 'PJ',
    Jurnal.JENIS_PEMBELIAN: 'PB',
    Jurnal.JENIS_KAS_BANK: 'KB',
    Jurnal.JENIS_PERSEDIAAN: 'PS',
    Jurnal.JENIS_PENYUSUTAN: 'PY',
    Jurnal.JENIS_PENYESUAIAN: 'AJ',
}


def _coerce_date(value: Union[date, datetime, str]) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValidationError(f'Format tanggal tidak valid: {value!r}')


def _quantize_money(value: Any) -> Decimal:
    if value is None or value == '':
        return ZERO
    try:
        dec = Decimal(str(value))
    except Exception as exc:
        raise ValidationError(f'Nominal uang tidak valid: {value!r}') from exc
    return dec.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _ensure_period_locked(tanggal: date) -> AccountingPeriod:
    """
    Ensures the AccountingPeriod row for (tanggal.year, tanggal.month) exists and
    locks it with select_for_update() so concurrent postings/number generations in
    the same period serialize cleanly at the database level.
    """
    tahun = tanggal.year
    bulan = tanggal.month
    period = (
        AccountingPeriod.objects.select_for_update()
        .filter(tahun=tahun, bulan=bulan)
        .first()
    )
    if period is not None:
        return period

    last_day = calendar.monthrange(tahun, bulan)[1]
    bulan_label = AccountingPeriod.BULAN_NAMES.get(bulan, str(bulan))
    try:
        with transaction.atomic():
            period, _ = AccountingPeriod.objects.select_for_update().get_or_create(
                tahun=tahun,
                bulan=bulan,
                defaults={
                    'nama_periode': f'{bulan_label} {tahun}',
                    'tanggal_mulai': date(tahun, bulan, 1),
                    'tanggal_selesai': date(tahun, bulan, last_day),
                    'status': AccountingPeriod.STATUS_OPEN,
                },
            )
            return period
    except IntegrityError:
        return AccountingPeriod.objects.select_for_update().get(tahun=tahun, bulan=bulan)


def _user_can_post_in_soft_locked(user: Any) -> bool:
    if user is None or not getattr(user, 'is_authenticated', True):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'username', '') == 'super':
        return True
    if getattr(user, 'is_akuntansi', False):
        return True
    role = getattr(user, 'role', '')
    return role in ('manajer', 'wakil_direktur', 'direktur')


@transaction.atomic
def validate_period_open(tanggal: Union[date, datetime, str], user: Any = None) -> AccountingPeriod:
    """
    Validates that the accounting period for `tanggal` is open for posting/reversal.
    - Auto-creates an `open` period if none exists for that month/year.
    - Rejects all operations if `status == 'closed'`.
    - Rejects operations if `status == 'soft_locked'` unless `user` is superuser
      or manager-level accounting user (`is_akuntansi` / role >= `manajer`).
    """
    tgl = _coerce_date(tanggal)
    period = _ensure_period_locked(tgl)

    if period.status == AccountingPeriod.STATUS_CLOSED:
        raise ValidationError(
            f'Periode akuntansi {period.nama_periode} sudah ditutup permanen (CLOSED). '
            f'Transaksi pada tanggal {tgl.isoformat()} tidak dapat diposting atau dibatalkan.'
        )

    if period.status == AccountingPeriod.STATUS_SOFT_LOCKED:
        if not _user_can_post_in_soft_locked(user):
            raise ValidationError(
                f'Periode akuntansi {period.nama_periode} berstatus SOFT-LOCKED. '
                f'Hanya Manajer Akuntansi atau Superuser yang diizinkan memposting pada periode ini.'
            )

    return period


@transaction.atomic
def generate_journal_number(
    jenis_jurnal: str = Jurnal.JENIS_UMUM,
    tanggal: Optional[Union[date, datetime, str]] = None,
) -> str:
    """
    Generates a sequential journal number per journal type and YYYYMM period:
    Format: JRN/<PREFIX>/<YYYYMM>/<0001>
    Examples:
      - JRN/UM/202611/0001
      - JRN/PJ/202611/0001
      - JRN/PB/202611/0001
      - JRN/KB/202611/0001
      - JRN/PS/202611/0001
      - JRN/PY/202611/0001
      - JRN/AJ/202611/0001
    Uses row-level locking (`select_for_update`) on the period and matching journals
    to prevent race conditions under concurrent requests.
    """
    if jenis_jurnal not in JOURNAL_PREFIX_MAP:
        raise ValidationError(
            f'Jenis jurnal tidak dikenal: {jenis_jurnal!r}. '
            f'Pilihan valid: {", ".join(JOURNAL_PREFIX_MAP.keys())}'
        )

    tgl = _coerce_date(tanggal) if tanggal is not None else timezone.localdate()
    # Lock the AccountingPeriod row first so concurrent requests even on an empty month serialize
    _ensure_period_locked(tgl)

    code_prefix = JOURNAL_PREFIX_MAP[jenis_jurnal]
    yyyymm = tgl.strftime('%Y%m')
    base_prefix = f'JRN/{code_prefix}/{yyyymm}/'

    last_jurnal = (
        Jurnal.objects.select_for_update()
        .filter(nomor_jurnal__startswith=base_prefix)
        .order_by('-nomor_jurnal')
        .first()
    )

    next_seq = 1
    if last_jurnal and last_jurnal.nomor_jurnal:
        tail = last_jurnal.nomor_jurnal[len(base_prefix):]
        if tail.isdigit():
            next_seq = int(tail) + 1

    return f'{base_prefix}{next_seq:04d}'


class AccountingPostingService:
    """
    Core Double-Entry Accounting Posting & Reversal Service (Odoo & Accurate Reference).
    All state mutations execute inside `@transaction.atomic` with strict validation.
    """

    @staticmethod
    def resolve_account_mapping(
        event_code: str,
        komponen_pendapatan: str = '',
        golongan_barang: Any = None,
        kategori_aset: Any = None,
    ) -> Akun:
        """
        Resolves the target Chart of Account (`Akun`) from `AccountMapping` for `event_code`.
        Attempts an exact dimensional match first, then falls back to the general default
        mapping for `event_code`.
        """
        komp = (komponen_pendapatan or '').strip().lower()
        gol_id = getattr(golongan_barang, 'pk', golongan_barang) or None
        kat_id = getattr(kategori_aset, 'pk', kategori_aset) or None

        qs = AccountMapping.objects.select_related('akun').filter(
            event_code=event_code,
            is_active=True,
        )

        # 1. Exact match on provided dimensions
        exact_mapping = qs.filter(
            komponen_pendapatan=komp,
            golongan_barang_id=gol_id,
            kategori_aset_id=kat_id,
        ).first()

        # 2. Fallback to default mapping (no sub-dimension filters)
        mapping = exact_mapping
        if mapping is None and (komp != '' or gol_id is not None or kat_id is not None):
            mapping = qs.filter(
                komponen_pendapatan='',
                golongan_barang__isnull=True,
                kategori_aset__isnull=True,
            ).first()
            if mapping is None and event_code == 'CLAIM_REVENUE_COMPONENT':
                mapping = (
                    AccountMapping.objects.select_related('akun')
                    .filter(
                        event_code='CLAIM_REVENUE_DEFAULT',
                        is_active=True,
                        komponen_pendapatan='',
                        golongan_barang__isnull=True,
                        kategori_aset__isnull=True,
                    )
                    .first()
                )

        if mapping is None:
            raise ValidationError(
                f'Konfigurasi AccountMapping aktif untuk event "{event_code}" belum diatur.'
            )

        akun = mapping.akun
        if not akun.is_active:
            raise ValidationError(
                f'Akun hasil pemetaan "{event_code}" ({akun.kode_akun} - {akun.nama_akun}) berstatus non-aktif.'
            )
        if not akun.is_postable:
            raise ValidationError(
                f'Akun hasil pemetaan "{event_code}" ({akun.kode_akun} - {akun.nama_akun}) adalah akun Header '
                f'(is_postable=False) dan tidak dapat diposting.'
            )
        return akun

    @staticmethod
    def _resolve_akun(item_data: Dict[str, Any], idx: int) -> Akun:
        akun_ref = item_data.get('akun') or item_data.get('akun_id')
        kode_akun = item_data.get('kode_akun')

        if isinstance(akun_ref, Akun):
            return akun_ref
        if akun_ref is not None:
            try:
                return Akun.objects.get(pk=akun_ref)
            except (Akun.DoesNotExist, ValueError, TypeError) as exc:
                raise ValidationError(
                    f'Baris #{idx}: Akun dengan ID {akun_ref!r} tidak ditemukan.'
                ) from exc
        if kode_akun:
            try:
                return Akun.objects.get(kode_akun=str(kode_akun).strip())
            except Akun.DoesNotExist as exc:
                raise ValidationError(
                    f'Baris #{idx}: Akun dengan kode "{kode_akun}" tidak ditemukan.'
                ) from exc

        raise ValidationError(f'Baris #{idx}: Wajib menyertakan `akun` atau `kode_akun`.')

    @staticmethod
    def _requires_partner_validation(akun: Akun, jenis_jurnal: str) -> bool:
        """
        Determines whether a reconcilable account requires `partner_type` and `partner_id`.
        Reconcilable AR/AP/Deposit accounts (non-cash/bank current assets & liabilities)
        must track sub-ledger partner identity on regular operational journals.
        """
        if not akun.is_reconcilable:
            return False
        if akun.is_kas_setara:
            return False
        if jenis_jurnal == Jurnal.JENIS_PENYESUAIAN:
            return False
        return akun.tipe in (
            'aset_lancar',
            'kewajiban_lancar',
            'kewajiban_jangka_panjang',
        )

    @classmethod
    def _validate_and_normalize_lines(
        cls,
        lines: List[Dict[str, Any]],
        jenis_jurnal: str,
        require_partner_on_reconcilable: bool = True,
    ) -> List[Dict[str, Any]]:
        if not lines or len(lines) < 2:
            raise ValidationError('Jurnal wajib memiliki minimal 2 baris (JurnalItem).')

        normalized: List[Dict[str, Any]] = []
        total_debit = ZERO
        total_kredit = ZERO

        for idx, raw in enumerate(lines, start=1):
            akun = cls._resolve_akun(raw, idx)
            if not akun.is_active:
                raise ValidationError(
                    f'Baris #{idx}: Akun {akun.kode_akun} - {akun.nama_akun} tidak aktif.'
                )
            if not akun.is_postable:
                raise ValidationError(
                    f'Baris #{idx}: Akun {akun.kode_akun} - {akun.nama_akun} adalah akun Induk/Header '
                    f'(is_postable=False) dan tidak boleh diposting langsung.'
                )

            debit = _quantize_money(raw.get('debit', ZERO))
            kredit = _quantize_money(raw.get('kredit', ZERO))

            if debit < ZERO or kredit < ZERO:
                raise ValidationError(
                    f'Baris #{idx} ({akun.kode_akun}): Nominal debit/kredit tidak boleh negatif.'
                )
            if debit == ZERO and kredit == ZERO:
                raise ValidationError(
                    f'Baris #{idx} ({akun.kode_akun}): Nilai debit dan kredit tidak boleh keduanya 0.'
                )
            if debit > ZERO and kredit > ZERO:
                raise ValidationError(
                    f'Baris #{idx} ({akun.kode_akun}): Satu baris jurnal tidak boleh memiliki '
                    f'nilai debit ({debit}) dan kredit ({kredit}) sekaligus.'
                )

            partner_type = raw.get('partner_type') or None
            partner_id = raw.get('partner_id')
            if partner_id == '':
                partner_id = None
            if partner_id is not None:
                try:
                    partner_id = int(partner_id)
                except (TypeError, ValueError) as exc:
                    raise ValidationError(
                        f'Baris #{idx} ({akun.kode_akun}): `partner_id` harus berupa bilangan bulat.'
                    ) from exc

            if require_partner_on_reconcilable and cls._requires_partner_validation(akun, jenis_jurnal):
                if not partner_type or not partner_id:
                    raise ValidationError(
                        f'Baris #{idx}: Akun {akun.kode_akun} - {akun.nama_akun} bersifat reconcilable '
                        f'(Buku Pembantu Piutang/Utang) sehingga wajib menyertakan `partner_type` dan `partner_id`.'
                    )

            unit = raw.get('unit')
            unit_id = raw.get('unit_id')
            if hasattr(unit, 'pk'):
                unit_id = unit.pk
            elif isinstance(unit, int):
                unit_id = unit

            jatuh_tempo = raw.get('tanggal_jatuh_tempo')
            if jatuh_tempo:
                jatuh_tempo = _coerce_date(jatuh_tempo)
            else:
                jatuh_tempo = None

            total_debit += debit
            total_kredit += kredit

            normalized.append(
                {
                    'akun': akun,
                    'keterangan': (raw.get('keterangan') or '').strip()[:255],
                    'debit': debit,
                    'kredit': kredit,
                    'partner_type': partner_type,
                    'partner_id': partner_id,
                    'unit_id': unit_id,
                    'tanggal_jatuh_tempo': jatuh_tempo,
                    'reconcile_ref': (raw.get('reconcile_ref') or '').strip()[:100],
                }
            )

        if total_debit <= ZERO:
            raise ValidationError('Total debit jurnal harus lebih besar dari 0.')

        if total_debit != total_kredit:
            selisih = abs(total_debit - total_kredit)
            raise ValidationError(
                f'Jurnal tidak seimbang (Unbalanced)! Total Debit ({total_debit}) != '
                f'Total Kredit ({total_kredit}), selisih: {selisih}.'
            )

        return normalized

    @classmethod
    @transaction.atomic
    def create_and_post_journal(
        cls,
        *,
        tanggal: Union[date, datetime, str],
        keterangan: str,
        lines: List[Dict[str, Any]],
        jenis_jurnal: str = Jurnal.JENIS_UMUM,
        source_type: Optional[str] = None,
        source_id: Optional[int] = None,
        source_number: str = '',
        user: Any = None,
        auto_post: bool = True,
        nomor_jurnal: Optional[str] = None,
        require_partner_on_reconcilable: bool = True,
    ) -> Jurnal:
        """
        Single entry-point to create (and optionally post) a balanced double-entry journal.
        - Idempotent on `(source_type, source_id)` when an active (non-reversed) journal exists.
        - Enforces open period, postable leaf accounts, partner sub-ledger rules, and balance.
        """
        tgl = _coerce_date(tanggal)
        clean_source_type = (source_type or '').strip() or None
        clean_source_id = int(source_id) if source_id not in (None, '') else None

        if (clean_source_type is None) != (clean_source_id is None):
            raise ValidationError(
                '`source_type` dan `source_id` harus diisi berpasangan atau dikosongkan keduanya.'
            )

        # 1. Idempotency check with row-level lock
        if clean_source_type and clean_source_id is not None:
            existing = (
                Jurnal.objects.select_for_update()
                .filter(source_type=clean_source_type, source_id=clean_source_id)
                .first()
            )
            if existing is not None:
                if existing.status != Jurnal.STATUS_REVERSED:
                    if auto_post and existing.status == Jurnal.STATUS_DRAFT:
                        return cls.post_draft_journal(existing.pk, user=user)
                    return existing
                # If previous journal for this source was reversed, detach its unique (source_type, source_id)
                # while keeping its source_number history so the re-posted source document can bind cleanly.
                Jurnal.objects.filter(pk=existing.pk).update(source_type=None, source_id=None)

        # 2. Validate period (and lock period row)
        if auto_post:
            validate_period_open(tgl, user=user)
        else:
            _ensure_period_locked(tgl)

        # 3. Validate and normalize lines
        normalized_lines = cls._validate_and_normalize_lines(
            lines=lines,
            jenis_jurnal=jenis_jurnal,
            require_partner_on_reconcilable=require_partner_on_reconcilable,
        )

        # 4. Generate journal number if not explicitly provided
        final_nomor = (nomor_jurnal or '').strip() or generate_journal_number(
            jenis_jurnal=jenis_jurnal,
            tanggal=tgl,
        )

        actor = user if getattr(user, 'is_authenticated', False) else None

        # 5. Create header in draft first so JurnalItem rows can be added cleanly
        jurnal = Jurnal.objects.create(
            nomor_jurnal=final_nomor,
            tanggal=tgl,
            jenis_jurnal=jenis_jurnal,
            keterangan=(keterangan or '').strip(),
            source_type=clean_source_type,
            source_id=clean_source_id,
            source_number=(source_number or '').strip()[:100],
            status=Jurnal.STATUS_DRAFT,
            created_by=actor,
        )

        items_to_create = [
            JurnalItem(
                jurnal=jurnal,
                akun=line['akun'],
                keterangan=line['keterangan'] or jurnal.keterangan[:255],
                debit=line['debit'],
                kredit=line['kredit'],
                partner_type=line['partner_type'],
                partner_id=line['partner_id'],
                unit_id=line['unit_id'],
                tanggal_jatuh_tempo=line['tanggal_jatuh_tempo'],
                reconcile_ref=line['reconcile_ref'],
            )
            for line in normalized_lines
        ]
        JurnalItem.objects.bulk_create(items_to_create)

        if auto_post:
            jurnal.status = Jurnal.STATUS_POSTED
            jurnal.posted_by = actor
            jurnal.posted_at = timezone.now()
            jurnal.save(update_fields=['status', 'posted_by', 'posted_at', 'updated_at'])

        return jurnal

    @classmethod
    @transaction.atomic
    def post_draft_journal(cls, jurnal_id: int, user: Any = None) -> Jurnal:
        """
        Transitions an existing `draft` journal to `posted` after validating period,
        account postability, minimum 2 lines, and debit == kredit balance.
        """
        try:
            jurnal = Jurnal.objects.select_for_update().get(pk=jurnal_id)
        except Jurnal.DoesNotExist as exc:
            raise ValidationError(f'Jurnal dengan ID {jurnal_id} tidak ditemukan.') from exc

        if jurnal.status == Jurnal.STATUS_POSTED:
            return jurnal
        if jurnal.status != Jurnal.STATUS_DRAFT:
            raise ValidationError(
                f'Jurnal {jurnal.nomor_jurnal} berstatus "{jurnal.status}" dan tidak dapat diposting.'
            )

        validate_period_open(jurnal.tanggal, user=user)

        items = list(jurnal.items.select_related('akun').all())
        if len(items) < 2:
            raise ValidationError(
                f'Jurnal {jurnal.nomor_jurnal} harus memiliki minimal 2 baris item sebelum diposting.'
            )

        total_debit = ZERO
        total_kredit = ZERO
        for idx, item in enumerate(items, start=1):
            if not item.akun.is_active:
                raise ValidationError(
                    f'Baris #{idx}: Akun {item.akun.kode_akun} tidak aktif.'
                )
            if not item.akun.is_postable:
                raise ValidationError(
                    f'Baris #{idx}: Akun {item.akun.kode_akun} adalah akun Header (is_postable=False).'
                )
            total_debit += _quantize_money(item.debit)
            total_kredit += _quantize_money(item.kredit)

        if total_debit <= ZERO or total_debit != total_kredit:
            raise ValidationError(
                f'Jurnal {jurnal.nomor_jurnal} tidak seimbang: '
                f'Debit ({total_debit}) != Kredit ({total_kredit}).'
            )

        actor = user if getattr(user, 'is_authenticated', False) else None
        jurnal.status = Jurnal.STATUS_POSTED
        jurnal.posted_by = actor
        jurnal.posted_at = timezone.now()
        jurnal.save(update_fields=['status', 'posted_by', 'posted_at', 'updated_at'])
        return jurnal

    @classmethod
    @transaction.atomic
    def reverse_journal(
        cls,
        jurnal_id: int,
        tanggal_reversal: Optional[Union[date, datetime, str]] = None,
        alasan: str = '',
        user: Any = None,
    ) -> Jurnal:
        """
        Reverses an immutable `posted` journal by creating a contra-journal (swapping
        debit and kredit on every line), linking `reversal_of=jurnal_asal`, and marking
        `jurnal_asal.status = 'reversed'`. Never deletes journal records.
        """
        try:
            jurnal_asal = Jurnal.objects.select_for_update().get(pk=jurnal_id)
        except Jurnal.DoesNotExist as exc:
            raise ValidationError(f'Jurnal dengan ID {jurnal_id} tidak ditemukan.') from exc

        if jurnal_asal.status == Jurnal.STATUS_REVERSED:
            raise ValidationError(
                f'Jurnal {jurnal_asal.nomor_jurnal} sudah pernah di-reverse sebelumnya.'
            )
        if jurnal_asal.status != Jurnal.STATUS_POSTED:
            raise ValidationError(
                f'Hanya jurnal berstatus POSTED yang dapat di-reverse (status saat ini: {jurnal_asal.status}).'
            )
        if Jurnal.objects.filter(reversal_of=jurnal_asal).exists():
            raise ValidationError(
                f'Jurnal {jurnal_asal.nomor_jurnal} sudah memiliki jurnal pembalik.'
            )

        tgl_rev = _coerce_date(tanggal_reversal) if tanggal_reversal else jurnal_asal.tanggal
        validate_period_open(tgl_rev, user=user)

        original_items = list(jurnal_asal.items.select_related('akun').all())
        if len(original_items) < 2:
            raise ValidationError(
                f'Jurnal asal {jurnal_asal.nomor_jurnal} tidak memiliki item yang valid untuk dibalik.'
            )

        nomor_rev = generate_journal_number(
            jenis_jurnal=jurnal_asal.jenis_jurnal,
            tanggal=tgl_rev,
        )
        alasan_clean = (alasan or '').strip()
        ket_rev = f'Pembalik (Reversal) atas {jurnal_asal.nomor_jurnal}'
        if alasan_clean:
            ket_rev = f'{ket_rev}: {alasan_clean}'
        elif jurnal_asal.keterangan:
            ket_rev = f'{ket_rev} — {jurnal_asal.keterangan}'

        actor = user if getattr(user, 'is_authenticated', False) else None
        now = timezone.now()

        jurnal_pembalik = Jurnal.objects.create(
            nomor_jurnal=nomor_rev,
            tanggal=tgl_rev,
            jenis_jurnal=jurnal_asal.jenis_jurnal,
            keterangan=ket_rev,
            source_type=None,
            source_id=None,
            source_number=jurnal_asal.nomor_jurnal,
            status=Jurnal.STATUS_DRAFT,
            reversal_of=jurnal_asal,
            created_by=actor,
        )

        rev_items = [
            JurnalItem(
                jurnal=jurnal_pembalik,
                akun=item.akun,
                keterangan=f'Reversal: {item.keterangan or jurnal_asal.nomor_jurnal}'[:255],
                debit=item.kredit,
                kredit=item.debit,
                partner_type=item.partner_type,
                partner_id=item.partner_id,
                unit_id=item.unit_id,
                tanggal_jatuh_tempo=item.tanggal_jatuh_tempo,
                reconcile_ref=item.reconcile_ref or jurnal_asal.nomor_jurnal,
            )
            for item in original_items
        ]
        JurnalItem.objects.bulk_create(rev_items)

        jurnal_pembalik.status = Jurnal.STATUS_POSTED
        jurnal_pembalik.posted_by = actor
        jurnal_pembalik.posted_at = now
        jurnal_pembalik.save(update_fields=['status', 'posted_by', 'posted_at', 'updated_at'])

        jurnal_asal.status = Jurnal.STATUS_REVERSED
        jurnal_asal.save(update_fields=['status', 'updated_at'])

        return jurnal_pembalik
