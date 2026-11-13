import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, FileText, Search, Clock, RotateCcw, Eye, MessageSquareText } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';
import { SimplePagination } from '../../utils/pagination.jsx';
import './MyLogbook.css';

const formatTime = (timeString) => {
    if (!timeString) return '-';
    return timeString.substring(0, 5);
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
        return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateString;
    }
};

const STATUS_DOT_COLORS = {
    disetujui: '#10b981',
    ditolak: '#f43f5e',
    perlu_verifikasi: '#f59e0b',
};

const StatusBadge = ({ status, statusLabel }) => {
    const dotColor = STATUS_DOT_COLORS[status] || '#94a3b8';
    return (
        <span className="lb-status-text">
            <span className="lb-dot" style={{ background: dotColor }} />
            <span>{statusLabel || status}</span>
        </span>
    );
};

export default function LogbookAktivitas() {
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [aktivitas, setAktivitas] = useState([]);
    const [uraianTugasOpts, setUraianTugasOpts] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filter & Search
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [activePreset, setActivePreset] = useState('all'); // 'all' | 'this_month' | 'today' | 'custom'

    // Pagination State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Reset pagination to page 1 on filter/search change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, startDate, endDate, statusFilter]);

    const totalItems = aktivitas.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const paginatedAktivitas = useMemo(() => {
        const start = (page - 1) * pageSize;
        return aktivitas.slice(start, start + pageSize);
    }, [aktivitas, page, pageSize]);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        tanggal: new Date().toISOString().split('T')[0],
        uraian_tugas_id: '',
        nama_aktivitas: '',
        nilai_output: 0,
        satuan_output: '',
        jam_mulai: '',
        jam_selesai: '',
        deskripsi: ''
    });

    // Live duration computation for modal
    const durationPreview = useMemo(() => {
        if (!formData.jam_mulai || !formData.jam_selesai) return null;
        const [h1, m1] = formData.jam_mulai.split(':').map(Number);
        const [h2, m2] = formData.jam_selesai.split(':').map(Number);
        if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return null;
        let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight
        const jam = Math.floor(diffMinutes / 60);
        const menit = diffMinutes % 60;
        if (jam > 0 && menit > 0) return `${jam} jam ${menit} mnt`;
        if (jam > 0) return `${jam} jam`;
        return `${menit} menit`;
    }, [formData.jam_mulai, formData.jam_selesai]);

    const selectedUraianTugas = useMemo(() => {
        if (!formData.uraian_tugas_id || formData.uraian_tugas_id === 'lainnya') return null;
        return uraianTugasOpts.find(opt => String(opt.id) === String(formData.uraian_tugas_id));
    }, [formData.uraian_tugas_id, uraianTugasOpts]);

    const uraianTugasSelectOptions = useMemo(() => {
        const list = uraianTugasOpts.map(opt => ({
            value: String(opt.id),
            label: opt.deskripsi,
        }));
        list.push({
            value: 'lainnya',
            label: 'Lainnya (Di luar uraian tugas)',
            isSpecial: true,
            subtext: 'Pilih opsi ini jika aktivitas pekerjaan di luar daftar indikator uraian tugas Anda'
        });
        return list;
    }, [uraianTugasOpts]);

    // Detail Modal state
    const [detailItem, setDetailItem] = useState(null);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Lock scroll background saat ada modal yang terbuka
    useEffect(() => {
        const isAnyModalOpen = Boolean(isModalOpen || detailItem || deleteItem);
        if (!isAnyModalOpen) return;

        const originalBodyOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;
        const originalPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            document.body.style.overflow = originalBodyOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
            document.body.style.paddingRight = originalPaddingRight;
        };
    }, [isModalOpen, detailItem, deleteItem]);

    const isFilterActive = useMemo(() => {
        return Boolean(search.trim() || startDate || endDate || statusFilter !== 'all' || activePreset !== 'all');
    }, [search, startDate, endDate, statusFilter, activePreset]);

    const handlePresetChange = (preset) => {
        setActivePreset(preset);
        const now = new Date();
        if (preset === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            setStartDate(todayStr);
            setEndDate(todayStr);
        } else if (preset === 'this_month') {
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
            setStartDate(`${y}-${m}-01`);
            setEndDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
        } else if (preset === 'all') {
            setStartDate('');
            setEndDate('');
        }
    };

    const handleDateRangeChange = ({ dari, sampai }) => {
        setStartDate(dari || '');
        setEndDate(sampai || '');
        if (!dari && !sampai) {
            setActivePreset('all');
        } else {
            setActivePreset('custom');
        }
    };

    const handleResetFilter = () => {
        setSearch('');
        setStartDate('');
        setEndDate('');
        setStatusFilter('all');
        setActivePreset('all');
    };

    const fetchAktivitas = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                mine: 'true'
            };
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter !== 'all') params.status = statusFilter;

            const res = await api.get('/logbook/', { params });
            setAktivitas(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
            toast.error('Gagal memuat data aktivitas.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, startDate, endDate, statusFilter, toast]);

    const fetchUraianTugasOpts = useCallback(async () => {
        try {
            const res = await api.get('/logbook/uraian-tugas/');
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setUraianTugasOpts(data.filter(item => item.is_active));
        } catch (err) {
            console.error('Error fetching uraian tugas:', err);
        }
    }, []);

    useEffect(() => {
        fetchAktivitas();
        fetchUraianTugasOpts();
    }, [fetchAktivitas, fetchUraianTugasOpts]);

    const openModal = (item = null) => {
        fetchUraianTugasOpts();
        if (item) {
            setEditingItem(item);
            setFormData({
                tanggal: item.tanggal,
                uraian_tugas_id: item.uraian_tugas_id ? String(item.uraian_tugas_id) : 'lainnya',
                nama_aktivitas: item.nama_aktivitas || '',
                nilai_output: item.nilai_output || 0,
                satuan_output: item.satuan_output || '',
                jam_mulai: item.jam_mulai ? item.jam_mulai.substring(0,5) : '',
                jam_selesai: item.jam_selesai ? item.jam_selesai.substring(0,5) : '',
                deskripsi: item.deskripsi || ''
            });
        } else {
            setEditingItem(null);
            setFormData({
                tanggal: new Date().toISOString().split('T')[0],
                uraian_tugas_id: '',
                nama_aktivitas: '',
                nilai_output: 0,
                satuan_output: '',
                jam_mulai: '',
                jam_selesai: '',
                deskripsi: ''
            });
        }
        setIsModalOpen(true);
    };

    useEffect(() => {
        if (searchParams.get('action') === 'new') {
            openModal();
            setSearchParams({}, { replace: true });
        }
    }, [searchParams]);

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        if (!formData.tanggal) {
            toast.error('Tanggal aktivitas wajib dipilih');
            return;
        }

        if (!formData.uraian_tugas_id) {
            toast.error('Uraian tugas wajib dipilih');
            return;
        }

        if (formData.uraian_tugas_id === 'lainnya' && !formData.nama_aktivitas.trim()) {
            toast.error('Nama aktivitas wajib diisi jika memilih "Lainnya"');
            return;
        }

        const payload = {
            ...formData,
            uraian_tugas_id: formData.uraian_tugas_id === 'lainnya' || !formData.uraian_tugas_id ? null : parseInt(formData.uraian_tugas_id),
            metode_input: 'manual'
        };

        setSubmitting(true);
        try {
            if (editingItem) {
                await api.put(`/logbook/${editingItem.id}/`, payload);
                toast.success('Aktivitas berhasil diperbarui');
            } else {
                await api.post('/logbook/', payload);
                toast.success('Aktivitas berhasil ditambahkan');
            }
            closeModal();
            fetchAktivitas();
        } catch (err) {
            console.error(err);
            const errData = err.response?.data;
            if (errData && typeof errData === 'object') {
                const firstKey = Object.keys(errData)[0];
                toast.error(Array.isArray(errData[firstKey]) ? errData[firstKey][0] : JSON.stringify(errData[firstKey]));
            } else {
                toast.error('Gagal menyimpan aktivitas');
            }
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
            await api.delete(`/logbook/${deleteItem.id}/`);
            toast.success('Aktivitas berhasil dihapus');
            closeDeleteConfirm();
            fetchAktivitas();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.detail || 'Gagal menghapus aktivitas (mungkin diluar batas waktu).');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="lb-stripe-beranda">
            <div className="lb-hero">
                <div className="lb-hero-text">
                    <h1>Aktivitas Logbook</h1>
                    <p>Catat pekerjaan harian Anda, kelola target capaian output, dan pantau status verifikasi atasan.</p>
                </div>
                <button type="button" className="lb-btn primary" onClick={() => openModal()}>
                    <Plus size={15} /> Tambah Aktivitas
                </button>
            </div>

            <section className="lb-act-section">
                {/* Filter Bar (36px Uniform Height) */}
                <div className="lb-act-toolbar">
                    <div className="lb-act-filter">
                        <span className="lb-act-label">Preset Periode</span>
                        <div className="lb-seg-control" role="group" aria-label="Preset Periode">
                            <button
                                type="button"
                                className={`lb-seg-btn ${activePreset === 'all' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('all')}
                            >
                                Semua
                            </button>
                            <button
                                type="button"
                                className={`lb-seg-btn ${activePreset === 'this_month' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('this_month')}
                            >
                                Bulan Ini
                            </button>
                            <button
                                type="button"
                                className={`lb-seg-btn ${activePreset === 'today' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('today')}
                            >
                                Hari Ini
                            </button>
                        </div>
                    </div>

                    <div className="lb-act-filter">
                        <span className="lb-act-label">Rentang Tanggal</span>
                        <DateRangePicker
                            dari={startDate}
                            sampai={endDate}
                            onChange={handleDateRangeChange}
                            placeholder="Pilih Periode / Tanggal"
                        />
                    </div>

                    <div className="lb-act-filter">
                        <span className="lb-act-label">Status Verifikasi</span>
                        <select
                            className="lb-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Semua Status</option>
                            <option value="perlu_verifikasi">Perlu Verifikasi</option>
                            <option value="disetujui">Disetujui</option>
                            <option value="ditolak">Ditolak</option>
                        </select>
                    </div>

                    <div className="lb-act-filter grow">
                        <span className="lb-act-label">Cari Aktivitas</span>
                        <div className="lb-search-box">
                            <Search size={14} className="lb-icon-muted" />
                            <input
                                type="text"
                                placeholder="Cari aktivitas, uraian tugas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="lb-search-field"
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="lb-search-clear"
                                    onClick={() => setSearch('')}
                                    title="Reset pencarian"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {isFilterActive && (
                        <div className="lb-act-filter reset-col">
                            <button
                                type="button"
                                className="lb-btn secondary"
                                onClick={handleResetFilter}
                                title="Reset semua filter"
                            >
                                <RotateCcw size={14} />
                                <span>Reset Filter</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="lb-table-wrap">
                    {loading ? (
                        <div className="lb-empty-flat">
                            <p>Memuat data aktivitas...</p>
                        </div>
                    ) : aktivitas.length === 0 ? (
                        <div className="lb-empty-flat">
                            <FileText size={28} className="lb-icon-muted" />
                            <h3>Belum Ada Aktivitas</h3>
                            <p>Belum ada catatan aktivitas logbook yang cocok dengan filter yang dipilih.</p>
                            {isFilterActive ? (
                                <button type="button" className="lb-btn secondary" onClick={handleResetFilter}>
                                    <RotateCcw size={14} /> Reset Filter
                                </button>
                            ) : (
                                <button type="button" className="lb-btn primary" onClick={() => openModal()}>
                                    <Plus size={15} /> Tambah Aktivitas Sekarang
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <table className="lb-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '52px', textAlign: 'center' }}>No</th>
                                        <th style={{ width: '118px' }}>Tanggal</th>
                                        <th>Aktivitas &amp; Uraian</th>
                                        <th style={{ width: '176px' }}>Waktu / Durasi</th>
                                        <th style={{ width: '124px' }}>Output</th>
                                        <th style={{ width: '144px' }}>Status</th>
                                        <th style={{ width: '108px', textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedAktivitas.map((item, idx) => {
                                        const rowIdx = (page - 1) * pageSize + idx + 1;
                                        const canEditDelete = item.status === 'perlu_verifikasi';

                                        return (
                                            <tr key={item.id}>
                                                <td className="lb-td-num" style={{ textAlign: 'center' }}>
                                                    {rowIdx}
                                                </td>
                                                <td className="lb-td-date">
                                                    {formatDate(item.tanggal)}
                                                </td>
                                                <td>
                                                    <div className="lb-td-title">
                                                        {item.uraian_tugas_text || 'Lainnya'}
                                                    </div>
                                                    {(item.nama_aktivitas || item.deskripsi) && (
                                                        <div className="lb-td-desc">
                                                            {item.nama_aktivitas ? <strong>{item.nama_aktivitas} &mdash; </strong> : null}
                                                            {item.deskripsi ? item.deskripsi.substring(0, 75) + (item.deskripsi.length > 75 ? '...' : '') : ''}
                                                        </div>
                                                    )}
                                                    {item.catatan_verifikasi && (item.status === 'disetujui' || item.status === 'ditolak') && (
                                                        <button
                                                            type="button"
                                                            className={`lb-table-note ${item.status === 'ditolak' ? 'danger' : 'success'}`}
                                                            title="Klik untuk melihat catatan lengkap"
                                                            onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                                                        >
                                                            <MessageSquareText size={12} className="lb-table-note-icon" />
                                                            <span>
                                                                <strong>{item.status === 'ditolak' ? 'Catatan Tolak: ' : 'Catatan Atasan: '}</strong>
                                                                {item.catatan_verifikasi.length > 75 ? `${item.catatan_verifikasi.substring(0, 75)}...` : item.catatan_verifikasi}
                                                            </span>
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="lb-td-time">
                                                        {formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)}
                                                    </div>
                                                    <div className="lb-td-duration">
                                                        <span>Durasi: <strong>{item.durasi_format}</strong></span>
                                                        {item.durasi_lembur > 0 && (
                                                            <span
                                                                className="lb-ot-tag"
                                                                title={`Kerja Reguler: ${item.durasi_kerja_format || '0m'}, Lembur: ${item.durasi_lembur_format || '0m'}`}
                                                            >
                                                                +{item.durasi_lembur_format} OT
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="lb-td-output">
                                                    {item.nilai_output > 0 ? (
                                                        <span>{item.nilai_output} {item.satuan_output}</span>
                                                    ) : (
                                                        <span className="lb-muted-dash">-</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge status={item.status} statusLabel={item.status_label} />
                                                </td>
                                                <td>
                                                    <div className="lb-td-actions">
                                                        <button
                                                            type="button"
                                                            className="lb-ghost-icon"
                                                            onClick={() => setDetailItem(item)}
                                                            title="Lihat Detail Aktivitas"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        {canEditDelete && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="lb-ghost-icon"
                                                                    onClick={() => openModal(item)}
                                                                    title="Edit Aktivitas"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="lb-ghost-icon danger"
                                                                    onClick={() => confirmDelete(item)}
                                                                    title="Hapus Aktivitas"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {totalItems > 0 && (
                                <SimplePagination
                                    className="lb-dash-pagination"
                                    page={page}
                                    pageSize={pageSize}
                                    totalCount={totalItems}
                                    onPageChange={setPage}
                                    onPageSizeChange={(newSize) => {
                                        setPageSize(newSize);
                                        setPage(1);
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* Modal Form Tambah / Edit */}
            {isModalOpen && createPortal(
                <div className="lb-modal-overlay">
                    <div className="lb-modal-card xl">
                        <div className="lb-modal-header">
                            <h3>{editingItem ? 'Edit Aktivitas' : 'Tambah Aktivitas'}</h3>
                            <button type="button" className="lb-modal-close-btn" onClick={closeModal} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="lb-modal-body">
                                <div className="lb-modal-split-grid">
                                    {/* Kolom Kiri: Metadata & Output */}
                                    <div className="lb-split-col">
                                        {/* Row 1: Tanggal Aktivitas & Waktu Pengerjaan */}
                                        <div className="lb-modal-row-3">
                                            <div className="lb-field-group">
                                                <label>Tanggal Aktivitas <span className="lb-req">*</span></label>
                                                <DateField
                                                    value={formData.tanggal}
                                                    onChange={(val) => setFormData(prev => ({ ...prev, tanggal: val || '' }))}
                                                    placeholder="Pilih Tanggal Aktivitas"
                                                />
                                            </div>
                                            <div className="lb-field-group">
                                                <label>Jam Mulai <span className="lb-req">*</span></label>
                                                <input
                                                    type="time"
                                                    name="jam_mulai"
                                                    value={formData.jam_mulai}
                                                    onChange={handleFormChange}
                                                    className="lb-input"
                                                    required
                                                />
                                            </div>
                                            <div className="lb-field-group">
                                                <label>Jam Selesai <span className="lb-req">*</span></label>
                                                <input
                                                    type="time"
                                                    name="jam_selesai"
                                                    value={formData.jam_selesai}
                                                    onChange={handleFormChange}
                                                    className="lb-input"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* Durasi Live Info */}
                                        <div className="lb-duration-line">
                                            {durationPreview ? (
                                                <span className="lb-duration-inline">
                                                    <Clock size={13} className="lb-icon-muted" />
                                                    Total Durasi Terhitung: <strong>{durationPreview}</strong>
                                                </span>
                                            ) : (
                                                <span className="lb-field-hint">
                                                    Pilih jam mulai dan jam selesai untuk menghitung durasi aktivitas secara otomatis.
                                                </span>
                                            )}
                                        </div>

                                        {/* Row 2: Uraian Tugas */}
                                        <div className="lb-field-group">
                                            <label>Uraian Tugas <span className="lb-req">*</span></label>
                                            <SearchableSelect
                                                name="uraian_tugas_id"
                                                options={uraianTugasSelectOptions}
                                                value={formData.uraian_tugas_id}
                                                onChange={(val) => setFormData(prev => ({ ...prev, uraian_tugas_id: val }))}
                                                placeholder="Pilih atau cari Uraian Tugas..."
                                                searchPlaceholder="Ketik kata kunci untuk mencari uraian tugas..."
                                                emptyMessage="Tidak ada uraian tugas yang cocok dengan pencarian"
                                                clearable
                                                required
                                            />
                                            {selectedUraianTugas && (
                                                <div className="lb-jobdesc-preview">
                                                    <FileText size={14} className="lb-icon-muted" />
                                                    <div className="lb-jobdesc-preview-body">
                                                        <span className="lb-jobdesc-preview-label">Deskripsi Uraian Tugas</span>
                                                        <p className="lb-jobdesc-preview-text">{selectedUraianTugas.deskripsi}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {uraianTugasOpts.length === 0 && (
                                                <span className="lb-field-hint warn">
                                                    Belum ada uraian tugas terdaftar. Anda dapat memilih &ldquo;Lainnya&rdquo; atau menambahkannya di tab Beranda.
                                                </span>
                                            )}
                                        </div>

                                        {/* Row 3: Nama Aktivitas */}
                                        <div className="lb-field-group">
                                            <label>
                                                Nama Aktivitas {formData.uraian_tugas_id === 'lainnya' ? <span className="lb-req">*</span> : <span className="lb-label-opt">(Opsional jika uraian tugas dipilih)</span>}
                                            </label>
                                            <input
                                                type="text"
                                                name="nama_aktivitas"
                                                value={formData.nama_aktivitas}
                                                onChange={handleFormChange}
                                                className="lb-input"
                                                placeholder={formData.uraian_tugas_id === 'lainnya' ? 'Contoh: Rapat koordinasi lintas divisi' : 'Contoh: Rekonsiliasi mutasi bank harian (opsional)'}
                                                required={formData.uraian_tugas_id === 'lainnya'}
                                            />
                                        </div>

                                        {/* Row 4: Nilai Output & Satuan Output */}
                                        <div className="lb-form-grid-2">
                                            <div className="lb-field-group">
                                                <label>Nilai Output</label>
                                                <input
                                                    type="number"
                                                    name="nilai_output"
                                                    value={formData.nilai_output}
                                                    onChange={handleFormChange}
                                                    className="lb-input"
                                                    placeholder="0"
                                                    min="0"
                                                />
                                            </div>
                                            <div className="lb-field-group">
                                                <label>Satuan Output</label>
                                                <input
                                                    type="text"
                                                    name="satuan_output"
                                                    value={formData.satuan_output}
                                                    onChange={handleFormChange}
                                                    className="lb-input"
                                                    placeholder="contoh: lembar, berkas, dokumen"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Kolom Kanan: Uraian / Deskripsi Lengkap */}
                                    <div className="lb-split-col">
                                        <div className="lb-field-group lb-h-full">
                                            <div className="lb-split-field-header">
                                                <label>
                                                    Uraian / Deskripsi Lengkap <span className="lb-req">*</span>
                                                </label>
                                                <span className="lb-char-count">{formData.deskripsi?.length || 0} karakter</span>
                                            </div>
                                            <textarea
                                                name="deskripsi"
                                                value={formData.deskripsi}
                                                onChange={handleFormChange}
                                                className="lb-textarea lb-textarea-spacious"
                                                placeholder="Jelaskan detail pekerjaan, hasil yang dicapai, atau hambatan yang dihadapi secara rinci di sini..."
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lb-modal-footer">
                                <button type="button" className="lb-btn secondary" onClick={closeModal} disabled={submitting}>
                                    Batal
                                </button>
                                <button type="submit" className="lb-btn primary" disabled={submitting}>
                                    {submitting ? 'Menyimpan...' : (editingItem ? 'Simpan Perubahan' : 'Simpan ke Logbook')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Detail Modal */}
            {detailItem && createPortal(
                <div className="lb-modal-overlay">
                    <div className="lb-modal-card md">
                        <div className="lb-modal-header">
                            <h3>Detail Aktivitas</h3>
                            <button type="button" className="lb-modal-close-btn" onClick={() => setDetailItem(null)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="lb-modal-body">
                            <div className="lb-detail-list">
                                {(detailItem.user_nama || detailItem.user_username) && (
                                    <div className="lb-detail-emp-bar">
                                        <div className="lb-detail-avatar">
                                            {(detailItem.user_nama || detailItem.user_username || 'P').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="lb-detail-emp-meta">
                                            <div className="lb-detail-emp-name">
                                                {detailItem.user_nama || detailItem.user_username}
                                            </div>
                                            <div className="lb-detail-emp-role">
                                                {detailItem.user_role_label || detailItem.user_role || '-'}
                                                {detailItem.unit_nama && ` • ${detailItem.unit_nama}`}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="lb-detail-row">
                                    <span className="lb-detail-label">Tanggal &amp; Waktu Kerja</span>
                                    <div className="lb-detail-value lb-detail-inline">
                                        <strong>{formatDate(detailItem.tanggal)}</strong>
                                        <span className="lb-meta-sep">&bull;</span>
                                        <span>{formatTime(detailItem.jam_mulai)} - {formatTime(detailItem.jam_selesai)}</span>
                                        <span className="lb-meta-sep">&bull;</span>
                                        <span>Total: <strong>{detailItem.durasi_format}</strong></span>
                                    </div>
                                    <div className="lb-detail-sub">
                                        <span>Jam Reguler: <strong>{detailItem.durasi_kerja_format || '0m'}</strong></span>
                                        <span className="lb-meta-sep">&bull;</span>
                                        <span className={detailItem.durasi_lembur > 0 ? 'lb-text-warn' : ''}>
                                            Lembur (Overtime): <strong>{detailItem.durasi_lembur_format || '0m'}</strong>
                                        </span>
                                    </div>
                                </div>

                                <div className="lb-detail-row">
                                    <span className="lb-detail-label">Status Verifikasi</span>
                                    <div>
                                        <StatusBadge status={detailItem.status} statusLabel={detailItem.status_label} />
                                    </div>
                                </div>

                                <div className="lb-detail-row">
                                    <span className="lb-detail-label">Uraian Tugas Pokok</span>
                                    <div className="lb-detail-value">
                                        {detailItem.uraian_tugas_text || 'Lainnya (Di luar uraian tugas pokok)'}
                                    </div>
                                </div>

                                {detailItem.nama_aktivitas && (
                                    <div className="lb-detail-row">
                                        <span className="lb-detail-label">Nama Aktivitas</span>
                                        <div className="lb-detail-value strong">
                                            {detailItem.nama_aktivitas}
                                        </div>
                                    </div>
                                )}

                                <div className="lb-detail-row">
                                    <span className="lb-detail-label">Capaian / Nilai Output</span>
                                    <div className="lb-detail-value tabular">
                                        {detailItem.nilai_output > 0 ? (
                                            <strong>{detailItem.nilai_output} {detailItem.satuan_output}</strong>
                                        ) : (
                                            <span className="lb-muted-dash">Tidak ada target output spesifik</span>
                                        )}
                                    </div>
                                </div>

                                <div className="lb-detail-row">
                                    <span className="lb-detail-label">Deskripsi Pekerjaan</span>
                                    <div className="lb-detail-value prewrap">
                                        {detailItem.deskripsi}
                                    </div>
                                </div>

                                {detailItem.status === 'disetujui' && detailItem.catatan_verifikasi && (
                                    <div className="lb-detail-note success">
                                        <strong>Catatan Persetujuan</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}

                                {detailItem.status === 'ditolak' && detailItem.catatan_verifikasi && (
                                    <div className="lb-detail-note danger">
                                        <strong>Catatan Penolakan</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}

                                {detailItem.verified_by_nama && (
                                    <div className="lb-detail-verified-by">
                                        Diverifikasi oleh: <strong>{detailItem.verified_by_nama}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="lb-modal-footer">
                            <button type="button" className="lb-btn secondary" onClick={() => setDetailItem(null)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation */}
            {deleteItem && createPortal(
                <div className="lb-modal-overlay">
                    <div className="lb-modal-card sm">
                        <div className="lb-modal-header">
                            <h3>Hapus Aktivitas</h3>
                            <button type="button" className="lb-modal-close-btn" onClick={closeDeleteConfirm} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="lb-modal-body">
                            <p className="lb-delete-prompt">Apakah Anda yakin ingin menghapus catatan aktivitas ini?</p>
                            <div className="lb-delete-preview">
                                <small>{formatDate(deleteItem.tanggal)} &bull; {deleteItem.durasi_format}</small>
                                <div>&ldquo;{deleteItem.uraian_tugas_text || deleteItem.nama_aktivitas || deleteItem.deskripsi}&rdquo;</div>
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
