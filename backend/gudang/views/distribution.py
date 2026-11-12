from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.exceptions import ValidationError
from django.db.models import Q

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
        user = self.request.user
        qs = Permintaan.objects.select_related('ruang', 'created_by', 'approved_by').prefetch_related(
            'items__barang__satuan_dasar',
            'items__barang__saldo_stok',
            'pengeluaran_list'
        ).all()

        is_logistik_staff = (
            user.is_superuser or
            getattr(user, 'username', '') == 'super' or
            getattr(user, 'is_logistik', False) or
            getattr(user, 'view_logistik', False) or
            getattr(user, 'role', '') in ['direktur', 'wakil_direktur']
        )

        # Jika user biasa / staf unit: hanya tampilkan permintaan dari unitnya sendiri (atau yang diajukan sendiri)
        if not is_logistik_staff and user.is_authenticated:
            if getattr(user, 'unit', None):
                qs = qs.filter(
                    Q(ruang__unit=user.unit) |
                    Q(ruang_nama__iexact=user.unit.nama) |
                    Q(created_by=user)
                )
            else:
                qs = qs.filter(created_by=user)

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

        # Jika ruang_id belum ada, otomatis ambil dari unit kerja akun di Manajemen User
        if not ruang_id and getattr(request.user, 'unit', None):
            matched_ruang = Ruang.objects.filter(nama__iexact=request.user.unit.nama).first()
            if not matched_ruang:
                matched_ruang = Ruang.objects.filter(unit=request.user.unit).first()
            if not matched_ruang and len(request.user.unit.nama.strip()) > 2:
                matched_ruang = Ruang.objects.filter(nama__icontains=request.user.unit.nama.strip()).first()
            if matched_ruang:
                ruang_id = matched_ruang.id

        if not ruang_id:
            return Response({'error': 'Unit / Ruangan pemohon tidak ditemukan. Pastikan akun Anda memiliki unit di Manajemen User.'}, status=status.HTTP_400_BAD_REQUEST)
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
        is_super = user.is_superuser or getattr(user, 'username', '') == 'super'
        has_logistik = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
        approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
        is_approver = getattr(user, 'role', '') in approver_roles

        if not (is_super or (has_logistik and is_approver)):
            return Response({'error': 'Hanya Koordinator/Kepala Seksi yang memiliki hak akses Gudang Logistik atau Administrator yang berwenang memverifikasi/menyetujui permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

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
        is_super = user.is_superuser or getattr(user, 'username', '') == 'super'
        has_logistik = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
        approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
        is_approver = getattr(user, 'role', '') in approver_roles

        if not (is_super or (has_logistik and is_approver)):
            return Response({'error': 'Hanya Koordinator/Kepala Seksi yang memiliki hak akses Gudang Logistik atau Administrator yang berwenang menolak permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

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
        from decimal import Decimal
        from django.db import transaction

        penerima_nama = str(request.data.get('penerima_nama') or '').strip()
        if not penerima_nama:
            return Response({'error': 'Nama petugas penerima fisik dari unit ruangan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

        tanggal = request.data.get('tanggal')
        catatan = str(request.data.get('catatan') or '').strip()
        items_payload = request.data.get('items', [])

        try:
            with transaction.atomic():
                permintaan = Permintaan.objects.select_for_update().filter(id=pk).first()
                if not permintaan:
                    return Response({'error': 'Permintaan tidak ditemukan.'}, status=status.HTTP_404_NOT_FOUND)

                if permintaan.status == Permintaan.STATUS_SELESAI:
                    return Response({
                        'error': f'Permintaan {permintaan.nomor} sudah SELESAI (barang fisik sudah diserahkan penuh sebelumnya).'
                    }, status=status.HTTP_400_BAD_REQUEST)

                if permintaan.status != Permintaan.STATUS_DISETUJUI:
                    return Response({
                        'error': f'Hanya permintaan berstatus DISETUJUI yang dapat diserahkan fisiknya (status saat ini: {permintaan.status}).'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Ambil item-item permintaan terbaru dari database dengan lock
                pi_map = {
                    pi.id: pi
                    for pi in PermintaanItem.objects.select_for_update().select_related('barang').filter(permintaan=permintaan)
                }

                items_data = []
                if items_payload:
                    for it in items_payload:
                        pi_id = it.get('permintaan_item') or it.get('id')
                        try:
                            pi = pi_map.get(int(pi_id)) if pi_id else None
                        except (ValueError, TypeError):
                            pi = None

                        if not pi:
                            continue

                        target_qty = pi.qty_disetujui
                        if target_qty <= Decimal('0'):
                            continue  # Item ini disetujui 0 (tidak disetujui/ditolak), lewati
                        sisa = max(Decimal('0'), target_qty - pi.qty_dikeluarkan)
                        if sisa <= Decimal('0'):
                            continue  # Item ini sudah terpenuhi penuh

                        qty_serah = Decimal(str(it.get('qty') or it.get('qty_serah') or 0))
                        if qty_serah <= Decimal('0'):
                            continue

                        if qty_serah > sisa:
                            return Response({
                                'error': f"Kuantitas serah untuk '{pi.barang.nama}' ({qty_serah}) melebihi sisa jatah permintaan ({sisa})."
                            }, status=status.HTTP_400_BAD_REQUEST)

                        items_data.append({
                            'barang': pi.barang.id,
                            'permintaan_item': pi.id,
                            'qty': qty_serah,
                            'satuan': it.get('satuan') or pi.satuan,
                            'keterangan': it.get('keterangan') or pi.keterangan
                        })
                else:
                    for pi in pi_map.values():
                        target_qty = pi.qty_disetujui
                        if target_qty <= Decimal('0'):
                            continue
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
                    return Response({
                        'error': f'Seluruh barang pada permintaan {permintaan.nomor} sudah diserahkan penuh sebelumnya (tidak ada sisa barang).'
                    }, status=status.HTTP_400_BAD_REQUEST)

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
                serializer = self.get_serializer(permintaan)

                return Response({
                    'message': f'Barang berhasil diserahkan kepada {penerima_nama} (Bon OUT: {pengeluaran.nomor}). Stok gudang otomatis terpotong.',
                    'permintaan': serializer.data,
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

    def destroy(self, request, *args, **kwargs):
        spb = self.get_object()
        if spb.status == Permintaan.STATUS_SELESAI or spb.pengeluaran_list.filter(status=Pengeluaran.STATUS_DISETUJUI).exists():
            return Response({'error': 'SPB tidak dapat dihapus karena sudah memiliki transaksi pengeluaran (BPPB) yang disetujui.'}, status=status.HTTP_400_BAD_REQUEST)
        if spb.pengeluaran_list.exists():
            return Response({'error': 'SPB tidak dapat dihapus karena masih memiliki dokumen pengeluaran (BPPB) terkait.'}, status=status.HTTP_400_BAD_REQUEST)
        user = request.user
        user_role = getattr(user, 'role', '')
        is_super = user.is_superuser or getattr(user, 'username', '') == 'super'
        has_logistik = bool(getattr(user, 'is_logistik', False) or user_role in ['direktur', 'wakil_direktur'])
        is_approver = user_role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        is_creator = spb.created_by_id == user.id
        if not (is_super or (has_logistik and is_approver) or is_creator):
            return Response({'error': 'Hanya pembuat dokumen, Koordinator Logistik, atau Superuser yang dapat menghapus SPB ini.'}, status=status.HTTP_403_FORBIDDEN)
        from django.db import transaction
        with transaction.atomic():
            spb.items.all().delete()
            spb.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        user = request.user
        is_logistik_staff = user.is_superuser or getattr(user, 'username', '') == 'super' or getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur']
        if not is_logistik_staff:
            return Response({'error': 'Hanya petugas Logistik atau Administrator yang berwenang menyetujui pengeluaran barang.'}, status=status.HTTP_403_FORBIDDEN)
        pengeluaran = self.get_object()
        try:
            pengeluaran = DistributionService.approve_pengeluaran(pengeluaran, user=request.user)
            return Response(self.get_serializer(pengeluaran).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Gagal menyetujui pengeluaran: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def destroy(self, request, *args, **kwargs):
        bppb = self.get_object()
        if bppb.status == Pengeluaran.STATUS_DISETUJUI:
            return Response({'error': 'Pengeluaran barang (BPPB) yang telah disetujui tidak dapat dihapus.'}, status=status.HTTP_400_BAD_REQUEST)
        user = request.user
        user_role = getattr(user, 'role', '')
        is_super = user.is_superuser or getattr(user, 'username', '') == 'super'
        has_logistik = bool(getattr(user, 'is_logistik', False) or user_role in ['direktur', 'wakil_direktur'])
        is_approver = user_role in ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur']
        is_creator = bppb.created_by_id == user.id
        if not (is_super or (has_logistik and is_approver) or is_creator):
            return Response({'error': 'Hanya pembuat dokumen, Koordinator Logistik, atau Superuser yang dapat menghapus BPPB ini.'}, status=status.HTTP_403_FORBIDDEN)
        from django.db import transaction
        with transaction.atomic():
            bppb.items.all().delete()
            bppb.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RuangViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def list(self, request, *args, **kwargs):
        ruangan = Ruang.objects.filter(is_active=True).values('id', 'kode', 'nama', 'legacy_id_ruang', 'unit_id').order_by('nama')
        return Response(list(ruangan))
