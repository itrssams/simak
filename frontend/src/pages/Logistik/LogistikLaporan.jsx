import { useState, useEffect, useMemo } from 'react';
import {
    FileSpreadsheet,
    Printer,
    Search,
    CalendarDays,
    Package,
    Building2,
    Layers,
    TrendingUp,
    RefreshCw,
    Download,
    ChevronDown,
    ChevronUp,
    FileText,
    Sparkles,
    CheckCircle2,
    Clock,
    XCircle,
    ArrowUpRight,
    ArrowDownLeft,
    Check,
    Boxes,
    BarChart3,
    PieChart as LucidePieChart,
    Hospital,
    Receipt,
    Eye,
    Warehouse
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DateRangePicker from '../../components/DateRangePicker';
import LogistikPieInfographic, { MACARON_PALETTE, getLogistikCuteMeta } from './LogistikPieInfographic';
import { SimplePagination } from '../../utils/pagination.jsx';
import '../Keuangan/InvoicePembiayaan.css';
import './Logistik.css';
import './LogistikLaporan.css';

const ORG = {
    name: 'RUMAH SAKIT SIAGA AL MUNAWWARAH',
    subtitle: 'Laporan Rekapitulasi & Analisis Distribusi Logistik',
    address: 'Jl. Cipto Mangunkusumo No. 10, Samarinda, Kalimantan Timur',
    contact: 'Telp. (0541) 123456 | Email: logistik@rsiagamunawwarah.com',
};

const fmt = (v) => Number(v || 0).toLocaleString('id-ID');
const fmtRp = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

const dateToStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (d.dari) return d.dari;
    if (typeof d.getFullYear === 'function') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return '';
};

const dateId = (s, long = false) => {
    if (!s) return '-';
    return new Date(s).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: long ? 'long' : 'short',
        year: 'numeric',
    });
};

export default function LogistikLaporan() {
    const toast = useToast();

    // Default: 1 bulan lalu s/d hari ini
    const now = new Date();
    const startRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [dari, setDari] = useState(dateToStr(startRange));
    const [sampai, setSampai] = useState(dateToStr(now));

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Tab state: 'barang_keluar' | 'permintaan_unit' | 'transaksi'
    const [activeTab, setActiveTab] = useState('barang_keluar');

    // Drilldown expand state
    const [expandedBarangId, setExpandedBarangId] = useState(null);
    const [expandedUnitNama, setExpandedUnitNama] = useState(null);

    // Filter transaksi tab
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Pagination states
    const [pageBarang, setPageBarang] = useState(1);
    const [pageSizeBarang, setPageSizeBarang] = useState(10);

    const [pageUnit, setPageUnit] = useState(1);
    const [pageSizeUnit, setPageSizeUnit] = useState(10);

    const [pageTransaksi, setPageTransaksi] = useState(1);
    const [pageSizeTransaksi, setPageSizeTransaksi] = useState(10);

    // Fetch report data
    const fetchReport = async () => {
        if (!dari || !sampai) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/logistik/laporan/', {
                params: { dari: dateToStr(dari), sampai: dateToStr(sampai) }
            });
            setData(res.data);
            // Default expand item pertama
            if (res.data?.top_barang_keluar?.length > 0 && !expandedBarangId) {
                setExpandedBarangId(res.data.top_barang_keluar[0].id_brg);
            }
            if (res.data?.permintaan_per_unit?.length > 0 && !expandedUnitNama) {
                setExpandedUnitNama(res.data.permintaan_per_unit[0].unit_nama);
            }
        } catch (err) {
            console.error('Error fetching logistik report:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Gagal memuat laporan logistik.';
            setError(msg);
            toast?.error ? toast.error(msg) : null;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
        setPageBarang(1);
        setPageUnit(1);
        setPageTransaksi(1);
    }, [dari, sampai]);

    useEffect(() => {
        setPageTransaksi(1);
    }, [searchQuery, filterUnit, filterStatus]);

    // Shortcut filter tanggal
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

    const summary = data?.summary || {};
    const topBarangList = data?.top_barang_keluar || [];
    const unitList = data?.permintaan_per_unit || [];
    const transaksiList = data?.daftar_transaksi || [];

    // Format item untuk Pie Chart Barang Keluar
    const pieDataBarang = useMemo(() => {
        return topBarangList.map((b) => ({
            id: b.id_brg,
            name: b.nama_barang,
            value: b.total_qty,
            satuan: b.satuan,
            sublabel: `${b.total_unit} unit penerima`,
        }));
    }, [topBarangList]);

    // Format item untuk Pie Chart Permintaan Unit
    const pieDataUnit = useMemo(() => {
        return unitList.map((u) => ({
            id: u.unit_nama,
            name: u.unit_nama,
            value: u.total_minta,
            satuan: 'item',
            sublabel: `${u.total_jenis_barang} jenis barang (${u.fulfillment_rate}% terpenuhi)`,
        }));
    }, [unitList]);

    // Filtered transaksi di Tab 3
    const filteredTransaksi = useMemo(() => {
        return transaksiList.filter((tr) => {
            if (filterUnit && tr.unit_nama !== filterUnit) return false;
            if (filterStatus && tr.status !== filterStatus) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchBarang = (tr.nama_barang || '').toLowerCase().includes(q);
                const matchUnit = (tr.unit_nama || '').toLowerCase().includes(q);
                const matchId = String(tr.id || '').toLowerCase().includes(q);
                if (!matchBarang && !matchUnit && !matchId) return false;
            }
            return true;
        });
    }, [transaksiList, filterUnit, filterStatus, searchQuery]);

    // Unique unit names for filter dropdown
    const uniqueUnitOptions = useMemo(() => {
        const setU = new Set();
        transaksiList.forEach((t) => t.unit_nama && setU.add(t.unit_nama));
        return Array.from(setU).sort();
    }, [transaksiList]);

    // Paginated slices per tab
    const paginatedTopBarang = useMemo(() => {
        const start = (pageBarang - 1) * pageSizeBarang;
        return topBarangList.slice(start, start + pageSizeBarang);
    }, [topBarangList, pageBarang, pageSizeBarang]);

    const paginatedUnitList = useMemo(() => {
        const start = (pageUnit - 1) * pageSizeUnit;
        return unitList.slice(start, start + pageSizeUnit);
    }, [unitList, pageUnit, pageSizeUnit]);

    const paginatedTransaksi = useMemo(() => {
        const start = (pageTransaksi - 1) * pageSizeTransaksi;
        return filteredTransaksi.slice(start, start + pageSizeTransaksi);
    }, [filteredTransaksi, pageTransaksi, pageSizeTransaksi]);

    // Export Excel
    const handleExportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();

        // Sheet 1: Ringkasan KPI
        const wsSummaryData = [
            ['RUMAH SAKIT SIAGA AL MUNAWWARAH'],
            ['LAPORAN REKAPITULASI & DISTRIBUSI LOGISTIK'],
            [`Periode: ${dateId(dari, true)} s/d ${dateId(sampai, true)}`],
            [],
            ['METRIK RINGKASAN', 'NILAI'],
            ['Total Barang Keluar (Qty Fisik)', summary.total_barang_keluar_qty],
            ['Total Nilai Barang Keluar (Rp)', summary.total_barang_keluar_nilai],
            ['Total Transaksi Pengeluaran Barang', summary.total_transaksi_keluar],
            ['Total Kuantitas Permintaan Unit', summary.total_permintaan_minta],
            ['Total Kuantitas Disetujui / Realisasi', summary.total_permintaan_setuju],
            ['Tingkat Pemenuhan Permintaan (Fulfillment %)', `${summary.fulfillment_rate}%`],
            ['Total Unit / Departemen Aktif', summary.total_unit_aktif],
            ['Barang Terbanyak Keluar', summary.top_barang_nama],
            ['Unit Pemohon Paling Aktif', summary.top_unit_nama],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

        // Sheet 2: Top Barang Keluar & Distribusi Unit
        const wsBarangData = [
            ['Peringkat', 'ID Barang', 'Nama Barang', 'Satuan', 'Golongan', 'Total Qty Keluar', 'Porsi Keluar (%)', 'Jumlah Unit Penerima', 'Distribusi Unit (Rincian)']
        ];
        topBarangList.forEach((b, idx) => {
            const distStr = (b.distribusi_unit || [])
                .map((d) => `${d.unit_nama}: ${d.qty} ${b.satuan} (${d.persentase}%)`)
                .join('; ');
            wsBarangData.push([
                idx + 1,
                b.id_brg,
                b.nama_barang,
                b.satuan,
                b.golongan,
                b.total_qty,
                `${b.persentase}%`,
                b.total_unit,
                distStr
            ]);
        });
        const wsBarang = XLSX.utils.aoa_to_sheet(wsBarangData);
        XLSX.utils.book_append_sheet(wb, wsBarang, 'Top Barang Keluar');

        // Sheet 3: Permintaan per Unit
        const wsUnitData = [
            ['Peringkat', 'Unit / Departemen', 'Total Diminta', 'Total Disetujui', 'Porsi Permintaan (%)', 'Fulfillment (%)', 'Jumlah Transaksi', 'Jenis Barang', 'Rincian Barang Diminta']
        ];
        unitList.forEach((u, idx) => {
            const itemStr = (u.daftar_barang || [])
                .slice(0, 10)
                .map((it) => `${it.nama_barang}: ${it.qty_minta} ${it.satuan} (${it.persentase}%)`)
                .join('; ');
            wsUnitData.push([
                idx + 1,
                u.unit_nama,
                u.total_minta,
                u.total_setuju,
                `${u.persentase}%`,
                `${u.fulfillment_rate}%`,
                u.total_transaksi,
                u.total_jenis_barang,
                itemStr
            ]);
        });
        const wsUnit = XLSX.utils.aoa_to_sheet(wsUnitData);
        XLSX.utils.book_append_sheet(wb, wsUnit, 'Permintaan Unit');

        // Sheet 4: Transaksi Kronologis
        const wsTrData = [
            ['ID', 'Tanggal', 'Unit / Ruangan', 'Nama Barang', 'Satuan', 'Qty Minta', 'Qty Setuju', 'Status']
        ];
        transaksiList.forEach((t) => {
            wsTrData.push([
                t.id,
                t.tanggal,
                t.unit_nama,
                t.nama_barang,
                t.satuan,
                t.qty_minta,
                t.qty_setuju,
                t.status_label || t.status
            ]);
        });
        const wsTr = XLSX.utils.aoa_to_sheet(wsTrData);
        XLSX.utils.book_append_sheet(wb, wsTr, 'Rincian Transaksi');

        XLSX.writeFile(wb, `Laporan_Logistik_${dari}_sd_${sampai}.xlsx`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="inv-page log-page ll-page">
            {/* ── HERO BANNER (IDENTIK DENGAN MENU LAIN) ──────────────────── */}
            <section className="inv-hero no-print">
                <div className="inv-title">
                    <span><Warehouse size={24} /></span>
                    <div>
                        <h1>Laporan Logistik</h1>
                        <p>Analisis dan infografis distribusi barang keluar serta permintaan unit.</p>
                    </div>
                </div>

                <div className="inv-hero-actions no-print">
                    <button
                        type="button"
                        className="inv-btn soft"
                        onClick={handlePrint}
                        title="Cetak Laporan / Simpan PDF"
                    >
                        <Printer size={16} />
                        <span>Cetak / PDF</span>
                    </button>
                    <button
                        type="button"
                        className="inv-btn excel-btn"
                        onClick={handleExportExcel}
                        disabled={!data || loading}
                        title="Export Laporan Lengkap ke Excel (.xlsx)"
                    >
                        <FileSpreadsheet size={16} />
                        <span>Export Excel</span>
                    </button>
                    <button
                        type="button"
                        className="inv-btn soft"
                        onClick={fetchReport}
                        disabled={loading}
                        title="Segarkan Data Laporan"
                    >
                        <RefreshCw size={16} className={loading ? 'll-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </section>

            {/* Print Only Header */}
            <div className="ll-print-header">
                <h2>{ORG.name}</h2>
                <h3>{ORG.subtitle}</h3>
                <p>{ORG.address}</p>
                <div className="ll-print-meta">
                    <span>Periode: <strong>{dateId(dari, true)} s/d {dateId(sampai, true)}</strong></span>
                    <span>Dicetak pada: {new Date().toLocaleString('id-ID')}</span>
                </div>
            </div>

            {/* ── FILTER PERIODE & SHORTCUTS ──────────────────────────────── */}
            <div className="ll-filter-card no-print">
                <div className="ll-filter-row">
                    <div className="ll-filter-picker-wrap">
                        <DateRangePicker
                            dari={dari}
                            sampai={sampai}
                            onChangeDari={(v) => setDari(dateToStr(v))}
                            onChangeSampai={(v) => setSampai(dateToStr(v))}
                            label="Rentang Periode Laporan"
                        />
                    </div>

                    <div className="ll-shortcuts-wrap">
                        <span className="ll-shortcut-label">Preset:</span>
                        <button type="button" className="ll-shortcut-chip" onClick={() => handleShortcut('today')}>Hari Ini</button>
                        <button type="button" className="ll-shortcut-chip" onClick={() => handleShortcut('this_month')}>Bulan Ini</button>
                        <button type="button" className="ll-shortcut-chip" onClick={() => handleShortcut('last_month')}>Bulan Lalu</button>
                        <button type="button" className="ll-shortcut-chip" onClick={() => handleShortcut('this_year')}>Tahun Ini</button>
                    </div>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="ll-alert-error no-print">
                    <XCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* ── KPI METRICS CARDS ────────────────────────────────────────── */}
            <div className="ll-kpi-grid">
                <div className="ll-kpi-card ll-kpi-blue">
                    <div className="ll-kpi-header">
                        <span className="ll-kpi-title">Total Barang Keluar</span>
                        <div className="ll-kpi-icon"><Package size={18} /></div>
                    </div>
                    <div className="ll-kpi-val">{fmt(summary.total_barang_keluar_qty)} <span className="ll-kpi-unit">item</span></div>
                    <div className="ll-kpi-sub">
                        <span>{fmt(summary.total_transaksi_keluar)}x distribusi</span>
                        {summary.total_barang_keluar_nilai > 0 && (
                            <span className="ll-kpi-money">• {fmtRp(summary.total_barang_keluar_nilai)}</span>
                        )}
                    </div>
                </div>

                <div className="ll-kpi-card ll-kpi-amber">
                    <div className="ll-kpi-header">
                        <span className="ll-kpi-title">Total Permintaan Unit</span>
                        <div className="ll-kpi-icon"><FileText size={18} /></div>
                    </div>
                    <div className="ll-kpi-val">{fmt(summary.total_permintaan_minta)} <span className="ll-kpi-unit">item</span></div>
                    <div className="ll-kpi-sub">
                        <span>{fmt(summary.total_transaksi_permintaan)} transaksi permintaan</span>
                    </div>
                </div>

                <div className="ll-kpi-card ll-kpi-emerald">
                    <div className="ll-kpi-header">
                        <span className="ll-kpi-title">Tingkat Pemenuhan</span>
                        <div className="ll-kpi-icon"><CheckCircle2 size={18} /></div>
                    </div>
                    <div className="ll-kpi-val">{summary.fulfillment_rate || 0}%</div>
                    <div className="ll-kpi-sub">
                        <span>{fmt(summary.total_permintaan_setuju)} disetujui dari {fmt(summary.total_permintaan_minta)}</span>
                    </div>
                </div>

                <div className="ll-kpi-card ll-kpi-purple">
                    <div className="ll-kpi-header">
                        <span className="ll-kpi-title">Unit Paling Aktif</span>
                        <div className="ll-kpi-icon"><Building2 size={18} /></div>
                    </div>
                    <div className="ll-kpi-val ll-kpi-val-text" title={summary.top_unit_nama}>
                        {summary.top_unit_nama || '-'}
                    </div>
                    <div className="ll-kpi-sub">
                        <span>{summary.total_unit_aktif || 0} unit aktif pada periode ini</span>
                    </div>
                </div>

                <div className="ll-kpi-card ll-kpi-rose">
                    <div className="ll-kpi-header">
                        <span className="ll-kpi-title">Barang Terbanyak Keluar</span>
                        <div className="ll-kpi-icon"><Boxes size={18} /></div>
                    </div>
                    <div className="ll-kpi-val ll-kpi-val-text" title={summary.top_barang_nama}>
                        {summary.top_barang_nama || '-'}
                    </div>
                    <div className="ll-kpi-sub">
                        <span>Top 1 kebutuhan seluruh unit</span>
                    </div>
                </div>
            </div>

            {/* ── TAB NAVIGASI UTAMA ───────────────────────────────────────── */}
            <div className="ll-tabs-nav no-print">
                <button
                    type="button"
                    className={`ll-tab-btn ${activeTab === 'barang_keluar' ? 'active' : ''}`}
                    onClick={() => setActiveTab('barang_keluar')}
                >
                    <Package size={16} />
                    <span>Barang Paling Banyak Keluar</span>
                    <span className="ll-tab-badge">{topBarangList.length}</span>
                </button>

                <button
                    type="button"
                    className={`ll-tab-btn ${activeTab === 'permintaan_unit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('permintaan_unit')}
                >
                    <Building2 size={16} />
                    <span>Permintaan Tiap Unit (General)</span>
                    <span className="ll-tab-badge">{unitList.length}</span>
                </button>

                <button
                    type="button"
                    className={`ll-tab-btn ${activeTab === 'transaksi' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transaksi')}
                >
                    <FileText size={16} />
                    <span>Rincian Transaksi Logistik</span>
                    <span className="ll-tab-badge">{transaksiList.length}</span>
                </button>
            </div>

            {/* Loading Skeleton */}
            {loading && !data && (
                <div className="ll-loading-box">
                    <RefreshCw size={24} className="ll-spin" />
                    <span>Mengolah rekapitulasi distribusi logistik...</span>
                </div>
            )}

            {/* ── TAB 1: BARANG PALING BANYAK KELUAR ───────────────────────── */}
            {activeTab === 'barang_keluar' && data && (
                <div className="ll-tab-content">
                    {/* Pie Chart Infographic Barang Keluar */}
                    <LogistikPieInfographic
                        items={pieDataBarang}
                        totalValue={summary.total_barang_keluar_qty}
                        title="Infografis Barang Paling Banyak Keluar"
                        subtitle="Porsi persentase akumulasi kuantitas barang keluar dari gudang logistik"
                        badgeText="Top Distribusi"
                        unitLabel="item"
                        isUnitMode={false}
                        selectedId={expandedBarangId}
                        onSelectItem={(it) => setExpandedBarangId(it.id === expandedBarangId ? null : it.id)}
                    />

                    {/* Table of Top Barang Keluar + Unit Breakdown */}
                    <div className="ll-card">
                        <div className="ll-card-header">
                            <div>
                                <h3 className="ll-card-title">Peringkat Barang Paling Banyak Keluar</h3>
                                <p className="ll-card-sub">
                                    Klik tombol <Eye size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> <strong>Rincian Unit</strong> untuk melihat persentase dan daftar unit yang menerima barang tersebut.
                                </p>
                            </div>
                        </div>

                        <div className="ll-table-responsive">
                            <table className="ll-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>#</th>
                                        <th>Nama Barang Logistik</th>
                                        <th style={{ width: 100 }}>Satuan</th>
                                        <th style={{ width: 140 }}>Golongan</th>
                                        <th style={{ width: 130, textAlign: 'right' }}>Total Keluar</th>
                                        <th style={{ width: 180 }}>Porsi Keluar (%)</th>
                                        <th style={{ width: 120, textAlign: 'center' }}>Unit Penerima</th>
                                        <th style={{ width: 110, textAlign: 'center' }} className="no-print">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTopBarang.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="ll-empty">Tidak ada data pengeluaran barang pada periode ini.</td>
                                        </tr>
                                    ) : (
                                        paginatedTopBarang.map((b, idx) => {
                                            const rank = ((pageBarang - 1) * pageSizeBarang) + idx + 1;
                                            const isExpanded = expandedBarangId === b.id_brg;
                                            const pal = MACARON_PALETTE[(rank - 1) % MACARON_PALETTE.length];
                                            const meta = getLogistikCuteMeta(b.nama_barang, false);

                                            return (
                                                <tr key={b.id_brg} className={isExpanded ? 'll-row-active' : ''}>
                                                    <td colSpan={8} style={{ padding: 0 }}>
                                                        <div
                                                            className="ll-row-main"
                                                            onClick={() => setExpandedBarangId(isExpanded ? null : b.id_brg)}
                                                        >
                                                            <div className="ll-col ll-col-rank">{rank}</div>
                                                            <div className="ll-col ll-col-name">
                                                                <span
                                                                    className="ll-item-icon-pill"
                                                                    style={{ background: pal.bg, color: pal.text, borderColor: pal.border }}
                                                                >
                                                                    <meta.icon size={14} strokeWidth={2.4} />
                                                                </span>
                                                                <div>
                                                                    <span className="ll-name-text">{b.nama_barang}</span>
                                                                    <span className="ll-name-id">ID: #{b.id_brg}</span>
                                                                </div>
                                                            </div>
                                                            <div className="ll-col ll-col-unit">{b.satuan || 'PCS'}</div>
                                                            <div className="ll-col ll-col-gol">{b.golongan || '-'}</div>
                                                            <div className="ll-col ll-col-qty">{fmt(b.total_qty)}</div>
                                                            <div className="ll-col ll-col-bar">
                                                                <div className="ll-progress-wrap">
                                                                    <div className="ll-progress-bar">
                                                                        <div
                                                                            className="ll-progress-fill"
                                                                            style={{ width: `${Math.min(b.persentase, 100)}%`, background: pal.color }}
                                                                        />
                                                                    </div>
                                                                    <span className="ll-progress-pct">{b.persentase}%</span>
                                                                </div>
                                                            </div>
                                                            <div className="ll-col ll-col-units-count">
                                                                <span className="ll-badge-units">{b.total_unit} unit</span>
                                                            </div>
                                                            <div className="ll-col ll-col-action no-print">
                                                                <button
                                                                    type="button"
                                                                    className={`ll-btn-expand ${isExpanded ? 'active' : ''}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedBarangId(isExpanded ? null : b.id_brg);
                                                                    }}
                                                                >
                                                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                    <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* ── EXPANDED UNIT BREAKDOWN ────────────────── */}
                                                        {isExpanded && (
                                                            <div className="ll-drilldown-box">
                                                                <div className="ll-drilldown-header">
                                                                    <Building2 size={15} />
                                                                    <h4>Distribusi Unit Penerima: <strong>{b.nama_barang}</strong></h4>
                                                                    <span className="ll-drilldown-total">
                                                                        Total: {fmt(b.total_qty)} {b.satuan}
                                                                    </span>
                                                                </div>

                                                                <div className="ll-drilldown-grid">
                                                                    {(!b.distribusi_unit || b.distribusi_unit.length === 0) ? (
                                                                        <p className="ll-drilldown-empty">Tidak ada rincian unit.</p>
                                                                    ) : (
                                                                        b.distribusi_unit.map((u, uIdx) => {
                                                                            const uPal = MACARON_PALETTE[uIdx % MACARON_PALETTE.length];
                                                                            return (
                                                                                <div key={uIdx} className="ll-unit-breakdown-card">
                                                                                    <div className="ll-ub-header">
                                                                                        <span className="ll-ub-title">{u.unit_nama}</span>
                                                                                        <span
                                                                                            className="ll-ub-pct"
                                                                                            style={{ background: uPal.bg, color: uPal.text, borderColor: uPal.border }}
                                                                                        >
                                                                                            {u.persentase}%
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="ll-ub-bar-wrap">
                                                                                        <div className="ll-ub-bar-track">
                                                                                            <div
                                                                                                className="ll-ub-bar-fill"
                                                                                                style={{ width: `${Math.min(u.persentase, 100)}%`, background: uPal.color }}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="ll-ub-footer">
                                                                                        <span><strong>{fmt(u.qty)}</strong> {b.satuan}</span>
                                                                                        <span className="ll-ub-freq">{u.frekuensi}x pengeluaran</span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {topBarangList.length > 0 && (
                            <div className="ll-pagination-wrap no-print">
                                <SimplePagination
                                    page={pageBarang}
                                    pageSize={pageSizeBarang}
                                    total={topBarangList.length}
                                    onPageChange={setPageBarang}
                                    onPageSizeChange={(newSize) => {
                                        setPageSizeBarang(newSize);
                                        setPageBarang(1);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 2: PERMINTAAN TIAP UNIT (GENERAL & DETAIL BARANG) ───── */}
            {activeTab === 'permintaan_unit' && data && (
                <div className="ll-tab-content">
                    {/* Pie Chart Infographic Permintaan per Unit */}
                    <LogistikPieInfographic
                        items={pieDataUnit}
                        totalValue={summary.total_permintaan_minta}
                        title="Infografis Permintaan Tiap Unit (General)"
                        subtitle="Porsi persentase akumulasi permintaan barang dari masing-masing unit ruangan"
                        badgeText="Porsi Unit"
                        unitLabel="item diminta"
                        isUnitMode={true}
                        selectedId={expandedUnitNama}
                        onSelectItem={(it) => setExpandedUnitNama(it.id === expandedUnitNama ? null : it.id)}
                    />

                    {/* Table of Units + Items Breakdown */}
                    <div className="ll-card">
                        <div className="ll-card-header">
                            <div>
                                <h3 className="ll-card-title">Daftar Permintaan Tiap Unit & Pemenuhan</h3>
                                <p className="ll-card-sub">
                                    Klik tombol <Eye size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> <strong>Rincian Barang</strong> untuk melihat daftar dan persentase barang yang diminta oleh unit tersebut.
                                </p>
                            </div>
                        </div>

                        <div className="ll-table-responsive">
                            <table className="ll-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>#</th>
                                        <th>Unit / Departemen Rumah Sakit</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Total Diminta</th>
                                        <th style={{ width: 120, textAlign: 'right' }}>Disetujui</th>
                                        <th style={{ width: 180 }}>Porsi Permintaan (%)</th>
                                        <th style={{ width: 120, textAlign: 'center' }}>Pemenuhan</th>
                                        <th style={{ width: 110, textAlign: 'center' }}>Transaksi</th>
                                        <th style={{ width: 110, textAlign: 'center' }} className="no-print">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedUnitList.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="ll-empty">Tidak ada data permintaan unit pada periode ini.</td>
                                        </tr>
                                    ) : (
                                        paginatedUnitList.map((u, idx) => {
                                            const rank = ((pageUnit - 1) * pageSizeUnit) + idx + 1;
                                            const isExpanded = expandedUnitNama === u.unit_nama;
                                            const pal = MACARON_PALETTE[(rank - 1) % MACARON_PALETTE.length];
                                            const meta = getLogistikCuteMeta(u.unit_nama, true);

                                            return (
                                                <tr key={u.unit_nama} className={isExpanded ? 'll-row-active' : ''}>
                                                    <td colSpan={8} style={{ padding: 0 }}>
                                                        <div
                                                            className="ll-row-main"
                                                            onClick={() => setExpandedUnitNama(isExpanded ? null : u.unit_nama)}
                                                        >
                                                            <div className="ll-col ll-col-rank">{rank}</div>
                                                            <div className="ll-col ll-col-name">
                                                                <span
                                                                    className="ll-item-icon-pill"
                                                                    style={{ background: pal.bg, color: pal.text, borderColor: pal.border }}
                                                                >
                                                                    <meta.icon size={14} strokeWidth={2.4} />
                                                                </span>
                                                                <div>
                                                                    <span className="ll-name-text">{u.unit_nama}</span>
                                                                    <span className="ll-name-id">{u.total_jenis_barang} jenis barang diminta</span>
                                                                </div>
                                                            </div>
                                                            <div className="ll-col ll-col-qty">{fmt(u.total_minta)}</div>
                                                            <div className="ll-col ll-col-qty" style={{ color: '#166534', fontWeight: 700 }}>
                                                                {fmt(u.total_setuju)}
                                                            </div>
                                                            <div className="ll-col ll-col-bar">
                                                                <div className="ll-progress-wrap">
                                                                    <div className="ll-progress-bar">
                                                                        <div
                                                                            className="ll-progress-fill"
                                                                            style={{ width: `${Math.min(u.persentase, 100)}%`, background: pal.color }}
                                                                        />
                                                                    </div>
                                                                    <span className="ll-progress-pct">{u.persentase}%</span>
                                                                </div>
                                                            </div>
                                                            <div className="ll-col ll-col-fulfill">
                                                                <span className={`ll-badge-fulfill ${u.fulfillment_rate >= 85 ? 'good' : u.fulfillment_rate >= 50 ? 'med' : 'low'}`}>
                                                                    {u.fulfillment_rate}%
                                                                </span>
                                                            </div>
                                                            <div className="ll-col ll-col-trans">{u.total_transaksi}x</div>
                                                            <div className="ll-col ll-col-action no-print">
                                                                <button
                                                                    type="button"
                                                                    className={`ll-btn-expand ${isExpanded ? 'active' : ''}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedUnitNama(isExpanded ? null : u.unit_nama);
                                                                    }}
                                                                >
                                                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                    <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* ── EXPANDED ITEM BREAKDOWN PER UNIT ─────── */}
                                                        {isExpanded && (
                                                            <div className="ll-drilldown-box">
                                                                <div className="ll-drilldown-header">
                                                                    <Package size={15} />
                                                                    <h4>Rincian Barang yang Diminta oleh: <strong>{u.unit_nama}</strong></h4>
                                                                    <span className="ll-drilldown-total">
                                                                        Total Diminta: {fmt(u.total_minta)} item • Disetujui: {fmt(u.total_setuju)} item
                                                                    </span>
                                                                </div>

                                                                <div className="ll-drilldown-grid">
                                                                    {(!u.daftar_barang || u.daftar_barang.length === 0) ? (
                                                                        <p className="ll-drilldown-empty">Tidak ada rincian barang.</p>
                                                                    ) : (
                                                                        u.daftar_barang.map((bItem, bIdx) => {
                                                                            const bPal = MACARON_PALETTE[bIdx % MACARON_PALETTE.length];
                                                                            const bMeta = getLogistikCuteMeta(bItem.nama_barang, false);

                                                                            return (
                                                                                <div key={bIdx} className="ll-unit-breakdown-card">
                                                                                    <div className="ll-ub-header">
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                            <bMeta.icon size={13} style={{ color: bPal.color }} />
                                                                                            <span className="ll-ub-title" title={bItem.nama_barang}>
                                                                                                {bItem.nama_barang}
                                                                                            </span>
                                                                                        </div>
                                                                                        <span
                                                                                            className="ll-ub-pct"
                                                                                            style={{ background: bPal.bg, color: bPal.text, borderColor: bPal.border }}
                                                                                        >
                                                                                            {bItem.persentase}%
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="ll-ub-bar-wrap">
                                                                                        <div className="ll-ub-bar-track">
                                                                                            <div
                                                                                                className="ll-ub-bar-fill"
                                                                                                style={{ width: `${Math.min(bItem.persentase, 100)}%`, background: bPal.color }}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="ll-ub-footer">
                                                                                        <span>
                                                                                            Minta: <strong>{fmt(bItem.qty_minta)}</strong> {bItem.satuan}
                                                                                        </span>
                                                                                        <span style={{ color: '#166534', fontWeight: 650 }}>
                                                                                            Setuju: {fmt(bItem.qty_setuju)}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {unitList.length > 0 && (
                            <div className="ll-pagination-wrap no-print">
                                <SimplePagination
                                    page={pageUnit}
                                    pageSize={pageSizeUnit}
                                    total={unitList.length}
                                    onPageChange={setPageUnit}
                                    onPageSizeChange={(newSize) => {
                                        setPageSizeUnit(newSize);
                                        setPageUnit(1);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB 3: RINCIAN TRANSAKSI LOGISTIK ───────────────────────── */}
            {activeTab === 'transaksi' && data && (
                <div className="ll-tab-content">
                    <div className="ll-card">
                        <div className="ll-card-header" style={{ flexWrap: 'wrap', gap: 14 }}>
                            <div>
                                <h3 className="ll-card-title">Rincian Transaksi Pengeluaran & Permintaan</h3>
                                <p className="ll-card-sub">Audit trail seluruh pergerakan barang logistik pada periode {dateId(dari)} s/d {dateId(sampai)}</p>
                            </div>

                            <div className="ll-table-filters no-print">
                                <div className="ll-search-input-wrap">
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        placeholder="Cari barang / unit..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="ll-search-input"
                                    />
                                </div>

                                <select
                                    value={filterUnit}
                                    onChange={(e) => setFilterUnit(e.target.value)}
                                    className="ll-filter-select"
                                >
                                    <option value="">Semua Unit / Ruang</option>
                                    {uniqueUnitOptions.map((u) => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>

                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="ll-filter-select"
                                >
                                    <option value="">Semua Status</option>
                                    <option value="disetujui">Disetujui</option>
                                    <option value="menunggu">Menunggu</option>
                                    <option value="ditolak">Ditolak</option>
                                </select>
                            </div>
                        </div>

                        <div className="ll-table-responsive">
                            <table className="ll-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 100 }}>Nomor</th>
                                        <th style={{ width: 110 }}>Tanggal</th>
                                        <th>Unit / Ruangan</th>
                                        <th>Nama Barang</th>
                                        <th style={{ width: 80 }}>Satuan</th>
                                        <th style={{ width: 90, textAlign: 'right' }}>Minta</th>
                                        <th style={{ width: 90, textAlign: 'right' }}>Realisasi</th>
                                        <th style={{ width: 120, textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTransaksi.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="ll-empty">Tidak ada transaksi yang cocok dengan filter.</td>
                                        </tr>
                                    ) : (
                                        paginatedTransaksi.map((tr, idx) => (
                                            <tr key={tr.id || idx}>
                                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tr.id}</td>
                                                <td>{dateId(tr.tanggal)}</td>
                                                <td style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{tr.unit_nama}</td>
                                                <td>{tr.nama_barang}</td>
                                                <td>{tr.satuan}</td>
                                                <td style={{ textAlign: 'right' }}>{fmt(tr.qty_minta)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>{fmt(tr.qty_setuju)}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`ll-status-badge ${tr.status}`}>
                                                        {tr.status_label || tr.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredTransaksi.length > 0 && (
                            <div className="ll-pagination-wrap no-print">
                                <SimplePagination
                                    page={pageTransaksi}
                                    pageSize={pageSizeTransaksi}
                                    total={filteredTransaksi.length}
                                    onPageChange={setPageTransaksi}
                                    onPageSizeChange={(newSize) => {
                                        setPageSizeTransaksi(newSize);
                                        setPageTransaksi(1);
                                    }}
                                />
                            </div>
                        )}
                        {transaksiList.length >= 500 && (
                            <div className="ll-table-limit-notice no-print">
                                Riwayat transaksi di layar dibatasi 500 transaksi terbaru. Untuk mengaudit seluruh data tanpa batas, silakan gunakan tombol <strong>Export Excel</strong>.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
