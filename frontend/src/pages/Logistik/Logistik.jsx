import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Archive, BadgeDollarSign, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, CreditCard, Eye, FilePlus2, FileText, Hash, Layers, Lock, Package, Pencil, Plus, ReceiptText, RefreshCw, Search, Send, ShieldAlert, Tag, Trash2, Warehouse, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
import TableSkeleton from '../../components/TableSkeleton';
import '../Keuangan/InvoicePembiayaan.css';
import './Logistik.css';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => Number(value || 0).toLocaleString('id-ID');
const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatRefNo = (value) => {
    if (value === null || value === undefined) return '-';
    const str = String(value).trim();
    if (!str || str === '0' || str === 'null' || str === 'undefined') return '-';
    return str;
};
const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};
const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hasTime = String(value).includes(':') || String(value).includes('T');
    if (!hasTime) return `${day} ${month} ${year}`;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
};
const getError = (err, fallback) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail || data.error) return data.detail || data.error;
    return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`).join(' | ') || fallback;
};
const itemTotal = (items = []) => items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.harga || 0), 0);
const purchaseTotal = (row) => Number(row?.nilai || 0) || itemTotal(row?.items || []);
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
    const raw = String(value);
    const draftMatch = raw.match(/^(-?\d+)(\.(\d{0,2})?)$/);
    if (draftMatch) {
        const [, integer, decimal = ''] = draftMatch;
        return `Rp ${Number(integer || 0).toLocaleString('id-ID')}${decimal ? ',' + decimal.slice(1) : ''}`;
    }
    const amount = parseMoneyInput(value);
    if (!amount) return raw.endsWith('.') || raw.endsWith(',') ? 'Rp 0,' : '';
    const hasDecimal = !Number.isInteger(amount);
    return `Rp ${amount.toLocaleString('id-ID', { minimumFractionDigits: hasDecimal ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const normalizeMoneyDraft = (value) => {
    const raw = String(value || '').replace(/[^\d.,]/g, '');
    if (!raw) return '';
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma >= 0 || lastDot >= 0) {
        const decimalIndex = Math.max(lastComma, lastDot);
        const afterSeparator = raw.slice(decimalIndex + 1).replace(/\D/g, '');
        const beforeSeparator = raw.slice(0, decimalIndex).replace(/\D/g, '');
        const hasMultipleSeparators = (raw.match(/[.,]/g) || []).length > 1;
        if (decimalIndex === raw.length - 1) return `${beforeSeparator || '0'}.`;
        const isDecimalDraft = afterSeparator.length <= 2 && (!hasMultipleSeparators || afterSeparator.length > 0);
        if (!isDecimalDraft) return raw.replace(/\D/g, '');
        return `${beforeSeparator || '0'}.${afterSeparator.slice(0, 2)}`;
    }
    return raw.replace(/\D/g, '');
};

const TITLES = {
    barang: ['Daftar Barang', 'Kelola daftar barang gudang logistik dari RSSAMS.'],
    vendor: ['Master Vendor', 'Kelola rekanan/vendor untuk SPB dan penerimaan gudang logistik.'],
    spb: ['SPB', 'Surat Pesanan Barang gudang logistik.'],
    penerimaan: ['Penerimaan', 'Daftar barang masuk dari invoice rekanan.'],
    'barang-keluar': ['Barang Keluar', 'Mutasi barang keluar dari gudang logistik.'],
    permintaan: ['Permintaan', 'Permintaan barang dari unit.'],
    verifikasi: ['Verifikasi Permintaan', 'Persetujuan permintaan barang unit.'],
    'stok-minimum': ['Stok Minimum', 'Barang yang stoknya berada di bawah batas minimum.'],
    'kartu-stok': ['Kartu Stok', 'Riwayat masuk dan keluar per barang.'],
    opname: ['Opname', 'Catatan stock opname gudang logistik.'],
};

const emptyBarang = { nama_barang: '', kemasan: '', satuan: 'PCS', isi: 1, merk: '', golongan: '', stok_minimum: 0 };
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
const emptyVendor = { nama: '', alamat: '', telp: '', kc: '', kategori: '' };
const emptySpb = { tanggal: today(), id_rekanan: '', no_spb: '', metode_pembayaran: 'Kredit' };
const emptyItem = { barang: '', original_barang: '', qty: 1, isi: 1, harga: '', no_invoice: '', editing: false };
const UNIT_OPTIONS = ['PCS', 'BOX', 'BTL', 'KALENG', 'PAK', 'STRIP', 'SET', 'LITER', 'GRAM', 'METER'];
const emptyMutasi = { barang: '', tanggal: today(), ruang: '', qty: 1, keterangan: '' };
const emptyPermintaan = { barang: '', tanggal: today(), ruang: '', qty_minta: 1, catatan: '' };
const emptyOpname = { barang: '', tanggal: today(), real_stock: 0, keterangan: '' };

export default function Logistik() {
    const toast = useToast();
    const { section = 'barang' } = useParams();
    const title = TITLES[section] || TITLES.barang;
    const [rows, setRows] = useState([]);
    const [barangOptions, setBarangOptions] = useState([]);
    const [vendorOptions, setVendorOptions] = useState([]);
    const [ruangOptions, setRuangOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [modal, setModal] = useState(null);
    const [showAllBarang, setShowAllBarang] = useState(false);
    const [penerimaanFilter, setPenerimaanFilter] = useState('all');
    const [vendorSumberFilter, setVendorSumberFilter] = useState('all');
    const [vendorKategoriFilter, setVendorKategoriFilter] = useState('');
    const [detail, setDetail] = useState(null);
    const [confirmSubmitTarget, setConfirmSubmitTarget] = useState(null);
    const [activePurchase, setActivePurchase] = useState(null);
    const [kartuBarang, setKartuBarang] = useState('');
    const [kartuRows, setKartuRows] = useState([]);
    const [kartuSearch, setKartuSearch] = useState('');
    const [kartuJenis, setKartuJenis] = useState('all');
    const [kartuDari, setKartuDari] = useState('');
    const [kartuSampai, setKartuSampai] = useState('');

    const filteredKartuRows = useMemo(() => {
        return kartuRows.filter((r) => {
            if (kartuJenis !== 'all' && r.jenis !== kartuJenis) return false;
            if (kartuDari && r.tanggal < kartuDari) return false;
            if (kartuSampai && r.tanggal > kartuSampai) return false;
            if (kartuSearch) {
                const searchNeedle = kartuSearch.toLowerCase();
                const nomorMatch = String(r.nomor || '').toLowerCase().includes(searchNeedle);
                const ruangMatch = String(r.ruang || '').toLowerCase().includes(searchNeedle);
                if (!nomorMatch && !ruangMatch) return false;
            }
            return true;
        });
    }, [kartuRows, kartuJenis, kartuDari, kartuSampai, kartuSearch]);
    const [forms, setForms] = useState({
        barang: emptyBarang,
        vendor: emptyVendor,
        spb: emptySpb,
        item: emptyItem,
        mutasi: emptyMutasi,
        permintaan: emptyPermintaan,
        opname: emptyOpname,
    });

    const setForm = (key, patch) => setForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    const fetchOptions = useCallback(async () => {
        try {
            const [barangRes, ruangRes, vendorRes] = await Promise.all([
                api.get('/keuangan/logistik/barang/?page_size=2000'),
                api.get('/keuangan/logistik/barang/ruang-options/'),
                api.get('/keuangan/logistik/vendor/options/?sumber=logistik'),
            ]);
            setBarangOptions(getResults(barangRes.data));
            setRuangOptions(getResults(ruangRes.data));
            setVendorOptions(getResults(vendorRes.data));
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat pilihan logistik.'));
        }
    }, [toast]);

    const endpointFor = useCallback(() => {
        if (section === 'vendor') return '/keuangan/logistik/vendor/';
        if (section === 'spb' || section === 'penerimaan') return '/keuangan/logistik/pembelian/';
        if (section === 'barang-keluar') return '/keuangan/logistik/mutasi/';
        if (section === 'permintaan' || section === 'verifikasi') return '/keuangan/logistik/permintaan/';
        if (section === 'opname') return '/keuangan/logistik/opname/';
        return '/keuangan/logistik/barang/';
    }, [section]);

    const fetchRows = useCallback(async () => {
        if (section === 'kartu-stok') return;
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, { search });
            if (section === 'stok-minimum') params.minimum = true;
            if (section === 'verifikasi') params.status = 'menunggu';
            if (section === 'barang') params.show_all = showAllBarang ? 'true' : 'false';
            if (section === 'vendor') {
                if (vendorSumberFilter !== 'all') params.sumber = vendorSumberFilter;
                if (vendorKategoriFilter) params.kategori = vendorKategoriFilter;
            }
            const listRes = await api.get(endpointFor(), { params });
            setRows(getResults(listRes.data));
            setTotal(getCount(listRes.data));
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat data gudang logistik.'));
        } finally {
            setLoading(false);
        }
    }, [endpointFor, page, pageSize, search, section, showAllBarang, vendorSumberFilter, vendorKategoriFilter, toast]);

    const [searchParams] = useSearchParams();
    const urlSumber = searchParams.get('sumber');

    useEffect(() => {
        if (section === 'vendor') {
            if (urlSumber === 'logistik') {
                setVendorSumberFilter('logistik');
            } else if (urlSumber === 'semua' || urlSumber === 'all') {
                setVendorSumberFilter('all');
            } else if (urlSumber === 'farmasi') {
                setVendorSumberFilter('farmasi');
            }
        }
    }, [section, urlSumber]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);
    useEffect(() => { setPage(1); setRows([]); setKartuRows([]); }, [section]);
    useEffect(() => { fetchRows(); }, [fetchRows]);

    const openCreate = () => {
        const target = section === 'stok-minimum' ? 'barang' : section;
        if (target === 'barang') setForms((v) => ({ ...v, barang: emptyBarang }));
        if (target === 'vendor') setForms((v) => ({ ...v, vendor: emptyVendor }));
        if (target === 'spb' || target === 'penerimaan') setForms((v) => ({ ...v, spb: emptySpb }));
        if (target === 'barang-keluar') setForms((v) => ({ ...v, mutasi: emptyMutasi }));
        if (target === 'permintaan') setForms((v) => ({ ...v, permintaan: emptyPermintaan }));
        if (target === 'opname') setForms((v) => ({ ...v, opname: emptyOpname }));
        setModal(target === 'penerimaan' ? 'spb' : target);
    };

    const openEditBarang = (row) => {
        setForms((v) => ({
            ...v,
            barang: {
                id: row.id,
                nama_barang: row.nama_barang || '',
                kemasan: row.kemasan || '',
                satuan: row.satuan || 'PCS',
                isi: row.isi || 1,
                merk: row.merk || '',
                golongan: row.golongan || '',
                stok_minimum: row.stok_minimum || 0,
            },
        }));
        setModal('barang');
    };

    const saveBarang = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (forms.barang.id) {
                await api.patch(`/keuangan/logistik/barang/${forms.barang.id}/`, forms.barang);
                toast.success('Barang berhasil diperbarui.');
            } else {
                await api.post('/keuangan/logistik/barang/', forms.barang);
                toast.success('Barang berhasil ditambahkan.');
            }
            setModal(null);
            await Promise.all([fetchOptions(), fetchRows()]);
        } catch (err) {
            toast.error(getError(err, 'Gagal menyimpan barang.'));
        } finally {
            setSaving(false);
        }
    };

    const saveVendor = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = forms.vendor;
            if (payload.id) await api.patch(`/keuangan/logistik/vendor/${payload.id}/`, payload);
            else await api.post('/keuangan/logistik/vendor/', payload);
            toast.success('Vendor berhasil disimpan.');
            setModal(null);
            await Promise.all([fetchOptions(), fetchRows()]);
        } catch (err) {
            toast.error(getError(err, 'Gagal menyimpan vendor.'));
        } finally {
            setSaving(false);
        }
    };

    const saveSpb = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...forms.spb };
            // id_rekanan now stores vendor name (since penerimaan API only provides name).
            // Look up the numeric vendor ID from vendorOptions before sending to backend.
            const selectedVendorName = String(payload.id_rekanan || '').trim().toUpperCase();
            const matchedVendorObj = vendorOptions.find(
                (v) => String(v.nama || '').trim().toUpperCase() === selectedVendorName
            );
            if (matchedVendorObj) {
                payload.id_rekanan = String(matchedVendorObj.id);
                payload.pemasok = matchedVendorObj.nama;
            } else {
                // Fallback: treat value as name text
                payload.pemasok = payload.id_rekanan;
                delete payload.id_rekanan;
            }
            if (payload.id) {
                await api.patch(`/keuangan/logistik/pembelian/${payload.id}/`, payload);
                toast.success('Penerimaan berhasil diperbarui.');
            } else {
                await api.post('/keuangan/logistik/pembelian/', payload);
                toast.success(section === 'penerimaan' ? 'Penerimaan berhasil dibuat.' : 'SPB berhasil dibuat.');
            }
            setModal(null);
            await fetchRows();
        } catch (err) {
            toast.error(getError(err, payload_error_fallback(section)));
        } finally {
            setSaving(false);
        }
    };

    const saveItem = async (e) => {
        e.preventDefault();
        if (!activePurchase?.id) {
            toast.error('Pilih penerimaan terlebih dahulu.');
            return;
        }
        setSaving(true);
        try {
            const payload = { ...forms.item, harga: parseMoneyInput(forms.item.harga), pembelian: activePurchase.id };
            if (forms.item.editing) {
                await api.patch(`/keuangan/logistik/batch/${activePurchase.id}/`, payload);
                toast.success('Barang masuk berhasil diperbarui.');
            } else {
                await api.post('/keuangan/logistik/batch/', payload);
                toast.success('Barang masuk berhasil ditambahkan.');
            }
            setModal(null);
            await fetchRows();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Gagal menyimpan barang masuk.');
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const deleteItem = async (item) => {
        if (!window.confirm(`Hapus barang ${item.barang_nama} dari penerimaan ini?`)) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/logistik/batch/${item.id}/?barang=${item.barang}`);
            toast.success('Barang berhasil dihapus.');
            const res = await api.get(`/keuangan/logistik/pembelian/${activePurchase.id}/`);
            setActivePurchase(res.data);
            fetchRows();
        } catch (e) {
            toast.error('Gagal menghapus barang.');
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const submitToFinance = async (id) => {
        setSaving(true);
        try {
            await api.post(`/keuangan/logistik/pembelian/${id}/submit/`);
            toast.success('Penerimaan berhasil dikirim ke Keuangan.');
            setForms((v) => ({ ...v, spb: { ...v.spb, status: 'Y' } }));
            setActivePurchase((v) => v ? { ...v, status: 'Y' } : v);
            await fetchRows();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.message || 'Gagal mengirim ke Keuangan.');
        } finally {
            setSaving(false);
        }
    };

    const saveMutasi = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/keuangan/logistik/mutasi/', forms.mutasi);
            toast.success('Barang keluar berhasil disimpan.');
            setModal(null);
            await Promise.all([fetchRows(), fetchOptions()]);
        } catch (err) {
            toast.error(getError(err, 'Gagal menyimpan barang keluar.'));
        } finally {
            setSaving(false);
        }
    };

    const savePermintaan = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/keuangan/logistik/permintaan/', forms.permintaan);
            toast.success('Permintaan berhasil dibuat.');
            setModal(null);
            await fetchRows();
        } catch (err) {
            toast.error(getError(err, 'Gagal membuat permintaan.'));
        } finally {
            setSaving(false);
        }
    };

    const saveOpname = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/keuangan/logistik/opname/', forms.opname);
            toast.success('Opname berhasil dicatat.');
            setModal(null);
            await fetchRows();
        } catch (err) {
            toast.error(getError(err, 'Gagal mencatat opname.'));
        } finally {
            setSaving(false);
        }
    };

    const verify = async (row, status) => {
        const qty = status === 'disetujui' ? Number(window.prompt('Qty disetujui', row.qty_minta) || 0) : 0;
        try {
            await api.post(`/keuangan/logistik/permintaan/${row.id}/verifikasi/`, { status, qty_setuju: qty });
            toast.success('Permintaan berhasil diverifikasi.');
            await fetchRows();
        } catch (err) {
            toast.error(getError(err, 'Gagal verifikasi permintaan.'));
        }
    };

    const loadKartu = async (id = kartuBarang) => {
        if (!id) return setKartuRows([]);
        try {
            const res = await api.get(`/keuangan/logistik/barang/${id}/kartu-stok/`);
            setKartuRows(res.data || []);
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat kartu stok.'));
        }
    };

    const deleteBarang = async (row) => {
        if (!window.confirm(`Hapus ${row.nama_barang}?`)) return;
        try {
            await api.delete(`/keuangan/logistik/barang/${row.id}/`);
            toast.success('Barang dihapus.');
            await Promise.all([fetchRows(), fetchOptions()]);
        } catch (err) {
            toast.error(getError(err, 'Gagal menghapus barang.'));
        }
    };

    const deleteVendor = async (row) => {
        if (!window.confirm(`Hapus vendor ${row.nama}?`)) return;
        try {
            await api.delete(`/keuangan/logistik/vendor/${row.id}/`);
            toast.success('Vendor dihapus.');
            await Promise.all([fetchRows(), fetchOptions()]);
        } catch (err) {
            toast.error(getError(err, 'Gagal menghapus vendor.'));
        }
    };

    const canCreate = !['verifikasi', 'stok-minimum', 'kartu-stok', 'penerimaan'].includes(section);

    const filteredRows = useMemo(() => {
        if (section !== 'penerimaan') return rows;
        const query = search.toLowerCase();
        return rows.filter((row) => {
            const matchesSearch = !query || [row.nomor, row.pemasok, row.no_faktur, row.tanggal].some((value) => String(value || '').toLowerCase().includes(query));
            if (!matchesSearch) return false;
            if (penerimaanFilter === 'with_items') return (row.items || []).length > 0;
            if (penerimaanFilter === 'empty') return (row.items || []).length === 0;
            return true;
        });
    }, [rows, search, section, penerimaanFilter]);

    return (
        <div className="inv-page log-page">
            <section className="inv-hero">
                <div className="inv-title">
                    <span><Warehouse size={24} /></span>
                    <div>
                        <h1>{title[0]}</h1>
                        <p>{title[1]}</p>
                    </div>
                </div>
            </section>

            {section !== 'kartu-stok' && (
                <section className="inv-card table">
                    <div className="inv-card-head">
                        <div className="inv-card-title">
                            <h2>Daftar Data</h2>
                            <p>Total {fmt(total)} data</p>
                        </div>
                        <div className="inv-card-actions">
                            <button className="inv-btn soft" onClick={fetchRows} type="button"><RefreshCw size={16} /> Refresh</button>
                            {canCreate && <button className="inv-btn primary" onClick={openCreate} type="button"><FilePlus2 size={16} /> Tambah</button>}
                        </div>
                    </div>
                    <div className="dki-filter">
                        <div className="dki-filter-row-1">
                            <label className="dki-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari data..." /></label>
                            {section === 'barang' && (
                                <div className="log-filter-segment" role="group" aria-label="Filter barang">
                                    <button className={!showAllBarang ? 'active' : ''} type="button" onClick={() => setShowAllBarang(false)}>Stok tersedia</button>
                                    <button className={showAllBarang ? 'active' : ''} type="button" onClick={() => setShowAllBarang(true)}>Semua</button>
                                </div>
                            )}
                            {section === 'vendor' && (
                                <>
                                    <select
                                        className="inv-input"
                                        value={vendorKategoriFilter}
                                        onChange={(e) => setVendorKategoriFilter(e.target.value)}
                                        style={{ minWidth: 200, padding: '8px 12px', fontSize: '13px' }}
                                    >
                                        <option value="">Semua Kategori</option>
                                        {VENDOR_CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    <div className="log-filter-segment" role="group" aria-label="Filter vendor">
                                        <button className={vendorSumberFilter === 'all' ? 'active' : ''} type="button" onClick={() => setVendorSumberFilter('all')}>Semua Vendor</button>
                                        <button className={vendorSumberFilter === 'logistik' ? 'active' : ''} type="button" onClick={() => setVendorSumberFilter('logistik')}>Khusus Logistik</button>
                                        <button className={vendorSumberFilter === 'farmasi' ? 'active' : ''} type="button" onClick={() => setVendorSumberFilter('farmasi')}>Khusus Farmasi</button>
                                    </div>
                                </>
                            )}
                            {section === 'penerimaan' && (
                                <div className="log-filter-segment" role="group" aria-label="Filter penerimaan">
                                    <button className={penerimaanFilter === 'all' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('all')}>Semua</button>
                                    <button className={penerimaanFilter === 'with_items' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('with_items')}>Ada barang</button>
                                    <button className={penerimaanFilter === 'empty' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('empty')}>Kosong</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <DataTable
                        section={section}
                        rows={section === 'penerimaan' ? filteredRows : rows}
                        loading={loading}
                        onDetail={setDetail}
                        onItem={(row) => {
                            setDetail(null);
                            setActivePurchase(row);
                            setForms((v) => ({ ...v, item: { ...emptyItem, no_invoice: row.no_faktur || '' } }));
                            setModal('item');
                        }}
                        onEditVendor={(row) => { setForms((v) => ({ ...v, vendor: row })); setModal('vendor'); }}
                        onEditBarang={openEditBarang}
                        onEditPenerimaan={(row) => {
                            // Backend penerimaan only returns pemasok (name string), not a numeric vendor ID.
                            // We store the uppercase pemasok name as id_rekanan so the dropdown can match it.
                            const pemasokName = String(row.pemasok || '').trim();
                            setDetail(null);
                            setActivePurchase(row);
                            setForms((v) => ({
                                ...v,
                                spb: {
                                    ...emptySpb,
                                    id: row.id,
                                    tanggal: row.tanggal || today(),
                                    id_rekanan: pemasokName,
                                    no_spb: formatRefNo(row.no_faktur || row.no_spb),
                                    metode_pembayaran: row.metode_pembayaran || 'Kredit',
                                    status: row.status || 'N',
                                },
                            }));
                            setModal('spb');
                        }}
                        onDeleteBarang={deleteBarang}
                        onDeleteVendor={deleteVendor}
                        onVerify={verify}
                    />
                    <SimplePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="inv-page-btn" selectClassName="inv-page-select" />
                </section>
            )}

            {section === 'kartu-stok' && (
                <section className="inv-card table">
                    <div className="inv-card-head">
                        <div className="inv-card-title"><h2>Kartu Stok</h2><p>Pilih barang untuk melihat riwayat.</p></div>
                        <div className="inv-card-actions">
                            <select className="dki-select" value={kartuBarang} onChange={(e) => { setKartuBarang(e.target.value); loadKartu(e.target.value); }}>
                                <option value="">Pilih barang</option>
                                {barangOptions.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}
                            </select>
                            <button className="inv-btn soft" onClick={() => loadKartu()} type="button"><Eye size={16} /> Tampilkan</button>
                        </div>
                    </div>
                    {kartuBarang && (
                        <div className="dki-filter" style={{ padding: '12px 20px', borderBottom: '1px solid #edf2f7', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label className="dki-search" style={{ flex: '1 1 200px', margin: 0 }}>
                                <Search size={16} />
                                <input value={kartuSearch} onChange={(e) => setKartuSearch(e.target.value)} placeholder="Cari nomor atau ruang..." />
                            </label>
                            
                            <select className="dki-select" style={{ height: '36px', minWidth: '120px' }} value={kartuJenis} onChange={(e) => setKartuJenis(e.target.value)}>
                                <option value="all">Semua Jenis</option>
                                <option value="Masuk">Masuk</option>
                                <option value="Keluar">Keluar</option>
                            </select>

                            <DateRangePicker
                                dari={kartuDari}
                                sampai={kartuSampai}
                                onChange={({ dari, sampai }) => {
                                    setKartuDari(dari);
                                    setKartuSampai(sampai);
                                }}
                                placeholder="Pilih Periode Tanggal"
                            />

                            {(kartuSearch || kartuJenis !== 'all' || kartuDari || kartuSampai) && (
                                <button className="inv-btn soft" style={{ height: '36px', padding: '0 12px' }} onClick={() => { setKartuSearch(''); setKartuJenis('all'); setKartuDari(''); setKartuSampai(''); }} type="button">
                                    Reset Filter
                                </button>
                            )}
                        </div>
                    )}
                    <KartuTable rows={filteredKartuRows} />
                </section>
            )}

            {detail && (
                <Modal title={`Detail ${detail.nomor || detail.id}`} description="Informasi lengkap dan daftar barang." variant="detail" icon={<Eye size={20} />} onClose={() => setDetail(null)}>
                    <DetailInfo row={detail} section={section} />
                    <MiniItems items={detail.items || []} />
                </Modal>
            )}

            {modal === 'barang' && <BarangModal form={forms.barang} setForm={(p) => setForm('barang', p)} onSubmit={saveBarang} onClose={() => setModal(null)} saving={saving} />}
            {modal === 'vendor' && <VendorModal form={forms.vendor} setForm={(p) => setForm('vendor', p)} onSubmit={saveVendor} onClose={() => setModal(null)} saving={saving} />}
            {modal === 'spb' && (
                <SpbModal
                    mode={section}
                    form={forms.spb}
                    setForm={(p) => setForm('spb', p)}
                    vendors={vendorOptions}
                    purchase={activePurchase}
                    saving={saving}
                    onEditItem={(item) => {
                        setForms((v) => ({
                            ...v,
                            item: {
                                ...emptyItem,
                                editing: true,
                                id: item.id,
                                barang: item.barang,
                                original_barang: item.barang,
                                qty: item.qty,
                                isi: item.isi,
                                harga: item.harga,
                                no_invoice: activePurchase?.no_faktur || '',
                            },
                        }));
                        setModal('item');
                    }}
                    onDeleteItem={deleteItem}
                    onSubmitToFinance={() => setConfirmSubmitTarget(forms.spb)}
                    onSubmit={saveSpb}
                    onClose={() => setModal(null)}
                    onAddItem={() => {
                        setForms((v) => ({
                            ...v,
                            item: {
                                ...emptyItem,
                                editing: false,
                                no_invoice: forms.spb.no_spb || activePurchase?.no_faktur || '',
                            },
                        }));
                        setModal('item');
                    }}
                />
            )}
            {confirmSubmitTarget && (
                <ConfirmSubmitModal
                    target={confirmSubmitTarget}
                    onClose={() => setConfirmSubmitTarget(null)}
                    onConfirm={() => {
                        const id = confirmSubmitTarget.id;
                        setConfirmSubmitTarget(null);
                        submitToFinance(id);
                    }}
                    saving={saving}
                />
            )}
            {modal === 'item' && <ItemModal form={forms.item} setForm={(p) => setForm('item', p)} barang={barangOptions} onSubmit={saveItem} onClose={() => setModal(null)} purchase={activePurchase} saving={saving} />}
            {modal === 'barang-keluar' && <MutasiModal form={forms.mutasi} setForm={(p) => setForm('mutasi', p)} barang={barangOptions} ruang={ruangOptions} onSubmit={saveMutasi} onClose={() => setModal(null)} saving={saving} />}
            {modal === 'permintaan' && <PermintaanModal form={forms.permintaan} setForm={(p) => setForm('permintaan', p)} barang={barangOptions} ruang={ruangOptions} onSubmit={savePermintaan} onClose={() => setModal(null)} saving={saving} />}
            {modal === 'opname' && <OpnameModal form={forms.opname} setForm={(p) => setForm('opname', p)} barang={barangOptions} onSubmit={saveOpname} onClose={() => setModal(null)} saving={saving} />}
        </div>
    );
}

function payload_error_fallback(section) {
    return section === 'penerimaan' ? 'Gagal menyimpan penerimaan.' : 'Gagal menyimpan SPB.';
}

function DataTable({ section, rows, loading, onDetail, onItem, onEditVendor, onEditBarang, onEditPenerimaan, onDeleteBarang, onDeleteVendor, onVerify }) {
    const headers = {
        barang: ['Barang', 'Kemasan', 'Satuan', 'Merek', 'Stok', 'Minimum', 'Aksi'],
        vendor: ['Vendor & Kategori', 'Sumber', 'Alamat', 'Kontak & PIC', 'Aksi'],
        spb: ['No SPB', 'Tanggal', 'Vendor', 'Nilai', 'Aksi'],
        penerimaan: ['Tanggal', 'No SPB', 'Vendor', 'Qty Masuk', 'Grand Total', 'Status', 'Aksi'],
        'barang-keluar': ['Nomor', 'Tanggal', 'Barang', 'Ruang', 'Qty', 'Harga', 'Status'],
        permintaan: ['Tanggal', 'Barang', 'Ruang', 'Minta', 'Setuju', 'Status', 'Aksi'],
        verifikasi: ['Tanggal', 'Barang', 'Ruang', 'Minta', 'Setuju', 'Status', 'Aksi'],
        'stok-minimum': ['Barang', 'Kemasan', 'Satuan', 'Merek', 'Stok', 'Minimum', 'Aksi'],
        opname: ['Tanggal', 'Barang', 'Stok Sistem', 'Real', 'Selisih', 'Keterangan'],
    }[section] || [];

    if (loading) {
        return <TableSkeleton rows={8} cols={headers.length || 5} showHead />;
    }

    const body = () => {
        if (!rows.length) return <tr><td colSpan={headers.length} className="inv-empty">Belum ada data.</td></tr>;
        if (['barang', 'stok-minimum'].includes(section)) return rows.map((r) => (
            <tr key={r.id}>
                <td><strong>{r.nama_barang}</strong></td>
                <td>{r.kemasan || '-'} x {fmt(r.isi)}</td>
                <td>{r.satuan}</td>
                <td>{r.merk || '-'}</td>
                <td><Badge danger={r.stok_minimum_alert}>{fmt(r.stok)}</Badge></td>
                <td>{fmt(r.stok_minimum)}</td>
                <td>
                    <div className="inv-row-actions">
                        <button onClick={() => onEditBarang(r)} title="Edit barang"><Pencil size={15} /></button>
                        <button onClick={() => onDeleteBarang(r)} title="Hapus barang"><Trash2 size={15} /></button>
                    </div>
                </td>
            </tr>
        ));
        if (section === 'vendor') return rows.map((r) => (
            <tr key={r.id}>
                <td>
                    <div className="log-vendor-name-cell">
                        <strong>{r.nama}</strong>
                        {r.kategori && <small className="log-vendor-cat">{r.kategori}</small>}
                    </div>
                </td>
                <td><Badge info={r.sumber === 'logistik'}>{r.sumber === 'logistik' ? 'Logistik' : 'Farmasi'}</Badge></td>
                <td>
                    <div className="log-vendor-address-cell" title={r.alamat || '-'}>
                        {r.alamat || '-'}
                    </div>
                </td>
                <td>
                    <div className="log-vendor-contact-cell">
                        <span>{r.telp || '-'}</span>
                        {r.kc && <small className="log-vendor-pic">PIC: {r.kc}</small>}
                    </div>
                </td>
                <td>
                    <div className="inv-row-actions">
                        <button onClick={() => onEditVendor(r)} title="Edit vendor"><Pencil size={15} /></button>
                        <button onClick={() => onDeleteVendor(r)} title="Hapus vendor"><Trash2 size={15} /></button>
                    </div>
                </td>
            </tr>
        ));
        if (section === 'spb') return rows.map((r) => <tr key={r.id}><td><strong>{r.nomor}</strong></td><td>{r.tanggal || '-'}</td><td>{r.pemasok || '-'}</td><td>{money(purchaseTotal(r))}</td><td><div className="inv-row-actions"><button onClick={() => onDetail(r)} title="Lihat detail SPB"><Eye size={15} /></button></div></td></tr>);
        if (section === 'penerimaan') return rows.map((r) => {
            const items = r.items || [];
            const qtyMasuk = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.isi || 0), 0);
            const grandTotal = purchaseTotal(r);
            const isCash = r.metode_pembayaran === 'Cash';
            const isSubmitted = r.status === 'Y';
            return (
                <tr key={r.id}>
                    <td>{r.tanggal || '-'}</td>
                    <td><strong>{r.nomor}</strong></td>
                    <td>{r.pemasok || '-'}</td>
                    <td>{items.length ? fmt(qtyMasuk) : '-'}</td>
                    <td>{money(grandTotal)}</td>
                    <td>
                        {isCash ? (
                            <Badge info>Tunai (Selesai)</Badge>
                        ) : isSubmitted ? (
                            <Badge success>Dikirim ke Keuangan</Badge>
                        ) : (
                            <Badge warning>Draft (Belum Kirim)</Badge>
                        )}
                    </td>
                    <td><div className="inv-row-actions"><button onClick={() => onDetail(r)} title="Lihat penerimaan"><Eye size={15} /></button><button onClick={() => onEditPenerimaan(r)} title={isSubmitted ? "Lihat invoice penerimaan (terkunci)" : "Edit invoice penerimaan"}><Pencil size={15} /></button></div></td>
                </tr>
            );
        });
        if (section === 'barang-keluar') return rows.map((r) => <tr key={r.id}><td>{r.nomor}</td><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{r.ruang}</td><td>{fmt(r.qty)} {r.satuan}</td><td>{money(r.harga)}</td><td><Badge>{r.status}</Badge></td></tr>);
        if (['permintaan', 'verifikasi'].includes(section)) return rows.map((r) => <tr key={r.id}><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{r.ruang}</td><td>{fmt(r.qty_minta)} {r.satuan}</td><td>{fmt(r.qty_setuju)}</td><td><Badge>{r.status_label || r.status}</Badge></td><td>{section === 'verifikasi' ? <div className="inv-row-actions"><button onClick={() => onVerify(r, 'disetujui')}><CheckCircle2 size={15} /></button><button onClick={() => onVerify(r, 'ditolak')}><X size={15} /></button></div> : '-'}</td></tr>);
        if (section === 'opname') return rows.map((r) => <tr key={r.id}><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{fmt(r.stok_sistem)}</td><td>{fmt(r.real_stock)}</td><td>{fmt(r.selisih)}</td><td>{r.keterangan || '-'}</td></tr>);
        return null;
    };

    return <div className="inv-table-wrap table-fade-in"><table className="inv-table log-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{body()}</tbody></table></div>;
}

function Badge({ children, danger }) {
    return <span className={`inv-status ${danger ? 'danger' : 'success'}`}>{children}</span>;
}

function DetailInfo({ row, section }) {
    const isPurchase = ['spb', 'penerimaan'].includes(section);
    if (!isPurchase) {
        const fields = Object.entries(row)
            .filter(([key]) => !['items', 'status'].includes(key))
            .slice(0, 12)
            .map(([key, value]) => [humanLabel(key), value]);
        return (
            <div className="log-detail-grid">
                {fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
            </div>
        );
    }

    return (
        <div className="log-detail-wrapper">
            <h3 className="inv-section-title"><ReceiptText size={16} /> Informasi Penerimaan Logistik</h3>
            <div className="inv-info-grid log-info-grid-3">
                <div className="inv-info-item">
                    <span>No SPB / Ref</span>
                    <strong className="inv-mono">{formatRefNo(row.nomor || row.id_spb || row.id)}</strong>
                </div>
                <div className="inv-info-item">
                    <span>Tanggal Penerimaan</span>
                    <strong>{formatDate(row.tanggal)}</strong>
                </div>
                <div className="inv-info-item">
                    <span>Vendor / Rekanan</span>
                    <strong>{row.pemasok || '-'}</strong>
                </div>
                <div className="inv-info-item">
                    <span>No Invoice / Faktur</span>
                    <strong>{formatRefNo(row.no_faktur || row.no_spb || row.no_invoice)}</strong>
                </div>
                <div className="inv-info-item">
                    <span>Metode Pembayaran</span>
                    <strong>{row.metode_pembayaran || 'Kredit'}</strong>
                </div>
                <div className="inv-info-item">
                    <span>Waktu Input</span>
                    <strong>{formatDateTime(row.created_at)}</strong>
                </div>
            </div>
            <div className="log-total-banner">
                <span><ReceiptText size={18} /> Grand Total Nilai Penerimaan</span>
                <strong className="inv-mono">{money(purchaseTotal(row))}</strong>
            </div>
        </div>
    );
}

function humanLabel(key) {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Modal({ title, description = 'Lengkapi data lalu simpan.', children, onClose, variant = 'create', icon = <FilePlus2 size={20} /> }) {
    const isDetail = variant === 'detail';

    useEffect(() => {
        const originalStyle = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, []);

    return (
        <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div className={`inv-modal ${isDetail ? 'detail' : 'create'} log-modal ${variant}`.trim()} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                <div className={`inv-modal-head ${isDetail ? 'inv-detail-head' : ''}`}>
                    <div className={isDetail ? 'inv-detail-title' : 'log-modal-title'}>
                        <span className={`inv-modal-head-icon ${isDetail ? 'detail' : ''}`}>{icon}</span>
                        <div>
                            <h2>{title}</h2>
                            <p>{description}</p>
                        </div>
                    </div>
                    <button className="inv-close" type="button" onClick={onClose}><X size={18} /> Tutup</button>
                </div>
                <div className={isDetail ? 'inv-detail-body' : 'inv-modal-body'}>{children}</div>
            </div>
        </div>
    );
}

function ConfirmSubmitModal({ target, onClose, onConfirm, saving }) {
    useEffect(() => {
        const originalStyle = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, []);

    return (
        <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div className="log-confirm-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
                <button className="log-confirm-close" type="button" onClick={onClose} aria-label="Tutup">
                    <X size={18} />
                </button>

                <div className="log-confirm-icon-wrapper">
                    <div className="log-confirm-icon-circle">
                        <Send size={24} />
                    </div>
                </div>

                <div className="log-confirm-body">
                    <h3>Kirim ke Keuangan?</h3>
                    <p className="log-confirm-sub">
                        Faktur <strong>{target?.no_spb || target?.id}</strong> akan diserahkan ke antrean <em>Catatan Utang - Menunggu Verifikasi</em>.
                    </p>

                    <div className="log-confirm-warning-card">
                        <div className="log-confirm-warning-header">
                            <Lock size={14} />
                            <span>Status Akan Terkunci</span>
                        </div>
                        <p>Setelah dikirim, status penerimaan ini akan <strong>Terkunci</strong> dan data barang tidak dapat diubah lagi oleh Logistik.</p>
                    </div>
                </div>

                <div className="log-confirm-actions">
                    <button className="inv-btn soft" type="button" onClick={onClose} disabled={saving}>
                        Batal
                    </button>
                    <button className="inv-btn success" type="button" onClick={onConfirm} disabled={saving}>
                        <Send size={16} /> Ya, Kirim ke Keuangan
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children, className = '' }) {
    return <label className={`inv-field ${className}`.trim()}>{label}{children}</label>;
}

function SearchableBarangSelect({ options = [], value = '', onChange }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const selected = useMemo(() => options.find((item) => String(item.id) === String(value)), [options, value]);
    const filtered = useMemo(() => {
        const needle = query.toLowerCase().trim();
        if (!needle) return options;
        return options.filter((item) => [item.nama_barang, item.merk, item.kemasan, item.satuan, item.id]
            .some((part) => String(part || '').toLowerCase().includes(needle)));
    }, [options, query]);

    useEffect(() => {
        if (!open) return undefined;
        const close = () => {
            setOpen(false);
            setQuery('');
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [open]);

    useEffect(() => { setActiveIndex(0); }, [query, open]);

    const selectItem = (item) => {
        if (!item) return;
        onChange?.(item.id);
        setOpen(false);
        setQuery('');
    };

    const handleKeyDown = (event) => {
        if (!open && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
            setOpen(true);
            event.preventDefault();
            return;
        }
        if (!open) return;
        if (event.key === 'ArrowDown') {
            setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            setActiveIndex((index) => Math.max(index - 1, 0));
            event.preventDefault();
        } else if (event.key === 'Enter') {
            selectItem(filtered[activeIndex]);
            event.preventDefault();
        } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
            event.preventDefault();
        }
    };

    return (
        <div className="log-search-select" onClick={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
            <div className={`log-search-control${open ? ' open' : ''}`} onClick={() => setOpen(true)}>
                <Search size={15} />
                <input
                    value={open ? query : selected?.nama_barang || ''}
                    placeholder="Cari / pilih barang"
                    onFocus={() => setOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    required
                />
                <ChevronDown size={16} className={open ? 'open' : ''} />
            </div>
            {open && (
                <div className="log-search-options" role="listbox">
                    {filtered.length === 0 ? <div className="log-search-empty">Barang tidak ditemukan</div> : filtered.map((item, index) => {
                        const isSelected = String(item.id) === String(value);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`${index === activeIndex ? 'active' : ''}${isSelected ? ' selected' : ''}`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectItem(item);
                                }}
                                role="option"
                                aria-selected={isSelected}
                            >
                                <span><strong>{item.nama_barang}</strong><small>{item.kemasan || '-'} x {fmt(item.isi)} | stok {fmt(item.stok)} {item.satuan || ''}</small></span>
                                {isSelected && <Check size={15} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function BarangModal({ form, setForm, onSubmit, onClose, saving }) {
    const isEdit = Boolean(form.id);
    return (
        <Modal
            title={isEdit ? 'Edit Barang' : 'Tambah Barang'}
            description={isEdit ? 'Perbarui master barang logistik.' : 'Isi rincian data barang logistik baru.'}
            onClose={onClose}
            variant="barang-compact"
            icon={isEdit ? <Pencil size={20} /> : <FilePlus2 size={20} />}
        >
            <form onSubmit={onSubmit}>
                <div className="log-barang-form">
                    <div className="log-form-row">
                        <label className="log-field-main">
                            <span className="inv-field-label"><Package size={15} /> Nama Barang</span>
                            <input className="inv-input" required value={form.nama_barang} onChange={(e) => setForm({ nama_barang: e.target.value })} placeholder="Masukkan nama barang" />
                        </label>
                        <label className="log-field-sub">
                            <span className="inv-field-label"><Tag size={15} /> Merek</span>
                            <input className="inv-input" value={form.merk} onChange={(e) => setForm({ merk: e.target.value })} placeholder="Merek / Brand" />
                        </label>
                    </div>
                    <div className="log-form-grid-2">
                        <label>
                            <span className="inv-field-label"><Layers size={15} /> Satuan</span>
                            <select className="inv-input" required value={form.satuan} onChange={(e) => setForm({ satuan: e.target.value })}>
                                {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className="inv-field-label"><Archive size={15} /> Kemasan</span>
                            <input className="inv-input" value={form.kemasan} onChange={(e) => setForm({ kemasan: e.target.value })} placeholder="Contoh: Box / Botol" />
                        </label>
                        <label>
                            <span className="inv-field-label"><Hash size={15} /> Isi per Kemasan</span>
                            <input className="inv-input" type="number" min="1" value={form.isi} onChange={(e) => setForm({ isi: e.target.value })} placeholder="1" />
                        </label>
                        <label>
                            <span className="inv-field-label"><ShieldAlert size={15} /> Stok Minimum</span>
                            <input className="inv-input" type="number" min="0" value={form.stok_minimum} onChange={(e) => setForm({ stok_minimum: e.target.value })} placeholder="0" />
                        </label>
                    </div>
                </div>
                <ModalFoot onClose={onClose} saving={saving} submitLabel={isEdit ? 'Simpan Perubahan' : 'Simpan Barang'} />
            </form>
        </Modal>
    );
}

function VendorModal({ form, setForm, onSubmit, onClose, saving }) {
    return (
        <Modal title={form.id ? 'Edit Vendor' : 'Tambah Vendor'} description="Lengkapi data rekanan, PIC, dan kategori." onClose={onClose} icon={<Pencil size={20} />}>
            <form onSubmit={onSubmit}>
                <div className="inv-form-grid">
                    <Field label="Nama Vendor"><input className="inv-input" required value={form.nama} onChange={(e) => setForm({ nama: e.target.value })} /></Field>
                    <Field label="Kategori Rekanan">
                        <select className="inv-input" required value={form.kategori} onChange={(e) => setForm({ kategori: e.target.value })}>
                            <option value="">-- Pilih Kategori --</option>
                            {VENDOR_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </Field>
                    <Field label="Telepon"><input className="inv-input" value={form.telp} onChange={(e) => setForm({ telp: e.target.value })} /></Field>
                    <Field label="Alamat"><input className="inv-input" value={form.alamat} onChange={(e) => setForm({ alamat: e.target.value })} /></Field>
                    <Field label="Nama PIC"><input className="inv-input" value={form.kc} onChange={(e) => setForm({ kc: e.target.value })} /></Field>
                </div>
                <ModalFoot onClose={onClose} saving={saving} />
            </form>
        </Modal>
    );
}

function SpbModal({ mode = 'spb', form, setForm, vendors, purchase, onEditItem, onDeleteItem, onSubmitToFinance, onAddItem, onSubmit, onClose, saving }) {
    const isPenerimaan = mode === 'penerimaan';
    const isLocked = isPenerimaan && form.metode_pembayaran !== 'Cash' && (form.status === 'Y' || purchase?.status === 'Y');
    const items = purchase?.items || [];
    const hasItems = items.length > 0;
    const canSubmitToFinance = isPenerimaan && !isLocked && form.metode_pembayaran !== 'Cash' && hasItems;

    // For penerimaan mode: the existing record only stores vendor name (pemasok), not numeric ID.
    // So we use the normalized uppercase vendor name as the select value for reliable matching.
    const vendorOptions = useMemo(() => [
        { value: '', label: 'Pilih vendor' },
        ...vendors.map((v) => ({
            value: String(v.nama || v.label || '').trim().toUpperCase(),
            label: v.nama || v.label || String(v.id || ''),
        })),
    ], [vendors]);

    // Normalize the stored value for comparison (uppercase, trimmed)
    const normalizedVendorValue = useMemo(() => {
        const raw = String(form.id_rekanan || '').trim().toUpperCase();
        return raw;
    }, [form.id_rekanan]);

    return (
        <Modal
            title={isPenerimaan ? (isLocked ? 'Detail Penerimaan (Terkunci)' : 'Edit Penerimaan') : 'Tambah SPB'}
            description={isPenerimaan ? (isLocked ? 'Faktur ini telah dikirim ke Keuangan dan tidak dapat diubah.' : 'Perbarui invoice dan daftar barang penerimaan.') : 'Isi informasi SPB baru untuk dasar penerimaan gudang.'}
            onClose={onClose}
            variant={isPenerimaan ? 'create' : 'spb-compact'}
            icon={isPenerimaan ? (isLocked ? <Lock size={20} /> : <Pencil size={20} />) : <FilePlus2 size={20} />}
        >
            <form onSubmit={onSubmit}>
                {isPenerimaan ? (
                    <div className="log-edit-penerimaan-vertical">
                        {isLocked && (
                            <div className="log-locked-banner">
                                <Lock size={18} />
                                <span>Penerimaan ini telah dikirim ke Keuangan dan statusnya <strong>Terkunci</strong>. Data tidak dapat diubah lagi.</span>
                            </div>
                        )}
                        <div className="log-edit-header-panel">
                            <label>
                                <span className="inv-field-label"><CalendarDays size={15} /> Tanggal</span>
                                <DateField value={form.tanggal} onChange={(value) => setForm({ tanggal: value })} disabled={isLocked} />
                            </label>
                            <label>
                                <span className="inv-field-label"><CreditCard size={15} /> Pembayaran</span>
                                <select className="inv-input" value={form.metode_pembayaran || 'Kredit'} onChange={(e) => setForm({ metode_pembayaran: e.target.value })} disabled={isLocked}>
                                    <option value="Kredit">Kredit</option>
                                    <option value="Cash">Cash</option>
                                </select>
                            </label>
                            <label className="log-edit-vendor-full">
                                <span className="inv-field-label"><Building2 size={15} /> Vendor / Rekanan</span>
                                <SearchablePembiayaanSelect
                                    options={vendorOptions}
                                    value={normalizedVendorValue}
                                    onChange={(value) => setForm({ id_rekanan: value })}
                                    placeholder="Pilih vendor"
                                    disabled={isLocked}
                                />
                            </label>
                            <label className="log-edit-invoice-full">
                                <span className="inv-field-label"><FileText size={15} /> No Invoice / Faktur</span>
                                <input className="inv-input" value={form.no_spb} onChange={(e) => setForm({ no_spb: e.target.value })} placeholder="Masukkan no invoice" title={form.no_spb || ''} disabled={isLocked} />
                            </label>
                        </div>
                        <div className="log-edit-table-container">
                            <ItemsTable
                                items={items}
                                editable={!isLocked}
                                onEdit={onEditItem}
                                onDelete={onDeleteItem}
                                onAddItem={onAddItem}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="log-spb-form">
                        <div className="log-spb-row">
                            <label className="inv-date-compact">
                                <span className="inv-field-label"><CalendarDays size={15} /> Tanggal SPB</span>
                                <DateField value={form.tanggal} onChange={(value) => setForm({ tanggal: value })} />
                            </label>
                            <label>
                                <span className="inv-field-label"><CreditCard size={15} /> Metode Pembayaran</span>
                                <select className="inv-input" value={form.metode_pembayaran || 'Kredit'} onChange={(e) => setForm({ metode_pembayaran: e.target.value })}>
                                    <option value="Kredit">Kredit</option>
                                    <option value="Cash">Cash</option>
                                </select>
                            </label>
                        </div>
                        <label className="log-spb-vendor">
                            <span className="inv-field-label"><Building2 size={15} /> Vendor / Rekanan</span>
                            <SearchablePembiayaanSelect
                                options={vendorOptions}
                                value={form.id_rekanan}
                                onChange={(value) => setForm({ id_rekanan: value })}
                                placeholder="Pilih vendor"
                            />
                        </label>
                    </div>
                )}
                <div className="inv-modal-actions">
                    <button className="inv-btn soft" type="button" onClick={onClose} disabled={saving}>Tutup</button>
                    {canSubmitToFinance && (
                        <button className="inv-btn success" type="button" onClick={() => onSubmitToFinance(form.id)} disabled={saving}>
                            <Send size={16} /> Kirim ke Keuangan
                        </button>
                    )}
                    {!isLocked && (
                        <button className="inv-btn primary" type="submit" disabled={saving}>
                            <FilePlus2 size={16} /> {saving ? 'Menyimpan...' : 'Simpan Penerimaan'}
                        </button>
                    )}
                </div>
            </form>
        </Modal>
    );
}

function ItemModal({ form, setForm, barang, onSubmit, onClose, purchase, saving }) {
    const qtyMasuk = Number(form.qty || 0) * Number(form.isi || 0);
    const harga = parseMoneyInput(form.harga);
    const grandTotal = Number(form.qty || 0) * harga;
    const isCalculated = Boolean(form.barang && Number(form.qty || 0) > 0 && harga > 0);

    return (
        <Modal title={form.editing ? 'Edit Barang Masuk' : 'Tambah Barang Masuk'} description="Isi rincian barang yang masuk pada invoice ini." onClose={onClose} icon={form.editing ? <Pencil size={20} /> : <Plus size={20} />}>
            <form onSubmit={onSubmit}>
                <div className="log-item-entry-layout">
                    <div className="log-item-sidebar">
                        <h3>Informasi Penerimaan</h3>
                        <div className="log-item-meta-list">
                            <div className="log-item-meta">
                                <span>No SPB</span>
                                <strong>{formatRefNo(purchase?.nomor)}</strong>
                            </div>
                            <div className="log-item-meta">
                                <span>Vendor / Rekanan</span>
                                <strong>{purchase?.pemasok || '-'}</strong>
                            </div>
                            <div className="log-item-meta">
                                <span>Tanggal</span>
                                <strong>{formatDate(purchase?.tanggal)}</strong>
                            </div>
                            <div className="log-item-meta">
                                <span>No Invoice / Faktur</span>
                                <strong>{formatRefNo(form.no_invoice || purchase?.no_faktur || purchase?.no_spb)}</strong>
                            </div>
                        </div>
                    </div>
                    <div className="log-item-form-area">
                        <div className="log-item-form-grid">
                            <label className="log-item-form-full">
                                <span className="inv-field-label"><Package size={15} /> Pilih Barang</span>
                                <SearchableBarangSelect 
                                    options={barang} 
                                    value={form.barang} 
                                    onChange={(value) => {
                                        const selected = barang.find((b) => String(b.id) === String(value));
                                        setForm({ 
                                            barang: value,
                                            isi: selected?.isi || 1
                                        });
                                    }} 
                                />
                            </label>
                            <label>
                                <span className="inv-field-label"><Hash size={15} /> Qty Kemasan</span>
                                <input className="inv-input inv-input-left" type="number" min="1" required value={form.qty} onChange={(e) => setForm({ qty: e.target.value })} placeholder="1" />
                            </label>
                            <label>
                                <span className="inv-field-label"><Archive size={15} /> Isi per Kemasan</span>
                                <input className="inv-input inv-input-left" type="number" readOnly value={form.isi} placeholder="1" title="Sesuai data master barang" style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed', borderColor: '#e2e8f0' }} />
                            </label>
                            <label className="log-item-form-full">
                                <span className="inv-field-label"><BadgeDollarSign size={15} /> Harga Satuan</span>
                                <input className="inv-input inv-input-right" type="text" inputMode="decimal" placeholder="Rp 0" value={formatMoneyInput(form.harga)} onChange={(e) => setForm({ harga: normalizeMoneyDraft(e.target.value) })} />
                            </label>
                        </div>
                        <div className="log-item-calc-box">
                            <div>
                                <span>Total Qty Masuk</span>
                                <strong>{fmt(qtyMasuk)}</strong>
                            </div>
                            <div>
                                <span>Qty Kemasan</span>
                                <strong>{fmt(form.qty || 0)}</strong>
                            </div>
                            <div>
                                <span>Harga Satuan</span>
                                <strong>{harga ? money(harga) : 'Rp -'}</strong>
                            </div>
                            <div className={`total ${isCalculated ? 'ready' : 'muted'}`}>
                                <span>Grand Total</span>
                                <strong>{isCalculated ? money(grandTotal) : 'Rp -'}</strong>
                                {!isCalculated && <small>Belum dihitung</small>}
                            </div>
                        </div>
                    </div>
                </div>
                <ModalFoot onClose={onClose} saving={saving} submitLabel={form.editing ? 'Simpan Barang' : 'Tambah Barang'} />
            </form>
        </Modal>
    );
}

function MutasiModal({ form, setForm, barang, ruang, onSubmit, onClose, saving }) {
    return (
        <Modal title="Barang Keluar" onClose={onClose}>
            <form onSubmit={onSubmit}>
                <div className="inv-form-grid">
                    <Field label="Barang">
                        <select className="inv-input" required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}>
                            <option value="">Pilih barang</option>
                            {barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang} - stok {fmt(b.stok)}</option>)}
                        </select>
                    </Field>
                    <Field label="Tanggal"><input className="inv-input" type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field>
                    <Field label="Ruang">
                        <select className="inv-input" required value={form.ruang} onChange={(e) => setForm({ ruang: e.target.value })}>
                            <option value="">Pilih ruang</option>
                            {ruang.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                        </select>
                    </Field>
                    <Field label="Qty"><input className="inv-input" type="number" min="1" value={form.qty} onChange={(e) => setForm({ qty: e.target.value })} /></Field>
                    <Field label="Keterangan"><input className="inv-input" value={form.keterangan} onChange={(e) => setForm({ keterangan: e.target.value })} /></Field>
                </div>
                <ModalFoot onClose={onClose} saving={saving} />
            </form>
        </Modal>
    );
}

function PermintaanModal({ form, setForm, barang, ruang, onSubmit, onClose, saving }) {
    return (
        <Modal title="Permintaan Barang" onClose={onClose}>
            <form onSubmit={onSubmit}>
                <div className="inv-form-grid">
                    <Field label="Barang">
                        <select className="inv-input" required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}>
                            <option value="">Pilih barang</option>
                            {barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}
                        </select>
                    </Field>
                    <Field label="Tanggal"><input className="inv-input" type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field>
                    <Field label="Ruang">
                        <select className="inv-input" required value={form.ruang} onChange={(e) => setForm({ ruang: e.target.value })}>
                            <option value="">Pilih ruang</option>
                            {ruang.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                        </select>
                    </Field>
                    <Field label="Qty Minta"><input className="inv-input" type="number" min="1" value={form.qty_minta} onChange={(e) => setForm({ qty_minta: e.target.value })} /></Field>
                    <Field label="Catatan"><input className="inv-input" value={form.catatan} onChange={(e) => setForm({ catatan: e.target.value })} /></Field>
                </div>
                <ModalFoot onClose={onClose} saving={saving} />
            </form>
        </Modal>
    );
}

function OpnameModal({ form, setForm, barang, onSubmit, onClose, saving }) {
    return (
        <Modal title="Stock Opname" onClose={onClose}>
            <form onSubmit={onSubmit}>
                <div className="inv-form-grid">
                    <Field label="Barang">
                        <select className="inv-input" required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}>
                            <option value="">Pilih barang</option>
                            {barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}
                        </select>
                    </Field>
                    <Field label="Tanggal"><input className="inv-input" type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field>
                    <Field label="Real Stock"><input className="inv-input" type="number" value={form.real_stock} onChange={(e) => setForm({ real_stock: e.target.value })} /></Field>
                    <Field label="Keterangan"><input className="inv-input" value={form.keterangan} onChange={(e) => setForm({ keterangan: e.target.value })} /></Field>
                </div>
                <ModalFoot onClose={onClose} saving={saving} />
            </form>
        </Modal>
    );
}

function ModalFoot({ onClose, submitLabel = 'Simpan', saving = false }) {
    return (
        <div className="inv-modal-actions">
            <button className="inv-btn soft" type="button" onClick={onClose} disabled={saving}>Batal</button>
            <button className="inv-btn primary" type="submit" disabled={saving}>
                <FilePlus2 size={16} /> {saving ? 'Menyimpan...' : submitLabel}
            </button>
        </div>
    );
}

function MiniItems({ items }) {
    return <ItemsTable items={items} />;
}

function ItemsTable({ items = [], editable = false, onEdit, onDelete, onAddItem }) {
    const grandTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.harga || 0)), 0);
    }, [items]);
    const totalQtyMasuk = useMemo(() => {
        return items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.isi || 0)), 0);
    }, [items]);

    if (editable) {
        return (
            <section className="log-items-section">
                <div className="log-items-head">
                    <div>
                        <h3>Daftar Barang</h3>
                        <p>{items.length ? `${items.length} item barang tercatat (${fmt(totalQtyMasuk)} total qty masuk)` : 'Belum ada barang masuk.'}</p>
                    </div>
                    {onAddItem && (
                        <button className="inv-btn primary compact" style={{ padding: '8px 14px' }} type="button" onClick={onAddItem}>
                            <Plus size={15} /> Tambah Barang
                        </button>
                    )}
                </div>
                <div className="log-edit-items">
                    {items.map((item) => {
                        const qtyMasuk = Number(item.qty || 0) * Number(item.isi || 0);
                        const total = Number(item.qty || 0) * Number(item.harga || 0);
                        return (
                            <div className="log-edit-item" key={`${item.id}-${item.barang}`}>
                                <div className="name"><strong>{item.barang_nama}</strong><span>{fmt(qtyMasuk)} {item.satuan || ''}</span></div>
                                <div><span>Qty</span><strong>{fmt(item.qty)}</strong></div>
                                <div><span>Isi</span><strong>{fmt(item.isi)}</strong></div>
                                <div><span>Harga</span><strong>{money(item.harga)}</strong></div>
                                <div><span>Total</span><strong>{money(total)}</strong></div>
                                <div className="inv-row-actions">
                                    <button className="inv-row-btn" type="button" onClick={() => onEdit(item)} title="Edit barang"><Pencil size={15} /></button>
                                    {onDelete && <button className="inv-row-btn" type="button" onClick={() => onDelete(item)} title="Hapus barang"><Trash2 size={15} /></button>}
                                </div>
                            </div>
                        );
                    })}
                    {!items.length && <div className="inv-empty">Belum ada barang di invoice ini.</div>}
                </div>
                {items.length > 0 && (
                    <div className="log-items-footer">
                        <div className="log-items-total-display">
                            <span>Grand Total Invoice</span>
                            <strong className="inv-mono">{money(grandTotal)}</strong>
                        </div>
                    </div>
                )}
            </section>
        );
    }
    return (
        <section className="log-items-section">
            <div className="log-items-head">
                <div>
                    <h3>Daftar Barang</h3>
                    <p>{items.length ? `${items.length} item barang tercatat (${fmt(totalQtyMasuk)} total qty masuk)` : 'Belum ada barang masuk.'}</p>
                </div>
            </div>
            <div className="inv-table-wrap log-items-wrap">
                <table className="inv-table log-items-table">
                    <thead><tr><th>Barang</th><th>Qty</th><th>Isi</th><th>Qty Masuk</th><th>Harga</th><th>Total</th>{editable && <th>Aksi</th>}</tr></thead>
                    <tbody>
                        {items.map((item) => {
                            const qtyMasuk = Number(item.qty || 0) * Number(item.isi || 0);
                            const total = Number(item.qty || 0) * Number(item.harga || 0);
                            return (
                                <tr key={`${item.id}-${item.barang}`}>
                                    <td><strong>{item.barang_nama}</strong><small>{item.satuan || '-'}</small></td>
                                    <td>{fmt(item.qty)}</td>
                                    <td>{fmt(item.isi)}</td>
                                    <td>{fmt(qtyMasuk)} {item.satuan || ''}</td>
                                    <td>{money(item.harga)}</td>
                                    <td><strong>{money(total)}</strong></td>
                                    {editable && <td><button className="inv-row-btn" type="button" onClick={() => onEdit(item)} title="Edit barang"><Pencil size={15} /></button></td>}
                                </tr>
                            );
                        })}
                        {!items.length && <tr><td colSpan={editable ? 7 : 6} className="inv-empty">Belum ada barang di invoice ini.</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function KartuTable({ rows }) {
    return <div className="inv-table-wrap"><table className="inv-table log-table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nomor</th><th>Ruang/Vendor</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.nomor}-${i}`}><td>{r.tanggal}</td><td>{r.jenis}</td><td>{r.nomor}</td><td>{r.ruang || '-'}</td><td>{fmt(r.masuk)}</td><td>{fmt(r.keluar)}</td><td><strong>{fmt(r.saldo)}</strong></td></tr>)}{rows.length === 0 && <tr><td colSpan="7" className="inv-empty">Pilih barang untuk melihat kartu stok.</td></tr>}</tbody></table></div>;
}