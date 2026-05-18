import { useState, useEffect } from 'react';
import { useToastState } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';

const TIPE_OPTIONS = [
    { value: 'umum', label: 'Umum' },
    { value: 'bpjs', label: 'BPJS' },
    { value: 'asuransi', label: 'Asuransi Swasta' },
    { value: 'perusahaan', label: 'Perusahaan' },
];

const TIPE_COLOR = {
    umum: { bg: '#f0f9ff', color: '#0369a1' },
    bpjs: { bg: '#dcfce7', color: '#166534' },
    asuransi: { bg: '#fdf4ff', color: '#7e22ce' },
    perusahaan: { bg: '#fff7ed', color: '#c2410c' },
};

const initialForm = {
    kode: '', nama: '', tipe: 'umum', telepon: '',
    email: '', alamat: '', no_kontrak: '', batas_kredit: '', is_active: true,
};

const generateKode = () => `PLG-${String(Date.now()).slice(-6)}`;

export default function DataPelanggan() {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState(null);
    const [search, setSearch] = useState('');
    const [filterTipe, setFilterTipe] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [error, setError] = useToastState('error');
    const [success, setSuccess] = useToastState('success');

    useEffect(() => { fetchData(); }, [page, pageSize]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/pelanggan/', { params: pageParams(page, pageSize) });
            setList(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const openAdd = () => {
        setForm({ ...initialForm, kode: generateKode() });
        setEditId(null);
        setError('');
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setForm({
            kode: item.kode, nama: item.nama, tipe: item.tipe,
            telepon: item.telepon || '', email: item.email || '',
            alamat: item.alamat || '', no_kontrak: item.no_kontrak || '',
            batas_kredit: item.batas_kredit || '', is_active: item.is_active,
        });
        setEditId(item.id);
        setError('');
        setModalOpen(true);
    };

    const handleSave = async () => {
        setError('');
        if (!form.kode || !form.nama) { setError('Kode dan nama wajib diisi.'); return; }
        setSaving(true);
        try {
            if (editId) {
                await api.put(`/keuangan/pelanggan/${editId}/`, form);
            } else {
                await api.post('/keuangan/pelanggan/', form);
            }
            setSuccess(editId ? 'Pelanggan berhasil diupdate!' : 'Pelanggan berhasil ditambahkan!');
            setModalOpen(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch { setError('Gagal menyimpan. Pastikan kode belum dipakai.'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/keuangan/pelanggan/${deleteId}/`);
            setList(list.filter(i => i.id !== deleteId));
            setSuccess('Pelanggan berhasil dihapus!');
            setTimeout(() => setSuccess(''), 3000);
        } catch { setError('Gagal menghapus.'); }
        finally { setDeleteId(null); }
    };

    const filtered = list.filter(i => {
        const matchSearch = i.nama.toLowerCase().includes(search.toLowerCase()) || i.kode.toLowerCase().includes(search.toLowerCase());
        const matchTipe = filterTipe ? i.tipe === filterTipe : true;
        return matchSearch && matchTipe;
    });

    return (
        <div>
            <style>{`
                .form-input, .form-select, .form-textarea {
                    width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0;
                    border-radius: 8px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b; background: #fff; outline: none; transition: border-color 0.15s;
                }
                .form-input:focus, .form-select:focus, .form-textarea:focus {
                    border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08);
                }
                .form-textarea { resize: vertical; min-height: 70px; }
                .search-input { padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; outline: none; width: 260px; }
                .search-input:focus { border-color: #2d6a4f; }
                .filter-select { padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; outline: none; background: #fff; }
                .add-btn { padding: 9px 20px; background: #1a4731; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .add-btn:hover { background: #2d6a4f; }
                .save-btn { padding: 10px 24px; background: #1a4731; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .save-btn:hover { background: #2d6a4f; }
                .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
                .cancel-btn { padding: 10px 20px; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .cancel-btn:hover { background: #e2e8f0; }
                .edit-btn { padding: 5px 12px; background: #fff; border: 1px solid #93c5fd; border-radius: 6px; color: #1d4ed8; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .edit-btn:hover { background: #eff6ff; }
                .delete-btn { padding: 5px 12px; background: #fff; border: 1px solid #fca5a5; border-radius: 6px; color: #dc2626; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .delete-btn:hover { background: #fee2e2; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table thead th { padding: 11px 16px; text-align: left; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
                .data-table tbody td { padding: 12px 16px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
                .data-table tbody tr:hover td { background: #f8fafb; }
                .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 999; }
                .modal { background: #fff; border-radius: 16px; padding: 32px; width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.18); }
                .confirm-yes { padding: 10px 24px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
                .confirm-yes:hover { background: #b91c1c; }
                .page-btn,.page-size{height:34px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;padding:0 10px}
                .page-btn{min-width:34px;cursor:pointer}.page-btn:disabled{opacity:.45;cursor:not-allowed}
            `}</style>

            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Data Pelanggan</h1>
                    <p style={styles.subtitle}>{list.length} pelanggan terdaftar</p>
                </div>
                <button className="add-btn" onClick={openAdd}>+ Tambah Pelanggan</button>
            </div>

            {success && <div style={styles.alertSuccess}>{success}</div>}
            {error && !modalOpen && <div style={styles.alertError}>{error}</div>}

            <div style={styles.filterBar}>
                <input className="search-input" type="text" placeholder="Cari nama / kode..." value={search} onChange={e => setSearch(e.target.value)} />
                <select className="filter-select" value={filterTipe} onChange={e => setFilterTipe(e.target.value)}>
                    <option value="">Semua Tipe</option>
                    {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            <div style={styles.tableCard}>
                {loading ? (
                    <div style={styles.empty}>Memuat data...</div>
                ) : filtered.length === 0 ? (
                    <div style={styles.empty}>Belum ada pelanggan. Klik "+ Tambah Pelanggan".</div>
                ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="data-table">
                        <thead>
                            <tr>
                                <th>Kode</th>
                                <th>Nama</th>
                                <th>Tipe</th>
                                <th>Telepon</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td style={{ fontWeight: '600', color: '#1a4731', fontFamily: 'monospace' }}>{item.kode}</td>
                                    <td style={{ fontWeight: '500' }}>{item.nama}</td>
                                    <td>
                                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', ...TIPE_COLOR[item.tipe] }}>
                                            {item.tipe_label}
                                        </span>
                                    </td>
                                    <td>{item.telepon || '-'}</td>
                                    <td>{item.email || '-'}</td>
                                    <td>
                                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: item.is_active ? '#dcfce7' : '#f1f5f9', color: item.is_active ? '#166534' : '#94a3b8' }}>
                                            {item.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                            <button className="edit-btn" onClick={() => openEdit(item)}>Edit</button>
                                            <button className="delete-btn" onClick={() => setDeleteId(item.id)}>Hapus</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table></div>
                )}
                <SimplePagination page={page} pageSize={pageSize} total={search || filterTipe ? filtered.length : total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="page-btn" selectClassName="page-size" />
            </div>

            {/* Modal Tambah/Edit */}
            {modalOpen && (
                <div className="overlay">
                    <div className="modal">
                        <h2 style={styles.modalTitle}>{editId ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}</h2>
                        {error && <div style={{ ...styles.alertError, marginBottom: '16px' }}>{error}</div>}

                        <div style={styles.grid2}>
                            <div style={styles.field}>
                                <label style={styles.label}>Kode *</label>
                                <input className="form-input" value={form.kode} onChange={e => setForm({ ...form, kode: e.target.value })} />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Tipe</label>
                                <select className="form-select" value={form.tipe} onChange={e => setForm({ ...form, tipe: e.target.value })}>
                                    {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>Nama *</label>
                            <input className="form-input" placeholder="Nama pelanggan" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} />
                        </div>

                        <div style={styles.grid2}>
                            <div style={styles.field}>
                                <label style={styles.label}>Telepon</label>
                                <input className="form-input" placeholder="08xx" value={form.telepon} onChange={e => setForm({ ...form, telepon: e.target.value })} />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Email</label>
                                <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                            </div>
                        </div>

                        <div style={styles.grid2}>
                            <div style={styles.field}>
                                <label style={styles.label}>No. Kontrak</label>
                                <input className="form-input" placeholder="No. kontrak" value={form.no_kontrak} onChange={e => setForm({ ...form, no_kontrak: e.target.value })} />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Batas Kredit (Rp)</label>
                                <input className="form-input" type="number" placeholder="0" value={form.batas_kredit} onChange={e => setForm({ ...form, batas_kredit: e.target.value })} />
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>Alamat</label>
                            <textarea className="form-textarea" placeholder="Alamat lengkap" value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} />
                        </div>

                        <div style={styles.checkRow}>
                            <label style={styles.checkLabel}>
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ marginRight: '8px' }} />
                                Pelanggan Aktif
                            </label>
                        </div>

                        <div style={styles.modalBtns}>
                            <button className="cancel-btn" onClick={() => setModalOpen(false)}>Batal</button>
                            <button className="save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? 'Menyimpan...' : editId ? 'Update' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {deleteId && (
                <div className="overlay">
                    <div className="modal" style={{ width: '360px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>Hapus Pelanggan?</h3>
                        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Data pelanggan akan dihapus permanen.</p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button className="cancel-btn" onClick={() => setDeleteId(null)}>Batal</button>
                            <button className="confirm-yes" onClick={handleDelete}>Ya, Hapus</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    header: { marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: '24px', fontWeight: '700', color: '#1a2e1a' },
    subtitle: { fontSize: '14px', color: '#64748b', marginTop: '4px' },
    alertSuccess: { background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', padding: '12px 16px', fontSize: '14px', marginBottom: '16px' },
    alertError: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', padding: '12px 16px', fontSize: '14px' },
    filterBar: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' },
    tableCard: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' },
    empty: { padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' },
    modalTitle: { fontSize: '18px', fontWeight: '700', color: '#1a2e1a', marginBottom: '24px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' },
    label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
    checkRow: { display: 'flex', gap: '24px', marginBottom: '24px' },
    checkLabel: { display: 'flex', alignItems: 'center', fontSize: '14px', color: '#475569', cursor: 'pointer' },
    modalBtns: { display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9', position: 'sticky', bottom: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0), #fff 28%)', zIndex: 5 },
};
