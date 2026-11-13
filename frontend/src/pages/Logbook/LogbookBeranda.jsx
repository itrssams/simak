import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Edit2,
    Trash2,
    X,
    ClipboardList,
    CalendarCheck
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import { SimplePagination } from '../../utils/pagination.jsx';
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
    const [pageSize, setPageSize] = useState(10);

    const totalItems = activeUraianTugas.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const curPage = Math.min(page, totalPages);

    const paginatedUraianTugas = useMemo(() => {
        const start = (curPage - 1) * pageSize;
        return activeUraianTugas.slice(start, start + pageSize);
    }, [activeUraianTugas, curPage, pageSize]);

    return (
        <div className="logbook-page lb-stripe-beranda">
            {/* ════════════════ HERO HEADER (STRIPE CLEAN) ════════════════ */}
            <div className="lb-hero">
                <div className="lb-hero-text">
                    <h1>Beranda Logbook</h1>
                    <p>Ringkasan aktivitas kerja harian, status verifikasi, dan manajemen uraian tugas pokok</p>
                </div>
                <button
                    type="button"
                    className="lb-btn primary"
                    onClick={() => navigate('/logbook/aktivitas?action=new')}
                >
                    <Plus size={15} />
                    <span>Catat Aktivitas</span>
                </button>
            </div>

            {/* ════════════════ HORIZONTAL STAT-BAR KPI ════════════════ */}
            <div className="lb-stat-bar">
                <div className="lb-stat-cell">
                    <span className="lb-stat-label">Status Verifikasi Bulan Ini</span>
                    <strong className="lb-stat-val">
                        {loadingStats ? '...' : stats.month_count}
                        {!loadingStats && <span className="lb-stat-unit">Total</span>}
                    </strong>
                    <div className="lb-stat-meta-row">
                        <span className="lb-stat-meta-item" title="Disetujui oleh atasan">
                            <span className="lb-dot" style={{ background: '#10b981' }} />
                            <span>{stats.month_disetujui} Disetujui</span>
                        </span>
                        <span className="lb-meta-sep">•</span>
                        <span className="lb-stat-meta-item" title="Menunggu verifikasi atasan">
                            <span className="lb-dot" style={{ background: '#f59e0b' }} />
                            <span>{stats.month_perlu_verifikasi} Menunggu</span>
                        </span>
                        {stats.month_ditolak > 0 && (
                            <>
                                <span className="lb-meta-sep">•</span>
                                <span className="lb-stat-meta-item" title="Perlu perbaikan / ditolak">
                                    <span className="lb-dot" style={{ background: '#f43f5e' }} />
                                    <span>{stats.month_ditolak} Ditolak</span>
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="lb-stat-cell">
                    <span className="lb-stat-label">Aktivitas Hari Ini</span>
                    <strong className="lb-stat-val">
                        {loadingStats ? '...' : stats.today_count}
                        {!loadingStats && <span className="lb-stat-unit">Aktivitas</span>}
                    </strong>
                    <span className="lb-stat-sub">
                        Durasi kerja: <strong>{loadingStats ? '...' : stats.today_durasi_format}</strong>
                    </span>
                </div>

                <div className="lb-stat-cell">
                    <span className="lb-stat-label">Jam Kerja Bulan Ini</span>
                    <strong className="lb-stat-val">
                        {loadingStats ? '...' : stats.month_durasi_format}
                    </strong>
                    <span className="lb-stat-sub">
                        Akumulasi dari <strong>{loadingStats ? '...' : stats.month_count}</strong> logbook
                    </span>
                </div>

                <div className="lb-stat-cell">
                    <span className="lb-stat-label">Uraian Tugas Pokok</span>
                    <strong className="lb-stat-val">
                        {loadingUraian ? '...' : activeUraianTugas.length}
                        {!loadingUraian && <span className="lb-stat-unit">Job Desc</span>}
                    </strong>
                    <span className="lb-stat-sub">Tugas pokok acuan kinerja aktif</span>
                </div>
            </div>

            {/* ════════════════ 2-COLUMN SPLIT (1.6fr : 1fr) ════════════════ */}
            <div className="lb-two-col">
                {/* ── SISI KIRI: AKTIVITAS TERKINI ── */}
                <section className="lb-col-section lb-col-left">
                    <div className="lb-section-head">
                        <div>
                            <h2>Aktivitas Terkini</h2>
                            <p>Catatan logbook terbaru Anda</p>
                        </div>
                        <button
                            type="button"
                            className="lb-btn-sm secondary"
                            onClick={() => navigate('/logbook/aktivitas')}
                            title="Buka halaman seluruh riwayat aktivitas"
                        >
                            Lihat Semua
                        </button>
                    </div>

                    <div className="lb-col-body">
                        {loadingStats ? (
                            <div className="lb-empty-flat">Memuat aktivitas...</div>
                        ) : !stats.recent_activities || stats.recent_activities.length === 0 ? (
                            <div className="lb-empty-flat">
                                <CalendarCheck size={28} strokeWidth={1.5} className="lb-icon-muted" />
                                <h3>Belum Ada Aktivitas Tercatat</h3>
                                <p>Mulai hari kerja Anda dengan mencatat pekerjaan yang dilakukan agar terpantau dengan baik.</p>
                                <button
                                    type="button"
                                    className="lb-btn primary"
                                    onClick={() => navigate('/logbook/aktivitas?action=new')}
                                >
                                    <Plus size={15} />
                                    <span>Catat Aktivitas Sekarang</span>
                                </button>
                            </div>
                        ) : (
                            <div className="lb-feed-list">
                                {stats.recent_activities.map((act) => {
                                    const dotColor =
                                        act.status === 'disetujui'
                                            ? '#10b981'
                                            : act.status === 'ditolak'
                                                ? '#f43f5e'
                                                : '#f59e0b';
                                    const statusLabel =
                                        act.status === 'disetujui'
                                            ? 'Disetujui'
                                            : act.status === 'ditolak'
                                                ? 'Ditolak'
                                                : 'Menunggu Verifikasi';

                                    return (
                                        <div key={act.id} className="lb-feed-row">
                                            <div className="lb-feed-row-top">
                                                <div className="lb-feed-time">
                                                    <span>
                                                        {act.jam_mulai ? act.jam_mulai.substring(0, 5) : '-'} – {act.jam_selesai ? act.jam_selesai.substring(0, 5) : '-'}
                                                    </span>
                                                    {act.durasi_format && act.durasi_format !== '0 mnt' && (
                                                        <>
                                                            <span className="lb-meta-sep">•</span>
                                                            <span>{act.durasi_format}</span>
                                                        </>
                                                    )}
                                                </div>

                                                <span className="lb-status-text">
                                                    <span className="lb-dot" style={{ background: dotColor }} />
                                                    <span>{statusLabel}</span>
                                                </span>
                                            </div>

                                            <h4 className="lb-feed-title">
                                                {act.nama_aktivitas || act.deskripsi || '-'}
                                            </h4>

                                            {act.nama_aktivitas && act.deskripsi && act.deskripsi !== act.nama_aktivitas && (
                                                <p className="lb-feed-desc">{act.deskripsi}</p>
                                            )}

                                            <div className="lb-feed-meta">
                                                <span>{act.tanggal}</span>
                                                {act.uraian_tugas_text && (
                                                    <>
                                                        <span className="lb-meta-sep">•</span>
                                                        <span className="lb-feed-jobdesc" title={act.uraian_tugas_text}>
                                                            {act.uraian_tugas_text}
                                                        </span>
                                                    </>
                                                )}
                                                {Number(act.nilai_output) > 0 && (
                                                    <>
                                                        <span className="lb-meta-sep">•</span>
                                                        <span>Output: {act.nilai_output} {act.satuan_output || ''}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── SISI KANAN: DAFTAR URAIAN TUGAS POKOK ── */}
                <section className="lb-col-section lb-col-right">
                    <div className="lb-section-head">
                        <div>
                            <h2>Uraian Tugas Pokok</h2>
                            <p>{activeUraianTugas.length} job desc terdaftar</p>
                        </div>
                        <button
                            type="button"
                            className="lb-btn-sm primary"
                            onClick={() => openModal()}
                            title="Tambah uraian tugas baru"
                        >
                            <Plus size={14} />
                            <span>Tambah</span>
                        </button>
                    </div>

                    <div className="lb-col-body">
                        {loadingUraian ? (
                            <div className="lb-empty-flat">Memuat uraian tugas...</div>
                        ) : activeUraianTugas.length === 0 ? (
                            <div className="lb-empty-flat">
                                <ClipboardList size={28} strokeWidth={1.5} className="lb-icon-muted" />
                                <h3>Belum Ada Uraian Tugas</h3>
                                <p>Daftarkan uraian tugas / job description harian Anda sebagai acuan pencatatan logbook.</p>
                                <button
                                    type="button"
                                    className="lb-btn primary"
                                    onClick={() => openModal()}
                                >
                                    <Plus size={15} />
                                    <span>Tambah Uraian Tugas</span>
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="lb-jobdesc-list">
                                    {paginatedUraianTugas.map((item, idx) => {
                                        const itemIndex = (curPage - 1) * pageSize + idx + 1;
                                        return (
                                            <div key={item.id} className="lb-jobdesc-row">
                                                <span className="lb-jobdesc-num">{itemIndex}.</span>
                                                <p className="lb-jobdesc-text">{item.deskripsi}</p>
                                                <div className="lb-jobdesc-actions">
                                                    <button
                                                        type="button"
                                                        className="lb-ghost-icon"
                                                        onClick={() => openModal(item)}
                                                        title="Edit Uraian Tugas"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="lb-ghost-icon danger"
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

                                {totalItems > 0 && (
                                    <SimplePagination
                                        className="lb-dash-pagination"
                                        page={curPage}
                                        totalCount={totalItems}
                                        pageSize={pageSize}
                                        onPageChange={setPage}
                                        onPageSizeChange={(n) => {
                                            setPageSize(n);
                                            setPage(1);
                                        }}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </section>
            </div>

            {/* ════════════════ MODAL FORM URAIAN TUGAS ════════════════ */}
            {isModalOpen && createPortal(
                <div className="lb-modal-overlay" onClick={closeModal}>
                    <div className="lb-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lb-modal-header">
                            <h3>{editingItem ? 'Edit Uraian Tugas' : 'Tambah Uraian Tugas'}</h3>
                            <button type="button" className="lb-modal-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="lb-modal-body">
                                <div className="lb-field-group">
                                    <label>
                                        Deskripsi Uraian Tugas / Job Description <span className="lb-req">*</span>
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={formData.deskripsi}
                                        onChange={(e) => setFormData({ deskripsi: e.target.value })}
                                        className="lb-textarea"
                                        placeholder="Tuliskan tugas pokok pekerjaan Anda, contoh: Menyusun rekonsiliasi kas dan pelaporan harian..."
                                        autoFocus
                                        required
                                    />
                                    <span className="lb-field-hint">
                                        Uraian ini akan muncul sebagai opsi pilihan saat Anda mencatat logbook harian.
                                    </span>
                                </div>
                            </div>
                            <div className="lb-modal-footer">
                                <button type="button" className="lb-btn secondary" onClick={closeModal} disabled={submitting}>
                                    Batal
                                </button>
                                <button type="submit" className="lb-btn primary" disabled={submitting}>
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
                <div className="lb-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="lb-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="lb-modal-header">
                            <h3>Hapus Uraian Tugas</h3>
                            <button type="button" className="lb-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="lb-modal-body">
                            <p className="lb-delete-prompt">
                                Apakah Anda yakin ingin menghapus uraian tugas ini dari daftar aktif?
                            </p>
                            <div className="lb-delete-preview">
                                <small>Deskripsi Tugas:</small>
                                <div>"{deleteItem.deskripsi}"</div>
                            </div>
                        </div>
                        <div className="lb-modal-footer">
                            <button type="button" className="lb-btn secondary" onClick={closeDeleteConfirm} disabled={deleting}>
                                Batal
                            </button>
                            <button type="button" className="lb-btn danger" onClick={handleDelete} disabled={deleting}>
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
