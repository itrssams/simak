import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    Ban,
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
    Pencil,
    ReceiptText,
    RotateCcw,
    Search,
    ShieldCheck,
    Sparkles,
    Trash2,
    Truck,
    User,
    Wallet,
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
    { value: '', label: 'Semua Status (Termasuk Lunas & Batal)' },
    { value: 'aktif', label: 'Utang Aktif (Belum Lunas Saja)' },
    { value: 'belum_dibayar', label: 'Belum Dibayar' },
    { value: 'diajukan', label: 'Diajukan Pembayaran' },
    { value: 'sebagian', label: 'Bayar Sebagian' },
    { value: 'sebagian_diajukan', label: 'Sebagian Diajukan' },
    { value: 'lunas', label: 'Lunas' },
    { value: 'dibatalkan', label: 'Dibatalkan' },
];

const SUMBER_OPTIONS = [
    { value: 'semua', label: 'Semua Sumber' },
    { value: 'farmasi', label: 'Farmasi' },
    { value: 'logistik', label: 'Logistik' },
    { value: 'keuangan', label: 'Keuangan' },
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

const SUMBER_LABELS = { farmasi: 'Farmasi', logistik: 'Logistik', keuangan: 'Keuangan', manual: 'Manual' };

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
    if (m === 'semua') return '-verified_at';
    return 'tanggal_titip';
};

const initialFilters = { search: '', vendor_id: '', status: '', sumber: 'semua', kategori: '', dari: '', sampai: '', ordering: '-verified_at' };
const initialVerifyForm = { tanggal_titip: todayISO(), keterangan_titip: '', vendor_id: '' };
const initialPaymentForm = { tanggal_rencana_bayar: todayISO(), jumlah_bayar: '', keterangan: '' };
const initialManualForm = { vendor_id: '', nomor_faktur: '', nomor_spb: '', tanggal_faktur: todayISO(), tanggal_jatuh_tempo: '', tanggal_titip: todayISO(), nominal: '', keterangan: '' };
const initialEditForm = { vendor_id: '', nomor_faktur: '', nomor_spb: '', kategori: '', tanggal_faktur: todayISO(), tanggal_jatuh_tempo: '', tanggal_titip: todayISO(), nominal: '', keterangan_titip: '' };

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
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState(initialEditForm);
    const [showManual, setShowManual] = useState(false);
    const [manualForm, setManualForm] = useState(initialManualForm);
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [selectedPengajuanIds, setSelectedPengajuanIds] = useState([]);
    const [showBulkRealisasiModal, setShowBulkRealisasiModal] = useState(false);
    const [bulkRealisasiDate, setBulkRealisasiDate] = useState(todayISO());
    const [editTanggalTarget, setEditTanggalTarget] = useState(null);
    const [editTanggalForm, setEditTanggalForm] = useState({ tanggal_realisasi: todayISO() });
    const [depositData, setDepositData] = useState({ summary: { total_vendor: 0, total_retur: 0, total_terpakai: 0, total_sisa_deposit: 0 }, vendors: [] });
    const [selectedDepositVendor, setSelectedDepositVendor] = useState(null);
    const [batalTarget, setBatalTarget] = useState(null);
    const [batalAlasan, setBatalAlasan] = useState('');

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
        setSelectedKeys([]);
        setSelectedPengajuanIds([]);
        setFilters(prev => ({
            ...prev,
            ordering: getDefaultOrdering(mode)
        }));
    }, [mode]);

    useEffect(() => {
        setSelectedKeys([]);
        setSelectedPengajuanIds([]);
    }, [page]);

    useEffect(() => {
        if (!verifyTarget && !paymentTarget && !realisasiTarget && !returTarget && !detailTarget && !editTarget && !showManual && !selectedDepositVendor && !showBulkRealisasiModal && !editTanggalTarget) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [verifyTarget, paymentTarget, realisasiTarget, returTarget, detailTarget, editTarget, showManual, selectedDepositVendor, showBulkRealisasiModal, editTanggalTarget]);

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
        const defaultKet = `Pembayaran ${katLabel} ${fakturNo}`.replace(/\s+/g, ' ').trim();

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
            console.log("HISTORY LOADED:", hist);
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
                if (selectedPengajuanIds.length > 0) {
                    activeFilters.ids = selectedPengajuanIds.join(',');
                    fileName = `Pengajuan_Utang_Terpilih_${selectedPengajuanIds.length}_Faktur_${todayISO()}.xlsx`;
                } else {
                    fileName = `Daftar_Pengajuan_Utang_${todayISO()}.xlsx`;
                }
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

    const toggleSelectPengajuan = (id) => {
        setSelectedPengajuanIds((prev) => 
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAllPengajuan = (checked, pageItems) => {
        if (checked) {
            setSelectedPengajuanIds(pageItems.map((i) => i.id).filter(Boolean));
        } else {
            setSelectedPengajuanIds([]);
        }
    };

    const submitBulkRealisasi = async (event) => {
        event.preventDefault();
        if (selectedPengajuanIds.length === 0) return;
        setSaving(true);
        try {
            const res = await api.post('/keuangan/pembayaran-utang/bulk-realisasi/', {
                ids: selectedPengajuanIds,
                tanggal_realisasi: bulkRealisasiDate,
            });
            toast.success(res.data.message || 'Realisasi massal berhasil.');
            setShowBulkRealisasiModal(false);
            setSelectedPengajuanIds([]);
            await fetchData();
            await fetchSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal merealisasikan pengajuan terdaftar.'));
        } finally {
            setSaving(false);
        }
    };

    const selectedPengajuanItems = useMemo(() => {
        return items.filter((item) => selectedPengajuanIds.includes(item.id));
    }, [items, selectedPengajuanIds]);

    const totalBulkNominal = useMemo(() => {
        return selectedPengajuanItems.reduce((acc, item) => acc + Number(item.jumlah_bayar || 0), 0);
    }, [selectedPengajuanItems]);

    const openEditTanggal = (item) => {
        setEditTanggalTarget(item);
        setEditTanggalForm({
            tanggal_realisasi: item.tanggal_proses || item.tanggal_realisasi || todayISO()
        });
    };

    const submitEditTanggal = async (event) => {
        event.preventDefault();
        if (!editTanggalTarget) return;
        if (!editTanggalForm.tanggal_realisasi) {
            return toast.error('Tanggal realisasi baru wajib diisi.');
        }
        setSaving(true);
        try {
            const res = await api.post(`/keuangan/pembayaran-utang/${editTanggalTarget.id}/edit-tanggal/`, {
                tanggal_realisasi: editTanggalForm.tanggal_realisasi,
            });
            toast.success(res.data.message || 'Tanggal realisasi berhasil diperbarui.');
            setEditTanggalTarget(null);
            await fetchData();
            await fetchSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memperbarui tanggal realisasi.'));
        } finally {
            setSaving(false);
        }
    };

    const handleBatalRealisasi = async (item) => {
        const confirmMsg = `KONFIRMASI BATALKAN REALISASI:\n\nApakah Anda yakin ingin membatalkan realisasi pembayaran ${money(item.jumlah_bayar)} untuk faktur '${item.nomor_faktur || item.vendor_nama}'?\n\n- Transaksi pembayaran ini akan dihapus.\n- Sisa utang faktur akan dikembalikan seperti semula.`;
        if (!window.confirm(confirmMsg)) return;

        setSaving(true);
        try {
            const res = await api.post(`/keuangan/pembayaran-utang/${item.id}/batal-realisasi/`);
            toast.success(res.data.message || 'Realisasi pembayaran berhasil dibatalkan.');
            await fetchData();
            await fetchSummary();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan realisasi pembayaran.'));
        } finally {
            setSaving(false);
        }
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

    const openEdit = (item) => {
        setEditTarget(item);
        setEditForm({
            vendor_id: item.vendor_id ? String(item.vendor_id) : '',
            nomor_faktur: item.nomor_faktur || '',
            nomor_spb: item.nomor_spb || '',
            kategori: item.kategori || '',
            nominal: item.nominal ? String(Math.round(Number(item.nominal))) : '',
            tanggal_faktur: item.tanggal_faktur || '',
            tanggal_titip: item.tanggal_titip || '',
            tanggal_jatuh_tempo: item.tanggal_jatuh_tempo || '',
            keterangan_titip: item.keterangan_titip || '',
        });
    };

    const submitEdit = async (event) => {
        event.preventDefault();
        if (!editTarget) return;
        const nominal = parseMoneyInput(editForm.nominal);
        if (!editForm.nomor_faktur.trim()) return toast.error('Nomor faktur wajib diisi.');
        if (nominal <= 0) return toast.error('Nominal utang wajib diisi dan lebih dari 0.');
        if (!editForm.tanggal_faktur) return toast.error('Tanggal faktur wajib diisi.');

        setSaving(true);
        try {
            const payload = {
                vendor_id: editForm.vendor_id || null,
                nomor_faktur: editForm.nomor_faktur.trim(),
                nomor_spb: editForm.nomor_spb ? editForm.nomor_spb.trim() : '',
                kategori: editForm.kategori || '',
                tanggal_faktur: editForm.tanggal_faktur || null,
                tanggal_jatuh_tempo: editForm.tanggal_jatuh_tempo || null,
                tanggal_titip: editForm.tanggal_titip || null,
                nominal,
                keterangan_titip: editForm.keterangan_titip || '',
            };
            await api.patch(`/keuangan/utang-supplier/${editTarget.id}/`, payload);
            toast.success('Catatan utang berhasil diperbarui.');
            setEditTarget(null);
            await fetchSummary();
            await fetchData();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memperbarui catatan utang.'));
        } finally {
            setSaving(false);
        }
    };

    const openBatalkan = (item) => {
        setBatalTarget(item);
        setBatalAlasan('');
    };

    const submitBatalkan = async (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (!batalTarget) return;
        if (!batalAlasan || !batalAlasan.trim()) {
            return toast.error('Alasan pembatalan wajib diisi.');
        }

        setSaving(true);
        try {
            const res = await api.post(`/keuangan/utang-supplier/${batalTarget.id}/batalkan/`, {
                alasan: batalAlasan.trim(),
            });
            toast.success(res.data?.message || 'Faktur berhasil dibatalkan.');
            setBatalTarget(null);
            setBatalAlasan('');
            await fetchSummary();
            await fetchData();
        } catch (err) {
            console.error('Gagal membatalkan faktur:', err);
            toast.error(errorMessage(err, 'Gagal membatalkan faktur.'));
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
                        {mode === 'pengajuan' && selectedPengajuanIds.length > 0 && (
                            <>
                                <div className="utang-selected-pill" style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    border: '1px solid rgba(16, 185, 129, 0.35)',
                                    color: '#047857',
                                    padding: '6px 14px',
                                    borderRadius: '9px',
                                    fontSize: '13px',
                                    fontWeight: '700'
                                }}>
                                    <span>Terpilih: <strong>{selectedPengajuanIds.length} faktur</strong></span>
                                    <span style={{ opacity: 0.5 }}>|</span>
                                    <span>Total: <strong style={{ color: '#059669', fontSize: '13.5px' }}>{money(totalBulkNominal)}</strong></span>
                                </div>
                                <button
                                    className="utang-btn primary"
                                    type="button"
                                    onClick={exportExcel}
                                    style={{ background: '#0284c7', borderColor: '#0369a1', color: '#ffffff' }}
                                    title="Export hanya faktur pengajuan yang dicentang ke Excel"
                                >
                                    <FileSpreadsheet size={16} /> Export ({selectedPengajuanIds.length}) Terpilih
                                </button>
                                <button
                                    className="utang-btn primary"
                                    type="button"
                                    onClick={() => {
                                        setBulkRealisasiDate(todayISO());
                                        setShowBulkRealisasiModal(true);
                                    }}
                                    style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff' }}
                                    title="Realisasi beberapa pengajuan pembayaran sekaligus"
                                >
                                    <CheckCheck size={16} /> Realisasi ({selectedPengajuanIds.length}) Terpilih
                                </button>
                            </>
                        )}
                        {(mode === 'aktif' || mode === 'semua' || (mode === 'pengajuan' && selectedPengajuanIds.length === 0)) && (
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

                                {/* ══════════════════════════════════════════════════════════════════════
                                    [FITUR NONAKTIF SEMENTARA: PELUNASAN MASAL DATA LAMA]
                                    Dokumentasi: Digunakan untuk melunaskan secara masal data transaksi gudang 
                                    lama yang terdaftar di Excel OTS berdasarkan tanggal faktur terakhir vendor.
                                    Untuk mengaktifkan kembali, cukup buka comment pada 2 tombol di bawah ini:
                                    ══════════════════════════════════════════════════════════════════════ */}
                                {/*
                                <button className="utang-btn primary" type="button" onClick={handlePelunasanDataLama} style={{ background: '#d97706', borderColor: '#b45309', color: '#ffffff' }} title="Pelunasan Masal Data Transaksi Gudang Lama (Dinamis Sesuai Tanggal Faktur Terakhir Masing-Masing Vendor di Excel OTS)">
                                    <CheckCheck size={16} /> Lunaskan Sisa Data Lama
                                </button>
                                <button className="utang-btn primary" type="button" onClick={handleUndoPelunasanDataLama} style={{ background: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }} title="Batalkan (Undo) Pelunasan Masal Data Lama">
                                    <RotateCcw size={16} /> Undo Pelunasan Data Lama
                                </button>
                                */}
                            </>
                        )}

                        {/* ══════════════════════════════════════════════════════════════════════
                            [FITUR NONAKTIF SEMENTARA: IMPORT EXCEL OTS & ROLLBACK]
                            Dokumentasi: Digunakan saat proses migrasi awal data utang supplier dari format Excel OTS.
                            Untuk mengaktifkan kembali tombol ini, cukup buka comment pada 2 tombol di bawah ini:
                            ══════════════════════════════════════════════════════════════════════ */}
                        {/*
                        <button className="utang-btn primary" type="button" onClick={() => navigate('/keuangan/catatan-utang/import-ots')} style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff' }}>
                            <FileSpreadsheet size={16} /> Import Excel OTS
                        </button>
                        <button className="utang-btn primary" type="button" onClick={handleRollbackImport} style={{ background: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }} title="Hapus seluruh data utang hasil import Excel OTS">
                            <RotateCcw size={16} /> Undo Import OTS
                        </button>
                        */}

                        {/* ══════════════════════════════════════════════════════════════════════
                            [FITUR NONAKTIF SEMENTARA: RESET SEMUA VERIFIKASI]
                            Dokumentasi: Digunakan saat testing / inisialisasi awal untuk mereset seluruh
                            verifikasi data utang kembali ke status default / awal.
                            Untuk mengaktifkan kembali tombol ini, cukup buka comment di bawah ini:
                            ══════════════════════════════════════════════════════════════════════ */}
                        {/*
                        <button className="utang-btn primary" type="button" onClick={handleResetAll} style={{ background: '#b91c1c', borderColor: '#991b1b', color: '#ffffff' }} title="Hapus / Reset seluruh data utang dan verifikasi kembali ke kondisi awal">
                            <RotateCcw size={16} /> Reset Semua Verifikasi
                        </button>
                        */}

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
                        {(mode === 'aktif' || mode === 'semua') && (
                            <ActiveTable
                                items={items}
                                onPayment={openPayment}
                                onDetail={openDetail}
                                onRetur={openRetur}
                                onEdit={openEdit}
                                onBatalkan={openBatalkan}
                                onSort={setOrdering}
                            />
                        )}
                        {mode === 'pengajuan' && (
                            <PendingSubmissionTable
                                items={items}
                                onRealisasi={openRealisasi}
                                onCancel={cancelPengajuan}
                                onSort={setOrdering}
                                selectedIds={selectedPengajuanIds}
                                onToggleAll={toggleSelectAllPengajuan}
                                onToggleItem={toggleSelectPengajuan}
                                selectedNominalTotal={totalBulkNominal}
                            />
                        )}
                        {mode === 'deposit' && <DepositVendorTable summary={depositData.summary} vendors={items} onDetail={setSelectedDepositVendor} />}
                        {mode === 'histori' && <HistoryTable items={items} onSort={setOrdering} onEditTanggal={openEditTanggal} onBatalRealisasi={handleBatalRealisasi} />}
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
                                    <span className="val">{['logistik', 'keuangan'].includes(verifyTarget.sumber) ? '—' : dateLabel(verifyTarget.tanggal_jatuh_tempo)}</span>
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
                                    <div className={`utang-retur-calc-box ${parseMoneyInput(returForm.nominal_retur) > Number(returTarget.sisa_utang || 0) ? 'invalid' : 'valid'}`} style={{ marginTop: 6 }}>
                                        <span>Sisa Tagihan Setelah Retur:</span>
                                        <strong>
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

            {editTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setEditTarget(null)}>
                    <form className="utang-modal manual" role="dialog" aria-modal="true" onSubmit={submitEdit} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' }}><Pencil size={20} /></span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Edit Catatan Utang</h2>
                                    <SumberBadge sumber={editTarget.sumber} />
                                </div>
                                <p className="utang-modal-head-subtitle">Perbarui data faktur, vendor, tanggal, atau nominal utang</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setEditTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-manual-grid">
                                <label>
                                    <span>Vendor / Rekanan</span>
                                    <SearchablePembiayaanSelect
                                        options={masterVendorOptions}
                                        value={editForm.vendor_id}
                                        onChange={(val) => setEditForm({ ...editForm, vendor_id: val })}
                                        placeholder="-- Pilih Vendor --"
                                    />
                                </label>
                                <label>
                                    <span>Kategori Vendor</span>
                                    <select
                                        className="utang-input"
                                        value={editForm.kategori || ''}
                                        onChange={(e) => setEditForm({ ...editForm, kategori: e.target.value })}
                                    >
                                        <option value="">-- Pilih Kategori --</option>
                                        {VENDOR_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </label>
                                <label>
                                    <span>Nomor Faktur <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input"
                                        required
                                        placeholder="Contoh: INV/2025/001"
                                        value={editForm.nomor_faktur}
                                        onChange={(e) => setEditForm({ ...editForm, nomor_faktur: e.target.value })}
                                    />
                                </label>
                                <label>
                                    <span>Nomor SPB / PO</span>
                                    <input
                                        className="utang-input"
                                        placeholder="Opsional"
                                        value={editForm.nomor_spb}
                                        onChange={(e) => setEditForm({ ...editForm, nomor_spb: e.target.value })}
                                    />
                                </label>
                                <label className="utang-span-full">
                                    <span>Nominal Utang <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input utang-input-right"
                                        required
                                        placeholder="Rp 0"
                                        value={formatMoneyInput(editForm.nominal)}
                                        onChange={(e) => setEditForm({ ...editForm, nominal: formatMoneyInput(e.target.value) })}
                                    />
                                </label>
                                <label><span>Tanggal Faktur <span className="utang-req">*</span></span><DateInput value={editForm.tanggal_faktur} onChange={(v) => setEditForm({ ...editForm, tanggal_faktur: v })} /></label>
                                <label><span>Tanggal Titip Faktur</span><DateInput value={editForm.tanggal_titip} onChange={(v) => setEditForm({ ...editForm, tanggal_titip: v })} /></label>
                                <label><span>Tanggal Jatuh Tempo</span><DateInput value={editForm.tanggal_jatuh_tempo} onChange={(v) => setEditForm({ ...editForm, tanggal_jatuh_tempo: v })} /></label>
                                <label className="utang-span-full">
                                    <span>Keterangan Titip / Catatan</span>
                                    <textarea
                                        className="utang-input"
                                        rows={2}
                                        placeholder="Tuliskan keterangan/catatan titip faktur..."
                                        value={editForm.keterangan_titip}
                                        onChange={(e) => setEditForm({ ...editForm, keterangan_titip: e.target.value })}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button type="button" className="utang-btn secondary" onClick={() => setEditTarget(null)} disabled={saving}>Batal</button>
                            <button type="submit" className="utang-btn primary" disabled={saving} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderColor: '#d97706' }}>
                                {saving ? 'Menyimpan...' : <><Pencil size={15} /> Simpan Perubahan</>}
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
                                    {detailTarget.status === 'dibatalkan' && (
                                        <div className="utang-notice-box danger" style={{ marginTop: 0, marginBottom: 16 }}>
                                            <Ban size={20} className="utang-notice-box-icon" />
                                            <div className="utang-notice-content">
                                                <strong className="utang-notice-title">Faktur Telah Dibatalkan</strong>
                                                <p className="utang-notice-desc">
                                                    <strong>Alasan:</strong> {detailTarget.alasan_batal || '-'}
                                                </p>
                                                <small className="utang-notice-meta">
                                                    Dibatalkan oleh <strong>{detailTarget.dibatalkan_by_name || '-'}</strong> {detailTarget.dibatalkan_at ? `pada ${new Date(detailTarget.dibatalkan_at).toLocaleString('id-ID')}` : ''}
                                                </small>
                                            </div>
                                        </div>
                                    )}

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
                                    <div className="utang-detail-col-right-inner">
                                        <section className="utang-payment-section">
                                            <SectionTitle icon={History}>Riwayat Transaksi (Realisasi &amp; Retur) - Total: {detailHistory.length}</SectionTitle>
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
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" onClick={() => setDetailTarget(null)}>Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {showBulkRealisasiModal && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setShowBulkRealisasiModal(false)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={submitBulkRealisasi} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: '92vw' }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)' }}>
                                <CheckCheck size={22} />
                            </span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Realisasi Massal Pembayaran Utang</h2>
                                </div>
                                <p className="utang-modal-head-subtitle">Memproses <strong>{selectedPengajuanItems.length} pengajuan pembayaran</strong> sekaligus ke status Realisasi.</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setShowBulkRealisasiModal(false)} aria-label="Tutup"><X size={18} /></button>
                        </div>

                        <div className="utang-modal-body" style={{ padding: '20px 24px' }}>
                            {/* Summary Cards Banner */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: 14,
                                marginBottom: 18,
                            }}>
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 10,
                                    padding: '14px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                }}>
                                    <div style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 10,
                                        background: '#e0f2fe',
                                        color: '#0284c7',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0,
                                    }}>
                                        <ClipboardList size={22} />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                                            Total Pengajuan
                                        </span>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                                            {selectedPengajuanItems.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Item Terpilih</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: 10,
                                    padding: '14px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                }}>
                                    <div style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 10,
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        color: '#ffffff',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0,
                                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)',
                                    }}>
                                        <CircleDollarSign size={22} />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: '#047857', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                                            Total Realisasi Kas Keluar
                                        </span>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', letterSpacing: '-0.3px', marginTop: 2 }}>
                                            {money(totalBulkNominal)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Date Picker Input */}
                            <div className="utang-field-block" style={{ marginBottom: 20, background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                <label className="utang-field-lbl" style={{ fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarDays size={16} style={{ color: '#10b981' }} /> Tanggal Realisasi Pembayaran <span className="utang-req">*</span>
                                </label>
                                <div style={{ maxWidth: 280 }}>
                                    <DateInput value={bulkRealisasiDate} onChange={(v) => setBulkRealisasiDate(v)} />
                                </div>
                                <small style={{ color: '#64748b', fontSize: 12, marginTop: 6, display: 'block', lineHeight: 1.4 }}>
                                    💡 Tanggal ini akan dicatat sebagai <strong>Tanggal Efektif Pencairan / Realisasi Kas Keluar</strong> untuk seluruh {selectedPengajuanItems.length} item yang dipilih.
                                </small>
                            </div>

                            {/* Table List of Selected Items */}
                            <section className="utang-payment-section">
                                <SectionTitle icon={ClipboardList}>Rincian Pengajuan Pembayaran Terpilih ({selectedPengajuanItems.length} Item)</SectionTitle>
                                <div className="utang-history-wrap" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                    <table className="utang-history-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                                        <colgroup>
                                            <col style={{ width: '30%' }} />
                                            <col style={{ width: '22%' }} />
                                            <col style={{ width: '23%' }} />
                                            <col style={{ width: '25%' }} />
                                        </colgroup>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9' }}>
                                                <th style={{ padding: '10px 12px' }}>Vendor</th>
                                                <th style={{ padding: '10px 12px' }}>No. SPB</th>
                                                <th style={{ padding: '10px 12px' }}>No. Faktur</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Nominal Realisasi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPengajuanItems.map((item, idx) => (
                                                <tr key={item.id || idx}>
                                                    <td style={{ padding: '10px 12px', wordBreak: 'break-word' }}>
                                                        <strong>{item.vendor_nama || '-'}</strong>
                                                    </td>
                                                    <td className="utang-mono" style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>
                                                        {item.nomor_spb ? item.nomor_spb : (item.app_siaga_faktur_id ? `RJ-${item.app_siaga_faktur_id}` : '-')}
                                                    </td>
                                                    <td className="utang-mono" style={{ padding: '10px 12px', fontSize: 12 }}>
                                                        {item.nomor_faktur || '-'}
                                                    </td>
                                                    <td className="utang-mono bold" style={{ padding: '10px 12px', textAlign: 'right', color: '#059669', fontSize: 13 }}>
                                                        {money(item.jumlah_bayar)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>

                        <div className="utang-modal-actions" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setShowBulkRealisasiModal(false)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: '#059669', padding: '9px 20px', fontWeight: 600 }}>
                                <CheckCircle2 size={16} /> {saving ? 'Memproses...' : `Konfirmasi Realisasi (${selectedPengajuanItems.length} Item)`}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {editTanggalTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setEditTanggalTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={submitEditTanggal} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#fff', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)' }}>
                                <CalendarDays size={20} />
                            </span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Ubah Tanggal Realisasi</h2>
                                    {editTanggalTarget.sumber && <SumberBadge sumber={editTanggalTarget.sumber} />}
                                </div>
                                <p className="utang-modal-head-subtitle">Vendor: <strong>{editTanggalTarget.vendor_nama || '-'}</strong></p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setEditTanggalTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{editTanggalTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono">{editTanggalTarget.nomor_faktur || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Nominal Terbayar</span>
                                    <span className="val price">{money(editTanggalTarget.jumlah_bayar)}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">Tanggal Realisasi Saat Ini</span>
                                    <span className="val bold">{dateLabel(editTanggalTarget.tanggal_proses || editTanggalTarget.tanggal_realisasi)}</span>
                                </div>
                            </div>

                            <div className="utang-field-block" style={{ marginTop: 16 }}>
                                <label className="utang-field-lbl"><CalendarDays size={15} /> Tanggal Realisasi Pembayaran Baru <span className="utang-req">*</span></label>
                                <DateInput value={editTanggalForm.tanggal_realisasi} onChange={(v) => setEditTanggalForm({ tanggal_realisasi: v })} />
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setEditTanggalTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} style={{ background: '#0284c7', borderColor: '#0369a1' }}>
                                <CheckCircle2 size={16} /> {saving ? 'Memproses...' : 'Simpan Tanggal Baru'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {batalTarget && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setBatalTarget(null)}>
                    <form className="utang-modal payment" role="dialog" aria-modal="true" onSubmit={submitBatalkan} onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="utang-modal-head">
                            <span className="utang-modal-head-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)' }}>
                                <Ban size={20} />
                            </span>
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>Batalkan Catatan Utang</h2>
                                    {batalTarget.sumber && <SumberBadge sumber={batalTarget.sumber} />}
                                </div>
                                <p className="utang-modal-head-subtitle">Faktur akan dinonaktifkan tanpa menghapus riwayat audit</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setBatalTarget(null)} aria-label="Tutup"><X size={18} /></button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-verify-card">
                                <div className="utang-verify-row">
                                    <span className="lbl">Vendor</span>
                                    <span className="val bold">{batalTarget.vendor_nama || '-'}</span>
                                </div>
                                <div className="utang-verify-row">
                                    <span className="lbl">No. Faktur</span>
                                    <span className="val mono" style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'right' }}>{batalTarget.nomor_faktur || '-'}</span>
                                </div>
                                {batalTarget.nomor_spb && (
                                    <div className="utang-verify-row">
                                        <span className="lbl">No. SPB</span>
                                        <span className="val mono">{batalTarget.nomor_spb}</span>
                                    </div>
                                )}
                                <div className="utang-verify-row total">
                                    <span className="lbl">Nominal Faktur</span>
                                    <span className="val price">{money(batalTarget.nominal)}</span>
                                </div>
                            </div>

                            <div className="utang-notice-box warning">
                                <AlertTriangle size={18} className="utang-notice-box-icon" />
                                <div className="utang-notice-content">
                                    <strong>Perhatian:</strong> Faktur yang dibatalkan tidak akan lagi dihitung dalam total hutang aktif maupun pengajuan pembayaran. Data dan riwayat pencatatan tetap tersimpan demi audit trail pembukuan.
                                </div>
                            </div>

                            <div className="utang-field-block" style={{ marginTop: 14 }}>
                                <label className="utang-field-lbl">Alasan Pembatalan <span className="utang-req">*</span></label>
                                <textarea
                                    className="utang-input"
                                    autoFocus
                                    rows={3}
                                    placeholder="Tuliskan alasan pembatalan (contoh: Salah input nominal / Faktur ganda dengan ID #... / Salah vendor)..."
                                    value={batalAlasan}
                                    onChange={(e) => setBatalAlasan(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setBatalTarget(null)}>Batal</button>
                            <button className="utang-btn primary" type="submit" disabled={saving} onClick={submitBatalkan} style={{ background: '#dc2626', borderColor: '#b91c1c' }}>
                                <Ban size={16} /> {saving ? 'Memproses...' : 'Konfirmasi Batalkan Faktur'}
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
                        <tr key={key} className={isSelected ? 'utang-row-selected' : ''}>
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
                            <td>{['logistik', 'keuangan'].includes(item.sumber) ? <span className="utang-na">—</span> : dateLabel(item.tanggal_jatuh_tempo)}</td>
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

function ActiveTable({ items, onPayment, onDetail, onRetur, onEdit, onBatalkan, onSort }) {
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
                    const isDibatalkan = item.status === 'dibatalkan';
                    const isPaymentDisabled = isPendingApproval || isNoSisa || isDibatalkan;
                    const canRetur = item.status === 'belum_dibayar' && !isPendingApproval && Number(item.total_dibayar || 0) === 0;
                    const canEdit = Number(item.total_dibayar || 0) === 0 && item.status !== 'lunas' && !isPendingApproval && !isDibatalkan;
                    const canBatalkan = item.status !== 'lunas' && !isDibatalkan && Number(item.total_dibayar || 0) === 0;

                    return (
                    <tr key={item.id} className={isDibatalkan ? 'utang-row-dibatalkan' : ''}>
                        <td><SumberBadge sumber={item.sumber} /></td>
                        <td className="utang-name-cell">
                            <strong style={isDibatalkan ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{item.vendor_nama || '-'}</strong>
                            <small className="utang-subtext">SPB: {getRefNo(item)} • ID: {item.vendor_id}</small>
                        </td>
                        <td>
                            <strong className="utang-mono" style={isDibatalkan ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{item.nomor_faktur || '-'}</strong>
                            <small className="utang-subtext">Tgl: {dateLabel(item.tanggal_faktur)}</small>
                            {item.tanggal_jatuh_tempo && (
                                <small className="utang-subtext">Tempo: {dateLabel(item.tanggal_jatuh_tempo)}</small>
                            )}
                        </td>
                        <td>
                            {isDibatalkan ? (
                                <strong className="utang-mono" style={{ opacity: 0.5 }}>—</strong>
                            ) : (
                                <>
                                    <strong className="utang-mono">{calcUmurUtang(item.tanggal_titip)}</strong>
                                    {item.tanggal_titip ? (
                                        <small className="utang-subtext">Titip: {dateLabel(item.tanggal_titip)}</small>
                                    ) : (
                                        <small className="utang-subtext" style={{ opacity: 0.6 }}>-</small>
                                    )}
                                </>
                            )}
                        </td>
                        <td className="utang-right">
                            <strong className="utang-mono utang-sisa-main" style={isDibatalkan ? { color: '#94a3b8', textDecoration: 'line-through' } : undefined}>
                                {isDibatalkan ? 'Rp 0' : money(item.sisa_utang)}
                            </strong>
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
                                {item.status !== 'lunas' && !isDibatalkan && (
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
                                {canEdit && (
                                    <button
                                        className="utang-action-btn edit"
                                        type="button"
                                        onClick={() => onEdit(item)}
                                        title="Edit Catatan Utang"
                                    >
                                        <Pencil size={16} />
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
                                {canBatalkan && (
                                    <button
                                        className="utang-action-btn danger"
                                        type="button"
                                        onClick={() => onBatalkan(item)}
                                        title="Batalkan Catatan Utang / Faktur"
                                    >
                                        <Ban size={16} />
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

function PendingSubmissionTable({ items, onRealisasi, onCancel, onSort, selectedIds = [], onToggleAll, onToggleItem, selectedNominalTotal = 0 }) {
    const isAllChecked = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
    const pageTotal = useMemo(() => items.reduce((acc, item) => acc + Number(item.jumlah_bayar || 0), 0), [items]);
    const hasSelection = selectedIds.length > 0;

    return (
        <table className="utang-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
                <tr>
                    <th style={{ textAlign: 'center' }}>
                        <input
                            type="checkbox"
                            checked={isAllChecked}
                            onChange={(e) => onToggleAll && onToggleAll(e.target.checked, items)}
                            title="Pilih Semua di Halaman Ini"
                        />
                    </th>
                    <SortTh label="Vendor & SPB" field="vendor" onSort={onSort} align="left" />
                    <SortTh label="No Faktur & Tgl Rencana" field="nomor_faktur" onSort={onSort} align="left" />
                    <SortTh label="Nominal Pengajuan" field="jumlah_bayar" onSort={onSort} align="right" />
                    <th style={{ textAlign: 'left' }}>Keterangan</th>
                    <th style={{ textAlign: 'center' }}>Pengaju (Operator)</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item, idx) => {
                    const isChecked = selectedIds.includes(item.id);
                    return (
                    <tr key={item.id || item.app_siaga_faktur_id || idx} className={isChecked ? 'utang-row-selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => onToggleItem && onToggleItem(item.id)}
                            />
                        </td>
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
                    );
                })}
            </tbody>
            {items.length > 0 && (
                <tfoot>
                    <tr style={{
                        background: hasSelection ? 'rgba(16, 185, 129, 0.12)' : 'rgba(241, 245, 249, 0.6)',
                        borderTop: '2px solid rgba(16, 185, 129, 0.35)',
                        fontWeight: 750
                    }}>
                        <td colSpan={3} style={{ textAlign: 'right', padding: '10px 14px' }}>
                            {hasSelection ? (
                                <span style={{ color: '#047857', fontWeight: 800 }}>
                                    ✓ Total Terpilih ({selectedIds.length} Pengajuan):
                                </span>
                            ) : (
                                <span style={{ color: '#64748b' }}>
                                    Total Pengajuan Halaman Ini ({items.length} Faktur):
                                </span>
                            )}
                        </td>
                        <td className="utang-mono utang-right" style={{
                            textAlign: 'right',
                            padding: '10px 14px',
                            fontSize: '14px',
                            color: hasSelection ? '#047857' : 'inherit',
                            fontWeight: 850
                        }}>
                            {money(hasSelection ? selectedNominalTotal : pageTotal)}
                        </td>
                        <td colSpan={3}></td>
                    </tr>
                </tfoot>
            )}
        </table>
    );
}

function HistoryTable({ items, onSort, onEditTanggal, onBatalRealisasi }) {
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
                    <th style={{ textAlign: 'center' }}>Aksi</th>
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
                            <strong>{dateLabel(item.tanggal_proses || item.tanggal_realisasi)}</strong>
                            {item.tanggal_rencana_bayar && item.tanggal_rencana_bayar !== (item.tanggal_proses || item.tanggal_realisasi) && (
                                <small className="utang-subtext">Rencana: {dateLabel(item.tanggal_rencana_bayar)}</small>
                            )}
                        </td>
                        <td className={`utang-right utang-mono ${item.status === 'retur' ? '' : item.status === 'realisasi_lunas' ? 'utang-nominal-realisasi' : 'utang-nominal-sebagian'}`} style={item.status === 'retur' ? { color: '#e11d48', fontWeight: 'bold' } : item.status === 'batal' ? { color: '#94a3b8', textDecoration: 'line-through' } : undefined}>
                            {item.status === 'retur' ? `- ${money(item.jumlah_bayar)}` : money(item.jumlah_bayar)}
                        </td>
                        <td className="utang-right utang-mono">{money(item.running_sisa_utang)}</td>
                        <td>
                            {item.status === 'retur' && (
                                <span style={{ marginRight: 6 }}><StatusBadge status="retur" label="Retur Barang" /></span>
                            )}
                            {item.status === 'batal' && (
                                <span style={{ marginRight: 6, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>Dibatalkan</span>
                            )}
                            {item.keterangan || '-'}
                        </td>
                        <td className="utang-operator-cell">
                            <span className="utang-operator-badge" title={`Dicatat oleh ${item.created_by_name || '-'}`}>
                                <User size={13} style={{ opacity: 0.7 }} />
                                {item.created_by_name || '-'}
                            </span>
                        </td>
                        <td className="utang-right" style={{ textAlign: 'center' }}>
                            <div className="utang-action-group" style={{ justifyContent: 'center' }}>
                                {onEditTanggal && item.status !== 'batal' && (
                                    <button
                                        className="utang-action-btn detail"
                                        type="button"
                                        onClick={() => onEditTanggal(item)}
                                        title="Ubah Tanggal Realisasi Pembayaran"
                                    >
                                        <CalendarDays size={15} />
                                    </button>
                                )}
                                {onBatalRealisasi && item.status !== 'batal' && (
                                    <button
                                        className="utang-action-btn danger"
                                        type="button"
                                        onClick={() => onBatalRealisasi(item)}
                                        title="Batalkan Realisasi & Restorasi Utang"
                                    >
                                        <RotateCcw size={15} />
                                    </button>
                                )}
                            </div>
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
            {sumber === 'logistik' ? <Truck size={11} /> : sumber === 'keuangan' ? <Wallet size={11} /> : <ShieldCheck size={11} />}
            {SUMBER_LABELS[sumber] || sumber}
        </span>
    );
}

function SectionTitle({ children, icon: Icon }) {
    return <div className="utang-section-title">{Icon && <Icon size={14} />}{children}</div>;
}

function Info({ label, value }) {
    const valStr = String(value || '');
    const len = valStr.length;
    // Auto-scale font down smoothly if number is long (e.g. >= 100jt / milyaran)
    const fontSize = len >= 17 ? '11px' : len >= 15 ? '12px' : len >= 13 ? '13px' : '14.5px';

    return (
        <div className="utang-info-item">
            <span>{label}</span>
            <strong className="utang-mono" style={{ fontSize, whiteSpace: 'nowrap', letterSpacing: '-0.3px' }}>{value}</strong>
        </div>
    );
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
