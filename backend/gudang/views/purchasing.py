from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import connection, transaction
from django.db.models import Q
from django.core.exceptions import ValidationError

from gudang.models import SuratPesanan, SuratPesananItem, Penerimaan, PenerimaanItem, Barang, Vendor
from gudang.serializers.purchasing import (
    SuratPesananSerializer, PenerimaanSerializer
)
from gudang.serializers.master import VendorSerializer
from gudang.services.purchasing import PurchasingService
from gudang.views.master import StandardResultsSetPagination


class SuratPesananViewSet(viewsets.ModelViewSet):
    serializer_class = SuratPesananSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nomor', 'vendor_nama', 'catatan']
    ordering_fields = ['tanggal', 'nomor', 'total_nilai', 'created_at']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = SuratPesanan.objects.select_related('created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar',
            'penerimaan_list__created_by'
        ).all()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        tanggal = data.get('tanggal')
        vendor_nama = data.get('vendor_nama')
        vendor_id = data.get('vendor_id')
        catatan = data.get('catatan', '')
        items = data.get('items', [])

        if not tanggal or not vendor_nama:
            return Response({'error': 'Tanggal dan Rekanan/Vendor wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({'error': 'Minimal 1 item barang harus dimasukkan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            po = PurchasingService.create_po(
                tanggal=tanggal,
                vendor_nama=vendor_nama,
                items_data=items,
                user=request.user,
                vendor_id=vendor_id,
                catatan=catatan
            )
            serializer = self.get_serializer(po)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        po = self.get_object()
        try:
            po = PurchasingService.submit_po(po, request.user)
            return Response(self.get_serializer(po).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        po = self.get_object()
        try:
            po = PurchasingService.approve_po(po, request.user)
            return Response(self.get_serializer(po).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        po = self.get_object()
        catatan_tolak = request.data.get('catatan_tolak', '')
        try:
            po = PurchasingService.reject_po(po, request.user, catatan_tolak)
            return Response(self.get_serializer(po).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def batal(self, request, pk=None):
        po = self.get_object()
        alasan = request.data.get('alasan_batal', '')
        if po.status == SuratPesanan.STATUS_SELESAI:
            return Response({'error': 'PO yang sudah selesai (GRN) tidak dapat dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
        po.status = SuratPesanan.STATUS_BATAL
        po.alasan_batal = alasan
        po.save(update_fields=['status', 'alasan_batal', 'updated_at'])
        return Response(self.get_serializer(po).data)

    @action(detail=True, methods=['post'])
    def close_po(self, request, pk=None):
        """Menutup SPB / PO secara manual menjadi SELESAI (hangus sisa)"""
        po = self.get_object()
        if po.status not in [SuratPesanan.STATUS_DISETUJUI, SuratPesanan.STATUS_DRAFT]:
            return Response({'error': f'Surat Pesanan dengan status {po.status} tidak dapat ditutup.'}, status=status.HTTP_400_BAD_REQUEST)
        po.status = SuratPesanan.STATUS_SELESAI
        po.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(po).data)

    def destroy(self, request, *args, **kwargs):
        po = self.get_object()
        if po.status == SuratPesanan.STATUS_SELESAI or po.penerimaan_list.filter(status=Penerimaan.STATUS_DISETUJUI).exists():
            return Response({'error': 'PO tidak dapat dihapus karena sudah memiliki transaksi penerimaan (GRN) yang disetujui atau sudah berstatus selesai.'}, status=status.HTTP_400_BAD_REQUEST)

        if po.penerimaan_list.exists():
            return Response({'error': 'PO tidak dapat dihapus karena masih memiliki dokumen penerimaan (GRN) terkait.'}, status=status.HTTP_400_BAD_REQUEST)

        user_role = getattr(request.user, 'role', '')
        is_super = request.user.is_superuser or getattr(request.user, 'username', '') == 'super'
        is_approver = user_role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        is_creator = po.created_by_id == request.user.id

        if not (is_super or is_approver or is_creator):
            return Response({'error': 'Hanya pembuat dokumen, Koordinator, atau Superuser yang dapat menghapus PO ini.'}, status=status.HTTP_403_FORBIDDEN)

        if not (is_super or is_approver) and po.status not in [SuratPesanan.STATUS_DRAFT, SuratPesanan.STATUS_DITOLAK]:
            return Response({'error': 'Hanya PO berstatus Draft atau Ditolak yang dapat dihapus.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            po.items.all().delete()
            po.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def approved_options(self, request):
        """Daftar PO yang berstatus DISETUJUI dan belum pernah disetujui penerimaannya"""
        pos = SuratPesanan.objects.filter(
            status=SuratPesanan.STATUS_DISETUJUI
        ).exclude(
            penerimaan_list__status=Penerimaan.STATUS_DISETUJUI
        ).prefetch_related(
            'items__barang__satuan_dasar'
        ).order_by('-tanggal', '-id')[:100]

        results = []
        for po in pos:
            # cek jika ada sisa
            items = []
            has_remaining = False
            for it in po.items.all():
                sisa_dasar = it.qty_dasar - it.qty_diterima
                if sisa_dasar > 0:
                    has_remaining = True
                    sisa_kemasan = sisa_dasar / it.isi if it.isi > 0 else sisa_dasar
                    items.append({
                        'po_item_id': it.id,
                        'barang_id': it.barang_id,
                        'barang_nama': it.barang.nama,
                        'barang_kode': it.barang.kode,
                        'barang_merk': it.barang.merk or '',
                        'kemasan': it.kemasan,
                        'isi': float(it.isi),
                        'sisa_kemasan': float(sisa_kemasan),
                        'sisa_dasar': float(sisa_dasar),
                        'harga_kemasan': float(it.harga_kemasan),
                        'harga_dasar': float(it.harga_dasar),
                        'satuan_dasar': it.barang.satuan_dasar.kode
                    })
            if has_remaining:
                results.append({
                    'id': po.id,
                    'nomor': po.nomor,
                    'tanggal': str(po.tanggal),
                    'vendor_id': po.vendor_id,
                    'vendor_nama': po.vendor_nama,
                    'items': items
                })

        return Response(results)


class PenerimaanViewSet(viewsets.ModelViewSet):
    serializer_class = PenerimaanSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nomor', 'no_faktur', 'vendor_nama', 'catatan']
    ordering_fields = ['tanggal', 'nomor', 'total_nilai', 'created_at']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = Penerimaan.objects.select_related('po', 'gudang', 'created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar'
        ).all()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        tanggal = data.get('tanggal')
        po_id = data.get('po_id')
        no_faktur = data.get('no_faktur', '')
        tgl_jatuh_tempo = data.get('tgl_jatuh_tempo')
        metode_pembayaran = data.get('metode_pembayaran', 'Tunai')
        tutup_po = bool(data.get('tutup_po', True))
        kirim_keuangan = bool(data.get('kirim_keuangan', False))
        catatan = data.get('catatan', '')
        items = data.get('items', [])

        if not po_id:
            return Response({'error': 'Penerimaan barang (GRN) wajib memilih Surat Pesanan (SPB / PO) yang telah disetujui.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            po = SuratPesanan.objects.get(id=po_id)
        except SuratPesanan.DoesNotExist:
            return Response({'error': 'Surat Pesanan (SPB / PO) tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)

        if po.status != SuratPesanan.STATUS_DISETUJUI:
            return Response({'error': 'Hanya Surat Pesanan (SPB / PO) yang berstatus DISETUJUI yang dapat diproses penerimaannya.'}, status=status.HTTP_400_BAD_REQUEST)

        vendor_nama = po.vendor_nama
        vendor_id = po.vendor_id

        if not tanggal:
            return Response({'error': 'Tanggal penerimaan fisik wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({'error': 'Minimal 1 item barang fisik yang diterima harus dimasukkan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            grn = PurchasingService.create_grn(
                tanggal=tanggal,
                vendor_nama=vendor_nama,
                items_data=items,
                user=request.user,
                po=po,
                vendor_id=vendor_id,
                no_faktur=no_faktur,
                tgl_jatuh_tempo=tgl_jatuh_tempo,
                metode_pembayaran=metode_pembayaran,
                tutup_po=tutup_po,
                kirim_keuangan=kirim_keuangan,
                catatan=catatan
            )
            serializer = self.get_serializer(grn)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        grn = self.get_object()
        try:
            grn = PurchasingService.approve_grn(grn, request.user)
            return Response(self.get_serializer(grn).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        grn = self.get_object()
        if grn.status == Penerimaan.STATUS_DISETUJUI:
            return Response({'error': 'Penerimaan barang (GRN) yang telah disetujui tidak dapat dihapus.'}, status=status.HTTP_400_BAD_REQUEST)

        user_role = getattr(request.user, 'role', '')
        is_super = request.user.is_superuser or getattr(request.user, 'username', '') == 'super'
        is_approver = user_role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        is_creator = grn.created_by_id == request.user.id

        if not (is_super or is_approver or is_creator):
            return Response({'error': 'Hanya pembuat dokumen, Koordinator, atau Superuser yang dapat menghapus GRN ini.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            grn.items.all().delete()
            grn.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VendorViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VendorSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Vendor.objects.filter(is_active=True)
        query = self.request.query_params.get('search', '').strip()
        kategori = self.request.query_params.get('kategori', '').strip()

        if query:
            qs = qs.filter(
                Q(nama__icontains=query) |
                Q(kode__icontains=query) |
                Q(telepon__icontains=query) |
                Q(kontak_person__icontains=query) |
                Q(alamat__icontains=query)
            )

        if kategori:
            qs = qs.filter(kategori__iexact=kategori)

        return qs.order_by('nama')

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)

    def perform_destroy(self, instance):
        # Soft delete in simak DB
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
