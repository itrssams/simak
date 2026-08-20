from .audit import get_audit_target_snapshot, parse_json_body, write_audit_log, infer_target, get_keuangan_target_display


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
