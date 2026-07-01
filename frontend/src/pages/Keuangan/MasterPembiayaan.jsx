import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
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
                    <span><Building2 size={22} /></span>
                    <div>
                        <h1>Master Pembiayaan</h1>
                        <p>Kelola daftar pembiayaan yang dipakai untuk invoice dan alokasi dana.</p>
                    </div>
                </div>
                <div className="mp-actions">
                    <button className="mp-secondary" type="button" onClick={fetchItems} disabled={loading || saving}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="mp-primary" type="button" onClick={openCreate} disabled={saving}>
                        <Plus size={16} /> Tambah Pembiayaan
                    </button>
                </div>
            </div>

            <section className="mp-card">
                <div className="mp-toolbar">
                    <label className="mp-search">
                        <Search size={16} />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, ID, atau alamat..." />
                    </label>
                    <select className="mp-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="aktif">Aktif</option>
                        <option value="semua">Semua Status</option>
                        <option value="nonaktif">Nonaktif</option>
                    </select>
                </div>

                <div className="mp-table-wrap">
                    <table className="mp-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nama Pembiayaan</th>
                                <th>Alamat</th>
                                <th>Status</th>
                                <th className="right">Aksi</th>
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
                                        <td className="mono">{item.id_pembiayaan}</td>
                                        <td><strong>{item.nama}</strong></td>
                                        <td>{item.alamat || '-'}</td>
                                        <td><span className={`mp-badge ${active ? 'active' : 'inactive'}`}>{active ? 'Aktif' : 'Nonaktif'}</span></td>
                                        <td className="right">
                                            <div className="mp-row-actions">
                                                <button className="mp-icon-btn" type="button" onClick={() => openEdit(item)} title="Edit">
                                                    <Edit3 size={15} />
                                                </button>
                                                {active ? (
                                                    <button className="mp-icon-btn danger" type="button" onClick={() => setDeleteTarget(item)} title="Nonaktifkan">
                                                        <Trash2 size={15} />
                                                    </button>
                                                ) : (
                                                    <button className="mp-mini-btn" type="button" onClick={() => reactivatePembiayaan(item)} disabled={saving}>
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

            {modalOpen && (
                <div className="mp-modal-backdrop" onMouseDown={closeModal}>
                    <form className="mp-modal" onSubmit={savePembiayaan} onMouseDown={(event) => event.stopPropagation()}>
                        <div className="mp-modal-head">
                            <div>
                                <span><Building2 size={20} /></span>
                                <div>
                                    <small>{editing ? 'Edit Pembiayaan' : 'Tambah Pembiayaan'}</small>
                                    <h2>{editing ? editing.nama : 'Pembiayaan Baru'}</h2>
                                </div>
                            </div>
                            <button type="button" onClick={closeModal} disabled={saving}><X size={18} /> Tutup</button>
                        </div>
                        <div className="mp-modal-body">
                            {editing && (
                                <label className="mp-field">
                                    <span>ID Pembiayaan</span>
                                    <input value={editing.id_pembiayaan} readOnly />
                                </label>
                            )}
                            <label className="mp-field">
                                <span>Nama Pembiayaan</span>
                                <input
                                    value={form.nama}
                                    onChange={(event) => setForm((prev) => ({ ...prev, nama: event.target.value }))}
                                    placeholder="Nama pembiayaan"
                                    autoFocus
                                />
                            </label>
                            <label className="mp-field">
                                <span>Alamat</span>
                                <input
                                    value={form.alamat}
                                    onChange={(event) => setForm((prev) => ({ ...prev, alamat: event.target.value }))}
                                    placeholder="Opsional"
                                />
                            </label>
                            <div className="mp-modal-actions">
                                <button className="mp-secondary" type="button" onClick={closeModal} disabled={saving}>Batal</button>
                                <button className="mp-primary" type="submit" disabled={saving}>
                                    {saving ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {deleteTarget && (
                <div className="mp-modal-backdrop" onMouseDown={() => !saving && setDeleteTarget(null)}>
                    <div className="mp-modal confirm" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="mp-modal-head">
                            <div>
                                <span><Trash2 size={20} /></span>
                                <div>
                                    <small>Nonaktifkan Pembiayaan</small>
                                    <h2>{deleteTarget.nama}</h2>
                                </div>
                            </div>
                            <button type="button" onClick={() => setDeleteTarget(null)} disabled={saving}><X size={18} /> Tutup</button>
                        </div>
                        <div className="mp-modal-body">
                            <p className="mp-confirm-copy">
                                Pembiayaan ini tidak akan tampil di pilihan invoice baru, tapi histori invoice lama tetap tersimpan.
                            </p>
                            <div className="mp-modal-actions">
                                <button className="mp-secondary" type="button" onClick={() => setDeleteTarget(null)} disabled={saving}>Batal</button>
                                <button className="mp-danger" type="button" onClick={deactivatePembiayaan} disabled={saving}>
                                    {saving ? 'Memproses...' : 'Nonaktifkan'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
