from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Sum, F, Count
from decimal import Decimal
from django.utils import timezone

from gudang.models import (
    Barang, GolonganBarang, Ruang, StokSaldo,
    Permintaan, PermintaanItem,
    Pengeluaran, PengeluaranItem,
    Penerimaan, PenerimaanItem
)


class LaporanViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def stok_akhir(self, request):
        """
        Laporan Nilai Persediaan / Stok Akhir Gudang saat ini.
        Filter opsional: ?golongan=<id>&status_stok=<habis|menipis|aman>&search=<keyword>
        """
        gol_id = request.query_params.get('golongan')
        status_stok = request.query_params.get('status_stok')
        search = request.query_params.get('search')

        qs = Barang.objects.filter(is_active=True).select_related('golongan', 'satuan_dasar').order_by('golongan__kode', 'kode')
        if gol_id:
            qs = qs.filter(golongan_id=gol_id)
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(nama__icontains=search) | Q(kode__icontains=search) | Q(merk__icontains=search))

        barang_list = list(qs)
        b_ids = [b.id for b in barang_list]

        saldo_map = {}
        if b_ids:
            for s in StokSaldo.objects.filter(barang_id__in=b_ids):
                saldo_map[s.barang_id] = s

        results = []
        total_items = 0
        total_qty = Decimal('0.000')
        total_nilai = Decimal('0.00')

        for b in barang_list:
            s = saldo_map.get(b.id)
            qty = s.qty if s else Decimal('0.000')
            avg_cost = s.avg_cost if s else Decimal('0.0000')
            nilai = s.nilai if s else Decimal('0.00')

            min_stok = b.stok_minimum or Decimal('0.000')

            if status_stok == 'habis' and qty > 0:
                continue
            if status_stok == 'menipis' and (qty == 0 or qty > min_stok):
                continue
            if status_stok == 'aman' and qty <= min_stok:
                continue

            total_items += 1
            total_qty += qty
            total_nilai += nilai

            results.append({
                'barang_id': b.id,
                'kode': b.kode,
                'nama': b.nama,
                'merk': b.merk or '-',
                'golongan_kode': b.golongan.kode if b.golongan else '-',
                'golongan_nama': b.golongan.nama if b.golongan else '-',
                'satuan': b.satuan_dasar.kode if b.satuan_dasar else 'PCS',
                'stok_minimum': float(min_stok),
                'qty_fisik': float(qty),
                'avg_cost': float(avg_cost),
                'total_nilai': float(nilai)
            })

        return Response({
            'summary': {
                'total_items': total_items,
                'total_qty': float(total_qty),
                'total_nilai': float(total_nilai)
            },
            'results': results
        })

    @action(detail=False, methods=['get'])
    def pemakaian_ruangan(self, request):
        """
        Laporan Rekapitulasi Pemakaian Barang per Unit Ruangan.
        Filter: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&ruang=<id>
        """
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        ruang_id = request.query_params.get('ruang')
        search = request.query_params.get('search')

        qs = PengeluaranItem.objects.filter(pengeluaran__status=Pengeluaran.STATUS_DISETUJUI).select_related(
            'pengeluaran', 'pengeluaran__ruang', 'barang', 'barang__satuan_dasar'
        ).order_by('-pengeluaran__tanggal', '-pengeluaran__id')

        if start_date:
            qs = qs.filter(pengeluaran__tanggal__gte=start_date)
        if end_date:
            qs = qs.filter(pengeluaran__tanggal__lte=end_date)
        if ruang_id:
            qs = qs.filter(pengeluaran__ruang_id=ruang_id)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(barang__nama__icontains=search) |
                Q(barang__kode__icontains=search) |
                Q(pengeluaran__nomor__icontains=search) |
                Q(pengeluaran__ruang_nama__icontains=search) |
                Q(pengeluaran__penerima_nama__icontains=search)
            )

        results = []
        total_qty = Decimal('0.000')
        total_biaya = Decimal('0.00')
        unique_buku_out = set()

        for item in qs:
            total_qty += item.qty
            total_biaya += item.subtotal
            unique_buku_out.add(item.pengeluaran_id)

            results.append({
                'id': item.id,
                'tanggal': str(item.pengeluaran.tanggal),
                'nomor_out': item.pengeluaran.nomor,
                'ruang_nama': item.pengeluaran.ruang_nama,
                'penerima_nama': item.pengeluaran.penerima_nama or '-',
                'barang_kode': item.barang.kode,
                'barang_nama': item.barang.nama,
                'qty': float(item.qty),
                'satuan': item.satuan,
                'harga_unit': float(item.harga_unit),
                'subtotal': float(item.subtotal),
                'keterangan': item.keterangan or item.pengeluaran.catatan or '-'
            })

        return Response({
            'summary': {
                'total_transaksi': len(unique_buku_out),
                'total_item_baris': len(results),
                'total_qty': float(total_qty),
                'total_biaya': float(total_biaya)
            },
            'results': results
        })

    @action(detail=False, methods=['get'])
    def pembelian_vendor(self, request):
        """
        Laporan Rekapitulasi Pembelian / Penerimaan Barang Masuk Rekanan.
        Filter: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&vendor=<nama>
        """
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        vendor_nama = request.query_params.get('vendor')
        search = request.query_params.get('search') or vendor_nama

        qs = PenerimaanItem.objects.filter(penerimaan__status=Penerimaan.STATUS_DISETUJUI).select_related(
            'penerimaan', 'barang', 'barang__satuan_dasar'
        ).order_by('-penerimaan__tanggal', '-penerimaan__id')

        if start_date:
            qs = qs.filter(penerimaan__tanggal__gte=start_date)
        if end_date:
            qs = qs.filter(penerimaan__tanggal__lte=end_date)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(penerimaan__vendor_nama__icontains=search) |
                Q(barang__nama__icontains=search) |
                Q(barang__kode__icontains=search) |
                Q(penerimaan__nomor__icontains=search) |
                Q(penerimaan__no_faktur__icontains=search)
            )

        results = []
        total_belanja = Decimal('0.00')
        total_qty_dasar = Decimal('0.000')
        unique_grn = set()

        for item in qs:
            total_belanja += item.subtotal
            total_qty_dasar += item.qty_dasar
            unique_grn.add(item.penerimaan_id)

            results.append({
                'id': item.id,
                'tanggal': str(item.penerimaan.tanggal),
                'nomor_grn': item.penerimaan.nomor,
                'no_faktur': item.penerimaan.no_faktur or '-',
                'vendor_nama': item.penerimaan.vendor_nama,
                'barang_kode': item.barang.kode,
                'barang_nama': item.barang.nama,
                'kemasan': item.kemasan,
                'isi': float(item.isi),
                'qty_kemasan': float(item.qty_kemasan),
                'qty_dasar': float(item.qty_dasar),
                'satuan_dasar': item.barang.satuan_dasar.kode,
                'harga_kemasan': float(item.harga_kemasan),
                'harga_dasar': float(item.harga_dasar),
                'subtotal': float(item.subtotal)
            })

        return Response({
            'summary': {
                'total_grn': len(unique_grn),
                'total_item_baris': len(results),
                'total_qty_dasar': float(total_qty_dasar),
                'total_belanja': float(total_belanja)
            },
            'results': results
        })

    @action(detail=False, methods=['get'])
    def permintaan_unit(self, request):
        """
        Laporan Rekapitulasi & Persentase Permintaan Barang Tiap Unit Ruangan.
        Filter: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&ruang=<id>&search=<keyword>
        """
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        ruang_id = request.query_params.get('ruang')
        search = request.query_params.get('search')

        qs = PermintaanItem.objects.exclude(
            permintaan__status=Permintaan.STATUS_BATAL
        ).select_related(
            'permintaan', 'permintaan__ruang', 'barang', 'barang__satuan_dasar'
        ).order_by('-permintaan__tanggal', '-permintaan__id')

        if start_date:
            qs = qs.filter(permintaan__tanggal__gte=start_date)
        if end_date:
            qs = qs.filter(permintaan__tanggal__lte=end_date)
        if ruang_id:
            qs = qs.filter(permintaan__ruang_id=ruang_id)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(barang__nama__icontains=search) |
                Q(barang__kode__icontains=search) |
                Q(permintaan__nomor__icontains=search) |
                Q(permintaan__ruang_nama__icontains=search)
            )

        items_list = list(qs)

        total_minta = Decimal('0.000')
        total_setuju = Decimal('0.000')
        unique_req = set()
        ruang_data_map = {}

        for item in items_list:
            qty_m = item.qty_minta or Decimal('0.000')
            qty_s = item.qty_disetujui or Decimal('0.000')
            total_minta += qty_m
            total_setuju += qty_s
            unique_req.add(item.permintaan_id)

            r_nama = item.permintaan.ruang_nama or 'Unit Lain'
            if r_nama not in ruang_data_map:
                ruang_data_map[r_nama] = {
                    'ruang_id': item.permintaan.ruang_id,
                    'unit_nama': r_nama,
                    'total_minta': Decimal('0.000'),
                    'total_setuju': Decimal('0.000'),
                    'transaksi_ids': set(),
                    'barang_map': {}
                }

            rd = ruang_data_map[r_nama]
            rd['total_minta'] += qty_m
            rd['total_setuju'] += qty_s
            rd['transaksi_ids'].add(item.permintaan_id)

            b_key = item.barang_id
            if b_key not in rd['barang_map']:
                rd['barang_map'][b_key] = {
                    'barang_id': item.barang.id,
                    'barang_kode': item.barang.kode,
                    'barang_nama': item.barang.nama,
                    'satuan': item.satuan,
                    'qty_minta': Decimal('0.000'),
                    'qty_setuju': Decimal('0.000'),
                }
            rd['barang_map'][b_key]['qty_minta'] += qty_m
            rd['barang_map'][b_key]['qty_setuju'] += qty_s

        # Build list per unit
        results = []
        for r_nama, rd in ruang_data_map.items():
            u_minta = rd['total_minta']
            u_setuju = rd['total_setuju']
            pct_unit = round((float(u_minta) / float(total_minta) * 100), 2) if total_minta > 0 else 0.0
            fulfillment = round((float(u_setuju) / float(u_minta) * 100), 1) if u_minta > 0 else 100.0

            daftar_barang = []
            for b in rd['barang_map'].values():
                b_pct = round((float(b['qty_minta']) / float(u_minta) * 100), 1) if u_minta > 0 else 0.0
                daftar_barang.append({
                    'barang_id': b['barang_id'],
                    'barang_kode': b['barang_kode'],
                    'barang_nama': b['barang_nama'],
                    'satuan': b['satuan'],
                    'qty_minta': float(b['qty_minta']),
                    'qty_setuju': float(b['qty_setuju']),
                    'persentase': b_pct
                })
            daftar_barang.sort(key=lambda x: x['qty_minta'], reverse=True)

            results.append({
                'ruang_id': rd['ruang_id'],
                'unit_nama': r_nama,
                'total_minta': float(u_minta),
                'total_setuju': float(u_setuju),
                'total_transaksi': len(rd['transaksi_ids']),
                'total_jenis_barang': len(daftar_barang),
                'persentase': pct_unit,
                'fulfillment_rate': fulfillment,
                'daftar_barang': daftar_barang
            })

        results.sort(key=lambda x: x['total_minta'], reverse=True)

        overall_fulfillment = round((float(total_setuju) / float(total_minta) * 100), 1) if total_minta > 0 else 100.0

        return Response({
            'summary': {
                'total_permintaan_minta': float(total_minta),
                'total_permintaan_setuju': float(total_setuju),
                'total_transaksi': len(unique_req),
                'total_unit_aktif': len(results),
                'fulfillment_rate': overall_fulfillment
            },
            'results': results
        })

