from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from django.http import HttpResponse
from django.contrib.auth import get_user_model
from datetime import datetime, date, timedelta
import calendar
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

User = get_user_model()

from .models import (
    IzinKeluar, IzinKeluarLog, Pegawai, Shift, MesinAbsen,
    KaryawanMesinMapping, LogPresensi, PresensiHarian,
    JadwalDinas, JadwalMaster, JadwalKoreksi, TukarDinas,
)
from .serializers import (
    IzinKeluarSerializer,
    IzinKeluarCreateSerializer,
    IzinKeluarAdjustSerializer,
    IzinKeluarReturnSerializer,
    IzinKeluarLogSerializer,
    PegawaiSerializer,
    ShiftSerializer,
    JadwalDinasSerializer,
    JadwalMasterSerializer,
    JadwalKoreksiSerializer,
    TukarDinasSerializer,
    MesinAbsenSerializer,
    KaryawanMesinMappingSerializer,
    LogPresensiSerializer,
    PresensiHarianSerializer,
)
from .services.jadwal_service import (
    kelompok_shift_untuk,
    validate_shift_for_pegawai,
    rebuild_jadwal_final,
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

    @action(detail=False, methods=['post'])
    def sync_semua(self, request):
        """Trigger sinkronisasi ke seluruh mesin absen yang aktif"""
        active_machines = MesinAbsen.objects.filter(is_active=True).order_by('id')
        results = []
        total_new_logs = 0
        total_users = 0
        all_success = True

        for m in active_machines:
            res = sync_mesin_absen(mesin_id=m.id)
            results.append({
                'mesin_id': m.id,
                'mesin_nama': m.nama,
                'ip_address': m.ip_address,
                'result': res
            })
            if res.get('success'):
                total_new_logs += res.get('new_logs_saved', 0)
                total_users += res.get('total_users_machine', 0)
            else:
                all_success = False

        return Response({
            'success': all_success,
            'message': f"Sinkronisasi selesai. Total {total_new_logs} log presensi baru ditarik dari {active_machines.count()} mesin.",
            'total_new_logs': total_new_logs,
            'total_users': total_users,
            'details': results
        })


class PegawaiViewSet(viewsets.ModelViewSet):
    """
    CRUD Direktori Master Seluruh Pegawai RS Siaga Al Munawwaroh (149+ Pegawai).
    """
    queryset = Pegawai.objects.select_related('user').all()
    serializer_class = PegawaiSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        kategori = self.request.query_params.get('kategori')
        unit = self.request.query_params.get('unit')
        search = self.request.query_params.get('search')
        is_active = self.request.query_params.get('is_active')

        if kategori:
            qs = qs.filter(kategori=kategori)
        if unit:
            qs = qs.filter(Q(unit_kerja__icontains=unit) | Q(jabatan__icontains=unit))
        if is_active in ('true', '1'):
            qs = qs.filter(is_active=True)
        elif is_active in ('false', '0'):
            qs = qs.filter(is_active=False)

        if search:
            qs = qs.filter(
                Q(nama__icontains=search) |
                Q(pin__icontains=search) |
                Q(nik__icontains=search) |
                Q(unit_kerja__icontains=search) |
                Q(jabatan__icontains=search)
            )
        return qs.order_by('nama')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Ringkasan statistik kepegawaian RS"""
        total = Pegawai.objects.count()
        aktif = Pegawai.objects.filter(is_active=True).count()
        linked_user = Pegawai.objects.filter(user__isnull=False).count()
        by_kategori = {}
        for row in Pegawai.objects.values('kategori').distinct():
            kat = row['kategori']
            by_kategori[kat] = Pegawai.objects.filter(kategori=kat).count()

        return Response({
            'total_pegawai': total,
            'pegawai_aktif': aktif,
            'terhubung_user_simak': linked_user,
            'tanpa_login': total - linked_user,
            'by_kategori': by_kategori
        })


class ShiftViewSet(viewsets.ModelViewSet):
    """
    CRUD Master Shift dan Pola Jam Kerja RS Siaga Al Munawwaroh.
    """
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        kelompok = self.request.query_params.get('kelompok')
        is_libur = self.request.query_params.get('is_libur')
        is_active = self.request.query_params.get('is_active')
        search = self.request.query_params.get('search')

        if kelompok:
            qs = qs.filter(kelompok=kelompok)
        if is_libur in ('true', '1'):
            qs = qs.filter(is_libur=True)
        elif is_libur in ('false', '0'):
            qs = qs.filter(is_libur=False)
        if is_active in ('true', '1'):
            qs = qs.filter(is_active=True)
        elif is_active in ('false', '0'):
            qs = qs.filter(is_active=False)

        if search:
            qs = qs.filter(
                Q(kode__icontains=search) |
                Q(nama__icontains=search) |
                Q(keterangan__icontains=search)
            )
        return qs.order_by('kelompok', 'urutan', 'kode')

    @action(detail=True, methods=['post'])
    def duplicate_to_groups(self, request, pk=None):
        """
        Duplikat shift ini ke kelompok lain yang belum memiliki kode shift yang sama.
        Body: { target_groups: ['UMUM', 'CS', 'SECURITY_DRIVER', 'MITRA'] } (opsional, default semua kelompok)
        """
        shift = self.get_object()
        all_groups = [g[0] for g in Shift.KELOMPOK_CHOICES]
        target_groups = request.data.get('target_groups') or all_groups
        created_shifts = []
        skipped_groups = []

        for grp in target_groups:
            if grp not in all_groups or grp == shift.kelompok:
                continue
            if Shift.objects.filter(kelompok=grp, kode=shift.kode).exists():
                skipped_groups.append(grp)
                continue
            new_s = Shift.objects.create(
                kelompok=grp,
                kode=shift.kode,
                nama=shift.nama,
                jam_masuk=shift.jam_masuk,
                jam_pulang=shift.jam_pulang,
                batas_tepat_waktu=shift.batas_tepat_waktu,
                is_overnight=shift.is_overnight,
                is_libur=shift.is_libur,
                toleransi_terlambat_menit=shift.toleransi_terlambat_menit,
                warna=shift.warna,
                keterangan=shift.keterangan,
                urutan=shift.urutan,
                is_active=shift.is_active,
            )
            created_shifts.append(new_s)

        return Response({
            'detail': f'Berhasil menduplikat shift {shift.kode} ke {len(created_shifts)} kelompok.',
            'created_count': len(created_shifts),
            'skipped_groups': skipped_groups,
            'created': ShiftSerializer(created_shifts, many=True).data,
        })


class KaryawanMesinMappingViewSet(viewsets.ModelViewSet):
    queryset = KaryawanMesinMapping.objects.select_related('pegawai', 'user', 'user__unit').all()
    serializer_class = KaryawanMesinMappingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        unmapped = self.request.query_params.get('unmapped')
        search = self.request.query_params.get('search')
        
        if unmapped == 'true':
            qs = qs.filter(pegawai__isnull=True, user__isnull=True)
        elif unmapped == 'false':
            qs = qs.filter(Q(pegawai__isnull=False) | Q(user__isnull=False))

        if search:
            qs = qs.filter(
                Q(pin__icontains=search) |
                Q(nama_di_mesin__icontains=search) |
                Q(pegawai__nama__icontains=search) |
                Q(pegawai__unit_kerja__icontains=search) |
                Q(pegawai__jabatan__icontains=search) |
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
        """Mencoba mencocokkan otomatis semua PIN yang belum ter-mapping ke Pegawai / User SIMAK"""
        unmapped = KaryawanMesinMapping.objects.filter(pegawai__isnull=True)
        matched_count = 0
        for m in unmapped:
            p = Pegawai.objects.filter(pin=m.pin).first()
            if p:
                m.pegawai = p
                if p.user:
                    m.user = p.user
                m.save(update_fields=['pegawai', 'user'])
                LogPresensi.objects.filter(pin=m.pin, pegawai__isnull=True).update(pegawai=p, user=p.user)
                matched_count += 1
                
        return Response({
            'success': True,
            'matched_count': matched_count,
            'message': f"{matched_count} karyawan berhasil dicocokkan otomatis ke direktori Pegawai."
        })


class LogPresensiViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LogPresensi.objects.select_related('pegawai', 'user', 'mesin').all()
    serializer_class = LogPresensiSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        pin_map = dict(KaryawanMesinMapping.objects.values_list('pin', 'nama_di_mesin'))
        context['mapping_pin_cache'] = pin_map
        return context

    def get_queryset(self):
        qs = super().get_queryset()
        user_id = self.request.query_params.get('user_id')
        pegawai_id = self.request.query_params.get('pegawai_id')
        pin = self.request.query_params.get('pin')
        tanggal = self.request.query_params.get('tanggal')
        bulan = self.request.query_params.get('bulan')
        tahun = self.request.query_params.get('tahun')
        mesin_id = self.request.query_params.get('mesin_id')
        search = self.request.query_params.get('search')

        # Resolusi filter identitas (pegawai / user / pin)
        identity_q = Q()
        has_identity_filter = False

        pegawai_obj = None
        if pegawai_id:
            try:
                pegawai_obj = Pegawai.objects.filter(id=pegawai_id).first()
            except Exception:
                pass
        elif user_id:
            try:
                pegawai_obj = Pegawai.objects.filter(user_id=user_id).first()
            except Exception:
                pass
        elif pin and str(pin).strip() != '-':
            cleaned_pin = str(pin).strip()
            pegawai_obj = Pegawai.objects.filter(
                Q(pin=cleaned_pin) | Q(pin=cleaned_pin.lstrip('0')) | Q(pin=cleaned_pin.zfill(3)) | Q(pin=cleaned_pin.zfill(4))
            ).first()

        if pegawai_obj:
            has_identity_filter = True
            pins = set()
            if pegawai_obj.pin:
                raw_p = str(pegawai_obj.pin).strip()
                pins.update([raw_p, raw_p.lstrip('0'), raw_p.zfill(3), raw_p.zfill(4)])
            if pin and str(pin).strip() != '-':
                raw_p = str(pin).strip()
                pins.update([raw_p, raw_p.lstrip('0'), raw_p.zfill(3), raw_p.zfill(4)])
            
            clean_pins = {p for p in pins if p and str(p).strip() and str(p).strip() != '-'}
            p_q = Q(pegawai=pegawai_obj)
            if clean_pins:
                p_q |= Q(pin__in=clean_pins)
            if pegawai_obj.user_id:
                p_q |= Q(user_id=pegawai_obj.user_id)
            identity_q = p_q
        else:
            p_q = Q()
            if pegawai_id:
                p_q |= Q(pegawai_id=pegawai_id)
                has_identity_filter = True
            if user_id:
                p_q |= Q(user_id=user_id)
                has_identity_filter = True
            if pin and str(pin).strip() != '-':
                cleaned_pin = str(pin).strip()
                pins = {p for p in [cleaned_pin, cleaned_pin.lstrip('0'), cleaned_pin.zfill(3), cleaned_pin.zfill(4)] if p and str(p).strip() and str(p).strip() != '-'}
                if pins:
                    p_q |= Q(pin__in=pins)
                has_identity_filter = True
            identity_q = p_q

        if has_identity_filter:
            qs = qs.filter(identity_q)

        if mesin_id:
            qs = qs.filter(mesin_id=mesin_id)

        if tanggal:
            try:
                tgl = datetime.strptime(tanggal, '%Y-%m-%d').date()
                start_dt = timezone.make_aware(datetime.combine(tgl, datetime.min.time()))
                
                # Cek buffer jika shift malam
                next_day_buffer = False
                if pegawai_obj:
                    jd = JadwalDinas.objects.filter(pegawai=pegawai_obj, tanggal=tgl).select_related('shift').first()
                    if jd and jd.shift and jd.shift.is_overnight:
                        next_day_buffer = True

                if next_day_buffer:
                    end_dt = timezone.make_aware(datetime.combine(tgl + timedelta(days=1), datetime.time(12, 0, 0)))
                else:
                    end_dt = timezone.make_aware(datetime.combine(tgl, datetime.max.time()))

                qs = qs.filter(waktu__range=(start_dt, end_dt))
            except Exception:
                pass
        elif tahun and bulan:
            qs = qs.filter(waktu__year=tahun, waktu__month=bulan)
        elif tahun:
            qs = qs.filter(waktu__year=tahun)

        if search:
            matching_pins = KaryawanMesinMapping.objects.filter(nama_di_mesin__icontains=search).values_list('pin', flat=True)
            qs = qs.filter(
                Q(pin__icontains=search) |
                Q(pin__in=matching_pins) |
                Q(pegawai__nama__icontains=search) |
                Q(pegawai__unit_kerja__icontains=search) |
                Q(pegawai__jabatan__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search)
            )

        if has_identity_filter:
            return qs.order_by('waktu')
        return qs.order_by('-waktu')


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

    def list(self, request, *args, **kwargs):
        """
        Daftar presensi harian.
        Jika memfilter per tanggal spesifik (atau default hari ini tanpa parameter bulan/tahun/all),
        kembalikan seluruh pegawai SIMAK aktif beserta status presensinya (hadir, terlambat, izin, atau belum tap).
        """
        tanggal_param = request.query_params.get('tanggal')
        bulan_param = request.query_params.get('bulan')
        tahun_param = request.query_params.get('tahun')
        is_all = request.query_params.get('all')

        # Jika query range/arsip bulanan/tahunan atau ?all=1, gunakan default ModelViewSet list
        if not tanggal_param and (bulan_param or tahun_param or is_all):
            return super().list(request, *args, **kwargs)

        if tanggal_param:
            try:
                target_date = datetime.strptime(tanggal_param, '%Y-%m-%d').date()
            except Exception:
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()

        current_user = request.user
        unit_id = request.query_params.get('unit_id')
        search = request.query_params.get('search')
        status_filter = request.query_params.get('status')

        # Seluruh Pegawai RS Siaga Aktif (149 Pegawai)
        pegawai_qs = Pegawai.objects.filter(is_active=True).select_related('user', 'user__unit')
        if not has_sdm_access(current_user):
            if current_user and current_user.is_authenticated:
                pegawai_qs = pegawai_qs.filter(user=current_user)
            else:
                return Response([])

        if unit_id:
            pegawai_qs = pegawai_qs.filter(Q(user__unit_id=unit_id) | Q(unit_kerja__icontains=unit_id))

        if search:
            pegawai_qs = pegawai_qs.filter(
                Q(nama__icontains=search) |
                Q(pin__icontains=search) |
                Q(nik__icontains=search) |
                Q(user__username__icontains=search)
            )

        # 1. Presensi aktual di database pada target_date
        presensi_records = PresensiHarian.objects.filter(
            tanggal=target_date
        ).select_related('pegawai', 'user', 'user__unit', 'shift', 'jadwal_dinas', 'izin_keluar')
        presensi_map = {p.pegawai_id: p for p in presensi_records if p.pegawai_id}
        user_presensi_map = {p.user_id: p for p in presensi_records if p.user_id and not p.pegawai_id}

        # 2. Jadwal dinas efektif pada target_date
        jadwal_records = JadwalDinas.objects.filter(
            tanggal=target_date,
            pegawai__in=pegawai_qs
        ).select_related('shift')
        jadwal_map = {j.pegawai_id: j for j in jadwal_records}

        # 3. Izin keluar (IMTK) pada target_date
        user_ids = [p.user_id for p in pegawai_qs if p.user_id]
        izin_map = {}
        if user_ids:
            for ik in IzinKeluar.objects.filter(user_id__in=user_ids, tanggal=target_date, status__in=['disetujui', 'berjalan', 'selesai']):
                izin_map[ik.user_id] = ik

        results = []
        for p in pegawai_qs:
            rec = presensi_map.get(p.id) or (user_presensi_map.get(p.user_id) if p.user_id else None)
            if rec:
                item_data = PresensiHarianSerializer(rec, context={'request': request}).data
            else:
                j = jadwal_map.get(p.id)
                shift = j.shift if j else None
                status = 'tidak_hadir'
                status_label = 'Belum Tap / Tidak Hadir'

                if shift:
                    if shift.is_libur or shift.kode in ['L', 'OFF']:
                        status = 'libur'
                        status_label = 'Libur / Off Duty'
                    elif shift.kode == 'CT':
                        status = 'cuti'
                        status_label = 'Cuti Tahunan'
                    elif shift.kode in ['I', 'IP', 'IS', 'IM']:
                        status = 'izin'
                        status_label = f"Izin ({shift.kode})"
                    elif shift.kode == 'SA':
                        status = 'sakit'
                        status_label = 'Sakit'

                ik = izin_map.get(p.user_id) if p.user_id else None
                izin_info = None
                if ik:
                    status = 'izin_keluar'
                    status_label = f"Izin: {ik.get_kategori_display()}"
                    izin_info = {
                        'id': ik.id,
                        'kategori': ik.get_kategori_display(),
                        'jam_keluar': ik.jam_keluar.isoformat() if ik.jam_keluar else None,
                        'jam_kembali': ik.jam_kembali.isoformat() if ik.jam_kembali else None,
                        'keperluan': ik.keperluan,
                    }

                item_data = {
                    'id': f"pegawai_{p.id}",
                    'user_id': p.user_id,
                    'username': p.user.username if p.user else '-',
                    'pegawai_id': p.id,
                    'pegawai_nama': p.nama,
                    'pegawai_pin': p.pin or '-',
                    'nama_lengkap': p.nama,
                    'unit_id': p.user.unit.id if (p.user and p.user.unit) else None,
                    'unit_nama': p.unit_kerja or (p.user.unit.nama if (p.user and p.user.unit) else '-'),
                    'role': p.jabatan or (p.user.role if p.user else '-'),
                    'foto': None,
                    'tanggal': target_date.isoformat(),
                    'jam_masuk': None,
                    'jam_pulang': None,
                    'status': status,
                    'status_label': status_label,
                    'shift_kode': shift.kode if shift else None,
                    'shift_nama': shift.nama if shift else None,
                    'shift_jam_masuk': shift.jam_masuk.isoformat() if (shift and shift.jam_masuk) else None,
                    'shift_jam_pulang': shift.jam_pulang.isoformat() if (shift and shift.jam_pulang) else None,
                    'shift_warna': shift.warna if shift else '#6366f1',
                    'shift_is_overnight': shift.is_overnight if shift else False,
                    'menit_keterlambatan': 0,
                    'menit_pulang_cepat': 0,
                    'total_jam_kerja': 0,
                    'izin_keluar': ik.id if ik else None,
                    'izin_info': izin_info,
                    'catatan': None,
                    'created_at': None,
                    'updated_at': None,
                }

            # Filter status jika diminta
            if status_filter:
                if status_filter in ('tidak_hadir', 'belum_absen'):
                    if item_data['status'] != 'tidak_hadir':
                        continue
                elif item_data['status'] != status_filter:
                    continue

            results.append(item_data)

        # Urutkan: Yang sudah tap / hadir di atas, lalu abjad nama
        results.sort(key=lambda x: (0 if x['jam_masuk'] else 1, (x.get('nama_lengkap') or '').lower()))

        return Response(results)

    @action(methods=['get'], detail=False)
    def dashboard_stat(self, request):
        """Statistik ringkasan kehadiran untuk tanggal tertentu (default hari ini)"""
        tanggal_param = request.query_params.get('tanggal')
        if tanggal_param:
            try:
                target_date = datetime.strptime(tanggal_param, '%Y-%m-%d').date()
            except Exception:
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()

        total_pegawai = Pegawai.objects.filter(is_active=True).count() or User.objects.filter(is_active=True).count()
        presensi_target = PresensiHarian.objects.filter(tanggal=target_date)
        hadir_tepat = presensi_target.filter(status='hadir').count()
        terlambat = presensi_target.filter(status='terlambat').count()
        pulang_cepat = presensi_target.filter(status='pulang_cepat').count()
        izin_keluar = presensi_target.filter(status__in=['izin', 'izin_keluar']).count()
        cuti = presensi_target.filter(status='cuti').count()
        sakit = presensi_target.filter(status='sakit').count()
        libur = presensi_target.filter(status='libur').count()
        tidak_hadir = presensi_target.filter(status='tidak_hadir').count()
        total_tap = presensi_target.exclude(jam_masuk__isnull=True, jam_pulang__isnull=True).count()

        total_logs_all = LogPresensi.objects.count()
        total_logs_today = LogPresensi.objects.filter(waktu__date=target_date).count()
        total_logs_month = LogPresensi.objects.filter(waktu__year=target_date.year, waktu__month=target_date.month).count()

        return Response({
            'tanggal': target_date.isoformat(),
            'total_pegawai': total_pegawai,
            'total_tap': total_tap,
            'hadir_tepat': hadir_tepat,
            'terlambat': terlambat,
            'pulang_cepat': pulang_cepat,
            'izin_keluar': izin_keluar,
            'cuti': cuti,
            'sakit': sakit,
            'libur': libur,
            'tidak_hadir': tidak_hadir,
            'belum_absen': max(0, total_pegawai - total_tap),
            'total_logs_all': total_logs_all,
            'total_logs_today': total_logs_today,
            'total_logs_month': total_logs_month,
        })

    @action(methods=['post'], detail=False, url_path='recalculate')
    def recalculate(self, request):
        """
        Menjalankan Attendance Engine secara on-demand untuk rentang tanggal tertentu atau tanggal spesifik.
        """
        if not has_sdm_access(request.user):
            return Response({'detail': 'Akses ditolak.'}, status=403)

        tanggal_str = request.data.get('tanggal')
        start_date_str = request.data.get('start_date') or tanggal_str
        end_date_str = request.data.get('end_date') or tanggal_str

        from .attendance_engine import process_attendance_for_date_range

        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date() if start_date_str else timezone.localdate()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date() if end_date_str else start_date
        except Exception as e:
            return Response({'status': 'error', 'message': f"Format tanggal salah: {str(e)}"}, status=400)

        res = process_attendance_for_date_range(start_date, end_date)
        return Response(res)

    @action(methods=['get'], detail=False)
    def export_excel(self, request):
        """Export rekap presensi ke file Excel (.xlsx)"""
        data_list = self.list(request).data
        
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
        for idx, item in enumerate(data_list, 1):
            ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=2, value=str(item.get('tanggal') or '-')).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=3, value=item.get('nama_lengkap') or item.get('username'))
            ws.cell(row=row_idx, column=4, value=item.get('unit_nama') or "-")
            ws.cell(row=row_idx, column=5, value=str(item.get('jam_masuk')) if item.get('jam_masuk') else "-").alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=6, value=str(item.get('jam_pulang')) if item.get('jam_pulang') else "-").alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=7, value=item.get('status_label') or "-").alignment = Alignment(horizontal="center")
            
            menit_telat = item.get('menit_keterlambatan') or 0
            if item.get('status') == 'terlambat' or menit_telat > 0:
                telat_str = f"Terlambat {menit_telat} mnt"
            elif item.get('jam_masuk'):
                telat_str = "Tepat Waktu"
            else:
                telat_str = "-"
            ws.cell(row=row_idx, column=8, value=telat_str).alignment = Alignment(horizontal="center")

            izin_info = item.get('izin_info')
            izin_str = f"Izin: {izin_info['kategori']}" if izin_info else "-"
            ws.cell(row=row_idx, column=9, value=izin_str)

            for c in range(1, 10):
                ws.cell(row=row_idx, column=c).border = border_all
            row_idx += 1

        # Adjust column widths
        widths = [6, 12, 28, 20, 14, 14, 25, 16, 24]
        for idx, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(idx)].width = w

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Rekap_Presensi_{timezone.localdate().strftime("%Y%m%d")}.xlsx"'
        wb.save(response)
        return response

    @action(methods=['get'], detail=False)
    def evaluasi_disiplin(self, request):
        """
        Evaluasi tingkat kedisiplinan pegawai bulanan (Step 6).
        Menggantikan rumus Excel sheet ABSENSI kolom G61/G63.
        Mengelompokkan pegawai berdasarkan akumulasi keterlambatan, pulang cepat, dan alfa/tidak hadir.
        """
        tahun = int(request.query_params.get('tahun') or 2026)
        bulan = int(request.query_params.get('bulan') or 10)
        unit_id = request.query_params.get('unit_id')
        search = request.query_params.get('search')
        status_disiplin_filter = request.query_params.get('status_disiplin')

        pegawai_qs = Pegawai.objects.filter(is_active=True).select_related('user', 'user__unit')
        if not has_sdm_access(request.user):
            pegawai_qs = pegawai_qs.filter(user=request.user)

        if unit_id:
            pegawai_qs = pegawai_qs.filter(Q(user__unit_id=unit_id) | Q(unit_kerja__icontains=unit_id))
        if search:
            pegawai_qs = pegawai_qs.filter(
                Q(nama__icontains=search) | Q(pin__icontains=search) | Q(nik__icontains=search)
            )

        # Ambil seluruh presensi bulan tersebut untuk pegawai terkait
        presensi_records = PresensiHarian.objects.filter(
            tanggal__year=tahun,
            tanggal__month=bulan,
            pegawai__in=pegawai_qs
        ).select_related('shift', 'pegawai', 'user', 'izin_keluar').order_by('tanggal')

        # Kelompokkan per pegawai
        records_by_pegawai = {}
        for rec in presensi_records:
            records_by_pegawai.setdefault(rec.pegawai_id, []).append(rec)

        results = []
        kpi = {
            'total_pegawai': len(pegawai_qs),
            'disiplin_baik': 0,
            'perlu_pembinaan_ringan': 0,
            'perlu_sp_1': 0,
            'perlu_sp_2': 0,
            'total_menit_terlambat_semua': 0,
            'total_alfa_semua': 0,
        }

        for p in pegawai_qs:
            p_recs = records_by_pegawai.get(p.id, [])
            
            total_hari_dinas = 0
            total_hadir = 0
            total_terlambat_kali = 0
            total_menit_terlambat = 0
            total_pulang_cepat_kali = 0
            total_menit_pulang_cepat = 0
            total_alfa = 0
            total_libur = 0
            total_cuti = 0
            total_sakit = 0
            total_izin = 0
            pelanggaran_dates = []

            for r in p_recs:
                shift_kode = r.shift.kode if r.shift else '-'
                is_libur_shift = bool(r.shift and (r.shift.is_libur or r.shift.kode in ['L', 'OFF']))

                if not is_libur_shift and r.shift:
                    total_hari_dinas += 1

                if r.status in ('hadir', 'terlambat', 'pulang_cepat'):
                    total_hadir += 1

                if r.status == 'libur' or is_libur_shift:
                    total_libur += 1
                elif r.status == 'cuti' or (r.shift and r.shift.kode == 'CT'):
                    total_cuti += 1
                elif r.status == 'sakit' or (r.shift and r.shift.kode == 'SA'):
                    total_sakit += 1
                elif r.status in ('izin', 'izin_keluar') or (r.shift and r.shift.kode in ['I', 'IP', 'IS', 'IM']):
                    total_izin += 1
                elif r.status == 'tidak_hadir':
                    if not is_libur_shift:
                        total_alfa += 1
                        pelanggaran_dates.append({
                            'tanggal': r.tanggal.isoformat(),
                            'hari': r.tanggal.strftime('%A'),
                            'shift': shift_kode,
                            'jenis': 'ALFA',
                            'keterangan': 'Tidak Hadir / Belum Tap Absen',
                            'menit': 0
                        })

                if r.menit_keterlambatan > 0:
                    total_terlambat_kali += 1
                    total_menit_terlambat += r.menit_keterlambatan
                    pelanggaran_dates.append({
                        'tanggal': r.tanggal.isoformat(),
                        'hari': r.tanggal.strftime('%A'),
                        'shift': shift_kode,
                        'jenis': 'TERLAMBAT',
                        'keterangan': f"Terlambat {r.menit_keterlambatan} Menit (Jam Masuk: {r.jam_masuk or '-'})",
                        'menit': r.menit_keterlambatan
                    })

                if r.menit_pulang_cepat > 0:
                    total_pulang_cepat_kali += 1
                    total_menit_pulang_cepat += r.menit_pulang_cepat
                    pelanggaran_dates.append({
                        'tanggal': r.tanggal.isoformat(),
                        'hari': r.tanggal.strftime('%A'),
                        'shift': shift_kode,
                        'jenis': 'PULANG_CEPAT',
                        'keterangan': f"Pulang Cepat {r.menit_pulang_cepat} Menit (Jam Pulang: {r.jam_pulang or '-'})",
                        'menit': r.menit_pulang_cepat
                    })

            persentase = round((total_hadir / total_hari_dinas) * 100, 1) if total_hari_dinas > 0 else 100.0

            if total_alfa >= 3 or total_menit_terlambat >= 90:
                status_disiplin = 'SP_2'
                status_disiplin_label = 'Surat Peringatan 2 (SP-2)'
                rekomendasi = 'Penerbitan Surat Peringatan II & Pemanggilan Pembinaan'
                tingkat_urgensi = 'danger'
                badge_color = '#ef4444'
                kpi['perlu_sp_2'] += 1
            elif total_alfa >= 1 or total_terlambat_kali >= 3 or total_menit_terlambat >= 45:
                status_disiplin = 'SP_1'
                status_disiplin_label = 'Surat Peringatan 1 (SP-1)'
                rekomendasi = 'Penerbitan Surat Peringatan I & Pembinaan Kasubag SDM'
                tingkat_urgensi = 'warning'
                badge_color = '#f97316'
                kpi['perlu_sp_1'] += 1
            elif total_terlambat_kali >= 2 or total_menit_terlambat >= 15 or total_pulang_cepat_kali >= 2:
                status_disiplin = 'TEGURAN_LISAN'
                status_disiplin_label = 'Teguran / Binaan Ringan'
                rekomendasi = 'Binaan Lisan Internal Kepala Ruangan / Unit Kerja'
                tingkat_urgensi = 'info'
                badge_color = '#eab308'
                kpi['perlu_pembinaan_ringan'] += 1
            else:
                status_disiplin = 'BAIK'
                status_disiplin_label = 'Disiplin Baik'
                rekomendasi = 'Memenuhi Standar Disiplin Kerja RS'
                tingkat_urgensi = 'success'
                badge_color = '#10b981'
                kpi['disiplin_baik'] += 1

            kpi['total_menit_terlambat_semua'] += total_menit_terlambat
            kpi['total_alfa_semua'] += total_alfa

            item = {
                'pegawai_id': p.id,
                'nama': p.nama,
                'pin': p.pin or '-',
                'nik': p.nik or '-',
                'unit_kerja': p.unit_kerja or (p.user.unit.nama if (p.user and p.user.unit) else '-'),
                'jabatan': p.jabatan or (p.user.role if p.user else '-'),
                'total_hari_dinas': total_hari_dinas,
                'total_hadir': total_hadir,
                'total_terlambat_kali': total_terlambat_kali,
                'total_menit_terlambat': total_menit_terlambat,
                'total_pulang_cepat_kali': total_pulang_cepat_kali,
                'total_menit_pulang_cepat': total_menit_pulang_cepat,
                'total_alfa': total_alfa,
                'total_izin': total_izin,
                'total_sakit': total_sakit,
                'total_cuti': total_cuti,
                'total_libur': total_libur,
                'persentase_kehadiran': persentase,
                'status_disiplin': status_disiplin,
                'status_disiplin_label': status_disiplin_label,
                'rekomendasi': rekomendasi,
                'tingkat_urgensi': tingkat_urgensi,
                'badge_color': badge_color,
                'pelanggaran_dates': pelanggaran_dates,
                'total_pelanggaran_count': len(pelanggaran_dates)
            }

            if status_disiplin_filter:
                if item['status_disiplin'] != status_disiplin_filter:
                    continue

            results.append(item)

        priority_map = {'SP_2': 0, 'SP_1': 1, 'TEGURAN_LISAN': 2, 'BAIK': 3}
        results.sort(key=lambda x: (priority_map.get(x['status_disiplin'], 99), -x['total_menit_terlambat'], -x['total_alfa'], x['nama'].lower()))

        return Response({
            'tahun': tahun,
            'bulan': bulan,
            'kpi': kpi,
            'results': results
        })

    @action(methods=['get'], detail=False)
    def cetak_surat_binaan(self, request):
        """
        Generate payload Surat Pembinaan / Surat Peringatan (SP) resmi RS Siaga Al Munawwarah (Step 6).
        Format siap cetak (print preview) dengan nomor surat, rincian tanggal, dan klausul hukum.
        """
        pegawai_id = request.query_params.get('pegawai_id')
        tahun = int(request.query_params.get('tahun') or 2026)
        bulan = int(request.query_params.get('bulan') or 10)
        tingkat = request.query_params.get('tingkat') or 'SP_1'

        if not pegawai_id:
            return Response({'status': 'error', 'message': 'Parameter pegawai_id wajib disertakan.'}, status=400)

        pegawai = Pegawai.objects.filter(id=pegawai_id).select_related('user', 'user__unit').first()
        if not pegawai:
            return Response({'status': 'error', 'message': 'Pegawai tidak ditemukan.'}, status=404)

        recs = PresensiHarian.objects.filter(
            pegawai=pegawai,
            tanggal__year=tahun,
            tanggal__month=bulan
        ).select_related('shift').order_by('tanggal')

        pelanggaran = []
        total_telat_menit = 0
        total_alfa = 0

        for r in recs:
            shift_kode = r.shift.kode if r.shift else '-'
            is_libur = bool(r.shift and (r.shift.is_libur or r.shift.kode in ['L', 'OFF']))
            if r.status == 'tidak_hadir' and not is_libur:
                total_alfa += 1
                pelanggaran.append({
                    'tanggal': r.tanggal.strftime('%d-%m-%Y'),
                    'hari': r.tanggal.strftime('%A'),
                    'shift': shift_kode,
                    'keterangan': 'Tidak Hadir tanpa keterangan yang sah (Alfa)'
                })
            elif r.menit_keterlambatan > 0:
                total_telat_menit += r.menit_keterlambatan
                pelanggaran.append({
                    'tanggal': r.tanggal.strftime('%d-%m-%Y'),
                    'hari': r.tanggal.strftime('%A'),
                    'shift': shift_kode,
                    'keterangan': f"Terlambat {r.menit_keterlambatan} menit (Masuk jam {r.jam_masuk or '-'})"
                })

        nama_bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][bulan - 1]

        if tingkat == 'SP_2':
            judul = "SURAT PERINGATAN KEDUA (SP - II)"
            kode_nomor = "SP-II"
            sanksi = "Diberikan peringatan keras kedua. Apabila yang bersangkutan kembali melakukan pelanggaran disiplin dalam kurun waktu 3 (tiga) bulan ke depan, maka akan diproses sanksi berat (SP-III / Evaluasi Perpanjangan Kontrak Kerja)."
        elif tingkat == 'SP_1':
            judul = "SURAT PERINGATAN PERTAMA (SP - I)"
            kode_nomor = "SP-I"
            sanksi = "Diberikan teguran tertulis pertama dan wajib melakukan pembinaan langsung bersama Kepala Bagian SDM untuk evaluasi dan perbaikan disiplin kerja."
        else:
            judul = "SURAT PEMBINAAN & TEGURAN LISAN"
            kode_nomor = "BINAAN"
            sanksi = "Diberikan pembinaan kedisiplinan secara internal agar selalu menaati jam dinas shift yang telah ditetapkan demi mutu pelayanan rumah sakit."

        no_surat = f"800/{pegawai.id:03d}/RS-SIAGA/SDM-{kode_nomor}/{bulan:02d}/{tahun}"
        tgl_surat = timezone.localdate().strftime('%d %B %Y')

        return Response({
            'kop': {
                'instansi': '',
                'badan': 'RS SIAGA AL MUNAWWARAH SAMARINDA',
                'alamat': 'Jl. Ramania No. 3, Samarinda, Kalimantan Timur 75123',
                'kontak': 'Telp: (0541) 743000 | Email: rsiagaalmunawwarah@gmail.com'
            },
            'surat': {
                'nomor': no_surat,
                'judul': judul,
                'tingkat': tingkat,
                'tanggal_terbit': tgl_surat,
                'periode': f"{nama_bulan} {tahun}",
                'pegawai': {
                    'id': pegawai.id,
                    'nama': pegawai.nama,
                    'nik': pegawai.nik or '-',
                    'pin': pegawai.pin or '-',
                    'unit_kerja': pegawai.unit_kerja or (pegawai.user.unit.nama if (pegawai.user and pegawai.user.unit) else '-'),
                    'jabatan': pegawai.jabatan or (pegawai.user.role if pegawai.user else '-'),
                },
                'ringkasan': {
                    'total_alfa_hari': total_alfa,
                    'total_terlambat_menit': total_telat_menit,
                    'total_kasus': len(pelanggaran)
                },
                'rincian_pelanggaran': pelanggaran,
                'sanksi': sanksi,
                'penandatangan': {
                    'kota': 'Samarinda',
                    'tanggal': tgl_surat,
                    'pejabat_nama': 'dr. H. Sadik Sahil, M.Kes.',
                    'pejabat_jabatan': 'Direktur RS Siaga Al Munawwarah Samarinda',
                    'nip': 'Direksi RS Siaga Al Munawwarah'
                }
            }
        })

    @action(methods=['get'], detail=False)
    def kartu_absensi(self, request):
        """
        Kartu Absensi Bulanan Per Pegawai (Step 7 - Format resmi kalender 1 s/d 31).
        Menggantikan tampilan form cetak sheet ABSENSI untuk arsip fisik dan tanda tangan.
        """
        pegawai_id = request.query_params.get('pegawai_id')
        tahun = int(request.query_params.get('tahun') or 2026)
        bulan = int(request.query_params.get('bulan') or 10)

        if not pegawai_id:
            p_first = Pegawai.objects.filter(is_active=True).first()
            if not p_first:
                return Response({'status': 'error', 'message': 'Tidak ada data pegawai.'}, status=404)
            pegawai_id = p_first.id

        pegawai = Pegawai.objects.filter(id=pegawai_id).select_related('user', 'user__unit').first()
        if not pegawai:
            return Response({'status': 'error', 'message': 'Pegawai tidak ditemukan.'}, status=404)

        _, num_days = calendar.monthrange(tahun, bulan)
        nama_bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][bulan - 1]

        recs = PresensiHarian.objects.filter(
            pegawai=pegawai,
            tanggal__year=tahun,
            tanggal__month=bulan
        ).select_related('shift', 'jadwal_dinas').order_by('tanggal')

        rec_map = {r.tanggal.day: r for r in recs}

        jadwal_recs = JadwalDinas.objects.filter(
            pegawai=pegawai,
            tanggal__year=tahun,
            tanggal__month=bulan
        ).select_related('shift')
        jadwal_map = {j.tanggal.day: j for j in jadwal_recs}

        hari_nama_map = {
            'Monday': 'Senin', 'Tuesday': 'Selasa', 'Wednesday': 'Rabu',
            'Thursday': 'Kamis', 'Friday': 'Jumat', 'Saturday': 'Sabtu', 'Sunday': 'Minggu'
        }

        daily_rows = []
        tot_dinas = 0
        tot_hadir = 0
        tot_terlambat_kali = 0
        tot_menit_telat = 0
        tot_pulang_cepat_kali = 0
        tot_jam_kerja = 0.0
        tot_libur = 0
        tot_cuti = 0
        tot_sakit = 0
        tot_izin = 0
        tot_alfa = 0

        for day in range(1, num_days + 1):
            curr_date = date(tahun, bulan, day)
            day_name = hari_nama_map.get(curr_date.strftime('%A'), curr_date.strftime('%A'))
            r = rec_map.get(day)
            j = jadwal_map.get(day)
            shift = r.shift if (r and r.shift) else (j.shift if j else None)

            is_libur = bool(shift and (shift.is_libur or shift.kode in ['L', 'OFF']))
            if not is_libur and shift:
                tot_dinas += 1

            if r:
                jam_in = r.jam_masuk.strftime('%H:%M') if r.jam_masuk else '-'
                jam_out = r.jam_pulang.strftime('%H:%M') if r.jam_pulang else '-'
                telat = r.menit_keterlambatan
                cepat = r.menit_pulang_cepat
                jam_kerja = float(r.total_jam_kerja)
                st = r.status
                st_label = r.get_status_display()
                catatan = r.catatan or '-'

                if st in ('hadir', 'terlambat', 'pulang_cepat'):
                    tot_hadir += 1
                if telat > 0:
                    tot_terlambat_kali += 1
                    tot_menit_telat += telat
                if cepat > 0:
                    tot_pulang_cepat_kali += 1
                if st == 'libur' or is_libur:
                    tot_libur += 1
                elif st == 'cuti':
                    tot_cuti += 1
                elif st == 'sakit':
                    tot_sakit += 1
                elif st in ('izin', 'izin_keluar'):
                    tot_izin += 1
                elif st == 'tidak_hadir' and not is_libur:
                    tot_alfa += 1

                tot_jam_kerja += jam_kerja
            else:
                jam_in = '-'
                jam_out = '-'
                telat = 0
                cepat = 0
                jam_kerja = 0.0
                catatan = '-'
                if is_libur:
                    st = 'libur'
                    st_label = 'Libur / Off'
                    tot_libur += 1
                elif shift:
                    st = 'tidak_hadir'
                    st_label = 'Belum Tap'
                    tot_alfa += 1
                else:
                    st = '-'
                    st_label = '-'

            daily_rows.append({
                'day': day,
                'tanggal': curr_date.isoformat(),
                'hari': day_name,
                'shift_kode': shift.kode if shift else '-',
                'shift_nama': shift.nama if shift else '-',
                'shift_jam_masuk': shift.jam_masuk.strftime('%H:%M') if (shift and shift.jam_masuk) else '-',
                'shift_jam_pulang': shift.jam_pulang.strftime('%H:%M') if (shift and shift.jam_pulang) else '-',
                'shift_warna': shift.warna if shift else '#6366f1',
                'is_libur': is_libur,
                'jam_masuk': jam_in,
                'jam_pulang': jam_out,
                'menit_terlambat': telat,
                'menit_pulang_cepat': cepat,
                'total_jam_kerja': jam_kerja,
                'status': st,
                'status_label': st_label,
                'catatan': catatan
            })

        persentase = round((tot_hadir / tot_dinas) * 100, 1) if tot_dinas > 0 else 100.0

        return Response({
            'pegawai': {
                'id': pegawai.id,
                'nama': pegawai.nama,
                'nik': pegawai.nik or '-',
                'pin': pegawai.pin or '-',
                'unit_kerja': pegawai.unit_kerja or (pegawai.user.unit.nama if (pegawai.user and pegawai.user.unit) else '-'),
                'jabatan': pegawai.jabatan or (pegawai.user.role if pegawai.user else '-'),
            },
            'periode': {
                'bulan': bulan,
                'tahun': tahun,
                'nama_bulan': nama_bulan,
                'total_hari_kalender': num_days,
            },
            'summary': {
                'total_hari_dinas': tot_dinas,
                'total_hadir': tot_hadir,
                'total_terlambat_kali': tot_terlambat_kali,
                'total_menit_terlambat': tot_menit_telat,
                'total_pulang_cepat_kali': tot_pulang_cepat_kali,
                'total_jam_kerja': round(tot_jam_kerja, 2),
                'total_libur': tot_libur,
                'total_cuti': tot_cuti,
                'total_sakit': tot_sakit,
                'total_izin': tot_izin,
                'total_alfa': tot_alfa,
                'persentase_kehadiran': persentase
            },
            'daily_rows': daily_rows
        })

    @action(methods=['get'], detail=False)
    def rekap_bulanan_unit(self, request):
        """
        Rekapitulasi kehadiran per Unit Kerja / Instalasi RS bulanan (Step 7).
        Memberikan ringkasan tingkat kedisiplinan dan persentase kehadiran departemen.
        """
        tahun = int(request.query_params.get('tahun') or 2026)
        bulan = int(request.query_params.get('bulan') or 10)

        pegawai_list = list(Pegawai.objects.filter(is_active=True).values('id', 'nama', 'unit_kerja'))
        unit_map = {}
        for p in pegawai_list:
            u_name = (p.get('unit_kerja') or 'Lainnya').strip()
            unit_map.setdefault(u_name, []).append(p['id'])

        recs = PresensiHarian.objects.filter(
            tanggal__year=tahun,
            tanggal__month=bulan
        ).select_related('shift')

        rec_by_pegawai = {}
        for r in recs:
            rec_by_pegawai.setdefault(r.pegawai_id, []).append(r)

        unit_results = []
        grand_total_pegawai = len(pegawai_list)
        grand_total_dinas = 0
        grand_total_hadir = 0
        grand_total_telat_menit = 0
        grand_total_alfa = 0

        for unit_name, p_ids in sorted(unit_map.items()):
            u_dinas = 0
            u_hadir = 0
            u_telat = 0
            u_telat_menit = 0
            u_alfa = 0
            u_jam_kerja = 0.0

            for pid in p_ids:
                p_recs = rec_by_pegawai.get(pid, [])
                for r in p_recs:
                    is_libur = bool(r.shift and (r.shift.is_libur or r.shift.kode in ['L', 'OFF']))
                    if not is_libur and r.shift:
                        u_dinas += 1
                    if r.status in ('hadir', 'terlambat', 'pulang_cepat'):
                        u_hadir += 1
                    if r.menit_keterlambatan > 0:
                        u_telat += 1
                        u_telat_menit += r.menit_keterlambatan
                    if r.status == 'tidak_hadir' and not is_libur:
                        u_alfa += 1
                    u_jam_kerja += float(r.total_jam_kerja or 0)

            pct = round((u_hadir / u_dinas) * 100, 1) if u_dinas > 0 else 100.0

            grand_total_dinas += u_dinas
            grand_total_hadir += u_hadir
            grand_total_telat_menit += u_telat_menit
            grand_total_alfa += u_alfa

            unit_results.append({
                'unit_nama': unit_name,
                'total_pegawai': len(p_ids),
                'total_dinas': u_dinas,
                'total_hadir': u_hadir,
                'total_terlambat_kali': u_telat,
                'total_menit_terlambat': u_telat_menit,
                'total_alfa': u_alfa,
                'total_jam_kerja': round(u_jam_kerja, 1),
                'persentase_kehadiran': pct,
                'status_rating': 'Sangat Baik' if pct >= 95 else 'Baik' if pct >= 85 else 'Perlu Perhatian'
            })

        unit_results.sort(key=lambda x: -x['persentase_kehadiran'])
        grand_pct = round((grand_total_hadir / grand_total_dinas) * 100, 1) if grand_total_dinas > 0 else 100.0

        return Response({
            'tahun': tahun,
            'bulan': bulan,
            'summary': {
                'total_unit': len(unit_results),
                'total_pegawai': grand_total_pegawai,
                'rata_rata_kehadiran': grand_pct,
                'total_alfa_semua': grand_total_alfa,
                'total_menit_terlambat_semua': grand_total_telat_menit
            },
            'results': unit_results
        })

    @action(methods=['get'], detail=False)
    def export_excel_bulanan(self, request):
        """
        Export Rekapitulasi Presensi & Disiplin Bulanan Komprehensif ke Excel (.xlsx).
        Sheet 1: Rekap Pegawai (Matrix hadir, telat, alfa, %, status disiplin)
        Sheet 2: Rekapitulasi Unit Kerja
        """
        tahun = int(request.query_params.get('tahun') or 2026)
        bulan = int(request.query_params.get('bulan') or 10)
        nama_bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][bulan - 1]

        # Ambil data evaluasi disiplin
        eval_resp = self.evaluasi_disiplin(request).data
        unit_resp = self.rekap_bulanan_unit(request).data

        wb = openpyxl.Workbook()
        ws1 = wb.active
        ws1.title = "Rekapitulasi Pegawai"

        font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        fill_header = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        fill_unit = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
        thin = Side(border_style="thin", color="D1D5DB")
        border_all = Border(left=thin, right=thin, top=thin, bottom=thin)

        # Title Sheet 1
        ws1.merge_cells("A1:K1")
        ws1["A1"] = f"REKAPITULASI KEHADIRAN & DISIPLIN PEGAWAI RS SIAGA AL MUNAWWARAH - {nama_bulan.upper()} {tahun}"
        ws1["A1"].font = Font(name="Calibri", size=13, bold=True, color="1E3A8A")
        ws1["A1"].alignment = Alignment(horizontal="center")

        headers1 = [
            "No", "PIN", "Nama Pegawai", "Unit Kerja", "Jabatan",
            "Hari Dinas", "Hadir", "Terlambat (Kali)", "Total Telat (Menit)", "Alfa", "Persentase (%)", "Status Disiplin"
        ]
        for col_idx, h in enumerate(headers1, 1):
            cell = ws1.cell(row=3, column=col_idx, value=h)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border_all

        for idx, row in enumerate(eval_resp.get('results', []), 1):
            r_idx = idx + 3
            ws1.cell(row=r_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=2, value=row.get('pin') or "-").alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=3, value=row.get('nama'))
            ws1.cell(row=r_idx, column=4, value=row.get('unit_kerja'))
            ws1.cell(row=r_idx, column=5, value=row.get('jabatan'))
            ws1.cell(row=r_idx, column=6, value=row.get('total_hari_dinas')).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=7, value=row.get('total_hadir')).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=8, value=row.get('total_terlambat_kali')).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=9, value=row.get('total_menit_terlambat')).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=10, value=row.get('total_alfa')).alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=11, value=f"{row.get('persentase_kehadiran')}%").alignment = Alignment(horizontal="center")
            ws1.cell(row=r_idx, column=12, value=row.get('status_disiplin_label')).alignment = Alignment(horizontal="center")

            for c in range(1, 13):
                ws1.cell(row=r_idx, column=c).border = border_all

        for idx, w in enumerate([6, 10, 28, 22, 20, 12, 10, 14, 16, 8, 14, 22], 1):
            ws1.column_dimensions[get_column_letter(idx)].width = w

        # Sheet 2: Rekapitulasi Unit
        ws2 = wb.create_sheet(title="Rekap Unit Kerja")
        ws2.merge_cells("A1:I1")
        ws2["A1"] = f"REKAPITULASI KEHADIRAN PER UNIT KERJA - {nama_bulan.upper()} {tahun}"
        ws2["A1"].font = Font(name="Calibri", size=13, bold=True, color="047857")
        ws2["A1"].alignment = Alignment(horizontal="center")

        headers2 = [
            "No", "Unit Kerja", "Jumlah Pegawai", "Total Hari Dinas",
            "Total Hadir", "Total Kasus Telat", "Akumulasi Telat (Menit)", "Total Alfa", "Tingkat Kehadiran (%)", "Rating"
        ]
        for col_idx, h in enumerate(headers2, 1):
            cell = ws2.cell(row=3, column=col_idx, value=h)
            cell.font = font_header
            cell.fill = fill_unit
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border_all

        for idx, row in enumerate(unit_resp.get('results', []), 1):
            r_idx = idx + 3
            ws2.cell(row=r_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=2, value=row.get('unit_nama'))
            ws2.cell(row=r_idx, column=3, value=row.get('total_pegawai')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=4, value=row.get('total_dinas')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=5, value=row.get('total_hadir')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=6, value=row.get('total_terlambat_kali')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=7, value=row.get('total_menit_terlambat')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=8, value=row.get('total_alfa')).alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=9, value=f"{row.get('persentase_kehadiran')}%").alignment = Alignment(horizontal="center")
            ws2.cell(row=r_idx, column=10, value=row.get('status_rating')).alignment = Alignment(horizontal="center")

            for c in range(1, 11):
                ws2.cell(row=r_idx, column=c).border = border_all

        for idx, w in enumerate([6, 24, 14, 16, 14, 16, 20, 12, 18, 16], 1):
            ws2.column_dimensions[get_column_letter(idx)].width = w

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Rekap_Bulanan_SDM_{tahun}_{bulan:02d}.xlsx"'
        wb.save(response)
        return response


class JadwalDinasViewSet(viewsets.ModelViewSet):
    """
    ViewSet untuk Roster / Jadwal Dinas Bulanan Karyawan Rumah Sakit (3-Layer: Master, Koreksi, Final).
    Menyediakan grid matrix bulanan (mode=final|master), cell update, reset cell ke master, copy month, dan export Excel.
    """
    queryset = JadwalDinas.objects.select_related('pegawai', 'shift', 'shift_master', 'koreksi', 'created_by').all()
    serializer_class = JadwalDinasSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        pegawai_id = self.request.query_params.get('pegawai_id')
        unit = self.request.query_params.get('unit')
        kategori = self.request.query_params.get('kategori')
        bulan = self.request.query_params.get('bulan')
        tahun = self.request.query_params.get('tahun')
        tanggal = self.request.query_params.get('tanggal')
        sumber = self.request.query_params.get('sumber')

        if pegawai_id:
            qs = qs.filter(pegawai_id=pegawai_id)
        if unit:
            qs = qs.filter(pegawai__unit_kerja__icontains=unit)
        if kategori:
            qs = qs.filter(pegawai__kategori=kategori)
        if tanggal:
            qs = qs.filter(tanggal=tanggal)
        if bulan:
            qs = qs.filter(tanggal__month=bulan)
        if tahun:
            qs = qs.filter(tanggal__year=tahun)
        if sumber:
            qs = qs.filter(sumber=sumber)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def matrix(self, request):
        """
        Mengembalikan struktur Roster Grid Bulanan terstruktur per Pegawai.
        Mendukung ?mode=final (default, dari JadwalDinas) atau ?mode=master (dari JadwalMaster).
        """
        today = timezone.localdate()
        try:
            bulan = int(request.query_params.get('bulan', today.month))
            tahun = int(request.query_params.get('tahun', today.year))
        except (ValueError, TypeError):
            bulan = today.month
            tahun = today.year

        mode = (request.query_params.get('mode') or 'final').lower()
        if mode not in ('final', 'master'):
            mode = 'final'

        unit = request.query_params.get('unit')
        kategori = request.query_params.get('kategori')
        search = request.query_params.get('search')

        # Number of days in requested month
        _, total_days = calendar.monthrange(tahun, bulan)
        nama_hari_id = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

        days_meta = []
        for d in range(1, total_days + 1):
            curr_date = date(tahun, bulan, d)
            weekday_idx = curr_date.weekday()
            days_meta.append({
                'day': d,
                'date_str': curr_date.strftime('%Y-%m-%d'),
                'day_name': nama_hari_id[weekday_idx],
                'is_weekend': weekday_idx in (5, 6),
                'is_sunday': weekday_idx == 6,
            })

        # Filter Pegawai
        pegawai_qs = Pegawai.objects.filter(is_active=True)
        if unit:
            pegawai_qs = pegawai_qs.filter(Q(unit_kerja__icontains=unit) | Q(jabatan__icontains=unit))
        if kategori:
            pegawai_qs = pegawai_qs.filter(kategori=kategori)
        if search:
            pegawai_qs = pegawai_qs.filter(
                Q(nama__icontains=search) |
                Q(pin__icontains=search) |
                Q(jabatan__icontains=search) |
                Q(unit_kerja__icontains=search)
            )
        pegawai_list = list(pegawai_qs.order_by('unit_kerja', 'nama'))
        pegawai_ids = [p.id for p in pegawai_list]

        jadwal_map = {}
        if mode == 'master':
            master_qs = JadwalMaster.objects.filter(
                pegawai_id__in=pegawai_ids,
                tanggal__year=tahun,
                tanggal__month=bulan
            ).select_related('shift')
            for jm in master_qs:
                jadwal_map[(jm.pegawai_id, jm.tanggal.day)] = jm
        else:
            jadwal_qs = JadwalDinas.objects.filter(
                pegawai_id__in=pegawai_ids,
                tanggal__year=tahun,
                tanggal__month=bulan
            ).select_related('shift', 'shift_master', 'koreksi')
            for jd in jadwal_qs:
                jadwal_map[(jd.pegawai_id, jd.tanggal.day)] = jd

        pegawai_rows = []
        grand_total_assignments = 0
        grand_total_koreksi = 0

        for p in pegawai_list:
            row_shifts = {}
            total_kerja = 0
            total_libur = 0
            total_koreksi_row = 0
            shift_counts = {}
            kelompok_p = kelompok_shift_untuk(p)

            for d in range(1, total_days + 1):
                rec = jadwal_map.get((p.id, d))
                if rec:
                    grand_total_assignments += 1
                    s = rec.shift
                    kode = s.kode
                    shift_counts[kode] = shift_counts.get(kode, 0) + 1
                    if s.is_libur:
                        total_libur += 1
                    else:
                        total_kerja += 1

                    if mode == 'master':
                        row_shifts[str(d)] = {
                            'id': rec.id,
                            'shift_id': s.id,
                            'kode': s.kode,
                            'nama': s.nama,
                            'warna': s.warna,
                            'is_overnight': s.is_overnight,
                            'is_libur': s.is_libur,
                            'jam_masuk': s.jam_masuk.strftime('%H:%M') if s.jam_masuk else None,
                            'jam_pulang': s.jam_pulang.strftime('%H:%M') if s.jam_pulang else None,
                            'batas_tepat_waktu': s.batas_tepat_waktu.strftime('%H:%M') if s.batas_tepat_waktu else None,
                            'catatan': rec.catatan,
                            'sumber': 'master',
                        }
                    else:
                        is_kor = (rec.sumber == 'koreksi')
                        if is_kor:
                            grand_total_koreksi += 1
                            total_koreksi_row += 1
                        sm = rec.shift_master
                        kor = rec.koreksi
                        row_shifts[str(d)] = {
                            'id': rec.id,
                            'shift_id': s.id,
                            'kode': s.kode,
                            'nama': s.nama,
                            'warna': s.warna,
                            'is_overnight': s.is_overnight,
                            'is_libur': s.is_libur,
                            'jam_masuk': s.jam_masuk.strftime('%H:%M') if s.jam_masuk else None,
                            'jam_pulang': s.jam_pulang.strftime('%H:%M') if s.jam_pulang else None,
                            'batas_tepat_waktu': s.batas_tepat_waktu.strftime('%H:%M') if s.batas_tepat_waktu else None,
                            'catatan': rec.catatan,
                            'sumber': rec.sumber,
                            'shift_master_id': sm.id if sm else None,
                            'shift_master_kode': sm.kode if sm else None,
                            'shift_master_nama': sm.nama if sm else None,
                            'koreksi_id': kor.id if kor else None,
                            'jenis_koreksi': kor.jenis if kor else None,
                            'jenis_koreksi_label': kor.get_jenis_display() if kor else None,
                            'alasan': kor.alasan if kor else '',
                        }
                else:
                    row_shifts[str(d)] = None

            pegawai_rows.append({
                'id': p.id,
                'nama': p.nama,
                'pin': p.pin,
                'unit_kerja': p.unit_kerja or '-',
                'jabatan': p.jabatan or '-',
                'kategori': p.kategori,
                'kelompok': kelompok_p,
                'shifts': row_shifts,
                'stats': {
                    'total_kerja': total_kerja,
                    'total_libur': total_libur,
                    'total_koreksi': total_koreksi_row,
                    'shift_counts': shift_counts,
                }
            })

        return Response({
            'bulan': bulan,
            'tahun': tahun,
            'mode': mode,
            'total_days': total_days,
            'days': days_meta,
            'pegawai_rows': pegawai_rows,
            'summary': {
                'total_pegawai': len(pegawai_rows),
                'total_assignments': grand_total_assignments,
                'total_koreksi': grand_total_koreksi,
            }
        })

    @action(detail=False, methods=['post'])
    def update_cell(self, request):
        """
        Update / create jadwal untuk 1 sel (pegawai + tanggal).
        Body: { pegawai_id, tanggal: 'YYYY-MM-DD', shift_id, catatan (opsional), mode: 'final'|'master', jenis (opsional) }
        - Jika mode == 'master': hanya SDM/Superuser yang boleh mengubah JadwalMaster, lalu rebuild_jadwal_final.
        - Jika mode == 'final' (default): buat/update JadwalKoreksi (jenis='manual' atau sesuai param), lalu rebuild_jadwal_final.
        """
        pegawai_id = request.data.get('pegawai_id')
        tanggal_str = request.data.get('tanggal')
        shift_id = request.data.get('shift_id')
        catatan = request.data.get('catatan', '')
        mode = (request.data.get('mode') or 'final').lower()
        jenis = request.data.get('jenis') or 'manual'

        if not pegawai_id or not tanggal_str or not shift_id:
            return Response(
                {'detail': 'pegawai_id, tanggal, dan shift_id wajib diisi.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            tanggal = datetime.strptime(tanggal_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'detail': 'Format tanggal salah, gunakan YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            pegawai = Pegawai.objects.get(id=pegawai_id)
            shift = Shift.objects.get(id=shift_id)
        except (Pegawai.DoesNotExist, Shift.DoesNotExist) as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        # Validasi kelompok shift harus sesuai kelompok pegawai
        try:
            validate_shift_for_pegawai(pegawai, shift)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if mode == 'master':
            if not has_sdm_access(request.user):
                raise PermissionDenied('Hanya staf SDM / Superuser yang dapat mengubah Jadwal Master.')
            jm, _ = JadwalMaster.objects.update_or_create(
                pegawai=pegawai,
                tanggal=tanggal,
                defaults={
                    'shift': shift,
                    'catatan': catatan,
                    'created_by': request.user,
                }
            )
            rebuild_jadwal_final(pegawai_ids=[pegawai.id], start=tanggal, end=tanggal)
            return Response(JadwalMasterSerializer(jm).data, status=status.HTTP_200_OK)
        else:
            valid_jenis = {c[0] for c in JadwalKoreksi.JENIS_CHOICES}
            if jenis not in valid_jenis:
                jenis = 'manual'
            JadwalKoreksi.objects.update_or_create(
                pegawai=pegawai,
                tanggal=tanggal,
                defaults={
                    'shift': shift,
                    'jenis': jenis,
                    'alasan': catatan or 'Koreksi Manual Roster',
                    'created_by': request.user,
                }
            )
            rebuild_jadwal_final(pegawai_ids=[pegawai.id], start=tanggal, end=tanggal)
            jadwal = JadwalDinas.objects.select_related('shift', 'shift_master', 'koreksi').filter(
                pegawai=pegawai, tanggal=tanggal
            ).first()
            if jadwal:
                return Response(JadwalDinasSerializer(jadwal).data, status=status.HTTP_200_OK)
            return Response({'detail': 'Jadwal berhasil diperbarui.'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def reset_cell(self, request):
        """
        Reset sel jadwal dinas kembali ke Jadwal Master dengan menghapus JadwalKoreksi pada tanggal tersebut.
        Body: { pegawai_id, tanggal: 'YYYY-MM-DD' }
        """
        pegawai_id = request.data.get('pegawai_id')
        tanggal_str = request.data.get('tanggal')

        if not pegawai_id or not tanggal_str:
            return Response(
                {'detail': 'pegawai_id dan tanggal wajib diisi.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            tanggal = datetime.strptime(tanggal_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'detail': 'Format tanggal salah, gunakan YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        deleted_count, _ = JadwalKoreksi.objects.filter(
            pegawai_id=pegawai_id,
            tanggal=tanggal
        ).delete()

        rebuild_jadwal_final(pegawai_ids=[int(pegawai_id)], start=tanggal, end=tanggal)
        jadwal = JadwalDinas.objects.select_related('shift', 'shift_master', 'koreksi').filter(
            pegawai_id=pegawai_id, tanggal=tanggal
        ).first()

        return Response({
            'detail': 'Sel berhasil di-reset ke Jadwal Master.',
            'deleted_koreksi': deleted_count,
            'jadwal': JadwalDinasSerializer(jadwal).data if jadwal else None,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def copy_month(self, request):
        """
        Salin Jadwal Master dari satu bulan ke bulan lain, lalu rebuild JadwalDinas untuk bulan tujuan.
        Body: { from_bulan, from_tahun, to_bulan, to_tahun, unit (opsional), overwrite (bool) }
        """
        from_bulan = int(request.data.get('from_bulan', 0))
        from_tahun = int(request.data.get('from_tahun', 0))
        to_bulan = int(request.data.get('to_bulan', 0))
        to_tahun = int(request.data.get('to_tahun', 0))
        unit = request.data.get('unit')
        overwrite = bool(request.data.get('overwrite', False))

        if not (1 <= from_bulan <= 12 and 1 <= to_bulan <= 12 and from_tahun > 2000 and to_tahun > 2000):
            return Response({'detail': 'Parameter bulan dan tahun tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)

        _, src_days = calendar.monthrange(from_tahun, from_bulan)
        _, dst_days = calendar.monthrange(to_tahun, to_bulan)
        max_copy_day = min(src_days, dst_days)

        src_qs = JadwalMaster.objects.filter(tanggal__year=from_tahun, tanggal__month=from_bulan)
        if unit:
            src_qs = src_qs.filter(pegawai__unit_kerja__icontains=unit)

        src_list = list(src_qs)
        if not src_list:
            return Response(
                {'detail': f'Tidak ada Jadwal Master ditemukan pada bulan {from_bulan}/{from_tahun}.'},
                status=status.HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            if overwrite:
                dst_del_qs = JadwalMaster.objects.filter(tanggal__year=to_tahun, tanggal__month=to_bulan)
                if unit:
                    dst_del_qs = dst_del_qs.filter(pegawai__unit_kerja__icontains=unit)
                dst_del_qs.delete()

            existing_dst = set(
                JadwalMaster.objects.filter(
                    tanggal__year=to_tahun,
                    tanggal__month=to_bulan
                ).values_list('pegawai_id', 'tanggal')
            )

            new_items = []
            affected_pegawai_ids = set()
            for item in src_list:
                day_num = item.tanggal.day
                if day_num > max_copy_day:
                    continue
                new_date = date(to_tahun, to_bulan, day_num)
                if (item.pegawai_id, new_date) in existing_dst:
                    continue

                affected_pegawai_ids.add(item.pegawai_id)
                new_items.append(
                    JadwalMaster(
                        pegawai_id=item.pegawai_id,
                        tanggal=new_date,
                        shift_id=item.shift_id,
                        catatan=f'Salinan Master dari {from_bulan}/{from_tahun}',
                        created_by=request.user
                    )
                )

            if new_items:
                JadwalMaster.objects.bulk_create(new_items, batch_size=1000)

            dst_start = date(to_tahun, to_bulan, 1)
            dst_end = date(to_tahun, to_bulan, dst_days)
            rebuild_jadwal_final(
                pegawai_ids=list(affected_pegawai_ids) if affected_pegawai_ids else None,
                start=dst_start,
                end=dst_end
            )

        return Response({
            'detail': f'Berhasil menyalin {len(new_items)} Jadwal Master ke bulan {to_bulan}/{to_tahun} dan memperbarui Jadwal Final.',
            'copied_count': len(new_items)
        })

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """
        Download Roster Grid Bulanan sebagai Excel (.xlsx) dengan 3 sheet:
        Sheet 1: Jadwal Berjalan (Final)
        Sheet 2: Jadwal Master
        Sheet 3: Daftar Koreksi & Tukar Shift
        """
        today = timezone.localdate()
        try:
            bulan = int(request.query_params.get('bulan', today.month))
            tahun = int(request.query_params.get('tahun', today.year))
        except (ValueError, TypeError):
            bulan = today.month
            tahun = today.year

        unit = request.query_params.get('unit')
        kategori = request.query_params.get('kategori')
        search = request.query_params.get('search')

        # Build both final and master matrix data
        req_params = request.query_params.copy()
        req_params['mode'] = 'final'
        request._request.GET = req_params
        final_data = self.matrix(request).data

        req_params['mode'] = 'master'
        request._request.GET = req_params
        master_data = self.matrix(request).data

        wb = openpyxl.Workbook()
        font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        fill_header = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        fill_sunday = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
        fill_koreksi = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
        font_sunday = Font(name="Calibri", size=9, bold=True, color="DC2626")
        border_all = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        def populate_roster_sheet(ws, sheet_title, m_data, highlight_koreksi=False):
            ws.views.sheetView[0].showGridLines = True
            ws.merge_cells("A1:G1")
            ws["A1"] = f"{sheet_title} - {m_data['bulan']} / {m_data['tahun']}"
            ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")

            ws.cell(row=3, column=1, value="No").alignment = Alignment(horizontal="center", vertical="center")
            ws.cell(row=3, column=2, value="PIN").alignment = Alignment(horizontal="center", vertical="center")
            ws.cell(row=3, column=3, value="Nama Pegawai").alignment = Alignment(horizontal="left", vertical="center")
            ws.cell(row=3, column=4, value="Unit Kerja").alignment = Alignment(horizontal="left", vertical="center")
            ws.cell(row=3, column=5, value="Jabatan").alignment = Alignment(horizontal="left", vertical="center")

            col_offset = 6
            for d in m_data['days']:
                col = col_offset + d['day'] - 1
                cell = ws.cell(row=3, column=col, value=d['day'])
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if d['is_sunday']:
                    cell.fill = fill_sunday
                    cell.font = font_sunday
                else:
                    cell.fill = fill_header
                    cell.font = font_header

            ws.cell(row=3, column=col_offset + m_data['total_days'], value="Kerja").alignment = Alignment(horizontal="center")
            ws.cell(row=3, column=col_offset + m_data['total_days'] + 1, value="Libur").alignment = Alignment(horizontal="center")

            for c in range(1, 6):
                cell = ws.cell(row=3, column=c)
                cell.fill = fill_header
                cell.font = font_header

            row_idx = 4
            for idx, p in enumerate(m_data['pegawai_rows'], 1):
                ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=2, value=p['pin'] or "-").alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=3, value=p['nama'])
                ws.cell(row=row_idx, column=4, value=p['unit_kerja'])
                ws.cell(row=row_idx, column=5, value=p['jabatan'])

                for d in m_data['days']:
                    col = col_offset + d['day'] - 1
                    shift_info = p['shifts'].get(str(d['day']))
                    cell = ws.cell(row=row_idx, column=col)
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.border = border_all
                    if shift_info:
                        cell.value = shift_info['kode']
                        if highlight_koreksi and shift_info.get('sumber') == 'koreksi':
                            cell.fill = fill_koreksi
                        if shift_info['is_libur']:
                            cell.font = Font(name="Calibri", size=9, bold=True, color="64748B")
                        else:
                            cell.font = Font(name="Calibri", size=9, bold=True, color="1E293B")
                    else:
                        cell.value = "-"

                ws.cell(row=row_idx, column=col_offset + m_data['total_days'], value=p['stats']['total_kerja']).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=col_offset + m_data['total_days'] + 1, value=p['stats']['total_libur']).alignment = Alignment(horizontal="center")

                for c in range(1, col_offset + m_data['total_days'] + 2):
                    ws.cell(row=row_idx, column=c).border = border_all
                row_idx += 1

            ws.column_dimensions['A'].width = 5
            ws.column_dimensions['B'].width = 8
            ws.column_dimensions['C'].width = 28
            ws.column_dimensions['D'].width = 18
            ws.column_dimensions['E'].width = 18
            for d in range(1, m_data['total_days'] + 3):
                col_letter = get_column_letter(col_offset + d - 1)
                ws.column_dimensions[col_letter].width = 4.5

        ws_final = wb.active
        ws_final.title = f"Jadwal Final {bulan}-{tahun}"
        populate_roster_sheet(ws_final, "JADWAL DINAS BERJALAN (FINAL)", final_data, highlight_koreksi=True)

        ws_master = wb.create_sheet(title=f"Jadwal Master {bulan}-{tahun}")
        populate_roster_sheet(ws_master, "JADWAL DINAS DASAR (MASTER)", master_data, highlight_koreksi=False)

        ws_kor = wb.create_sheet(title=f"Daftar Koreksi {bulan}-{tahun}")
        ws_kor.merge_cells("A1:G1")
        ws_kor["A1"] = f"DAFTAR KOREKSI & TUKAR SHIFT - {bulan} / {tahun}"
        ws_kor["A1"].font = Font(name="Calibri", size=14, bold=True, color="1E3A8A")

        kor_headers = ["No", "Tanggal", "PIN", "Nama Pegawai", "Unit Kerja", "Shift Baru", "Jenis Koreksi", "Alasan / Keterangan"]
        for c_idx, h in enumerate(kor_headers, 1):
            c = ws_kor.cell(row=3, column=c_idx, value=h)
            c.fill = fill_header
            c.font = font_header
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = border_all

        kor_qs = JadwalKoreksi.objects.filter(
            tanggal__year=tahun,
            tanggal__month=bulan
        ).select_related('pegawai', 'shift').order_by('tanggal', 'pegawai__nama')
        if unit:
            kor_qs = kor_qs.filter(pegawai__unit_kerja__icontains=unit)
        if kategori:
            kor_qs = kor_qs.filter(pegawai__kategori=kategori)
        if search:
            kor_qs = kor_qs.filter(Q(pegawai__nama__icontains=search) | Q(pegawai__pin__icontains=search))

        for idx, k in enumerate(kor_qs, 1):
            r = idx + 3
            ws_kor.cell(row=r, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws_kor.cell(row=r, column=2, value=k.tanggal.strftime('%Y-%m-%d')).alignment = Alignment(horizontal="center")
            ws_kor.cell(row=r, column=3, value=k.pegawai.pin or "-").alignment = Alignment(horizontal="center")
            ws_kor.cell(row=r, column=4, value=k.pegawai.nama)
            ws_kor.cell(row=r, column=5, value=k.pegawai.unit_kerja or "-")
            ws_kor.cell(row=r, column=6, value=k.shift.kode).alignment = Alignment(horizontal="center")
            ws_kor.cell(row=r, column=7, value=k.get_jenis_display()).alignment = Alignment(horizontal="center")
            ws_kor.cell(row=r, column=8, value=k.alasan or "-")
            for c_idx in range(1, 9):
                ws_kor.cell(row=r, column=c_idx).border = border_all

        for c_idx, w in enumerate([5, 14, 10, 28, 20, 12, 18, 32], 1):
            ws_kor.column_dimensions[get_column_letter(c_idx)].width = w

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="Roster_SDM_{bulan}_{tahun}.xlsx"'
        wb.save(response)
        return response


class TukarDinasViewSet(viewsets.ModelViewSet):
    """
    ViewSet Pengajuan & Verifikasi Tukar Dinas Staf Rumah Sakit.
    Saat disetujui, menulis ke JadwalKoreksi dan memanggil rebuild_jadwal_final (tidak pernah menimpa JadwalMaster).
    """
    queryset = TukarDinas.objects.select_related(
        'pemohon', 'pengganti',
        'shift_asal_pemohon', 'shift_tujuan_pemohon',
        'shift_asal_pengganti', 'shift_tujuan_pengganti',
        'disetujui_oleh'
    ).all()
    serializer_class = TukarDinasSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        bulan = self.request.query_params.get('bulan')
        tahun = self.request.query_params.get('tahun')
        pemohon_id = self.request.query_params.get('pemohon_id')
        pengganti_id = self.request.query_params.get('pengganti_id')
        unit = self.request.query_params.get('unit')
        search = self.request.query_params.get('search')

        if status_param:
            qs = qs.filter(status=status_param)
        if bulan:
            qs = qs.filter(tanggal_pemohon__month=bulan)
        if tahun:
            qs = qs.filter(tanggal_pemohon__year=tahun)
        if pemohon_id:
            qs = qs.filter(pemohon_id=pemohon_id)
        if pengganti_id:
            qs = qs.filter(pengganti_id=pengganti_id)
        if unit:
            qs = qs.filter(Q(pemohon__unit_kerja__icontains=unit) | Q(pengganti__unit_kerja__icontains=unit))
        if search:
            qs = qs.filter(
                Q(pemohon__nama__icontains=search) |
                Q(pengganti__nama__icontains=search) |
                Q(alasan__icontains=search)
            )

        return qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        pemohon = data.get('pemohon')
        tanggal_pemohon = data.get('tanggal_pemohon')
        shift_tujuan_pemohon = data.get('shift_tujuan_pemohon')
        pengganti = data.get('pengganti')
        tanggal_pengganti = data.get('tanggal_pengganti') or tanggal_pemohon
        shift_tujuan_pengganti = data.get('shift_tujuan_pengganti')

        # Validasi kesesuaian kelompok shift
        try:
            if pemohon and shift_tujuan_pemohon:
                validate_shift_for_pegawai(pemohon, shift_tujuan_pemohon)
            if pengganti and shift_tujuan_pengganti:
                validate_shift_for_pegawai(pengganti, shift_tujuan_pengganti)
        except ValueError as e:
            raise ValidationError({'detail': str(e)})

        if not data.get('shift_asal_pemohon'):
            j1 = (
                JadwalMaster.objects.filter(pegawai=pemohon, tanggal=tanggal_pemohon).first() or
                JadwalDinas.objects.filter(pegawai=pemohon, tanggal=tanggal_pemohon).first()
            )
            if j1:
                data['shift_asal_pemohon'] = j1.shift
        if pengganti and not data.get('shift_asal_pengganti'):
            j2 = (
                JadwalMaster.objects.filter(pegawai=pengganti, tanggal=tanggal_pengganti).first() or
                JadwalDinas.objects.filter(pegawai=pengganti, tanggal=tanggal_pengganti).first()
            )
            if j2:
                data['shift_asal_pengganti'] = j2.shift

        serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Verifikasi & setujui tukar dinas oleh Karu / SDM.
        Secara atomik menyimpan JadwalKoreksi untuk pemohon & pengganti, lalu memanggil rebuild_jadwal_final.
        """
        tukar = self.get_object()
        if tukar.status == 'disetujui':
            return Response({'detail': 'Pengajuan ini sudah disetujui sebelumnya.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if tukar.pemohon and tukar.shift_tujuan_pemohon:
                validate_shift_for_pegawai(tukar.pemohon, tukar.shift_tujuan_pemohon)
            if tukar.pengganti and tukar.shift_tujuan_pengganti:
                validate_shift_for_pegawai(tukar.pengganti, tukar.shift_tujuan_pengganti)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        catatan = request.data.get('catatan_atasan', '')
        jenis_kor = tukar.jenis if tukar.jenis in ('tukar_shift', 'tukar_hari', 'ganti_jaga') else 'tukar_shift'

        with transaction.atomic():
            tukar.status = 'disetujui'
            tukar.disetujui_oleh = request.user
            tukar.disetujui_at = timezone.now()
            if catatan:
                tukar.catatan_atasan = catatan
            tukar.save()

            affected_pegawai = []
            affected_dates = []

            # 1. Buat / Update JadwalKoreksi Pemohon
            if tukar.pemohon and tukar.tanggal_pemohon and tukar.shift_tujuan_pemohon:
                pengganti_str = f" dengan {tukar.pengganti.nama}" if tukar.pengganti else ""
                JadwalKoreksi.objects.update_or_create(
                    pegawai=tukar.pemohon,
                    tanggal=tukar.tanggal_pemohon,
                    defaults={
                        'shift': tukar.shift_tujuan_pemohon,
                        'jenis': jenis_kor,
                        'tukar': tukar,
                        'alasan': tukar.alasan or f"Tukar dinas{pengganti_str}",
                        'created_by': request.user,
                    }
                )
                affected_pegawai.append(tukar.pemohon_id)
                affected_dates.append(tukar.tanggal_pemohon)

            # 2. Buat / Update JadwalKoreksi Pengganti
            tgl_pengganti = tukar.tanggal_pengganti or tukar.tanggal_pemohon
            if tukar.pengganti and tgl_pengganti and tukar.shift_tujuan_pengganti:
                pemohon_str = f" dengan {tukar.pemohon.nama}"
                JadwalKoreksi.objects.update_or_create(
                    pegawai=tukar.pengganti,
                    tanggal=tgl_pengganti,
                    defaults={
                        'shift': tukar.shift_tujuan_pengganti,
                        'jenis': jenis_kor,
                        'tukar': tukar,
                        'alasan': tukar.alasan or f"Tukar dinas{pemohon_str}",
                        'created_by': request.user,
                    }
                )
                affected_pegawai.append(tukar.pengganti_id)
                affected_dates.append(tgl_pengganti)

            if affected_pegawai and affected_dates:
                rebuild_jadwal_final(
                    pegawai_ids=list(set(affected_pegawai)),
                    start=min(affected_dates),
                    end=max(affected_dates),
                )

        serializer = self.get_serializer(tukar)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Tolak pengajuan tukar dinas dan hapus JadwalKoreksi terkait (jika ada), lalu rebuild JadwalDinas.
        """
        tukar = self.get_object()
        catatan = request.data.get('catatan_atasan', '')

        with transaction.atomic():
            affected_kor = list(JadwalKoreksi.objects.filter(tukar=tukar).values_list('pegawai_id', 'tanggal'))
            JadwalKoreksi.objects.filter(tukar=tukar).delete()

            tukar.status = 'ditolak'
            tukar.disetujui_oleh = request.user
            tukar.disetujui_at = timezone.now()
            tukar.catatan_atasan = catatan
            tukar.save()

            if affected_kor:
                p_ids = list({p for p, _ in affected_kor})
                dates = [d for _, d in affected_kor]
                rebuild_jadwal_final(pegawai_ids=p_ids, start=min(dates), end=max(dates))

        serializer = self.get_serializer(tukar)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Batalkan tukar dinas (termasuk yang sudah disetujui), hapus JadwalKoreksi terkait,
        dan kembalikan JadwalDinas ke JadwalMaster via rebuild_jadwal_final.
        """
        tukar = self.get_object()
        catatan = request.data.get('catatan_atasan', '')

        with transaction.atomic():
            affected_kor = list(JadwalKoreksi.objects.filter(tukar=tukar).values_list('pegawai_id', 'tanggal'))
            JadwalKoreksi.objects.filter(tukar=tukar).delete()

            tukar.status = 'dibatalkan'
            if catatan:
                tukar.catatan_atasan = catatan
            tukar.save()

            p_ids = [ p for p, _ in affected_kor ]
            dates = [ d for _, d in affected_kor ]
            if tukar.pemohon_id:
                p_ids.append(tukar.pemohon_id)
            if tukar.pengganti_id:
                p_ids.append(tukar.pengganti_id)
            if tukar.tanggal_pemohon:
                dates.append(tukar.tanggal_pemohon)
            if tukar.tanggal_pengganti:
                dates.append(tukar.tanggal_pengganti)

            if p_ids and dates:
                rebuild_jadwal_final(pegawai_ids=list(set(p_ids)), start=min(dates), end=max(dates))

        serializer = self.get_serializer(tukar)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def summary_stats(self, request):
        """
        Statistik ringkasan pengajuan tukar dinas.
        """
        bulan = request.query_params.get('bulan', timezone.localdate().month)
        tahun = request.query_params.get('tahun', timezone.localdate().year)

        qs = self.get_queryset()
        if bulan:
            qs = qs.filter(tanggal_pemohon__month=bulan)
        if tahun:
            qs = qs.filter(tanggal_pemohon__year=tahun)

        return Response({
            'total': qs.count(),
            'menunggu_atasan': qs.filter(status='menunggu_atasan').count(),
            'menunggu_rekan': qs.filter(status='menunggu_rekan').count(),
            'disetujui': qs.filter(status='disetujui').count(),
            'ditolak': qs.filter(status='ditolak').count(),
            'dibatalkan': qs.filter(status='dibatalkan').count(),
        })


class JadwalKoreksiViewSet(viewsets.ModelViewSet):
    """
    ViewSet CRUD Koreksi Jadwal Dinas (Tukar Shift, Izin, Sakit, Cuti, Koreksi Manual).
    Setiap create/update/delete otomatis memvalidasi kelompok shift dan memicu rebuild_jadwal_final.
    """
    queryset = JadwalKoreksi.objects.select_related('pegawai', 'shift', 'tukar', 'created_by').all()
    serializer_class = JadwalKoreksiSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        pegawai_id = self.request.query_params.get('pegawai_id')
        bulan = self.request.query_params.get('bulan')
        tahun = self.request.query_params.get('tahun')
        jenis = self.request.query_params.get('jenis')
        unit = self.request.query_params.get('unit')
        search = self.request.query_params.get('search')

        if pegawai_id:
            qs = qs.filter(pegawai_id=pegawai_id)
        if bulan:
            qs = qs.filter(tanggal__month=bulan)
        if tahun:
            qs = qs.filter(tanggal__year=tahun)
        if jenis:
            qs = qs.filter(jenis=jenis)
        if unit:
            qs = qs.filter(pegawai__unit_kerja__icontains=unit)
        if search:
            qs = qs.filter(
                Q(pegawai__nama__icontains=search) |
                Q(pegawai__pin__icontains=search) |
                Q(shift__kode__icontains=search) |
                Q(alasan__icontains=search)
            )
        return qs.order_by('-tanggal', 'pegawai__nama')

    def create(self, request, *args, **kwargs):
        """
        Upsert JadwalKoreksi berdasarkan (pegawai, tanggal), validasi kelompok shift, lalu rebuild_jadwal_final.
        """
        pegawai_id = request.data.get('pegawai')
        tanggal_str = request.data.get('tanggal')
        shift_id = request.data.get('shift')
        jenis = request.data.get('jenis') or 'manual'
        alasan = request.data.get('alasan', '')

        if not pegawai_id or not tanggal_str or not shift_id:
            return Response(
                {'detail': 'pegawai, tanggal, dan shift wajib diisi.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            tanggal = datetime.strptime(str(tanggal_str), '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Format tanggal harus YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pegawai = Pegawai.objects.get(id=pegawai_id)
            shift = Shift.objects.get(id=shift_id)
        except (Pegawai.DoesNotExist, Shift.DoesNotExist) as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            validate_shift_for_pegawai(pegawai, shift)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        kor, created = JadwalKoreksi.objects.update_or_create(
            pegawai=pegawai,
            tanggal=tanggal,
            defaults={
                'shift': shift,
                'jenis': jenis,
                'alasan': alasan,
                'created_by': request.user,
            }
        )
        rebuild_jadwal_final(pegawai_ids=[pegawai.id], start=tanggal, end=tanggal)
        return Response(
            self.get_serializer(kor).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def perform_update(self, serializer):
        pegawai = serializer.validated_data.get('pegawai', serializer.instance.pegawai)
        shift = serializer.validated_data.get('shift', serializer.instance.shift)
        try:
            validate_shift_for_pegawai(pegawai, shift)
        except ValueError as e:
            raise ValidationError({'detail': str(e)})
        instance = serializer.save()
        rebuild_jadwal_final(pegawai_ids=[instance.pegawai_id], start=instance.tanggal, end=instance.tanggal)

    def perform_destroy(self, instance):
        p_id = instance.pegawai_id
        tgl = instance.tanggal
        instance.delete()
        rebuild_jadwal_final(pegawai_ids=[p_id], start=tgl, end=tgl)



