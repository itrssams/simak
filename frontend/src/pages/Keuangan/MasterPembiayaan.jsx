import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2, CheckCircle2, Edit3, MapPin, Plus, RefreshCw, Search,
    Trash2, X, AlertTriangle, ShieldAlert, Layers, Users, Zap,
    ArrowRight, UserMinus, UserPlus, Check, Filter
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getResults, SimplePagination } from '../../utils/pagination.jsx';
import './MasterPembiayaan.css';

const emptyForm = { nama: '', alamat: '' };
const emptyIndukForm = { nama: '', kode: '', keterangan: '' };
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

function errorMessage(err, fallback) {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail || data.error) return data.detail || data.error;
    return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`).join(' | ') || fallback;
}

export default function MasterPembiayaan() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('induk'); // 'induk' | 'semua'

    // Data Semua Pembiayaan
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('aktif');
    const [indukFilter, setIndukFilter] = useState('semua');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modal Pembiayaan Tunggal (Create/Edit)
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Data Induk Pembiayaan
    const [indukList, setIndukList] = useState([]);
    const [indukLoading, setIndukLoading] = useState(false);
    const [indukSearch, setIndukSearch] = useState('');
    const [indukModalOpen, setIndukModalOpen] = useState(false);
    const [editingInduk, setEditingInduk] = useState(null);
    const [indukForm, setIndukForm] = useState(emptyIndukForm);
    const [deleteIndukTarget, setDeleteIndukTarget] = useState(null);

    // Modal Kelola Anggota Induk
    const [kelolaInduk, setKelolaInduk] = useState(null);
    const [kelolaSearch, setKelolaSearch] = useState('');
    const [selectedAddId, setSelectedAddId] = useState('');

    // Modal Auto-Grouping
    const [autoGroupModal, setAutoGroupModal] = useState(false);
    const [autoGroupData, setAutoGroupData] = useState(null);
    const [autoGroupLoading, setAutoGroupLoading] = useState(false);

    // Fetch Semua Pembiayaan (rssams.pbiaya + mapping)
    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/pembiayaan-options/', {
                params: { include_inactive: 1 },
            });
            setItems(getResults(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat daftar pembiayaan.'));
        } finally {
            setLoading(false);
        }
    }, [toast]);

    // Fetch Induk Pembiayaan
    const fetchIndukList = useCallback(async () => {
        setIndukLoading(true);
        try {
            const res = await api.get('/keuangan/induk-pembiayaan/');
            setIndukList(getResults(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat daftar induk pembiayaan.'));
        } finally {
            setIndukLoading(false);
        }
    }, [toast]);

    const refreshAll = useCallback(async () => {
        await Promise.all([fetchItems(), fetchIndukList()]);
    }, [fetchItems, fetchIndukList]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, indukFilter, pageSize, activeTab]);

    // Summary Statistics
    const stats = useMemo(() => {
        const total = items.length;
        const active = items.filter(i => Number(i.status) !== 0).length;
        const mapped = items.filter(i => i.induk_id !== null).length;
        const unmapped = total - mapped;
        const totalInduk = indukList.length;
        return { total, active, mapped, unmapped, totalInduk };
    }, [items, indukList]);

    // Filtered Semua Pembiayaan
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((item) => {
            const active = Number(item.status) !== 0;
            if (statusFilter === 'aktif' && !active) return false;
            if (statusFilter === 'nonaktif' && active) return false;

            if (indukFilter === 'mapped' && item.induk_id === null) return false;
            if (indukFilter === 'unmapped' && item.induk_id !== null) return false;
            if (indukFilter !== 'semua' && indukFilter !== 'mapped' && indukFilter !== 'unmapped') {
                if (String(item.induk_id) !== String(indukFilter)) return false;
            }

            if (!q) return true;
            return [item.id_pembiayaan, item.nama, item.alamat, item.induk_nama].some((value) =>
                String(value || '').toLowerCase().includes(q),
            );
        });
    }, [items, search, statusFilter, indukFilter]);

    const pagedItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredItems.slice(start, start + pageSize);
    }, [filteredItems, page, pageSize]);

    // Filtered Induk Pembiayaan
    const filteredIndukList = useMemo(() => {
        const q = indukSearch.trim().toLowerCase();
        if (!q) return indukList;
        return indukList.filter((induk) =>
            [induk.nama, induk.kode, induk.keterangan].some((v) =>
                String(v || '').toLowerCase().includes(q)
            )
        );
    }, [indukList, indukSearch]);

    // Candidates to add to an Induk (available pembiayaan)
    const availableChildrenForInduk = useMemo(() => {
        if (!kelolaInduk) return [];
        const existingIds = new Set((kelolaInduk.anggota || []).map(a => String(a.id_pembiayaan)));
        return items.filter(i => !existingIds.has(String(i.id_pembiayaan)) && Number(i.status) !== 0);
    }, [items, kelolaInduk]);

    // Filtered members inside Kelola Modal
    const filteredKelolaAnggota = useMemo(() => {
        if (!kelolaInduk?.anggota) return [];
        const q = kelolaSearch.trim().toLowerCase();
        if (!q) return kelolaInduk.anggota;
        return kelolaInduk.anggota.filter(a =>
            String(a.id_pembiayaan).includes(q) || String(a.nama_pembiayaan).toLowerCase().includes(q)
        );
    }, [kelolaInduk, kelolaSearch]);

    // --- INDUK CRUD HANDLERS ---
    const openCreateInduk = () => {
        setEditingInduk(null);
        setIndukForm(emptyIndukForm);
        setIndukModalOpen(true);
    };

    const openEditInduk = (induk) => {
        setEditingInduk(induk);
        setIndukForm({
            nama: induk.nama || '',
            kode: induk.kode || '',
            keterangan: induk.keterangan || '',
        });
        setIndukModalOpen(true);
    };

    const closeIndukModal = () => {
        if (saving) return;
        setIndukModalOpen(false);
        setEditingInduk(null);
        setIndukForm(emptyIndukForm);
    };

    const saveInduk = async (e) => {
        e.preventDefault();
        if (!indukForm.nama.trim()) {
            toast.error('Nama Induk Pembiayaan wajib diisi.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                nama: indukForm.nama.trim(),
                kode: indukForm.kode.trim(),
                keterangan: indukForm.keterangan.trim(),
            };
            if (editingInduk) {
                await api.patch(`/keuangan/induk-pembiayaan/${editingInduk.id}/`, payload);
                toast.success('Induk Pembiayaan berhasil diperbarui.');
            } else {
                await api.post('/keuangan/induk-pembiayaan/', payload);
                toast.success('Induk Pembiayaan berhasil ditambahkan.');
            }
            closeIndukModal();
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan Induk Pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const deleteInduk = async () => {
        if (!deleteIndukTarget) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/induk-pembiayaan/${deleteIndukTarget.id}/`);
            toast.success(`Induk Pembiayaan ${deleteIndukTarget.nama} berhasil dihapus.`);
            setDeleteIndukTarget(null);
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menghapus Induk Pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    // --- KELOLA ANGGOTA HANDLERS ---
    const openKelolaAnggota = async (induk) => {
        setKelolaInduk(induk);
        setKelolaSearch('');
        setSelectedAddId('');
        try {
            const res = await api.get(`/keuangan/induk-pembiayaan/${induk.id}/`);
            setKelolaInduk(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const addAnggotaToInduk = async () => {
        if (!selectedAddId) {
            toast.error('Pilih pembiayaan yang ingin dimasukkan ke induk ini.');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post(`/keuangan/induk-pembiayaan/${kelolaInduk.id}/tambah-anggota/`, {
                id_pembiayaan: selectedAddId,
            });
            toast.success('Pembiayaan berhasil dimasukkan ke induk.');
            setSelectedAddId('');
            setKelolaInduk(res.data.induk);
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menambahkan anggota pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const removeAnggotaFromInduk = async (id_pembiayaan) => {
        setSaving(true);
        try {
            const res = await api.post(`/keuangan/induk-pembiayaan/${kelolaInduk.id}/keluarkan-anggota/`, {
                id_pembiayaan,
            });
            toast.success('Pembiayaan berhasil dikeluarkan dari induk.');
            setKelolaInduk(res.data.induk);
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengeluarkan anggota pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const quickSetInduk = async (id_pembiayaan, induk_id) => {
        try {
            const res = await api.post('/keuangan/induk-pembiayaan/set-anggota-induk/', {
                id_pembiayaan,
                induk_id: induk_id || null,
            });
            toast.success(res.data.message || 'Berhasil memperbarui induk pembiayaan.');
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengubah induk pembiayaan.'));
        }
    };

    // --- AUTO GROUPING HANDLERS ---
    const openAutoGroup = async () => {
        setAutoGroupLoading(true);
        setAutoGroupModal(true);
        try {
            const res = await api.post('/keuangan/induk-pembiayaan/auto-group/', { apply: false });
            setAutoGroupData(res.data);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menganalisis saran auto-grouping.'));
            setAutoGroupModal(false);
        } finally {
            setAutoGroupLoading(false);
        }
    };

    const applyAutoGroup = async () => {
        setAutoGroupLoading(true);
        try {
            const res = await api.post('/keuangan/induk-pembiayaan/auto-group/', { apply: true });
            toast.success(res.data.message || 'Auto-grouping berhasil diterapkan!');
            setAutoGroupModal(false);
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menerapkan auto-grouping.'));
        } finally {
            setAutoGroupLoading(false);
        }
    };

    // --- PEMBIAYAAN TUNGGAL (CRUD) ---
    const openCreatePembiayaan = () => {
        setEditing(null);
        setForm(emptyForm);
        setModalOpen(true);
    };

    const openEditPembiayaan = (item) => {
        setEditing(item);
        setForm({ nama: item.nama || '', alamat: item.alamat || '' });
        setModalOpen(true);
    };

    const closePembiayaanModal = () => {
        if (saving) return;
        setModalOpen(false);
        setEditing(null);
        setForm(emptyForm);
    };

    const savePembiayaan = async (e) => {
        e.preventDefault();
        if (!form.nama.trim()) {
            toast.error('Nama pembiayaan wajib diisi.');
            return;
        }
        setSaving(true);
        try {
            const payload = { nama: form.nama.trim(), alamat: form.alamat.trim() };
            if (editing) {
                await api.patch(`/keuangan/pembiayaan-options/${editing.id_pembiayaan}/`, payload);
                toast.success('Pembiayaan berhasil diperbarui.');
            } else {
                await api.post('/keuangan/pembiayaan-options/', payload);
                toast.success('Pembiayaan berhasil ditambahkan.');
            }
            closePembiayaanModal();
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const deactivatePembiayaan = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/pembiayaan-options/${deleteTarget.id_pembiayaan}/`);
            toast.success('Pembiayaan berhasil dinonaktifkan.');
            setDeleteTarget(null);
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menonaktifkan pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    const reactivatePembiayaan = async (item) => {
        setSaving(true);
        try {
            await api.patch(`/keuangan/pembiayaan-options/${item.id_pembiayaan}/`, {
                nama: item.nama,
                alamat: item.alamat || '',
                status: 1,
            });
            toast.success('Pembiayaan berhasil diaktifkan.');
            await refreshAll();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengaktifkan pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mp-page">
            {/* Header */}
            <div className="mp-head">
                <div className="mp-title">
                    <span className="mp-title-icon"><Building2 size={24} /></span>
                    <div>
                        <h1>Master Pembiayaan & Induk Asuransi</h1>
                        <p>Kelola daftar instansi, asuransi anak, dan grouping Induk Pembiayaan (TPA/Payor Group).</p>
                    </div>
                </div>
                <div className="mp-actions">
                    <button className="mp-secondary" type="button" onClick={refreshAll} disabled={loading || indukLoading || saving}>
                        <RefreshCw size={16} className={(loading || indukLoading) ? 'spin' : ''} /> Refresh
                    </button>
                    {activeTab === 'induk' ? (
                        <>
                            <button className="mp-accent-btn" type="button" onClick={openAutoGroup} disabled={saving}>
                                <Zap size={16} /> Auto-Group Pintar
                            </button>
                            <button className="mp-primary" type="button" onClick={openCreateInduk} disabled={saving}>
                                <Plus size={16} /> Tambah Induk Baru
                            </button>
                        </>
                    ) : (
                        <button className="mp-primary" type="button" onClick={openCreatePembiayaan} disabled={saving}>
                            <Plus size={16} /> Tambah Pembiayaan
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mp-tab-container">
                <button
                    className={`mp-tab-btn ${activeTab === 'induk' ? 'active' : ''}`}
                    onClick={() => setActiveTab('induk')}
                    type="button"
                >
                    <Layers size={18} />
                    <span>Induk Pembiayaan (Group / TPA)</span>
                    <span className="mp-tab-badge">{stats.totalInduk}</span>
                </button>
                <button
                    className={`mp-tab-btn ${activeTab === 'semua' ? 'active' : ''}`}
                    onClick={() => setActiveTab('semua')}
                    type="button"
                >
                    <Building2 size={18} />
                    <span>Daftar Semua Pembiayaan</span>
                    <span className="mp-tab-badge">{stats.total}</span>
                </button>
            </div>

            {/* Summary Stat Cards */}
            <div className="mp-stats-grid">
                <div className="mp-stat-card">
                    <div className="mp-stat-icon total"><Layers size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Total Induk (Group)</span>
                        <strong className="mp-stat-value">{stats.totalInduk} Induk</strong>
                    </div>
                </div>
                <div className="mp-stat-card">
                    <div className="mp-stat-icon active"><CheckCircle2 size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Pembiayaan Tergabung Induk</span>
                        <strong className="mp-stat-value emerald">{stats.mapped}</strong>
                    </div>
                </div>
                <div className="mp-stat-card">
                    <div className="mp-stat-icon inactive"><AlertTriangle size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Pembiayaan Mandiri (Tanpa Induk)</span>
                        <strong className="mp-stat-value amber">{stats.unmapped}</strong>
                    </div>
                </div>
            </div>

            {/* TAB 1: INDUK PEMBIAYAAN */}
            {activeTab === 'induk' && (
                <section className="mp-card">
                    <div className="mp-toolbar">
                        <label className="mp-search">
                            <Search size={16} />
                            <input
                                value={indukSearch}
                                onChange={(e) => setIndukSearch(e.target.value)}
                                placeholder="Cari nama induk atau kode..."
                            />
                            {indukSearch && (
                                <button type="button" className="mp-search-clear" onClick={() => setIndukSearch('')}>
                                    <X size={14} />
                                </button>
                            )}
                        </label>
                    </div>

                    <div className="mp-table-wrap">
                        <table className="mp-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px' }}>No</th>
                                    <th>Nama Induk Pembiayaan (Payor Group)</th>
                                    <th style={{ width: '120px' }}>Kode</th>
                                    <th style={{ width: '180px' }}>Jumlah Anggota Anak</th>
                                    <th>Keterangan</th>
                                    <th className="right" style={{ width: '190px' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {indukLoading ? (
                                    <tr><td colSpan="6" className="center mp-state">Memuat data induk pembiayaan...</td></tr>
                                ) : filteredIndukList.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="center mp-state">
                                            Belum ada Induk Pembiayaan. Klik <strong>"Tambah Induk Baru"</strong> atau gunakan <strong>"⚡ Auto-Group Pintar"</strong>.
                                        </td>
                                    </tr>
                                ) : filteredIndukList.map((induk, idx) => (
                                    <tr key={induk.id}>
                                        <td><span className="mp-id-badge">{idx + 1}</span></td>
                                        <td>
                                            <div className="mp-induk-name-cell">
                                                <div className="mp-induk-avatar"><Building2 size={16} /></div>
                                                <div>
                                                    <strong>{induk.nama}</strong>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {induk.kode ? (
                                                <span className="mp-code-badge">{induk.kode}</span>
                                            ) : <span className="mp-na">—</span>}
                                        </td>
                                        <td>
                                            <div className="mp-members-count-pill">
                                                <Users size={14} />
                                                <span><strong>{induk.total_anggota || 0}</strong> Pembiayaan</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="mp-desc-text">{induk.keterangan || '—'}</span>
                                        </td>
                                        <td className="right">
                                            <div className="mp-row-actions">
                                                <button
                                                    className="mp-mini-btn kelola"
                                                    type="button"
                                                    onClick={() => openKelolaAnggota(induk)}
                                                    title="Kelola Anggota Anak"
                                                >
                                                    <Users size={14} /> Anggota
                                                </button>
                                                <button
                                                    className="mp-icon-btn edit"
                                                    type="button"
                                                    onClick={() => openEditInduk(induk)}
                                                    title="Edit Induk"
                                                >
                                                    <Edit3 size={15} />
                                                </button>
                                                <button
                                                    className="mp-icon-btn danger"
                                                    type="button"
                                                    onClick={() => setDeleteIndukTarget(induk)}
                                                    title="Hapus Induk"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* TAB 2: SEMUA PEMBIAYAAN */}
            {activeTab === 'semua' && (
                <section className="mp-card">
                    <div className="mp-toolbar">
                        <label className="mp-search">
                            <Search size={16} />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Cari nama, ID, alamat, atau induk pembiayaan..."
                            />
                            {search && (
                                <button type="button" className="mp-search-clear" onClick={() => setSearch('')}>
                                    <X size={14} />
                                </button>
                            )}
                        </label>
                        <select className="mp-select" value={indukFilter} onChange={(e) => setIndukFilter(e.target.value)}>
                            <option value="semua">Semua Induk (Group)</option>
                            <option value="mapped">✅ Tergabung dalam Induk</option>
                            <option value="unmapped">⚠️ Mandiri (Tanpa Induk)</option>
                            <optgroup label="Pilih Berdasarkan Induk">
                                {indukList.map(ind => (
                                    <option key={ind.id} value={ind.id}>{ind.nama}</option>
                                ))}
                            </optgroup>
                        </select>
                        <select className="mp-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            <option value="aktif">Status: Aktif</option>
                            <option value="semua">Semua Status</option>
                            <option value="nonaktif">Status: Nonaktif</option>
                        </select>
                    </div>

                    <div className="mp-table-wrap">
                        <table className="mp-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '80px' }}>ID</th>
                                    <th>Nama Pembiayaan</th>
                                    <th style={{ width: '230px' }}>Induk Pembiayaan (Payor Group)</th>
                                    <th>Alamat</th>
                                    <th style={{ width: '110px' }}>Status</th>
                                    <th className="right" style={{ width: '130px' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" className="center mp-state">Memuat daftar pembiayaan...</td></tr>
                                ) : pagedItems.length === 0 ? (
                                    <tr><td colSpan="6" className="center mp-state">Belum ada pembiayaan sesuai filter.</td></tr>
                                ) : pagedItems.map((item) => {
                                    const active = Number(item.status) !== 0;
                                    return (
                                        <tr key={item.id_pembiayaan} className={active ? '' : 'inactive'}>
                                            <td>
                                                <span className="mp-id-badge">{item.id_pembiayaan}</span>
                                            </td>
                                            <td>
                                                <div className="mp-name-cell">
                                                    <strong>{item.nama}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <select
                                                    className={`mp-inline-induk-select ${item.induk_id ? 'has-induk' : 'no-induk'}`}
                                                    value={item.induk_id || ''}
                                                    onChange={(e) => quickSetInduk(item.id_pembiayaan, e.target.value ? Number(e.target.value) : null)}
                                                    title="Pilih induk pembiayaan untuk akun ini"
                                                >
                                                    <option value="">— Mandiri (Tanpa Induk) —</option>
                                                    {indukList.map(ind => (
                                                        <option key={ind.id} value={ind.id}>🏢 {ind.nama}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <div className="mp-address-cell">
                                                    {item.alamat ? (
                                                        <span><MapPin size={13} className="mp-pin" /> {item.alamat}</span>
                                                    ) : (
                                                        <span className="mp-na">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`mp-badge ${active ? 'active' : 'inactive'}`}>
                                                    <span className="mp-badge-dot" />
                                                    {active ? 'Aktif' : 'Nonaktif'}
                                                </span>
                                            </td>
                                            <td className="right">
                                                <div className="mp-row-actions">
                                                    <button className="mp-icon-btn edit" type="button" onClick={() => openEditPembiayaan(item)} title="Edit Data">
                                                        <Edit3 size={15} />
                                                    </button>
                                                    {active ? (
                                                        <button className="mp-icon-btn danger" type="button" onClick={() => setDeleteTarget(item)} title="Nonaktifkan">
                                                            <Trash2 size={15} />
                                                        </button>
                                                    ) : (
                                                        <button className="mp-mini-btn reactivate" type="button" onClick={() => reactivatePembiayaan(item)} disabled={saving}>
                                                            Aktifkan
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="mp-pagination">
                        <SimplePagination
                            page={page}
                            pageSize={pageSize}
                            total={filteredItems.length}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            buttonClassName="mp-page-btn"
                            selectClassName="mp-page-size"
                        />
                    </div>
                </section>
            )}

            {/* MODAL: KELOLA ANGGOTA INDUK */}
            {kelolaInduk && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal wide">
                        <div className="mp-modal-head">
                            <div className="mp-modal-title-with-badge">
                                <h2>Kelola Anggota Induk: <span className="highlight">{kelolaInduk.nama}</span></h2>
                                <span className="mp-modal-count-badge">{(kelolaInduk.anggota || []).length} Tergabung</span>
                            </div>
                            <button type="button" className="mp-close-btn" onClick={() => setKelolaInduk(null)} disabled={saving}><X size={18} /></button>
                        </div>
                        <div className="mp-modal-body">
                            {/* Tambah Anggota Baru */}
                            <div className="mp-add-member-panel">
                                <label className="mp-form-group flex-1">
                                    <span>➕ Masukkan Pembiayaan Anak ke Induk Ini</span>
                                    <select
                                        className="mp-select w-full"
                                        value={selectedAddId}
                                        onChange={(e) => setSelectedAddId(e.target.value)}
                                        disabled={saving}
                                    >
                                        <option value="">-- Pilih Pembiayaan untuk Ditambahkan --</option>
                                        {availableChildrenForInduk.map(child => (
                                            <option key={child.id_pembiayaan} value={child.id_pembiayaan}>
                                                [ID: {child.id_pembiayaan}] {child.nama} {child.induk_nama ? `(Pindah dari: ${child.induk_nama})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className="mp-primary add-member-btn"
                                    onClick={addAnggotaToInduk}
                                    disabled={!selectedAddId || saving}
                                >
                                    <UserPlus size={16} /> Tambahkan
                                </button>
                            </div>

                            {/* Daftar Anggota Tergabung */}
                            <div className="mp-member-list-header">
                                <h3>Daftar Pembiayaan Tergabung</h3>
                                <label className="mp-search-mini">
                                    <Search size={14} />
                                    <input
                                        value={kelolaSearch}
                                        onChange={(e) => setKelolaSearch(e.target.value)}
                                        placeholder="Cari anggota dalam induk..."
                                    />
                                    {kelolaSearch && (
                                        <button type="button" className="mp-search-clear" onClick={() => setKelolaSearch('')}>
                                            <X size={12} />
                                        </button>
                                    )}
                                </label>
                            </div>

                            <div className="mp-member-table-container">
                                <table className="mp-table inner-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '80px' }}>ID</th>
                                            <th>Nama Pembiayaan Anak</th>
                                            <th className="right" style={{ width: '130px' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredKelolaAnggota.length === 0 ? (
                                            <tr>
                                                <td colSpan="3" className="center mp-state">
                                                    {kelolaSearch ? 'Tidak ada anggota yang cocok dengan pencarian.' : 'Belum ada pembiayaan anak di dalam induk ini.'}
                                                </td>
                                            </tr>
                                        ) : filteredKelolaAnggota.map(anggota => (
                                            <tr key={anggota.id_pembiayaan}>
                                                <td><span className="mp-id-badge">{anggota.id_pembiayaan}</span></td>
                                                <td>
                                                    <strong>{anggota.nama_pembiayaan}</strong>
                                                </td>
                                                <td className="right">
                                                    <button
                                                        type="button"
                                                        className="mp-danger-mini-btn"
                                                        onClick={() => removeAnggotaFromInduk(anggota.id_pembiayaan)}
                                                        disabled={saving}
                                                        title="Keluarkan dari induk"
                                                    >
                                                        <UserMinus size={14} /> Keluarkan
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mp-modal-actions">
                            <button type="button" className="mp-secondary" onClick={() => setKelolaInduk(null)}>Selesai</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: AUTO-GROUPING PINTAR */}
            {autoGroupModal && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal wide">
                        <div className="mp-modal-head">
                            <div className="mp-modal-title-with-badge">
                                <h2>⚡ Saran Pengelompokan Otomatis (Auto-Group)</h2>
                            </div>
                            <button type="button" className="mp-close-btn" onClick={() => setAutoGroupModal(false)} disabled={autoGroupLoading}><X size={18} /></button>
                        </div>
                        <div className="mp-modal-body">
                            {autoGroupLoading ? (
                                <div className="mp-state center" style={{ padding: '40px 0' }}>
                                    <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: '#2563eb' }} />
                                    <p>Menganalisis dan mengelompokkan pola nama pembiayaan...</p>
                                </div>
                            ) : autoGroupData ? (
                                <>
                                    <div className="mp-auto-group-banner">
                                        <p>
                                            Sistem mendeteksi <strong>{autoGroupData.total_pembiayaan_matched} pembiayaan</strong> yang cocok dikelompokkan ke dalam <strong>{autoGroupData.total_groups} Induk Pembiayaan</strong> berdasarkan kesamaan pola TPA / Asuransi Induk.
                                        </p>
                                    </div>
                                    <div className="mp-auto-group-list">
                                        {(autoGroupData.suggestions || []).map((group, idx) => (
                                            <div key={idx} className="mp-auto-group-card">
                                                <div className="mp-auto-group-card-head">
                                                    <div className="mp-auto-group-title">
                                                        <Building2 size={16} />
                                                        <strong>{group.induk_nama}</strong>
                                                    </div>
                                                    <span className="mp-auto-group-count">{group.total_match} Anggota Terdeteksi</span>
                                                </div>
                                                <div className="mp-auto-group-card-body">
                                                    <small className="mp-subtext">Contoh anggota: {group.items.slice(0, 3).map(i => i.nama_pembiayaan).join(', ')}{group.items.length > 3 ? ` ... (+${group.items.length - 3} lainnya)` : ''}</small>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </div>
                        <div className="mp-modal-actions">
                            <button type="button" className="mp-secondary" onClick={() => setAutoGroupModal(false)} disabled={autoGroupLoading}>Batal</button>
                            <button
                                type="button"
                                className="mp-accent-btn"
                                onClick={applyAutoGroup}
                                disabled={autoGroupLoading || !autoGroupData}
                            >
                                {autoGroupLoading ? 'Menerapkan...' : <><Check size={16} /> Terapkan Pengelompokan Sekarang</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: TAMBAH / EDIT INDUK */}
            {indukModalOpen && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal">
                        <div className="mp-modal-head">
                            <h2>{editingInduk ? 'Edit Induk Pembiayaan' : 'Tambah Induk Pembiayaan Baru'}</h2>
                            <button type="button" className="mp-close-btn" onClick={closeIndukModal} disabled={saving}><X size={18} /></button>
                        </div>
                        <form onSubmit={saveInduk}>
                            <div className="mp-modal-body">
                                <label className="mp-form-group">
                                    <span>Nama Induk (Payor Group) <small style={{ color: '#ef4444' }}>*</small></span>
                                    <input
                                        className="mp-input"
                                        value={indukForm.nama}
                                        onChange={(e) => setIndukForm({ ...indukForm, nama: e.target.value })}
                                        placeholder="Contoh: ADMEDIKA, ISOMEDIK, FULLERTON"
                                        autoFocus
                                    />
                                </label>
                                <label className="mp-form-group">
                                    <span>Kode / Singkatan (Opsional)</span>
                                    <input
                                        className="mp-input"
                                        value={indukForm.kode}
                                        onChange={(e) => setIndukForm({ ...indukForm, kode: e.target.value })}
                                        placeholder="Contoh: ADM, ISO, FHI"
                                    />
                                </label>
                                <label className="mp-form-group">
                                    <span>Keterangan</span>
                                    <textarea
                                        className="mp-input mp-textarea"
                                        rows={3}
                                        value={indukForm.keterangan}
                                        onChange={(e) => setIndukForm({ ...indukForm, keterangan: e.target.value })}
                                        placeholder="Keterangan penjaminan / TPA"
                                    />
                                </label>
                            </div>
                            <div className="mp-modal-actions">
                                <button type="button" className="mp-secondary" onClick={closeIndukModal} disabled={saving}>Batal</button>
                                <button type="submit" className="mp-primary" disabled={saving}>
                                    {saving ? 'Menyimpan...' : (editingInduk ? 'Simpan Perubahan' : 'Tambah Induk')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: TAMBAH / EDIT PEMBIAYAAN TUNGGAL */}
            {modalOpen && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal">
                        <div className="mp-modal-head">
                            <h2>{editing ? 'Edit Pembiayaan' : 'Tambah Pembiayaan Baru'}</h2>
                            <button type="button" className="mp-close-btn" onClick={closePembiayaanModal} disabled={saving}><X size={18} /></button>
                        </div>
                        <form onSubmit={savePembiayaan}>
                            <div className="mp-modal-body">
                                <label className="mp-form-group">
                                    <span>Nama Pembiayaan <small style={{ color: '#ef4444' }}>*</small></span>
                                    <input
                                        className="mp-input"
                                        value={form.nama}
                                        onChange={(e) => setForm({ ...form, nama: e.target.value })}
                                        placeholder="Contoh: PT ASURANSI ALLIANZ UTAMA"
                                        autoFocus
                                    />
                                </label>
                                <label className="mp-form-group">
                                    <span>Alamat Instansi</span>
                                    <textarea
                                        className="mp-input mp-textarea"
                                        rows={3}
                                        value={form.alamat}
                                        onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                                        placeholder="Alamat kantor / gedung pembiayaan"
                                    />
                                </label>
                            </div>
                            <div className="mp-modal-actions">
                                <button type="button" className="mp-secondary" onClick={closePembiayaanModal} disabled={saving}>Batal</button>
                                <button type="submit" className="mp-primary" disabled={saving}>
                                    {saving ? 'Menyimpan...' : (editing ? 'Simpan Perubahan' : 'Tambah Pembiayaan')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CONFIRM HAPUS INDUK MODAL */}
            {deleteIndukTarget && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal confirm">
                        <div className="mp-confirm-head">
                            <div className="mp-confirm-icon"><ShieldAlert size={24} /></div>
                            <h3>Hapus Induk Pembiayaan?</h3>
                        </div>
                        <p className="mp-confirm-text">
                            Induk <strong>{deleteIndukTarget.nama}</strong> akan dihapus. Pembiayaan anak yang tergabung di dalamnya akan dilepaskan menjadi pembiayaan mandiri (tanpa induk).
                        </p>
                        <div className="mp-modal-actions confirm">
                            <button type="button" className="mp-secondary" onClick={() => setDeleteIndukTarget(null)} disabled={saving}>Batal</button>
                            <button type="button" className="mp-danger" onClick={deleteInduk} disabled={saving}>
                                {saving ? 'Memproses...' : 'Ya, Hapus Induk'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM NONAKTIFKAN PEMBIAYAAN MODAL */}
            {deleteTarget && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal confirm">
                        <div className="mp-confirm-head">
                            <div className="mp-confirm-icon"><ShieldAlert size={24} /></div>
                            <h3>Nonaktifkan Pembiayaan?</h3>
                        </div>
                        <p className="mp-confirm-text">
                            Pembiayaan <strong>{deleteTarget.nama}</strong> (ID {deleteTarget.id_pembiayaan}) akan dinonaktifkan dari daftar pilihan invoice.
                        </p>
                        <div className="mp-modal-actions confirm">
                            <button type="button" className="mp-secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Batal</button>
                            <button type="button" className="mp-danger" onClick={deactivatePembiayaan} disabled={saving}>
                                {saving ? 'Memproses...' : 'Ya, Nonaktifkan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
