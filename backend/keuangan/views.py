from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS
from rest_framework.viewsets import ModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.db import transaction
from decimal import Decimal
from rest_framework.views import APIView
from django.db.models import Sum, Count, Q
from collections import defaultdict
import calendar
from django.utils import timezone
from datetime import datetime, time

from .models import (
    Akun, Transaksi, Jurnal, JurnalItem,
    Pelanggan, Pemasok,
    Faktur, FakturItem, PembayaranFaktur,
    Tagihan, TagihanItem, PembayaranTagihan,
    RekeningBank, RiwayatSaldoRekening,
    AuditLog,
    PettyCash, LaporanPenggunaan, Reimbursement, SaldoPettyCash, RiwayatSaldoPettyCash, PengajuanPenambahanSaldo,
    Kendaraan, LogPerjalanan, LaporanPerjalanan, FotoLaporanPerjalanan, LogBBM, LogMaintenance,
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription,
    Announcement, AnnouncementRead
)
from .serializers import (
    AkunSerializer, TransaksiSerializer, TransaksiInputSerializer,
    JurnalSerializer, JurnalInputSerializer,
    PelangganSerializer, PemasokSerializer,
    FakturSerializer, FakturInputSerializer,
    PembayaranFakturSerializer, PembayaranFakturInputSerializer,
    TagihanSerializer, TagihanInputSerializer,
    PembayaranTagihanSerializer, PembayaranTagihanInputSerializer,
    RekeningBankSerializer, RekeningBankInputSerializer,
    RiwayatSaldoRekeningSerializer, UpdateSaldoSerializer,
    AuditLogSerializer,
    PettyCashSerializer, PettyCashInputSerializer,
    LaporanPenggunaanSerializer, LaporanPenggunaanInputSerializer,
    ReimbursementSerializer, ReimbursementInputSerializer, SaldoPettyCashSerializer, RiwayatSaldoPettyCashSerializer,
    PengajuanPenambahanSaldoSerializer, PengajuanPenambahanSaldoInputSerializer,
    KendaraanSerializer,
    LogPerjalananSerializer, LogPerjalananInputSerializer, LaporanPerjalananSerializer, LaporanPerjalananInputSerializer, FotoLaporanPerjalananSerializer,
    LogBBMSerializer, LogBBMInputSerializer,
    LogMaintenanceSerializer, LogMaintenanceInputSerializer,
    ITBackupRecordSerializer, ITRepairRequestSerializer,
    ITCredentialNoteSerializer, ITCredentialNoteDetailSerializer,
    ITRemoteAccessSerializer, ITRemoteAccessDetailSerializer,
    ITSubscriptionSerializer,
    AnnouncementSerializer,
)
from .audit import can_view_audit


class OptionalPageNumberPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_page_size(self, request):
        if 'page' not in request.query_params and self.page_size_query_param not in request.query_params:
            return None
        if self.page_size_query_param in request.query_params:
            return super().get_page_size(request)
        return 10


class OptionalPaginationMixin:
    pagination_class = OptionalPageNumberPagination


def is_direktur_or_wadir(user):
    return user.is_authenticated and (user.role in ('direktur', 'wakil_direktur') or user.is_superuser)

def is_manajer_or_above(user):
    return user.is_authenticated and (user.role in ('manajer', 'wakil_direktur', 'direktur') or user.is_superuser)

def is_it(user):
    return user.is_authenticated and (getattr(user, 'is_it', False) or user.is_superuser)


def laporan_unit_label(user):
    if not user:
        return 'Tidak diketahui'
    if user.unit:
        return user.unit.nama
    if getattr(user, 'is_driver', False):
        return 'Driver'
    if getattr(user, 'is_it', False):
        return 'IT'
    role_labels = {
        'direktur': 'Direktur',
        'wakil_direktur': 'Wakil Direktur',
        'manajer': 'Manajer',
        'kepala_seksi': 'Kepala Seksi',
        'karyawan': 'Karyawan Tanpa Unit',
    }
    return role_labels.get(user.role, 'Tanpa Unit')


def user_display_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username


class IsManajerOrAbovePermission(BasePermission):
    def has_permission(self, request, view):
        return is_manajer_or_above(request.user)


class IsDirekturOrWadirPermission(BasePermission):
    def has_permission(self, request, view):
        return is_direktur_or_wadir(request.user)


class IsITPermission(BasePermission):
    def has_permission(self, request, view):
        return is_it(request.user)


class AnnouncementPermission(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS or getattr(view, 'action', '') in ('mark_read', 'mark_all_read', 'unread_count'):
            return request.user and request.user.is_authenticated
        return is_manajer_or_above(request.user)


class AnnouncementViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated, AnnouncementPermission]

    def get_queryset(self):
        qs = Announcement.objects.select_related('created_by').all()
        manager_access = is_manajer_or_above(self.request.user)
        manage_view = self.request.query_params.get('manage') == '1' and manager_access
        manager_object_action = manager_access and self.action in ('retrieve', 'update', 'partial_update', 'destroy')
        if not manage_view and not manager_object_action:
            now = timezone.now()
            qs = qs.filter(is_active=True, publish_at__lte=now).filter(Q(expires_at__isnull=True) | Q(expires_at__gte=now))
            role = getattr(self.request.user, 'role', '')
            qs = qs.filter(Q(audience__icontains='all') | Q(audience__icontains=role))
        search = self.request.query_params.get('search')
        unread = self.request.query_params.get('unread')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(message__icontains=search))
        if unread == '1':
            qs = qs.exclude(reads__user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        announcement = self.get_object()
        AnnouncementRead.objects.get_or_create(announcement=announcement, user=request.user)
        return Response({'message': 'Pengumuman ditandai sudah dibaca.'})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        created = 0
        for announcement in self.get_queryset():
            _, was_created = AnnouncementRead.objects.get_or_create(announcement=announcement, user=request.user)
            if was_created:
                created += 1
        return Response({'message': f'{created} pengumuman ditandai sudah dibaca.'})

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = self.get_queryset().exclude(reads__user=request.user).count()
        return Response({'unread': count})


class AuditLogViewSet(OptionalPaginationMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not can_view_audit(self.request.user):
            return AuditLog.objects.none()

        qs = AuditLog.objects.select_related('user').all()
        action_name = self.request.query_params.get('action')
        entity = self.request.query_params.get('entity')
        user_id = self.request.query_params.get('user')
        search = self.request.query_params.get('search')
        dari = self.request.query_params.get('dari')
        sampai = self.request.query_params.get('sampai')
        limit = self.request.query_params.get('limit')

        if action_name:
            qs = qs.filter(action=action_name)
        if entity:
            qs = qs.filter(entity_type=entity)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if search:
            qs = qs.filter(
                Q(description__icontains=search)
                | Q(user__username__icontains=search)
                | Q(entity_type__icontains=search)
                | Q(entity_display__icontains=search)
            )
        if dari:
            qs = qs.filter(created_at__date__gte=dari)
        if sampai:
            qs = qs.filter(created_at__date__lte=sampai)
        if limit and str(limit).isdigit():
            qs = qs[:min(int(limit), 100)]
        return qs

    def list(self, request, *args, **kwargs):
        if not can_view_audit(request.user):
            return Response({'error': 'Akses audit log ditolak.'}, status=403)
        return super().list(request, *args, **kwargs)


# ══════════════════════════════════════════════════════════════
# AKUN
# ══════════════════════════════════════════════════════════════

class AkunViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Akun.objects.filter(is_active=True)
    serializer_class   = AkunSerializer
    permission_classes = [IsManajerOrAbovePermission]


# ══════════════════════════════════════════════════════════════
# PELANGGAN & PEMASOK
# ══════════════════════════════════════════════════════════════

class PelangganViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Pelanggan.objects.all()
    serializer_class   = PelangganSerializer
    permission_classes = [IsManajerOrAbovePermission]

    def get_queryset(self):
        qs     = super().get_queryset()
        search = self.request.query_params.get('search')
        tipe   = self.request.query_params.get('tipe')
        if search: qs = qs.filter(nama__icontains=search) | qs.filter(kode__icontains=search)
        if tipe:   qs = qs.filter(tipe=tipe)
        return qs


class PemasokViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Pemasok.objects.all()
    serializer_class   = PemasokSerializer
    permission_classes = [IsManajerOrAbovePermission]

    def get_queryset(self):
        qs     = super().get_queryset()
        search = self.request.query_params.get('search')
        tipe   = self.request.query_params.get('tipe')
        if search: qs = qs.filter(nama__icontains=search) | qs.filter(kode__icontains=search)
        if tipe:   qs = qs.filter(tipe=tipe)
        return qs


# ══════════════════════════════════════════════════════════════
# JURNAL
# ══════════════════════════════════════════════════════════════

class JurnalViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Jurnal.objects.prefetch_related('items__akun').select_related('created_by').all()
    permission_classes = [IsManajerOrAbovePermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return JurnalInputSerializer
        return JurnalSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='posting')
    def posting(self, request, pk=None):
        jurnal = self.get_object()
        if not jurnal.is_balanced:
            return Response({'error': f'Jurnal tidak seimbang. Debit: {jurnal.total_debit}, Kredit: {jurnal.total_kredit}'}, status=status.HTTP_400_BAD_REQUEST)
        jurnal.status = 'posted'
        jurnal.save()
        return Response({'message': 'Jurnal berhasil diposting.'})

    @action(detail=True, methods=['post'], url_path='unpost')
    def unpost(self, request, pk=None):
        jurnal = self.get_object()
        jurnal.status = 'draft'
        jurnal.save()
        return Response({'message': 'Jurnal dikembalikan ke draft.'})


# ══════════════════════════════════════════════════════════════
# TRANSAKSI
# ══════════════════════════════════════════════════════════════

class TransaksiViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Transaksi.objects.select_related('akun', 'created_by').all()
    permission_classes = [IsManajerOrAbovePermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TransaksiInputSerializer
        return TransaksiSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs     = super().get_queryset()
        dari   = self.request.query_params.get('dari')
        sampai = self.request.query_params.get('sampai')
        if dari:   qs = qs.filter(tanggal__gte=dari)
        if sampai: qs = qs.filter(tanggal__lte=sampai)
        return qs

    @action(detail=False, methods=['get'], url_path='laporan-arus-kas')
    def laporan_arus_kas(self, request):
        tanggal_dari   = request.query_params.get('dari')
        tanggal_sampai = request.query_params.get('sampai')

        if not tanggal_dari or not tanggal_sampai:
            return Response({'error': 'Parameter dari dan sampai wajib diisi'}, status=status.HTTP_400_BAD_REQUEST)

        qs = Transaksi.objects.filter(tanggal__gte=tanggal_dari, tanggal__lte=tanggal_sampai)

        def get_total(queryset, jenis):
            return queryset.filter(jenis=jenis).aggregate(total=Coalesce(Sum('jumlah'), Decimal('0')))['total']

        def get_total_sub(queryset, sub_kategori):
            masuk  = queryset.filter(sub_kategori=sub_kategori, jenis='masuk').aggregate(total=Coalesce(Sum('jumlah'), Decimal('0')))['total']
            keluar = queryset.filter(sub_kategori=sub_kategori, jenis='keluar').aggregate(total=Coalesce(Sum('jumlah'), Decimal('0')))['total']
            return masuk, keluar

        qs_sebelum = Transaksi.objects.filter(tanggal__lt=tanggal_dari)
        kas_awal   = get_total(qs_sebelum, 'masuk') - get_total(qs_sebelum, 'keluar')

        qs_operasi = qs.filter(kategori_arus='operasi')
        tm_pelanggan_masuk, tm_pelanggan_keluar = get_total_sub(qs_operasi, 'tagihan_muka_pelanggan')
        kas_operasi_masuk, kas_operasi_keluar   = get_total_sub(qs_operasi, 'kas_masuk_operasi')
        tm_pemasok_masuk, tm_pemasok_keluar     = get_total_sub(qs_operasi, 'tagihan_muka_pemasok')
        kas_bayar_masuk, kas_bayar_keluar       = get_total_sub(qs_operasi, 'kas_keluar_operasi')
        total_operasi_masuk  = tm_pelanggan_masuk + kas_operasi_masuk + tm_pemasok_masuk + kas_bayar_masuk
        total_operasi_keluar = tm_pelanggan_keluar + kas_operasi_keluar + tm_pemasok_keluar + kas_bayar_keluar
        total_operasi        = total_operasi_masuk - total_operasi_keluar

        qs_investasi    = qs.filter(kategori_arus='investasi')
        inv_masuk       = get_total(qs_investasi, 'masuk')
        inv_keluar      = get_total(qs_investasi, 'keluar')
        total_investasi = inv_masuk - inv_keluar

        qs_keuangan    = qs.filter(kategori_arus='keuangan')
        keu_masuk      = get_total(qs_keuangan, 'masuk')
        keu_keluar     = get_total(qs_keuangan, 'keluar')
        total_keuangan = keu_masuk - keu_keluar

        qs_tidak       = qs.filter(kategori_arus='tidak_diklasifikasi')
        tidak_per_akun = []
        akun_ids       = qs_tidak.values_list('akun_id', flat=True).distinct()
        for akun_id in akun_ids:
            akun_obj = Akun.objects.get(id=akun_id)
            qs_akun  = qs_tidak.filter(akun_id=akun_id)
            a_masuk  = get_total(qs_akun, 'masuk')
            a_keluar = get_total(qs_akun, 'keluar')
            tidak_per_akun.append({'kode_akun': akun_obj.kode_akun, 'nama_akun': akun_obj.nama_akun, 'kas_masuk': a_masuk, 'kas_keluar': a_keluar, 'total': a_masuk - a_keluar})

        total_tidak_masuk  = get_total(qs_tidak, 'masuk')
        total_tidak_keluar = get_total(qs_tidak, 'keluar')
        total_tidak        = total_tidak_masuk - total_tidak_keluar

        kas_akhir_total    = kas_awal + total_operasi + total_investasi + total_keuangan + total_tidak
        akun_kas           = Akun.objects.filter(is_kas_setara=True)
        kas_akhir_per_akun = []
        for akun in akun_kas:
            qs_akun  = qs.filter(akun=akun)
            a_masuk  = get_total(qs_akun, 'masuk')
            a_keluar = get_total(qs_akun, 'keluar')
            kas_akhir_per_akun.append({'kode_akun': akun.kode_akun, 'nama_akun': akun.nama_akun, 'total': a_masuk - a_keluar})

        return Response({
            'periode': {'dari': tanggal_dari, 'sampai': tanggal_sampai},
            'kas_awal': kas_awal,
            'operasi': {
                'tagihan_muka_pelanggan': {'masuk': tm_pelanggan_masuk, 'keluar': tm_pelanggan_keluar},
                'kas_masuk_operasi': {'masuk': kas_operasi_masuk, 'keluar': kas_operasi_keluar},
                'tagihan_muka_pemasok': {'masuk': tm_pemasok_masuk, 'keluar': tm_pemasok_keluar},
                'kas_keluar_operasi': {'masuk': kas_bayar_masuk, 'keluar': kas_bayar_keluar},
                'total_masuk': total_operasi_masuk, 'total_keluar': total_operasi_keluar, 'total': total_operasi,
            },
            'investasi': {'kas_masuk': inv_masuk, 'kas_keluar': inv_keluar, 'total': total_investasi},
            'keuangan': {'kas_masuk': keu_masuk, 'kas_keluar': keu_keluar, 'total': total_keuangan},
            'tidak_diklasifikasi': {'per_akun': tidak_per_akun, 'total_masuk': total_tidak_masuk, 'total_keluar': total_tidak_keluar, 'total': total_tidak},
            'kas_akhir': {'per_akun': kas_akhir_per_akun, 'total': kas_akhir_total},
        })


# ══════════════════════════════════════════════════════════════
# FAKTUR
# ══════════════════════════════════════════════════════════════

class FakturViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Faktur.objects.select_related('pelanggan', 'created_by').prefetch_related('items', 'pembayaran__akun').all()
    permission_classes = [IsManajerOrAbovePermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return FakturInputSerializer
        return FakturSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs        = super().get_queryset()
        pelanggan = self.request.query_params.get('pelanggan')
        st        = self.request.query_params.get('status')
        dari      = self.request.query_params.get('dari')
        sampai    = self.request.query_params.get('sampai')
        if pelanggan: qs = qs.filter(pelanggan_id=pelanggan)
        if st:        qs = qs.filter(status=st)
        if dari:      qs = qs.filter(tanggal__gte=dari)
        if sampai:    qs = qs.filter(tanggal__lte=sampai)
        return qs

    @action(detail=True, methods=['post'], url_path='bayar')
    def bayar(self, request, pk=None):
        faktur = self.get_object()
        if faktur.status in ['lunas', 'batal']:
            return Response({'error': 'Faktur sudah lunas atau dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PembayaranFakturInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        jumlah = serializer.validated_data['jumlah']
        if jumlah > faktur.sisa_tagihan:
            return Response({'error': f'Jumlah bayar melebihi sisa tagihan ({faktur.sisa_tagihan}).'}, status=status.HTTP_400_BAD_REQUEST)
        pembayaran = PembayaranFaktur.objects.create(
            faktur=faktur, created_by=request.user,
            tanggal=serializer.validated_data['tanggal'],
            jumlah=jumlah, metode=serializer.validated_data['metode'],
            keterangan=serializer.validated_data.get('keterangan', ''),
            akun=serializer.validated_data['akun'],
        )
        faktur.total_dibayar += jumlah
        faktur.status = 'lunas' if faktur.total_dibayar >= faktur.total_tagihan else 'sebagian'
        faktur.save()
        return Response(PembayaranFakturSerializer(pembayaran).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='kirim')
    def kirim(self, request, pk=None):
        faktur = self.get_object()
        if faktur.status != 'draft':
            return Response({'error': 'Hanya faktur draft yang bisa dikirim.'}, status=status.HTTP_400_BAD_REQUEST)
        faktur.status = 'dikirim'
        faktur.save()
        return Response({'message': 'Faktur berhasil dikirim.'})

    @action(detail=True, methods=['post'], url_path='batal')
    def batal(self, request, pk=None):
        faktur = self.get_object()
        if faktur.status == 'lunas':
            return Response({'error': 'Faktur yang sudah lunas tidak bisa dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        faktur.status = 'batal'
        faktur.save()
        return Response({'message': 'Faktur berhasil dibatalkan.'})


# ══════════════════════════════════════════════════════════════
# TAGIHAN
# ══════════════════════════════════════════════════════════════

class TagihanViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Tagihan.objects.select_related('pemasok', 'created_by').prefetch_related('items', 'pembayaran__akun').all()
    permission_classes = [IsManajerOrAbovePermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TagihanInputSerializer
        return TagihanSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs      = super().get_queryset()
        pemasok = self.request.query_params.get('pemasok')
        st      = self.request.query_params.get('status')
        dari    = self.request.query_params.get('dari')
        sampai  = self.request.query_params.get('sampai')
        if pemasok: qs = qs.filter(pemasok_id=pemasok)
        if st:      qs = qs.filter(status=st)
        if dari:    qs = qs.filter(tanggal__gte=dari)
        if sampai:  qs = qs.filter(tanggal__lte=sampai)
        return qs

    @action(detail=True, methods=['post'], url_path='terima')
    def terima(self, request, pk=None):
        tagihan = self.get_object()
        if tagihan.status != 'draft':
            return Response({'error': 'Hanya tagihan draft yang bisa diterima.'}, status=status.HTTP_400_BAD_REQUEST)
        tagihan.status = 'diterima'
        tagihan.save()
        return Response({'message': 'Tagihan berhasil diterima.'})

    @action(detail=True, methods=['post'], url_path='bayar')
    def bayar(self, request, pk=None):
        tagihan = self.get_object()
        if tagihan.status in ['lunas', 'batal']:
            return Response({'error': 'Tagihan sudah lunas atau dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PembayaranTagihanInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        jumlah = serializer.validated_data['jumlah']
        if jumlah > tagihan.sisa_tagihan:
            return Response({'error': f'Jumlah bayar melebihi sisa tagihan ({tagihan.sisa_tagihan}).'}, status=status.HTTP_400_BAD_REQUEST)
        pembayaran = PembayaranTagihan.objects.create(
            tagihan=tagihan, created_by=request.user,
            tanggal=serializer.validated_data['tanggal'],
            jumlah=jumlah, metode=serializer.validated_data['metode'],
            keterangan=serializer.validated_data.get('keterangan', ''),
            akun=serializer.validated_data['akun'],
        )
        tagihan.total_dibayar += jumlah
        tagihan.status = 'lunas' if tagihan.total_dibayar >= tagihan.total_tagihan else 'sebagian'
        tagihan.save()
        return Response(PembayaranTagihanSerializer(pembayaran).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='batal')
    def batal(self, request, pk=None):
        tagihan = self.get_object()
        if tagihan.status == 'lunas':
            return Response({'error': 'Tagihan yang sudah lunas tidak bisa dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        tagihan.status = 'batal'
        tagihan.save()
        return Response({'message': 'Tagihan berhasil dibatalkan.'})


# ══════════════════════════════════════════════════════════════
# REKENING BANK
# ══════════════════════════════════════════════════════════════

class RekeningBankViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = RekeningBank.objects.prefetch_related('riwayat__updated_by').select_related('updated_by').all()
    permission_classes = [IsManajerOrAbovePermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RekeningBankInputSerializer
        return RekeningBankSerializer

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def get_queryset(self):
        qs   = super().get_queryset()
        bank = self.request.query_params.get('bank')
        if bank: qs = qs.filter(bank=bank)
        return qs

    @action(detail=True, methods=['post'], url_path='update-saldo')
    def update_saldo(self, request, pk=None):
        rekening   = self.get_object()
        serializer = UpdateSaldoSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        saldo_baru = serializer.validated_data['saldo_baru']
        keterangan = serializer.validated_data.get('keterangan', '')
        with transaction.atomic():
            saldo_sebelum      = rekening.saldo
            selisih            = saldo_baru - saldo_sebelum
            rekening.saldo     = saldo_baru
            rekening.updated_by = request.user
            rekening.save()
            RiwayatSaldoRekening.objects.create(
                rekening=rekening, saldo_sebelum=saldo_sebelum,
                saldo_sesudah=saldo_baru, selisih=selisih,
                keterangan=keterangan, updated_by=request.user,
            )
        return Response(RekeningBankSerializer(rekening, context={'request': request}).data)


# ══════════════════════════════════════════════════════════════
# PETTY CASH
# ══════════════════════════════════════════════════════════════

class PettyCashViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return PettyCashInputSerializer
        return PettyCashSerializer

    def get_queryset(self):
        qs = PettyCash.objects.select_related('created_by', 'disetujui_oleh', 'dicairkan_oleh').prefetch_related('laporan').all()
        
        # Hanya manajer ke atas yang bisa lihat semua, selain itu hanya milik sendiri
        if not is_manajer_or_above(self.request.user):
            qs = qs.filter(created_by=self.request.user)
        
        st     = self.request.query_params.get('status')
        dari   = self.request.query_params.get('dari')
        sampai = self.request.query_params.get('sampai')
        if st:     qs = qs.filter(status=st)
        if dari:   qs = qs.filter(tanggal__gte=dari)
        if sampai: qs = qs.filter(tanggal__lte=sampai)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}

    # POST /{id}/approval/ — manajer/direktur setujui atau tolak
    @action(detail=True, methods=['post'], url_path='approval')
    def approval(self, request, pk=None):
        if not is_direktur_or_wadir(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat memproses approval.'}, status=403)
        instance = self.get_object()
        if instance.status != 'pending':
            return Response({'error': 'Hanya pengajuan berstatus pending yang dapat diproses.'}, status=400)
        aksi   = request.data.get('aksi')
        catatan = request.data.get('catatan_tolak', '')
        if aksi not in ('setujui', 'tolak'):
            return Response({'error': 'aksi harus setujui atau tolak.'}, status=400)
        if aksi == 'setujui':
            saldo = get_or_create_saldo()
            if saldo.saldo < instance.nominal:
                return Response({
                    'error': f'Saldo tidak mencukupi. Saldo saat ini: Rp {saldo.saldo:,.0f}, nominal pengajuan: Rp {instance.nominal:,.0f}.'
                }, status=400)
            instance.status         = 'disetujui'
            instance.disetujui_oleh = request.user
            instance.catatan_tolak  = ''
        else:
            if not catatan:
                return Response({'error': 'Catatan tolak wajib diisi.'}, status=400)
            instance.status       = 'ditolak'
            instance.catatan_tolak = catatan
        instance.save()
        return Response({'message': f'Pengajuan berhasil {"disetujui" if aksi == "setujui" else "ditolak"}.', 'status': instance.status})

    # POST /{id}/cairkan/ — manajer mencairkan dana
    @action(detail=True, methods=['post'], url_path='cairkan')
    def cairkan(self, request, pk=None):
        if not is_manajer_or_above(request.user):
            return Response({'error': 'Hanya manajer, direktur, atau wakil direktur yang dapat mencairkan dana.'}, status=403)
        instance = self.get_object()
        if instance.status != 'disetujui':
            return Response({'error': 'Hanya pengajuan berstatus disetujui yang dapat dicairkan.'}, status=400)
        instance.status        = 'dicairkan'
        instance.dicairkan_oleh = request.user
        instance.save()
        return Response({'message': 'Dana berhasil dicairkan.', 'status': instance.status})

    # POST /{id}/laporan/ — karyawan upload nota + rincian
    @action(detail=True, methods=['post'], url_path='laporan', parser_classes=[MultiPartParser, FormParser, JSONParser])
    def laporan(self, request, pk=None):
        instance = self.get_object()
        if not is_direktur_or_wadir(request.user) and instance.created_by != request.user:
            return Response({'error': 'Laporan penggunaan hanya dapat disubmit oleh pemohon.'}, status=403)
        if instance.status != 'dicairkan':
            return Response({'error': 'Laporan hanya bisa disubmit setelah dana dicairkan.'}, status=400)
        if hasattr(instance, 'laporan'):
            return Response({'error': 'Laporan sudah pernah disubmit.'}, status=400)

        serializer = LaporanPenggunaanInputSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        nominal_dicairkan = instance.nominal
        nominal_digunakan = serializer.validated_data['nominal_digunakan']
        selisih           = nominal_dicairkan - nominal_digunakan

        laporan = serializer.save(petty_cash=instance, selisih=selisih)

        if selisih > 0:
            instance.status = 'menunggu_pengembalian'
        else:
            instance.status = 'dilaporkan'
        instance.save()

        return Response(LaporanPenggunaanSerializer(laporan, context={'request': request}).data, status=status.HTTP_201_CREATED)

    # POST /{id}/konfirmasi-pengembalian/ — manajer konfirmasi uang kembali & selesaikan
    @action(detail=True, methods=['post'], url_path='konfirmasi-pengembalian')
    def konfirmasi_pengembalian(self, request, pk=None):
        if not is_manajer_or_above(request.user):
            return Response({'error': 'Hanya manajer, direktur, atau wakil direktur yang dapat mengkonfirmasi pengembalian.'}, status=403)
        instance = self.get_object()
        if instance.status not in ('menunggu_pengembalian', 'dilaporkan'):
            return Response({'error': 'Status tidak valid untuk dikonfirmasi.'}, status=400)
 
        laporan = instance.laporan
        nominal_pakai = laporan.nominal_digunakan
 
        with transaction.atomic():
            saldo         = get_or_create_saldo()
            saldo_sebelum = saldo.saldo
            saldo.saldo  -= nominal_pakai
            saldo.updated_by = request.user
            saldo.save()
 
            RiwayatSaldoPettyCash.objects.create(
                jenis='pengurangan',
                jumlah=nominal_pakai,
                saldo_sebelum=saldo_sebelum,
                saldo_sesudah=saldo.saldo,
                keterangan=f'Realisasi petty cash {instance.no_pengajuan} - {instance.keperluan[:50]}',
                created_by=request.user,
                nama_pengaju=user_display_name(instance.created_by),
                unit_pengaju=laporan_unit_label(instance.created_by),
            )
 
            laporan.pengembalian_selesai = True
            laporan.dikonfirmasi_oleh    = request.user
            laporan.save()
 
            instance.status = 'selesai'
            instance.save()
 
        return Response({'message': 'Pengembalian dikonfirmasi. Petty cash selesai.', 'status': instance.status})

    # POST /{id}/revisi/ — karyawan revisi yang ditolak
    @action(detail=True, methods=['post'], url_path='revisi', parser_classes=[MultiPartParser, FormParser, JSONParser])
    def revisi(self, request, pk=None):
        instance = self.get_object()
        if not is_direktur_or_wadir(request.user) and instance.created_by != request.user:
            return Response({'error': 'Revisi hanya dapat dilakukan oleh pemohon.'}, status=403)
        if instance.status != 'ditolak':
            return Response({'error': 'Hanya pengajuan ditolak yang bisa direvisi.'}, status=400)
        serializer = PettyCashInputSerializer(instance, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(status='pending', catatan_tolak='')
        return Response(PettyCashSerializer(instance, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        can_delete_all = is_direktur_or_wadir(request.user)
        if not can_delete_all:
            if instance.created_by != request.user:
                return Response({'error': 'Hanya pemohon yang dapat menghapus pengajuan sendiri.'}, status=403)
            if instance.status != 'pending':
                return Response({'error': 'Hanya pengajuan pending yang dapat dihapus.'}, status=400)
        return super().destroy(request, *args, **kwargs)


# ══════════════════════════════════════════════════════════════
# REIMBURSEMENT
# ══════════════════════════════════════════════════════════════

class ReimbursementViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ReimbursementInputSerializer
        return ReimbursementSerializer

    def get_queryset(self):
        qs = Reimbursement.objects.select_related('created_by', 'disetujui_oleh', 'dicairkan_oleh').all()
        
        # User biasa hanya lihat milik sendiri
        if not is_manajer_or_above(self.request.user):
            qs = qs.filter(created_by=self.request.user)
        
        st     = self.request.query_params.get('status')
        dari   = self.request.query_params.get('dari')
        sampai = self.request.query_params.get('sampai')
        if st:     qs = qs.filter(status=st)
        if dari:   qs = qs.filter(tanggal__gte=dari)
        if sampai: qs = qs.filter(tanggal__lte=sampai)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}

    # POST /{id}/approval/ — manajer/direktur setujui atau tolak
    @action(detail=True, methods=['post'], url_path='approval')
    def approval(self, request, pk=None):
        if not is_direktur_or_wadir(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat memproses approval.'}, status=403)
        instance = self.get_object()
        if instance.status != 'pending':
            return Response({'error': 'Hanya pengajuan berstatus pending yang dapat diproses.'}, status=400)
        aksi    = request.data.get('aksi')
        catatan = request.data.get('catatan_tolak', '')
        if aksi not in ('setujui', 'tolak'):
            return Response({'error': 'aksi harus setujui atau tolak.'}, status=400)
        if aksi == 'setujui':
            instance.status         = 'disetujui'
            instance.disetujui_oleh = request.user
            instance.catatan_tolak  = ''
        else:
            if not catatan:
                return Response({'error': 'Catatan tolak wajib diisi.'}, status=400)
            instance.status        = 'ditolak'
            instance.catatan_tolak = catatan
        instance.save()
        return Response({'message': f'Reimbursement berhasil {"disetujui" if aksi == "setujui" else "ditolak"}.', 'status': instance.status})

    # POST /{id}/cairkan/ — manajer mencairkan
    @action(detail=True, methods=['post'], url_path='cairkan')
    def cairkan(self, request, pk=None):
        if not is_manajer_or_above(self.request.user):        
            return Response({'error': 'Hanya manajer, direktur, atau wakil direktur yang dapat mencairkan.'}, status=403)
        instance = self.get_object()
        if instance.status != 'disetujui':
            return Response({'error': 'Hanya reimbursement berstatus disetujui yang dapat dicairkan.'}, status=400)

        # Cek saldo mencukupi
        saldo = get_or_create_saldo()
        if saldo.saldo < instance.nominal:
            return Response({
                'error': f'Saldo tidak mencukupi. Saldo saat ini: Rp {saldo.saldo:,.0f}, dibutuhkan: Rp {instance.nominal:,.0f}.'
            }, status=400)

        with transaction.atomic():
            saldo_sebelum        = saldo.saldo
            saldo.saldo         -= instance.nominal
            saldo.updated_by     = request.user
            saldo.save()

            RiwayatSaldoPettyCash.objects.create(
                jenis='pengurangan',
                jumlah=instance.nominal,
                saldo_sebelum=saldo_sebelum,
                saldo_sesudah=saldo.saldo,
                keterangan=f'Reimbursement {instance.no_reimbursement} - {instance.keperluan[:50]}',
                created_by=request.user,
                nama_pengaju=user_display_name(instance.created_by),
                unit_pengaju=laporan_unit_label(instance.created_by),
            )
 
            instance.status         = 'dicairkan'
            instance.dicairkan_oleh = request.user
            instance.save()
 
        return Response({'message': 'Reimbursement berhasil dicairkan.', 'status': instance.status})

    # POST /{id}/revisi/ — karyawan revisi yang ditolak
    @action(detail=True, methods=['post'], url_path='revisi', parser_classes=[MultiPartParser, FormParser, JSONParser])
    def revisi(self, request, pk=None):
        instance = self.get_object()
        if not is_direktur_or_wadir(request.user) and instance.created_by != request.user:
            return Response({'error': 'Revisi hanya dapat dilakukan oleh pemohon.'}, status=403)
        if instance.status != 'ditolak':
            return Response({'error': 'Hanya reimbursement ditolak yang bisa direvisi.'}, status=400)
        serializer = ReimbursementInputSerializer(instance, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(status='pending', catatan_tolak='')
        return Response(ReimbursementSerializer(instance, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        can_delete_all = is_direktur_or_wadir(request.user)
        if not can_delete_all:
            if instance.created_by != request.user:
                return Response({'error': 'Hanya pemohon yang dapat menghapus reimbursement sendiri.'}, status=403)
            if instance.status != 'pending':
                return Response({'error': 'Hanya reimbursement pending yang dapat dihapus.'}, status=400)
        return super().destroy(request, *args, **kwargs)

def get_or_create_saldo():
    saldo, _ = SaldoPettyCash.objects.get_or_create(pk=1, defaults={'saldo': 0})
    return saldo
 
 
class SaldoPettyCashViewSet(viewsets.ViewSet):
    permission_classes = [IsManajerOrAbovePermission]
 
    # GET /api/keuangan/saldo-petty-cash/
    def list(self, request):
        saldo = get_or_create_saldo()
        riwayat = RiwayatSaldoPettyCash.objects.select_related(
            'created_by', 'created_by__unit'
        ).all()[:100]
        return Response({
            'saldo': SaldoPettyCashSerializer(saldo).data,
            'riwayat': RiwayatSaldoPettyCashSerializer(riwayat, many=True).data,
        })
 
 
class PengajuanPenambahanSaldoViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsManajerOrAbovePermission]
 
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return PengajuanPenambahanSaldoInputSerializer
        return PengajuanPenambahanSaldoSerializer
 
    def get_queryset(self):
        return PengajuanPenambahanSaldo.objects.select_related(
            'created_by', 'diproses_oleh'
        ).all()
 
    def perform_create(self, serializer):
        # Manajer keuangan ke atas bisa mengajukan penambahan saldo.
        if not is_manajer_or_above(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Hanya manajer, direktur, atau wakil direktur yang dapat mengajukan penambahan saldo.')
        serializer.save(created_by=self.request.user)
 
    # POST /{id}/approval/ — direktur/wadir approve atau tolak
    @action(detail=True, methods=['post'], url_path='approval')
    def approval(self, request, pk=None):
        if not is_direktur_or_wadir(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat memproses.'}, status=403)
 
        instance = self.get_object()
        if instance.status != 'pending':
            return Response({'error': 'Hanya pengajuan pending yang dapat diproses.'}, status=400)
 
        aksi    = request.data.get('aksi')
        catatan = request.data.get('catatan_tolak', '')
 
        if aksi not in ('setujui', 'tolak'):
            return Response({'error': 'aksi harus setujui atau tolak.'}, status=400)
 
        if aksi == 'tolak':
            if not catatan:
                return Response({'error': 'Catatan tolak wajib diisi.'}, status=400)
            instance.status       = 'ditolak'
            instance.catatan_tolak = catatan
            instance.diproses_oleh = request.user
            instance.save()
            return Response({'message': 'Pengajuan ditolak.', 'status': instance.status})
 
        # Setujui — input nominal wajib
        nominal = request.data.get('nominal_diajukan')
        if not nominal:
            return Response({'error': 'Nominal penambahan wajib diisi saat menyetujui.'}, status=400)
 
        try:
            nominal = Decimal(str(nominal))
            if nominal <= 0:
                raise ValueError
        except Exception:
            return Response({'error': 'Nominal tidak valid.'}, status=400)
 
        with transaction.atomic():
            saldo         = get_or_create_saldo()
            saldo_sebelum = saldo.saldo
            saldo.saldo  += nominal
            saldo.updated_by = request.user
            saldo.save()
 
            RiwayatSaldoPettyCash.objects.create(
                jenis='penambahan',
                jumlah=nominal,
                saldo_sebelum=saldo_sebelum,
                saldo_sesudah=saldo.saldo,
                keterangan=f'Penambahan dari pengajuan {instance.no_pengajuan}',
                created_by=request.user,
                nama_pengaju=user_display_name(instance.created_by),
                unit_pengaju=laporan_unit_label(instance.created_by),
            )
 
            instance.status          = 'disetujui'
            instance.nominal_diajukan = nominal
            instance.diproses_oleh   = request.user
            instance.catatan_tolak   = ''
            instance.save()
 
        return Response({
            'message': f'Saldo berhasil ditambah sebesar Rp {nominal:,.0f}.',
            'saldo_terbaru': saldo.saldo,
            'status': instance.status,
        })

class LaporanPettyCashView(APIView):
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        if not is_manajer_or_above(request.user):
            return Response({'error': 'Akses ditolak.'}, status=403)
 
        dari   = request.query_params.get('dari')
        sampai = request.query_params.get('sampai')
 
        if not dari or not sampai:
            return Response({'error': 'Parameter dari dan sampai wajib diisi.'}, status=400)
 
        # ── Saldo awal — ambil snapshot saldo terakhir sebelum periode ──
        from datetime import date as date_type
        dari_date   = date_type.fromisoformat(dari)
        sampai_date = date_type.fromisoformat(sampai)

        dari_datetime = timezone.make_aware(
            datetime.combine(dari_date, time.min),
            timezone.get_current_timezone()
        )

        riwayat_terakhir_sebelum = RiwayatSaldoPettyCash.objects.filter(
            created_at__lt=dari_datetime
        ).order_by('-created_at').first()

        saldo_awal = riwayat_terakhir_sebelum.saldo_sesudah if riwayat_terakhir_sebelum else 0

        # ── Riwayat dalam periode ──

        sampai_datetime = timezone.make_aware(
            datetime.combine(sampai_date, time.max),
            timezone.get_current_timezone()
        )

        riwayat_periode = RiwayatSaldoPettyCash.objects.filter(
            created_at__gte=dari_datetime,
            created_at__lte=sampai_datetime,
        ).order_by('created_at')

        # print("dari_date:", dari_date)
        # print("riwayat_terakhir_sebelum:", riwayat_terakhir_sebelum)
        # print("total riwayat semua:", RiwayatSaldoPettyCash.objects.count())
        # if riwayat_terakhir_sebelum:
        #     print("saldo_sesudah:", riwayat_terakhir_sebelum.saldo_sesudah)
        #     print("created_at:", riwayat_terakhir_sebelum.created_at)

        # if riwayat_terakhir_sebelum:
        #     saldo_awal = riwayat_terakhir_sebelum.saldo_sesudah
        # else:
        #     # Hitung mundur dari saldo sekarang
        #     saldo_sekarang = get_or_create_saldo().saldo
        #     total_masuk_periode  = riwayat_periode.filter(jenis='penambahan').aggregate(t=Sum('jumlah'))['t'] or 0
        #     total_keluar_periode = riwayat_periode.filter(jenis='pengurangan').aggregate(t=Sum('jumlah'))['t'] or 0
        #     saldo_awal = saldo_sekarang - total_masuk_periode + total_keluar_periode
        
        # print("riwayat dalam periode:", list(riwayat_periode.values('jenis', 'jumlah', 'created_at')))
        # print("Semua riwayat:", list(RiwayatSaldoPettyCash.objects.values('jenis', 'jumlah', 'created_at').order_by('created_at')))

        total_penambahan  = riwayat_periode.filter(jenis='penambahan').aggregate(t=Sum('jumlah'))['t'] or 0
        total_pengurangan = riwayat_periode.filter(jenis='pengurangan').aggregate(t=Sum('jumlah'))['t'] or 0
        saldo_akhir       = saldo_awal + total_penambahan - total_pengurangan

        # ── Petty Cash (advance) dalam periode ──
        pc_qs = PettyCash.objects.filter(
            tanggal__gte=dari,
            tanggal__lte=sampai,
        ).select_related('created_by__unit', 'laporan')
 
        # ── Reimbursement dalam periode ──
        rb_qs = Reimbursement.objects.filter(
            tanggal__gte=dari,
            tanggal__lte=sampai,
        ).select_related('created_by__unit')
 
        # ── Daftar pengajuan (gabungan PC + Reimbursement) ──
        daftar_pengajuan = []
        for pc in pc_qs:
            # Ambil realisasi kalau sudah ada laporan
            nominal_realisasi = float(pc.laporan.nominal_digunakan) if hasattr(pc, 'laporan') and pc.laporan else None
            daftar_pengajuan.append({
                'no':       pc.no_pengajuan,
                'tanggal':  str(pc.tanggal),
                'jenis':    'Petty Cash',
                'pemohon':  pc.created_by.get_full_name() or pc.created_by.username if pc.created_by else '—',
                'unit':     laporan_unit_label(pc.created_by),
                'keperluan': pc.keperluan,
                'nominal':  float(pc.nominal),
                'nominal_realisasi': nominal_realisasi,
                # Tampilkan realisasi sebagai nominal efektif kalau sudah ada
                'nominal_efektif': nominal_realisasi if nominal_realisasi is not None else float(pc.nominal),
                'status':   pc.status,
            })
        for rb in rb_qs:
            daftar_pengajuan.append({
                'no':       rb.no_reimbursement,
                'tanggal':  str(rb.tanggal),
                'jenis':    'Reimbursement',
                'pemohon':  rb.created_by.get_full_name() or rb.created_by.username if rb.created_by else '—',
                'unit':     laporan_unit_label(rb.created_by),
                'keperluan': rb.keperluan,
                'nominal':  float(rb.nominal),
                'nominal_realisasi': float(rb.nominal) if rb.status == 'dicairkan' else None,
                'status':   rb.status,
            })
        daftar_pengajuan.sort(key=lambda x: x['tanggal'])
 
        # ── Total pencairan per unit ──
        per_unit = defaultdict(lambda: {'pc': 0, 'reimburse': 0, 'total': 0})
        for pc in pc_qs.filter(status__in=['dicairkan', 'dilaporkan', 'menunggu_pengembalian', 'selesai']):
            unit = laporan_unit_label(pc.created_by)
            nominal = float(pc.laporan.nominal_digunakan) if hasattr(pc, 'laporan') and pc.laporan else float(pc.nominal)
            per_unit[unit]['pc']    += nominal
            per_unit[unit]['total'] += nominal
        for rb in rb_qs.filter(status='dicairkan'):
            unit = laporan_unit_label(rb.created_by)
            per_unit[unit]['reimburse'] += float(rb.nominal)
            per_unit[unit]['total']     += float(rb.nominal)
 
        # ── Grafik per bulan (6 bulan terakhir) ──
        from datetime import date, timedelta
        today = date.today()
        grafik = []
        for i in range(5, -1, -1):
            # bulan ke-i sebelum bulan ini
            month = (today.month - i - 1) % 12 + 1
            year  = today.year + ((today.month - i - 1) // 12)
            last_day = calendar.monthrange(year, month)[1]
            bln_dari   = date(year, month, 1)
            bln_sampai = date(year, month, last_day)
            label = bln_dari.strftime('%b %y')
 
            pc_total = PettyCash.objects.filter(
                tanggal__gte=bln_dari, tanggal__lte=bln_sampai,
                status__in=['dicairkan','dilaporkan','menunggu_pengembalian','selesai']
            ).aggregate(t=Sum('nominal'))['t'] or 0
 
            rb_total = Reimbursement.objects.filter(
                tanggal__gte=bln_dari, tanggal__lte=bln_sampai,
                status='dicairkan'
            ).aggregate(t=Sum('nominal'))['t'] or 0
 
            grafik.append({
                'bulan':        label,
                'petty_cash':   float(pc_total),
                'reimbursement': float(rb_total),
                'total':        float(pc_total + rb_total),
            })
 
        # ── Rekap mutasi saldo ──
        rekap_mutasi = [{
            'waktu':      r.created_at.strftime('%d %b %Y %H:%M'),
            'jenis':      r.jenis,
            'jumlah':     float(r.jumlah),
            'saldo_sesudah': float(r.saldo_sesudah),
            'keterangan': r.keterangan,
        } for r in riwayat_periode]
 
        return Response({
            'periode':          {'dari': dari, 'sampai': sampai},
            'saldo_awal':       float(saldo_awal),
            'saldo_akhir':      float(saldo_akhir),
            'total_penambahan': float(total_penambahan),
            'total_pengurangan': float(total_pengurangan),
            'daftar_pengajuan': daftar_pengajuan,
            'per_unit':         [{'unit': k, **v} for k, v in per_unit.items()],
            'grafik':           grafik,
            'rekap_mutasi':     rekap_mutasi,
        })
    
# driver

def is_driver(user):
    return user.is_authenticated and getattr(user, 'is_driver', False)
 
def is_admin_driver(user):
    """Yang bisa lihat semua data driver dan kelola kendaraan"""
    return user.role in ('direktur', 'wakil_direktur', 'manajer') or user.is_superuser

def has_driver_access(user):
    return is_driver(user) or is_admin_driver(user)
 
 
class KendaraanViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = Kendaraan.objects.all()
    serializer_class   = KendaraanSerializer
    permission_classes = [IsAuthenticated]
 
    def get_queryset(self):
        qs = super().get_queryset()
        if not has_driver_access(self.request.user):
            return qs.none()
        # Driver hanya lihat kendaraan aktif
        if is_driver(self.request.user):
            qs = qs.filter(is_active=True)
        aktif = self.request.query_params.get('aktif')
        if aktif == '1':
            qs = qs.filter(is_active=True)
        return qs
 
    def create(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat menambah kendaraan.'}, status=403)
        return super().create(request, *args, **kwargs)
 
    def update(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat mengubah log.'}, status=403)
        return super().update(request, *args, **kwargs)
 
    def destroy(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat menghapus log.'}, status=403)
        return super().destroy(request, *args, **kwargs)
 
 
class LogPerjalananViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
 
    def get_serializer_class(self):
        if self.action == 'laporan':
            return LaporanPerjalananInputSerializer
        elif self.action == 'detail_laporan':
            return LaporanPerjalananSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return LogPerjalananInputSerializer
        return LogPerjalananSerializer
 
    def get_serializer_context(self):
        return {'request': self.request}
 
    def get_queryset(self):
        qs = LogPerjalanan.objects.select_related('driver', 'kendaraan', 'disetujui_oleh').prefetch_related('laporan').all()
        if not has_driver_access(self.request.user):
            return qs.none()
        if not is_admin_driver(self.request.user):
            qs = qs.filter(driver=self.request.user)
        # Optional filters
        kendaraan = self.request.query_params.get('kendaraan')
        driver_id = self.request.query_params.get('driver')
        status = self.request.query_params.get('status')
        dari      = self.request.query_params.get('dari')
        sampai    = self.request.query_params.get('sampai')
        if kendaraan: qs = qs.filter(kendaraan_id=kendaraan)
        if driver_id: qs = qs.filter(driver_id=driver_id)
        if status: qs = qs.filter(status=status)
        if dari:      qs = qs.filter(tanggal__gte=dari)
        if sampai:    qs = qs.filter(tanggal__lte=sampai)
        return qs
 
    def perform_create(self, serializer):
        if not has_driver_access(self.request.user):
            raise PermissionDenied('Anda tidak memiliki akses fitur driver.')
        serializer.save(driver=self.request.user)
 
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Driver hanya bisa edit milik sendiri & status pending
        if not is_admin_driver(request.user):
            if instance.driver != request.user or instance.status != 'pending':
                return Response({'error': 'Tidak dapat mengubah log ini.'}, status=403)
        return super().update(request, *args, **kwargs)
 
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Permission check:
        # - Admin: bisa delete semua status
        # - Driver: hanya bisa delete status 'pending' milik sendiri
        if is_admin_driver(request.user):
            # Admin bisa delete semua status
            pass
        else:
            # Driver/User biasa: hanya bisa delete status pending milik sendiri
            if instance.driver != request.user or instance.status != 'pending':
                return Response({'error': 'Anda hanya dapat menghapus log perjalanan status pending milik sendiri.'}, status=403)
        return super().destroy(request, *args, **kwargs)

    # POST /{id}/approval/ — manajer/direktur setujui atau tolak
    @action(detail=True, methods=['post'], url_path='approval')
    def approval(self, request, pk=None):
        if not is_direktur_or_wadir(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat memproses approval.'}, status=403)
        instance = self.get_object()
        if instance.status != 'pending':
            return Response({'error': 'Hanya laporan berstatus pending yang dapat diproses.'}, status=400)
        aksi   = request.data.get('aksi')
        catatan = request.data.get('catatan_tolak', '')
        if aksi not in ('setujui', 'tolak'):
            return Response({'error': 'aksi harus setujui atau tolak.'}, status=400)
        if aksi == 'setujui':
            instance.status         = 'disetujui'
            instance.disetujui_oleh = request.user
            instance.catatan_tolak  = ''
        else:
            if not catatan:
                return Response({'error': 'Catatan tolak wajib diisi.'}, status=400)
            instance.status       = 'ditolak'
            instance.catatan_tolak = catatan
        instance.save()
        return Response({'message': f'Laporan berhasil {"disetujui" if aksi == "setujui" else "ditolak"}.', 'status': instance.status}, status=200)

    # POST /{id}/laporan/ — driver submit laporan dengan foto
    @action(detail=True, methods=['post'], url_path='laporan')
    def laporan(self, request, pk=None):
        instance = self.get_object()
        
        # Check permission - driver hanya bisa submit laporan milik sendiri, admin bisa submit untuk semua
        if not is_admin_driver(request.user):
            if instance.driver != request.user:
                return Response({'error': 'Anda hanya dapat submit laporan log milik sendiri.'}, status=403)
        
        # Check status
        if instance.status != 'disetujui':
            return Response({'error': 'Hanya log yang sudah disetujui yang dapat dilaporkan.'}, status=400)
        
        # Check if laporan sudah pernah di-submit
        if hasattr(instance, 'laporan') and instance.laporan:
            return Response({'error': 'Laporan sudah pernah disubmit untuk log perjalanan ini.'}, status=400)
        
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': 'Data tidak valid.', 'details': serializer.errors}, status=400)
        
        try:
            # Create laporan
            laporan = serializer.save(log_perjalanan=instance)
            
            # Update km_akhir dan hitung jarak otomatis
            km_akhir = request.data.get('km_akhir')
            if km_akhir:
                try:
                    instance.km_akhir = int(float(km_akhir))
                except (ValueError, TypeError):
                    return Response({'error': 'KM Akhir harus berupa angka yang valid.'}, status=400)
                if instance.km_akhir < instance.km_awal:
                    return Response({'error': 'KM akhir tidak boleh lebih kecil dari KM awal.'}, status=400)
            
            # Update status Log Perjalanan to dilaporkan
            instance.status = 'dilaporkan'
            instance.save()
            
            return Response({
                'message': 'Laporan berhasil disubmit.',
                'data': LogPerjalananSerializer(instance, context={'request': request}).data,
                'status': instance.status
            }, status=201)
        except Exception as e:
            return Response({'error': f'Gagal menyimpan laporan: {str(e)}'}, status=400)

    # POST /{id}/selesaikan/ — tandai sebagai selesai (setelah laporan submitted)
    @action(detail=True, methods=['post'], url_path='selesaikan')
    def selesaikan(self, request, pk=None):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat menyelesaikan laporan.'}, status=403)
        instance = self.get_object()
        if instance.status != 'dilaporkan':
            return Response({'error': 'Hanya log yang sudah dilaporkan yang dapat diselesaikan.'}, status=400)
        instance.status = 'selesai'
        instance.save()
        return Response({'message': 'Laporan berhasil diselesaikan.', 'status': instance.status})
 
 
 
class LogBBMViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
 
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return LogBBMInputSerializer
        return LogBBMSerializer
 
    def get_serializer_context(self):
        return {'request': self.request}
 
    def get_queryset(self):
        qs = LogBBM.objects.select_related('driver', 'kendaraan').all()
        if not has_driver_access(self.request.user):
            return qs.none()
        if not is_admin_driver(self.request.user):
            qs = qs.filter(driver=self.request.user)
        # Optional filters
        kendaraan = self.request.query_params.get('kendaraan')
        driver_id = self.request.query_params.get('driver')
        dari      = self.request.query_params.get('dari')
        sampai    = self.request.query_params.get('sampai')
        if kendaraan: qs = qs.filter(kendaraan_id=kendaraan)
        if driver_id: qs = qs.filter(driver_id=driver_id)
        if dari:      qs = qs.filter(tanggal__gte=dari)
        if sampai:    qs = qs.filter(tanggal__lte=sampai)
        return qs
 
    def perform_create(self, serializer):
        if not has_driver_access(self.request.user):
            raise PermissionDenied('Anda tidak memiliki akses fitur driver.')
        serializer.save(driver=self.request.user)

    def update(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat mengubah log.'}, status=403)
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat menghapus log.'}, status=403)
        return super().destroy(request, *args, **kwargs)
 
 
class LogMaintenanceViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return LogMaintenanceInputSerializer
        return LogMaintenanceSerializer

    def get_queryset(self):
        qs = LogMaintenance.objects.select_related('kendaraan', 'dilaporkan_oleh').all()
        if not has_driver_access(self.request.user):
            return qs.none()
        if not is_admin_driver(self.request.user):
            qs = qs.filter(dilaporkan_oleh=self.request.user)
        kendaraan = self.request.query_params.get('kendaraan')
        dari      = self.request.query_params.get('dari')
        sampai    = self.request.query_params.get('sampai')
        if kendaraan: qs = qs.filter(kendaraan_id=kendaraan)
        if dari:      qs = qs.filter(tanggal__gte=dari)
        if sampai:    qs = qs.filter(tanggal__lte=sampai)
        return qs

    def perform_create(self, serializer):
        if not has_driver_access(self.request.user):
            raise PermissionDenied('Anda tidak memiliki akses fitur driver.')
        serializer.save(dilaporkan_oleh=self.request.user)

    def update(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat mengubah log.'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_admin_driver(request.user):
            return Response({'error': 'Hanya admin yang dapat menghapus log.'}, status=403)
        return super().destroy(request, *args, **kwargs)
 
 
# ── Rekap bulanan ──────────────────────────────────────────
class ITBaseViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsITPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ITBackupRecordViewSet(ITBaseViewSet):
    serializer_class = ITBackupRecordSerializer

    def get_queryset(self):
        qs = ITBackupRecord.objects.select_related('created_by').all()
        status_param = self.request.query_params.get('status')
        backup_type = self.request.query_params.get('backup_type')
        search = self.request.query_params.get('search')
        if status_param:
            qs = qs.filter(status=status_param)
        if backup_type:
            qs = qs.filter(backup_type=backup_type)
        if search:
            qs = qs.filter(
                Q(file_name__icontains=search)
                | Q(storage_path__icontains=search)
                | Q(notes__icontains=search)
            )
        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()
        latest = qs.order_by('-created_at').first()
        return Response({
            'total': qs.count(),
            'success': qs.filter(status__in=['success', 'verified']).count(),
            'failed': qs.filter(status='failed').count(),
            'scheduled': qs.filter(status='scheduled').count(),
            'latest': ITBackupRecordSerializer(latest).data if latest else None,
        })


class ITRepairRequestViewSet(ITBaseViewSet):
    serializer_class = ITRepairRequestSerializer

    def get_serializer_context(self):
        return {'request': self.request}

    def get_queryset(self):
        qs = ITRepairRequest.objects.select_related('created_by', 'requester_user', 'requester_user__unit').all()
        status_param = self.request.query_params.get('status')
        priority = self.request.query_params.get('priority')
        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')
        dari = self.request.query_params.get('dari')
        sampai = self.request.query_params.get('sampai')
        if status_param:
            qs = qs.filter(status=status_param)
        if priority:
            qs = qs.filter(priority=priority)
        if category:
            qs = qs.filter(category=category)
        if dari:
            qs = qs.filter(requested_at__date__gte=dari)
        if sampai:
            qs = qs.filter(requested_at__date__lte=sampai)
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(requester_name__icontains=search)
                | Q(unit__icontains=search)
                | Q(description__icontains=search)
                | Q(resolution__icontains=search)
                | Q(sparepart__icontains=search)
            )
        return qs

    def perform_update(self, serializer):
        instance = self.get_object()
        status_param = serializer.validated_data.get('status', instance.status)
        completed_at = serializer.validated_data.get('completed_at', instance.completed_at)
        if status_param == 'done' and not completed_at:
            serializer.save(completed_at=timezone.now())
        elif status_param != 'done':
            serializer.save(completed_at=None)
        else:
            serializer.save()

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'open': qs.filter(status='open').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'urgent': qs.exclude(status__in=['done', 'cancelled']).filter(priority='urgent').count(),
            'done': qs.filter(status='done').count(),
        })

    @action(detail=True, methods=['post'], url_path='selesai')
    def selesai(self, request, pk=None):
        instance = self.get_object()
        completed_at = request.data.get('completed_at') or timezone.now()
        serializer = self.get_serializer(instance, data={
            'status': 'done',
            'completed_at': completed_at,
            'resolution': request.data.get('resolution', instance.resolution),
            'sparepart': request.data.get('sparepart', instance.sparepart),
            'cost': request.data.get('cost', instance.cost),
        }, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'message': 'Catatan perbaikan ditandai selesai.', 'data': serializer.data})


class ITCredentialNoteViewSet(ITBaseViewSet):
    def get_serializer_class(self):
        if self.action in ['retrieve', 'reveal']:
            return ITCredentialNoteDetailSerializer
        return ITCredentialNoteSerializer

    def get_queryset(self):
        qs = ITCredentialNote.objects.select_related('created_by').all()
        category = self.request.query_params.get('category')
        active = self.request.query_params.get('active')
        search = self.request.query_params.get('search')
        if category:
            qs = qs.filter(category=category)
        if active in ('true', 'false'):
            qs = qs.filter(is_active=(active == 'true'))
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(url__icontains=search)
                | Q(username__icontains=search)
                | Q(owner__icontains=search)
                | Q(notes__icontains=search)
            )
        return qs

    @action(detail=True, methods=['get'], url_path='reveal')
    def reveal(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)


class ITRemoteAccessViewSet(ITBaseViewSet):
    def get_serializer_class(self):
        if self.action in ['retrieve', 'reveal']:
            return ITRemoteAccessDetailSerializer
        return ITRemoteAccessSerializer

    def get_queryset(self):
        qs = ITRemoteAccess.objects.select_related('created_by').all()
        status_param = self.request.query_params.get('status')
        search = self.request.query_params.get('search')
        if status_param:
            qs = qs.filter(status=status_param)
        if search:
            qs = qs.filter(
                Q(device_name__icontains=search)
                | Q(user_owner__icontains=search)
                | Q(unit__icontains=search)
                | Q(location__icontains=search)
                | Q(anydesk_id__icontains=search)
                | Q(rustdesk_id__icontains=search)
                | Q(notes__icontains=search)
            )
        return qs

    @action(detail=True, methods=['get'], url_path='reveal')
    def reveal(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)


class ITSubscriptionViewSet(ITBaseViewSet):
    serializer_class = ITSubscriptionSerializer

    def get_queryset(self):
        qs = ITSubscription.objects.select_related('created_by').all()
        status_param = self.request.query_params.get('status')
        service_type = self.request.query_params.get('service_type')
        search = self.request.query_params.get('search')
        if status_param:
            qs = qs.filter(status=status_param)
        if service_type:
            qs = qs.filter(service_type=service_type)
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(vendor__icontains=search)
                | Q(account_ref__icontains=search)
                | Q(pic__icontains=search)
                | Q(url__icontains=search)
                | Q(notes__icontains=search)
            )
        return qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()
        today = timezone.localdate()
        soon = today + timezone.timedelta(days=30)
        return Response({
            'total': qs.count(),
            'active': qs.filter(status='active').count(),
            'expiring': qs.exclude(status__in=['expired', 'cancelled']).filter(end_date__gte=today, end_date__lte=soon).count(),
            'expired': qs.filter(Q(status='expired') | Q(end_date__lt=today)).count(),
            'yearly_cost': float(qs.exclude(status='cancelled').aggregate(t=Sum('cost'))['t'] or 0),
        })


class RekapDriverView(APIView):
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        dari   = request.query_params.get('dari')
        sampai = request.query_params.get('sampai')
        driver_id = request.query_params.get('driver')
 
        if not dari or not sampai:
            return Response({'error': 'Parameter dari dan sampai wajib diisi.'}, status=400)
 
        # Driver hanya bisa lihat rekap diri sendiri
        if not is_admin_driver(request.user):
            driver_id = request.user.id
 
        # Filter perjalanan
        qs_perjalanan = LogPerjalanan.objects.filter(tanggal__gte=dari, tanggal__lte=sampai)
        qs_bbm        = LogBBM.objects.filter(tanggal__gte=dari, tanggal__lte=sampai)
        qs_maintenance = LogMaintenance.objects.filter(tanggal__gte=dari, tanggal__lte=sampai)
 
        if driver_id:
            qs_perjalanan  = qs_perjalanan.filter(driver_id=driver_id)
            qs_bbm         = qs_bbm.filter(driver_id=driver_id)
 
        total_jarak  = qs_perjalanan.aggregate(t=Sum('jarak_km'))['t'] or 0
        total_bbm    = qs_bbm.aggregate(t=Sum('total_biaya'))['t'] or 0
        total_maint  = qs_maintenance.aggregate(t=Sum('biaya'))['t'] or 0
 
        # Per kendaraan
        from django.db.models import Count
        per_kendaraan = []
        kendaraan_ids = qs_perjalanan.values_list('kendaraan_id', flat=True).distinct()
        for kid in kendaraan_ids:
            k = Kendaraan.objects.get(id=kid)
            qs_k = qs_perjalanan.filter(kendaraan_id=kid)
            jarak = qs_k.aggregate(t=Sum('jarak_km'))['t'] or 0
            trip  = qs_k.count()
            per_kendaraan.append({
                'kendaraan': str(k),
                'plat_nomor': k.plat_nomor,
                'jenis': k.get_jenis_display(),
                'total_trip': trip,
                'total_jarak_km': jarak,
            })
 
        return Response({
            'periode':       {'dari': dari, 'sampai': sampai},
            'total_trip':    qs_perjalanan.count(),
            'total_jarak_km': total_jarak,
            'total_biaya_bbm': float(total_bbm),
            'total_biaya_maintenance': float(total_maint),
            'per_kendaraan': per_kendaraan,
            'log_perjalanan': LogPerjalananSerializer(qs_perjalanan.select_related('driver','kendaraan'), many=True, context={'request': request}).data,
            'log_bbm':        LogBBMSerializer(qs_bbm.select_related('driver','kendaraan'), many=True, context={'request': request}).data,
            'log_maintenance': LogMaintenanceSerializer(qs_maintenance.select_related('kendaraan','dilaporkan_oleh'), many=True).data,
        })
