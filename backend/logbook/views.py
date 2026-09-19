from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q, Count, Sum, Value
from django.db.models.functions import Concat
from django.utils import timezone
from django.http import HttpResponse
from datetime import datetime, date, timedelta
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from .models import Logbook, Task, SesiKerja, UraianTugas
from .serializers import LogbookSerializer, LogbookInputSerializer, TaskSerializer, TaskCreateSerializer, UraianTugasSerializer, UraianTugasInputSerializer
from .utils import hitung_durasi_sesi


def get_monitoring_level(user):
    """Return: 'all' (direktur), 'unit' (kepala_seksi/manajer), atau None"""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser or user.role in ('direktur', 'wakil_direktur'):
        return 'all'
    return None


class UraianTugasViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return UraianTugas.objects.filter(user=self.request.user).order_by('-created_at')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UraianTugasInputSerializer
        return UraianTugasSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        if instance.user != self.request.user and not self.request.user.is_superuser:
            raise PermissionDenied('Anda hanya dapat menghapus uraian tugas milik Anda sendiri.')
        # Soft delete instead of hard delete
        instance.is_active = False
        instance.save()


class LogbookViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = Logbook.objects.select_related('user', 'user__unit', 'uraian_tugas', 'verified_by')
        monitoring_level = get_monitoring_level(user)

        # Filter akses data
        is_mine = self.request.query_params.get('mine') == 'true'
        
        if is_mine or monitoring_level is None:
            # Karyawan biasa (atau request khusus MyLogbook) hanya melihat logbook miliknya sendiri
            qs = qs.filter(user=user)
        elif monitoring_level == 'unit':
            # Manajer/Kepala Seksi hanya melihat unitnya sendiri
            qs = qs.filter(user__unit=user.unit)
        else:
            # Pimpinan (Direktur & Wadir) dapat memfilter berdasarkan user dan unit
            user_id = self.request.query_params.get('user_id')
            if user_id and user_id.isdigit():
                qs = qs.filter(user_id=int(user_id))

            unit_id = self.request.query_params.get('unit_id')
            if unit_id and unit_id.isdigit():
                qs = qs.filter(user__unit_id=int(unit_id))

        # Filter tanggal
        tanggal = self.request.query_params.get('tanggal')
        if tanggal:
            qs = qs.filter(tanggal=tanggal)

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(tanggal__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(tanggal__lte=end_date)
            
        status_param = self.request.query_params.get('status')
        if status_param:
            statuses = status_param.split(',')
            qs = qs.filter(status__in=statuses)

        # Pencarian khusus nama karyawan / username
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            q = search.strip()
            qs = qs.annotate(
                user_full_name=Concat('user__first_name', Value(' '), 'user__last_name')
            )
            name_q = (
                Q(user_full_name__icontains=q) |
                Q(user__username__icontains=q) |
                Q(user__first_name__icontains=q) |
                Q(user__last_name__icontains=q)
            )
            terms = q.split()
            if len(terms) > 1:
                sub_q = Q()
                for term in terms:
                    sub_q &= (
                        Q(user_full_name__icontains=term) |
                        Q(user__first_name__icontains=term) |
                        Q(user__last_name__icontains=term) |
                        Q(user__username__icontains=term)
                    )
                name_q |= sub_q
            qs = qs.filter(name_q)

        return qs.order_by('-tanggal', '-jam_mulai', '-created_at')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return LogbookInputSerializer
        return LogbookSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data
        tanggal = data.get('tanggal')
        jam_mulai = data.get('jam_mulai')
        jam_selesai = data.get('jam_selesai')
        durasi_kerja = 0
        durasi_lembur = 0
        if tanggal and jam_mulai and jam_selesai:
            dt_mulai = datetime.combine(tanggal, jam_mulai)
            dt_selesai = datetime.combine(tanggal, jam_selesai)
            if jam_selesai < jam_mulai:
                dt_selesai += timedelta(days=1)
            durasi_kerja, durasi_lembur = hitung_durasi_sesi(dt_mulai, dt_selesai)

        serializer.save(
            user=self.request.user,
            status='perlu_verifikasi',
            durasi_kerja=durasi_kerja,
            durasi_lembur=durasi_lembur,
            metode_input='manual'
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        # Cegah user lain mengedit logbook orang lain (kecuali superuser)
        if instance.user != self.request.user and not self.request.user.is_superuser:
            raise PermissionDenied('Anda hanya dapat mengedit logbook milik Anda sendiri.')
            
        # Aktivitas yang sudah diverifikasi (disetujui/ditolak) terkunci permanen
        if instance.status != 'perlu_verifikasi' and not self.request.user.is_superuser:
            raise PermissionDenied(f'Aktivitas dengan status "{instance.get_status_display()}" terkunci dan tidak dapat diubah.')

        # Kunci retroaktif
        if not self.request.user.is_superuser:
            selisih = (timezone.localdate() - instance.tanggal).days
            if selisih > 3:
                raise PermissionDenied('Logbook lebih dari 3 hari yang lalu tidak dapat diubah.')

        data = serializer.validated_data
        tanggal = data.get('tanggal', instance.tanggal)
        jam_mulai = data.get('jam_mulai', instance.jam_mulai)
        jam_selesai = data.get('jam_selesai', instance.jam_selesai)
        durasi_kerja = instance.durasi_kerja
        durasi_lembur = instance.durasi_lembur
        if tanggal and jam_mulai and jam_selesai:
            dt_mulai = datetime.combine(tanggal, jam_mulai)
            dt_selesai = datetime.combine(tanggal, jam_selesai)
            if jam_selesai < jam_mulai:
                dt_selesai += timedelta(days=1)
            durasi_kerja, durasi_lembur = hitung_durasi_sesi(dt_mulai, dt_selesai)

        serializer.save(durasi_kerja=durasi_kerja, durasi_lembur=durasi_lembur)

    def perform_destroy(self, instance):
        if instance.user != self.request.user and not self.request.user.is_superuser:
            raise PermissionDenied('Anda hanya dapat menghapus logbook milik Anda sendiri.')
            
        # Aktivitas yang sudah diverifikasi (disetujui/ditolak) terkunci permanen
        if instance.status != 'perlu_verifikasi' and not self.request.user.is_superuser:
            raise PermissionDenied(f'Aktivitas dengan status "{instance.get_status_display()}" terkunci dan tidak dapat dihapus.')

        if not self.request.user.is_superuser:
            selisih = (timezone.localdate() - instance.tanggal).days
            if selisih > 3:
                raise PermissionDenied('Logbook lebih dari 3 hari yang lalu tidak dapat dihapus.')
        instance.delete()

    def _get_inbox_queryset(self, request):
        monitoring_level = get_monitoring_level(request.user)
        if monitoring_level is None:
            raise PermissionDenied('Anda tidak memiliki akses ke inbox verifikasi.')

        qs = Logbook.objects.select_related('user', 'user__unit', 'uraian_tugas', 'verified_by')
        
        if monitoring_level == 'unit':
            qs = qs.filter(user__unit=request.user.unit)
        else:
            unit_id = request.query_params.get('unit_id')
            if unit_id and unit_id.isdigit():
                qs = qs.filter(user__unit_id=int(unit_id))
                
        # By default only show 'perlu_verifikasi', unless status is specified
        status_param = request.query_params.get('status', 'perlu_verifikasi')
        if status_param and status_param != 'all':
            statuses = status_param.split(',')
            qs = qs.filter(status__in=statuses)

        tanggal = request.query_params.get('tanggal')
        if tanggal:
            qs = qs.filter(tanggal=tanggal)

        start_date = request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(tanggal__gte=start_date)

        end_date = request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(tanggal__lte=end_date)

        search = request.query_params.get('search') or request.query_params.get('q')
        if search:
            q = search.strip()
            qs = qs.annotate(
                user_full_name=Concat('user__first_name', Value(' '), 'user__last_name')
            )
            name_q = (
                Q(user_full_name__icontains=q) |
                Q(user__username__icontains=q) |
                Q(user__first_name__icontains=q) |
                Q(user__last_name__icontains=q)
            )
            terms = q.split()
            if len(terms) > 1:
                sub_q = Q()
                for term in terms:
                    sub_q &= (
                        Q(user_full_name__icontains=term) |
                        Q(user__first_name__icontains=term) |
                        Q(user__last_name__icontains=term) |
                        Q(user__username__icontains=term)
                    )
                name_q |= sub_q
            qs = qs.filter(name_q)

        return qs.order_by('-tanggal', '-jam_mulai')

    @action(detail=False, methods=['get'])
    def inbox(self, request):
        """Inbox logbook untuk diverifikasi oleh atasan"""
        qs = self._get_inbox_queryset(request)
        return Response(LogbookSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='export-inbox')
    def export_inbox(self, request):
        """Export daftar inbox verifikasi logbook ke Excel (.xlsx) dengan filter aktif"""
        qs = self._get_inbox_queryset(request)
        status_param = request.query_params.get('status', 'perlu_verifikasi')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Verifikasi Logbook"

        # Styling
        font_title = Font(name='Arial', size=14, bold=True, color='0F172A')
        font_subtitle = Font(name='Arial', size=10, bold=True, color='334155')
        font_meta = Font(name='Arial', size=9, italic=True, color='64748B')
        font_th = Font(name='Arial', size=10, bold=True, color='FFFFFF')
        font_td = Font(name='Arial', size=9, color='0F172A')

        fill_th = PatternFill(start_color='0284C7', end_color='0284C7', fill_type='solid')
        fill_zebra = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1'),
        )

        status_text = "Menunggu Verifikasi" if status_param == 'perlu_verifikasi' else (
            "Disetujui" if status_param == 'disetujui' else (
                "Ditolak" if status_param == 'ditolak' else "Semua Status"
            )
        )

        # Header Title
        ws.merge_cells('A1:K1')
        ws['A1'] = "DAFTAR VERIFIKASI LOGBOOK AKTIVITAS PEGAWAI"
        ws['A1'].font = font_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A2:K2')
        unit_info = f"Unit: {request.user.unit.nama}" if request.user.unit else "Semua Unit"
        ws['A2'] = f"Filter Status: {status_text} | {unit_info}"
        ws['A2'].font = font_subtitle
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A3:K3')
        cetak_str = f"Dicetak pada: {timezone.localtime().strftime('%d/%m/%Y %H:%M')} WIB | Oleh Approver: {request.user.get_full_name() or request.user.username}"
        ws['A3'] = cetak_str
        ws['A3'].font = font_meta
        ws['A3'].alignment = Alignment(horizontal='center', vertical='center')

        ws.append([]) # Row 4 empty

        headers = [
            "No",
            "Tanggal",
            "Nama Pegawai",
            "Unit / Bagian",
            "Jam Kerja",
            "Durasi Kerja",
            "Lembur",
            "Uraian Tugas & Aktivitas",
            "Capaian Output",
            "Status",
            "Catatan Verifikasi"
        ]
        ws.append(headers) # Row 5

        header_row = 5
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=header_row, column=col_idx)
            cell.font = font_th
            cell.fill = fill_th
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border

        current_row = 6
        for idx, item in enumerate(qs, 1):
            user_nama = f"{item.user.first_name or ''} {item.user.last_name or ''}".strip() or item.user.username
            unit_nama = item.user.unit.nama if item.user.unit else '-'
            jam_str = f"{item.jam_mulai.strftime('%H:%M')} - {item.jam_selesai.strftime('%H:%M')}" if item.jam_mulai and item.jam_selesai else '-'
            durasi_str = item.durasi_format or '-'
            lembur_str = f"{item.durasi_lembur} mnt" if item.durasi_lembur > 0 else "-"
            
            # Combine uraian tugas, nama aktivitas, deskripsi
            uraian_parts = []
            if item.uraian_tugas:
                uraian_parts.append(f"[{item.uraian_tugas.deskripsi}]")
            if item.nama_aktivitas:
                uraian_parts.append(item.nama_aktivitas)
            if item.deskripsi and item.deskripsi != item.nama_aktivitas:
                uraian_parts.append(item.deskripsi)
            uraian_full = " — ".join(uraian_parts) if uraian_parts else "-"

            output_str = f"{item.nilai_output} {item.satuan_output}" if item.nilai_output and item.satuan_output else "-"
            status_display = item.get_status_display()
            catatan_str = item.catatan_verifikasi or "-"

            row_data = [
                idx,
                item.tanggal.strftime('%d/%m/%Y') if item.tanggal else '-',
                user_nama,
                unit_nama,
                jam_str,
                durasi_str,
                lembur_str,
                uraian_full,
                output_str,
                status_display,
                catatan_str
            ]
            ws.append(row_data)

            is_even = (idx % 2 == 0)
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=current_row, column=col_idx)
                cell.font = font_td
                cell.border = thin_border
                if is_even:
                    cell.fill = fill_zebra

                if col_idx in (1, 2, 5, 6, 7, 9, 10):
                    cell.alignment = Alignment(horizontal='center', vertical='top')
                elif col_idx in (3, 4):
                    cell.alignment = Alignment(horizontal='left', vertical='top')
                else:
                    cell.alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)

            current_row += 1

        # Column widths
        col_widths = {
            1: 6,   # No
            2: 13,  # Tanggal
            3: 25,  # Nama Pegawai
            4: 22,  # Unit
            5: 16,  # Jam Kerja
            6: 14,  # Durasi Kerja
            7: 12,  # Lembur
            8: 50,  # Uraian & Aktivitas
            9: 16,  # Capaian Output
            10: 18, # Status
            11: 30  # Catatan Verifikasi
        }
        for col_idx, width in col_widths.items():
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = width

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        safe_status = status_param.replace(',', '_')
        filename = f"Verifikasi_Logbook_{safe_status}_{timezone.localdate().strftime('%Y%m%d')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        wb.save(response)
        return response


    @action(detail=True, methods=['post'])
    def verifikasi(self, request, pk=None):
        """Memverifikasi logbook (Setuju/Tolak)"""
        monitoring_level = get_monitoring_level(request.user)
        if monitoring_level is None:
            raise PermissionDenied('Anda tidak memiliki akses verifikasi.')

        instance = self.get_object()
        
        if monitoring_level == 'unit' and instance.user.unit != request.user.unit:
            raise PermissionDenied('Anda hanya dapat memverifikasi pegawai di unit Anda.')

        aksi = request.data.get('aksi')
        catatan = request.data.get('catatan', '')

        if aksi not in ['setuju', 'tolak']:
            return Response({'error': 'Aksi tidak valid (setuju/tolak).'}, status=400)

        if aksi == 'tolak' and not catatan.strip():
            return Response({'error': 'Catatan penolakan wajib diisi.'}, status=400)

        instance.status = 'disetujui' if aksi == 'setuju' else 'ditolak'
        instance.catatan_verifikasi = catatan
        instance.verified_by = request.user
        instance.verified_at = timezone.now()
        instance.save()

        return Response(LogbookSerializer(instance).data)

    @action(detail=False, methods=['get'], url_path='dashboard-stats')
    def dashboard_stats(self, request):
        """Statistik beranda logbook untuk pengguna yang login"""
        user = request.user
        today = timezone.localdate()
        first_day_of_month = today.replace(day=1)

        user_qs = Logbook.objects.filter(user=user)
        today_qs = user_qs.filter(tanggal=today).order_by('-jam_mulai', '-created_at')
        month_qs = user_qs.filter(tanggal__gte=first_day_of_month, tanggal__lte=today)

        total_menit_today = sum(item.durasi_menit for item in today_qs)
        jam_today = total_menit_today // 60
        sisa_menit_today = total_menit_today % 60
        durasi_today_str = f"{jam_today} jam {sisa_menit_today} mnt" if (jam_today > 0 and sisa_menit_today > 0) else (f"{jam_today} jam" if jam_today > 0 else f"{sisa_menit_today} mnt")

        total_menit_month = sum(item.durasi_menit for item in month_qs)
        jam_month = total_menit_month // 60
        sisa_menit_month = total_menit_month % 60
        durasi_month_str = f"{jam_month} jam {sisa_menit_month} mnt" if (jam_month > 0 and sisa_menit_month > 0) else (f"{jam_month} jam" if jam_month > 0 else f"{sisa_menit_month} mnt")

        total_uraian = UraianTugas.objects.filter(user=user, is_active=True).count()

        recent_activities = list(today_qs[:5])
        if len(recent_activities) < 5:
            exclude_ids = [a.id for a in recent_activities]
            additional = list(user_qs.exclude(id__in=exclude_ids).order_by('-tanggal', '-jam_mulai', '-created_at')[:(5 - len(recent_activities))])
            recent_activities.extend(additional)

        serializer = LogbookSerializer(recent_activities, many=True)

        return Response({
            'today_date': today.strftime('%Y-%m-%d'),
            'today_count': today_qs.count(),
            'today_minutes': total_menit_today,
            'today_durasi_format': durasi_today_str if total_menit_today > 0 else '0 mnt',
            'month_count': month_qs.count(),
            'month_minutes': total_menit_month,
            'month_durasi_format': durasi_month_str if total_menit_month > 0 else '0 mnt',
            'month_disetujui': month_qs.filter(status='disetujui').count(),
            'month_perlu_verifikasi': month_qs.filter(status='perlu_verifikasi').count(),
            'month_ditolak': month_qs.filter(status='ditolak').count(),
            'total_uraian_tugas': total_uraian,
            'recent_activities': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def monitoring_summary(self, request):
        """Ringkasan eksekutif khusus Wadir & Direktur"""
        if get_monitoring_level(request.user) is None:
            raise PermissionDenied('Anda tidak memiliki akses ke monitoring.')

        today = timezone.localdate()
        first_day_of_month = today.replace(day=1)

        today_qs = Logbook.objects.filter(tanggal=today)
        month_qs = Logbook.objects.filter(tanggal__gte=first_day_of_month, tanggal__lte=today)

        # Hitung total menit hari ini
        total_menit_today = sum(item.durasi_menit for item in today_qs)
        jam_today = total_menit_today // 60
        sisa_menit_today = total_menit_today % 60
        durasi_today_str = f"{jam_today}j {sisa_menit_today}m" if jam_today > 0 else f"{sisa_menit_today}m"

        data = {
            'today_date': today.strftime('%Y-%m-%d'),
            'today_total_entries': today_qs.count(),
            'today_active_users': today_qs.values('user_id').distinct().count(),
            'today_total_minutes': total_menit_today,
            'today_durasi_format': durasi_today_str,
            'month_total_entries': month_qs.count(),
            'month_active_users': month_qs.values('user_id').distinct().count(),
            'month_perlu_verifikasi': month_qs.filter(status='perlu_verifikasi').count(),
            'month_disetujui': month_qs.filter(status='disetujui').count(),
            'month_ditolak': month_qs.filter(status='ditolak').count(),
        }
        return Response(data)

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Export rekap logbook ke Excel (.xlsx) dengan filter aktif"""
        qs = self.get_queryset()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Rekap Logbook"

        # Styling
        font_title = Font(name='Arial', size=14, bold=True, color='0F172A')
        font_meta = Font(name='Arial', size=9, italic=True, color='475569')
        font_th = Font(name='Arial', size=10, bold=True, color='FFFFFF')
        font_td = Font(name='Arial', size=9, color='0F172A')
        font_td_bold = Font(name='Arial', size=9, bold=True, color='0F172A')

        fill_th = PatternFill(start_color='0284C7', end_color='0284C7', fill_type='solid')
        fill_zebra = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1'),
        )

        # Header Title
        ws.merge_cells('A1:H1')
        ws['A1'] = "REKAP LOGBOOK PEKERJAAN HARIAN PEGAWAI"
        ws['A1'].font = font_title
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')

        ws.merge_cells('A2:H2')
        cetak_str = f"Dicetak pada: {timezone.localtime().strftime('%d/%m/%Y %H:%M')} | Oleh: {request.user.get_full_name() or request.user.username}"
        ws['A2'] = cetak_str
        ws['A2'].font = font_meta
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

        ws.append([]) # Empty row

        # Table Header
        headers = [
            "No",
            "Tanggal",
            "Jam Kerja",
            "Durasi",
            "Nama Pegawai",
            "Unit / Bagian",
            "Role",
            "Uraian / Deskripsi Pekerjaan"
        ]
        ws.append(headers)

        header_row = 4
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=header_row, column=col_idx)
            cell.font = font_th
            cell.fill = fill_th
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border

        # Populate Data
        current_row = 5
        for idx, item in enumerate(qs, 1):
            user_nama = f"{item.user.first_name or ''} {item.user.last_name or ''}".strip() or item.user.username
            unit_nama = item.user.unit.nama if item.user.unit else '-'
            jam_str = f"{item.jam_mulai.strftime('%H:%M')} - {item.jam_selesai.strftime('%H:%M')}"
            durasi_str = item.durasi_format

            row_data = [
                idx,
                item.tanggal.strftime('%d/%m/%Y'),
                jam_str,
                durasi_str,
                user_nama,
                unit_nama,
                item.user.get_role_display(),
                item.deskripsi
            ]
            ws.append(row_data)

            is_even = (idx % 2 == 0)
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=current_row, column=col_idx)
                cell.font = font_td
                cell.border = thin_border
                if is_even:
                    cell.fill = fill_zebra

                if col_idx in (1, 2, 3, 4):
                    cell.alignment = Alignment(horizontal='center', vertical='top')
                elif col_idx in (5, 6, 7):
                    cell.alignment = Alignment(horizontal='left', vertical='top')
                else:
                    cell.alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)

            current_row += 1

        # Auto-adjust column widths
        col_widths = {
            1: 6,   # No
            2: 13,  # Tanggal
            3: 16,  # Jam Kerja
            4: 14,  # Durasi
            5: 24,  # Nama Pegawai
            6: 22,  # Unit
            7: 16,  # Role
            8: 55,  # Deskripsi
        }
        for col_idx, width in col_widths.items():
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = width

        # Response
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"Rekap_Logbook_{timezone.localdate().strftime('%Y%m%d')}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        wb.save(response)
        return response


def _hitung_total_task(task):
    sesi_selesai = task.sesi_list.filter(selesai__isnull=False)
    total_kerja = sum(s.durasi_kerja for s in sesi_selesai)
    total_lembur = sum(s.durasi_lembur for s in sesi_selesai)
    task.total_menit_kerja = total_kerja
    task.total_menit_lembur = total_lembur
    task.save()


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None
    serializer_class = TaskSerializer

    def _validate_ownership(self, task):
        if task.user != self.request.user and not self.request.user.is_superuser:
            raise PermissionDenied('Anda hanya dapat mengontrol atau memodifikasi task live track milik Anda sendiri.')

    def get_queryset(self):
        user = self.request.user
        qs = Task.objects.select_related('user', 'user__unit').prefetch_related('sesi_list')
        
        # Secara default, Live Track adalah pencatatan pribadi untuk user yang sedang aktif.
        # User hanya melihat task miliknya sendiri, kecuali jika secara eksplisit meminta mode monitoring.
        is_monitoring = self.request.query_params.get('monitoring') == 'true'
        monitoring_level = get_monitoring_level(user)

        if not is_monitoring or monitoring_level is None:
            qs = qs.filter(user=user)
        elif monitoring_level == 'unit':
            qs = qs.filter(user__unit=user.unit)
        else:
            user_id = self.request.query_params.get('user_id')
            if user_id and user_id.isdigit():
                qs = qs.filter(user_id=int(user_id))

            unit_id = self.request.query_params.get('unit_id')
            if unit_id and unit_id.isdigit():
                qs = qs.filter(user__unit_id=int(unit_id))

        status_param = self.request.query_params.get('status')
        if status_param:
            statuses = status_param.split(',')
            qs = qs.filter(status__in=statuses)
            
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(judul__icontains=q) |
                Q(no_task__icontains=q) |
                Q(user__first_name__icontains=q) |
                Q(user__last_name__icontains=q) |
                Q(user__username__icontains=q)
            )

        return qs.order_by('-updated_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return TaskCreateSerializer
        return TaskSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(TaskSerializer(serializer.instance, context={'request': request}).data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        auto_start = serializer.validated_data.get('auto_start', True)
        if isinstance(auto_start, str):
            auto_start = auto_start.lower() in ('true', '1')
        if auto_start:
            task = serializer.save(user=self.request.user, started_at=timezone.now(), status='on_progress')
            SesiKerja.objects.create(task=task, mulai=timezone.now())
        else:
            task = serializer.save(user=self.request.user, started_at=None, status='pending')

    def perform_destroy(self, instance):
        self._validate_ownership(instance)
        Logbook.objects.filter(task=instance).delete()
        instance.delete()


    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Memulai timer pertama kali untuk task yang berstatus pending"""
        task = self.get_object()
        self._validate_ownership(task)
        if task.status == 'done':
            return Response({'error': 'Task sudah selesai.'}, status=400)
            
        if task.sesi_list.filter(selesai__isnull=True).exists():
            return Response({'error': 'Task sudah memiliki sesi aktif yang sedang berjalan.'}, status=400)
            
        now = timezone.now()
        if not task.started_at:
            task.started_at = now
        task.status = 'on_progress'
        task.save()
        SesiKerja.objects.create(task=task, mulai=now)
        
        return Response(TaskSerializer(task, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        task = self.get_object()
        self._validate_ownership(task)
        if task.status == 'done':
            return Response({'error': 'Task sudah selesai.'}, status=400)
            
        sesi_aktif = task.sesi_list.filter(selesai__isnull=True).first()
        if not sesi_aktif:
            return Response({'error': 'Tidak ada sesi yang sedang berjalan'}, status=400)
        
        now = timezone.now()
        sesi_aktif.selesai = now
        kerja, lembur = hitung_durasi_sesi(sesi_aktif.mulai, sesi_aktif.selesai)
        sesi_aktif.durasi_kerja = kerja
        sesi_aktif.durasi_lembur = lembur
        sesi_aktif.save()
        
        task.status = 'on_hold'
        _hitung_total_task(task)
        
        return Response(TaskSerializer(task, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        task = self.get_object()
        self._validate_ownership(task)
        if task.status == 'done':
            return Response({'error': 'Task sudah selesai.'}, status=400)
            
        if task.sesi_list.filter(selesai__isnull=True).exists():
            return Response({'error': 'Task sudah memiliki sesi aktif.'}, status=400)
            
        now = timezone.now()
        if not task.started_at:
            task.started_at = now
        SesiKerja.objects.create(task=task, mulai=now)
        task.status = 'on_progress'
        task.save()
        
        return Response(TaskSerializer(task, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        self._validate_ownership(task)
        if task.status == 'done':
            return Response({'error': 'Task sudah selesai.'}, status=400)
            
        now = timezone.now()
        sesi_aktif = task.sesi_list.filter(selesai__isnull=True).first()
        
        if sesi_aktif:
            sesi_aktif.selesai = now
            kerja, lembur = hitung_durasi_sesi(sesi_aktif.mulai, sesi_aktif.selesai)
            sesi_aktif.durasi_kerja = kerja
            sesi_aktif.durasi_lembur = lembur
            sesi_aktif.save()
            
        task.status = 'done'
        task.completed_at = now

        if 'judul' in request.data and request.data['judul'].strip():
            task.judul = request.data['judul'].strip()
        if 'deskripsi' in request.data:
            task.deskripsi = request.data['deskripsi'].strip()
        if 'nilai_output' in request.data:
            try:
                task.nilai_output = int(request.data['nilai_output'])
            except (ValueError, TypeError):
                pass
        if 'satuan_output' in request.data:
            task.satuan_output = str(request.data['satuan_output']).strip()
        if 'uraian_tugas_id' in request.data:
            ut_id = request.data['uraian_tugas_id']
            if ut_id and str(ut_id) != 'lainnya':
                task.uraian_tugas = UraianTugas.objects.filter(id=ut_id).first()
            else:
                task.uraian_tugas = None

        _hitung_total_task(task)

        # Otomatis sinkronisasi ke tabel Logbook Harian
        local_tz = timezone.get_current_timezone()
        started_dt = task.started_at or now
        started_local = started_dt.astimezone(local_tz)
        completed_local = now.astimezone(local_tz)

        logbook_entry = Logbook.objects.filter(task=task).first()
        if not logbook_entry:
            logbook_entry = Logbook.objects.create(
                user=task.user,
                tanggal=started_local.date(),
                jam_mulai=started_local.time().replace(microsecond=0),
                jam_selesai=completed_local.time().replace(microsecond=0),
                uraian_tugas=task.uraian_tugas,
                nama_aktivitas=task.judul,
                deskripsi=task.deskripsi or task.judul,
                nilai_output=task.nilai_output,
                satuan_output=task.satuan_output,
                durasi_kerja=task.total_menit_kerja,
                durasi_lembur=task.total_menit_lembur,
                status='perlu_verifikasi',
                metode_input='live_track',
                task=task
            )
        else:
            logbook_entry.uraian_tugas = task.uraian_tugas
            logbook_entry.nama_aktivitas = task.judul
            logbook_entry.deskripsi = task.deskripsi or task.judul
            logbook_entry.nilai_output = task.nilai_output
            logbook_entry.satuan_output = task.satuan_output
            logbook_entry.durasi_kerja = task.total_menit_kerja
            logbook_entry.durasi_lembur = task.total_menit_lembur
            logbook_entry.jam_selesai = completed_local.time().replace(microsecond=0)
            logbook_entry.save()
        
        resp_data = TaskSerializer(task).data
        resp_data['logbook_id'] = logbook_entry.id
        return Response(resp_data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Mendapatkan daftar task yang aktif atau siap mulai"""
        qs = self.get_queryset().filter(status__in=['pending', 'on_progress', 'on_hold'])
        return Response(TaskSerializer(qs, many=True).data)
