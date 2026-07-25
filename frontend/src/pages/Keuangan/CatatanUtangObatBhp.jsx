import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    ClipboardList,
    FileClock,
    FilePlus2,
    FileSpreadsheet,
    FilterX,
    HandCoins,
    History,
    ReceiptText,
    Search,
    ShieldCheck,
    Trash2,
    Truck,
    User,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
import TableSkeleton from '../../components/TableSkeleton';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './CatatanUtangObatBhp.css';

const STATUS_OPTIONS = [
    { value: '', label: 'Semua Status' },
    { value: 'belum_dibayar', label: 'Belum Dibayar' },
    { value: 'diajukan', label: 'Diajukan' },
    { value: 'sebagian', label: 'Sebagian' },
    { value: 'sebagian_diajukan', label: 'Sebagian Diajukan' },
    { value: 'lunas', label: 'Lunas' },
];

const SUMBER_OPTIONS = [
    { value: 'semua', label: 'Semua Sumber' },
    { value: 'farmasi', label: 'Farmasi' },
    { value: 'logistik', label: 'Logistik' },
    { value: 'manual', label: 'Manual' },
];

const VENDOR_CATEGORIES = [
    'OBAT & BHP',
    'ALAT KESEHATAN',
    'PELAYANAN RUJUKAN DAN LABORATORIUM',
    'PENUNJANG PELAYANAN RS',
    'ATK, CETAKAN, RUMAH TANGGA DLL.',
    'IURAN BPJS KESEHATAN DAN BPJS KETENAGAKERJAAN',
    'KAS NEGARA',
    'BIAYA RUTIN GAJI KARYAWAN',
    'BIAYA RUTIN JASA MEDIS',
    'BIAYA RUTIN JASA PELAYANAN DLL',
    'BIAYA RUTIN BULANAN',
    'BIAYA LAIN-LAIN',
];

const SUMBER_LABELS = { farmasi: 'Farmasi', logistik: 'Logistik', manual: 'Manual' };

const TABS = [
    { id: 'aktif', label: 'Utang Aktif', icon: ReceiptText },
    { id: 'pengajuan', label: 'Pengajuan Pembayaran', icon: ClipboardList },
    { id: 'menunggu', label: 'Menunggu Verifikasi', icon: FileClock },
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
        desc: 'Faktur yang sudah diverifikasi dan siap diajukan pembayaran bertahap.',
        cardTitle: 'Utang Supplier Aktif',
    },
    pengajuan: {
        icon: ClipboardList,
        title: 'Pengajuan Pembayaran',
        desc: 'Daftar pengajuan pembayaran utang supplier yang menunggu persetujuan atasan / realisasi.',
        cardTitle: 'Daftar Pengajuan Pembayaran Pending',
    },
    histori: {
        icon: History,
        title: 'Histori Pembayaran',
        desc: 'Riwayat semua realisasi pembayaran utang supplier Obat, BHP & Logistik.',
        cardTitle: 'Histori Pembayaran Utang',
    },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `Rp\u00a0${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getRefNo = (item) => item.nomor_spb || `RJ-${item.app_siaga_faktur_id}`;
const parseMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    
    const str = String(value).trim();
    if (!str) return 0;

    if (/^-?\d+(\.\d+)?$/.test(str)) {
        const num = Number(str);
        return Number.isFinite(num) ? num : 0;
    }

    const cleanStr = str.replace(/^Rp\s*/i, '').trim();
    const negative = cleanStr.startsWith('-');
    const unsigned = cleanStr.replace(/-/g, '');
    const commaIndex = unsigned.lastIndexOf(',');
    if (commaIndex !== -1) {
        const integerPart = unsigned.slice(0, commaIndex).replace(/[^\d]/g, '');
        const decimalPart = unsigned.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, 2);
        const parsed = Number(`${negative ? '-' : ''}${integerPart || '0'}.${decimalPart}`);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const numOnly = unsigned.replace(/[^\d]/g, '');
    const parsed = Number(`${negative ? '-' : ''}${numOnly}`);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value === 0) return '';
        return `Rp ${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
    }
    const str = String(value).trim();
    if (!str) return '';

    if (/^-?\d+(\.\d+)?$/.test(str)) {
        const num = Number(str);
        if (!Number.isFinite(num) || num === 0) return '';
        return `Rp ${num.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
    }

    const raw = str.replace(/[^\d.,]/g, '');
    if (!raw) return '';

    const commaIndex = raw.lastIndexOf(',');
    if (commaIndex !== -1) {
        const integerPart = raw.slice(0, commaIndex).replace(/[^\d]/g, '');
        const decimalPart = raw.slice(commaIndex + 1).replace(/[^\d]/g, '').slice(0, 2);
        const num = Number(integerPart || 0);
        const formattedInteger = num ? num.toLocaleString('id-ID') : '0';
        if (commaIndex === raw.length - 1) {
            return `Rp ${formattedInteger},`;
        }
        return `Rp ${formattedInteger},${decimalPart}`;
    }

    const numOnly = raw.replace(/[^\d]/g, '');
    if (!numOnly) return '';
    const num = Number(numOnly);
    if (num === 0) return '';
    return `Rp ${num.toLocaleString('id-ID')}`;
};
const errorMessage = (err, fallback) => err?.response?.data?.detail || err?.response?.data?.error || Object.values(err?.response?.data || {}).flat().join(' ') || fallback;

const getDefaultOrdering = (m) => {
    if (m === 'menunggu') return '-tanggal_faktur';
    if (m === 'pengajuan') return '-created_at';
    if (m === 'histori') return '-tanggal_proses';
    return '-verified_at';
};

const initialFilters = { search: '', vendor_id: '', status: '', sumber: 'semua', kategori: '', dari: '', sampai: '', ordering: '-verified_at' };
const initialVerifyForm = { tanggal_titip: todayISO(), keterangan_titip: '', vendor_id: '' };
const initialPaymentForm = { tanggal_rencana_bayar: todayISO(), jumlah_bayar: '', keterangan: '' };
const initialManualForm = { vendor_id: '', nomor_faktur: '', nomor_spb: '', tanggal_faktur: todayISO(), tanggal_jatuh_tempo: '', nominal: '', keterangan: '' };

export default function CatatanUtangObatBhp() {
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { user } = useAuth();
    
    const mode = searchParams.get('tab') || 'aktif';
    const meta = VIEW_META[mode] || VIEW_META.aktif;
    const Icon = meta.icon;

    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [summary, setSummary] = useState(null);
    const [pendingSummary, setPendingSummary] = useState({ count: 0, nominal: 0 });
    const [selectedActive, setSelectedActive] = useState([]);
    const [selectedPending, setSelectedPending] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
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
    const [realisasiTarget, setRealisasiTarget] = useState(null);
    const [realisasiForm, setRealisasiForm] = useState({ tanggal_realisasi: todayISO() });
    const [showManual, setShowManual] = useState(false);
    const [manualForm, setManualForm] = useState(initialManualForm);

    const canAccess = Boolean(user?.is_superuser || user?.akses_catatan_utang);

    const endpoint = useMemo(() => {
        if (mode === 'menunggu') return '/keuangan/catatan-utang/obat-bhp/menunggu-verifikasi/';
        if (mode === 'pengajuan') return '/keuangan/pembayaran-utang/';
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
            if (mode === 'pengajuan') {
                activeFilters.status = 'pending';
            } else if (mode === 'histori') {
                activeFilters.status = 'realisasi';
            } else if (mode !== 'aktif') {
                delete activeFilters.status;
            }
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
        try {
            const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
            const res = await api.get('/keuangan/utang-supplier/summary/', { params });
            setSummary(res.data);
        } catch {
            setSummary(null);
        }
    }, [canAccess, filters]);

    const fetchPendingSummary = useCallback(async () => {
        if (!canAccess) return;
        try {
            const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
            delete activeFilters.status;
            const res = await api.get('/keuangan/catatan-utang/obat-bhp/menunggu-verifikasi/', { params: { ...activeFilters, page: 1, page_size: 1 } });
            setPendingSummary({ count: res.data.count || 0, nominal: res.data.total_nominal || 0 });
            setPendingCount(res.data.count || 0);
        } catch {
            setPendingSummary({ count: 0, nominal: 0 });
            setPendingCount(0);
        }
    }, [canAccess, filters]);

    useEffect(() => { fetchVendors(); }, [fetchVendors]);
    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchSummary(); }, [fetchSummary]);
    useEffect(() => { fetchPendingSummary(); }, [fetchPendingSummary]);
    useEffect(() => {
        setPage(1);
        setFilters(prev => ({
            ...prev,
            ordering: getDefaultOrdering(mode)
        }));
    }, [mode]);
    useEffect(() => {
        setSelectedActive([]);
        setSelectedPending([]);
    }, [filters, mode]);

    useEffect(() => {
        if (!verifyTarget && !paymentTarget && !realisasiTarget) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [verifyTarget, paymentTarget, realisasiTarget]);

    const resetFilters = () => setFilters({ ...initialFilters, ordering: getDefaultOrdering(mode) });
    const setOrdering = (field) => setFilters((prev) => ({
        ...prev,
        ordering: prev.ordering === field ? `-${field}` : prev.ordering === `-${field}` ? '' : field,
    }));

    const openVerify = (row) => {
        setVerifyTarget(row);
        setVerifyForm({
            ...initialVerifyForm,
            vendor_id: row.vendor_id_hint ? String(row.vendor_id_hint) : '',
        });
    };

    const confirmVerify = async (event) => {
        event.preventDefault();
        if (!verifyTarget) return;
        const sumber = verifyTarget.sumber || 'farmasi';
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
            keterangan: `Pengajuan pembayaran faktur ${row.nomor_faktur || ''}`.trim(),
        });
        try {
            // Perbaikan bug: gunakan query param `utang` (bukan `utang__id`)
            const res = await api.get('/keuangan/pembayaran-utang/', { params: { utang: row.id, pagination: 'false', limit: 100 } });
            const hist = Array.isArray(res.data) ? res.data : getResults(res.data) || [];
            setPaymentHistory(hist);
        } catch {
            setPaymentHistory([]);
        }
    };

    const submitPayment = async (event) => {
        event.preventDefault();
        if (!paymentTarget) return;
        const jumlah = parseMoneyInput(paymentForm.jumlah_bayar);
        if (jumlah <= 0) return toast.error('Jumlah pengajuan pembayaran wajib lebih dari 0.');
        setSaving(true);
        try {
            await api.post(`/keuangan/utang-supplier/${paymentTarget.id}/bayar/`, {
                tanggal_rencana_bayar: paymentForm.tanggal_rencana_bayar || null,
                jumlah_bayar: jumlah,
                keterangan: paymentForm.keterangan,
            });
            toast.success(`Pengajuan pembayaran ${money(jumlah)} berhasil dibuat.`);
            setPaymentTarget(null);
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengajukan pembayaran.'));
        } finally {
            setSaving(false);
        }
    };

    const openRealisasi = (row) => {
        setRealisasiTarget(row);
        setRealisasiForm({
            tanggal_realisasi: todayISO(),
            jumlah_bayar: formatMoneyInput(row.jumlah_bayar || ''),
        });
    };

    const confirmRealisasi = async (event) => {
        event.preventDefault();
        if (!realisasiTarget) return;
        const jumlah = parseMoneyInput(realisasiForm.jumlah_bayar);
        if (jumlah <= 0) return toast.error('Nominal realisasi pembayaran wajib lebih dari 0.');
        setSaving(true);
        try {
            await api.post(`/keuangan/pembayaran-utang/${realisasiTarget.id}/realisasi/`, {
                tanggal_realisasi: realisasiForm.tanggal_realisasi,
                jumlah_bayar: jumlah,
            });
            toast.success(`Pembayaran ${money(jumlah)} berhasil direalisasikan.`);
            setRealisasiTarget(null);
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal merealisasikan pembayaran.'));
        } finally {
            setSaving(false);
        }
    };

    const cancelPengajuan = async (row) => {
        if (!window.confirm(`Batalkan pengajuan pembayaran ${money(row.jumlah_bayar)} untuk faktur ${row.nomor_faktur || row.utang}?`)) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/pembayaran-utang/${row.id}/`);
            toast.success('Pengajuan pembayaran berhasil dibatalkan.');
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan pengajuan.'));
        } finally {
            setSaving(false);
        }
    };

    const exportExcel = async () => {
        try {
            const res = await api.get('/keuangan/pembayaran-utang/export-excel/', {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Daftar_Pengajuan_Utang_${todayISO()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('File Excel pengajuan pembayaran berhasil diunduh.');
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengunduh Excel pengajuan.'));
        }
    };

    const openManual = () => {
        setManualForm(initialManualForm);
        setShowManual(true);
    };

    const submitManual = async (event) => {
        event.preventDefault();
        const nominal = parseMoneyInput(manualForm.nominal);
        if (nominal <= 0) return toast.error('Nominal wajib lebih dari 0.');
        if (!manualForm.vendor_id) return toast.error('Vendor wajib dipilih.');
        if (!manualForm.nomor_faktur.trim()) return toast.error('Nomor faktur wajib diisi.');
        setSaving(true);
        try {
            await api.post('/keuangan/utang-supplier/create-manual/', {
                vendor_id: manualForm.vendor_id,
                nomor_faktur: manualForm.nomor_faktur.trim(),
                nomor_spb: manualForm.nomor_spb.trim(),
                tanggal_faktur: manualForm.tanggal_faktur || null,
                tanggal_jatuh_tempo: manualForm.tanggal_jatuh_tempo || null,
                nominal,
                keterangan: manualForm.keterangan,
            });
            toast.success('Catatan utang manual berhasil disimpan.');
            setShowManual(false);
            if (mode === 'aktif') await fetchData();
            else setSearchParams({ tab: 'aktif' });
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan utang manual.'));
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

    const pendingValue = selectedPending.length > 0
        ? selectedPending.reduce((sum, item) => sum + Number(item.nominal || 0), 0)
        : (pendingSummary?.nominal || 0);

    const pendingCountValue = pendingSummary?.count || 0;

    const activeValue = selectedActive.length > 0
        ? selectedActive.reduce((sum, item) => sum + Number(item.sisa_utang || item.nominal || 0), 0)
        : (summary?.total_sisa || 0);

    const activeCountValue = summary?.utang_count || 0;

    const isAnySelected = selectedPending.length > 0 || selectedActive.length > 0;

    return (
        <div className="utang-page">
            <section className="utang-hero">
                <div className="utang-title">
                    <span><Icon size={24} /></span>
                    <div>
                        <h1>Catatan Utang Obat, BHP &amp; Logistik</h1>
                        <p>Manajemen pengajuan dan pembayaran utang supplier obat, bahan habis pakai, dan logistik</p>
                    </div>
                </div>
            </section>

            <section className="utang-summary-cards">
                <div className={`utang-summary-card ${selectedPending.length > 0 ? 'selected-mode' : ''}`}>
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Hutang Menunggu Verifikasi</span>
                            <span className="card-value">{money(pendingValue)}</span>
                            <span className="card-subtext">
                                {selectedPending.length > 0 ? `${selectedPending.length} Faktur Terpilih` : `${pendingCountValue} Total Faktur`}
                            </span>
                        </div>
                        <span className="card-icon pending"><FileClock size={24} /></span>
                    </div>
                </div>

                <div className={`utang-summary-card ${selectedActive.length > 0 ? 'selected-mode' : ''}`}>
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Utang Aktif</span>
                            <span className="card-value">{money(activeValue)}</span>
                            <span className="card-subtext">
                                {selectedActive.length > 0 ? `${selectedActive.length} Faktur Terpilih` : `${activeCountValue} Total Faktur`}
                            </span>
                        </div>
                        <span className="card-icon active"><ReceiptText size={24} /></span>
                    </div>
                </div>

                <div className={`utang-summary-card total ${isAnySelected ? 'selected-mode' : ''}`}>
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Total Utang</span>
                            <span className="card-value">{money(pendingValue + activeValue)}</span>
                            <span className="card-subtext">
                                {isAnySelected 
                                    ? `${selectedPending.length + selectedActive.length} Faktur Terpilih` 
                                    : `${pendingCountValue + activeCountValue} Total Faktur`}
                            </span>
                        </div>
                        <span className="card-icon total"><CircleDollarSign size={24} /></span>
                    </div>
                </div>
            </section>

            <section className="utang-card table">
                <div className="utang-card-head">
                    <div className="utang-card-title">
                        <h2>{meta.cardTitle}</h2>
                        <p>{total} data tercatat sesuai filter.</p>
                    </div>
                    <div className="utang-card-actions">
                        {mode === 'pengajuan' && (
                            <button className="utang-btn primary" type="button" onClick={exportExcel}>
                                <FileSpreadsheet size={16} /> Export Excel
                            </button>
                        )}
                        <button className="utang-btn-manual" type="button" onClick={openManual}>
                            <FilePlus2 size={16} /> Catat Utang Manual
                        </button>
                    </div>
                </div>

                <div className="utang-tabs-row">
                    <div className="utang-tabs">
                        {TABS.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActive = mode === tab.id;
                            const isMenunggu = tab.id === 'menunggu';
                            const showBadge = isMenunggu && pendingCount > 0;
                            return (
                                <button
                                    key={tab.id}
                                    className={`utang-tab ${isActive ? 'active' : ''}`}
                                    onClick={() => setSearchParams({ tab: tab.id })}
                                >
                                    <TabIcon size={16} />
                                    <span>{tab.label}</span>
                                    {showBadge && (
                                        <span className="utang-tab-badge" title={`${pendingCount} faktur menunggu verifikasi`}>
                                            {pendingCount > 99 ? '99+' : pendingCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <label className="dki-search utang-tab-search">
                        <Search size={16} />
                        <input
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            placeholder="Cari vendor / no faktur / no SPB..."
                        />
                    </label>
                </div>

                <FilterBar
                    mode={mode}
                    filters={filters}
                    setFilters={setFilters}
                    vendors={vendors}
                    onReset={resetFilters}
                />

                {loading ? (
                    <TableSkeleton text="Memuat catatan utang..." />
                ) : items.length === 0 ? (
                    <div className="utang-empty">Belum ada data sesuai filter.</div>
                ) : (
                    <div className="utang-table-wrap table-fade-in">
                        {mode === 'menunggu' && <PendingTable items={items} selectedItems={selectedPending} onSelectionChange={setSelectedPending} onVerify={openVerify} onSort={setOrdering} />}
                        {mode === 'aktif' && <ActiveTable items={items} selectedItems={selectedActive} onSelectionChange={setSelectedActive} onPayment={openPayment} onSort={setOrdering} />}
                        {mode === 'pengajuan' && <PendingSubmissionTable items={items} onRealisasi={openRealisasi} onCancel={cancelPengajuan} onSort={setOrdering} />}
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
                        <div className="utang-confirm-head">
                            <div className="utang-confirm-head-copy">
                                <span className="utang-confirm-head-icon"><CheckCircle2 size={22} /></span>
                                <div>
                                    <h2>Verifikasi Faktur</h2>
                                    <p>Catat faktur sebagai utang supplier di SIMAK</p>
                                </div>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setVerifyTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>

                        <div className="utang-confirm-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Sumber</span>
                                    <span className="val"><SumberBadge sumber={verifyTarget.sumber} /></span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono">{verifyTarget.nomor_faktur || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{verifyTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Ref / SPB</span>
                                    <span className="val">{getRefNo(verifyTarget)}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Jatuh Tempo</span>
                                    <span className="val">{dateLabel(verifyTarget.tanggal_jatuh_tempo)}</span>
                                </div>
                                <div className="utang-verify-row total">
                                    <span className="lbl">Nominal Faktur</span>
                                    <span className="val price">{money(verifyTarget.nominal)}</span>
                                </div>
                            </div>

                            {verifyTarget.sumber === 'logistik' && (
                                <div className="utang-vendor-warning">
                                    <Truck size={16} />
                                    <div>
                                        <strong>Pembelian Logistik</strong>
                                        <span> — {!verifyTarget.vendor_id_hint ? 'Vendor belum terhubung ke Master Data. Pilih vendor di bawah.' : `Vendor terdeteksi (${verifyTarget.vendor_nama}). Ubah jika perlu.`}</span>
                                    </div>
                                </div>
                            )}

                            {verifyTarget.sumber === 'logistik' && (
                                <div className="utang-field-block">
                                    <label className="utang-field-lbl"><ShieldCheck size={15} /> Vendor Master <span className="utang-req">*</span></label>
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
                                </div>
                            )}

                            <div className="utang-field-block">
                                <label className="utang-field-lbl"><CalendarDays size={15} /> Tanggal Titip</label>
                                <DateInput value={verifyForm.tanggal_titip} onChange={(value) => setVerifyForm({ ...verifyForm, tanggal_titip: value })} />
                            </div>

                            <div className="utang-field-block">
                                <label className="utang-field-lbl">Keterangan Catatan Utang</label>
                                <textarea
                                    className="utang-input"
                                    rows={2}
                                    value={verifyForm.keterangan_titip}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, keterangan_titip: e.target.value })}
                                    placeholder="Contoh: Faktur fisik diterima oleh bagian keuangan."
                                />
                            </div>
                        </div>

                        <div className="utang-confirm-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setVerifyTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving}>
                                <CheckCircle2 size={16} /> {saving ? 'Menyimpan...' : 'Konfirmasi Verifikasi'}
                            </button>
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
                                <h2>Ajukan Pembayaran Utang</h2>
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
                                <SectionTitle>Form Pengajuan Pembayaran</SectionTitle>
                                <div className="utang-form-grid">
                                    <label>Tgl Rencana Bayar<DateInput value={paymentForm.tanggal_rencana_bayar} onChange={(value) => setPaymentForm({ ...paymentForm, tanggal_rencana_bayar: value })} /></label>
                                    <label className="utang-amount-field">Jumlah Bayar (Nominal)<input className="utang-input utang-input-right" inputMode="decimal" value={paymentForm.jumlah_bayar} onChange={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: formatMoneyInput(e.target.value) })} onBlur={(e) => setPaymentForm({ ...paymentForm, jumlah_bayar: formatMoneyInput(e.target.value) })} onKeyDown={(e) => e.stopPropagation()} /></label>
                                    <label className="span-2 utang-note-field">Keterangan<textarea className="utang-input" rows={2} value={paymentForm.keterangan} onChange={(e) => setPaymentForm({ ...paymentForm, keterangan: e.target.value })} placeholder="Catatan pengajuan pembayaran..." /></label>
                                </div>
                            </section>

                            <section className="utang-payment-section">
                                <SectionTitle icon={History}>Payment History (Realisasi)</SectionTitle>
                                {paymentHistory.length > 0 ? (
                                    <div className="utang-history-wrap">
                                        <table className="utang-history-table">
                                            <thead><tr><th>Tgl Realisasi</th><th>Jumlah</th><th>Status</th><th>Keterangan</th></tr></thead>
                                            <tbody>{paymentHistory.map((item, idx) => <tr key={idx}><td>{dateLabel(item.tanggal_proses)}</td><td className="utang-mono">{money(item.jumlah_bayar)}</td><td><StatusBadge status={item.status} label={item.status_label} /></td><td>{item.keterangan || '-'}</td></tr>)}</tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="utang-history-empty">Belum ada riwayat pembayaran.</div>
                                )}
                            </section>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setPaymentTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving}><CircleDollarSign size={16} /> {saving ? 'Menyimpan...' : 'Ajukan Pembayaran'}</button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {realisasiTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setRealisasiTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={confirmRealisasi} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}><CheckCircle2 size={20} /></span>
                            <div>
                                <h2>Realisasi Pembayaran Utang</h2>
                                <p>Konfirmasi bahwa pengajuan pembayaran ini telah disetujui &amp; dibayarkan.</p>
                            </div>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{realisasiTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono">{realisasiTarget.nomor_faktur || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Tgl Rencana Bayar</span>
                                    <span className="val">{dateLabel(realisasiTarget.tanggal_rencana_bayar)}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Pengaju (Operator)</span>
                                    <span className="val">{realisasiTarget.created_by_name || '-'}</span>
                                </div>
                                <div className="utang-verify-row total">
                                    <span className="lbl">Nominal Diajukan</span>
                                    <span className="val price" style={{ color: '#2563eb' }}>{money(realisasiTarget.jumlah_bayar)}</span>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="utang-field-block">
                                    <label className="utang-field-lbl"><CalendarDays size={15} /> Tanggal Realisasi <span className="utang-req">*</span></label>
                                    <DateInput value={realisasiForm.tanggal_realisasi} onChange={(val) => setRealisasiForm({ ...realisasiForm, tanggal_realisasi: val })} />
                                </div>

                                <div className="utang-field-block">
                                    <label className="utang-field-lbl"><CircleDollarSign size={15} /> Nominal Realisasi <span className="utang-req">*</span></label>
                                    <input
                                        className="utang-input utang-input-right"
                                        inputMode="decimal"
                                        value={realisasiForm.jumlah_bayar}
                                        onChange={(e) => setRealisasiForm({ ...realisasiForm, jumlah_bayar: formatMoneyInput(e.target.value) })}
                                        onBlur={(e) => setRealisasiForm({ ...realisasiForm, jumlah_bayar: formatMoneyInput(e.target.value) })}
                                        onKeyDown={(e) => e.stopPropagation()}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setRealisasiTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                <CheckCircle2 size={16} /> {saving ? 'Menyimpan...' : 'Simpan Pembayaran'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {showManual && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setShowManual(false)}>
                    <form className="utang-modal manual" role="dialog" aria-modal="true" onSubmit={submitManual} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon"><FilePlus2 size={20} /></span>
                            <div>
                                <h2>Catat Utang Manual</h2>
                                <p>Buat catatan utang baru langsung tanpa melalui verifikasi faktur legacy.</p>
                            </div>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-manual-grid">
                                <label>
                                    Vendor / Rekanan
                                    <select
                                        className="utang-input"
                                        required
                                        value={manualForm.vendor_id}
                                        onChange={(e) => setManualForm({ ...manualForm, vendor_id: e.target.value })}
                                    >
                                        <option value="">-- Pilih Vendor --</option>
                                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.nama}</option>)}
                                    </select>
                                </label>
                                <label>
                                    Nomor Faktur
                                    <input
                                        className="utang-input"
                                        required
                                        placeholder="Contoh: INV/2025/001"
                                        value={manualForm.nomor_faktur}
                                        onChange={(e) => setManualForm({ ...manualForm, nomor_faktur: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Nomor SPB / PO
                                    <input
                                        className="utang-input"
                                        placeholder="Opsional"
                                        value={manualForm.nomor_spb}
                                        onChange={(e) => setManualForm({ ...manualForm, nomor_spb: e.target.value })}
                                    />
                                </label>
                                <label>
                                    Nominal Utang
                                    <input
                                        className="utang-input utang-input-right"
                                        required
                                        placeholder="Rp 0"
                                        value={formatMoneyInput(manualForm.nominal)}
                                        onChange={(e) => setManualForm({ ...manualForm, nominal: formatMoneyInput(e.target.value) })}
                                    />
                                </label>
                                <label>Tanggal Faktur<DateInput value={manualForm.tanggal_faktur} onChange={(v) => setManualForm({ ...manualForm, tanggal_faktur: v })} /></label>
                                <label>Tanggal Jatuh Tempo<DateInput value={manualForm.tanggal_jatuh_tempo} onChange={(v) => setManualForm({ ...manualForm, tanggal_jatuh_tempo: v })} /></label>
                                <label className="utang-span-full">
                                    Keterangan
                                    <textarea
                                        className="utang-input"
                                        rows={2}
                                        placeholder="Catatan tambahan (opsional)"
                                        value={manualForm.keterangan}
                                        onChange={(e) => setManualForm({ ...manualForm, keterangan: e.target.value })}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button type="button" className="utang-btn secondary" onClick={() => setShowManual(false)} disabled={saving}>Batal</button>
                            <button type="submit" className="utang-btn primary" disabled={saving}>
                                {saving ? 'Menyimpan...' : <><FilePlus2 size={15} /> Simpan Utang</>}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}
        </div>
    );
}

function FilterBar({ mode, filters, setFilters, vendors, onReset }) {
    const vendorOptions = useMemo(() => [
        { value: '', label: 'Semua Vendor' },
        ...vendors.map((v) => ({ value: String(v.id), label: v.nama })),
    ], [vendors]);

    return (
        <div className="dki-filter utang-filter">
            <div className="utang-filter-row">
                <SearchablePembiayaanSelect
                    options={vendorOptions}
                    value={filters.vendor_id}
                    onChange={(val) => setFilters({ ...filters, vendor_id: val })}
                    placeholder="Semua Vendor"
                    className="utang-vendor-select"
                />
                <select
                    className="dki-select utang-kategori-filter"
                    value={filters.kategori || ''}
                    onChange={(e) => setFilters({ ...filters, kategori: e.target.value })}
                    title="Filter berdasarkan kategori vendor"
                >
                    <option value="">Semua Kategori</option>
                    {VENDOR_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
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
                <DateRangePicker
                    dari={filters.dari}
                    sampai={filters.sampai}
                    onChange={({ dari, sampai }) => setFilters({ ...filters, dari, sampai })}
                    placeholder="Pilih Periode Tanggal"
                />
                <button className="dki-filter-reset" type="button" onClick={onReset}><FilterX size={15} /> Reset</button>
            </div>
        </div>
    );
}

function PendingTable({ items, selectedItems, onSelectionChange, onVerify, onSort }) {
    const isAllSelected = items.length > 0 && items.every(item => 
        selectedItems.some(s => s.app_siaga_faktur_id === item.app_siaga_faktur_id && s.sumber === item.sumber)
    );

    const handleSelectAll = () => {
        if (isAllSelected) {
            onSelectionChange(selectedItems.filter(s => 
                !items.some(item => item.app_siaga_faktur_id === s.app_siaga_faktur_id && item.sumber === s.sumber)
            ));
        } else {
            const toAdd = items.filter(item => 
                !selectedItems.some(s => s.app_siaga_faktur_id === item.app_siaga_faktur_id && s.sumber === item.sumber)
            );
            onSelectionChange([...selectedItems, ...toAdd]);
        }
    };

    const handleSelectRow = (item) => {
        const exists = selectedItems.some(s => s.app_siaga_faktur_id === item.app_siaga_faktur_id && s.sumber === item.sumber);
        if (exists) {
            onSelectionChange(selectedItems.filter(s => !(s.app_siaga_faktur_id === item.app_siaga_faktur_id && s.sumber === item.sumber)));
        } else {
            onSelectionChange([...selectedItems, item]);
        }
    };

    return (
        <table className="utang-table">
            <thead>
                <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                        <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} />
                    </th>
                    <th>Sumber</th>
                    <SortTh label="Vendor & SPB" field="vendor" onSort={onSort} />
                    <SortTh label="No Faktur" field="nomor_faktur" onSort={onSort} />
                    <th>Jatuh Tempo</th>
                    <SortTh label="Grand Total" field="nominal" onSort={onSort} right />
                    <th className="utang-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => {
                    const isChecked = selectedItems.some(s => s.app_siaga_faktur_id === item.app_siaga_faktur_id && s.sumber === item.sumber);
                    return (
                        <tr key={`${item.sumber}-${item.app_siaga_faktur_id}`} className={isChecked ? 'row-selected' : ''}>
                            <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={isChecked} onChange={() => handleSelectRow(item)} />
                            </td>
                            <td><SumberBadge sumber={item.sumber} /></td>
                            <td className="utang-name-cell">
                                <strong>{item.vendor_nama || '-'}</strong>
                                {item.sumber === 'logistik' && !item.vendor_id_hint && (
                                    <span className="utang-no-match-warn" title="Vendor tidak terdeteksi otomatis — wajib dipilih saat verifikasi">
                                        <AlertTriangle size={12} /> Pilih vendor
                                    </span>
                                )}
                                <small className="utang-subtext">SPB: {getRefNo(item)} {item.sumber === 'farmasi' ? `• ID ${item.vendor_id}` : ''}</small>
                            </td>
                            <td>
                                <strong className="utang-mono">{item.nomor_faktur || '-'}</strong>
                                <small className="utang-subtext">Tgl SPB: {dateLabel(item.tanggal_spb)}</small>
                            </td>
                            <td>{item.sumber === 'logistik' ? <span className="utang-na">—</span> : dateLabel(item.tanggal_jatuh_tempo)}</td>
                            <td className="utang-right utang-mono bold">{money(item.nominal)}</td>
                            <td className="utang-right">
                                <button className="utang-btn primary mini" onClick={() => onVerify(item)}>
                                    <CheckCircle2 size={15} /> Verifikasi
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function ActiveTable({ items, selectedItems, onSelectionChange, onPayment, onSort }) {
    const selectableItems = items.filter(item => item.status !== 'lunas');
    const isAllSelected = selectableItems.length > 0 && selectableItems.every(item => 
        selectedItems.some(s => s.id === item.id)
    );

    const handleSelectAll = () => {
        if (isAllSelected) {
            onSelectionChange(selectedItems.filter(s => 
                !selectableItems.some(item => item.id === s.id)
            ));
        } else {
            const toAdd = selectableItems.filter(item => 
                !selectedItems.some(s => s.id === item.id)
            );
            onSelectionChange([...selectedItems, ...toAdd]);
        }
    };

    const handleSelectRow = (item) => {
        const exists = selectedItems.some(s => s.id === item.id);
        if (exists) {
            onSelectionChange(selectedItems.filter(s => s.id !== item.id));
        } else {
            onSelectionChange([...selectedItems, item]);
        }
    };

    return (
        <table className="utang-table">
            <thead>
                <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                        <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} />
                    </th>
                    <th>Sumber</th>
                    <SortTh label="Vendor & SPB" field="vendor" onSort={onSort} />
                    <SortTh label="No Faktur & Tanggal" field="nomor_faktur" onSort={onSort} />
                    <SortTh label="Sisa Utang" field="nominal" onSort={onSort} right />
                    <SortTh label="Status" field="status" onSort={onSort} />
                    <SortTh label="Verifikator" field="verified_at" onSort={onSort} />
                    <th className="utang-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => {
                    const isChecked = selectedItems.some(s => s.id === item.id);
                    const isLunas = item.status === 'lunas';
                    return (
                        <tr key={item.id} className={isChecked ? 'row-selected' : ''}>
                            <td style={{ textAlign: 'center' }}>
                                {!isLunas && (
                                    <input type="checkbox" checked={isChecked} onChange={() => handleSelectRow(item)} />
                                )}
                            </td>
                            <td><SumberBadge sumber={item.sumber} /></td>
                            <td className="utang-name-cell">
                                <strong>{item.vendor_nama || '-'}</strong>
                                <small className="utang-subtext">SPB: {getRefNo(item)} • ID: {item.vendor_id}</small>
                            </td>
                            <td>
                                <strong className="utang-mono">{item.nomor_faktur || '-'}</strong>
                                <small className="utang-subtext">Tgl: {dateLabel(item.tanggal_faktur)}</small>
                                {item.tanggal_jatuh_tempo && (
                                    <small className="utang-subtext">Tempo: {dateLabel(item.tanggal_jatuh_tempo)}</small>
                                )}
                            </td>
                            <td className="utang-right">
                                <strong className="utang-mono utang-sisa-main">{money(item.sisa_utang)}</strong>
                                <small className="utang-subtext utang-mono">Total: {money(item.nominal)}</small>
                                <small className="utang-subtext utang-mono">Dibayar: {money(item.total_dibayar)}</small>
                            </td>
                            <td><StatusBadge status={item.status} label={item.status_label} /></td>
                            <td className="utang-operator-cell">
                                {item.verified_by_name ? (
                                    <span className="utang-operator-badge" title={`Diverifikasi oleh ${item.verified_by_name}`}>
                                        <User size={13} style={{ opacity: 0.7 }} />
                                        {item.verified_by_name}
                                    </span>
                                ) : '-'}
                            </td>
                            <td className="utang-right">
                                <button className="utang-btn primary mini" disabled={item.status === 'lunas'} onClick={() => onPayment(item)}>
                                    <HandCoins size={15} /> {item.status === 'lunas' ? 'Lunas' : 'Ajukan Pembayaran'}
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function PendingSubmissionTable({ items, onRealisasi, onCancel, onSort }) {
    return (
        <table className="utang-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
                <col style={{ width: '23%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
                <tr>
                    <SortTh label="Vendor & SPB" field="vendor" onSort={onSort} align="left" />
                    <SortTh label="No Faktur & Tgl Rencana" field="nomor_faktur" onSort={onSort} align="left" />
                    <SortTh label="Nominal Pengajuan" field="jumlah_bayar" onSort={onSort} align="right" />
                    <th style={{ textAlign: 'left' }}>Keterangan</th>
                    <th style={{ textAlign: 'center' }}>Pengaju (Operator)</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => (
                    <tr key={item.id}>
                        <td className="utang-name-cell" style={{ wordBreak: 'break-word', overflow: 'hidden' }}>
                            <strong>{item.vendor_nama || '-'}</strong>
                            <small className="utang-subtext">
                                {item.nomor_spb ? `SPB: ${item.nomor_spb}` : item.app_siaga_faktur_id ? `SPB: RJ-${item.app_siaga_faktur_id}` : ''}
                            </small>
                        </td>
                        <td style={{ wordBreak: 'break-word', overflow: 'hidden' }}>
                            <strong className="utang-mono">{item.nomor_faktur || '-'}</strong>
                            <small className="utang-subtext">Rencana Bayar: {dateLabel(item.tanggal_rencana_bayar)}</small>
                        </td>
                        <td className="utang-mono utang-nominal-pending utang-right" style={{ textAlign: 'right' }}>{money(item.jumlah_bayar)}</td>
                        <td style={{ wordBreak: 'break-word', overflow: 'hidden' }}>
                            <div className="utang-keterangan-text-truncate" title={item.keterangan || '-'}>
                                {item.keterangan || '-'}
                            </div>
                        </td>
                        <td className="utang-operator-cell" style={{ textAlign: 'center' }}>
                            <span className="utang-operator-badge" title={`Diajukan oleh ${item.created_by_name || '-'}`}>
                                <User size={13} style={{ opacity: 0.7 }} />
                                {item.created_by_name || '-'}
                            </span>
                        </td>
                        <td className="utang-right" style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center', width: '100%' }}>
                                <button className="utang-btn primary mini" onClick={() => onRealisasi(item)} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '6px 8px' }} title="Verifikasi Pembayaran">
                                    <CheckCircle2 size={16} />
                                </button>
                                <button className="utang-btn soft mini danger" onClick={() => onCancel(item)} title="Hapus Pengajuan" style={{ color: '#ef4444', borderColor: '#fca5a5', padding: '6px 8px' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function HistoryTable({ items, onSort }) {
    return (
        <table className="utang-table">
            <thead>
                <tr>
                    <th>Sumber</th>
                    <SortTh label="Vendor & Faktur" field="vendor" onSort={onSort} />
                    <SortTh label="Tgl Bayar" field="tanggal_proses" onSort={onSort} />
                    <SortTh label="Jumlah Bayar" field="jumlah_bayar" onSort={onSort} right />
                    <th className="utang-right">Sisa Utang</th>
                    <th>Keterangan</th>
                    <th>Operator</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => (
                    <tr key={item.id}>
                        <td><SumberBadge sumber={item.sumber} /></td>
                        <td className="utang-name-cell">
                            <strong>{item.vendor_nama || '-'}</strong>
                            <small className="utang-subtext">No Faktur: {item.nomor_faktur || '-'}</small>
                        </td>
                        <td>
                            <strong>{dateLabel(item.tanggal_proses)}</strong>
                            {item.tanggal_rencana_bayar && <small className="utang-subtext">Rencana: {dateLabel(item.tanggal_rencana_bayar)}</small>}
                        </td>
                        <td className={`utang-right utang-mono ${item.status === 'realisasi_lunas' ? 'utang-nominal-realisasi' : 'utang-nominal-sebagian'}`}>{money(item.jumlah_bayar)}</td>
                        <td className="utang-right utang-mono">{money(item.running_sisa_utang)}</td>
                        <td>{item.keterangan || '-'}</td>
                        <td className="utang-operator-cell">
                            <span className="utang-operator-badge" title={`Dicatat oleh ${item.created_by_name || '-'}`}>
                                <User size={13} style={{ opacity: 0.7 }} />
                                {item.created_by_name || '-'}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function SortTh({ label, field, onSort, right = false, align = 'left' }) {
    const finalAlign = right ? 'right' : align;
    let thClass = '';
    let btnStyle = { width: '100%' };
    if (finalAlign === 'right') {
        thClass = 'utang-right';
        btnStyle = { justifyContent: 'flex-end', textAlign: 'right' };
    } else if (finalAlign === 'center') {
        thClass = 'utang-center';
        btnStyle = { justifyContent: 'center', textAlign: 'center' };
    } else {
        thClass = 'utang-left';
        btnStyle = { justifyContent: 'flex-start', textAlign: 'left' };
    }
    return (
        <th className={thClass} style={{ textAlign: finalAlign }}>
            <button className="utang-sort-btn" type="button" onClick={() => onSort(field)} style={btnStyle}>
                {label}
            </button>
        </th>
    );
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
