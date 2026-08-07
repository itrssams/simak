from rest_framework import viewsets, status
from rest_framework.decorators import action, permission_classes, api_view
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny, SAFE_METHODS
from rest_framework.viewsets import ModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.db import connection, transaction
from django.db.models.deletion import ProtectedError
from decimal import Decimal, InvalidOperation
from rest_framework.views import APIView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from django.db.models import Sum, Count, Q, F
from collections import defaultdict
import calendar
import re
from django.utils import timezone
from datetime import datetime, time, timedelta
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from fpdf import FPDF
import os
from django.conf import settings

from .models import (
    Akun, Transaksi, Jurnal, JurnalItem,
    Pelanggan, Pemasok,
    Faktur, FakturItem, PembayaranFaktur, AlokasiDana, AlokasiDanaPemakaian,
    UtangSupplier, PembayaranUtang, DepositVendor,
    Tagihan, TagihanItem, PembayaranTagihan,
    RekeningBank, RiwayatSaldoRekening,
    AuditLog,
    PettyCash, LaporanPenggunaan, Reimbursement, SaldoPettyCash, RiwayatSaldoPettyCash, PengajuanPenambahanSaldo,
    Kendaraan, LogPerjalanan, LaporanPerjalanan, FotoLaporanPerjalanan, LogBBM, LogMaintenance,
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription,
    Announcement, AnnouncementRead,
    InventoryOption, InventoryAsset,
    LogistikBarang, LogistikPembelian, LogistikBatch, LogistikMutasi, LogistikPermintaan, LogistikOpname
)
from .serializers import (
    AkunSerializer, TransaksiSerializer, TransaksiInputSerializer,
    JurnalSerializer, JurnalInputSerializer,
    PelangganSerializer, PemasokSerializer,
    FakturSerializer, FakturInputSerializer,
    PembayaranFakturSerializer, PembayaranFakturInputSerializer,
    AlokasiDanaSerializer,
    UtangSupplierSerializer, PembayaranUtangSerializer, PembayaranUtangInputSerializer, DepositVendorSerializer,
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
    InventoryOptionSerializer, InventoryAssetSerializer,
    LogistikBarangSerializer, LogistikPembelianSerializer, LogistikBatchSerializer,
    LogistikMutasiSerializer, LogistikPermintaanSerializer, LogistikOpnameSerializer,
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

def is_kepala_seksi_or_above(user):
    return user.is_authenticated and (user.role in ('kepala_seksi', 'manajer', 'wakil_direktur', 'direktur') or user.is_superuser)

def is_it(user):
    return user.is_authenticated and (getattr(user, 'is_it', False) or user.is_superuser)

def is_keuangan(user):
    return user.is_authenticated and (getattr(user, 'is_keuangan', False) or user.is_superuser)


def is_logistik(user):
    return user.is_authenticated and (getattr(user, 'is_logistik', False) or user.is_superuser or is_manajer_or_above(user))


def can_access_catatan_utang_obat_bhp(user):
    return user.is_authenticated and (
        user.is_superuser
        or getattr(user, 'akses_catatan_utang', False)
    )


def is_petty_cash_cashier(user):
    return user.is_authenticated and (getattr(user, 'is_petty_cash_cashier', False) or user.is_superuser)


def is_manajer_keuangan(user):
    return user.is_authenticated and (
        user.is_superuser
        or (getattr(user, 'is_keuangan', False) and user.role in ('manajer', 'wakil_direktur', 'direktur'))
    )


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

def generate_nomor_faktur(tanggal):
    from django.db import connection

    prefix = f"{tanggal:%y}"
    max_urut = 0

    # Cek invoice Django
    last_faktur = (
        Faktur.objects
        .filter(nomor_faktur__startswith=prefix)
        .order_by('-nomor_faktur')
        .values_list('nomor_faktur', flat=True)
        .first()
    )

    if last_faktur and str(last_faktur)[2:6].isdigit():
        max_urut = max(max_urut, int(str(last_faktur)[2:6]))

    # Cek invoice lama SIMRS
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT MAX(CAST(SUBSTR(no, 3, 4) AS UNSIGNED))
                FROM rssams.invoice
                WHERE LEFT(no, 2) = %s
            """, [prefix])

            row = cursor.fetchone()

            if row and row[0]:
                max_urut = max(max_urut, int(row[0]))
    except Exception:
        pass

    next_number = max_urut + 1
    nomor = f"{prefix}{next_number:04d}"

    while Faktur.objects.filter(nomor_faktur=nomor).exists():
        next_number += 1
        nomor = f"{prefix}{next_number:04d}"

    return nomor


class IsManajerOrAbovePermission(BasePermission):
    def has_permission(self, request, view):
        return is_manajer_or_above(request.user)


class IsDirekturOrWadirPermission(BasePermission):
    def has_permission(self, request, view):
        return is_direktur_or_wadir(request.user)


class IsInventoryPermission(BasePermission):
    def has_permission(self, request, view):
        return is_kepala_seksi_or_above(request.user)


class IsLogistikPermission(BasePermission):
    def has_permission(self, request, view):
        return is_logistik(request.user)


class IsITPermission(BasePermission):
    def has_permission(self, request, view):
        return is_it(request.user)


class IsKeuanganPermission(BasePermission):
    def has_permission(self, request, view):
        return is_keuangan(request.user)


class IsCatatanUtangObatBhpPermission(BasePermission):
    def has_permission(self, request, view):
        return can_access_catatan_utang_obat_bhp(request.user)


class IsLogistikOrCatatanUtangPermission(BasePermission):
    def has_permission(self, request, view):
        return is_logistik(request.user) or can_access_catatan_utang_obat_bhp(request.user)


class IsPettyCashSaldoPermission(BasePermission):
    def has_permission(self, request, view):
        return is_manajer_or_above(request.user) or is_petty_cash_cashier(request.user)


class IsKeuanganOrManajerPermission(BasePermission):
    def has_permission(self, request, view):
        return is_keuangan(request.user) or is_manajer_or_above(request.user)


class AnnouncementPermission(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS or getattr(view, 'action', '') in ('mark_read', 'mark_all_read', 'unread_count'):
            return request.user and request.user.is_authenticated
        return is_manajer_or_above(request.user)


def _normalize_pembiayaan_name(value):
    return ' '.join(str(value or '').strip().lower().split())


def _normalize_logistik_name(value):
    text = str(value or '').strip()
    if not text:
        return ''
    return ' '.join(text.split())


class PembiayaanListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get list of pembiayaan (insurance providers) from rssams.pbiaya"""
        from django.db import connection
        include_inactive = str(request.query_params.get('include_inactive') or '').lower() in ('1', 'true', 'yes')
        search = (request.query_params.get('search') or '').strip()
        try:
            with connection.cursor() as cursor:
                where = []
                values = []
                if not include_inactive:
                    where.append("status <> 0")
                if search:
                    where.append("(pembiayaan LIKE %s OR CAST(id_pembiayaan AS CHAR) LIKE %s OR alamat LIKE %s)")
                    needle = f"%{search}%"
                    values.extend([needle, needle, needle])
                where_sql = f"WHERE {' AND '.join(where)}" if where else ""
                cursor.execute(f"""
                    SELECT id_pembiayaan, pembiayaan as nama, alamat, status
                    FROM rssams.pbiaya
                    {where_sql}
                    ORDER BY status DESC, pembiayaan
                """, values)
                columns = [col[0] for col in cursor.description]
                pembiayaan = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return Response({
                'count': len(pembiayaan),
                'results': pembiayaan
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        if not is_keuangan(request.user):
            raise PermissionDenied('Hanya user keuangan yang dapat menambah pembiayaan.')

        nama = (request.data.get('nama') or request.data.get('pembiayaan') or '').strip()
        if not nama:
            return Response({'nama': 'Nama pembiayaan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        alamat = (request.data.get('alamat') or '').strip()
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT id_pembiayaan, pembiayaan
                        FROM rssams.pbiaya
                    """)
                    existing = next(
                        (
                            row for row in cursor.fetchall()
                            if _normalize_pembiayaan_name(row[1]) == _normalize_pembiayaan_name(nama)
                        ),
                        None,
                    )
                    if existing:
                        return Response({
                            'error': f"Pembiayaan '{existing[1]}' sudah ada dengan ID {existing[0]}. Pilih dari daftar pembiayaan.",
                            'id_pembiayaan': existing[0],
                            'nama': existing[1],
                        }, status=status.HTTP_400_BAD_REQUEST)

                    cursor.execute("""
                        INSERT INTO rssams.pbiaya
                            (pembiayaan, ket, status, apt, r_inap, kode, persen_apt, alamat)
                        VALUES
                            (%s, %s, 1, 'Y', 'Y', 1, 0.00, %s)
                    """, [nama, nama, alamat])
                    cursor.execute("SELECT LAST_INSERT_ID()")
                    id_pembiayaan = int(cursor.fetchone()[0])

            return Response({
                'id_pembiayaan': id_pembiayaan,
                'nama': nama,
                'alamat': alamat,
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PembiayaanDetailView(APIView):
    permission_classes = [IsKeuanganPermission]

    def patch(self, request, id_pembiayaan):
        nama = (request.data.get('nama') or request.data.get('pembiayaan') or '').strip()
        alamat = (request.data.get('alamat') or '').strip()
        status_value = request.data.get('status')

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT id_pembiayaan, pembiayaan, alamat, status
                        FROM rssams.pbiaya
                        WHERE id_pembiayaan = %s
                        LIMIT 1
                    """, [id_pembiayaan])
                    current = cursor.fetchone()
                    if not current:
                        return Response({'error': 'Pembiayaan tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)

                    next_nama = nama or current[1]
                    if not next_nama:
                        return Response({'nama': 'Nama pembiayaan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

                    cursor.execute("""
                        SELECT id_pembiayaan, pembiayaan
                        FROM rssams.pbiaya
                        WHERE id_pembiayaan <> %s
                    """, [id_pembiayaan])
                    duplicate = next(
                        (
                            row for row in cursor.fetchall()
                            if _normalize_pembiayaan_name(row[1]) == _normalize_pembiayaan_name(next_nama)
                        ),
                        None,
                    )
                    if duplicate:
                        return Response({
                            'error': f"Pembiayaan '{duplicate[1]}' sudah ada dengan ID {duplicate[0]}.",
                        }, status=status.HTTP_400_BAD_REQUEST)

                    updates = ["pembiayaan = %s", "ket = %s", "alamat = %s"]
                    values = [next_nama, next_nama, alamat]
                    next_status = int(current[3] or 0)
                    if status_value is not None:
                        next_status = 1 if str(status_value) not in ('0', 'false', 'False') else 0
                        updates.append("status = %s")
                        values.append(next_status)
                    values.append(id_pembiayaan)
                    cursor.execute(f"""
                        UPDATE rssams.pbiaya
                        SET {', '.join(updates)}
                        WHERE id_pembiayaan = %s
                    """, values)

            return Response({
                'id_pembiayaan': int(id_pembiayaan),
                'nama': next_nama,
                'alamat': alamat,
                'status': next_status,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, id_pembiayaan):
        try:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE rssams.pbiaya SET status = 0 WHERE id_pembiayaan = %s", [id_pembiayaan])
                if cursor.rowcount == 0:
                    return Response({'error': 'Pembiayaan tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


KUNJUNGAN_TYPE_FILTERS = {
    'rawat_jalan': "substr(a.j_lay,18,1)='1'",
    'rawat_inap': "substr(a.j_lay,17,1)='1'",
    'ugd': "substr(a.j_lay,16,1)='1'",
    'vk': "substr(a.j_lay,19,1)='1'",
    'ok': "substr(a.j_lay,20,1)='1'",
}


KUNJUNGAN_TYPE_LABELS = {
    'rawat_jalan': 'Rawat Jalan',
    'rawat_inap': 'Rawat Inap',
    'ugd': 'UGD',
    'vk': 'VK',
    'ok': 'OK',
}


KUNJUNGAN_TOTAL_SQL = """
    COALESCE(a.adm,0)+COALESCE(a.jasa,0)+COALESCE(a.farmasi,0)+COALESCE(a.tindakan,0)+
    COALESCE(a.fisio,0)+COALESCE(a.lab,0)+COALESCE(a.lab_pa,0)+COALESCE(a.kamar,0)+
    COALESCE(a.rad,0)+COALESCE(a.bhp,0)+COALESCE(a.lainnya,0)+COALESCE(a.ambulan,0)+COALESCE(a.alat,0)
"""


def _dict_fetchall(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _decimal_from_row(row, key):
    return Decimal(str(row.get(key) or 0))


def _get_pembiayaan_name(id_pembiayaan):
    if not id_pembiayaan:
        return ''
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT pembiayaan
            FROM rssams.pbiaya
            WHERE id_pembiayaan = %s AND status <> 0
            LIMIT 1
        """, [id_pembiayaan])
        row = cursor.fetchone()
    return row[0] if row else ''


def _legacy_kunjungan_where(params):
    kunjungan_type = params.get('jenis') or 'semua'
    where = []
    values = []
    if kunjungan_type != 'semua':
        where.append(KUNJUNGAN_TYPE_FILTERS.get(kunjungan_type, KUNJUNGAN_TYPE_FILTERS['rawat_jalan']))

    search = (params.get('search') or '').strip()
    if search:
        where.append("(a.no LIKE %s OR a.noreg LIKE %s OR b.nama LIKE %s OR c.pembiayaan LIKE %s)")
        needle = f"%{search}%"
        values.extend([needle, needle, needle, needle])

    id_pembiayaan = (params.get('id_pembiayaan') or '').strip()
    if id_pembiayaan == 'non_bpjs':
        where.append("(c.pembiayaan IS NULL OR c.pembiayaan NOT LIKE %s)")
        values.append('%BPJS%')
    elif id_pembiayaan:
        where.append("a.id_pembiayaan = %s")
        values.append(id_pembiayaan)
    elif not search:
        # Hanya tampilkan kunjungan dari Asuransi (exclude Swadana & BPJS) bila tidak sedang mencari
        where.append("(a.id_pembiayaan != 1 AND (c.pembiayaan IS NULL OR (c.pembiayaan NOT LIKE %s AND LOWER(c.pembiayaan) NOT LIKE %s)))")
        values.extend(['%BPJS%', '%swadana%'])

    dari = (params.get('dari') or '').strip()
    if dari:
        where.append("DATE(a.tgl_masuk) >= %s")
        values.append(dari)

    sampai = (params.get('sampai') or '').strip()
    if sampai:
        where.append("DATE(a.tgl_masuk) <= %s")
        values.append(sampai)

    done = (params.get('done') or '').strip()
    if done == '1':
        where.append("a.cek = 1")
    elif done == '0':
        where.append("a.cek = 0")

    invoice_status = (params.get('invoice_status') or '').strip()
    if invoice_status == 'belum':
        where.append("(e.no_invoice IS NULL OR e.no_invoice = '')")
    elif invoice_status == 'sudah':
        where.append("(e.no_invoice IS NOT NULL AND e.no_invoice <> '')")

    return " AND ".join(where) if where else "1=1", values, kunjungan_type


def _detect_type_from_j_lay(j_lay):
    value = str(j_lay or '')
    if len(value) >= 20 and value[19:20] == '1':
        return 'OK'
    if len(value) >= 19 and value[18:19] == '1':
        return 'VK'
    if len(value) >= 18 and value[17:18] == '1':
        return 'Rawat Jalan'
    if len(value) >= 17 and value[16:17] == '1':
        return 'Rawat Inap'
    if len(value) >= 16 and value[15:16] == '1':
        return 'UGD'
    return 'Kunjungan'


class KunjunganInvoiceView(APIView):
    permission_classes = [IsKeuanganPermission]

    def _fetch_kunjungan_for_invoice(self, cursor, nomor_kunjungan):
        placeholders = ','.join(['%s'] * len(nomor_kunjungan))
        cursor.execute(f"""
            SELECT
                a.no, a.id_pembiayaan, c.pembiayaan AS nama_pembiayaan,
                a.cek, IFNULL(e.no_invoice, '') AS no_invoice,
                a.adm, a.jasa, a.farmasi, a.tindakan, a.fisio, a.lab,
                a.lab_pa, a.rad, a.kamar, a.bhp, a.lainnya, a.ambulan, a.alat,
                ({KUNJUNGAN_TOTAL_SQL}) AS total_biaya
            FROM rssams.kunjung a
            LEFT JOIN rssams.pbiaya c ON a.id_pembiayaan = c.id_pembiayaan
            INNER JOIN rssams.verif_kunjung e ON a.no = e.no
            WHERE a.no IN ({placeholders})
        """, nomor_kunjungan)
        return _dict_fetchall(cursor)

    def _sum_kunjungan_totals(self, rows):
        totals = defaultdict(lambda: Decimal('0'))
        for row in rows:
            totals['adm'] += _decimal_from_row(row, 'adm')
            totals['jasa'] += _decimal_from_row(row, 'jasa')
            totals['farmasi'] += _decimal_from_row(row, 'farmasi')
            totals['tindakan'] += _decimal_from_row(row, 'tindakan')
            totals['fisio'] += _decimal_from_row(row, 'fisio')
            totals['lab'] += _decimal_from_row(row, 'lab') + _decimal_from_row(row, 'lab_pa')
            totals['rad'] += _decimal_from_row(row, 'rad')
            totals['kamar'] += _decimal_from_row(row, 'kamar')
            totals['bhp'] += _decimal_from_row(row, 'bhp')
            totals['lainnya'] += _decimal_from_row(row, 'lainnya')
            totals['ambulan'] += _decimal_from_row(row, 'ambulan')
            totals['alat'] += _decimal_from_row(row, 'alat')
        return totals

    def _refresh_faktur_totals(self, faktur):
        rows = get_invoice_kunjungan_rows(faktur)
        if not rows:
            return
        totals = self._sum_kunjungan_totals(rows)
        for field, value in totals.items():
            setattr(faktur, field, value)
        total_real = sum(totals.values())
        faktur.total_real_rs = total_real
        if faktur.is_cob and faktur.tanggungan_bpjs:
            faktur.total_tagihan = max(Decimal('0'), Decimal(str(total_real)) - Decimal(str(faktur.tanggungan_bpjs)))
        else:
            faktur.total_tagihan = total_real
        faktur.save()

    def get(self, request):
        from django.db import connection

        detail_no = (request.query_params.get('no') or '').strip()
        invoice_search = (request.query_params.get('invoice_search') or '').strip()
        try:
            with connection.cursor() as cursor:
                if invoice_search:
                    qs = (
                        Faktur.objects
                        .select_related('pelanggan')
                        .filter(
                            Q(nomor_faktur__icontains=invoice_search) |
                            Q(nama_pembiayaan__icontains=invoice_search) |
                            Q(pelanggan__nama__icontains=invoice_search)
                        )
                        .exclude(status='batal')
                        .order_by('-nomor_faktur')[:10]
                    )
                    return Response(FakturSerializer(qs, many=True).data, status=status.HTTP_200_OK)

                if detail_no:
                    cursor.execute(f"""
                        SELECT
                            a.no, a.noreg, b.nama, b.sex, b.telp, DATE(a.tgl_masuk) AS tgl_masuk,
                            DATE(a.tgl_keluar) AS tgl_keluar, a.no_sep, a.no_jam, a.id_pembiayaan,
                            c.pembiayaan AS nama_pembiayaan, a.cek,
                            IFNULL(e.no_invoice, '') AS no_invoice,
                            a.adm, a.jasa, a.farmasi, a.tindakan, a.fisio, a.lab,
                            a.lab_pa, a.rad, a.kamar, a.bhp, a.lainnya, a.ambulan, a.alat,
                            a.dp3, a.jmlbyr, ({KUNJUNGAN_TOTAL_SQL}) AS total_biaya
                        FROM rssams.kunjung a
                        INNER JOIN rssams.regpasien b ON a.noreg = b.noreg
                        LEFT JOIN rssams.pbiaya c ON a.id_pembiayaan = c.id_pembiayaan
                        INNER JOIN rssams.verif_kunjung e ON a.no = e.no
                        WHERE a.no = %s
                        LIMIT 1
                    """, [detail_no])
                    rows = _dict_fetchall(cursor)
                    if not rows:
                        return Response({'error': 'Kunjungan tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
                    row = rows[0]
                    row['status_done'] = bool(row.get('cek'))
                    row['status_invoice'] = 'sudah' if row.get('no_invoice') else 'belum'
                    row['jenis_label'] = self._detect_type(row.get('no'))
                    return Response(row, status=status.HTTP_200_OK)

                where_sql, values, kunjungan_type = _legacy_kunjungan_where(request.query_params)
                page = max(int(request.query_params.get('page') or 1), 1)
                page_size = min(max(int(request.query_params.get('page_size') or 10), 1), 100)
                offset = (page - 1) * page_size

                base_sql = f"""
                    FROM rssams.kunjung a
                    INNER JOIN rssams.regpasien b ON a.noreg = b.noreg
                    LEFT JOIN rssams.pbiaya c ON a.id_pembiayaan = c.id_pembiayaan
                    INNER JOIN rssams.verif_kunjung e ON a.no = e.no
                    WHERE {where_sql}
                """
                cursor.execute(f"SELECT COUNT(*) AS total {base_sql}", values)
                total = cursor.fetchone()[0]
                cursor.execute(f"""
                    SELECT
                        a.no, a.noreg, b.nama, b.sex, DATE(a.tgl_masuk) AS tgl_masuk,
                        DATE(a.tgl_keluar) AS tgl_keluar, a.id_pembiayaan,
                        c.pembiayaan AS nama_pembiayaan, a.cek, a.j_lay,
                        IFNULL(e.no_invoice, '') AS no_invoice,
                        ({KUNJUNGAN_TOTAL_SQL}) AS total_biaya,
                        a.dp3, a.jmlbyr
                    {base_sql}
                    ORDER BY a.tgl_masuk DESC, a.no DESC
                    LIMIT %s OFFSET %s
                """, [*values, page_size, offset])
                rows = _dict_fetchall(cursor)
            for row in rows:
                row['jenis'] = kunjungan_type
                row['jenis_label'] = (
                    _detect_type_from_j_lay(row.get('j_lay'))
                    if kunjungan_type == 'semua'
                    else KUNJUNGAN_TYPE_LABELS.get(kunjungan_type, 'Rawat Jalan')
                )
                row['status_done'] = bool(row.get('cek'))
                row['status_invoice'] = 'sudah' if row.get('no_invoice') else 'belum'
            return Response({'count': total, 'results': rows}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        from django.db import connection

        action_name = (request.data.get('action') or '').strip()
        nomor_kunjungan = request.data.get('nomor_kunjungan') or request.data.get('selected') or []
        if isinstance(nomor_kunjungan, str):
            nomor_kunjungan = [nomor_kunjungan]
        nomor_kunjungan = [str(no).strip() for no in nomor_kunjungan if str(no).strip()]
        if not nomor_kunjungan:
            return Response({'error': 'Pilih minimal satu kunjungan.'}, status=status.HTTP_400_BAD_REQUEST)

        if action_name == 'append':
            invoice_number = str(request.data.get('nomor_faktur') or '').strip()
            if not invoice_number:
                return Response({'nomor_faktur': 'Nomor invoice wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                faktur = Faktur.objects.get(nomor_faktur=invoice_number)
            except Faktur.DoesNotExist:
                return Response({'nomor_faktur': 'Invoice tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
            if faktur.status == 'batal':
                return Response({'error': 'Kunjungan tidak bisa ditambahkan ke invoice batal.'}, status=status.HTTP_400_BAD_REQUEST)

            placeholders = ','.join(['%s'] * len(nomor_kunjungan))
            try:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        rows = self._fetch_kunjungan_for_invoice(cursor, nomor_kunjungan)
                        found = {str(row['no']) for row in rows}
                        missing = [no for no in nomor_kunjungan if no not in found]
                        if missing:
                            return Response({'error': f"Kunjungan tidak ditemukan: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)
                        not_done = [str(row['no']) for row in rows if not row.get('cek')]
                        if not_done:
                            return Response({'error': f"Transaksi belum done: {', '.join(not_done)}"}, status=status.HTTP_400_BAD_REQUEST)
                        invoiced = [str(row['no']) for row in rows if row.get('no_invoice')]
                        if invoiced:
                            return Response({'error': f"Kunjungan sudah masuk invoice: {', '.join(invoiced)}"}, status=status.HTTP_400_BAD_REQUEST)
                        no_charge = [str(row['no']) for row in rows if _decimal_from_row(row, 'total_biaya') <= 0]
                        if no_charge:
                            return Response({'error': f"Kunjungan belum memiliki biaya: {', '.join(no_charge)}"}, status=status.HTTP_400_BAD_REQUEST)
                        cursor.execute(
                            f"UPDATE rssams.verif_kunjung SET no_invoice=%s WHERE no IN ({placeholders})",
                            [faktur.nomor_faktur, *nomor_kunjungan],
                        )
                    self._refresh_faktur_totals(faktur)
                return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        tanggal = request.data.get('tanggal') or timezone.localdate().isoformat()
        try:
            tanggal = datetime.strptime(str(tanggal), '%Y-%m-%d').date()
        except ValueError:
            return Response({'tanggal': 'Format tanggal harus YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        placeholders = ','.join(['%s'] * len(nomor_kunjungan))
        try:
            with connection.cursor() as cursor:
                rows = self._fetch_kunjungan_for_invoice(cursor, nomor_kunjungan)

            found = {str(row['no']) for row in rows}
            missing = [no for no in nomor_kunjungan if no not in found]
            if missing:
                return Response({'error': f"Kunjungan tidak ditemukan: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)
            not_done = [str(row['no']) for row in rows if not row.get('cek')]
            if not_done:
                return Response({'error': f"Transaksi belum done: {', '.join(not_done)}"}, status=status.HTTP_400_BAD_REQUEST)
            invoiced = [str(row['no']) for row in rows if row.get('no_invoice')]
            if invoiced:
                return Response({'error': f"Kunjungan sudah masuk invoice: {', '.join(invoiced)}"}, status=status.HTTP_400_BAD_REQUEST)

            totals = self._sum_kunjungan_totals(rows)

            id_pembiayaan = str(request.data.get('id_pembiayaan') or '').strip()
            if not id_pembiayaan:
                return Response({'id_pembiayaan': 'Pembiayaan invoice wajib dipilih.'}, status=status.HTTP_400_BAD_REQUEST)

            nama_pembiayaan = _get_pembiayaan_name(id_pembiayaan)
            if not nama_pembiayaan:
                return Response({'id_pembiayaan': 'Pembiayaan invoice tidak ditemukan atau tidak aktif.'}, status=status.HTTP_400_BAD_REQUEST)

            visit_pembiayaan = sorted({
                str(row.get('nama_pembiayaan') or row.get('id_pembiayaan') or 'Tanpa Pembiayaan')
                for row in rows
            })
            nomor_faktur = generate_nomor_faktur(tanggal)
            jenis = request.data.get('jenis') or 'Kunjungan Pasien'
            periode = request.data.get('periode') or tanggal.strftime('%B %Y')
            beban = request.data.get('beban') or nama_pembiayaan or 'PEMBIAYAAN'
            default_keterangan = f"Dibuat dari kunjungan: {', '.join(nomor_kunjungan)}"
            if len(visit_pembiayaan) > 1:
                default_keterangan += f". Pembiayaan asal kunjungan: {', '.join(visit_pembiayaan)}."
            keterangan = request.data.get('keterangan') or default_keterangan

            is_cob = bool(request.data.get('is_cob'))
            try:
                tanggungan_bpjs = Decimal(str(request.data.get('tanggungan_bpjs') or '0'))
            except Exception:
                tanggungan_bpjs = Decimal('0')

            total_real_rs = sum(totals.values())
            if is_cob and tanggungan_bpjs > 0:
                total_tagihan = max(Decimal('0'), total_real_rs - tanggungan_bpjs)
            else:
                total_tagihan = total_real_rs

            with transaction.atomic():
                faktur = Faktur.objects.create(
                    nomor_faktur=nomor_faktur,
                    tanggal=tanggal,
                    jatuh_tempo=tanggal,
                    id_pembiayaan=id_pembiayaan,
                    nama_pembiayaan=nama_pembiayaan,
                    jenis=jenis,
                    periode=periode,
                    beban=beban,
                    keterangan=keterangan,
                    is_cob=is_cob,
                    tanggungan_bpjs=tanggungan_bpjs,
                    total_real_rs=total_real_rs,
                    total_tagihan=total_tagihan,
                    created_by=request.user,
                    **totals,
                )
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"UPDATE rssams.verif_kunjung SET no_invoice=%s WHERE no IN ({placeholders})",
                        [faktur.nomor_faktur, *nomor_kunjungan],
                    )
            return Response(FakturSerializer(faktur).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)    

    def delete(self, request):
        from django.db import connection

        invoice_number = str(request.data.get('nomor_faktur') or request.query_params.get('nomor_faktur') or '').strip()
        no_kunjungan = str(request.data.get('no') or request.query_params.get('no') or '').strip()
        if not invoice_number or not no_kunjungan:
            return Response({'error': 'Nomor invoice dan nomor kunjungan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            faktur = Faktur.objects.get(nomor_faktur=invoice_number)
        except Faktur.DoesNotExist:
            return Response({'error': 'Invoice tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
        if faktur.tgl_kirim:
            return Response({'error': 'Kunjungan tidak bisa dihapus dari invoice yang sudah dikirim.'}, status=status.HTTP_400_BAD_REQUEST)
        if faktur.pembayaran.exists():
            return Response({'error': 'Kunjungan tidak bisa dihapus dari invoice yang sudah memiliki pembayaran atau pengajuan pembayaran.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT IFNULL(no_invoice, '') FROM rssams.verif_kunjung WHERE no=%s LIMIT 1",
                        [no_kunjungan],
                    )
                    row = cursor.fetchone()
                    if not row:
                        return Response({'error': 'Kunjungan tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
                    if str(row[0] or '') != faktur.nomor_faktur:
                        return Response({'error': 'Kunjungan tidak terdaftar pada invoice ini.'}, status=status.HTTP_400_BAD_REQUEST)
                    cursor.execute(
                        "UPDATE rssams.verif_kunjung SET no_invoice='' WHERE no=%s AND no_invoice=%s",
                        [no_kunjungan, faktur.nomor_faktur],
                    )
                    cursor.execute(
                        "SELECT COUNT(*) FROM rssams.verif_kunjung WHERE no_invoice=%s",
                        [faktur.nomor_faktur],
                    )
                    remaining = cursor.fetchone()[0]
                if remaining:
                    self._refresh_faktur_totals(faktur)
                else:
                    faktur.adm = faktur.jasa = faktur.farmasi = faktur.tindakan = Decimal('0')
                    faktur.fisio = faktur.lab = faktur.rad = faktur.kamar = Decimal('0')
                    faktur.bhp = faktur.lainnya = faktur.ambulan = faktur.alat = Decimal('0')
                    faktur.save()
            return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _detect_type(self, no):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT j_lay FROM rssams.kunjung WHERE no=%s LIMIT 1", [no])
            row = cursor.fetchone()
        j_lay = row[0] if row else ''
        if len(j_lay) >= 17 and j_lay[16:17] == '1':
            return 'Rawat Inap'
        if len(j_lay) >= 15 and j_lay[15:16] == '1':
            return 'UGD'
        if len(j_lay) >= 18 and j_lay[18:19] == '1':
            return 'VK'
        if len(j_lay) >= 19 and j_lay[19:20] == '1':
            return 'OK'
        return 'Rawat Jalan'


class InvoiceDashboardView(APIView):
    permission_classes = [IsKeuanganOrManajerPermission]

    def get(self, request):
        today = timezone.localdate()
        active_qs = Faktur.objects.exclude(status='batal')
        dari = request.query_params.get('dari')
        sampai = request.query_params.get('sampai')
        if dari:
            active_qs = active_qs.filter(tanggal__gte=dari)
        if sampai:
            active_qs = active_qs.filter(tanggal__lte=sampai)
        grouped = list(active_qs.values('id_pembiayaan').annotate(
            tagihan_total=Coalesce(Sum('total_tagihan'), Decimal('0')),
            dibayar_total=Coalesce(Sum('total_dibayar'), Decimal('0')),
            invoice_count=Count('id'),
            belum_bayar_count=Count('id', filter=Q(status='belum_bayar')),
            sebagian_count=Count('id', filter=Q(status='bayar_sebagian')),
            lunas_count=Count('id', filter=Q(status='lunas')),
            overdue_count=Count('id', filter=Q(jatuh_tempo__lt=today) & Q(total_tagihan__gt=F('total_dibayar'))),
        ))
        pending_qs = PembayaranFaktur.objects.filter(status_verifikasi='menunggu').exclude(faktur__status='batal')
        if dari:
            pending_qs = pending_qs.filter(faktur__tanggal__gte=dari)
        if sampai:
            pending_qs = pending_qs.filter(faktur__tanggal__lte=sampai)
        pending_by_pembiayaan = {
            str(row['faktur__id_pembiayaan'] or ''): row['total']
            for row in pending_qs
            .values('faktur__id_pembiayaan')
            .annotate(total=Coalesce(Sum('jumlah'), Decimal('0')))
        }
        pembiayaan_names = {}
        ids = [str(item['id_pembiayaan']) for item in grouped if item['id_pembiayaan']]
        if ids:
            from django.db import connection
            placeholders = ','.join(['%s'] * len(ids))
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"SELECT id_pembiayaan, pembiayaan FROM rssams.pbiaya WHERE id_pembiayaan IN ({placeholders})",
                        ids,
                    )
                    pembiayaan_names = {str(row[0]): row[1] for row in cursor.fetchall()}
            except Exception:
                pembiayaan_names = {}

        rows = []
        for row in grouped:
            total_tagihan = Decimal(row['tagihan_total'] or 0)
            total_dibayar = Decimal(row['dibayar_total'] or 0)
            sisa = total_tagihan - total_dibayar
            key = str(row['id_pembiayaan'] or '')
            rows.append({
                'id_pembiayaan': row['id_pembiayaan'] or '',
                'nama_pembiayaan': pembiayaan_names.get(key) or 'Tanpa Pembiayaan',
                'total_tagihan': total_tagihan,
                'total_dibayar': total_dibayar,
                'sisa_piutang': sisa,
                'pending_verifikasi': pending_by_pembiayaan.get(key, Decimal('0')),
                'invoice_count': row['invoice_count'],
                'belum_bayar_count': row['belum_bayar_count'],
                'sebagian_count': row['sebagian_count'],
                'lunas_count': row['lunas_count'],
                'overdue_count': row['overdue_count'],
                'collection_rate': float((total_dibayar / total_tagihan * 100) if total_tagihan else 0),
            })
        rows.sort(key=lambda item: item['sisa_piutang'], reverse=True)

        totals = active_qs.aggregate(
            tagihan_total=Coalesce(Sum('total_tagihan'), Decimal('0')),
            dibayar_total=Coalesce(Sum('total_dibayar'), Decimal('0')),
            invoice_count=Count('id'),
            belum_bayar_count=Count('id', filter=Q(status='belum_bayar')),
            sebagian_count=Count('id', filter=Q(status='bayar_sebagian')),
            lunas_count=Count('id', filter=Q(status='lunas')),
            overdue_count=Count('id', filter=Q(jatuh_tempo__lt=today) & Q(total_tagihan__gt=F('total_dibayar'))),
        )
        pending_total = pending_qs.aggregate(
            total=Coalesce(Sum('jumlah'), Decimal('0')),
            count=Count('id'),
        )

        aging = {
            'belum_jatuh_tempo': Decimal('0'),
            'hari_1_30': Decimal('0'),
            'hari_31_60': Decimal('0'),
            'hari_lebih_60': Decimal('0'),
        }
        for invoice in active_qs.exclude(status='lunas').values('jatuh_tempo', 'total_tagihan', 'total_dibayar'):
            sisa = Decimal(invoice['total_tagihan'] or 0) - Decimal(invoice['total_dibayar'] or 0)
            if sisa <= 0:
                continue
            jatuh_tempo = invoice['jatuh_tempo']
            if not jatuh_tempo or jatuh_tempo >= today:
                aging['belum_jatuh_tempo'] += sisa
                continue
            days = (today - jatuh_tempo).days
            if days <= 30:
                aging['hari_1_30'] += sisa
            elif days <= 60:
                aging['hari_31_60'] += sisa
            else:
                aging['hari_lebih_60'] += sisa

        total_tagihan = Decimal(totals['tagihan_total'] or 0)
        total_dibayar = Decimal(totals['dibayar_total'] or 0)
        sisa_piutang = total_tagihan - total_dibayar
        response = {
            'summary': {
                'total_tagihan': total_tagihan,
                'total_dibayar': total_dibayar,
                'sisa_piutang': sisa_piutang,
                'pending_verifikasi': pending_total['total'] or Decimal('0'),
                'pending_verifikasi_count': pending_total['count'],
                'invoice_count': totals['invoice_count'],
                'pembiayaan_count': len(rows),
                'belum_bayar_count': totals['belum_bayar_count'],
                'sebagian_count': totals['sebagian_count'],
                'lunas_count': totals['lunas_count'],
                'overdue_count': totals['overdue_count'],
                'collection_rate': float((total_dibayar / total_tagihan * 100) if total_tagihan else 0),
            },
            'aging': aging,
            'pembiayaan': rows,
            'top_piutang': rows[:8],
        }
        return Response(response, status=status.HTTP_200_OK)


class InvoiceVerificationView(APIView):
    permission_classes = [IsKeuanganOrManajerPermission]

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        dari = (request.query_params.get('dari') or '').strip()
        sampai = (request.query_params.get('sampai') or '').strip()
        status_filter = (request.query_params.get('status') or 'menunggu').strip()

        qs = (
            PembayaranFaktur.objects
            .exclude(faktur__status='batal')
            .select_related('faktur', 'created_by', 'verified_by')
        )
        if status_filter == 'history':
            qs = qs.exclude(status_verifikasi='menunggu').order_by('-verified_at', '-created_at')
        elif status_filter in ('terverifikasi', 'dibatalkan', 'ditolak'):
            qs = qs.filter(status_verifikasi=status_filter).order_by('-verified_at', '-created_at')
        else:
            qs = qs.filter(status_verifikasi='menunggu').order_by('-created_at')

        if search:
            qs = qs.filter(
                Q(faktur__nomor_faktur__icontains=search) |
                Q(faktur__nama_pembiayaan__icontains=search) |
                Q(faktur__id_pembiayaan__icontains=search) |
                Q(keterangan__icontains=search) |
                Q(created_by__username__icontains=search) |
                Q(verified_by__username__icontains=search)
            )
        if dari:
            qs = qs.filter(tanggal__gte=dari)
        if sampai:
            qs = qs.filter(tanggal__lte=sampai)

        page = max(int(request.query_params.get('page') or 1), 1)
        page_size = min(max(int(request.query_params.get('page_size') or 10), 1), 100)
        total = qs.count()
        start = (page - 1) * page_size
        payments = qs[start:start + page_size]

        results = []
        for pay in payments:
            faktur = pay.faktur
            results.append({
                'id': pay.id,
                'tanggal': pay.tanggal,
                'jumlah': pay.jumlah,
                'metode': pay.metode,
                'keterangan': pay.keterangan,
                'created_at': pay.created_at,
                'created_by_name': getattr(pay.created_by, 'username', '') or '-',
                'verified_at': pay.verified_at,
                'verified_by_name': getattr(pay.verified_by, 'username', '') or '-',
                'status_verifikasi': pay.status_verifikasi,
                'status_verifikasi_label': pay.get_status_verifikasi_display(),
                'faktur': {
                    'id': faktur.id,
                    'nomor_faktur': faktur.nomor_faktur,
                    'tanggal': faktur.tanggal,
                    'id_pembiayaan': faktur.id_pembiayaan,
                    'nama_pembiayaan': faktur.nama_pembiayaan,
                    'total_tagihan': faktur.total_tagihan,
                    'total_dibayar': faktur.total_dibayar,
                    'sisa_tagihan': faktur.sisa_tagihan,
                    'status': faktur.status,
                    'status_label': faktur.get_status_display(),
                },
            })

        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': results,
        }, status=status.HTTP_200_OK)


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

    def destroy(self, request, *args, **kwargs):
        faktur = self.get_object()
        if faktur.pembayaran.exists():
            return Response({'error': 'Invoice yang sudah memiliki pembayaran tidak bisa dihapus.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

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
    permission_classes = [IsKeuanganOrManajerPermission]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return FakturInputSerializer
        return FakturSerializer

    def perform_create(self, serializer):
        tanggal = serializer.validated_data.get('tanggal') or timezone.localdate()

        faktur = serializer.save(
            created_by=self.request.user,
            nomor_faktur=generate_nomor_faktur(tanggal)
        )
        total_real = (
            faktur.adm + faktur.jasa + faktur.farmasi + faktur.tindakan +
            faktur.fisio + faktur.lab + faktur.rad + faktur.kamar +
            faktur.bhp + faktur.lainnya + faktur.ambulan + faktur.alat
        )
        faktur.total_real_rs = total_real
        if faktur.is_cob and faktur.tanggungan_bpjs:
            faktur.total_tagihan = max(Decimal('0'), Decimal(str(total_real)) - Decimal(str(faktur.tanggungan_bpjs)))
        else:
            faktur.total_tagihan = total_real
        faktur.save()

    def perform_update(self, serializer):
        faktur = serializer.save()
        total_real = (
            faktur.adm + faktur.jasa + faktur.farmasi + faktur.tindakan +
            faktur.fisio + faktur.lab + faktur.rad + faktur.kamar +
            faktur.bhp + faktur.lainnya + faktur.ambulan + faktur.alat
        )
        faktur.total_real_rs = total_real
        if faktur.is_cob and faktur.tanggungan_bpjs:
            faktur.total_tagihan = max(Decimal('0'), Decimal(str(total_real)) - Decimal(str(faktur.tanggungan_bpjs)))
        else:
            faktur.total_tagihan = total_real
        faktur.save()
        
    def generate_nomor_faktur(self, tanggal):
        prefix = f"{tanggal:%y}"

        max_urut = 0

        last_faktur = (
            Faktur.objects
            .filter(nomor_faktur__startswith=prefix)
            .order_by('-nomor_faktur')
            .values_list('nomor_faktur', flat=True)
            .first()
        )

        if last_faktur and str(last_faktur)[2:6].isdigit():
            max_urut = int(str(last_faktur)[2:6])

        nomor = f"{prefix}{max_urut + 1:04d}"

        while Faktur.objects.filter(nomor_faktur=nomor).exists():
            max_urut += 1
            nomor = f"{prefix}{max_urut + 1:04d}"

        return nomor

    def destroy(self, request, *args, **kwargs):
        faktur = self.get_object()
        if faktur.pembayaran.exists():
            return Response({'error': 'Invoice yang sudah memiliki pembayaran atau pengajuan pembayaran tidak bisa dihapus.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs        = super().get_queryset()
        pelanggan = self.request.query_params.get('pelanggan')
        search    = self.request.query_params.get('search')
        st        = self.request.query_params.get('status')
        id_pbiaya = self.request.query_params.get('id_pembiayaan')
        dari      = self.request.query_params.get('dari')
        sampai    = self.request.query_params.get('sampai')
        aging     = self.request.query_params.get('aging')
        if search:
            qs = qs.filter(
                Q(nomor_faktur__icontains=search) |
                Q(nama_pembiayaan__icontains=search) |
                Q(id_pembiayaan__icontains=search) |
                Q(pelanggan__nama__icontains=search)
            )
        if pelanggan: qs = qs.filter(pelanggan_id=pelanggan)
        if id_pbiaya: qs = qs.filter(id_pembiayaan=id_pbiaya)
        if st:        qs = qs.filter(status=st)
        if dari:      qs = qs.filter(tanggal__gte=dari)
        if sampai:    qs = qs.filter(tanggal__lte=sampai)
        if aging:
            today = timezone.localdate()
            qs = qs.exclude(status='batal').filter(total_tagihan__gt=F('total_dibayar'))
            if aging == 'not_due':
                qs = qs.filter(Q(jatuh_tempo__isnull=True) | Q(jatuh_tempo__gte=today))
            elif aging == '1_30':
                qs = qs.filter(jatuh_tempo__lt=today, jatuh_tempo__gte=today - timedelta(days=30))
            elif aging == '31_60':
                qs = qs.filter(jatuh_tempo__lt=today - timedelta(days=30), jatuh_tempo__gte=today - timedelta(days=60))
            elif aging == 'over_60':
                qs = qs.filter(jatuh_tempo__lt=today - timedelta(days=60))
        return qs.order_by('-nomor_faktur')

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
        pending_total = faktur.pembayaran.filter(status_verifikasi='menunggu').aggregate(
            total=Sum('jumlah')
        )['total'] or Decimal('0')
        if pending_total + jumlah > faktur.sisa_tagihan:
            return Response({'error': f'Total pembayaran menunggu verifikasi melebihi sisa tagihan ({faktur.sisa_tagihan}).'}, status=status.HTTP_400_BAD_REQUEST)
        alokasi_list = list(
            AlokasiDana.objects
            .filter(id_pembiayaan=faktur.id_pembiayaan, sisa_alokasi__gt=0)
            .order_by('tanggal_penerimaan', 'created_at', 'id')
        )
        saldo_wallet = sum((alokasi.sisa_alokasi for alokasi in alokasi_list), Decimal('0'))
        if pending_total + jumlah > saldo_wallet:
            return Response({'error': f'Jumlah bayar melebihi saldo pembiayaan ({saldo_wallet}).'}, status=status.HTTP_400_BAD_REQUEST)

        pembayaran = PembayaranFaktur.objects.create(
            faktur=faktur, created_by=request.user,
            tanggal=serializer.validated_data['tanggal'],
            jumlah=jumlah, metode=serializer.validated_data['metode'],
            keterangan=serializer.validated_data.get('keterangan', ''),
            akun=serializer.validated_data.get('akun'),
            status_verifikasi='menunggu',
        )
        faktur.refresh_from_db()
        return Response(PembayaranFakturSerializer(pembayaran).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path=r'pembayaran/(?P<pembayaran_id>[^/.]+)/verifikasi')
    def verifikasi_pembayaran(self, request, pk=None, pembayaran_id=None):
        if not is_manajer_keuangan(request.user):
            return Response({'error': 'Hanya manajer keuangan yang bisa verifikasi pembayaran.'}, status=status.HTTP_403_FORBIDDEN)
        faktur = self.get_object()
        try:
            pembayaran = faktur.pembayaran.get(pk=pembayaran_id)
        except PembayaranFaktur.DoesNotExist:
            return Response({'error': 'Pembayaran tidak ditemukan pada invoice ini.'}, status=status.HTTP_404_NOT_FOUND)
        if pembayaran.status_verifikasi == 'terverifikasi':
            return Response({'error': 'Pembayaran sudah terverifikasi.'}, status=status.HTTP_400_BAD_REQUEST)
        if pembayaran.status_verifikasi == 'ditolak':
            return Response({'error': 'Pembayaran sudah ditolak.'}, status=status.HTTP_400_BAD_REQUEST)
        if faktur.status in ['lunas', 'batal']:
            return Response({'error': 'Invoice sudah lunas atau dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        if pembayaran.jumlah > faktur.sisa_tagihan:
            return Response({'error': f'Jumlah pembayaran melebihi sisa tagihan saat ini ({faktur.sisa_tagihan}).'}, status=status.HTTP_400_BAD_REQUEST)

        alokasi_list = list(
            AlokasiDana.objects
            .filter(id_pembiayaan=faktur.id_pembiayaan, sisa_alokasi__gt=0)
            .order_by('tanggal_penerimaan', 'created_at', 'id')
        )
        saldo_wallet = sum((alokasi.sisa_alokasi for alokasi in alokasi_list), Decimal('0'))
        if pembayaran.jumlah > saldo_wallet:
            return Response({'error': f'Jumlah pembayaran melebihi saldo pembiayaan ({saldo_wallet}).'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sisa_potong = pembayaran.jumlah
            for alokasi in alokasi_list:
                if sisa_potong <= 0:
                    break
                nominal_potong = min(alokasi.sisa_alokasi, sisa_potong)
                AlokasiDanaPemakaian.objects.create(
                    alokasi_dana=alokasi,
                    pembayaran=pembayaran,
                    jumlah=nominal_potong,
                )
                alokasi.save()
                sisa_potong -= nominal_potong
            pembayaran.status_verifikasi = 'terverifikasi'
            pembayaran.verified_by = request.user
            pembayaran.verified_at = timezone.now()
            pembayaran.save()
        faktur.refresh_from_db()
        return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path=r'pembayaran/(?P<pembayaran_id>[^/.]+)')
    def hapus_pembayaran(self, request, pk=None, pembayaran_id=None):
        faktur = self.get_object()
        try:
            pembayaran = faktur.pembayaran.get(pk=pembayaran_id)
        except PembayaranFaktur.DoesNotExist:
            return Response({'error': 'Pembayaran tidak ditemukan pada invoice ini.'}, status=status.HTTP_404_NOT_FOUND)
        pembayaran.delete()
        faktur.refresh_from_db()
        return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path=r'pembayaran/(?P<pembayaran_id>[^/.]+)/batal')
    def batal_pembayaran(self, request, pk=None, pembayaran_id=None):
        faktur = self.get_object()
        try:
            pembayaran = faktur.pembayaran.get(pk=pembayaran_id)
        except PembayaranFaktur.DoesNotExist:
            return Response({'error': 'Pembayaran tidak ditemukan pada invoice ini.'}, status=status.HTTP_404_NOT_FOUND)
        if pembayaran.status_verifikasi == 'dibatalkan':
            return Response({'error': 'Pembayaran sudah dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            alokasi_terpakai = list(
                AlokasiDana.objects.filter(pemakaian_alokasi__pembayaran=pembayaran).distinct()
            )
            pembayaran.pemakaian_alokasi.all().delete()
            pembayaran.status_verifikasi = 'dibatalkan'
            pembayaran.verified_by = request.user
            pembayaran.verified_at = timezone.now()
            pembayaran.save()
            for alokasi in alokasi_terpakai:
                alokasi.save()
        faktur.refresh_from_db()
        return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='kirim')
    def kirim(self, request, pk=None):
        faktur = self.get_object()
        tanggal_kirim = request.data.get('tgl_kirim') or request.data.get('tanggal_kirim')
        if not tanggal_kirim:
            return Response({'tgl_kirim': 'Tanggal kirim invoice wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            tanggal_kirim = datetime.strptime(str(tanggal_kirim), '%Y-%m-%d').date()
        except ValueError:
            return Response({'tgl_kirim': 'Format tanggal kirim harus YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        faktur.tgl_kirim = tanggal_kirim
        faktur.jatuh_tempo = tanggal_kirim + timedelta(days=45)
        faktur.save()
        return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='batal')
    def batal(self, request, pk=None):
        faktur = self.get_object()
        if faktur.tgl_kirim:
            return Response({'error': 'Invoice yang sudah dikirim tidak bisa dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        if faktur.status == 'lunas':
            return Response({'error': 'Faktur yang sudah lunas tidak bisa dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        if faktur.pembayaran.exists():
            return Response({'error': 'Invoice yang sudah memiliki pembayaran atau pengajuan pembayaran tidak bisa dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            faktur.status = 'batal'
            faktur.save()
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE rssams.verif_kunjung SET no_invoice='' WHERE no_invoice=%s",
                    [faktur.nomor_faktur],
                )
        return Response(FakturSerializer(faktur).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='kembalikan')
    def kembalikan(self, request, pk=None):
        """
        Batalkan invoice yang sudah dikirim ke asuransi karena dikembalikan/ditolak.
        Berbeda dari /batal/ biasa — endpoint ini khusus untuk invoice yang tgl_kirim sudah terisi.
        Wajib menyertakan alasan_batal di request body.
        Kunjungan yang terikat akan otomatis dilepas sehingga bisa di-assign ke invoice baru.
        """
        faktur = self.get_object()

        if faktur.status == 'batal':
            return Response({'error': 'Invoice ini sudah dibatalkan sebelumnya.'}, status=status.HTTP_400_BAD_REQUEST)
        if faktur.status == 'lunas':
            return Response({'error': 'Invoice yang sudah lunas tidak bisa dikembalikan.'}, status=status.HTTP_400_BAD_REQUEST)
        if not faktur.tgl_kirim:
            return Response(
                {'error': 'Invoice belum dikirim. Gunakan tombol Batalkan biasa untuk membatalkan invoice ini.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        alasan = str(request.data.get('alasan_batal') or '').strip()
        if not alasan:
            return Response({'alasan_batal': 'Alasan pengembalian wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            faktur.status = 'batal'
            faktur.alasan_batal = alasan
            faktur.dibatalkan_oleh = request.user
            faktur.dibatalkan_at = timezone.now()
            faktur.save()
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE rssams.verif_kunjung SET no_invoice='' WHERE no_invoice=%s",
                    [faktur.nomor_faktur],
                )

        return Response(FakturSerializer(faktur, context={'view': self}).data, status=status.HTTP_200_OK)


# ══════════════════════════════════════════════════════════════
_ROMAN_MONTHS = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI',
    7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII',
}

_ID_MONTHS = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
    5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
}


def _invoice_money(value, decimals=2):
    amount = Decimal(value or 0)
    return f"{amount:,.{decimals}f}"


def _invoice_date(value):
    if not value:
        return ''
    return f"{value.day:02d} {_ID_MONTHS[value.month]} {value.year}"


def _legacy_invoice_number(faktur):
    tanggal = faktur.tanggal or timezone.localdate()
    return f"{faktur.nomor_faktur}/Keu-02/RS-SAMS/{_ROMAN_MONTHS[tanggal.month]}/{tanggal.year}"


def _invoice_total_tagihan(faktur):
    if faktur.is_cob and Decimal(faktur.tanggungan_bpjs or 0) > 0:
        total_real = Decimal(faktur.total_real_rs or 0) or Decimal(faktur.total_tagihan or 0)
        return max(Decimal('0'), total_real - Decimal(str(faktur.tanggungan_bpjs)))
    return Decimal(faktur.total_tagihan or 0)


def _invoice_print_amounts(faktur):
    rows = get_invoice_kunjungan_rows(faktur)
    if rows:
        jumlah_bayar = sum((Decimal(row.get('jmlbyr') or 0) for row in rows), Decimal('0'))
        total_real = sum((Decimal(row.get('ttl') or 0) for row in rows), Decimal('0'))
        if faktur.is_cob and Decimal(faktur.tanggungan_bpjs or 0) > 0:
            total = max(Decimal('0'), total_real - Decimal(str(faktur.tanggungan_bpjs)))
        else:
            total = total_real
        return total, jumlah_bayar
    return _invoice_total_tagihan(faktur), Decimal('0')


def _legacy_words(number):
    units = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
    number = int(Decimal(number or 0).quantize(Decimal('1')))
    if number < 12:
        return units[number]
    if number < 20:
        return f"{_legacy_words(number - 10)} belas"
    if number < 100:
        return f"{_legacy_words(number // 10)} puluh {_legacy_words(number % 10)}".strip()
    if number < 200:
        return f"seratus {_legacy_words(number - 100)}".strip()
    if number < 1000:
        return f"{_legacy_words(number // 100)} ratus {_legacy_words(number % 100)}".strip()
    if number < 2000:
        return f"seribu {_legacy_words(number - 1000)}".strip()
    if number < 1000000:
        return f"{_legacy_words(number // 1000)} ribu {_legacy_words(number % 1000)}".strip()
    if number < 1000000000:
        return f"{_legacy_words(number // 1000000)} juta {_legacy_words(number % 1000000)}".strip()
    return f"{_legacy_words(number // 1000000000)} milyar {_legacy_words(number % 1000000000)}".strip()


def _invoice_print_rows(faktur, ppn=False):
    farmasi = Decimal(faktur.farmasi or 0)
    ppn_obat = Decimal(faktur.ppn_farmasi or 0)
    rows = [('-  BIAYA JASA', faktur.jasa), ('-  BIAYA TINDAKAN', faktur.tindakan)]
    if ppn:
        rows.extend([
            ('-  O b a t', max(farmasi - ppn_obat, Decimal('0'))),
            ('-  PPN Obat', ppn_obat),
            ('-  Embalasi', Decimal('0')),
        ])
    else:
        rows.append(('-  BIAYA FARMASI', max(farmasi - ppn_obat, Decimal('0'))))
    rows.extend([
        ('-  BIAYA LABORATORIUM', faktur.lab),
        ('-  BIAYA RADIOLOGI', faktur.rad),
        ('-  BIAYA KAMAR', faktur.kamar),
        ('-  BIAYA BAHAN HABIS PAKAI (BHP)', faktur.bhp),
        ('-  BIAYA ALAT', faktur.alat),
        ('-  BIAYA AMBULAN', faktur.ambulan),
        ('-  BIAYA FISIOTERAPI', faktur.fisio),
        ('-  BIAYA ADMINISTRASI DAN LAINNYA', Decimal(faktur.lainnya or 0) + Decimal(faktur.adm or 0)),
    ])
    if not ppn and ppn_obat > 0:
        rows.append(('-  PPN OBAT', ppn_obat))
    return rows


def _invoice_pembiayaan_name(faktur):
    # Debug: log what we're getting
    print(f"DEBUG: pelanggan={faktur.pelanggan}, nama_pembiayaan={faktur.nama_pembiayaan}")
    if faktur.pelanggan:
        print(f"DEBUG: returning pelanggan.nama={faktur.pelanggan.nama}")
        return faktur.pelanggan.nama
    result = faktur.nama_pembiayaan or '-'
    print(f"DEBUG: returning nama_pembiayaan={result}")
    return result

def get_invoice_logo_path():
    logo_path = os.path.join(settings.BASE_DIR, 'static', 'images', 'logo-1.jpg')
    return logo_path if os.path.exists(logo_path) else None

def get_invoice_farmasi_ppn_totals(faktur):
    from django.db import connection

    totals = {
        'obat': Decimal('0'),
        'ppn_obat': Decimal('0'),
        'embalasi': Decimal('0'),
    }

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT no
                FROM rssams.verif_kunjung
                WHERE no_invoice = %s
                """,
                [faktur.nomor_faktur]
            )
            kunjungan_rows = cursor.fetchall()

            for (no_kunj,) in kunjungan_rows:
                cursor.execute(
                    """
                    SELECT
                        COALESCE(SUM((modal * persen) * (qty - retur)), 0) AS ttlobat,
                        COALESCE(SUM(ppn * (qty - retur)), 0) AS ttlppnobat,
                        COALESCE(SUM(embalace), 0) AS ttlemba
                    FROM rssams.item_tran_apt
                    WHERE no_kunj = %s
                    """,
                    [no_kunj]
                )
                row = cursor.fetchone()
                if row:
                    totals['obat'] += Decimal(row[0] or 0)
                    totals['ppn_obat'] += Decimal(row[1] or 0)
                    totals['embalasi'] += Decimal(row[2] or 0)

    except Exception:
        pass

    return totals

def get_invoice_kunjungan_rows(faktur):
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    a.no,
                    a.noreg,
                    b.nama,
                    a.adm,
                    a.jasa,
                    a.farmasi,
                    a.tindakan,
                    a.fisio,
                    a.lab,
                    a.lab_pa,
                    a.kamar,
                    a.rad,
                    a.bhp,
                    a.lainnya,
                    a.ambulan,
                    a.alat,
                    a.jmlbyr,
                    (
                        COALESCE(a.adm,0) +
                        COALESCE(a.jasa,0) +
                        COALESCE(a.farmasi,0) +
                        COALESCE(a.tindakan,0) +
                        COALESCE(a.fisio,0) +
                        COALESCE(a.lab,0) +
                        COALESCE(a.kamar,0) +
                        COALESCE(a.rad,0) +
                        COALESCE(a.bhp,0) +
                        COALESCE(a.lainnya,0) +
                        COALESCE(a.ambulan,0) +
                        COALESCE(a.alat,0) -
                        COALESCE(a.jmlbyr,0)
                    ) AS ttl,
                    DATE(a.tgl_masuk) AS tgl_masuk
                FROM rssams.kunjung a
                INNER JOIN rssams.regpasien b ON a.noreg = b.noreg
                INNER JOIN rssams.verif_kunjung c ON a.no = c.no
                WHERE c.no_invoice = %s
                ORDER BY a.no
                """,
                [faktur.nomor_faktur]
            )
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception:
        return []

def get_kunjungan_farmasi_ppn_detail(no_kunj):
    from django.db import connection

    totals = {
        'obat': Decimal('0'),
        'ppn_obat': Decimal('0'),
        'embalasi': Decimal('0'),
    }

    if not no_kunj:
        return totals

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COALESCE(ROUND(SUM((modal * persen) * (qty - retur)), 2), 0) AS ttlobat,
                    COALESCE(ROUND(SUM(ppn * (qty - retur)), 2), 0) AS ttlppnobat,
                    COALESCE(SUM(embalace), 0) AS ttlemba
                FROM rssams.item_tran_apt
                WHERE no_kunj = %s
                """,
                [no_kunj]
            )
            row = cursor.fetchone()

        if row:
            totals['obat'] = Decimal(row[0] or 0)
            totals['ppn_obat'] = Decimal(row[1] or 0)
            totals['embalasi'] = Decimal(row[2] or 0)

    except Exception:
        pass

    return totals

class InvoicePDF(FPDF):
    def header(self):
        logo_path = get_invoice_logo_path()
        if logo_path:
            self.image(logo_path, x=172, y=5, h=21)
        self.ln(20)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
        
def render_invoice_pdf_response(faktur, mode='invoice'):
    pdf = InvoicePDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    print("WIDTH =", pdf.w)
    print("HEIGHT =", pdf.h)
    
    pembiayaan_detail = get_pembiayaan_detail(faktur.id_pembiayaan)
    nama_pbiaya = pembiayaan_detail.get('pembiayaan') or _invoice_pembiayaan_name(faktur) or 'PEMBIAYAAN'
    alamat = pembiayaan_detail.get('alamat') or ''

    tanggal = faktur.tanggal or timezone.localdate()
    tgl = f"{tanggal.day:02d}-{tanggal.month:02d}-{tanggal.year}"
    no_invoice = _legacy_invoice_number(faktur)

    ttl_tagihan, jml_bayar = _invoice_print_amounts(faktur)

    if faktur.xround == 'Y':
        angka = ttl_tagihan.to_integral_value(rounding='ROUND_CEILING')
    else:
        angka = ttl_tagihan

    terbilang = _legacy_words(angka).title()
    terbilang = terbilang.replace('Koma Nol Nol', '').replace('Koma', '').strip()

    pdf.set_font('Times', '', 16)
    pdf.set_x(20)
    pdf.cell(180, 10, "INVOICE", 0, 0, 'C')
    pdf.ln(20)

    pdf.set_font('Times', '', 10)
    pdf.text(20, 48, "Kepada Yth.")
    pdf.text(20, 53, "Bagian Keuangan")
    pdf.text(120, 48, "Nomor")
    pdf.text(135, 48, f": {no_invoice}")
    pdf.text(120, 53, "Tanggal")
    pdf.text(135, 53, f": {tgl}")
    pdf.text(20, 58, str(nama_pbiaya))
    if alamat:
        pdf.text(20, 63, str(alamat))

    pdf.line(20, 70, 200, 70)
    pdf.line(20, 71, 200, 71)

    pdf.text(20, 80, str(faktur.jenis or ''))
    pdf.text(20, 85, f"BEBAN {faktur.beban or ''}")
    pdf.text(20, 90, f"PERIODE : {faktur.periode or ''}")

    def row(y, label, value, x_label=20, is_negative=False):
        pdf.set_font('Times', '', 10)
        pdf.set_xy(x_label, y)
        pdf.cell(90, 5, label, 0, 0, 'L')
        pdf.set_xy(147, y)
        pdf.cell(20, 5, "Rp.", 0, 0, 'R')
        pdf.set_xy(170, y)
        val_str = f"{Decimal(value or 0):,.2f}"
        if is_negative:
            val_str = f"({val_str})"
        pdf.cell(30, 5, val_str, 0, 0, 'R')

    y = 96
    row(y, "-  BIAYA JASA", faktur.jasa)
    y += 5
    row(y, "-  BIAYA TINDAKAN", faktur.tindakan)
    y += 5

    if mode == 'invoice_ppn':
        farmasi_ppn = get_invoice_farmasi_ppn_totals(faktur)

        pdf.set_xy(20, y)
        pdf.cell(90, 5, "-  BIAYA FARMASI", 0, 0, 'L')

        y += 5
        row(y, "- O b a t", farmasi_ppn['obat'], x_label=23)

        y += 5
        row(y, "- PPN Obat", farmasi_ppn['ppn_obat'], x_label=23)

        y += 5
        row(y, "- Embalasi", farmasi_ppn['embalasi'], x_label=23)
    else:
        row(y, "-  BIAYA FARMASI", Decimal(faktur.farmasi or 0) - Decimal(faktur.ppn_farmasi or 0))

    y += 5
    row(y, "-  BIAYA LABORATORIUM", faktur.lab)
    y += 5
    row(y, "-  BIAYA RADIOLOGI", faktur.rad)
    y += 5
    row(y, "-  BIAYA KAMAR", faktur.kamar)
    y += 5
    row(y, "-  BIAYA BAHAN HABIS PAKAI (BHP)", faktur.bhp)
    y += 5
    row(y, "-  BIAYA ALAT", faktur.alat)
    y += 5
    row(y, "-  BIAYA AMBULAN", faktur.ambulan)
    y += 5
    row(y, "-  BIAYA FISIOTERAPI", faktur.fisio)
    y += 5
    row(y, "-  BIAYA ADMINISTRASI DAN LAINNYA", Decimal(faktur.lainnya or 0) + Decimal(faktur.adm or 0))

    if Decimal(faktur.ppn_farmasi or 0) > 0:
        y += 5
        row(y, "-  PPN OBAT", faktur.ppn_farmasi)

    if faktur.is_cob and Decimal(faktur.tanggungan_bpjs or 0) > 0:
        y += 5
        row(y, "-  DITANGGUNG BPJS (INA-CBGs)", faktur.tanggungan_bpjs, is_negative=True)

    y += 5
    row(y, "-  JUMLAH YANG SUDAH DIBAYAR", jml_bayar, is_negative=True)

    y += 5
    pdf.set_font('Times', 'B', 12)
    pdf.set_xy(147, y)
    pdf.cell(20, 5, "Total", 0, 0, 'R')
    pdf.set_xy(170, y)
    pdf.cell(30, 5, f"{ttl_tagihan:,.2f}", 0, 0, 'R')
    pdf.line(142, y, 200, y)

    if faktur.xround == 'Y':
        y += 5
        pembulatan = ttl_tagihan.to_integral_value(rounding='ROUND_CEILING')
        pdf.set_font('Times', 'B', 12)
        pdf.set_xy(147, y)
        pdf.cell(20, 5, "Pembulatan", 0, 0, 'R')
        pdf.set_xy(170, y)
        pdf.cell(30, 5, f"{pembulatan:,.2f}", 0, 0, 'R')
        pdf.line(142, y, 200, y)
        pdf.line(142, y + 5, 200, y + 5)

    if mode == 'invoice_ppn':
        note_y = 185
        words_y = 190
    else:
        note_y = 175
        words_y = 180

    pdf.set_font('Times', 'I', 11)
    pdf.text(20, note_y, "#REKAPITULASI & BACKUP TERLAMPIR")
    pdf.set_xy(19, words_y)
    pdf.multi_cell(180, 5, f"#{terbilang} Rupiah#", 0, 'J')

    pdf.line(20, 200, 200, 200)
    pdf.line(20, 201, 200, 201)

    pdf.set_font('Times', '', 10)
    pdf.text(20, 209, "Jangka waktu pelunasan maksimal 14 hari setelah")
    pdf.text(20, 213, "diterimanya tagihan ini, ke rekening Kami")
    pdf.set_font('Times', 'B', 12)
    pdf.text(20, 219, "No. 777.998.9978")
    pdf.set_font('Times', '', 10)
    pdf.text(20, 223, "Bank Syariah Indonesia (BSI)")
    pdf.set_font('Times', 'B', 10)
    pdf.text(20, 227, "a.n. RS Siaga Al Munawwarah")
    pdf.set_font('Times', '', 10)
    pdf.text(20, 250, "cc.")
    pdf.text(25, 250, "- Akuntansi RS-SAMS")
    pdf.text(25, 254, "- Arsip")
    pdf.text(148, 209, "RS. SIAGA AL MUNAWWARAH")
    pdf.text(164, 213, "SAMARINDA")
    pdf.text(150, 246, "Nevi Nevada, S.Ip., M.M.")

    pdf_bytes = bytes(pdf.output(dest='S'))

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Invoice_{faktur.nomor_faktur}.pdf"'
    return response

def render_rincian_pdf_response(faktur, mode='rincian'):
    pdf = FPDF('P', 'mm', (330, 216))
    pdf.set_auto_page_break(False)
    pdf.add_page()
    print("WIDTH =", pdf.w)
    print("HEIGHT =", pdf.h)

    tanggal = faktur.tanggal or timezone.localdate()
    tgl = f"{tanggal.day:02d}-{tanggal.month:02d}-{tanggal.year}"
    no_invoice = _legacy_invoice_number(faktur)

    rows = get_invoice_kunjungan_rows(faktur)

    pdf.set_font('Times', '', 11)
    pdf.set_x(10)
    pdf.cell(57, 5, 'LAMPIRAN', 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(195, 5, 'Nomor Invoice', 0, 0, 'L')
    pdf.set_x(35)
    pdf.cell(57, 5, f': {no_invoice}', 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(195, 5, 'Tanggal', 0, 0, 'L')
    pdf.set_x(35)
    pdf.cell(57, 5, f': {tgl}', 0, 1, 'L')

    pdf.set_font('Times', '', 9)
    pdf.set_x(10)
    pdf.cell(310, 5, '-' * 300, 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(10, 5, 'NO.', 0, 0, 'L')
    pdf.set_x(20)
    pdf.cell(10, 5, 'NAMA PASIEN', 0, 0, 'L')
    pdf.set_x(75)
    pdf.cell(20, 5, 'TANGGAL', 0, 0, 'R')
    pdf.set_x(95)
    pdf.cell(20, 5, 'JASA', 0, 0, 'R')
    pdf.set_x(115)
    pdf.cell(20, 5, 'TINDAKAN', 0, 0, 'R')
    pdf.set_x(135)
    pdf.cell(20, 5, 'FARMASI', 0, 0, 'R')
    pdf.set_x(158)
    pdf.cell(15, 5, 'LAB', 0, 0, 'R')
    pdf.set_x(175)
    pdf.cell(15, 5, 'RAD', 0, 0, 'R')
    pdf.set_x(187)
    pdf.cell(20, 5, 'KAMAR', 0, 0, 'R')
    pdf.set_x(205)
    pdf.cell(20, 5, 'BHP', 0, 0, 'R')
    pdf.set_x(222)
    pdf.cell(20, 5, 'ALAT', 0, 0, 'R')
    pdf.set_x(243)
    pdf.cell(15, 5, 'AMB', 0, 0, 'R')
    pdf.set_x(255)
    pdf.cell(20, 5, 'ADM &', 0, 0, 'R')
    pdf.set_x(277)
    pdf.cell(20, 5, 'JML BAYAR', 0, 0, 'R')
    pdf.set_x(300)
    pdf.cell(20, 5, 'TOTAL', 0, 0, 'R')
    pdf.ln(4)
    pdf.set_x(255)
    pdf.cell(20, 5, 'LAINNYA', 0, 0, 'R')
    pdf.ln(4)

    pdf.set_x(10)
    pdf.cell(310, 5, '-' * 300, 0, 1, 'L')

    totals = {
        'jasa': Decimal('0'),
        'tindakan': Decimal('0'),
        'farmasi': Decimal('0'),
        'lab': Decimal('0'),
        'rad': Decimal('0'),
        'kamar': Decimal('0'),
        'bhp': Decimal('0'),
        'alat': Decimal('0'),
        'ambulan': Decimal('0'),
        'fisio': Decimal('0'),
        'lainnya': Decimal('0'),
        'jmlbyr': Decimal('0'),
        'ttl': Decimal('0'),
    }

    def d(row, key):
        return Decimal(row.get(key) or 0)

    def fmt(value, dec=0):
        return f"{Decimal(value or 0):,.{dec}f}"

    for idx, row in enumerate(rows, start=1):
        nama = str(row.get('nama') or '')
        noreg = str(row.get('noreg') or '')
        if len(nama) > 23:
            nama_tampil = f"{nama[:23]}... ({noreg})"
        else:
            nama_tampil = f"{nama} ({noreg})"

        tgl_masuk = row.get('tgl_masuk')
        if hasattr(tgl_masuk, 'strftime'):
            tgl_masuk_text = tgl_masuk.strftime('%d-%m-%Y')
        else:
            tgl_masuk_text = str(tgl_masuk or '')

        lainnya_adm = d(row, 'lainnya') + d(row, 'adm')

        pdf.set_x(10)
        pdf.cell(10, 5, f'{idx}.', 0, 0, 'L')
        pdf.set_x(20)
        pdf.cell(10, 5, nama_tampil, 0, 0, 'L')
        pdf.set_x(75)
        pdf.cell(20, 5, tgl_masuk_text, 0, 0, 'R')
        pdf.set_x(95)
        pdf.cell(20, 5, fmt(d(row, 'jasa'), 0), 0, 0, 'R')
        pdf.set_x(115)
        pdf.cell(20, 5, fmt(d(row, 'tindakan'), 0), 0, 0, 'R')
        pdf.set_x(135)
        pdf.cell(20, 5, fmt(d(row, 'farmasi'), 2), 0, 0, 'R')
        pdf.set_x(158)
        pdf.cell(15, 5, fmt(d(row, 'lab'), 0), 0, 0, 'R')
        pdf.set_x(175)
        pdf.cell(15, 5, fmt(d(row, 'rad'), 0), 0, 0, 'R')
        pdf.set_x(187)
        pdf.cell(20, 5, fmt(d(row, 'kamar'), 0), 0, 0, 'R')
        pdf.set_x(205)
        pdf.cell(20, 5, fmt(d(row, 'bhp'), 0), 0, 0, 'R')
        pdf.set_x(222)
        pdf.cell(20, 5, fmt(d(row, 'alat'), 0), 0, 0, 'R')
        pdf.set_x(238)
        pdf.cell(20, 5, fmt(d(row, 'ambulan'), 0), 0, 0, 'R')
        pdf.set_x(255)
        pdf.cell(20, 5, fmt(lainnya_adm, 0), 0, 0, 'R')
        pdf.set_x(277)
        pdf.cell(20, 5, fmt(d(row, 'jmlbyr'), 2), 0, 0, 'R')
        pdf.set_x(300)
        pdf.cell(20, 5, fmt(d(row, 'ttl'), 2), 0, 0, 'R')
        pdf.ln(5)

        totals['jasa'] += d(row, 'jasa')
        totals['tindakan'] += d(row, 'tindakan')
        totals['farmasi'] += d(row, 'farmasi')
        totals['lab'] += d(row, 'lab')
        totals['rad'] += d(row, 'rad')
        totals['kamar'] += d(row, 'kamar')
        totals['bhp'] += d(row, 'bhp')
        totals['alat'] += d(row, 'alat')
        totals['ambulan'] += d(row, 'ambulan')
        totals['fisio'] += d(row, 'fisio')
        totals['lainnya'] += lainnya_adm
        totals['jmlbyr'] += d(row, 'jmlbyr')
        totals['ttl'] += d(row, 'ttl')

    pdf.set_x(10)
    pdf.cell(310, 5, '-' * 300, 0, 1, 'L')

    pdf.set_x(75)
    pdf.cell(20, 5, '', 0, 0, 'R')
    pdf.set_x(95)
    pdf.cell(20, 5, fmt(totals['jasa'], 0), 0, 0, 'R')
    pdf.set_x(115)
    pdf.cell(20, 5, fmt(totals['tindakan'], 0), 0, 0, 'R')
    pdf.set_x(135)
    pdf.cell(20, 5, fmt(totals['farmasi'], 2), 0, 0, 'R')
    pdf.set_x(158)
    pdf.cell(15, 5, fmt(totals['lab'], 0), 0, 0, 'R')
    pdf.set_x(175)
    pdf.cell(15, 5, fmt(totals['rad'], 0), 0, 0, 'R')
    pdf.set_x(187)
    pdf.cell(20, 5, fmt(totals['kamar'], 0), 0, 0, 'R')
    pdf.set_x(205)
    pdf.cell(20, 5, fmt(totals['bhp'], 0), 0, 0, 'R')
    pdf.set_x(222)
    pdf.cell(20, 5, fmt(totals['alat'], 0), 0, 0, 'R')
    pdf.set_x(238)
    pdf.cell(20, 5, fmt(totals['ambulan'], 0), 0, 0, 'R')
    pdf.set_x(255)
    pdf.cell(20, 5, fmt(totals['lainnya'], 0), 0, 0, 'R')
    pdf.set_x(277)
    pdf.cell(20, 5, fmt(totals['jmlbyr'], 2), 0, 0, 'R')
    pdf.set_x(300)
    pdf.cell(20, 5, fmt(totals['ttl'], 2), 0, 0, 'R')

    pdf.ln(4)
    pdf.set_x(10)
    pdf.cell(310, 5, '-' * 300, 0, 1, 'L')

    if faktur.is_cob and Decimal(faktur.tanggungan_bpjs or 0) > 0:
        total_real = totals['ttl']
        tanggungan = Decimal(faktur.tanggungan_bpjs)
        net_tagihan = max(Decimal('0'), total_real - tanggungan)

        pdf.set_font('Times', 'B', 9)
        pdf.set_x(230)
        pdf.cell(50, 5, 'TOTAL BIAYA RIIL RS:', 0, 0, 'R')
        pdf.set_x(280)
        pdf.cell(40, 5, f"Rp. {fmt(total_real, 2)}", 0, 1, 'R')

        pdf.set_x(230)
        pdf.cell(50, 5, 'DITANGGUNG BPJS (INA-CBGs):', 0, 0, 'R')
        pdf.set_x(280)
        pdf.cell(40, 5, f"- Rp. {fmt(tanggungan, 2)}", 0, 1, 'R')

        pdf.set_x(230)
        pdf.cell(50, 5, 'NET TAGIHAN ASURANSI:', 0, 0, 'R')
        pdf.set_x(280)
        pdf.cell(40, 5, f"Rp. {fmt(net_tagihan, 2)}", 0, 1, 'R')

        pdf.set_x(10)
        pdf.cell(310, 5, '-' * 300, 0, 1, 'L')

    pdf_bytes = bytes(pdf.output(dest='S'))

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Rincian_Invoice_{faktur.nomor_faktur}.pdf"'
    return response

def render_rincian_ppn_pdf_response(faktur, mode='rincian_ppn'):
    pdf = FPDF('P', 'mm', (330, 216))
    pdf.set_auto_page_break(False)
    pdf.add_page()

    tanggal = faktur.tanggal or timezone.localdate()
    tgl = f"{tanggal.day:02d}-{tanggal.month:02d}-{tanggal.year}"
    no_invoice = _legacy_invoice_number(faktur)

    rows = get_invoice_kunjungan_rows(faktur)

    pdf.set_font('Times', '', 11)
    pdf.set_x(10)
    pdf.cell(57, 5, 'LAMPIRAN', 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(195, 5, 'Nomor Invoice', 0, 0, 'L')
    pdf.set_x(35)
    pdf.cell(57, 5, f': {no_invoice}', 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(195, 5, 'Tanggal', 0, 0, 'L')
    pdf.set_x(35)
    pdf.cell(57, 5, f': {tgl}', 0, 1, 'L')

    pdf.set_font('Times', '', 9)

    pdf.set_x(10)
    pdf.cell(300, 5, '-' * 292, 0, 1, 'L')

    pdf.set_x(10)
    pdf.cell(10, 5, 'NO.', 0, 0, 'L')
    pdf.set_x(20)
    pdf.cell(10, 5, 'NAMA PASIEN', 0, 0, 'L')
    pdf.set_x(75)
    pdf.cell(25, 5, 'TANGGAL', 0, 0, 'R')
    pdf.set_x(95)
    pdf.cell(20, 5, 'JASA', 0, 0, 'R')
    pdf.set_x(115)
    pdf.cell(20, 5, 'TINDAKAN', 0, 0, 'R')
    pdf.set_x(135)
    pdf.cell(20, 5, 'OBAT', 0, 0, 'R')
    pdf.set_x(163)
    pdf.cell(9, 5, 'PPN', 0, 0, 'R')
    pdf.set_x(168)
    pdf.cell(15, 5, 'EMBA', 0, 0, 'R')
    pdf.set_x(185)
    pdf.cell(15, 5, 'LAB', 0, 0, 'R')
    pdf.set_x(197)
    pdf.cell(20, 5, 'RAD', 0, 0, 'R')
    pdf.set_x(215)
    pdf.cell(20, 5, 'BHP', 0, 0, 'R')
    pdf.set_x(230)
    pdf.cell(20, 5, 'ALAT', 0, 0, 'R')
    pdf.set_x(249)
    pdf.cell(15, 5, 'AMB', 0, 0, 'R')
    pdf.set_x(260)
    pdf.cell(20, 5, 'ADM &', 0, 0, 'R')
    pdf.set_x(277)
    pdf.cell(20, 5, 'JUMLAH', 0, 0, 'R')
    pdf.set_x(300)
    pdf.cell(20, 5, 'TOTAL', 0, 0, 'R')
    pdf.ln(4)

    pdf.set_x(152)
    pdf.cell(20, 5, 'OBAT', 0, 0, 'R')
    pdf.set_x(260)
    pdf.cell(20, 5, 'LAINNYA', 0, 0, 'R')
    pdf.set_x(277)
    pdf.cell(20, 5, 'BAYAR', 0, 0, 'R')
    pdf.ln(4)

    pdf.set_x(10)
    pdf.cell(300, 5, '-' * 292, 0, 1, 'L')

    totals = {
        'jasa': Decimal('0'),
        'tindakan': Decimal('0'),
        'obat': Decimal('0'),
        'ppn_obat': Decimal('0'),
        'embalasi': Decimal('0'),
        'lab': Decimal('0'),
        'rad': Decimal('0'),
        'bhp': Decimal('0'),
        'alat': Decimal('0'),
        'ambulan': Decimal('0'),
        'lainnya': Decimal('0'),
        'jmlbyr': Decimal('0'),
        'ttl': Decimal('0'),
    }

    def d(row, key):
        return Decimal(row.get(key) or 0)

    def fmt(value, dec=0):
        return f"{Decimal(value or 0):,.{dec}f}"

    for idx, row in enumerate(rows, start=1):
        nama = str(row.get('nama') or '')
        noreg = str(row.get('noreg') or '')

        if len(nama) > 23:
            nama_tampil = f"{nama[:23]}... ({noreg})"
        else:
            nama_tampil = f"{nama} ({noreg})"

        tgl_masuk = row.get('tgl_masuk')
        if hasattr(tgl_masuk, 'strftime'):
            tgl_masuk_text = tgl_masuk.strftime('%d-%m-%Y')
        else:
            tgl_masuk_text = str(tgl_masuk or '')

        farmasi_ppn = get_kunjungan_farmasi_ppn_detail(row.get('no'))

        obat = farmasi_ppn['obat']
        ppn_obat = farmasi_ppn['ppn_obat']
        embalasi = farmasi_ppn['embalasi']
        lainnya_adm = d(row, 'lainnya') + d(row, 'adm')

        pdf.set_x(10)
        pdf.cell(10, 5, f'{idx}.', 0, 0, 'L')
        pdf.set_x(20)
        pdf.cell(10, 5, nama_tampil, 0, 0, 'L')
        pdf.set_x(75)
        pdf.cell(25, 5, tgl_masuk_text, 0, 0, 'R')
        pdf.set_x(95)
        pdf.cell(20, 5, fmt(d(row, 'jasa'), 0), 0, 0, 'R')
        pdf.set_x(115)
        pdf.cell(20, 5, fmt(d(row, 'tindakan'), 0), 0, 0, 'R')
        pdf.set_x(135)
        pdf.cell(20, 5, fmt(obat, 2), 0, 0, 'R')
        pdf.set_x(152)
        pdf.cell(20, 5, fmt(ppn_obat, 2), 0, 0, 'R')
        pdf.set_x(168)
        pdf.cell(15, 5, fmt(embalasi, 0), 0, 0, 'R')
        pdf.set_x(185)
        pdf.cell(15, 5, fmt(d(row, 'lab'), 0), 0, 0, 'R')
        pdf.set_x(197)
        pdf.cell(20, 5, fmt(d(row, 'rad'), 0), 0, 0, 'R')
        pdf.set_x(215)
        pdf.cell(20, 5, fmt(d(row, 'bhp'), 0), 0, 0, 'R')
        pdf.set_x(230)
        pdf.cell(20, 5, fmt(d(row, 'alat'), 0), 0, 0, 'R')
        pdf.set_x(244)
        pdf.cell(20, 5, fmt(d(row, 'ambulan'), 0), 0, 0, 'R')
        pdf.set_x(260)
        pdf.cell(20, 5, fmt(lainnya_adm, 0), 0, 0, 'R')
        pdf.set_x(277)
        pdf.cell(20, 5, fmt(d(row, 'jmlbyr'), 2), 0, 0, 'R')
        pdf.set_x(300)
        pdf.cell(20, 5, fmt(d(row, 'ttl'), 2), 0, 0, 'R')
        pdf.ln(5)

        totals['jasa'] += d(row, 'jasa')
        totals['tindakan'] += d(row, 'tindakan')
        totals['obat'] += obat
        totals['ppn_obat'] += ppn_obat
        totals['embalasi'] += embalasi
        totals['lab'] += d(row, 'lab')
        totals['rad'] += d(row, 'rad')
        totals['bhp'] += d(row, 'bhp')
        totals['alat'] += d(row, 'alat')
        totals['ambulan'] += d(row, 'ambulan')
        totals['lainnya'] += lainnya_adm
        totals['jmlbyr'] += d(row, 'jmlbyr')
        totals['ttl'] += d(row, 'ttl')

    pdf.set_x(10)
    pdf.cell(300, 5, '-' * 292, 0, 1, 'L')

    pdf.set_x(75)
    pdf.cell(20, 5, '', 0, 0, 'R')
    pdf.set_x(95)
    pdf.cell(20, 5, fmt(totals['jasa'], 0), 0, 0, 'R')
    pdf.set_x(115)
    pdf.cell(20, 5, fmt(totals['tindakan'], 0), 0, 0, 'R')
    pdf.set_x(135)
    pdf.cell(20, 5, fmt(totals['obat'], 2), 0, 0, 'R')
    pdf.set_x(152)
    pdf.cell(20, 5, fmt(totals['ppn_obat'], 2), 0, 0, 'R')
    pdf.set_x(168)
    pdf.cell(15, 5, fmt(totals['embalasi'], 0), 0, 0, 'R')
    pdf.set_x(185)
    pdf.cell(15, 5, fmt(totals['lab'], 0), 0, 0, 'R')
    pdf.set_x(197)
    pdf.cell(20, 5, fmt(totals['rad'], 0), 0, 0, 'R')
    pdf.set_x(215)
    pdf.cell(20, 5, fmt(totals['bhp'], 0), 0, 0, 'R')
    pdf.set_x(230)
    pdf.cell(20, 5, fmt(totals['alat'], 0), 0, 0, 'R')
    pdf.set_x(244)
    pdf.cell(20, 5, fmt(totals['ambulan'], 0), 0, 0, 'R')
    pdf.set_x(260)
    pdf.cell(20, 5, fmt(totals['lainnya'], 0), 0, 0, 'R')
    pdf.set_x(277)
    pdf.cell(20, 5, fmt(totals['jmlbyr'], 2), 0, 0, 'R')
    pdf.set_x(300)
    pdf.cell(20, 5, fmt(totals['ttl'], 2), 0, 0, 'R')

    pdf.ln(4)
    pdf.set_x(10)
    pdf.cell(300, 5, '-' * 292, 0, 1, 'L')

    pdf_bytes = bytes(pdf.output(dest='S'))

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Rincian_Invoice_PPN_{faktur.nomor_faktur}.pdf"'
    return response


def _kwitansi_rupiah(value):
    amount = Decimal(value or 0).quantize(Decimal('1'))
    return f"Rp {int(amount):,}".replace(',', '.') + ",-"


def _pdf_wrap_line(pdf, text, max_width):
    words = str(text or '').split()
    if not words:
        return ['']
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.get_string_width(candidate) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def render_kwitansi_pdf_response(faktur):
    pdf = FPDF('P', 'mm', 'A4')
    pdf.set_auto_page_break(False)
    pdf.add_page()

    margin_x = 8
    tanggal_obj = faktur.tanggal or timezone.localdate()
    tanggal_str = f"{tanggal_obj.day:02d} {_ID_MONTHS[tanggal_obj.month]} {tanggal_obj.year}"
    no_kwitansi = _legacy_invoice_number(faktur)

    pembiayaan_detail = get_pembiayaan_detail(faktur.id_pembiayaan)
    nama_pbiaya = (
        pembiayaan_detail.get('pembiayaan')
        or _invoice_pembiayaan_name(faktur)
        or 'PEMBIAYAAN'
    )

    ttl_tagihan, jml_bayar = _invoice_print_amounts(faktur)
    if faktur.xround == 'Y':
        total_tagihan = ttl_tagihan.to_integral_value(rounding='ROUND_CEILING')
    else:
        total_tagihan = ttl_tagihan.quantize(Decimal('1'))
    terbilang = f"{_legacy_words(total_tagihan).title()} Rupiah"
    terbilang_words = terbilang.split()
    terbilang_line_1 = terbilang
    terbilang_line_2 = ''
    if len(terbilang) > 58:
        split_at = max(1, len(terbilang_words) // 2)
        terbilang_line_1 = ' '.join(terbilang_words[:split_at])
        terbilang_line_2 = ' '.join(terbilang_words[split_at:])
    amount_plain = f"{int(total_tagihan):,}".replace(',', '.')
    jenis_lines = [
        line.strip().upper()
        for line in str(faktur.jenis or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')
        if line.strip()
    ]
    periode_text = str(faktur.periode or '').strip().upper()
    if not jenis_lines:
        jenis_lines = ['']
    pembayaran_lines = []
    for index, line in enumerate(jenis_lines):
        prefix = 'BIAYA ' if index == 0 else ''
        pembayaran_lines.append(f"{prefix}{line}".strip())
    if periode_text:
        periode_suffix = f"PERIODE {periode_text}"
        if pembayaran_lines[-1]:
            pembayaran_lines[-1] = f"{pembayaran_lines[-1]} {periode_suffix}"
        else:
            pembayaran_lines[-1] = periode_suffix
    pembayaran_lines = pembayaran_lines[:4]

    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.25)
    pdf.rect(0.8, 0.8, 208.4, 146.4)

    logo_path = get_invoice_logo_path()
    if logo_path:
        pdf.image(logo_path, x=168, y=3, h=21)

    pdf.set_font('Times', 'B', 18)
    pdf.set_xy(38, 8)
    pdf.cell(58, 8, 'KWITANSI', 0, 1, 'C')
    pdf.line(41, 16, 94, 16)
    pdf.set_font('Arial', '', 9)
    pdf.set_xy(40, 18)
    pdf.cell(80, 5, f"NO.  {no_kwitansi}", 0, 1, 'L')

    pdf.set_xy(18, 32)
    pdf.set_font('Arial', 'B', 9)
    pdf.cell(39, 4, 'SUDAH TERIMA DARI', 0, 0, 'L')
    pdf.set_font('Arial', 'B', 9)
    pdf.cell(92, 4, str(nama_pbiaya), 0, 1, 'L')
    pdf.set_x(18)
    pdf.set_font('Arial', '', 9)
    pdf.cell(39, 4, 'RECEIVED FROM', 0, 1, 'L')

    box_x = 16
    box_y = 45
    box_w = 178
    box_h = 33
    pdf.rect(box_x, box_y, box_w, box_h)

    pdf.set_xy(box_x + 2, box_y + 4)
    pdf.set_font('Arial', 'B', 9)
    pdf.cell(40, 4, 'UANG SEJUMLAH', 0, 1, 'L')
    pdf.set_x(box_x + 2)
    pdf.set_font('Arial', '', 9)
    pdf.cell(40, 4, 'THE SUM OF', 0, 1, 'L')

    words_x = box_x + 45
    words_y = box_y + 4
    words_w = box_w - 48
    pdf.set_fill_color(205, 205, 205)
    pdf.rect(words_x, words_y, words_w, 9, 'DF')
    pdf.set_xy(words_x + 2, words_y + 1.7)
    pdf.set_font('Times', 'I', 9.5)
    pdf.cell(words_w - 4, 5, terbilang_line_1, 0, 1, 'C')

    pdf.set_fill_color(205, 205, 205)
    pdf.rect(box_x + 4, box_y + 17, box_w - 8, 9, 'DF')
    pdf.set_xy(box_x + 12, box_y + 18.7)
    pdf.set_font('Times', 'I', 9.5)
    pdf.cell(box_w - 20, 5, terbilang_line_2, 0, 1, 'L')

    pay_y = 80
    pay_h = 29
    pdf.rect(box_x, pay_y, box_w, pay_h)
    pdf.set_xy(box_x + 2, pay_y + 4)
    pdf.set_font('Arial', 'B', 9)
    pdf.cell(43, 4, 'UNTUK PEMBAYARAN', 0, 0, 'L')
    pdf.set_font('Arial', '', 9)
    pdf.cell(3, 4, ':', 0, 0, 'C')
    pdf.set_font('Arial', '', 8.6)
    text_x = box_x + 48
    text_y = pay_y + 4.1
    text_w = box_w - 51
    payment_line_gap = 6.3
    wrapped_payment_lines = []
    for line in pembayaran_lines:
        wrapped_payment_lines.extend(_pdf_wrap_line(pdf, line, text_w))
    wrapped_payment_lines = wrapped_payment_lines[:4]
    for index, line in enumerate(wrapped_payment_lines):
        pdf.set_xy(text_x, text_y + (index * payment_line_gap))
        pdf.cell(text_w, 4.2, line, 0, 1, 'L')
    pdf.set_xy(box_x + 2, pay_y + 8)
    pdf.set_x(box_x + 2)
    pdf.set_font('Arial', '', 9)
    pdf.cell(43, 4, 'IN PAYMENT OF', 0, 1, 'L')

    for y in (pay_y + 8.9, pay_y + 15.2, pay_y + 21.5, pay_y + 27.8):
        pdf.line(box_x + 48, y, box_x + box_w - 3, y)

    sign_x = 119
    sign_w = 72
    pdf.set_xy(sign_x, 111)
    pdf.set_font('Arial', '', 9)
    pdf.cell(sign_w, 5, f"Samarinda, {tanggal_str}", 0, 1, 'C')

    pdf.set_fill_color(205, 205, 205)
    amount_x = 18
    amount_y = 122
    pdf.rect(amount_x + 7, amount_y, 74, 8, 'DF')
    pdf.set_xy(amount_x + 7, amount_y + 1.3)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(74, 5, f"Rp {amount_plain},-", 0, 1, 'C')

    pdf.set_xy(sign_x, 142)
    pdf.set_font('Arial', '', 9)
    pdf.cell(sign_w, 4, 'Nevi Nevada, S.Ip., M.M.', 0, 1, 'C')

    pdf_bytes = bytes(pdf.output(dest='S'))
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Kwitansi_{faktur.nomor_faktur}.pdf"'
    return response


def _render_legacy_invoice(faktur, mode):
    """Replicate exact FPDF output from app_siaga print_invoice.php"""
    total, jml_bayar = _invoice_print_amounts(faktur)
    
    # Build cost rows dengan labels yang persis sama seperti PHP
    cost_rows_html = []
    
    # BIAYA JASA
    if faktur.jasa and faktur.jasa != 0:
        cost_rows_html.append((f"-  BIAYA JASA", faktur.jasa))
    
    # BIAYA TINDAKAN
    if faktur.tindakan and faktur.tindakan != 0:
        cost_rows_html.append((f"-  BIAYA TINDAKAN", faktur.tindakan))
    
    # BIAYA FARMASI (farmasi - ppn_farmasi jika ada)
    if faktur.farmasi and faktur.farmasi != 0:
        farmasi_display = faktur.farmasi - (faktur.ppn_farmasi or 0)
        if farmasi_display != 0:
            cost_rows_html.append((f"-  BIAYA FARMASI", farmasi_display))
    
    # BIAYA LABORATORIUM
    if faktur.lab and faktur.lab != 0:
        cost_rows_html.append((f"-  BIAYA LABORATORIUM", faktur.lab))
    
    # BIAYA RADIOLOGI
    if faktur.rad and faktur.rad != 0:
        cost_rows_html.append((f"-  BIAYA RADIOLOGI", faktur.rad))
    
    # BIAYA KAMAR
    if faktur.kamar and faktur.kamar != 0:
        cost_rows_html.append((f"-  BIAYA KAMAR", faktur.kamar))
    
    # BIAYA BAHAN HABIS PAKAI (BHP)
    if faktur.bhp and faktur.bhp != 0:
        cost_rows_html.append((f"-  BIAYA BAHAN HABIS PAKAI (BHP)", faktur.bhp))
    
    # BIAYA ALAT
    if faktur.alat and faktur.alat != 0:
        cost_rows_html.append((f"-  BIAYA ALAT", faktur.alat))
    
    # BIAYA AMBULAN
    if faktur.ambulan and faktur.ambulan != 0:
        cost_rows_html.append((f"-  BIAYA AMBULAN", faktur.ambulan))
    
    # BIAYA FISIOTERAPI
    if faktur.fisio and faktur.fisio != 0:
        cost_rows_html.append((f"-  BIAYA FISIOTERAPI", faktur.fisio))
    
    # BIAYA ADMINISTRASI DAN LAINNYA
    if (faktur.lainnya or faktur.adm) and (faktur.lainnya or 0) + (faktur.adm or 0) != 0:
        cost_rows_html.append((f"-  BIAYA ADMINISTRASI DAN LAINNYA", (faktur.lainnya or 0) + (faktur.adm or 0)))
    
    # PPN OBAT (jika ppn=False dan ppn_farmasi > 0)
    if mode != 'invoice_ppn' and faktur.ppn_farmasi and faktur.ppn_farmasi > 0:
        cost_rows_html.append((f"-  PPN OBAT", faktur.ppn_farmasi))

    if faktur.is_cob and Decimal(faktur.tanggungan_bpjs or 0) > 0:
        cost_rows_html.append((f"-  DITANGGUNG BPJS (INA-CBGs)", -Decimal(faktur.tanggungan_bpjs)))

    cost_rows_html.append(("-  JUMLAH PEMBAYARAN", jml_bayar))
    
    # Build HTML untuk cost items
    cost_items_html = []
    for label, value in cost_rows_html:
        cost_items_html.append(
            f"<div style=\"display: flex; margin-bottom: 1px;\">"
            f"  <div style=\"flex: 1; font-size: 11px;\">{escape(label)}</div>"
            f"  <div style=\"width: 50px; text-align: right; font-size: 11px;\">Rp.</div>"
            f"  <div style=\"width: 95px; text-align: right; font-size: 11px;\">{_invoice_money(value, 2)}</div>"
            f"</div>"
        )
    cost_items_str = ''.join(cost_items_html)
    
    # Total row (bold)
    total_html = (
        f"<div style=\"display: flex; margin-bottom: 1px; border-top: 1px solid #000; padding-top: 1px; font-weight: bold; font-size: 12px;\">"
        f"  <div style=\"flex: 1;\">Total</div>"
        f"  <div style=\"width: 50px; text-align: right;\">Rp.</div>"
        f"  <div style=\"width: 95px; text-align: right;\">{_invoice_money(total, 2)}</div>"
        f"</div>"
    )
    
    tanggal_obj = faktur.tanggal or timezone.localdate()
    tanggal_str = f"{tanggal_obj.day:02d} {_ID_MONTHS[tanggal_obj.month]} {tanggal_obj.year}"
    
    pembiayaan_detail = get_pembiayaan_detail(faktur.id_pembiayaan)

    nama_pbiaya = (
        pembiayaan_detail.get('pembiayaan')
        or _invoice_pembiayaan_name(faktur)
        or 'PEMBIAYAAN'
    )

    alamat = pembiayaan_detail.get('alamat') or ''

    alamat_html = ''
    if alamat.strip():
        alamat_html = f"<div style=\"font-size: 11px;\">{escape(alamat)}</div>"
    
    # Terbilang conversion
    terbilang = _legacy_words(total).upper()
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {escape(faktur.nomor_faktur)}</title>
    <style>
        @page {{ size: A4 portrait; margin: 13mm 15mm 10mm 15mm; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000; line-height: 1.3; }}
        .container {{ width: 100%; position: relative; }}
        .header {{ position: relative; height: 18mm; margin-bottom: 0; }}
        .logo {{ position: absolute; right: 0; top: -5px; height: 65px; text-align: right; }}
        .logo img {{ height: 65px; width: auto; max-height: 65px; object-fit: contain; }}
        h1 {{ text-align: center; font-size: 16px; font-weight: bold; text-decoration: underline; margin: 2mm 0; letter-spacing: 0; }}
        .content {{ margin-top: 1mm; }}
        .to-section {{ margin-bottom: 1.5mm; line-height: 1.5; font-size: 11px; }}
        .meta-section {{ display: flex; justify-content: space-between; margin-bottom: 1mm; font-size: 11px; line-height: 1.5; }}
        .meta-left {{ width: 45%; }}
        .meta-right {{ width: 45%; text-align: left; }}
        .divider {{ border-top: 1px solid #000; border-bottom: 1px solid #000; height: 2px; margin: 1mm 0; }}
        .desc {{ margin-bottom: 2mm; font-size: 11px; line-height: 1.5; }}
        .costs {{ margin-bottom: 2mm; font-size: 11px; }}
        .note {{ margin: 1.5mm 0 1mm 0; font-style: italic; font-size: 11px; }}
        .words {{ margin-bottom: 2mm; font-style: italic; font-size: 11px; }}
        .divider-double {{ border-top: 3px double #000; margin: 1.5mm 0; }}
        .bank {{ margin-bottom: 2mm; font-size: 10px; line-height: 1.5; }}
        .footer {{ display: flex; justify-content: space-between; margin-top: 2mm; font-size: 11px; line-height: 1.5; }}
        .cc {{ }}
        .signature {{ text-align: right; }}
        .sig-space {{ height: 18mm; }}
        .sig-name {{ font-weight: bold; text-decoration: underline; }}
        .print-btn {{ position: fixed; top: 10px; right: 10px; padding: 8px 12px; background: #0f766e; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 11px; z-index: 1000; }}
        @media print {{ .print-btn {{ display: none; }} }}
    </style>
</head>
<body onload="setTimeout(() => window.print(), 250)">
    <button class="print-btn" onclick="window.print()">Print</button>
    
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="/static/images/logo-1.jpg" alt="Logo">
            </div>
        </div>
        
        <h1>INVOICE</h1>
        
        <div class="content">
            <div class="to-section">
                <div>Kepada Yth.</div>
                <div>Bagian Keuangan</div>
                <div style="margin-top: 1mm;"><b>{escape(nama_pbiaya)}</b></div>
                {alamat_html}
            </div>
            
            <div class="meta-section">
                <div class="meta-left"></div>
                <div class="meta-right">
                    <div style="display: flex;"><div style="width: 50px;">Nomor</div><div>: {escape(_legacy_invoice_number(faktur))}</div></div>
                    <div style="display: flex;"><div style="width: 50px;">Tanggal</div><div>: {tanggal_str}</div></div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="desc">
                <div>{escape(faktur.jenis or 'RAWAT INAP')}</div>
                <div>BEBAN {escape(faktur.beban or 'RUMAH SAKIT')}</div>
                <div>PERIODE : {escape(faktur.periode or '')}</div>
            </div>
            
            <div class="costs">
                {cost_items_str}
                {total_html}
            </div>
            
            <div class="note">#REKAPITULASI &amp; BACKUP TERLAMPIR</div>
            
            <div class="words">#{terbilang} RUPIAH#</div>
            
            <div class="divider-double"></div>
            
            <div class="bank">
                <div>Jangka waktu pelunasan maksimal 14 hari setelah</div>
                <div>diterimanya tagihan ini, ke rekening Kami</div>
                <div style="font-weight: bold; margin-top: 0.5mm;">No. 777.998.9978</div>
                <div>Bank Syariah Indonesia (BSI)</div>
                <div style="font-weight: bold;">a.n. RS Siaga Al Munawwarah</div>
            </div>
            
            <div class="footer">
                <div class="cc">
                    <div>cc.</div>
                    <div>- Akuntansi RS-SAMS</div>
                    <div>- Arsip</div>
                </div>
                <div class="signature">
                    <div>RS. SIAGA AL MUNAWWARAH</div>
                    <div>SAMARINDA</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">Nevi Nevada, S.Ip., M.M.</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>"""



def _render_legacy_rincian(faktur, mode):
    """Replicate exact FPDF rincian output from app_siaga"""
    rows = _invoice_print_rows(faktur, ppn=mode == 'rincian_ppn')
    
    # Filter out zero values
    filtered_rows = [(label, value) for label, value in rows if value and value != 0]
    
    # Build table rows
    table_rows = []
    for idx, (label, value) in enumerate(filtered_rows, start=1):
        label_text = label.replace('-  ', '').strip()
        table_rows.append(
            f"<tr>"
            f"  <td style=\"width: 45px; text-align: center;\">{idx}</td>"
            f"  <td>{escape(label_text)}</td>"
            f"  <td style=\"width: 160px; text-align: right;\">{_invoice_money(value, 2)}</td>"
            f"</tr>"
        )
    
    table_rows_str = '\n'.join(table_rows)
    total = Decimal(faktur.total_tagihan or 0)
    
    tanggal_obj = faktur.tanggal or timezone.localdate()
    tanggal_str = f"{tanggal_obj.day:02d} {_ID_MONTHS[tanggal_obj.month]} {tanggal_obj.year}"
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Rincian Invoice {escape(faktur.nomor_faktur)}</title>
    <style>
        @page {{ 
            size: A4 landscape; 
            margin: 10mm;
        }}
        * {{ 
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{ 
            font-family: 'Times New Roman', Times, serif;
            font-size: 11px;
            color: #000;
        }}
        .container {{
            width: 100%;
        }}
        h1 {{
            text-align: center;
            font-size: 15px;
            font-weight: bold;
            text-decoration: underline;
            margin-bottom: 3px;
        }}
        .sub {{
            text-align: center;
            margin-bottom: 8px;
            font-size: 11px;
            line-height: 1.4;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }}
        th, td {{
            border: 1px solid #000;
            padding: 5px 6px;
            text-align: left;
        }}
        th {{
            background: #f2f2f2;
            text-align: center;
            font-weight: bold;
        }}
        .num {{
            text-align: right;
        }}
        .summary-row td {{
            font-weight: bold;
            border-top: 2px solid #000;
        }}
        .summary-row .num {{
            text-align: right;
        }}
        .print-btn {{
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            background: #0f766e;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 10px;
            z-index: 1000;
        }}
        @media print {{
            .print-btn {{ display: none; }}
        }}
    </style>
</head>
<body onload="setTimeout(() => window.print(), 250)">
    <button class="print-btn" onclick="window.print()">Print</button>
    
    <div class="container">
        <h1>RINCIAN INVOICE</h1>
        <div class="sub">
            <div>No. {escape(_legacy_invoice_number(faktur))}</div>
            <div>{escape(_invoice_pembiayaan_name(faktur))} - {escape(faktur.periode or '')}</div>
            <div>Tanggal: {tanggal_str}</div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>NO</th>
                    <th>URAIAN</th>
                    <th>JUMLAH</th>
                </tr>
            </thead>
            <tbody>
                {table_rows_str}
                <tr class="summary-row">
                    <td colspan="2">TOTAL</td>
                    <td class="num">{_invoice_money(total, 2)}</td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>"""


@api_view(['GET'])
@permission_classes([AllowAny])
def faktur_legacy_print_view(request, pk):
    faktur = get_object_or_404(Faktur.objects.select_related('pelanggan'), pk=pk)
    mode = request.GET.get('mode', 'invoice')

    if mode in ('invoice', 'invoice_ppn'):
        return render_invoice_pdf_response(faktur, mode)

    if mode == 'rincian':
        return render_rincian_pdf_response(faktur, mode)
    
    if mode == 'rincian_ppn':
        return render_rincian_ppn_pdf_response(faktur, mode)

    if mode == 'kwitansi':
        return render_kwitansi_pdf_response(faktur)
        
    else:
        html = _render_legacy_invoice(faktur, mode)

    return HttpResponse(html)


def _receipt_display_date(value):
    value = (value or '').strip()
    if not value:
        return ''
    try:
        parsed = datetime.strptime(value, '%Y-%m-%d').date()
        return _invoice_date(parsed)
    except ValueError:
        return value


def _render_tanda_terima_invoice(fakturs, company_name, tanggal):
    logo_url = "/logo.png"
    company_name = company_name or '-'
    tanggal_label = _receipt_display_date(tanggal)
    total = sum((Decimal(item.total_tagihan or 0) for item in fakturs), Decimal('0'))

    invoice_rows = []
    for index, faktur in enumerate(fakturs, start=1):
        invoice_rows.append(
            '<tr>'
            f'<td class="row-no">{index}.</td>'
            f'<td class="invoice-no">{escape(_legacy_invoice_number(faktur))}</td>'
            f'<td class="currency">Rp.</td>'
            f'<td class="amount">{_invoice_money(faktur.total_tagihan, 2)}</td>'
            '</tr>'
        )
    rows_html = ''.join(invoice_rows)

    def receipt_html(label):
        return f"""
        <section class="receipt">
            <div class="copy-label">{escape(label)}</div>
            <header class="letterhead">
                <div class="hospital">
                    <h1>RS SIAGA AL MUNAWWARAH SAMARINDA</h1>
                    <p>Jl. Ramania No. 3 Sidodadi - Samarinda Ulu</p>
                    <p>Kota Samarinda - 75123, Fax. (0541) 7272700, Tlp. (0541) 739772 / 7272667</p>
                </div>
                <img src="{escape(logo_url)}" alt="Logo RS SIAGA AL MUNAWWARAH SAMARINDA">
            </header>
            <div class="rule"></div>

            <h2>TANDA TERIMA INVOICE</h2>

            <div class="company-line">
                <span>NAMA PERUSAHAAN :</span>
                <strong>{escape(company_name)}</strong>
            </div>

            <div class="invoice-block">
                <div class="invoice-lines">
                    <table class="invoice-table">
                        <tbody>
                            {rows_html}
                        </tbody>
                    </table>
                </div>
                <table class="invoice-table invoice-total">
                    <tbody>
                        <tr class="total-row">
                            <td class="row-no"></td>
                            <td class="invoice-no">TOTAL</td>
                            <td class="currency">Rp.</td>
                            <td class="amount">{_invoice_money(total, 2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="documents">
                <h3>DOKUMEN TERDIRI DARI :</h3>
                <div>
                    <ol>
                        <li>INVOICE</li>
                        <li>KWITANSI</li>
                        <li>PO</li>
                    </ol>
                    <ol start="4">
                        <li>NOTA KREDIT</li>
                        <li>BAPB</li>
                        <li>FP</li>
                    </ol>
                </div>
            </div>

            <div class="date-line">SAMARINDA, <span>{escape(tanggal_label)}</span></div>

            <div class="signatures">
                <div>
                    <strong>DISERAHKAN</strong>
                    <i></i>
                    <span></span>
                    <b>NAMA TERANG</b>
                </div>
                <div>
                    <strong>DITERIMA</strong>
                    <i></i>
                    <span></span>
                    <b>NPK.</b>
                </div>
            </div>
        </section>
    """
    receipt_one = receipt_html("Lembar 1: Arsip")
    receipt_two = receipt_html("Lembar 2: Asuransi/Perusahaan")

    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Tanda Terima Invoice</title>
    <style>
        @page {{ size: A4 landscape; margin: 7mm; }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            color: #111;
            background: #f3f4f6;
            font-family: "Times New Roman", Times, serif;
        }}
        .print-btn {{
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10;
            border: 0;
            border-radius: 5px;
            background: #0f766e;
            color: #fff;
            padding: 8px 12px;
            font: 700 12px Arial, sans-serif;
            cursor: pointer;
        }}
        .sheet {{
            width: 100%;
            max-width: 283mm;
            height: 196mm;
            margin: 0 auto;
            background: #fff;
            display: grid;
            grid-template-columns: 1fr 1fr;
        }}
        .receipt {{
            position: relative;
            width: 100%;
            height: 196mm;
            padding: 5mm 6mm 5mm;
            overflow: hidden;
            display: grid;
            grid-template-rows: 23mm 2mm 15mm 9mm minmax(0, 1fr) 28mm 9mm 35mm;
            row-gap: 0;
        }}
        .copy-label {{
            position: absolute;
            bottom: 1.5mm;
            left: 50%;
            transform: translateX(-50%);
            font: 700 7.5pt Arial, sans-serif;
            color: #111;
            white-space: nowrap;
        }}
        .receipt + .receipt {{
            border-top: 0;
            border-left: 1px dashed #777;
        }}
        .letterhead {{
            height: 23mm;
            display: grid;
            grid-template-columns: 1fr 20mm;
            align-items: center;
            gap: 4mm;
            text-align: center;
        }}
        .hospital h1 {{
            margin: 0 0 1mm;
            font-size: 12.5pt;
            line-height: 1.1;
            font-weight: 900;
        }}
        .hospital p {{
            margin: 0;
            font-size: 8.5pt;
            line-height: 1.25;
            font-weight: 700;
        }}
        .letterhead img {{
            max-width: 19mm;
            max-height: 19mm;
            object-fit: contain;
        }}
        .rule {{
            border-top: 2px solid #111;
            border-bottom: 1px solid #111;
            height: 2mm;
        }}
        h2 {{
            margin: 0;
            text-align: center;
            font-size: 17pt;
            line-height: 1;
            font-weight: 900;
            text-decoration: underline;
            align-self: end;
            padding-bottom: 2mm;
        }}
        .company-line {{
            display: flex;
            align-items: baseline;
            gap: 3mm;
            margin: 0;
            font-size: 12pt;
            font-weight: 900;
            align-self: center;
        }}
        .company-line span {{
            white-space: nowrap;
        }}
        .invoice-block {{
            min-height: 0;
            display: grid;
            grid-template-rows: minmax(0, 1fr) 8mm;
            align-self: stretch;
        }}
        .invoice-lines {{
            min-height: 0;
            overflow: hidden;
        }}
        .invoice-table {{
            width: calc(100% - 3mm);
            border-collapse: collapse;
            margin-left: 3mm;
            font-size: 10.5pt;
            font-weight: 900;
        }}
        .invoice-table td {{
            padding: 1mm 0;
            vertical-align: top;
        }}
        .row-no {{ width: 7mm; }}
        .invoice-no {{ width: auto; }}
        .currency {{ width: 9mm; }}
        .amount {{
            width: 33mm;
            text-align: right;
            padding-right: 0 !important;
            white-space: nowrap;
        }}
        .invoice-total {{
            align-self: end;
        }}
        .total-row td {{
            padding-top: 1mm;
            font-size: 11.5pt;
        }}
        .total-row td:nth-child(2) {{
            text-align: center;
        }}
        .documents {{
            margin-top: 0;
            font-size: 10.5pt;
            font-weight: 900;
            align-self: center;
        }}
        .documents h3 {{
            margin: 0 0 2mm;
            font-size: 11.5pt;
        }}
        .documents > div {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6mm;
            padding-left: 7mm;
        }}
        .documents ol {{
            margin: 0;
            padding-left: 7mm;
        }}
        .date-line {{
            margin-top: 0;
            text-align: right;
            padding-right: 4mm;
            font-size: 10.5pt;
            font-weight: 900;
            align-self: center;
        }}
        .date-line span {{
            display: inline;
            text-align: center;
        }}
        .signatures {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12mm;
            margin-top: 0;
            font-size: 10.5pt;
            font-weight: 900;
            align-self: stretch;
            padding-bottom: 7mm;
        }}
        .signatures div {{
            display: grid;
            grid-template-rows: auto 1fr auto auto;
            gap: 2mm;
            align-content: stretch;
        }}
        .signatures i {{
            display: block;
            min-height: 0;
        }}
        .signatures span {{
            display: block;
            border-bottom: 1px solid #111;
            height: 0;
            width: 50mm;
        }}
        .signatures b {{
            font-size: 10.5pt;
        }}
        @media print {{
            body {{ background: #fff; }}
            .print-btn {{ display: none; }}
            .sheet {{ width: 100%; height: 196mm; }}
        }}
    </style>
</head>
<body onload="setTimeout(() => window.print(), 250)">
    <button class="print-btn" onclick="window.print()">Print</button>
    <main class="sheet">
        {receipt_one}
        {receipt_two}
    </main>
</body>
</html>
"""
    return html


@api_view(['GET'])
@permission_classes([AllowAny])
def faktur_tanda_terima_print_view(request):
    raw_ids = request.GET.get('ids', '')
    ids = [item.strip() for item in raw_ids.split(',') if item.strip()]
    if not ids:
        return HttpResponse('<h3>Pilih minimal satu invoice.</h3>', status=400)

    fakturs = list(
        Faktur.objects
        .select_related('pelanggan')
        .filter(pk__in=ids)
        .order_by('nomor_faktur')
    )
    if not fakturs:
        return HttpResponse('<h3>Invoice tidak ditemukan.</h3>', status=404)

    html = _render_tanda_terima_invoice(
        fakturs,
        request.GET.get('perusahaan', ''),
        request.GET.get('tanggal', ''),
    )
    return HttpResponse(html)

def build_pembiayaan_name_map(ids):
    from django.db import connection

    ids = [str(item) for item in ids if item]
    if not ids:
        return {}

    placeholders = ','.join(['%s'] * len(ids))

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT id_pembiayaan, pembiayaan
                FROM rssams.pbiaya
                WHERE id_pembiayaan IN ({placeholders})
                """,
                ids
            )
            return {str(row[0]): row[1] for row in cursor.fetchall()}
    except Exception:
        return {}

def get_pembiayaan_detail(id_pembiayaan):
    from django.db import connection

    if not id_pembiayaan:
        return {}

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id_pembiayaan, pembiayaan, alamat
                FROM rssams.pbiaya
                WHERE id_pembiayaan = %s
                LIMIT 1
                """,
                [id_pembiayaan]
            )
            row = cursor.fetchone()

        if not row:
            return {}

        return {
            'id_pembiayaan': str(row[0] or ''),
            'pembiayaan': row[1] or '',
            'alamat': row[2] or '',
        }
    except Exception:
        return {}

def faktur_rekap_print_view(request):
    """Print rekapitulasi invoice berdasarkan date range dan pembiayaan (optional)"""
    dari = request.GET.get('dari', '')
    sampai = request.GET.get('sampai', '')
    id_pembiayaan = request.GET.get('id_pembiayaan', '').strip()
    
    if not dari or not sampai:
        return HttpResponse('<h3>Parameter tanggal (dari/sampai) wajib diisi</h3>', status=400)
    
    # Query faktur dengan filter date range (mengabaikan invoice status batal)
    fakturs_qs = Faktur.objects.filter(
        tanggal__gte=dari,
        tanggal__lte=sampai
    ).exclude(status='batal')

    if id_pembiayaan:
        try:
            fakturs_qs = fakturs_qs.filter(id_pembiayaan=int(id_pembiayaan))
        except (ValueError, TypeError):
            fakturs_qs = fakturs_qs.filter(id_pembiayaan=id_pembiayaan)

    fakturs = fakturs_qs.select_related('pelanggan').order_by('id_pembiayaan', 'tanggal')
    
    pembiayaan_map = build_pembiayaan_name_map(
        fakturs.values_list('id_pembiayaan', flat=True).distinct()
    )

    header_title = 'REKAPITULASI INVOICE'
    if id_pembiayaan:
        p_key = int(id_pembiayaan) if id_pembiayaan.isdigit() else id_pembiayaan
        p_name = pembiayaan_map.get(p_key) or pembiayaan_map.get(str(p_key))
        if p_name:
            header_title = f'REKAPITULASI INVOICE - {escape(p_name.upper())}'
    
    # Build HTML
    html_parts = [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<title>Rekapitulasi Invoice</title>',
        '<style>',
        'body { font-family: Arial, sans-serif; font-size: 10pt; }',
        '#wrapper { width: 2200px; margin: 0 auto; padding: 15px; }',
        '#isi { border: none; padding: 15px; }',
        'h3 { font-size: 14pt; margin-bottom: 20px; }',
        'table { border-collapse: collapse; margin: 10px 0; width: 100%; }',
        'th { background-color: #333; color: white; padding: 8px; border: 1px solid #999; text-align: center; }',
        'td { padding: 6px; border: 1px solid #999; }',
        '.text-right { text-align: right; }',
        '.text-center { text-align: center; }',
        '.mono { font-family: monospace; }',
        '</style>',
        '</head>',
        '<body>',
        '<body>',
        '<div id="wrapper">',
        '<div id="isi">',
        f'<h3>{header_title}<br>Periode: {dari} s/d {sampai}</h3>',
        '<table>',
        '<thead>',
        '<tr>',
        '<th>No</th>',
        '<th>No Invoice</th>',
        '<th>Tanggal</th>',
        '<th>Pembiayaan</th>',
        '<th class="text-right">Adm</th>',
        '<th class="text-right">Jasa</th>',
        '<th class="text-right">Farmasi</th>',
        '<th class="text-right">Tindakan</th>',
        '<th class="text-right">Fisio</th>',
        '<th class="text-right">Lab</th>',
        '<th class="text-right">Rad</th>',
        '<th class="text-right">Kamar</th>',
        '<th class="text-right">BHP</th>',
        '<th class="text-right">Ambulan</th>',
        '<th class="text-right">Alat</th>',
        '<th class="text-right">Lain-lain</th>',
        '<th class="text-right">Total Pendapatan</th>',
        '<th class="text-right">Piutang P3</th>',
        '<th class="text-right">Dibayar Pasien</th>',
        '<th class="text-right">Jml Bayar</th>',
        '<th class="text-right">Sisa Tagihan</th>',
        '<th>Jatuh Tempo</th>',
        '<th>Tgl Kirim</th>',
        '<th>Status</th>',
        '</tr>',
        '</thead>',
        '<tbody>',
    ]
    
    # Query dp3 & jmlbyr per no_invoice
    nomor_fakturs = [f.nomor_faktur for f in fakturs if f.nomor_faktur]
    kunjung_map = {}
    if nomor_fakturs:
        try:
            with connection.cursor() as cursor:
                placeholders = ','.join(['%s'] * len(nomor_fakturs))
                cursor.execute(f"""
                    SELECT 
                        c.no_invoice,
                        COALESCE(SUM(COALESCE(a.dp3, 0)), 0) AS total_dp3,
                        COALESCE(SUM(COALESCE(a.jmlbyr, 0)), 0) AS total_jmlbyr
                    FROM rssams.kunjung a
                    INNER JOIN rssams.verif_kunjung c ON a.no = c.no
                    WHERE c.no_invoice IN ({placeholders})
                    GROUP BY c.no_invoice
                """, nomor_fakturs)
                for r_row in cursor.fetchall():
                    kunjung_map[str(r_row[0])] = {
                        'dp3': Decimal(str(r_row[1] or 0)),
                        'jmlbyr': Decimal(str(r_row[2] or 0)),
                    }
        except Exception:
            pass

    total_pendapatan = Decimal('0.00')
    total_dp3 = Decimal('0.00')
    total_dibayar_pasien = Decimal('0.00')
    total_dibayar = Decimal('0.00')
    total_tagihan = Decimal('0.00')
    no = 1
    
    for f in fakturs:
        total_biaya = (
            Decimal(f.adm or 0) +
            Decimal(f.jasa or 0) +
            Decimal(f.farmasi or 0) +
            Decimal(f.tindakan or 0) +
            Decimal(f.fisio or 0) +
            Decimal(f.lab or 0) +
            Decimal(f.rad or 0) +
            Decimal(f.kamar or 0) +
            Decimal(f.bhp or 0) +
            Decimal(f.lainnya or 0) +
            Decimal(f.ambulan or 0) +
            Decimal(f.alat or 0)
        )

        k_info = kunjung_map.get(str(f.nomor_faktur or ''), {'dp3': Decimal('0'), 'jmlbyr': Decimal('0')})
        dp3_val = k_info['dp3']
        dibayar_pasien_val = k_info['jmlbyr']

        jml_bayar = Decimal(f.total_dibayar or 0)
        ttl = total_biaya - jml_bayar
        
        total_pendapatan += total_biaya
        total_dp3 += dp3_val
        total_dibayar_pasien += dibayar_pasien_val
        total_dibayar += jml_bayar
        total_tagihan += ttl
        
        status_label = dict(Faktur._meta.get_field('status').choices).get(f.status, f.status)
        stored_name = (f.nama_pembiayaan or '').strip()
        is_unknown = stored_name.lower() in ('', 'unknown', '-')

        pembiayaan_name = (
            f.pelanggan.nama
            if f.pelanggan
            else pembiayaan_map.get(str(f.id_pembiayaan or ''), stored_name or '-')
            if is_unknown
            else stored_name
        )
        
        html_parts.append(
            f'<tr>'
            f'<td class="text-center">{no}</td>'
            f'<td class="text-center mono">{escape(f.nomor_faktur or "")}</td>'
            f'<td class="text-center">{(f.tanggal.strftime("%d-%m-%Y") if f.tanggal else "-")}</td>'
            f'<td>{escape(pembiayaan_name)}</td>'
            f'<td class="text-right">{float(f.adm or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.jasa or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.farmasi or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.tindakan or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.fisio or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.lab or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.rad or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.kamar or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.bhp or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.ambulan or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.alat or 0):,.2f}</td>'
            f'<td class="text-right">{float(f.lainnya or 0):,.2f}</td>'
            f'<td class="text-right">{float(total_biaya):,.2f}</td>'
            f'<td class="text-right">{float(dp3_val):,.2f}</td>'
            f'<td class="text-right">{float(dibayar_pasien_val):,.2f}</td>'
            f'<td class="text-right">{float(jml_bayar):,.2f}</td>'
            f'<td class="text-right">{float(ttl):,.2f}</td>'
            f'<td class="text-center">{(f.jatuh_tempo.strftime("%d-%m-%Y") if f.jatuh_tempo else "-")}</td>'
            f'<td class="text-center">{(f.tgl_kirim.strftime("%d-%m-%Y") if f.tgl_kirim else "-")}</td>'
            f'<td class="text-center">{escape(status_label)}</td>'
            f'</tr>'
        )
        no += 1
    
    # Total row
    html_parts.append(
        f'<tr style="font-weight: bold; background-color: #f0f0f0;">'
        f'<td colspan="16" class="text-right">TOTAL</td>'
        f'<td class="text-right">{float(total_pendapatan):,.2f}</td>'
        f'<td class="text-right">{float(total_dp3):,.2f}</td>'
        f'<td class="text-right">{float(total_dibayar_pasien):,.2f}</td>'
        f'<td class="text-right">{float(total_dibayar):,.2f}</td>'
        f'<td class="text-right">{float(total_tagihan):,.2f}</td>'
        f'<td colspan="3"></td>'
        f'</tr>'
    )
    
    html_parts.extend([
        '</tbody>',
        '</table>',
        '</div>',
        '</div>',
        '</body>',
        '</html>',
    ])
    
    html = '\n'.join(html_parts)
    return HttpResponse(html)

def faktur_rekap_excel_view(request):
    dari = request.GET.get('dari', '')
    sampai = request.GET.get('sampai', '')
    id_pembiayaan = request.GET.get('id_pembiayaan', '').strip()

    if not dari or not sampai:
        return HttpResponse('Parameter tanggal dari/sampai wajib diisi.', status=400)

    fakturs_qs = (
        Faktur.objects
        .filter(tanggal__gte=dari, tanggal__lte=sampai)
        .exclude(status='batal')
    )

    if id_pembiayaan:
        try:
            fakturs_qs = fakturs_qs.filter(id_pembiayaan=int(id_pembiayaan))
        except (ValueError, TypeError):
            fakturs_qs = fakturs_qs.filter(id_pembiayaan=id_pembiayaan)

    fakturs = (
        fakturs_qs
        .select_related('pelanggan')
        .prefetch_related('pembayaran')
        .order_by('id_pembiayaan', 'tanggal')
    )
    
    pembiayaan_map = build_pembiayaan_name_map(
        fakturs.values_list('id_pembiayaan', flat=True).distinct()
    )

    # Query dp3 & jmlbyr per no_invoice
    nomor_fakturs = [f.nomor_faktur for f in fakturs if f.nomor_faktur]
    kunjung_map = {}
    if nomor_fakturs:
        try:
            with connection.cursor() as cursor:
                placeholders = ','.join(['%s'] * len(nomor_fakturs))
                cursor.execute(f"""
                    SELECT 
                        c.no_invoice,
                        COALESCE(SUM(COALESCE(a.dp3, 0)), 0) AS total_dp3,
                        COALESCE(SUM(COALESCE(a.jmlbyr, 0)), 0) AS total_jmlbyr
                    FROM rssams.kunjung a
                    INNER JOIN rssams.verif_kunjung c ON a.no = c.no
                    WHERE c.no_invoice IN ({placeholders})
                    GROUP BY c.no_invoice
                """, nomor_fakturs)
                for r_row in cursor.fetchall():
                    kunjung_map[str(r_row[0])] = {
                        'dp3': Decimal(str(r_row[1] or 0)),
                        'jmlbyr': Decimal(str(r_row[2] or 0)),
                    }
        except Exception:
            pass

    wb = Workbook()
    ws = wb.active
    ws.title = "Rekap Invoice"

    # Template kolom pembayaran dibatasi tepat sampai 4 pasang (Bayar 1 s/d Bayar 4)
    max_pay = 4

    headers = [
        'NO', 'NO INVOICE', 'TANGGAL FAKTUR', 'PENANGGUNG',
        'ADM', 'JASA', 'FARMASI', 'TINDAKAN', 'FISIO', 'LAB',
        'RAD', 'KAMAR', 'BHP', 'AMBULAN', 'SEWA ALAT', 'LAIN2',
        'TOTAL PENDAPATAN', 'PIUTANG P3', 'DIBAYAR PASIEN', 'JML BAYAR', 'SISA TAGIHAN', 'TGL J.TEMPO', 'TGL KIRIM', 'STATUS'
    ]

    for i in range(1, max_pay + 1):
        headers.append(f'TGL BAYAR {i}')
        headers.append(f'JML BAYAR {i}')

    end_col_letter = get_column_letter(len(headers))
    ws.merge_cells(f'A1:{end_col_letter}1')
    ws['A1'] = 'REKAP INVOICE'
    ws['A1'].font = Font(name='Calibri', size=16, bold=True, color='1E293B')
    
    ws['A2'] = f'Tanggal : {dari} s/d {sampai}'
    ws['A2'].font = Font(name='Calibri', size=11, italic=True, color='64748B')

    ws.append([])
    ws.append(headers)

    # ── Styling Definitions ───────────────────────────────────
    thin_black_border = Border(
        left=Side(style='thin', color='000000'),
        right=Side(style='thin', color='000000'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )
    total_black_border = Border(
        left=Side(style='thin', color='000000'),
        right=Side(style='thin', color='000000'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='double', color='000000')
    )

    # Warna Header Kelompok Kolom
    fill_info = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')      # Dark Slate
    fill_costs = PatternFill(start_color='334155', end_color='334155', fill_type='solid')     # Slate
    fill_tot_pend = PatternFill(start_color='1D4ED8', end_color='1D4ED8', fill_type='solid')  # Blue
    fill_dp3 = PatternFill(start_color='D97706', end_color='D97706', fill_type='solid')       # Amber
    fill_pasien = PatternFill(start_color='7C3AED', end_color='7C3AED', fill_type='solid')    # Purple
    fill_tot_byr = PatternFill(start_color='047857', end_color='047857', fill_type='solid')   # Emerald
    fill_tot_tag = PatternFill(start_color='4338CA', end_color='4338CA', fill_type='solid')   # Indigo
    fill_meta = PatternFill(start_color='475569', end_color='475569', fill_type='solid')      # Dark Gray
    fill_pay_tgl_hdr = PatternFill(start_color='0E7490', end_color='0E7490', fill_type='solid') # Dark Cyan Hdr
    fill_pay_jml_hdr = PatternFill(start_color='0D9488', end_color='0D9488', fill_type='solid') # Dark Teal Hdr

    # Warna Sel Data Pembayaran (Persis seperti screenshot contoh)
    fill_tgl_bayar = PatternFill(start_color='FFFF00', end_color='FFFF00', fill_type='solid') # Kuning
    fill_jml_bayar = PatternFill(start_color='00B0F0', end_color='00B0F0', fill_type='solid') # Biru Muda

    font_header = Font(name='Calibri', size=11, bold=True, color='FFFFFF')

    # Apply Header Styles (Row 4)
    for col_idx, cell in enumerate(ws[4], start=1):
        cell.font = font_header
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = thin_black_border

        if 1 <= col_idx <= 4:
            cell.fill = fill_info
        elif 5 <= col_idx <= 16:
            cell.fill = fill_costs
        elif col_idx == 17:
            cell.fill = fill_tot_pend
        elif col_idx == 18:
            cell.fill = fill_dp3
        elif col_idx == 19:
            cell.fill = fill_pasien
        elif col_idx == 20:
            cell.fill = fill_tot_byr
        elif col_idx == 21:
            cell.fill = fill_tot_tag
        elif 22 <= col_idx <= 24:
            cell.fill = fill_meta
        else: # Column >= 25 (TGL BAYAR / JML BAYAR pairs)
            cell.fill = fill_pay_tgl_hdr if (col_idx - 24) % 2 != 0 else fill_pay_jml_hdr

    ws.row_dimensions[4].height = 28

    total_pendapatan = Decimal('0.00')
    total_dp3 = Decimal('0.00')
    total_dibayar_pasien = Decimal('0.00')
    total_dibayar = Decimal('0.00')
    total_tagihan = Decimal('0.00')

    for idx, f in enumerate(fakturs, start=1):
        total_biaya = (
            Decimal(f.adm or 0) +
            Decimal(f.jasa or 0) +
            Decimal(f.farmasi or 0) +
            Decimal(f.tindakan or 0) +
            Decimal(f.fisio or 0) +
            Decimal(f.lab or 0) +
            Decimal(f.rad or 0) +
            Decimal(f.kamar or 0) +
            Decimal(f.bhp or 0) +
            Decimal(f.lainnya or 0) +
            Decimal(f.ambulan or 0) +
            Decimal(f.alat or 0)
        )

        k_info = kunjung_map.get(str(f.nomor_faktur or ''), {'dp3': Decimal('0'), 'jmlbyr': Decimal('0')})
        dp3_val = k_info['dp3']
        dibayar_pasien_val = k_info['jmlbyr']

        jml_bayar = Decimal(f.total_dibayar or 0)
        ttl = total_biaya - jml_bayar
        
        total_pendapatan += total_biaya
        total_dp3 += dp3_val
        total_dibayar_pasien += dibayar_pasien_val
        total_dibayar += jml_bayar
        total_tagihan += ttl

        status_label = dict(Faktur._meta.get_field('status').choices).get(f.status, f.status)
        stored_name = (f.nama_pembiayaan or '').strip()
        is_unknown = stored_name.lower() in ('', 'unknown', '-')

        penanggung = (
            f.pelanggan.nama
            if f.pelanggan
            else pembiayaan_map.get(str(f.id_pembiayaan or ''), stored_name or '-')
            if is_unknown
            else stored_name
        )

        row_data = [
            idx,
            f.nomor_faktur or '',
            f.tanggal.strftime('%d-%m-%Y') if f.tanggal else '',
            penanggung,
            float(f.adm or 0),
            float(f.jasa or 0),
            float(f.farmasi or 0),
            float(f.tindakan or 0),
            float(f.fisio or 0),
            float(f.lab or 0),
            float(f.rad or 0),
            float(f.kamar or 0),
            float(f.bhp or 0),
            float(f.ambulan or 0),
            float(f.alat or 0),
            float(f.lainnya or 0),
            float(total_biaya),
            float(dp3_val),
            float(dibayar_pasien_val),
            float(jml_bayar),
            float(ttl),
            f.jatuh_tempo.strftime('%d-%m-%Y') if f.jatuh_tempo else '',
            f.tgl_kirim.strftime('%d-%m-%Y') if f.tgl_kirim else '',
            status_label,
        ]

        pembayaran_list = list(f.pembayaran.all())
        for i in range(max_pay):
            if i < len(pembayaran_list):
                p = pembayaran_list[i]
                tgl_p = p.tanggal.strftime('%d-%m-%Y') if p.tanggal else ''
                jml_p = float(p.jumlah or 0)
            else:
                tgl_p = ''
                jml_p = 0.0
            row_data.append(tgl_p)
            row_data.append(jml_p)

        ws.append(row_data)
        curr_row = ws.max_row

        # Apply borders, alignment, and fills to data row
        for c_idx, cell in enumerate(ws[curr_row], start=1):
            cell.border = thin_black_border

            if c_idx > 24:
                # Kolom pembayaran: Kuning untuk TGL BAYAR N, Biru Muda untuk JML BAYAR N
                if (c_idx - 24) % 2 != 0:
                    cell.fill = fill_tgl_bayar
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                else:
                    cell.fill = fill_jml_bayar
                    cell.alignment = Alignment(horizontal='right', vertical='center')
            else:
                # Alignment kolom utama 1-24
                if c_idx in (1, 2, 3, 22, 23, 24):
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                elif c_idx == 4:
                    cell.alignment = Alignment(horizontal='left', vertical='center')
                else:
                    cell.alignment = Alignment(horizontal='right', vertical='center')

    total_row = ws.max_row + 1

    ws.cell(row=total_row, column=1, value='TOTAL')
    ws.merge_cells(
        start_row=total_row,
        start_column=1,
        end_row=total_row,
        end_column=16
    )

    ws.cell(row=total_row, column=17, value=float(total_pendapatan))
    ws.cell(row=total_row, column=18, value=float(total_dp3))
    ws.cell(row=total_row, column=19, value=float(total_dibayar_pasien))
    ws.cell(row=total_row, column=20, value=float(total_dibayar))
    ws.cell(row=total_row, column=21, value=float(total_tagihan))

    # Total per kolom JML BAYAR N
    for i in range(max_pay):
        col_idx = 24 + (i * 2) + 2
        sum_pay_i = sum(
            float(list(f.pembayaran.all())[i].jumlah or 0)
            for f in fakturs if len(f.pembayaran.all()) > i
        )
        ws.cell(row=total_row, column=col_idx, value=sum_pay_i)

    fill_total = PatternFill(start_color='E2E8F0', end_color='E2E8F0', fill_type='solid')
    font_total = Font(name='Calibri', size=11, bold=True, color='0F172A')

    for c_idx, cell in enumerate(ws[total_row], start=1):
        cell.border = total_black_border
        cell.font = font_total
        if c_idx > 24:
            if (c_idx - 24) % 2 != 0:
                cell.fill = fill_tgl_bayar
                cell.alignment = Alignment(horizontal='center', vertical='center')
            else:
                cell.fill = fill_jml_bayar
                cell.alignment = Alignment(horizontal='right', vertical='center')
        else:
            cell.fill = fill_total
            if c_idx <= 16:
                cell.alignment = Alignment(horizontal='center', vertical='center')
            else:
                cell.alignment = Alignment(horizontal='right', vertical='center')

    # Apply currency format
    for r in range(5, ws.max_row + 1):
        for col_idx in range(5, len(headers) + 1):
            if (5 <= col_idx <= 21) or (col_idx > 24 and (col_idx - 24) % 2 == 0):
                ws.cell(row=r, column=col_idx).number_format = '#,##0.00'

    # Auto-adjust column widths so numbers/dates never display as '####'
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.row in (1, 2, 3):
                continue
            val = cell.value
            if val is not None:
                if isinstance(val, (int, float, Decimal)):
                    val_str = f"{val:,.2f}"
                else:
                    val_str = str(val)
                lines = val_str.split('\n')
                for line in lines:
                    if len(line) > max_len:
                        max_len = len(line)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = (
        f'attachment; filename="Rekap_Invoice_{dari}_sampai_{sampai}.xlsx"'
    )

    wb.save(response)
    return response

# ALOKASI DANA
# ══════════════════════════════════════════════════════════════

def _utang_order_clause(value, allowed):
    return allowed.get(value) or next(iter(allowed.values()))


def _build_pending_where(params):
    """WHERE builder untuk tabel farmasi (tran_beli_brg_farmasi)."""
    where = ['u.app_siaga_faktur_id IS NULL']
    values = []
    search = (params.get('search') or '').strip()
    vendor_id = (params.get('vendor_id') or '').strip()
    kategori = (params.get('kategori') or '').strip()
    dari = (params.get('dari') or '').strip()
    sampai = (params.get('sampai') or '').strip()

    if search:
        where.append('(t.no_spb LIKE %s OR t.no_faktur LIKE %s OR r.nama LIKE %s OR t.id LIKE %s)')
        needle = f'%{search}%'
        values.extend([needle, needle, needle, needle])
    if vendor_id:
        where.append('t.id_rekanan = %s')
        values.append(vendor_id)
    if dari:
        where.append('t.tgl_faktur >= %s')
        values.append(dari)
    if sampai:
        where.append('t.tgl_faktur <= %s')
        values.append(sampai)
    return ' AND '.join(where), values


def _build_pending_where_logistik(params):
    """WHERE builder untuk tabel logistik (tran_beli_brg_log)."""
    where = ['t.done = \'Y\'', 'u.app_siaga_faktur_id IS NULL', "COALESCE(t.rekanan, '') != 'STOCK OPNAME'", "COALESCE(t.no_spk, '') NOT LIKE 'OPNAME-%%'"]
    values = []
    search = (params.get('search') or '').strip()
    vendor_id = (params.get('vendor_id') or '').strip()
    dari = (params.get('dari') or '').strip()
    sampai = (params.get('sampai') or '').strip()

    if search:
        where.append('(t.id LIKE %s OR t.no_spk LIKE %s OR t.rekanan LIKE %s OR r.nama LIKE %s)')
        needle = f'%{search}%'
        values.extend([needle, needle, needle, needle])
    if vendor_id:
        # filter by matched rekanan id
        where.append('r.id_rekanan = %s')
        values.append(vendor_id)
    if dari:
        where.append('t.tgl_spk >= %s')
        values.append(dari)
    if sampai:
        where.append('t.tgl_spk <= %s')
        values.append(sampai)
    return ' AND '.join(where), values


def _pending_base_sql():
    """FROM clause untuk farmasi — JOIN ke utang_supplier filter sumber=farmasi."""
    return """
        FROM rssams.tran_beli_brg_farmasi t
        LEFT JOIN rssams.rekanan r ON r.id_rekanan = t.id_rekanan
        LEFT JOIN utang_supplier u ON u.app_siaga_faktur_id = CONVERT(t.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND u.sumber = 'farmasi'
    """


def _pending_base_sql_logistik():
    """FROM clause untuk logistik — LEFT JOIN rekanan by-nama (best-effort), JOIN ke utang_supplier filter sumber=logistik."""
    return """
        FROM rssams.tran_beli_brg_log t
        LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
        LEFT JOIN rssams.rekanan r ON UPPER(TRIM(CONVERT(r.nama USING utf8mb4))) = UPPER(TRIM(CONVERT(t.rekanan USING utf8mb4))) AND r.del = 'N'
        LEFT JOIN utang_supplier u ON u.app_siaga_faktur_id = CONVERT(t.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND u.sumber = 'logistik'
    """


def _fetch_app_siaga_faktur(app_siaga_faktur_id):
    """Fetch 1 baris faktur farmasi dari tran_beli_brg_farmasi."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                t.id AS app_siaga_faktur_id,
                t.id AS nomor_spb,
                t.tgl_spb AS tanggal_spb,
                t.no_faktur AS nomor_faktur,
                t.id_rekanan AS vendor_id,
                COALESCE(r.nama, '') AS vendor_nama,
                t.tgl_faktur AS tanggal_faktur,
                t.tgl_jtempo AS tanggal_jatuh_tempo,
                t.gtotal AS nominal
            FROM rssams.tran_beli_brg_farmasi t
            LEFT JOIN rssams.rekanan r ON r.id_rekanan = t.id_rekanan
            WHERE t.id = %s
            LIMIT 1
            """,
            [app_siaga_faktur_id],
        )
        row = cursor.fetchone()
        if not row:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


def _fetch_logistik_pembelian(pembelian_id):
    """Fetch 1 baris dari tran_beli_brg_log + best-effort JOIN rekanan by-nama."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                CAST(t.id AS CHAR) AS app_siaga_faktur_id,
                CAST(COALESCE(NULLIF(s.no_spb, ''), NULLIF(t.id_spb, ''), t.id) AS CHAR) AS nomor_spb,
                t.tgl_spk AS tanggal_spb,
                CAST(COALESCE(NULLIF(NULLIF(t.no_spk, ''), '-'), '-') AS CHAR) AS nomor_faktur,
                r.id_rekanan AS vendor_id_hint,
                t.rekanan AS rekanan_text,
                COALESCE(r.nama, t.rekanan) AS vendor_nama_hint,
                t.tgl_spk AS tanggal_faktur,
                NULL AS tanggal_jatuh_tempo,
                t.nilai AS nominal,
                t.metode_pembayaran
            FROM rssams.tran_beli_brg_log t
            LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
            LEFT JOIN rssams.rekanan r ON UPPER(TRIM(CONVERT(r.nama USING utf8mb4))) = UPPER(TRIM(CONVERT(t.rekanan USING utf8mb4))) AND r.del = 'N'
            WHERE t.id = %s AND t.done = 'Y'
            LIMIT 1
            """,
            [pembelian_id],
        )
        row = cursor.fetchone()
        if not row:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


class UtangSupplierViewSet(OptionalPaginationMixin, viewsets.ReadOnlyModelViewSet):
    queryset = UtangSupplier.objects.select_related('verified_by').prefetch_related('pembayaran__created_by').all()
    serializer_class = UtangSupplierSerializer
    permission_classes = [IsAuthenticated, IsCatatanUtangObatBhpPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        search = (params.get('search') or '').strip()
        vendor_id = params.get('vendor_id')
        status_filter = params.get('status')
        sumber_filter = (params.get('sumber') or '').strip()
        dari = params.get('dari')
        sampai = params.get('sampai')

        if search:
            qs = qs.filter(
                Q(nomor_spb__icontains=search)
                | Q(nomor_faktur__icontains=search)
                | Q(vendor_nama__icontains=search)
                | Q(app_siaga_faktur_id__icontains=search)
            )
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if sumber_filter and sumber_filter != 'semua':
            qs = qs.filter(sumber=sumber_filter)
        kategori_filter = (params.get('kategori') or '').strip()
        if kategori_filter and 'kategori' in _get_rekanan_columns():
            with connection.cursor() as cursor:
                cursor.execute("SELECT id_rekanan FROM rssams.rekanan WHERE kategori = %s AND del = 'N'", [kategori_filter])
                v_ids = [r[0] for r in cursor.fetchall()]
            qs = qs.filter(vendor_id__in=v_ids)
        if dari:
            qs = qs.filter(tanggal_faktur__gte=dari)
        if sampai:
            qs = qs.filter(tanggal_faktur__lte=sampai)

        order = _utang_order_clause(params.get('ordering'), {
            'verified_at': 'verified_at',
            '-verified_at': '-verified_at',
            'vendor': 'vendor_nama',
            '-vendor': '-vendor_nama',
            'nomor_faktur': 'nomor_faktur',
            '-nomor_faktur': '-nomor_faktur',
            'tanggal_faktur': 'tanggal_faktur',
            '-tanggal_faktur': '-tanggal_faktur',
            'tanggal_jatuh_tempo': 'tanggal_jatuh_tempo',
            '-tanggal_jatuh_tempo': '-tanggal_jatuh_tempo',
            'tanggal_titip': 'tanggal_titip',
            '-tanggal_titip': '-tanggal_titip',
            'nominal': 'nominal',
            '-nominal': '-nominal',
            'status': 'status',
            '-status': '-status',
        })
        return qs.order_by(order, '-created_at')

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        qs = self.get_queryset().select_related('verified_by')

        wb = Workbook()
        ws = wb.active
        ws.title = "Daftar Utang Supplier"

        ws.merge_cells('A1:N1')
        ws['A1'] = 'DAFTAR UTANG SUPPLIER (OBAT, BHP & LOGISTIK)'
        ws['A1'].font = Font(bold=True, size=14)
        ws['A1'].alignment = Alignment(horizontal='center')

        ws['A2'] = f'Tanggal Cetak: {timezone.now().strftime("%d-%m-%Y %H:%M")}'
        ws['A2'].font = Font(italic=True, size=10)

        headers = [
            'No', 'Sumber', 'Vendor / Supplier', 'No. Faktur', 'No. SPB / Ref',
            'Tgl Faktur', 'Tgl Titip Faktur', 'Umur Utang', 'Tgl Jatuh Tempo',
            'Nominal Utang (Rp)', 'Total Dibayar (Rp)', 'Sisa Utang (Rp)', 'Status', 'Verifikator'
        ]
        ws.append([])
        ws.append(headers)

        header_row = 4
        header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        header_font = Font(bold=True, color='FFFFFF')

        for col_num, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center')

        total_nominal = Decimal('0')
        total_dibayar = Decimal('0')
        total_sisa = Decimal('0')
        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        today_date = timezone.localdate()

        for idx, item in enumerate(qs, start=1):
            nom = item.nominal or Decimal('0')
            dibayar = item.total_dibayar or Decimal('0')
            sisa = item.sisa_utang or Decimal('0')

            total_nominal += nom
            total_dibayar += dibayar
            total_sisa += sisa

            tgl_faktur = item.tanggal_faktur.strftime('%d-%m-%Y') if item.tanggal_faktur else '-'
            tgl_titip = item.tanggal_titip.strftime('%d-%m-%Y') if item.tanggal_titip else '-'
            
            if item.tanggal_titip:
                days = (today_date - item.tanggal_titip).days
                umur_utang_str = f"{max(0, days)} Hari"
            else:
                umur_utang_str = '-'

            tgl_tempo = item.tanggal_jatuh_tempo.strftime('%d-%m-%Y') if item.tanggal_jatuh_tempo else '-'
            sumber_label = item.get_sumber_display()
            verifier = item.verified_by.username if item.verified_by else '-'

            ws.append([
                idx,
                sumber_label,
                item.vendor_nama or '-',
                item.nomor_faktur or '-',
                item.nomor_spb or '-',
                tgl_faktur,
                tgl_titip,
                umur_utang_str,
                tgl_tempo,
                float(nom),
                float(dibayar),
                float(sisa),
                item.get_status_display(),
                verifier,
            ])

            row_num = ws.max_row
            for col in range(1, 15):
                c = ws.cell(row=row_num, column=col)
                c.border = thin_border
                if col in [1, 2, 6, 7, 8, 9, 13]:
                    c.alignment = Alignment(horizontal='center')
                elif col in [10, 11, 12]:
                    c.number_format = '#,##0.00'
                    c.alignment = Alignment(horizontal='right')

        total_row = ws.max_row + 1
        ws.cell(row=total_row, column=1, value='TOTAL')
        ws.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=9)
        ws.cell(row=total_row, column=1).font = Font(bold=True)
        ws.cell(row=total_row, column=1).alignment = Alignment(horizontal='right')

        for col_idx, val in [(10, total_nominal), (11, total_dibayar), (12, total_sisa)]:
            cell = ws.cell(row=total_row, column=col_idx, value=float(val))
            cell.font = Font(bold=True)
            cell.number_format = '#,##0.00'

        for col in range(1, 15):
            ws.column_dimensions[get_column_letter(col)].width = 18
        ws.column_dimensions['C'].width = 30
        ws.column_dimensions['D'].width = 22

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Daftar_Utang_Supplier_{timezone.now().strftime("%Y%m%d_%H%M")}.xlsx"'
        wb.save(response)
        return response

    @action(detail=False, methods=['get'], url_path='vendor-deposit')
    def vendor_deposit(self, request):
        vendor_id = request.query_params.get('vendor_id')
        if not vendor_id:
            return Response({'error': 'vendor_id wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        
        deposits = DepositVendor.objects.filter(vendor_id=vendor_id).order_by('created_at')
        active_deposits = [d for d in deposits if d.sisa_deposit > 0]
        total_sisa = sum((d.sisa_deposit for d in active_deposits), Decimal('0'))

        return Response({
            'vendor_id': int(vendor_id),
            'total_sisa_deposit': float(total_sisa),
            'deposits': DepositVendorSerializer(active_deposits, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='list-deposit-vendor')
    def list_deposit_vendor(self, request):
        qs = DepositVendor.objects.all().order_by('-created_at')
        
        vendor_id = request.query_params.get('vendor_id')
        search = (request.query_params.get('search') or '').strip()
        status_filter = request.query_params.get('status') or 'aktif'

        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        if search:
            qs = qs.filter(
                Q(vendor_nama__icontains=search) |
                Q(keterangan__icontains=search) |
                Q(utang_asal__nomor_faktur__icontains=search)
            )

        deposits_data = DepositVendorSerializer(qs, many=True).data

        vendor_map = {}
        for dep_obj, dep_data in zip(qs, deposits_data):
            vid = dep_obj.vendor_id
            if vid not in vendor_map:
                vendor_map[vid] = {
                    'vendor_id': vid,
                    'vendor_nama': dep_obj.vendor_nama,
                    'total_retur': Decimal('0'),
                    'total_terpakai': Decimal('0'),
                    'total_sisa_deposit': Decimal('0'),
                    'count': 0,
                    'items': [],
                }
            vendor_map[vid]['total_retur'] += dep_obj.nominal_retur
            vendor_map[vid]['total_terpakai'] += dep_obj.terpakai
            vendor_map[vid]['total_sisa_deposit'] += dep_obj.sisa_deposit
            vendor_map[vid]['count'] += 1
            vendor_map[vid]['items'].append(dep_data)

        vendor_list = list(vendor_map.values())
        if status_filter == 'aktif':
            vendor_list = [v for v in vendor_list if v['total_sisa_deposit'] > 0]
        elif status_filter == 'habis':
            vendor_list = [v for v in vendor_list if v['total_sisa_deposit'] <= 0]

        total_retur_all = sum((v['total_retur'] for v in vendor_list), Decimal('0'))
        total_terpakai_all = sum((v['total_terpakai'] for v in vendor_list), Decimal('0'))
        total_sisa_all = sum((v['total_sisa_deposit'] for v in vendor_list), Decimal('0'))

        return Response({
            'summary': {
                'total_vendor': len(vendor_list),
                'total_retur': float(total_retur_all),
                'total_terpakai': float(total_terpakai_all),
                'total_sisa_deposit': float(total_sisa_all),
            },
            'vendors': vendor_list,
        })

    @action(detail=True, methods=['post'], url_path='input-retur')
    def input_retur(self, request, pk=None):
        utang = self.get_object()
        if utang.status != UtangSupplier.STATUS_LUNAS:
            return Response({'error': 'Retur barang hanya dapat dicatat untuk faktur yang sudah berstatus LUNAS.'}, status=status.HTTP_400_BAD_REQUEST)

        nominal_retur_raw = request.data.get('nominal_retur')
        keterangan = (request.data.get('keterangan') or '').strip()

        try:
            nominal_retur = Decimal(str(nominal_retur_raw))
            if nominal_retur <= 0:
                raise ValueError
        except (TypeError, ValueError, InvalidOperation):
            return Response({'error': 'Nominal retur tidak valid atau harus lebih dari 0.'}, status=status.HTTP_400_BAD_REQUEST)

        if not keterangan:
            return Response({'error': 'Keterangan retur wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        if utang.nominal < nominal_retur:
            return Response({'error': f'Nominal retur (Rp {nominal_retur:,.2f}) tidak boleh melebihi nominal faktur awal (Rp {utang.nominal:,.2f}).'}, status=status.HTTP_400_BAD_REQUEST)

        utang.nominal = utang.nominal - nominal_retur
        utang.save(update_fields=['nominal', 'updated_at'])
        utang.refresh_status()

        deposit = DepositVendor.objects.create(
            vendor_id=utang.vendor_id,
            vendor_nama=utang.vendor_nama,
            utang_asal=utang,
            nominal_retur=nominal_retur,
            keterangan=f"Retur Faktur {utang.nomor_faktur or utang.nomor_spb}: {keterangan}",
            created_by=request.user,
        )

        PembayaranUtang.objects.create(
            utang=utang,
            tanggal_rencana_bayar=timezone.now().date(),
            tanggal_proses=timezone.now().date(),
            tanggal_app=timezone.now().date(),
            jumlah_bayar=nominal_retur,
            potongan_deposit=Decimal('0'),
            jumlah_kas_keluar=Decimal('0'),
            keterangan=f"Retur Barang: {keterangan}",
            status=PembayaranUtang.STATUS_RETUR,
            created_by=request.user,
        )

        return Response({
            'message': f'Retur sebesar Rp {nominal_retur:,.2f} berhasil dicatat dan masuk ke Deposit Vendor.',
            'utang': UtangSupplierSerializer(utang, context={'request': request}).data,
            'deposit': DepositVendorSerializer(deposit).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='bayar')
    def bayar(self, request, pk=None):
        utang = self.get_object()
        if utang.status == UtangSupplier.STATUS_LUNAS:
            return Response({'error': 'Utang sudah lunas.'}, status=status.HTTP_400_BAD_REQUEST)
        if utang.status in [UtangSupplier.STATUS_DIAJUKAN, UtangSupplier.STATUS_SEBAGIAN_DIAJUKAN]:
            return Response({'error': 'Faktur ini sedang dalam proses pengajuan pembayaran.'}, status=status.HTTP_400_BAD_REQUEST)
        
        tgl_rencana = request.data.get('tanggal_rencana_bayar') or timezone.now().date().isoformat()

        potongan_deposit_raw = request.data.get('potongan_deposit') or 0
        try:
            potongan_deposit = Decimal(str(potongan_deposit_raw))
            if potongan_deposit < 0:
                raise ValueError
        except (TypeError, ValueError, InvalidOperation):
            return Response({'error': 'Nilai potongan deposit tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)

        if potongan_deposit > 0:
            deposits = DepositVendor.objects.filter(vendor_id=utang.vendor_id)
            total_sisa_deposit = sum((d.sisa_deposit for d in deposits), Decimal('0'))
            if potongan_deposit > total_sisa_deposit:
                return Response({'error': f'Potongan deposit (Rp {potongan_deposit:,.2f}) melebihi saldo deposit vendor yang tersedia (Rp {total_sisa_deposit:,.2f}).'}, status=status.HTTP_400_BAD_REQUEST)

        payload = {
            **request.data,
            'utang': utang.id,
            'tanggal_rencana_bayar': tgl_rencana,
            'tanggal_proses': request.data.get('tanggal_proses') or tgl_rencana,
            'tanggal_app': request.data.get('tanggal_app') or tgl_rencana,
            'potongan_deposit': potongan_deposit,
        }
        serializer = PembayaranUtangInputSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        
        tgl_proses = serializer.validated_data.get('tanggal_proses') or tgl_rencana
        jumlah_bayar = serializer.validated_data['jumlah_bayar']
        jumlah_kas_keluar = max(jumlah_bayar - potongan_deposit, Decimal('0'))

        pembayaran = PembayaranUtang.objects.create(
            utang=utang,
            tanggal_rencana_bayar=serializer.validated_data.get('tanggal_rencana_bayar'),
            tanggal_proses=tgl_proses,
            tanggal_app=serializer.validated_data.get('tanggal_app') or tgl_rencana,
            jumlah_bayar=jumlah_bayar,
            potongan_deposit=potongan_deposit,
            jumlah_kas_keluar=jumlah_kas_keluar,
            keterangan=serializer.validated_data.get('keterangan', ''),
            status=PembayaranUtang.STATUS_PENDING,
            created_by=request.user,
        )
        utang.refresh_status()
        utang.refresh_from_db()
        return Response({
            'utang': UtangSupplierSerializer(utang, context={'request': request}).data,
            'pembayaran': PembayaranUtangSerializer(pembayaran, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()
        active_qs = qs.exclude(status=UtangSupplier.STATUS_LUNAS)
        total_nominal = active_qs.aggregate(total=Sum('nominal'))['total'] or Decimal('0')
        pembayaran = PembayaranUtang.objects.filter(utang__in=active_qs, status__in=[PembayaranUtang.STATUS_REALISASI_SEBAGIAN, PembayaranUtang.STATUS_REALISASI_LUNAS]).aggregate(total=Sum('jumlah_bayar'))['total'] or Decimal('0')
        return Response({
            'utang_count': active_qs.count(),
            'total_nominal': total_nominal,
            'total_dibayar': pembayaran,
            'total_sisa': max(total_nominal - pembayaran, Decimal('0')),
            'belum_dibayar': qs.filter(status=UtangSupplier.STATUS_BELUM_DIBAYAR).count(),
            'diajukan': qs.filter(status=UtangSupplier.STATUS_DIAJUKAN).count(),
            'sebagian': qs.filter(status=UtangSupplier.STATUS_SEBAGIAN).count(),
            'sebagian_diajukan': qs.filter(status=UtangSupplier.STATUS_SEBAGIAN_DIAJUKAN).count(),
            'lunas': qs.filter(status=UtangSupplier.STATUS_LUNAS).count(),
        })

    @action(detail=False, methods=['post'], url_path='create-manual')
    def create_manual(self, request):
        """Membuat catatan utang secara manual (tidak dari database legacy)."""
        data = request.data
        vendor_id = data.get('vendor_id')
        if not vendor_id:
            return Response({'error': 'vendor_id wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        # Ambil nama vendor dari rssams.rekanan
        vendor_row = legacy_fetchone(
            'SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s AND del = %s',
            [vendor_id, 'N'],
        )
        if not vendor_row:
            return Response({'error': 'Vendor tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)

        nomor_faktur = (data.get('nomor_faktur') or '').strip()
        if not nomor_faktur:
            return Response({'error': 'nomor_faktur wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        tgl_faktur = data.get('tanggal_faktur')
        if not tgl_faktur:
            return Response({'error': 'tanggal_faktur wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        keterangan = (data.get('keterangan') or '').strip()
        if not keterangan:
            return Response({'error': 'keterangan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        nominal_raw = data.get('nominal')
        try:
            nominal = Decimal(str(nominal_raw))
            if nominal <= 0:
                raise ValueError
        except (TypeError, ValueError, InvalidOperation):
            return Response({'error': 'nominal tidak valid atau wajib lebih dari 0.'}, status=status.HTTP_400_BAD_REQUEST)

        # Buat ID unik untuk utang manual agar tidak bertabrakan dengan constraint utang_faktur_sumber_uniq
        import uuid
        faktur_id = f'MNL-{uuid.uuid4().hex[:12].upper()}'

        utang = UtangSupplier.objects.create(
            app_siaga_faktur_id=faktur_id,
            sumber=UtangSupplier.SUMBER_MANUAL,
            nomor_faktur=nomor_faktur,
            nomor_spb=data.get('nomor_spb') or '',
            vendor_id=int(vendor_id),
            vendor_nama=vendor_row['nama'],
            tanggal_faktur=data.get('tanggal_faktur') or None,
            tanggal_jatuh_tempo=data.get('tanggal_jatuh_tempo') or None,
            tanggal_titip=data.get('tanggal_titip') or timezone.localdate(),
            nominal=nominal,
            keterangan_titip=data.get('keterangan') or '',
            status=UtangSupplier.STATUS_BELUM_DIBAYAR,
            verified_by=request.user,
            verified_at=timezone.now(),
        )
        return Response(UtangSupplierSerializer(utang, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='ots-preview', parser_classes=[MultiPartParser, FormParser])
    def ots_preview(self, request):
        excel_file = request.FILES.get('file')
        if not excel_file:
            return Response({'error': 'File Excel wajib diunggah.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb = openpyxl.load_workbook(excel_file, data_only=True)
            if 'LIST FAKTUR' in wb.sheetnames:
                sheet = wb['LIST FAKTUR']
            else:
                sheet = wb.active

            rows = list(sheet.iter_rows(values_only=True))
            if len(rows) < 3:
                return Response({'error': 'Sheet Excel tidak memiliki data yang cukup.'}, status=status.HTTP_400_BAD_REQUEST)

            green_hex = 'FF92D050'
            staged_items = []
            seen_keys = {}

            total_rows = 0
            total_nominal = Decimal('0')
            total_bayar = Decimal('0')
            total_sisa_utang = Decimal('0')
            total_anomali = 0
            total_lunas = 0
            total_utang_aktif = 0

            for r_idx in range(2, len(rows)):
                r = rows[r_idx]
                if not r:
                    continue

                status_code = str(r[3] or '').strip()
                kategori = str(r[4] or '').strip()
                no_spb = str(r[7] or '').strip()
                vendor_nama = str(r[8] or '').strip()
                tgl_faktur_raw = r[9]
                tgl_titip_raw = r[10] if len(r) > 10 else None
                nominal_raw = r[11]
                ket_excel = str(r[12] or '').strip() # Col M (KETERANGAN / NO FAKTUR)
                no_faktur = ket_excel or f"INV/OTS/{r_idx + 1}"
                byr_raw = r[18] if len(r) > 18 and isinstance(r[18], (int, float)) else 0

                if not vendor_nama or nominal_raw is None:
                    continue

                try:
                    nominal = Decimal(str(nominal_raw))
                    if nominal <= Decimal('0'):
                        continue
                except (InvalidOperation, ValueError, TypeError):
                    continue

                try:
                    byr = Decimal(str(byr_raw)) if byr_raw else Decimal('0')
                except (InvalidOperation, ValueError, TypeError):
                    byr = Decimal('0')

                sisa = max(Decimal('0'), nominal - byr)
                row_num = r_idx + 1

                # Helper date parser
                def parse_date_str(val):
                    if not val:
                        return ''
                    if isinstance(val, (datetime, time)):
                        return val.strftime('%Y-%m-%d')
                    if isinstance(val, str) and val.strip():
                        return val.strip()[:10]
                    return ''

                tgl_faktur_str = parse_date_str(tgl_faktur_raw)
                tgl_titip_str = parse_date_str(tgl_titip_raw) or tgl_faktur_str
                tgl_rencana_str = parse_date_str(r[15]) if len(r) > 15 else ''
                tgl_proses_str = parse_date_str(r[16]) if len(r) > 16 else ''
                tgl_app_str = parse_date_str(r[17]) if len(r) > 17 else ''

                # Check cell fill color
                is_green = False
                try:
                    cell = sheet.cell(row=row_num, column=1)
                    if cell.fill and cell.fill.start_color:
                        if str(cell.fill.start_color.rgb) == green_hex:
                            is_green = True
                except Exception:
                    pass

                # Status determination
                if sisa <= Decimal('0'):
                    status_ditentukan = 'lunas'
                    total_lunas += 1
                elif byr > Decimal('0'):
                    status_ditentukan = 'sebagian'
                    total_utang_aktif += 1
                else:
                    status_ditentukan = 'belum_dibayar'
                    total_utang_aktif += 1

                # Anomaly checking
                anomali_reasons = []
                if status_code == 'U' and sisa <= Decimal('0'):
                    anomali_reasons.append("Kode status Excel 'U', tetapi pembayaran sudah lunas (sisa Rp 0).")
                elif status_code == 'L' and sisa > Decimal('0'):
                    anomali_reasons.append(f"Kode status Excel 'L', tetapi sisa utang masih Rp {sisa:,.2f}.")

                key = (vendor_nama.upper(), float(nominal), no_spb, no_faktur)
                if key in seen_keys:
                    prev_row = seen_keys[key]
                    anomali_reasons.append(f"Potensi duplikat dari baris {prev_row}.")
                else:
                    seen_keys[key] = row_num

                if status_ditentukan != 'lunas' and not no_spb:
                    anomali_reasons.append("Faktur utang aktif ini tidak memiliki Nomor SPB (akan dimasukkan sebagai Utang Manual Non-SPB).")

                is_anomali = len(anomali_reasons) > 0
                if is_anomali:
                    total_anomali += 1

                total_rows += 1
                total_nominal += nominal
                total_bayar += byr
                total_sisa_utang += sisa

                staged_items.append({
                    'id': f"OTS-{row_num}",
                    'row_idx': row_num,
                    'status_excel': status_code,
                    'kategori': kategori,
                    'no_spb': no_spb,
                    'vendor_nama': vendor_nama,
                    'tgl_faktur': tgl_faktur_str,
                    'tgl_titip': tgl_titip_str,
                    'nominal': float(nominal),
                    'no_faktur': ket_excel or f"INV/OTS/{row_num}",
                    'keterangan_excel': ket_excel,
                    'jumlah_bayar': float(byr),
                    'sisa_utang': float(sisa),
                    'tgl_rencana_bayar': tgl_rencana_str,
                    'tgl_proses': tgl_proses_str,
                    'tgl_app': tgl_app_str,
                    'is_green': is_green,
                    'status_ditentukan': status_ditentukan,
                    'is_anomali': is_anomali,
                    'anomali_reasons': anomali_reasons,
                    'user_action': 'terima' if not is_anomali else 'duplikat_review',
                })

            return Response({
                'summary': {
                    'total_rows': total_rows,
                    'total_nominal': float(total_nominal),
                    'total_bayar': float(total_bayar),
                    'total_sisa_utang': float(total_sisa_utang),
                    'total_anomali': total_anomali,
                    'total_lunas': total_lunas,
                    'total_utang_aktif': total_utang_aktif,
                },
                'items': staged_items
            })
        except Exception as e:
            return Response({'error': f'Gagal membaca file Excel: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='ots-commit')
    def ots_commit(self, request):
        items = request.data.get('items')
        if not items or not isinstance(items, list):
            return Response({'error': 'Daftar items yang diverifikasi wajib dikirim.'}, status=status.HTTP_400_BAD_REQUEST)

        active_items = [item for item in items if item.get('user_action') != 'abaikan']

        committed_count = 0
        with transaction.atomic():
            for item in active_items:
                v_nama = (item.get('vendor_nama', 'VENDOR UNKNOWN').strip())[:145]
                kategori = item.get('kategori', '')
                no_spb = (item.get('no_spb', '').strip())[:45]
                no_faktur = (item.get('no_faktur', '').strip() or f"OTS/{item.get('row_idx')}")[:95]
                
                try:
                    nominal = Decimal(str(item.get('nominal', 0)))
                    bayar = Decimal(str(item.get('jumlah_bayar', 0)))
                except (InvalidOperation, ValueError, TypeError):
                    continue

                if nominal <= Decimal('0'):
                    continue

                sisa = max(Decimal('0'), nominal - bayar)

                kat_upper = kategori.upper()
                if 'OBAT' in kat_upper or 'BHP' in kat_upper:
                    sumber = UtangSupplier.SUMBER_FARMASI
                elif 'LOGISTIK' in kat_upper or 'BARANG' in kat_upper:
                    sumber = UtangSupplier.SUMBER_LOGISTIK
                else:
                    sumber = UtangSupplier.SUMBER_MANUAL

                if sisa <= Decimal('0'):
                    st = UtangSupplier.STATUS_LUNAS
                elif bayar > Decimal('0'):
                    st = UtangSupplier.STATUS_SEBAGIAN
                else:
                    st = UtangSupplier.STATUS_BELUM_DIBAYAR

                def parse_date_obj(val_str):
                    if not val_str:
                        return None
                    try:
                        return datetime.strptime(str(val_str)[:10], '%Y-%m-%d').date()
                    except Exception:
                        return None

                tgl_faktur = parse_date_obj(item.get('tgl_faktur')) or timezone.localdate()
                tgl_titip = parse_date_obj(item.get('tgl_titip')) or tgl_faktur
                tgl_rencana = parse_date_obj(item.get('tgl_rencana_bayar')) or tgl_faktur
                tgl_proses = parse_date_obj(item.get('tgl_proses')) or tgl_rencana
                tgl_app = parse_date_obj(item.get('tgl_app')) or tgl_proses

                vendor_id = item.get('vendor_id')
                v_nama_final = v_nama

                # Intelligent Vendor Master Resolution (Match or Auto-Create)
                if v_nama:
                    v_lower = v_nama.lower().strip()
                    with connection.cursor() as cursor:
                        # 1. Check exact case-insensitive match
                        cursor.execute("SELECT id_rekanan, nama, kategori FROM rssams.rekanan WHERE LOWER(TRIM(nama)) = %s LIMIT 1", [v_lower])
                        r_row = cursor.fetchone()
                        if r_row:
                            vendor_id, v_nama_final, existing_kat = r_row[0], r_row[1], r_row[2]
                            if kategori and not existing_kat:
                                cursor.execute("UPDATE rssams.rekanan SET kategori = %s WHERE id_rekanan = %s", [kategori[:100], vendor_id])
                        else:
                            # 2. Check stripped punctuation match (e.g. "ALEXA MEDIKA PT" vs "ALEXA MEDIKA, PT")
                            v_stripped = re.sub(r'[^a-zA-Z0-9]', '', v_lower)
                            cursor.execute("SELECT id_rekanan, nama, kategori FROM rssams.rekanan")
                            all_r = cursor.fetchall()
                            found_m = False
                            for r_id, r_n, r_k in all_r:
                                if r_n and re.sub(r'[^a-zA-Z0-9]', '', r_n.lower()) == v_stripped:
                                    vendor_id, v_nama_final = r_id, r_n
                                    found_m = True
                                    if kategori and not r_k:
                                        cursor.execute("UPDATE rssams.rekanan SET kategori = %s WHERE id_rekanan = %s", [kategori[:100], r_id])
                                    break
                            
                            # 3. If not found in SIMAK master, automatically create new vendor in rssams.rekanan
                            if not found_m and not vendor_id:
                                cursor.execute("SELECT COALESCE(MAX(id_rekanan), 0) + 1 FROM rssams.rekanan")
                                next_id = cursor.fetchone()[0]
                                cursor.execute("""
                                    INSERT INTO rssams.rekanan (id_rekanan, nama, alamat, telp, kc, del, sumber, kategori)
                                    VALUES (%s, %s, '', '', '', 'N', 'ots_import', %s)
                                """, [next_id, v_nama[:100], (kategori or '')[:100]])
                                vendor_id = next_id
                                v_nama_final = v_nama

                vendor_id = vendor_id or 9999
                ket_detail = (item.get('keterangan_excel') or item.get('no_faktur') or '').strip()
                full_keterangan = f"[{kategori}] {ket_detail}" if kategori else ket_detail

                utang = UtangSupplier.objects.create(
                    app_siaga_faktur_id=f"OTS-{item.get('row_idx')}",
                    sumber=sumber,
                    vendor_id=vendor_id,
                    vendor_nama=v_nama_final[:145],
                    nomor_faktur=no_faktur,
                    nomor_spb=no_spb if no_spb else "",
                    tanggal_faktur=tgl_faktur,
                    tanggal_titip=tgl_titip,
                    nominal=nominal,
                    keterangan_titip=full_keterangan[:250],
                    status=st,
                    verified_by=request.user,
                    verified_at=timezone.now(),
                )

                if bayar > Decimal('0'):
                    st_pembayaran = PembayaranUtang.STATUS_REALISASI_LUNAS if sisa <= Decimal('0') else PembayaranUtang.STATUS_REALISASI_SEBAGIAN
                    PembayaranUtang.objects.create(
                        utang=utang,
                        tanggal_rencana_bayar=tgl_rencana,
                        tanggal_proses=tgl_proses,
                        tanggal_app=tgl_app,
                        jumlah_bayar=bayar,
                        potongan_deposit=Decimal('0'),
                        jumlah_kas_keluar=bayar,
                        keterangan=f"Realisasi Saldo Awal OTS (Row {item.get('row_idx')}) - {ket_detail}"[:250],
                        status=st_pembayaran,
                        created_by=request.user,
                    )
                    utang.refresh_status()

                committed_count += 1

        return Response({
            'message': f'Berhasil menyimpan {committed_count} faktur utang dari Excel ke SIMAK.',
            'committed_count': committed_count
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='ots-rollback')
    def ots_rollback(self, request):
        with transaction.atomic():
            ots_utang_qs = UtangSupplier.objects.filter(app_siaga_faktur_id__startswith='OTS-')
            total_utang = ots_utang_qs.count()

            pembayaran_qs = PembayaranUtang.objects.filter(utang__app_siaga_faktur_id__startswith='OTS-')
            total_pembayaran = pembayaran_qs.count()

            pembayaran_qs.delete()
            ots_utang_qs.delete()

        return Response({
            'message': f'Berhasil mengembalikan data (Undo Import). Menghapus {total_utang} data utang dan {total_pembayaran} riwayat pembayaran hasil import Excel OTS.',
            'deleted_utang_count': total_utang,
            'deleted_pembayaran_count': total_pembayaran
        }, status=status.HTTP_200_OK)


class PembayaranUtangViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset = PembayaranUtang.objects.select_related('utang', 'created_by').all()
    serializer_class = PembayaranUtangSerializer
    permission_classes = [IsAuthenticated, IsCatatanUtangObatBhpPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        search = (params.get('search') or '').strip()
        vendor_id = params.get('vendor_id')
        utang_id = params.get('utang') or params.get('utang__id')
        status_param = (params.get('status') or '').strip()
        sumber_filter = (params.get('sumber') or '').strip()
        dari = params.get('dari')
        sampai = params.get('sampai')

        if search:
            qs = qs.filter(
                Q(utang__nomor_faktur__icontains=search)
                | Q(utang__nomor_spb__icontains=search)
                | Q(utang__vendor_nama__icontains=search)
                | Q(keterangan__icontains=search)
            )
        if vendor_id:
            qs = qs.filter(utang__vendor_id=vendor_id)
        if utang_id:
            qs = qs.filter(utang_id=utang_id)
        if status_param:
            if status_param == 'realisasi':
                qs = qs.filter(Q(status__startswith='realisasi') | Q(status='realisasi') | Q(status='retur'))
            else:
                qs = qs.filter(status=status_param)
        if sumber_filter and sumber_filter != 'semua':
            qs = qs.filter(utang__sumber=sumber_filter)
        if dari:
            qs = qs.filter(tanggal_proses__gte=dari)
        if sampai:
            qs = qs.filter(tanggal_proses__lte=sampai)

        order = _utang_order_clause(params.get('ordering'), {
            'vendor': 'utang__vendor_nama',
            '-vendor': '-utang__vendor_nama',
            'nomor_faktur': 'utang__nomor_faktur',
            '-nomor_faktur': '-utang__nomor_faktur',
            'tanggal_proses': 'tanggal_proses',
            '-tanggal_proses': '-tanggal_proses',
            'jumlah_bayar': 'jumlah_bayar',
            '-jumlah_bayar': '-jumlah_bayar',
            'status': 'status',
            '-status': '-status',
        })
        return qs.order_by(order, '-created_at')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        utang = instance.utang
        if instance.status != PembayaranUtang.STATUS_PENDING:
            return Response({'error': 'Hanya pengajuan pembayaran yang berstatus pending yang dapat dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        self.perform_destroy(instance)
        utang.refresh_status()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='realisasi')
    def realisasi(self, request, pk=None):
        pembayaran = self.get_object()
        if pembayaran.status != PembayaranUtang.STATUS_PENDING:
            return Response({'error': 'Pengajuan ini sudah direalisasikan atau tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)
        tanggal_realisasi = request.data.get('tanggal_realisasi') or timezone.now().date().isoformat()
        
        jumlah_bayar_raw = request.data.get('jumlah_bayar')
        if jumlah_bayar_raw is not None:
            try:
                jumlah_bayar = Decimal(str(jumlah_bayar_raw))
                if jumlah_bayar <= 0:
                    return Response({'error': 'Jumlah bayar harus lebih dari 0.'}, status=status.HTTP_400_BAD_REQUEST)
                pembayaran.jumlah_bayar = jumlah_bayar
            except (TypeError, ValueError, InvalidOperation):
                return Response({'error': 'Jumlah bayar tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)

        # Hitung sisa utang faktur SEBELUM realisasi ini disimpan
        total_realisasi_lainnya = pembayaran.utang.pembayaran.filter(
            status__in=[PembayaranUtang.STATUS_REALISASI_SEBAGIAN, PembayaranUtang.STATUS_REALISASI_LUNAS]
        ).exclude(pk=pembayaran.pk).aggregate(total=Sum('jumlah_bayar'))['total'] or Decimal('0')
        
        sisa_sebelumnya = pembayaran.utang.nominal - total_realisasi_lainnya
        
        if pembayaran.jumlah_bayar >= sisa_sebelumnya:
            pembayaran.status = PembayaranUtang.STATUS_REALISASI_LUNAS
        else:
            pembayaran.status = PembayaranUtang.STATUS_REALISASI_SEBAGIAN

        pembayaran.tanggal_proses = tanggal_realisasi
        if not pembayaran.tanggal_app:
            pembayaran.tanggal_app = tanggal_realisasi
        pembayaran.save(update_fields=['status', 'tanggal_proses', 'tanggal_app', 'jumlah_bayar'])

        # Potong terpakai pada DepositVendor jika menggunakan potongan_deposit
        if pembayaran.potongan_deposit and pembayaran.potongan_deposit > 0:
            sisa_potong = pembayaran.potongan_deposit
            active_deposits = DepositVendor.objects.filter(vendor_id=pembayaran.utang.vendor_id).order_by('created_at')
            for dep in active_deposits:
                sisa_dep = dep.sisa_deposit
                if sisa_dep <= 0:
                    continue
                potong_dep = min(sisa_potong, sisa_dep)
                dep.terpakai += potong_dep
                dep.save(update_fields=['terpakai', 'updated_at'])
                sisa_potong -= potong_dep
                if sisa_potong <= 0:
                    break

        utang = pembayaran.utang
        utang.refresh_status()
        return Response({
            'pembayaran': PembayaranUtangSerializer(pembayaran, context={'request': request}).data,
            'utang': UtangSupplierSerializer(utang, context={'request': request}).data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        from itertools import groupby

        qs = list(self.get_queryset().filter(status=PembayaranUtang.STATUS_PENDING).select_related('utang', 'created_by'))
        # Urutkan berdasarkan vendor_nama
        qs.sort(key=lambda item: (
            (item.utang.vendor_nama if item.utang and item.utang.vendor_nama else '').upper(),
            item.id
        ))

        wb = Workbook()
        ws = wb.active
        ws.title = "Pengajuan Pembayaran"

        ws.merge_cells('A1:G1')
        ws['A1'] = 'REKAP PENGAJUAN PEMBAYARAN UTANG SUPPLIER'
        ws['A1'].font = Font(bold=True, size=14)
        ws['A1'].alignment = Alignment(horizontal='center')

        ws['A2'] = f'Tanggal Cetak: {timezone.now().strftime("%d-%m-%Y %H:%M")}'
        ws['A2'].font = Font(italic=True, size=10)

        headers = [
            'No', 'Sumber', 'Vendor / Supplier', 'Umur Utang',
            'Jumlah Bayar (Rp)', 'Keterangan', 'Pengaju (Operator)'
        ]
        ws.append([])
        ws.append(headers)

        header_row = 4
        header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        header_font = Font(bold=True, color='FFFFFF')

        for col_num, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col_num)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )
        subtotal_fill = PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')
        subtotal_font = Font(bold=True, color='0F172A')

        today_date = timezone.localdate()
        global_index = 1
        grand_total = Decimal('0')

        def get_vendor_name(item):
            return (item.utang.vendor_nama if item.utang and item.utang.vendor_nama else 'TANPA VENDOR').strip()

        for vendor_nama, group_items in groupby(qs, key=get_vendor_name):
            items_list = list(group_items)
            vendor_subtotal = Decimal('0')

            for item in items_list:
                jumlah = item.jumlah_bayar or Decimal('0')
                vendor_subtotal += jumlah
                grand_total += jumlah

                utang = item.utang
                if utang and utang.tanggal_titip:
                    days = (today_date - utang.tanggal_titip).days
                    umur_utang_str = f"{max(0, days)} Hari"
                else:
                    umur_utang_str = '-'

                sumber_label = utang.get_sumber_display() if utang else '-'
                operator = item.created_by.username if item.created_by else '-'

                ws.append([
                    global_index,
                    sumber_label,
                    utang.vendor_nama if utang else '-',
                    umur_utang_str,
                    float(jumlah),
                    item.keterangan or '',
                    operator,
                ])
                global_index += 1

                row_num = ws.max_row
                for col in range(1, 8):
                    c = ws.cell(row=row_num, column=col)
                    c.border = thin_border
                    if col in [1, 2, 4]:
                        c.alignment = Alignment(horizontal='center')
                    elif col == 5:
                        c.number_format = '#,##0.00'
                        c.alignment = Alignment(horizontal='right')

            # Subtotal per vendor tepat setelah kelompok vendor berakhir
            subtotal_row = ws.max_row + 1
            ws.cell(row=subtotal_row, column=1, value=f'SUBTOTAL {vendor_nama.upper()}')
            ws.merge_cells(start_row=subtotal_row, start_column=1, end_row=subtotal_row, end_column=4)
            
            subtotal_cell = ws.cell(row=subtotal_row, column=5, value=float(vendor_subtotal))
            subtotal_cell.number_format = '#,##0.00'

            for col in range(1, 8):
                c = ws.cell(row=subtotal_row, column=col)
                c.fill = subtotal_fill
                c.font = subtotal_font
                c.border = thin_border
                if col == 1:
                    c.alignment = Alignment(horizontal='right', vertical='center')
                elif col == 5:
                    c.alignment = Alignment(horizontal='right', vertical='center')

        # Baris Grand Total Pengajuan
        grand_row = ws.max_row + 1
        ws.cell(row=grand_row, column=1, value='GRAND TOTAL PENGAJUAN')
        ws.merge_cells(start_row=grand_row, start_column=1, end_row=grand_row, end_column=4)
        
        grand_cell = ws.cell(row=grand_row, column=5, value=float(grand_total))
        grand_cell.number_format = '#,##0.00'

        grand_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
        grand_font = Font(bold=True, color='FFFFFF')

        for col in range(1, 8):
            c = ws.cell(row=grand_row, column=col)
            c.fill = grand_fill
            c.font = grand_font
            c.border = thin_border
            if col == 1:
                c.alignment = Alignment(horizontal='right', vertical='center')
            elif col == 5:
                c.alignment = Alignment(horizontal='right', vertical='center')

        col_widths = {
            'A': 8,
            'B': 16,
            'C': 35,
            'D': 16,
            'E': 22,
            'F': 38,
            'G': 20,
        }
        for col_letter, width in col_widths.items():
            ws.column_dimensions[col_letter].width = width

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Rekap_Pengajuan_Pembayaran_{timezone.now().strftime("%Y%m%d_%H%M")}.xlsx"'
        wb.save(response)
        return response
        return qs.order_by(order, '-created_at')

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        rows = response.data.get('results') if isinstance(response.data, dict) else response.data
        if isinstance(rows, list):
            running = defaultdict(Decimal)
            page_rows = sorted(rows, key=lambda item: (item.get('utang') or 0, item.get('tanggal_proses') or '', item.get('id') or 0))
            prior_cache = {}
            for item in page_rows:
                utang_id = item.get('utang')
                if utang_id not in prior_cache:
                    pay = PembayaranUtang.objects.filter(
                        utang_id=utang_id,
                        tanggal_proses__lt=item.get('tanggal_proses'),
                    ).aggregate(total=Sum('jumlah_bayar'))['total'] or Decimal('0')
                    prior_cache[utang_id] = pay
                running[utang_id] += Decimal(str(item.get('jumlah_bayar') or 0))
                item['running_total_dibayar'] = prior_cache[utang_id] + running[utang_id]
                item['running_sisa_utang'] = max(Decimal(str(item.get('nominal') or 0)) - item['running_total_dibayar'], Decimal('0'))
        return response


class UtangMenungguVerifikasiView(APIView):
    permission_classes = [IsAuthenticated, IsCatatanUtangObatBhpPermission]
    pagination_class = OptionalPageNumberPagination

    def get(self, request):
        params = request.query_params
        sumber_filter = (params.get('sumber') or 'semua').strip()
        try:
            page = int(params.get('page', 1))
            page_size = min(int(params.get('page_size', 10)), 100)
        except ValueError:
            page, page_size = 1, 10
        offset = max(page - 1, 0) * page_size

        # SELECT clause farmasi
        farmasi_select = """
            SELECT
                CONVERT(t.id USING utf8mb4)             AS app_siaga_faktur_id,
                CONVERT(t.id USING utf8mb4)             AS nomor_spb,
                t.tgl_spb                               AS tanggal_spb,
                CONVERT(t.no_faktur USING utf8mb4)       AS nomor_faktur,
                t.id_rekanan                            AS vendor_id,
                t.id_rekanan                            AS vendor_id_hint,
                CONVERT(COALESCE(r.nama, '') USING utf8mb4) AS vendor_nama,
                t.tgl_faktur                            AS tanggal_faktur,
                t.tgl_jtempo                            AS tanggal_jatuh_tempo,
                t.total                                 AS total_sebelum_diskon,
                COALESCE(t.disc1, 0)                    AS disc1,
                COALESCE(t.disc2, 0)                    AS disc2,
                COALESCE(t.disc3, 0)                    AS disc3,
                (t.total - COALESCE(t.disc1, 0) - COALESCE(t.disc2, 0) - COALESCE(t.disc3, 0)) AS total_setelah_diskon,
                COALESCE(t.ppn, 0)                      AS ppn,
                COALESCE(t.materai, 0)                  AS materai,
                t.gtotal                                AS nominal,
                'farmasi'                               AS sumber
        """

        # SELECT clause logistik
        logistik_select = """
            SELECT
                CONVERT(t.id USING utf8mb4)             AS app_siaga_faktur_id,
                CONVERT(COALESCE(NULLIF(s.no_spb, ''), NULLIF(t.id_spb, ''), t.id) USING utf8mb4) AS nomor_spb,
                t.tgl_spk                               AS tanggal_spb,
                CONVERT(COALESCE(NULLIF(NULLIF(t.no_spk, ''), '-'), '-') USING utf8mb4) AS nomor_faktur,
                r.id_rekanan                            AS vendor_id,
                r.id_rekanan                            AS vendor_id_hint,
                CONVERT(COALESCE(r.nama, t.rekanan) USING utf8mb4) AS vendor_nama,
                t.tgl_spk                               AS tanggal_faktur,
                NULL                                    AS tanggal_jatuh_tempo,
                t.nilai                                 AS total_sebelum_diskon,
                0.00                                    AS disc1,
                0.00                                    AS disc2,
                0.00                                    AS disc3,
                t.nilai                                 AS total_setelah_diskon,
                0.00                                    AS ppn,
                0.00                                    AS materai,
                t.nilai                                 AS nominal,
                'logistik'                              AS sumber
        """

        where_f, vals_f = _build_pending_where(params)
        where_l, vals_l = _build_pending_where_logistik(params)

        # Order mapping berlaku di wrapper query (alias kolom output)
        order = _utang_order_clause(params.get('ordering'), {
            '-tanggal_faktur': 'tanggal_faktur DESC',
            'tanggal_faktur': 'tanggal_faktur',
            'vendor': 'vendor_nama',
            '-vendor': 'vendor_nama DESC',
            'nomor_spb': 'nomor_spb',
            '-nomor_spb': 'nomor_spb DESC',
            'nomor_faktur': 'nomor_faktur',
            '-nomor_faktur': 'nomor_faktur DESC',
            'tanggal_spb': 'tanggal_spb',
            '-tanggal_spb': 'tanggal_spb DESC',
            'created_at': 'tanggal_faktur',
            '-created_at': 'tanggal_faktur DESC',
            'verified_at': 'tanggal_faktur',
            '-verified_at': 'tanggal_faktur DESC',
            'tanggal_jatuh_tempo': 'tanggal_jatuh_tempo',
            '-tanggal_jatuh_tempo': 'tanggal_jatuh_tempo DESC',
            'nominal': 'nominal',
            '-nominal': 'nominal DESC',
        })

        with connection.cursor() as cursor:
            if sumber_filter == 'farmasi':
                count_sql = f'SELECT COUNT(*) {_pending_base_sql()} WHERE {where_f}'
                sum_sql = f'SELECT SUM(t.gtotal) {_pending_base_sql()} WHERE {where_f}'
                count_vals = vals_f
                sum_vals = vals_f
                data_sql = f"""
                    SELECT * FROM (
                        {farmasi_select}
                        {_pending_base_sql()}
                        WHERE {where_f}
                    ) AS combined
                    ORDER BY {order}, app_siaga_faktur_id DESC
                    LIMIT %s OFFSET %s
                """
                data_vals = vals_f + [page_size, offset]

            elif sumber_filter == 'logistik':
                count_sql = f'SELECT COUNT(*) {_pending_base_sql_logistik()} WHERE {where_l}'
                sum_sql = f'SELECT SUM(t.nilai) {_pending_base_sql_logistik()} WHERE {where_l}'
                count_vals = vals_l
                sum_vals = vals_l
                data_sql = f"""
                    SELECT * FROM (
                        {logistik_select}
                        {_pending_base_sql_logistik()}
                        WHERE {where_l}
                    ) AS combined
                    ORDER BY {order}, app_siaga_faktur_id DESC
                    LIMIT %s OFFSET %s
                """
                data_vals = vals_l + [page_size, offset]

            else:  # semua
                count_sql = f"""
                    SELECT COUNT(*) FROM (
                        SELECT 1 {_pending_base_sql()} WHERE {where_f}
                        UNION ALL
                        SELECT 1 {_pending_base_sql_logistik()} WHERE {where_l}
                    ) AS combined
                """
                sum_sql = f"""
                    SELECT SUM(nominal) FROM (
                        SELECT t.gtotal AS nominal {_pending_base_sql()} WHERE {where_f}
                        UNION ALL
                        SELECT t.nilai AS nominal {_pending_base_sql_logistik()} WHERE {where_l}
                    ) AS combined
                """
                count_vals = vals_f + vals_l
                sum_vals = vals_f + vals_l
                data_sql = f"""
                    SELECT * FROM (
                        {farmasi_select}
                        {_pending_base_sql()}
                        WHERE {where_f}
                        UNION ALL
                        {logistik_select}
                        {_pending_base_sql_logistik()}
                        WHERE {where_l}
                    ) AS combined
                    ORDER BY {order}, app_siaga_faktur_id DESC
                    LIMIT %s OFFSET %s
                """
                data_vals = vals_f + vals_l + [page_size, offset]

            cursor.execute(count_sql, count_vals)
            total = cursor.fetchone()[0]
            cursor.execute(sum_sql, sum_vals)
            total_nominal = cursor.fetchone()[0] or 0
            cursor.execute(data_sql, data_vals)
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

        return Response({
            'count': total,
            'total_nominal': float(total_nominal),
            'next': None,
            'previous': None,
            'results': rows,
        })

    def post(self, request):
        app_siaga_faktur_id = request.data.get('app_siaga_faktur_id')
        sumber = (request.data.get('sumber') or 'farmasi').strip()

        if not app_siaga_faktur_id:
            return Response({'app_siaga_faktur_id': 'Faktur APP_SIAGA wajib dipilih.'}, status=status.HTTP_400_BAD_REQUEST)

        if sumber not in (UtangSupplier.SUMBER_FARMASI, UtangSupplier.SUMBER_LOGISTIK):
            return Response({'sumber': f'Nilai sumber tidak valid: {sumber}'}, status=status.HTTP_400_BAD_REQUEST)

        # Cek duplikat berdasarkan kombinasi (faktur_id, sumber)
        if UtangSupplier.objects.filter(app_siaga_faktur_id=str(app_siaga_faktur_id), sumber=sumber).exists():
            return Response({'error': 'Faktur ini sudah diverifikasi.'}, status=status.HTTP_400_BAD_REQUEST)

        if sumber == UtangSupplier.SUMBER_FARMASI:
            faktur = _fetch_app_siaga_faktur(app_siaga_faktur_id)
            if not faktur:
                return Response({'error': 'Faktur farmasi tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)
            utang = UtangSupplier.objects.create(
                app_siaga_faktur_id=str(faktur['app_siaga_faktur_id']),
                sumber=UtangSupplier.SUMBER_FARMASI,
                nomor_spb=faktur.get('nomor_spb') or '',
                tanggal_spb=faktur.get('tanggal_spb'),
                nomor_faktur=faktur.get('nomor_faktur') or '',
                vendor_id=faktur.get('vendor_id') or 0,
                vendor_nama=faktur.get('vendor_nama') or '',
                tanggal_faktur=faktur.get('tanggal_faktur'),
                tanggal_jatuh_tempo=faktur.get('tanggal_jatuh_tempo'),
                nominal=faktur.get('nominal') or 0,
                tanggal_titip=request.data.get('tanggal_titip') or timezone.localdate(),
                keterangan_titip=request.data.get('keterangan_titip') or '',
                verified_by=request.user,
                verified_at=timezone.now(),
            )

        else:  # logistik
            vendor_id = request.data.get('vendor_id')
            if not vendor_id:
                return Response(
                    {'vendor_id': 'Vendor wajib dipilih untuk pembelian logistik.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Validasi vendor_id ke rssams.rekanan
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id_rekanan, nama FROM rssams.rekanan WHERE id_rekanan = %s AND del = 'N' LIMIT 1",
                    [vendor_id],
                )
                rek = cursor.fetchone()
            if not rek:
                return Response(
                    {'vendor_id': 'Vendor tidak ditemukan di master rekanan.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            vendor_id_int, vendor_nama_rek = rek

            faktur = _fetch_logistik_pembelian(app_siaga_faktur_id)
            if not faktur:
                return Response({'error': 'Data logistik tidak ditemukan atau belum selesai (done != Y).'}, status=status.HTTP_404_NOT_FOUND)

            is_cash = str(faktur.get('metode_pembayaran') or '').upper() == 'CASH'
            initial_status = UtangSupplier.STATUS_LUNAS if is_cash else UtangSupplier.STATUS_BELUM_DIBAYAR

            utang = UtangSupplier.objects.create(
                app_siaga_faktur_id=str(faktur['app_siaga_faktur_id']),
                sumber=UtangSupplier.SUMBER_LOGISTIK,
                nomor_spb=faktur.get('nomor_spb') or '',
                tanggal_spb=faktur.get('tanggal_spb'),
                nomor_faktur=faktur.get('nomor_faktur') or '',
                vendor_id=vendor_id_int,
                vendor_nama=vendor_nama_rek,
                tanggal_faktur=faktur.get('tanggal_faktur'),
                tanggal_jatuh_tempo=None,  # tran_beli_brg_log tidak punya jatuh tempo
                nominal=faktur.get('nominal') or 0,
                tanggal_titip=request.data.get('tanggal_titip') or timezone.localdate(),
                keterangan_titip=request.data.get('keterangan_titip') or '',
                status=initial_status,
                verified_by=request.user,
                verified_at=timezone.now(),
            )

        return Response(UtangSupplierSerializer(utang, context={'request': request}).data, status=status.HTTP_201_CREATED)


class UtangVendorOptionsView(APIView):
    permission_classes = [IsAuthenticated, IsCatatanUtangObatBhpPermission]

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id_rekanan AS id, nama
                FROM rssams.rekanan
                WHERE del = 'N'
                ORDER BY nama
                LIMIT 500
                """
            )
            columns = [col[0] for col in cursor.description]
            return Response([dict(zip(columns, row)) for row in cursor.fetchall()])


class AlokasiDanaViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    queryset           = AlokasiDana.objects.select_related('created_by').prefetch_related('pembayaran__faktur', 'pembayaran__created_by').all()
    serializer_class  = AlokasiDanaSerializer
    permission_classes = [IsKeuanganPermission]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs          = super().get_queryset()
        id_pbiaya   = self.request.query_params.get('id_pembiayaan')
        dari        = self.request.query_params.get('dari')
        sampai      = self.request.query_params.get('sampai')
        bank        = self.request.query_params.get('bank')
        if id_pbiaya:   qs = qs.filter(id_pembiayaan=id_pbiaya)
        if dari:        qs = qs.filter(tanggal_penerimaan__gte=dari)
        if sampai:      qs = qs.filter(tanggal_penerimaan__lte=sampai)
        if bank:        qs = qs.filter(bank=bank)
        return qs.order_by('-tanggal_penerimaan')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.digunakan > 0:
            return Response({'error': 'Alokasi yang sudah dipakai tidak bisa dihapus.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


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
        qs = PettyCash.objects.select_related('created_by', 'disetujui_oleh', 'dicairkan_oleh', 'laporan_disetujui_oleh').prefetch_related('laporan').all()
        
        # Manajer ke atas dan petugas kas petty cash bisa lihat semua. User biasa hanya milik sendiri.
        if not (is_manajer_or_above(self.request.user) or is_petty_cash_cashier(self.request.user)):
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

    # POST /{id}/cairkan/ — petugas kas petty cash mencairkan dana
    @action(detail=True, methods=['post'], url_path='cairkan')
    def cairkan(self, request, pk=None):
        if not is_petty_cash_cashier(request.user):
            return Response({'error': 'Hanya petugas kas petty cash yang dapat mencairkan dana.'}, status=403)
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
        if nominal_digunakan > nominal_dicairkan:
            return Response({
                'error': f'Nominal digunakan tidak boleh melebihi dana yang dicairkan. Maksimal Rp {nominal_dicairkan:,.0f}.'
            }, status=400)
        selisih           = nominal_dicairkan - nominal_digunakan

        laporan = serializer.save(petty_cash=instance, selisih=selisih)

        instance.status = 'menunggu_approval_laporan'
        instance.catatan_tolak = ''
        instance.laporan_disetujui_oleh = None
        instance.laporan_disetujui_at = None
        instance.save()

        return Response(LaporanPenggunaanSerializer(laporan, context={'request': request}).data, status=status.HTTP_201_CREATED)

    # POST /{id}/approval-laporan/ — wadir/direktur approve laporan penggunaan
    @action(detail=True, methods=['post'], url_path='approval-laporan')
    def approval_laporan(self, request, pk=None):
        if not is_direktur_or_wadir(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat approve laporan penggunaan.'}, status=403)
        instance = self.get_object()
        if instance.status != 'menunggu_approval_laporan':
            return Response({'error': 'Hanya laporan berstatus menunggu approval yang dapat diproses.'}, status=400)
        if not hasattr(instance, 'laporan'):
            return Response({'error': 'Laporan penggunaan belum tersedia.'}, status=400)

        aksi = request.data.get('aksi', 'setujui')
        catatan = request.data.get('catatan_tolak', '')
        if aksi not in ('setujui', 'tolak'):
            return Response({'error': 'aksi harus setujui atau tolak.'}, status=400)

        laporan = instance.laporan
        if aksi == 'tolak':
            if not catatan:
                return Response({'error': 'Catatan tolak wajib diisi.'}, status=400)
            with transaction.atomic():
                laporan.delete()
                instance.status = 'dicairkan'
                instance.catatan_tolak = catatan
                instance.laporan_disetujui_oleh = None
                instance.laporan_disetujui_at = None
                instance.save()
            return Response({
                'message': 'Laporan penggunaan ditolak. User dapat upload laporan ulang.',
                'status': instance.status,
            }, status=status.HTTP_200_OK)

        with transaction.atomic():
            instance.status = 'menunggu_pengembalian' if laporan.selisih > 0 else 'dilaporkan'
            instance.catatan_tolak = ''
            instance.laporan_disetujui_oleh = request.user
            instance.laporan_disetujui_at = timezone.now()
            instance.save()

        return Response({
            'message': 'Laporan penggunaan berhasil disetujui.',
            'status': instance.status,
        }, status=status.HTTP_200_OK)

    # POST /{id}/konfirmasi-pengembalian/ — petugas kas petty cash konfirmasi uang kembali & selesaikan
    @action(detail=True, methods=['post'], url_path='konfirmasi-pengembalian')
    def konfirmasi_pengembalian(self, request, pk=None):
        if not is_petty_cash_cashier(request.user):
            return Response({'error': 'Hanya petugas kas petty cash yang dapat mengkonfirmasi pengembalian.'}, status=403)
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
    permission_classes = [IsPettyCashSaldoPermission]
 
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


class InventoryOptionViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    serializer_class = InventoryOptionSerializer
    permission_classes = [IsAuthenticated, IsInventoryPermission]

    def get_queryset(self):
        qs = InventoryOption.objects.all()
        option_type = self.request.query_params.get('option_type')
        active = self.request.query_params.get('active')
        search = self.request.query_params.get('search')
        if option_type:
            qs = qs.filter(option_type=option_type)
        if active in ('true', 'false'):
            qs = qs.filter(is_active=(active == 'true'))
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Dropdown tidak bisa dihapus karena sudah dipakai aset.'}, status=400)


class InventoryAssetViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    serializer_class = InventoryAssetSerializer
    permission_classes = [IsAuthenticated, IsInventoryPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_context(self):
        return {'request': self.request}

    def get_queryset(self):
        qs = InventoryAsset.objects.select_related(
            'unit', 'category', 'condition_status', 'ownership_status', 'created_by'
        ).all()
        unit = self.request.query_params.get('unit')
        category = self.request.query_params.get('category')
        condition = self.request.query_params.get('condition_status')
        ownership = self.request.query_params.get('ownership_status')
        search = self.request.query_params.get('search')
        year = self.request.query_params.get('purchase_year')
        if unit:
            qs = qs.filter(unit_id=unit)
        if category:
            qs = qs.filter(category_id=category)
        if condition:
            qs = qs.filter(condition_status_id=condition)
        if ownership:
            qs = qs.filter(ownership_status_id=ownership)
        if year:
            qs = qs.filter(purchase_year=year)
        if search:
            qs = qs.filter(
                Q(description__icontains=search)
                | Q(brand__icontains=search)
                | Q(location__icontains=search)
                | Q(recommended_action__icontains=search)
                | Q(unit__name__icontains=search)
                | Q(category__name__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        qs = self.get_queryset()
        total_value = qs.aggregate(total=Sum('purchase_price'))['total'] or 0
        by_condition = qs.values('condition_status__name').annotate(total=Count('id')).order_by('-total')
        by_category = qs.values('category__name').annotate(total=Count('id')).order_by('-total')[:8]
        return Response({
            'total': qs.count(),
            'total_value': float(total_value),
            'by_condition': [
                {'name': item['condition_status__name'] or 'Tanpa status', 'total': item['total']}
                for item in by_condition
            ],
            'by_category': [
                {'name': item['category__name'] or 'Tanpa kategori', 'total': item['total']}
                for item in by_category
            ],
        })


def legacy_fetchall(sql, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        cols = [col[0] for col in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


def legacy_fetchone(sql, params=None):
    rows = legacy_fetchall(sql, params)
    return rows[0] if rows else None


def legacy_paginated(request, base_sql, count_sql, params=None):
    page = int(request.query_params.get('page') or 1)
    page_size = int(request.query_params.get('page_size') or 10)
    offset = (page - 1) * page_size
    count = legacy_fetchone(count_sql, params or [])['total']
    rows = legacy_fetchall(f'{base_sql} LIMIT %s OFFSET %s', [*(params or []), page_size, offset])
    return Response({'count': count, 'results': rows})


_rekanan_columns_cache = None


def _get_rekanan_columns():
    global _rekanan_columns_cache
    if _rekanan_columns_cache is not None:
        return _rekanan_columns_cache

    cols = set()
    table_name = "rssams.rekanan"
    with connection.cursor() as cursor:
        try:
            cursor.execute("SHOW COLUMNS FROM rssams.rekanan")
            cols = {row[0].lower() for row in cursor.fetchall()}
        except Exception:
            try:
                cursor.execute("SHOW COLUMNS FROM rekanan")
                cols = {row[0].lower() for row in cursor.fetchall()}
                table_name = "rekanan"
            except Exception:
                pass

        if cols:
            if 'sumber' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN sumber VARCHAR(50) DEFAULT 'farmasi'")
                    cols.add('sumber')
                except Exception:
                    pass
            if 'kategori' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN kategori VARCHAR(100) DEFAULT ''")
                    cols.add('kategori')
                except Exception:
                    pass

    _rekanan_columns_cache = cols
    return _rekanan_columns_cache


_dafbrg_log_columns_cache = None


def _get_dafbrg_log_columns():
    global _dafbrg_log_columns_cache
    if _dafbrg_log_columns_cache is not None:
        return _dafbrg_log_columns_cache

    cols = set()
    table_name = "rssams.dafbrg_log"
    with connection.cursor() as cursor:
        try:
            cursor.execute("SHOW COLUMNS FROM rssams.dafbrg_log")
            cols = {row[0].lower() for row in cursor.fetchall()}
        except Exception:
            try:
                cursor.execute("SHOW COLUMNS FROM dafbrg_log")
                cols = {row[0].lower() for row in cursor.fetchall()}
                table_name = "dafbrg_log"
            except Exception:
                pass

        if cols:
            if 'kode_material' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN kode_material VARCHAR(50) DEFAULT ''")
                    cols.add('kode_material')
                except Exception:
                    pass
            if 'gol_baru' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN gol_baru VARCHAR(50) DEFAULT ''")
                    cols.add('gol_baru')
                except Exception:
                    pass
            if 'stock_buffer' not in cols:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN stock_buffer INT DEFAULT 0")
                    cols.add('stock_buffer')
                except Exception:
                    pass

    _dafbrg_log_columns_cache = cols
    return _dafbrg_log_columns_cache


def legacy_stock(id_brg):
    row = legacy_fetchone(
        """
        SELECT
            COALESCE((SELECT SUM(qty * isi) FROM rssams.item_logistik WHERE id_brg = %s), 0)
            - COALESCE((SELECT SUM(qty) FROM rssams.item_out_log WHERE id_brg = %s), 0) AS stock
        """,
        [id_brg, id_brg],
    )
    stock = row['stock'] or 0
    with connection.cursor() as cursor:
        cursor.execute('UPDATE rssams.dafbrg_log SET stock = %s WHERE id_brg = %s', [stock, id_brg])
    return stock


def legacy_next_logistik_id(width=4, where_prefix=True):
    prefix = timezone.localdate().strftime('%y')
    where = 'WHERE LEFT(id,2) = %s' if where_prefix else ''
    q1 = f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) AS max_id FROM rssams.tran_beli_brg_log {where}"
    q2 = f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) AS max_id FROM rssams.logistik_spb {where}"
    
    r1 = legacy_fetchone(q1, [prefix] if where_prefix else [])
    r2 = legacy_fetchone(q2, [prefix] if where_prefix else [])
    
    max_id = max(int(r1['max_id'] if r1 else 0), int(r2['max_id'] if r2 else 0)) + 1
    return f"{prefix}{max_id:0{width}d}"


def legacy_next_year_id(table, width=4, where_prefix=True):
    prefix = timezone.localdate().strftime('%y')
    where = 'WHERE LEFT(id,2) = %s' if where_prefix else ''
    row = legacy_fetchone(
        f"SELECT COALESCE(MAX(CAST(SUBSTR(id,3,{width}) AS UNSIGNED)), 0) + 1 AS next_id FROM rssams.{table} {where}",
        [prefix] if where_prefix else [],
    )
    return f"{prefix}{int(row['next_id']):0{width}d}"


def legacy_next_item_out_id(master_id):
    row = legacy_fetchone(
        "SELECT COALESCE(MAX(CAST(SUBSTR(id,8,3) AS UNSIGNED)), 0) + 1 AS next_id FROM rssams.item_out_log WHERE LEFT(id,6) = %s",
        [master_id],
    )
    return f"{master_id}-{int(row['next_id'])}"


class LogistikBarangViewSet(viewsets.ViewSet):
    serializer_class = LogistikBarangSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        minimum = request.query_params.get('minimum')
        positive_only = str(request.query_params.get('positive_only') or '').lower() in ('1', 'true', 'yes')
        golongan_filter = request.query_params.get('golongan') or ''
        show_all = str(request.query_params.get('show_all') or '').lower() in ('1', 'true', 'yes')
        where = ["del = 'N'"]
        params = []
        if search:
            where.append('(nama_barang LIKE %s OR merk LIKE %s OR kode_material LIKE %s)')
            params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
        if golongan_filter:
            where.append('(gol_baru = %s OR id_gol = %s)')
            params.extend([golongan_filter, golongan_filter])
        if minimum == 'true':
            where.append('stock_buffer > 0 AND stock < stock_buffer')
        elif positive_only:
            where.append('stock > 0')
        where_sql = ' AND '.join(where)
        base = f"""
            SELECT id_brg AS id, id_brg, kode_material, nama_barang, kemasan, satuan, isi, merk,
                COALESCE(NULLIF(gol_baru, ''), CAST(id_gol AS CHAR)) AS golongan, gol_baru,
                stock AS stok, stock_buffer AS stok_minimum,
                del = 'N' AS is_active,
                stock_buffer > 0 AND stock < stock_buffer AS stok_minimum_alert
            FROM rssams.dafbrg_log
            WHERE {where_sql}
            ORDER BY nama_barang
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.dafbrg_log WHERE {where_sql}"
        return legacy_paginated(request, base, count, params)

    @action(detail=False, methods=['get'], url_path='generate-kode')
    def generate_kode(self, request):
        golongan = (request.query_params.get('golongan') or '').strip()
        prefix = 'B8'
        match = re.search(r'([A-Za-z]\d+)', golongan)
        if match:
            prefix = match.group(1).upper()

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT kode_material FROM rssams.dafbrg_log WHERE kode_material LIKE %s",
                [f'{prefix}%']
            )
            rows = cursor.fetchall()
        
        max_num = 0
        for r in rows:
            code = r[0] or ''
            num_part = re.sub(r'[^\d]', '', code[len(prefix):]) if code.startswith(prefix) else ''
            if num_part and num_part.isdigit():
                max_num = max(max_num, int(num_part))

        next_code = f"{prefix}{max_num + 1:03d}"
        return Response({'kode_material': next_code, 'prefix': prefix, 'next_num': max_num + 1})

    def create(self, request):
        data = request.data
        row = legacy_fetchone('SELECT COALESCE(MAX(id_brg), 0) + 1 AS next_id FROM rssams.dafbrg_log')
        id_brg = row['next_id']
        nama_barang = _normalize_logistik_name(data.get('nama_barang', ''))
        merk = _normalize_logistik_name(data.get('merk'))
        golongan = (data.get('golongan') or '').strip()
        kode_material = (data.get('kode_material') or '').strip()

        if not kode_material and golongan:
            match = re.search(r'([A-Za-z]\d+)', golongan)
            prefix = match.group(1).upper() if match else 'B8'
            with connection.cursor() as cursor:
                cursor.execute("SELECT kode_material FROM rssams.dafbrg_log WHERE kode_material LIKE %s", [f'{prefix}%'])
                rows = cursor.fetchall()
            max_num = 0
            for r in rows:
                c = r[0] or ''
                num_part = re.sub(r'[^\d]', '', c[len(prefix):]) if c.startswith(prefix) else ''
                if num_part and num_part.isdigit():
                    max_num = max(max_num, int(num_part))
            kode_material = f"{prefix}{max_num + 1:03d}"

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.dafbrg_log(id_brg, kode_material, nama_barang, kemasan, satuan, isi, merk, id_gol, gol_baru, stock_buffer)
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    id_brg,
                    kode_material or None,
                    str(nama_barang).upper(),
                    data.get('kemasan') or '',
                    data.get('satuan') or '',
                    data.get('isi') or 1,
                    str(merk).upper(),
                    None,
                    golongan or None,
                    data.get('stok_minimum') or 0,
                ],
            )
        return Response({'id': id_brg, 'kode_material': kode_material}, status=201)

    def update(self, request, pk=None):
        data = request.data
        nama_barang = _normalize_logistik_name(data.get('nama_barang', ''))
        merk = _normalize_logistik_name(data.get('merk'))
        golongan = (data.get('golongan') or '').strip()
        kode_material = (data.get('kode_material') or '').strip()

        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.dafbrg_log
                SET kode_material = %s,
                    nama_barang = %s,
                    kemasan = %s,
                    satuan = %s,
                    isi = %s,
                    merk = %s,
                    gol_baru = %s,
                    stock_buffer = %s
                WHERE id_brg = %s
                """,
                [
                    kode_material or None,
                    str(nama_barang).upper(),
                    data.get('kemasan') or '',
                    data.get('satuan') or '',
                    data.get('isi') or 1,
                    str(merk).upper(),
                    golongan or None,
                    data.get('stok_minimum') or 0,
                    pk,
                ],
            )
        return Response({'id': pk, 'kode_material': kode_material}, status=200)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.dafbrg_log SET del = 'Y' WHERE id_brg = %s", [pk])
        return Response(status=204)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        row = legacy_fetchone(
            """
            SELECT COUNT(*) AS total_barang,
                COALESCE(SUM(stock), 0) AS total_stok,
                SUM(CASE WHEN stock_buffer > 0 AND stock < stock_buffer THEN 1 ELSE 0 END) AS stok_minimum,
                SUM(CASE WHEN del = 'Y' THEN 1 ELSE 0 END) AS nonaktif
            FROM rssams.dafbrg_log
            """
        )
        return Response(row)

    @action(detail=False, methods=['get'], url_path='ruang-options')
    def ruang_options(self, request):
        return Response({
            'results': legacy_fetchall("SELECT id_ruang AS id, ruangan AS nama FROM rssams.kode_ruang ORDER BY ruangan")
        })

    @action(detail=True, methods=['get'], url_path='kartu-stok')
    def kartu_stok(self, request, pk=None):
        masuk = legacy_fetchall(
            """
            SELECT DATE(i.tgl_entri) AS tanggal, 'Masuk' AS jenis, i.id AS nomor, t.rekanan AS ruang,
                   i.qty * i.isi AS masuk, 0 AS keluar, i.harga AS harga
            FROM rssams.item_logistik i
            LEFT JOIN rssams.tran_beli_brg_log t ON t.id = i.id
            WHERE i.id_brg = %s AND (i.qty * i.isi > 0 OR COALESCE(t.rekanan, '') != 'STOCK OPNAME')
            """,
            [pk],
        )
        keluar = legacy_fetchall(
            """
            SELECT DATE(o.tgl) AS tanggal, 'Keluar' AS jenis, o.id AS nomor, COALESCE(r.ruangan, 'STOCK OPNAME') AS ruang,
                   0 AS masuk, o.qty AS keluar, o.harga AS harga
            FROM rssams.item_out_log o
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            WHERE o.id_brg = %s AND o.qty > 0
            """,
            [pk],
        )
        rows = sorted(masuk + keluar, key=lambda x: (str(x['tanggal']), str(x['nomor'])))
        saldo = 0
        for row in rows:
            saldo += float(row['masuk'] or 0) - float(row['keluar'] or 0)
            row['saldo'] = saldo
        rows.reverse()
        return Response(rows)


class LogistikVendorViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikOrCatatanUtangPermission]

    def list(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        search = request.query_params.get('search') or ''
        sumber = (request.query_params.get('sumber') or 'semua').strip().lower()
        kategori = (request.query_params.get('kategori') or '').strip()
        where = "WHERE del = 'N'"
        params = []

        if has_sumber and sumber not in ['semua', 'all', '']:
            where += " AND (sumber = %s OR (%s = 'logistik' AND (sumber IS NULL OR sumber = '')))"
            params.extend([sumber, sumber])
        if has_kategori and kategori:
            where += " AND kategori = %s"
            params.append(kategori)

        if search:
            search_conds = ['nama LIKE %s', 'alamat LIKE %s', 'telp LIKE %s', 'kc LIKE %s']
            if has_kategori:
                search_conds.append('kategori LIKE %s')
            where += ' AND (' + ' OR '.join(search_conds) + ')'
            params.extend([f'%{search}%'] * len(search_conds))

        kategori_expr = "COALESCE(kategori, '') AS kategori" if has_kategori else "'' AS kategori"
        sumber_expr = "COALESCE(sumber, 'farmasi') AS sumber" if has_sumber else "'farmasi' AS sumber"

        base = f"""
            SELECT id_rekanan AS id, id_rekanan, nama, alamat, telp, kc, {kategori_expr}, {sumber_expr}, del
            FROM rssams.rekanan
            {where}
            ORDER BY nama
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.rekanan {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        data = request.data
        row = legacy_fetchone('SELECT COALESCE(MAX(id_rekanan), 0) + 1 AS next_id FROM rssams.rekanan')
        vendor_id = row['next_id']
        nama_vendor = _normalize_logistik_name(data.get('nama') or '')
        sumber = data.get('sumber') or 'logistik'

        insert_cols = ['id_rekanan', 'nama', 'alamat', 'telp', 'kc', 'del']
        val_placeholders = ['%s', '%s', '%s', '%s', '%s', "'N'"]
        params = [
            vendor_id,
            str(nama_vendor).upper(),
            data.get('alamat') or '',
            data.get('telp') or '',
            data.get('kc') or '',
        ]

        if has_kategori:
            insert_cols.append('kategori')
            val_placeholders.append('%s')
            params.append(data.get('kategori') or '')
        if has_sumber:
            insert_cols.append('sumber')
            val_placeholders.append('%s')
            params.append(sumber)

        sql = f"""
            INSERT INTO rssams.rekanan({', '.join(insert_cols)})
            VALUES({', '.join(val_placeholders)})
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
        return Response({'id': vendor_id, 'id_rekanan': vendor_id}, status=201)

    def partial_update(self, request, pk=None):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols
        has_kategori = 'kategori' in cols

        data = request.data
        nama_vendor = _normalize_logistik_name(data.get('nama') or '')
        updates = ['nama = %s', 'alamat = %s', 'telp = %s', 'kc = %s']
        params = [
            str(nama_vendor).upper(),
            data.get('alamat') or '',
            data.get('telp') or '',
            data.get('kc') or '',
        ]
        if has_kategori and 'kategori' in data:
            updates.append('kategori = %s')
            params.append(data.get('kategori') or '')
        if has_sumber and 'sumber' in data:
            updates.append('sumber = %s')
            params.append(data.get('sumber') or 'logistik')
        params.append(pk)
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE rssams.rekanan
                SET {', '.join(updates)}
                WHERE id_rekanan = %s
                """,
                params,
            )
        return Response({'detail': 'OK'})

    def destroy(self, request, pk=None):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.rekanan SET del = 'Y' WHERE id_rekanan = %s", [pk])
        return Response(status=204)

    @action(detail=False, methods=['get'], url_path='options')
    def options(self, request):
        cols = _get_rekanan_columns()
        has_sumber = 'sumber' in cols

        sumber = request.query_params.get('sumber') or 'all'
        where = "WHERE del = 'N'"
        params = []
        if has_sumber and sumber != 'all' and sumber != 'semua':
            where += " AND (sumber = %s OR (%s = 'logistik' AND (sumber IS NULL OR sumber = '')))"
            params.extend([sumber, sumber])
        rows = legacy_fetchall(f"SELECT id_rekanan AS id, nama FROM rssams.rekanan {where} ORDER BY nama", params)
        return Response({'results': rows})



class LogistikPembelianViewSet(viewsets.ViewSet):
    serializer_class = LogistikPembelianSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where_sql = "WHERE (t.rekanan LIKE %s OR t.no_spk LIKE %s OR t.id LIKE %s) AND COALESCE(t.rekanan, '') != 'STOCK OPNAME' AND COALESCE(t.no_spk, '') NOT LIKE 'OPNAME-%%'"
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        else:
            where_sql = "WHERE COALESCE(t.rekanan, '') != 'STOCK OPNAME' AND COALESCE(t.no_spk, '') NOT LIKE 'OPNAME-%%'" 
        base = f"""
            SELECT t.id, t.id AS nomor, t.tgl_spk AS tanggal, t.rekanan AS pemasok,
                   t.no_spk AS no_faktur, t.nilai, t.done AS status, t.tgl_entri AS created_at, t.id_spb, t.metode_pembayaran,
                   CASE
                     WHEN t.id_spb IS NULL OR t.id_spb = '' THEN 'Tanpa SPB'
                     WHEN s.id IS NOT NULL THEN 'Ada SPB'
                     ELSE 'SPB Terhapus'
                   END AS spb_status_label,
                   CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_spb
            FROM rssams.tran_beli_brg_log t
            LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
            {where_sql}
            ORDER BY t.tgl_spk DESC, t.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.tran_beli_brg_log t {where_sql}" 
        
        res = legacy_paginated(request, base, count, params)
        for item in res.data['results']:
            item['items'] = legacy_fetchall(
                """
                SELECT i.id, i.id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                       b.satuan, i.qty_pesan, i.qty, i.isi, i.harga, i.jml_mutasi,
                       i.qty * i.isi - i.jml_mutasi AS stok_batch
                FROM rssams.item_logistik i
                INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
                WHERE i.id = %s
                ORDER BY b.nama_barang
                """,
                [item['id']],
            )
        return res

    def create(self, request):
        data = request.data
        xid = data.get('id_spb') or legacy_next_logistik_id()
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.tran_beli_brg_log(id, rekanan, tgl_spk, no_spk, nilai, id_spb, metode_pembayaran)
                VALUES(%s, %s, %s, %s, %s, %s, %s)
                """,
                [xid, str(vendor_name or '').upper(), data.get('tanggal') or timezone.localdate(), data.get('no_faktur') or data.get('no_spb') or '', 0, data.get('id_spb'), data.get('metode_pembayaran') or 'Kredit']
            )
            
            if data.get('id_spb'):
                # Copy items from SPB to Penerimaan
                cursor.execute(
                    """
                    INSERT INTO rssams.item_logistik(id, id_brg, qty, qty_pesan, isi, harga, jml_mutasi)
                    SELECT %s, id_brg, qty, qty, isi, harga, 0
                    FROM rssams.logistik_spb_item
                    WHERE spb_id = %s
                    """,
                    [xid, data.get('id_spb')]
                )
                _refresh_pembelian_total(xid)
                # Update SPB status
                cursor.execute("UPDATE rssams.logistik_spb SET status = 'Selesai' WHERE id = %s", [data.get('id_spb')])

        return Response({'id': xid, 'nomor': xid}, status=201)

    def retrieve(self, request, pk=None):
        item = legacy_fetchone(
            """
            SELECT t.id, t.id AS nomor, t.tgl_spk AS tanggal, t.rekanan AS pemasok,
                   t.no_spk AS no_faktur, t.nilai, t.done AS status, t.tgl_entri AS created_at, t.id_spb, t.metode_pembayaran,
                   CASE
                     WHEN t.id_spb IS NULL OR t.id_spb = '' THEN 'Tanpa SPB'
                     WHEN s.id IS NOT NULL THEN 'Ada SPB'
                     ELSE 'SPB Terhapus'
                   END AS spb_status_label,
                   CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_spb
            FROM rssams.tran_beli_brg_log t
            LEFT JOIN rssams.logistik_spb s ON s.id = t.id_spb
            WHERE t.id = %s
            """,
            [pk]
        )
        if not item:
            return Response({'detail': 'Not found.'}, status=404)
        
        item['items'] = legacy_fetchall(
            """
            SELECT i.id, i.id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                   b.satuan, i.qty_pesan, i.qty, i.isi, i.harga, i.jml_mutasi,
                   i.qty * i.isi - i.jml_mutasi AS stok_batch
            FROM rssams.item_logistik i
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
            WHERE i.id = %s
            ORDER BY b.nama_barang
            """,
            [pk]
        )
        return Response(item)

    def partial_update(self, request, pk=None):
        data = request.data
        updates = []
        values = []
        if 'tanggal' in data:
            updates.append('tgl_spk = %s')
            values.append(data.get('tanggal') or timezone.localdate())
        if 'id_rekanan' in data or 'pemasok' in data:
            vendor_name = data.get('pemasok') or ''
            if data.get('id_rekanan'):
                vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
                vendor_name = vendor['nama'] if vendor else vendor_name
            updates.append('rekanan = %s')
            values.append(str(vendor_name or '').upper())
        if 'no_faktur' in data or 'no_spb' in data:
            updates.append('no_spk = %s')
            values.append(data.get('no_faktur') or data.get('no_spb') or '')
        if 'metode_pembayaran' in data:
            updates.append('metode_pembayaran = %s')
            values.append(data.get('metode_pembayaran') or 'Kredit')
        if not updates:
            return Response({'detail': 'Tidak ada data yang diubah.'}, status=400)
        values.append(pk)
        with connection.cursor() as cursor:
            cursor.execute(f"UPDATE rssams.tran_beli_brg_log SET {', '.join(updates)} WHERE id = %s", values)
        return Response({'detail': 'OK'})

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        existing = legacy_fetchone("SELECT id, done FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
        if not existing:
            return Response({'detail': 'Penerimaan tidak ditemukan.'}, status=404)
        count = legacy_fetchone("SELECT COUNT(*) AS total FROM rssams.item_logistik WHERE id = %s", [pk])
        if not count or count['total'] == 0:
            return Response({'detail': 'Tidak dapat mengirim penerimaan kosong. Tambahkan barang terlebih dahulu.'}, status=400)
        with connection.cursor() as cursor:
            cursor.execute("UPDATE rssams.tran_beli_brg_log SET done = 'Y' WHERE id = %s", [pk])
        return Response({'detail': 'Penerimaan berhasil dikirim ke Keuangan.'})

    def destroy(self, request, pk=None):
        existing = legacy_fetchone("SELECT id, done, id_spb FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
        if not existing:
            return Response({'detail': 'Penerimaan tidak ditemukan.'}, status=404)
        if str(existing.get('done') or '').upper() == 'Y':
            return Response({'detail': 'Penerimaan ini telah dikirim ke Keuangan dan statusnya Terkunci. Data tidak dapat dihapus.'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rssams.item_logistik WHERE id = %s", [pk])
            cursor.execute("DELETE FROM rssams.tran_beli_brg_log WHERE id = %s", [pk])
            spb_target_id = existing.get('id_spb') or pk
            cursor.execute("UPDATE rssams.logistik_spb SET status = 'Draft' WHERE id = %s", [spb_target_id])
        return Response(status=204)



class LogistikBatchViewSet(viewsets.ViewSet):
    serializer_class = LogistikBatchSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def _check_not_submitted(self, pembelian_id):
        row = legacy_fetchone("SELECT done FROM rssams.tran_beli_brg_log WHERE id = %s", [pembelian_id])
        if row and str(row.get('done') or '').upper() == 'Y':
            raise ValidationError('Penerimaan ini sudah dikirim ke Keuangan dan tidak dapat diubah.')

    def _refresh_pembelian_total(self, pembelian_id, no_invoice=None):
        with connection.cursor() as cursor:
            if no_invoice is not None:
                cursor.execute(
                    "UPDATE rssams.tran_beli_brg_log SET no_spk = %s WHERE id = %s",
                    [no_invoice or '', pembelian_id],
                )
            cursor.execute(
                """
                UPDATE rssams.tran_beli_brg_log
                SET nilai = COALESCE((SELECT SUM(qty * harga) FROM rssams.item_logistik WHERE id = %s), 0)
                WHERE id = %s
                """,
                [pembelian_id, pembelian_id],
            )

    def create(self, request):
        data = request.data
        pembelian_id = data.get('pembelian')
        self._check_not_submitted(pembelian_id)
        barang = legacy_fetchone('SELECT isi FROM rssams.dafbrg_log WHERE id_brg = %s', [data.get('barang')])
        if not barang:
            return Response({'detail': 'Barang tidak ditemukan.'}, status=400)
        qty = data.get('qty') or 0
        qty_pesan = data.get('qty_pesan') or 0
        harga = data.get('harga') or 0
        isi = data.get('isi') or barang['isi'] or 1
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_logistik(id, id_brg, qty, qty_pesan, harga, isi)
                VALUES(%s, %s, %s, %s, %s, %s)
                """,
                [pembelian_id, data.get('barang'), qty, qty_pesan, harga, isi],
            )
        _refresh_pembelian_total(pembelian_id, data.get('no_invoice') if data.get('no_invoice') is not None else None)
        legacy_stock(data.get('barang'))
        return Response({'detail': 'OK'}, status=201)

    def partial_update(self, request, pk=None):
        data = request.data
        pembelian_id = pk
        self._check_not_submitted(pembelian_id)
        original_barang = data.get('original_barang') or data.get('barang')
        next_barang = data.get('barang')
        if not original_barang or not next_barang:
            return Response({'detail': 'Barang wajib dipilih.'}, status=400)
        barang = legacy_fetchone('SELECT isi FROM rssams.dafbrg_log WHERE id_brg = %s', [next_barang])
        if not barang:
            return Response({'detail': 'Barang tidak ditemukan.'}, status=400)
        existing = legacy_fetchone(
            'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
            [pembelian_id, original_barang],
        )
        if not existing:
            return Response({'detail': 'Item barang masuk tidak ditemukan.'}, status=404)
        if str(original_barang) != str(next_barang):
            duplicate = legacy_fetchone(
                'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
                [pembelian_id, next_barang],
            )
            if duplicate:
                return Response({'detail': 'Barang tersebut sudah ada di invoice/SPB ini.'}, status=400)
        qty = data.get('qty') or 0
        qty_pesan = data.get('qty_pesan') or 0
        harga = data.get('harga') or 0
        isi = data.get('isi') or barang['isi'] or 1
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.item_logistik
                SET id_brg = %s, qty = %s, qty_pesan = %s, harga = %s, isi = %s
                WHERE id = %s AND id_brg = %s
                """,
                [next_barang, qty, qty_pesan, harga, isi, pembelian_id, original_barang],
            )
        _refresh_pembelian_total(pembelian_id, data.get('no_invoice') if data.get('no_invoice') is not None else None)
        legacy_stock(original_barang)
        if str(original_barang) != str(next_barang):
            legacy_stock(next_barang)
        return Response({'detail': 'OK'})

    def destroy(self, request, pk=None):
        pembelian_id = pk
        self._check_not_submitted(pembelian_id)
        barang_id = request.query_params.get('barang')
        if not barang_id:
            return Response({'detail': 'ID Barang wajib disertakan.'}, status=400)
        
        existing = legacy_fetchone(
            'SELECT id, id_brg FROM rssams.item_logistik WHERE id = %s AND id_brg = %s LIMIT 1',
            [pembelian_id, barang_id],
        )
        if not existing:
            return Response({'detail': 'Item barang tidak ditemukan.'}, status=404)
        
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM rssams.item_logistik
                WHERE id = %s AND id_brg = %s
                """,
                [pembelian_id, barang_id],
            )
        
        _refresh_pembelian_total(pembelian_id)
        legacy_stock(barang_id)
        return Response(status=204)


def create_logistik_mutasi_fifo_legacy(id_brg, id_ruang, qty, tanggal=None, keterangan=''):
    stock = legacy_stock(id_brg)
    qty = float(qty)
    if stock < qty:
        raise ValidationError('Stok barang tidak cukup.')
    master_id = legacy_next_year_id('tran_out_brg_log')
    tgl = f"{tanggal or timezone.localdate()} {timezone.localtime().strftime('%H:%M:%S')}"
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO rssams.tran_out_brg_log(id, tgl, id_ruang, pemberi, penerima)
            VALUES(%s, %s, %s, %s, %s)
            """,
            [master_id, tgl, id_ruang, '', keterangan or 'SIMAK'],
        )
    remaining = qty
    for batch in legacy_fetchall("SELECT * FROM rssams.item_logistik WHERE id_brg = %s ORDER BY id", [id_brg]):
        tersedia = float(batch['qty'] or 0) * float(batch['isi'] or 0) - float(batch['jml_mutasi'] or 0)
        if tersedia <= 0:
            continue
        ambil = min(remaining, tersedia)
        harga = float(batch['harga'] or 0) / (float(batch['isi'] or 1) or 1)
        item_id = legacy_next_item_out_id(master_id)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s, 'Sudah Diberikan')
                """,
                [item_id, id_brg, ambil, ambil, harga, tgl, id_ruang, batch['id']],
            )
            cursor.execute(
                """
                UPDATE rssams.item_logistik
                SET jml_mutasi = COALESCE((SELECT SUM(qty) FROM rssams.item_out_log WHERE id_brg = %s AND id_item_logistik = %s), 0)
                WHERE id = %s AND id_brg = %s
                """,
                [id_brg, batch['id'], batch['id'], id_brg],
            )
        remaining -= ambil
        if remaining == 0:
            break
    if remaining > 0:
        raise ValidationError('Stok batch tidak cukup.')
    total = legacy_fetchone("SELECT COALESCE(SUM(qty),0) AS jmlbrg, COALESCE(SUM(qty*harga),0) AS nilai FROM rssams.item_out_log WHERE LEFT(id,6) = %s", [master_id])
    with connection.cursor() as cursor:
        cursor.execute("UPDATE rssams.tran_out_brg_log SET jmlbrg = %s, nilai = %s, done = 'Y' WHERE id = %s", [total['jmlbrg'], total['nilai'], master_id])
    legacy_stock(id_brg)
    return master_id


class LogistikMutasiViewSet(viewsets.ViewSet):
    serializer_class = LogistikMutasiSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = 'WHERE o.qty > 0'
        params = []
        if search:
            where += ' AND (b.nama_barang LIKE %s OR r.ruangan LIKE %s OR o.id LIKE %s)'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT o.id, o.id AS nomor, o.id_brg AS barang, b.nama_barang AS barang_nama, b.satuan,
                   DATE(o.tgl) AS tanggal, o.id_ruang, r.ruangan AS ruang, o.qty, o.harga, o.status
            FROM rssams.item_out_log o
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.item_out_log o INNER JOIN rssams.dafbrg_log b ON b.id_brg=o.id_brg LEFT JOIN rssams.kode_ruang r ON r.id_ruang=o.id_ruang {where}"
        return legacy_paginated(request, base, count, params)

    @transaction.atomic
    def create(self, request):
        master_id = create_logistik_mutasi_fifo_legacy(
            request.data.get('barang'),
            request.data.get('ruang'),
            request.data.get('qty') or 0,
            request.data.get('tanggal'),
            request.data.get('keterangan') or '',
        )
        return Response({'id': master_id, 'nomor': master_id}, status=201)


class LogistikPermintaanViewSet(viewsets.ViewSet):
    serializer_class = LogistikPermintaanSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        status_param = request.query_params.get('status')
        where = 'WHERE o.qty_minta > 0'
        params = []
        if status_param == 'menunggu':
            where += " AND o.status = 'Belum Ditanggapi'"
        elif status_param == 'disetujui':
            where += " AND (o.status LIKE 'Disetujui%%' OR o.status IN ('Sudah Diberikan','Sudah Diterima'))"
        elif status_param == 'ditolak':
            where += " AND o.status NOT IN ('Belum Ditanggapi', 'Sudah Diberikan', 'Sudah Diterima') AND o.status NOT LIKE 'Disetujui%%'" 
        if search:
            where += ' AND (b.nama_barang LIKE %s OR r.ruangan LIKE %s OR o.id LIKE %s)'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT o.id, o.id_brg AS barang, b.nama_barang AS barang_nama, b.satuan,
                   DATE(o.tgl) AS tanggal, o.id_ruang, r.ruangan AS ruang,
                   o.qty_minta, o.qty AS qty_setuju,
                   CASE WHEN o.status = 'Belum Ditanggapi' THEN 'menunggu'
                        WHEN o.status LIKE 'Disetujui%%' OR o.status IN ('Sudah Diberikan','Sudah Diterima') THEN 'disetujui'
                        ELSE 'ditolak' END AS status,
                   o.status AS status_label, o.tgl_verif AS verified_at
            FROM rssams.item_out_log o
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            LEFT JOIN rssams.kode_ruang r ON r.id_ruang = o.id_ruang
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.item_out_log o INNER JOIN rssams.dafbrg_log b ON b.id_brg=o.id_brg LEFT JOIN rssams.kode_ruang r ON r.id_ruang=o.id_ruang {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        prefix = timezone.localdate().strftime('%y')
        next_row = legacy_fetchone(
            "SELECT COALESCE(MAX(CAST(SUBSTR(id,4,6) AS UNSIGNED)),0)+1 AS next_id FROM rssams.item_out_log WHERE LEFT(id,2) = %s",
            [prefix],
        )
        xid = f"{prefix}-{int(next_row['next_id']):06d}"
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                VALUES(%s, %s, %s, 0, 0, NOW(), %s, '', 'Belum Ditanggapi')
                """,
                [xid, request.data.get('barang'), request.data.get('qty_minta') or 0, request.data.get('ruang')],
            )
        return Response({'id': xid}, status=201)

    @action(detail=True, methods=['post'], url_path='verifikasi')
    @transaction.atomic
    def verifikasi(self, request, pk=None):
        item = legacy_fetchone('SELECT * FROM rssams.item_out_log WHERE id = %s', [pk])
        if not item:
            return Response({'error': 'Permintaan tidak ditemukan.'}, status=404)
        if item['status'] != 'Belum Ditanggapi':
            return Response({'error': 'Permintaan sudah diverifikasi.'}, status=400)
        status_baru = request.data.get('status')
        qty_setuju = int(request.data.get('qty_setuju') or 0)
        if status_baru not in ('disetujui', 'ditolak'):
            return Response({'error': 'Status verifikasi tidak valid.'}, status=400)
        if status_baru == 'disetujui':
            if qty_setuju <= 0 or qty_setuju > int(item['qty_minta'] or 0):
                return Response({'error': 'Qty disetujui harus lebih dari 0 dan tidak melebihi permintaan.'}, status=400)
            with connection.cursor() as cursor:
                cursor.execute("UPDATE rssams.item_out_log SET qty = %s, status = 'Disetujui', tgl_verif = NOW() WHERE id = %s", [qty_setuju, pk])
        else:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE rssams.item_out_log SET qty = 0, status = 'Tidak Disetujui', tgl_verif = NOW() WHERE id = %s", [pk])
        return Response({'detail': 'OK'})


class LogistikOpnameViewSet(viewsets.ViewSet):
    serializer_class = LogistikOpnameSerializer
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where = 'WHERE b.nama_barang LIKE %s'
            params = [f'%{search}%']
        base = f"""
            SELECT o.id, o.id_brg AS barang, b.nama_barang AS barang_nama,
                   o.tgl AS tanggal, o.stock_komp AS stok_sistem, o.real_stock,
                   o.real_stock - o.stock_komp AS selisih, '' AS keterangan
            FROM rssams.opname_brg_log o
            LEFT JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg
            {where}
            ORDER BY o.tgl DESC, o.id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.opname_brg_log o LEFT JOIN rssams.dafbrg_log b ON b.id_brg = o.id_brg {where}"
        return legacy_paginated(request, base, count, params)

    def create(self, request):
        data = request.data
        id_brg = data.get('barang')
        real_stock = float(data.get('real_stock') or 0)
        tanggal = data.get('tanggal') or timezone.localdate()

        # 1. Hitung stok sistem terkini dan catat opname
        stock_sistem = float(legacy_stock(id_brg) or 0)
        selisih = real_stock - stock_sistem

        opname_row = legacy_fetchone('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM rssams.opname_brg_log')
        opname_id = opname_row['next_id']

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.opname_brg_log(id, id_brg, real_stock, stock_komp, harga, tgl)
                VALUES(%s, %s, %s, %s, 0, %s)
                """,
                [opname_id, id_brg, real_stock, stock_sistem, tanggal],
            )

        # 2. Terapkan penyesuaian stok jika ada selisih
        if abs(selisih) >= 0.01:
            opname_spb_id = legacy_next_logistik_id()
            tgl_dt = f"{tanggal} {timezone.localtime().strftime('%H:%M:%S')}"

            # Buat SPB OPNAME sebagai referensi
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rssams.tran_beli_brg_log(id, tgl_spk, no_spk, rekanan, nilai, done)
                    VALUES(%s, %s, %s, 'STOCK OPNAME', 0, 'Y')
                    """,
                    [opname_spb_id, tanggal, f'OPNAME-{opname_id}'],
                )

            if selisih > 0:
                # Stok sistem lebih rendah dari real: tambah stok masuk
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_logistik(id, id_brg, qty, isi, harga)
                        VALUES(%s, %s, %s, 1, 0)
                        """,
                        [opname_spb_id, id_brg, selisih],
                    )
            else:
                # Stok sistem lebih tinggi dari real: kurangi dengan out record
                # Dummy batch masuk (qty=0) sebagai referensi id_item_logistik
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_logistik(id, id_brg, qty, isi, harga)
                        VALUES(%s, %s, 0, 1, 0)
                        """,
                        [opname_spb_id, id_brg],
                    )

                # Master tran_out_brg_log untuk opname
                opname_out_id = legacy_next_year_id('tran_out_brg_log')
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.tran_out_brg_log(id, tgl, id_ruang, pemberi, penerima, done)
                        VALUES(%s, %s, 1, 'SIMAK', 'STOCK OPNAME', 'Y')
                        """,
                        [opname_out_id, tgl_dt],
                    )

                # Item out yang mengurangi stok, referensi ke dummy batch
                out_item_id = legacy_next_item_out_id(opname_out_id)
                qty_kurang = abs(selisih)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rssams.item_out_log(id, id_brg, qty_minta, qty, harga, tgl, id_ruang, id_item_logistik, status)
                        VALUES(%s, %s, %s, %s, 0, %s, 1, %s, 'Sudah Diberikan')
                        """,
                        [out_item_id, id_brg, qty_kurang, qty_kurang, tgl_dt, opname_spb_id],
                    )

            # Refresh cache stok di dafbrg_log
            legacy_stock(id_brg)

        return Response({'id': opname_id}, status=201)


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



def _refresh_pembelian_total(pembelian_id, no_invoice=None):
    from django.db import connection
    with connection.cursor() as cursor:
        if no_invoice is not None:
            cursor.execute(
                "UPDATE rssams.tran_beli_brg_log SET no_spk = %s WHERE id = %s",
                [no_invoice or '', pembelian_id],
            )
        cursor.execute(
            """
            UPDATE rssams.tran_beli_brg_log
            SET nilai = COALESCE((SELECT SUM(qty * harga) FROM rssams.item_logistik WHERE id = %s), 0)
            WHERE id = %s
            """,
            [pembelian_id, pembelian_id],
        )


def _refresh_spb_total(spb_id):
    from django.db import connection
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE rssams.logistik_spb s
            SET nilai = COALESCE((
                SELECT SUM(qty * harga) FROM rssams.logistik_spb_item WHERE spb_id = s.id
            ), 0)
            WHERE id = %s
            """,
            [spb_id]
        )

class LogistikSpbViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def retrieve(self, request, pk=None):
        item = legacy_fetchone(
            """
            SELECT id, id AS nomor, tanggal, rekanan AS pemasok,
                   no_spb, nilai, status, tgl_entri AS created_at, metode_pembayaran
            FROM rssams.logistik_spb
            WHERE id = %s
            """,
            [pk]
        )
        if not item:
            return Response({'detail': 'SPB tidak ditemukan.'}, status=404)
        item['items'] = legacy_fetchall(
            """
            SELECT i.id, i.spb_id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                   b.satuan, i.qty AS qty_pesan, 0 AS qty, i.isi, i.harga, 0 AS jml_mutasi,
                   i.qty * i.isi AS stok_batch
            FROM rssams.logistik_spb_item i
            INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
            WHERE i.spb_id = %s
            ORDER BY b.nama_barang
            """,
            [pk]
        )
        return Response(item)

    def list(self, request):
        search = request.query_params.get('search') or ''
        where = ''
        params = []
        if search:
            where = 'WHERE rekanan LIKE %s OR no_spb LIKE %s OR id LIKE %s'
            params = [f'%{search}%', f'%{search}%', f'%{search}%']
        base = f"""
            SELECT id, id AS nomor, tanggal, rekanan AS pemasok,
                   no_spb, nilai, status, tgl_entri AS created_at, metode_pembayaran
            FROM rssams.logistik_spb {where}
            ORDER BY tanggal DESC, id DESC
        """
        count = f"SELECT COUNT(*) AS total FROM rssams.logistik_spb {where}"
        res = legacy_paginated(request, base, count, params)
        for item in res.data['results']:
            item['items'] = legacy_fetchall(
                """
                SELECT i.id, i.spb_id AS pembelian, i.id_brg AS barang, b.nama_barang AS barang_nama,
                       b.satuan, i.qty AS qty_pesan, 0 AS qty, i.isi, i.harga, 0 AS jml_mutasi,
                       i.qty * i.isi AS stok_batch
                FROM rssams.logistik_spb_item i
                INNER JOIN rssams.dafbrg_log b ON b.id_brg = i.id_brg
                WHERE i.spb_id = %s
                ORDER BY b.nama_barang
                """,
                [item['id']],
            )
        return res

    def create(self, request):
        data = request.data
        xid = data.get('id_spb') or legacy_next_logistik_id() # Keep same numbering sequence as pembelian
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.logistik_spb(id, rekanan, tanggal, no_spb, nilai, metode_pembayaran)
                VALUES(%s, %s, %s, %s, %s, %s)
                """,
                [xid, str(vendor_name or '').upper(), data.get('tanggal') or timezone.localdate(), data.get('no_spb') or '', 0, data.get('metode_pembayaran') or 'Kredit'],
            )
        return self.retrieve(request, pk=xid)

    def partial_update(self, request, pk=None):
        data = request.data
        vendor_name = data.get('pemasok') or ''
        if data.get('id_rekanan'):
            vendor = legacy_fetchone('SELECT nama FROM rssams.rekanan WHERE id_rekanan = %s', [data.get('id_rekanan')])
            vendor_name = vendor['nama'] if vendor else vendor_name
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.logistik_spb
                SET rekanan = %s, tanggal = %s, no_spb = %s, metode_pembayaran = %s
                WHERE id = %s
                """,
                [str(vendor_name or '').upper(), data.get('tanggal'), data.get('no_spb') or '', data.get('metode_pembayaran') or 'Kredit', pk]
            )
        return Response({'status': 'ok'})

    def destroy(self, request, pk=None):
        penerimaan = legacy_fetchone(
            "SELECT id FROM rssams.tran_beli_brg_log WHERE id = %s OR id_spb = %s LIMIT 1",
            [pk, pk]
        )
        if penerimaan:
            return Response(
                {'detail': 'SPB ini sudah diproses menjadi Penerimaan Gudang dan tidak dapat dihapus.'},
                status=400
            )
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rssams.logistik_spb_item WHERE spb_id = %s", [pk])
            cursor.execute("DELETE FROM rssams.logistik_spb WHERE id = %s", [pk])
        return Response(status=204)

class LogistikSpbItemViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsLogistikPermission]

    def create(self, request):
        data = request.data
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO rssams.logistik_spb_item(spb_id, id_brg, qty, isi, harga)
                VALUES(%s, %s, %s, %s, %s)
                """,
                [data.get('pembelian'), data.get('barang'), data.get('qty_pesan') or data.get('qty') or 0, data.get('isi', 1), data.get('harga', 0)]
            )
        _refresh_spb_total(data.get('pembelian'))
        return Response({'status': 'created'}, status=201)

    def partial_update(self, request, pk=None):
        data = request.data
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rssams.logistik_spb_item
                SET qty = %s, isi = %s, harga = %s
                WHERE id = %s
                """,
                [data.get('qty_pesan') or data.get('qty') or 0, data.get('isi', 1), data.get('harga', 0), pk]
            )
            # Fetch spb_id
            cursor.execute("SELECT spb_id FROM rssams.logistik_spb_item WHERE id = %s", [pk])
            row = cursor.fetchone()
        if row:
            _refresh_spb_total(row[0])
        return Response({'status': 'updated'})

    def destroy(self, request, pk=None):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT spb_id FROM rssams.logistik_spb_item WHERE id = %s", [pk])
            row = cursor.fetchone()
            cursor.execute("DELETE FROM rssams.logistik_spb_item WHERE id = %s", [pk])
        if row:
            _refresh_spb_total(row[0])
        return Response(status=204)
