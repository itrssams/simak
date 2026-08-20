import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ClipboardList,
    Plus,
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
    CalendarDays,
    TrendingUp,
    Eye,
    ChevronRight,
    Briefcase,
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
        const [y, m, d] = dateStr.split('-');
        const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        return date.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
};

const formatTanggalShort = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-');
        const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        return date.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
};

export default function MyLogbook() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    // Check Role: Direktur or Wakil Direktur
    const isDirekturUp = useMemo(() => {
        if (!user) return false;
        if (user.is_superuser) return true;
        const r = (user.role || '').toLowerCase();
        return r === 'direktur' || r === 'wakil_direktur';
    }, [user]);

    // Read view from Topbar query param (?tab=monitoring)
    const isMonitoringView = isDirekturUp && searchParams.get('tab') === 'monitoring';

    // Toast Notification
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };

    // ══════════════════════════════════════════════════════════════════
    // VIEW 1: LOGBOOK SAYA (STAFF VIEW)
    // ══════════════════════════════════════════════════════════════════
    const [myLogbooks, setMyLogbooks] = useState([]);
    const [loadingMy, setLoadingMy] = useState(false);
    const [myFilterDate, setMyFilterDate] = useState(getTodayString());
    const [mySearch, setMySearch] = useState('');

    // Modal Form State (Create / Edit)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        tanggal: getTodayString(),
        jam_mulai: '',
        jam_selesai: '',
        deskripsi: '',
    });
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Modal Delete State
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Fetch My Logbook
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
            console.error('Error fetching logbooks:', err);
            showToast('Gagal memuat logbook.', 'error');
        } finally {
            setLoadingMy(false);
        }
    }, [myFilterDate, mySearch]);

    useEffect(() => {
        if (!isMonitoringView) {
            fetchMyLogbooks();
        }
    }, [fetchMyLogbooks, isMonitoringView]);

    const openCreateModal = () => {
        setEditingItem(null);
        setFormData({
            tanggal: myFilterDate || getTodayString(),
            jam_mulai: '',
            jam_selesai: '',
            deskripsi: '',
        });
        setFormError('');
        setIsModalOpen(true);
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setFormData({
            tanggal: item.tanggal,
            jam_mulai: formatWaktu(item.jam_mulai),
            jam_selesai: formatWaktu(item.jam_selesai),
            deskripsi: item.deskripsi || '',
        });
        setFormError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setFormError('');
    };

    const calculatedFormDuration = useMemo(() => {
        if (!formData.jam_mulai || !formData.jam_selesai) return null;
        try {
            const [h1, m1] = formData.jam_mulai.split(':').map(Number);
            const [h2, m2] = formData.jam_selesai.split(':').map(Number);
            let totalMins = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (totalMins <= 0) return 'Jam selesai harus lebih besar dari jam mulai';
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            if (hours > 0) {
                return `${hours} jam ${mins > 0 ? `${mins} menit` : ''}`;
            }
            return `${mins} menit`;
        } catch {
            return null;
        }
    }, [formData.jam_mulai, formData.jam_selesai]);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!formData.tanggal) return setFormError('Tanggal pekerjaan wajib diisi.');
        if (!formData.jam_mulai) return setFormError('Jam mulai wajib diisi.');
        if (!formData.jam_selesai) return setFormError('Jam selesai wajib diisi.');
        if (!formData.deskripsi.trim()) return setFormError('Deskripsi pekerjaan wajib diisi.');

        const [h1, m1] = formData.jam_mulai.split(':').map(Number);
        const [h2, m2] = formData.jam_selesai.split(':').map(Number);
        const totalMins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (totalMins <= 0) {
            return setFormError('Jam selesai harus lebih besar dari jam mulai.');
        }

        setSubmitting(true);
        try {
            const payload = {
                tanggal: formData.tanggal,
                jam_mulai: formData.jam_mulai.length === 5 ? `${formData.jam_mulai}:00` : formData.jam_mulai,
                jam_selesai: formData.jam_selesai.length === 5 ? `${formData.jam_selesai}:00` : formData.jam_selesai,
                deskripsi: formData.deskripsi.trim(),
            };

            if (editingItem) {
                await api.put(`/logbook/${editingItem.id}/`, payload);
                showToast('Catatan pekerjaan berhasil diperbarui.');
            } else {
                await api.post('/logbook/', payload);
                showToast('Catatan pekerjaan berhasil ditambahkan.');
            }
            closeModal();
            fetchMyLogbooks();
        } catch (err) {
            console.error('Error saving logbook:', err);
            const resErr = err.response?.data;
            const errMsg = resErr?.deskripsi?.[0] || resErr?.jam_selesai?.[0] || resErr?.non_field_errors?.[0] || resErr?.detail || 'Gagal menyimpan catatan pekerjaan.';
            setFormError(errMsg);
        } finally {
            setSubmitting(false);
        }
    };

    const openDeleteConfirm = (item) => {
        setDeleteItem(item);
    };

    const closeDeleteConfirm = () => {
        setDeleteItem(null);
    };

    const handleDeleteSubmit = async () => {
        if (!deleteItem) return;
        setDeleting(true);
        try {
            await api.delete(`/logbook/${deleteItem.id}/`);
            showToast('Catatan pekerjaan berhasil dihapus.');
            closeDeleteConfirm();
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

    // Detail Pop-up / Drawer for specific employee
    const [selectedUserDetail, setSelectedUserDetail] = useState(null);

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
            showToast('Gagal memuat monitoring logbook.', 'error');
        } finally {
            setLoadingMonitor(false);
        }
    }, [isDirekturUp, monStartDate, monEndDate, monUnitId, monUserId, monSearch]);

    useEffect(() => {
        if (isDirekturUp && isMonitoringView) {
            fetchMonitoringSummary();
            fetchMonitoringData();
        }
    }, [isDirekturUp, isMonitoringView, fetchMonitoringSummary, fetchMonitoringData]);

    // Grouping by Employee for the Monitoring Table
    const groupedUsers = useMemo(() => {
        const map = new Map();
        monitorLogbooks.forEach((item) => {
            const uid = item.user;
            if (!map.has(uid)) {
                map.set(uid, {
                    userId: uid,
                    userName: item.user_full_name || item.user_username,
                    userUsername: item.user_username,
                    userRole: item.user_role || 'Staff',
                    userUnit: item.user_unit_name || 'Tidak ada unit',
                    totalEntries: 0,
                    totalMinutes: 0,
                    lastDate: item.tanggal,
                    items: [],
                });
            }
            const u = map.get(uid);
            u.totalEntries += 1;
            u.totalMinutes += (item.durasi_menit || 0);
            u.items.push(item);
        });

        return Array.from(map.values()).map(u => {
            const hours = Math.floor(u.totalMinutes / 60);
            const mins = u.totalMinutes % 60;
            const durasiFormat = hours > 0 ? `${hours} jam ${mins > 0 ? `${mins} mnt` : ''}` : `${mins} menit`;
            const durasiShort = hours > 0 ? `${hours}j ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
            return {
                ...u,
                durasiFormat,
                durasiShort,
            };
        });
    }, [monitorLogbooks]);

    const handleResetMonitoringFilter = () => {
        setMonStartDate(getTodayString());
        setMonEndDate(getTodayString());
        setMonUnitId('');
        setMonUserId('');
        setMonSearch('');
    };

    const handleExportExcel = async () => {
        try {
            showToast('Menyiapkan file Excel...', 'success');
            const params = {};
            if (monStartDate) params.start_date = monStartDate;
            if (monEndDate) params.end_date = monEndDate;
            if (monUnitId) params.unit_id = monUnitId;
            if (monUserId) params.user_id = monUserId;
            if (monSearch.trim()) params.q = monSearch.trim();

            const res = await api.get('/logbook/export_excel/', {
                params,
                responseType: 'blob',
            });

            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Logbook_Karyawan_${monStartDate || 'all'}_to_${monEndDate || 'all'}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showToast('File Excel berhasil diunduh.', 'success');
        } catch (err) {
            console.error('Error downloading Excel:', err);
            showToast('Gagal mengunduh Excel.', 'error');
        }
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
                    {/* Standard SIMAK Hero Header */}
                    <div className="logbook-hero">
                        <div className="logbook-title">
                            <span><ClipboardList size={22} /></span>
                            <div>
                                <h1>Logbook Saya</h1>
                                <p>Pencatatan aktivitas pekerjaan &amp; akumulasi jam kerja harian Anda.</p>
                            </div>
                        </div>
                    </div>

                    {/* Main Card */}
                    <div className="logbook-card">
                        <div className="logbook-card-head">
                            <div className="logbook-card-title">
                                <h2>{formatTanggalIndo(myFilterDate || getTodayString())}</h2>
                                <p>Total Tercatat: <strong>{myStats.totalEntries} pekerjaan</strong> ({myStats.formattedTotal})</p>
                            </div>

                            <div className="logbook-card-actions">
                                <div className="logbook-date-wrap">
                                    <DateField
                                        value={myFilterDate}
                                        onChange={(val) => setMyFilterDate(val || getTodayString())}
                                        placeholder="Pilih Tanggal"
                                    />
                                    {myFilterDate !== getTodayString() && (
                                        <button
                                            type="button"
                                            className="logbook-btn-today"
                                            onClick={() => setMyFilterDate(getTodayString())}
                                            title="Kembali ke Hari Ini"
                                        >
                                            Hari Ini
                                        </button>
                                    )}
                                </div>

                                <div className="logbook-search-input">
                                    <Search size={15} className="logbook-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari uraian..."
                                        value={mySearch}
                                        onChange={(e) => setMySearch(e.target.value)}
                                    />
                                    {mySearch && (
                                        <button type="button" className="logbook-clear-btn" onClick={() => setMySearch('')}>✕</button>
                                    )}
                                </div>

                                <button type="button" className="logbook-btn-primary" onClick={openCreateModal}>
                                    <Plus size={16} strokeWidth={2.4} />
                                    <span>Tambah Pekerjaan</span>
                                </button>
                            </div>
                        </div>

                        {/* Card Body */}
                        <div className="logbook-card-body">
                            {loadingMy ? (
                                <div className="logbook-loading-box">
                                    <RefreshCw size={24} className="logbook-spinner" />
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
                                    <button type="button" className="logbook-btn-primary" onClick={openCreateModal}>
                                        <Plus size={15} /> Catat Pekerjaan Sekarang
                                    </button>
                                </div>
                            ) : (
                                <div className="logbook-timeline-list">
                                    {myLogbooks.map((item) => (
                                        <div key={item.id} className="logbook-item-card">
                                            <div className="logbook-item-header">
                                                <div className="logbook-item-time-pill">
                                                    <Clock size={13} />
                                                    <span>{formatWaktu(item.jam_mulai)} – {formatWaktu(item.jam_selesai)}</span>
                                                </div>
                                                <span className="logbook-item-durasi-badge">
                                                    ({item.durasi_format || `${item.durasi_menit} menit`})
                                                </span>
                                                <div className="logbook-item-actions">
                                                    <button
                                                        type="button"
                                                        className="logbook-icon-btn edit"
                                                        onClick={() => openEditModal(item)}
                                                        title="Edit Catatan"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="logbook-icon-btn delete"
                                                        onClick={() => openDeleteConfirm(item)}
                                                        title="Hapus Catatan"
                                                    >
                                                        <Trash2 size={14} />
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
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* VIEW 2: MONITORING KARYAWAN (DIREKSI VIEW)                          */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {isMonitoringView && (
                <div className="logbook-content-section">
                    {/* Standard SIMAK Hero Header */}
                    <div className="logbook-hero">
                        <div className="logbook-title">
                            <span><Users size={22} /></span>
                            <div>
                                <h1>Monitoring Logbook Karyawan</h1>
                                <p>Pantau catatan aktivitas harian seluruh karyawan dan akumulasi jam kerja.</p>
                            </div>
                        </div>
                    </div>

                    {/* Executive KPI Summary Cards */}
                    {summaryStats && (
                        <div className="logbook-summary-cards">
                            <div className="logbook-summary-card blue">
                                <div className="card-info">
                                    <span className="card-label">Total Kegiatan Hari Ini</span>
                                    <span className="card-value">{summaryStats.today_total_entries}</span>
                                    <span className="card-subtext">Aktivitas diinput pegawai</span>
                                </div>
                                <span className="card-icon"><ClipboardList size={22} /></span>
                            </div>

                            <div className="logbook-summary-card emerald">
                                <div className="card-info">
                                    <span className="card-label">Staf Mengisi Hari Ini</span>
                                    <span className="card-value">{summaryStats.today_active_users}</span>
                                    <span className="card-subtext">Pegawai aktif mencatat</span>
                                </div>
                                <span className="card-icon"><Users size={22} /></span>
                            </div>

                            <div className="logbook-summary-card amber">
                                <div className="card-info">
                                    <span className="card-label">Total Kegiatan Bulan Ini</span>
                                    <span className="card-value">{summaryStats.month_total_entries}</span>
                                    <span className="card-subtext">Akumulasi bulan berjalan</span>
                                </div>
                                <span className="card-icon"><TrendingUp size={22} /></span>
                            </div>
                        </div>
                    )}

                    {/* Monitoring Data Card (Daftar Karyawan) */}
                    <div className="logbook-card">
                        <div className="logbook-card-head">
                            <div className="logbook-card-title">
                                <h2>Daftar Aktivitas Karyawan</h2>
                                <p>Menampilkan {groupedUsers.length} karyawan aktif yang mencatat pekerjaan pada periode ini.</p>
                            </div>
                        </div>

                        {/* Filter Bar with Action Buttons */}
                        <div className="logbook-filter-bar">
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
                                    className="logbook-select"
                                >
                                    <option value="">Semua Unit</option>
                                    {unitList.map(u => (
                                        <option key={u.id} value={u.id}>{u.nama}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="logbook-filter-item flex-1">
                                <label>Pencarian</label>
                                <div className="logbook-search-input">
                                    <Search size={14} className="logbook-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari uraian atau nama pegawai..."
                                        value={monSearch}
                                        onChange={(e) => setMonSearch(e.target.value)}
                                    />
                                    {monSearch && (
                                        <button type="button" className="logbook-clear-btn" onClick={() => setMonSearch('')}>✕</button>
                                    )}
                                </div>
                            </div>

                            <div className="logbook-filter-item">
                                <button type="button" className="logbook-btn-reset" onClick={handleResetMonitoringFilter} title="Reset Filter">
                                    Reset
                                </button>
                            </div>

                            <div className="logbook-filter-item">
                                <button type="button" className="logbook-btn-secondary" onClick={() => { fetchMonitoringSummary(); fetchMonitoringData(); }} title="Segarkan Data">
                                    <RefreshCw size={14} className={loadingMonitor ? 'logbook-spinner' : ''} />
                                    <span>Segarkan</span>
                                </button>
                            </div>

                            <div className="logbook-filter-item">
                                <button type="button" className="logbook-btn-export" onClick={handleExportExcel} title="Export ke Excel">
                                    <Download size={14} />
                                    <span>Export Excel</span>
                                </button>
                            </div>
                        </div>

                        {/* Table (Grouped by Employee) */}
                        <div className="logbook-table-wrap">
                            {loadingMonitor ? (
                                <div className="logbook-loading-box">
                                    <RefreshCw size={26} className="logbook-spinner" />
                                    <p>Memuat rekap data monitoring...</p>
                                </div>
                            ) : groupedUsers.length === 0 ? (
                                <div className="logbook-empty-box">
                                    <div className="logbook-empty-icon-wrap">
                                        <Filter size={32} />
                                    </div>
                                    <h3>Tidak Ada Data Logbook Karyawan</h3>
                                    <p>Tidak ditemukan data catatan pekerjaan karyawan pada rentang tanggal atau filter yang dipilih.</p>
                                </div>
                            ) : (
                                <table className="logbook-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '60px' }}>No</th>
                                            <th>Nama Pegawai</th>
                                            <th style={{ width: '220px' }}>Unit / Bagian</th>
                                            <th style={{ width: '180px' }}>Jumlah Pekerjaan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedUsers.map((u, idx) => (
                                            <tr
                                                key={u.userId}
                                                className="logbook-clickable-row"
                                                onClick={() => setSelectedUserDetail(u)}
                                                title="Klik untuk melihat rincian aktivitas pekerjaan"
                                            >
                                                <td>
                                                    <span className="logbook-row-idx">{idx + 1}</span>
                                                </td>
                                                <td>
                                                    <div className="logbook-emp-cell">
                                                        <div className="logbook-emp-avatar">
                                                            {u.userName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="logbook-emp-name">{u.userName}</div>
                                                            <div className="logbook-emp-role">{u.userRole}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="logbook-unit-tag">
                                                        {u.userUnit}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="logbook-pill-count">
                                                        <strong>{u.totalEntries}</strong> Pekerjaan
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* MODAL: DETAIL AKTIVITAS PEGAWAI (DIREKSI VIEW)                      */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {selectedUserDetail && (
                <div className="logbook-modal-overlay" onClick={() => setSelectedUserDetail(null)}>
                    <div className="logbook-modal-card lg" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <div className="logbook-emp-avatar lg">
                                    {selectedUserDetail.userName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>{selectedUserDetail.userName}</h3>
                                    <p className="logbook-modal-user-sub">
                                        <span>{selectedUserDetail.userUnit} ({selectedUserDetail.userRole})</span>
                                        <span className="logbook-sub-dot">•</span>
                                        <span>Total: <strong>{selectedUserDetail.totalEntries} Pekerjaan</strong> ({selectedUserDetail.durasiFormat})</span>
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="logbook-modal-close-btn" onClick={() => setSelectedUserDetail(null)}>
                                <X size={17} />
                            </button>
                        </div>

                        <div className="logbook-modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                            <div className="logbook-timeline-list">
                                {selectedUserDetail.items.map((act) => (
                                    <div key={act.id} className="logbook-item-card">
                                        <div className="logbook-item-header">
                                            <div className="logbook-table-date">
                                                <CalendarDays size={13} />
                                                <span>{formatTanggalIndo(act.tanggal)}</span>
                                            </div>
                                            <div className="logbook-item-time-pill">
                                                <Clock size={12} />
                                                <span>{formatWaktu(act.jam_mulai)} – {formatWaktu(act.jam_selesai)}</span>
                                            </div>
                                            <span className="logbook-item-durasi-badge">
                                                ({act.durasi_format || `${act.durasi_menit} mnt`})
                                            </span>
                                        </div>
                                        <div className="logbook-item-body">
                                            <p className="logbook-item-text">{act.deskripsi}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="logbook-modal-footer">
                            <button
                                type="button"
                                className="logbook-btn-primary"
                                onClick={() => setSelectedUserDetail(null)}
                            >
                                Tutup Rincian
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* MODAL 1: TAMBAH / EDIT LOGBOOK                                      */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {isModalOpen && (
                <div className="logbook-modal-overlay" onClick={closeModal}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <h3>{editingItem ? 'Edit Catatan Pekerjaan' : 'Tambah Catatan Pekerjaan'}</h3>
                            </div>
                            <button type="button" className="logbook-modal-close-btn" onClick={closeModal}>
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit}>
                            <div className="logbook-modal-body">
                                {formError && (
                                    <div className="logbook-form-alert">
                                        <X size={15} />
                                        <span>{formError}</span>
                                    </div>
                                )}

                                <div className="logbook-modal-row-3">
                                    <div className="logbook-field-group">
                                        <label>Tanggal *</label>
                                        <DateField
                                            value={formData.tanggal}
                                            onChange={(val) => setFormData({ ...formData, tanggal: val || getTodayString() })}
                                            placeholder="Pilih Tanggal"
                                        />
                                    </div>

                                    <div className="logbook-field-group">
                                        <label>Jam Mulai *</label>
                                        <input
                                            type="time"
                                            value={formData.jam_mulai}
                                            onChange={(e) => setFormData({ ...formData, jam_mulai: e.target.value })}
                                            required
                                            className="logbook-input"
                                        />
                                    </div>

                                    <div className="logbook-field-group">
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
                                        placeholder="Tuliskan secara jelas pekerjaan apa yang Anda selesaikan..."
                                        value={formData.deskripsi}
                                        onChange={(e) => setFormData({ ...formData, deskripsi: e.target.value })}
                                        required
                                        className="logbook-textarea"
                                    />
                                </div>
                            </div>

                            <div className="logbook-modal-footer">
                                <button
                                    type="button"
                                    className="logbook-btn-cancel"
                                    onClick={closeModal}
                                    disabled={submitting}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="logbook-btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Simpan Pekerjaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* MODAL 2: KONFIRMASI HAPUS                                          */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {deleteItem && (
                <div className="logbook-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <h3>Hapus Catatan Pekerjaan</h3>
                            </div>
                            <button type="button" className="logbook-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={17} />
                            </button>
                        </div>

                        <div className="logbook-delete-body">
                            <p>Apakah Anda yakin ingin menghapus catatan pekerjaan ini?</p>
                            <div className="logbook-delete-item-preview">
                                <small>{formatTanggalShort(deleteItem.tanggal)} • {formatWaktu(deleteItem.jam_mulai)} - {formatWaktu(deleteItem.jam_selesai)}</small>
                                <div>"{deleteItem.deskripsi}"</div>
                            </div>
                        </div>

                        <div className="logbook-modal-footer">
                            <button
                                type="button"
                                className="logbook-btn-cancel"
                                onClick={closeDeleteConfirm}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="logbook-btn-danger"
                                onClick={handleDeleteSubmit}
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
