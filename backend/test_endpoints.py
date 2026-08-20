"""
Script testing endpoint untuk semua modul yang dipecah.
"""
import requests
import sys
import json

BASE_URL = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg3MTMxODMyLCJpYXQiOjE3ODcxMDMwMzIsImp0aSI6IjdmODhjZjE2MDg4ZDRmZjNiZWQ1MjdkN2RlNzAzM2I1IiwidXNlcl9pZCI6IjEifQ.ZIzZiAmTUwE4l9AjsRgaK26eIcFb4Cv-9BbSCySkeYE"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

endpoints = [
    # ==== LOGISTIK ====
    ("GET", "logistik", "/api/keuangan/logistik/barang/"),
    ("GET", "logistik", "/api/keuangan/logistik/vendor/"),
    ("GET", "logistik", "/api/keuangan/logistik/spb/"),
    ("GET", "logistik", "/api/keuangan/logistik/pembelian/"),
    ("GET", "logistik", "/api/keuangan/logistik/batch/"),
    ("GET", "logistik", "/api/keuangan/logistik/mutasi/"),
    ("GET", "logistik", "/api/keuangan/logistik/permintaan/"),
    ("GET", "logistik", "/api/keuangan/logistik/opname/"),

    # ==== DRIVER ====
    ("GET", "driver", "/api/keuangan/kendaraan/"),
    ("GET", "driver", "/api/keuangan/log-perjalanan/"),
    ("GET", "driver", "/api/keuangan/log-bbm/"),
    ("GET", "driver", "/api/keuangan/log-maintenance/"),
    ("GET", "driver", "/api/keuangan/rekap-driver/"),

    # ==== SYSTEM ====
    ("GET", "system", "/api/keuangan/audit-log/"),
    ("GET", "system", "/api/keuangan/announcements/"),
    ("GET", "system", "/api/keuangan/announcements/unread-count/"),
]

results = []
has_error = False

for method, module, path in endpoints:
    url = BASE_URL + path
    try:
        r = requests.request(method, url, headers=HEADERS, timeout=10)
        ok = r.status_code < 400
        status = "OK " if ok else "ERR"
        if not ok:
            has_error = True
        results.append((module, method, path, r.status_code, status, r.text[:300] if not ok else ""))
    except Exception as e:
        has_error = True
        results.append((module, method, path, 0, "EXC", str(e)[:300]))

print("\n========= HASIL TEST ENDPOINT =========\n")
current_module = None
for module, method, path, code, status, detail in results:
    if module != current_module:
        print(f"\n--- {module.upper()} ---")
        current_module = module
    print(f"  [{status}] {method} {path}  --> HTTP {code}")
    if detail:
        # Try to extract just the title/error from Django HTML
        import re
        title = re.search(r'<title>(.*?)</title>', detail)
        if title:
            print(f"    Error: {title.group(1).strip()}")
        else:
            print(f"    Error: {detail[:150]}")

print("\n======================================")
if has_error:
    print("⚠️  Ada endpoint yang error!")
    sys.exit(1)
else:
    print("✅ Semua endpoint OK!")
