import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Users, 
    ClipboardList, 
    TrendingUp, 
    Search, 
    RefreshCw, 
    Download, 
    Filter, 
    CalendarDays, 
    Clock, 
    X,
    AlertCircle,
    CheckCircle2,
    XCircle,
    RotateCcw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import './MyLogbook.css';

const getTodayString = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatWaktu = (timeString) => {
    if (!timeString) return '-';
    return timeString.substring(0, 5);
};

const formatTanggalIndo = (dateStr) => {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateStr;
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
        <span className={`status-badge ${colorClass}`} style={{ zoom: 0.85 }}>
            <Icon size={14} /> {statusLabel || status}
        </span>
    );
};

export default function LogbookLaporan() {
    const { user } = useAuth();
    const toast = useToast();
    
    const [monitoringLevel, setMonitoringLevel] = useState(null);
    const [summaryStats, setSummaryStats] = useState(null);
    const [monitorLogbooks, setMonitorLogbooks] = useState([]);
    const [loadingMonitor, setLoadingMonitor] = useState(false);

    // Filters
    const [monStartDate, setMonStartDate] = useState(getTodayString());
    const [monEndDate, setMonEndDate] = useState(getTodayString());
    const [monUnitId, setMonUnitId] = useState('');
    const [monUserId, setMonUserId] = useState('');
    const [monStatus, setMonStatus] = useState('all');
    const [monSearch, setMonSearch] = useState('');
    const debouncedMonSearch = useDebounce(monSearch, 500);

    const [unitList, setUnitList] = useState([]);
    const [selectedUserDetail, setSelectedUserDetail] = useState(null);

    // Determine monitoring level
    useEffect(() => {
        const level = (() => {
            if (user?.is_superuser || ['direktur', 'wakil_direktur'].includes(user?.role)) return 'all';
            if (['manajer', 'kepala_seksi'].includes(user?.role)) return 'unit';
            return null;
        })();
        setMonitoringLevel(level);

        if (level === 'all') {
            api.get('/users/units/').then(res => {
                const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
                setUnitList(list);
            }).catch(() => {});
        }
    }, [user]);

    const fetchMonitoringSummary = useCallback(async () => {
        if (monitoringLevel === null) return;
        try {
            const res = await api.get('/logbook/monitoring_summary/');
            setSummaryStats(res.data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
        }
    }, [monitoringLevel]);

    const fetchMonitoringData = useCallback(async () => {
        if (monitoringLevel === null) return;
        setLoadingMonitor(true);
        try {
            const params = {};
            if (monStartDate) params.start_date = monStartDate;
            if (monEndDate) params.end_date = monEndDate;
            if (monUnitId) params.unit_id = monUnitId;
            if (monUserId) params.user_id = monUserId;
            if (monStatus !== 'all') params.status = monStatus;
            if (debouncedMonSearch.trim()) params.q = debouncedMonSearch.trim();

            const res = await api.get('/logbook/', { params });
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setMonitorLogbooks(data);
        } catch (err) {
            console.error('Failed to fetch monitoring data:', err);
            toast.error('Gagal memuat monitoring logbook.');
        } finally {
            setLoadingMonitor(false);
        }
    }, [monitoringLevel, monStartDate, monEndDate, monUnitId, monUserId, monStatus, debouncedMonSearch, toast]);

    useEffect(() => {
        if (monitoringLevel !== null) {
            fetchMonitoringSummary();
            fetchMonitoringData();
        }
    }, [monitoringLevel, fetchMonitoringSummary, fetchMonitoringData]);

    const handleResetFilter = () => {
        setMonStartDate(getTodayString());
        setMonEndDate(getTodayString());
        setMonUnitId('');
        setMonUserId('');
        setMonStatus('all');
        setMonSearch('');
    };

    const groupedUsers = useMemo(() => {
        const map = new Map();
        monitorLogbooks.forEach((item) => {
            const uid = item.user_id;
            if (!map.has(uid)) {
                map.set(uid, {
                    userId: uid,
                    userName: item.user_nama || item.user_username,
                    userUsername: item.user_username,
                    userRole: item.user_role_label || item.user_role || 'Staff',
                    userUnit: item.unit_nama || 'Tidak ada unit',
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

    const handleExportExcel = async () => {
        try {
            toast.info('Menyiapkan file Excel...');
            const params = {};
            if (monStartDate) params.start_date = monStartDate;
            if (monEndDate) params.end_date = monEndDate;
            if (monUnitId) params.unit_id = monUnitId;
            if (monUserId) params.user_id = monUserId;
            if (monStatus !== 'all') params.status = monStatus;
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
            toast.success('File Excel berhasil diunduh.');
        } catch (err) {
            console.error('Error downloading Excel:', err);
            toast.error('Gagal mengunduh Excel.');
        }
    };

    if (monitoringLevel === null) {
        return (
            <div className="logbook-page">
                <div className="logbook-empty-box" style={{ padding: '60px 20px' }}>
                    <div className="logbook-empty-icon-wrap">
                        <AlertCircle size={36} color="#ef4444" />
                    </div>
                    <h3>Akses Ditolak</h3>
                    <p>Anda tidak memiliki akses otorisasi ke halaman Laporan & Monitoring Logbook.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="logbook-page">
            <div className="logbook-hero">
                <div className="logbook-title">
                    <span><Users size={22} /></span>
                    <div>
                        <h1>{monitoringLevel === 'all' ? 'Laporan & Monitoring Karyawan' : 'Laporan Unit Saya'}</h1>
                        <p>Pantau rekapitulasi catatan aktivitas harian bawahan, akumulasi jam kerja, dan ekspor laporan Excel.</p>
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
                            <span className="card-subtext">Aktivitas diinput staf</span>
                        </div>
                        <span className="card-icon"><ClipboardList size={22} /></span>
                    </div>

                    <div className="logbook-summary-card emerald">
                        <div className="card-info">
                            <span className="card-label">Disetujui Bulan Ini</span>
                            <span className="card-value">{summaryStats.month_disetujui}</span>
                            <span className="card-subtext">Total aktivitas terverifikasi</span>
                        </div>
                        <span className="card-icon"><CheckCircle2 size={22} /></span>
                    </div>

                    <div className="logbook-summary-card amber">
                        <div className="card-info">
                            <span className="card-label">Perlu Verifikasi (Bulan Ini)</span>
                            <span className="card-value">{summaryStats.month_perlu_verifikasi}</span>
                            <span className="card-subtext">Menunggu validasi atasan</span>
                        </div>
                        <span className="card-icon"><AlertCircle size={22} /></span>
                    </div>
                </div>
            )}

            <div className="logbook-card">
                {/* Filter Bar with SIMAK Standards */}
                <div className="logbook-filter-bar">
                    <div className="logbook-filter-item">
                        <label>Mulai Tanggal</label>
                        <input
                            type="date"
                            value={monStartDate}
                            onChange={(e) => setMonStartDate(e.target.value)}
                            className="logbook-filter-date"
                        />
                    </div>
                    <div className="logbook-filter-item">
                        <label>Sampai Tanggal</label>
                        <input
                            type="date"
                            value={monEndDate}
                            onChange={(e) => setMonEndDate(e.target.value)}
                            className="logbook-filter-date"
                        />
                    </div>

                    {monitoringLevel === 'all' && (
                        <div className="logbook-filter-item">
                            <label>Unit / Divisi</label>
                            <select
                                value={monUnitId}
                                onChange={(e) => setMonUnitId(e.target.value)}
                                className="logbook-filter-select"
                            >
                                <option value="">Semua Unit</option>
                                {unitList.map(u => (
                                    <option key={u.id} value={u.id}>{u.nama}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    <div className="logbook-filter-item">
                        <label>Status</label>
                        <select
                            value={monStatus}
                            onChange={(e) => setMonStatus(e.target.value)}
                            className="logbook-filter-select"
                        >
                            <option value="all">Semua Status</option>
                            <option value="perlu_verifikasi">Perlu Verifikasi</option>
                            <option value="disetujui">Disetujui</option>
                            <option value="ditolak">Ditolak</option>
                        </select>
                    </div>

                    <div className="logbook-filter-item flex-1">
                        <label>Pencarian</label>
                        <div className="logbook-search-wrap" style={{ maxWidth: '100%' }}>
                            <Search size={16} className="logbook-search-icon" />
                            <input
                                type="text"
                                placeholder="Cari nama pegawai..."
                                value={monSearch}
                                onChange={(e) => setMonSearch(e.target.value)}
                                className="logbook-search-input"
                            />
                            {monSearch && (
                                <button type="button" className="logbook-search-clear" onClick={() => setMonSearch('')} title="Reset pencarian">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="logbook-filter-item" style={{ flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
                        <button 
                            type="button" 
                            className="logbook-btn-secondary" 
                            onClick={handleResetFilter} 
                            title="Reset Filter"
                        >
                            <RotateCcw size={14} />
                            <span>Reset</span>
                        </button>
                        <button 
                            type="button" 
                            className="logbook-btn-secondary" 
                            onClick={() => { fetchMonitoringSummary(); fetchMonitoringData(); }} 
                            title="Segarkan Data"
                        >
                            <RefreshCw size={14} className={loadingMonitor ? 'logbook-spinner' : ''} />
                            <span>Segarkan</span>
                        </button>
                        <button 
                            type="button" 
                            className="logbook-btn-export" 
                            onClick={handleExportExcel} 
                            title="Unduh Rekap Excel"
                        >
                            <Download size={15} />
                            <span>Export Excel</span>
                        </button>
                    </div>
                </div>

                <div className="logbook-table-wrap">
                    {loadingMonitor ? (
                        <div className="logbook-loading-box">
                            <RefreshCw size={26} className="logbook-spinner" />
                            <p>Memuat rekap data laporan...</p>
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
                                    <th style={{ width: '56px', textAlign: 'center' }}>No</th>
                                    <th>Nama Pegawai</th>
                                    <th style={{ width: '220px' }}>Unit / Bagian</th>
                                    <th style={{ width: '180px' }}>Total Aktivitas</th>
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
                                        <td style={{ textAlign: 'center' }}>
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
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                                                Durasi: <strong>{u.durasiShort}</strong>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
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
                                            <div style={{ marginLeft: 'auto' }}>
                                                <StatusBadge status={act.status} statusLabel={act.status_label} />
                                            </div>
                                        </div>
                                        <div className="logbook-item-body">
                                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                                {act.uraian_tugas_text || 'Lainnya'} {act.nama_aktivitas ? `- ${act.nama_aktivitas}` : ''}
                                            </div>
                                            <p className="logbook-item-text">{act.deskripsi}</p>
                                            {act.nilai_output > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '6px', fontWeight: 600 }}>
                                                    Target Capaian Output: {act.nilai_output} {act.satuan_output}
                                                </div>
                                            )}
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
        </div>
    );
}
