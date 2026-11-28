import os
import threading
import time
from django.conf import settings
from django.db import OperationalError, ProgrammingError

_STATE_LOCK = threading.Lock()
_CACHED_STATE = None
_CACHED_AT = 0.0
_CACHE_TTL_SECONDS = 2.0

PROD_DEFAULT_BOT_TOKEN = '8654069034:AAHbdAo-sYyixpgWVN42dU0YGPmVjxxSx2s'
PROD_DEFAULT_BOT_USERNAME = 'simak_rssiaga_bot'
PROD_DEFAULT_SDM_BOT_TOKEN = '8407492016:AAGY1LgVCLLQm5LYmr0wbZypTK1D9Mys7uA'
PROD_DEFAULT_SDM_BOT_USERNAME = 'simak_sdm_bot'


def _env_str(key, default=''):
    """Read raw env var preserving intentionally empty values (e.g. KEY=)."""
    if key in os.environ:
        return (os.environ.get(key) or '').strip()
    val = getattr(settings, key, default)
    return (val or '').strip()


def _env_bool(key, default=False):
    val = os.getenv(key)
    if val is None or val.strip() == '':
        return default
    return val.strip().lower() in ('1', 'true', 'yes', 'on')


def get_telegram_bot_token():
    return _env_str('TELEGRAM_BOT_TOKEN', PROD_DEFAULT_BOT_TOKEN)


def get_telegram_bot_username():
    return _env_str('TELEGRAM_BOT_USERNAME', PROD_DEFAULT_BOT_USERNAME) or PROD_DEFAULT_BOT_USERNAME


def get_sdm_bot_polling_token():
    """
    Token khusus polling @simak_sdm_bot.
    Mengembalikan None jika sengaja dikosongkan (misal di mode dev) atau identik dengan token bot utama
    agar tidak terjadi polling ganda / 409 Conflict ke bot yang sama.
    """
    sdm_token = _env_str('TELEGRAM_SDM_BOT_TOKEN', PROD_DEFAULT_SDM_BOT_TOKEN)
    if not sdm_token or sdm_token == get_telegram_bot_token():
        return None
    return sdm_token


def get_sdm_bot_token():
    """
    Token untuk MENGIRIM pesan tembusan SDM.
    Jika TELEGRAM_SDM_BOT_TOKEN dikosongkan (dev), fallback ke bot utama agar tetap terkirim via bot dev.
    """
    return get_sdm_bot_polling_token() or get_telegram_bot_token()


def get_sdm_bot_username():
    if get_sdm_bot_polling_token():
        return _env_str('TELEGRAM_SDM_BOT_USERNAME', PROD_DEFAULT_SDM_BOT_USERNAME) or PROD_DEFAULT_SDM_BOT_USERNAME
    return get_telegram_bot_username()


def is_dev_bot_token():
    token = get_telegram_bot_token()
    username = get_telegram_bot_username().lower()
    django_env = getattr(settings, 'DJANGO_ENV', 'development')
    return django_env != 'production' or token != PROD_DEFAULT_BOT_TOKEN or username != PROD_DEFAULT_BOT_USERNAME


def get_env_defaults():
    django_env = getattr(settings, 'DJANGO_ENV', 'development')
    tg_mode = _env_str('TELEGRAM_MODE', 'dev' if django_env != 'production' else 'prod').lower()
    sandbox_chat_id = _env_str('TELEGRAM_SANDBOX_CHAT_ID', '')
    is_dev_env = tg_mode == 'dev' or django_env != 'production' or bool(sandbox_chat_id)

    bot_polling_default = True if is_dev_env else False
    auto_sync_default = False
    bot_polling = _env_bool('ENABLE_TELEGRAM_BOT_POLLING', bot_polling_default)
    auto_sync = _env_bool('ENABLE_MESIN_AUTO_SYNC', auto_sync_default)
    sandbox_redirect = bool(is_dev_env)

    if not bot_polling and not auto_sync:
        mode = 'paused'
    elif sandbox_redirect:
        mode = 'dev'
    else:
        mode = 'prod'

    return {
        'mode': mode,
        'bot_polling_enabled': bot_polling,
        'auto_sync_enabled': auto_sync,
        'sandbox_redirect_enabled': sandbox_redirect,
        'sandbox_chat_id': sandbox_chat_id,
    }


def _compute_mode(bot_polling_enabled, auto_sync_enabled, sandbox_redirect_enabled):
    if not bot_polling_enabled and not auto_sync_enabled:
        return 'paused'
    return 'dev' if sandbox_redirect_enabled else 'prod'


def invalidate_automation_cache():
    global _CACHED_STATE, _CACHED_AT
    with _STATE_LOCK:
        _CACHED_STATE = None
        _CACHED_AT = 0.0


def get_automation_state(force_refresh=False):
    """
    Mengembalikan status konfigurasi runtime bot Telegram & auto-sync mesin.
    Memakai cache in-memory 2 detik agar background thread tidak membebani DB.
    """
    global _CACHED_STATE, _CACHED_AT
    now = time.monotonic()
    with _STATE_LOCK:
        if not force_refresh and _CACHED_STATE is not None and (now - _CACHED_AT) < _CACHE_TTL_SECONDS:
            return dict(_CACHED_STATE)

    defaults = get_env_defaults()
    state = dict(defaults)
    state['updated_at'] = None
    state['updated_by_username'] = None

    try:
        from ..models import SdmAutomationConfig
        cfg, created = SdmAutomationConfig.objects.select_related('updated_by').get_or_create(
            pk=1,
            defaults=defaults,
        )
        # Jika baru dibuat atau DB sandbox kosong padahal ENV menyediakan sandbox_chat_id, isi default ENV
        env_sandbox_cid = defaults.get('sandbox_chat_id', '')
        if not cfg.sandbox_chat_id and env_sandbox_cid and cfg.sandbox_redirect_enabled:
            cfg.sandbox_chat_id = env_sandbox_cid
            cfg.save(update_fields=['sandbox_chat_id'])

        state = {
            'mode': _compute_mode(cfg.bot_polling_enabled, cfg.auto_sync_enabled, cfg.sandbox_redirect_enabled),
            'bot_polling_enabled': bool(cfg.bot_polling_enabled),
            'auto_sync_enabled': bool(cfg.auto_sync_enabled),
            'sandbox_redirect_enabled': bool(cfg.sandbox_redirect_enabled),
            'sandbox_chat_id': (cfg.sandbox_chat_id or '').strip(),
            'updated_at': cfg.updated_at.isoformat() if cfg.updated_at else None,
            'updated_by_username': cfg.updated_by.username if cfg.updated_by else ('Sistem (ENV)' if created else None),
        }
    except (OperationalError, ProgrammingError):
        pass
    except Exception:
        pass

    with _STATE_LOCK:
        _CACHED_STATE = dict(state)
        _CACHED_AT = time.monotonic()
    return dict(state)


def build_runtime_status_payload(can_manage=False):
    state = get_automation_state(force_refresh=True)
    bot_username = get_telegram_bot_username()
    sdm_bot_username = get_sdm_bot_username()
    sdm_polling_token = get_sdm_bot_polling_token()

    state.update({
        'django_env': getattr(settings, 'DJANGO_ENV', 'development'),
        'bot_username': bot_username,
        'bot_link': f'https://t.me/{bot_username}',
        'sdm_bot_username': sdm_bot_username,
        'sdm_bot_link': f'https://t.me/{sdm_bot_username}',
        'sdm_bot_separate': bool(sdm_polling_token),
        'is_dev_bot_token': is_dev_bot_token(),
        'can_manage': bool(can_manage),
    })
    return state


def update_automation_state(user=None, preset=None, **fields):
    from ..models import SdmAutomationConfig

    defaults = get_env_defaults()
    cfg, _ = SdmAutomationConfig.objects.get_or_create(pk=1, defaults=defaults)

    if preset == 'dev':
        cfg.sandbox_redirect_enabled = True
        cfg.bot_polling_enabled = True
        if 'auto_sync_enabled' in fields and fields['auto_sync_enabled'] is not None:
            cfg.auto_sync_enabled = bool(fields['auto_sync_enabled'])
        else:
            # Di environment dev default auto-sync dimatikan agar tidak berebut mesin dengan server prod
            if getattr(settings, 'DJANGO_ENV', 'development') != 'production':
                cfg.auto_sync_enabled = False
        if not cfg.sandbox_chat_id and defaults.get('sandbox_chat_id'):
            cfg.sandbox_chat_id = defaults['sandbox_chat_id']
    elif preset == 'prod':
        cfg.sandbox_redirect_enabled = False
        cfg.bot_polling_enabled = True
        cfg.auto_sync_enabled = True
    elif preset == 'paused':
        cfg.bot_polling_enabled = False
        cfg.auto_sync_enabled = False

    if 'bot_polling_enabled' in fields and fields['bot_polling_enabled'] is not None and preset is None:
        cfg.bot_polling_enabled = bool(fields['bot_polling_enabled'])
    if 'auto_sync_enabled' in fields and fields['auto_sync_enabled'] is not None and preset is None:
        cfg.auto_sync_enabled = bool(fields['auto_sync_enabled'])
    if 'sandbox_redirect_enabled' in fields and fields['sandbox_redirect_enabled'] is not None and preset is None:
        cfg.sandbox_redirect_enabled = bool(fields['sandbox_redirect_enabled'])
    if 'sandbox_chat_id' in fields and fields['sandbox_chat_id'] is not None:
        cfg.sandbox_chat_id = str(fields['sandbox_chat_id']).strip()

    cfg.mode = _compute_mode(
        cfg.bot_polling_enabled,
        cfg.auto_sync_enabled,
        cfg.sandbox_redirect_enabled,
    )
    if user and getattr(user, 'is_authenticated', False):
        cfg.updated_by = user
    cfg.save()
    invalidate_automation_cache()
    return build_runtime_status_payload(can_manage=True)
