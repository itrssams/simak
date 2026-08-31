import { useState, useEffect } from 'react';
import {
    Building2,
    Plus,
    Search,
    Pencil,
    Trash2,
    CheckCircle2,
    AlertCircle,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './DataPemasok.css';

const TIPE_OPTIONS = [
    { value: 'obat', label: 'Supplier Obat' },
    { value: 'alkes', label: 'Supplier Alkes' },
    { value: 'jasa', label: 'Jasa' },
    { value: 'umum', label: 'Umum' },
];

const initialForm = {
    kode: '',
    nama: '',
    tipe: 'umum',
    telepon: '',
    email: '',
    alamat: '',
    npwp: '',
    no_rekening: '',
    bank: '',
    is_active: true,
};

const generateKode = () => `PMS-${String(Date.now()).slice(-6)}`;

export default function DataPemasok() {
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

    useEffect(() => {
        fetchData();
    }, [page, pageSize]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/pemasok/', { params: pageParams(page, pageSize) });
            setList(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const openAdd = () => {
        setForm({ ...initialForm, kode: generateKode() });
        setEditId(null);
        setError('');
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setForm({
            kode: item.kode || '',
            nama: item.nama || '',
            tipe: item.tipe || 'umum',
            telepon: item.telepon || '',
            email: item.email || '',
            alamat: item.alamat || '',
            npwp: item.npwp || '',
            no_rekening: item.no_rekening || '',
            bank: item.bank || '',
            is_active: item.is_active ?? true,
        });
        setEditId(item.id);
        setError('');
        setModalOpen(true);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setError('');
        if (!form.kode?.trim() || !form.nama?.trim()) {
            setError('Kode dan nama wajib diisi.');
            return;
        }
        setSaving(true);
        try {
            if (editId) {
                await api.put(`/keuangan/pemasok/${editId}/`, form);
            } else {
                await api.post('/keuangan/pemasok/', form);
            }
            setSuccess(editId ? 'Pemasok berhasil diupdate!' : 'Pemasok berhasil ditambahkan!');
            setModalOpen(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err?.response?.data?.error || err?.response?.data?.detail || 'Gagal menyimpan. Pastikan kode belum dipakai.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/keuangan/pemasok/${deleteId}/`);
            setList(list.filter((i) => i.id !== deleteId));
            setSuccess('Pemasok berhasil dihapus!');
            setTimeout(() => setSuccess(''), 3000);
        } catch {
            setError('Gagal menghapus data pemasok.');
        } finally {
            setDeleteId(null);
        }
    };

    const filtered = list.filter((i) => {
        const matchSearch =
            (i.nama || '').toLowerCase().includes(search.toLowerCase()) ||
            (i.kode || '').toLowerCase().includes(search.toLowerCase());
        const matchTipe = filterTipe ? i.tipe === filterTipe : true;
        return matchSearch && matchTipe;
    });

    return (
        <div className="pms-page">
            {/* Header */}
            <div className="pms-header">
                <div className="pms-title-group">
                    <div className="pms-title-icon">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h1>Master Vendor / Pemasok</h1>
                        <p>{total || list.length} vendor & rekanan terdaftar di sistem</p>
                    </div>
                </div>
                <button className="pms-add-btn" onClick={openAdd}>
                    <Plus size={18} />
                    Tambah Pemasok
                </button>
            </div>

            {/* Alerts */}
            {success && (
                <div className="pms-alert-success">
                    <CheckCircle2 size={18} />
                    {success}
                </div>
            )}
            {error && !modalOpen && (
                <div className="pms-alert-error">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {/* Filter Bar */}
            <div className="pms-filter-bar">
                <div className="pms-search-wrap">
                    <Search size={16} className="pms-search-icon" />
                    <input
                        className="pms-search-input"
                        type="text"
                        placeholder="Cari nama / kode vendor..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="pms-select-filter"
                    value={filterTipe}
                    onChange={(e) => setFilterTipe(e.target.value)}
                >
                    <option value="">Semua Tipe Vendor</option>
                    {TIPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Table Card */}
            <div className="pms-card">
                {loading ? (
                    <div className="pms-empty">Memuat data vendor...</div>
                ) : filtered.length === 0 ? (
                    <div className="pms-empty">
                        {search || filterTipe
                            ? 'Tidak ada data vendor yang cocok dengan filter.'
                            : 'Belum ada vendor terdaftar. Klik "+ Tambah Pemasok" untuk menambahkan.'}
                    </div>
                ) : (
                    <div className="pms-table-wrap">
                        <table className="pms-table">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Vendor</th>
                                    <th>Tipe</th>
                                    <th>Telepon</th>
                                    <th>Bank / Rekening</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <span className="pms-kode-pill">{item.kode}</span>
                                        </td>
                                        <td>
                                            <div className="pms-vendor-name">
                                                <span>{item.nama}</span>
                                                {item.email && <small>{item.email}</small>}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`pms-badge tipe-${item.tipe || 'umum'}`}>
                                                {item.tipe_label || item.tipe || 'Umum'}
                                            </span>
                                        </td>
                                        <td>{item.telepon || '-'}</td>
                                        <td>
                                            {item.bank ? (
                                                <span>
                                                    <strong>{item.bank}</strong>
                                                    {item.no_rekening ? ` · ${item.no_rekening}` : ''}
                                                </span>
                                            ) : (
                                                item.no_rekening || '-'
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className={`pms-badge ${
                                                    item.is_active ? 'status-aktif' : 'status-nonaktif'
                                                }`}
                                            >
                                                {item.is_active ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="pms-action-group">
                                                <button
                                                    className="pms-btn-edit"
                                                    onClick={() => openEdit(item)}
                                                    title="Edit Data Vendor"
                                                >
                                                    <Pencil size={13} />
                                                    Edit
                                                </button>
                                                <button
                                                    className="pms-btn-delete"
                                                    onClick={() => setDeleteId(item.id)}
                                                    title="Hapus Data Vendor"
                                                >
                                                    <Trash2 size={13} />
                                                    Hapus
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--inv-border, #e2e8f0)' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={search || filterTipe ? filtered.length : total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        buttonClassName="page-btn"
                        selectClassName="page-size"
                    />
                </div>
            </div>

            {/* Modal Tambah/Edit */}
            {modalOpen && (
                <div className="pms-overlay" onClick={() => setModalOpen(false)}>
                    <div className="pms-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="pms-modal-title">
                            <Building2 size={20} color="#10b981" />
                            {editId ? 'Edit Data Vendor' : 'Tambah Vendor Baru'}
                        </h2>

                        {error && (
                            <div className="pms-alert-error" style={{ marginBottom: '16px' }}>
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSave} className="pms-form-grid">
                            <div className="pms-form-group">
                                <label>Kode Vendor *</label>
                                <input
                                    className="pms-input"
                                    value={form.kode}
                                    onChange={(e) => setForm({ ...form, kode: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="pms-form-group">
                                <label>Tipe Vendor</label>
                                <select
                                    className="pms-select"
                                    value={form.tipe}
                                    onChange={(e) => setForm({ ...form, tipe: e.target.value })}
                                >
                                    {TIPE_OPTIONS.map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pms-form-group full">
                                <label>Nama Vendor / Instansi *</label>
                                <input
                                    className="pms-input"
                                    placeholder="Contoh: PT Kimia Farma Trading & Distribution"
                                    value={form.nama}
                                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="pms-form-group">
                                <label>No. Telepon / Kontak</label>
                                <input
                                    className="pms-input"
                                    placeholder="08xxxxxxxxxx / (021) xxx"
                                    value={form.telepon}
                                    onChange={(e) => setForm({ ...form, telepon: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group">
                                <label>Email Resmi</label>
                                <input
                                    className="pms-input"
                                    type="email"
                                    placeholder="vendor@company.com"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group">
                                <label>NPWP</label>
                                <input
                                    className="pms-input"
                                    placeholder="xx.xxx.xxx.x-xxx.xxx"
                                    value={form.npwp}
                                    onChange={(e) => setForm({ ...form, npwp: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group">
                                <label>Nama Bank Rekening</label>
                                <input
                                    className="pms-input"
                                    placeholder="BCA / Mandiri / BRI / BNI"
                                    value={form.bank}
                                    onChange={(e) => setForm({ ...form, bank: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group full">
                                <label>Nomor Rekening Bank</label>
                                <input
                                    className="pms-input"
                                    placeholder="Contoh: 1234567890"
                                    value={form.no_rekening}
                                    onChange={(e) => setForm({ ...form, no_rekening: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group full">
                                <label>Alamat Lengkap</label>
                                <textarea
                                    className="pms-textarea"
                                    placeholder="Alamat kantor / gudang supplier..."
                                    value={form.alamat}
                                    onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                                />
                            </div>

                            <div className="pms-form-group full">
                                <label className="pms-check-label">
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                    />
                                    Pemasok Aktif (Dapat digunakan dalam transaksi & tagihan)
                                </label>
                            </div>

                            <div className="pms-form-group full pms-modal-footer">
                                <button
                                    type="button"
                                    className="pms-btn-cancel"
                                    onClick={() => setModalOpen(false)}
                                >
                                    Batal
                                </button>
                                <button type="submit" className="pms-btn-save" disabled={saving}>
                                    {saving ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Tambah Pemasok'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {deleteId && (
                <div className="pms-overlay" onClick={() => setDeleteId(null)}>
                    <div className="pms-modal" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <h3 className="pms-modal-title" style={{ color: '#dc2626' }}>
                            <AlertCircle size={20} />
                            Hapus Data Vendor?
                        </h3>
                        <p style={{ fontSize: '13.5px', color: 'var(--inv-muted, #64748b)', margin: '0 0 20px', lineHeight: 1.5 }}>
                            Data vendor ini akan dihapus secara permanen dari daftar pemasok.
                        </p>
                        <div className="pms-modal-footer" style={{ marginTop: 0 }}>
                            <button className="pms-btn-cancel" onClick={() => setDeleteId(null)}>
                                Batal
                            </button>
                            <button className="pms-btn-confirm-delete" onClick={handleDelete}>
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
