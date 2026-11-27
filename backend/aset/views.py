from rest_framework import viewsets, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q, Count, Sum
from decimal import Decimal
from django.utils import timezone

from .models import (
    AsetKelompok, AsetKategori, AsetJenis, AsetRuangan,
    Aset, AsetRiwayat, AsetPerbaikan, AsetPerbaikanLog,
    AsetPengaturan, AsetTeknisi,
)
from .serializers import (
    AsetPerbaikanSerializer, AsetPerbaikanFinishSerializer, AsetPerbaikanLogSerializer,
    AsetKelompokSerializer, AsetKategoriSerializer, AsetJenisSerializer,
    AsetRuanganSerializer, AsetRiwayatSerializer,
    AsetListSerializer, AsetDetailSerializer, AsetInputSerializer,
    AsetKelayakanUpdateSerializer, AsetPengaturanSerializer, AsetTeknisiSerializer,
    is_financial_viewer, is_aset_manager,
)
from .services import hitung_penyusutan_aset, generate_jadwal_penyusutan, catat_riwayat_kelayakan, get_ai_asset_suggestions


class IsAsetAdminOrReadOnly(permissions.BasePermission):
    """
    Hanya admin/pengelola aset atau superuser yang boleh create/update/delete master aset.
    User biasa hanya boleh membaca.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_aset_manager(request.user)


class AsetKelompokViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AsetKelompok.objects.all()
    serializer_class = AsetKelompokSerializer
    permission_classes = [permissions.IsAuthenticated]


class AsetKategoriViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AsetKategori.objects.all()
    serializer_class = AsetKategoriSerializer
    permission_classes = [permissions.IsAuthenticated]


class AsetJenisViewSet(viewsets.ModelViewSet):
    queryset = AsetJenis.objects.select_related('kategori', 'kelompok_default').all()
    serializer_class = AsetJenisSerializer
    permission_classes = [permissions.IsAuthenticated, IsAsetAdminOrReadOnly]
    filterset_fields = ['kategori', 'kategori__kode']

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(nama__icontains=q) | Q(kode__icontains=q))
        return qs

    @action(detail=False, methods=['get'], url_path='suggest')
    def suggest(self, request):
        """
        Endpoint AI Suggestion / Kamus Standar untuk membantu mengisi Jenis Aset
        tanpa salah ketik (anti-typo) dan otomatis merekomendasikan Kelas Aset PMK 72.
        """
        q = request.query_params.get('q', '').strip()
        data = get_ai_asset_suggestions(q)
        return Response(data)


class AsetRuanganViewSet(viewsets.ModelViewSet):
    queryset = AsetRuangan.objects.select_related('unit').all()
    serializer_class = AsetRuanganSerializer
    permission_classes = [permissions.IsAuthenticated, IsAsetAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        unit_id = self.request.query_params.get('unit_id')
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs


class OptionalPageNumberPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    page_size = 10
    max_page_size = 200

    def get_page_size(self, request):
        if 'page' not in request.query_params and self.page_size_query_param not in request.query_params:
            return None
        if self.page_size_query_param in request.query_params:
            return super().get_page_size(request)
        return self.page_size


class AsetViewSet(viewsets.ModelViewSet):
    queryset = Aset.objects.select_related('jenis', 'jenis__kategori', 'unit', 'ruangan', 'kelompok').all()
    serializer_class = AsetListSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return AsetInputSerializer
        if self.action == 'retrieve':
            return AsetDetailSerializer
        return AsetListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Aset.objects.select_related('jenis', 'jenis__kategori', 'unit', 'ruangan', 'kelompok').all()
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'riwayat_list__dilakukan_oleh',
                'perbaikan_list__pelapor',
                'perbaikan_list__log_list__dibuat_oleh',
            )

        # Jika user BUKAN admin aset / financial viewer, batasi HANYA melihat unit miliknya
        if not is_financial_viewer(user):
            if user.unit_id:
                qs = qs.filter(unit_id=user.unit_id)
            else:
                qs = qs.none()

        # Query Filters
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(kode_aset__icontains=q) |
                Q(deskripsi__icontains=q) |
                Q(merk__icontains=q) |
                Q(spesifikasi__icontains=q) |
                Q(nomor_seri__icontains=q) |
                Q(nomor_registrasi__icontains=q) |
                Q(lokasi_teks__icontains=q)
            )

        unit_id = self.request.query_params.get('unit_id')
        if unit_id and is_financial_viewer(user):
            qs = qs.filter(unit_id=unit_id)

        ruangan_id = self.request.query_params.get('ruangan_id')
        if ruangan_id:
            qs = qs.filter(ruangan_id=ruangan_id)

        kategori_kode = self.request.query_params.get('kategori_kode')
        if kategori_kode:
            qs = qs.filter(jenis__kategori__kode=kategori_kode)

        jenis_id = self.request.query_params.get('jenis_id')
        if jenis_id:
            qs = qs.filter(jenis_id=jenis_id)

        kelayakan_list = [
            item.strip()
            for val in self.request.query_params.getlist('status_kelayakan')
            for item in val.split(',')
            if item.strip()
        ]
        if kelayakan_list:
            qs = qs.filter(status_kelayakan__in=kelayakan_list)

        perlu_kalibrasi = self.request.query_params.get('perlu_kalibrasi')
        if perlu_kalibrasi in ('true', '1'):
            qs = qs.filter(perlu_kalibrasi=True)
        elif perlu_kalibrasi in ('false', '0'):
            qs = qs.filter(perlu_kalibrasi=False)

        status_aset = self.request.query_params.get('status_aset')
        if status_aset:
            qs = qs.filter(status_aset=status_aset)

        status_data = self.request.query_params.get('status_data')
        if status_data:
            qs = qs.filter(status_data=status_data)

        status_verif_list = []
        for raw_val in self.request.query_params.getlist('status_verifikasi'):
            for part in raw_val.split(','):
                cleaned = part.strip()
                if cleaned and cleaned != 'all':
                    status_verif_list.append(cleaned)
        if status_verif_list:
            qs = qs.filter(status_verifikasi__in=status_verif_list)

        return qs.order_by('kode_aset')

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        user = request.user
        # Jika bukan pengelola / viewer finansial, pastikan aset berada di unitnya
        if not is_financial_viewer(user) and obj.unit_id != user.unit_id:
            self.permission_denied(request, message="Anda tidak memiliki akses ke aset di luar unit Anda.")

    @action(detail=False, methods=['get', 'post', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def pengaturan(self, request):
        pengaturan = AsetPengaturan.get_solo()
        if request.method in ('POST', 'PATCH'):
            if not is_aset_manager(request.user):
                return Response(
                    {'detail': 'Hanya Admin Aset yang dapat mengubah pengaturan pendaftaran unit.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = AsetPengaturanSerializer(pengaturan, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(updated_by=request.user)
            return Response(serializer.data)
        return Response(AsetPengaturanSerializer(pengaturan).data)

    def _mutable_unit_payload(self, data, unit_id):
        if hasattr(data, 'copy'):
            payload = data.copy()
        else:
            payload = dict(data)
        payload['unit'] = unit_id
        return payload

    def create(self, request, *args, **kwargs):
        user = request.user
        if is_aset_manager(user):
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(
                status_verifikasi='terverifikasi',
                verified_by=user,
                verified_at=timezone.now(),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        pengaturan = AsetPengaturan.get_solo()
        if not pengaturan.izinkan_pendaftaran_unit:
            return Response(
                {'detail': 'Pendaftaran aset mandiri oleh unit sedang ditutup oleh Admin Aset.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user.unit_id:
            return Response(
                {'detail': 'Akun Anda belum terhubung dengan Unit penanggung jawab.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = self._mutable_unit_payload(request.data, user.unit_id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            status_verifikasi='menunggu_verifikasi',
            verified_by=None,
            verified_at=None,
            catatan_verifikasi='',
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        user = request.user

        if is_aset_manager(user):
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        if instance.unit_id != user.unit_id:
            return Response(
                {'detail': 'Anda tidak memiliki akses untuk mengubah aset unit lain.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if instance.status_verifikasi not in ('menunggu_verifikasi', 'ditolak'):
            return Response(
                {'detail': 'Aset yang sudah terverifikasi hanya dapat diubah oleh Admin Aset.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = self._mutable_unit_payload(request.data, instance.unit_id)
        serializer = self.get_serializer(instance, data=payload, partial=partial)
        serializer.is_valid(raise_exception=True)
        aset = serializer.save(
            status_verifikasi='menunggu_verifikasi',
            verified_by=None,
            verified_at=None,
            catatan_verifikasi='',
        )
        AsetRiwayat.objects.create(
            aset=aset,
            aksi='update_data',
            catatan='Data pendaftaran aset diperbarui oleh unit dan diajukan kembali untuk verifikasi.',
            dilakukan_oleh=user,
        )
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def verifikasi(self, request, pk=None):
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya Admin Aset (Mas Febry / Pak Edy / Bu Nevi / Admin) yang berhak memverifikasi aset.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        aset = self.get_object()
        catatan = (request.data.get('catatan_verifikasi') or '').strip()

        raw_buat_baru = request.data.get('buat_ruangan_baru', False)
        buat_baru = raw_buat_baru in (True, 'true', 'True', '1', 1)
        ruangan_id_param = request.data.get('ruangan')
        ruangan_lama_nama = aset.ruangan.nama if aset.ruangan else (aset.lokasi_teks or '')

        if buat_baru:
            nama_baru = (request.data.get('nama_ruangan_baru') or aset.lokasi_teks or '').strip()
            if not nama_baru:
                return Response(
                    {'nama_ruangan_baru': 'Nama ruangan baru wajib diisi untuk membuat master ruangan.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            lantai_gedung = (request.data.get('lantai_gedung') or '').strip()
            existing_room = AsetRuangan.objects.filter(unit=aset.unit, nama__iexact=nama_baru).first()
            if existing_room:
                if not existing_room.is_active:
                    existing_room.is_active = True
                    existing_room.save(update_fields=['is_active'])
                aset.ruangan = existing_room
            else:
                aset.ruangan = AsetRuangan.objects.create(
                    unit=aset.unit,
                    nama=nama_baru,
                    lantai_gedung=lantai_gedung,
                    is_active=True,
                )
        elif ruangan_id_param not in (None, ''):
            room_obj = AsetRuangan.objects.filter(pk=ruangan_id_param).first()
            if not room_obj:
                return Response(
                    {'ruangan': 'Ruangan master yang dipilih tidak ditemukan.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if room_obj.unit_id != aset.unit_id:
                return Response(
                    {'ruangan': 'Ruangan master harus berada pada unit yang sama dengan aset.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            aset.ruangan = room_obj

        if not aset.ruangan_id:
            return Response(
                {'ruangan': 'Aset belum memiliki Ruangan Master. Pilih ruangan yang sesuai atau buat master ruangan baru sebelum memverifikasi.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        aset.status_verifikasi = 'terverifikasi'
        aset.verified_by = request.user
        aset.verified_at = timezone.now()
        aset.catatan_verifikasi = catatan
        aset.updated_by = request.user
        aset.save(update_fields=['ruangan', 'status_verifikasi', 'verified_by', 'verified_at', 'catatan_verifikasi', 'updated_by', 'updated_at'])

        ruangan_baru_nama = aset.ruangan.nama if aset.ruangan else aset.lokasi_teks
        extra_note = f'Ruangan dipetakan ke "{ruangan_baru_nama}".' if buat_baru or ruangan_id_param not in (None, '') else ''
        full_note = ' '.join(part for part in ['Aset diverifikasi dan disetujui.', extra_note, catatan] if part).strip()

        AsetRiwayat.objects.create(
            aset=aset,
            aksi='update_data',
            status_kelayakan_lama=aset.status_kelayakan,
            status_kelayakan_baru=aset.status_kelayakan,
            ruangan_lama=ruangan_lama_nama,
            ruangan_baru=ruangan_baru_nama,
            catatan=full_note,
            dilakukan_oleh=request.user,
        )
        return Response(AsetDetailSerializer(aset, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def tolak_verifikasi(self, request, pk=None):
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya Admin Aset yang berhak menolak pengajuan pendaftaran aset.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        aset = self.get_object()
        alasan = (request.data.get('catatan_verifikasi') or request.data.get('alasan') or '').strip()
        if not alasan:
            return Response(
                {'catatan_verifikasi': 'Alasan penolakan wajib diisi agar unit dapat memperbaiki data.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        aset.status_verifikasi = 'ditolak'
        aset.verified_by = request.user
        aset.verified_at = timezone.now()
        aset.catatan_verifikasi = alasan
        aset.updated_by = request.user
        aset.save(update_fields=['status_verifikasi', 'verified_by', 'verified_at', 'catatan_verifikasi', 'updated_by', 'updated_at'])

        AsetRiwayat.objects.create(
            aset=aset,
            aksi='update_data',
            status_kelayakan_lama=aset.status_kelayakan,
            status_kelayakan_baru=aset.status_kelayakan,
            catatan=f'Pengajuan aset ditolak untuk perbaikan: {alasan}',
            dilakukan_oleh=request.user,
        )
        return Response(AsetDetailSerializer(aset, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        if not is_aset_manager(request.user):
            return Response({'detail': 'Hanya Admin Aset yang dapat menghapus data aset.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='update_kelayakan')
    def update_kelayakan(self, request, pk=None):
        """
        Endpoint khusus untuk User Unit atau Admin mengupdate status kelayakan fisik aset.
        Langsung berlaku seketika dan tercatat di riwayat.
        """
        aset = self.get_object()
        if aset.status_verifikasi != 'terverifikasi':
            return Response(
                {'detail': 'Aset harus diverifikasi terlebih dahulu sebelum mengubah kondisi kelayakan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AsetKelayakanUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        status_baru = serializer.validated_data['status_kelayakan']
        rekomendasi = serializer.validated_data.get('rekomendasi_tindakan', '')
        catatan = serializer.validated_data.get('catatan', '')
        foto = request.FILES.get('foto')

        status_lama = aset.status_kelayakan
        aset.status_kelayakan = status_baru
        if 'rekomendasi_tindakan' in serializer.validated_data:
            aset.rekomendasi_tindakan = serializer.validated_data['rekomendasi_tindakan']
        if foto:
            aset.foto = foto
            aset.foto_terkini = foto
        aset.updated_by = request.user
        aset.save()

        catat_riwayat_kelayakan(
            aset=aset,
            status_baru=status_baru,
            user=request.user,
            status_lama=status_lama,
            catatan=catatan or f'Status kelayakan diubah dari {status_lama} ke {status_baru} oleh {request.user.get_full_name() or request.user.username}',
            foto=foto
        )

        detail_serializer = AsetDetailSerializer(aset, context={'request': request})
        return Response({
            'message': f'Status kelayakan aset {aset.kode_aset} berhasil diperbarui menjadi {status_baru}.',
            'data': detail_serializer.data
        })

    @action(detail=True, methods=['get'], url_path='jadwal_penyusutan')
    def jadwal_penyusutan(self, request, pk=None):
        """
        Melihat tabel jadwal penyusutan bulanan & tahunan sesuai PMK 72/2023.
        Hanya untuk admin / akuntansi.
        """
        if not is_financial_viewer(request.user):
            return Response({'detail': 'Informasi finansial penyusutan hanya dapat diakses oleh Admin / Akuntansi.'}, status=status.HTTP_403_FORBIDDEN)

        aset = self.get_object()
        jadwal = generate_jadwal_penyusutan(aset)
        return Response(jadwal)

    @action(detail=False, methods=['get'], url_path='dashboard_summary')
    def dashboard_summary(self, request):
        """
        Ringkasan data untuk Dashboard Aset.
        Aset belum terverifikasi/ditolak tidak dihitung ke statistik resmi & laporan/penyusutan.
        """
        user = request.user
        is_admin = is_financial_viewer(user)

        scoped_qs = self.get_queryset()
        menunggu_verifikasi_count = scoped_qs.filter(status_verifikasi='menunggu_verifikasi').count()
        ditolak_count = scoped_qs.filter(status_verifikasi='ditolak').count()

        qs = scoped_qs.filter(status_verifikasi='terverifikasi')
        total_aset = qs.count()

        # Hitung kelayakan (.order_by() wajib agar GROUP BY tidak terpecah oleh ordering default kode_aset)
        kelayakan_rows = qs.values('status_kelayakan').order_by().annotate(total=Count('id'))
        kelayakan_counts = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0}
        for r in kelayakan_rows:
            if r['status_kelayakan'] in kelayakan_counts:
                kelayakan_counts[r['status_kelayakan']] = r['total']

        perlu_tindakan_count = kelayakan_counts['D'] + kelayakan_counts['E']
        belum_lengkap_count = qs.filter(status_data='belum_lengkap').count()

        # Grouping Unit
        unit_counts = list(
            qs.values('unit__id', 'unit__nama')
            .order_by()
            .annotate(total=Count('id'))
            .order_by('-total')
        )

        # Grouping Kategori
        kategori_counts = list(
            qs.values('jenis__kategori__kode', 'jenis__kategori__nama')
            .order_by()
            .annotate(total=Count('id'))
            .order_by('-total')
        )

        # Nilai Finansial (Hanya jika admin / akuntansi)
        total_harga = Decimal('0.00')
        total_akumulasi = Decimal('0.00')
        total_nilai_buku = Decimal('0.00')

        if is_admin:
            target_date = timezone.now().date()
            for aset in qs:
                calc = hitung_penyusutan_aset(aset, target_date=target_date)
                if calc['is_calculable']:
                    total_harga += Decimal(str(calc['harga_perolehan']))
                    total_akumulasi += Decimal(str(calc['akumulasi_penyusutan']))
                    total_nilai_buku += Decimal(str(calc['nilai_buku']))

        return Response({
            'is_financial_viewer': is_admin,
            'is_aset_manager': is_aset_manager(user),
            'unit_registration_open': AsetPengaturan.get_solo().izinkan_pendaftaran_unit,
            'total_aset': total_aset,
            'total_harga_perolehan': float(total_harga) if is_admin else None,
            'total_akumulasi_penyusutan': float(total_akumulasi) if is_admin else None,
            'total_nilai_buku': float(total_nilai_buku) if is_admin else None,
            'kelayakan_counts': kelayakan_counts,
            'perlu_tindakan_count': perlu_tindakan_count,
            'belum_lengkap_count': belum_lengkap_count,
            'menunggu_verifikasi_count': menunggu_verifikasi_count,
            'ditolak_count': ditolak_count,
            'unit_counts': unit_counts,
            'kategori_counts': kategori_counts,
        })



class AsetPerbaikanViewSet(viewsets.ModelViewSet):
    """
    CRUD Laporan Kerusakan & Penanganan Perbaikan Aset.
    """
    queryset = AsetPerbaikan.objects.select_related('aset', 'aset__unit', 'aset__ruangan', 'pelapor').all()
    serializer_class = AsetPerbaikanSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = AsetPerbaikan.objects.select_related(
            'aset', 'aset__unit', 'aset__ruangan', 'pelapor'
        ).prefetch_related('log_list', 'log_list__dibuat_oleh').all()

        # Jika bukan admin/kasi umum, batasi hanya melihat laporan di unitnya
        if not is_financial_viewer(user):
            if user.unit_id:
                qs = qs.filter(aset__unit_id=user.unit_id)
            else:
                qs = qs.none()

        # Query Filters
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(nomor_tiket__icontains=q) |
                Q(aset__kode_aset__icontains=q) |
                Q(aset__deskripsi__icontains=q) |
                Q(rincian_kerusakan__icontains=q) |
                Q(tindak_lanjut__icontains=q)
            )

        status_list = []
        for raw_val in self.request.query_params.getlist('status_perbaikan'):
            for part in raw_val.split(','):
                cleaned = part.strip()
                if cleaned:
                    status_list.append(cleaned)
        if status_list:
            qs = qs.filter(status_perbaikan__in=status_list)

        tingkat = self.request.query_params.get('tingkat_kerusakan')
        if tingkat:
            qs = qs.filter(tingkat_kerusakan=tingkat)

        kondisi = self.request.query_params.get('kondisi_setelah_perbaikan')
        if kondisi:
            qs = qs.filter(kondisi_setelah_perbaikan=kondisi)

        unit_id = self.request.query_params.get('unit_id')
        if unit_id and is_financial_viewer(user):
            qs = qs.filter(aset__unit_id=unit_id)

        aset_id = self.request.query_params.get('aset_id')
        if aset_id:
            qs = qs.filter(aset_id=aset_id)

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        aset_obj = serializer.validated_data.get('aset')
        if aset_obj and aset_obj.status_verifikasi != 'terverifikasi':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'aset': 'Aset harus diverifikasi oleh Admin Aset terlebih dahulu sebelum dilaporkan kerusakannya.'})
        perbaikan = serializer.save(pelapor=user, tanggal_laporan=timezone.now().date())

        # Ubah status operasional aset menjadi dalam_perbaikan.
        # Catatan: status_kelayakan fisik (Grade A-E) sengaja tidak diturunkan
        # karena kelayakan fisik memerlukan penetapan/pengecekan terpisah.
        aset = perbaikan.aset
        aset.status_aset = 'dalam_perbaikan'
        aset.save(update_fields=['status_aset', 'updated_at'])

        # Catat Log Riwayat Kronologis Perbaikan
        AsetPerbaikanLog.objects.create(
            perbaikan=perbaikan,
            status_sebelum='',
            status_sesudah=perbaikan.status_perbaikan,
            tindakan=f'Laporan kerusakan dibuat: {perbaikan.rincian_kerusakan}',
            teknisi='',
            estimasi_biaya=0,
            biaya_riil=0,
            foto=perbaikan.foto_kerusakan,
            dibuat_oleh=user,
        )

        # Log riwayat umum aset
        AsetRiwayat.objects.create(
            aset=aset,
            aksi='perbaikan',
            status_kelayakan_lama=aset.status_kelayakan,
            status_kelayakan_baru=aset.status_kelayakan,
            unit_lama=aset.unit.nama if aset.unit else '',
            unit_baru=aset.unit.nama if aset.unit else '',
            ruangan_lama=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            ruangan_baru=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            catatan=f'Tiket perbaikan {perbaikan.nomor_tiket} dibuat: {perbaikan.rincian_kerusakan[:100]}',
            foto=perbaikan.foto_kerusakan,
            dilakukan_oleh=user
        )

    def update(self, request, *args, **kwargs):
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya pengguna dengan akses utama Manajemen Aset yang berhak mengisi dan memperbarui tindak lanjut perbaikan.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya pengguna dengan akses utama Manajemen Aset yang berhak mengisi dan memperbarui tindak lanjut perbaikan.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya pengguna dengan akses utama Manajemen Aset yang berhak menghapus tiket perbaikan.'},
                status=status.HTTP_403_FORBIDDEN
            )
        instance = self.get_object()
        aset = instance.aset
        response = super().destroy(request, *args, **kwargs)
        if not AsetPerbaikan.objects.filter(aset=aset, status_perbaikan__in=['belum_mulai', 'inspeksi', 'dalam_proses']).exists():
            if aset.status_aset == 'dalam_perbaikan':
                aset.status_aset = 'aktif'
                aset.save(update_fields=['status_aset', 'updated_at'])
        return response

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()
        status_sebelum = instance.status_perbaikan
        old_teknisi = instance.teknisi
        old_hasil = instance.hasil_inspeksi
        old_tindak_lanjut = instance.tindak_lanjut

        perbaikan = serializer.save()
        aset = perbaikan.aset

        # Sinkronisasi status operasional aset saat update
        # Status kelayakan fisik tetap dipertahankan (penetapan kelayakan fisik dilakukan terpisah)
        if perbaikan.status_perbaikan == 'selesai':
            if perbaikan.kondisi_setelah_perbaikan == 'berfungsi_normal':
                aset.status_aset = 'aktif'
                aset.save(update_fields=['status_aset', 'updated_at'])
            elif perbaikan.kondisi_setelah_perbaikan == 'masih_bermasalah':
                aset.status_aset = 'dalam_perbaikan'
                aset.save(update_fields=['status_aset', 'updated_at'])
        elif perbaikan.status_perbaikan in ('belum_mulai', 'inspeksi', 'dalam_proses'):
            if aset.status_aset != 'dalam_perbaikan':
                aset.status_aset = 'dalam_perbaikan'
                aset.save(update_fields=['status_aset', 'updated_at'])

        # Catat Log Riwayat Kronologis Perbaikan secara akurat per tahapan / progres terbaru
        if status_sebelum == 'belum_mulai' and perbaikan.status_perbaikan == 'inspeksi':
            parts = [f'Penugasan teknisi: {perbaikan.teknisi}']
            if perbaikan.tindak_lanjut and perbaikan.tindak_lanjut != old_tindak_lanjut:
                parts.append(f'Catatan awal: {perbaikan.tindak_lanjut}')
            tindakan_text = ' • '.join(parts)
        elif status_sebelum != 'dalam_proses' and perbaikan.status_perbaikan == 'dalam_proses':
            parts = []
            if perbaikan.hasil_inspeksi:
                parts.append(f'Hasil Inspeksi: {perbaikan.hasil_inspeksi}')
            if perbaikan.tindak_lanjut:
                parts.append(f'Tindak Lanjut: {perbaikan.tindak_lanjut}')
            tindakan_text = ' • '.join(parts) or 'Memulai proses perbaikan'
        elif perbaikan.tindak_lanjut and perbaikan.tindak_lanjut != old_tindak_lanjut:
            tindakan_text = perbaikan.tindak_lanjut
        elif perbaikan.hasil_inspeksi and perbaikan.hasil_inspeksi != old_hasil:
            tindakan_text = f'Hasil Inspeksi diperbarui: {perbaikan.hasil_inspeksi}'
        elif perbaikan.teknisi and perbaikan.teknisi != old_teknisi:
            tindakan_text = f'Teknisi diperbarui: {perbaikan.teknisi}'
        else:
            tindakan_text = (
                perbaikan.tindak_lanjut
                or perbaikan.hasil_inspeksi
                or f'Pembaruan status tiket ke {perbaikan.get_status_perbaikan_display()}'
            )

        AsetPerbaikanLog.objects.create(
            perbaikan=perbaikan,
            status_sebelum=status_sebelum,
            status_sesudah=perbaikan.status_perbaikan,
            tindakan=tindakan_text,
            teknisi=perbaikan.teknisi,
            estimasi_biaya=perbaikan.estimasi_biaya,
            biaya_riil=perbaikan.biaya_perbaikan,
            kondisi_setelah_perbaikan=perbaikan.kondisi_setelah_perbaikan or '',
            tindak_lanjut_berikutnya=perbaikan.tindak_lanjut_berikutnya or '',
            foto=perbaikan.foto_setelah_perbaikan or perbaikan.foto_kerusakan,
            dibuat_oleh=user,
        )

        # Catat riwayat umum aset
        kondisi_str = perbaikan.get_kondisi_setelah_perbaikan_display() or '-'
        catatan_text = f'Update tiket {perbaikan.nomor_tiket}: {perbaikan.get_status_perbaikan_display()} - Kondisi: {kondisi_str}.'
        if perbaikan.tindak_lanjut:
            catatan_text += f' Tindak lanjut: {perbaikan.tindak_lanjut[:100]}'
        if perbaikan.tindak_lanjut_berikutnya:
            catatan_text += f' Next: {perbaikan.tindak_lanjut_berikutnya[:100]}'

        AsetRiwayat.objects.create(
            aset=aset,
            aksi='perbaikan',
            status_kelayakan_lama=aset.status_kelayakan,
            status_kelayakan_baru=aset.status_kelayakan,
            unit_lama=aset.unit.nama if aset.unit else '',
            unit_baru=aset.unit.nama if aset.unit else '',
            ruangan_lama=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            ruangan_baru=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            catatan=catatan_text,
            foto=perbaikan.foto_setelah_perbaikan or perbaikan.foto_kerusakan,
            dilakukan_oleh=user
        )

    @action(detail=True, methods=['post'], url_path='finish')
    def finish(self, request, pk=None):
        """
        Action penyelesaian perbaikan (Finish Pop-up):
        - Kondisi setelah perbaikan (berfungsi normal / masih bermasalah)
        - Update penetapan status kelayakan fisik aset (Grade A-E)
        - Biaya perbaikan riil
        - Tindak lanjut berikutnya (jika masih bermasalah)
        - Foto bukti setelah perbaikan
        """
        if not is_aset_manager(request.user):
            return Response(
                {'detail': 'Hanya pengguna dengan akses utama Manajemen Aset yang berhak menyelesaikan tiket perbaikan.'},
                status=status.HTTP_403_FORBIDDEN
            )

        perbaikan = self.get_object()
        serializer = AsetPerbaikanFinishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        kondisi = data.get('kondisi_setelah_perbaikan') or 'berfungsi_normal'
        kondisi_ringkas = (data.get('kondisi_ringkas') or '').strip()
        status_kelayakan_baru = data['status_kelayakan_baru']
        biaya_riil = data['biaya_riil']
        tindak_lanjut_berikutnya = data.get('tindak_lanjut_berikutnya', '')
        catatan_penutupan = data.get('catatan_penutupan', '')
        tanggal_selesai = data.get('tanggal_selesai') or timezone.now().date()
        foto_setelah = request.FILES.get('foto_setelah_perbaikan')

        status_sebelum = perbaikan.status_perbaikan
        perbaikan.status_perbaikan = 'selesai'
        perbaikan.kondisi_setelah_perbaikan = kondisi
        perbaikan.biaya_perbaikan = biaya_riil
        perbaikan.tindak_lanjut_berikutnya = tindak_lanjut_berikutnya
        perbaikan.tanggal_selesai = tanggal_selesai
        if foto_setelah:
            perbaikan.foto_setelah_perbaikan = foto_setelah
        if catatan_penutupan and not perbaikan.tindak_lanjut:
            perbaikan.tindak_lanjut = catatan_penutupan
        perbaikan.save()

        # Update Master Aset (Kelayakan Fisik & Status Operasional)
        aset = perbaikan.aset
        kelayakan_lama = aset.status_kelayakan
        aset.status_kelayakan = status_kelayakan_baru
        aset.status_aset = 'aktif'
        aset.save(update_fields=['status_kelayakan', 'status_aset', 'updated_at'])

        # Catat Log Riwayat Kronologis Perbaikan
        kondisi_desc = kondisi_ringkas or perbaikan.get_kondisi_setelah_perbaikan_display()
        tindakan_log = f'Perbaikan selesai. Kondisi setelah perbaikan: {kondisi_desc}.'
        if catatan_penutupan:
            tindakan_log += f' Catatan: {catatan_penutupan}'
        if tindak_lanjut_berikutnya:
            tindakan_log += f' RTL: {tindak_lanjut_berikutnya}'

        AsetPerbaikanLog.objects.create(
            perbaikan=perbaikan,
            status_sebelum=status_sebelum,
            status_sesudah='selesai',
            tindakan=tindakan_log,
            teknisi=perbaikan.teknisi,
            estimasi_biaya=perbaikan.estimasi_biaya,
            biaya_riil=biaya_riil,
            kondisi_setelah_perbaikan=kondisi,
            tindak_lanjut_berikutnya=tindak_lanjut_berikutnya,
            foto=perbaikan.foto_setelah_perbaikan,
            dibuat_oleh=request.user,
        )

        # Catat Riwayat Aset (Perubahan Kelayakan & Selesai Servis)
        AsetRiwayat.objects.create(
            aset=aset,
            aksi='perbaikan',
            status_kelayakan_lama=kelayakan_lama,
            status_kelayakan_baru=status_kelayakan_baru,
            unit_lama=aset.unit.nama if aset.unit else '',
            unit_baru=aset.unit.nama if aset.unit else '',
            ruangan_lama=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            ruangan_baru=aset.lokasi_teks or (aset.ruangan.nama if aset.ruangan else ''),
            catatan=f'Tiket {perbaikan.nomor_tiket} diselesaikan (Biaya: Rp {biaya_riil:,.0f}). Kelayakan fisik diperbarui menjadi Grade {status_kelayakan_baru}.',
            foto=perbaikan.foto_setelah_perbaikan,
            dilakukan_oleh=request.user
        )

        return Response(AsetPerbaikanSerializer(perbaikan, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='teknisi_options', permission_classes=[permissions.IsAuthenticated])
    def teknisi_options(self, request):
        from django.apps import apps
        from django.contrib.auth import get_user_model

        entries = {}
        kategori_order = {'teknisi_ipsrs': 0, 'elektromedis': 1, 'it': 2}

        def clean_kategori_label(kat):
            return {
                'teknisi_ipsrs': 'Teknisi IPSRS',
                'elektromedis': 'Elektromedis',
                'it': 'Teknisi IT / Sarpras',
            }.get(kat, 'Teknisi')

        def add_option(nama, kategori='teknisi_ipsrs', kategori_label='', sumber=''):
            clean = ' '.join(str(nama or '').strip().split())
            if not clean:
                return
            key = clean.lower()
            if key not in entries:
                label_kat = kategori_label or clean_kategori_label(kategori)
                entries[key] = {
                    'value': clean,
                    'label': clean,
                    'kategori': kategori,
                    'kategori_label': label_kat,
                    'subtext': label_kat,
                    'sumber': sumber,
                }

        # 1. Master AsetTeknisi
        for t in AsetTeknisi.objects.filter(is_active=True):
            add_option(t.nama, t.kategori, t.get_kategori_display(), 'master')

        # 2. Akun User SIMAK di unit IPSRS / Elektromedis / ATEM
        UserModel = get_user_model()
        tech_users = UserModel.objects.filter(is_active=True, unit__isnull=False).filter(
            Q(unit__nama__icontains='ipsrs')
            | Q(unit__nama__icontains='elektro')
            | Q(unit__nama__icontains='atem')
        ).select_related('unit')
        for u in tech_users:
            unit_lower = (u.unit.nama or '').lower()
            kat = 'elektromedis' if ('elektro' in unit_lower or 'atem' in unit_lower) else 'teknisi_ipsrs'
            add_option(u.get_full_name() or u.username, kat, clean_kategori_label(kat), 'user')

        # 3. Data Master SDM Pegawai IPSRS / Elektromedis / Teknisi
        try:
            Pegawai = apps.get_model('sdm', 'Pegawai')
            pegawai_qs = Pegawai.objects.filter(is_active=True).filter(
                Q(unit_kerja__icontains='ipsrs')
                | Q(unit_kerja__icontains='elektro')
                | Q(unit_kerja__icontains='atem')
                | Q(jabatan__icontains='teknis')
                | Q(jabatan__icontains='elektro')
                | Q(jabatan__icontains='atem')
                | Q(jabatan__icontains='ipsrs')
            )
            for p in pegawai_qs:
                text_check = f'{p.unit_kerja} {p.jabatan}'.lower()
                kat = 'elektromedis' if ('elektro' in text_check or 'atem' in text_check) else 'teknisi_ipsrs'
                add_option(p.nama, kat, clean_kategori_label(kat), 'pegawai')
        except LookupError:
            pass

        result = sorted(entries.values(), key=lambda x: (kategori_order.get(x['kategori'], 9), x['label'].lower()))
        return Response(result)


class AsetTeknisiViewSet(viewsets.ModelViewSet):
    """
    Master daftar Teknisi IPSRS & Elektromedis untuk dropdown perbaikan aset.
    """
    queryset = AsetTeknisi.objects.all()
    serializer_class = AsetTeknisiSerializer
    permission_classes = [permissions.IsAuthenticated, IsAsetAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        aktif = self.request.query_params.get('is_active')
        if aktif in ('true', '1', 'True'):
            qs = qs.filter(is_active=True)
        return qs

