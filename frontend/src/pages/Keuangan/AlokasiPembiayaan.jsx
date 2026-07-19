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
    WalletCards,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getResults, SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
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
    id_pembiayaan: '',
    tanggal_penerimaan: new Date().toISOString().slice(0, 10),
    jumlah_penerimaan: '',
    bank: 'bsi',
    keterangan: '',
};

const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [ledgerFilters, setLedgerFilters] = useState({ search: '', type: '', dari: '', sampai: '' });
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [groupPage, setGroupPage] = useState(1);
    const [groupPageSize, setGroupPageSize] = useState(10);
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerPageSize, setLedgerPageSize] = useState(10);

    const fetchOptions = useCallback(async () => {
        try {
            const res = await api.get('/keuangan/pembiayaan-options/');
            setPembiayaan(getResults(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat daftar pembiayaan.'));
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
            const key = String(item.id_pembiayaan || '');
            const existing = groups.get(key) || {
                id_pembiayaan: key,
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
        if (!q) return pembiayaanGroups;
        return pembiayaanGroups.filter((item) => [
            item.nama_pembiayaan,
            item.id_pembiayaan,
        ].some((value) => String(value || '').toLowerCase().includes(q)));
    }, [search, pembiayaanGroups]);

    const pagedGroups = useMemo(() => {
        const start = (groupPage - 1) * groupPageSize;
        return visibleGroups.slice(start, start + groupPageSize);
    }, [groupPage, groupPageSize, visibleGroups]);

    useEffect(() => {
        setGroupPage(1);
    }, [search, groupPageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(visibleGroups.length / groupPageSize));
        if (groupPage > maxPage) setGroupPage(maxPage);
    }, [groupPage, groupPageSize, visibleGroups.length]);

    useEffect(() => {
        if (selectedGroupId && !visibleGroups.some((group) => group.id_pembiayaan === selectedGroupId)) {
            setSelectedGroupId('');
        }
    }, [selectedGroupId, visibleGroups]);

    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setCreateOpen(false);
                setSelectedGroupId('');
            }
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, []);

    useEffect(() => {
        if (!selectedGroupId && !createOpen && !deleteTarget) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [createOpen, deleteTarget, selectedGroupId]);

    const selectedGroup = visibleGroups.find((group) => group.id_pembiayaan === selectedGroupId) || null;

    const ledgerEntries = useMemo(() => {
        if (!selectedGroup) return [];
        const entries = [];
        selectedGroup.items.forEach((item) => {
            entries.push({
                key: `in-${item.id}`,
                type: 'in',
                tanggal: item.tanggal_penerimaan,
                label: 'Dana Masuk',
                ref: BANK_OPTIONS.find((b) => b.value === item.bank)?.label || item.bank,
                keterangan: item.keterangan || 'Pembayaran diterima',
                masuk: Number(item.jumlah_penerimaan || 0),
                keluar: 0,
                item,
            });
            (item.pemakaian || []).forEach((pay) => {
                entries.push({
                    key: `out-${pay.id}`,
                    type: 'out',
                    tanggal: pay.tanggal,
                    label: 'Dana Keluar',
                    ref: pay.nomor_faktur || '-',
                    keterangan: pay.keterangan || `Alokasi ke invoice ${pay.nomor_faktur || ''}`.trim(),
                    masuk: 0,
                    keluar: Number(pay.jumlah || 0),
                    item,
                    pay,
                });
            });
        });
        let saldo = 0;
        return entries
            .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal) || a.key.localeCompare(b.key))
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
            ].some((value) => String(value || '').toLowerCase().includes(q));
        });
    }, [ledgerEntries, ledgerFilters]);

    const pagedLedgerEntries = useMemo(() => {
        const start = (ledgerPage - 1) * ledgerPageSize;
        return filteredLedgerEntries.slice(start, start + ledgerPageSize);
    }, [filteredLedgerEntries, ledgerPage, ledgerPageSize]);

    useEffect(() => {
        setLedgerPage(1);
    }, [ledgerFilters, ledgerPageSize, selectedGroupId]);

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
        setSelectedGroupId('');
    };

    const setLedgerFilter = (key, value) => {
        setLedgerFilters((prev) => ({ ...prev, [key]: value }));
    };

    const validateForm = () => {
        if (!form.id_pembiayaan) return 'Pembiayaan wajib dipilih.';
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
            const payload = {
                id_pembiayaan: selectedPembiayaan?.id_pembiayaan || form.id_pembiayaan,
                nama_pembiayaan: selectedPembiayaan?.nama || '',
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
                        <p>Tampungan dana masuk dari pembiayaan sebelum dialokasikan ke invoice.</p>
                    </div>
                </div>
            </div>

            <SummaryCard
                label="Saldo Tersedia"
                value={money(totals.sisa)}
                tone="total"
                description="Total dana tampungan yang masih bisa dialokasikan."
            />

            <div className="ap-card table">
                <div className="ap-result-head">
                    <div>
                        <h2>Daftar Pembiayaan</h2>
                        <p>{visibleGroups.length} pembiayaan memiliki data tampungan.</p>
                    </div>
                    <div className="ap-card-actions">
                        <div className="ap-search ap-table-search">
                            <Search size={16} />
                            <input className="ap-input" placeholder="Cari nama / ID pembiayaan..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <button className="ap-btn primary" type="button" onClick={openCreateModal}>
                            <Plus size={16} /> Tambah Alokasi
                        </button>
                    </div>
                </div>
                {loading ? (
                    <div className="ap-empty">Memuat alokasi pembiayaan...</div>
                ) : visibleGroups.length === 0 ? (
                    <div className="ap-empty">Belum ada alokasi pembiayaan.</div>
                ) : (
                    <div className="ap-table-wrap">
                        <table className="ap-table ap-master-table">
                            <thead>
                                <tr>
                                    <th>Pembiayaan</th>
                                    <th className="ap-right">Saldo Tampungan</th>
                                    <th>Update Terakhir</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedGroups.map((group) => (
                                    <tr
                                        key={group.id_pembiayaan}
                                        className={group.id_pembiayaan === selectedGroupId ? 'selected' : ''}
                                        onClick={() => setSelectedGroupId(group.id_pembiayaan)}
                                    >
                                        <td>
                                            <div className="ap-name-cell">
                                                <span className="ap-name-icon"><Building2 size={17} /></span>
                                                <div>
                                                    <strong>{group.nama_pembiayaan}</strong>
                                                    <small>ID Pembiayaan: {group.id_pembiayaan}</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="ap-right ap-mono ap-strong">{money(group.sisa)}</td>
                                        <td>
                                            <div className="ap-date-cell">
                                                <CalendarDays size={15} />
                                                {dateLabel(group.terakhir)}
                                            </div>
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

            {createOpen && createPortal(
                <div className="ap-modal-backdrop ap-add-backdrop" role="presentation" onMouseDown={closeCreateModal}>
                    <div className="ap-modal ap-add-modal" role="dialog" aria-modal="true" aria-labelledby="ap-add-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="ap-detail-head">
                            <div>
                                <h2 id="ap-add-title"><Plus size={19} /> Tambah Alokasi</h2>
                                <p>Catat pembayaran masuk dari pembiayaan ke tampungan dana.</p>
                            </div>
                        </div>
                        <form className="ap-modal-body" onSubmit={save}>
                            <div className="ap-grid ap-add-grid">
                                <label>
                                    Pembiayaan
                                    <SearchablePembiayaanSelect
                                        options={[
                                            { value: '', label: 'Pilih pembiayaan' },
                                            ...pembiayaan.map((item) => ({
                                                value: String(item.id_pembiayaan),
                                                label: `${item.nama} - ID ${item.id_pembiayaan}`,
                                            })),
                                        ]}
                                        value={form.id_pembiayaan}
                                        onChange={(value) => setForm({ ...form, id_pembiayaan: value })}
                                        placeholder="Pilih pembiayaan"
                                    />
                                </label>
                                <label>
                                    Tanggal Terima
                                    <DateInput value={form.tanggal_penerimaan} onChange={(e) => setForm({ ...form, tanggal_penerimaan: e.target.value })} />
                                </label>
                                <label>
                                    Jumlah Terima
                                    <input
                                        className="ap-input ap-input-right"
                                        type="text"
                                        inputMode="decimal"
                                        value={form.jumlah_penerimaan}
                                        onChange={(e) => setForm({ ...form, jumlah_penerimaan: sanitizeMoneyInput(e.target.value) })}
                                        onBlur={(e) => setForm({ ...form, jumlah_penerimaan: formatMoneyInput(e.target.value) })}
                                        placeholder="Contoh: 1.000,50"
                                    />
                                </label>
                                <label>
                                    Bank
                                    <select className="ap-input ap-select-native" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
                                        {BANK_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                    </select>
                                </label>
                                <label className="ap-span-2">
                                    Keterangan
                                    <textarea className="ap-input" rows="3" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
                                </label>
                            </div>
                            <div className="ap-modal-actions">
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

            {selectedGroup && createPortal(
                <div className="ap-modal-backdrop ap-blur-backdrop" role="presentation" onMouseDown={closeLedgerModal}>
                    <div className="ap-modal ap-ledger-modal" role="dialog" aria-modal="true" aria-labelledby="ap-ledger-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="ap-detail-head">
                            <div>
                                <h2 id="ap-ledger-title"><Building2 size={19} /> {selectedGroup.nama_pembiayaan}</h2>
                                <p>ID Pembiayaan: {selectedGroup.id_pembiayaan}</p>
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
                            <div className="ap-ledger-tools-title">
                                <Search size={16} />
                                <span>Filter Riwayat</span>
                            </div>
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
                            <button className="ap-filter-reset" type="button" onClick={() => setLedgerFilters({ search: '', type: '', dari: '', sampai: '' })}>
                                <X size={16} /> Reset
                            </button>
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
                                            <th className="ap-right">Masuk</th>
                                            <th className="ap-right">Keluar</th>
                                            <th className="ap-right">Saldo</th>
                                            <th className="ap-action-col">Aksi</th>
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
                                                            {entry.type === 'in' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                                                            {entry.label}
                                                        </span>
                                                    </td>
                                                    <td className="ap-ref-cell">{entry.ref}</td>
                                                    <td className="ap-note-cell">{entry.keterangan || '-'}</td>
                                                    <td className={`ap-right ap-mono ${entry.masuk ? 'ap-money-in' : ''}`}>{entry.masuk ? money(entry.masuk) : '-'}</td>
                                                    <td className={`ap-right ap-mono ${entry.keluar ? 'ap-money-out' : ''}`}>{entry.keluar ? money(entry.keluar) : '-'}</td>
                                                    <td className="ap-right ap-mono ap-strong">{money(entry.saldo)}</td>
                                                    <td className="ap-action-col">
                                                        <div className="ap-row-actions">
                                                            <button
                                                                className="delete"
                                                                type="button"
                                                                title={entry.type === 'out' ? 'Dana keluar tidak dihapus dari sini' : used ? 'Sudah dipakai' : 'Hapus'}
                                                                disabled={entry.type === 'out' || used || saving}
                                                                onClick={() => requestRemove(entry.item)}
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
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

function SummaryCard({ icon = null, label, value, tone = '', description = '' }) {
    return (
        <div className={`ap-sum ${tone}`}>
            {icon && <div className="ap-sum-icon">{icon}</div>}
            <div className="ap-sum-copy">
                <span>{label}</span>
                {description && <p>{description}</p>}
            </div>
            <strong>{value}</strong>
        </div>
    );
}

function DateInput({ value, onChange, disabled = false }) {
    return <DateField value={value} onChange={(nextValue) => onChange({ target: { value: nextValue } })} disabled={disabled} />;
}
