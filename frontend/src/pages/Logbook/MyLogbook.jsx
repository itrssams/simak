import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ClipboardList,
    Plus,
    Calendar,
    Clock,
    Search,
    Download,
    Trash2,
    Edit3,
    CheckCircle2,
    Users,
    Building2,
    RefreshCw,
    X,
    Filter,
    Timer,
    Sparkles,
    CalendarDays,
    Briefcase,
    TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axiosConfig';
import DateField from '../../components/DateField';
import DateRangePicker from '../../components/DateRangePicker';
import './MyLogbook.css';

const getTodayString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatWaktu = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
};

const formatTanggalIndo = (dateStr) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
};

export default function MyLogbook() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');

    const isDirekturUp = Boolean(
        user?.is_superuser || ['direktur', 'wakil_direktur'].includes(user?.role)
    );

    // Mode ditentukan dari query params di topbar menu
    const isMonitoringView = isDirekturUp && tabParam === 'monitoring';

    // ── Toast Notification ──────────────────────────────────────────
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };

    // ══════════════════════════════════════════════════════════════════
    // VIEW 1: LOGBOOK SAYA (PERSONAL LOGBOOK)
    // ══════════════════════════════════════════════════════════════════
    const [myLogbooks, setMyLogbooks] = useState([]);
    const [loadingMy, setLoadingMy] = useState(false);
    const [myFilterDate, setMyFilterDate] = useState(getTodayString());
    const [mySearch, setMySearch] = useState('');

    // Modal Form State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        tanggal: getTodayString(),
        jam_mulai: '08:00',
        jam_selesai: '10:00',
        deskripsi: '',
    });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Delete Confirmation State
    const [deleteModal, setDeleteModal] = useState({ open: false, item: null });
    const [deleting, setDeleting] = useState(false);

    const fetchMyLogbooks = useCallback(async () => {
        setLoadingMy(true);
        try {
            const params = {};
            if (myFilterDate) params.tanggal = myFilterDate;
            if (mySearch.trim()) params.q = mySearch.trim();

            const res = await api.get('/logbook/', { params });
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setMyLogbooks(data);
        } catch (err) {
            console.error('Failed to fetch my logbooks:', err);
            showToast('Gagal memuat daftar logbook Anda.', 'error');
        } finally {
            setLoadingMy(false);
        }
    }, [myFilterDate, mySearch]);

    useEffect(() => {
        if (!isMonitoringView) {
            fetchMyLogbooks();
        }
    }, [isMonitoringView, fetchMyLogbooks]);

    // Live calculated duration for form
    const calculatedFormDuration = useMemo(() => {
        if (!formData.jam_mulai || !formData.jam_selesai) return '';
        const [h1, m1] = formData.jam_mulai.split(':').map(Number);
        const [h2, m2] = formData.jam_selesai.split(':').map(Number);
        if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return '';

        let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diffMins < 0) diffMins += 24 * 60; // Cross midnight
        if (diffMins === 0) return '0 menit';

        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (hours > 0 && mins > 0) return `${hours} jam ${mins} menit`;
        if (hours > 0) return `${hours} jam`;
        return `${mins} menit`;
    }, [formData.jam_mulai, formData.jam_selesai]);

    const openCreateModal = () => {
        setEditingItem(null);
        setFormData({
            tanggal: myFilterDate || getTodayString(),
            jam_mulai: '08:00',
            jam_selesai: '09:00',
            deskripsi: '',
        });
        setFormError('');
        setModalOpen(true);
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setFormData({
            tanggal: item.tanggal,
            jam_mulai: formatWaktu(item.jam_mulai),
            jam_selesai: formatWaktu(item.jam_selesai),
            deskripsi: item.deskripsi,
        });
        setFormError('');
        setModalOpen(true);
    };

    const handleSaveLogbook = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!formData.deskripsi.trim()) {
            setFormError('Uraian / deskripsi pekerjaan wajib diisi.');
            return;
        }

        if (formData.jam_mulai === formData.jam_selesai) {
            setFormError('Jam selesai tidak boleh sama persis dengan jam mulai.');
            return;
        }

        setSaving(true);
        try {
            if (editingItem) {
                await api.put(`/logbook/${editingItem.id}/`, formData);
                showToast('Catatan pekerjaan berhasil diperbarui.');
            } else {
                await api.post('/logbook/', formData);
                showToast('Catatan pekerjaan baru berhasil ditambahkan.');
            }
            setModalOpen(false);
            fetchMyLogbooks();
        } catch (err) {
            console.error('Error saving logbook:', err);
            const msg = err.response?.data?.deskripsi?.[0] ||
                        err.response?.data?.jam_selesai?.[0] ||
                        err.response?.data?.detail ||
                        'Gagal menyimpan logbook. Silakan coba lagi.';
            setFormError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteLogbook = async () => {
        if (!deleteModal.item) return;
        setDeleting(true);
        try {
            await api.delete(`/logbook/${deleteModal.item.id}/`);
            showToast('Catatan pekerjaan berhasil dihapus.');
            setDeleteModal({ open: false, item: null });
            fetchMyLogbooks();
        } catch (err) {
            console.error('Error deleting logbook:', err);
            showToast('Gagal menghapus logbook.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    // My Logbook Stats for selected date
    const myStats = useMemo(() => {
        const totalEntries = myLogbooks.length;
        const totalMinutes = myLogbooks.reduce((acc, item) => acc + (item.durasi_menit || 0), 0);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const formattedTotal = hours > 0 ? `${hours} jam ${mins} menit` : `${mins} menit`;

        return { totalEntries, totalMinutes, formattedTotal };
    }, [myLogbooks]);

    // ══════════════════════════════════════════════════════════════════
    // VIEW 2: MONITORING KARYAWAN (DIREKSI VIEW)
    // ══════════════════════════════════════════════════════════════════
    const [monitorLogbooks, setMonitorLogbooks] = useState([]);
    const [loadingMonitor, setLoadingMonitor] = useState(false);
    const [summaryStats, setSummaryStats] = useState(null);
    const [unitList, setUnitList] = useState([]);
    const [userList, setUserList] = useState([]);

    // Filter Monitoring
    const [monStartDate, setMonStartDate] = useState(getTodayString());
    const [monEndDate, setMonEndDate] = useState(getTodayString());
    const [monUnitId, setMonUnitId] = useState('');
    const [monUserId, setMonUserId] = useState('');
    const [monSearch, setMonSearch] = useState('');

    // Fetch Units & Users for dropdowns
    useEffect(() => {
        if (isDirekturUp && isMonitoringView) {
            api.get('/users/units/').then(res => {
                const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setUnitList(list);
            }).catch(() => {});

            api.get('/users/', { params: { page_size: 200 } }).then(res => {
                const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setUserList(list);
            }).catch(() => {});
        }
    }, [isDirekturUp, isMonitoringView]);

    const fetchMonitoringSummary = useCallback(async () => {
        if (!isDirekturUp) return;
        try {
            const res = await api.get('/logbook/monitoring_summary/');
            setSummaryStats(res.data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
        }
    }, [isDirekturUp]);

    const fetchMonitoringData = useCallback(async () => {
        if (!isDirekturUp) return;
        setLoadingMonitor(true);
        try {
            const params = {};
            if (monStartDate) params.start_date = monStartDate;
            if (monEndDate) params.end_date = monEndDate;
            if (monUnitId) params.unit_id = monUnitId;
            if (monUserId) params.user_id = monUserId;
            if (monSearch.trim()) params.q = monSearch.trim();

            const res = await api.get('/logbook/', { params });
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setMonitorLogbooks(data);
        } catch (err) {
            console.error('Failed to fetch monitoring data:', err);
            showToast('Gagal memuat data monitoring karyawan.', 'error');
        } finally {
            setLoadingMonitor(false);
        }
    }, [isDirekturUp, monStartDate, monEndDate, monUnitId, monUserId, monSearch]);

    useEffect(() => {
        if (isMonitoringView) {
            fetchMonitoringData();
            fetchMonitoringSummary();
        }
    }, [isMonitoringView, fetchMonitoringData, fetchMonitoringSummary]);

    const handleExportExcel = () => {
        const params = new URLSearchParams();
        if (monStartDate) params.append('start_date', monStartDate);
        if (monEndDate) params.append('end_date', monEndDate);
        if (monUnitId) params.append('unit_id', monUnitId);
        if (monUserId) params.append('user_id', monUserId);
        if (monSearch.trim()) params.append('q', monSearch.trim());

        const downloadUrl = `/api/logbook/export_excel/?${params.toString()}`;
        window.open(downloadUrl, '_blank');
        showToast('Mengunduh rekap Excel logbook...', 'success');
    };

    const handleResetMonitoringFilter = () => {
        setMonStartDate(getTodayString());
        setMonEndDate(getTodayString());
        setMonUnitId('');
        setMonUserId('');
        setMonSearch('');
    };

    return (
        <div className="logbook-page">
            {/* Toast Notification */}
            {toast.show && (
                <div className={`logbook-toast ${toast.type}`}>
                    {toast.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* VIEW 1: LOGBOOK SAYA                                               */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {!isMonitoringView && (
                <div className="logbook-content-section">
                    {/* Header Banner */}
                    <div className="logbook-header-banner">
                        <div className="logbook-banner-left">
                            <div className="logbook-banner-icon">
                                <ClipboardList size={26} color="#38bdf8" />
                            </div>
                            <div>
                                <h1 className="logbook-banner-title">Logbook Saya</h1>
                                <p className="logbook-banner-sub">
                                    Pencatatan aktivitas pekerjaan & akumulasi jam kerja harian Anda
                                </p>
                            </div>
                        </div>

                        <div className="logbook-banner-right">
                            <button className="logbook-hero-add-btn" onClick={openCreateModal}>
                                <Plus size={17} strokeWidth={2.4} />
                                <span>Tambah Pekerjaan</span>
                            </button>
                        </div>
                    </div>

                    {/* Stats & Date Filter Bar */}
                    <div className="logbook-control-card">
                        <div className="logbook-date-selector">
                            <div className="logbook-date-label">
                                <CalendarDays size={18} className="logbook-cal-icon" />
                                <div>
                                    <span className="logbook-date-heading">
                                        {formatTanggalIndo(myFilterDate || getTodayString())}
                                    </span>
                                    <div className="logbook-date-stats">
                                        Total Tercatat: <strong>{myStats.totalEntries} pekerjaan</strong> ({myStats.formattedTotal})
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Date Filter & Search toolbar on the right */}
                        <div className="logbook-filter-toolbar">
                            <div className="logbook-date-picker-group">
                                <DateField
                                    value={myFilterDate}
                                    onChange={(val) => setMyFilterDate(val || getTodayString())}
                                    placeholder="Pilih Tanggal"
                                />
                                {myFilterDate !== getTodayString() && (
                                    <button
                                        className="logbook-pill-today"
                                        onClick={() => setMyFilterDate(getTodayString())}
                                        title="Kembali ke Hari Ini"
                                    >
                                        Hari Ini
                                    </button>
                                )}
                            </div>

                            <div className="logbook-search-bar">
                                <Search size={15} className="logbook-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Cari uraian pekerjaan..."
                                    value={mySearch}
                                    onChange={(e) => setMySearch(e.target.value)}
                                />
                                {mySearch && (
                                    <button className="logbook-clear-btn" onClick={() => setMySearch('')}>✕</button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Logbook Items Timeline / List */}
                    {loadingMy ? (
                        <div className="logbook-loading-box">
                            <RefreshCw size={26} className="logbook-spinner" />
                            <p>Memuat catatan pekerjaan...</p>
                        </div>
                    ) : myLogbooks.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <Timer size={36} />
                            </div>
                            <h3>Belum Ada Catatan Pekerjaan</h3>
                            <p>
                                {mySearch
                                    ? `Tidak ditemukan pekerjaan yang cocok dengan "${mySearch}".`
                                    : 'Anda belum mencatat aktivitas pekerjaan untuk tanggal ini. Klik tombol di bawah untuk mulai mengisi.'}
                            </p>
                            <button className="logbook-hero-add-btn" onClick={openCreateModal}>
                                <Plus size={16} /> Catat Pekerjaan Sekarang
                            </button>
                        </div>
                    ) : (
                        <div className="logbook-list-grid">
                            {myLogbooks.map((item, idx) => (
                                <div key={item.id} className="logbook-item-card">
                                    <div className="logbook-item-header">
                                        <div className="logbook-item-time-pill">
                                            <Clock size={14} />
                                            <span>
                                                {formatWaktu(item.jam_mulai)} – {formatWaktu(item.jam_selesai)}
                                            </span>
                                        </div>
                                        <span className="logbook-item-durasi-badge">
                                            {item.durasi_format}
                                        </span>
                                        <div className="logbook-item-actions">
                                            <button
                                                className="logbook-icon-btn edit"
                                                onClick={() => openEditModal(item)}
                                                title="Edit pekerjaan"
                                            >
                                                <Edit3 size={15} />
                                            </button>
                                            <button
                                                className="logbook-icon-btn delete"
                                                onClick={() => setDeleteModal({ open: true, item })}
                                                title="Hapus pekerjaan"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="logbook-item-body">
                                        <p className="logbook-item-text">{item.deskripsi}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* VIEW 2: MONITORING KARYAWAN (DIREKSI ONLY)                          */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {isMonitoringView && (
                <div className="logbook-content-section">
                    {/* Header Banner */}
                    <div className="logbook-header-banner">
                        <div className="logbook-banner-left">
                            <div className="logbook-banner-icon monitoring">
                                <Users size={26} color="#38bdf8" />
                            </div>
                            <div>
                                <h1 className="logbook-banner-title">Monitoring Logbook Karyawan</h1>
                                <p className="logbook-banner-sub">
                                    Pemantauan dan rekap aktivitas harian seluruh staf rumah sakit
                                </p>
                            </div>
                        </div>

                        <div className="logbook-banner-right">
                            <button className="logbook-btn-refresh" onClick={() => { fetchMonitoringData(); fetchMonitoringSummary(); }} title="Segarkan Data">
                                <RefreshCw size={15} />
                                <span>Segarkan</span>
                            </button>
                            <button className="logbook-btn-export" onClick={handleExportExcel}>
                                <Download size={15} />
                                <span>Export Excel</span>
                            </button>
                        </div>
                    </div>

                    {/* Executive KPI Summary Cards */}
                    {summaryStats && (
                        <div className="logbook-kpi-container">
                            <div className="logbook-kpi-tile blue">
                                <div className="logbook-kpi-icon-wrap">
                                    <ClipboardList size={22} />
                                </div>
                                <div className="logbook-kpi-meta">
                                    <span className="logbook-kpi-number">{summaryStats.today_total_entries}</span>
                                    <span className="logbook-kpi-title">Total Kegiatan Hari Ini</span>
                                </div>
                            </div>

                            <div className="logbook-kpi-tile emerald">
                                <div className="logbook-kpi-icon-wrap">
                                    <Users size={22} />
                                </div>
                                <div className="logbook-kpi-meta">
                                    <span className="logbook-kpi-number">{summaryStats.today_active_users}</span>
                                    <span className="logbook-kpi-title">Staf Mengisi Hari Ini</span>
                                </div>
                            </div>

                            <div className="logbook-kpi-tile purple">
                                <div className="logbook-kpi-icon-wrap">
                                    <Clock size={22} />
                                </div>
                                <div className="logbook-kpi-meta">
                                    <span className="logbook-kpi-number">{summaryStats.today_durasi_format}</span>
                                    <span className="logbook-kpi-title">Total Jam Kerja Terakumulasi</span>
                                </div>
                            </div>

                            <div className="logbook-kpi-tile amber">
                                <div className="logbook-kpi-icon-wrap">
                                    <TrendingUp size={22} />
                                </div>
                                <div className="logbook-kpi-meta">
                                    <span className="logbook-kpi-number">{summaryStats.month_total_entries}</span>
                                    <span className="logbook-kpi-title">Total Kegiatan Bulan Ini</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filter Panel */}
                    <div className="logbook-filter-container">
                        <div className="logbook-filter-fields">
                            <div className="logbook-filter-item">
                                <label>Periode Tanggal</label>
                                <DateRangePicker
                                    dari={monStartDate}
                                    sampai={monEndDate}
                                    onChange={({ dari, sampai }) => {
                                        setMonStartDate(dari);
                                        setMonEndDate(sampai);
                                    }}
                                    placeholder="Pilih Periode"
                                />
                            </div>

                            <div className="logbook-filter-item">
                                <label>Unit / Bagian</label>
                                <select
                                    value={monUnitId}
                                    onChange={(e) => setMonUnitId(e.target.value)}
                                    className="logbook-form-control-sm"
                                >
                                    <option value="">Semua Unit</option>
                                    {unitList.map(u => (
                                        <option key={u.id} value={u.id}>{u.nama}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="logbook-filter-item">
                                <label>Nama Pegawai</label>
                                <select
                                    value={monUserId}
                                    onChange={(e) => setMonUserId(e.target.value)}
                                    className="logbook-form-control-sm"
                                >
                                    <option value="">Semua Pegawai</option>
                                    {userList.map(u => {
                                        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                                        return (
                                            <option key={u.id} value={u.id}>
                                                {name} ({u.unit_nama || 'Tanpa Unit'})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        <div className="logbook-filter-bottom">
                            <div className="logbook-search-bar flex-1">
                                <Search size={14} className="logbook-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Cari kata kunci deskripsi atau nama staf..."
                                    value={monSearch}
                                    onChange={(e) => setMonSearch(e.target.value)}
                                />
                                {monSearch && (
                                    <button className="logbook-clear-btn" onClick={() => setMonSearch('')}>✕</button>
                                )}
                            </div>

                            <button className="logbook-btn-reset" onClick={handleResetMonitoringFilter} title="Kembalikan Filter Default">
                                Reset Filter
                            </button>
                        </div>
                    </div>

                    {/* Monitoring Data Table */}
                    <div className="logbook-table-card">
                        {loadingMonitor ? (
                            <div className="logbook-loading-box">
                                <RefreshCw size={26} className="logbook-spinner" />
                                <p>Memuat data monitoring pegawai...</p>
                            </div>
                        ) : monitorLogbooks.length === 0 ? (
                            <div className="logbook-empty-box">
                                <div className="logbook-empty-icon-wrap">
                                    <Filter size={32} />
                                </div>
                                <h3>Tidak Ada Data Logbook</h3>
                                <p>Tidak ditemukan catatan logbook sesuai filter yang Anda terapkan.</p>
                            </div>
                        ) : (
                            <div className="logbook-table-wrapper">
                                <table className="logbook-data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                                            <th style={{ width: '115px' }}>Tanggal</th>
                                            <th style={{ width: '135px' }}>Jam & Durasi</th>
                                            <th style={{ width: '210px' }}>Pegawai</th>
                                            <th style={{ width: '160px' }}>Unit / Bagian</th>
                                            <th>Uraian / Deskripsi Pekerjaan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monitorLogbooks.map((item, idx) => (
                                            <tr key={item.id}>
                                                <td style={{ textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                                                <td>
                                                    <span className="logbook-table-date">
                                                        {item.tanggal}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="logbook-table-time-cell">
                                                        <strong>{formatWaktu(item.jam_mulai)} – {formatWaktu(item.jam_selesai)}</strong>
                                                        <span className="logbook-table-duration">{item.durasi_format}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="logbook-emp-cell">
                                                        <div className="logbook-emp-avatar">
                                                            {item.user_nama?.[0]?.toUpperCase() || 'U'}
                                                        </div>
                                                        <div>
                                                            <div className="logbook-emp-name">{item.user_nama}</div>
                                                            <div className="logbook-emp-role">{item.user_role_label || item.user_role}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="logbook-unit-tag">
                                                        <Building2 size={12} /> {item.unit_nama || '-'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="logbook-table-desc">
                                                        {item.deskripsi}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* MODAL FORM TAMBAH / EDIT LOGBOOK                                   */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {modalOpen && (
                <div className="logbook-modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <ClipboardList size={20} color="#38bdf8" />
                                <h3>{editingItem ? 'Edit Catatan Pekerjaan' : 'Catat Pekerjaan Baru'}</h3>
                            </div>
                            <button className="logbook-modal-close-btn" onClick={() => setModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveLogbook} className="logbook-modal-body">
                            {formError && (
                                <div className="logbook-form-alert">
                                    <X size={15} />
                                    <span>{formError}</span>
                                </div>
                            )}

                            <div className="logbook-field-group">
                                <label>Tanggal Pekerjaan *</label>
                                <DateField
                                    value={formData.tanggal}
                                    onChange={(val) => setFormData({ ...formData, tanggal: val || getTodayString() })}
                                    placeholder="Pilih Tanggal"
                                />
                            </div>

                            <div className="logbook-field-row">
                                <div className="logbook-field-group flex-1">
                                    <label>Jam Mulai *</label>
                                    <input
                                        type="time"
                                        value={formData.jam_mulai}
                                        onChange={(e) => setFormData({ ...formData, jam_mulai: e.target.value })}
                                        required
                                        className="logbook-input"
                                    />
                                </div>

                                <div className="logbook-field-group flex-1">
                                    <label>Jam Selesai *</label>
                                    <input
                                        type="time"
                                        value={formData.jam_selesai}
                                        onChange={(e) => setFormData({ ...formData, jam_selesai: e.target.value })}
                                        required
                                        className="logbook-input"
                                    />
                                </div>
                            </div>

                            {calculatedFormDuration && (
                                <div className="logbook-duration-indicator">
                                    <Clock size={13} />
                                    <span>Durasi Terhitung: <strong>{calculatedFormDuration}</strong></span>
                                </div>
                            )}

                            <div className="logbook-field-group">
                                <label>Uraian / Deskripsi Pekerjaan *</label>
                                <textarea
                                    rows={4}
                                    placeholder="Tuliskan pekerjaan yang telah Anda selesaikan..."
                                    value={formData.deskripsi}
                                    onChange={(e) => setFormData({ ...formData, deskripsi: e.target.value })}
                                    required
                                    className="logbook-textarea"
                                />
                            </div>

                            <div className="logbook-modal-footer">
                                <button
                                    type="button"
                                    className="logbook-btn-cancel"
                                    onClick={() => setModalOpen(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="logbook-btn-submit"
                                    disabled={saving}
                                >
                                    {saving ? 'Menyimpan...' : (editingItem ? 'Simpan Perubahan' : 'Catat Pekerjaan')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* MODAL KONFIRMASI HAPUS                                             */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {deleteModal.open && (
                <div className="logbook-modal-overlay" onClick={() => setDeleteModal({ open: false, item: null })}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <Trash2 size={19} color="#ef4444" />
                                <h3>Hapus Catatan Pekerjaan</h3>
                            </div>
                            <button className="logbook-modal-close-btn" onClick={() => setDeleteModal({ open: false, item: null })}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="logbook-delete-body">
                            <p>
                                Apakah Anda yakin ingin menghapus catatan pekerjaan ini? Tindakan ini tidak dapat dibatalkan.
                            </p>
                            {deleteModal.item && (
                                <div className="logbook-delete-item-preview">
                                    <small>{formatWaktu(deleteModal.item.jam_mulai)} – {formatWaktu(deleteModal.item.jam_selesai)}</small>
                                    <div>{deleteModal.item.deskripsi}</div>
                                </div>
                            )}
                        </div>

                        <div className="logbook-modal-footer">
                            <button
                                type="button"
                                className="logbook-btn-cancel"
                                onClick={() => setDeleteModal({ open: false, item: null })}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="logbook-btn-danger"
                                onClick={handleDeleteLogbook}
                                disabled={deleting}
                            >
                                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
