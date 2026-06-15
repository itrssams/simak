# SIMAK RSSIAGA

SIMAK adalah aplikasi internal untuk membantu pencatatan dan pemantauan operasional RSSIAGA. Aplikasi ini mencakup pengajuan petty cash, reimbursement, aktivitas driver, audit log, pengumuman, manajemen user, dan modul IT.

## Fitur Utama

- Dashboard ringkas untuk approval Petty Cash, Reimbursement, dan Driver.
- Pengajuan dan approval Petty Cash.
- Pengajuan dan approval Reimbursement.
- Modul Driver untuk perjalanan, BBM, dan maintenance kendaraan.
- Laporan Petty Cash/Reimbursement dengan export PDF dan Excel.
- Laporan IT dengan format formal dan kop.
- Audit log aktivitas akun, termasuk login dan perubahan data penting.
- Manajemen user, role, unit, akses driver, dan akses IT.
- Pengumuman untuk seluruh akun atau audiens tertentu.
- Modul IT Center untuk catatan perbaikan, remote access, credential note, subscription, backup, dan log.
- Upload foto dengan kompresi dan preview di aplikasi.

## Teknologi

- Backend: Django, Django REST Framework
- Frontend: React, Vite
- Database: MySQL/MariaDB
- Auth: JWT
- Reverse proxy production: Nginx Proxy Manager

## Struktur Project

```text
simak/
  backend/       Backend Django dan API
  frontend/      Frontend React/Vite
  run-app.ps1    Runner utama development/production
  RUN_APP.bat    Launcher mudah untuk Windows
  requirements.txt
  PANDUAN_DEV_PROD.txt
```

## Environment

File `.env` tidak disimpan ke Git karena berisi konfigurasi sensitif.

Template tersedia di:

```text
backend/.env.example
frontend/.env.example
```

Mode development dan production dipisahkan lewat:

```text
backend/.env.development
backend/.env.production
frontend/.env.development
frontend/.env.production
```

Default database:

```text
development: simak_dev
production : simak
```

## Menjalankan Aplikasi

Cara paling mudah di Windows:

```text
Double-click RUN_APP.bat
```

Lalu pilih mode:

```text
1. Development
2. Production
```

Atau lewat PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-app.ps1 -Mode development
```

Production:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-app.ps1 -Mode production -ProductionPort 8900
```

Kalau pertama kali menjalankan atau setelah update dependency:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-app.ps1 -Mode development -InstallDeps
```

Panduan lengkap ada di:

```text
PANDUAN_DEV_PROD.txt
```

## Seed Data Demo

Untuk mengisi data demo dashboard PC, Reimbursement, dan Driver:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py seed_demo
```

Kalau ingin seed ulang:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py seed_demo --force
```

Akun demo:

```text
demo_manager
demo_direktur
demo_karyawan
demo_driver
```

Password:

```text
demo12345
```

## Production

Untuk akses publik, domain diarahkan ke aplikasi production melalui Nginx Proxy Manager.

Contoh domain:

```text
https://simak.rssiaga.id
```

Pastikan konfigurasi production memakai domain publik untuk:

- CORS
- CSRF trusted origins
- URL API frontend
- Media/upload file
- SSL termination di Nginx Proxy Manager

## Catatan Keamanan

- Jangan commit file `.env`.
- Jangan commit database lokal.
- Jangan commit file upload user.
- Gunakan password kuat untuk akun production.
- Pisahkan database development dan production.
- Backup database dan media upload secara berkala.

## Repository

Repository GitHub:

```text
https://github.com/itrssams/simak.git
```
