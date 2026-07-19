import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Clock3,
    FileText,
    Landmark,
    Search,
    TrendingUp,
    WalletCards,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import './InvoiceDashboard.css';

const money = (value) =>
    `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value) =>
    `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

const emptyDashboard = {
    summary: {},
    aging: {},
    pembiayaan: [],
    top_piutang: [],
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

    useEffect(() => {
        let mounted = true;
        const fetchDashboard = async () => {
            setLoading(true);
            try {
                const params = Object.fromEntries(Object.entries(range).filter(([, value]) => value));
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
    }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    <span><BarChart3 size={23} /></span>
                    <div>
                        <h1>Dashboard Invoice</h1>
                        <p>Ringkasan piutang pembiayaan, pembayaran, dan prioritas penagihan.</p>
                    </div>
                </div>
            </div>

            <section className="idash-filter-card">
                <div>
                    <strong>Range Tanggal Invoice</strong>
                    <span>Filter dashboard berdasarkan tanggal pembuatan invoice.</span>
                </div>
                <div className="idash-date-tools">
                    <DateRangePicker
                        dari={range.dari}
                        sampai={range.sampai}
                        onChange={({ dari, sampai }) => setRange({ dari, sampai })}
                        placeholder="Pilih Periode Tanggal"
                    />
                </div>
            </section>

            <section className="idash-summary-grid">
                <MetricCard
                    variant="indigo"
                    icon={FileText}
                    label="Total Piutang"
                    value={money(summary.total_tagihan)}
                    note={`${summary.invoice_count || 0} invoice aktif`}
                />
                <MetricCard
                    variant="blue"
                    icon={CheckCircle2}
                    label="Sudah Dibayar"
                    value={money(summary.total_dibayar)}
                    note={`Collection rate ${percent(summary.collection_rate)}`}
                />
                <MetricCard
                    variant="amber"
                    icon={WalletCards}
                    label="Sisa Piutang"
                    value={money(summary.sisa_piutang)}
                    note={`${summary.belum_bayar_count || 0} belum bayar · ${summary.sebagian_count || 0} sebagian`}
                />
                <MetricCard
                    variant="red"
                    icon={AlertTriangle}
                    label="Lewat Jatuh Tempo"
                    value={`${summary.overdue_count || 0} invoice`}
                    note="Perlu prioritas follow up"
                />
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
                                            <span><Landmark size={16} /></span>
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

function MetricCard({ icon: Icon, label, value, note, variant }) {
    return (
        <div className={`idash-metric idash-metric--${variant}`}>
            <div className="idash-metric-icon">
                <Icon size={22} />
            </div>
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