from .audit import get_audit_target_snapshot, parse_json_body, write_audit_log


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
                write_audit_log(
                    request,
                    metadata={'payload': payload, 'target': target} if payload or target else {},
                    status_code=response.status_code,
                )
            except Exception:
                pass

        return response
