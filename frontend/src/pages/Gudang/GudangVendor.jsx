import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Pencil,
    Trash2,
    Building2,
    X,
    ChevronDown
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import './Gudang.css';

const DEFAULT_CATEGORIES = [
    'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
    'BIAYA HOUSEKEEPING & KEBERSIHAN',
    'MATERIAL & SUKU CADANG',
    'ALAT KESEHATAN & ELEKTRONIK',
    'PENUNJANG PELAYANAN RS',
    'TEKSTIL & SERAGAM',
    'BIAYA LAIN-LAIN',
    'UMUM'
];

export default function GudangVendor({ heroActionsTarget = null }) {
    const toast = useToast();

    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Form modal state
    const [showModalForm, setShowModalForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        id: null,
        kode: '',
        nama: '',
        kategori: 'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
        telp: '',
        kc: '',
        alamat: '',
    });

    // Delete confirmation modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [vendorToDelete, setVendorToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Fetch vendors from API
    const fetchVendors = async () => {
        setLoading(true);
        try {
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (categoryFilter.trim()) params.kategori = categoryFilter.trim();

            const res = await api.get('/gudang/vendor/', { params });
            const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
            setVendors(list);
            setPage(1);
        } catch (err) {
            console.error('Failed to fetch vendors', err);
            toast.error('Gagal memuat daftar vendor rekanan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchVendors();
        }, 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, categoryFilter]);

    // Compute distinct categories from vendors list combined with default
    const availableCategories = useMemo(() => {
        const set = new Set(DEFAULT_CATEGORIES);
        vendors.forEach((v) => {
            if (v.kategori && v.kategori.trim()) {
                set.add(v.kategori.trim());
            }
        });
        return Array.from(set);
    }, [vendors]);

    // Category count stats
    const categoryStats = useMemo(() => {
        const counts = {};
        vendors.forEach((v) => {
            const cat = (v.kategori || 'UMUM').trim();
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return counts;
    }, [vendors]);

    // Client-side pagination (vendors endpoint returns list)
    const pagedVendors = useMemo(() => {
        const start = (page - 1) * pageSize;
        return vendors.slice(start, start + pageSize);
    }, [vendors, page, pageSize]);

    // Form Handlers
    const handleOpenCreate = () => {
        setIsEditMode(false);
        setFormData({
            id: null,
            kode: '',
            nama: '',
            kategori: categoryFilter || 'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
            telp: '',
            kc: '',
            alamat: '',
        });
        setShowModalForm(true);
    };

    const handleOpenEdit = (v) => {
        setIsEditMode(true);
        setFormData({
            id: v.id,
            kode: v.kode || '',
            nama: v.nama || '',
            kategori: v.kategori || 'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
            telp: v.telp || v.telepon || '',
            kc: v.kc || v.kontak_person || '',
            alamat: v.alamat || '',
        });
        setShowModalForm(true);
    };

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        const namaTrimmed = formData.nama.trim();
        if (!namaTrimmed) {
            toast.error('Nama vendor wajib diisi.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                nama: namaTrimmed.toUpperCase(),
                kategori: formData.kategori.trim(),
                telp: formData.telp.trim(),
                kc: formData.kc.trim(),
                alamat: formData.alamat.trim(),
            };

            if (isEditMode) {
                await api.put(`/gudang/vendor/${formData.id}/`, payload);
                toast.success(`Vendor "${payload.nama}" berhasil diperbarui.`);
            } else {
                await api.post('/gudang/vendor/', payload);
                toast.success(`Vendor "${payload.nama}" berhasil ditambahkan.`);
            }

            setShowModalForm(false);
            fetchVendors();
        } catch (err) {
            console.error('Save vendor error', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Gagal menyimpan vendor.';
            toast.error(String(msg));
        } finally {
            setSaving(false);
        }
    };

    // Delete Handlers
    const handleOpenDelete = (v) => {
        setVendorToDelete(v);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!vendorToDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/gudang/vendor/${vendorToDelete.id}/`);
            toast.success(`Vendor "${vendorToDelete.nama}" berhasil dihapus.`);
            setShowDeleteModal(false);
            setVendorToDelete(null);
            fetchVendors();
        } catch (err) {
            console.error('Delete vendor error', err);
            const msg = err.response?.data?.detail || err.response?.data?.error || 'Gagal menghapus vendor.';
            toast.error(String(msg));
        } finally {
            setDeleting(false);
        }
    };

    const actionButtons = (
        <>
            <button
                type="button"
                className="gdg-btn-stripe secondary"
                onClick={fetchVendors}
                disabled={loading}
                title="Refresh daftar vendor"
            >
                <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'gdg-spin' : ''} /> Refresh
            </button>
            <button
                type="button"
                className="gdg-btn-stripe primary"
                onClick={handleOpenCreate}
            >
                <Plus size={14} strokeWidth={1.75} /> Tambah Vendor
            </button>
        </>
    );

    return (
        <div className="gdg-dash-root">
            {heroActionsTarget
                ? createPortal(actionButtons, heroActionsTarget)
                : (
                    <div className="gdg-brg-fallback-actions">
                        {actionButtons}
                    </div>
                )}

            <section className="gdg-dash-section">
                {/* SEARCH & FILTER TOOLBAR */}
                <div className="gdg-brg-toolbar">
                    <div className="gdg-brg-toolbar-left">
                        <div className="gdg-dash-search">
                            <Search size={14} strokeWidth={1.75} className="gdg-dash-search-icon" />
                            <input
                                type="text"
                                placeholder="Cari kode rekanan, nama vendor, telepon, atau PIC..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="gdg-ks-select-wrap">
                            <select
                                className="gdg-ks-select gdg-brg-select"
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                            >
                                <option value="">Semua Kategori ({vendors.length})</option>
                                {availableCategories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat} {categoryStats[cat] ? `(${categoryStats[cat]})` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} strokeWidth={1.75} className="gdg-ks-select-chevron" />
                        </div>

                        {(search || categoryFilter) && (
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                onClick={() => {
                                    setSearch('');
                                    setCategoryFilter('');
                                }}
                                title="Reset pencarian dan filter"
                            >
                                <X size={14} strokeWidth={1.75} /> Reset
                            </button>
                        )}
                    </div>

                    <span className="gdg-brg-total-hint">
                        Total {vendors.length.toLocaleString('id-ID')} rekanan aktif
                    </span>
                </div>

                {/* VENDOR BORDERLESS TABLE */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th style={{ width: '90px' }}>Kode</th>
                                <th>Nama Perusahaan / Vendor</th>
                                <th style={{ width: '240px' }}>Kategori</th>
                                <th style={{ width: '180px' }}>Kontak Person (PIC)</th>
                                <th style={{ width: '160px' }}>Telepon</th>
                                <th>Alamat</th>
                                <th style={{ width: '90px', textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="gdg-table-empty">
                                        Memuat data rekanan vendor...
                                    </td>
                                </tr>
                            ) : pagedVendors.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="gdg-table-empty" style={{ padding: '44px 20px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                            <Building2 size={28} className="gdg-icon-muted" />
                                            <div style={{ fontWeight: 600, color: 'var(--gdg-text)', fontSize: '14px' }}>
                                                {search || categoryFilter ? 'Tidak ada rekanan yang cocok dengan pencarian / filter.' : 'Belum ada data Master Vendor di database SIMAK'}
                                            </div>
                                            <p style={{ margin: 0, color: 'var(--gdg-muted)', fontSize: '13px', maxWidth: '440px' }}>
                                                {search || categoryFilter ? 'Silakan periksa kembali kata kunci atau reset filter kategori.' : 'Daftarkan rekanan distributor pengadaan logistik umum baru melalui tombol Tambah Vendor.'}
                                            </p>
                                            {!search && !categoryFilter && (
                                                <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate} style={{ marginTop: '4px' }}>
                                                    <Plus size={14} strokeWidth={1.75} /> Tambah Vendor Pertama
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                pagedVendors.map((v) => (
                                    <tr key={v.id}>
                                        <td className="gdg-code-cell">{v.kode || `#${v.id}`}</td>
                                        <td>
                                            <div className="gdg-unit-name">{v.nama}</div>
                                        </td>
                                        <td className="gdg-cell-muted">{v.kategori || 'UMUM'}</td>
                                        <td className="gdg-cell-muted">{v.kc || '—'}</td>
                                        <td className="gdg-cell-muted gdg-num-cell">{v.telp || '—'}</td>
                                        <td className="gdg-cell-muted" style={{ maxWidth: '280px', whiteSpace: 'normal', lineHeight: '1.45' }}>
                                            {v.alamat || '—'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="gdg-brg-row-actions">
                                                <button
                                                    type="button"
                                                    className="gdg-brg-icon-btn"
                                                    onClick={() => handleOpenEdit(v)}
                                                    title="Edit data rekanan"
                                                    aria-label="Edit data rekanan"
                                                >
                                                    <Pencil size={14} strokeWidth={1.75} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="gdg-brg-icon-btn danger"
                                                    onClick={() => handleOpenDelete(v)}
                                                    title="Hapus vendor"
                                                    aria-label="Hapus vendor"
                                                >
                                                    <Trash2 size={14} strokeWidth={1.75} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION */}
                <SimplePagination
                    className="gdg-dash-pagination"
                    total={vendors.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            </section>

            {/* MODAL FORM TAMBAH / EDIT VENDOR */}
            {showModalForm && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowModalForm(false)}>
                    <div className="gdg-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>{isEditMode ? 'Edit Data Vendor' : 'Tambah Vendor Baru'}</h3>
                                <p>
                                    {isEditMode
                                        ? `Perbarui informasi profil dan kontak rekanan [${formData.kode || `#${formData.id}`}]`
                                        : 'Daftarkan nama rekanan / distributor penyedia pengadaan gudang logistik.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowModalForm(false)}
                                title="Tutup Modal"
                                aria-label="Tutup Modal"
                            >
                                <X size={16} strokeWidth={1.75} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitForm}>
                            <div className="gdg-modal-body">
                                <div className="gdg-form-group">
                                    <label>Nama Perusahaan / Distributor / Vendor *</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: PT. GRAHA MEDIKA NUSANTARA"
                                        value={formData.nama}
                                        onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Kategori Rekanan *</label>
                                        </div>
                                        <select
                                            value={formData.kategori}
                                            onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                                            required
                                        >
                                            {availableCategories.map((cat) => (
                                                <option key={cat} value={cat}>
                                                    {cat}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Kontak Person / PIC (Sales)</label>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Contoh: Budi Santoso / Ibu Maya"
                                            value={formData.kc}
                                            onChange={(e) => setFormData({ ...formData, kc: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-group">
                                    <label>Nomor Telepon / WhatsApp</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: 0812-3456-7890 / (021) 7891234"
                                        value={formData.telp}
                                        onChange={(e) => setFormData({ ...formData, telp: e.target.value })}
                                    />
                                </div>

                                <div className="gdg-form-group">
                                    <label>Alamat Lengkap Perusahaan / Gudang</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Jl. Raya Protokol No. 123, Kel. Suka Maju, Jakarta Selatan"
                                        value={formData.alamat}
                                        onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button
                                    type="button"
                                    className="gdg-btn-stripe secondary"
                                    style={{ padding: '0 16px' }}
                                    onClick={() => setShowModalForm(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="gdg-btn-stripe primary"
                                    style={{ padding: '0 16px' }}
                                    disabled={saving}
                                >
                                    {saving ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Simpan Vendor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL KONFIRMASI HAPUS VENDOR */}
            {showDeleteModal && vendorToDelete && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !deleting && setShowDeleteModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Hapus Vendor Rekanan?</h3>
                                <p>Tindakan ini akan menonaktifkan rekanan dari daftar aktif.</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !deleting && setShowDeleteModal(false)}
                                disabled={deleting}
                                aria-label="Tutup Modal"
                            >
                                <X size={16} strokeWidth={1.75} />
                            </button>
                        </div>

                        <div className="gdg-modal-body" style={{ padding: '20px 24px' }}>
                            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: '1.6', color: 'var(--gdg-text)' }}>
                                Apakah Anda yakin ingin menghapus rekanan{' '}
                                <strong>{vendorToDelete.nama}</strong>?
                            </p>
                            <div className="gdg-banner warning" style={{ marginTop: '12px' }}>
                                Catatan: Vendor tidak dihapus permanen untuk menjaga integritas transaksi Surat Pesanan (PO) & riwayat mutasi lama.
                            </div>
                        </div>

                        <div className="gdg-modal-foot">
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                style={{ padding: '0 16px' }}
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="gdg-btn danger"
                                style={{ height: '36px', borderRadius: '6px', padding: '0 16px', fontSize: '13px', fontWeight: 500 }}
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                            >
                                <Trash2 size={14} strokeWidth={1.75} />
                                {deleting ? 'Menghapus...' : 'Ya, Hapus Vendor'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

