from keuangan.views import is_driver, is_admin_driver, has_driver_access, is_manajer_or_above
from keuangan.views import OptionalPaginationMixin
from .models import Kendaraan, LogPerjalanan, LaporanPerjalanan, FotoLaporanPerjalanan, LogBBM, LogMaintenance
from .serializers import KendaraanSerializer, LogPerjalananSerializer, LogPerjalananInputSerializer, FotoLaporanPerjalananSerializer, LaporanPerjalananSerializer, LaporanPerjalananInputSerializer, LogBBMSerializer, LogBBMInputSerializer, LogMaintenanceSerializer, LogMaintenanceInputSerializer
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
from django.db import connection, transaction, models
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
from datetime import datetime, date, time, timedelta
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from fpdf import FPDF
import os
from django.conf import settings

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