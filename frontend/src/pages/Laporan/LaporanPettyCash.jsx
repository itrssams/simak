import { useState, useEffect, useMemo } from 'react';
import {
    WalletCards,
    FileSpreadsheet,
    Printer,
    Search,
    Filter,
    CalendarDays,
    ArrowDownLeft,
    ArrowUpRight,
    Building2,
    Layers,
    BookOpen,
    ListFilter,
    CheckCircle2,
    RotateCcw,
    TrendingUp,
    RefreshCw,
    Download,
    ChevronDown,
    ChevronUp,
    FileText,
    PieChart,
    BarChart3,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import DateRangePicker from '../../components/DateRangePicker';
import './LaporanPettyCash.css';

const ORG = {
    name: 'RUMAH SAKIT SIAGA AL MUNAWWARAH',
    subtitle: 'Laporan Rekonsiliasi & Akuntansi Kas Kecil (Petty Cash)',
    address: 'Jl. Cipto Mangunkusumo No. 10, Samarinda, Kalimantan Timur',
    contact: 'Telp. (0541) 123456 | Email: rssams@rsiagamunawwarah.com',
};

const STATUS_META = {
    pending: { label: 'Pending', color: '#c2410c', bg: '#fff7ed', dot: '#f97316' },
    disetujui: { label: 'Disetujui', color: '#166534', bg: '#dcfce7', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', color: '#991b1b', bg: '#fee2e2', dot: '#ef4444' },
    dicairkan: { label: 'Dicairkan', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
    menunggu_approval_laporan: { label: 'Menunggu Approval Laporan', color: '#4338ca', bg: '#eef2ff', dot: '#6366f1' },
    dilaporkan: { label: 'Dilaporkan', color: '#6d28d9', bg: '#f5f3ff', dot: '#8b5cf6' },
    menunggu_pengembalian: { label: 'Menunggu Kembali', color: '#a16207', bg: '#fefce8', dot: '#eab308' },
    selesai: { label: 'Selesai', color: '#166534', bg: '#f0fdf4', dot: '#22c55e' },
    dibatalkan: { label: 'Dibatalkan', color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
};

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6', '#f97316'];

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtNum = (v) => Number(v || 0).toLocaleString('id-ID');
const dateId = (s, long = false) => {
    if (!s) return '-';
    return new Date(s).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: long ? 'long' : 'short',
        year: 'numeric',
    });
};
const dateToStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (d.dari) return d.dari;
    if (typeof d.getFullYear === 'function') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return '';
};

export default function LaporanPettyCash() {
    // Initial dates: default 1 bulan lalu s/d hari ini agar langsung menampilkan data aktif
    const now = new Date();
    const startRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [dari, setDari] = useState(dateToStr(startRange));
    const [sampai, setSampai] = useState(dateToStr(now));

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useToastState('error');

    // Tab state: 'akun' | 'unit' | 'buku_kas' | 'transaksi'
    const [activeTab, setActiveTab] = useState('akun');

    // Filter transaksi tab
    const [searchQuery, setSearchQuery] = useState('');
    const [filterJenis, setFilterJenis] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [expandedRow, setExpandedRow] = useState(null);

    // Fetch report data
    const fetchReport = async () => {
        if (!dari || !sampai) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/keuangan/laporan-petty-cash/', {
                params: { dari: dateToStr(dari), sampai: dateToStr(sampai) }
            });
            setData(res.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Gagal memuat laporan petty cash.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [dari, sampai]);

    // Quick shortcuts
    const handleShortcut = (type) => {
        const dNow = new Date();
        if (type === 'today') {
            setDari(dateToStr(dNow));
            setSampai(dateToStr(dNow));
        } else if (type === 'this_month') {
            setDari(dateToStr(new Date(dNow.getFullYear(), dNow.getMonth(), 1)));
            setSampai(dateToStr(dNow));
        } else if (type === 'last_month') {
            setDari(dateToStr(new Date(dNow.getFullYear(), dNow.getMonth() - 1, 1)));
            setSampai(dateToStr(new Date(dNow.getFullYear(), dNow.getMonth(), 0)));
        } else if (type === 'this_year') {
            setDari(`${dNow.getFullYear()}-01-01`);
            setSampai(dateToStr(dNow));
        }
    };

    // Filtered transactions
    const daftarPengajuan = data?.daftar_pengajuan || [];
    const filteredPengajuan = useMemo(() => {
        return daftarPengajuan.filter((item) => {
            if (filterJenis && item.jenis !== filterJenis) return false;
            if (filterStatus && item.status !== filterStatus) return false;
            if (filterUnit && item.unit !== filterUnit) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchNo = (item.no || '').toLowerCase().includes(q);
                const matchPemohon = (item.pemohon || '').toLowerCase().includes(q);
                const matchKeperluan = (item.keperluan || '').toLowerCase().includes(q);
                const matchUnit = (item.unit || '').toLowerCase().includes(q);
                if (!matchNo && !matchPemohon && !matchKeperluan && !matchUnit) return false;
            }
            return true;
        });
    }, [daftarPengajuan, filterJenis, filterStatus, filterUnit, searchQuery]);

    // Unique unit list for filters
    const unitList = useMemo(() => {
        const setU = new Set(daftarPengajuan.map((p) => p.unit).filter(Boolean));
        return Array.from(setU).sort();
    }, [daftarPengajuan]);

    // Print Handler
    const handlePrint = () => {
        window.print();
    };

    // Excel Export
    const handleExportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();

        const periodStr = `${dateId(dari, true)} s/d ${dateId(sampai, true)}`;
        const printTime = new Date().toLocaleString('id-ID');

        const metaHeader = [
            [ORG.name],
            [ORG.subtitle],
            [`Periode: ${periodStr}`],
            [`Dicetak pada: ${printTime}`],
            [''],
        ];

        // 1. Sheet Ringkasan Rekonsiliasi
        const ringkasanRows = [
            ...metaHeader,
            ['RINGKASAN REKONSILIASI KAS KECIL'],
            ['Uraian', 'Nominal (Rp)', 'Keterangan'],
            ['Saldo Awal Periode', data.saldo_awal, `Per tanggal ${dateId(dari)}`],
            ['Total Penambahan (Top-Up)', data.total_penambahan, 'Akumulasi top-up masuk ke kasir'],
            ['Total Pengurangan (Belanja Riil)', data.total_pengurangan, 'Akumulasi biaya operasional keluar'],
            ['Saldo Akhir Periode', data.saldo_akhir, `Per tanggal ${dateId(sampai)}`],
            ['Total Realisasi Belanja & Klaim', data.total_belanja_riil, 'Beban operasional sah terdata'],
            [''],
            ['PEJABAT PENGESAHAN'],
            ['Kasir Kas Kecil', data.pejabat?.kasir || 'Ulfa Santika'],
            ['Verifikator Keuangan', data.pejabat?.keuangan || 'Evi Setyaningrum, S.Ak'],
            ['Pimpinan / Direksi', data.pejabat?.pimpinan || 'Nevi Nevada'],
        ];
        const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows);
        wsRingkasan['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 38 }];
        XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Rekonsiliasi Kas');

        // 2. Sheet Rekap Pos Akun
        const akunRows = [
            ...metaHeader,
            ['REKAPITULASI PENGELUARAN BERDASARKAN POS AKUN BIAYA'],
            ['No', 'Kode Akun', 'Nama Akun Biaya', 'Pos / Kategori', 'Jml Transaksi', 'Total Nilai (Rp)', 'Persentase (%)'],
            ...(data.rekap_akun || []).map((ak, idx) => [
                idx + 1,
                ak.kode_akun,
                ak.nama_akun,
                ak.pos_biaya,
                ak.jumlah_transaksi,
                ak.total,
                `${ak.persentase}%`,
            ]),
            ['', '', 'TOTAL BEBAN OPERASIONAL', '', '', data.total_belanja_riil, '100%'],
        ];
        const wsAkun = XLSX.utils.aoa_to_sheet(akunRows);
        wsAkun['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 36 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsAkun, 'Rekap Akun Biaya');

        // 3. Sheet Rekap Per Unit
        const unitRows = [
            ...metaHeader,
            ['REKAPITULASI PENGELUARAN BERDASARKAN UNIT / BAGIAN'],
            ['No', 'Unit / Departemen', 'Kas Kecil (PC)', 'Reimbursement', 'Total Beban (Rp)', 'Kontribusi (%)'],
            ...(data.per_unit || []).map((u, idx) => [
                idx + 1,
                u.unit,
                u.pc,
                u.reimburse,
                u.total,
                `${u.persentase}%`,
            ]),
        ];
        const wsUnit = XLSX.utils.aoa_to_sheet(unitRows);
        wsUnit['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsUnit, 'Rekap Unit');

        // 4. Sheet Buku Kas Mutasi
        const mutasiRows = [
            ...metaHeader,
            ['BUKU KAS UMUM MUTASI KAS KECIL (KASIR)'],
            ['No', 'Waktu & Tanggal', 'Jenis Mutasi', 'Pemohon / Pihak Terkait', 'Unit', 'Kas Masuk (Rp)', 'Kas Keluar (Rp)', 'Saldo Sesudah (Rp)', 'Keterangan'],
            ...(data.rekap_mutasi || []).map((m, idx) => [
                idx + 1,
                m.waktu,
                m.jenis === 'penambahan' ? 'Masuk (Top-up)' : 'Keluar (Belanja)',
                m.nama_pengaju || '-',
                m.unit_pengaju || '-',
                m.masuk || 0,
                m.keluar || 0,
                m.saldo_sesudah,
                m.keterangan,
            ]),
        ];
        const wsMutasi = XLSX.utils.aoa_to_sheet(mutasiRows);
        wsMutasi['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsMutasi, 'Buku Kas Mutasi');

        // 5. Sheet Daftar Transaksi Detail
        const txRows = [
            ...metaHeader,
            ['DAFTAR RINCIAN TRANSAKSI PETTY CASH & REIMBURSEMENT'],
            ['No', 'No. Pengajuan', 'Tanggal', 'Jenis', 'Pemohon', 'Unit', 'Keperluan', 'Nominal Ajuan (Rp)', 'Realisasi Riil (Rp)', 'Status'],
            ...filteredPengajuan.map((p, idx) => [
                idx + 1,
                p.no,
                p.tanggal,
                p.jenis,
                p.pemohon,
                p.unit,
                p.keperluan,
                p.nominal,
                p.nominal_realisasi ?? p.nominal_efektif ?? p.nominal,
                p.status,
            ]),
        ];
        const wsTx = XLSX.utils.aoa_to_sheet(txRows);
        wsTx['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 24 }, { wch: 18 }, { wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsTx, 'Daftar Transaksi');

        XLSX.writeFile(wb, `Laporan_Petty_Cash_RS_Siaga_${dateToStr(dari)}_${dateToStr(sampai)}.xlsx`);
    };

    const rekapAkun = data?.rekap_akun || [];
    const rekapUnit = data?.per_unit || [];
    const rekapMutasi = data?.rekap_mutasi || [];
    const pejabat = data?.pejabat || {
        kasir: 'Ulfa Santika',
        kasir_jabatan: 'Kasir Kas Kecil',
        keuangan: 'Evi Setyaningrum, S.Ak',
        keuangan_jabatan: 'Staf Keuangan & Akuntansi',
        pimpinan: 'Nevi Nevada',
        pimpinan_jabatan: 'Wakil Direktur',
    };

    return (
        <div className="lpc-dashboard">
            {/* ── HEADER & TOOLBAR ──────────────────────── */}
            <div className="lpc-header">
                <div className="lpc-header-title">
                    <div className="lpc-header-icon">
                        <WalletCards size={24} />
                    </div>
                    <div>
                        <h1>Laporan Kas Kecil & Rekonsiliasi Kasir</h1>
                        <p>Analisis pertanggungjawaban kas operasional, rekap akun beban akuntansi, dan buku kas.</p>
                    </div>
                </div>

                <div className="lpc-header-actions no-print">
                    <button
                        type="button"
                        className="lpc-btn lpc-btn-outline"
                        onClick={handlePrint}
                        disabled={!data || loading}
                        title="Cetak format cetak resmi berlembar tanda tangan"
                    >
                        <Printer size={16} />
                        <span>Cetak Laporan PDF</span>
                    </button>
                    <button
                        type="button"
                        className="lpc-btn lpc-btn-primary"
                        onClick={handleExportExcel}
                        disabled={!data || loading}
                        title="Ekspor seluruh lembar laporan ke file Excel"
                    >
                        <FileSpreadsheet size={16} />
                        <span>Export Excel (.xlsx)</span>
                    </button>
                </div>
            </div>

            {/* ── FILTER & PERIODE TOOLBAR ──────────────── */}
            <div className="lpc-filter-card no-print">
                <div className="lpc-filter-main">
                    <div className="lpc-date-wrap">
                        <label>Periode Laporan:</label>
                        <DateRangePicker
                            dari={dari}
                            sampai={sampai}
                            onChange={({ dari: newDari, sampai: newSampai }) => {
                                setDari(newDari || '');
                                setSampai(newSampai || '');
                            }}
                            placeholder="Pilih Periode Tanggal"
                        />
                    </div>

                    <div className="lpc-shortcuts">
                        <span className="lpc-shortcut-label">Pilihan Cepat:</span>
                        <button type="button" onClick={() => handleShortcut('today')} className="lpc-shortcut-btn">Hari Ini</button>
                        <button type="button" onClick={() => handleShortcut('this_month')} className="lpc-shortcut-btn">Bulan Ini</button>
                        <button type="button" onClick={() => handleShortcut('last_month')} className="lpc-shortcut-btn">Bulan Lalu</button>
                        <button type="button" onClick={() => handleShortcut('this_year')} className="lpc-shortcut-btn">Tahun Berjalan</button>
                        <button type="button" onClick={fetchReport} className="lpc-shortcut-refresh" title="Muat Ulang Data">
                            <RefreshCw size={14} className={loading ? 'lpc-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="lpc-filter-badge">
                    <CalendarDays size={14} />
                    <span>Periode Aktif: <strong>{dateId(dari, true)} s/d {dateId(sampai, true)}</strong></span>
                </div>
            </div>

            {error && <div className="lpc-alert-err no-print">{error}</div>}

            {/* ── EXECUTIVE KPI METRIC CARDS ───────────── */}
            {data && (
                <div className="lpc-kpi-grid">
                    <div className="lpc-kpi-card lpc-kpi-awal">
                        <div className="lpc-kpi-head">
                            <span>Saldo Awal Periode</span>
                            <div className="lpc-kpi-icon"><WalletCards size={18} /></div>
                        </div>
                        <div className="lpc-kpi-val">{fmt(data.saldo_awal)}</div>
                        <div className="lpc-kpi-sub">Posisi saldo kasir per {dateId(dari)}</div>
                    </div>

                    <div className="lpc-kpi-card lpc-kpi-masuk">
                        <div className="lpc-kpi-head">
                            <span>Total Top-Up Masuk</span>
                            <div className="lpc-kpi-icon"><ArrowDownLeft size={18} /></div>
                        </div>
                        <div className="lpc-kpi-val">{fmt(data.total_penambahan)}</div>
                        <div className="lpc-kpi-sub">Pengisian kembali saldo kasir</div>
                    </div>

                    <div className="lpc-kpi-card lpc-kpi-keluar">
                        <div className="lpc-kpi-head">
                            <span>Total Realisasi Pengeluaran</span>
                            <div className="lpc-kpi-icon"><ArrowUpRight size={18} /></div>
                        </div>
                        <div className="lpc-kpi-val">{fmt(data.total_pengurangan)}</div>
                        <div className="lpc-kpi-sub">Biaya operasional & klaim keluar</div>
                    </div>

                    <div className="lpc-kpi-card lpc-kpi-akhir">
                        <div className="lpc-kpi-head">
                            <span>Saldo Akhir Kasir</span>
                            <div className="lpc-kpi-icon"><CheckCircle2 size={18} /></div>
                        </div>
                        <div className="lpc-kpi-val">{fmt(data.saldo_akhir)}</div>
                        <div className="lpc-kpi-sub">Posisi saldo kasir per {dateId(sampai)}</div>
                    </div>
                </div>
            )}

            {/* ── TABS NAVIGATION ──────────────────────── */}
            <div className="lpc-tabs-nav no-print">
                <button
                    type="button"
                    className={`lpc-tab-btn ${activeTab === 'akun' ? 'active' : ''}`}
                    onClick={() => setActiveTab('akun')}
                >
                    <Layers size={16} />
                    <span>Rekap Pos Akun Biaya</span>
                    <span className="lpc-tab-count">{rekapAkun.length}</span>
                </button>
                <button
                    type="button"
                    className={`lpc-tab-btn ${activeTab === 'unit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('unit')}
                >
                    <Building2 size={16} />
                    <span>Rekap Per Unit</span>
                    <span className="lpc-tab-count">{rekapUnit.length}</span>
                </button>
                <button
                    type="button"
                    className={`lpc-tab-btn ${activeTab === 'buku_kas' ? 'active' : ''}`}
                    onClick={() => setActiveTab('buku_kas')}
                >
                    <BookOpen size={16} />
                    <span>Buku Kas & Rekonsiliasi</span>
                    <span className="lpc-tab-count">{rekapMutasi.length}</span>
                </button>
                <button
                    type="button"
                    className={`lpc-tab-btn ${activeTab === 'transaksi' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transaksi')}
                >
                    <ListFilter size={16} />
                    <span>Rincian Transaksi Lengkap</span>
                    <span className="lpc-tab-count">{daftarPengajuan.length}</span>
                </button>
            </div>

            {loading && (
                <div className="lpc-loading-box">
                    <RefreshCw size={24} className="lpc-spin" />
                    <p>Memuat rekapitulasi data kas kecil...</p>
                </div>
            )}

            {/* ── TAB CONTENT ─────────────────────────── */}
            {!loading && data && (
                <div className="lpc-tab-content no-print">
                    {/* TAB 1: REKAP POS AKUN BIAYA */}
                    {activeTab === 'akun' && (
                        <div className="lpc-tab-pane">
                            <div className="lpc-pane-header">
                                <div>
                                    <h2>Pengelompokan Beban Berdasarkan Pos Akun Biaya</h2>
                                    <p>Ringkasan realisasi belanja berdasarkan bagan akun standar (*Chart of Accounts*) untuk integrasi pembukuan akuntansi.</p>
                                </div>
                                <div className="lpc-pane-total">
                                    <span>Total Beban Operasional:</span>
                                    <strong>{fmt(data.total_belanja_riil)}</strong>
                                </div>
                            </div>

                            {/* Chart preview */}
                            {rekapAkun.length > 0 && (
                                <div className="lpc-chart-card">
                                    <div className="lpc-chart-title">
                                        <BarChart3 size={16} />
                                        <span>Distribusi Pengeluaran Akun Biaya Terbesar</span>
                                    </div>
                                    <div style={{ height: 260, width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={rekapAkun.slice(0, 7)} margin={{ top: 10, right: 20, left: 20, bottom: 25 }}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                <XAxis dataKey="kode_akun" tick={{ fontSize: 12 }} />
                                                <YAxis tickFormatter={(v) => `Rp ${v / 1000}k`} tick={{ fontSize: 11 }} />
                                                <Tooltip
                                                    formatter={(val, name, item) => [`${fmt(val)} (${item?.payload?.persentase ?? 0}%)`, item?.payload?.nama_akun || '']}
                                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                                                />
                                                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                                                    {rekapAkun.slice(0, 7).map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            <div className="lpc-table-card">
                                <table className="lpc-data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 45 }}>No</th>
                                            <th style={{ width: 120 }}>Kode Akun</th>
                                            <th>Nama Akun Biaya</th>
                                            <th>Pos / Kategori</th>
                                            <th style={{ width: 110, textAlign: 'center' }}>Frekuensi</th>
                                            <th style={{ width: 160, textAlign: 'right' }}>Total Beban</th>
                                            <th style={{ width: 180 }}>Kontribusi Beban</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rekapAkun.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="lpc-empty">Tidak ada data belanja akun pada periode ini.</td>
                                            </tr>
                                        ) : (
                                            rekapAkun.map((ak, idx) => (
                                                <tr key={idx}>
                                                    <td className="lpc-col-center">{idx + 1}</td>
                                                    <td>
                                                        <span className="lpc-code-badge">{ak.kode_akun}</span>
                                                    </td>
                                                    <td style={{ fontWeight: 600 }}>{ak.nama_akun}</td>
                                                    <td style={{ color: '#64748b' }}>{ak.pos_biaya}</td>
                                                    <td className="lpc-col-center">{ak.jumlah_transaksi}x</td>
                                                    <td className="lpc-col-num">{fmt(ak.total)}</td>
                                                    <td>
                                                        <div className="lpc-bar-wrap">
                                                            <div className="lpc-bar-track">
                                                                <div
                                                                    className="lpc-bar-fill"
                                                                    style={{
                                                                        width: `${ak.persentase}%`,
                                                                        background: CHART_COLORS[idx % CHART_COLORS.length]
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="lpc-bar-val">{ak.persentase}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {rekapAkun.length > 0 && (
                                        <tfoot>
                                            <tr>
                                                <td colSpan={5} style={{ fontWeight: 700 }}>TOTAL AKUMULASI PENGELUARAN</td>
                                                <td className="lpc-col-num" style={{ fontWeight: 800, fontSize: 14 }}>
                                                    {fmt(data.total_belanja_riil)}
                                                </td>
                                                <td style={{ fontWeight: 700 }}>100%</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: REKAP PER UNIT */}
                    {activeTab === 'unit' && (
                        <div className="lpc-tab-pane">
                            <div className="lpc-pane-header">
                                <div>
                                    <h2>Distribusi Pengeluaran Kas Kecil Per Unit / Departemen</h2>
                                    <p>Monitoring serapan anggaran kas operasional harian antar unit pelayanan dan manajemen rumah sakit.</p>
                                </div>
                            </div>

                            <div className="lpc-table-card">
                                <table className="lpc-data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 45 }}>No</th>
                                            <th>Unit / Departemen Pelayanan</th>
                                            <th style={{ width: 170, textAlign: 'right' }}>Petty Cash (Advance)</th>
                                            <th style={{ width: 170, textAlign: 'right' }}>Reimbursement</th>
                                            <th style={{ width: 180, textAlign: 'right' }}>Total Pengeluaran</th>
                                            <th style={{ width: 180 }}>Porsi Beban</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rekapUnit.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="lpc-empty">Tidak ada data unit pada periode ini.</td>
                                            </tr>
                                        ) : (
                                            rekapUnit.map((u, idx) => (
                                                <tr key={idx}>
                                                    <td className="lpc-col-center">{idx + 1}</td>
                                                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        {u.unit}
                                                    </td>
                                                    <td className="lpc-col-num">{fmt(u.pc)}</td>
                                                    <td className="lpc-col-num">{fmt(u.reimburse)}</td>
                                                    <td className="lpc-col-num" style={{ fontWeight: 700 }}>{fmt(u.total)}</td>
                                                    <td>
                                                        <div className="lpc-bar-wrap">
                                                            <div className="lpc-bar-track">
                                                                <div
                                                                    className="lpc-bar-fill"
                                                                    style={{
                                                                        width: `${u.persentase}%`,
                                                                        background: CHART_COLORS[idx % CHART_COLORS.length]
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="lpc-bar-val">{u.persentase}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {rekapUnit.length > 0 && (
                                        <tfoot>
                                            <tr>
                                                <td colSpan={4} style={{ fontWeight: 700 }}>TOTAL SELURUH UNIT</td>
                                                <td className="lpc-col-num" style={{ fontWeight: 800, fontSize: 14 }}>
                                                    {fmt(rekapUnit.reduce((s, u) => s + u.total, 0))}
                                                </td>
                                                <td style={{ fontWeight: 700 }}>100%</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: BUKU KAS & REKONSILIASI KASIR */}
                    {activeTab === 'buku_kas' && (
                        <div className="lpc-tab-pane">
                            <div className="lpc-pane-header">
                                <div>
                                    <h2>Buku Kas Umum Mutasi Kas Kecil (Audit Trail Kasir)</h2>
                                    <p>Catatan kronologis seluruh aliran kas masuk (top-up) dan kas keluar (belanja) beserta posisi saldo berjalan.</p>
                                </div>
                            </div>

                            <div className="lpc-table-card">
                                <table className="lpc-data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 45 }}>No</th>
                                            <th style={{ width: 135 }}>Waktu & Tanggal</th>
                                            <th style={{ width: 110 }}>Jenis</th>
                                            <th>Uraian / Keterangan Mutasi</th>
                                            <th style={{ width: 160 }}>Pihak / Pemohon</th>
                                            <th style={{ width: 140, textAlign: 'right' }}>Masuk (Debet)</th>
                                            <th style={{ width: 140, textAlign: 'right' }}>Keluar (Kredit)</th>
                                            <th style={{ width: 150, textAlign: 'right' }}>Saldo Sesudah</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rekapMutasi.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="lpc-empty">Tidak ada mutasi saldo tercatat pada periode ini.</td>
                                            </tr>
                                        ) : (
                                            rekapMutasi.map((m, idx) => (
                                                <tr key={idx}>
                                                    <td className="lpc-col-center">{idx + 1}</td>
                                                    <td style={{ fontSize: 12, color: '#64748b' }}>{m.waktu}</td>
                                                    <td>
                                                        <span className={`lpc-pill ${m.jenis === 'penambahan' ? 'lpc-pill-masuk' : 'lpc-pill-keluar'}`}>
                                                            {m.jenis === 'penambahan' ? 'Masuk' : 'Keluar'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 500 }}>{m.keterangan}</td>
                                                    <td>
                                                        <div style={{ fontSize: 12, fontWeight: 600 }}>{m.nama_pengaju || '-'}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.unit_pengaju}</div>
                                                    </td>
                                                    <td className="lpc-col-num" style={{ color: m.masuk > 0 ? '#10b981' : '#94a3b8' }}>
                                                        {m.masuk > 0 ? `+${fmt(m.masuk)}` : '-'}
                                                    </td>
                                                    <td className="lpc-col-num" style={{ color: m.keluar > 0 ? '#ef4444' : '#94a3b8' }}>
                                                        {m.keluar > 0 ? `-${fmt(m.keluar)}` : '-'}
                                                    </td>
                                                    <td className="lpc-col-num" style={{ fontWeight: 700 }}>
                                                        {fmt(m.saldo_sesudah)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {rekapMutasi.length > 0 && (
                                        <tfoot>
                                            <tr>
                                                <td colSpan={5} style={{ fontWeight: 700 }}>TOTAL MUTASI KASIR PERIODE INI</td>
                                                <td className="lpc-col-num" style={{ color: '#10b981', fontWeight: 800 }}>
                                                    +{fmt(data.total_penambahan)}
                                                </td>
                                                <td className="lpc-col-num" style={{ color: '#ef4444', fontWeight: 800 }}>
                                                    -{fmt(data.total_pengurangan)}
                                                </td>
                                                <td className="lpc-col-num" style={{ fontWeight: 800, fontSize: 13 }}>
                                                    {fmt(data.saldo_akhir)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: RINCIAN TRANSAKSI LENGKAP */}
                    {activeTab === 'transaksi' && (
                        <div className="lpc-tab-pane">
                            <div className="lpc-pane-header">
                                <div>
                                    <h2>Rincian Transaksi Pengajuan Petty Cash & Reimbursement</h2>
                                    <p>Daftar seluruh tiket pengajuan kas operasional yang tercatat dalam periode pelaporan.</p>
                                </div>
                            </div>

                            {/* Filters Bar */}
                            <div className="lpc-table-filters">
                                <div className="lpc-search-box">
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        placeholder="Cari no pengajuan, keperluan, pemohon, unit..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="lpc-filter-selects">
                                    <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)}>
                                        <option value="">Semua Jenis</option>
                                        <option value="Petty Cash">Petty Cash</option>
                                        <option value="Reimbursement">Reimbursement</option>
                                    </select>

                                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                        <option value="">Semua Status</option>
                                        {Object.entries(STATUS_META).map(([st, meta]) => (
                                            <option key={st} value={st}>{meta.label}</option>
                                        ))}
                                    </select>

                                    <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
                                        <option value="">Semua Unit</option>
                                        {unitList.map((u) => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>

                                    {(searchQuery || filterJenis || filterStatus || filterUnit) && (
                                        <button
                                            type="button"
                                            className="lpc-btn-clear"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setFilterJenis('');
                                                setFilterStatus('');
                                                setFilterUnit('');
                                            }}
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="lpc-table-card">
                                <table className="lpc-data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 45 }}>No</th>
                                            <th style={{ width: 140 }}>No. Pengajuan</th>
                                            <th style={{ width: 110 }}>Tanggal</th>
                                            <th style={{ width: 100 }}>Jenis</th>
                                            <th style={{ width: 160 }}>Pemohon</th>
                                            <th>Keperluan & Rincian</th>
                                            <th style={{ width: 140, textAlign: 'right' }}>Nominal Ajuan</th>
                                            <th style={{ width: 140, textAlign: 'right' }}>Realisasi Sah</th>
                                            <th style={{ width: 130, textAlign: 'center' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPengajuan.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="lpc-empty">Tidak ada transaksi yang cocok dengan filter.</td>
                                            </tr>
                                        ) : (
                                            filteredPengajuan.map((p, idx) => {
                                                const stMeta = STATUS_META[p.status] || { label: p.status, bg: '#f1f5f9', color: '#64748b' };
                                                const hasItems = p.items && p.items.length > 0;
                                                const isExpanded = expandedRow === p.no;
                                                return (
                                                    <>
                                                        <tr key={p.no} className={isExpanded ? 'lpc-row-expanded' : ''}>
                                                            <td className="lpc-col-center">{idx + 1}</td>
                                                            <td>
                                                                <span className="lpc-no-badge">{p.no}</span>
                                                            </td>
                                                            <td style={{ fontSize: 12 }}>{dateId(p.tanggal)}</td>
                                                            <td>
                                                                <span className={`lpc-jenis-tag ${p.jenis === 'Petty Cash' ? 'tag-pc' : 'tag-rb'}`}>
                                                                    {p.jenis}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.pemohon}</div>
                                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.unit}</div>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontWeight: 500 }}>{p.keperluan}</div>
                                                                {hasItems && (
                                                                    <button
                                                                        type="button"
                                                                        className="lpc-toggle-items-btn"
                                                                        onClick={() => setExpandedRow(isExpanded ? null : p.no)}
                                                                    >
                                                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                                        <span>{p.items.length} pos akun biaya</span>
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td className="lpc-col-num">{fmt(p.nominal)}</td>
                                                            <td className="lpc-col-num" style={{ fontWeight: 700, color: p.nominal_realisasi ? 'var(--text-primary)' : '#94a3b8' }}>
                                                                {p.nominal_realisasi ? fmt(p.nominal_realisasi) : (p.status === 'dicairkan' ? fmt(p.nominal) : '-')}
                                                            </td>
                                                            <td className="lpc-col-center">
                                                                <span
                                                                    className="lpc-status-tag"
                                                                    style={{ background: stMeta.bg, color: stMeta.color }}
                                                                >
                                                                    {stMeta.label}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                        {/* Expandable items row */}
                                                        {isExpanded && hasItems && (
                                                            <tr className="lpc-items-subrow">
                                                                <td colSpan={9}>
                                                                    <div className="lpc-subtable-box">
                                                                        <div className="lpc-subtable-head">Rincian Akun Belanja ({p.no})</div>
                                                                        <table className="lpc-subtable">
                                                                            <thead>
                                                                                <tr>
                                                                                    <th>Kode Akun</th>
                                                                                    <th>Nama Akun</th>
                                                                                    <th>Deskripsi Belanja</th>
                                                                                    <th style={{ textAlign: 'right' }}>Nilai Riil</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {p.items.map((it, iIdx) => (
                                                                                    <tr key={iIdx}>
                                                                                        <td><code>{it.kode_akun}</code></td>
                                                                                        <td>{it.nama_akun}</td>
                                                                                        <td>{it.deskripsi}</td>
                                                                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(it.nilai)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── FORMAT CETAK RESMI (HANYA MUNCUL SAAT PRINT) ── */}
            {data && (
                <div className="lpc-print-sheet print-only">
                    {/* Kop Surat Rumah Sakit */}
                    <div className="lpc-print-kop">
                        <img src="/logo.png" alt="Logo RS" className="lpc-print-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <div className="lpc-print-kop-text">
                            <h2 className="lpc-print-org">{ORG.name}</h2>
                            <p className="lpc-print-addr">{ORG.address}</p>
                            <p className="lpc-print-contact">{ORG.contact}</p>
                        </div>
                    </div>
                    <div className="lpc-print-divider" />

                    {/* Judul Berita Acara */}
                    <div className="lpc-print-titlebox">
                        <h3>BERITA ACARA & LAPORAN REKONSILIASI KAS KECIL</h3>
                        <p>Periode Pelaporan: <strong>{dateId(dari, true)} s/d {dateId(sampai, true)}</strong></p>
                    </div>

                    {/* Bagian I: Ringkasan Rekonsiliasi Kasir */}
                    <div className="lpc-print-section">
                        <h4>I. REKONSILIASI SALDO KASIR KAS KECIL</h4>
                        <table className="lpc-print-table lpc-print-table-summary">
                            <tbody>
                                <tr>
                                    <td style={{ width: '40%' }}>Saldo Awal Kas Kecil (per {dateId(dari)})</td>
                                    <td style={{ width: '25%', textAlign: 'right', fontWeight: 700 }}>{fmt(data.saldo_awal)}</td>
                                    <td style={{ width: '35%', color: '#64748b' }}>Saldo buku kas awal periode</td>
                                </tr>
                                <tr>
                                    <td>Total Penambahan Saldo (Top-Up Masuk)</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>+{fmt(data.total_penambahan)}</td>
                                    <td style={{ color: '#64748b' }}>Dana pengisian kembali disetujui direksi</td>
                                </tr>
                                <tr>
                                    <td>Total Realisasi Pengeluaran Kasir</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>-{fmt(data.total_pengurangan)}</td>
                                    <td style={{ color: '#64748b' }}>Belanja operasional sah & reimbursement</td>
                                </tr>
                                <tr className="lpc-print-totalrow">
                                    <td>Saldo Akhir Kasir (per {dateId(sampai)})</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(data.saldo_akhir)}</td>
                                    <td>Sisa fisik kas kecil di kasir</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Bagian II: Rekapitulasi Pos Akun Biaya */}
                    <div className="lpc-print-section">
                        <h4>II. REKAPITULASI PENGELUARAN BERDASARKAN POS AKUN BIAYA</h4>
                        <table className="lpc-print-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 35 }}>No</th>
                                    <th style={{ width: 90 }}>Kode Akun</th>
                                    <th>Nama Akun Biaya</th>
                                    <th>Kategori / Pos</th>
                                    <th style={{ width: 50, textAlign: 'center' }}>Jml</th>
                                    <th style={{ width: 120, textAlign: 'right' }}>Total Beban</th>
                                    <th style={{ width: 60, textAlign: 'right' }}>Porsi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rekapAkun.map((ak, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                        <td><code>{ak.kode_akun}</code></td>
                                        <td style={{ fontWeight: 600 }}>{ak.nama_akun}</td>
                                        <td>{ak.pos_biaya}</td>
                                        <td style={{ textAlign: 'center' }}>{ak.jumlah_transaksi}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ak.total)}</td>
                                        <td style={{ textAlign: 'right' }}>{ak.persentase}%</td>
                                    </tr>
                                ))}
                                <tr className="lpc-print-totalrow">
                                    <td colSpan={5}>TOTAL BEBAN OPERASIONAL</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(data.total_belanja_riil)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>100%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Bagian III: Rekapitulasi Per Unit */}
                    <div className="lpc-print-section">
                        <h4>III. REKAPITULASI BEBAN PER UNIT / DEPARTEMEN</h4>
                        <table className="lpc-print-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 35 }}>No</th>
                                    <th>Unit Pelayanan / Bagian</th>
                                    <th style={{ width: 120, textAlign: 'right' }}>Petty Cash</th>
                                    <th style={{ width: 120, textAlign: 'right' }}>Reimbursement</th>
                                    <th style={{ width: 130, textAlign: 'right' }}>Total Pengeluaran</th>
                                    <th style={{ width: 60, textAlign: 'right' }}>Porsi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rekapUnit.map((u, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={{ fontWeight: 600 }}>{u.unit}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(u.pc)}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(u.reimburse)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(u.total)}</td>
                                        <td style={{ textAlign: 'right' }}>{u.persentase}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Bagian IV: Lembar Tanda Tangan Resmi (3 Kolom) */}
                    <div className="lpc-print-signatures">
                        <div className="lpc-sig-col">
                            <p className="lpc-sig-title">Disiapkan Oleh,</p>
                            <p className="lpc-sig-role">{pejabat.kasir_jabatan}</p>
                            <div className="lpc-sig-space" />
                            <p className="lpc-sig-name"><u>{pejabat.kasir}</u></p>
                            <p className="lpc-sig-nip">Kasir Operasional RS</p>
                        </div>

                        <div className="lpc-sig-col">
                            <p className="lpc-sig-title">Diperiksa Oleh,</p>
                            <p className="lpc-sig-role">{pejabat.keuangan_jabatan}</p>
                            <div className="lpc-sig-space" />
                            <p className="lpc-sig-name"><u>{pejabat.keuangan}</u></p>
                            <p className="lpc-sig-nip">Bagian Keuangan & Akuntansi</p>
                        </div>

                        <div className="lpc-sig-col">
                            <p className="lpc-sig-title">Disetujui Oleh,</p>
                            <p className="lpc-sig-role">{pejabat.pimpinan_jabatan}</p>
                            <div className="lpc-sig-space" />
                            <p className="lpc-sig-name"><u>{pejabat.pimpinan}</u></p>
                            <p className="lpc-sig-nip">Pimpinan / Direksi</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
