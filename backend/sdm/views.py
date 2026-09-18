from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse
from datetime import datetime, date, timedelta
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from .models import IzinKeluar, IzinKeluarLog
from .serializers import (
    IzinKeluarSerializer,
    IzinKeluarCreateSerializer,
    IzinKeluarAdjustSerializer,
    IzinKeluarReturnSerializer,
    IzinKeluarLogSerializer,
)


def has_sdm_access(user):
    """Cek apakah user memiliki akses monitoring rekapitulasi SDM & Direksi"""
    if not user or not user.is_authenticated:
        return False
    return (
        user.is_superuser or
        getattr(user, 'is_sdm', False) or
        user.role in ('direktur', 'wakil_direktur')
    )


class IzinKeluarViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == 'create':
            return IzinKeluarCreateSerializer
        return IzinKeluarSerializer

    def get_queryset(self):
        user = self.request.user
        qs = IzinKeluar.objects.select_related('user', 'user__unit').prefetch_related('logs', 'logs__created_by')

        # Mode filter 'mine' (khusus izin sendiri, berguna bagi SDM saat di tab Izin Saya)
        is_mine = self.request.query_params.get('mine') in ('1', 'true', 'True')

        if not has_sdm_access(user) or is_mine:
            qs = qs.filter(user=user)
        else:
            # Akses SDM / Direksi: dapat memfilter berdasarkan unit
            unit_id = self.request.query_params.get('unit')
            if unit_id:
                qs = qs.filter(user__unit_id=unit_id)

        # Filter Kategori
        kategori = self.request.query_params.get('kategori')
        if kategori:
            qs = qs.filter(kategori=kategori)

        # Filter Status
        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        # Filter Rentang Tanggal
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(tanggal__gte=start_date)
        if end_date:
            qs = qs.filter(tanggal__lte=end_date)

        # Filter Hanya Yang Ada Penyesuaian Jam
        adjusted = self.request.query_params.get('adjusted')
        if adjusted in ('1', 'true', 'True'):
            qs = qs.filter(is_adjusted=True)

        # Pencarian Teks
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(keperluan__icontains=search)
            )

        return qs.order_by('-tanggal', '-created_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = serializer.instance
        output_serializer = IzinKeluarSerializer(instance, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        user = self.request.user
        jam_keluar = serializer.validated_data.get('jam_keluar')
        jam_kembali = serializer.validated_data.get('jam_kembali')

        # Kunci jam rencana awal dan set status berjalan
        serializer.save(
            user=user,
            jam_keluar_awal=jam_keluar,
            jam_kembali_awal=jam_kembali,
            status='berjalan',
            is_adjusted=False
        )

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.user != user and not user.is_superuser:
            raise PermissionDenied('Anda hanya dapat menghapus izin milik Anda sendiri.')
        if instance.status == 'selesai':
            raise ValidationError('Izin yang sudah selesai tidak dapat dihapus.')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='sesuaikan-jam')
    def sesuaikan_jam(self, request, pk=None):
        """Menyesuaikan jam keluar / kembali dengan mencatat histori perubahan"""
        izin = self.get_object()

        # Validasi kepemilikan
        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin mengubah data ini.')

        if izin.status != 'berjalan':
            return Response(
                {'error': 'Hanya izin yang berstatus Sedang di Luar yang dapat disesuaikan jamnya.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = IzinKeluarAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        jam_keluar_baru = serializer.validated_data.get('jam_keluar', izin.jam_keluar)
        jam_kembali_baru = serializer.validated_data.get('jam_kembali', izin.jam_kembali)
        alasan = serializer.validated_data.get('alasan_penyesuaian')

        # Catat jejak audit ke dalam IzinKeluarLog
        IzinKeluarLog.objects.create(
            izin=izin,
            jam_keluar_sebelum=izin.jam_keluar,
            jam_kembali_sebelum=izin.jam_kembali,
            jam_keluar_sesudah=jam_keluar_baru,
            jam_kembali_sesudah=jam_kembali_baru,
            alasan_penyesuaian=alasan,
            created_by=request.user
        )

        # Update jam aktif di master data
        izin.jam_keluar = jam_keluar_baru
        izin.jam_kembali = jam_kembali_baru
        izin.is_adjusted = True
        izin.save()

        return Response(IzinKeluarSerializer(izin).data)

    @action(detail=True, methods=['post'], url_path='konfirmasi-kembali')
    def konfirmasi_kembali(self, request, pk=None):
        """Konfirmasi bahwa staf sudah kembali ke tempat kerja"""
        izin = self.get_object()

        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin mengonfirmasi kepulangan ini.')

        if izin.status != 'berjalan':
            return Response(
                {'error': f'Izin ini sudah berstatus {izin.get_status_display()}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = IzinKeluarReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        waktu_sekarang = timezone.localtime().time()
        jam_aktual = serializer.validated_data.get('jam_kembali_aktual') or waktu_sekarang
        catatan = serializer.validated_data.get('catatan_kembali', '')

        izin.jam_kembali_aktual = jam_aktual
        if catatan:
            izin.catatan_kembali = catatan
        izin.status = 'selesai'
        izin.save()

        return Response(IzinKeluarSerializer(izin).data)

    @action(detail=True, methods=['post'], url_path='batalkan')
    def batalkan(self, request, pk=None):
        """Membatalkan izin keluar"""
        izin = self.get_object()

        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin membatalkan izin ini.')

        if izin.status != 'berjalan':
            return Response(
                {'error': 'Hanya izin yang sedang berjalan yang dapat dibatalkan.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        izin.status = 'dibatalkan'
        izin.save()

        return Response(IzinKeluarSerializer(izin).data)

    @action(detail=False, methods=['get'], url_path='statistik')
    def statistik(self, request):
        """Ringkasan statistik real-time untuk dashboard SDM maupun pengguna"""
        user = request.user
        today = timezone.localdate()

        # Cek izin aktif milik user sendiri
        active_mine = IzinKeluar.objects.filter(
            user=user,
            status='berjalan'
        ).order_by('-tanggal', '-created_at').first()

        active_mine_data = IzinKeluarSerializer(active_mine).data if active_mine else None

        data = {
            'has_sdm_access': has_sdm_access(user),
            'active_mine': active_mine_data,
        }

        if has_sdm_access(user):
            today_qs = IzinKeluar.objects.filter(tanggal=today)
            month_qs = IzinKeluar.objects.filter(tanggal__year=today.year, tanggal__month=today.month)

            data.update({
                'today_sedang_keluar': today_qs.filter(status='berjalan').count(),
                'today_sudah_kembali': today_qs.filter(status='selesai').count(),
                'month_total': month_qs.count(),
                'month_dinas': month_qs.filter(kategori='dinas').count(),
                'month_pribadi': month_qs.filter(kategori='pribadi').count(),
                'month_sakit': month_qs.filter(kategori='sakit').count(),
                'month_adjusted': month_qs.filter(is_adjusted=True).count(),
            })

        return Response(data)

    @action(detail=False, methods=['get'], url_path='export-excel')
    def export_excel(self, request):
        """Export rekapitulasi izin meninggalkan kerja ke format Excel (.xlsx)"""
        user = request.user
        if not has_sdm_access(user):
            raise PermissionDenied('Hanya staf SDM dan Direksi yang dapat mengunduh rekapitulasi.')

        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Rekap Izin Kerja"

        # Styling Definitions
        font_title = Font(name='Arial', size=13, bold=True, color='0F172A')
        font_meta = Font(name='Arial', size=9, italic=True, color='475569')
        font_th = Font(name='Arial', size=9, bold=True, color='FFFFFF')
        font_td = Font(name='Arial', size=9, color='0F172A')
        font_td_bold = Font(name='Arial', size=9, bold=True, color='0F172A')

        fill_th = PatternFill(start_color='1E3A8A', end_color='1E3A8A', fill_type='solid') # Navy blue
        fill_zebra = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1'),
        )

        # Header Title
        ws.merge_cells('A1:L1')
        ws['A1'] = "REKAPITULASI IZIN MENINGGALKAN TEMPAT KERJA"
        ws['A1'].font = font_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A2:L2')
        cetak_str = f"Dicetak pada: {timezone.localtime().strftime('%d/%m/%Y %H:%M')} | Oleh: {user.get_full_name() or user.username} (SDM)"
        ws['A2'] = cetak_str
        ws['A2'].font = font_meta
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

        ws.append([]) # Row 3 blank

        headers = [
            "No",
            "Tanggal",
            "Nama Pegawai",
            "Unit / Bagian",
            "Kategori",
            "Keperluan",
            "Rencana Keluar",
            "Rencana Kembali",
            "Aktual / Disesuaikan",
            "Jam Kembali Riil",
            "Status",
            "Ket. Penyesuaian"
        ]
        ws.append(headers)

        header_row = 4
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=header_row, column=col_idx)
            cell.font = font_th
            cell.fill = fill_th
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border
        ws.row_dimensions[header_row].height = 28

        # Isi Data
        row_num = header_row + 1
        for idx, item in enumerate(qs, start=1):
            nama_user = f"{item.user.first_name} {item.user.last_name}".strip() or item.user.username
            unit_user = item.user.unit.nama if item.user.unit else '-'
            tgl_str = item.tanggal.strftime('%d/%m/%Y') if item.tanggal else '-'
            jam_awal = f"{item.jam_keluar_awal.strftime('%H:%M')} - {item.jam_kembali_awal.strftime('%H:%M')}"
            jam_aktif = f"{item.jam_keluar.strftime('%H:%M')} - {item.jam_kembali.strftime('%H:%M')}"
            jam_kembali_riil = item.jam_kembali_aktual.strftime('%H:%M') if item.jam_kembali_aktual else '-'

            penyesuaian_info = "Sesuai Jadwal Awal"
            if item.is_adjusted:
                latest_log = item.logs.first()
                alasan = f" (Alasan: {latest_log.alasan_penyesuaian})" if latest_log else ""
                penyesuaian_info = f"Ada Perubahan Jam{alasan}"

            row_data = [
                idx,
                tgl_str,
                nama_user,
                unit_user,
                item.get_kategori_display(),
                item.keperluan,
                jam_awal,
                jam_aktif,
                jam_aktif if item.is_adjusted else "Tidak Berubah",
                jam_kembali_riil,
                item.get_status_display(),
                penyesuaian_info
            ]
            ws.append(row_data)

            is_even = (idx % 2 == 0)
            for col_idx in range(1, len(row_data) + 1):
                cell = ws.cell(row=row_num, column=col_idx)
                cell.font = font_td
                cell.border = thin_border
                if is_even:
                    cell.fill = fill_zebra

                if col_idx in (1, 2, 7, 8, 9, 10, 11):
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                elif col_idx in (5,):
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                else:
                    cell.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)

            row_num += 1

        # Auto-adjust column widths
        col_widths = {
            1: 6,   # No
            2: 12,  # Tanggal
            3: 24,  # Nama Pegawai
            4: 20,  # Unit
            5: 16,  # Kategori
            6: 30,  # Keperluan
            7: 16,  # Rencana Awal
            8: 16,  # Jam Aktif
            9: 18,  # Status Penyesuaian
            10: 16, # Jam Kembali Riil
            11: 16, # Status
            12: 32, # Ket Penyesuaian
        }
        for col_idx, width in col_widths.items():
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = width

        # Generate HTTP response
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        file_name = f"Rekap_Izin_Keluar_{timezone.localdate().strftime('%Y%m%d')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{file_name}"'
        wb.save(response)
        return response
