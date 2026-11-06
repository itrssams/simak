from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.exceptions import ValidationError

from gudang.models import Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem, Ruang, Barang
from gudang.serializers.distribution import (
    PermintaanSerializer, PengeluaranSerializer
)
from gudang.services.distribution import DistributionService
from gudang.views.master import StandardResultsSetPagination


class PermintaanViewSet(viewsets.ModelViewSet):
    serializer_class = PermintaanSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nomor', 'ruang_nama', 'catatan']
    ordering_fields = ['tanggal', 'nomor', 'created_at']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = Permintaan.objects.select_related('ruang', 'created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar',
            'items__barang__saldo_stok',
            'pengeluaran_list'
        ).all()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        ruang_param = self.request.query_params.get('ruang')
        if ruang_param:
            qs = qs.filter(ruang_id=ruang_param)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        ruang_id = data.get('ruang')
        items = data.get('items', [])
        tanggal = data.get('tanggal')
        catatan = data.get('catatan', '')
        auto_submit = bool(data.get('auto_submit', True))

        if not ruang_id:
            return Response({'error': 'Unit / Ruangan pemohon wajib dipilih.'}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({'error': 'Minimal 1 item barang harus dimasukkan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            req = DistributionService.create_permintaan(
                ruang=ruang_id,
                items_data=items,
                user=request.user,
                tanggal=tanggal,
                catatan=catatan,
                auto_submit=auto_submit
            )
            serializer = self.get_serializer(req)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal membuat permohonan: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        permintaan = self.get_object()
        try:
            permintaan = DistributionService.submit_permintaan(permintaan, user=request.user)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        permintaan = self.get_object()
        user = request.user
        is_kasi_or_above = user.is_superuser or user.username == 'super' or getattr(user, 'role', '') in ['kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        if not is_kasi_or_above:
            return Response({'error': 'Hanya Kepala Seksi (Kasi) ke atas atau Administrator yang berwenang memverifikasi/menyetujui permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

        items_approval = request.data.get('items')
        try:
            permintaan = DistributionService.approve_permintaan(
                permintaan,
                user=request.user,
                items_approval=items_approval
            )
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        permintaan = self.get_object()
        user = request.user
        is_kasi_or_above = user.is_superuser or user.username == 'super' or getattr(user, 'role', '') in ['kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        if not is_kasi_or_above:
            return Response({'error': 'Hanya Kepala Seksi (Kasi) ke atas atau Administrator yang berwenang menolak permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

        alasan = request.data.get('alasan', '').strip()
        if not alasan:
            return Response({'error': 'Alasan penolakan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            permintaan = DistributionService.reject_permintaan(permintaan, user=request.user, alasan=alasan)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def serahkan(self, request, pk=None):
        """
        Tahap 3: Penyerahan fisik oleh petugas logistik.
        Permintaan yang telah DISETUJUI diserahkan ke perawat/petugas unit:
        - Mencatat nama penerima fisik (wajib)
        - Menerbitkan Bon Pengeluaran (OUT) otomatis
        - Memotong kartu stok gudang secara otomatis
        - Mengubah status Permintaan menjadi SELESAI
        """
        permintaan = self.get_object()
        if permintaan.status != Permintaan.STATUS_DISETUJUI:
            return Response({
                'error': f'Hanya permintaan berstatus DISETUJUI yang dapat diserahkan fisiknya (status saat ini: {permintaan.status}).'
            }, status=status.HTTP_400_BAD_REQUEST)

        penerima_nama = str(request.data.get('penerima_nama') or '').strip()
        if not penerima_nama:
            return Response({'error': 'Nama petugas penerima fisik dari unit ruangan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        tanggal = request.data.get('tanggal')
        catatan = str(request.data.get('catatan') or '').strip()
        items_payload = request.data.get('items', [])

        from decimal import Decimal
        items_data = []
        if items_payload:
            for it in items_payload:
                barang_id = it.get('barang') or it.get('barang_id')
                qty = it.get('qty') or it.get('qty_serah')
                if barang_id and Decimal(str(qty or 0)) > Decimal('0'):
                    items_data.append({
                        'barang': barang_id,
                        'permintaan_item': it.get('permintaan_item') or it.get('id'),
                        'qty': Decimal(str(qty)),
                        'satuan': it.get('satuan', 'PCS'),
                        'keterangan': it.get('keterangan', '')
                    })
        else:
            for pi in permintaan.items.all():
                target_qty = pi.qty_disetujui if pi.qty_disetujui > Decimal('0') else pi.qty_minta
                remaining = max(Decimal('0'), target_qty - pi.qty_dikeluarkan)
                if remaining > Decimal('0'):
                    items_data.append({
                        'barang': pi.barang.id,
                        'permintaan_item': pi.id,
                        'qty': remaining,
                        'satuan': pi.satuan,
                        'keterangan': pi.keterangan
                    })

        if not items_data:
            return Response({'error': 'Tidak ada kuantitas barang yang dapat diserahkan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pengeluaran = DistributionService.create_pengeluaran(
                ruang=permintaan.ruang,
                items_data=items_data,
                user=request.user,
                permintaan=permintaan,
                tanggal=tanggal,
                penerima_nama=penerima_nama,
                catatan=catatan or f"Penyerahan fisik realisasi Permintaan {permintaan.nomor}"
            )
            pengeluaran = DistributionService.approve_pengeluaran(pengeluaran, user=request.user)

            permintaan.refresh_from_db()
            return Response({
                'message': f'Barang berhasil diserahkan kepada {penerima_nama} (Bon OUT: {pengeluaran.nomor}). Stok gudang otomatis terpotong.',
                'permintaan': self.get_serializer(permintaan).data,
                'pengeluaran_id': pengeluaran.id,
                'pengeluaran_nomor': pengeluaran.nomor
            }, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Gagal memproses penyerahan barang: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def sync_siaga(self, request):
        try:
            result = DistributionService.sync_from_legacy_siaga(user=request.user)
            return Response({
                'message': f"Berhasil menarik {result['items_created']} item ({result['permintaan_created']} permohonan) dari antrean Siaga RS.",
                'data': result
            })
        except Exception as e:
            return Response({'error': f"Gagal sinkron dari Siaga: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PengeluaranViewSet(viewsets.ModelViewSet):
    serializer_class = PengeluaranSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nomor', 'ruang_nama', 'penerima_nama', 'catatan']
    ordering_fields = ['tanggal', 'nomor', 'total_nilai', 'created_at']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = Pengeluaran.objects.select_related('ruang', 'gudang', 'permintaan', 'created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar'
        ).all()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        ruang_param = self.request.query_params.get('ruang')
        if ruang_param:
            qs = qs.filter(ruang_id=ruang_param)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        ruang_id = data.get('ruang')
        permintaan_id = data.get('permintaan')
        tanggal = data.get('tanggal')
        penerima_nama = data.get('penerima_nama', '')
        catatan = data.get('catatan', '')
        items = data.get('items', [])
        auto_approve = bool(data.get('auto_approve', False))

        if not ruang_id:
            return Response({'error': 'Unit / Ruangan penerima wajib dipilih.'}, status=status.HTTP_400_BAD_REQUEST)
        if not permintaan_id:
            return Response({'error': 'Pengeluaran barang fisik wajib berdasarkan dokumen Permintaan Ruangan (Amprahan). Pengeluaran langsung tanpa permintaan tidak diperbolehkan.'}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({'error': 'Minimal 1 item barang yang dikeluarkan harus dimasukkan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pengeluaran = DistributionService.create_pengeluaran(
                ruang=ruang_id,
                items_data=items,
                user=request.user,
                permintaan=permintaan_id,
                tanggal=tanggal,
                penerima_nama=penerima_nama,
                catatan=catatan
            )
            if auto_approve:
                pengeluaran = DistributionService.approve_pengeluaran(pengeluaran, user=request.user)

            serializer = self.get_serializer(pengeluaran)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal membuat pengeluaran: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        pengeluaran = self.get_object()
        try:
            pengeluaran = DistributionService.approve_pengeluaran(pengeluaran, user=request.user)
            return Response(self.get_serializer(pengeluaran).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal menyetujui pengeluaran: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RuangViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def list(self, request, *args, **kwargs):
        ruangan = Ruang.objects.filter(is_active=True).values('id', 'kode', 'nama', 'legacy_id_ruang').order_by('nama')
        return Response(list(ruangan))
