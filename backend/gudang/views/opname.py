from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.exceptions import ValidationError

from gudang.models import StockOpname, StockOpnameItem, Barang, StokSaldo, Gudang
from gudang.serializers.opname import StockOpnameSerializer
from gudang.services.opname import OpnameService
from gudang.views.master import StandardResultsSetPagination


class StockOpnameViewSet(viewsets.ModelViewSet):
    serializer_class = StockOpnameSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nomor', 'catatan']
    ordering_fields = ['tanggal', 'nomor', 'created_at']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = StockOpname.objects.select_related('gudang', 'created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar'
        ).all()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        jenis_param = self.request.query_params.get('jenis')
        if jenis_param:
            qs = qs.filter(jenis=jenis_param)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        tanggal = data.get('tanggal')
        jenis = data.get('jenis', StockOpname.JENIS_SALDO_AWAL)
        catatan = data.get('catatan', '')
        items = data.get('items', [])
        auto_approve = bool(data.get('auto_approve', False))

        if not items:
            return Response({'error': 'Minimal 1 item barang harus dimasukkan untuk opname.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            opname = OpnameService.create_opname(
                tanggal=tanggal,
                items_data=items,
                jenis=jenis,
                user=request.user,
                catatan=catatan
            )
            if auto_approve:
                opname = OpnameService.approve_opname(opname, user=request.user)

            serializer = self.get_serializer(opname)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal membuat dokumen opname: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        opname = self.get_object()
        try:
            opname = OpnameService.approve_opname(opname, user=request.user)
            return Response(self.get_serializer(opname).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal menyetujui opname: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        opname = self.get_object()
        alasan = request.data.get('alasan', '')
        try:
            opname = OpnameService.cancel_opname(opname, user=request.user, alasan=alasan)
            return Response(self.get_serializer(opname).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def current_stock_template(self, request):
        """
        Mengembalikan daftar semua barang aktif beserta saldo stok sistem saat ini
        sebagai template input fisik opname massal.
        """
        gudang = Gudang.get_default()
        barang_qs = Barang.objects.filter(is_active=True).select_related('satuan_dasar', 'golongan').order_by('kode')

        saldo_map = {
            s.barang_id: s for s in StokSaldo.objects.filter(gudang=gudang)
        }

        template_items = []
        for b in barang_qs:
            s = saldo_map.get(b.id)
            qty_sistem = float(s.qty) if s else 0.0
            avg_cost = float(s.avg_cost) if s else 0.0

            template_items.append({
                'barang_id': b.id,
                'barang_kode': b.kode,
                'barang_nama': b.nama,
                'golongan_nama': b.golongan.nama if b.golongan else '-',
                'satuan': b.satuan_dasar.kode if b.satuan_dasar else 'PCS',
                'qty_sistem': qty_sistem,
                'qty_fisik': qty_sistem,  # Default fisik = sistem
                'harga_unit': avg_cost,
                'keterangan': ''
            })

        return Response(template_items)

