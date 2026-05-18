import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    CheckSquare,
    FileSpreadsheet,
    Filter,
    Loader,
    Printer,
    Search,
    Settings,
    Wrench,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import { getResults } from '../../utils/pagination.jsx';

const ORG = {
    name: 'RUMAH SAKIT SIAGA AL MUNAWWARAH',
    subtitle: 'Laporan Permintaan Perbaikan IT',
    address: 'Jl. Cipto Mangunkusumo No. 10, Samarinda, Kalimantan Timur',
    contact: 'Telp. (0541) 123456 | Email: rssams@rsiagamunawwarah.com',
};

const STATUS_OPTIONS = [
    ['', 'Semua Status'],
    ['open', 'Baru'],
    ['in_progress', 'Diproses'],
    ['waiting', 'Menunggu'],
    ['done', 'Selesai'],
    ['cancelled', 'Dibatalkan'],
];

const PRIORITY_OPTIONS = [
    ['', 'Semua Prioritas'],
    ['low', 'Rendah'],
    ['normal', 'Normal'],
    ['high', 'Tinggi'],
    ['urgent', 'Darurat'],
];

const CATEGORY_OPTIONS = [
    ['', 'Semua Kategori'],
    ['hardware', 'Hardware'],
    ['software', 'Software'],
    ['network', 'Jaringan'],
    ['printer', 'Printer'],
    ['account', 'Akun / Akses'],
    ['simak', 'SIMAK'],
    ['other', 'Lainnya'],
];

const SECTION_OPTIONS = [
    { key: 'summary', label: 'Ringkasan Tiket' },
    { key: 'status', label: 'Rekap Status' },
    { key: 'priority', label: 'Rekap Prioritas' },
    { key: 'category', label: 'Rekap Kategori' },
    { key: 'unit', label: 'Rekap Unit' },
    { key: 'tickets', label: 'Daftar Perbaikan' },
];

const COLUMN_OPTIONS = [
    { key: 'tanggal', label: 'Tanggal' },
    { key: 'pelapor', label: 'Pelapor' },
    { key: 'unit', label: 'Unit' },
    { key: 'judul', label: 'Gangguan' },
    { key: 'kategori', label: 'Kategori' },
    { key: 'prioritas', label: 'Prioritas' },
    { key: 'status', label: 'Status' },
    { key: 'keluhan', label: 'Keluhan' },
    { key: 'selesai', label: 'Selesai' },
    { key: 'solusi', label: 'Solusi' },
    { key: 'sparepart', label: 'Sparepart' },
    { key: 'biaya', label: 'Biaya' },
];

const DEFAULT_SECTIONS = SECTION_OPTIONS.reduce((acc, item) => ({ ...acc, [item.key]: true }), {});
const DEFAULT_COLUMNS = COLUMN_OPTIONS.reduce((acc, item) => ({ ...acc, [item.key]: true }), {});

const CSS = `
@keyframes litFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.lit-page { animation: litFade .28s ease both; }
.lit-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.lit-title { font-size: 24px; font-weight: 750; color: #102b1f; margin: 0; letter-spacing: 0; }
.lit-muted { color: #64748b; font-size: 13px; margin: 4px 0 0; }
.lit-panel { background: #fff; border: 1px solid #e8eef5; border-radius: 8px; box-shadow: 0 1px 5px rgba(15,23,42,.05); }
.lit-toolbar { padding: 16px; margin-bottom: 16px; }
.lit-grid { display: grid; grid-template-columns: repeat(7, minmax(120px, 1fr)); gap: 12px; align-items: end; }
.lit-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.lit-label { font-size: 11px; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.lit-input, .lit-select { height: 38px; border: 1px solid #dbe4ee; border-radius: 7px; padding: 0 10px; color: #0f172a; font-size: 13px; background: #fff; outline: none; font-family: inherit; min-width: 0; }
.lit-input:focus, .lit-select:focus { border-color: #1f7a52; box-shadow: 0 0 0 3px rgba(31,122,82,.08); }
.lit-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.lit-btn { height: 38px; border: 1px solid transparent; border-radius: 7px; padding: 0 13px; display: inline-flex; gap: 7px; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s, transform .1s; white-space: nowrap; }
.lit-btn:hover { transform: translateY(-1px); }
.lit-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.lit-btn.primary { background: #16452f; color: #fff; }
.lit-btn.ghost { background: #fff; color: #334155; border-color: #dbe4ee; }
.lit-btn.gold { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.lit-shortcuts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.lit-shortcut { border: 1px solid #dbe4ee; background: #f8fafc; color: #475569; height: 30px; border-radius: 7px; padding: 0 10px; font-size: 12px; font-weight: 650; cursor: pointer; }
.lit-kpis { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
.lit-kpi { padding: 15px; border-radius: 8px; background: #fff; border: 1px solid #e8eef5; }
.lit-kpi-label { font-size: 11px; color: #64748b; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; }
.lit-kpi-value { font-size: 19px; font-weight: 800; color: #123526; margin-top: 6px; }
.lit-report { background: #fff; border: 1px solid #dbe4ee; border-radius: 8px; overflow: hidden; }
.lit-paper { padding: 26px 28px; background: #fff; color: #111827; }
.lit-kop { display: grid; grid-template-columns: 76px 1fr 76px; align-items: center; border-bottom: 3px solid #16452f; padding-bottom: 13px; margin-bottom: 18px; }
.lit-logo { width: 68px; height: 68px; object-fit: contain; }
.lit-kop-center { text-align: center; }
.lit-org { font-size: 17px; font-weight: 800; color: #16452f; letter-spacing: .03em; }
.lit-org-sub { font-size: 12px; color: #334155; margin-top: 3px; }
.lit-doc-title { text-align: center; margin: 14px 0 18px; }
.lit-doc-title h2 { margin: 0; font-size: 16px; letter-spacing: .05em; color: #111827; text-transform: uppercase; }
.lit-doc-title p { margin: 5px 0 0; color: #475569; font-size: 12px; }
.lit-section { margin-top: 18px; page-break-inside: avoid; }
.lit-section-head { font-size: 13px; font-weight: 800; color: #16452f; border-bottom: 2px solid #16452f; padding-bottom: 6px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.lit-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.lit-summary-box { border: 1px solid #dbe4ee; background: #f8fafc; border-radius: 7px; padding: 11px; }
.lit-summary-box span { display: block; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.lit-summary-box strong { display: block; margin-top: 5px; color: #0f172a; font-size: 15px; }
.lit-table-wrap { overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; }
.lit-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.lit-table th { background: #16452f; color: #fff; padding: 8px 9px; text-align: left; font-size: 11px; font-weight: 750; white-space: nowrap; border-right: 1px solid rgba(255,255,255,.28); border-bottom: 1px solid #123b29; }
.lit-table td { padding: 8px 9px; border-right: 1px solid #dbe4ee; border-bottom: 1px solid #dbe4ee; color: #1e293b; vertical-align: top; }
.lit-table th:last-child, .lit-table td:last-child { border-right: 0; }
.lit-table tr:nth-child(even) td { background: #fbfdff; }
.lit-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.lit-badge { display: inline-flex; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 750; white-space: nowrap; background: #eef2ff; color: #3730a3; }
.lit-empty { padding: 54px 20px; text-align: center; color: #94a3b8; background: #fff; border: 1px dashed #cbd5e1; border-radius: 8px; }
.lit-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.52); display: flex; align-items: center; justify-content: center; z-index: 80; padding: 20px; }
.lit-modal { width: min(720px, 96vw); max-height: 90vh; overflow: auto; background: #fff; border-radius: 10px; box-shadow: 0 20px 60px rgba(15,23,42,.24); }
.lit-modal-head { padding: 18px 20px; border-bottom: 1px solid #e8eef5; display: flex; align-items: center; justify-content: space-between; }
.lit-modal-body { padding: 18px 20px; }
.lit-check-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.lit-check { min-height: 38px; border: 1px solid #dbe4ee; border-radius: 7px; display: flex; align-items: center; gap: 9px; padding: 8px 10px; cursor: pointer; font-size: 13px; color: #334155; }
.lit-check input { width: 16px; height: 16px; accent-color: #16452f; }
@media (max-width: 1100px) { .lit-grid { grid-template-columns: repeat(3, minmax(130px, 1fr)); } .lit-kpis, .lit-summary-grid { grid-template-columns: repeat(2, minmax(150px, 1fr)); } }
@media (max-width: 680px) { .lit-grid, .lit-kpis, .lit-summary-grid, .lit-check-grid { grid-template-columns: 1fr; } .lit-paper { padding: 18px 14px; } .lit-kop { grid-template-columns: 56px 1fr; } .lit-kop > div:last-child { display: none; } .lit-logo { width: 52px; height: 52px; } }
@media print {
    html, body { width: auto; min-height: auto; margin: 0 !important; padding: 0 !important; background: #fff !important; }
    body * { visibility: hidden !important; }
    #lit-print-area, #lit-print-area * { visibility: visible !important; }
    #lit-print-area { position: static !important; width: 100% !important; max-width: none !important; border: 0 !important; overflow: visible !important; }
    .lit-no-print { display: none !important; }
    .lit-paper { width: 100%; padding: 0 !important; box-sizing: border-box; }
    .lit-report { border: 0 !important; overflow: visible !important; }
    .lit-section { page-break-inside: auto; break-inside: auto; }
    .lit-section-head { page-break-after: avoid; break-after: avoid; }
    .lit-summary-grid, .lit-summary-box, .lit-kop, .lit-doc-title { page-break-inside: avoid; break-inside: avoid; }
    .lit-table { page-break-inside: auto; break-inside: auto; }
    .lit-table thead { display: table-header-group; }
    .lit-table tr { page-break-inside: avoid; break-inside: avoid; }
    .lit-table th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .lit-table-wrap { overflow: visible !important; }
    @page { size: A4 landscape; margin: 12mm; }
}
`;

const dateToInput = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getInitialPeriod = () => {
    const now = new Date();
    return {
        dari: dateToInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        sampai: dateToInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
};

const getShortcut = (type) => {
    const now = new Date();
    if (type === 'last-month') {
        return {
            dari: dateToInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
            sampai: dateToInput(new Date(now.getFullYear(), now.getMonth(), 0)),
        };
    }
    if (type === 'year') return { dari: `${now.getFullYear()}-01-01`, sampai: `${now.getFullYear()}-12-31` };
    return getInitialPeriod();
};

const dateTimeId = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const rupiah = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
const labelOf = (options, value) => options.find(([key]) => key === value)?.[1] || value || '-';
const rowUnit = (row) => row.unit || row.requester_user_unit || 'Tidak diketahui';
const rowRequester = (row) => row.requester_name || row.requester_user_name || '-';

const countBy = (rows, getter) => {
    const map = new Map();
    rows.forEach((row) => {
        const key = getter(row) || 'Tidak diketahui';
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
};

export default function LaporanIT() {
    const initial = getInitialPeriod();
    const [dari, setDari] = useState(initial.dari);
    const [sampai, setSampai] = useState(initial.sampai);
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [category, setCategory] = useState('');
    const [search, setSearch] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useToastState('error');
    const [settingOpen, setSettingOpen] = useState(false);
    const [sections, setSections] = useState(DEFAULT_SECTIONS);
    const [columns, setColumns] = useState(DEFAULT_COLUMNS);

    const printDate = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const loadReport = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/keuangan/it/repair-requests/', {
                params: {
                    dari,
                    sampai,
                    status: status || undefined,
                    priority: priority || undefined,
                    category: category || undefined,
                    search: search || undefined,
                },
            });
            setData(getResults(res.data));
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat laporan IT.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const summary = useMemo(() => {
        const open = data.filter((row) => ['open', 'in_progress', 'waiting'].includes(row.status)).length;
        const done = data.filter((row) => row.status === 'done').length;
        const urgent = data.filter((row) => row.priority === 'urgent' && !['done', 'cancelled'].includes(row.status)).length;
        const cost = data.reduce((sum, row) => sum + Number(row.cost || 0), 0);
        return { total: data.length, open, done, urgent, cost };
    }, [data]);

    const recaps = useMemo(() => ({
        status: countBy(data, (row) => row.status_label || labelOf(STATUS_OPTIONS, row.status)),
        priority: countBy(data, (row) => row.priority_label || labelOf(PRIORITY_OPTIONS, row.priority)),
        category: countBy(data, (row) => row.category_label || labelOf(CATEGORY_OPTIONS, row.category)),
        unit: countBy(data, rowUnit),
    }), [data]);

    const selectedColumns = COLUMN_OPTIONS.filter((col) => columns[col.key]);

    const getCell = (row, key) => {
        const map = {
            tanggal: dateTimeId(row.requested_at),
            pelapor: rowRequester(row),
            unit: rowUnit(row),
            judul: row.title || '-',
            kategori: row.category_label || labelOf(CATEGORY_OPTIONS, row.category),
            prioritas: row.priority_label || labelOf(PRIORITY_OPTIONS, row.priority),
            status: row.status_label || labelOf(STATUS_OPTIONS, row.status),
            keluhan: row.description || '-',
            selesai: dateTimeId(row.completed_at),
            solusi: row.resolution || '-',
            sparepart: row.sparepart || '-',
            biaya: rupiah(row.cost),
        };
        return map[key] || '-';
    };

    const exportExcel = () => {
        const wb = XLSX.utils.book_new();
        const header = [
            [ORG.name],
            [ORG.subtitle],
            [`Periode: ${dari} s/d ${sampai}`],
            [`Dicetak: ${printDate}`],
            [],
        ];
        const rows = data.map((row, index) => ({
            No: index + 1,
            ...Object.fromEntries(selectedColumns.map((col) => [col.label, getCell(row, col.key)])),
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { origin: header.length });
        XLSX.utils.sheet_add_aoa(ws, header, { origin: 0 });
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan IT');
        XLSX.writeFile(wb, `Laporan_IT_${dari}_${sampai}.xlsx`);
    };

    const printReport = () => window.print();

    const renderRecap = (title, rows) => (
        <section className="lit-section">
            <div className="lit-section-head"><CheckSquare size={16} /> {title}</div>
            <div className="lit-table-wrap">
                <table className="lit-table">
                    <thead><tr><th>Uraian</th><th className="lit-num">Jumlah</th></tr></thead>
                    <tbody>
                        {rows.length === 0 ? <tr><td colSpan="2">Belum ada data</td></tr> : rows.map((row) => (
                            <tr key={row.label}><td>{row.label}</td><td className="lit-num">{row.total}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );

    const renderTicketsTable = () => (
        <section className="lit-section">
            <div className="lit-section-head"><Wrench size={16} /> Daftar Perbaikan</div>
            <div className="lit-table-wrap">
                <table className="lit-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            {selectedColumns.map((col) => <th key={col.key}>{col.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr><td colSpan={selectedColumns.length + 1}>Belum ada data</td></tr>
                        ) : data.map((row, index) => (
                            <tr key={row.id}>
                                <td>{index + 1}</td>
                                {selectedColumns.map((col) => (
                                    <td key={col.key} className={col.key === 'biaya' ? 'lit-num' : ''}>
                                        {['status', 'prioritas'].includes(col.key) ? <span className="lit-badge">{getCell(row, col.key)}</span> : getCell(row, col.key)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );

    const renderReportBody = () => (
        <div className="lit-paper">
            <div className="lit-kop">
                <img src="/logo.png" alt="Logo" className="lit-logo" />
                <div className="lit-kop-center">
                    <div className="lit-org">{ORG.name}</div>
                    <div className="lit-org-sub">{ORG.address}</div>
                    <div className="lit-org-sub">{ORG.contact}</div>
                </div>
                <div />
            </div>
            <div className="lit-doc-title">
                <h2>Laporan Permintaan Perbaikan IT</h2>
                <p>Periode {dari} sampai {sampai} | Dicetak {printDate}</p>
            </div>

            {sections.summary && (
                <section className="lit-section">
                    <div className="lit-section-head"><CheckSquare size={16} /> Ringkasan Tiket</div>
                    <div className="lit-summary-grid">
                        <SummaryBox label="Total Tiket" value={summary.total} />
                        <SummaryBox label="Tiket Terbuka" value={summary.open} />
                        <SummaryBox label="Selesai" value={summary.done} />
                        <SummaryBox label="Biaya/Sparepart" value={rupiah(summary.cost)} />
                    </div>
                </section>
            )}
            {sections.status && renderRecap('Rekap Status', recaps.status)}
            {sections.priority && renderRecap('Rekap Prioritas', recaps.priority)}
            {sections.category && renderRecap('Rekap Kategori', recaps.category)}
            {sections.unit && renderRecap('Rekap Unit', recaps.unit)}
            {sections.tickets && renderTicketsTable()}
        </div>
    );

    const applyShortcut = (type) => {
        const next = getShortcut(type);
        setDari(next.dari);
        setSampai(next.sampai);
    };

    return (
        <div className="lit-page">
            <style>{CSS}</style>
            <div className="lit-header lit-no-print">
                <div>
                    <h1 className="lit-title">Laporan IT</h1>
                    <p className="lit-muted">Filter data perbaikan IT, atur output, lalu export formal dengan kop.</p>
                </div>
                <div className="lit-actions">
                    <button className="lit-btn ghost" onClick={() => setSettingOpen(true)}><Settings size={16} /> Setting Output</button>
                    <button className="lit-btn gold" onClick={printReport} disabled={!data.length}><Printer size={16} /> PDF / Print</button>
                    <button className="lit-btn primary" onClick={exportExcel} disabled={!data.length}><FileSpreadsheet size={16} /> Excel</button>
                </div>
            </div>

            <div className="lit-panel lit-toolbar lit-no-print">
                <div className="lit-grid">
                    <Field label="Dari"><input className="lit-input" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></Field>
                    <Field label="Sampai"><input className="lit-input" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></Field>
                    <Field label="Status"><select className="lit-select" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    <Field label="Prioritas"><select className="lit-select" value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    <Field label="Kategori"><select className="lit-select" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    <Field label="Pencarian"><input className="lit-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keluhan, pelapor, unit..." /></Field>
                    <button className="lit-btn primary" onClick={loadReport} disabled={loading}>{loading ? <Loader size={16} /> : <Search size={16} />} Tampilkan</button>
                </div>
                <div className="lit-shortcuts">
                    <button className="lit-shortcut" onClick={() => applyShortcut('this-month')}>Bulan Ini</button>
                    <button className="lit-shortcut" onClick={() => applyShortcut('last-month')}>Bulan Lalu</button>
                    <button className="lit-shortcut" onClick={() => applyShortcut('year')}>Tahun Ini</button>
                </div>
            </div>

            {error && <div className="lit-empty lit-no-print" style={{ padding: 16, marginBottom: 16, color: '#b91c1c' }}>{error}</div>}

            <div className="lit-kpis lit-no-print">
                <Kpi label="Total Tiket" value={summary.total} />
                <Kpi label="Tiket Terbuka" value={summary.open} />
                <Kpi label="Prioritas Darurat" value={summary.urgent} />
                <Kpi label="Biaya/Sparepart" value={rupiah(summary.cost)} />
            </div>

            {loading ? (
                <div className="lit-empty lit-no-print"><Loader size={28} /> Memuat laporan...</div>
            ) : (
                <div id="lit-print-area" className="lit-report">
                    {renderReportBody()}
                </div>
            )}

            {settingOpen && (
                <SettingModal
                    sections={sections}
                    setSections={setSections}
                    columns={columns}
                    setColumns={setColumns}
                    onClose={() => setSettingOpen(false)}
                />
            )}
        </div>
    );
}

function Field({ label, children }) {
    return <label className="lit-field"><span className="lit-label">{label}</span>{children}</label>;
}

function Kpi({ label, value }) {
    return <div className="lit-kpi"><div className="lit-kpi-label">{label}</div><div className="lit-kpi-value">{value}</div></div>;
}

function SummaryBox({ label, value }) {
    return <div className="lit-summary-box"><span>{label}</span><strong>{value}</strong></div>;
}

function SettingModal({ sections, setSections, columns, setColumns, onClose }) {
    const toggle = (setter, key) => setter((prev) => ({ ...prev, [key]: !prev[key] }));
    return createPortal(
        <div className="lit-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="lit-modal">
                <div className="lit-modal-head">
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#102b1f' }}>Setting Output Laporan</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Centang bagian dan kolom yang mau dimunculkan di PDF/print/Excel.</div>
                    </div>
                </div>
                <div className="lit-modal-body">
                    <div className="lit-section-head"><Settings size={16} /> Bagian Laporan</div>
                    <div className="lit-check-grid">
                        {SECTION_OPTIONS.map((item) => (
                            <label key={item.key} className="lit-check">
                                <input type="checkbox" checked={sections[item.key]} onChange={() => toggle(setSections, item.key)} />
                                <span>{item.label}</span>
                            </label>
                        ))}
                    </div>
                    <div className="lit-section-head" style={{ marginTop: 18 }}><Filter size={16} /> Kolom Daftar Perbaikan</div>
                    <div className="lit-check-grid">
                        {COLUMN_OPTIONS.map((item) => (
                            <label key={item.key} className="lit-check">
                                <input type="checkbox" checked={columns[item.key]} onChange={() => toggle(setColumns, item.key)} />
                                <span>{item.label}</span>
                            </label>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button className="lit-btn primary" onClick={onClose}>Selesai</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
