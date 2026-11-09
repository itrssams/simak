from rest_framework import viewsets, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count, Sum
from decimal import Decimal
from django.utils import timezone

from .models import (
    AsetKelompok, AsetKategori, AsetJenis, AsetRuangan,
    Aset, AsetRiwayat, AsetPerbaikan, AsetPerbaikanLog
)
from .serializers import (
    AsetPerbaikanSerializer, AsetPerbaikanFinishSerializer, AsetPerbaikanLogSerializer,
    AsetKelompokSerializer, AsetKategoriSerializer, AsetJenisSerializer,
    AsetRuanganSerializer, AsetRiwayatSerializer,
    AsetListSerializer, AsetDetailSerializer, AsetInputSerializer,
    AsetKelayakanUpdateSerializer, is_financial_viewer, is_aset_manager
)
from .services import hitung_penyusutan_aset, generate_jadwal_penyusutan, catat_riwayat_kelayakan, get_ai_asset_suggestions


class IsAsetAdminOrReadOnly(permissions.BasePermission):
    """
    Hanya admin aset / superuser yang boleh create/update/delete master aset.
    User biasa hanya boleh membaca.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_financial_viewer(request.user)


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
    permission_classes = [permissions.IsAuthenticated]

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

        kelayakan = self.request.query_params.get('status_kelayakan')
        if kelayakan:
            qs = qs.filter(status_kelayakan=kelayakan)

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

        return qs.order_by('kode_aset')

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        user = request.user
        # Jika bukan admin, pastikan aset berada di unitnya
        if not is_financial_viewer(user) and obj.unit_id != user.unit_id:
            self.permission_denied(request, message="Anda tidak memiliki akses ke aset di luar unit Anda.")

    def create(self, request, *args, **kwargs):
        if not is_financial_viewer(request.user):
            return Response({'detail': 'Hanya Admin Aset yang dapat mendaftarkan aset baru.'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_financial_viewer(request.user):
            return Response({'detail': 'Hanya Admin Aset yang dapat mengubah identitas aset.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_financial_viewer(request.user):
            return Response({'detail': 'Hanya Admin Aset yang dapat menghapus data aset.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='update_kelayakan')
    def update_kelayakan(self, request, pk=None):
        """
        Endpoint khusus untuk User Unit atau Admin mengupdate status kelayakan fisik aset.
        Langsung berlaku seketika dan tercatat di riwayat.
        """
        aset = self.get_object()
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
        """
        user = request.user
        is_admin = is_financial_viewer(user)

        qs = self.get_queryset()
        total_aset = qs.count()

        # Hitung kelayakan
        kelayakan_rows = qs.values('status_kelayakan').annotate(total=Count('id'))
        kelayakan_counts = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0}
        for r in kelayakan_rows:
            if r['status_kelayakan'] in kelayakan_counts:
                kelayakan_counts[r['status_kelayakan']] = r['total']

        perlu_tindakan_count = kelayakan_counts['D'] + kelayakan_counts['E']
        belum_lengkap_count = qs.filter(status_data='belum_lengkap').count()

        # Grouping Unit
        unit_counts = list(
            qs.values('unit__id', 'unit__nama')
            .annotate(total=Count('id'))
            .order_by('-total')
        )

        # Grouping Kategori
        kategori_counts = list(
            qs.values('jenis__kategori__kode', 'jenis__kategori__nama')
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
            'total_aset': total_aset,
            'total_harga_perolehan': float(total_harga) if is_admin else None,
            'total_akumulasi_penyusutan': float(total_akumulasi) if is_admin else None,
            'total_nilai_buku': float(total_nilai_buku) if is_admin else None,
            'kelayakan_counts': kelayakan_counts,
            'perlu_tindakan_count': perlu_tindakan_count,
            'belum_lengkap_count': belum_lengkap_count,
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
        qs = AsetPerbaikan.objects.select_related('aset', 'aset__unit', 'aset__ruangan', 'pelapor').all()

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

        status_pbk = self.request.query_params.get('status_perbaikan')
        if status_pbk:
            qs = qs.filter(status_perbaikan=status_pbk)

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
        perbaikan = serializer.save(pelapor=user)

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

        # Catat Log Riwayat Kronologis Perbaikan
        tindakan_text = perbaikan.hasil_inspeksi or perbaikan.tindak_lanjut or f'Pembaruan status tiket ke {perbaikan.get_status_perbaikan_display()}'
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
        kondisi = data['kondisi_setelah_perbaikan']
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

        if kondisi == 'berfungsi_normal':
            aset.status_aset = 'aktif'
        else:
            aset.status_aset = 'dalam_perbaikan'
        aset.save(update_fields=['status_kelayakan', 'status_aset', 'updated_at'])

        # Catat Log Riwayat Kronologis Perbaikan
        tindakan_log = f'Perbaikan selesai. Kondisi: {perbaikan.get_kondisi_setelah_perbaikan_display()}.'
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
