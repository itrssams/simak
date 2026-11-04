from rest_framework import serializers
from .models import AsetKelompok, AsetKategori, AsetJenis, AsetRuangan, Aset, AsetRiwayat, AsetPerbaikan
from .services import hitung_penyusutan_aset, generate_kode_aset, catat_riwayat_kelayakan, catat_mutasi_ruangan


def is_financial_viewer(user):
    """
    Menentukan apakah user boleh melihat nominal uang (harga perolehan, penyusutan, nilai buku).
    Hanya admin aset, akuntansi, manajer ke atas, atau superuser.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff or getattr(user, 'is_aset_admin', False) or getattr(user, 'is_akuntansi', False):
        return True
    if getattr(user, 'role', '') in ('direktur', 'wakil_direktur', 'manajer', 'kepala_seksi') and getattr(user, 'unit', None) and 'umum' in user.unit.nama.lower():
        return True
    return False


class AsetKelompokSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsetKelompok
        fields = '__all__'


class AsetKategoriSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsetKategori
        fields = '__all__'


class AsetJenisSerializer(serializers.ModelSerializer):
    kategori_nama = serializers.CharField(source='kategori.nama', read_only=True)
    kategori_kode = serializers.CharField(source='kategori.kode', read_only=True)
    kelompok_nama = serializers.CharField(source='kelompok_default.nama', read_only=True)
    masa_manfaat_bulan = serializers.IntegerField(source='kelompok_default.masa_manfaat_bulan', read_only=True)

    class Meta:
        model = AsetJenis
        fields = [
            'id', 'kategori', 'kategori_nama', 'kategori_kode',
            'kode', 'nama', 'kelompok_default', 'kelompok_nama',
            'masa_manfaat_bulan', 'sort_order'
        ]


class AsetRuanganSerializer(serializers.ModelSerializer):
    unit_nama = serializers.CharField(source='unit.nama', read_only=True)
    aset_count = serializers.SerializerMethodField()

    class Meta:
        model = AsetRuangan
        fields = ['id', 'nama', 'unit', 'unit_nama', 'lantai_gedung', 'is_active', 'keterangan', 'aset_count']

    def get_aset_count(self, obj):
        return obj.aset_list.count()


def clean_media_url(url):
    if not url or not isinstance(url, str):
        return url
    if 'backend:8000' in url:
        return url.replace('http://backend:8000', '')
    return url


class AsetRiwayatSerializer(serializers.ModelSerializer):
    aksi_label = serializers.CharField(source='get_aksi_display', read_only=True)
    dilakukan_oleh_nama = serializers.SerializerMethodField()

    class Meta:
        model = AsetRiwayat
        fields = [
            'id', 'aksi', 'aksi_label',
            'status_kelayakan_lama', 'status_kelayakan_baru',
            'unit_lama', 'unit_baru',
            'ruangan_lama', 'ruangan_baru',
            'catatan', 'foto', 'dilakukan_oleh', 'dilakukan_oleh_nama',
            'created_at'
        ]

    def get_dilakukan_oleh_nama(self, obj):
        if obj.dilakukan_oleh:
            return obj.dilakukan_oleh.get_full_name() or obj.dilakukan_oleh.username
        return 'Sistem'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('foto'):
            data['foto'] = clean_media_url(data['foto'])
        return data


class AsetListSerializer(serializers.ModelSerializer):
    jenis_nama = serializers.CharField(source='jenis.nama', read_only=True)
    jenis_kode = serializers.CharField(source='jenis.kode', read_only=True)
    kategori_nama = serializers.CharField(source='jenis.kategori.nama', read_only=True)
    kategori_kode = serializers.CharField(source='jenis.kategori.kode', read_only=True)
    unit_nama = serializers.CharField(source='unit.nama', read_only=True)
    ruangan_nama = serializers.CharField(source='ruangan.nama', read_only=True)
    kelompok_nama = serializers.CharField(source='kelompok.nama', read_only=True)
    status_kelayakan_label = serializers.CharField(source='get_status_kelayakan_display', read_only=True)
    status_aset_label = serializers.CharField(source='get_status_aset_display', read_only=True)
    status_data_label = serializers.CharField(source='get_status_data_display', read_only=True)
    penyusutan = serializers.SerializerMethodField()

    class Meta:
        model = Aset
        fields = [
            'id', 'kode_aset', 'deskripsi', 'merk', 'spesifikasi', 'nomor_seri', 'nomor_registrasi', 'perlu_kalibrasi',
            'jenis', 'jenis_nama', 'jenis_kode', 'kategori_nama', 'kategori_kode',
            'unit', 'unit_nama', 'ruangan', 'ruangan_nama', 'lokasi_teks',
            'status_kelayakan', 'status_kelayakan_label',
            'status_aset', 'status_aset_label',
            'status_data', 'status_data_label',
            'status_kepemilikan',
            'tahun_pembuatan', 'bulan_perolehan',
            'foto', 'foto_awal', 'foto_terkini', 'rekomendasi_tindakan', 'catatan',
            'kelompok', 'kelompok_nama', 'masa_manfaat_bulan',
            'updated_at',
            # Bagian finansial (akan disensor jika bukan admin/finansial):
            'harga_perolehan', 'penyusutan'
        ]

    def get_penyusutan(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        if not is_financial_viewer(user):
            return None
        return hitung_penyusutan_aset(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = request.user if request else None
        # Sembunyikan harga perolehan untuk user unit non-admin
        if not is_financial_viewer(user):
            data['harga_perolehan'] = None
        for key in ('foto', 'foto_awal', 'foto_terkini'):
            if data.get(key):
                data[key] = clean_media_url(data[key])
        return data


class AsetDetailSerializer(serializers.ModelSerializer):
    jenis_nama = serializers.CharField(source='jenis.nama', read_only=True)
    jenis_kode = serializers.CharField(source='jenis.kode', read_only=True)
    kategori_nama = serializers.CharField(source='jenis.kategori.nama', read_only=True)
    kategori_kode = serializers.CharField(source='jenis.kategori.kode', read_only=True)
    unit_nama = serializers.CharField(source='unit.nama', read_only=True)
    ruangan_nama = serializers.CharField(source='ruangan.nama', read_only=True)
    kelompok_nama = serializers.CharField(source='kelompok.nama', read_only=True)
    status_kelayakan_label = serializers.CharField(source='get_status_kelayakan_display', read_only=True)
    status_aset_label = serializers.CharField(source='get_status_aset_display', read_only=True)
    status_data_label = serializers.CharField(source='get_status_data_display', read_only=True)
    penyusutan = serializers.SerializerMethodField()
    riwayat_list = AsetRiwayatSerializer(many=True, read_only=True)
    perbaikan_list = serializers.SerializerMethodField()

    def get_perbaikan_list(self, obj):
        return AsetPerbaikanSerializer(obj.perbaikan_list.all()[:10], many=True).data

    class Meta:
        model = Aset
        fields = [
            'id', 'kode_aset', 'deskripsi', 'merk', 'spesifikasi', 'nomor_seri', 'nomor_registrasi', 'perlu_kalibrasi',
            'jenis', 'jenis_nama', 'jenis_kode', 'kategori_nama', 'kategori_kode',
            'unit', 'unit_nama', 'ruangan', 'ruangan_nama', 'lokasi_teks',
            'status_kelayakan', 'status_kelayakan_label',
            'status_aset', 'status_aset_label',
            'status_data', 'status_data_label',
            'status_kepemilikan',
            'tahun_pembuatan', 'bulan_perolehan',
            'kelompok', 'kelompok_nama', 'masa_manfaat_bulan',
            'foto', 'foto_awal', 'foto_terkini', 'rekomendasi_tindakan', 'catatan',
            'created_at', 'updated_at', 'riwayat_list', 'perbaikan_list',
            'harga_perolehan', 'penyusutan'
        ]

    def get_penyusutan(self, obj):
        request = self.context.get('request')
        user = request.user if request else None
        if not is_financial_viewer(user):
            return None
        return hitung_penyusutan_aset(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = request.user if request else None
        if not is_financial_viewer(user):
            data['harga_perolehan'] = None
        for key in ('foto', 'foto_awal', 'foto_terkini'):
            if data.get(key):
                data[key] = clean_media_url(data[key])
        return data


class AsetInputSerializer(serializers.ModelSerializer):
    """
    Serializer untuk input / edit aset oleh Admin Aset.
    """
    kode_aset = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Aset
        fields = [
            'id', 'kode_aset', 'jenis', 'deskripsi', 'merk', 'spesifikasi', 'nomor_seri', 'nomor_registrasi', 'perlu_kalibrasi',
            'unit', 'ruangan', 'lokasi_teks',
            'status_kelayakan', 'status_aset', 'status_kepemilikan',
            'tahun_pembuatan', 'bulan_perolehan', 'harga_perolehan',
            'kelompok', 'masa_manfaat_bulan',
            'rekomendasi_tindakan', 'catatan', 'foto', 'foto_awal', 'foto_terkini'
        ]

    def validate(self, data):
        # Auto tentukan kelompok & masa manfaat dari jenis jika belum diisi
        jenis = data.get('jenis')
        kelompok = data.get('kelompok')
        masa_manfaat = data.get('masa_manfaat_bulan')

        if jenis and not kelompok and jenis.kelompok_default:
            data['kelompok'] = jenis.kelompok_default

        if data.get('kelompok') and (not masa_manfaat or masa_manfaat == 0):
            data['masa_manfaat_bulan'] = data['kelompok'].masa_manfaat_bulan

        # Status kelengkapan data
        harga = data.get('harga_perolehan', 0)
        bulan_perolehan = data.get('bulan_perolehan')
        if not harga or harga <= 0 or not bulan_perolehan:
            data['status_data'] = 'belum_lengkap'
        else:
            data['status_data'] = 'lengkap'

        return data

    def create(self, validated_data):
        request = self.context.get('request')
        user = request.user if request else None

        # Auto kode aset jika kosong
        if not validated_data.get('kode_aset'):
            jenis = validated_data['jenis']
            validated_data['kode_aset'] = generate_kode_aset(jenis)

        if user and user.is_authenticated:
            validated_data['created_by'] = user
            validated_data['updated_by'] = user

        aset = super().create(validated_data)

        # Catat riwayat pendaftaran pertama kali
        AsetRiwayat.objects.create(
            aset=aset,
            aksi='dibuat',
            status_kelayakan_lama='',
            status_kelayakan_baru=aset.status_kelayakan,
            unit_lama='',
            unit_baru=aset.unit.nama if aset.unit else '',
            ruangan_lama='',
            ruangan_baru=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            catatan=f'Aset terdaftar pertama kali dengan kode {aset.kode_aset}',
            dilakukan_oleh=user,
        )

        return aset

    def update(self, instance, validated_data):
        request = self.context.get('request')
        user = request.user if request else None
        if user and user.is_authenticated:
            validated_data['updated_by'] = user

        # Deteksi mutasi unit atau ruangan
        unit_lama = instance.unit
        ruangan_lama_nama = instance.lokasi_teks
        kelayakan_lama = instance.status_kelayakan

        unit_baru = validated_data.get('unit', unit_lama)
        ruangan_baru = validated_data.get('ruangan', instance.ruangan)
        lokasi_teks_baru = validated_data.get('lokasi_teks', instance.lokasi_teks)
        kelayakan_baru = validated_data.get('status_kelayakan', kelayakan_lama)

        aset = super().update(instance, validated_data)

        # Catat mutasi jika unit atau ruangan berubah
        if unit_baru != unit_lama or lokasi_teks_baru != ruangan_lama_nama:
            AsetRiwayat.objects.create(
                aset=aset,
                aksi='mutasi_ruangan',
                unit_lama=unit_lama.nama if unit_lama else '',
                unit_baru=unit_baru.nama if unit_baru else '',
                ruangan_lama=ruangan_lama_nama,
                ruangan_baru=lokasi_teks_baru or (ruangan_baru.nama if ruangan_baru else ''),
                status_kelayakan_lama=kelayakan_lama,
                status_kelayakan_baru=kelayakan_baru,
                catatan='Mutasi lokasi aset diperbarui oleh admin.',
                dilakukan_oleh=user,
            )

        # Catat kelayakan jika berubah
        if kelayakan_baru != kelayakan_lama:
            AsetRiwayat.objects.create(
                aset=aset,
                aksi='perubahan_kelayakan',
                status_kelayakan_lama=kelayakan_lama,
                status_kelayakan_baru=kelayakan_baru,
                catatan='Status kelayakan diubah oleh admin.',
                dilakukan_oleh=user,
            )

        return aset


class AsetKelayakanUpdateSerializer(serializers.Serializer):
    """
    Serializer khusus untuk update status kelayakan fisik oleh User Unit atau Admin.
    """
    status_kelayakan = serializers.ChoiceField(choices=Aset.STATUS_KELAYAKAN_CHOICES)
    rekomendasi_tindakan = serializers.CharField(required=False, allow_blank=True)
    catatan = serializers.CharField(required=False, allow_blank=True)
    foto = serializers.ImageField(required=False, allow_null=True)



class AsetPerbaikanSerializer(serializers.ModelSerializer):
    aset_kode = serializers.CharField(source='aset.kode_aset', read_only=True)
    aset_nama = serializers.CharField(source='aset.deskripsi', read_only=True)
    aset_merk = serializers.CharField(source='aset.merk', read_only=True)
    unit_id = serializers.IntegerField(source='aset.unit.id', read_only=True)
    unit_nama = serializers.CharField(source='aset.unit.nama', read_only=True)
    ruangan_nama = serializers.CharField(source='aset.ruangan.nama', read_only=True)
    lokasi_teks = serializers.CharField(source='aset.lokasi_teks', read_only=True)
    status_kelayakan = serializers.CharField(source='aset.status_kelayakan', read_only=True)
    status_kelayakan_label = serializers.CharField(source='aset.get_status_kelayakan_display', read_only=True)

    tingkat_kerusakan_label = serializers.CharField(source='get_tingkat_kerusakan_display', read_only=True)
    status_perbaikan_label = serializers.CharField(source='get_status_perbaikan_display', read_only=True)
    kondisi_setelah_perbaikan_label = serializers.CharField(source='get_kondisi_setelah_perbaikan_display', read_only=True)
    pelapor_nama = serializers.SerializerMethodField()

    class Meta:
        model = AsetPerbaikan
        fields = [
            'id', 'nomor_tiket', 'aset', 'aset_kode', 'aset_nama', 'aset_merk',
            'unit_id', 'unit_nama', 'ruangan_nama', 'lokasi_teks',
            'status_kelayakan', 'status_kelayakan_label',
            'tanggal_laporan', 'tanggal_kerusakan', 'rincian_kerusakan',
            'tingkat_kerusakan', 'tingkat_kerusakan_label',
            'status_perbaikan', 'status_perbaikan_label',
            'tindak_lanjut', 'kondisi_setelah_perbaikan', 'kondisi_setelah_perbaikan_label',
            'tindak_lanjut_berikutnya',
            'foto_kerusakan', 'foto_setelah_perbaikan',
            'biaya_perbaikan', 'teknisi',
            'pelapor', 'pelapor_nama', 'tanggal_selesai',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['nomor_tiket', 'created_at', 'updated_at']

    def get_pelapor_nama(self, obj):
        if obj.pelapor:
            return obj.pelapor.get_full_name() or obj.pelapor.username
        return '-'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for key in ('foto_kerusakan', 'foto_setelah_perbaikan'):
            if data.get(key):
                data[key] = clean_media_url(data[key])
        return data

    def validate(self, data):
        kondisi = data.get('kondisi_setelah_perbaikan')
        tindak_lanjut_berikutnya = data.get('tindak_lanjut_berikutnya')
        if kondisi == 'masih_bermasalah' and not (tindak_lanjut_berikutnya and tindak_lanjut_berikutnya.strip()):
            raise serializers.ValidationError({
                'tindak_lanjut_berikutnya': 'Wajib mengisi tindak lanjut berikutnya jika kondisi setelah perbaikan masih bermasalah.'
            })
        return data
