from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.views.generic import TemplateView
from django.views.static import serve
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from keuangan.audit import write_audit_log

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'role': user.role,
        'role_label': user.get_role_display(),
        'is_driver': user.is_driver,
        'is_it': user.is_it,
        'is_keuangan': user.is_keuangan,
        'is_petty_cash_cashier': user.is_petty_cash_cashier,
        'akses_catatan_utang': user.akses_catatan_utang,
        'unit': user.unit_id,
        'unit_nama': user.unit.nama if user.unit else None,
    })


class AuditedTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        username = request.data.get('username', '')
        user = get_user_model().objects.filter(username=username).first()
        try:
            response = super().post(request, *args, **kwargs)
        except Exception:
            if user:
                request.user = user
            try:
                write_audit_log(
                    request,
                    action='login',
                    description=f'Percobaan login gagal untuk {username or "username kosong"}.',
                    metadata={'username': username, 'result': 'failed'},
                    status_code=401,
                )
            except Exception:
                pass
            raise

        if user:
            request.user = user
        try:
            write_audit_log(
                request,
                action='login',
                description=f'{username} login ke sistem.' if response.status_code == 200 else f'Percobaan login gagal untuk {username or "username kosong"}.',
                metadata={'username': username, 'result': 'success' if response.status_code == 200 else 'failed'},
                status_code=response.status_code,
            )
        except Exception:
            pass
        return response

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT Auth
    path('api/auth/login/', AuditedTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', me_view, name='auth_me'),

    # Keuangan API
    path('api/keuangan/', include('keuangan.urls')),
    path('api/users/', include('users.urls')),
    
    # Serve React assets explicitly
    re_path(r'^(?P<path>assets/.*)$', serve, {'document_root': settings.STATIC_ROOT}),
    re_path(r'^(?P<path>vite.svg)$', serve, {'document_root': settings.STATIC_ROOT}),
    re_path(r'^(?P<path>logo.png)$', serve, {'document_root': settings.STATIC_ROOT}),
]

# Serve static & uploaded media files.
# In production, a reverse proxy should ideally serve these paths directly, but
# keeping these routes explicit ensures uploaded photos/files still open when
# Django is the public app server behind simak.rssiaga.id.
urlpatterns += [
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

# React SPA fallback - MUST be LAST
# Catch-all untuk React Router - serve index.html untuk semua route yang bukan API/admin/static
urlpatterns += [
    path('', TemplateView.as_view(template_name='index.html'), name='index'),
    # Fallback untuk React Router (untuk /login, /dashboard, etc)
    re_path(r'^(?!api|admin|static|media|assets)(?P<path>.*)$', 
            TemplateView.as_view(template_name='index.html'), 
            name='spa_fallback'),
]

