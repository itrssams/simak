from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Sum, Q
from django.utils import timezone
from .models import (
    ITBackupRecord, ITRepairRequest, ITCredentialNote, ITRemoteAccess, ITSubscription
)
from .serializers import (
    ITBackupRecordSerializer, ITRepairRequestSerializer,
    ITCredentialNoteSerializer, ITCredentialNoteDetailSerializer,
    ITRemoteAccessSerializer, ITRemoteAccessDetailSerializer,
    ITSubscriptionSerializer
)

class OptionalPageNumberPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class OptionalPaginationMixin:
    pagination_class = OptionalPageNumberPagination

    def paginate_queryset(self, queryset):
        if self.paginator and self.request.query_params.get(self.paginator.page_query_param, None) is None:
            return None
        return super().paginate_queryset(queryset)

def is_it(user):
    if not user.is_authenticated: return False
    if user.is_superuser: return True
    return getattr(user, 'is_it', False)

class IsITPermission(BasePermission):
    def has_permission(self, request, view):
        return is_it(request.user)

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
                Q(filename__icontains=search)
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
