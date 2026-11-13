# DESIGN.md — Stripe Dashboard Clean Enterprise Light Mode

Aturan desain UI untuk frontend SIMAK (CSS kustom per halaman dengan dukungan tema `[data-theme="light"]` dan fallback dark mode). Mengacu pada estetika **Stripe Dashboard**: kanvas putih datar, tipografi kontras tinggi, tab garis bawah (*underline tabs*), kontrol filter ringkas berbingkai tipis, dan tabel tanpa kotak luar yang berat.

---

## 1. Prinsip Utama (Flat White Canvas & No AI-Slop)
- **Dilarang**: Banner hero bergradasi mencolok, kotak ikon warna-warni pastel di kartu statistik, pembungkus *card* abu-abu berlapis di sekitar metrik, `rounded-2xl`, serta *drop shadow* tebal.
- **Kanvas Putih Datar (`[data-theme="light"]`)**: Permukaan utama halaman menggunakan `#ffffff` bersih. Elemen duduk langsung di atas kanvas putih dan hanya dipisahkan oleh garis tipis `1px solid #e3e8ee` serta *whitespace* yang terukur.
- **Dark Mode Fallback**: Tetap mendukung mode gelap default (`#09090b` / `#18181b`, border `#27272a`) agar konsisten bila pengguna belum beralih ke Light Mode.

---

## 2. Token Warna & Permukaan

### Light Mode (`[data-theme="light"]`) — Utama
| Token | Nilai | Penggunaan |
| :--- | :--- | :--- |
| `--pu-bg` | `#ffffff` | Kanvas halaman datar |
| `--pu-surface` | `#ffffff` | Permukaan kontrol & tabel |
| `--pu-surface-2` | `#f7fafc` | Latar hover baris / header sangat lembut |
| `--pu-border` | `#e3e8ee` | Garis pemisah horizontal & pembagi stat-bar |
| `--pu-border-ctrl` | `#d8dee4` | Bingkai kontrol filter inline & input |
| `--pu-text` | `#1a1f36` | Judul halaman, angka KPI, teks utama |
| `--pu-muted` | `#697386` | Subjudul, label KPI, header kolom tabel |
| `--pu-faint` | `#8792a2` | Placeholder, teks sekunder ringan |
| `--pu-accent` | `#635bff` | Tombol aksi utama & indikator tab aktif (Stripe Indigo) |
| `--pu-accent-hover` | `#544dc9` | Hover tombol aksi utama |
| `--pu-accent-fg` | `#ffffff` | Teks tombol aksi utama |
| `--pu-ctrl-shadow` | `0 1px 2px rgba(26, 31, 54, 0.06)` | Bayangan halus kontrol inline |

### Dark Mode (Aligned High-Contrast Enterprise)
| Token | Nilai | Penggunaan |
| :--- | :--- | :--- |
| `--pu-bg` | `#0b0f17` | Kanvas gelap |
| `--pu-surface` | `#12161f` | Permukaan modal & kontrol |
| `--pu-input-bg` | `#090c12` | Latar input lebih gelap agar batas tegas |
| `--pu-surface-2` | `#161b24` | Latar hover baris & menu dropdown |
| `--pu-border` | `rgba(255, 255, 255, 0.1)` | Garis pemisah tabel & divider stat-bar |
| `--pu-border-ctrl` | `rgba(255, 255, 255, 0.12)` | Bingkai kontrol filter & input |
| `--pu-text` | `#f8fafc` | Teks utama & label stat/tab aktif |
| `--pu-muted` | `#94a3b8` | Teks sekunder & header tabel |
| `--pu-faint` | `#64748b` | Placeholder & tanda kosong (`—`) |
| `--pu-accent` | `#635bff` | Tombol aksi utama |
| `--pu-tab-active-text` | `#f8fafc` | Teks tab stat aktif di dark mode |
| `--pu-tab-active-line` | `#818cf8` | Garis bawah indikator aktif (indigo terang) |
| `--pu-accent-fg` | `#ffffff` | Teks tombol utama |

---

## 3. Tipografi, Header & Tab Garis Bawah
- **Page Header**:
  - Judul kiri tegas (`22px`–`24px`, `font-weight: 700`, warna `#1a1f36` pada light mode), subjudul singkat di bawahnya (`13px`, warna `#697386`).
  - Tombol aksi utama solid di kanan (`#635bff`, `border-radius: 6px`, teks putih `#ffffff`, tanpa gradasi neon).
- **Sub-Navigasi Tab (*Underline Tabs*)**:
  - Teks bersih (`13px`, `font-weight: 500`, warna `#697386`) dengan batas bawah tipis `1px solid #e3e8ee` sepanjang baris tab.
  - Item aktif berwarna `#635bff` (`font-weight: 600`) dengan garis bawah `2px solid #635bff` tanpa bentuk kapsul (*pill*) atau kotak latar.

---

## 4. Stat-Bar Datar (Unboxed Metrics)
- Hilangkan latar belakang kartu abu-abu atau kotak pembungkus di sekitar KPI.
- 5 metrik duduk langsung di atas kanvas putih (`#ffffff`), dibatasi garis tipis `#e3e8ee` di bagian atas/bawah atau garis pemisah vertikal tipis antar metrik.
- Angka besar (`22px`–`24px`, `font-weight: 600`, `font-variant-numeric: tabular-nums`, `#1a1f36`), label kecil di atas atau di bawah (`12px`, `#697386`).

---

## 5. Toolbar Filter & Tabel Minimalis
- **Compact Inline Controls**: Input pencarian dan dropdown filter (`Semua Ruangan`, `Semua Status`, tombol refresh/reset) berbentuk kontrol ringkas (`height: 32px`, `border-radius: 6px`, `1px solid #d8dee4`, bayangan halus `0 1px 2px rgba(26, 31, 54, 0.06)`).
- **Tabel Tanpa Kotak Luar Berat**:
  - Hilangkan bingkai kotak card tebal di sekeliling tabel.
  - Header tabel ringan (`11px`–`12px`, `font-weight: 600`, warna `#697386`, garis bawah `1px solid #e3e8ee`).
  - Pemisah antar baris menggunakan garis horizontal tipis `1px solid #e3e8ee` dengan efek hover lembut (`#f7fafc`).
- **Status Badges**: Pastel lembut dengan teks kontras tinggi (contoh light mode: `MENUNGGU` `#fef3c7`/`#92400e`, `DISETUJUI` `#d1fae5`/`#065f46`, `SELESAI` `#e0f2fe`/`#075985`, `DITOLAK` `#ffe4e6`/`#9f1239`).
