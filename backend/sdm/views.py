from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse
from django.contrib.auth import get_user_model
from datetime import datetime, date, timedelta
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

User = get_user_model()

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


def user_can_approve_izin(user, izin):
    """
    Menentukan apakah `user` berhak melakukan single approval untuk `izin`.
    Aturan:
    - User tidak dapat menyetujui izin miliknya sendiri.
    - Superuser & Direktur selalu berhak menyetujui.
    - User berada dalam rantai approvers chain (Kasi / Manajer / Wadir yang membawahi pemohon).
    """
    if not user or not user.is_authenticated:
        return False
    if izin.user_id == user.id:
        return False
    if user.is_superuser or user.role == 'direktur':
        return True
    approvers = izin.user.get_approvers_chain()
    return any(a.id == user.id for a in approvers)


def get_subordinate_user_ids(boss):
    """Mendapatkan daftar ID bawahan aktif yang berada di bawah wewenang persetujuan `boss`"""
    if not boss or not boss.is_authenticated:
        return []
    from django.contrib.auth import get_user_model
    User = get_user_model()
    sub_ids = []
    for emp in User.objects.filter(is_active=True).exclude(id=boss.id):
        chain = emp.get_approvers_chain()
        if any(a.id == boss.id for a in chain):
            sub_ids.append(emp.id)
    return sub_ids


class IzinKeluarViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == 'create':
            return IzinKeluarCreateSerializer
        return IzinKeluarSerializer

    def get_queryset(self):
        user = self.request.user
        qs = IzinKeluar.objects.select_related('user', 'user__unit', 'approved_by').prefetch_related('logs', 'logs__created_by')

        # Mode filter 'mine' (khusus izin sendiri, berguna saat di tab Izin Saya)
        is_mine = self.request.query_params.get('mine') in ('1', 'true', 'True')
        # Mode filter 'approval' (khusus daftar antrean yang butuh di-approve oleh user)
        is_approval = self.request.query_params.get('need_approval') in ('1', 'true', 'True')

        if is_mine:
            qs = qs.filter(user=user)
        elif is_approval:
            sub_ids = get_subordinate_user_ids(user)
            if user.is_superuser or user.role == 'direktur':
                qs = qs.filter(status='menunggu_approval').exclude(user=user)
            else:
                qs = qs.filter(status='menunggu_approval', user_id__in=sub_ids)
        elif has_sdm_access(user):
            # Akses SDM / Direksi: dapat memfilter berdasarkan unit
            unit_id = self.request.query_params.get('unit')
            if unit_id:
                qs = qs.filter(user__unit_id=unit_id)
        elif user.role in ('kepala_seksi', 'manajer', 'wakil_direktur'):
            # Pejabat struktural: bisa melihat izin miliknya + izin seluruh bawahan langsung & tidak langsung
            sub_ids = get_subordinate_user_ids(user)
            qs = qs.filter(Q(user=user) | Q(user_id__in=sub_ids))
        else:
            qs = qs.filter(user=user)

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

        # Izin baru masuk ke status menunggu persetujuan atasan
        serializer.save(
            user=user,
            jam_keluar_awal=jam_keluar,
            jam_kembali_awal=jam_kembali,
            status='menunggu_approval',
            is_adjusted=False
        )

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.user != user and not user.is_superuser:
            raise PermissionDenied('Anda hanya dapat menghapus izin milik Anda sendiri.')
        if instance.status == 'selesai':
            raise ValidationError('Izin yang sudah selesai tidak dapat dihapus.')
        instance.delete()

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Single approval oleh salah satu atasan (Kasi, Manajer, Wadir, Direktur)"""
        izin = self.get_object()

        if izin.status != 'menunggu_approval':
            return Response(
                {'error': f'Izin ini tidak dapat disetujui karena status saat ini adalah {izin.get_status_display()}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user_can_approve_izin(request.user, izin):
            raise PermissionDenied('Anda tidak memiliki wewenang struktural untuk menyetujui izin ini.')

        catatan = request.data.get('catatan_approval', '').strip()
        izin.status = 'disetujui'
        izin.approved_by = request.user
        izin.approved_at = timezone.now()
        if catatan:
            izin.catatan_approval = catatan
        izin.save()

        return Response(IzinKeluarSerializer(izin, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Penolakan izin oleh atasan"""
        izin = self.get_object()

        if izin.status != 'menunggu_approval':
            return Response(
                {'error': f'Izin ini tidak dapat ditolak karena status saat ini adalah {izin.get_status_display()}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user_can_approve_izin(request.user, izin):
            raise PermissionDenied('Anda tidak memiliki wewenang struktural untuk menolak izin ini.')

        catatan = request.data.get('catatan_approval', '').strip()
        if not catatan:
            return Response(
                {'error': 'Wajib mencantumkan alasan / catatan penolakan.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        izin.status = 'ditolak'
        izin.approved_by = request.user
        izin.approved_at = timezone.now()
        izin.catatan_approval = catatan
        izin.save()

        return Response(IzinKeluarSerializer(izin, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='sesuaikan-jam')
    def sesuaikan_jam(self, request, pk=None):
        """Menyesuaikan jam keluar / kembali dengan mencatat histori perubahan"""
        izin = self.get_object()

        # Validasi kepemilikan
        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin mengubah data ini.')

        if izin.status not in ('menunggu_approval', 'disetujui', 'berjalan'):
            return Response(
                {'error': f'Izin dengan status {izin.get_status_display()} tidak dapat disesuaikan jamnya.'},
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

        return Response(IzinKeluarSerializer(izin, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='konfirmasi-kembali')
    def konfirmasi_kembali(self, request, pk=None):
        """Konfirmasi bahwa staf sudah kembali ke tempat kerja"""
        izin = self.get_object()

        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin mengonfirmasi kepulangan ini.')

        if izin.status not in ('disetujui', 'berjalan'):
            return Response(
                {'error': f'Hanya izin yang sudah disetujui atau sedang di luar yang dapat dikonfirmasi kepulangannya (status saat ini: {izin.get_status_display()}).'},
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

        return Response(IzinKeluarSerializer(izin, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='batalkan')
    def batalkan(self, request, pk=None):
        """Membatalkan izin keluar"""
        izin = self.get_object()

        if izin.user != request.user and not has_sdm_access(request.user):
            raise PermissionDenied('Anda tidak memiliki izin membatalkan izin ini.')

        if izin.status in ('selesai', 'dibatalkan', 'ditolak'):
            return Response(
                {'error': f'Izin dengan status {izin.get_status_display()} tidak dapat dibatalkan.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        izin.status = 'dibatalkan'
        izin.save()

        return Response(IzinKeluarSerializer(izin, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='statistik')
    def statistik(self, request):
        """Ringkasan statistik real-time untuk dashboard SDM maupun pengguna"""
        user = request.user
        today = timezone.localdate()

        # Cek izin aktif milik user sendiri (disetujui atau sedang berjalan)
        active_mine = IzinKeluar.objects.filter(
            user=user,
            status__in=['disetujui', 'berjalan']
        ).order_by('-tanggal', '-created_at').first()

        active_mine_data = IzinKeluarSerializer(active_mine, context={'request': request}).data if active_mine else None

        # Jumlah izin pending milik sendiri
        pending_mine_count = IzinKeluar.objects.filter(user=user, status='menunggu_approval').count()

        # Hitung antrean approval yang butuh persetujuan user ini
        sub_ids = get_subordinate_user_ids(user)
        if user.is_superuser or user.role == 'direktur':
            need_approval_count = IzinKeluar.objects.filter(status='menunggu_approval').exclude(user=user).count()
        elif sub_ids:
            need_approval_count = IzinKeluar.objects.filter(status='menunggu_approval', user_id__in=sub_ids).count()
        else:
            need_approval_count = 0

        data = {
            'has_sdm_access': has_sdm_access(user),
            'is_approver': bool(need_approval_count > 0 or sub_ids or user.role in ('kepala_seksi', 'manajer', 'wakil_direktur', 'direktur')),
            'active_mine': active_mine_data,
            'pending_mine_count': pending_mine_count,
            'need_approval_count': need_approval_count,
        }

        if has_sdm_access(user):
            today_qs = IzinKeluar.objects.filter(tanggal=today)
            month_qs = IzinKeluar.objects.filter(tanggal__year=today.year, tanggal__month=today.month)

            data.update({
                'today_menunggu_approval': today_qs.filter(status='menunggu_approval').count(),
                'today_sedang_keluar': today_qs.filter(status__in=['disetujui', 'berjalan']).count(),
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


# ==============================================================================
# VIEWSETS UNTUK INTEGRASI MESIN ABSENSI & PRESENSI PEGAWAI
# ==============================================================================

from .models import MesinAbsen, KaryawanMesinMapping, LogPresensi, PresensiHarian
from .serializers import (
    MesinAbsenSerializer,
    KaryawanMesinMappingSerializer,
    LogPresensiSerializer,
    PresensiHarianSerializer,
)
from .services.zk_service import sync_mesin_absen, auto_match_user_by_name, recalculate_presensi_harian
import socket


class MesinAbsenViewSet(viewsets.ModelViewSet):
    queryset = MesinAbsen.objects.all()
    serializer_class = MesinAbsenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Otomatis buatkan record mesin default jika belum ada
        if not MesinAbsen.objects.exists():
            MesinAbsen.objects.create(
                nama='Mesin Absen Utama (S-IPC)',
                ip_address='192.168.44.120',
                port=4370,
                comm_key=0,
                serial_number='A8ME230660078',
                device_name='S-IPC',
                status_koneksi='connected',
                is_active=True
            )
        return MesinAbsen.objects.all()

    @action(detail=True, methods=['post'])
    def test_koneksi(self, request, pk=None):
        """Tes ping dan socket port 4370 ke mesin absen"""
        mesin = self.get_object()
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3.0)
            result = s.connect_ex((mesin.ip_address, mesin.port))
            s.close()
            if result == 0:
                mesin.status_koneksi = 'connected'
                mesin.save(update_fields=['status_koneksi'])
                return Response({
                    'connected': True,
                    'message': f"Berhasil terhubung ke {mesin.ip_address}:{mesin.port}"
                })
            else:
                mesin.status_koneksi = 'disconnected'
                mesin.save(update_fields=['status_koneksi'])
                return Response({
                    'connected': False,
                    'message': f"Port {mesin.port} tidak merespons (Kode: {result})"
                }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            mesin.status_koneksi = 'error'
            mesin.save(update_fields=['status_koneksi'])
            return Response({
                'connected': False,
                'message': f"Gagal menghubungi mesin: {str(e)}"
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def sync_sekarang(self, request, pk=None):
        """Trigger sinkronisasi langsung dari mesin absen"""
        mesin = self.get_object()
        res = sync_mesin_absen(mesin_id=mesin.id)
        if res.get('success'):
            return Response(res)
        return Response(res, status=status.HTTP_400_BAD_REQUEST)


class KaryawanMesinMappingViewSet(viewsets.ModelViewSet):
    queryset = KaryawanMesinMapping.objects.select_related('user', 'user__unit').all()
    serializer_class = KaryawanMesinMappingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        unmapped = self.request.query_params.get('unmapped')
        search = self.request.query_params.get('search')
        
        if unmapped == 'true':
            qs = qs.filter(user__isnull=True)
        elif unmapped == 'false':
            qs = qs.filter(user__isnull=False)

        if search:
            qs = qs.filter(
                Q(pin__icontains=search) |
                Q(nama_di_mesin__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search)
            )
        return qs

    @action(detail=True, methods=['post'])
    def link_user(self, request, pk=None):
        """Memasangkan PIN mesin ke akun User SIMAK tertentu"""
        mapping = self.get_object()
        user_id = request.data.get('user_id')
        
        if not user_id:
            mapping.user = None
            mapping.save(update_fields=['user'])
            return Response({'success': True, 'message': 'Mapping user berhasil dilepas.'})
            
        user = User.objects.filter(id=user_id, is_active=True).first()
        if not user:
            return Response({'detail': 'User tidak ditemukan atau tidak aktif.'}, status=status.HTTP_404_NOT_FOUND)
            
        mapping.user = user
        mapping.save(update_fields=['user'])
        
        # Kaitkan juga log-log lampau dengan PIN ini ke user
        LogPresensi.objects.filter(pin=mapping.pin, user__isnull=True).update(user=user)
        
        # Hitung ulang tanggal-tanggal terkait
        affected_dates = LogPresensi.objects.filter(user=user).values_list('waktu__date', flat=True).distinct()
        for d in affected_dates:
            recalculate_presensi_harian(user.id, d)
            
        serializer = self.get_serializer(mapping)
        return Response(serializer.data)

    @action(methods=['post'], detail=False)
    def auto_match_all(self, request):
        """Mencoba mencocokkan otomatis semua PIN yang belum ter-mapping ke User SIMAK"""
        unmapped = KaryawanMesinMapping.objects.filter(user__isnull=True)
        matched_count = 0
        for m in unmapped:
            user = auto_match_user_by_name(m.nama_di_mesin)
            if user:
                m.user = user
                m.save(update_fields=['user'])
                LogPresensi.objects.filter(pin=m.pin, user__isnull=True).update(user=user)
                matched_count += 1
                
        return Response({
            'success': True,
            'matched_count': matched_count,
            'message': f"{matched_count} karyawan berhasil dicocokkan otomatis."
        })


class LogPresensiViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LogPresensi.objects.select_related('user', 'mesin').all()
    serializer_class = LogPresensiSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user_id = self.request.query_params.get('user_id')
        pin = self.request.query_params.get('pin')
        tanggal = self.request.query_params.get('tanggal')

        if user_id:
            qs = qs.filter(user_id=user_id)
        if pin:
            qs = qs.filter(pin=pin)
        if tanggal:
            try:
                tgl = datetime.strptime(tanggal, '%Y-%m-%d').date()
                start_dt = timezone.make_aware(datetime.combine(tgl, datetime.min.time()))
                end_dt = timezone.make_aware(datetime.combine(tgl, datetime.max.time()))
                qs = qs.filter(waktu__range=(start_dt, end_dt))
            except Exception:
                pass
        return qs


class PresensiHarianViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PresensiHarian.objects.select_related('user', 'user__unit', 'izin_keluar').all()
    serializer_class = PresensiHarianSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        
        # User biasa hanya melihat presensi miliknya sendiri, kecuali SDM / Direksi
        if not has_sdm_access(user):
            qs = qs.filter(user=user)

        tanggal = self.request.query_params.get('tanggal')
        bulan = self.request.query_params.get('bulan')
        tahun = self.request.query_params.get('tahun')
        unit_id = self.request.query_params.get('unit_id')
        status_filter = self.request.query_params.get('status')
        search = self.request.query_params.get('search')

        if tanggal:
            qs = qs.filter(tanggal=tanggal)
        else:
            if tahun and bulan:
                qs = qs.filter(tanggal__year=tahun, tanggal__month=bulan)
            elif not search and not self.request.query_params.get('all'):
                # Default hari ini jika tanpa filter
                qs = qs.filter(tanggal=timezone.localdate())

        if unit_id:
            qs = qs.filter(user__unit_id=unit_id)

        if status_filter:
            qs = qs.filter(status=status_filter)

        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search)
            )

        return qs

    @action(methods=['get'], detail=False)
    def dashboard_stat(self, request):
        """Statistik ringkasan kehadiran hari ini"""
        today = timezone.localdate()
        total_pegawai = User.objects.filter(is_active=True).count()
        
        presensi_today = PresensiHarian.objects.filter(tanggal=today)
        hadir_tepat = presensi_today.filter(status='hadir').count()
        terlambat = presensi_today.filter(status='terlambat').count()
        pulang_cepat = presensi_today.filter(status='pulang_cepat').count()
        izin_keluar = presensi_today.filter(status='izin_keluar').count()
        total_tap = presensi_today.count()
        belum_absen = max(0, total_pegawai - total_tap)

        return Response({
            'tanggal': today.isoformat(),
            'total_pegawai': total_pegawai,
            'total_tap': total_tap,
            'hadir_tepat': hadir_tepat,
            'terlambat': terlambat,
            'pulang_cepat': pulang_cepat,
            'izin_keluar': izin_keluar,
            'belum_absen': belum_absen,
        })

    @action(methods=['get'], detail=False)
    def export_excel(self, request):
        """Export rekap presensi ke file Excel (.xlsx)"""
        qs = self.filter_queryset(self.get_queryset())
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Rekap Presensi"

        # Styling
        font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        fill_header = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        font_bold = Font(name="Calibri", size=11, bold=True)
        thin = Side(border_style="thin", color="D1D5DB")
        border_all = Border(left=thin, right=thin, top=thin, bottom=thin)

        # Title
        tgl_filter = request.query_params.get('tanggal') or timezone.localdate().strftime('%d-%m-%Y')
        ws.merge_cells("A1:I1")
        ws["A1"] = "REKAPITULASI PRESENSI PEGAWAI - RS SIAGA AL MUNAWWARAH"
        ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")
        ws["A1"].alignment = Alignment(horizontal="center")

        ws.merge_cells("A2:I2")
        ws["A2"] = f"Tanggal Laporan: {tgl_filter}"
        ws["A2"].font = Font(name="Calibri", size=11, italic=True)
        ws["A2"].alignment = Alignment(horizontal="center")

        headers = [
            "No", "Tanggal", "Nama Pegawai", "Unit Kerja", "Jam Masuk",
            "Jam Pulang", "Status Kehadiran", "Keterlambatan", "Izin Terkait"
        ]
        
        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col_idx, value=h)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border_all

        row_idx = 5
        for idx, item in enumerate(qs, 1):
            ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=2, value=str(item.tanggal)).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=3, value=item.user.get_full_name() or item.user.username)
            ws.cell(row=row_idx, column=4, value=item.user.unit.nama if item.user.unit else "-")
            ws.cell(row=row_idx, column=5, value=str(item.jam_masuk) if item.jam_masuk else "-").alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=6, value=str(item.jam_pulang) if item.jam_pulang else "-").alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=7, value=item.get_status_display()).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=8, value=f"{item.menit_keterlambatan} mnt" if item.menit_keterlambatan > 0 else "Tepat Waktu").alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=9, value=f"Izin: {item.izin_keluar.get_kategori_display()}" if item.izin_keluar else "-")

            for c in range(1, 10):
                ws.cell(row=row_idx, column=c).border = border_all
            row_idx += 1

        # Adjust column widths
        widths = [6, 12, 28, 20, 14, 14, 20, 16, 24]
        for idx, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(idx)].width = w

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Rekap_Presensi_{timezone.localdate().strftime("%Y%m%d")}.xlsx"'
        wb.save(response)
        return response
