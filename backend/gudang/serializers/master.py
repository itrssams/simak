from rest_framework import serializers
from gudang.models import (
    Gudang, GolonganBarang, Satuan, Barang, BarangKemasan, Ruang, Vendor, StokSaldo, LegacyMutasi, StokLedger
)


class GudangSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gudang
        fields = ['id', 'kode', 'nama', 'is_default', 'is_active', 'created_at', 'updated_at']


class GolonganBarangSerializer(serializers.ModelSerializer):
    total_barang = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = GolonganBarang
        fields = ['id', 'kode', 'nama', 'prefix_kode', 'is_active', 'total_barang']


class SatuanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Satuan
        fields = ['id', 'kode', 'nama', 'is_active']

    def validate_kode(self, value):
        return str(value or '').strip().upper()


class BarangKemasanSerializer(serializers.ModelSerializer):
    isi_per_kemasan = serializers.FloatField()

    class Meta:
        model = BarangKemasan
        fields = ['id', 'nama_kemasan', 'isi_per_kemasan', 'is_default_beli']


class BarangSerializer(serializers.ModelSerializer):
    kode = serializers.CharField(required=False, allow_blank=True, default='')
    stok_minimum = serializers.FloatField(required=False, default=0)
    stok_maksimum = serializers.FloatField(required=False, default=0)
    golongan = GolonganBarangSerializer(read_only=True)
    golongan_id = serializers.PrimaryKeyRelatedField(
        queryset=GolonganBarang.objects.all(),
        source='golongan',
        write_only=True
    )
    satuan_dasar = SatuanSerializer(read_only=True)
    satuan_dasar_kode = serializers.CharField(write_only=True, required=False)
    satuan_dasar_id = serializers.PrimaryKeyRelatedField(
        queryset=Satuan.objects.all(),
        source='satuan_dasar',
        write_only=True,
        required=False
    )
    kemasan_list = BarangKemasanSerializer(many=True, read_only=True)
    stok_saat_ini = serializers.SerializerMethodField()
    nilai_rata_rata = serializers.SerializerMethodField()
    is_stok_rendah = serializers.SerializerMethodField()

    class Meta:
        model = Barang
        fields = [
            'id', 'kode', 'nama', 'golongan', 'golongan_id',
            'satuan_dasar', 'satuan_dasar_id', 'satuan_dasar_kode',
            'merk', 'stok_minimum', 'stok_maksimum', 'lead_time_hari',
            'is_active', 'legacy_id_brg', 'kemasan_list',
            'stok_saat_ini', 'nilai_rata_rata', 'is_stok_rendah',
            'created_at', 'updated_at'
        ]

    def get_stok_saat_ini(self, obj):
        saldo = getattr(obj, '_cached_saldo', None)
        if saldo is not None:
            return float(saldo.qty)
        # fallback query
        s = StokSaldo.objects.filter(barang=obj).first()
        return float(s.qty) if s else 0.0

    def get_nilai_rata_rata(self, obj):
        saldo = getattr(obj, '_cached_saldo', None)
        if saldo is not None:
            return float(saldo.avg_cost)
        s = StokSaldo.objects.filter(barang=obj).first()
        return float(s.avg_cost) if s else 0.0

    def get_is_stok_rendah(self, obj):
        stok = self.get_stok_saat_ini(obj)
        min_stok = float(obj.stok_minimum or 0)
        return min_stok > 0 and stok <= min_stok

    def validate(self, attrs):
        # Support either satuan_dasar_id or satuan_dasar_kode (auto-create if new)
        satuan_kode = self.initial_data.get('satuan_dasar_kode')
        if satuan_kode and not attrs.get('satuan_dasar'):
            clean_kode = str(satuan_kode).strip().upper()
            satuan_obj, _ = Satuan.objects.get_or_create(
                kode=clean_kode,
                defaults={'nama': clean_kode, 'is_active': True}
            )
            attrs['satuan_dasar'] = satuan_obj

        if not attrs.get('satuan_dasar') and not self.instance:
            raise serializers.ValidationError({'satuan_dasar': 'Satuan dasar wajib diisi.'})

        # Auto-generate kode if empty
        clean_kode = str(attrs.get('kode') or '').strip().upper()
        if not clean_kode and not (self.instance and self.instance.kode):
            gol = attrs.get('golongan')
            prefix = (gol.prefix_kode if gol and gol.prefix_kode else (gol.kode if gol else 'B1')).strip().upper()
            last_b = Barang.objects.filter(kode__startswith=f"{prefix}-").order_by('-kode').first()
            if last_b:
                try:
                    last_num = int(last_b.kode.split('-')[-1])
                    clean_kode = f"{prefix}-{last_num + 1:04d}"
                except Exception:
                    clean_kode = f"{prefix}-{Barang.objects.count() + 1:04d}"
            else:
                clean_kode = f"{prefix}-0001"
            # Ensure uniqueness
            while Barang.objects.filter(kode=clean_kode).exists():
                try:
                    num = int(clean_kode.split('-')[-1]) + 1
                    clean_kode = f"{prefix}-{num:04d}"
                except Exception:
                    clean_kode = f"{prefix}-{Barang.objects.count() + 1:04d}"
            attrs['kode'] = clean_kode
        elif clean_kode:
            attrs['kode'] = clean_kode

        return attrs

    def create(self, validated_data):
        validated_data.pop('satuan_dasar_kode', None)
        kemasan_data = self.initial_data.get('kemasan_list', [])
        barang = super().create(validated_data)

        # Handle nested kemasan
        if isinstance(kemasan_data, list):
            for k in kemasan_data:
                nama_k = str(k.get('nama_kemasan') or '').strip().upper()
                isi_k = float(k.get('isi_per_kemasan') or 1)
                if nama_k and isi_k > 0:
                    BarangKemasan.objects.create(
                        barang=barang,
                        nama_kemasan=nama_k,
                        isi_per_kemasan=isi_k,
                        is_default_beli=bool(k.get('is_default_beli', False))
                    )
        return barang

    def update(self, instance, validated_data):
        validated_data.pop('satuan_dasar_kode', None)
        kemasan_data = self.initial_data.get('kemasan_list', None)
        barang = super().update(instance, validated_data)

        if isinstance(kemasan_data, list):
            barang.kemasan_list.all().delete()
            for k in kemasan_data:
                nama_k = str(k.get('nama_kemasan') or '').strip().upper()
                isi_k = float(k.get('isi_per_kemasan') or 1)
                if nama_k and isi_k > 0:
                    BarangKemasan.objects.create(
                        barang=barang,
                        nama_kemasan=nama_k,
                        isi_per_kemasan=isi_k,
                        is_default_beli=bool(k.get('is_default_beli', False))
                    )
        return barang


class RuangSerializer(serializers.ModelSerializer):
    unit_nama = serializers.CharField(source='unit.nama', read_only=True)

    class Meta:
        model = Ruang
        fields = ['id', 'kode', 'nama', 'unit', 'unit_nama', 'legacy_id_ruang', 'is_active']


class LegacyMutasiSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)

    class Meta:
        model = LegacyMutasi
        fields = [
            'id', 'legacy_id_brg', 'barang', 'barang_nama', 'barang_kode',
            'jenis', 'tanggal', 'qty_dasar', 'harga_dasar',
            'ruang_nama', 'vendor_nama', 'dokumen_legacy', 'catatan', 'sumber_tabel'
        ]


class StokLedgerSerializer(serializers.ModelSerializer):
    barang_nama = serializers.CharField(source='barang.nama', read_only=True)
    barang_kode = serializers.CharField(source='barang.kode', read_only=True)
    satuan_kode = serializers.CharField(source='barang.satuan_dasar.kode', read_only=True)
    created_by_nama = serializers.SerializerMethodField()

    class Meta:
        model = StokLedger
        fields = [
            'id', 'gudang', 'barang', 'barang_nama', 'barang_kode', 'satuan_kode',
            'tanggal_efektif', 'jenis', 'qty_dasar', 'nilai_unit', 'nilai_total',
            'saldo_qty_setelah', 'saldo_nilai_setelah',
            'sumber_tipe', 'sumber_id', 'sumber_nomor',
            'reversal_of', 'keterangan', 'created_by_nama', 'created_at'
        ]

    def get_created_by_nama(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '-'


class VendorSerializer(serializers.ModelSerializer):
    kc = serializers.CharField(source='kontak_person', required=False, allow_blank=True)
    telp = serializers.CharField(source='telepon', required=False, allow_blank=True)
    created_by_nama = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Vendor
        fields = [
            'id', 'kode', 'nama', 'kategori',
            'kontak_person', 'kc',
            'telepon', 'telp',
            'email', 'alamat',
            'is_active', 'legacy_id_rekanan',
            'created_by', 'created_by_nama',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'kode', 'created_by', 'created_by_nama', 'created_at', 'updated_at']

    def get_created_by_nama(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '-'

