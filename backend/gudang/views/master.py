from rest_framework import viewsets, permissions, filters, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q, Sum
from django.db import transaction
from decimal import Decimal

from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang, BarangKemasan, Ruang, StokSaldo, LegacyMutasi, StokLedger,
    StockOpname, StockOpnameItem
)
from gudang.serializers.master import (
    GudangSerializer, GolonganBarangSerializer, SatuanSerializer,
    BarangSerializer, RuangSerializer, LegacyMutasiSerializer, StokLedgerSerializer
)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000


class GudangViewSet(viewsets.ModelViewSet):
    queryset = Gudang.objects.all()
    serializer_class = GudangSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['kode', 'nama']
    ordering = ['kode']


class GolonganBarangViewSet(viewsets.ModelViewSet):
    queryset = GolonganBarang.objects.annotate(
        total_barang=Count('barang', filter=Q(barang__is_active=True))
    ).all()
    serializer_class = GolonganBarangSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kode', 'nama']
    ordering = ['kode']


class SatuanViewSet(viewsets.ModelViewSet):
    queryset = Satuan.objects.all()
    serializer_class = SatuanSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kode', 'nama']
    ordering = ['kode']

    @action(detail=False, methods=['post'])
    def quick_create(self, request):
        kode = str(request.data.get('kode') or '').strip().upper()
        nama = str(request.data.get('nama') or kode).strip()
        if not kode:
            return Response({'error': 'Kode satuan wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)
        sat, created = Satuan.objects.get_or_create(
            kode=kode,
            defaults={'nama': nama, 'is_active': True}
        )
        return Response(SatuanSerializer(sat).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class BarangViewSet(viewsets.ModelViewSet):
    serializer_class = BarangSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['kode', 'nama', 'merk']
    ordering_fields = ['nama', 'kode', 'stok_minimum', 'created_at']
    ordering = ['nama']

    def get_queryset(self):
        qs = Barang.objects.select_related('golongan', 'satuan_dasar').prefetch_related('kemasan_list').all()

        gol_id = self.request.query_params.get('golongan')
        if gol_id:
            qs = qs.filter(golongan_id=gol_id)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['1', 'true'])

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        target = list(page) if page is not None else list(queryset)

        barang_ids = [b.id for b in target]
        if barang_ids:
            saldo_map = {s.barang_id: s for s in StokSaldo.objects.filter(barang_id__in=barang_ids)}
            for b in target:
                b._cached_saldo = saldo_map.get(b.id)

        if page is not None:
            serializer = self.get_serializer(target, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(target, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        can_delete = bool(
            getattr(user, 'is_superuser', False)
            or (
                getattr(user, 'role', '') in ('wakil_direktur', 'direktur')
                and (getattr(user, 'is_logistik', False) or getattr(user, 'view_logistik', False))
            )
        )
        if not can_delete:
            return Response(
                {'detail': 'Hanya Superuser, Wakil Direktur, atau Direktur dengan akses Logistik yang dapat menghapus master barang.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()

        po_count = instance.po_items.count()
        grn_count = instance.grn_items.count()
        req_count = instance.permintaan_items.count()
        out_count = instance.pengeluaran_items.count()

        relasi_aktif = []
        if po_count > 0:
            relasi_aktif.append(f"{po_count} Surat Pesanan (PO)")
        if grn_count > 0:
            relasi_aktif.append(f"{grn_count} Penerimaan Barang (GRN)")
        if req_count > 0:
            relasi_aktif.append(f"{req_count} Permintaan Unit")
        if out_count > 0:
            relasi_aktif.append(f"{out_count} Pengeluaran Unit")

        if relasi_aktif:
            return Response(
                {
                    'detail': (
                        f'Barang [{instance.kode}] "{instance.nama}" tidak dapat dihapus permanen karena sudah '
                        f'tercatat pada transaksi operasional: {", ".join(relasi_aktif)}.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        kode_brg = instance.kode
        nama_brg = instance.nama

        with transaction.atomic():
            affected_opname_ids = list(
                StockOpnameItem.objects.filter(barang=instance).values_list('opname_id', flat=True).distinct()
            )
            StockOpnameItem.objects.filter(barang=instance).delete()

            for opn_id in affected_opname_ids:
                agg = StockOpnameItem.objects.filter(opname_id=opn_id).aggregate(
                    tot_selisih=Sum('selisih'),
                    tot_nilai=Sum('subtotal_fisik'),
                )
                StockOpname.objects.filter(pk=opn_id).update(
                    total_selisih_qty=agg['tot_selisih'] or Decimal('0.000'),
                    total_nilai_fisik=agg['tot_nilai'] or Decimal('0.00'),
                )

            StokLedger.objects.filter(barang=instance).delete()
            StokSaldo.objects.filter(barang=instance).delete()
            instance.delete()

        return Response(
            {'message': f'Barang [{kode_brg}] "{nama_brg}" berhasil dihapus.'},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'])
    def ringkasan_stok(self, request):
        total_item = Barang.objects.filter(is_active=True).count()
        saldos = StokSaldo.objects.all()
        total_nilai = sum([float(s.nilai) for s in saldos])
        item_ada_stok = saldos.filter(qty__gt=0).count()
        item_stok_minimum = 0

        for s in saldos:
            min_stok = float(s.barang.stok_minimum or 0)
            if min_stok > 0 and float(s.qty) <= min_stok:
                item_stok_minimum += 1

        return Response({
            'total_item': total_item,
            'item_ada_stok': item_ada_stok,
            'item_stok_minimum': item_stok_minimum,
            'total_nilai_aset_stok': total_nilai,
        })

    @action(detail=False, methods=['post'])
    def import_batch(self, request):
        """
        Batch import katalog master barang dari file Excel/JSON.
        Format item: { kode, nama, merk, golongan, satuan_dasar, stok_minimum, kemasan, isi_kemasan }
        """
        items = request.data.get('items', [])
        if not items or not isinstance(items, list):
            return Response({'error': 'Format data salah atau daftar item kosong.'}, status=status.HTTP_400_BAD_REQUEST)

        golongan_cache = {g.kode.upper(): g for g in GolonganBarang.objects.all()}
        satuan_cache = {s.kode.upper(): s for s in Satuan.objects.all()}

        created_items = []
        errors = []

        with transaction.atomic():
            for idx, raw in enumerate(items):
                nama = str(raw.get('nama') or '').strip().upper()
                if not nama:
                    errors.append(f"Baris {idx + 1}: Nama barang wajib diisi.")
                    continue

                gol_key = str(raw.get('golongan') or 'B1').strip().upper()
                gol = golongan_cache.get(gol_key)
                if not gol:
                    gol = GolonganBarang.objects.filter(kode='B1').first() or GolonganBarang.objects.first()

                sat_key = str(raw.get('satuan_dasar') or 'PCS').strip().upper()
                sat = satuan_cache.get(sat_key)
                if not sat:
                    sat, _ = Satuan.objects.get_or_create(kode=sat_key, defaults={'nama': sat_key})
                    satuan_cache[sat_key] = sat

                kode = str(raw.get('kode') or '').strip().upper()
                if not kode:
                    prefix = gol.prefix_kode if gol and gol.prefix_kode else 'B1'
                    last_b = Barang.objects.filter(kode__startswith=f"{prefix}-").order_by('-kode').first()
                    if last_b:
                        try:
                            last_num = int(last_b.kode.split('-')[-1])
                            kode = f"{prefix}-{last_num + 1:04d}"
                        except Exception:
                            kode = f"{prefix}-{Barang.objects.count() + 1:04d}"
                    else:
                        kode = f"{prefix}-0001"

                if Barang.objects.filter(kode=kode).exists():
                    kode = f"{kode}-{Barang.objects.count() + 1}"

                merk = str(raw.get('merk') or '').strip().upper()
                stok_minimum = Decimal(str(raw.get('stok_minimum') or 0))

                barang = Barang.objects.create(
                    kode=kode,
                    nama=nama,
                    golongan=gol,
                    satuan_dasar=sat,
                    merk=merk,
                    stok_minimum=stok_minimum,
                    created_by=request.user
                )

                kemasan_nama = str(raw.get('kemasan') or '').strip().upper()
                isi_kemasan = Decimal(str(raw.get('isi_kemasan') or 0))
                if kemasan_nama and isi_kemasan > 0:
                    BarangKemasan.objects.create(
                        barang=barang,
                        nama_kemasan=kemasan_nama,
                        isi_per_kemasan=isi_kemasan,
                        is_default_beli=True
                    )

                created_items.append({'id': barang.id, 'kode': barang.kode, 'nama': barang.nama})

        return Response({
            'success': True,
            'message': f"Berhasil mengimpor {len(created_items)} barang ke katalog.",
            'count': len(created_items),
            'errors': errors
        })


class RuangViewSet(viewsets.ModelViewSet):
    queryset = Ruang.objects.select_related('unit').all()
    serializer_class = RuangSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kode', 'nama']
    ordering = ['nama']


class LegacyMutasiViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LegacyMutasi.objects.select_related('barang').all()
    serializer_class = LegacyMutasiSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['dokumen_legacy', 'ruang_nama', 'vendor_nama', 'catatan']
    ordering = ['-tanggal', '-id']

    def get_queryset(self):
        qs = super().get_queryset()
        barang_id = self.request.query_params.get('barang')
        legacy_id_brg = self.request.query_params.get('legacy_id_brg')
        if barang_id:
            qs = qs.filter(barang_id=barang_id)
        elif legacy_id_brg:
            qs = qs.filter(legacy_id_brg=legacy_id_brg)
        return qs


class StokLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StokLedger.objects.select_related('barang', 'barang__satuan_dasar', 'created_by').all()
    serializer_class = StokLedgerSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['sumber_nomor', 'keterangan', 'sumber_tipe', 'barang__nama', 'barang__kode']
    ordering = ['-tanggal_efektif', '-id']

    def get_queryset(self):
        qs = super().get_queryset()
        barang_id = self.request.query_params.get('barang')
        jenis = self.request.query_params.get('jenis')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if barang_id:
            qs = qs.filter(barang_id=barang_id)
        if jenis:
            if jenis == 'OPNAME':
                qs = qs.filter(jenis__in=['ADJ_PLUS', 'ADJ_MINUS'])
            else:
                qs = qs.filter(jenis=jenis)
        if start_date:
            qs = qs.filter(tanggal_efektif__date__gte=start_date)
        if end_date:
            qs = qs.filter(tanggal_efektif__date__lte=end_date)
        return qs
