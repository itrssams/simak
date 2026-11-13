# DESIGN.md — Aturan Desain UI SIMAK

Gaya: enterprise minimalis (acuan: Linear / Vercel / Stripe). Dioptimalkan untuk dark mode; light mode tetap harus terbaca baik.

> **Catatan implementasi:** frontend ini memakai CSS kustom per halaman (bukan Tailwind). Nilai `zinc-*`, `rounded-md`, dan `divide-x` di bawah diterjemahkan ke CSS variable / properti CSS biasa. Jangan menambah dependensi Tailwind.

## 1. No AI-Slop (dilarang)

- Banner hero dengan gradasi mencolok (ungu / biru neon) dan ornamen lingkaran blur.
- Kotak ikon warna-warni pastel di kartu statistik.
- Card terpisah-pisah dengan sudut terlalu bulat (`rounded-2xl`, radius > 12px) atau shadow tebal.
- Efek hover `translateY` / glow berlebihan pada elemen non-interaktif.
- Tombol aksi sekunder berwarna mencolok (misalnya tombol "Cari" ungu).

## 2. Layout & Hierarchy

- **Page header ringkas:** tanpa background gradasi. Judul tegas (20px, weight 650), subjudul 1 baris abu-abu redup (13px), tombol aksi utama solid di kanan.
- **Stat-bar datar:** statistik ringkasan digabung dalam satu kontainer horizontal dengan pemisah vertikal tipis (setara `divide-x`). Tanpa ikon berwarna. Angka 20px, label 12px abu-abu.
- Jarak antar blok halaman 16px; padding halaman 24px (12px di mobile).

## 3. Surface & Borders

| Token (CSS var)  | Dark                | Light     | Padanan Tailwind  |
|------------------|---------------------|-----------|-------------------|
| `--pu-surface`   | `#09090b`           | `#ffffff` | `zinc-950`        |
| `--pu-surface-2` | `#18181b`           | `#fafafa` | `zinc-900`        |
| `--pu-border`    | `#27272a`           | `#e4e4e7` | `zinc-800`        |
| `--pu-text`      | `#fafafa`           | `#18181b` | `zinc-50`         |
| `--pu-muted`     | `#a1a1aa`           | `#52525b` | `zinc-400`        |
| `--pu-faint`     | `#71717a`           | `#71717a` | `zinc-500`        |
| `--pu-accent`    | `#fafafa` (teks `#18181b`) | `#18181b` (teks `#fafafa`) | tombol utama solid monokrom |

- Garis batas selalu 1px `--pu-border`.
- Radius komponen: 6px (input, tombol, badge) dan 8px (kontainer/card). Tidak ada shadow.

## 4. Data Table & Controls

- **Satu kontainer:** toolbar (pencarian + filter) menyatu di atas tabel dalam satu card, dipisah garis tipis.
- Pencarian: ikon kecil terintegrasi di dalam input (klik atau Enter untuk mencari). Tidak ada tombol "Cari" berwarna.
- Filter berupa `select` kompak (tinggi 34px). Reset & refresh berupa tombol ghost kecil.
- Header tabel: 11px uppercase, warna `--pu-faint`, latar `--pu-surface-2`.
- Baris: padding 12px 16px, pemisah `--pu-border`, hover lembut.
- **Badge status kalem (muted):** latar transparan-tipis + border tipis + teks berwarna redup. Warna hanya membedakan status, bukan menarik perhatian.
- Pagination berada di dalam card yang sama (footer tabel).

## 5. Aturan Refactor

- Ubah tampilan saja. Dilarang mengubah logika fetch API, state, filter, atau handler aksi.
- Kelas yang dipakai bersama modal (`.pu-btn`, `.pu-modal-*`) tidak diubah kecuali diminta.

