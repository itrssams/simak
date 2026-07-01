from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

# ==============================================================================
# BASE
# ==============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent


def resolve_env_path(value):
    env_path = Path(value)
    if env_path.is_absolute():
        return env_path
    candidates = [
        BASE_DIR.parent / env_path,
        BASE_DIR / env_path,
        env_path,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return BASE_DIR / env_path


DJANGO_ENV = os.getenv('DJANGO_ENV', 'development').strip().lower()
ENV_FILE = os.getenv('ENV_FILE')
if ENV_FILE:
    load_dotenv(resolve_env_path(ENV_FILE), override=True)
else:
    load_dotenv(BASE_DIR / f'.env.{DJANGO_ENV}', override=True)
    load_dotenv(BASE_DIR / '.env', override=False)

def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


DEBUG = env_bool('DEBUG', True)

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'dev-only-change-me-simak-local-secret-key-2026'
    else:
        raise ImproperlyConfigured('SECRET_KEY wajib diset untuk production.')

PUBLIC_DOMAIN = os.getenv('PUBLIC_DOMAIN', 'simak.rssiaga.id')
PUBLIC_SCHEME = os.getenv('PUBLIC_SCHEME', 'https')
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', f'{PUBLIC_SCHEME}://{PUBLIC_DOMAIN}').rstrip('/')

ALLOWED_HOSTS = env_list(
    'ALLOWED_HOSTS',
    f'localhost,127.0.0.1,192.168.44.15,192.168.44.116,{PUBLIC_DOMAIN}',
)


# ==============================================================================
# INSTALLED APPS
# ==============================================================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    # Local apps
    'users',
    'keuangan',
]


# ==============================================================================
# MIDDLEWARE
# ==============================================================================
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',        # Harus paling atas
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'keuangan.middleware.AuditLogMiddleware',
]


# ==============================================================================
# URLS & TEMPLATES
# ==============================================================================
ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'staticfiles')],  # Untuk serve React index.html
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ==============================================================================
# DATABASE (MySQL via XAMPP)
# ==============================================================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME', 'simak_dev'),
        'USER': os.getenv('DB_USER', 'root'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}


# ==============================================================================
# AUTH USER MODEL
# ==============================================================================
AUTH_USER_MODEL = 'users.User'


# ==============================================================================
# PASSWORD VALIDATION
# ==============================================================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ==============================================================================
# INTERNATIONALIZATION
# ==============================================================================
LANGUAGE_CODE = 'id'
TIME_ZONE = 'Asia/Jakarta'
USE_I18N = True
USE_TZ = True


# ==============================================================================
# STATIC FILES
# ==============================================================================
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'static'),
]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ==============================================================================
# MEDIA FILES (Upload berkas)
# ==============================================================================
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')


# ==============================================================================
# DJANGO REST FRAMEWORK
# ==============================================================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}


# ==============================================================================
# JWT SETTINGS
# ==============================================================================
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),    # Token expired 8 jam
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# ==============================================================================
# CORS (Izinkan React frontend akses API)
# ==============================================================================
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS') or [
    PUBLIC_BASE_URL,
    f'http://{PUBLIC_DOMAIN}',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://localhost:8900',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8900',
    'http://192.168.44.15:5173',
    'http://192.168.44.15:8900',  # ← IP PC Anda
    'http://192.168.44.15:8000',  # ← Alternative port
]

CORS_ALLOW_CREDENTIALS = True

# ==============================================================================
# SECURITY & CSRF
# ==============================================================================
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS') or [
    PUBLIC_BASE_URL,
    f'http://{PUBLIC_DOMAIN}',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://localhost:8900',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8900',
    'http://192.168.44.15:5173',
    'http://192.168.44.15:8900',
    'http://192.168.44.15:8000',
]

# Disable COOP header untuk development dengan IP address
SECURE_CROSS_ORIGIN_OPENER_POLICY = None

# Cookie settings untuk access dari network
SESSION_COOKIE_SECURE = env_bool('SESSION_COOKIE_SECURE', not DEBUG)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'

# CSRF settings
CSRF_COOKIE_SECURE = env_bool('CSRF_COOKIE_SECURE', not DEBUG)
CSRF_COOKIE_HTTPONLY = False  # Harus False agar JS bisa akses token
CSRF_COOKIE_SAMESITE = 'Lax'

SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', not DEBUG)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0' if DEBUG else '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('SECURE_HSTS_INCLUDE_SUBDOMAINS', not DEBUG)
SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', True)
