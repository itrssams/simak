import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    Clock3,
    Search,
    TrendingUp,
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import './InvoiceDashboard.css';
import './PenagihanClean.css';

const money = (value) =>
    `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCompactRp = (value) => {
    const n = Number(value || 0);
    if (n === 0) return 'Rp 0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
    if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
    return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
};
const percent = (value) =>
    `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

const emptyDashboard = {
    summary: {},
    aging: {},
    pembiayaan: [],
    top_piutang: [],
    pendapatan_trend: [],
    kunjungan_trend: [],
    trend_meta: { granularity: 'monthly', kunjungan_scope: 'penagihan' },
};

export default function InvoiceDashboard() {
    const toast = useToast();
    const navigate = useNavigate();
    const [data, setData] = useState(emptyDashboard);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [range, setRange] = useState({ dari: '', sampai: '' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [chartTab, setChartTab] = useState('pendapatan'); // 'pendapatan' | 'kunjungan'
    const [kunjunganScope, setKunjunganScope] = useState('penagihan'); // 'penagihan' | 'semua'

    useEffect(() => {
        let mounted = true;
        const fetchDashboard = async () => {
            setLoading(true);
            try {
                const params = {
                    ...Object.fromEntries(Object.entries(range).filter(([, value]) => value)),
                    kunjungan_scope: kunjunganScope,
                };
                const res = await api.get('/keuangan/invoice-dashboard/', { params });
                if (mounted) setData(res.data || emptyDashboard);
            } catch (err) {
                if (mounted) toast.error(err?.response?.data?.error || 'Gagal memuat dashboard invoice.');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchDashboard();
        return () => { mounted = false; };
    }, [range, kunjunganScope]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setPage(1); }, [search, pageSize]);

    const filteredRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return data.pembiayaan || [];
        return (data.pembiayaan || []).filter((item) => (
            String(item.nama_pembiayaan || '').toLowerCase().includes(needle)
            || String(item.id_pembiayaan || '').toLowerCase().includes(needle)
        ));
    }, [data.pembiayaan, search]);

    const pagedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, page, pageSize]);

    const summary = data.summary || {};
    const aging = data.aging || {};

    const openInvoiceList = useCallback((extra = {}) => {
        const params = new URLSearchParams({
            ...Object.fromEntries(Object.entries(range).filter(([, value]) => value)),
            ...extra,
        });
        navigate(`/keuangan/invoices${params.toString() ? `?${params.toString()}` : ''}`);
    }, [range, navigate]);

    const setDateRange = (key, value) => setRange((prev) => ({ ...prev, [key]: value }));

    return (
        <div className="idash-page">
            <div className="idash-head">
                <div className="idash-title">
                    <div>
                        <h1>Dashboard Invoice</h1>
                        <p>Ringkasan piutang pembiayaan, pembayaran, dan prioritas penagihan.</p>
                    </div>
                </div>
                <div className="idash-head-actions">
                    <DateRangePicker
                        dari={range.dari}
                        sampai={range.sampai}
                        onChange={({ dari, sampai }) => setRange({ dari, sampai })}
                        placeholder="Pilih Periode Tanggal"
                    />
                </div>
            </div>

            <section className="idash-summary-grid">
                <MetricCard
                    variant="indigo"
                    label="Total Piutang"
                    value={money(summary.total_tagihan)}
                    note={`${summary.invoice_count || 0} invoice aktif`}
                />
                <MetricCard
                    variant="blue"
                    label="Sudah Dibayar"
                    value={money(summary.total_dibayar)}
                    note={`Collection rate ${percent(summary.collection_rate)}`}
                />
                <MetricCard
                    variant="amber"
                    label="Sisa Piutang"
                    value={money(summary.sisa_piutang)}
                    note={`${summary.belum_bayar_count || 0} belum bayar · ${summary.sebagian_count || 0} sebagian`}
                />
                <MetricCard
                    variant="red"
                    label="Lewat Jatuh Tempo"
                    value={`${summary.overdue_count || 0} invoice`}
                    note="Perlu prioritas follow up"
                />
            </section>

            {/* ── Line Chart Panel: Tab Switcher Tren Pendapatan | Tren Kunjungan ── */}
            <section className="idash-chart-section">
                <div className="idash-chart-head">
                    <div className="idash-chart-title-wrap">
                        <h2>{chartTab === 'pendapatan' ? 'Tren Pendapatan & Penagihan' : 'Tren Kunjungan Pasien'}</h2>
                        <p>
                            {chartTab === 'pendapatan'
                                ? 'Perbandingan nilai invoice terbit terhadap pembayaran terverifikasi.'
                                : `Volume kunjungan (${kunjunganScope === 'penagihan' ? 'Asuransi & Perusahaan Penagihan' : 'Seluruh Penjamin'}).`}
                            {data.trend_meta?.granularity ? ` · Interval ${data.trend_meta.granularity === 'daily' ? 'Harian' : 'Bulanan'}` : ''}
                        </p>
                    </div>

                    <div className="idash-chart-controls">
                        {chartTab === 'kunjungan' && (
                            <div className="idash-seg-group" role="group" aria-label="Cakupan kunjungan">
                                <button
                                    type="button"
                                    className={`idash-seg-btn ${kunjunganScope === 'penagihan' ? 'active' : ''}`}
                                    onClick={() => setKunjunganScope('penagihan')}
                                >
                                    Penagihan
                                </button>
                                <button
                                    type="button"
                                    className={`idash-seg-btn ${kunjunganScope === 'semua' ? 'active' : ''}`}
                                    onClick={() => setKunjunganScope('semua')}
                                >
                                    Semua Penjamin
                                </button>
                            </div>
                        )}

                        <div className="idash-seg-group" role="tablist" aria-label="Jenis tren dashboard">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={chartTab === 'pendapatan'}
                                className={`idash-seg-btn ${chartTab === 'pendapatan' ? 'active' : ''}`}
                                onClick={() => setChartTab('pendapatan')}
                            >
                                Tren Pendapatan
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={chartTab === 'kunjungan'}
                                className={`idash-seg-btn ${chartTab === 'kunjungan' ? 'active' : ''}`}
                                onClick={() => setChartTab('kunjungan')}
                            >
                                Tren Kunjungan
                            </button>
                        </div>
                    </div>
                </div>

                <div className="idash-chart-legend">
                    {chartTab === 'pendapatan' ? (
                        <>
                            <span className="idash-legend-item">
                                <i style={{ background: '#635bff' }} /> Tagihan Terbit
                            </span>
                            <span className="idash-legend-item">
                                <i style={{ background: '#10b981' }} /> Pendapatan Cair (Dibayar)
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="idash-legend-item">
                                <i style={{ background: '#635bff' }} /> Total Kunjungan
                            </span>
                            <span className="idash-legend-item">
                                <i style={{ background: '#10b981' }} /> Rawat Jalan
                            </span>
                            <span className="idash-legend-item">
                                <i style={{ background: '#f59e0b' }} /> Rawat Inap
                            </span>
                            <span className="idash-legend-item">
                                <i style={{ background: '#ef4444' }} /> UGD
                            </span>
                        </>
                    )}
                </div>

                <div className="idash-chart-body">
                    {loading && !(chartTab === 'pendapatan' ? data.pendapatan_trend : data.kunjungan_trend)?.length ? (
                        <div className="idash-chart-empty">Memuat grafik tren...</div>
                    ) : chartTab === 'pendapatan' ? (
                        <ResponsiveContainer width="100%" height={236}>
                            <LineChart
                                data={data.pendapatan_trend || []}
                                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gdg-border)" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: 'var(--pen-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={16}
                                />
                                <YAxis
                                    tickFormatter={fmtCompactRp}
                                    tick={{ fill: 'var(--pen-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={74}
                                />
                                <Tooltip content={<TrendTooltip mode="pendapatan" />} />
                                <Line
                                    type="monotone"
                                    dataKey="tagihan"
                                    name="Tagihan Terbit"
                                    stroke="#635bff"
                                    strokeWidth={2}
                                    dot={{ r: 2.5, strokeWidth: 0, fill: '#635bff' }}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="dibayar"
                                    name="Pendapatan Cair"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ r: 2.5, strokeWidth: 0, fill: '#10b981' }}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height={236}>
                            <LineChart
                                data={data.kunjungan_trend || []}
                                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gdg-border)" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: 'var(--pen-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={16}
                                />
                                <YAxis
                                    tickFormatter={(v) => Number(v || 0).toLocaleString('id-ID')}
                                    tick={{ fill: 'var(--pen-muted)', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={54}
                                    allowDecimals={false}
                                />
                                <Tooltip content={<TrendTooltip mode="kunjungan" />} />
                                <Line
                                    type="monotone"
                                    dataKey="total"
                                    name="Total Kunjungan"
                                    stroke="#635bff"
                                    strokeWidth={2.2}
                                    dot={{ r: 2.5, strokeWidth: 0, fill: '#635bff' }}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="rawat_jalan"
                                    name="Rawat Jalan"
                                    stroke="#10b981"
                                    strokeWidth={1.75}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="rawat_inap"
                                    name="Rawat Inap"
                                    stroke="#f59e0b"
                                    strokeWidth={1.75}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="ugd"
                                    name="UGD"
                                    stroke="#ef4444"
                                    strokeWidth={1.5}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </section>

            <section className="idash-grid">
                <div className="idash-panel aging">
                    <div className="idash-panel-head">
                        <div>
                            <h2>Aging Piutang</h2>
                            <p>Nilai sisa tagihan berdasarkan umur jatuh tempo.</p>
                        </div>
                        <Clock3 size={20} />
                    </div>
                    <div className="idash-aging-list">
                        <AgingRow label="Belum jatuh tempo" value={aging.belum_jatuh_tempo} color="#10b981" onClick={() => openInvoiceList({ aging: 'not_due' })} />
                        <AgingRow label="Lewat 1–30 hari" value={aging.hari_1_30} color="#f59e0b" onClick={() => openInvoiceList({ aging: '1_30' })} />
                        <AgingRow label="Lewat 31–60 hari" value={aging.hari_31_60} color="#f97316" onClick={() => openInvoiceList({ aging: '31_60' })} />
                        <AgingRow label="Lewat > 60 hari" value={aging.hari_lebih_60} color="#ef4444" onClick={() => openInvoiceList({ aging: 'over_60' })} />
                    </div>
                </div>

                <div className="idash-panel top">
                    <div className="idash-panel-head">
                        <div>
                            <h2>Top Sisa Piutang</h2>
                            <p>Pembiayaan dengan sisa terbesar.</p>
                        </div>
                        <TrendingUp size={20} />
                    </div>
                    <div className="idash-top-list">
                        {(data.top_piutang || []).slice(0, 4).map((item, index) => (
                            <button
                                key={item.id_pembiayaan ?? index}
                                type="button"
                                className="idash-top-item"
                                onClick={() => openInvoiceList({ id_pembiayaan: item.id_pembiayaan })}
                            >
                                <span style={{ background: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][index] }} />
                                <div>
                                    <strong>{item.nama_pembiayaan}</strong>
                                    <small>{item.invoice_count} invoice</small>
                                </div>
                                <b>{money(item.sisa_piutang)}</b>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="idash-card">
                <div className="idash-table-head">
                    <div>
                        <h2>Daftar Pembiayaan</h2>
                        <p>{filteredRows.length} pembiayaan tercatat dalam invoice aktif.</p>
                    </div>
                    <div className="idash-search">
                        <Search size={16} />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pembiayaan / ID..." />
                    </div>
                </div>

                <div className="idash-table-wrap">
                    <table className="idash-table">
                        <thead>
                            <tr>
                                <th>Pembiayaan</th>
                                <th className="right">Total Piutang</th>
                                <th className="right">Dibayar</th>
                                <th className="right">Sisa</th>
                                <th>Invoice</th>
                                <th>Progress</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="center">Memuat dashboard invoice...</td></tr>
                            ) : pagedRows.length === 0 ? (
                                <tr><td colSpan="7" className="center">Belum ada data pembiayaan sesuai pencarian.</td></tr>
                            ) : pagedRows.map((item) => (
                                <tr key={`${item.id_pembiayaan}-${item.nama_pembiayaan}`}>
                                    <td>
                                        <div className="idash-name">
                                            <div>
                                                <strong>{item.nama_pembiayaan}</strong>
                                                <small>ID: {item.id_pembiayaan || '-'}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="right mono">{money(item.total_tagihan)}</td>
                                    <td className="right mono paid">{money(item.total_dibayar)}</td>
                                    <td className="right mono due">{money(item.sisa_piutang)}</td>
                                    <td className="center">
                                        <span className="idash-pill">{item.invoice_count}</span>
                                    </td>
                                    <td>
                                        <ProgressBar value={item.collection_rate} />
                                    </td>
                                    <td className="center">
                                        <button className="idash-mini-btn" type="button" onClick={() => openInvoiceList({ id_pembiayaan: item.id_pembiayaan })}>
                                            Lihat <ArrowRight size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <SimplePagination
                    page={page}
                    pageSize={pageSize}
                    total={filteredRows.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    buttonClassName="idash-page-btn"
                    selectClassName="idash-page-select"
                />
            </section>
        </div>
    );
}

function MetricCard({ label, value, note, variant }) {
    return (
        <div className={`idash-metric idash-metric--${variant}`}>
            <div className="idash-metric-body">
                <span className="idash-metric-label">{label}</span>
                <strong className="idash-metric-value">{value}</strong>
                <small className="idash-metric-note">{note}</small>
            </div>
        </div>
    );
}

function AgingRow({ label, value, color, onClick }) {
    return (
        <button className="idash-aging-row" type="button" onClick={onClick}>
            <span style={{ background: color }} />
            <div>
                <strong>{label}</strong>
                <small>{money(value)}</small>
            </div>
        </button>
    );
}

function ProgressBar({ value }) {
    const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
    return (
        <div className="idash-progress">
            <div><span style={{ width: `${safeValue}%` }} /></div>
            <small>{percent(safeValue)}</small>
        </div>
    );
}

function TrendTooltip({ active, payload, label, mode }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload;
    return (
        <div className="idash-chart-tooltip">
            <div className="idash-chart-tooltip-title">{label}</div>
            <div className="idash-chart-tooltip-rows">
                {payload.map((entry, idx) => (
                    <div key={idx} className="idash-chart-tooltip-row">
                        <span className="idash-chart-tooltip-key">
                            <i style={{ backgroundColor: entry.color }} />
                            <span>{entry.name}</span>
                        </span>
                        <strong className="idash-chart-tooltip-val">
                            {mode === 'pendapatan'
                                ? money(entry.value)
                                : `${Number(entry.value || 0).toLocaleString('id-ID')} kunj.`}
                        </strong>
                    </div>
                ))}
                {mode === 'kunjungan' && row?.estimasi_nilai > 0 && (
                    <div className="idash-chart-tooltip-row is-extra">
                        <span className="idash-chart-tooltip-key">Estimasi Biaya</span>
                        <strong className="idash-chart-tooltip-val">{money(row.estimasi_nilai)}</strong>
                    </div>
                )}
            </div>
        </div>
    );
}