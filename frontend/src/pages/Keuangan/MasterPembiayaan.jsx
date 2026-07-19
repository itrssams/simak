import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Edit3, MapPin, Plus, RefreshCw, Search, Trash2, X, AlertTriangle, ShieldAlert } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getResults, SimplePagination } from '../../utils/pagination.jsx';
import './MasterPembiayaan.css';

const emptyForm = { nama: '', alamat: '' };
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
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('aktif');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

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

    useEffect(() => { fetchItems(); }, [fetchItems]);
    useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

    const stats = useMemo(() => {
        const total = items.length;
        const active = items.filter(i => Number(i.status) !== 0).length;
        const inactive = total - active;
        return { total, active, inactive };
    }, [items]);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((item) => {
            const active = Number(item.status) !== 0;
            if (statusFilter === 'aktif' && !active) return false;
            if (statusFilter === 'nonaktif' && active) return false;
            if (!q) return true;
            return [item.id_pembiayaan, item.nama, item.alamat].some((value) =>
                String(value || '').toLowerCase().includes(q),
            );
        });
    }, [items, search, statusFilter]);

    const pagedItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredItems.slice(start, start + pageSize);
    }, [filteredItems, page, pageSize]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setEditing(item);
        setForm({ nama: item.nama || '', alamat: item.alamat || '' });
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
        setEditing(null);
        setForm(emptyForm);
    };

    const validateForm = () => {
        if (!form.nama.trim()) {
            toast.error('Nama pembiayaan wajib diisi.');
            return false;
        }
        const duplicate = items.find((item) =>
            String(item.id_pembiayaan) !== String(editing?.id_pembiayaan || '') &&
            normalizeName(item.nama) === normalizeName(form.nama),
        );
        if (duplicate) {
            const suffix = Number(duplicate.status) === 0 ? ' Aktifkan data tersebut jika ingin dipakai lagi.' : '';
            toast.error(`Pembiayaan sudah ada: ${duplicate.nama} - ID ${duplicate.id_pembiayaan}.${suffix}`);
            return false;
        }
        return true;
    };

    const savePembiayaan = async (event) => {
        event.preventDefault();
        if (!validateForm()) return;
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
            closeModal();
            await fetchItems();
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
            await fetchItems();
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
            await fetchItems();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengaktifkan pembiayaan.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mp-page">
            <div className="mp-head">
                <div className="mp-title">
                    <span className="mp-title-icon"><Building2 size={24} /></span>
                    <div>
                        <h1>Master Pembiayaan</h1>
                        <p>Kelola daftar instansi & perusahaan pembiayaan invoice dan penagihan.</p>
                    </div>
                </div>
                <div className="mp-actions">
                    <button className="mp-secondary" type="button" onClick={fetchItems} disabled={loading || saving}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    <button className="mp-primary" type="button" onClick={openCreate} disabled={saving}>
                        <Plus size={16} /> Tambah Pembiayaan
                    </button>
                </div>
            </div>

            {/* Summary Stat Cards */}
            <div className="mp-stats-grid">
                <div className="mp-stat-card">
                    <div className="mp-stat-icon total"><Building2 size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Total Pembiayaan</span>
                        <strong className="mp-stat-value">{stats.total}</strong>
                    </div>
                </div>
                <div className="mp-stat-card">
                    <div className="mp-stat-icon active"><CheckCircle2 size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Pembiayaan Aktif</span>
                        <strong className="mp-stat-value emerald">{stats.active}</strong>
                    </div>
                </div>
                <div className="mp-stat-card">
                    <div className="mp-stat-icon inactive"><AlertTriangle size={20} /></div>
                    <div className="mp-stat-info">
                        <span className="mp-stat-label">Nonaktif</span>
                        <strong className="mp-stat-value amber">{stats.inactive}</strong>
                    </div>
                </div>
            </div>

            <section className="mp-card">
                <div className="mp-toolbar">
                    <label className="mp-search">
                        <Search size={16} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Cari nama, ID, atau alamat pembiayaan..."
                        />
                        {search && (
                            <button type="button" className="mp-search-clear" onClick={() => setSearch('')}>
                                <X size={14} />
                            </button>
                        )}
                    </label>
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
                                <th>Alamat</th>
                                <th style={{ width: '120px' }}>Status</th>
                                <th className="right" style={{ width: '140px' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="center mp-state">Memuat daftar pembiayaan...</td></tr>
                            ) : pagedItems.length === 0 ? (
                                <tr><td colSpan="5" className="center mp-state">Belum ada pembiayaan sesuai filter.</td></tr>
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
                                                <button className="mp-icon-btn edit" type="button" onClick={() => openEdit(item)} title="Edit Data">
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

            {/* Modal Tambah / Edit */}
            {modalOpen && (
                <div className="mp-modal-overlay">
                    <div className="mp-modal">
                        <div className="mp-modal-head">
                            <h2>{editing ? 'Edit Pembiayaan' : 'Tambah Pembiayaan Baru'}</h2>
                            <button type="button" className="mp-close-btn" onClick={closeModal} disabled={saving}><X size={18} /></button>
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
                                <button type="button" className="mp-secondary" onClick={closeModal} disabled={saving}>Batal</button>
                                <button type="submit" className="mp-primary" disabled={saving}>
                                    {saving ? 'Menyimpan...' : (editing ? 'Simpan Perubahan' : 'Tambah Pembiayaan')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Nonaktifkan Modal */}
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
