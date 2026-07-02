import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    Banknote,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    FileCheck2,
    FileClock,
    FilterX,
    HandCoins,
    History,
    ReceiptText,
    Search,
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

const TABS = [
    { id: 'menunggu', label: 'Menunggu Verifikasi', icon: FileClock },
    { id: 'aktif', label: 'Utang Aktif', icon: ReceiptText },
    { id: 'histori', label: 'Histori Pembayaran', icon: History },
];

const VIEW_META = {
    menunggu: {
        icon: FileClock,
        title: 'Menunggu Verifikasi',
        desc: 'Faktur pembelian obat dan BHP dari APP_SIAGA yang belum dicatat sebagai utang SIMAK.',
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
        desc: 'Riwayat semua pembayaran utang supplier Obat & BHP.',
        cardTitle: 'Histori Pembayaran Utang',
    },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getRefNo = (item) => item.nomor_spb || `RJ-${item.app_siaga_faktur_id}`;
const parseMoneyInput = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value || '').replace(/[^const getRefNo = (item) => String(item.nomor_spb || item.id)d.,-]/g, '');
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
const errorMessage = (err, fallback) => err?.response?.data?.detail || err?.response?.data?.error || fallback;

const initialFilters = { search: '', vendor_id: '', status: '', dari: '', sampai: '', ordering: '-tanggal_faktur' };
const initialVerifyForm = { tanggal_titip: todayISO(), keterangan_titip: '' };
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

    const canAccess = Boolean(user?.is_superuser || user?.akses_catatan_utang_obat_bhp);

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
        setVerifyForm(initialVerifyForm);
    };

    const confirmVerify = async (event) => {
        event.preventDefault();
        if (!verifyTarget) return;
        setSaving(true);
        try {
            await api.post('/keuangan/catatan-utang/obat-bhp/menunggu-verifikasi/', {
                app_siaga_faktur_id: verifyTarget.app_siaga_faktur_id,
                ...verifyForm,
            });
            toast.success(`Faktur ${verifyTarget.nomor_faktur || verifyTarget.app_siaga_faktur_id} berhasil diverifikasi.`);
            setVerifyTarget(null);
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memverifikasi faktur.'));
        } finally {
            setSaving(false);
        }
    };

    const openPayment = (row) => {
        setPaymentTarget(row);
        setPaymentForm({
            ...initialPaymentForm,
            jumlah_bayar: formatMoneyInput(row.sisa_utang || row.nominal || ''),
            keterangan: `Pembayaran faktur ${row.nomor_faktur || ''}`.trim(),
        });
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
                    <span>Hubungi Direktur/Wakil Direktur untuk mengaktifkan akses Obat & BHP di Manajemen User.</span>
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
                        <h1>Catatan Utang Obat & BHP</h1>
                        <p>Manajemen pembayaran utang supplier obat dan bahan habis pakai</p>
                    </div>
                </div>
            </section>

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

            <SummaryStrip mode={mode} summary={summary} items={items} total={total} />

            <section className="utang-card table">
                <div className="utang-card-head">
                    <div className="utang-card-title">
                        <h2>{meta.cardTitle}</h2>
                        <p>{total} data tercatat sesuai filter.</p>
                    </div>
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
                        <div className="utang-confirm-icon ok"><CheckCircle2 size={22} /></div>
                        <div className="utang-confirm-copy">
                            <h2>Verifikasi Faktur?</h2>
                            <p>Faktur <strong>{verifyTarget.nomor_faktur || '-'}</strong> dari {verifyTarget.vendor_nama || '-'} akan dicatat sebagai utang SIMAK.</p>
                        </div>
                        <div className="utang-send-fields">
                            <label><span className="utang-field-label"><CalendarDays size={15} /> Tanggal Titip</span><DateInput value={verifyForm.tanggal_titip} onChange={(value) => setVerifyForm({ ...verifyForm, tanggal_titip: value })} /></label>
                            <label><span className="utang-field-label">Keterangan</span><textarea className="utang-input" rows={3} value={verifyForm.keterangan_titip} onChange={(e) => setVerifyForm({ ...verifyForm, keterangan_titip: e.target.value })} placeholder="Catatan titip fisik faktur" /></label>
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
                                <p>{paymentTarget.nomor_faktur} - {paymentTarget.vendor_nama}</p>
                            </div>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-pay-summary">
                                <Info label="Nominal" value={money(paymentTarget.nominal)} />
                                <Info label="Sudah Dibayar" value={money(paymentTarget.total_dibayar)} />
                                <Info label="Sisa Utang" value={money(paymentTarget.sisa_utang)} />
                            </div>
                            <div className="utang-form-grid">
                                <label>Tgl Rencana Bayar<DateInput value={paymentForm.tanggal_rencana_bayar} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_rencana_bayar: value })} /></label>
                                <label>Tgl Proses<DateInput value={paymentForm.tanggal_proses} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_proses: value })} /></label>
                                <label>Tgl App<DateInput value={paymentForm.tanggal_app} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_app: value })} /></label>
                                <label>Jumlah Bayar<input className="utang-input utang-input-right" value={paymentForm.jumlah_bayar} onChange={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: e.target.value })} onBlur={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: formatMoneyInput(e.target.value) })} /></label>
                                <label className="span-2">Keterangan<textarea className="utang-input" rows={3} value={paymentForm.keterangan} onChange={(e) => setPaymentForm({ ...paymentForm, keterangan: e.target.value })} /></label>
                            </div>
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

function SummaryStrip({ mode, summary, items, total }) {
    if (mode === 'menunggu') {
        const nominal = summary?.nominal ?? items.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
        return (
            <div className="utang-summary">
                <SummaryCard icon={FileClock} label="Menunggu Verifikasi" value={`${summary?.count ?? total} faktur`} sub="Belum masuk utang SIMAK" />
                <SummaryCard icon={Banknote} label="Nominal Halaman Ini" value={money(nominal)} sub="Dari faktur yang tampil" mono />
                <SummaryCard icon={FileCheck2} label="Sumber Data" value="APP_SIAGA" sub="Readonly rssams" />
            </div>
        );
    }
    return (
        <div className="utang-summary">
            <SummaryCard icon={ReceiptText} label="Faktur Aktif" value={`${summary?.utang_count || 0} faktur`} sub="Sudah diverifikasi" />
            <SummaryCard icon={Banknote} label="Total Nominal" value={money(summary?.total_nominal)} sub="Nilai faktur" mono />
            <SummaryCard icon={CircleDollarSign} label="Total Dibayar" value={money(summary?.total_dibayar)} sub="Semua pembayaran" mono />
            <SummaryCard icon={Clock3} label="Sisa Utang" value={money(summary?.total_sisa)} sub={`${summary?.lunas || 0} lunas`} mono />
        </div>
    );
}

function FilterBar({ mode, filters, setFilters, vendors, onReset }) {
    return (
        <div className="dki-filter utang-filter">
            <div className="dki-filter-row-1">
                <label className="dki-search"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Cari vendor / no faktur / no SPB..." /></label>
                <select className="dki-select" value={filters.vendor_id} onChange={(e) => setFilters({ ...filters, vendor_id: e.target.value })}>
                    <option value="">Semua Vendor</option>
                    {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.nama}</option>)}
                </select>
                {mode === 'aktif' && (
                    <select className="dki-select dki-filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                        {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                )}
                <button className="dki-filter-reset" type="button" onClick={onReset}><FilterX size={15} /> Reset</button>
            </div>
            <div className="dki-filter-row-2">
                <div className="dki-date-range">
                    <label><span>Dari</span><DateInput value={filters.dari} onChange={(value) => setFilters({ ...filters, dari: value })} /></label>
                    <label><span>Sampai</span><DateInput value={filters.sampai} onChange={(value) => setFilters({ ...filters, sampai: value })} /></label>
                </div>
            </div>
        </div>
    );
}

function PendingTable({ items, onVerify, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr><SortTh label="No Ref" field="nomor_spb" onSort={onSort} /><SortTh label="Tgl SPB" field="tanggal_faktur" onSort={onSort} /><SortTh label="Vendor" field="vendor" onSort={onSort} /><SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} /><th>Tgl Faktur</th><th>Jatuh Tempo</th><SortTh label="Grand Total" field="nominal" onSort={onSort} right /><th>Aksi</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.app_siaga_faktur_id}><td className="utang-mono">{getRefNo(item)}</td><td>{dateLabel(item.tanggal_spb)}</td><td className="utang-name-cell"><strong>{item.vendor_nama || '-'}</strong><small>ID {item.vendor_id}</small></td><td className="utang-mono">{item.nomor_faktur || '-'}</td><td>{dateLabel(item.tanggal_faktur)}</td><td>{dateLabel(item.tanggal_jatuh_tempo)}</td><td className="utang-right utang-mono">{money(item.nominal)}</td><td><button className="utang-btn primary mini" onClick={() => onVerify(item)}><CheckCircle2 size={15} /> Verifikasi</button></td></tr>)}</tbody>
        </table>
    );
}

function ActiveTable({ items, onPayment, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr><th>No Ref</th><th>Tgl SPB</th><SortTh label="Vendor" field="vendor" onSort={onSort} /><SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} /><th>Tgl Faktur</th><SortTh label="Jatuh Tempo" field="tanggal_jatuh_tempo" onSort={onSort} /><SortTh label="Nominal" field="nominal" onSort={onSort} right /><th>Total Dibayar</th><th>Sisa Utang</th><SortTh label="Status" field="status" onSort={onSort} /><th>Aksi</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}><td className="utang-mono">{getRefNo(item)}</td><td>{dateLabel(item.tanggal_spb)}</td><td className="utang-name-cell"><strong>{item.vendor_nama || '-'}</strong><small>ID {item.vendor_id}</small></td><td className="utang-mono">{item.nomor_faktur || '-'}</td><td>{dateLabel(item.tanggal_faktur)}</td><td>{dateLabel(item.tanggal_jatuh_tempo)}</td><td className="utang-right utang-mono">{money(item.nominal)}</td><td className="utang-right utang-mono">{money(item.total_dibayar)}</td><td className="utang-right utang-mono">{money(item.sisa_utang)}</td><td><StatusBadge status={item.status} label={item.status_label} /></td><td><button className="utang-btn primary mini" disabled={item.status === 'lunas'} onClick={() => onPayment(item)}><HandCoins size={15} /> Bayar</button></td></tr>)}</tbody>
        </table>
    );
}

function HistoryTable({ items, onSort }) {
    return (
        <table className="utang-table">
            <thead><tr><SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} /><SortTh label="Vendor" field="vendor" onSort={onSort} /><th>Tgl Rencana</th><SortTh label="Tgl Bayar" field="tanggal_proses" onSort={onSort} /><th>Tgl App</th><SortTh label="Jumlah Bayar" field="jumlah_bayar" onSort={onSort} right /><th>Running Total</th><th>Sisa Utang</th><th>Keterangan</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}><td className="utang-mono">{item.nomor_faktur || '-'}</td><td className="utang-name-cell"><strong>{item.vendor_nama || '-'}</strong></td><td>{dateLabel(item.tanggal_rencana_bayar)}</td><td>{dateLabel(item.tanggal_proses)}</td><td>{dateLabel(item.tanggal_app)}</td><td className="utang-right utang-mono">{money(item.jumlah_bayar)}</td><td className="utang-right utang-mono">{money(item.running_total_dibayar)}</td><td className="utang-right utang-mono">{money(item.running_sisa_utang)}</td><td>{item.keterangan || '-'}</td></tr>)}</tbody>
        </table>
    );
}

function SortTh({ label, field, onSort, right = false }) {
    return <th className={right ? 'utang-right' : ''}><button className="utang-sort-btn" type="button" onClick={() => onSort(field)}>{label}</button></th>;
}

function StatusBadge({ status, label }) {
    return <span className={`utang-status ${status || 'unknown'}`}>{label || status || '-'}</span>;
}

function SummaryCard({ icon = ReceiptText, label, value, sub, mono = false }) {
    const Icon = icon;
    return (
        <div className="utang-summary-card">
            <span className="utang-summary-icon"><Icon size={18} /></span>
            <div><small>{label}</small><strong className={mono ? 'utang-mono' : ''}>{value}</strong>{sub && <em>{sub}</em>}</div>
        </div>
    );
}

function Info({ label, value }) {
    return <div className="utang-info-item"><span>{label}</span><strong className="utang-mono">{value}</strong></div>;
}

function DateInput({ value, onChange, disabled = false }) {
    return <DateField value={value} onChange={onChange} disabled={disabled} />;
}
