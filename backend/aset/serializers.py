from rest_framework import serializers
from decimal import Decimal
from .models import (
    AsetKelompok, AsetKategori, AsetJenis, AsetRuangan,
    Aset, AsetRiwayat, AsetPerbaikan, AsetPerbaikanLog
)
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


def is_aset_manager(user):
    """
    Menentukan apakah user memiliki hak akses utama manajemen aset
    (tindak lanjut perbaikan, update status aset, pendaftaran aset, dsb).
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'is_aset_admin', False):
        return True
    if getattr(user, 'role', '') in ('direktur', 'wakil_direktur', 'manajer'):
        return True
    if getattr(user, 'role', '') == 'kepala_seksi' and getattr(user, 'unit', None) and 'umum' in user.unit.nama.lower():
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
        errors = {}

        # 1. Validasi Kolom Mandatori (Wajib semua KECUALI nomor_seri, nomor_registrasi, foto_terkini, kode_aset, rekomendasi_tindakan, catatan)
        required_fields = {
            'jenis': 'Jenis barang',
            'deskripsi': 'Deskripsi / nama barang',
            'merk': 'Merek (merk)',
            'spesifikasi': 'Spesifikasi / kapasitas',
            'unit': 'Unit penanggung jawab',
            'ruangan': 'Ruangan master',
            'lokasi_teks': 'Lokasi akurat / keterangan ruang',
            'status_kelayakan': 'Tingkat kelayakan',
            'status_aset': 'Status operasional',
            'status_kepemilikan': 'Status kepemilikan',
            'bulan_perolehan': 'Tanggal perolehan',
        }

        # Jika sedang edit (instance ada), gunakan value eksisting jika tidak dikirim dalam data partial
        for field, label in required_fields.items():
            val = data.get(field, getattr(self.instance, field, None) if self.instance else None)
            if val is None or (isinstance(val, str) and not val.strip()):
                errors[field] = f'{label} wajib diisi.'

        # Validasi harga perolehan harus > 0
        harga = data.get('harga_perolehan', getattr(self.instance, 'harga_perolehan', None) if self.instance else None)
        if harga is None:
            errors['harga_perolehan'] = 'Harga perolehan wajib diisi.'
        else:
            try:
                if Decimal(str(harga)) <= 0:
                    errors['harga_perolehan'] = 'Harga perolehan wajib lebih dari 0.'
            except Exception:
                errors['harga_perolehan'] = 'Format harga perolehan tidak valid.'

        # Validasi foto awal wajib pada pendaftaran baru
        if not self.instance:
            foto_awal = data.get('foto_awal') or data.get('foto')
            if not foto_awal:
                errors['foto_awal'] = 'Foto kondisi awal wajib diunggah saat pendaftaran aset baru.'

        # 2. Handling Anti Duplikat
        # 2a. Anti Duplikat Nomor Seri (S/N)
        nomor_seri = (data.get('nomor_seri') if 'nomor_seri' in data else getattr(self.instance, 'nomor_seri', '')) or ''
        if nomor_seri.strip():
            sn_clean = nomor_seri.strip()
            sn_qs = Aset.objects.filter(nomor_seri__iexact=sn_clean)
            if self.instance:
                sn_qs = sn_qs.exclude(pk=self.instance.pk)
            if sn_qs.exists():
                existing = sn_qs.first()
                errors['nomor_seri'] = f'Nomor seri "{sn_clean}" sudah terdaftar pada aset {existing.kode_aset} ({existing.deskripsi}).'

        # 2b. Anti Duplikat Kode Aset (jika diisi manual)
        kode_aset = (data.get('kode_aset') if 'kode_aset' in data else getattr(self.instance, 'kode_aset', '')) or ''
        if kode_aset.strip():
            kd_clean = kode_aset.strip()
            kd_qs = Aset.objects.filter(kode_aset__iexact=kd_clean)
            if self.instance:
                kd_qs = kd_qs.exclude(pk=self.instance.pk)
            if kd_qs.exists():
                errors['kode_aset'] = f'Kode aset "{kd_clean}" sudah digunakan di sistem.'

        # 2c. Anti Duplikat Kombinasi Fisik Aset Baru (jika nomor seri kosong)
        if not self.instance and not nomor_seri.strip():
            deskripsi = (data.get('deskripsi') or '').strip()
            merk = (data.get('merk') or '').strip()
            unit = data.get('unit')
            ruangan = data.get('ruangan')
            if deskripsi and merk and unit:
                combo_qs = Aset.objects.filter(
                    deskripsi__iexact=deskripsi,
                    merk__iexact=merk,
                    unit=unit,
                    status_aset__in=['aktif', 'dalam_perbaikan']
                )
                if ruangan:
                    combo_qs = combo_qs.filter(ruangan=ruangan)
                if combo_qs.exists():
                    existing = combo_qs.first()
                    errors['deskripsi'] = f'Peringatan Duplikasi: Aset serupa "{deskripsi}" ({merk}) di unit/ruangan ini sudah terdaftar ({existing.kode_aset}). Mohon pastikan kembali atau cantumkan nomor seri unik untuk membedakan.'

        if errors:
            raise serializers.ValidationError(errors)

        # Auto tentukan kelompok & masa manfaat dari jenis jika belum diisi
        jenis = data.get('jenis', getattr(self.instance, 'jenis', None) if self.instance else None)
        kelompok = data.get('kelompok', getattr(self.instance, 'kelompok', None) if self.instance else None)
        masa_manfaat = data.get('masa_manfaat_bulan', getattr(self.instance, 'masa_manfaat_bulan', None) if self.instance else None)

        if jenis and not kelompok and jenis.kelompok_default:
            data['kelompok'] = jenis.kelompok_default

        if data.get('kelompok') and (not masa_manfaat or masa_manfaat == 0):
            data['masa_manfaat_bulan'] = data['kelompok'].masa_manfaat_bulan

        # Status kelengkapan data
        bulan_perolehan = data.get('bulan_perolehan', getattr(self.instance, 'bulan_perolehan', None) if self.instance else None)
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



class AsetPerbaikanLogSerializer(serializers.ModelSerializer):
    status_sebelum_label = serializers.SerializerMethodField()
    status_sesudah_label = serializers.SerializerMethodField()
    dibuat_oleh_nama = serializers.SerializerMethodField()
    foto = serializers.SerializerMethodField()

    class Meta:
        model = AsetPerbaikanLog
        fields = [
            'id', 'perbaikan', 'status_sebelum', 'status_sebelum_label',
            'status_sesudah', 'status_sesudah_label',
            'tindakan', 'teknisi', 'estimasi_biaya', 'biaya_riil',
            'kondisi_setelah_perbaikan', 'tindak_lanjut_berikutnya',
            'foto', 'dibuat_oleh', 'dibuat_oleh_nama', 'created_at'
        ]

    def get_status_sebelum_label(self, obj):
        choices = dict(AsetPerbaikan.STATUS_PERBAIKAN_CHOICES)
        return choices.get(obj.status_sebelum, obj.status_sebelum or '-')

    def get_status_sesudah_label(self, obj):
        choices = dict(AsetPerbaikan.STATUS_PERBAIKAN_CHOICES)
        return choices.get(obj.status_sesudah, obj.status_sesudah or '-')

    def get_dibuat_oleh_nama(self, obj):
        if obj.dibuat_oleh:
            return obj.dibuat_oleh.get_full_name() or obj.dibuat_oleh.username
        return 'Sistem'

    def get_foto(self, obj):
        if obj.foto:
            return clean_media_url(obj.foto.url)
        return None


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
    log_list = AsetPerbaikanLogSerializer(many=True, read_only=True)

    class Meta:
        model = AsetPerbaikan
        fields = [
            'id', 'nomor_tiket', 'aset', 'aset_kode', 'aset_nama', 'aset_merk',
            'unit_id', 'unit_nama', 'ruangan_nama', 'lokasi_teks',
            'status_kelayakan', 'status_kelayakan_label',
            'tanggal_laporan', 'tanggal_kerusakan', 'rincian_kerusakan',
            'tingkat_kerusakan', 'tingkat_kerusakan_label',
            'status_perbaikan', 'status_perbaikan_label',
            'teknisi', 'hasil_inspeksi', 'estimasi_biaya',
            'tindak_lanjut', 'kondisi_setelah_perbaikan', 'kondisi_setelah_perbaikan_label',
            'tindak_lanjut_berikutnya',
            'foto_kerusakan', 'foto_setelah_perbaikan',
            'biaya_perbaikan',
            'pelapor', 'pelapor_nama', 'tanggal_selesai',
            'log_list',
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
        # Ambil status saat ini jika sedang update
        status_lama = self.instance.status_perbaikan if self.instance else 'belum_mulai'
        status_baru = data.get('status_perbaikan', status_lama)
        teknisi = data.get('teknisi', getattr(self.instance, 'teknisi', ''))
        hasil_inspeksi = data.get('hasil_inspeksi', getattr(self.instance, 'hasil_inspeksi', ''))
        tindak_lanjut = data.get('tindak_lanjut', getattr(self.instance, 'tindak_lanjut', ''))
        estimasi_biaya = data.get('estimasi_biaya', getattr(self.instance, 'estimasi_biaya', 0))

        # Validasi perpindahan status:
        # 1. Pindah ke inspeksi: wajib mengisi teknisi
        if status_baru == 'inspeksi' and not (teknisi and teknisi.strip()):
            raise serializers.ValidationError({
                'teknisi': 'Untuk memindahkan status ke "Inspeksi / Penugasan Teknisi", wajib mengisi nama Teknisi.'
            })

        # 2. Pindah ke dalam_proses: wajib mengisi hasil inspeksi/tindak lanjut dan estimasi biaya
        if status_baru == 'dalam_proses':
            errors = {}
            if not (hasil_inspeksi and hasil_inspeksi.strip()) and not (tindak_lanjut and tindak_lanjut.strip()):
                errors['hasil_inspeksi'] = 'Wajib mengisi hasil inspeksi teknisi atau rencana tindak lanjut untuk memulai proses perbaikan.'
            if estimasi_biaya is None or Decimal(str(estimasi_biaya)) < 0:
                errors['estimasi_biaya'] = 'Wajib mencantumkan estimasi biaya perbaikan (bisa Rp 0 jika tanpa biaya/garansi).'
            if errors:
                raise serializers.ValidationError(errors)

        # 3. Jika selesai dengan kondisi masih_bermasalah, wajib ada tindak lanjut berikutnya
        kondisi = data.get('kondisi_setelah_perbaikan', getattr(self.instance, 'kondisi_setelah_perbaikan', None))
        tindak_lanjut_berikutnya = data.get('tindak_lanjut_berikutnya', getattr(self.instance, 'tindak_lanjut_berikutnya', ''))
        if kondisi == 'masih_bermasalah' and not (tindak_lanjut_berikutnya and tindak_lanjut_berikutnya.strip()):
            raise serializers.ValidationError({
                'tindak_lanjut_berikutnya': 'Wajib mengisi tindak lanjut berikutnya jika kondisi setelah perbaikan masih bermasalah.'
            })
        return data


class AsetPerbaikanFinishSerializer(serializers.Serializer):
    """
    Serializer khusus saat menyelesaikan perbaikan (Finish Pop-up):
    - Kondisi setelah perbaikan (normal vs masih bermasalah)
    - Update penetapan status kelayakan fisik (Grade A-E)
    - Biaya perbaikan riil
    - Tindak lanjut berikutnya (jika masih bermasalah)
    - Foto bukti & tanggal selesai
    """
    kondisi_setelah_perbaikan = serializers.ChoiceField(choices=AsetPerbaikan.KONDISI_SETELAH_CHOICES)
    status_kelayakan_baru = serializers.ChoiceField(choices=Aset.STATUS_KELAYAKAN_CHOICES)
    biaya_riil = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0'))
    tindak_lanjut_berikutnya = serializers.CharField(required=False, allow_blank=True)
    catatan_penutupan = serializers.CharField(required=False, allow_blank=True)
    tanggal_selesai = serializers.DateField(required=False, allow_null=True)
    foto_setelah_perbaikan = serializers.ImageField(required=False, allow_null=True)

    def validate(self, data):
        kondisi = data.get('kondisi_setelah_perbaikan')
        tindak_lanjut_berikutnya = data.get('tindak_lanjut_berikutnya')
        if kondisi == 'masih_bermasalah' and not (tindak_lanjut_berikutnya and tindak_lanjut_berikutnya.strip()):
            raise serializers.ValidationError({
                'tindak_lanjut_berikutnya': 'Wajib mengisi tindak lanjut berikutnya jika kondisi setelah perbaikan masih bermasalah.'
            })
        return data

