import { useState, useEffect } from 'react';
import { useToastState } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';

const TIPE_OPTIONS = [
    { value: 'aset_lancar', label: 'Aset Lancar' },
    { value: 'aset_tetap', label: 'Aset Tetap' },
    { value: 'aset_lainnya', label: 'Aset Lainnya' },
    { value: 'kewajiban_lancar', label: 'Kewajiban Lancar' },
    { value: 'kewajiban_jangka_panjang', label: 'Kewajiban Jangka Panjang' },
    { value: 'ekuitas', label: 'Ekuitas' },
    { value: 'pendapatan', label: 'Pendapatan' },
    { value: 'harga_pokok', label: 'Harga Pokok Penjualan' },
    { value: 'beban_operasional', label: 'Beban Operasional' },
    { value: 'beban_lainnya', label: 'Beban Lainnya' },
    { value: 'pendapatan_lainnya', label: 'Pendapatan Lainnya' },
];

const TIPE_GROUP = {
    'Neraca': ['aset_lancar', 'aset_tetap', 'aset_lainnya', 'kewajiban_lancar', 'kewajiban_jangka_panjang', 'ekuitas'],
    'Laba Rugi': ['pendapatan', 'harga_pokok', 'beban_operasional', 'beban_lainnya', 'pendapatan_lainnya'],
};

const TIPE_LABEL = Object.fromEntries(TIPE_OPTIONS.map(t => [t.value, t.label]));

const initialForm = {
    kode_akun: '',
    nama_akun: '',
    tipe: 'aset_lancar',
    saldo_normal: 'debit',
    is_kas_setara: false,
    keterangan: '',
    is_active: true,
};

export default function BaganAkun() {
    const [akunList, setAkunList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filterTipe, setFilterTipe] = useState('');
    const [error, setError] = useToastState('error');
    const [success, setSuccess] = useToastState('success');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);

    useEffect(() => { fetchAkun(); }, [page, pageSize]);

    const fetchAkun = async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/akun/', { params: pageParams(page, pageSize) });
            setAkunList(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const openAdd = () => {
        setForm(initialForm);
        setEditId(null);
        setError('');
        setModalOpen(true);
    };

    const openEdit = (akun) => {
        setForm({
            kode_akun: akun.kode_akun,
            nama_akun: akun.nama_akun,
            tipe: akun.tipe,
            saldo_normal: akun.saldo_normal,
            is_kas_setara: akun.is_kas_setara,
            keterangan: akun.keterangan || '',
            is_active: akun.is_active,
        });
        setEditId(akun.id);
        setError('');
        setModalOpen(true);
    };

    const handleSave = async () => {
        setError('');
        if (!form.kode_akun || !form.nama_akun) {
            setError('Kode dan nama akun wajib diisi.');
            return;
        }
        setSaving(true);
        try {
            if (editId) {
                await api.put(`/keuangan/akun/${editId}/`, form);
            } else {
                await api.post('/keuangan/akun/', form);
            }
            setSuccess(editId ? 'Akun berhasil diupdate!' : 'Akun berhasil ditambahkan!');
            setModalOpen(false);
            fetchAkun();
            setTimeout(() => setSuccess(''), 3000);
        } catch {
            setError('Gagal menyimpan. Pastikan kode akun belum dipakai.');
        } finally { setSaving(false); }
    };

    const handleDeleteClick = (id) => {
        setDeleteId(id);
        setConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            await api.delete(`/keuangan/akun/${deleteId}/`);
            setAkunList(akunList.filter(a => a.id !== deleteId));
            setSuccess('Akun berhasil dihapus!');
            setTimeout(() => setSuccess(''), 3000);
        } catch {
            setSuccess('');
        } finally {
            setConfirmOpen(false);
            setDeleteId(null);
        }
    };

    const filtered = akunList.filter(a => {
        const matchSearch = a.kode_akun.toLowerCase().includes(search.toLowerCase()) ||
            a.nama_akun.toLowerCase().includes(search.toLowerCase());
        const matchTipe = filterTipe ? a.tipe === filterTipe : true;
        return matchSearch && matchTipe;
    });

    // Group by tipe category
    const grouped = {};
    for (const [group, tipes] of Object.entries(TIPE_GROUP)) {
        const items = filtered.filter(a => tipes.includes(a.tipe));
        if (items.length > 0) grouped[group] = items;
    }

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

                .search-input {
                    padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
                    font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b; outline: none; width: 260px; transition: border-color 0.15s;
                }
                .search-input:focus { border-color: #2d6a4f; }

                .filter-select {
                    padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
                    font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b; outline: none; background: #fff;
                }

                .add-btn {
                    padding: 9px 20px; background: #1a4731; color: #fff; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .add-btn:hover { background: #2d6a4f; }

                .save-btn {
                    padding: 10px 24px; background: #1a4731; color: #fff; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .save-btn:hover { background: #2d6a4f; }
                .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .cancel-btn {
                    padding: 10px 20px; background: #f1f5f9; color: #475569;
                    border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;
                    font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .cancel-btn:hover { background: #e2e8f0; }

                .edit-btn {
                    padding: 5px 12px; background: #fff; border: 1px solid #93c5fd;
                    border-radius: 6px; color: #1d4ed8; font-size: 12px; font-weight: 600;
                    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .edit-btn:hover { background: #eff6ff; }

                .delete-btn {
                    padding: 5px 12px; background: #fff; border: 1px solid #fca5a5;
                    border-radius: 6px; color: #dc2626; font-size: 12px; font-weight: 600;
                    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .delete-btn:hover { background: #fee2e2; }

                .akun-table { width: 100%; border-collapse: collapse; }
                .akun-table thead tr { background: #f8fafc; }
                .akun-table thead th {
                    padding: 11px 16px; text-align: left; font-size: 12px; font-weight: 700;
                    color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
                    border-bottom: 2px solid #e2e8f0;
                }
                .akun-table tbody td {
                    padding: 11px 16px; font-size: 13px; color: #334155;
                    border-bottom: 1px solid #f1f5f9; vertical-align: middle;
                }
                .akun-table tbody tr:hover td { background: #f8fafb; }
                .group-header td {
                    padding: 10px 16px; background: #e8f5ee; color: #1a4731;
                    font-weight: 700; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
                    border-left: 4px solid #1a4731;
                }
                .overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
                    display: flex; align-items: center; justify-content: center; z-index: 999;
                }
                .modal {
                    background: #fff; border-radius: 16px; padding: 32px;
                    width: 520px; max-height: 90vh; overflow-y: auto;
                    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
                }

                .confirm-yes {
                    padding: 10px 24px; background: #dc2626; color: #fff; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .confirm-yes:hover { background: #b91c1c; }
                .page-btn,.page-size{height:34px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;padding:0 10px}
                .page-btn{min-width:34px;cursor:pointer}.page-btn:disabled{opacity:.45;cursor:not-allowed}
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Bagan Akun</h1>
                    <p style={styles.subtitle}>{akunList.length} akun terdaftar</p>
                </div>
                <button className="add-btn" onClick={openAdd}>+ Tambah Akun</button>
            </div>

            {success && <div style={styles.alertSuccess}>{success}</div>}

            {/* Filter Bar */}
            <div style={styles.filterBar}>
                <input className="search-input" type="text" placeholder="Cari kode / nama akun..." value={search} onChange={e => setSearch(e.target.value)} />
                <select className="filter-select" value={filterTipe} onChange={e => setFilterTipe(e.target.value)}>
                    <option value="">Semua Tipe</option>
                    {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            {/* Table */}
            <div style={styles.tableCard}>
                {loading ? (
                    <div style={styles.empty}>Memuat data...</div>
                ) : filtered.length === 0 ? (
                    <div style={styles.empty}>Tidak ada akun ditemukan.</div>
                ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="akun-table">
                        <thead>
                            <tr>
                                <th>Kode Akun</th>
                                <th>Nama Akun</th>
                                <th>Tipe</th>
                                <th>Saldo Normal</th>
                                <th>Kas Setara</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(grouped).map(([group, items]) => (
                                <>
                                    <tr className="group-header" key={group}>
                                        <td colSpan={7}>{group}</td>
                                    </tr>
                                    {items.map(akun => (
                                        <tr key={akun.id}>
                                            <td style={{ fontWeight: '600', color: '#1a4731', fontFamily: 'monospace' }}>{akun.kode_akun}</td>
                                            <td>{akun.nama_akun}</td>
                                            <td>
                                                <span style={styles.tipeBadge}>{TIPE_LABEL[akun.tipe]}</span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    ...styles.saldoBadge,
                                                    background: akun.saldo_normal === 'debit' ? '#eff6ff' : '#fdf4ff',
                                                    color: akun.saldo_normal === 'debit' ? '#1d4ed8' : '#7e22ce',
                                                }}>
                                                    {akun.saldo_normal === 'debit' ? 'Debit' : 'Kredit'}
                                                </span>
                                            </td>
                                            <td>{akun.is_kas_setara ? <span style={styles.yesBadge}>✓ Ya</span> : <span style={styles.noBadge}>-</span>}</td>
                                            <td>{akun.is_active ? <span style={styles.activeBadge}>Aktif</span> : <span style={styles.inactiveBadge}>Nonaktif</span>}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                    <button className="edit-btn" onClick={() => openEdit(akun)}>Edit</button>
                                                    <button className="delete-btn" onClick={() => handleDeleteClick(akun.id)}>Hapus</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </>
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
                        <h2 style={styles.modalTitle}>{editId ? 'Edit Akun' : 'Tambah Akun Baru'}</h2>

                        {error && <div style={{ ...styles.alertError, marginBottom: '16px' }}>{error}</div>}

                        <div style={styles.formGrid}>
                            <div style={styles.field}>
                                <label style={styles.label}>Kode Akun *</label>
                                <input className="form-input" placeholder="Contoh: 11110001" value={form.kode_akun} onChange={e => setForm({ ...form, kode_akun: e.target.value })} />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Nama Akun *</label>
                                <input className="form-input" placeholder="Nama akun" value={form.nama_akun} onChange={e => setForm({ ...form, nama_akun: e.target.value })} />
                            </div>
                        </div>

                        <div style={styles.formGrid}>
                            <div style={styles.field}>
                                <label style={styles.label}>Tipe Akun</label>
                                <select className="form-select" value={form.tipe} onChange={e => setForm({ ...form, tipe: e.target.value })}>
                                    {TIPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Saldo Normal</label>
                                <select className="form-select" value={form.saldo_normal} onChange={e => setForm({ ...form, saldo_normal: e.target.value })}>
                                    <option value="debit">Debit</option>
                                    <option value="kredit">Kredit</option>
                                </select>
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>Keterangan</label>
                            <textarea className="form-textarea" placeholder="Keterangan akun (opsional)" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} />
                        </div>

                        <div style={styles.checkRow}>
                            <label style={styles.checkLabel}>
                                <input type="checkbox" checked={form.is_kas_setara} onChange={e => setForm({ ...form, is_kas_setara: e.target.checked })} style={{ marginRight: '8px' }} />
                                Termasuk Kas & Setara Kas
                            </label>
                            <label style={styles.checkLabel}>
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ marginRight: '8px' }} />
                                Akun Aktif
                            </label>
                        </div>

                        <div style={styles.modalBtns}>
                            <button className="cancel-btn" onClick={() => setModalOpen(false)}>Batal</button>
                            <button className="save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? 'Menyimpan...' : editId ? 'Update Akun' : 'Simpan Akun'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {confirmOpen && (
                <div className="overlay">
                    <div className="modal" style={{ width: '360px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>Hapus Akun?</h3>
                        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
                            Akun ini akan dihapus permanen. Pastikan tidak ada transaksi yang menggunakan akun ini.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button className="cancel-btn" onClick={() => setConfirmOpen(false)}>Batal</button>
                            <button className="confirm-yes" onClick={handleDeleteConfirm}>Ya, Hapus</button>
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
    tipeBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', background: '#f0f9ff', color: '#0369a1', fontSize: '11px', fontWeight: '600' },
    saldoBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
    yesBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: '600' },
    noBadge: { color: '#94a3b8', fontSize: '13px' },
    activeBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: '600' },
    inactiveBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', background: '#f1f5f9', color: '#94a3b8', fontSize: '11px', fontWeight: '600' },
    modalTitle: { fontSize: '18px', fontWeight: '700', color: '#1a2e1a', marginBottom: '24px' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' },
    label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
    checkRow: { display: 'flex', gap: '24px', marginBottom: '24px' },
    checkLabel: { display: 'flex', alignItems: 'center', fontSize: '14px', color: '#475569', cursor: 'pointer' },
    modalBtns: { display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9', position: 'sticky', bottom: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0), #fff 28%)', zIndex: 5 },
};
