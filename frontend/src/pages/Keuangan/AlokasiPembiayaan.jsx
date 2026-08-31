import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    Building2,
    CalendarDays,
    Plus,
    Search,
    Trash2,
    User,
    WalletCards,
    X,
    Layers,
    CheckCircle2
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getResults, SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
import TableSkeleton from '../../components/TableSkeleton';
import './AlokasiPembiayaan.css';

const BANK_OPTIONS = [
    { value: 'bsi', label: 'BSI' },
    { value: 'bri', label: 'BRI' },
    { value: 'mandiri', label: 'Mandiri' },
    { value: 'bca', label: 'BCA' },
];

const LEDGER_TYPE_OPTIONS = [
    { value: '', label: 'Semua Transaksi' },
    { value: 'in', label: 'Dana Masuk' },
    { value: 'out', label: 'Dana Keluar' },
];

const emptyForm = {
    tipe_alokasi: 'induk', // 'induk' | 'spesifik'
    induk_pembiayaan: '',
    id_pembiayaan: '',
    tanggal_penerimaan: new Date().toISOString().slice(0, 10),
    jumlah_penerimaan: '',
    bank: 'bsi',
    keterangan: '',
};

const money = (value) => `Rp\u00a0${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const sanitizeMoneyInput = (value) => String(value || '').replace(/[^\d.,]/g, '');
const parseMoneyInput = (value) => {
    const text = sanitizeMoneyInput(value);
    if (!text) return 0;

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const normalizeDecimal = (separator) => {
        const separatorIndex = text.lastIndexOf(separator);
        const integerPart = text.slice(0, separatorIndex).replace(/[^\d]/g, '');
        const decimalPart = text.slice(separatorIndex + 1).replace(/[^\d]/g, '');
        return decimalPart ? `${integerPart || '0'}.${decimalPart}` : integerPart;
    };

    if (lastComma > lastDot) {
        return Number(normalizeDecimal(',')) || 0;
    }

    if (lastDot > -1) {
        const dotCount = (text.match(/\./g) || []).length;
        const decimalLength = text.length - lastDot - 1;
        if (lastComma === -1 && dotCount === 1 && decimalLength > 0 && decimalLength <= 2) {
            return Number(normalizeDecimal('.')) || 0;
        }
    }

    const digits = text.replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
};
const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const amount = parseMoneyInput(value);
    return amount ? `Rp ${amount.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '';
};

function errorMessage(err, fallback) {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail || data.error) return data.detail || data.error;
    return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`).join(' | ') || fallback;
}

export default function AlokasiPembiayaan() {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [pembiayaan, setPembiayaan] = useState([]);
    const [indukList, setIndukList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [tipeFilter, setTipeFilter] = useState('semua'); // 'semua' | 'induk' | 'spesifik'
    const [ledgerFilters, setLedgerFilters] = useState({ search: '', type: '', dari: '', sampai: '' });
    const [selectedGroupKey, setSelectedGroupKey] = useState('');
    const [groupPage, setGroupPage] = useState(1);
    const [groupPageSize, setGroupPageSize] = useState(10);
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerPageSize, setLedgerPageSize] = useState(10);

    const fetchOptions = useCallback(async () => {
        try {
            const [resPbiaya, resInduk] = await Promise.all([
                api.get('/keuangan/pembiayaan-options/'),
                api.get('/keuangan/induk-pembiayaan/'),
            ]);
            setPembiayaan(getResults(resPbiaya.data));
            setIndukList(getResults(resInduk.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat daftar pembiayaan & induk.'));
        }
    }, [toast]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/alokasi-dana/');
            setItems(getResults(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat alokasi pembiayaan.'));
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);
    useEffect(() => { fetchItems(); }, [fetchItems]);

    const pembiayaanGroups = useMemo(() => {
        const groups = new Map();
        items.forEach((item) => {
            const isInduk = Boolean(item.is_induk);
            const key = isInduk ? `induk-${item.induk_pembiayaan || item.nama_pembiayaan}` : `spesifik-${item.id_pembiayaan}`;
            const existing = groups.get(key) || {
                groupKey: key,
                is_induk: isInduk,
                induk_pembiayaan: item.induk_pembiayaan,
                id_pembiayaan: item.id_pembiayaan || (isInduk ? `INDUK-${item.induk_pembiayaan}` : ''),
                nama_pembiayaan: item.nama_pembiayaan,
                dana_masuk: 0,
                digunakan: 0,
                sisa: 0,
                transaksi_masuk: 0,
                transaksi_keluar: 0,
                terakhir: item.tanggal_penerimaan,
                items: [],
            };
            existing.dana_masuk += Number(item.jumlah_penerimaan || 0);
            existing.digunakan += Number(item.digunakan || 0);
            existing.sisa += Number(item.sisa_alokasi || 0);
            existing.transaksi_masuk += 1;
            existing.transaksi_keluar += (item.pemakaian || []).length;
            if (new Date(item.tanggal_penerimaan) > new Date(existing.terakhir || '1900-01-01')) {
                existing.terakhir = item.tanggal_penerimaan;
            }
            existing.items.push(item);
            groups.set(key, existing);
        });
        return Array.from(groups.values()).sort((a, b) => a.nama_pembiayaan.localeCompare(b.nama_pembiayaan));
    }, [items]);

    const visibleGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return pembiayaanGroups.filter((item) => {
            if (tipeFilter === 'induk' && !item.is_induk) return false;
            if (tipeFilter === 'spesifik' && item.is_induk) return false;
            if (!q) return true;
            return [
                item.nama_pembiayaan,
                item.id_pembiayaan,
            ].some((value) => String(value || '').toLowerCase().includes(q));
        });
    }, [search, tipeFilter, pembiayaanGroups]);

    const pagedGroups = useMemo(() => {
        const start = (groupPage - 1) * groupPageSize;
        return visibleGroups.slice(start, start + groupPageSize);
    }, [groupPage, groupPageSize, visibleGroups]);

    useEffect(() => {
        setGroupPage(1);
    }, [search, tipeFilter, groupPageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(visibleGroups.length / groupPageSize));
        if (groupPage > maxPage) setGroupPage(maxPage);
    }, [groupPage, groupPageSize, visibleGroups.length]);

    useEffect(() => {
        if (selectedGroupKey && !visibleGroups.some((group) => group.groupKey === selectedGroupKey)) {
            setSelectedGroupKey('');
        }
    }, [selectedGroupKey, visibleGroups]);

    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setCreateOpen(false);
                setSelectedGroupKey('');
            }
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, []);

    useEffect(() => {
        if (!selectedGroupKey && !createOpen && !deleteTarget) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [createOpen, deleteTarget, selectedGroupKey]);

    const selectedGroup = visibleGroups.find((group) => group.groupKey === selectedGroupKey) || null;

    const ledgerEntries = useMemo(() => {
        if (!selectedGroup) return [];
        const entries = [];
        selectedGroup.items.forEach((item) => {
            entries.push({
                key: `in-${item.id}`,
                type: 'in',
                tanggal: item.tanggal_penerimaan,
                created_at: item.created_at || item.tanggal_penerimaan,
                label: 'Dana Masuk',
                ref: BANK_OPTIONS.find((b) => b.value === item.bank)?.label || item.bank,
                keterangan: item.keterangan || 'Pembayaran diterima',
                masuk: Number(item.jumlah_penerimaan || 0),
                keluar: 0,
                item,
                operator: item.created_by_name || '-',
            });
            (item.pemakaian || []).forEach((pay) => {
                entries.push({
                    key: `out-${pay.id}`,
                    type: 'out',
                    tanggal: pay.tanggal,
                    created_at: pay.created_at || pay.tanggal,
                    label: 'Dana Keluar',
                    ref: pay.nomor_faktur || '-',
                    keterangan: pay.keterangan || `Alokasi ke invoice ${pay.nomor_faktur || ''}`.trim(),
                    masuk: 0,
                    keluar: Number(pay.jumlah || 0),
                    item,
                    pay,
                    operator: pay.created_by_name || '-',
                });
            });
        });
        let saldo = 0;
        return entries
            .sort((a, b) => {
                const diff = new Date(a.created_at) - new Date(b.created_at);
                if (diff !== 0) return diff;
                if (a.type !== b.type) return a.type === 'in' ? -1 : 1;
                return a.key.localeCompare(b.key);
            })
            .map((entry) => {
                saldo += entry.masuk - entry.keluar;
                return { ...entry, saldo };
            })
            .reverse();
    }, [selectedGroup]);

    const filteredLedgerEntries = useMemo(() => {
        const q = ledgerFilters.search.trim().toLowerCase();
        return ledgerEntries.filter((entry) => {
            const tanggal = entry.tanggal || '';
            if (ledgerFilters.type && entry.type !== ledgerFilters.type) return false;
            if (ledgerFilters.dari && tanggal < ledgerFilters.dari) return false;
            if (ledgerFilters.sampai && tanggal > ledgerFilters.sampai) return false;
            if (!q) return true;
            return [
                entry.label,
                entry.ref,
                entry.keterangan,
                entry.item?.bank,
                entry.item?.nama_pembiayaan,
                entry.operator,
            ].some((value) => String(value || '').toLowerCase().includes(q));
        });
    }, [ledgerEntries, ledgerFilters]);

    const pagedLedgerEntries = useMemo(() => {
        const start = (ledgerPage - 1) * ledgerPageSize;
        return filteredLedgerEntries.slice(start, start + ledgerPageSize);
    }, [filteredLedgerEntries, ledgerPage, ledgerPageSize]);

    useEffect(() => {
        setLedgerPage(1);
    }, [ledgerFilters, ledgerPageSize, selectedGroupKey]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredLedgerEntries.length / ledgerPageSize));
        if (ledgerPage > maxPage) setLedgerPage(maxPage);
    }, [filteredLedgerEntries.length, ledgerPage, ledgerPageSize]);

    const totals = useMemo(() => visibleGroups.reduce((acc, item) => ({
        masuk: acc.masuk + item.dana_masuk,
        digunakan: acc.digunakan + item.digunakan,
        sisa: acc.sisa + item.sisa,
    }), { masuk: 0, digunakan: 0, sisa: 0 }), [visibleGroups]);

    const selectedPembiayaan = pembiayaan.find((item) => String(item.id_pembiayaan) === String(form.id_pembiayaan));
    const selectedInduk = indukList.find((item) => String(item.id) === String(form.induk_pembiayaan));

    const resetForm = () => {
        setForm(emptyForm);
    };

    const openCreateModal = () => {
        resetForm();
        setCreateOpen(true);
    };

    const closeCreateModal = () => {
        setCreateOpen(false);
        resetForm();
    };

    const closeLedgerModal = () => {
        setSelectedGroupKey('');
    };

    const setLedgerFilter = (key, value) => {
        setLedgerFilters((prev) => ({ ...prev, [key]: value }));
    };

    const validateForm = () => {
        if (form.tipe_alokasi === 'induk') {
            if (!form.induk_pembiayaan) return 'Pilih Induk Pembiayaan (Payor Group).';
        } else {
            if (!form.id_pembiayaan) return 'Pilih Pembiayaan Spesifik / Mandiri.';
        }
        if (!form.tanggal_penerimaan) return 'Tanggal penerimaan wajib diisi.';
        if (!form.jumlah_penerimaan || parseMoneyInput(form.jumlah_penerimaan) <= 0) return 'Jumlah penerimaan harus lebih dari nol.';
        if (!form.bank) return 'Bank wajib dipilih.';
        return '';
    };

    const save = async (event) => {
        event.preventDefault();
        const validation = validateForm();
        if (validation) {
            toast.error(validation);
            return;
        }
        setSaving(true);
        try {
            const isInduk = form.tipe_alokasi === 'induk';
            const payload = {
                is_induk: isInduk,
                induk_pembiayaan: isInduk ? form.induk_pembiayaan : null,
                id_pembiayaan: isInduk ? '' : (selectedPembiayaan?.id_pembiayaan || form.id_pembiayaan),
                nama_pembiayaan: isInduk ? (selectedInduk?.nama || '') : (selectedPembiayaan?.nama || ''),
                tanggal_penerimaan: form.tanggal_penerimaan,
                jumlah_penerimaan: parseMoneyInput(form.jumlah_penerimaan),
                bank: form.bank,
                keterangan: form.keterangan || '',
            };
            await api.post('/keuangan/alokasi-dana/', payload);
            toast.success('Alokasi pembiayaan ditambahkan.');
            closeCreateModal();
            await fetchItems();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan alokasi pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const requestRemove = (item) => {
        if (Number(item.digunakan || 0) > 0) {
            toast.error('Alokasi yang sudah dipakai tidak bisa dihapus.');
            return;
        }
        setDeleteTarget(item);
    };

    const closeDeleteModal = () => {
        if (saving) return;
        setDeleteTarget(null);
    };

    const confirmRemove = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/alokasi-dana/${deleteTarget.id}/`);
            toast.success('Alokasi pembiayaan dihapus.');
            setDeleteTarget(null);
            await fetchItems();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menghapus alokasi pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ap-page">
            <div className="ap-head">
                <div className="ap-title">
                    <span><WalletCards size={22} /></span>
                    <div>
                        <h1>Alokasi Pembiayaan</h1>
                        <p>Tampungan dana masuk dari Induk Asuransi (Pool) atau Pembiayaan Mandiri sebelum dialokasikan ke invoice.</p>
                    </div>
                </div>
            </div>

            <div className="ap-stats-grid">
                <div className="ap-stat-card primary">
                    <div className="ap-stat-icon ok"><WalletCards size={22} /></div>
                    <div className="ap-stat-info">
                        <span className="ap-stat-label">Saldo Tampungan Tersedia</span>
                        <strong className="ap-stat-value ok">{money(totals.sisa)}</strong>
                        <p className="ap-stat-desc">Dana yang belum dialokasikan ke invoice</p>
                    </div>
                </div>
                <div className="ap-stat-card">
                    <div className="ap-stat-icon in"><ArrowDownCircle size={22} /></div>
                    <div className="ap-stat-info">
                        <span className="ap-stat-label">Total Penerimaan Masuk</span>
                        <strong className="ap-stat-value">{money(totals.dana_masuk)}</strong>
                        <p className="ap-stat-desc">Akumulasi seluruh penerimaan dana</p>
                    </div>
                </div>
                <div className="ap-stat-card">
                    <div className="ap-stat-icon warn"><ArrowUpCircle size={22} /></div>
                    <div className="ap-stat-info">
                        <span className="ap-stat-label">Total Dialokasikan</span>
                        <strong className="ap-stat-value warn">{money(totals.digunakan)}</strong>
                        <p className="ap-stat-desc">Telah terpakai untuk pembayaran invoice</p>
                    </div>
                </div>
            </div>

            <div className="ap-card table">
                <div className="ap-result-head">
                    <div>
                        <h2>Daftar Pembiayaan & Pool Induk</h2>
                        <p>{visibleGroups.length} pembiayaan / induk memiliki data tampungan.</p>
                    </div>
                    <div className="ap-card-actions">
                        <div className="ap-search ap-table-search">
                            <Search size={16} />
                            <input className="ap-input" placeholder="Cari nama pembiayaan / induk..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <select className="ap-input ap-select-native" style={{ width: 'auto' }} value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)}>
                            <option value="semua">Semua Tipe Alokasi</option>
                            <option value="induk">🏢 Induk Pool Bersama</option>
                            <option value="spesifik">📄 Pembiayaan Mandiri</option>
                        </select>
                        <button className="ap-btn primary" type="button" onClick={openCreateModal}>
                            <Plus size={16} /> Tambah Alokasi
                        </button>
                    </div>
                </div>
                {loading ? (
                    <TableSkeleton text="Memuat alokasi pembiayaan..." />
                ) : visibleGroups.length === 0 ? (
                    <div className="ap-empty">Belum ada alokasi pembiayaan. Klik <strong>"Tambah Alokasi"</strong> untuk mencatat penerimaan bank.</div>
                ) : (
                    <div className="ap-table-wrap table-fade-in">
                        <table className="ap-table ap-master-table">
                            <thead>
                                <tr>
                                    <th>Nama Pembiayaan / Induk</th>
                                    <th>ID / Tipe</th>
                                    <th className="ap-right">Total Masuk</th>
                                    <th className="ap-right">Terpakai</th>
                                    <th className="ap-right">Sisa Saldo</th>
                                    <th>Aktivitas</th>
                                    <th>Penerimaan Terakhir</th>
                                    <th className="ap-action-col">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedGroups.map((group) => (
                                    <tr key={group.groupKey} className="ap-table-row-hover">
                                        <td className="ap-name-col">
                                            <div className="ap-name-cell">
                                                <strong>{group.nama_pembiayaan}</strong>
                                                {group.is_induk && (
                                                    <span className="ap-induk-pool-badge" title="Dana Pool Bersama untuk seluruh invoice anak di bawah induk ini">
                                                        <Layers size={11} /> INDUK POOL
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="ap-id-badge">{group.id_pembiayaan || 'INDUK'}</span>
                                        </td>
                                        <td className="ap-right ap-mono ap-money-in">{money(group.dana_masuk)}</td>
                                        <td className="ap-right ap-mono ap-money-out">{money(group.digunakan)}</td>
                                        <td className="ap-right ap-mono ap-strong ok">{money(group.sisa)}</td>
                                        <td>
                                            <span className="ap-activity-badge">
                                                {group.transaksi_masuk} masuk · {group.transaksi_keluar} keluar
                                            </span>
                                        </td>
                                        <td>{dateLabel(group.terakhir)}</td>
                                        <td className="ap-action-col">
                                            <button
                                                className="ap-btn soft ap-sm-btn"
                                                type="button"
                                                onClick={() => setSelectedGroupKey(group.groupKey)}
                                            >
                                                Rincian Transaksi
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <SimplePagination
                            page={groupPage}
                            pageSize={groupPageSize}
                            total={visibleGroups.length}
                            onPageChange={setGroupPage}
                            onPageSizeChange={setGroupPageSize}
                            buttonClassName="ap-page-btn"
                            selectClassName="ap-page-size"
                        />
                    </div>
                )}
            </div>

            {/* MODAL: TAMBAH ALOKASI */}
            {/* MODAL: TAMBAH ALOKASI */}
            {createOpen && createPortal(
                <div className="ap-modal-backdrop ap-blur-backdrop" role="presentation" onMouseDown={closeCreateModal}>
                    <div className="ap-modal ap-create-modal" role="dialog" aria-modal="true" aria-labelledby="ap-add-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="ap-detail-head">
                            <div className="ap-modal-head-info">
                                <h2 id="ap-add-title"><Plus size={20} /> Tambah Alokasi Dana</h2>
                                <p>Catat pembayaran rekening koran masuk dari Induk Asuransi atau Pembiayaan Mandiri.</p>
                            </div>
                        </div>
                        <form className="ap-create-form" onSubmit={save}>
                            {/* Pilihan Tipe Alokasi */}
                            <div className="ap-tipe-selector">
                                <button
                                    type="button"
                                    className={`ap-tipe-btn ${form.tipe_alokasi === 'induk' ? 'active' : ''}`}
                                    onClick={() => setForm({ ...form, tipe_alokasi: 'induk', id_pembiayaan: '' })}
                                >
                                    <div className="ap-tipe-icon"><Layers size={18} /></div>
                                    <div className="ap-tipe-text">
                                        <strong>Induk Pembiayaan (Pool Bersama)</strong>
                                        <small>Dana gelondongan untuk seluruh invoice anak (Admedika, Isomedik, dll)</small>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    className={`ap-tipe-btn ${form.tipe_alokasi === 'spesifik' ? 'active' : ''}`}
                                    onClick={() => setForm({ ...form, tipe_alokasi: 'spesifik', induk_pembiayaan: '' })}
                                >
                                    <div className="ap-tipe-icon"><Building2 size={18} /></div>
                                    <div className="ap-tipe-text">
                                        <strong>Pembiayaan Mandiri / Spesifik</strong>
                                        <small>Khusus untuk satu akun pembiayaan mandiri</small>
                                    </div>
                                </button>
                            </div>

                            <div className="ap-form-grid">
                                {form.tipe_alokasi === 'induk' ? (
                                    <div className="ap-form-group full-width">
                                        <label>
                                            Pilih Induk Pembiayaan (Payor Group) <span className="ap-required">*</span>
                                        </label>
                                        <SearchablePembiayaanSelect
                                            options={[
                                                { value: '', label: 'Pilih Induk Pembiayaan' },
                                                ...indukList.map((ind) => ({
                                                    value: String(ind.id),
                                                    label: `${ind.nama} (${ind.total_anggota || 0} pembiayaan anak terhubung)`,
                                                })),
                                            ]}
                                            value={form.induk_pembiayaan}
                                            onChange={(value) => setForm({ ...form, induk_pembiayaan: value })}
                                            placeholder="Cari & pilih induk pembiayaan..."
                                        />
                                    </div>
                                ) : (
                                    <div className="ap-form-group full-width">
                                        <label>
                                            Pilih Pembiayaan Spesifik / Mandiri <span className="ap-required">*</span>
                                        </label>
                                        <SearchablePembiayaanSelect
                                            options={[
                                                { value: '', label: 'Pilih pembiayaan' },
                                                ...pembiayaan.map((item) => ({
                                                    value: String(item.id_pembiayaan),
                                                    label: `${item.nama} - ID ${item.id_pembiayaan} ${item.induk_nama ? `(Induk: ${item.induk_nama})` : ''}`,
                                                })),
                                            ]}
                                            value={form.id_pembiayaan}
                                            onChange={(value) => setForm({ ...form, id_pembiayaan: value })}
                                            placeholder="Pilih pembiayaan"
                                        />
                                    </div>
                                )}

                                <div className="ap-form-group">
                                    <label>
                                        Tanggal Terima (Rekening Koran) <span className="ap-required">*</span>
                                    </label>
                                    <DateInput value={form.tanggal_penerimaan} onChange={(e) => setForm({ ...form, tanggal_penerimaan: e.target.value })} />
                                </div>

                                <div className="ap-form-group">
                                    <label>
                                        Bank Tujuan <span className="ap-required">*</span>
                                    </label>
                                    <select className="ap-input ap-select-native" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
                                        {BANK_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                    </select>
                                </div>

                                <div className="ap-form-group full-width">
                                    <label>
                                        Jumlah Terima (Rp) <span className="ap-required">*</span>
                                    </label>
                                    <input
                                        className="ap-input ap-input-amount"
                                        type="text"
                                        inputMode="decimal"
                                        value={form.jumlah_penerimaan}
                                        onChange={(e) => setForm({ ...form, jumlah_penerimaan: sanitizeMoneyInput(e.target.value) })}
                                        onBlur={(e) => setForm({ ...form, jumlah_penerimaan: formatMoneyInput(e.target.value) })}
                                        placeholder="Contoh: 10.000.000"
                                    />
                                </div>

                                <div className="ap-form-group full-width">
                                    <label>Keterangan / Berita Transfer</label>
                                    <textarea
                                        className="ap-input ap-textarea"
                                        rows="3"
                                        placeholder="Contoh: Pelunasan klaim rawat jalan & inap periode Juli 2026"
                                        value={form.keterangan}
                                        onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="ap-create-actions">
                                <button className="ap-btn soft" type="button" onClick={closeCreateModal}>Batal</button>
                                <button className="ap-btn primary" type="submit" disabled={saving}>
                                    <Plus size={16} /> {saving ? 'Menyimpan...' : 'Tambah Alokasi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body,
            )}

            {/* MODAL: RINCIAN LEDGER / TRANSAKSI */}
            {selectedGroup && createPortal(
                <div className="ap-modal-backdrop ap-blur-backdrop" role="presentation" onMouseDown={closeLedgerModal}>
                    <div className="ap-modal ap-ledger-modal" role="dialog" aria-modal="true" aria-labelledby="ap-ledger-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="ap-detail-head">
                            <div>
                                <h2 id="ap-ledger-title">
                                    {selectedGroup.is_induk ? <Layers size={19} style={{ color: '#8b5cf6' }} /> : <Building2 size={19} />} {selectedGroup.nama_pembiayaan}
                                </h2>
                                <p>{selectedGroup.is_induk ? '🏢 Alokasi Pool Induk Pembiayaan' : `ID Pembiayaan: ${selectedGroup.id_pembiayaan}`}</p>
                            </div>
                            <button className="ap-modal-close" type="button" title="Tutup" onClick={closeLedgerModal}>
                                <X size={18} />
                                <span>Tutup</span>
                            </button>
                        </div>
                        <div className="ap-modal-stats ap-detail-stats">
                            <span className="ok"><WalletCards size={15} /> Saldo: <strong>{money(selectedGroup.sisa)}</strong></span>
                            <span className="in"><ArrowDownCircle size={15} /> Masuk: <strong>{money(selectedGroup.dana_masuk)}</strong></span>
                            <span className="warn"><ArrowUpCircle size={15} /> Keluar: <strong>{money(selectedGroup.digunakan)}</strong></span>
                        </div>
                        <div className="ap-ledger-tools">
                            <div className="ap-search">
                                <Search size={16} />
                                <input className="ap-input" placeholder="Cari referensi / keterangan..." value={ledgerFilters.search} onChange={(e) => setLedgerFilter('search', e.target.value)} />
                            </div>
                            <select className="ap-input ap-select-native ap-ledger-type" value={ledgerFilters.type} onChange={(e) => setLedgerFilter('type', e.target.value)}>
                                {LEDGER_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                            <DateRangePicker
                                dari={ledgerFilters.dari}
                                sampai={ledgerFilters.sampai}
                                onChange={({ dari, sampai }) => {
                                    setLedgerFilters((prev) => ({ ...prev, dari, sampai }));
                                }}
                                placeholder="Pilih Periode Tanggal"
                            />
                            {(ledgerFilters.search || ledgerFilters.type || ledgerFilters.dari || ledgerFilters.sampai) && (
                                <button className="ap-filter-reset" type="button" onClick={() => setLedgerFilters({ search: '', type: '', dari: '', sampai: '' })}>
                                    <X size={16} /> Reset
                                </button>
                            )}
                        </div>
                        {filteredLedgerEntries.length === 0 ? (
                            <div className="ap-empty">Tidak ada riwayat dana sesuai filter.</div>
                        ) : (
                            <div className="ap-table-wrap ap-modal-table">
                                <table className="ap-table ap-ledger-table">
                                    <thead>
                                        <tr>
                                            <th>Tanggal</th>
                                            <th>Jenis</th>
                                            <th>Referensi</th>
                                            <th>Keterangan</th>
                                            <th>Operator</th>
                                            <th className="ap-right">Masuk</th>
                                            <th className="ap-right">Keluar</th>
                                            <th className="ap-right">Saldo</th>
                                            <th className="ap-action-col" style={{ width: '60px' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedLedgerEntries.map((entry) => {
                                            const used = Number(entry.item?.digunakan || 0) > 0;
                                            return (
                                                <tr key={entry.key} className={`ap-ledger-row ${entry.type}`}>
                                                    <td className="ap-ledger-date">{dateLabel(entry.tanggal)}</td>
                                                    <td>
                                                        <span className={`ap-flow ${entry.type}`}>
                                                            {entry.type === 'in' ? '+' : '-'} {entry.label}
                                                        </span>
                                                    </td>
                                                    <td className="ap-ref-cell">{entry.ref}</td>
                                                    <td className="ap-note-cell">{entry.keterangan || '-'}</td>
                                                    <td className="ap-operator-cell">
                                                        <span className="ap-operator-badge" title={`Operator: ${entry.operator}`}>
                                                            <User size={13} style={{ opacity: 0.7 }} />
                                                            {entry.operator}
                                                        </span>
                                                    </td>
                                                    <td className={`ap-right ap-mono ${entry.masuk ? 'ap-money-in' : ''}`}>{entry.masuk ? money(entry.masuk) : '—'}</td>
                                                    <td className={`ap-right ap-mono ${entry.keluar ? 'ap-money-out' : ''}`}>{entry.keluar ? money(entry.keluar) : '—'}</td>
                                                    <td className="ap-right ap-mono ap-strong">{money(entry.saldo)}</td>
                                                    <td className="ap-action-col">
                                                        <div className="ap-row-actions">
                                                            {entry.type === 'in' ? (
                                                                  <button
                                                                    className="ap-icon-btn danger"
                                                                    type="button"
                                                                    title={used ? "Penerimaan ini tidak bisa dihapus karena dana sudah dialokasikan ke invoice" : "Hapus penerimaan dana ini"}
                                                                    disabled={used || saving}
                                                                    onClick={() => requestRemove(entry.item)}
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            ) : (
                                                                <span className="ap-no-action" title="Alokasi otomatis dari invoice">—</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <SimplePagination
                                    page={ledgerPage}
                                    pageSize={ledgerPageSize}
                                    total={filteredLedgerEntries.length}
                                    onPageChange={setLedgerPage}
                                    onPageSizeChange={setLedgerPageSize}
                                    buttonClassName="ap-page-btn"
                                    selectClassName="ap-page-size"
                                />
                            </div>
                        )}
                    </div>
                </div>,
                document.body,
            )}

            {deleteTarget && createPortal(
                <div className="ap-confirm-backdrop" role="presentation" onMouseDown={closeDeleteModal}>
                    <div className="ap-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="ap-delete-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="ap-confirm-icon">
                            <AlertTriangle size={22} />
                        </div>
                        <div className="ap-confirm-copy">
                            <h2 id="ap-delete-title">Hapus Alokasi?</h2>
                            <p>
                                Dana masuk <strong>{money(deleteTarget.jumlah_penerimaan)}</strong> untuk {deleteTarget.nama_pembiayaan} akan dihapus dari tampungan.
                            </p>
                        </div>
                        <div className="ap-confirm-detail">
                            <span>Informasi Alokasi</span>
                            <strong>{dateLabel(deleteTarget.tanggal_penerimaan)} · {BANK_OPTIONS.find((b) => b.value === deleteTarget.bank)?.label || deleteTarget.bank}</strong>
                        </div>
                        <div className="ap-confirm-actions">
                            <button className="ap-btn soft" type="button" onClick={closeDeleteModal} disabled={saving}>Batal</button>
                            <button className="ap-danger-btn" type="button" onClick={confirmRemove} disabled={saving}>
                                <Trash2 size={16} /> {saving ? 'Menghapus...' : 'Hapus Alokasi'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

function DateInput({ value, onChange, disabled = false }) {
    return <DateField value={value} onChange={(nextValue) => onChange({ target: { value: nextValue } })} disabled={disabled} />;
}

