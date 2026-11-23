from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AccountMapping, AccountingPeriod, Akun, Jurnal, JurnalItem
from .serializers import (
    AccountMappingSerializer,
    AccountingPeriodSerializer,
    AkunSerializer,
    JurnalInputSerializer,
    JurnalSerializer,
)
from .services import (
    AccountingPostingService,
    AccountingReportService,
    DepreciationPostingService,
)
from .services.accounting_engine import ZERO, _quantize_money
from . services.accounting_reports import ACTIVE_LEDGER_STATUSES
from .views import OptionalPaginationMixin


def has_accounting_write_access(user: Any) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'username', '') == 'super':
        return True
    if getattr(user, 'is_akuntansi', False) or getattr(user, 'is_keuangan', False):
        return True
    return getattr(user, 'role', '') in ('manajer', 'wakil_direktur', 'direktur')


def has_period_reopen_access(user: Any) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'username', '') == 'super':
        return True
    return getattr(user, 'role', '') == 'direktur'


class IsAccountingPermission(BasePermission):
    """
    - SAFE_METHODS: semua user terautentikasi yang memiliki akses keuangan/akuntansi/manajerial.
    - Write methods: wajib `is_akuntansi`, `is_keuangan`, `is_superuser`, atau role >= `manajer`.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return (
                has_accounting_write_access(user)
                or getattr(user, 'view_jurnal', False)
                or getattr(user, 'view_laporan_keuangan', False)
            )
        return has_accounting_write_access(user)


class AkunViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = Akun.objects.select_related('parent').all().order_by('kode_akun')
    serializer_class = AkunSerializer
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        include_inactive = str(params.get('include_inactive') or '').lower() in ('1', 'true', 'yes')
        is_active_param = params.get('is_active')
        if is_active_param is not None:
            qs = qs.filter(is_active=str(is_active_param).lower() in ('1', 'true', 'yes'))
        elif not include_inactive and self.action == 'list':
            qs = qs.filter(is_active=True)

        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(Q(kode_akun__icontains=search) | Q(nama_akun__icontains=search))

        tipe = (params.get('tipe') or '').strip()
        if tipe:
            qs = qs.filter(tipe=tipe)

        kategori_laporan = (params.get('kategori_laporan') or '').strip()
        if kategori_laporan:
            qs = qs.filter(kategori_laporan=kategori_laporan)

        is_postable = params.get('is_postable')
        if is_postable is not None:
            qs = qs.filter(is_postable=str(is_postable).lower() in ('1', 'true', 'yes'))

        is_reconcilable = params.get('is_reconcilable')
        if is_reconcilable is not None:
            qs = qs.filter(is_reconcilable=str(is_reconcilable).lower() in ('1', 'true', 'yes'))

        return qs.order_by('kode_akun')

    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """
        GET /api/keuangan/akun/tree/
        Mengembalikan struktur pohon hierarkis CoA (nested `children`) lengkap dengan
        `total_debit`, `total_kredit`, dan `saldo_berjalan` (termasuk rollup ke akun Header).
        Opsional query params: `start_date`, `end_date`, `as_of_date`, `include_inactive`.
        """
        params = request.query_params
        include_inactive = str(params.get('include_inactive') or '').lower() in ('1', 'true', 'yes')
        accounts_qs = Akun.objects.select_related('parent').order_by('kode_akun')
        if not include_inactive:
            accounts_qs = accounts_qs.filter(is_active=True)
        accounts = list(accounts_qs)

        item_filter = Q(jurnal__status__in=ACTIVE_LEDGER_STATUSES)
        start_date = params.get('start_date') or params.get('tanggal_awal')
        end_date = params.get('end_date') or params.get('tanggal_akhir') or params.get('as_of_date')
        if start_date:
            item_filter &= Q(jurnal__tanggal__gte=start_date)
        if end_date:
            item_filter &= Q(jurnal__tanggal__lte=end_date)

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

        nodes: Dict[int, Dict[str, Any]] = {}
        children_map: Dict[Optional[int], List[int]] = {}

        for acc in accounts:
            d_val, k_val = movement_map.get(acc.id, (ZERO, ZERO))
            saldo = (k_val - d_val) if acc.saldo_normal == 'kredit' else (d_val - k_val)
            nodes[acc.id] = {
                'id': acc.id,
                'kode_akun': acc.kode_akun,
                'nama_akun': acc.nama_akun,
                'parent_id': acc.parent_id,
                'tipe': acc.tipe,
                'tipe_label': acc.get_tipe_display(),
                'kategori_laporan': acc.kategori_laporan,
                'saldo_normal': acc.saldo_normal,
                'is_postable': acc.is_postable,
                'is_reconcilable': acc.is_reconcilable,
                'is_kas_setara': acc.is_kas_setara,
                'is_active': acc.is_active,
                'total_debit': d_val,
                'total_kredit': k_val,
                'saldo_berjalan': saldo,
                'children': [],
            }
            parent_key = acc.parent_id if acc.parent_id in {a.id for a in accounts} else None
            children_map.setdefault(parent_key, []).append(acc.id)

        def _build_subtree(acc_id: int) -> Dict[str, Any]:
            node = nodes[acc_id]
            d_sum = node['total_debit']
            k_sum = node['total_kredit']

            for child_id in children_map.get(acc_id, []):
                child_node = _build_subtree(child_id)
                node['children'].append(child_node)
                d_sum += child_node['total_debit']
                k_sum += child_node['total_kredit']

            node['total_debit'] = d_sum
            node['total_kredit'] = k_sum
            node['saldo_berjalan'] = (
                (k_sum - d_sum) if node['saldo_normal'] == 'kredit' else (d_sum - k_sum)
            )
            return node

        root_nodes = [_build_subtree(rid) for rid in children_map.get(None, [])]
        return Response(
            {
                'count': len(accounts),
                'tree': root_nodes,
            },
            status=status.HTTP_200_OK,
        )


class AccountingPeriodViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = AccountingPeriod.objects.select_related('closed_by').all().order_by('-tahun', '-bulan')
    serializer_class = AccountingPeriodSerializer
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        tahun = self.request.query_params.get('tahun')
        st = self.request.query_params.get('status')
        if tahun:
            qs = qs.filter(tahun=tahun)
        if st:
            qs = qs.filter(status=st)
        return qs

    @action(detail=True, methods=['post'], url_path='close')
    def close_period(self, request, pk=None):
        period = self.get_object()
        if period.status == AccountingPeriod.STATUS_CLOSED:
            return Response(
                {'error': f'Periode {period.nama_periode} sudah berstatus CLOSED.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        catatan = (request.data.get('catatan') or '').strip()
        period.status = AccountingPeriod.STATUS_CLOSED
        period.closed_by = request.user
        period.closed_at = timezone.now()
        if catatan:
            period.catatan = catatan
        period.save()
        return Response(
            {
                'message': f'Periode {period.nama_periode} berhasil ditutup permanen (CLOSED).',
                'period': AccountingPeriodSerializer(period).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='soft-lock')
    def soft_lock_period(self, request, pk=None):
        period = self.get_object()
        if period.status == AccountingPeriod.STATUS_CLOSED:
            return Response(
                {'error': f'Periode {period.nama_periode} sudah CLOSED. Gunakan endpoint /reopen/ terlebih dahulu.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        catatan = (request.data.get('catatan') or '').strip()
        period.status = AccountingPeriod.STATUS_SOFT_LOCKED
        if catatan:
            period.catatan = catatan
        period.save()
        return Response(
            {
                'message': f'Periode {period.nama_periode} berhasil dikunci sementara (SOFT-LOCKED).',
                'period': AccountingPeriodSerializer(period).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_period(self, request, pk=None):
        if not has_period_reopen_access(request.user):
            return Response(
                {'error': 'Hanya Superuser atau Direktur yang memiliki otoritas membuka kembali (reopen) periode akuntansi.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        period = self.get_object()
        catatan = (request.data.get('catatan') or '').strip()
        period.status = AccountingPeriod.STATUS_OPEN
        period.closed_by = None
        period.closed_at = None
        if catatan:
            period.catatan = catatan
        period.save()
        return Response(
            {
                'message': f'Periode {period.nama_periode} berhasil dibuka kembali (OPEN).',
                'period': AccountingPeriodSerializer(period).data,
            },
            status=status.HTTP_200_OK,
        )


class AccountMappingViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = (
        AccountMapping.objects.select_related('akun', 'golongan_barang', 'kategori_aset', 'updated_by')
        .all()
        .order_by('event_code', 'komponen_pendapatan', 'id')
    )
    serializer_class = AccountMappingSerializer
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        event_code = (self.request.query_params.get('event_code') or '').strip()
        is_active = self.request.query_params.get('is_active')
        if event_code:
            qs = qs.filter(event_code=event_code)
        if is_active is not None:
            qs = qs.filter(is_active=str(is_active).lower() in ('1', 'true', 'yes'))
        return qs

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=['post', 'put'], url_path='bulk-update')
    def bulk_update(self, request):
        """
        POST/PUT /api/keuangan/account-mapping/bulk-update/
        Payload: `{"mappings": [{"id": ..., "event_code": "...", "akun": ..., "kode_akun": "...", ...}]}`
        """
        raw_list = request.data.get('mappings') if isinstance(request.data, dict) else request.data
        if not isinstance(raw_list, list) or not raw_list:
            return Response(
                {'error': 'Payload `mappings` berupa list wajib disertakan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_items = []
        try:
            with transaction.atomic():
                for idx, item in enumerate(raw_list, start=1):
                    if not isinstance(item, dict):
                        raise DjangoValidationError(f'Item #{idx} tidak valid.')

                    akun_obj = None
                    if item.get('akun'):
                        akun_obj = Akun.objects.filter(pk=item['akun']).first()
                    elif item.get('kode_akun'):
                        akun_obj = Akun.objects.filter(kode_akun=str(item['kode_akun']).strip()).first()

                    if akun_obj is None:
                        raise DjangoValidationError(
                            f'Item #{idx}: Akun tujuan tidak ditemukan.'
                        )
                    if not akun_obj.is_postable:
                        raise DjangoValidationError(
                            f'Item #{idx}: Akun {akun_obj.kode_akun} adalah akun Header (is_postable=False).'
                        )

                    mapping_id = item.get('id')
                    if mapping_id:
                        obj = AccountMapping.objects.get(pk=mapping_id)
                        obj.akun = akun_obj
                        if 'keterangan' in item:
                            obj.keterangan = str(item['keterangan'] or '')
                        if 'is_active' in item:
                            obj.is_active = bool(item['is_active'])
                        obj.updated_by = request.user
                        obj.save()
                    else:
                        event_code = str(item.get('event_code') or '').strip()
                        if not event_code:
                            raise DjangoValidationError(f'Item #{idx}: `event_code` wajib diisi.')
                        komp = str(item.get('komponen_pendapatan') or '').strip().lower()
                        gol_id = item.get('golongan_barang') or None
                        kat_id = item.get('kategori_aset') or None
                        obj, _ = AccountMapping.objects.update_or_create(
                            event_code=event_code,
                            komponen_pendapatan=komp,
                            golongan_barang_id=gol_id,
                            kategori_aset_id=kat_id,
                            defaults={
                                'akun': akun_obj,
                                'keterangan': str(item.get('keterangan') or ''),
                                'is_active': bool(item.get('is_active', True)),
                                'updated_by': request.user,
                            },
                        )
                    updated_items.append(obj)
        except (DjangoValidationError, AccountMapping.DoesNotExist) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': f'Berhasil memperbarui {len(updated_items)} konfigurasi Account Mapping.',
                'results': AccountMappingSerializer(updated_items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class JurnalViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = (
        Jurnal.objects.prefetch_related('items__akun', 'items__unit')
        .select_related('created_by', 'posted_by', 'reversal_of')
        .all()
        .order_by('-tanggal', '-id')
    )
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return JurnalInputSerializer
        return JurnalSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        tanggal_awal = params.get('tanggal_awal') or params.get('start_date') or params.get('dari')
        tanggal_akhir = params.get('tanggal_akhir') or params.get('end_date') or params.get('sampai')
        jenis_jurnal = (params.get('jenis_jurnal') or '').strip()
        st = (params.get('status') or '').strip()
        source_type = (params.get('source_type') or '').strip()
        search = (params.get('search') or '').strip()

        if tanggal_awal:
            qs = qs.filter(tanggal__gte=tanggal_awal)
        if tanggal_akhir:
            qs = qs.filter(tanggal__lte=tanggal_akhir)
        if jenis_jurnal:
            qs = qs.filter(jenis_jurnal=jenis_jurnal)
        if st:
            qs = qs.filter(status=st)
        if source_type:
            qs = qs.filter(source_type=source_type)
        if search:
            qs = qs.filter(
                Q(nomor_jurnal__icontains=search)
                | Q(keterangan__icontains=search)
                | Q(source_number__icontains=search)
            )
        return qs.order_by('-tanggal', '-id')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        jurnal = serializer.save(created_by=request.user)
        return Response(
            JurnalSerializer(jurnal, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='post')
    def post_journal(self, request, pk=None):
        jurnal = self.get_object()
        try:
            posted = AccountingPostingService.post_draft_journal(jurnal.pk, user=request.user)
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                'message': f'Jurnal {posted.nomor_jurnal} berhasil diposting.',
                'jurnal': JurnalSerializer(posted).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='posting')
    def posting_alias(self, request, pk=None):
        return self.post_journal(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse_journal_action(self, request, pk=None):
        jurnal = self.get_object()
        tanggal_reversal = request.data.get('tanggal_reversal') or request.data.get('tanggal')
        alasan = (request.data.get('alasan') or '').strip()
        try:
            jurnal_pembalik = AccountingPostingService.reverse_journal(
                jurnal_id=jurnal.pk,
                tanggal_reversal=tanggal_reversal,
                alasan=alasan,
                user=request.user,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': f'Jurnal {jurnal.nomor_jurnal} berhasil di-reverse dengan jurnal pembalik {jurnal_pembalik.nomor_jurnal}.',
                'reversal_journal': JurnalSerializer(jurnal_pembalik).data,
            },
            status=status.HTTP_201_CREATED,
        )


class BukuBesarReportView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get(self, request):
        params = request.query_params
        akun_id = params.get('akun_id') or params.get('kode_akun') or params.get('akun')
        if not akun_id:
            return Response(
                {'error': 'Parameter `akun_id` atau `kode_akun` wajib diisi.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = timezone.localdate()
        start_date = (
            params.get('start_date')
            or params.get('tanggal_awal')
            or params.get('dari')
            or date(today.year, today.month, 1).isoformat()
        )
        end_date = (
            params.get('end_date')
            or params.get('tanggal_akhir')
            or params.get('sampai')
            or today.isoformat()
        )
        unit_id = params.get('unit_id') or None
        if unit_id is not None and str(unit_id).isdigit():
            unit_id = int(unit_id)
        partner_type = (params.get('partner_type') or '').strip() or None
        partner_id = params.get('partner_id') or None
        if partner_id is not None and str(partner_id).isdigit():
            partner_id = int(partner_id)

        try:
            data = AccountingReportService.get_general_ledger(
                akun_id=akun_id,
                start_date=start_date,
                end_date=end_date,
                unit_id=unit_id,
                partner_type=partner_type,
                partner_id=partner_id,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class NeracaSaldoReportView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get(self, request):
        params = request.query_params
        today = timezone.localdate()
        start_date = (
            params.get('start_date')
            or params.get('tanggal_awal')
            or params.get('dari')
            or date(today.year, today.month, 1).isoformat()
        )
        end_date = (
            params.get('end_date')
            or params.get('tanggal_akhir')
            or params.get('sampai')
            or today.isoformat()
        )
        try:
            data = AccountingReportService.get_trial_balance(
                start_date=start_date,
                end_date=end_date,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class LabaRugiReportView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get(self, request):
        params = request.query_params
        today = timezone.localdate()
        start_date = (
            params.get('start_date')
            or params.get('tanggal_awal')
            or params.get('dari')
            or date(today.year, today.month, 1).isoformat()
        )
        end_date = (
            params.get('end_date')
            or params.get('tanggal_akhir')
            or params.get('sampai')
            or today.isoformat()
        )
        unit_id = params.get('unit_id') or None
        if unit_id is not None and str(unit_id).isdigit():
            unit_id = int(unit_id)

        try:
            data = AccountingReportService.get_profit_and_loss(
                start_date=start_date,
                end_date=end_date,
                unit_id=unit_id,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class NeracaReportView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get(self, request):
        as_of_date = (
            request.query_params.get('as_of_date')
            or request.query_params.get('tanggal')
            or timezone.localdate().isoformat()
        )
        try:
            data = AccountingReportService.get_balance_sheet(as_of_date=as_of_date)
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class AgingReportView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def get(self, request):
        partner_type = (
            request.query_params.get('partner_type') or JurnalItem.PARTNER_PELANGGAN
        ).strip()
        as_of_date = (
            request.query_params.get('as_of_date')
            or request.query_params.get('tanggal')
            or timezone.localdate().isoformat()
        )
        try:
            data = AccountingReportService.get_partner_aging(
                partner_type=partner_type,
                as_of_date=as_of_date,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class DepreciationPostView(APIView):
    permission_classes = [IsAuthenticated, IsAccountingPermission]

    def post(self, request):
        today = timezone.localdate()
        tahun = request.data.get('tahun') or today.year
        bulan = request.data.get('bulan') or today.month
        try:
            jurnal = DepreciationPostingService.post_monthly_depreciation(
                tahun=tahun,
                bulan=bulan,
                user=request.user,
            )
        except DjangoValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': f'Jurnal penyusutan periode {int(tahun)}-{int(bulan):02d} berhasil diposting ({jurnal.nomor_jurnal}).',
                'jurnal': JurnalSerializer(jurnal).data,
            },
            status=status.HTTP_201_CREATED,
        )
