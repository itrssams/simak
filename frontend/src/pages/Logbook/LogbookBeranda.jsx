import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Edit2,
    Trash2,
    X,
    ClipboardList,
    Clock,
    CheckCircle2,
    AlertCircle,
    CalendarCheck,
    Hourglass,
    ShieldCheck,
    ArrowRight,
    Target,
    Calendar,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import './MyLogbook.css';

export default function LogbookBeranda() {
    const toast = useToast();
    const navigate = useNavigate();

    const [uraianTugas, setUraianTugas] = useState([]);
    const [loadingUraian, setLoadingUraian] = useState(false);

    // Dashboard stats
    const [stats, setStats] = useState({
        today_date: new Date().toISOString().split('T')[0],
        today_count: 0,
        today_minutes: 0,
        today_durasi_format: '0 mnt',
        month_count: 0,
        month_minutes: 0,
        month_durasi_format: '0 mnt',
        month_disetujui: 0,
        month_perlu_verifikasi: 0,
        month_ditolak: 0,
        total_uraian_tugas: 0,
        recent_activities: []
    });
    const [loadingStats, setLoadingStats] = useState(true);

    // Modal state Uraian Tugas
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ deskripsi: '' });
    const [editingItem, setEditingItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            const res = await api.get('/logbook/dashboard-stats/');
            setStats(res.data);
        } catch (err) {
            console.error('Error loading dashboard stats:', err);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    const fetchUraianTugas = useCallback(async () => {
        setLoadingUraian(true);
        try {
            const res = await api.get('/logbook/uraian-tugas/');
            setUraianTugas(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error('Error loading job descriptions:', err);
            toast.error('Gagal memuat data uraian tugas.');
        } finally {
            setLoadingUraian(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchStats();
        fetchUraianTugas();
    }, [fetchStats, fetchUraianTugas]);

    const openModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setFormData({ deskripsi: item.deskripsi });
        } else {
            setEditingItem(null);
            setFormData({ deskripsi: '' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setFormData({ deskripsi: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.deskripsi.trim()) {
            toast.error('Deskripsi uraian tugas tidak boleh kosong');
            return;
        }

        setSubmitting(true);
        try {
            if (editingItem) {
                await api.put(`/logbook/uraian-tugas/${editingItem.id}/`, formData);
                toast.success('Uraian tugas berhasil diperbarui');
            } else {
                await api.post('/logbook/uraian-tugas/', formData);
                toast.success('Uraian tugas berhasil ditambahkan');
            }
            closeModal();
            fetchUraianTugas();
            fetchStats();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.deskripsi?.[0] || 'Gagal menyimpan uraian tugas');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = (item) => setDeleteItem(item);
    const closeDeleteConfirm = () => setDeleteItem(null);

    const handleDelete = async () => {
        if (!deleteItem) return;
        setDeleting(true);
        try {
            await api.delete(`/logbook/uraian-tugas/${deleteItem.id}/`);
            toast.success('Uraian tugas berhasil dihapus');
            closeDeleteConfirm();
            fetchUraianTugas();
            fetchStats();
        } catch (err) {
            console.error(err);
            toast.error('Gagal menghapus uraian tugas');
        } finally {
            setDeleting(false);
        }
    };

    const activeUraianTugas = useMemo(() => {
        return uraianTugas.filter(item => item.is_active);
    }, [uraianTugas]);

    // Pagination Uraian Tugas
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    const totalItems = activeUraianTugas.length;
    const effectivePageSize = pageSize === 'all' ? (totalItems || 1) : Number(pageSize);
    const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const paginatedUraianTugas = useMemo(() => {
        if (pageSize === 'all') return activeUraianTugas;
        const start = (page - 1) * effectivePageSize;
        return activeUraianTugas.slice(start, start + effectivePageSize);
    }, [activeUraianTugas, page, pageSize, effectivePageSize]);

    const pageNumbers = useMemo(() => {
        if (totalPages <= 5) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        if (page <= 3) {
            return [1, 2, 3, 4, '...', totalPages];
        }
        if (page >= totalPages - 2) {
            return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        }
        return [1, '...', page - 1, page, page + 1, '...', totalPages];
    }, [page, totalPages]);

    return (
        <div className="logbook-page">
            {/* ════════════════ HERO HEADER ════════════════ */}
            <div className="logbook-hero">
                <div className="logbook-title">
                    <span><ClipboardList size={24} /></span>
                    <div>
                        <h1>Beranda Logbook</h1>
                        <p>Ringkasan aktivitas kerja harian, status verifikasi, dan manajemen uraian tugas pokok</p>
                    </div>
                </div>
            </div>

            {/* ════════════════ STATS CARDS ════════════════ */}
            <div className="logbook-stats-grid">
                {/* Card Utama (Featured): Status Verifikasi Bulan Ini */}
                <div className="logbook-stat-card featured">
                    <div className="logbook-stat-top">
                        <span className="logbook-stat-title">
                            <ShieldCheck size={16} className="logbook-stat-icon-inline" />
                            Status Verifikasi Bulan Ini
                        </span>
                        <span className="logbook-stat-badge-context">Approval</span>
                    </div>
                    <div className="logbook-stat-featured-body">
                        <div className="logbook-stat-main-metric">
                            <div className="logbook-stat-value">
                                {loadingStats ? '...' : `${stats.month_count} Total`}
                            </div>
                        </div>
                        <div className="logbook-stat-pills">
                            <span className="logbook-stat-pill success" title="Disetujui oleh atasan">
                                <CheckCircle2 size={12} /> {stats.month_disetujui} Disetujui
                            </span>
                            <span className="logbook-stat-pill warning" title="Menunggu verifikasi atasan">
                                <Clock size={12} /> {stats.month_perlu_verifikasi} Menunggu
                            </span>
                            {stats.month_ditolak > 0 && (
                                <span className="logbook-stat-pill danger" title="Perlu perbaikan / ditolak">
                                    <AlertCircle size={12} /> {stats.month_ditolak} Ditolak
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Card 2: Aktivitas Hari Ini */}
                <div className="logbook-stat-card">
                    <div className="logbook-stat-top">
                        <span className="logbook-stat-title">
                            <CalendarCheck size={16} className="logbook-stat-icon-inline" />
                            Aktivitas Hari Ini
                        </span>
                    </div>
                    <div className="logbook-stat-body">
                        <div className="logbook-stat-value">
                            {loadingStats ? '...' : `${stats.today_count} Aktivitas`}
                        </div>
                        <p className="logbook-stat-subtext">
                            <Clock size={13} style={{ opacity: 0.8 }} />
                            <span>Durasi kerja: <strong>{loadingStats ? '...' : stats.today_durasi_format}</strong></span>
                        </p>
                    </div>
                </div>

                {/* Card 3: Jam Kerja Bulan Ini */}
                <div className="logbook-stat-card">
                    <div className="logbook-stat-top">
                        <span className="logbook-stat-title">
                            <Hourglass size={16} className="logbook-stat-icon-inline" />
                            Jam Kerja Bulan Ini
                        </span>
                    </div>
                    <div className="logbook-stat-body">
                        <div className="logbook-stat-value">
                            {loadingStats ? '...' : stats.month_durasi_format}
                        </div>
                        <p className="logbook-stat-subtext">
                            <span>Akumulasi dari <strong>{loadingStats ? '...' : stats.month_count}</strong> logbook</span>
                        </p>
                    </div>
                </div>

                {/* Card 4: Uraian Tugas Terdaftar */}
                <div className="logbook-stat-card">
                    <div className="logbook-stat-top">
                        <span className="logbook-stat-title">
                            <ClipboardList size={16} className="logbook-stat-icon-inline" />
                            Uraian Tugas Pokok
                        </span>
                    </div>
                    <div className="logbook-stat-body">
                        <div className="logbook-stat-value">
                            {loadingUraian ? '...' : `${activeUraianTugas.length} Job Desc`}
                        </div>
                        <p className="logbook-stat-subtext">
                            <span>Tugas pokok acuan kinerja aktif</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* ════════════════ 2-COLUMN MAIN CONTENT ════════════════ */}
            <div className="logbook-dashboard-content">
                {/* ── SISI KIRI: AKTIVITAS TERKINI ── */}
                <div className="logbook-card">
                    <div className="logbook-card-head">
                        <div className="logbook-card-title">
                            <h2>Aktivitas Terkini</h2>
                            <p>Catatan logbook terbaru Anda</p>
                        </div>
                        <button
                            className="logbook-btn-view-act"
                            onClick={() => navigate('/logbook/aktivitas')}
                            title="Buka halaman seluruh riwayat aktivitas"
                        >
                            <span>Lihat Semua</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>

                    <div className="logbook-card-body">
                        {loadingStats ? (
                            <div className="logbook-loading-box">
                                <p>Memuat aktivitas...</p>
                            </div>
                        ) : !stats.recent_activities || stats.recent_activities.length === 0 ? (
                            <div className="logbook-empty-box" style={{ padding: '36px 20px' }}>
                                <div className="logbook-empty-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                    <CalendarCheck size={30} />
                                </div>
                                <h3>Belum Ada Aktivitas Tercatat</h3>
                                <p>Mulai hari kerja Anda dengan mencatat pekerjaan yang dilakukan agar terpantau dengan baik.</p>
                                <button
                                    className="logbook-btn-primary"
                                    onClick={() => navigate('/logbook/aktivitas?action=new')}
                                    style={{ marginTop: '14px' }}
                                >
                                    <Plus size={15} /> Catat Aktivitas Sekarang
                                </button>
                            </div>
                        ) : (
                            <div className="logbook-feed-list">
                                {stats.recent_activities.map((act) => {
                                    const statusClass = `status-${act.status || 'perlu_verifikasi'}`;
                                    return (
                                        <div key={act.id} className={`logbook-feed-item ${statusClass}`}>
                                            <div className="logbook-feed-top">
                                                <div className="logbook-feed-time">
                                                    <Clock size={13} />
                                                    <span>
                                                        {act.jam_mulai ? act.jam_mulai.substring(0, 5) : '-'} - {act.jam_selesai ? act.jam_selesai.substring(0, 5) : '-'}
                                                    </span>
                                                    {act.durasi_format && act.durasi_format !== '0 mnt' && (
                                                        <span style={{ opacity: 0.8, fontWeight: 600 }}>
                                                            ({act.durasi_format})
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Status Pill */}
                                                <div>
                                                    {act.status === 'disetujui' && (
                                                        <span className="status-badge status-badge-green" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                                            <CheckCircle2 size={12} /> Disetujui
                                                        </span>
                                                    )}
                                                    {act.status === 'ditolak' && (
                                                        <span className="status-badge status-badge-red" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                                            <AlertCircle size={12} /> Ditolak
                                                        </span>
                                                    )}
                                                    {act.status !== 'disetujui' && act.status !== 'ditolak' && (
                                                        <span className="status-badge status-badge-yellow" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                                            <Clock size={12} /> Menunggu Verifikasi
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <h4 className="logbook-feed-title">
                                                {act.nama_aktivitas || act.deskripsi || '-'}
                                            </h4>

                                            {act.nama_aktivitas && act.deskripsi && act.deskripsi !== act.nama_aktivitas && (
                                                <p className="logbook-feed-desc">
                                                    {act.deskripsi}
                                                </p>
                                            )}

                                            <div className="logbook-feed-meta">
                                                <span className="logbook-jobdesc-tag" title={act.tanggal}>
                                                    <Calendar size={12} style={{ opacity: 0.7 }} />
                                                    <span>{act.tanggal}</span>
                                                </span>
                                                {act.uraian_tugas_text && (
                                                    <span className="logbook-jobdesc-tag" title={act.uraian_tugas_text}>
                                                        <ClipboardList size={12} style={{ opacity: 0.7 }} />
                                                        <span>{act.uraian_tugas_text}</span>
                                                    </span>
                                                )}
                                                {Number(act.nilai_output) > 0 && (
                                                    <span className="logbook-output-tag">
                                                        <Target size={12} style={{ opacity: 0.8 }} />
                                                        <span>Output: {act.nilai_output} {act.satuan_output || ''}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SISI KANAN: DAFTAR URAIAN TUGAS (JOB DESC) ── */}
                <div className="logbook-card">
                    <div className="logbook-card-head">
                        <div className="logbook-card-title">
                            <h2>Uraian Tugas Pokok</h2>
                            <p>{activeUraianTugas.length} job desc terdaftar</p>
                        </div>
                        <button
                            className="logbook-btn-primary"
                            onClick={() => openModal()}
                            style={{ padding: '6px 14px', fontSize: '12.5px' }}
                            title="Tambah uraian tugas baru"
                        >
                            <Plus size={14} /> Tambah
                        </button>
                    </div>

                    <div className="logbook-card-body">
                        {loadingUraian ? (
                            <div className="logbook-loading-box">
                                <p>Memuat uraian tugas...</p>
                            </div>
                        ) : activeUraianTugas.length === 0 ? (
                            <div className="logbook-empty-box" style={{ padding: '36px 20px' }}>
                                <div className="logbook-empty-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
                                    <ClipboardList size={30} />
                                </div>
                                <h3>Belum Ada Uraian Tugas</h3>
                                <p>Daftarkan uraian tugas / job description harian Anda sebagai acuan pencatatan logbook.</p>
                                <button
                                    className="logbook-btn-primary"
                                    onClick={() => openModal()}
                                    style={{ marginTop: '14px' }}
                                >
                                    <Plus size={15} /> Tambah Uraian Tugas
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="logbook-jobdesc-list">
                                    {paginatedUraianTugas.map((item, idx) => {
                                        const itemIndex = pageSize === 'all' ? (idx + 1) : ((page - 1) * effectivePageSize + idx + 1);
                                        return (
                                            <div key={item.id} className="logbook-jobdesc-card">
                                                <div className="logbook-jobdesc-num">
                                                    {itemIndex}
                                                </div>
                                                <div className="logbook-jobdesc-content">
                                                    <p className="logbook-jobdesc-text">
                                                        {item.deskripsi}
                                                    </p>
                                                </div>
                                                <div className="logbook-jobdesc-actions">
                                                    <button
                                                        className="logbook-btn-icon logbook-text-blue"
                                                        onClick={() => openModal(item)}
                                                        title="Edit Uraian Tugas"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        className="logbook-btn-icon logbook-text-red"
                                                        onClick={() => confirmDelete(item)}
                                                        title="Hapus Uraian Tugas"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination Uraian Tugas */}
                                {totalItems > 5 && (
                                    <div className="logbook-card-pagination">
                                        <div className="logbook-pagination-info">
                                            {pageSize === 'all' ? (
                                                <span>Total <strong>{totalItems}</strong> job desc</span>
                                            ) : (
                                                <span>
                                                    <strong>{Math.min((page - 1) * effectivePageSize + 1, totalItems)}–{Math.min(page * effectivePageSize, totalItems)}</strong> dari <strong>{totalItems}</strong>
                                                </span>
                                            )}
                                        </div>

                                        <div className="logbook-pagination-controls">
                                            <div className="logbook-pagination-size">
                                                <select
                                                    value={pageSize}
                                                    onChange={(e) => {
                                                        const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                                                        setPageSize(val);
                                                        setPage(1);
                                                    }}
                                                    className="logbook-select-sm"
                                                    title="Jumlah data per halaman"
                                                >
                                                    <option value={5}>5 / hal</option>
                                                    <option value={10}>10 / hal</option>
                                                    <option value={15}>15 / hal</option>
                                                    <option value="all">Semua</option>
                                                </select>
                                            </div>

                                            {pageSize !== 'all' && totalPages > 1 && (
                                                <div className="logbook-pagination-nav">
                                                    <button
                                                        type="button"
                                                        className="logbook-page-btn"
                                                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                                        disabled={page === 1}
                                                        title="Halaman sebelumnya"
                                                    >
                                                        <ChevronLeft size={14} />
                                                    </button>

                                                    {pageNumbers.map((p, idx) => (
                                                        p === '...' ? (
                                                            <span key={`dots-${idx}`} className="logbook-page-ellipsis">…</span>
                                                        ) : (
                                                            <button
                                                                key={p}
                                                                type="button"
                                                                className={`logbook-page-btn ${p === page ? 'active' : ''}`}
                                                                onClick={() => setPage(p)}
                                                            >
                                                                {p}
                                                            </button>
                                                        )
                                                    ))}

                                                    <button
                                                        type="button"
                                                        className="logbook-page-btn"
                                                        onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                                                        disabled={page === totalPages}
                                                        title="Halaman berikutnya"
                                                    >
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ════════════════ MODAL FORM URAIAN TUGAS ════════════════ */}
            {isModalOpen && createPortal(
                <div className="logbook-modal-overlay" onClick={closeModal}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>{editingItem ? 'Edit Uraian Tugas' : 'Tambah Uraian Tugas'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="logbook-modal-body">
                                <div className="logbook-field-group">
                                    <label>Deskripsi Uraian Tugas / Job Description <span style={{ color: '#ef4444' }}>*</span></label>
                                    <textarea
                                        rows={4}
                                        value={formData.deskripsi}
                                        onChange={(e) => setFormData({ deskripsi: e.target.value })}
                                        className="logbook-textarea"
                                        placeholder="Tuliskan tugas pokok pekerjaan Anda, contoh: Menyusun rekonsiliasi kas dan pelaporan harian..."
                                        autoFocus
                                        required
                                    />
                                    <small style={{ color: '#64748b', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
                                        Uraian ini akan muncul sebagai opsi pilihan saat Anda mencatat logbook harian.
                                    </small>
                                </div>
                            </div>
                            <div className="logbook-modal-footer">
                                <button type="button" className="logbook-btn-cancel" onClick={closeModal} disabled={submitting}>
                                    Batal
                                </button>
                                <button type="submit" className="logbook-btn-primary" disabled={submitting}>
                                    {submitting ? 'Menyimpan...' : (editingItem ? 'Simpan Perubahan' : 'Tambah Tugas')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ════════════════ MODAL DELETE CONFIRMATION ════════════════ */}
            {deleteItem && createPortal(
                <div className="logbook-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Hapus Uraian Tugas</h3>
                            <button className="logbook-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-delete-body">
                            <p>Apakah Anda yakin ingin menghapus uraian tugas ini dari daftar aktif?</p>
                            <div className="logbook-delete-item-preview">
                                <small>Deskripsi Tugas:</small>
                                <div>"{deleteItem.deskripsi}"</div>
                            </div>
                        </div>
                        <div className="logbook-modal-footer">
                            <button type="button" className="logbook-btn-cancel" onClick={closeDeleteConfirm} disabled={deleting}>
                                Batal
                            </button>
                            <button type="button" className="logbook-btn-danger" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
