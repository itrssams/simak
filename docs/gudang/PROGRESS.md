# PROGRESS: Gudang Logistik v2

Rancangan: `docs/gudang/RANCANGAN.md` | Audit sistem lama: `docs/gudang/AUDIT_LOGISTIK_LAMA.md`

Aturan: perbarui file ini di AKHIR setiap fase (apa yang selesai, file yang disentuh, uji yang lulus, hal yang menggantung).

## Status fase

| Fase | Nama | Status |
|---|---|---|
| 0 | Persiapan & verifikasi data live | **SELESAI (5 Nov 2026)** |
| 1 | Fondasi (ledger, StockService, penomoran) | **SELESAI (5 Nov 2026)** |
| 2 | Master data (Barang, Satuan, Kemasan, Ruangan, Riwayat Legacy) | **SELESAI (5 Nov 2026)** |
| 3 | Pembelian (PO/GRN) - Independen dari Keuangan | **SELESAI (5 Nov 2026)** |
| 4 | Permintaan, Pengeluaran, jembatan app_siaga | **SELESAI (5 Nov 2026)** |
| 5 | Opname & go-live (Saldo Awal Cut-Over) | **SELESAI (5 Nov 2026)** |
| 6 | Laporan & template import Excel | **SELESAI (5 Nov 2026)** |

## Keputusan user (5 Nov 2026, lihat RANCANGAN.md bagian 13)

| # | Pertanyaan | Jawaban user |
|---|---|---|
| Q0 | Pakai data lama? | **YA (sebagai tampilan/referensi read-only):** Daftar master barang lama tetap diimpor (dengan normalisasi & mapping `legacy_id_brg`), dan jejak riwayat keluar-masuk lama disalin ke `gdg_legacy_mutasi` (tampil di tab "Riwayat Lama" pada Kartu Stok). Tidak dihitung ke saldo ledger baru agar kerusakan stok minus tidak ikut terbawa. |
| Q1 | Satuan: freetext atau daftar baku? | **Daftar baku + tombol "Tambah Satuan":** Menggunakan master `gdg_satuan` yang terkontrol namun admin gudang bisa menambah satuan baru kapan saja langsung dari form. |
| Q2 | Satu atau banyak gudang? | **Default 1 gudang (`GUDANG-UMUM`)**, struktur tabel siap multi-gudang. |
| Q3 | Ambang approval | **Bebas siapa saja minimal Kepala Seksi (`kepala_seksi`) ke atas (`manajer`, `wakil_direktur`, `direktur`, `superuser`), TANPA batas nominal.** Syarat utama: pembuat dokumen ≠ penyetuju. |
| Q4 | Akun unit: bersama per ruang atau individu? | **Akun bersama per ruang** (mengingat staf unit di `app_siaga` mayoritas belum punya akun personal di SIMAK). |
| Q5 | Cakupan non-farmasi saja? | **Ya, khusus logistik umum / non-farmasi** (ATK, cetakan, RT, teknik, dll.). Gudang farmasi terpisah. |
| Q6 | Batch/expired? | **Default: tidak wajib** (kolom opsional tetap disiapkan). |
| Q7 | Tanggal cut-over & jadwal hitung fisik | **Belum ditentukan.** Fase 0 s/d 4 bisa dikerjakan lebih dulu secara paralel tanpa mengganggu operasional saat ini. |
| Q8 | Selisih opname lama -151.470 unit | **Data pembelian/masuk kemungkinan besar tidak pernah diinput di masa lalu.** Karena itu saldo awal sistem baru nantinya diambil dari stock opname fisik, bukan dari hitungan rumus lama. |

## Catatan per fase

- **Pra-Fase 0 (5 Nov 2026):**
  - Audit sistem lama selesai (`docs/gudang/AUDIT_LOGISTIK_LAMA.md`).
  - Dokumen rancangan v2 selesai (`docs/gudang/RANCANGAN.md`).
  - Seluruh keputusan kunci Q0–Q8 dikunci.

- **Fase 0: Persiapan & Perbaikan Live Server 116 (5 Nov 2026):**
  - Root cause SPB 260222-260224 tabrakan di live server 116 ditemukan: orphan header app_siaga tanpa item.
  - Perbaikan data live 116: 10 SPB (260222 s/d 260232) lengkap disalin ke `tran_beli_brg_log` & `item_logistik` sebagai draft penerimaan dengan `kirim_keuangan='Y'`.
  - Fix logic `backend/logistik/views.py`: aksi approve SPB otomatis salin item detail ke draft penerimaan.

- **Fase 1: Fondasi (5 Nov 2026):**
  - Struktur app baru `backend/gudang/` dibuat.
  - Model NumberingSequence (`gdg_nomor_seq`) dengan row-level lock atomic.
  - Model immutable `StokLedger` (`gdg_ledger`) override `save()` & `delete()` to prevent update/deletion.
  - Model cached `StokSaldo` (`gdg_saldo`).
  - Model master `Gudang`, `GolonganBarang`, `Satuan`, `Barang`, `BarangKemasan`, `Ruang`.
  - Service `StockService`: atomic `record_in`, `record_out`, `record_reversal` dengan Weighted Moving Average & validasi stok tidak boleh minus.
  - Migrasi `0001_initial.py` diaplikasikan ke database.
  - 5/5 Unit Test LULUS di `backend/gudang/tests/test_stock.py`.

- **Fase 2: Master Data & Locking Modul Lama (5 Nov 2026):**
  - **Locking v1:**
    - `frontend/src/pages/Logistik/Logistik.jsx` dikunci menjadi Read-Only (`isModuleLocked = true`), tombol tambah transaksi disembunyikan/dinonaktifkan, banner pengalihan ke Gudang v2 ditampilkan.
    - `frontend/src/components/Layout.jsx`: menu lama diubah menjadi `Gudang Logistik (Legacy / v1)`, menu baru ditambahkan `Gudang Logistik v.2`.
  - **Seeding & Impor Master:**
    - Seed gudang default (`GUDANG-UMUM`), 8 golongan baku (`B1` - `B8`), dan 21 satuan baku.
    - Impor 648 barang aktif dari `rssams.dafbrg_log` ke `gdg_barang` dengan mapping `legacy_id_brg` dan normalisasi satuan.
    - Terdaftar 333 variasi kemasan beli di `gdg_barang_kemasan` (misal: BOX isi 10 PCS).
    - Impor 48 ruangan dari `rssams.kode_ruang` ke `gdg_ruang`.
    - Salin 13.897 riwayat mutasi lama (568 masuk, 13.329 keluar) ke `gdg_legacy_mutasi`.
  - **REST API:**
    - Serializers & ViewSets di `backend/gudang/serializers/master.py` & `backend/gudang/views/master.py`.
    - Endpoint aktif: `/api/gudang/barang/`, `/api/gudang/golongan/`, `/api/gudang/satuan/`, `/api/gudang/ruang/`, `/api/gudang/legacy-mutasi/`, `/api/gudang/barang/ringkasan_stok/`.
  - **Frontend UI Gudang v2:**
    - `frontend/src/pages/Gudang/GudangIndex.jsx` dengan sub-navbar 8 modul.
    - `frontend/src/pages/Gudang/GudangDashboard.jsx` (KPI ringkasan katalog & stok, alert buffer, quick menu).
    - `frontend/src/pages/Gudang/GudangBarang.jsx` (Filter chips golongan, search, badge status stok, detail modal, modal tambah/edit barang dengan multi-kemasan & fitur inline tambah satuan baru).
    - `frontend/src/pages/Gudang/GudangKartuStok.jsx` (Dual-tab: Buku Besar v2 clean ledger + Tab Riwayat Lama arsip Siaga).

- **Fase 3: Pembelian (PO/GRN) Independen Tanpa Keuangan (5 Nov 2026):**
  - **Keputusan Khusus User:** "eh broo, gausah sangkut pautkan sama keuangan. biarkan logistik ini independen aja". Seluruh kaitan dengan modul keuangan (`UtangSupplier` / Catatan Utang) dilepas total. Logistik v2 berdiri sendiri murni untuk manajemen stok gudang dan PO fulfillment.
  - **Models & Migrations:**
    - `SuratPesanan` (`gdg_po`) & `SuratPesananItem` (`gdg_po_item`).
    - `Penerimaan` (`gdg_penerimaan`) & `PenerimaanItem` (`gdg_penerimaan_item`).
    - Migrasi `0002_penerimaan_suratpesanan_suratpesananitem_and_more.py` diaplikasikan ke database.
  - **Business Logic Service (`PurchasingService`):**
    - Penomoran otomatis: `PO-YYYY-XXXXX` dan `GRN-YYYY-XXXXX`.
    - Approval workflow: bebas siapa saja minimal Kepala Seksi ke atas (`kepala_seksi`, `manajer`, `wakil_direktur`, `direktur`, `superuser`), validasi ketat pembuat $\neq$ penyetuju.
    - Eksekusi Penerimaan (GRN): otomatis menambah stok via `StockService.record_in` (Moving Average), memperbarui status pemenuhan PO hingga `SELESAI`. Tanpa membuat utang keuangan.
  - **Unit Tests:**
    - `backend/gudang/tests/test_purchasing.py` (workflow PO approval & GRN stock addition 100% LULUS).
  - **REST API:**
    - `/api/gudang/po/`, `/api/gudang/po/approved_options/`, `/api/gudang/penerimaan/`, `/api/gudang/vendor/`.
  - **Frontend UI:**
    - `frontend/src/pages/Gudang/GudangPO.jsx`: Daftar PO, Form Pemesanan multi-kemasan & auto-calculate, ajukan ke atasan, approval modal, dan fitur Cetak SPB/PO Resmi.
    - `frontend/src/pages/Gudang/GudangPenerimaan.jsx`: Daftar GRN, Form Input Penerimaan fisik barang, dan persetujuan penerimaan.

- **Fase 4: Permintaan Unit, Pengeluaran Fisik, & Jembatan app_siaga (5 Nov 2026):**
  - **Models & Migrations:**
    - `Permintaan` (`gdg_permintaan`) & `PermintaanItem` (`gdg_permintaan_item`).
    - `Pengeluaran` (`gdg_pengeluaran`) & `PengeluaranItem` (`gdg_pengeluaran_item`).
    - Migrasi `0003_pengeluaran_permintaan_and_more.py` & `0004_pengeluaranitem_legacy_out_id_and_more.py` diaplikasikan ke database.
  - **Business Logic Service (`DistributionService`):**
    - Penomoran otomatis: `REQ-YYYY-XXXXX` (Permintaan Unit) dan `OUT-YYYY-XXXXX` (Bon Pengeluaran Fisik).
    - Lifecycle permohonan: `create_permintaan`, `submit_permintaan`, `approve_permintaan`, `reject_permintaan`.
    - Eksekusi pengeluaran (`approve_pengeluaran`): memotong saldo stok secara atomic via `StockService.record_out` dengan proteksi anti-stok minus, mencatat nilai HPP berjalan, dan memperbarui status pemenuhan permintaan hingga `SELESAI`.
    - **Jembatan Dua Arah SIMRS Siaga (`sync_from_legacy_siaga`):** Menarik permohonan berstatus `'Belum Ditanggapi'` dari tabel legacy `rssams.item_out_log` ke `gdg_permintaan`, dan ketika barang diserahkan di v2, status di legacy otomatis diperbarui menjadi `'Sudah Diberikan'`.
  - **Unit Tests:**
    - `backend/gudang/tests/test_distribution.py` (2/2 test case distribusi LULUS). Total 9/9 unit test backend Gudang Logistik v2 LULUS 100%.
  - **REST API:**
    - `/api/gudang/permintaan/`, `/api/gudang/permintaan/sync_siaga/`, `/api/gudang/pengeluaran/`.
  - **Frontend UI:**
    - `frontend/src/pages/Gudang/GudangPengeluaran.jsx`:
      - Tab 1: **Permintaan Ruangan (Amprahan)** dengan tombol "Sinkron dari Siaga RS", detail stok tersedia gudang, aksi setujui & buat bon pengeluaran.
      - Tab 2: **Bon Pengeluaran / Serah Terima Fisik** dengan fitur Pengeluaran Langsung, modal detail HPP, approval potong stok, dan cetak bukti serah terima resmi berformat tanda tangan ruangan & gudang.
    - Terhubung langsung di tab `Pengeluaran Unit` di `GudangIndex.jsx`.
    - Vite production build 100% LULUS.

- **Keputusan Manajemen: Reset Data ke Fresh 0 (5 Nov 2026):**
  - Berdasarkan hasil diskusi user dan atasan, disepakati untuk memulai sistem Gudang Logistik v.2 murni fresh dari 0 tanpa membawa data master atau riwayat mutasi lama yang bermasalah.
  - Perintah `python manage.py reset_gudang_fresh` dieksekusi:
    - 🗑️ Dihapus: 648 master barang impor, 333 kemasan, 13.897 riwayat mutasi lama, transaksi dan saldo pengujian.
    - 🔄 Nomor urut dokumen di-reset ke 0 (akan mulai dari 00001 saat resmi go-live).
    - ✅ Dipertahankan: Master gudang (`GUDANG-UMUM`), 8 golongan baku (B1–B8), 21 satuan standar, dan 48 ruangan rumah sakit.
  - Data sistem lama tetap aman dan utuh di tabel legacy `rssams.*` sebagai arsip histori read-only.

- **Fase 5: Stock Opname & Saldo Awal Cut-Over (5 Nov 2026):**
  - **Models & Migrations:**
    - `StockOpname` (`gdg_opname`) & `StockOpnameItem` (`gdg_opname_item`).
    - Migrasi `0005_stockopname_stockopnameitem_and_more.py` diaplikasikan ke database.
  - **Business Logic Service (`OpnameService`):**
    - Penomoran otomatis: `OPN-YYYY-XXXXX`.
    - Mode `SALDO_AWAL`: input hasil hitung fisik riil cut-over dan harga beli unit perdana. Saat disetujui, mencatat jurnal masuk `INIT` ke `gdg_stok_ledger` dan menginisialisasi `gdg_stok_saldo`.
    - Mode `RUTIN`: membandingkan qty sistem dengan qty fisik. Saat disetujui, mengeksekusi penyesuaian masuk (`ADJ_IN` jika fisik > sistem) atau keluar (`ADJ_OUT` jika fisik < sistem) secara atomic.
  - **Unit Tests:**
    - `backend/gudang/tests/test_opname.py` (2/2 test case: saldo awal cut-over & routine adjustments LULUS). Total 11/11 unit test backend LULUS 100%.
  - **REST API:**
    - `/api/gudang/opname/`, `/api/gudang/opname/current_stock_template/`, actions `approve` & `cancel`.
  - **Frontend UI:**
    - `frontend/src/pages/Gudang/GudangOpname.jsx`:
      - Filter jenis Saldo Awal vs Opname Rutin.
      - Fitur "Muat Semua Katalog Barang" untuk auto-fill seluruh barang aktif beserta stok sistemnya.
      - Cetak Berita Acara Hitung Fisik (lembar opname bermeterai/tanda tangan).
      - Tombol persetujuan "Terapkan Saldo Stok".
    - Terhubung langsung di tab `Stok Opname` di `GudangIndex.jsx`.
    - Vite production build 100% LULUS.

- **Fase 6: Laporan Persediaan & Import Excel Master Barang (5 Nov 2026):**
  - **Batch Import Katalog Barang (`import_batch`):**
    - Endpoint: `POST /api/gudang/barang/import_batch/`
    - Menerima batch item dari file Excel / JSON: auto-mapping golongan, auto-create satuan baru jika belum terdaftar, auto-sequence kode barang jika kosong, dan pembentukan kemasan beli dalam satu transaksi atomic.
    - Frontend `GudangBarang.jsx`: Tombol "Unduh Template Excel" (`Template_Katalog_Barang_Logistik_v2.xlsx`) dan tombol upload "Import File Excel" menggunakan library `xlsx`.
  - **Laporan & Rekapitulasi Logistik (`LaporanViewSet`):**
    - Endpoints:
      - `GET /api/gudang/laporan/stok_akhir/` (Valuasi aset persediaan & filter status stok aman/menipis/habis).
      - `GET /api/gudang/laporan/pemakaian_ruangan/` (Rekap mutasi keluar ke 48 unit ruangan per rentang tanggal).
      - `GET /api/gudang/laporan/pembelian_vendor/` (Rekap faktur penerimaan masuk per rekanan per rentang tanggal).
    - Frontend `frontend/src/pages/Gudang/GudangLaporan.jsx`:
      - 3 Sub-tab Laporan dengan KPI Cards ringkasan statistik.
      - Fitur Export Spreadsheet Excel (`.xlsx`) langsung untuk masing-masing laporan.
      - Fitur Cetak Laporan Resmi.
    - Terhubung langsung di tab `Laporan Logistik` di `GudangIndex.jsx`.
    - Vite production build 100% LULUS.
