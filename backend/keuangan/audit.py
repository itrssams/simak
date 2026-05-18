import json

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import AuditLog
from users.models import Unit


SENSITIVE_KEYS = {
    'password', 'old_password', 'new_password', 'access_password', 'password_value',
    'access_password_value', 'token', 'access', 'refresh',
    'berkas', 'nota', 'foto', 'foto_files', 'file', 'attachment',
}


def can_view_audit(user):
    if not user or not user.is_authenticated:
        return False
    return user.is_superuser or user.role in ('direktur', 'wakil_direktur', 'manajer') or getattr(user, 'is_it', False)


def get_client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def sanitize_payload(value):
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            key_str = str(key)
            if key_str.lower() in SENSITIVE_KEYS:
                cleaned[key_str] = '[redacted]'
            else:
                cleaned[key_str] = sanitize_payload(item)
        return cleaned
    if isinstance(value, list):
        return [sanitize_payload(item) for item in value[:25]]
    return value


def parse_json_body(request):
    content_type = request.META.get('CONTENT_TYPE', '')
    if 'application/json' not in content_type:
        return {}
    try:
        raw = request.body
    except Exception:
        return {}
    if not raw or len(raw) > 20000:
        return {}
    try:
        return sanitize_payload(json.loads(raw.decode('utf-8')))
    except Exception:
        return {}


ENTITY_LABELS = {
    'users': 'akun user',
    'units': 'unit',
    'akun': 'akun akuntansi',
    'transaksi': 'transaksi',
    'jurnal': 'jurnal',
    'pelanggan': 'pelanggan',
    'pemasok': 'pemasok',
    'faktur': 'faktur pelanggan',
    'tagihan': 'tagihan pemasok',
    'rekening': 'rekening bank',
    'petty-cash': 'pengajuan petty cash',
    'reimbursement': 'pengajuan reimbursement',
    'penambahan-saldo': 'pengajuan penambahan saldo petty cash',
    'kendaraan': 'kendaraan',
    'log-perjalanan': 'log perjalanan driver',
    'log-bbm': 'log BBM',
    'log-maintenance': 'log maintenance',
}

EXTRA_ACTION_LABELS = {
    'toggle-aktif': 'mengubah status aktif akun',
    'set-password': 'mereset password akun',
    'posting': 'mem-posting jurnal',
    'unpost': 'membatalkan posting jurnal',
    'bayar': 'mencatat pembayaran',
    'kirim': 'mengirim faktur',
    'terima': 'menerima tagihan',
    'batal': 'membatalkan data',
    'update-saldo': 'mengubah saldo rekening',
    'approval': 'memproses approval',
    'cairkan': 'mencairkan dana',
    'laporan': 'mengirim laporan',
    'konfirmasi-pengembalian': 'mengonfirmasi pengembalian dana',
    'revisi': 'merevisi pengajuan',
    'selesaikan': 'menyelesaikan perjalanan',
}


def actor_label(user):
    return (user.get_full_name() or user.username) if user else 'System'


def target_display_from_user(user):
    if not user:
        return ''
    label = user.get_full_name() or user.username
    return f'{label} (@{user.username})'


def compact_text(value, max_length=80):
    text = str(value or '').strip().replace('\n', ' ')
    if len(text) <= max_length:
        return text
    return f'{text[:max_length - 3]}...'


def get_keuangan_target_display(entity, entity_id):
    if not entity_id:
        return ''
    try:
        from .models import (
            Akun, Faktur, Jurnal, Kendaraan, LogBBM, LogMaintenance,
            LogPerjalanan, Pelanggan, Pemasok, PettyCash,
            PengajuanPenambahanSaldo, RekeningBank, Reimbursement,
            Tagihan, Transaksi,
        )

        if entity == 'petty-cash':
            obj = PettyCash.objects.filter(pk=entity_id).select_related('created_by').first()
            if obj:
                pemohon = target_display_from_user(obj.created_by)
                return f'{obj.no_pengajuan} - {compact_text(obj.keperluan)}{f" oleh {pemohon}" if pemohon else ""}'
        if entity == 'reimbursement':
            obj = Reimbursement.objects.filter(pk=entity_id).select_related('created_by').first()
            if obj:
                pemohon = target_display_from_user(obj.created_by)
                return f'{obj.no_reimbursement} - {compact_text(obj.keperluan)}{f" oleh {pemohon}" if pemohon else ""}'
        if entity == 'penambahan-saldo':
            obj = PengajuanPenambahanSaldo.objects.filter(pk=entity_id).select_related('created_by').first()
            if obj:
                pemohon = target_display_from_user(obj.created_by)
                return f'{obj.no_pengajuan} - {compact_text(obj.alasan)}{f" oleh {pemohon}" if pemohon else ""}'
        if entity == 'log-perjalanan':
            obj = LogPerjalanan.objects.filter(pk=entity_id).select_related('driver', 'kendaraan').first()
            if obj:
                return f'{obj.no_perjalanan} - {compact_text(obj.tujuan)} ({obj.kendaraan.plat_nomor})'
        if entity == 'kendaraan':
            obj = Kendaraan.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.plat_nomor} - {obj.nama}'
        if entity == 'log-bbm':
            obj = LogBBM.objects.filter(pk=entity_id).select_related('kendaraan', 'driver').first()
            if obj:
                return f'BBM {obj.kendaraan.plat_nomor} tanggal {obj.tanggal}'
        if entity == 'log-maintenance':
            obj = LogMaintenance.objects.filter(pk=entity_id).select_related('kendaraan').first()
            if obj:
                return f'{obj.get_jenis_display()} {obj.kendaraan.plat_nomor} tanggal {obj.tanggal}'
        if entity == 'rekening':
            obj = RekeningBank.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.nama_rekening} - {obj.nomor_rekening}'
        if entity == 'jurnal':
            obj = Jurnal.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.nomor_jurnal} - {compact_text(obj.keterangan)}'
        if entity == 'transaksi':
            obj = Transaksi.objects.filter(pk=entity_id).first()
            if obj:
                return f'transaksi tanggal {obj.tanggal} - {compact_text(obj.keterangan)}'
        if entity == 'faktur':
            obj = Faktur.objects.filter(pk=entity_id).select_related('pelanggan').first()
            if obj:
                return f'{obj.nomor_faktur} - {obj.pelanggan.nama}'
        if entity == 'tagihan':
            obj = Tagihan.objects.filter(pk=entity_id).select_related('pemasok').first()
            if obj:
                return f'{obj.nomor_tagihan} - {obj.pemasok.nama}'
        if entity == 'pelanggan':
            obj = Pelanggan.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.kode} - {obj.nama}'
        if entity == 'pemasok':
            obj = Pemasok.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.kode} - {obj.nama}'
        if entity == 'akun':
            obj = Akun.objects.filter(pk=entity_id).first()
            if obj:
                return f'{obj.kode} - {obj.nama}'
    except Exception:
        return ''
    return ''


def get_audit_target_snapshot(request, payload=None):
    app_label, entity, entity_id, extra_action, _ = infer_target(
        getattr(request, 'path', ''),
        getattr(request, 'method', ''),
    )
    snapshot = {
        'app_label': app_label,
        'entity': entity,
        'entity_id': entity_id,
        'extra_action': extra_action,
        'target_display': '',
    }

    try:
        if entity == 'users' and entity_id:
            target = get_user_model().objects.filter(pk=entity_id).first()
            snapshot['target_display'] = target_display_from_user(target)
            snapshot['target_is_active'] = target.is_active if target else None
        elif entity == 'users' and payload:
            username = payload.get('username') if isinstance(payload, dict) else ''
            if username:
                snapshot['target_display'] = f'@{username}'
        elif entity == 'units' and entity_id:
            unit = Unit.objects.filter(pk=entity_id).first()
            snapshot['target_display'] = unit.nama if unit else ''
        elif entity == 'units' and payload:
            name = payload.get('nama') if isinstance(payload, dict) else ''
            if name:
                snapshot['target_display'] = name
        elif app_label == 'keuangan' and entity_id:
            snapshot['target_display'] = get_keuangan_target_display(entity, entity_id)
    except Exception:
        pass

    return snapshot


def actor_from_request(request):
    user = getattr(request, 'user', None)
    if user and user.is_authenticated:
        return user
    try:
        result = JWTAuthentication().authenticate(request)
    except Exception:
        result = None
    if result:
        return result[0]
    return None


def infer_target(path, method):
    parts = [part for part in path.strip('/').split('/') if part]
    app_label = parts[1] if len(parts) > 1 and parts[0] == 'api' else ''
    entity = ''
    entity_id = 0
    extra_action = ''

    if app_label == 'keuangan':
        entity = parts[2] if len(parts) > 2 else ''
        if len(parts) > 3 and parts[3].isdigit():
            entity_id = int(parts[3])
            if len(parts) > 4:
                extra_action = parts[4]
    elif app_label == 'users':
        if len(parts) > 2 and parts[2] == 'units':
            entity = 'units'
            if len(parts) > 3 and parts[3].isdigit():
                entity_id = int(parts[3])
        else:
            entity = 'users'
            if len(parts) > 2 and parts[2].isdigit():
                entity_id = int(parts[2])
                if len(parts) > 3:
                    extra_action = parts[3]
    elif app_label:
        entity = app_label

    if method == 'POST' and entity_id:
        action = 'action'
    elif method == 'POST':
        action = 'create'
    elif method in ('PUT', 'PATCH'):
        action = 'update'
    elif method == 'DELETE':
        action = 'delete'
    else:
        action = 'action'

    if extra_action:
        action = 'action'

    return app_label, entity, entity_id, extra_action, action


def get_payload(metadata):
    payload = metadata.get('payload', {}) if isinstance(metadata, dict) else {}
    return payload if isinstance(payload, dict) else {}


def target_label(entity, entity_id='', metadata=None):
    metadata = metadata or {}
    snapshot = metadata.get('target', {}) if isinstance(metadata, dict) else {}
    display = snapshot.get('target_display') if isinstance(snapshot, dict) else ''
    if display:
        return display

    payload = get_payload(metadata)
    for key in ('no_pengajuan', 'no_reimbursement', 'no_perjalanan', 'nama', 'username', 'kode', 'nomor_jurnal'):
        if payload.get(key):
            return str(payload[key])

    if entity_id:
        return f'ID {entity_id}'
    return ''


def make_description(user, action, entity, entity_id='', extra_action='', metadata=None, status_code=None):
    actor = actor_label(user)
    metadata = metadata or {}
    readable_entity = ENTITY_LABELS.get(entity, (entity or 'endpoint').replace('-', ' '))
    target = target_label(entity, entity_id, metadata)
    target_suffix = f' {target}' if target else ''
    payload = get_payload(metadata)

    if status_code and status_code >= 400:
        if extra_action:
            action_text = EXTRA_ACTION_LABELS.get(extra_action, f'menjalankan {extra_action.replace("-", " ")}')
            return f'{actor} gagal {action_text} pada {readable_entity}{target_suffix}.'
        return f'{actor} gagal memproses {readable_entity}{target_suffix}.'

    if entity == 'users':
        if extra_action == 'toggle-aktif':
            snapshot = metadata.get('target', {}) if isinstance(metadata, dict) else {}
            was_active = snapshot.get('target_is_active') if isinstance(snapshot, dict) else None
            verb = 'menonaktifkan' if was_active is True else 'mengaktifkan'
            return f'{actor} {verb} akun user{target_suffix}.'
        if extra_action == 'set-password':
            return f'{actor} mereset password akun user{target_suffix}.'
        if action == 'create':
            return f'{actor} membuat akun user{target_suffix}.'
        if action == 'update':
            return f'{actor} mengubah data akun user{target_suffix}.'
        if action == 'delete':
            return f'{actor} menghapus akun user{target_suffix}.'

    if entity == 'units':
        if action == 'create':
            return f'{actor} menambahkan unit{target_suffix}.'
        if action == 'update':
            return f'{actor} mengubah data unit{target_suffix}.'
        if action == 'delete':
            return f'{actor} menghapus unit{target_suffix}.'

    if extra_action:
        if extra_action == 'approval':
            decision = payload.get('aksi')
            if decision == 'setujui':
                return f'{actor} menyetujui {readable_entity}{target_suffix}.'
            if decision == 'tolak':
                return f'{actor} menolak {readable_entity}{target_suffix}.'
        action_text = EXTRA_ACTION_LABELS.get(extra_action, f'menjalankan {extra_action.replace("-", " ")}')
        return f'{actor} {action_text} pada {readable_entity}{target_suffix}.'

    if extra_action:
        return f'{actor} menjalankan {extra_action.replace("-", " ")} pada {readable_entity}{f" #{entity_id}" if entity_id else ""}.'
    action_label = {
        'create': 'membuat',
        'update': 'mengubah',
        'delete': 'menghapus',
        'login': 'login ke sistem',
    }.get(action, 'menjalankan aksi pada')
    if action == 'login':
        return f'{actor} login ke sistem.'
    return f'{actor} {action_label} {readable_entity}{target_suffix}.'


def write_audit_log(request, action=None, description='', metadata=None, status_code=None):
    path = getattr(request, 'path', '')
    method = getattr(request, 'method', '')
    if path.startswith('/api/keuangan/audit-log'):
        return None

    user = actor_from_request(request)
    app_label, entity, entity_id, extra_action, inferred_action = infer_target(path, method)
    final_action = action or inferred_action
    metadata = metadata or {}
    if 'target' not in metadata:
        metadata['target'] = get_audit_target_snapshot(request, metadata.get('payload', {}))
    final_description = description or make_description(user, final_action, entity, entity_id, extra_action, metadata, status_code)

    return AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=final_action,
        entity_type=(entity or app_label or 'api')[:30],
        entity_id=entity_id,
        entity_display=f'{entity or app_label or "api"}{f" #{entity_id}" if entity_id else ""}'[:255],
        old_values={},
        new_values={
            'path': path,
            'method': method,
            'status_code': status_code,
            'role': getattr(user, 'role', '') if user else '',
            **(metadata or {}),
        },
        description=final_description,
        ip_address=get_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:1000],
        status='success' if not status_code or status_code < 400 else 'failed',
        error_message='',
    )
