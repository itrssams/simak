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