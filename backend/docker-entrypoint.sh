#!/bin/sh
set -e

python - <<'PY'
import os
import socket
import sys
import time

host = os.getenv("DB_HOST", "mysql")
port = int(os.getenv("DB_PORT", "3306"))
deadline = time.time() + int(os.getenv("DB_WAIT_TIMEOUT", "60"))

while True:
    try:
        with socket.create_connection((host, port), timeout=3):
            break
    except OSError as exc:
        if time.time() >= deadline:
            print(f"Database {host}:{port} belum siap: {exc}", file=sys.stderr)
            sys.exit(1)
        print(f"Menunggu database {host}:{port}...")
        time.sleep(2)
PY

python manage.py migrate --noinput

exec "$@"
