import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    CheckCheck,
    CircleDollarSign,
    ClipboardList,
    Eye,
    FileClock,
    FilePlus2,
    FileSpreadsheet,
    FilterX,
    HandCoins,
    History,
    Layers,
    ReceiptText,
    RotateCcw,
    Search,
    ShieldCheck,
    Sparkles,
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
import DebouncedSearchInput from '../../components/DebouncedSearchInput';
import TableSkeleton from '../../components/TableSkeleton';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './CatatanUtangObatBhp.css';

const STATUS_OPTIONS = [
    { value: '', label: 'Semua Status (Termasuk Lunas)' },
    { value: 'aktif', label: 'Utang Aktif (Belum Lunas Saja)' },
    { value: 'belum_dibayar', label: 'Belum Dibayar' },
    { value: 'diajukan', label: 'Diajukan Pembayaran' },
    { value: 'sebagian', label: 'Bayar Sebagian' },
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
    'OBAT DAN BHP',
    'ALAT KESEHATAN',
    'PELAYANAN RUJUKAN DAN LABORATORIUM',
    'PENUNJANG PELAYANAN RS',
    'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
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
    { id: 'semua', label: 'Semua', icon: Layers },
    { id: 'menunggu', label: 'Menunggu Verifikasi', icon: FileClock },
    { id: 'aktif', label: 'Hutang Aktif', icon: ReceiptText },
    { id: 'pengajuan', label: 'Pengajuan Pembayaran', icon: ClipboardList },
    // { id: 'deposit', label: 'Deposit Vendor', icon: Sparkles },
    { id: 'histori', label: 'Riwayat Pembayaran', icon: History },
];

const VIEW_META = {
    semua: {
        icon: Layers,
        title: 'Semua Catatan Utang',
        desc: 'Seluruh riwayat faktur utang supplier Obat, BHP & Logistik (lunas maupun belum lunas).',
        cardTitle: 'Semua Utang Supplier Tercatat',
    },
    menunggu: {
        icon: FileClock,
        title: 'Menunggu Verifikasi',
        desc: 'Faktur pembelian Obat, BHP & Logistik yang belum dicatat sebagai utang SIMAK.',
        cardTitle: 'Faktur Menunggu Verifikasi',
    },
    aktif: {
        icon: ReceiptText,
        title: 'Daftar Hutang Aktif',
        desc: 'Faktur yang belum lunas (belum dibayar dan bayar sebagian) siap diajukan pembayaran.',
        cardTitle: 'Hutang Supplier Aktif (Belum Lunas)',
    },
    pengajuan: {
        icon: ClipboardList,
        title: 'Pengajuan Pembayaran',
        desc: 'Daftar pengajuan pembayaran utang supplier yang menunggu persetujuan atasan / realisasi.',
        cardTitle: 'Daftar Pengajuan Pembayaran Pending',
    },
    deposit: {
        icon: Sparkles,
        title: 'Deposit / Saldo Retur Vendor',
        desc: 'Daftar sisa saldo kredit deposit dari retur barang masing-masing vendor supplier.',
        cardTitle: 'Rekap Saldo Deposit Vendor Retur Pembelian',
    },
    histori: {
        icon: History,
        title: 'Riwayat Pembayaran',
        desc: 'Riwayat semua realisasi pembayaran utang supplier Obat, BHP & Logistik.',
        cardTitle: 'Riwayat Pembayaran Utang',
    },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `Rp\u00a0${Math.round(Number(value || 0)).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getRefNo = (item) => item.nomor_spb || item.app_siaga_faktur_id || '-';
const calcUmurUtang = (tanggal_titip) => {
    if (!tanggal_titip) return '-';
    const tglTitip = new Date(tanggal_titip);
    if (isNaN(tglTitip.getTime())) return '-';
    const now = new Date();
    const tgl1 = new Date(tglTitip.getFullYear(), tglTitip.getMonth(), tglTitip.getDate());
    const tgl2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((tgl2.getTime() - tgl1.getTime()) / (1000 * 60 * 60 * 24));
    const days = diffDays < 0 ? 0 : diffDays;
    return `${days} Hari`;
};
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
        return `Rp ${Math.round(value).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
    }
    const str = String(value).trim();
    if (!str) return '';

    if (/^-?\d+(\.\d+)?$/.test(str)) {
        const num = Number(str);
        if (!Number.isFinite(num) || num === 0) return '';
        return `Rp ${Math.round(num).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
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
    if (m === 'menunggu') return '-tanggal_spb';
    if (m === 'pengajuan') return '-created_at';
    if (m === 'histori') return '-tanggal_proses';
    if (m === 'deposit') return '-created_at';
    return 'tanggal_titip';
};

const initialFilters = { search: '', vendor_id: '', status: '', sumber: 'semua', kategori: '', dari: '', sampai: '', ordering: '-verified_at' };
const initialVerifyForm = { tanggal_titip: todayISO(), keterangan_titip: '', vendor_id: '' };
const initialPaymentForm = { tanggal_rencana_bayar: todayISO(), jumlah_bayar: '', keterangan: '' };
const initialManualForm = { vendor_id: '', nomor_faktur: '', nomor_spb: '', tanggal_faktur: todayISO(), tanggal_jatuh_tempo: '', tanggal_titip: todayISO(), nominal: '', keterangan: '' };

export default function CatatanUtangObatBhp() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { user } = useAuth();
    
    const mode = searchParams.get('tab') || 'semua';
    const meta = VIEW_META[mode] || VIEW_META.semua;
    const Icon = meta.icon;

    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const masterVendorOptions = useMemo(() => [
        { value: '', label: '-- Pilih Vendor Master --' },
        ...vendors.map((v) => ({ value: String(v.id), label: v.nama })),
    ], [vendors]);
    const [summary, setSummary] = useState(null);
    const [pendingSummary, setPendingSummary] = useState({ count: 0, nominal: 0 });
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState(() => ({
        ...initialFilters,
        ordering: getDefaultOrdering(mode)
    }));
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [verifyTarget, setVerifyTarget] = useState(null);
    const [verifyForm, setVerifyForm] = useState(initialVerifyForm);
    const [paymentTarget, setPaymentTarget] = useState(null);
    const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
    const [vendorDepositInfo, setVendorDepositInfo] = useState(null);
    const [returTarget, setReturTarget] = useState(null);
    const [returForm, setReturForm] = useState({ nominal_retur: '', keterangan: '' });
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [realisasiTarget, setRealisasiTarget] = useState(null);
    const [realisasiForm, setRealisasiForm] = useState({ tanggal_realisasi: todayISO() });
    const [detailTarget, setDetailTarget] = useState(null);
    const [detailHistory, setDetailHistory] = useState([]);
    const [showManual, setShowManual] = useState(false);
    const [manualForm, setManualForm] = useState(initialManualForm);
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [depositData, setDepositData] = useState({ summary: { total_vendor: 0, total_retur: 0, total_terpakai: 0, total_sisa_deposit: 0 }, vendors: [] });
    const [selectedDepositVendor, setSelectedDepositVendor] = useState(null);

    const resetFilters = useCallback(() => {
        setFilters({
            ...initialFilters,
            ordering: getDefaultOrdering(mode)
        });
        setPage(1);
    }, [mode]);

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
            if (mode === 'deposit') {
                const res = await api.get('/keuangan/utang-supplier/list-deposit-vendor/', { params: activeFilters });
                setDepositData(res.data);
                setItems(res.data.vendors || []);
                setTotal((res.data.vendors || []).length);
            } else {
                if (mode === 'pengajuan') {
                    activeFilters.status = 'pending';
                } else if (mode === 'histori') {
                    activeFilters.status = 'realisasi';
                } else if (mode === 'aktif') {
                    // Khusus utang aktif (hanya yang belum lunas: belum dibayar, sebagian, diajukan, sebagian_diajukan)
                    activeFilters.status = activeFilters.status || 'aktif';
                } else if (mode === 'semua') {
                    // Semua riwayat data utang (lunas maupun belum lunas)
                    if (!activeFilters.status) {
                        activeFilters.status = 'semua';
                    }
                } else {
                    delete activeFilters.status;
                }
                const res = await api.get(endpoint, { params: pageParams(page, pageSize, activeFilters) });
                setItems(getResults(res.data));
                setTotal(getCount(res.data));
            }
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
        if (!verifyTarget && !paymentTarget && !realisasiTarget && !returTarget && !detailTarget && !showManual && !selectedDepositVendor) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [verifyTarget, paymentTarget, realisasiTarget, returTarget, detailTarget, showManual, selectedDepositVendor]);

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
        setVendorDepositInfo(null);
        const katLabel = row.kategori_vendor || row.kategori || (row.sumber === 'logistik' ? 'Logistik' : 'Obat & BHP');
        const fakturNo = row.nomor_faktur || row.nomor_spb || '';
        const vendorStr = row.vendor_nama ? ` (${row.vendor_nama})` : '';
        const defaultKet = `Pembayaran ${katLabel}${vendorStr} Faktur ${fakturNo}`.trim();

        setPaymentForm({
            ...initialPaymentForm,
            jumlah_bayar: formatMoneyInput(row.sisa_utang || row.nominal || ''),
            use_deposit: false,
            potongan_deposit: '',
            keterangan: defaultKet,
        });

        if (row.vendor_id) {
            try {
                const depRes = await api.get('/keuangan/utang-supplier/vendor-deposit/', { params: { vendor_id: row.vendor_id } });
                if (depRes.data && depRes.data.total_sisa_deposit > 0) {
                    setVendorDepositInfo(depRes.data);
                }
            } catch {
                setVendorDepositInfo(null);
            }
        }

        try {
            const res = await api.get('/keuangan/pembayaran-utang/', { params: { utang: row.id, pagination: 'false', limit: 100 } });
            const hist = Array.isArray(res.data) ? res.data : getResults(res.data) || [];
            setPaymentHistory(hist);
        } catch {
            setPaymentHistory([]);
        }
    };

    const openRetur = (row) => {
        setReturTarget(row);
        setReturForm({ nominal_retur: '', keterangan: '' });
    };

    const submitRetur = async (event) => {
        event.preventDefault();
        if (!returTarget) return;

        const nominal = parseMoneyInput(returForm.nominal_retur);
        if (nominal <= 0) {
            toast.error('Nominal retur wajib lebih dari nol.');
            return;
        }
        const sisaUtangSaatIni = Number(returTarget.sisa_utang || returTarget.nominal || 0);
        if (nominal > sisaUtangSaatIni) {
            toast.error(`Nominal retur (${money(nominal)}) tidak boleh melebihi sisa utang saat ini (${money(sisaUtangSaatIni)}).`);
            return;
        }
        if (!returForm.keterangan?.trim()) {
            toast.error('Nomor Nota Retur / Keterangan wajib diisi.');
            return;
        }

        setSaving(true);
        try {
            const res = await api.post(`/keuangan/utang-supplier/${returTarget.id}/input-retur/`, {
                nominal_retur: nominal,
                keterangan: returForm.keterangan.trim(),
            });
            toast.success(res.data.message || 'Retur faktur berhasil dicatat.');
            setReturTarget(null);
            setReturForm({ nominal_retur: '', keterangan: '' });
            await fetchData();
            await fetchSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mencatat retur faktur.'));
        } finally {
            setSaving(false);
        }
    };

    const openDetail = async (row) => {
        setDetailTarget(row);
        setDetailHistory([]);
        try {
            const res = await api.get('/keuangan/pembayaran-utang/', { params: { utang: row.id, pagination: 'false', limit: 100 } });
            const hist = Array.isArray(res.data) ? res.data : getResults(res.data) || [];
            setDetailHistory(hist);
        } catch {
            setDetailHistory(row.pembayaran || []);
        }
    };

    const submitPayment = async (event) => {
        event.preventDefault();
        if (!paymentTarget) return;
        const jumlah = parseMoneyInput(paymentForm.jumlah_bayar);
        const potonganDep = paymentForm.use_deposit ? parseMoneyInput(paymentForm.potongan_deposit) : 0;
        if (jumlah <= 0) return toast.error('Jumlah pengajuan pembayaran wajib lebih dari 0.');
        setSaving(true);
        try {
            await api.post(`/keuangan/utang-supplier/${paymentTarget.id}/bayar/`, {
                tanggal_rencana_bayar: paymentForm.tanggal_rencana_bayar || null,
                jumlah_bayar: jumlah,
                potongan_deposit: potonganDep,
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
            toast.info('Menyiapkan file Excel...');
            const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
            let exportEndpoint = '';
            let fileName = '';

            if (mode === 'pengajuan') {
                exportEndpoint = '/keuangan/pembayaran-utang/export-excel/';
                fileName = `Daftar_Pengajuan_Utang_${todayISO()}.xlsx`;
            } else if (mode === 'aktif') {
                if (!activeFilters.status) activeFilters.status = 'aktif';
                exportEndpoint = '/keuangan/utang-supplier/export-excel/';
                fileName = `Daftar_Utang_Aktif_Supplier_${todayISO()}.xlsx`;
            } else if (mode === 'semua') {
                if (!activeFilters.status) activeFilters.status = 'semua';
                exportEndpoint = '/keuangan/utang-supplier/export-excel/';
                fileName = `Daftar_Semua_Utang_Supplier_${todayISO()}.xlsx`;
            } else {
                exportEndpoint = '/keuangan/utang-supplier/export-excel/';
                fileName = `Daftar_Utang_Supplier_${todayISO()}.xlsx`;
            }

            const res = await api.get(exportEndpoint, {
                params: activeFilters,
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('File Excel berhasil diunduh.');
        } catch (err) {
            console.error('Error export excel:', err);
            toast.error(errorMessage(err, 'Gagal mengunduh file Excel.'));
        }
    };

    const handleRollbackImport = async () => {
        if (!window.confirm('PERINGATAN UNDO IMPORT!\n\nApakah Anda yakin ingin menghapus SELURUH data utang hasil import Excel OTS dari database SIMAK dan mengembalikan database ke kondisi semula sebelum import?')) {
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/keuangan/utang-supplier/ots-rollback/');
            toast.success(res.data.message || 'Berhasil melakukan Undo Import OTS.');
            await fetchData();
            await fetchSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal melakukan undo import.'));
        } finally {
            setSaving(false);
        }
    };

    const handleResetAll = async () => {
        const confirmText = prompt(
            '⚠️ PERINGATAN RESET TOTAL UTANG & VERIFIKASI!\n\n' +
            'Aksi ini akan MENGHAPUS SELURUH catatan utang supplier di SIMAK (baik hasil verifikasi Siaga, OTS, maupun Manual), ' +
            'beserta seluruh riwayat pembayaran utang dan deposit vendor.\n\n' +
            'Seluruh faktur dari gudang/farmasi akan kembali bersih ke tab "Menunggu Verifikasi".\n\n' +
            'Ketik "RESET" untuk mengonfirmasi:'
        );
        if (confirmText !== 'RESET') {
            if (confirmText !== null) toast.error('Reset dibatalkan. Konfirmasi tidak sesuai.');
            return;
        }

        setSaving(true);
        try {
            const res = await api.post('/keuangan/utang-supplier/reset-all/');
            toast.success(res.data.message || 'Berhasil mereset seluruh data utang dan verifikasi.');
            resetFilters();
            setSearchParams({ tab: 'menunggu' });
            await fetchPendingSummary();
            await fetchSummary();
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mereset data utang.'));
        } finally {
            setSaving(false);
        }
    };

    const handlePelunasanDataLama = async () => {
        if (!window.confirm('KONFIRMASI PELUNASAN DATA LAMA:\n\nApakah Anda yakin ingin melunaskan SELURUH sisa transaksi gudang lama yang belum diverifikasi?\n\n- Sistem akan menghitung batas Tanggal Faktur OTS terakhir secara DINAMIS untuk Masing-Masing Vendor.\n- Faktur sebelum atau sama dengan tanggal faktur OTS vendor tsb yang tidak ada di Excel OTS akan otomatis ditandai LUNAS.\n- Faktur baru yang tanggal fakturnya lebih baru dari cut-off vendor tsb tetap berada di "Menunggu Verifikasi".')) {
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/keuangan/catatan-utang/obat-bhp/lunaskan-data-lama/');
            toast.success(res.data.message || 'Berhasil melunaskan sisa data transaksi lama.');
            await fetchData();
            await fetchSummary();
            await fetchPendingSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal melunaskan data lama.'));
        } finally {
            setSaving(false);
        }
    };

    const handleUndoPelunasanDataLama = async () => {
        if (!window.confirm('KONFIRMASI UNDO PELUNASAN DATA LAMA:\n\nApakah Anda yakin ingin membatalkan (Undo) pelunasan masal data transaksi gudang lama?\n\nSeluruh faktur sisa lama yang sebelumnya dipelutaskan akan dikembalikan ke status "Menunggu Verifikasi".')) {
            return;
        }
        setSaving(true);
        try {
            const res = await api.delete('/keuangan/catatan-utang/obat-bhp/lunaskan-data-lama/');
            toast.success(res.data.message || 'Berhasil membatalkan (Undo) pelunasan data lama.');
            await fetchData();
            await fetchSummary();
            await fetchPendingSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan (Undo) pelunasan data lama.'));
        } finally {
            setSaving(false);
        }
    };

    const toggleSelectAll = (checked, pageItems) => {
        if (checked) {
            const keys = pageItems.map(i => `${i.sumber}-${i.app_siaga_faktur_id}`);
            setSelectedKeys(keys);
        } else {
            setSelectedKeys([]);
        }
    };

    const toggleSelectItem = (key) => {
        setSelectedKeys(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const handleBulkPelunasanSelected = async () => {
        if (selectedKeys.length === 0) return;
        if (!window.confirm(`KONFIRMASI PELUNASAN TERPILIH:\n\nApakah Anda yakin ingin melunaskan ${selectedKeys.length} faktur yang dipilih?`)) return;

        const selectedObjects = items
            .filter(i => selectedKeys.includes(`${i.sumber}-${i.app_siaga_faktur_id}`))
            .map(i => ({ app_siaga_faktur_id: i.app_siaga_faktur_id, sumber: i.sumber }));

        setSaving(true);
        try {
            const res = await api.post('/keuangan/catatan-utang/obat-bhp/lunaskan-data-lama/', { items: selectedObjects });
            toast.success(res.data.message || `Berhasil melunaskan ${selectedKeys.length} faktur terpilih.`);
            setSelectedKeys([]);
            await fetchData();
            await fetchSummary();
            await fetchPendingSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal melunaskan faktur terpilih.'));
        } finally {
            setSaving(false);
        }
    };

    const openManual = () => {
        setManualForm(initialManualForm);
        setShowManual(true);
    };

    const submitManual = async (event) => {
        event.preventDefault();
        const nominal = parseMoneyInput(manualForm.nominal);
        if (!manualForm.vendor_id) return toast.error('Vendor / Rekanan wajib dipilih.');
        if (!manualForm.nomor_faktur.trim()) return toast.error('Nomor faktur wajib diisi.');
        if (nominal <= 0) return toast.error('Nominal utang wajib diisi dan lebih dari 0.');
        if (!manualForm.tanggal_faktur) return toast.error('Tanggal faktur wajib diisi.');
        if (!manualForm.keterangan || !manualForm.keterangan.trim()) return toast.error('Keterangan wajib diisi.');
        setSaving(true);
        try {
            await api.post('/keuangan/utang-supplier/create-manual/', {
                vendor_id: manualForm.vendor_id,
                nomor_faktur: manualForm.nomor_faktur.trim(),
                nomor_spb: manualForm.nomor_spb.trim(),
                tanggal_faktur: manualForm.tanggal_faktur || null,
                tanggal_jatuh_tempo: manualForm.tanggal_jatuh_tempo || null,
                tanggal_titip: manualForm.tanggal_titip || null,
                nominal,
                keterangan: manualForm.keterangan,
            });
            toast.success('Catatan utang manual berhasil disimpan.');
            setShowManual(false);
            setManualForm(initialManualForm);
            await fetchSummary();
            if (mode === 'aktif' || mode === 'semua') await fetchData();
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

    const pendingValue = pendingSummary?.nominal || 0;
    const pendingCountValue = pendingSummary?.count || 0;

    const activeValue = summary?.total_sisa || 0;
    const activeCountValue = summary?.utang_count || 0;

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
                <div className="utang-summary-card">
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Hutang Menunggu Verifikasi</span>
                            <span className="card-value">{money(pendingValue)}</span>
                            <span className="card-subtext">{pendingCountValue} Total Faktur</span>
                        </div>
                        <span className="card-icon pending"><FileClock size={24} /></span>
                    </div>
                </div>

                <div className="utang-summary-card">
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Utang Aktif</span>
                            <span className="card-value">{money(activeValue)}</span>
                            <span className="card-subtext">{activeCountValue} Total Faktur</span>
                        </div>
                        <span className="card-icon active"><ReceiptText size={24} /></span>
                    </div>
                </div>

                <div className="utang-summary-card total">
                    <div className="card-inner">
                        <div className="card-info">
                            <span className="card-label">Total Utang</span>
                            <span className="card-value">{money(pendingValue + activeValue)}</span>
                            <span className="card-subtext">{pendingCountValue + activeCountValue} Total Faktur</span>
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
                        {(mode === 'pengajuan' || mode === 'aktif' || mode === 'semua') && (
                            <button className="utang-btn primary" type="button" onClick={exportExcel}>
                                <FileSpreadsheet size={16} /> Export Excel
                            </button>
                        )}
                        {mode === 'menunggu' && (
                            <>
                                {selectedKeys.length > 0 && (
                                    <button className="utang-btn primary" type="button" onClick={handleBulkPelunasanSelected} style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff' }} title="Pelunasan Masal Faktur Terpilih">
                                        <CheckCheck size={16} /> Lunaskan ({selectedKeys.length}) Terpilih
                                    </button>
                                )}
                                <button className="utang-btn primary" type="button" onClick={handlePelunasanDataLama} style={{ background: '#d97706', borderColor: '#b45309', color: '#ffffff' }} title="Pelunasan Masal Data Transaksi Gudang Lama (Dinamis Sesuai Tanggal Faktur Terakhir Masing-Masing Vendor di Excel OTS)">
                                    <CheckCheck size={16} /> Lunaskan Sisa Data Lama
                                </button>
                                <button className="utang-btn primary" type="button" onClick={handleUndoPelunasanDataLama} style={{ background: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }} title="Batalkan (Undo) Pelunasan Masal Data Lama">
                                    <RotateCcw size={16} /> Undo Pelunasan Data Lama
                                </button>
                            </>
                        )}
                        <button className="utang-btn primary" type="button" onClick={() => navigate('/keuangan/catatan-utang/import-ots')} style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff' }}>
                            <FileSpreadsheet size={16} /> Import Excel OTS
                        </button>
                        <button className="utang-btn primary" type="button" onClick={handleRollbackImport} style={{ background: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }} title="Hapus seluruh data utang hasil import Excel OTS">
                            <RotateCcw size={16} /> Undo Import OTS
                        </button>
                        <button className="utang-btn primary" type="button" onClick={handleResetAll} style={{ background: '#b91c1c', borderColor: '#991b1b', color: '#ffffff' }} title="Hapus / Reset seluruh data utang dan verifikasi kembali ke kondisi awal">
                            <RotateCcw size={16} /> Reset Semua Verifikasi
                        </button>
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
                    <DebouncedSearchInput
                        value={filters.search}
                        onChange={(val) => setFilters((prev) => ({ ...prev, search: val }))}
                        placeholder="Cari vendor / faktur / SPB / keterangan..."
                        className="utang-tab-search"
                    />
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
                        {mode === 'menunggu' && (
                            <PendingTable 
                                items={items} 
                                onVerify={openVerify} 
                                onSort={setOrdering} 
                                selectedKeys={selectedKeys} 
                                onToggleAll={toggleSelectAll} 
                                onToggleItem={toggleSelectItem} 
                            />
                        )}
                        {(mode === 'aktif' || mode === 'semua') && <ActiveTable items={items} onPayment={openPayment} onDetail={openDetail} onRetur={openRetur} onSort={setOrdering} />}
                        {mode === 'pengajuan' && <PendingSubmissionTable items={items} onRealisasi={openRealisasi} onCancel={cancelPengajuan} onSort={setOrdering} />}
                        {mode === 'deposit' && <DepositVendorTable summary={depositData.summary} vendors={items} onDetail={setSelectedDepositVendor} />}
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
                                <div className="utang-verify-row" style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 6, marginTop: 4 }}>
                                    <span className="lbl">Total Bruto</span>
                                    <span className="val mono">{money(verifyTarget.total_sebelum_diskon || verifyTarget.nominal)}</span>
                                </div>
                                {Number(verifyTarget.disc1 || 0) > 0 && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">Diskon 1</span>
                                        <span className="val mono" style={{ color: '#e11d48' }}>- {money(verifyTarget.disc1)}</span>
                                    </div>
                                )}
                                {Number(verifyTarget.disc2 || 0) > 0 && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">Diskon 2</span>
                                        <span className="val mono" style={{ color: '#e11d48' }}>- {money(verifyTarget.disc2)}</span>
                                    </div>
                                )}
                                {Number(verifyTarget.disc3 || 0) > 0 && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">Diskon 3</span>
                                        <span className="val mono" style={{ color: '#e11d48' }}>- {money(verifyTarget.disc3)}</span>
                                    </div>
                                )}
                                {(Number(verifyTarget.disc1 || 0) > 0 || Number(verifyTarget.disc2 || 0) > 0 || Number(verifyTarget.disc3 || 0) > 0) && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">Total Stlh Diskon</span>
                                        <span className="val mono bold">{money(verifyTarget.total_setelah_diskon)}</span>
                                    </div>
                                )}
                                {Number(verifyTarget.ppn || 0) > 0 && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">PPN</span>
                                        <span className="val mono" style={{ color: '#16a34a' }}>+ {money(verifyTarget.ppn)}</span>
                                    </div>
                                )}
                                {Number(verifyTarget.materai || 0) > 0 && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">Materai</span>
                                        <span className="val mono">+ {money(verifyTarget.materai)}</span>
                                    </div>
                                )}
                                <div className="utang-verify-row total">
                                    <span className="lbl">Total Nominal</span>
                                    <span className="val price">{money(verifyTarget.nominal)}</span>
                                </div>
                            </div>

                            {verifyTarget.sumber === 'logistik' && (
                                <div className="utang-vendor-notice">
                                    <AlertTriangle size={16} />
                                    <div>
                                        <strong>Pencocokan Master Vendor Logistik</strong>
                                        <span> — {!verifyTarget.vendor_id_hint ? 'Vendor belum terhubung ke Master Data. Pilih vendor di bawah.' : `Vendor terdeteksi (${verifyTarget.vendor_nama}). Ubah jika perlu.`}</span>
                                    </div>
                                </div>
                            )}

                            {verifyTarget.sumber === 'logistik' && (
                                <div className="utang-field-block">
                                    <label className="utang-field-lbl"><ShieldCheck size={15} /> Vendor Master <span className="utang-req">*</span></label>
                                    <SearchablePembiayaanSelect
                                        options={masterVendorOptions}
                                        value={verifyForm.vendor_id}
                                        onChange={(val) => setVerifyForm({ ...verifyForm, vendor_id: val })}
                                        placeholder="-- Pilih Vendor Master --"
                                        className="utang-vendor-select"
                                    />
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
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff' }}><HandCoins size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Ajukan Pembayaran Utang</h2>
                                    <SumberBadge sumber={paymentTarget.sumber} />
                                </div>
                                <p className="utang-modal-head-subtitle">Vendor: <strong>{paymentTarget.vendor_nama || '-'}</strong></p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setPaymentTarget(null)} aria-label="Tutup"><X size={18} /></button>
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

                            {vendorDepositInfo && vendorDepositInfo.total_sisa_deposit > 0 && (
                                <div className="utang-deposit-banner">
                                    <div className="utang-deposit-head">
                                        <Sparkles size={18} />
                                        <span>Saldo Retur Vendor Tersedia: {money(vendorDepositInfo.total_sisa_deposit)}</span>
                                    </div>
                                    <p className="utang-deposit-desc">
                                        Terdapat kredit dari retur barang sebelumnya pada vendor ini. Anda dapat menggunakannya sebagai potongan pembayaran.
                                    </p>
                                    <div className="utang-deposit-box">
                                        <label className="utang-deposit-check">
                                            <input
                                                type="checkbox"
                                                checked={paymentForm.use_deposit}
                                                onChange={(e) => {
                                                    const isChecked = e.target.checked;
                                                    const totalBayarVal = parseMoneyInput(paymentForm.jumlah_bayar);
                                                    const maxUse = Math.min(totalBayarVal, vendorDepositInfo.total_sisa_deposit);
                                                    setPaymentForm({
                                                        ...paymentForm,
                                                        use_deposit: isChecked,
                                                        potongan_deposit: isChecked ? formatMoneyInput(maxUse) : '',
                                                    });
                                                }}
                                            />
                                            Gunakan Potongan Retur
                                        </label>
                                        {paymentForm.use_deposit && (
                                            <div className="utang-deposit-input-wrap">
                                                <span>Nominal Potongan:</span>
                                                <input
                                                    className="utang-input utang-input-right utang-deposit-input"
                                                    inputMode="decimal"
                                                    value={paymentForm.potongan_deposit}
                                                    onChange={(e) => {
                                                        const val = parseMoneyInput(e.target.value);
                                                        const totalBayarVal = parseMoneyInput(paymentForm.jumlah_bayar);
                                                        const capped = Math.min(val, vendorDepositInfo.total_sisa_deposit, totalBayarVal);
                                                        setPaymentForm({
                                                            ...paymentForm,
                                                            potongan_deposit: formatMoneyInput(capped),
                                                        });
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {paymentForm.use_deposit && (
                                        <div className="utang-deposit-summary">
                                            <span>Transfer / Kas Keluar Aktual:</span>
                                            <span className="utang-deposit-kas-out">
                                                {money(Math.max(parseMoneyInput(paymentForm.jumlah_bayar) - parseMoneyInput(paymentForm.potongan_deposit), 0))}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

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
                                            <thead><tr><th>Tgl Realisasi</th><th>Jumlah</th><th>Potongan Retur</th><th>Status</th><th>Keterangan</th></tr></thead>
                                            <tbody>
                                                {paymentHistory.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td>{dateLabel(item.tanggal_proses)}</td>
                                                        <td className="utang-mono">{money(item.jumlah_bayar)}</td>
                                                        <td className="utang-mono">{item.potongan_deposit > 0 ? money(item.potongan_deposit) : '-'}</td>
                                                        <td><StatusBadge status={item.status} label={item.status_label} /></td>
                                                        <td>{item.keterangan || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
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

            {returTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setReturTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={submitRetur} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #e11d48, #f43f5e)', color: '#fff' }}><RotateCcw size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Input Retur / Potongan Faktur</h2>
                                    <SumberBadge sumber={returTarget.sumber} />
                                </div>
                                <p className="utang-modal-head-subtitle">Vendor: <strong>{returTarget.vendor_nama || '-'}</strong></p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setReturTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{returTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono" style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'right' }}>{returTarget.nomor_faktur || '-'}</span>
                                </div>
                                {returTarget.nomor_spb && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">No. SPB</span>
                                        <span className="val mono">{returTarget.nomor_spb}</span>
                                    </div>
                                )}
                                <div className="utang-verify-row">
                                    <span className="lbl">Total Nominal Faktur</span>
                                    <span className="val price">{money(returTarget.nominal)}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Sisa Utang Saat Ini</span>
                                    <span className="val price" style={{ color: '#e11d48', fontWeight: 800 }}>{money(returTarget.sisa_utang)}</span>
                                </div>
                            </div>

                            <div className="utang-manual-grid" style={{ gridTemplateColumns: '1fr', marginTop: 14 }}>
                                <label>
                                    <span>Nominal Retur (Rp) <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input utang-input-right"
                                        required
                                        inputMode="decimal"
                                        placeholder="Rp 0"
                                        value={formatMoneyInput(returForm.nominal_retur)}
                                        onChange={(e) => setReturForm({ ...returForm, nominal_retur: formatMoneyInput(e.target.value) })}
                                    />
                                </label>

                                {parseMoneyInput(returForm.nominal_retur) > 0 && (
                                    <div style={{
                                        background: parseMoneyInput(returForm.nominal_retur) > Number(returTarget.sisa_utang || 0) ? '#fef2f2' : '#f0fdf4',
                                        border: `1px solid ${parseMoneyInput(returForm.nominal_retur) > Number(returTarget.sisa_utang || 0) ? '#fecaca' : '#bbf7d0'}`,
                                        borderRadius: 8,
                                        padding: '10px 14px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '13px',
                                    }}>
                                        <span style={{ color: '#475569', fontWeight: 600 }}>Sisa Tagihan Setelah Retur:</span>
                                        <strong style={{
                                            fontSize: '15px',
                                            color: parseMoneyInput(returForm.nominal_retur) > Number(returTarget.sisa_utang || 0) ? '#dc2626' : '#16a34a',
                                        }}>
                                            {parseMoneyInput(returForm.nominal_retur) > Number(returTarget.sisa_utang || 0) 
                                                ? 'Nominal melebihi sisa utang!'
                                                : money(Math.max(Number(returTarget.sisa_utang || 0) - parseMoneyInput(returForm.nominal_retur), 0))
                                            }
                                        </strong>
                                    </div>
                                )}

                                <label>
                                    <span>Nomor Nota Retur / Keterangan <span className="utang-req">*</span></span>
                                    <textarea
                                        className="utang-input"
                                        required
                                        rows={3}
                                        placeholder="Contoh: Nota Retur No. NR-MPI/2026/0412 - Retur obat rusak/ED 2 box..."
                                        value={returForm.keterangan}
                                        onChange={(e) => setReturForm({ ...returForm, keterangan: e.target.value })}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setReturTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} style={{ background: '#e11d48' }}>
                                <RotateCcw size={16} /> {saving ? 'Menyimpan...' : 'Simpan Retur Faktur'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {selectedDepositVendor && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setSelectedDepositVendor(null)}>
                    <div className="utang-modal payment" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 740 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: '#059669', color: '#fff' }}><Sparkles size={20} /></span>
                            <div>
                                <h2>Mutasi Deposit Retur Vendor</h2>
                                <p>{selectedDepositVendor.vendor_nama}</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setSelectedDepositVendor(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-pay-summary" style={{ marginBottom: 16 }}>
                                <Info label="Total Retur Diterima" value={money(selectedDepositVendor.total_retur)} />
                                <Info label="Deposit Terpakai" value={money(selectedDepositVendor.total_terpakai)} />
                                <Info label="Sisa Deposit Aktif" value={money(selectedDepositVendor.total_sisa_deposit)} />
                            </div>
                            <div className="utang-history-wrap">
                                <table className="utang-history-table">
                                    <thead>
                                        <tr>
                                            <th>Tgl Retur</th>
                                            <th>No. Faktur Asal</th>
                                            <th>Nominal Retur</th>
                                            <th>Terpakai</th>
                                            <th>Sisa Deposit</th>
                                            <th>Keterangan</th>
                                            <th>Operator</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedDepositVendor.items || []).map((item, idx) => (
                                            <tr key={item.id || idx}>
                                                <td>{dateLabel(item.created_at)}</td>
                                                <td className="utang-mono">{item.nomor_faktur || item.nomor_spb || '-'}</td>
                                                <td className="utang-mono bold" style={{ color: '#059669' }}>{money(item.nominal_retur)}</td>
                                                <td className="utang-mono">{money(item.terpakai)}</td>
                                                <td className="utang-mono bold">{money(item.sisa_deposit)}</td>
                                                <td>{item.keterangan || '-'}</td>
                                                <td>{item.created_by_name || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" onClick={() => setSelectedDepositVendor(null)}>Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {realisasiTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setRealisasiTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={confirmRealisasi} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }}><CheckCircle2 size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Realisasi Pembayaran Utang</h2>
                                    {realisasiTarget.sumber && <SumberBadge sumber={realisasiTarget.sumber} />}
                                </div>
                                <p className="utang-modal-head-subtitle">Vendor: <strong>{realisasiTarget.vendor_nama || '-'}</strong></p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setRealisasiTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{realisasiTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono" style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'right' }}>{realisasiTarget.nomor_faktur || '-'}</span>
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
                                    <span className="val price">{money(realisasiTarget.jumlah_bayar)}</span>
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
                                        placeholder="Rp 0"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setRealisasiTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                <CheckCircle2 size={16} /> {saving ? 'Memproses...' : 'Konfirmasi Realisasi Bayar'}
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
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}><FilePlus2 size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Catat Utang Manual</h2>
                                </div>
                                <p className="utang-modal-head-subtitle">Input faktur/biaya operasional di luar farmasi &amp; logistik</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setShowManual(false)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-manual-grid">
                                <label>
                                    <span>Vendor / Rekanan <span className="utang-req">*</span></span>
                                    <SearchablePembiayaanSelect
                                        options={masterVendorOptions}
                                        value={manualForm.vendor_id}
                                        onChange={(val) => setManualForm({ ...manualForm, vendor_id: val })}
                                        placeholder="-- Pilih Vendor --"
                                    />
                                </label>
                                <label>
                                    <span>Nomor Faktur <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input"
                                        required
                                        placeholder="Contoh: INV/2025/001"
                                        value={manualForm.nomor_faktur}
                                        onChange={(e) => setManualForm({ ...manualForm, nomor_faktur: e.target.value })}
                                    />
                                </label>
                                <label>
                                    <span>Nomor SPB / PO</span>
                                    <input
                                        className="utang-input"
                                        placeholder="Opsional"
                                        value={manualForm.nomor_spb}
                                        onChange={(e) => setManualForm({ ...manualForm, nomor_spb: e.target.value })}
                                    />
                                </label>
                                <label>
                                    <span>Nominal Utang <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input utang-input-right"
                                        required
                                        placeholder="Rp 0"
                                        value={formatMoneyInput(manualForm.nominal)}
                                        onChange={(e) => setManualForm({ ...manualForm, nominal: formatMoneyInput(e.target.value) })}
                                    />
                                </label>
                                <label><span>Tanggal Faktur <span className="utang-req">*</span></span><DateInput value={manualForm.tanggal_faktur} onChange={(v) => setManualForm({ ...manualForm, tanggal_faktur: v })} /></label>
                                <label><span>Tanggal Titip Faktur</span><DateInput value={manualForm.tanggal_titip} onChange={(v) => setManualForm({ ...manualForm, tanggal_titip: v })} /></label>
                                <label><span>Tanggal Jatuh Tempo</span><DateInput value={manualForm.tanggal_jatuh_tempo} onChange={(v) => setManualForm({ ...manualForm, tanggal_jatuh_tempo: v })} /></label>
                                <label className="utang-span-full">
                                    <span>Keterangan <span className="utang-req">*</span></span>
                                    <textarea
                                        className="utang-input"
                                        required
                                        rows={2}
                                        placeholder="Tuliskan keterangan/catatan utang manual (wajib)..."
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

            {detailTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setDetailTarget(null)}>
                    <div className="utang-modal payment utang-detail-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #0284c7, #38bdf8)', color: '#fff' }}><Eye size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Detail Utang &amp; Riwayat Pembayaran</h2>
                                    <SumberBadge sumber={detailTarget.sumber} />
                                </div>
                                <p className="utang-modal-head-subtitle">Vendor: <strong>{detailTarget.vendor_nama || '-'}</strong></p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setDetailTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-detail-split-grid">
                                {/* Left Column: Ringkasan & Informasi Faktur */}
                                <div className="utang-detail-col-left">
                                    <section className="utang-payment-section">
                                        <SectionTitle>Ringkasan Faktur</SectionTitle>
                                        <div className="utang-pay-summary">
                                            <Info label="Total Nominal" value={money(detailTarget.nominal)} />
                                            <Info label="Sudah Dibayar" value={money(detailTarget.total_dibayar)} />
                                            <Info label="Sisa Utang" value={money(detailTarget.sisa_utang)} />
                                        </div>
                                    </section>

                                    <section className="utang-payment-section">
                                        <SectionTitle>Informasi Faktur</SectionTitle>
                                        <div className="utang-verify-card">
                                            <div className="utang-verify-row">
                                                <span className="lbl">Status</span>
                                                <span className="val"><StatusBadge status={detailTarget.status} label={detailTarget.status_label} /></span>
                                            </div>
                                            <div className="utang-verify-row">
                                                <span className="lbl">No. Faktur</span>
                                                <span className="val mono">{detailTarget.nomor_faktur || '-'}</span>
                                            </div>
                                            <div className="utang-verify-row">
                                                <span className="lbl">No. Ref / SPB</span>
                                                <span className="val mono">{getRefNo(detailTarget)}</span>
                                            </div>
                                            <div className="utang-verify-row">
                                                <span className="lbl">Tgl. Faktur</span>
                                                <span className="val">{dateLabel(detailTarget.tanggal_faktur)}</span>
                                            </div>
                                            <div className="utang-verify-row">
                                                <span className="lbl">Jatuh Tempo</span>
                                                <span className="val">{dateLabel(detailTarget.tanggal_jatuh_tempo)}</span>
                                            </div>
                                            <div className="utang-verify-row">
                                                <span className="lbl">Tgl. Titip</span>
                                                <span className="val">{dateLabel(detailTarget.tanggal_titip)} ({calcUmurUtang(detailTarget.tanggal_titip)})</span>
                                            </div>
                                            {detailTarget.verified_by_name && (
                                                <div className="utang-verify-row">
                                                    <span className="lbl">Verifikator</span>
                                                    <span className="val bold">{detailTarget.verified_by_name}</span>
                                                </div>
                                            )}
                                            {detailTarget.keterangan_titip && (
                                                <div className="utang-verify-row">
                                                    <span className="lbl">Keterangan Titip</span>
                                                    <span className="val">{detailTarget.keterangan_titip}</span>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column: Riwayat Pembayaran & Retur */}
                                <div className="utang-detail-col-right">
                                    <section className="utang-payment-section">
                                        <SectionTitle icon={History}>Riwayat Transaksi (Realisasi &amp; Retur)</SectionTitle>
                                        {detailHistory.length > 0 ? (
                                            <div className="utang-history-wrap">
                                                <table className="utang-history-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Tgl Proses</th>
                                                            <th style={{ textAlign: 'right' }}>Nominal</th>
                                                            <th>Status</th>
                                                            <th>Keterangan</th>
                                                            <th>Operator</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detailHistory.map((item, idx) => (
                                                            <tr key={item.id || idx}>
                                                                <td>{dateLabel(item.tanggal_realisasi || item.tanggal_proses || item.tanggal_rencana_bayar)}</td>
                                                                <td className={`utang-mono ${item.status === 'retur' ? 'utang-nominal-retur' : ''}`} style={{ textAlign: 'right', fontWeight: 700, color: item.status === 'retur' ? '#e11d48' : undefined }}>
                                                                    {item.status === 'retur' ? `- ${money(item.jumlah_bayar)}` : money(item.jumlah_bayar)}
                                                                </td>
                                                                <td><StatusBadge status={item.status} label={item.status_label || item.status} /></td>
                                                                <td>{item.keterangan || '-'}</td>
                                                                <td>{item.created_by_name || item.realized_by_name || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="utang-history-empty" style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 200, border: '1px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc', color: '#64748b', padding: '24px 16px', textAlign: 'center' }}>
                                                <div>
                                                    <FileClock size={28} style={{ opacity: 0.4, margin: '0 auto 8px', display: 'block' }} />
                                                    <span>Belum ada riwayat pembayaran atau retur untuk faktur ini.</span>
                                                </div>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" onClick={() => setDetailTarget(null)}>Tutup</button>
                        </div>
                    </div>
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
                <select
                    className="dki-select dki-filter-status"
                    value={(mode === 'aktif' || mode === 'semua') ? (filters.status || '') : ''}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    disabled={mode !== 'aktif' && mode !== 'semua'}
                    title={(mode === 'aktif' || mode === 'semua') ? 'Filter status faktur' : 'Status hanya tersedia di tab Utang Aktif / Semua'}
                >
                    {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <select
                    className="dki-select utang-ordering-filter"
                    value={filters.ordering || ''}
                    onChange={(e) => setFilters({ ...filters, ordering: e.target.value })}
                    title="Urutkan data berdasarkan"
                >
                    {mode === 'menunggu' ? (
                        <>
                            <option value="-tanggal_spb">Tgl SPB Terbaru</option>
                            <option value="tanggal_spb">Tgl SPB Terlama</option>
                            <option value="-tanggal_faktur">Tgl Faktur Terbaru</option>
                            <option value="tanggal_faktur">Tgl Faktur Terlama</option>
                            <option value="vendor">Vendor (A-Z)</option>
                            <option value="-nominal">Nominal Terbesar</option>
                            <option value="nominal">Nominal Terkecil</option>
                        </>
                    ) : (
                        <>
                            <option value="tanggal_titip">Tgl Titip Terlama (Umur Utang)</option>
                            <option value="-tanggal_titip">Tgl Titip Terbaru</option>
                            <option value="-verified_at">Verifikasi Terbaru</option>
                            <option value="-tanggal_faktur">Tgl Faktur Terbaru</option>
                            <option value="tanggal_faktur">Tgl Faktur Terlama</option>
                            <option value="-nominal">Nominal Terbesar</option>
                            <option value="nominal">Nominal Terkecil</option>
                            <option value="vendor_nama">Vendor (A-Z)</option>
                        </>
                    )}
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

function PendingTable({ items, onVerify, onSort, selectedKeys = [], onToggleAll, onToggleItem }) {
    const allSelected = items.length > 0 && items.every(i => selectedKeys.includes(`${i.sumber}-${i.app_siaga_faktur_id}`));

    return (
        <table className="utang-table">
            <thead>
                <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => onToggleAll && onToggleAll(e.target.checked, items)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#10b981' }}
                            title="Pilih Semua Halaman Ini"
                        />
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
                    const key = `${item.sumber}-${item.app_siaga_faktur_id}`;
                    const isSelected = selectedKeys.includes(key);
                    return (
                        <tr key={key} style={isSelected ? { backgroundColor: '#f0fdf4' } : {}}>
                            <td style={{ textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onToggleItem && onToggleItem(key)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#10b981' }}
                                />
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
                            <td className="utang-right utang-mono bold">
                                <div>{money(item.nominal)}</div>
                                {item.sumber === 'farmasi' && (Number(item.disc1 || 0) > 0 || Number(item.ppn || 0) > 0) && (
                                    <small className="utang-subtext" style={{ fontSize: '11px', display: 'block', fontWeight: 'normal', color: '#64748b' }}>
                                        Bruto: {money(item.total_sebelum_diskon)} {Number(item.disc1 || 0) > 0 ? `• Disc: ${money(item.disc1)}` : ''} {Number(item.ppn || 0) > 0 ? `• PPN: ${money(item.ppn)}` : ''}
                                    </small>
                                )}
                            </td>
                            <td className="utang-right">
                                <div className="utang-action-group">
                                    <button
                                        className="utang-action-btn verify"
                                        type="button"
                                        onClick={() => onVerify(item)}
                                        title="Verifikasi Faktur ke Utang SIMAK"
                                    >
                                        <CheckCircle2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function ActiveTable({ items, onPayment, onDetail, onRetur, onSort }) {
    return (
        <table className="utang-table">
            <thead>
                <tr>
                    <th>Sumber</th>
                    <SortTh label="Vendor & SPB" field="vendor" onSort={onSort} />
                    <SortTh label="No Faktur & Tanggal" field="nomor_faktur" onSort={onSort} />
                    <SortTh label="Umur Utang" field="tanggal_titip" onSort={onSort} />
                    <SortTh label="Sisa Utang" field="nominal" onSort={onSort} right />
                    <SortTh label="Status" field="status" onSort={onSort} />
                    <SortTh label="Verifikator" field="verified_at" onSort={onSort} />
                    <th className="utang-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => {
                    const isPendingApproval = item.status === 'diajukan' || item.status === 'sebagian_diajukan';
                    const isNoSisa = Number(item.sisa_utang || 0) <= 0;
                    const isPaymentDisabled = isPendingApproval || isNoSisa;
                    const canRetur = item.status === 'belum_dibayar' && !isPendingApproval && Number(item.total_dibayar || 0) === 0;

                    return (
                    <tr key={item.id}>
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
                        <td>
                            <strong className="utang-mono">{calcUmurUtang(item.tanggal_titip)}</strong>
                            {item.tanggal_titip ? (
                                <small className="utang-subtext">Titip: {dateLabel(item.tanggal_titip)}</small>
                            ) : (
                                <small className="utang-subtext" style={{ opacity: 0.6 }}>-</small>
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
                            <div className="utang-action-group">
                                {item.status !== 'lunas' && (
                                    <button
                                        className="utang-action-btn pay"
                                        type="button"
                                        onClick={() => onPayment(item)}
                                        disabled={isPaymentDisabled}
                                        title={isPendingApproval ? 'Faktur ini sedang diajukan pembayaran' : isNoSisa ? 'Sisa utang Rp 0' : 'Ajukan Pembayaran'}
                                    >
                                        <HandCoins size={16} />
                                    </button>
                                )}
                                {canRetur && (
                                    <button
                                        className="utang-action-btn retur"
                                        type="button"
                                        onClick={() => onRetur(item)}
                                        title="Input Retur / Potongan Faktur"
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                )}
                                <button
                                    className="utang-action-btn detail"
                                    type="button"
                                    onClick={() => onDetail(item)}
                                    title="Lihat Detail & Riwayat Pembayaran"
                                >
                                    <Eye size={16} />
                                </button>
                            </div>
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
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '23%' }} />
                <col style={{ width: '14%' }} />
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
                {items.map((item, idx) => (
                    <tr key={item.id || item.app_siaga_faktur_id || idx}>
                        <td className="utang-name-cell" style={{ wordBreak: 'break-word', overflow: 'hidden' }}>
                            <strong>{item.vendor_nama || '-'}</strong>
                            <small className="utang-subtext">
                                {item.nomor_spb ? `SPB: ${item.nomor_spb}` : item.app_siaga_faktur_id ? `SPB: RJ-${item.app_siaga_faktur_id}` : ''}
                            </small>
                        </td>
                        <td style={{ wordBreak: 'break-word', overflow: 'hidden' }}>
                            <strong className="utang-mono">{item.nomor_faktur || '-'}</strong>
                            {item.tanggal_titip && (
                                <small className="utang-subtext">Tgl Titip: {dateLabel(item.tanggal_titip)} ({calcUmurUtang(item.tanggal_titip)})</small>
                            )}
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
                            <div className="utang-action-group" style={{ justifyContent: 'center', width: '100%' }}>
                                <button
                                    className="utang-action-btn realisasi"
                                    type="button"
                                    onClick={() => onRealisasi(item)}
                                    title="Realisasi / Verifikasi Pembayaran"
                                >
                                    <CheckCircle2 size={16} />
                                </button>
                                <button
                                    className="utang-action-btn danger"
                                    type="button"
                                    onClick={() => onCancel(item)}
                                    title="Batalkan Pengajuan Pembayaran"
                                >
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
                        <td className={`utang-right utang-mono ${item.status === 'retur' ? '' : item.status === 'realisasi_lunas' ? 'utang-nominal-realisasi' : 'utang-nominal-sebagian'}`} style={item.status === 'retur' ? { color: '#e11d48', fontWeight: 'bold' } : undefined}>
                            {item.status === 'retur' ? `- ${money(item.jumlah_bayar)}` : money(item.jumlah_bayar)}
                        </td>
                        <td className="utang-right utang-mono">{money(item.running_sisa_utang)}</td>
                        <td>
                            {item.status === 'retur' && (
                                <span style={{ marginRight: 6 }}><StatusBadge status="retur" label="Retur Barang" /></span>
                            )}
                            {item.keterangan || '-'}
                        </td>
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

function DepositVendorTable({ summary, vendors, onDetail }) {
    return (
        <div>
            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div className="utang-stat-card" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#fff', padding: '14px 18px', borderRadius: '14px' }}>
                        <span style={{ fontSize: '12px', opacity: 0.85, fontWeight: 600 }}>Total Vendor Deposit</span>
                        <div style={{ fontSize: '20px', fontWeight: 850, marginTop: 4 }}>{summary.total_vendor} Vendor</div>
                    </div>
                    <div className="utang-stat-card" style={{ background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', padding: '14px 18px', borderRadius: '14px' }}>
                        <span style={{ fontSize: '12px', opacity: 0.85, fontWeight: 600 }}>Sisa Saldo Deposit Aktif</span>
                        <div style={{ fontSize: '20px', fontWeight: 850, marginTop: 4 }}>{money(summary.total_sisa_deposit)}</div>
                    </div>
                    <div className="utang-stat-card" style={{ background: 'linear-gradient(135deg, #64748b, #475569)', color: '#fff', padding: '14px 18px', borderRadius: '14px' }}>
                        <span style={{ fontSize: '12px', opacity: 0.85, fontWeight: 600 }}>Total Deposit Terpakai</span>
                        <div style={{ fontSize: '20px', fontWeight: 850, marginTop: 4 }}>{money(summary.total_terpakai)}</div>
                    </div>
                    <div className="utang-stat-card" style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', color: '#fff', padding: '14px 18px', borderRadius: '14px' }}>
                        <span style={{ fontSize: '12px', opacity: 0.85, fontWeight: 600 }}>Total Retur Diterima</span>
                        <div style={{ fontSize: '20px', fontWeight: 850, marginTop: 4 }}>{money(summary.total_retur)}</div>
                    </div>
                </div>
            )}
            <table className="utang-table">
                <thead>
                    <tr>
                        <th>Vendor</th>
                        <th className="utang-right">Total Retur</th>
                        <th className="utang-right">Total Terpakai</th>
                        <th className="utang-right">Sisa Deposit Aktif</th>
                        <th>Status</th>
                        <th className="utang-right">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {vendors.map((v) => {
                        const isAktif = Number(v.total_sisa_deposit || 0) > 0;
                        return (
                            <tr key={v.vendor_id}>
                                <td className="utang-name-cell">
                                    <strong>{v.vendor_nama || '-'}</strong>
                                    <small className="utang-subtext">{v.count} Transaksi Retur • Vendor ID: {v.vendor_id}</small>
                                </td>
                                <td className="utang-right utang-mono">{money(v.total_retur)}</td>
                                <td className="utang-right utang-mono">{money(v.total_terpakai)}</td>
                                <td className="utang-right utang-mono bold" style={{ color: isAktif ? '#059669' : '#64748b', fontSize: '14px' }}>
                                    {money(v.total_sisa_deposit)}
                                </td>
                                <td>
                                    {isAktif ? (
                                        <span className="utang-status lunas" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>Saldo Aktif</span>
                                    ) : (
                                        <span className="utang-status" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }}>Habis / Terpakai</span>
                                    )}
                                </td>
                                <td className="utang-right">
                                    <button className="utang-btn soft mini" onClick={() => onDetail(v)} title="Lihat detail mutasi deposit vendor ini">
                                        <Eye size={15} /> Detail Mutasi
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
