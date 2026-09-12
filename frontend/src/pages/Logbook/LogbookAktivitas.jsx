import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, FileText, Search, Clock, AlertCircle, CheckCircle2, XCircle, RotateCcw, Check, Users, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
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

const StatusBadge = ({ status, statusLabel }) => {
    let colorClass = 'status-badge-gray';
    let Icon = AlertCircle;
    
    if (status === 'perlu_verifikasi') {
        colorClass = 'status-badge-warning';
    } else if (status === 'disetujui') {
        colorClass = 'status-badge-success';
        Icon = CheckCircle2;
    } else if (status === 'ditolak') {
        colorClass = 'status-badge-danger';
        Icon = XCircle;
    }

    return (
        <span className={`status-badge ${colorClass}`}>
            <Icon size={14} /> {statusLabel || status}
        </span>
    );
};

export default function LogbookAktivitas() {
    const { user } = useAuth();
    const isAtasan = Boolean(user?.is_superuser || ['direktur', 'wakil_direktur', 'manajer', 'kepala_seksi'].includes(user?.role));
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
    const defaultStatus = isAtasan ? 'perlu_verifikasi' : 'all';
    const [statusFilter, setStatusFilter] = useState(() => (isAtasan ? 'perlu_verifikasi' : 'all'));
    const [activePreset, setActivePreset] = useState('all'); // 'all' | 'this_month' | 'today' | 'custom'
    const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'my'

    // Sinkronisasi status filter saat user auth pertama kali termuat
    const initialStatusSetRef = useRef(false);
    useEffect(() => {
        if (user && !initialStatusSetRef.current) {
            initialStatusSetRef.current = true;
            if (isAtasan) {
                setStatusFilter('perlu_verifikasi');
            }
        }
    }, [user, isAtasan]);

    // Verifikasi state (untuk Atasan / Wadir / Direktur)
    const [verifikasiItem, setVerifikasiItem] = useState(null);
    const [verifikasiAksi, setVerifikasiAksi] = useState(null); // 'setuju' | 'tolak'
    const [catatan, setCatatan] = useState('');
    const [verifying, setVerifying] = useState(false);

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

    // Detail Modal state
    const [detailItem, setDetailItem] = useState(null);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const isFilterActive = useMemo(() => {
        return Boolean(search.trim() || startDate || endDate || statusFilter !== defaultStatus || activePreset !== 'all' || (isAtasan && scopeFilter !== 'all'));
    }, [search, startDate, endDate, statusFilter, defaultStatus, activePreset, isAtasan, scopeFilter]);

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
        setStatusFilter(isAtasan ? 'perlu_verifikasi' : 'all');
        setActivePreset('all');
        setScopeFilter('all');
    };

    const fetchAktivitas = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter !== 'all') params.status = statusFilter;
            if (isAtasan && scopeFilter === 'my' && user?.id) {
                params.user_id = user.id;
            }

            const res = await api.get('/logbook/', { params });
            setAktivitas(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
            toast.error('Gagal memuat data aktivitas.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, startDate, endDate, statusFilter, isAtasan, scopeFilter, user?.id, toast]);

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
        e.preventDefault();
        
        if (!formData.tanggal) {
            toast.error('Tanggal aktivitas wajib dipilih');
            return;
        }

        if (formData.uraian_tugas_id === 'lainnya' && !formData.nama_aktivitas.trim()) {
            toast.error('Nama aktivitas wajib diisi jika memilih "Lainnya"');
            return;
        }

        const payload = {
            ...formData,
            uraian_tugas_id: formData.uraian_tugas_id === 'lainnya' || !formData.uraian_tugas_id ? null : parseInt(formData.uraian_tugas_id)
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

    const handleAksiVerifikasi = (item, aksi) => {
        setVerifikasiItem(item);
        setVerifikasiAksi(aksi);
        setCatatan('');
    };

    const closeVerifikasiModal = () => {
        setVerifikasiItem(null);
        setVerifikasiAksi(null);
        setCatatan('');
    };

    const submitVerifikasi = async () => {
        if (verifikasiAksi === 'tolak' && !catatan.trim()) {
            toast.error('Catatan penolakan wajib diisi agar pegawai dapat merevisinya.');
            return;
        }

        setVerifying(true);
        try {
            await api.post(`/logbook/${verifikasiItem.id}/verifikasi/`, {
                aksi: verifikasiAksi,
                catatan: catatan
            });
            toast.success(`Aktivitas berhasil di${verifikasiAksi === 'setuju' ? 'setujui' : 'tolak'}.`);
            closeVerifikasiModal();
            fetchAktivitas();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Gagal memverifikasi aktivitas.');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="logbook-page">
            <div className="logbook-hero">
                <div className="logbook-title">
                    <span><FileText size={22} /></span>
                    <div>
                        <h1>Aktivitas Logbook</h1>
                        <p>Catat pekerjaan harian Anda, kelola target capaian output, dan pantau status verifikasi atasan.</p>
                    </div>
                </div>
                <button className="logbook-btn-primary" onClick={() => openModal()}>
                    <Plus size={16} /> Tambah Aktivitas
                </button>
            </div>

            <div className="logbook-card">
                <div className="logbook-card-head">
                    <div className="logbook-card-title">
                        <h2>Riwayat Aktivitas Logbook</h2>
                        <p>{loading ? 'Memuat data aktivitas...' : `Total ${aktivitas.length} catatan aktivitas ditemukan`}</p>
                    </div>
                </div>

                {/* Filter Bar with SIMAK Standards */}
                <div className="logbook-filter-bar">
                    {isAtasan && (
                        <div className="logbook-filter-item">
                            <label>Cakupan Data</label>
                            <div className="logbook-preset-pills">
                                <button
                                    type="button"
                                    className={`logbook-preset-pill-btn ${scopeFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setScopeFilter('all')}
                                >
                                    <Users size={13} />
                                    <span>Semua Pegawai</span>
                                </button>
                                <button
                                    type="button"
                                    className={`logbook-preset-pill-btn ${scopeFilter === 'my' ? 'active' : ''}`}
                                    onClick={() => setScopeFilter('my')}
                                >
                                    <span>Aktivitas Saya</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="logbook-filter-item">
                        <label>Preset Periode</label>
                        <div className="logbook-preset-pills">
                            <button
                                type="button"
                                className={`logbook-preset-pill-btn ${activePreset === 'all' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('all')}
                            >
                                Semua
                            </button>
                            <button
                                type="button"
                                className={`logbook-preset-pill-btn ${activePreset === 'this_month' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('this_month')}
                            >
                                Bulan Ini
                            </button>
                            <button
                                type="button"
                                className={`logbook-preset-pill-btn ${activePreset === 'today' ? 'active' : ''}`}
                                onClick={() => handlePresetChange('today')}
                            >
                                Hari Ini
                            </button>
                        </div>
                    </div>

                    <div className="logbook-filter-item">
                        <label>Rentang Tanggal</label>
                        <DateRangePicker
                            dari={startDate}
                            sampai={endDate}
                            onChange={handleDateRangeChange}
                            placeholder="Pilih Periode / Tanggal"
                        />
                    </div>

                    <div className="logbook-filter-item">
                        <label>Status Verifikasi</label>
                        <select 
                            className="logbook-filter-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Semua Status</option>
                            <option value="perlu_verifikasi">Perlu Verifikasi</option>
                            <option value="disetujui">Disetujui</option>
                            <option value="ditolak">Ditolak</option>
                        </select>
                    </div>

                    <div className="logbook-filter-item flex-1" style={{ minWidth: '240px' }}>
                        <label>Pencarian</label>
                        <div className="logbook-search-wrap" style={{ maxWidth: '100%' }}>
                            <Search size={16} className="logbook-search-icon" />
                            <input
                                type="text"
                                placeholder={isAtasan ? "Cari pegawai, uraian tugas, aktivitas..." : "Cari uraian tugas, aktivitas, output..."}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="logbook-search-input"
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="logbook-search-clear"
                                    onClick={() => setSearch('')}
                                    title="Reset pencarian"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {isFilterActive && (
                        <div className="logbook-filter-item" style={{ justifyContent: 'flex-end' }}>
                            <button 
                                type="button" 
                                className="logbook-btn-secondary" 
                                onClick={handleResetFilter} 
                                style={{ height: '38px', gap: '6px' }}
                                title="Reset semua filter"
                            >
                                <RotateCcw size={14} />
                                <span>Reset Filter</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="logbook-table-wrap">
                    {loading ? (
                        <div className="logbook-loading-box">
                            <p>Memuat data aktivitas...</p>
                        </div>
                    ) : aktivitas.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <FileText size={32} />
                            </div>
                            <h3>Belum Ada Aktivitas</h3>
                            <p>Belum ada catatan aktivitas logbook yang cocok dengan filter yang dipilih.</p>
                            {isFilterActive ? (
                                <button className="logbook-btn-secondary" onClick={handleResetFilter} style={{ marginTop: '12px', gap: '6px' }}>
                                    <RotateCcw size={15} /> Reset Filter
                                </button>
                            ) : (
                                <button className="logbook-btn-primary" onClick={() => openModal()} style={{ marginTop: '12px' }}>
                                    <Plus size={16} /> Tambah Aktivitas Sekarang
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '56px', textAlign: 'center' }}>No</th>
                                    {isAtasan && scopeFilter === 'all' && (
                                        <th style={{ width: '220px' }}>Pegawai</th>
                                    )}
                                    <th style={{ width: '120px' }}>Tanggal</th>
                                    <th>Aktivitas & Uraian</th>
                                    <th style={{ width: '170px' }}>Waktu / Durasi</th>
                                    <th style={{ width: '130px' }}>Output</th>
                                    <th style={{ width: '150px', textAlign: 'center' }}>Status</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aktivitas.map((item, idx) => {
                                    const isOwnActivity = item.user_id === user?.id;
                                    const canVerify = isAtasan && !isOwnActivity && item.status === 'perlu_verifikasi';
                                    const canEditDelete = isOwnActivity && item.status === 'perlu_verifikasi';

                                    return (
                                        <tr key={item.id}>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className="logbook-row-idx">{idx + 1}</span>
                                            </td>
                                            {isAtasan && scopeFilter === 'all' && (
                                                <td>
                                                    <div className="logbook-emp-cell">
                                                        <div className="logbook-emp-avatar">
                                                            {(item.user_nama || item.user_username || 'P').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="logbook-emp-name" title={item.user_nama || item.user_username}>
                                                                {item.user_nama || item.user_username}
                                                                {isOwnActivity && <span className="logbook-you-tag">Anda</span>}
                                                            </div>
                                                            <div className="logbook-emp-role">
                                                                {item.user_role_label || item.user_role || '-'}
                                                                {item.unit_nama && ` • ${item.unit_nama}`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            <td>
                                                <span className="logbook-table-date">
                                                    {formatDate(item.tanggal)}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>
                                                    {item.uraian_tugas_text || 'Lainnya'}
                                                </div>
                                                {(item.nama_aktivitas || item.deskripsi) && (
                                                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
                                                        {item.nama_aktivitas ? <strong>{item.nama_aktivitas} &mdash; </strong> : null}
                                                        {item.deskripsi ? item.deskripsi.substring(0, 70) + (item.deskripsi.length > 70 ? '...' : '') : ''}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.88rem' }}>
                                                    <Clock size={13} style={{ color: '#0284c7' }} />
                                                    <span>{formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)}</span>
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                    Durasi: <strong>{item.durasi_format}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                {item.nilai_output > 0 ? (
                                                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{item.nilai_output} {item.satuan_output}</span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <StatusBadge status={item.status} statusLabel={item.status_label} />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                    <button 
                                                        className="logbook-btn-icon logbook-text-gray" 
                                                        onClick={() => setDetailItem(item)}
                                                        title="Lihat Detail Aktivitas"
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                    {canVerify && (
                                                        <>
                                                            <button 
                                                                className="logbook-btn-icon logbook-text-green" 
                                                                onClick={() => handleAksiVerifikasi(item, 'setuju')}
                                                                title="Setujui Aktivitas"
                                                            >
                                                                <Check size={15} />
                                                            </button>
                                                            <button 
                                                                className="logbook-btn-icon logbook-text-red" 
                                                                onClick={() => handleAksiVerifikasi(item, 'tolak')}
                                                                title="Tolak Aktivitas"
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {canEditDelete && (
                                                        <>
                                                            <button 
                                                                className="logbook-btn-icon logbook-text-blue" 
                                                                onClick={() => openModal(item)}
                                                                title="Edit Aktivitas"
                                                            >
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button 
                                                                className="logbook-btn-icon logbook-text-red" 
                                                                onClick={() => confirmDelete(item)}
                                                                title="Hapus Aktivitas"
                                                            >
                                                                <Trash2 size={15} />
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
                    )}
                </div>
            </div>

            {/* Modal Form Tambah / Edit */}
            {isModalOpen && createPortal(
                <div className="logbook-modal-overlay" onClick={closeModal}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>{editingItem ? 'Edit Aktivitas' : 'Tambah Aktivitas'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="logbook-modal-body">
                                {/* Row 1: Tanggal Aktivitas & Waktu Pengerjaan */}
                                <div className="logbook-modal-row-3">
                                    <div className="logbook-field-group">
                                        <label>Tanggal Aktivitas <span style={{color: '#ef4444'}}>*</span></label>
                                        <DateField
                                            value={formData.tanggal}
                                            onChange={(val) => setFormData(prev => ({ ...prev, tanggal: val || '' }))}
                                            placeholder="Pilih Tanggal Aktivitas"
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Jam Mulai <span style={{color: '#ef4444'}}>*</span></label>
                                        <input
                                            type="time"
                                            name="jam_mulai"
                                            value={formData.jam_mulai}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Jam Selesai <span style={{color: '#ef4444'}}>*</span></label>
                                        <input
                                            type="time"
                                            name="jam_selesai"
                                            value={formData.jam_selesai}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Durasi Live Badge */}
                                <div style={{ marginTop: '-4px', marginBottom: '2px' }}>
                                    {durationPreview ? (
                                        <div className="logbook-duration-badge">
                                            <Clock size={14} /> Total Durasi Terhitung: <strong>{durationPreview}</strong>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                            *Pilih jam mulai dan jam selesai untuk menghitung durasi aktivitas secara otomatis.
                                        </div>
                                    )}
                                </div>

                                {/* Row 2: Uraian Tugas (Full Width) */}
                                <div className="logbook-field-group">
                                    <label>Uraian Tugas <span style={{color: '#ef4444'}}>*</span></label>
                                    <select
                                        name="uraian_tugas_id"
                                        value={formData.uraian_tugas_id}
                                        onChange={handleFormChange}
                                        className="logbook-select"
                                        required
                                    >
                                        <option value="">Pilih Uraian Tugas...</option>
                                        {uraianTugasOpts.map(opt => (
                                            <option key={opt.id} value={String(opt.id)}>{opt.deskripsi}</option>
                                        ))}
                                        <option value="lainnya">Lainnya (Di luar uraian tugas)</option>
                                    </select>
                                    {selectedUraianTugas && (
                                        <div className="logbook-jobdesc-preview">
                                            <FileText size={15} className="logbook-jobdesc-preview-icon" />
                                            <div className="logbook-jobdesc-preview-body">
                                                <span className="logbook-jobdesc-preview-label">Deskripsi Lengkap Uraian Tugas:</span>
                                                <p className="logbook-jobdesc-preview-text">{selectedUraianTugas.deskripsi}</p>
                                            </div>
                                        </div>
                                    )}
                                    {uraianTugasOpts.length === 0 && (
                                        <small style={{ color: '#f59e0b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                            *Belum ada uraian tugas terdaftar. Anda dapat memilih "Lainnya" atau menambahkannya di tab Beranda.
                                        </small>
                                    )}
                                </div>

                                {/* Row 3: Nama Aktivitas (Full Width) */}
                                <div className="logbook-field-group">
                                    <label>
                                        Nama Aktivitas {formData.uraian_tugas_id === 'lainnya' ? <span style={{color: '#ef4444'}}>*</span> : <span style={{color: '#64748b', fontSize: '11px', fontWeight: 400}}>(Opsional)</span>}
                                    </label>
                                    <input
                                        type="text"
                                        name="nama_aktivitas"
                                        value={formData.nama_aktivitas}
                                        onChange={handleFormChange}
                                        className="logbook-input"
                                        placeholder={formData.uraian_tugas_id === 'lainnya' ? "Contoh: Rapat koordinasi lintas divisi" : "Contoh: Rekonsiliasi mutasi bank harian (opsional)"}
                                        required={formData.uraian_tugas_id === 'lainnya'}
                                    />
                                </div>

                                {/* Row 4: Nilai Output & Satuan Output (2-Kolom) */}
                                <div className="logbook-form-grid">
                                    <div className="logbook-field-group">
                                        <label>Nilai Output</label>
                                        <input
                                            type="number"
                                            name="nilai_output"
                                            value={formData.nilai_output}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            placeholder="0"
                                            min="0"
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Satuan Output</label>
                                        <input
                                            type="text"
                                            name="satuan_output"
                                            value={formData.satuan_output}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            placeholder="contoh: lembar, berkas, dokumen"
                                        />
                                    </div>
                                </div>

                                {/* Row 5: Uraian / Deskripsi Lengkap (Full Width) */}
                                <div className="logbook-field-group">
                                    <label>Uraian / Deskripsi Lengkap <span style={{color: '#ef4444'}}>*</span></label>
                                    <textarea
                                        rows={3}
                                        name="deskripsi"
                                        value={formData.deskripsi}
                                        onChange={handleFormChange}
                                        className="logbook-textarea"
                                        placeholder="Jelaskan detail pekerjaan dan hasil yang dicapai..."
                                        required
                                    />
                                </div>
                            </div>
                            <div className="logbook-modal-footer">
                                <button type="button" className="logbook-btn-cancel" onClick={closeModal} disabled={submitting}>
                                    Batal
                                </button>
                                <button type="submit" className="logbook-btn-primary" disabled={submitting}>
                                    {submitting ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Detail Modal */}
            {detailItem && createPortal(
                <div className="logbook-modal-overlay" onClick={() => setDetailItem(null)}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Detail Aktivitas</h3>
                            <button className="logbook-modal-close-btn" onClick={() => setDetailItem(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div className="logbook-detail-grid">
                                {(detailItem.user_nama || detailItem.user_username) && (
                                    <div className="logbook-detail-row" style={{ background: 'rgba(2, 132, 199, 0.05)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(2, 132, 199, 0.15)' }}>
                                        <span className="logbook-detail-label" style={{ marginBottom: '6px' }}>Pegawai yang Bersangkutan</span>
                                        <div className="logbook-emp-cell">
                                            <div className="logbook-emp-avatar">
                                                {(detailItem.user_nama || detailItem.user_username || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="logbook-emp-name">
                                                    {detailItem.user_nama || detailItem.user_username}
                                                </div>
                                                <div className="logbook-emp-role">
                                                    {detailItem.user_role_label || detailItem.user_role || '-'}
                                                    {detailItem.unit_nama && ` • ${detailItem.unit_nama}`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Tanggal & Waktu Kerja</span>
                                    <div className="logbook-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <strong>{formatDate(detailItem.tanggal)}</strong>
                                        <span>&bull;</span>
                                        <span>{formatTime(detailItem.jam_mulai)} - {formatTime(detailItem.jam_selesai)}</span>
                                        <span className="logbook-duration-badge" style={{ marginTop: 0, padding: '2px 8px', fontSize: '11.5px' }}>
                                            {detailItem.durasi_format}
                                        </span>
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Status Verifikasi</span>
                                    <div style={{ marginTop: '4px' }}>
                                        <StatusBadge status={detailItem.status} statusLabel={detailItem.status_label} />
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Uraian Tugas Pokok</span>
                                    <div className="logbook-detail-value">
                                        {detailItem.uraian_tugas_text || 'Lainnya (Di luar uraian tugas pokok)'}
                                    </div>
                                </div>

                                {detailItem.nama_aktivitas && (
                                    <div className="logbook-detail-row">
                                        <span className="logbook-detail-label">Nama Aktivitas</span>
                                        <div className="logbook-detail-value" style={{ fontWeight: 600 }}>
                                            {detailItem.nama_aktivitas}
                                        </div>
                                    </div>
                                )}

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Capaian / Nilai Output</span>
                                    <div className="logbook-detail-value">
                                        {detailItem.nilai_output > 0 ? (
                                            <strong>{detailItem.nilai_output} {detailItem.satuan_output}</strong>
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>Tidak ada target output spesifik</span>
                                        )}
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Deskripsi Pekerjaan</span>
                                    <div className="logbook-detail-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                        {detailItem.deskripsi}
                                    </div>
                                </div>

                                {detailItem.status === 'disetujui' && detailItem.catatan_verifikasi && (
                                    <div className="logbook-alert-box success">
                                        <strong style={{ display: 'block', marginBottom: '3px', fontSize: '12px' }}>Catatan Persetujuan:</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}

                                {detailItem.status === 'ditolak' && detailItem.catatan_verifikasi && (
                                    <div className="logbook-alert-box danger">
                                        <strong style={{ display: 'block', marginBottom: '3px', fontSize: '12px' }}>Catatan Penolakan:</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}

                                {detailItem.verified_by_nama && (
                                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', borderTop: '1px dashed rgba(100, 116, 139, 0.25)', paddingTop: '10px' }}>
                                        Diverifikasi oleh: <strong>{detailItem.verified_by_nama}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="logbook-modal-footer" style={{ justifyContent: 'space-between' }}>
                            <button type="button" className="logbook-btn-cancel" onClick={() => setDetailItem(null)}>
                                Tutup
                            </button>
                            {isAtasan && detailItem.user_id !== user?.id && detailItem.status === 'perlu_verifikasi' && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        type="button" 
                                        className="logbook-btn-danger" 
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                                        onClick={() => {
                                            const item = detailItem;
                                            setDetailItem(null);
                                            handleAksiVerifikasi(item, 'tolak');
                                        }}
                                    >
                                        <X size={15} /> Tolak
                                    </button>
                                    <button 
                                        type="button" 
                                        className="logbook-btn-primary" 
                                        style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                                        onClick={() => {
                                            const item = detailItem;
                                            setDetailItem(null);
                                            handleAksiVerifikasi(item, 'setuju');
                                        }}
                                    >
                                        <Check size={15} /> Setujui
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation */}
            {deleteItem && createPortal(
                <div className="logbook-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Hapus Aktivitas</h3>
                            <button className="logbook-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-delete-body">
                            <p>Apakah Anda yakin ingin menghapus catatan aktivitas ini?</p>
                            <div className="logbook-delete-item-preview">
                                <small>{formatDate(deleteItem.tanggal)} &bull; {deleteItem.durasi_format}</small>
                                <div>"{deleteItem.uraian_tugas_text || deleteItem.nama_aktivitas || deleteItem.deskripsi}"</div>
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

            {/* Modal Konfirmasi Verifikasi (Setuju / Tolak) */}
            {verifikasiItem && createPortal(
                <div className="logbook-modal-overlay" onClick={closeVerifikasiModal}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>{verifikasiAksi === 'setuju' ? 'Setujui Aktivitas' : 'Tolak Aktivitas'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeVerifikasiModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div style={{ marginBottom: '14px', fontSize: '0.88rem', color: '#475569' }}>
                                {verifikasiAksi === 'setuju' ? (
                                    <p>Apakah Anda yakin ingin <strong>menyetujui</strong> aktivitas logbook pegawai berikut?</p>
                                ) : (
                                    <p>Apakah Anda yakin ingin <strong>menolak</strong> aktivitas logbook pegawai berikut? Mohon cantumkan catatan agar pegawai dapat merevisinya.</p>
                                )}
                            </div>

                            <div className="logbook-delete-item-preview" style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, color: '#0284c7', marginBottom: '2px', fontSize: '13px' }}>
                                    {verifikasiItem.user_nama || verifikasiItem.user_username}
                                </div>
                                <small>{formatDate(verifikasiItem.tanggal)} &bull; {verifikasiItem.durasi_format}</small>
                                <div style={{ marginTop: '2px' }}>"{verifikasiItem.uraian_tugas_text || verifikasiItem.nama_aktivitas || verifikasiItem.deskripsi}"</div>
                            </div>

                            <div className="logbook-field-group">
                                <label>
                                    Catatan / Alasan {verifikasiAksi === 'tolak' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>(Opsional)</span>}
                                </label>
                                <textarea
                                    rows={3}
                                    className="logbook-textarea"
                                    placeholder={verifikasiAksi === 'tolak' ? "Wajib diisi: Berikan instruksi revisi atau alasan penolakan..." : "Catatan atau apresiasi untuk pegawai (opsional)..."}
                                    value={catatan}
                                    onChange={(e) => setCatatan(e.target.value)}
                                    required={verifikasiAksi === 'tolak'}
                                />
                            </div>
                        </div>
                        <div className="logbook-modal-footer">
                            <button type="button" className="logbook-btn-cancel" onClick={closeVerifikasiModal} disabled={verifying}>
                                Batal
                            </button>
                            <button
                                type="button"
                                className={verifikasiAksi === 'setuju' ? 'logbook-btn-primary' : 'logbook-btn-danger'}
                                style={verifikasiAksi === 'setuju' ? { background: '#10b981', borderColor: '#10b981' } : {}}
                                onClick={submitVerifikasi}
                                disabled={verifying}
                            >
                                {verifying ? 'Memproses...' : verifikasiAksi === 'setuju' ? 'Ya, Setujui' : 'Ya, Tolak'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
