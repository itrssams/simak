from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth import get_user_model
from .models import Unit

User = get_user_model()


def is_direktur(user):
    return user.is_authenticated and (user.role in ('direktur', 'wakil_direktur') or user.is_superuser)


def is_it(user):
    return user.is_authenticated and (getattr(user, 'is_it', False) or user.is_superuser)


class OptionalPageNumberPagination(PageNumberPagination):
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_page_size(self, request):
        if 'page' not in request.query_params and self.page_size_query_param not in request.query_params:
            return None
        if self.page_size_query_param in request.query_params:
            return super().get_page_size(request)
        return 10


class OptionalPaginationMixin:
    pagination_class = OptionalPageNumberPagination


# ── Unit ViewSet ───────────────────────────────────────────
class UnitViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Unit.objects.all().order_by('nama')

    def get_serializer_class(self):
        from .serializers import UnitSerializer
        return UnitSerializer

    def get_queryset(self):
        if not is_direktur(self.request.user):
            return Unit.objects.none()
        return Unit.objects.all().order_by('nama')

    def create(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat menambah unit.'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat mengubah unit.'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat menghapus unit.'}, status=403)
        return super().destroy(request, *args, **kwargs)


# ── User ViewSet ───────────────────────────────────────────
class UserViewSet(OptionalPaginationMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs   = User.objects.select_related('unit').all().order_by('username')
        if is_it(self.request.user):
            return qs
        if not is_direktur(self.request.user):
            return qs.filter(pk=self.request.user.pk)
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        from .serializers import UserSerializer, UserInputSerializer, UserPasswordSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return UserInputSerializer
        if self.action == 'set_password':
            return UserPasswordSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat membuat akun.'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat mengubah akun.'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat menghapus akun.'}, status=403)
        instance = self.get_object()
        if instance == request.user:
            return Response({'error': 'Tidak bisa menghapus akun sendiri.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='toggle-aktif')
    def toggle_aktif(self, request, pk=None):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat mengubah status akun.'}, status=403)
        user = self.get_object()
        if user == request.user:
            return Response({'error': 'Tidak bisa menonaktifkan akun sendiri.'}, status=400)
        user.is_active = not user.is_active
        user.save()
        return Response({
            'message': f'Akun {user.username} berhasil {"diaktifkan" if user.is_active else "dinonaktifkan"}.',
            'is_active': user.is_active,
        })

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        if not is_direktur(request.user):
            return Response({'error': 'Hanya direktur atau wakil direktur yang dapat mereset password.'}, status=403)
        user = self.get_object()
        from .serializers import UserPasswordSerializer
        serializer = UserPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['password'])
        user.save()
        return Response({'message': f'Password {user.username} berhasil direset.'})

    @action(detail=False, methods=['get', 'patch'], url_path='me')
    def me(self, request):
        if request.method == 'GET':
            from .serializers import UserSerializer
            return Response(UserSerializer(request.user, context={'request': request}).data)

        from .serializers import SelfProfileUpdateSerializer, UserSerializer
        serializer = SelfProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            'message': 'Profil berhasil diperbarui.',
            'user': UserSerializer(request.user, context={'request': request}).data,
        })

    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        from .serializers import SelfChangePasswordSerializer
        serializer = SelfChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        try:
            from system.audit import write_audit_log
            write_audit_log(
                request,
                action='update',
                description=f'{request.user.username} memperbarui password akunnya secara mandiri.',
                metadata={'action': 'change_password'},
            )
        except Exception:
            pass
        return Response({'message': 'Password Anda berhasil diperbarui.'})

    @action(detail=False, methods=['post'], url_path='upload-photo', parser_classes=[MultiPartParser, FormParser])
    def upload_photo(self, request):
        foto = request.FILES.get('foto')
        if not foto:
            return Response({'error': 'Berkas foto tidak ditemukan.'}, status=400)

        if foto.size > 5 * 1024 * 1024:
            return Response({'error': 'Ukuran foto maksimal 5MB.'}, status=400)

        content_type = getattr(foto, 'content_type', '')
        if not content_type.startswith('image/'):
            return Response({'error': 'Format berkas harus berupa gambar (JPG, PNG, WEBP).'}, status=400)

        # Hapus file foto lama dari storage jika ada
        if request.user.foto:
            try:
                request.user.foto.delete(save=False)
            except Exception:
                pass

        request.user.foto = foto
        request.user.save()

        from .serializers import UserSerializer
        user_data = UserSerializer(request.user, context={'request': request}).data
        return Response({
            'message': 'Foto profil berhasil diperbarui.',
            'foto': user_data.get('foto'),
            'user': user_data,
        })

    @action(detail=False, methods=['delete'], url_path='delete-photo')
    def delete_photo(self, request):
        if request.user.foto:
            try:
                request.user.foto.delete(save=False)
            except Exception:
                pass
            request.user.foto = None
            request.user.save()

        from .serializers import UserSerializer
        return Response({
            'message': 'Foto profil berhasil dihapus.',
            'user': UserSerializer(request.user, context={'request': request}).data,
        })
