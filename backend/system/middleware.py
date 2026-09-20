import time
import logging
import os
import re
from datetime import datetime

from django.http import HttpResponseNotFound, HttpResponseForbidden
from django.conf import settings

from .audit import get_audit_target_snapshot, parse_json_body, write_audit_log, infer_target, get_keuangan_target_display, get_client_ip


# ==============================================================================
# Logger untuk mencatat percobaan scanning ke file
# ==============================================================================
scanner_logger = logging.getLogger('security.scanner')


# ==============================================================================
# 1. BLOCK EXPLOIT SCANNERS MIDDLEWARE
# ==============================================================================
class BlockExploitScannersMiddleware:
    """
    Middleware terdepan yang langsung memblokir request dari bot vulnerability
    scanner sebelum mencapai URL routing Django.

    Mendeteksi:
    - Ekstensi file terlarang (.php, .asp, .aspx, .jsp, .cgi)
    - Path exploit umum (jquery-file-upload, phpinfo, wp-admin, dll)
    - File sensitif (.env, .git, .htaccess, web.config)
    """

    BLOCKED_EXTENSIONS = (
        '.php', '.asp', '.aspx', '.jsp', '.cgi',
    )

    BLOCKED_PATTERNS = (
        'jquery-file-upload',
        'phpinfo',
        'wp-admin',
        'wp-login',
        'wp-content',
        'wp-includes',
        'xmlrpc',
        'phpmyadmin',
        'pma/',
        'myadmin',
        'ckeditor/upload',
        'elfinder',
        'fckeditor',
        'ckfinder',
        'filemanager',
        'shell',
        'eval-stdin',
        'telescope',
    )

    BLOCKED_FILES = (
        '.env',
        '.git',
        '.htaccess',
        '.htpasswd',
        'web.config',
        'composer.json',
        'composer.lock',
        'package-lock.json',
        'yarn.lock',
        'Gemfile',
        '.aws',
        '.ssh',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path.lower()

        # Cek ekstensi terlarang
        blocked = any(path.endswith(ext) for ext in self.BLOCKED_EXTENSIONS)

        # Cek pola path exploit
        if not blocked:
            blocked = any(pattern in path for pattern in self.BLOCKED_PATTERNS)

        # Cek file sensitif
        if not blocked:
            # Ambil nama file / segment terakhir dari path
            segments = path.rstrip('/').split('/')
            if segments:
                last_segment = segments[-1]
                blocked = any(last_segment == f or last_segment.startswith(f)
                              for f in self.BLOCKED_FILES)

        if blocked:
            client_ip = get_client_ip(request)
            user_agent = request.META.get('HTTP_USER_AGENT', '-')[:200]
            now = datetime.now().strftime('%H:%M:%S')

            # Log ke terminal CMD
            print(
                f"[{now}] \U0001f6ab 404 {request.method:<5} {request.path} "
                f"[BLOCKED BOT] [IP: {client_ip}] [UA: {user_agent[:80]}]"
            )

            # Log ke file security.log
            scanner_logger.warning(
                'Blocked scanner probe: %s %s | IP: %s | UA: %s',
                request.method, request.path, client_ip, user_agent
            )

            return HttpResponseNotFound('Not Found')

        return self.get_response(request)


# ==============================================================================
# 2. REQUEST LOGGER MIDDLEWARE
# ==============================================================================
class RequestLoggerMiddleware:
    """
    Middleware yang mencetak ringkasan satu baris rapi di terminal CMD
    untuk setiap request yang masuk ke server.

    Format:
    [HH:MM:SS] [ICON] [STATUS] [METHOD] [PATH] ([USER]) [DURATION] [IP: xxx]
    """

    # Path yang tidak perlu di-log (static assets, favicon)
    SKIP_PREFIXES = (
        '/static/',
        '/assets/',
        '/favicon.ico',
        '/vite.svg',
        '/logo.png',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Skip logging untuk static files
        path = request.path
        if any(path.startswith(prefix) for prefix in self.SKIP_PREFIXES):
            return self.get_response(request)

        start_time = time.time()
        response = self.get_response(request)
        duration_ms = (time.time() - start_time) * 1000

        status_code = response.status_code
        method = request.method
        client_ip = get_client_ip(request)

        # Tentukan user
        user = getattr(request, 'user', None)
        if user and hasattr(user, 'is_authenticated') and user.is_authenticated:
            username = getattr(user, 'username', 'user')
        else:
            username = 'anon'

        # Tentukan ikon status
        if status_code < 300:
            icon = '\U0001f7e2'       # 🟢
            status_label = str(status_code)
        elif status_code < 400:
            icon = '\U0001f535'       # 🔵
            status_label = str(status_code)
        elif status_code == 401:
            icon = '\U0001f7e1'       # 🟡
            status_label = '401'
        elif status_code == 403:
            icon = '\U0001f7e0'       # 🟠
            status_label = '403'
        elif status_code == 404:
            icon = '\u26aa'          # ⚪
            status_label = '404'
        elif status_code == 429:
            icon = '\U0001f6d1'       # 🛑
            status_label = '429 RATE LIMITED'
        elif status_code < 500:
            icon = '\u26a0\ufe0f'     # ⚠️
            status_label = str(status_code)
        else:
            icon = '\U0001f534'       # 🔴
            status_label = f'{status_code} ERROR'

        now = datetime.now().strftime('%H:%M:%S')

        print(
            f"[{now}] {icon} {status_label:<4} {method:<5} {path} "
            f"({username}) {duration_ms:.0f}ms [IP: {client_ip}]"
        )

        return response


# ==============================================================================
# 3. ADMIN IP RESTRICTION MIDDLEWARE
# ==============================================================================
class AdminIPRestrictionMiddleware:
    """
    Di mode production (DEBUG=False), membatasi akses /admin/ hanya dari
    IP lokal / internal (127.0.0.1, 192.168.*, 10.*, 172.16-31.*).
    """

    LOCAL_IP_PATTERNS = [
        re.compile(r'^127\.'),
        re.compile(r'^10\.'),
        re.compile(r'^192\.168\.'),
        re.compile(r'^172\.(1[6-9]|2[0-9]|3[01])\.'),
        re.compile(r'^::1$'),
        re.compile(r'^localhost$'),
    ]

    def __init__(self, get_response):
        self.get_response = get_response

    def _is_local_ip(self, ip):
        if not ip:
            return False
        return any(pattern.match(ip) for pattern in self.LOCAL_IP_PATTERNS)

    def __call__(self, request):
        if not settings.DEBUG and request.path.startswith('/admin/'):
            client_ip = get_client_ip(request)
            if not self._is_local_ip(client_ip):
                now = datetime.now().strftime('%H:%M:%S')
                print(
                    f"[{now}] \U0001f7e0 403 {request.method:<5} {request.path} "
                    f"[ADMIN BLOCKED] [IP: {client_ip}]"
                )
                scanner_logger.warning(
                    'Admin access blocked from external IP: %s %s | IP: %s',
                    request.method, request.path, client_ip
                )
                return HttpResponseForbidden('Forbidden')

        return self.get_response(request)


# ==============================================================================
# 4. AUDIT LOG MIDDLEWARE (existing, unchanged)
# ==============================================================================
class AuditLogMiddleware:
    TRACKED_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
    SKIP_PREFIXES = (
        '/api/auth/login/',
        '/api/auth/refresh/',
        '/api/auth/me/',
        '/api/keuangan/audit-log',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        should_track = (
            request.path.startswith('/api/')
            and request.method in self.TRACKED_METHODS
            and not any(request.path.startswith(prefix) for prefix in self.SKIP_PREFIXES)
        )
        payload = parse_json_body(request) if should_track else {}
        target = get_audit_target_snapshot(request, payload) if should_track else {}
        response = self.get_response(request)

        if should_track and getattr(response, 'status_code', 500) < 500:
            try:
                resp_data = getattr(response, 'data', None)
                if isinstance(resp_data, dict):
                    app_label, entity, entity_id, extra_action, _ = infer_target(request.path, request.method)
                    obj_id = resp_data.get('id') or entity_id
                    if not target.get('target_display') and obj_id:
                        if app_label == 'keuangan':
                            target['target_display'] = get_keuangan_target_display(entity, obj_id)
                        if not target.get('target_display') and (resp_data.get('nomor_faktur') or resp_data.get('vendor_nama')):
                            ref = resp_data.get('nomor_faktur') or resp_data.get('nomor_spb') or f"#{obj_id}"
                            vendor = f" ({resp_data.get('vendor_nama')})" if resp_data.get('vendor_nama') else ""
                            target['target_display'] = f"Faktur {ref}{vendor}"
                    if not target.get('entity_id') and obj_id:
                        target['entity_id'] = obj_id

                write_audit_log(
                    request,
                    metadata={'payload': payload, 'target': target} if payload or target else {},
                    status_code=response.status_code,
                )
            except Exception:
                pass

        return response
