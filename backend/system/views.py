from .audit import can_view_audit
from keuangan.views import OptionalPaginationMixin
from .models import AuditLog, Announcement, AnnouncementRead
from .serializers import AuditLogSerializer, AnnouncementSerializer
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

from rest_framework.permissions import BasePermission, SAFE_METHODS, IsAuthenticated
from keuangan.views import is_manajer_or_above
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

# ── System Maintenance & Backup ViewSet (Superuser Only) ───
import shutil
import subprocess
import gzip
from pathlib import Path
from rest_framework.permissions import IsAdminUser

BACKUP_DIR = Path(settings.BASE_DIR) / 'backups'
BACKUP_DIR.mkdir(exist_ok=True)

class SystemMaintenanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminUser]

    @action(detail=False, methods=['get'], url_path='health')
    def health(self, request):
        simak_status = 'offline'
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                simak_status = 'online'
        except Exception as e:
            simak_status = f'error: {str(e)}'

        rssams_status = 'offline'
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute('SELECT 1 FROM rssams.regpasien LIMIT 1')
                rssams_status = 'online'
        except Exception:
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT 1')
                    rssams_status = 'online'
            except Exception as e:
                rssams_status = f'error: {str(e)}'

        try:
            usage = shutil.disk_usage(settings.BASE_DIR)
            total_gb = round(usage.total / (1024 ** 3), 2)
            used_gb = round(usage.used / (1024 ** 3), 2)
            free_gb = round(usage.free / (1024 ** 3), 2)
            used_percent = round((usage.used / usage.total) * 100, 1)
        except Exception:
            total_gb, used_gb, free_gb, used_percent = 0, 0, 0, 0

        import sys, platform, django
        mysql_version = '-'
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT VERSION()')
                mysql_version = cursor.fetchone()[0]
        except Exception:
            pass

        return Response({
            'simak_status': simak_status,
            'rssams_status': rssams_status,
            'disk_space': {
                'total_gb': total_gb,
                'used_gb': used_gb,
                'free_gb': free_gb,
                'used_percent': used_percent,
            },
            'system_info': {
                'python_version': sys.version.split()[0],
                'django_version': django.get_version(),
                'platform': platform.system(),
                'mysql_version': mysql_version,
                'server_time': timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
            }
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='backups')
    def list_backups(self, request):
        backups = []
        if BACKUP_DIR.exists():
            for f in sorted(BACKUP_DIR.glob('*.sql*'), key=os.path.getmtime, reverse=True):
                stat = f.stat()
                size_mb = round(stat.st_size / (1024 * 1024), 2)
                created_at = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                db_target = 'rssams' if 'rssams' in f.name else 'simak'
                backups.append({
                    'filename': f.name,
                    'database': db_target,
                    'size_mb': size_mb,
                    'size_formatted': f"{size_mb} MB" if size_mb >= 0.1 else f"{round(stat.st_size/1024, 1)} KB",
                    'created_at': created_at,
                })
        return Response(backups, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='create-backup')
    def create_backup(self, request):
        db_target = (request.data.get('database') or 'simak').strip().lower()
        if db_target not in ['simak', 'rssams']:
            db_target = 'simak'

        ts = timezone.now().strftime('%Y%m%d_%H%M%S')
        filename = f"backup_{db_target}_{ts}.sql.gz"
        filepath = BACKUP_DIR / filename

        db_settings = settings.DATABASES.get('default', {})
        host = db_settings.get('HOST', 'localhost')
        port = str(db_settings.get('PORT', '3306'))
        user = db_settings.get('USER', 'root')
        password = db_settings.get('PASSWORD', '')
        actual_db_name = 'simak' if db_target == 'simak' else 'rssams'

        mysqldump_bin = (
            shutil.which('mysqldump')
            or (r'C:\xampp\mysql\bin\mysqldump.exe' if os.path.exists(r'C:\xampp\mysql\bin\mysqldump.exe') else None)
        )

        dump_success = False
        if mysqldump_bin:
            try:
                cmd = [mysqldump_bin, f"-h{host}", f"-P{port}", f"-u{user}"]
                if password:
                    cmd.append(f"-p{password}")
                cmd.extend(["--single-transaction", "--quick", "--routines", "--triggers", actual_db_name])

                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                with gzip.open(filepath, 'wb') as gz_out:
                    shutil.copyfileobj(proc.stdout, gz_out)
                proc.wait()
                if proc.returncode == 0 and filepath.stat().st_size > 0:
                    dump_success = True
            except Exception:
                dump_success = False

        if not dump_success:
            try:
                with gzip.open(filepath, 'wt', encoding='utf-8') as gz_out:
                    gz_out.write(f"-- SIMAK BACKUP FOR {actual_db_name.upper()} ({ts})\n")
                    gz_out.write("SET FOREIGN_KEY_CHECKS=0;\n\n")

                    with connection.cursor() as cursor:
                        if db_target == 'rssams':
                            cursor.execute("SHOW TABLES FROM rssams")
                            tables = [r[0] for r in cursor.fetchall()]
                            for tbl in tables:
                                cursor.execute(f"SHOW CREATE TABLE `rssams`.`{tbl}`")
                                create_sql = cursor.fetchall()[0][1]
                                gz_out.write(f"DROP TABLE IF EXISTS `{tbl}`;\n{create_sql};\n\n")
                                cursor.execute(f"SELECT * FROM `rssams`.`{tbl}`")
                                rows = cursor.fetchall()
                                cols = [d[0] for d in cursor.description]
                                if rows:
                                    col_str = ", ".join([f"`{c}`" for c in cols])
                                    for r in rows:
                                        vals = []
                                        for v in r:
                                            if v is None: vals.append('NULL')
                                            elif isinstance(v, (int, float, Decimal)): vals.append(str(v))
                                            else: vals.append("'" + str(v).replace("'", "''").replace("\\", "\\\\") + "'")
                                        gz_out.write(f"INSERT INTO `{tbl}` ({col_str}) VALUES ({', '.join(vals)});\n")
                                    gz_out.write("\n")
                        else:
                            cursor.execute("SHOW TABLES")
                            tables = [r[0] for r in cursor.fetchall()]
                            for tbl in tables:
                                cursor.execute(f"SHOW CREATE TABLE `{tbl}`")
                                create_sql = cursor.fetchall()[0][1]
                                gz_out.write(f"DROP TABLE IF EXISTS `{tbl}`;\n{create_sql};\n\n")
                                cursor.execute(f"SELECT * FROM `{tbl}`")
                                rows = cursor.fetchall()
                                cols = [d[0] for d in cursor.description]
                                if rows:
                                    col_str = ", ".join([f"`{c}`" for c in cols])
                                    for r in rows:
                                        vals = []
                                        for v in r:
                                            if v is None: vals.append('NULL')
                                            elif isinstance(v, (int, float, Decimal)): vals.append(str(v))
                                            else: vals.append("'" + str(v).replace("'", "''").replace("\\", "\\\\") + "'")
                                        gz_out.write(f"INSERT INTO `{tbl}` ({col_str}) VALUES ({', '.join(vals)});\n")
                                    gz_out.write("\n")
                    gz_out.write("SET FOREIGN_KEY_CHECKS=1;\n")
                dump_success = True
            except Exception as e:
                if filepath.exists():
                    filepath.unlink()
                return Response({'error': f'Gagal membuat backup database: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        size_mb = round(filepath.stat().st_size / (1024 * 1024), 2)
        return Response({
            'message': f"Backup database {db_target.upper()} berhasil dibuat.",
            'filename': filename,
            'size_mb': size_mb,
            'size_formatted': f"{size_mb} MB" if size_mb >= 0.1 else f"{round(filepath.stat().st_size/1024, 1)} KB",
            'created_at': timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='download-backup')
    def download_backup(self, request):
        filename = request.query_params.get('filename')
        if not filename:
            return Response({'error': 'Nama file (filename) wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        safe_filename = os.path.basename(filename)
        filepath = BACKUP_DIR / safe_filename

        if not filepath.exists() or not filepath.is_file():
            raise Http404("File backup tidak ditemukan.")

        response = FileResponse(open(filepath, 'rb'), content_type='application/gzip')
        response['Content-Disposition'] = f'attachment; filename="{safe_filename}"'
        return response

    @action(detail=False, methods=['post'], url_path='delete-backup')
    def delete_backup(self, request):
        filename = request.data.get('filename')
        if not filename:
            return Response({'error': 'Nama file (filename) wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        safe_filename = os.path.basename(filename)
        filepath = BACKUP_DIR / safe_filename

        if filepath.exists() and filepath.is_file():
            filepath.unlink()
            return Response({'message': f'File backup {safe_filename} berhasil dihapus.'}, status=status.HTTP_200_OK)
        return Response({'error': 'File backup tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='optimize-tables')
    def optimize_tables(self, request):
        optimized_count = 0
        try:
            with connection.cursor() as cursor:
                cursor.execute("SHOW TABLES")
                tables = [r[0] for r in cursor.fetchall()]
                for tbl in tables:
                    cursor.execute(f"OPTIMIZE TABLE `{tbl}`")
                    optimized_count += 1
            return Response({'message': f'Berhasil mengoptimasi {optimized_count} tabel database SIMAK.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f'Gagal mengoptimasi tabel: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)