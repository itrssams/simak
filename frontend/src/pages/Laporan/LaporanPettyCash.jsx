import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastState } from '../../context/ToastContext';
import {
    BarChart3,
    Building2,
    CheckSquare,
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    Loader,
    Printer,
    Search,
    Settings,
    WalletCards,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import api from '../../api/axiosConfig';
import './LaporanPettyCash.css';

const ORG = {
    name: 'RUMAH SAKIT SIAGA AL MUNAWWARAH',
    subtitle: 'Laporan Petty Cash dan Reimbursement',
    address: 'Jl. Cipto Mangunkusumo No. 10, Samarinda, Kalimantan Timur',
    contact: 'Telp. (0541) 123456 | Email: rssams@rsiagamunawwarah.com',
};

const STATUS_META = {
    pending: { label: 'Pending', color: '#a16207', bg: '#fef3c7' },
    disetujui: { label: 'Disetujui', color: '#1d4ed8', bg: '#eff6ff' },
    ditolak: { label: 'Ditolak', color: '#b91c1c', bg: '#fee2e2' },
    dicairkan: { label: 'Dicairkan', color: '#6d28d9', bg: '#f5f3ff' },
    dilaporkan: { label: 'Dilaporkan', color: '#047857', bg: '#ecfdf5' },
    menunggu_pengembalian: { label: 'Menunggu Kembali', color: '#c2410c', bg: '#fff7ed' },
    selesai: { label: 'Selesai', color: '#166534', bg: '#dcfce7' },
};

const SECTION_OPTIONS = [
    { key: 'summary', label: 'Ringkasan Saldo' },
    { key: 'stats', label: 'Statistik Pengajuan' },
    { key: 'requests', label: 'Daftar Pengajuan' },
    { key: 'units', label: 'Rekap Per Unit' },
    { key: 'mutations', label: 'Mutasi Saldo' },
    { key: 'chart', label: 'Grafik Tren' },
];

const COLUMN_OPTIONS = [
    { key: 'no', label: 'No. Pengajuan' },
    { key: 'tanggal', label: 'Tanggal' },
    { key: 'jenis', label: 'Jenis' },
    { key: 'pemohon', label: 'Pemohon' },
    { key: 'unit', label: 'Unit' },
    { key: 'keperluan', label: 'Keperluan' },
    { key: 'nominal', label: 'Nominal Ajuan' },
    { key: 'realisasi', label: 'Realisasi' },
    { key: 'efektif', label: 'Nominal Efektif' },
    { key: 'status', label: 'Status' },
];

const DEFAULT_SECTIONS = SECTION_OPTIONS.reduce((acc, item) => ({ ...acc, [item.key]: true }), {});
const DEFAULT_COLUMNS = COLUMN_OPTIONS.reduce((acc, item) => ({ ...acc, [item.key]: true }), {});



const fmt = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
const fmtNum = (value) => Number(value || 0).toLocaleString('id-ID');
const dateId = (value, long = false) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: long ? 'long' : 'short',
        year: 'numeric',
    });
};
const dateTimeId = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return value;
};
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
    if (type === 'quarter') {
        const q = Math.floor(now.getMonth() / 3) * 3;
        return {
            dari: dateToInput(new Date(now.getFullYear(), q, 1)),
            sampai: dateToInput(new Date(now.getFullYear(), q + 3, 0)),
        };
    }
    if (type === 'year') {
        return {
            dari: `${now.getFullYear()}-01-01`,
            sampai: `${now.getFullYear()}-12-31`,
        };
    }
    return getInitialPeriod();
};

function pickLabel(key) {
    return COLUMN_OPTIONS.find((item) => item.key === key)?.label || key;
}

function statusLabel(status) {
    return STATUS_META[status]?.label || status || '-';
}

function unitLabel(unit) {
    if (!unit || unit === '\u2014' || unit === '-') return 'Tidak diketahui';
    return unit;
}

function Modal({ children, onClose }) {
    return createPortal(
        <div className="lpc-modal-backdrop" onMouseDown={onClose}>
            <div className="lpc-modal" onMouseDown={(event) => event.stopPropagation()}>
                {children}
            </div>
        </div>,
        document.body,
    );
}

export default function LaporanPettyCash() {
    const initial = getInitialPeriod();
    const [dari, setDari] = useState(initial.dari);
    const [sampai, setSampai] = useState(initial.sampai);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useToastState('error');
    const [showSettings, setShowSettings] = useState(false);
    const [activeView, setActiveView] = useState('preview');
    const [filters, setFilters] = useState({
        jenis: '',
        status: '',
        unit: '',
        pemohon: '',
        search: '',
        minNominal: '',
        maxNominal: '',
    });
    const [sections, setSections] = useState(DEFAULT_SECTIONS);
    const [columns, setColumns] = useState(DEFAULT_COLUMNS);

    const enabledColumns = useMemo(
        () => COLUMN_OPTIONS.filter((item) => columns[item.key]).map((item) => item.key),
        [columns],
    );

    const requests = useMemo(() => data?.daftar_pengajuan || [], [data]);
    const units = useMemo(() => [...new Set(requests.map((item) => unitLabel(item.unit)).filter(Boolean))].sort(), [requests]);
    const applicants = useMemo(() => [...new Set(requests.map((item) => item.pemohon).filter(Boolean))].sort(), [requests]);

    const filteredRequests = useMemo(() => {
        const min = filters.minNominal === '' ? null : Number(filters.minNominal);
        const max = filters.maxNominal === '' ? null : Number(filters.maxNominal);
        const query = filters.search.trim().toLowerCase();

        return requests.filter((item) => {
            const effective = Number(item.nominal_realisasi ?? item.nominal_efektif ?? item.nominal ?? 0);
            const normalizedUnit = unitLabel(item.unit);
            const haystack = `${item.no} ${item.tanggal} ${item.jenis} ${item.pemohon} ${normalizedUnit} ${item.keperluan} ${item.status}`.toLowerCase();
            if (filters.jenis && item.jenis !== filters.jenis) return false;
            if (filters.status && item.status !== filters.status) return false;
            if (filters.unit && normalizedUnit !== filters.unit) return false;
            if (filters.pemohon && item.pemohon !== filters.pemohon) return false;
            if (min !== null && effective < min) return false;
            if (max !== null && effective > max) return false;
            if (query && !haystack.includes(query)) return false;
            return true;
        });
    }, [filters, requests]);

    const filteredUnits = useMemo(() => {
        const grouped = new Map();
        filteredRequests.forEach((item) => {
            const unit = unitLabel(item.unit);
            const current = grouped.get(unit) || { unit, pc: 0, reimburse: 0, total: 0 };
            const effective = Number(item.nominal_realisasi ?? item.nominal_efektif ?? item.nominal ?? 0);
            const isCounted = ['dicairkan', 'dilaporkan', 'menunggu_pengembalian', 'selesai'].includes(item.status);
            if (isCounted) {
                if (item.jenis === 'Petty Cash') current.pc += effective;
                if (item.jenis === 'Reimbursement') current.reimburse += effective;
                current.total += effective;
            }
            grouped.set(unit, current);
        });
        return [...grouped.values()].filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
    }, [filteredRequests]);

    const stats = useMemo(() => {
        const effectiveTotal = filteredRequests.reduce((sum, item) => sum + Number(item.nominal_realisasi ?? item.nominal_efektif ?? item.nominal ?? 0), 0);
        const requestedTotal = filteredRequests.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
        return {
            total: filteredRequests.length,
            pc: filteredRequests.filter((item) => item.jenis === 'Petty Cash').length,
            rb: filteredRequests.filter((item) => item.jenis === 'Reimbursement').length,
            pending: filteredRequests.filter((item) => item.status === 'pending').length,
            rejected: filteredRequests.filter((item) => item.status === 'ditolak').length,
            completed: filteredRequests.filter((item) => ['dicairkan', 'dilaporkan', 'menunggu_pengembalian', 'selesai'].includes(item.status)).length,
            effectiveTotal,
            requestedTotal,
        };
    }, [filteredRequests]);

    const periodLabel = dari && sampai ? `${dateId(dari, true)} s/d ${dateId(sampai, true)}` : '-';
    const printDate = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const fetchReport = async () => {
        setError('');
        if (!dari || !sampai) {
            setError('Periode tanggal wajib diisi.');
            return;
        }
        setLoading(true);
        try {
            const response = await api.get('/keuangan/laporan-petty-cash/', { params: { dari, sampai } });
            setData(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat laporan.');
        } finally {
            setLoading(false);
        }
    };

    const resetFilters = () => {
        setFilters({ jenis: '', status: '', unit: '', pemohon: '', search: '', minNominal: '', maxNominal: '' });
    };

    const toggleMap = (setter, key) => {
        setter((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const setShortcut = (type) => {
        const next = getShortcut(type);
        setDari(next.dari);
        setSampai(next.sampai);
    };

    const requestRow = (item, key) => {
        if (key === 'tanggal') return dateId(item.tanggal);
        if (key === 'status') return statusLabel(item.status);
        if (key === 'unit') return unitLabel(item.unit);
        if (key === 'nominal') return Number(item.nominal || 0);
        if (key === 'realisasi') return item.nominal_realisasi === null || item.nominal_realisasi === undefined ? '' : Number(item.nominal_realisasi);
        if (key === 'efektif') return Number(item.nominal_realisasi ?? item.nominal_efektif ?? item.nominal ?? 0);
        return item[key] ?? '';
    };

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();

        const metaRows = [
            [ORG.name],
            [ORG.subtitle],
            [`Periode: ${periodLabel}`],
            [`Dicetak: ${printDate}`],
            [''],
        ];

        if (sections.summary || sections.stats) {
            const rows = [...metaRows];
            if (sections.summary) {
                rows.push(
                    ['Ringkasan Saldo', 'Jumlah'],
                    ['Saldo Awal', data.saldo_awal],
                    ['Total Penambahan', data.total_penambahan],
                    ['Total Pengurangan', data.total_pengurangan],
                    ['Saldo Akhir', data.saldo_akhir],
                    [''],
                );
            }
            if (sections.stats) {
                rows.push(
                    ['Statistik Pengajuan', 'Jumlah'],
                    ['Total Pengajuan', stats.total],
                    ['Petty Cash', stats.pc],
                    ['Reimbursement', stats.rb],
                    ['Pending', stats.pending],
                    ['Ditolak', stats.rejected],
                    ['Tercairkan/Berjalan', stats.completed],
                    ['Total Nominal Ajuan', stats.requestedTotal],
                    ['Total Nominal Efektif', stats.effectiveTotal],
                );
            }
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 30 }, { wch: 22 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Ringkasan');
        }

        if (sections.requests) {
            const rows = [
                ...metaRows,
                enabledColumns.map(pickLabel),
                ...filteredRequests.map((item) => enabledColumns.map((key) => requestRow(item, key))),
            ];
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = enabledColumns.map((key) => ({ wch: key === 'keperluan' ? 42 : 20 }));
            XLSX.utils.book_append_sheet(wb, ws, 'Daftar Pengajuan');
        }

        if (sections.units) {
            const rows = [
                ...metaRows,
                ['Unit', 'Petty Cash', 'Reimbursement', 'Total'],
                ...filteredUnits.map((item) => [item.unit, item.pc, item.reimburse, item.total]),
            ];
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Per Unit');
        }

        if (sections.mutations) {
            const rows = [
                ...metaRows,
                ['Waktu', 'Jenis', 'Jumlah', 'Saldo Sesudah', 'Keterangan'],
                ...(data.rekap_mutasi || []).map((item) => [
                    item.waktu,
                    item.jenis === 'penambahan' ? 'Penambahan' : 'Pengurangan',
                    item.jumlah,
                    item.saldo_sesudah,
                    item.keterangan,
                ]),
            ];
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 46 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Mutasi Saldo');
        }

        XLSX.writeFile(wb, `Laporan_PC_Reimbursement_${dari}_${sampai}.xlsx`);
    };

    const printReport = () => {
        if (!data) return;
        window.print();
    };

    const renderRequestsTable = (print = false) => (
        <div className="lpc-table-wrap">
            <table className="lpc-table">
                <thead>
                    <tr>{enabledColumns.map((key) => <th key={key} className={['nominal', 'realisasi', 'efektif'].includes(key) ? 'lpc-num' : ''}>{pickLabel(key)}</th>)}</tr>
                </thead>
                <tbody>
                    {filteredRequests.length === 0 ? (
                        <tr><td colSpan={enabledColumns.length || 1} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Tidak ada data sesuai filter.</td></tr>
                    ) : filteredRequests.map((item) => (
                        <tr key={`${item.jenis}-${item.no}`}>
                            {enabledColumns.map((key) => {
                                if (key === 'status') {
                                    const meta = STATUS_META[item.status] || {};
                                    return <td key={key}><span className="lpc-badge" style={{ background: meta.bg || '#f1f5f9', color: meta.color || '#334155' }}>{statusLabel(item.status)}</span></td>;
                                }
                                if (key === 'jenis') {
                                    return <td key={key}><span className="lpc-badge" style={{ background: item.jenis === 'Petty Cash' ? '#dcfce7' : '#fef3c7', color: item.jenis === 'Petty Cash' ? '#166534' : '#92400e' }}>{item.jenis}</span></td>;
                                }
                                if (key === 'tanggal') return <td key={key}>{dateId(item.tanggal)}</td>;
                                if (key === 'unit') return <td key={key}>{unitLabel(item.unit)}</td>;
                                if (key === 'nominal') return <td key={key} className="lpc-num">{fmt(item.nominal)}</td>;
                                if (key === 'realisasi') return <td key={key} className="lpc-num">{item.nominal_realisasi === null || item.nominal_realisasi === undefined ? '-' : fmt(item.nominal_realisasi)}</td>;
                                if (key === 'efektif') return <td key={key} className="lpc-num">{fmt(item.nominal_realisasi ?? item.nominal_efektif ?? item.nominal)}</td>;
                                return <td key={key} style={key === 'keperluan' && print ? { maxWidth: 300 } : undefined}>{item[key] || '-'}</td>;
                            })}
                        </tr>
                    ))}
                    {filteredRequests.length > 0 && (
                        <tr className="total-row">
                            <td colSpan={Math.max(enabledColumns.length - 1, 1)}>Total Nominal Efektif</td>
                            <td className="lpc-num">{fmt(stats.effectiveTotal)}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderReportBody = (print = false) => (
        <div className="lpc-paper">
            <div className="lpc-kop">
                <img src="/logo.png" alt="Logo" className="lpc-logo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                <div className="lpc-kop-center">
                    <div className="lpc-org">{ORG.name}</div>
                    <div className="lpc-org-sub">{ORG.address}</div>
                    <div className="lpc-org-sub">{ORG.contact}</div>
                </div>
                <div />
            </div>

            <div className="lpc-doc-title">
                <h2>Laporan Petty Cash dan Reimbursement</h2>
                <p>Periode {periodLabel}</p>
                <p>Dicetak {printDate}</p>
            </div>

            {sections.summary && (
                <section className="lpc-section">
                    <div className="lpc-section-head"><WalletCards size={16} /> Ringkasan Saldo</div>
                    <div className="lpc-summary-grid">
                        <div className="lpc-summary-box"><span>Saldo Awal</span><strong>{fmt(data.saldo_awal)}</strong></div>
                        <div className="lpc-summary-box"><span>Penambahan</span><strong>{fmt(data.total_penambahan)}</strong></div>
                        <div className="lpc-summary-box"><span>Pengurangan</span><strong>{fmt(data.total_pengurangan)}</strong></div>
                        <div className="lpc-summary-box"><span>Saldo Akhir</span><strong>{fmt(data.saldo_akhir)}</strong></div>
                    </div>
                </section>
            )}

            {sections.stats && (
                <section className="lpc-section">
                    <div className="lpc-section-head"><CheckSquare size={16} /> Statistik Pengajuan</div>
                    <div className="lpc-summary-grid">
                        <div className="lpc-summary-box"><span>Total Pengajuan</span><strong>{fmtNum(stats.total)}</strong></div>
                        <div className="lpc-summary-box"><span>Petty Cash</span><strong>{fmtNum(stats.pc)}</strong></div>
                        <div className="lpc-summary-box"><span>Reimbursement</span><strong>{fmtNum(stats.rb)}</strong></div>
                        <div className="lpc-summary-box"><span>Nominal Efektif</span><strong>{fmt(stats.effectiveTotal)}</strong></div>
                    </div>
                </section>
            )}

            {sections.requests && (
                <section className="lpc-section">
                    <div className="lpc-section-head"><FileText size={16} /> Daftar Pengajuan</div>
                    {renderRequestsTable(print)}
                </section>
            )}

            {sections.units && (
                <section className="lpc-section">
                    <div className="lpc-section-head"><Building2 size={16} /> Rekap Per Unit</div>
                    <div className="lpc-table-wrap">
                        <table className="lpc-table">
                            <thead>
                                <tr>
                                    <th>Unit</th>
                                    <th className="lpc-num">Petty Cash</th>
                                    <th className="lpc-num">Reimbursement</th>
                                    <th className="lpc-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUnits.length === 0 ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Tidak ada pencairan sesuai filter.</td></tr>
                                ) : filteredUnits.map((item) => (
                                    <tr key={item.unit}>
                                        <td style={{ fontWeight: 700 }}>{item.unit}</td>
                                        <td className="lpc-num">{fmt(item.pc)}</td>
                                        <td className="lpc-num">{fmt(item.reimburse)}</td>
                                        <td className="lpc-num" style={{ fontWeight: 800 }}>{fmt(item.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {sections.mutations && (
                <section className="lpc-section">
                    <div className="lpc-section-head"><WalletCards size={16} /> Mutasi Saldo</div>
                    <div className="lpc-table-wrap">
                        <table className="lpc-table">
                            <thead>
                                <tr>
                                    <th>Waktu</th>
                                    <th>Jenis</th>
                                    <th className="lpc-num">Jumlah</th>
                                    <th className="lpc-num">Saldo Sesudah</th>
                                    <th>Keterangan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data.rekap_mutasi || []).length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Tidak ada mutasi saldo pada periode ini.</td></tr>
                                ) : data.rekap_mutasi.map((item, index) => (
                                    <tr key={`${item.waktu}-${index}`}>
                                        <td>{dateTimeId(item.waktu)}</td>
                                        <td>{item.jenis === 'penambahan' ? 'Penambahan' : 'Pengurangan'}</td>
                                        <td className="lpc-num">{fmt(item.jumlah)}</td>
                                        <td className="lpc-num">{fmt(item.saldo_sesudah)}</td>
                                        <td>{item.keterangan || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {sections.chart && !print && (
                <section className="lpc-section lpc-no-print">
                    <div className="lpc-section-head"><BarChart3 size={16} /> Grafik Tren 6 Bulan</div>
                    <div className="lpc-chart-card">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.grafik || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef5" />
                                <XAxis dataKey="bulan" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}jt` : `${(value / 1000).toFixed(0)}rb`} />
                                <Tooltip formatter={(value) => fmt(value)} />
                                <Legend />
                                <Bar dataKey="petty_cash" name="Petty Cash" fill="#16452f" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="reimbursement" name="Reimbursement" fill="#c9a84c" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}
        </div>
    );

    return (
        <div className="lpc-page">

            <div className="lpc-header lpc-no-print">
                <div className="lpc-page-title">
                    <span><WalletCards size={22} /></span>
                    <div>
                        <h1 className="lpc-title">Laporan Petty Cash & Reimbursement</h1>
                        <p className="lpc-muted">Filter lengkap, pilih output, lalu export dalam format formal berk kop.</p>
                    </div>
                </div>
                <div className="lpc-actions">
                    <button className="lpc-btn ghost" onClick={() => setShowSettings(true)}>
                        <Settings size={16} /> Setting Output
                    </button>
                    <button className="lpc-btn ghost" onClick={printReport} disabled={!data}>
                        <Printer size={16} /> Print
                    </button>
                    <button className="lpc-btn gold" onClick={printReport} disabled={!data}>
                        <Download size={16} /> PDF
                    </button>
                    <button className="lpc-btn primary" onClick={exportExcel} disabled={!data}>
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                </div>
            </div>

            <div className="lpc-panel lpc-toolbar lpc-no-print">
                <div className="lpc-grid">
                    <div className="lpc-field">
                        <label className="lpc-label">Dari</label>
                        <input className="lpc-input" type="date" value={dari} onChange={(event) => setDari(event.target.value)} />
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Sampai</label>
                        <input className="lpc-input" type="date" value={sampai} onChange={(event) => setSampai(event.target.value)} />
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Jenis</label>
                        <select className="lpc-select" value={filters.jenis} onChange={(event) => setFilters((prev) => ({ ...prev, jenis: event.target.value }))}>
                            <option value="">Semua</option>
                            <option value="Petty Cash">Petty Cash</option>
                            <option value="Reimbursement">Reimbursement</option>
                        </select>
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Status</label>
                        <select className="lpc-select" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                            <option value="">Semua</option>
                            {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                        </select>
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Unit</label>
                        <select className="lpc-select" value={filters.unit} onChange={(event) => setFilters((prev) => ({ ...prev, unit: event.target.value }))}>
                            <option value="">Semua</option>
                            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Pemohon</label>
                        <select className="lpc-select" value={filters.pemohon} onChange={(event) => setFilters((prev) => ({ ...prev, pemohon: event.target.value }))}>
                            <option value="">Semua</option>
                            {applicants.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Nominal Min</label>
                        <input className="lpc-input" type="number" min="0" value={filters.minNominal} onChange={(event) => setFilters((prev) => ({ ...prev, minNominal: event.target.value }))} placeholder="0" />
                    </div>
                    <div className="lpc-field">
                        <label className="lpc-label">Nominal Max</label>
                        <input className="lpc-input" type="number" min="0" value={filters.maxNominal} onChange={(event) => setFilters((prev) => ({ ...prev, maxNominal: event.target.value }))} placeholder="Tidak dibatasi" />
                    </div>
                    <div className="lpc-field" style={{ gridColumn: 'span 2' }}>
                        <label className="lpc-label">Pencarian</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                            <input className="lpc-input" style={{ width: '100%', paddingLeft: 32 }} value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="No, keperluan, unit, pemohon..." />
                        </div>
                    </div>
                    <div className="lpc-actions">
                        <button className="lpc-btn primary" onClick={fetchReport} disabled={loading}>
                            {loading ? <Loader size={16} /> : <Filter size={16} />} Tampilkan
                        </button>
                        <button className="lpc-btn ghost" onClick={resetFilters}>Reset</button>
                    </div>
                </div>
                <div className="lpc-shortcuts">
                    <button className="lpc-shortcut" onClick={() => setShortcut('month')}>Bulan Ini</button>
                    <button className="lpc-shortcut" onClick={() => setShortcut('last-month')}>Bulan Lalu</button>
                    <button className="lpc-shortcut" onClick={() => setShortcut('quarter')}>Kuartal Ini</button>
                    <button className="lpc-shortcut" onClick={() => setShortcut('year')}>Tahun Ini</button>
                </div>
                {error && <div className="lpc-filter-note" style={{ color: '#b91c1c' }}>{error}</div>}
            </div>

            {!data && !loading && (
                <div className="lpc-empty lpc-no-print">
                    <FileText size={34} style={{ marginBottom: 10 }} />
                    <div style={{ fontWeight: 750, color: '#334155' }}>Belum ada laporan ditampilkan</div>
                    <div style={{ marginTop: 5 }}>Pilih periode, filter seperlunya, lalu klik Tampilkan.</div>
                </div>
            )}

            {data && (
                <>
                    <div className="lpc-kpis lpc-no-print">
                        <div className="lpc-kpi"><div className="lpc-kpi-label">Data Terfilter</div><div className="lpc-kpi-value">{fmtNum(stats.total)} item</div></div>
                        <div className="lpc-kpi"><div className="lpc-kpi-label">Nominal Ajuan</div><div className="lpc-kpi-value">{fmt(stats.requestedTotal)}</div></div>
                        <div className="lpc-kpi"><div className="lpc-kpi-label">Nominal Efektif</div><div className="lpc-kpi-value">{fmt(stats.effectiveTotal)}</div></div>
                        <div className="lpc-kpi"><div className="lpc-kpi-label">Saldo Akhir</div><div className="lpc-kpi-value">{fmt(data.saldo_akhir)}</div></div>
                    </div>

                    <div className="lpc-tabs lpc-no-print">
                        <button className={`lpc-tab${activeView === 'preview' ? ' active' : ''}`} onClick={() => setActiveView('preview')}>Preview Formal</button>
                        <button className={`lpc-tab${activeView === 'table' ? ' active' : ''}`} onClick={() => setActiveView('table')}>Tabel Cepat</button>
                    </div>

                    {activeView === 'table' && (
                        <div className="lpc-panel lpc-toolbar lpc-no-print">
                            <div className="lpc-section-head" style={{ marginBottom: 12 }}><FileText size={16} /> Tabel Cepat</div>
                            {renderRequestsTable(false)}
                        </div>
                    )}

                    <div id="lpc-print-area" className="lpc-report">
                        {renderReportBody(false)}
                    </div>
                </>
            )}

            {showSettings && (
                <Modal onClose={() => setShowSettings(false)}>
                    <div className="lpc-modal-head">
                        <div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: '#102b1f' }}>Setting Output Laporan</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Centang bagian dan kolom yang mau dimunculkan di PDF/print/Excel.</div>
                        </div>
                    </div>
                    <div className="lpc-modal-body">
                        <div className="lpc-section-head"><Settings size={16} /> Bagian Laporan</div>
                        <div className="lpc-check-grid" style={{ marginBottom: 18 }}>
                            {SECTION_OPTIONS.map((item) => (
                                <label className="lpc-check" key={item.key}>
                                    <input type="checkbox" checked={sections[item.key]} onChange={() => toggleMap(setSections, item.key)} />
                                    {item.label}
                                </label>
                            ))}
                        </div>

                        <div className="lpc-section-head"><FileText size={16} /> Kolom Daftar Pengajuan</div>
                        <div className="lpc-check-grid">
                            {COLUMN_OPTIONS.map((item) => (
                                <label className="lpc-check" key={item.key}>
                                    <input type="checkbox" checked={columns[item.key]} onChange={() => toggleMap(setColumns, item.key)} />
                                    {item.label}
                                </label>
                            ))}
                        </div>
                        <div className="lpc-filter-note">Minimal satu kolom sebaiknya aktif. Kalau semua kolom dimatikan, tabel pengajuan tetap kosong sesuai pilihan output.</div>
                        <div className="lpc-actions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
                            <button className="lpc-btn ghost" onClick={() => { setSections(DEFAULT_SECTIONS); setColumns(DEFAULT_COLUMNS); }}>Reset Default</button>
                            <button className="lpc-btn primary" onClick={() => setShowSettings(false)}>Simpan Setting</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
