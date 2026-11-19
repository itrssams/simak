from rest_framework import serializers
from decimal import Decimal
from gudang.models import (
    Permintaan, PermintaanItem, Pengeluaran, PengeluaranItem, Ruang, Barang
)
from gudang.services.distribution import DistributionService


class PermintaanItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)
    stok_tersedia = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    sisa_belum_serah = serializers.SerializerMethodField()

    class Meta:
        model = PermintaanItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'satuan_dasar_kode',
            'qty_minta', 'satuan', 'qty_disetujui', 'qty_dikeluarkan',
            'status', 'status_label', 'alasan_tolak', 'sisa_belum_serah',
            'keterangan', 'stok_tersedia'
        ]

    def get_stok_tersedia(self, obj):
        from gudang.models import StokSaldo
        from django.db.models import Sum
        total = StokSaldo.objects.filter(barang=obj.barang).aggregate(total=Sum('qty'))['total']
        return float(total or 0)

    def get_sisa_belum_serah(self, obj):
        if obj.status != PermintaanItem.STATUS_DISETUJUI:
            return 0.0
        sisa = (obj.qty_disetujui or Decimal('0')) - (obj.qty_dikeluarkan or Decimal('0'))
        return float(max(Decimal('0'), sisa))


class PermintaanSerializer(serializers.ModelSerializer):
    items = PermintaanItemSerializer(many=True, read_only=True)
    ruang_nama = serializers.CharField(source='ruang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()
    can_followup_approve = serializers.SerializerMethodField()
    can_issue = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    bon_pengeluaran_id = serializers.SerializerMethodField()
    bon_pengeluaran_nomor = serializers.SerializerMethodField()
    tanggal_penyerahan = serializers.SerializerMethodField()
    penerima_nama = serializers.SerializerMethodField()
    pengeluaran_list = serializers.SerializerMethodField()
    item_status_counts = serializers.SerializerMethodField()

    class Meta:
        model = Permintaan
        fields = [
            'id', 'nomor', 'tanggal', 'tanggal_penyerahan', 'penerima_nama', 'ruang', 'ruang_nama',
            'catatan', 'status', 'alasan_tolak', 'legacy_out_id',
            'items', 'item_status_counts', 'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve', 'can_followup_approve', 'can_issue', 'can_cancel',
            'bon_pengeluaran_id', 'bon_pengeluaran_nomor', 'pengeluaran_list'
        ]

    def _has_approver_permission(self, request):
        if not request or not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True
        has_logistik_access = bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])
        approver_roles = {'koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'}
        is_approver_role = getattr(user, 'role', '') in approver_roles
        return has_logistik_access and is_approver_role

    def get_can_approve(self, obj):
        if obj.status != Permintaan.STATUS_MENUNGGU:
            return False
        return self._has_approver_permission(self.context.get('request'))

    def get_can_followup_approve(self, obj):
        if obj.status not in (Permintaan.STATUS_PROSES_SEBAGIAN, Permintaan.STATUS_DISETUJUI):
            return False
        if not self._has_approver_permission(self.context.get('request')):
            return False
        return any(pi.status == PermintaanItem.STATUS_SEDANG_DIAJUKAN for pi in obj.items.all())

    def get_can_issue(self, obj):
        # Bisa diserahkan bila DISETUJUI atau PROSES_SEBAGIAN dan masih ada item DISETUJUI dengan sisa > 0
        if obj.status not in (Permintaan.STATUS_DISETUJUI, Permintaan.STATUS_PROSES_SEBAGIAN):
            return False
        return any(
            pi.status == PermintaanItem.STATUS_DISETUJUI
            and (pi.qty_disetujui or Decimal('0')) > (pi.qty_dikeluarkan or Decimal('0'))
            for pi in obj.items.all()
        )

    def get_can_cancel(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return DistributionService.can_user_cancel_permintaan(request.user, obj)

    def get_item_status_counts(self, obj):
        from gudang.models import StokSaldo
        from django.db.models import Sum

        items = list(obj.items.all())
        sedang_ids = [pi.barang_id for pi in items if pi.status == PermintaanItem.STATUS_SEDANG_DIAJUKAN]
        stok_map = {}
        if sedang_ids:
            rows = StokSaldo.objects.filter(barang_id__in=sedang_ids).values('barang_id').annotate(total=Sum('qty'))
            stok_map = {r['barang_id']: (r['total'] or Decimal('0')) for r in rows}

        counts = {
            'menunggu': 0,
            'disetujui_siap': 0,
            'sedang_diajukan': 0,
            'ready_followup': 0,
            'selesai': 0,
            'ditolak': 0,
            'batal_pengadaan': 0,
        }
        for pi in items:
            if pi.status == PermintaanItem.STATUS_MENUNGGU:
                counts['menunggu'] += 1
            elif pi.status == PermintaanItem.STATUS_DISETUJUI:
                if (pi.qty_disetujui or Decimal('0')) > (pi.qty_dikeluarkan or Decimal('0')):
                    counts['disetujui_siap'] += 1
                else:
                    counts['selesai'] += 1
            elif pi.status == PermintaanItem.STATUS_SEDANG_DIAJUKAN:
                counts['sedang_diajukan'] += 1
                if stok_map.get(pi.barang_id, Decimal('0')) > Decimal('0'):
                    counts['ready_followup'] += 1
            elif pi.status == PermintaanItem.STATUS_SELESAI:
                counts['selesai'] += 1
            elif pi.status == PermintaanItem.STATUS_DITOLAK:
                counts['ditolak'] += 1
            elif pi.status == PermintaanItem.STATUS_BATAL_PENGADAAN:
                counts['batal_pengadaan'] += 1
        return counts

    def _get_active_pengeluaran(self, obj):
        outs = [p for p in obj.pengeluaran_list.all() if p.status != Pengeluaran.STATUS_BATAL]
        if not outs:
            outs = list(obj.pengeluaran_list.all())
        return outs[0] if outs else None

    def get_pengeluaran_list(self, obj):
        outs = sorted(
            [p for p in obj.pengeluaran_list.all() if p.status != Pengeluaran.STATUS_BATAL],
            key=lambda p: p.id
        )
        return [
            {
                'id': p.id,
                'nomor': p.nomor,
                'tanggal': str(p.tanggal) if p.tanggal else None,
                'penerima_nama': p.penerima_nama,
                'status': p.status,
                'total_nilai': float(p.total_nilai or 0),
            }
            for p in outs
        ]

    def get_bon_pengeluaran_id(self, obj):
        out = self._get_active_pengeluaran(obj)
        return out.id if out else None

    def get_bon_pengeluaran_nomor(self, obj):
        out = self._get_active_pengeluaran(obj)
        return out.nomor if out else None

    def get_tanggal_penyerahan(self, obj):
        out = self._get_active_pengeluaran(obj)
        return str(out.tanggal) if out and out.tanggal else None

    def get_penerima_nama(self, obj):
        out = self._get_active_pengeluaran(obj)
        return out.penerima_nama if out and out.penerima_nama else None


class PengeluaranItemSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_dasar_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)

    class Meta:
        model = PengeluaranItem
        fields = [
            'id', 'barang', 'barang_nama', 'barang_kode', 'satuan_dasar_kode',
            'permintaan_item', 'qty', 'satuan', 'harga_unit', 'subtotal',
            'keterangan'
        ]


class PengeluaranSerializer(serializers.ModelSerializer):
    items = PengeluaranItemSerializer(many=True, read_only=True)
    permintaan_nomor = serializers.CharField(source='permintaan.nomor', read_only=True)
    ruang_nama = serializers.CharField(source='ruang.nama', read_only=True)
    gudang_nama = serializers.CharField(source='gudang.nama', read_only=True)
    created_by_nama = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_nama = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    can_approve = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Pengeluaran
        fields = [
            'id', 'nomor', 'permintaan', 'permintaan_nomor',
            'gudang', 'gudang_nama', 'ruang', 'ruang_nama',
            'tanggal', 'penerima_nama', 'total_nilai', 'status',
            'catatan', 'alasan_batal', 'legacy_out_id', 'items',
            'created_by', 'created_by_nama',
            'approved_by', 'approved_by_nama', 'approved_at',
            'created_at', 'updated_at', 'can_approve', 'can_cancel'
        ]

    def get_can_approve(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.status != Pengeluaran.STATUS_DRAFT:
            return False
        user = request.user
        if user.is_superuser or getattr(user, 'username', '') == 'super':
            return True
        return bool(getattr(user, 'is_logistik', False) or getattr(user, 'role', '') in ['direktur', 'wakil_direktur'])

    def get_can_cancel(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return DistributionService.can_user_cancel_pengeluaran(request.user, obj)

