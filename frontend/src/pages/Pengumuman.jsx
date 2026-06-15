import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Edit3,
    Megaphone,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import api from '../api/axiosConfig';
import './Pengumuman.css';
import { useToast } from '../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../utils/pagination.jsx';

const AUDIENCES = [
    { value: 'all', label: 'Semua' },
    { value: 'karyawan', label: 'Karyawan' },
    { value: 'kepala_seksi', label: 'Kepala Seksi' },
    { value: 'manajer', label: 'Manajer' },
    { value: 'wakil_direktur', label: 'Wakil Direktur' },
    { value: 'direktur', label: 'Direktur' },
];

const PRIORITIES = {
    normal: { label: 'Normal', bg: '#e8f5ec', fg: '#166534' },
    important: { label: 'Penting', bg: '#fef3c7', fg: '#92400e' },
    urgent: { label: 'Darurat', bg: '#fee2e2', fg: '#991b1b' },
};

const emptyForm = {
    title: '',
    message: '',
    priority: 'normal',
    audience: ['all'],
    is_active: true,
};

const fmtDT = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const audienceLabel = (value) => {
    const values = String(value || 'all').split(',').filter(Boolean);
    if (values.includes('all')) return 'Semua';
    return values.map((item) => AUDIENCES.find((aud) => aud.value === item)?.label || item).join(', ');
};

function PriorityBadge({ value }) {
    const meta = PRIORITIES[value] || PRIORITIES.normal;
    return <span className="pg-badge" style={{ '--bg': meta.bg, '--fg': meta.fg }}>{meta.label}</span>;
}

export default function Pengumuman() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/announcements/', {
                params: pageParams(page, pageSize, { manage: '1', search: search || undefined }),
            });
            setRows(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal memuat pengumuman.');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, toast]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const stats = useMemo(() => ({
        total,
        active: rows.filter((item) => item.is_active).length,
        inactive: rows.filter((item) => !item.is_active).length,
        urgent: rows.filter((item) => item.priority === 'urgent').length,
    }), [rows, total]);

    const openCreate = () => {
        setForm(emptyForm);
        setEditingId(null);
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setForm({
            title: item.title || '',
            message: item.message || '',
            priority: item.priority || 'normal',
            audience: String(item.audience || 'all').split(',').filter(Boolean),
            is_active: item.is_active !== false,
        });
        setEditingId(item.id);
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
        setEditingId(null);
        setForm(emptyForm);
    };

    const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const toggleAudience = (value) => {
        setForm((prev) => {
            if (value === 'all') return { ...prev, audience: ['all'] };
            const current = prev.audience.includes('all') ? [] : prev.audience;
            const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
            return { ...prev, audience: next.length ? next : ['all'] };
        });
    };

    const saveAnnouncement = async (event) => {
        event.preventDefault();
        if (!form.title.trim() || !form.message.trim()) {
            toast.error('Judul dan isi pengumuman wajib diisi.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                message: form.message.trim(),
                priority: form.priority,
                audience: (form.audience.length ? form.audience : ['all']).join(','),
                is_active: form.is_active,
            };
            if (editingId) {
                await api.patch(`/keuangan/announcements/${editingId}/`, payload);
                toast.success('Pengumuman berhasil diperbarui.');
            } else {
                await api.post('/keuangan/announcements/', payload);
                toast.success('Pengumuman berhasil dibuat.');
            }
            setModalOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            await fetchRows();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.error || 'Gagal menyimpan pengumuman.');
        } finally {
            setSaving(false);
        }
    };

    const deleteAnnouncement = async (item) => {
        if (!window.confirm(`Hapus pengumuman "${item.title}"?`)) return;
        try {
            await api.delete(`/keuangan/announcements/${item.id}/`);
            toast.success('Pengumuman berhasil dihapus.');
            await fetchRows();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.error || 'Gagal menghapus pengumuman.');
        }
    };

    return (
        <div className="pg-page">
            <section className="pg-hero">
                <div className="pg-page-title">
                    <span><Megaphone size={22} /></span>
                    <div>
                        <h1>Pengumuman</h1>
                        <p>Kelola pesan resmi untuk semua akun atau role tertentu. Pengumuman tetap dibaca user lewat ikon notifikasi di topbar.</p>
                    </div>
                </div>
            </section>

            <div className="pg-stats">
                <div className="pg-stat"><span>Total</span><strong>{stats.total}</strong></div>
                <div className="pg-stat"><span>Aktif di Halaman Ini</span><strong>{stats.active}</strong></div>
                <div className="pg-stat"><span>Nonaktif di Halaman Ini</span><strong>{stats.inactive}</strong></div>
                <div className="pg-stat"><span>Darurat di Halaman Ini</span><strong>{stats.urgent}</strong></div>
            </div>

            <section className="pg-panel">
                <div className="pg-toolbar">
                    <div className="pg-search">
                        <Search size={16} />
                        <input
                            value={search}
                            onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                            placeholder="Cari judul atau isi pengumuman..."
                        />
                    </div>
                    <button className="pg-btn primary" type="button" onClick={openCreate}>
                        <Plus size={16} /> Tambah Pengumuman
                    </button>
                </div>

                <div className="pg-table-wrap">
                    <table className="pg-table">
                        <thead>
                            <tr>
                                <th>Pengumuman</th>
                                <th>Audiens</th>
                                <th>Prioritas</th>
                                <th>Status</th>
                                <th>Dibuat</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <div className="pg-title">{item.title}</div>
                                        <div className="pg-message">{item.message}</div>
                                    </td>
                                    <td>{audienceLabel(item.audience)}</td>
                                    <td><PriorityBadge value={item.priority} /></td>
                                    <td>
                                        <span className={`pg-status ${item.is_active ? 'active' : 'inactive'}`}>
                                            {item.is_active ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                            {item.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td>
                                        <div>{fmtDT(item.created_at)}</div>
                                        <small>{item.created_by_name || 'System'}</small>
                                    </td>
                                    <td>
                                        <div className="pg-actions">
                                            <button className="pg-icon-btn" type="button" title="Edit" onClick={() => openEdit(item)}><Edit3 size={15} /></button>
                                            <button className="pg-icon-btn danger" type="button" title="Hapus" onClick={() => deleteAnnouncement(item)}><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && rows.length === 0 && <div className="pg-empty">Belum ada pengumuman.</div>}
                    {loading && <div className="pg-empty">Memuat pengumuman...</div>}
                </div>

                <SimplePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    buttonClassName="pg-page-btn"
                    selectClassName="pg-page-size"
                />
            </section>

            {modalOpen && createPortal((
                <div className="pg-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
                    <form className="pg-modal" onSubmit={saveAnnouncement}>
                        <div className="pg-modal-head">
                            <div>
                                <h2>{editingId ? 'Edit Pengumuman' : 'Tambah Pengumuman'}</h2>
                                <p>Tanggal dan jam akan mengikuti waktu saat data dibuat atau diperbarui.</p>
                            </div>
                        </div>

                        <div className="pg-form">
                            <label>
                                <span>Judul</span>
                                <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="Contoh: Jadwal maintenance sistem" />
                            </label>
                            <label>
                                <span>Prioritas</span>
                                <select value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}>
                                    <option value="normal">Normal</option>
                                    <option value="important">Penting</option>
                                    <option value="urgent">Darurat</option>
                                </select>
                            </label>
                            <label className="pg-wide">
                                <span>Isi Pengumuman</span>
                                <textarea value={form.message} onChange={(event) => updateForm('message', event.target.value)} placeholder="Tulis isi pengumuman..." rows={6} />
                            </label>
                            <div className="pg-wide">
                                <span className="pg-label">Audiens</span>
                                <div className="pg-check-grid">
                                    {AUDIENCES.map((item) => (
                                        <label
                                            key={item.value}
                                            className={`pg-audience-card${form.audience.includes(item.value) ? ' selected' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.audience.includes(item.value)}
                                                onChange={() => toggleAudience(item.value)}
                                            />
                                            <span className="pg-audience-mark"><Check size={13} /></span>
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <label className="pg-switch active-toggle">
                                <input type="checkbox" checked={form.is_active} onChange={(event) => updateForm('is_active', event.target.checked)} />
                                <span className="pg-switch-track"><span className="pg-switch-thumb" /></span>
                                <span>
                                    <strong>Aktif</strong>
                                    <small>Tampil di notifikasi sesuai audiens</small>
                                </span>
                            </label>
                        </div>

                        <div className="pg-modal-foot">
                            <button className="pg-btn" type="button" onClick={closeModal}>Batal</button>
                            <button className="pg-btn primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
                        </div>
                    </form>
                </div>
            ), document.body)}
        </div>
    );
}


