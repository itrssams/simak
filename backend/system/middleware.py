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
    - Ekstensi file terlarang (.php, .asp, .log, .sql, .bak, .yml, .py, .sh, dll)
    - Path exploit umum (jquery-file-upload, phpinfo, wp-admin, storage/logs, dll)
    - File sensitif (.env, .git, .htaccess, web.config, config.js, dll)

    Path verifikasi SSL resmi (/.well-known/acme-challenge/, /.well-known/pki-validation/)
    tetap diloloskan selama tidak mengarah ke ekstensi skrip/eksploit atau path traversal.
    """

    SAFE_WELL_KNOWN_PREFIXES = (
        '/.well-known/acme-challenge/',
        '/.well-known/pki-validation/',
        '/.well-known/assetlinks.json',
    )

    BLOCKED_EXTENSIONS = (
        '.php', '.asp', '.aspx', '.jsp', '.cgi',
        '.log', '.sql', '.bak', '.old', '.orig', '.swp', '.swo',
        '.ini', '.conf', '.yml', '.yaml', '.toml',
        '.pem', '.key', '.p12', '.sqlite', '.sqlite3', '.db',
        '.py', '.sh', '.bash', '.bat', '.cmd', '.ps1',
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
        'storage/logs',
        'laravel.log',
        '/_profiler',
        '/actuator',
        'aws-credentials',
        '/api/fs/exec',
        '/api/v1/validate/code',
        '/api/graphql',
        '/api/gql',
        '/api/templates/preview',
        '/api/designer/',
        '/api/inngest',
        '/api/events',
        'node-load-method',
    )

    BLOCKED_DOTFILE_PREFIXES = (
        '.env',
        '.git',
        '.htaccess',
        '.htpasswd',
        '.aws',
        '.ssh',
        '.ds_store',
        '.vscode',
        '.idea',
    )

    BLOCKED_EXACT_FILES = (
        'web.config',
        'composer.json',
        'composer.lock',
        'package-lock.json',
        'yarn.lock',
        'gemfile',
    )

    BLOCKED_NON_STATIC_EXACT_FILES = (
        'config.js',
        'config.json',
        'settings.json',
        'secrets.json',
        'package.json',
        'dockerfile',
        'docker-compose.yml',
        'id_rsa',
        'id_dsa',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def _is_blocked(self, path):
        if any(path.endswith(ext) for ext in self.BLOCKED_EXTENSIONS):
            return True

        # Pastikan path challenge SSL tidak pernah terblokir secara tidak sengaja
        if '..' not in path and any(path.startswith(prefix) for prefix in self.SAFE_WELL_KNOWN_PREFIXES):
            return False

        if any(pattern in path for pattern in self.BLOCKED_PATTERNS):
            return True

        segments = [seg for seg in path.rstrip('/').split('/') if seg]
        if segments:
            last_segment = segments[-1]
            if any(last_segment.startswith(prefix) for prefix in self.BLOCKED_DOTFILE_PREFIXES):
                return True
            if last_segment in self.BLOCKED_EXACT_FILES:
                return True
            if (
                not path.startswith(('/assets/', '/static/', '/media/'))
                and last_segment in self.BLOCKED_NON_STATIC_EXACT_FILES
            ):
                return True

        return False

    def __call__(self, request):
        path = request.path.lower()

        if self._is_blocked(path):
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

        # Tentukan tag status (ASCII-safe agar tidak error di terminal Windows cp1252)
        if status_code < 300:
            tag = '[OK]'
            status_label = str(status_code)
        elif status_code < 400:
            tag = '[REDIR]'
            status_label = str(status_code)
        elif status_code == 401:
            tag = '[UNAUTH]'
            status_label = '401'
        elif status_code == 403:
            tag = '[FORBID]'
            status_label = '403'
        elif status_code == 404:
            tag = '[NOTFND]'
            status_label = '404'
        elif status_code == 429:
            tag = '[THROTL]'
            status_label = '429 RATE LIMITED'
        elif status_code < 500:
            tag = '[WARN]'
            status_label = str(status_code)
        else:
            tag = '[ERROR]'
            status_label = f'{status_code} ERROR'

        now = datetime.now().strftime('%H:%M:%S')

        try:
            print(
                f"[{now}] {tag} {status_label:<4} {method:<5} {path} "
                f"({username}) {duration_ms:.0f}ms [IP: {client_ip}]"
            )
        except Exception:
            pass

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
