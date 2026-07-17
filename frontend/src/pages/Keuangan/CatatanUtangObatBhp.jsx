import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    FileClock,
    FilterX,
    HandCoins,
    History,
    ReceiptText,
    Search,
    ShieldCheck,
    Truck,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './CatatanUtangObatBhp.css';

const STATUS_OPTIONS = [
    { value: '', label: 'Semua Status' },
    { value: 'belum_dibayar', label: 'Belum Dibayar' },
    { value: 'sebagian', label: 'Sebagian' },
    { value: 'lunas', label: 'Lunas' },
];

const SUMBER_OPTIONS = [
    { value: 'semua', label: 'Semua Sumber' },
    { value: 'farmasi', label: 'Farmasi' },
    { value: 'logistik', label: 'Logistik' },
];

const SUMBER_LABELS = { farmasi: 'Farmasi', logistik: 'Logistik' };

const TABS = [
    { id: 'menunggu', label: 'Menunggu Verifikasi', icon: FileClock },
    { id: 'aktif', label: 'Utang Aktif', icon: ReceiptText },
    { id: 'histori', label: 'Histori Pembayaran', icon: History },
];

const VIEW_META = {
    menunggu: {
        icon: FileClock,
        title: 'Menunggu Verifikasi',
        desc: 'Faktur pembelian Obat, BHP & Logistik yang belum dicatat sebagai utang SIMAK.',
        cardTitle: 'Faktur Menunggu Verifikasi',
    },
    aktif: {
        icon: ReceiptText,
        title: 'Daftar Utang Aktif',
        desc: 'Faktur yang sudah diverifikasi dan siap diproses pembayaran bertahap.',
        cardTitle: 'Utang Supplier Aktif',
    },
    histori: {
        icon: History,
        title: 'Histori Pembayaran',
        desc: 'Riwayat semua pembayaran utang supplier Obat, BHP & Logistik.',
        cardTitle: 'Histori Pembayaran Utang',
    },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getRefNo = (item) => item.nomor_spb || `RJ-${item.app_siaga_faktur_id}`;
const parseMoneyInput = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value || '').replace(/[^\d.,-]/g, '');
    if (!raw) return 0;
    const negative = raw.startsWith('-');
    const unsigned = raw.replace(/-/g, '');
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    let normalized = unsigned;
    if (lastComma >= 0 && lastDot >= 0) {
        const decimalSep = lastComma > lastDot ? ',' : '.';
        const thousandSep = decimalSep === ',' ? '.' : ',';
        normalized = unsigned.split(thousandSep).join('').replace(decimalSep, '.');
    } else {
        const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
        if (sep) {
            const parts = unsigned.split(sep);
            const fraction = parts[parts.length - 1] || '';
            normalized = fraction.length > 0 && fraction.length <= 2 ? `${parts.slice(0, -1).join('')}.${fraction}` : parts.join('');
        }
    }
    const parsed = Number(`${negative ? '-' : ''}${normalized}`);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const amount = parseMoneyInput(value);
    if (!amount) return '';
    return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
};
const errorMessage = (err, fallback) => err?.response?.data?.detail || err?.response?.data?.error || Object.values(err?.response?.data || {}).flat().join(' ') || fallback;

const initialFilters = { search: '', vendor_id: '', status: '', sumber: 'semua', dari: '', sampai: '', ordering: '-tanggal_faktur' };
const initialVerifyForm = { tanggal_titip: todayISO(), keterangan_titip: '', vendor_id: '' };
const initialPaymentForm = { tanggal_rencana_bayar: todayISO(), tanggal_proses: todayISO(), tanggal_app: '', jumlah_bayar: '', keterangan: '' };

export default function CatatanUtangObatBhp() {
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { user } = useAuth();
    
    const mode = searchParams.get('tab') || 'menunggu';
    const meta = VIEW_META[mode] || VIEW_META.menunggu;
    const Icon = meta.icon;

    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [verifyTarget, setVerifyTarget] = useState(null);
    const [verifyForm, setVerifyForm] = useState(initialVerifyForm);
    const [paymentTarget, setPaymentTarget] = useState(null);
    const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
    const [paymentHistory, setPaymentHistory] = useState([]);

    const canAccess = Boolean(user?.is_superuser || user?.akses_catatan_utang);

    const endpoint = useMemo(() => {
        if (mode === 'menunggu') return '/keuangan/catatan-utang/obat-bhp/menunggu-verifikasi/';
        if (mode === 'histori') return '/keuangan/pembayaran-utang/';
        return '/keuangan/utang-supplier/';
    }, [mode]);

    const fetchVendors = useCallback(async () => {
        try {
            const res = await api.get('/keuangan/catatan-utang/obat-bhp/vendor-options/');
            setVendors(getResults(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat vendor.'));
        }
    }, [toast]);

    const fetchData = useCallback(async () => {
        if (!canAccess) return;
        setLoading(true);
        try {
            const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
            if (mode !== 'aktif') delete activeFilters.status;
            // Kirim sumber ke semua tab (backend handle via query param)
            const res = await api.get(endpoint, { params: pageParams(page, pageSize, activeFilters) });
            setItems(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat catatan utang.'));
        } finally {
            setLoading(false);
        }
    }, [canAccess, endpoint, filters, mode, page, pageSize, toast]);

    const fetchSummary = useCallback(async () => {
        if (!canAccess) return;
        if (mode === 'menunggu') {
            setSummary({ count: total, nominal: items.reduce((sum, item) => sum + Number(item.nominal || 0), 0) });
            return;
        }
        try {
            const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
            const res = await api.get('/keuangan/utang-supplier/summary/', { params });
            setSummary(res.data);
        } catch {
            setSummary(null);
        }
    }, [canAccess, filters, items, mode, total]);

    useEffect(() => { fetchVendors(); }, [fetchVendors]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchSummary(); }, [fetchSummary]);
    useEffect(() => { setPage(1); }, [filters, pageSize, mode]);

    useEffect(() => {
        if (!verifyTarget && !paymentTarget) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [verifyTarget, paymentTarget]);

    const resetFilters = () => setFilters({ ...initialFilters, ordering: '-tanggal_faktur' });
    const setOrdering = (field) => setFilters((prev) => ({
        ...prev,
        ordering: prev.ordering === field ? `-${field}` : prev.ordering === `-${field}` ? '' : field,
    }));

    const openVerify = (row) => {
        setVerifyTarget(row);
        // Pre-fill vendor_id dari vendor_id_hint (auto-match by-nama)
        setVerifyForm({
            ...initialVerifyForm,
            vendor_id: row.vendor_id_hint ? String(row.vendor_id_hint) : '',
        });
    };

    const confirmVerify = async (event) => {
        event.preventDefault();
        if (!verifyTarget) return;
        const sumber = verifyTarget.sumber || 'farmasi';
        // Validasi frontend: logistik WAJIB vendor_id
        if (sumber === 'logistik' && !verifyForm.vendor_id) {
            toast.error('Pilih vendor untuk pembelian logistik sebelum verifikasi.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                app_siaga_faktur_id: verifyTarget.app_siaga_faktur_id,
                sumber,
                tanggal_titip: verifyForm.tanggal_titip,
                keterangan_titip: verifyForm.keterangan_titip,
            };
            if (sumber === 'logistik') payload.vendor_id = verifyForm.vendor_id;
            await api.post('/keuangan/catatan-utang/obat-bhp/menunggu-verifikasi/', payload);
            toast.success(`Faktur ${verifyTarget.nomor_faktur || verifyTarget.app_siaga_faktur_id} berhasil diverifikasi.`);
            setVerifyTarget(null);
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memverifikasi faktur.'));
        } finally {
            setSaving(false);
        }
    };

    const openPayment = async (row) => {
        setPaymentTarget(row);
        setPaymentForm({
            ...initialPaymentForm,
            jumlah_bayar: formatMoneyInput(row.sisa_utang || row.nominal || ''),
            keterangan: `Pembayaran faktur ${row.nomor_faktur || ''}`.trim(),
        });
        try {
            const res = await api.get('/keuangan/pembayaran-utang/', { params: { utang__id: row.id, pagination: 'false', limit: 100 } });
            const hist = Array.isArray(res.data) ? res.data : getResults(res.data) || [];
            setPaymentHistory(hist);
        } catch (err) {
            setPaymentHistory([]);
        }
    };

    const submitPayment = async (event) => {
        event.preventDefault();
        if (!paymentTarget) return;
        const jumlah = parseMoneyInput(paymentForm.jumlah_bayar);
        if (jumlah <= 0) return toast.error('Jumlah pembayaran wajib lebih dari 0.');
        setSaving(true);
        try {
            await api.post(`/keuangan/utang-supplier/${paymentTarget.id}/bayar/`, {
                tanggal_rencana_bayar: paymentForm.tanggal_rencana_bayar || null,
                tanggal_proses: paymentForm.tanggal_proses,
                tanggal_app: paymentForm.tanggal_app || null,
                jumlah_bayar: jumlah,
                keterangan: paymentForm.keterangan,
            });
            toast.success(`Pembayaran ${money(jumlah)} berhasil dicatat.`);
            setPaymentTarget(null);
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan pembayaran.'));
        } finally {
            setSaving(false);
        }
    };

    if (!canAccess) {
        return (
            <div className="utang-page">
                <div className="utang-empty access">
                    <AlertTriangle size={28} />
                    <strong>Akses Catatan Utang belum aktif.</strong>
                    <span>Hubungi Direktur/Wakil Direktur untuk mengaktifkan akses Obat &amp; BHP di Manajemen User.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="utang-page">
            <section className="utang-hero">
                <div className="utang-title">
                    <span><Icon size={24} /></span>
                    <div>
                        <h1>Catatan Utang Obat, BHP &amp; Logistik</h1>
                        <p>Manajemen pembayaran utang supplier obat, bahan habis pakai, dan logistik</p>
                    </div>
                </div>
            </section>

            <section className="utang-card table">
                <div className="utang-card-head">
                    <div className="utang-card-title">
                        <h2>{meta.cardTitle}</h2>
                        <p>{total} data tercatat sesuai filter.</p>
                    </div>
                </div>

                <div className="utang-tabs">
                    {TABS.map((tab) => {
                        const TabIcon = tab.icon;
                        const isActive = mode === tab.id;
                        return (
                            <button
                                key={tab.id}
                                className={`utang-tab ${isActive ? 'active' : ''}`}
                                onClick={() => setSearchParams({ tab: tab.id })}
                            >
                                <TabIcon size={16} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                <FilterBar
                    mode={mode}
                    filters={filters}
                    setFilters={setFilters}
                    vendors={vendors}
                    onReset={resetFilters}
                />

                {loading ? (
                    <div className="utang-empty">Memuat catatan utang...</div>
                ) : items.length === 0 ? (
                    <div className="utang-empty">Belum ada data sesuai filter.</div>
                ) : (
                    <div className="utang-table-wrap">
                        {mode === 'menunggu' && <PendingTable items={items} onVerify={openVerify} onSort={setOrdering} />}
                        {mode === 'aktif' && <ActiveTable items={items} onPayment={openPayment} onSort={setOrdering} />}
                        {mode === 'histori' && <HistoryTable items={items} onSort={setOrdering} />}
                    </div>
                )}

                <SimplePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    className="utang-pagination-wrap"
                    buttonClassName="utang-page-btn"
                    selectClassName="utang-page-size"
                />
            </section>

            {verifyTarget && createPortal(
                <div className="utang-confirm-backdrop" role="presentation" onMouseDown={() => setVerifyTarget(null)}>
                    <form className="utang-confirm-modal" role="dialog" aria-modal="true" onSubmit={confirmVerify} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="utang-confirm-top">
                            <div className="utang-confirm-icon ok"><CheckCircle2 size={28} /></div>
                            <div className="utang-confirm-copy">
                                <h2>Verifikasi Faktur?</h2>
                                <p>Faktur ini akan dicatat sebagai utang supplier di SIMAK.</p>
                            </div>
                        </div>

                        <div className="utang-verify-info">
                            <Info label="Sumber" value={<SumberBadge sumber={verifyTarget.sumber} />} />
                            <Info label="No Faktur" value={verifyTarget.nomor_faktur || '-'} />
                            <Info label="Vendor" value={verifyTarget.vendor_nama || '-'} />
                            <Info label="No Ref" value={getRefNo(verifyTarget)} />
                            <Info label="Jatuh Tempo" value={dateLabel(verifyTarget.tanggal_jatuh_tempo)} />
                        </div>

                        {/* Dropdown vendor WAJIB untuk logistik yang tidak auto-match */}
                        {verifyTarget.sumber === 'logistik' && (
                            <div className="utang-vendor-warning">
                                <Truck size={15} />
                                <div>
                                    <strong>Pembelian Logistik</strong>
                                    {!verifyTarget.vendor_id_hint ? (
                                        <span> — Vendor tidak terdeteksi otomatis. Pilih vendor dari master data di bawah untuk melanjutkan verifikasi.</span>
                                    ) : (
                                        <span> — Vendor terdeteksi otomatis (<em>{verifyTarget.vendor_nama}</em>). Ubah jika tidak sesuai.</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {verifyTarget.sumber === 'logistik' && (
                            <div className="utang-vendor-select-wrap">
                                <label>
                                    <span className="utang-field-label"><ShieldCheck size={15} /> Vendor <span className="utang-required">*</span></span>
                                    <select
                                        className="utang-input utang-select"
                                        value={verifyForm.vendor_id}
                                        onChange={(e) => setVerifyForm({ ...verifyForm, vendor_id: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Pilih Vendor --</option>
                                        {vendors.map((v) => (
                                            <option key={v.id} value={v.id}>{v.nama}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        )}

                        <div className="utang-send-fields">
                            <label><span className="utang-field-label"><CalendarDays size={15} /> Tanggal Titip</span><DateInput value={verifyForm.tanggal_titip} onChange={(value) => setVerifyForm({ ...verifyForm, tanggal_titip: value })} /></label>
                            <label><span className="utang-field-label">Keterangan</span><textarea className="utang-input" rows={2} value={verifyForm.keterangan_titip} onChange={(e) => setVerifyForm({ ...verifyForm, keterangan_titip: e.target.value })} placeholder="Contoh: Faktur fisik diterima oleh bagian keuangan." /></label>
                        </div>
                        <div className="utang-confirm-detail">
                            <span>Nominal</span>
                            <strong>{money(verifyTarget.nominal)}</strong>
                        </div>
                        <div className="utang-confirm-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setVerifyTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving}><CheckCircle2 size={16} /> {saving ? 'Menyimpan...' : 'Konfirmasi'}</button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {paymentTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setPaymentTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={submitPayment} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon"><HandCoins size={20} /></span>
                            <div>
                                <h2>Input Pembayaran Utang</h2>
                                <p>{paymentTarget.nomor_faktur} - {paymentTarget.vendor_nama} <SumberBadge sumber={paymentTarget.sumber} /></p>
                            </div>
                        </div>
                        <div className="utang-modal-body">
                            <section className="utang-payment-section">
                                <SectionTitle>Invoice Summary</SectionTitle>
                                <div className="utang-pay-summary">
                                    <Info label="Nominal" value={money(paymentTarget.nominal)} />
                                    <Info label="Sudah Dibayar" value={money(paymentTarget.total_dibayar)} />
                                    <Info label="Sisa Utang" value={money(paymentTarget.sisa_utang)} />
                                </div>
                            </section>

                            <section className="utang-payment-section">
                                <SectionTitle>Payment Form</SectionTitle>
                                <div className="utang-form-grid">
                                    <label>Tgl Rencana Bayar<DateInput value={paymentForm.tanggal_rencana_bayar} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_rencana_bayar: value })} /></label>
                                    <label>Tgl Proses<DateInput value={paymentForm.tanggal_proses} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_proses: value })} /></label>
                                    <label>Tgl App<DateInput value={paymentForm.tanggal_app} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_app: value })} /></label>
                                    <label className="utang-amount-field">Jumlah Bayar<input className="utang-input utang-input-right" inputMode="decimal" value={paymentForm.jumlah_bayar} onChange={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: e.target.value })} onBlur={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: formatMoneyInput(e.target.value) })} onKeyDown={(e) => e.stopPropagation()} /></label>
                                    <label className="span-2 utang-note-field">Keterangan<textarea className="utang-input" rows={1} value={paymentForm.keterangan} onChange={(e) => setPaymentForm({ ...paymentForm, keterangan: e.target.value })} /></label>
                                </div>
                            </section>

                            <section className="utang-payment-section">
                                <SectionTitle icon={History}>Payment History</SectionTitle>
                                {paymentHistory.length > 0 ? (
                                    <div className="utang-history-wrap">
                                        <table className="utang-history-table">
                                            <thead><tr><th>Tgl</th><th>Jumlah</th><th>Keterangan</th></tr></thead>
                                            <tbody>{paymentHistory.map((item, idx) => <tr key={idx}><td>{dateLabel(item.tanggal_proses)}</td><td className="utang-mono">{money(item.jumlah_bayar)}</td><td>{item.keterangan || '-'}</td></tr>)}</tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="utang-history-empty">Belum ada riwayat pembayaran.</div>
                                )}
                            </section>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setPaymentTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving}><CircleDollarSign size={16} /> {saving ? 'Menyimpan...' : 'Simpan Pembayaran'}</button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}
        </div>
    );
}

function FilterBar({ mode, filters, setFilters, vendors, onReset }) {
    return (
        <div className="dki-filter utang-filter">
            <div className="utang-filter-row">
                <label className="dki-search"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Cari vendor / no faktur / no SPB..." /></label>
                <select className="dki-select" value={filters.vendor_id} onChange={(e) => setFilters({ ...filters, vendor_id: e.target.value })}>
                    <option value="">Semua Vendor</option>
                    {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.nama}</option>)}
                </select>
                <select
                    className="dki-select utang-sumber-filter"
                    value={filters.sumber}
                    onChange={(e) => setFilters({ ...filters, sumber: e.target.value })}
                    title="Filter berdasarkan sumber transaksi"
                >
                    {SUMBER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <select className="dki-select dki-filter-status" value={mode === 'aktif' ? filters.status : ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })} disabled={mode !== 'aktif'} title={mode === 'aktif' ? 'Filter status' : 'Status hanya tersedia di tab Utang Aktif'}>
                    {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <label className="utang-date-filter"><span>Dari</span><DateInput value={filters.dari} onChange={(value) => setFilters({ ...filters, dari: value })} /></label>
                <label className="utang-date-filter"><span>Sampai</span><DateInput value={filters.sampai} onChange={(value) => setFilters({ ...filters, sampai: value })} /></label>
                <button className="dki-filter-reset" type="button" onClick={onReset}><FilterX size={15} /> Reset</button>
            </div>
        </div>
    );
}

function PendingTable({ items, onVerify, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr>
                <th>Sumber</th>
                <SortTh label="No Ref" field="nomor_spb" onSort={onSort} />
                <SortTh label="Tgl SPB" field="tanggal_faktur" onSort={onSort} />
                <SortTh label="Vendor" field="vendor" onSort={onSort} />
                <SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} />
                <th>Tgl Faktur</th>
                <th>Jatuh Tempo</th>
                <SortTh label="Grand Total" field="nominal" onSort={onSort} right />
                <th>Aksi</th>
            </tr></thead>
            <tbody>{items.map((item) => (
                <tr key={`${item.sumber}-${item.app_siaga_faktur_id}`}>
                    <td><SumberBadge sumber={item.sumber} /></td>
                    <td className="utang-mono">{getRefNo(item)}</td>
                    <td>{dateLabel(item.tanggal_spb)}</td>
                    <td className="utang-name-cell">
                        <strong>{item.vendor_nama || '-'}</strong>
                        {item.sumber === 'logistik' && !item.vendor_id_hint && (
                            <span className="utang-no-match-warn" title="Vendor tidak terdeteksi otomatis — wajib dipilih saat verifikasi">
                                <AlertTriangle size={12} /> Pilih vendor
                            </span>
                        )}
                        {item.sumber === 'farmasi' && <small>ID {item.vendor_id}</small>}
                    </td>
                    <td className="utang-mono">{item.nomor_faktur || '-'}</td>
                    <td>{dateLabel(item.tanggal_faktur)}</td>
                    <td>{item.sumber === 'logistik' ? <span className="utang-na">—</span> : dateLabel(item.tanggal_jatuh_tempo)}</td>
                    <td className="utang-right utang-mono">{money(item.nominal)}</td>
                    <td><button className="utang-btn primary mini" onClick={() => onVerify(item)}><CheckCircle2 size={15} /> Verifikasi</button></td>
                </tr>
            ))}</tbody>
        </table>
    );
}

function ActiveTable({ items, onPayment, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr>
                <th>Sumber</th>
                <th>No Ref</th>
                <th>Tgl SPB</th>
                <SortTh label="Vendor" field="vendor" onSort={onSort} />
                <SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} />
                <th>Tgl Faktur</th>
                <SortTh label="Jatuh Tempo" field="tanggal_jatuh_tempo" onSort={onSort} />
                <SortTh label="Nominal" field="nominal" onSort={onSort} right />
                <th>Total Dibayar</th>
                <th>Sisa Utang</th>
                <SortTh label="Status" field="status" onSort={onSort} />
                <th>Aksi</th>
            </tr></thead>
            <tbody>{items.map((item) => (
                <tr key={item.id}>
                    <td><SumberBadge sumber={item.sumber} /></td>
                    <td className="utang-mono">{getRefNo(item)}</td>
                    <td>{dateLabel(item.tanggal_spb)}</td>
                    <td className="utang-name-cell"><strong>{item.vendor_nama || '-'}</strong><small>ID {item.vendor_id}</small></td>
                    <td className="utang-mono">{item.nomor_faktur || '-'}</td>
                    <td>{dateLabel(item.tanggal_faktur)}</td>
                    <td>{item.sumber === 'logistik' ? <span className="utang-na">—</span> : dateLabel(item.tanggal_jatuh_tempo)}</td>
                    <td className="utang-right utang-mono">{money(item.nominal)}</td>
                    <td className="utang-right utang-mono">{money(item.total_dibayar)}</td>
                    <td className="utang-right utang-mono">{money(item.sisa_utang)}</td>
                    <td><StatusBadge status={item.status} label={item.status_label} /></td>
                    <td><button className="utang-btn primary mini" disabled={item.status === 'lunas'} onClick={() => onPayment(item)}><HandCoins size={15} /> Bayar</button></td>
                </tr>
            ))}</tbody>
        </table>
    );
}

function HistoryTable({ items, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr>
                <th>Sumber</th>
                <SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} />
                <SortTh label="Vendor" field="vendor" onSort={onSort} />
                <th>Tgl Rencana</th>
                <SortTh label="Tgl Bayar" field="tanggal_proses" onSort={onSort} />
                <th>Tgl App</th>
                <SortTh label="Jumlah Bayar" field="jumlah_bayar" onSort={onSort} right />
                <th>Running Total</th>
                <th>Sisa Utang</th>
                <th>Keterangan</th>
            </tr></thead>
            <tbody>{items.map((item) => (
                <tr key={item.id}>
                    <td><SumberBadge sumber={item.sumber} /></td>
                    <td className="utang-mono">{item.nomor_faktur || '-'}</td>
                    <td className="utang-name-cell"><strong>{item.vendor_nama || '-'}</strong></td>
                    <td>{dateLabel(item.tanggal_rencana_bayar)}</td>
                    <td>{dateLabel(item.tanggal_proses)}</td>
                    <td>{dateLabel(item.tanggal_app)}</td>
                    <td className="utang-right utang-mono">{money(item.jumlah_bayar)}</td>
                    <td className="utang-right utang-mono">{money(item.running_total_dibayar)}</td>
                    <td className="utang-right utang-mono">{money(item.running_sisa_utang)}</td>
                    <td>{item.keterangan || '-'}</td>
                </tr>
            ))}</tbody>
        </table>
    );
}

function SortTh({ label, field, onSort, right = false }) {
    return <th className={right ? 'utang-right' : ''}><button className="utang-sort-btn" type="button" onClick={() => onSort(field)}>{label}</button></th>;
}

function StatusBadge({ status, label }) {
    return <span className={`utang-status ${status || 'unknown'}`}>{label || status || '-'}</span>;
}

function SumberBadge({ sumber }) {
    if (!sumber) return <span className="utang-sumber-badge unknown">—</span>;
    return (
        <span className={`utang-sumber-badge ${sumber}`}>
            {sumber === 'logistik' ? <Truck size={11} /> : <ShieldCheck size={11} />}
            {SUMBER_LABELS[sumber] || sumber}
        </span>
    );
}

function SectionTitle({ children, icon: Icon }) {
    return <div className="utang-section-title">{Icon && <Icon size={14} />}{children}</div>;
}

function Info({ label, value }) {
    return <div className="utang-info-item"><span>{label}</span><strong className="utang-mono">{value}</strong></div>;
}

function DateInput({ value, onChange, disabled = false }) {
    return <DateField value={value} onChange={onChange} disabled={disabled} />;
}
