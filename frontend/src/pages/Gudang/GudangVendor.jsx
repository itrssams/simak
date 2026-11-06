import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Pencil,
    Trash2,
    Building2,
    Phone,
    User,
    MapPin,
    Tag,
    X,
    Check,
    AlertTriangle
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

export default function GudangVendor() {
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

    // Render helper for category badge styling
    const renderCategoryBadge = (cat) => {
        const text = cat || 'UMUM';
        let badgeStyle = {
            fontSize: '0.75rem',
            padding: '3px 8px',
            borderRadius: '6px',
            fontWeight: 600,
            display: 'inline-block'
        };

        if (text.includes('ATK') || text.includes('CETAKAN')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.25)' };
        } else if (text.includes('HOUSEKEEPING') || text.includes('KEBERSIHAN')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)' };
        } else if (text.includes('MATERIAL') || text.includes('SUKU CADANG')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(234, 88, 12, 0.12)', color: '#c2410c', border: '1px solid rgba(234, 88, 12, 0.25)' };
        } else if (text.includes('ALAT KESEHATAN') || text.includes('ELEKTRONIK')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(6, 182, 212, 0.12)', color: '#0891b2', border: '1px solid rgba(6, 182, 212, 0.25)' };
        } else if (text.includes('PENUNJANG')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed', border: '1px solid rgba(139, 92, 246, 0.25)' };
        } else if (text.includes('TEKSTIL') || text.includes('SERAGAM')) {
            badgeStyle = { ...badgeStyle, background: 'rgba(236, 72, 153, 0.12)', color: '#db2777', border: '1px solid rgba(236, 72, 153, 0.25)' };
        } else {
            badgeStyle = { ...badgeStyle, background: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: '1px solid rgba(100, 116, 139, 0.25)' };
        }

        return <span style={badgeStyle}>{text}</span>;
    };

    return (
        <div className="gdg-card">
            {/* CARD HEADER */}
            <div className="gdg-card-head">
                <div className="gdg-card-title">
                    <h2>Direktori Master Vendor & Rekanan</h2>
                    <p>Daftar rekanan aktif untuk pemesanan barang logistik (PO), penerimaan faktur (GRN), dan manajemen utang supplier</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="gdg-btn soft" onClick={fetchVendors} disabled={loading} title="Refresh daftar vendor">
                        <RefreshCw size={15} /> Refresh
                    </button>
                    <button className="gdg-btn primary" onClick={handleOpenCreate}>
                        <Plus size={16} /> Tambah Vendor
                    </button>
                </div>
            </div>

            {/* SEARCH & FILTER TOOLBAR */}
            <div className="gdg-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div className="gdg-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Cari kode rekanan, nama vendor, telepon, atau PIC..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <select
                    className="gdg-select-control"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ minWidth: '240px' }}
                >
                    <option value="">Semua Kategori ({vendors.length})</option>
                    {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                            {cat} {categoryStats[cat] ? `(${categoryStats[cat]})` : ''}
                        </option>
                    ))}
                </select>

                {(search || categoryFilter) && (
                    <button
                        type="button"
                        className="gdg-btn soft"
                        onClick={() => {
                            setSearch('');
                            setCategoryFilter('');
                        }}
                        title="Reset pencarian dan filter"
                    >
                        <X size={14} /> Reset
                    </button>
                )}
            </div>

            {/* VENDOR TABLE */}
            <div className="gdg-table-wrap">
                <table className="gdg-table">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>Kode</th>
                            <th>Nama Perusahaan / Vendor</th>
                            <th style={{ width: '220px' }}>Kategori</th>
                            <th style={{ width: '180px' }}>Kontak Person (PIC)</th>
                            <th style={{ width: '160px' }}>Telepon</th>
                            <th>Alamat</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>Aksi</th>
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
                                <td colSpan="7" className="gdg-table-empty" style={{ padding: '48px 20px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Building2 size={24} />
                                        </div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary, #1e293b)', fontSize: '0.96rem' }}>
                                            {search || categoryFilter ? 'Tidak ada rekanan yang cocok dengan pencarian / filter.' : 'Belum ada data Master Vendor di database SIMAK'}
                                        </div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', maxWidth: '440px' }}>
                                            {search || categoryFilter ? 'Silakan periksa kembali kata kunci atau reset filter kategori.' : 'Daftarkan rekanan distributor pengadaan logistik umum baru melalui tombol di bawah.'}
                                        </p>
                                        {!search && !categoryFilter && (
                                            <button type="button" className="gdg-btn primary" onClick={handleOpenCreate} style={{ marginTop: '6px' }}>
                                                <Plus size={16} /> Tambah Vendor Pertama
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div
                                                style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '6px',
                                                    background: 'rgba(37, 99, 235, 0.08)',
                                                    color: '#2563eb',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                            >
                                                <Building2 size={15} />
                                            </div>
                                            <strong style={{ fontSize: '0.88rem' }}>{v.nama}</strong>
                                        </div>
                                    </td>
                                    <td>{renderCategoryBadge(v.kategori)}</td>
                                    <td>
                                        {v.kc ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit' }}>
                                                <User size={14} style={{ opacity: 0.6 }} />
                                                <span>{v.kc}</span>
                                            </div>
                                        ) : (
                                            <span style={{ opacity: 0.4 }}>-</span>
                                        )}
                                    </td>
                                    <td>
                                        {v.telp ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Phone size={14} style={{ opacity: 0.6 }} />
                                                <span>{v.telp}</span>
                                            </div>
                                        ) : (
                                            <span style={{ opacity: 0.4 }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ maxWidth: '280px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                                        {v.alamat ? (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                <MapPin size={14} style={{ opacity: 0.6, marginTop: '2px', flexShrink: 0 }} />
                                                <span>{v.alamat}</span>
                                            </div>
                                        ) : (
                                            <span style={{ opacity: 0.4 }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center' }}>
                                            <button
                                                type="button"
                                                className="gdg-action-btn edit"
                                                onClick={() => handleOpenEdit(v)}
                                                title="Edit data rekanan"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="gdg-action-btn delete"
                                                onClick={() => handleOpenDelete(v)}
                                                title="Hapus vendor"
                                            >
                                                <Trash2 size={14} />
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
            <div className="gdg-pagination-wrap">
                <SimplePagination
                    totalCount={vendors.length}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            </div>

            {/* MODAL FORM TAMBAH / EDIT VENDOR */}
            {showModalForm && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowModalForm(false)}>
                    <div className="gdg-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon">
                                    <Building2 size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>{isEditMode ? 'Edit Data Vendor' : 'Tambah Vendor Baru'}</h3>
                                    <p>
                                        {isEditMode
                                            ? `Perbarui informasi profil dan kontak rekanan [${formData.kode || `#${formData.id}`}]`
                                            : 'Daftarkan nama rekanan / distributor penyedia pengadaan gudang logistik.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowModalForm(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
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
                                        <label>Kategori Rekanan *</label>
                                        <select
                                            className="gdg-select-control"
                                            value={formData.kategori}
                                            onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                                            style={{ width: '100%', height: '40px' }}
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
                                        <label>Kontak Person / PIC (Sales)</label>
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
                                    className="gdg-btn soft"
                                    onClick={() => setShowModalForm(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="gdg-btn primary"
                                    disabled={saving}
                                >
                                    <Check size={16} />
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
                            <div className="gdg-modal-header-content">
                                <div
                                    className="gdg-modal-header-icon"
                                    style={{
                                        background: 'rgba(244, 63, 94, 0.15)',
                                        color: '#e11d48'
                                    }}
                                >
                                    <AlertTriangle size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Hapus Vendor Rekanan?</h3>
                                    <p>Tindakan ini akan menonaktifkan rekanan dari daftar aktif.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => !deleting && setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body" style={{ padding: '20px 24px' }}>
                            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.6' }}>
                                Apakah Anda yakin ingin menghapus rekanan{' '}
                                <strong style={{ color: '#0f172a' }}>{vendorToDelete.nama}</strong>?
                            </p>
                            <div
                                style={{
                                    marginTop: '12px',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                    fontSize: '0.84rem',
                                    color: '#b45309'
                                }}
                            >
                                Catatan: Vendor tidak dihapus permanen untuk menjaga integritas transaksi Surat Pesanan (PO) & riwayat mutasi lama.
                            </div>
                        </div>

                        <div className="gdg-modal-foot">
                            <button
                                type="button"
                                className="gdg-btn soft"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="gdg-btn danger"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                            >
                                <Trash2 size={15} />
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

