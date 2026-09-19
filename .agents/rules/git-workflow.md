# Git Branching Workflow

1. **Selalu gunakan branch khusus saat mengerjakan task baru**:
   - `feat/<nama-fitur>`: untuk penambahan fitur baru atau pengembangan modul.
   - `fix/<nama-bug>`: untuk perbaikan bug, issue layout, atau kalkulasi.
   - `refactor/<nama-tugas>`: untuk penataan ulang atau optimasi kode.

2. **Alur Kerja**:
   - Tarik update terbaru sebelum mulai: `git checkout main && git pull origin main`
   - Buat branch baru: `git checkout -b <nama-branch>`
   - Lakukan commit teratur dengan pesan yang deskriptif (Conventional Commits: `feat: ...`, `fix: ...`, dsb.).
   - Push branch ke remote: `git push -u origin <nama-branch>`
   - Merge ke `main` jika pekerjaan sudah selesai dan teruji, atau sesuai instruksi user.
