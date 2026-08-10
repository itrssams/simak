import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Banknote,
    CalendarDays,
    CheckCircle2,
    Eye,
    History,
    ReceiptText,
    RotateCcw,
    Search,
    ShieldCheck,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import DateRangePicker from '../../components/DateRangePicker';
import DebouncedSearchInput from '../../components/DebouncedSearchInput';
import DateField from '../../components/DateField';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './InvoiceVerifikasi.css';

const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const errorMessage = (err, fallback) => err?.response?.data?.error || err?.response?.data?.detail || fallback;

export default function InvoiceVerifikasi() {
    const toast = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [verifyingId, setVerifyingId] = useState(null);
    const [unverifyingId, setUnverifyingId] = useState(null);
    const [activeTab, setActiveTab] = useState('menunggu');
    const [filters, setFilters] = useState({ search: '', dari: '', sampai: '' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const canVerify = Boolean(user?.is_superuser || (user?.is_keuangan && ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role)));
    const totalPending = useMemo(() => rows.reduce((sum, row) => sum + Number(row.jumlah || 0), 0), [rows]);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, Object.fromEntries(
                Object.entries(filters).filter(([, value]) => value),
            ));
            params.status = activeTab;
            const res = await api.get('/keuangan/invoice-verification/', { params });
            setRows(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat verifikasi pembayaran.'));
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters, page, pageSize, toast]);

    useEffect(() => { fetchRows(); }, [fetchRows]);
    useEffect(() => { setPage(1); }, [activeTab, filters, pageSize]);

    const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

    const resetFilters = () => {
        setFilters({ search: '', dari: '', sampai: '' });
    };

    const verifyPayment = async (row) => {
        if (!canVerify) {
            toast.error('Hanya manajer keuangan ke atas yang bisa verifikasi pembayaran.');
            return;
        }
        setVerifyingId(row.id);
        try {
            await api.post(`/keuangan/faktur/${row.faktur.id}/pembayaran/${row.id}/verifikasi/`);
            toast.success(`Pembayaran invoice ${row.faktur.nomor_faktur} berhasil diverifikasi.`);
            await fetchRows();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal verifikasi pembayaran.'));
        } finally {
            setVerifyingId(null);
        }
    };

    const unverifyPayment = async (row) => {
        if (!canVerify) {
            toast.error('Hanya manajer keuangan ke atas yang bisa membatalkan verifikasi pembayaran.');
            return;
        }
        if (!window.confirm(`Batalkan verifikasi pembayaran invoice ${row.faktur.nomor_faktur} (${money(row.jumlah)})?\n\nSaldo alokasi pembiayaan yang terpotong akan dikembalikan.`)) {
            return;
        }
        setUnverifyingId(row.id);
        try {
            const res = await api.post(`/keuangan/faktur/${row.faktur.id}/pembayaran/${row.id}/batal-verifikasi/`);
            toast.success(res.data.message || `Verifikasi pembayaran invoice ${row.faktur.nomor_faktur} berhasil dibatalkan.`);
            await fetchRows();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan verifikasi pembayaran.'));
        } finally {
            setUnverifyingId(null);
        }
    };

    return (
        <div className="ivf-page">
            <div className="inv-hero">
                <div className="inv-title">
                    <span><ShieldCheck size={22} /></span>
                    <div>
                        <h1>Verifikasi Pembayaran</h1>
                        <p>Pantau pengajuan pembayaran invoice pembiayaan yang menunggu verifikasi dan riwayatnya.</p>
                    </div>
                </div>
            </div>

            <section className="ivf-summary">
                <SummaryCard icon={ReceiptText} label={activeTab === 'menunggu' ? 'Menunggu' : 'History'} value={`${total} pengajuan`} />
                <SummaryCard icon={Banknote} label="Total Halaman Ini" value={money(totalPending)} accent />
                <SummaryCard icon={ShieldCheck} label="Akses Verifikasi" value={canVerify ? 'Aktif' : 'Lihat Saja'} />
            </section>

            <section className="ivf-card">
                <div className="ivf-card-head">
                    <div>
                        <h2>{activeTab === 'menunggu' ? 'Daftar Menunggu Verifikasi' : 'History Verifikasi'}</h2>
                        <p>Gunakan pencarian untuk nomor invoice, pembiayaan, pengaju, atau catatan pembayaran.</p>
                    </div>
                    <div className="ivf-tabs" role="tablist" aria-label="Mode verifikasi pembayaran">
                        <button
                            className={activeTab === 'menunggu' ? 'active' : ''}
                            type="button"
                            onClick={() => setActiveTab('menunggu')}
                        >
                            <ShieldCheck size={16} /> Menunggu
                        </button>
                        <button
                            className={activeTab === 'history' ? 'active' : ''}
                            type="button"
                            onClick={() => setActiveTab('history')}
                        >
                            <History size={16} /> History
                        </button>
                    </div>
                </div>

                <div className="ivf-filter">
                    <DebouncedSearchInput
                        value={filters.search}
                        onChange={(val) => setFilter('search', val)}
                        placeholder="Cari invoice / pembiayaan / pengaju..."
                        className="ivf-search"
                    />
                    <DateRangePicker
                        dari={filters.dari}
                        sampai={filters.sampai}
                        onChange={({ dari, sampai }) => {
                            setFilters((prev) => ({ ...prev, dari, sampai }));
                        }}
                        placeholder="Pilih Periode Tanggal"
                    />
                    <button className="ivf-reset" type="button" onClick={resetFilters}>
                        <X size={16} /> Reset
                    </button>
                </div>

                <div className="ivf-table-wrap">
                    <table className="ivf-table">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Tanggal Bayar</th>
                                <th>Pembiayaan</th>
                                <th className="right">Jumlah</th>
                                <th>Pengaju</th>
                                <th>Catatan</th>
                                <th>{activeTab === 'menunggu' ? 'Aksi' : 'Verifikasi'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="center ivf-state">Memuat pengajuan...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan="7" className="center ivf-state">{activeTab === 'menunggu' ? 'Tidak ada pembayaran menunggu verifikasi.' : 'Belum ada history verifikasi pembayaran.'}</td></tr>
                            ) : rows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <strong className="ivf-mono">{row.faktur.nomor_faktur}</strong>
                                        <small>{dateLabel(row.faktur.tanggal)} · {row.faktur.status_label}</small>
                                    </td>
                                    <td>
                                        <span className="ivf-date"><CalendarDays size={14} /> {dateLabel(row.tanggal)}</span>
                                    </td>
                                    <td>
                                        <strong>{row.faktur.nama_pembiayaan || '-'}</strong>
                                        <small>ID Pembiayaan: {row.faktur.id_pembiayaan || '-'}</small>
                                    </td>
                                    <td className="right ivf-mono ivf-money">{money(row.jumlah)}</td>
                                    <td>{row.created_by_name || '-'}</td>
                                    <td className="ivf-note">
                                        {activeTab === 'history' && <VerifyBadge status={row.status_verifikasi} label={row.status_verifikasi_label} />}
                                        {row.keterangan || '-'}
                                    </td>
                                    <td>
                                        {activeTab === 'menunggu' ? (
                                            <div className="ivf-actions">
                                                <button type="button" className="ivf-icon" title="Lihat invoice" onClick={() => navigate(`/keuangan/invoices/${row.faktur.id}`)}>
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ivf-verify"
                                                    disabled={!canVerify || verifyingId === row.id}
                                                    title={canVerify ? 'Verifikasi pembayaran' : 'Hanya manajer keuangan ke atas'}
                                                    onClick={() => verifyPayment(row)}
                                                >
                                                    <CheckCircle2 size={16} /> {verifyingId === row.id ? 'Memverifikasi...' : 'Verifikasi'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="ivf-verified-info">
                                                <div className="ivf-verifier-meta">
                                                    <strong>{row.verified_by_name || '-'}</strong>
                                                    <small>{dateLabel(row.verified_at)}</small>
                                                </div>
                                                <div className="ivf-actions">
                                                    <button type="button" className="ivf-icon" title="Lihat invoice" onClick={() => navigate(`/keuangan/invoices/${row.faktur.id}`)}>
                                                        <Eye size={16} />
                                                    </button>
                                                    {row.status_verifikasi === 'terverifikasi' && (
                                                        <button
                                                            type="button"
                                                            className="ivf-unverify"
                                                            disabled={!canVerify || unverifyingId === row.id}
                                                            title={canVerify ? 'Batalkan verifikasi pembayaran ini' : 'Hanya manajer keuangan ke atas'}
                                                            onClick={() => unverifyPayment(row)}
                                                        >
                                                            <RotateCcw size={14} /> {unverifyingId === row.id ? 'Membatalkan...' : 'Batal Verifikasi'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="ivf-pagination-wrap">
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        buttonClassName="ivf-page-btn"
                        selectClassName="ivf-page-size"
                    />
                </div>
            </section>
        </div>
    );
}

function SummaryCard({ icon, label, value, accent = false }) {
    const Icon = icon;
    return (
        <div className={`ivf-summary-card${accent ? ' accent' : ''}`}>
            <span><Icon size={20} /></span>
            <div>
                <small>{label}</small>
                <strong>{value}</strong>
            </div>
        </div>
    );
}

function VerifyBadge({ status, label }) {
    return (
        <span className={`ivf-verify-badge ${status || 'unknown'}`}>
            {label || status || '-'}
        </span>
    );
}
