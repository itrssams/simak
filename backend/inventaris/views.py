from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Sum, Count, Q
from django.db.models.deletion import ProtectedError
from .models import InventoryOption, InventoryAsset
from .serializers import InventoryOptionSerializer, InventoryAssetSerializer

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

def is_kepala_seksi_or_above(user):
    if not user.is_authenticated: return False
    if user.is_superuser: return True
    return user.role in ['kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']

class IsInventoryPermission(BasePermission):
    def has_permission(self, request, view):
        return is_kepala_seksi_or_above(request.user)

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
