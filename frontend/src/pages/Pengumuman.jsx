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
            <style>{CSS}</style>

            <section className="pg-hero">
                <div>
                    <div className="pg-kicker"><Megaphone size={14} /> Pusat Informasi</div>
                    <h1>Pengumuman</h1>
                    <p>Kelola pesan resmi untuk semua akun atau role tertentu. Pengumuman tetap dibaca user lewat ikon notifikasi di topbar.</p>
                </div>
                <div className="pg-hero-stat">
                    <span>Total Data</span>
                    <strong>{loading ? '...' : total}</strong>
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

const CSS = `
.pg-page{display:flex;flex-direction:column;gap:18px;color:#17251d;font-family:'Plus Jakarta Sans',sans-serif}
.pg-hero{border:1px solid #d9e7df;border-radius:8px;background:linear-gradient(135deg,#10251a,#1a4731 58%,#22577a);box-shadow:0 16px 40px rgba(15,23,42,.12);padding:24px 26px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
.pg-kicker{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#c8f7d6;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.pg-hero h1{margin:0;color:#fff;font-size:28px;font-weight:850;letter-spacing:0}
.pg-hero p{margin:7px 0 0;color:rgba(255,255,255,.68);font-size:13px;line-height:1.6;max-width:660px}
.pg-hero-stat{text-align:right;color:#fff}.pg-hero-stat span{display:block;font-size:12px;color:rgba(255,255,255,.58);font-weight:800;text-transform:uppercase;letter-spacing:.08em}.pg-hero-stat strong{display:block;margin-top:5px;font-size:31px;font-weight:850}
.pg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.pg-stat,.pg-panel{background:#fff;border:1px solid #e7eee9;border-radius:8px;box-shadow:0 10px 28px rgba(15,23,42,.06)}.pg-stat{padding:16px}.pg-stat span{display:block;color:#64748b;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.pg-stat strong{display:block;margin-top:5px;color:#111827;font-size:22px;font-weight:850}
.pg-panel{overflow:hidden}.pg-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:16px;border-bottom:1px solid #edf2f7;background:#fbfdfc}.pg-search{position:relative;flex:1 1 300px;min-width:220px}.pg-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8}.pg-search input,.pg-form input,.pg-form select,.pg-form textarea{width:100%;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1e293b;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;outline:none}.pg-search input{height:38px;padding:0 12px 0 38px}.pg-form input,.pg-form select{height:40px;padding:0 11px}.pg-form textarea{padding:11px;resize:vertical;line-height:1.55}
.pg-btn{height:38px;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1e293b;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:850;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pg-btn.primary{border-color:#1a4731;background:#1a4731;color:#fff}.pg-btn:disabled{opacity:.65;cursor:not-allowed}
.pg-table-wrap{overflow:auto}.pg-table{width:100%;min-width:940px;border-collapse:separate;border-spacing:0}.pg-table th{padding:12px 14px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.pg-table td{padding:13px 14px;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;vertical-align:top}.pg-table tr:hover td{background:#fbfdfc}.pg-title{font-weight:850;color:#17251d}.pg-message{margin-top:4px;color:#64748b;line-height:1.45;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pg-table small{display:block;margin-top:4px;color:#94a3b8;font-size:11px}.pg-empty{padding:38px 16px;text-align:center;color:#94a3b8;font-size:14px}
.pg-badge,.pg-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:850;white-space:nowrap}.pg-badge{background:var(--bg);color:var(--fg)}.pg-status.active{background:#dcfce7;color:#166534}.pg-status.inactive{background:#f1f5f9;color:#64748b}.pg-actions{display:flex;align-items:center;gap:7px}.pg-icon-btn{width:32px;height:32px;min-width:32px;padding:0;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1a4731;display:inline-flex;align-items:center;justify-content:center;line-height:1;cursor:pointer}.pg-icon-btn svg,.pg-close svg{display:block;width:auto;height:auto;flex-shrink:0;stroke:currentColor}.pg-icon-btn:hover{background:#f0fdf4}.pg-icon-btn.danger{color:#b91c1c}.pg-icon-btn.danger:hover{background:#fef2f2}
.pg-page-btn,.pg-page-size{height:34px;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1e293b;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:800;padding:0 10px}.pg-page-btn{min-width:34px;cursor:pointer}.pg-page-btn:disabled{opacity:.45;cursor:not-allowed}
.pg-modal-backdrop{position:fixed;inset:0;z-index:2147482000;background:rgba(15,23,42,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px}.pg-modal{width:min(760px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #e4eee8;border-radius:8px;box-shadow:0 28px 80px rgba(15,23,42,.28)}.pg-modal-head{padding:18px 20px;border-bottom:1px solid #edf2f7;display:flex;justify-content:space-between;gap:14px}.pg-modal-head h2{margin:0;color:#17251d;font-size:20px;font-weight:850}.pg-modal-head p{margin:5px 0 0;color:#64748b;font-size:12px;line-height:1.5}.pg-close{width:34px;height:34px;min-width:34px;padding:0;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#64748b;display:inline-flex;align-items:center;justify-content:center;line-height:1;cursor:pointer}.pg-form{padding:18px 20px;display:grid;grid-template-columns:1fr 220px;gap:14px}.pg-form label,.pg-wide{display:flex;flex-direction:column;gap:7px}.pg-wide{grid-column:1/-1}.pg-form span,.pg-label{color:#475569;font-size:12px;font-weight:850}.pg-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.pg-audience-card{position:relative;min-height:46px;border:1px solid #dbe7e1;border-radius:8px;background:#fff;padding:10px 12px;display:flex!important;flex-direction:row!important;align-items:center;gap:10px;color:#334155;font-size:13px;font-weight:850;cursor:pointer;transition:background .16s,border-color .16s,box-shadow .16s,color .16s}.pg-audience-card:hover{border-color:#b9d8c8;background:#fbfdfc}.pg-audience-card input{position:absolute;opacity:0;pointer-events:none}.pg-audience-mark{width:22px;height:22px;border-radius:7px;border:1.5px solid #cbd5e1;background:#f8fafc;color:transparent;display:inline-flex!important;align-items:center;justify-content:center;flex-shrink:0;transition:background .16s,border-color .16s,color .16s}.pg-audience-mark svg{display:block;stroke:currentColor}.pg-audience-card.selected{border-color:#1a4731;background:#eef8f2;color:#123524;box-shadow:0 8px 18px rgba(26,71,49,.08)}.pg-audience-card.selected .pg-audience-mark{border-color:#1a4731;background:#1a4731;color:#fff}.active-toggle{grid-column:1/-1}.pg-switch{border:1px solid #dbe7e1;border-radius:8px;background:#fbfdfc;padding:11px 12px;display:flex;flex-direction:row!important;align-items:center;gap:11px;cursor:pointer}.pg-switch input{position:absolute;opacity:0;pointer-events:none}.pg-switch-track{width:46px;height:26px;border-radius:999px;background:#cbd5e1;position:relative;flex-shrink:0;transition:background .18s}.pg-switch-thumb{position:absolute;width:20px;height:20px;border-radius:50%;background:#fff;left:3px;top:3px;box-shadow:0 2px 7px rgba(15,23,42,.22);transition:transform .18s}.pg-switch input:checked + .pg-switch-track{background:#1a4731}.pg-switch input:checked + .pg-switch-track .pg-switch-thumb{transform:translateX(20px)}.pg-switch strong{display:block;color:#17251d;font-size:13px;font-weight:850}.pg-switch small{display:block;margin-top:2px;color:#64748b;font-size:11.5px;font-weight:650}.pg-modal-foot{padding:14px 20px;border-top:1px solid #edf2f7;display:flex;justify-content:flex-end;gap:10px;background:#fbfdfc}
@media(max-width:900px){.pg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.pg-form{grid-template-columns:1fr}.pg-check-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pg-hero h1{font-size:24px}}
@media(max-width:560px){.pg-stats{grid-template-columns:1fr}.pg-search{flex:1 1 100%;width:100%}.pg-btn{width:100%}.pg-check-grid{grid-template-columns:1fr}.pg-hero-stat{text-align:left}.pg-modal-backdrop{padding:10px;align-items:flex-start}.pg-modal{max-height:calc(100vh - 20px)}}
`;
