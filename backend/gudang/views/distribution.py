from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.exceptions import ValidationError
from django.db.models import Q, Sum
from django.utils import timezone

from gudang.models import Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem, Ruang, Barang, StokSaldo
from gudang.serializers.distribution import (
    PermintaanSerializer, PengeluaranSerializer
)
from gudang.services.distribution import DistributionService
from gudang.views.master import StandardResultsSetPagination


def _is_approver_user(user):
    if not user or not user.is_authenticated:
        return False
    is_super = user.is_superuser or getattr(user, 'username', '') == 'super'
    has_logistik = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
    approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
    is_approver = getattr(user, 'role', '') in approver_roles
    return is_super or (has_logistik and is_approver)


def _is_logistik_operator(user):
    if not user or not user.is_authenticated:
        return False
    return bool(
        user.is_superuser
        or getattr(user, 'username', '') == 'super'
        or getattr(user, 'is_logistik', False)
        or getattr(user, 'role', '') in ['direktur', 'wakil_direktur']
    )


def _find_ruang_for_unit(unit_obj):
    """Cari Ruang yang cocok dengan Unit user tanpa membuat data baru."""
    if not unit_obj:
        return None
    unit_name = (unit_obj.nama or '').strip()
    matched_ruang = (
        Ruang.objects.filter(unit=unit_obj).first()
        or (Ruang.objects.filter(nama__iexact=unit_name).first() if unit_name else None)
    )
    if not matched_ruang and len(unit_name) > 2:
        matched_ruang = Ruang.objects.filter(nama__icontains=unit_name).first()
    return matched_ruang


def _resolve_or_create_ruang_for_unit(unit_obj):
    """Cari Ruang yang sesuai dengan Unit user; jika belum ada, buatkan otomatis."""
    matched_ruang = _find_ruang_for_unit(unit_obj)
    if matched_ruang:
        return matched_ruang

    unit_name = (unit_obj.nama or '').strip()
    base_kode = f"U-{unit_obj.id:03d}"
    kode_ruang = base_kode
    suffix = 1
    while Ruang.objects.filter(kode=kode_ruang).exists():
        kode_ruang = f"{base_kode}-{suffix}"
        suffix += 1
    return Ruang.objects.create(
        kode=kode_ruang,
        nama=(unit_name or base_kode)[:120],
        unit=unit_obj,
        is_active=True,
    )


def _apply_status_filter(qs, status_param, incomplete_statuses):
    """Filter queryset by comma-separated status values with BELUM_SELESAI alias."""
    if not status_param:
        return qs
    statuses = []
    for raw in status_param.split(','):
        token = raw.strip().upper()
        if not token:
            continue
        if token == 'BELUM_SELESAI':
            for st in incomplete_statuses:
                if st not in statuses:
                    statuses.append(st)
        elif token not in statuses:
            statuses.append(token)
    if len(statuses) == 1:
        return qs.filter(status=statuses[0])
    if statuses:
        return qs.filter(status__in=statuses)
    return qs


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
        qs = _apply_status_filter(
            qs,
            status_param,
            (Permintaan.STATUS_DRAFT, *DistributionService.ACTIVE_PERMINTAAN_STATUSES),
        )
        ruang_param = self.request.query_params.get('ruang')
        if ruang_param:
            qs = qs.filter(ruang_id=ruang_param)
        return qs

    @action(detail=False, methods=['post'], url_path='check-duplicates')
    def check_duplicates(self, request):
        """
        Cek apakah unit/ruangan masih memiliki permintaan barang aktif (belum selesai)
        untuk barang-barang yang hendak diajukan agar pemohon mendapat peringatan & konfirmasi.
        """
        ruang_id = request.data.get('ruang')
        raw_barang_ids = request.data.get('barang_ids') or []
        exclude_id = request.data.get('exclude_permintaan_id')

        ruang_obj = None
        if ruang_id:
            ruang_obj = Ruang.objects.filter(pk=ruang_id).first()
        elif getattr(request.user, 'unit', None):
            ruang_obj = _find_ruang_for_unit(request.user.unit)

        clean_barang_ids = []
        for bid in raw_barang_ids:
            try:
                val = int(bid)
                if val > 0 and val not in clean_barang_ids:
                    clean_barang_ids.append(val)
            except (TypeError, ValueError):
                continue

        exclude_pk = None
        if exclude_id:
            try:
                exclude_pk = int(exclude_id)
            except (TypeError, ValueError):
                exclude_pk = None

        duplicates = (
            DistributionService.find_active_duplicate_items_for_ruang(
                ruang_id=ruang_obj.id,
                barang_ids=clean_barang_ids,
                exclude_permintaan_id=exclude_pk,
            )
            if ruang_obj and clean_barang_ids
            else []
        )

        return Response({
            'ruang_id': ruang_obj.id if ruang_obj else None,
            'ruang_nama': ruang_obj.nama if ruang_obj else (getattr(getattr(request.user, 'unit', None), 'nama', '') or ''),
            'has_duplicates': len(duplicates) > 0,
            'duplicates': duplicates,
        })

    def create(self, request, *args, **kwargs):
        data = request.data
        ruang_id = data.get('ruang')
        items = data.get('items', [])
        tanggal = data.get('tanggal')
        catatan = data.get('catatan', '')
        auto_submit = bool(data.get('auto_submit', True))

        # Jika ruang_id belum ada, otomatis ambil atau buat dari unit kerja akun di Manajemen User
        if not ruang_id and getattr(request.user, 'unit', None):
            ruang_id = _resolve_or_create_ruang_for_unit(request.user.unit).id

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
        if not _is_approver_user(request.user):
            return Response({'error': 'Hanya Koordinator/Kepala Seksi yang memiliki hak akses Gudang Logistik atau Administrator yang berwenang memverifikasi/menyetujui permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

        items_approval = request.data.get('items')
        try:
            permintaan = DistributionService.approve_permintaan(
                permintaan,
                user=request.user,
                items_approval=items_approval
            )
            permintaan = self.get_queryset().get(pk=permintaan.pk)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve-followup')
    def approve_followup(self, request, pk=None):
        """
        Verifikasi susulan oleh Koordinator/Kasi untuk item berstatus SEDANG_DIAJUKAN
        setelah stok gudang terisi kembali.
        """
        permintaan = self.get_object()
        if not _is_approver_user(request.user):
            return Response({'error': 'Hanya Koordinator/Kepala Seksi yang memiliki hak akses Gudang Logistik atau Administrator yang berwenang melakukan verifikasi susulan.'}, status=status.HTTP_403_FORBIDDEN)

        items_approval = request.data.get('items', [])
        try:
            permintaan = DistributionService.approve_followup_items(
                permintaan,
                user=request.user,
                items_approval=items_approval
            )
            permintaan = self.get_queryset().get(pk=permintaan.pk)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='close-item')
    def close_item(self, request, pk=None):
        """
        Menutup / membatalkan sisa item yang sedang menunggu pengadaan (SEDANG_DIAJUKAN).
        """
        permintaan = self.get_object()
        if not _is_logistik_operator(request.user):
            return Response({'error': 'Hanya petugas logistik atau administrator yang berwenang menutup item pengadaan.'}, status=status.HTTP_403_FORBIDDEN)

        item_id = request.data.get('item_id') or request.data.get('id')
        alasan = str(request.data.get('alasan') or '').strip()
        if not item_id:
            return Response({'error': 'ID item wajib dikirimkan.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            permintaan = DistributionService.close_procurement_item(
                permintaan,
                item_id=int(item_id),
                user=request.user,
                alasan=alasan
            )
            permintaan = self.get_queryset().get(pk=permintaan.pk)
            return Response(self.get_serializer(permintaan).data)
        except (ValueError, TypeError):
            return Response({'error': 'Format item_id tidak valid.'}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='procurement-alerts')
    def procurement_alerts(self, request):
        """
        Daftar antrean item SEDANG_DIAJUKAN untuk alert Dashboard Gudang:
        - ready_for_followup: stok sekarang > 0 (siap ACC susulan oleh Kasi/Koordinator)
        - awaiting_stock: stok masih 0 (menunggu penerimaan/pengadaan)
        """
        allowed_permintaan_ids = self.filter_queryset(self.get_queryset()).values_list('id', flat=True)
        pending_items = list(
            PermintaanItem.objects.filter(
                permintaan_id__in=allowed_permintaan_ids,
                status=PermintaanItem.STATUS_SEDANG_DIAJUKAN,
            )
            .exclude(permintaan__status__in=[Permintaan.STATUS_BATAL, Permintaan.STATUS_DITOLAK, Permintaan.STATUS_SELESAI])
            .select_related('permintaan', 'permintaan__ruang', 'barang', 'barang__satuan_dasar')
            .order_by('permintaan__tanggal', 'id')
        )

        barang_ids = list({pi.barang_id for pi in pending_items})
        stok_map = {}
        if barang_ids:
            rows = StokSaldo.objects.filter(barang_id__in=barang_ids).values('barang_id').annotate(total=Sum('qty'))
            stok_map = {r['barang_id']: float(r['total'] or 0) for r in rows}

        today = timezone.now().date()
        ready_for_followup = []
        awaiting_stock = []

        for pi in pending_items:
            stok_now = stok_map.get(pi.barang_id, 0.0)
            req_date = pi.permintaan.tanggal
            waiting_days = max(0, (today - req_date).days) if req_date else 0
            entry = {
                'id': pi.id,
                'permintaan_id': pi.permintaan_id,
                'permintaan_nomor': pi.permintaan.nomor,
                'permintaan_tanggal': str(req_date) if req_date else None,
                'ruang_id': pi.permintaan.ruang_id,
                'ruang_nama': pi.permintaan.ruang_nama or (pi.permintaan.ruang.nama if pi.permintaan.ruang else '-'),
                'barang_id': pi.barang_id,
                'barang_kode': pi.barang.kode,
                'barang_nama': pi.barang.nama,
                'qty_minta': float(pi.qty_minta),
                'satuan': pi.satuan or (pi.barang.satuan_dasar.kode if pi.barang.satuan_dasar else ''),
                'stok_tersedia': stok_now,
                'waiting_days': waiting_days,
                'keterangan': pi.keterangan,
            }
            if stok_now > 0:
                ready_for_followup.append(entry)
            else:
                awaiting_stock.append(entry)

        return Response({
            'counts': {
                'total_sedang_diajukan': len(pending_items),
                'ready_count': len(ready_for_followup),
                'awaiting_count': len(awaiting_stock),
                'can_approve_followup': _is_approver_user(request.user),
            },
            'ready_for_followup': ready_for_followup,
            'awaiting_stock': awaiting_stock,
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        permintaan = self.get_object()
        if not _is_approver_user(request.user):
            return Response({'error': 'Hanya Koordinator/Kepala Seksi yang memiliki hak akses Gudang Logistik atau Administrator yang berwenang menolak permintaan unit.'}, status=status.HTTP_403_FORBIDDEN)

        alasan = request.data.get('alasan', '').strip()
        if not alasan:
            return Response({'error': 'Alasan penolakan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            permintaan = DistributionService.reject_permintaan(permintaan, user=request.user, alasan=alasan)
            permintaan = self.get_queryset().get(pk=permintaan.pk)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def batal(self, request, pk=None):
        permintaan = self.get_object()
        if not DistributionService.can_user_cancel_permintaan(request.user, permintaan):
            if permintaan.status in (Permintaan.STATUS_SELESAI, Permintaan.STATUS_DITOLAK, Permintaan.STATUS_BATAL):
                return Response({'error': f'Permintaan dengan status {permintaan.status} tidak dapat dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'error': 'Anda tidak berwenang membatalkan permintaan unit ini.'}, status=status.HTTP_403_FORBIDDEN)

        alasan = (request.data.get('alasan') or request.data.get('alasan_batal') or '').strip()
        if not alasan:
            return Response({'error': 'Alasan pembatalan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            permintaan = DistributionService.batal_permintaan(permintaan, user=request.user, alasan=alasan)
            permintaan = self.get_queryset().get(pk=permintaan.pk)
            return Response(self.get_serializer(permintaan).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def serahkan(self, request, pk=None):
        """
        Tahap 3: Penyerahan fisik oleh petugas logistik.
        Permintaan yang telah DISETUJUI atau PROSES_SEBAGIAN diserahkan ke perawat/petugas unit:
        - Mencatat nama penerima fisik (wajib)
        - Menerbitkan Bon Pengeluaran (OUT) untuk item yang berstatus DISETUJUI (qty_disetujui > qty_dikeluarkan)
        - Memotong kartu stok gudang secara otomatis
        - Menyinkronkan status Permintaan (tetap PROSES_SEBAGIAN bila masih ada item SEDANG_DIAJUKAN, atau SELESAI bila seluruh item rampung)
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

                if permintaan.status not in (Permintaan.STATUS_DISETUJUI, Permintaan.STATUS_PROSES_SEBAGIAN):
                    return Response({
                        'error': f'Hanya permintaan berstatus DISETUJUI atau PROSES_SEBAGIAN yang dapat diserahkan fisiknya (status saat ini: {permintaan.status}).'
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

                        if not pi or pi.status != PermintaanItem.STATUS_DISETUJUI:
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
                        if pi.status != PermintaanItem.STATUS_DISETUJUI:
                            continue
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

                permintaan = self.get_queryset().get(pk=permintaan.pk)
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
        qs = _apply_status_filter(qs, status_param, (Pengeluaran.STATUS_DRAFT,))
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

    @action(detail=True, methods=['post'])
    def batal(self, request, pk=None):
        pengeluaran = self.get_object()
        if not DistributionService.can_user_cancel_pengeluaran(request.user, pengeluaran):
            if pengeluaran.status != Pengeluaran.STATUS_DRAFT:
                return Response({'error': 'Hanya bon pengeluaran berstatus DRAFT (belum diserahkan) yang dapat dibatalkan.'}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'error': 'Anda tidak berwenang membatalkan bon pengeluaran ini.'}, status=status.HTTP_403_FORBIDDEN)
        alasan = (request.data.get('alasan') or request.data.get('alasan_batal') or '').strip()
        if not alasan:
            return Response({'error': 'Alasan pembatalan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            pengeluaran = DistributionService.batal_pengeluaran(pengeluaran, user=request.user, alasan=alasan)
            return Response(self.get_serializer(pengeluaran).data)
        except ValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

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
