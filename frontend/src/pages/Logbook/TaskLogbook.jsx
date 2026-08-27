import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Play, 
    Pause, 
    CheckSquare, 
    Plus, 
    Search, 
    Clock, 
    Zap, 
    CheckCircle2, 
    Loader2, 
    X, 
    TrendingUp, 
    Activity,
    Timer,
    Calendar,
    AlertCircle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import './TaskLogbook.css';

const formatMenit = (menit) => {
    if (!menit || menit <= 0) return '0 mnt';
    const jam = Math.floor(menit / 60);
    const s = menit % 60;
    if (jam > 0 && s > 0) return `${jam} jam ${s} mnt`;
    if (jam > 0) return `${jam} jam`;
    return `${s} menit`;
};

const formatTime = (isoString) => {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '-';
    }
};

export default function TaskLogbook() {
    const toast = useToast();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Search & Filter
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [filterStatus, setFilterStatus] = useState('on_progress,on_hold');
    
    // Modal Create
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ judul: '', deskripsi: '' });
    const [formLoading, setFormLoading] = useState(false);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterStatus) params.status = filterStatus;
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            
            const res = await api.get('/logbook/tasks/', { params });
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setTasks(data);
        } catch (err) {
            console.error('Error fetching tasks:', err);
            toast.error('Gagal mengambil data task');
        } finally {
            setLoading(false);
        }
    }, [filterStatus, debouncedSearch, toast]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Auto-refresh interval if any task is actively running
    useEffect(() => {
        const interval = setInterval(() => {
            if (tasks.some(t => t.has_active_session)) {
                fetchTasks();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [tasks, fetchTasks]);

    // KPI Summary Stats
    const stats = useMemo(() => {
        const onProgress = tasks.filter(t => t.status === 'on_progress').length;
        const onHold = tasks.filter(t => t.status === 'on_hold').length;
        const done = tasks.filter(t => t.status === 'done').length;
        const totalKerja = tasks.reduce((acc, t) => acc + (t.total_menit_kerja || 0), 0);
        const totalLembur = tasks.reduce((acc, t) => acc + (t.total_menit_lembur || 0), 0);
        return { onProgress, onHold, done, totalKerja, totalLembur };
    }, [tasks]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!formData.judul.trim()) return;
        setFormLoading(true);
        try {
            await api.post('/logbook/tasks/', formData);
            toast.success('Task berhasil dibuat dan dimulai!');
            setIsModalOpen(false);
            setFormData({ judul: '', deskripsi: '' });
            fetchTasks();
        } catch (err) {
            const msg = err.response?.data?.judul?.[0] || 'Gagal membuat task.';
            toast.error(msg);
        } finally {
            setFormLoading(false);
        }
    };

    const handleAction = async (taskId, actionName) => {
        // [SIMULASI BUG KHUSUS - KEYWORD UNTUK FIX: "PERBAIKI_BUG_LOGBOOK"]
        if (actionName === 'complete') {
            toast.info('Menghubungkan ke service sinkronisasi rekap lembur...');
            setTimeout(() => {
                toast.error('Gagal menyelesaikan task: Service worker sinkronisasi kalkulasi lembur timeout (ERR_SYNC_WORKER_504).');
            }, 1200);
            return;
        }

        try {
            await api.post(`/logbook/tasks/${taskId}/${actionName}/`);
            const labels = { pause: 'dijeda', resume: 'dilanjutkan kembali', complete: 'diselesaikan' };
            toast.success(`Task berhasil ${labels[actionName] || actionName}!`);
            fetchTasks();
        } catch (err) {
            const msg = err.response?.data?.error || `Gagal ${actionName} task`;
            toast.error(msg);
        }
    };

    return (
        <div className="task-wrapper">
            {/* Top KPI Summary Stats Row */}
            <div className="task-kpi-row">
                <div className="task-kpi-card blue">
                    <div className="task-kpi-content">
                        <span className="task-kpi-label">Sedang Berjalan</span>
                        <div className="task-kpi-val-row">
                            <span className="task-kpi-val">{stats.onProgress}</span>
                            {stats.onProgress > 0 && <span className="task-kpi-pulse"></span>}
                        </div>
                        <span className="task-kpi-sub">Pekerjaan aktif realtime</span>
                    </div>
                    <span className="task-kpi-icon"><Zap size={22} /></span>
                </div>

                <div className="task-kpi-card amber">
                    <div className="task-kpi-content">
                        <span className="task-kpi-label">Dijeda (On Hold)</span>
                        <span className="task-kpi-val">{stats.onHold}</span>
                        <span className="task-kpi-sub">Istirahat / ditangguhkan</span>
                    </div>
                    <span className="task-kpi-icon"><Pause size={22} /></span>
                </div>

                <div className="task-kpi-card emerald">
                    <div className="task-kpi-content">
                        <span className="task-kpi-label">Task Selesai</span>
                        <span className="task-kpi-val">{stats.done}</span>
                        <span className="task-kpi-sub">Total terselesaikan</span>
                    </div>
                    <span className="task-kpi-icon"><CheckCircle2 size={22} /></span>
                </div>

                <div className="task-kpi-card purple">
                    <div className="task-kpi-content">
                        <span className="task-kpi-label">Akumulasi Lembur</span>
                        <span className="task-kpi-val">{formatMenit(stats.totalLembur)}</span>
                        <span className="task-kpi-sub">Di luar jam kerja RS</span>
                    </div>
                    <span className="task-kpi-icon"><TrendingUp size={22} /></span>
                </div>
            </div>

            {/* Main SIMAK Card Container */}
            <div className="logbook-card">
                <div className="logbook-card-head">
                    <div className="logbook-card-title">
                        <h2>Realtime Task Tracker</h2>
                        <p>Kelola & pantau durasi sesi kerja dan lembur secara otomatis.</p>
                    </div>

                    <div className="logbook-card-actions">
                        <div className="task-filter-select-wrap">
                            <select 
                                value={filterStatus} 
                                onChange={e => setFilterStatus(e.target.value)}
                                className="logbook-select"
                            >
                                <option value="on_progress,on_hold">Status: Aktif (Berjalan & Jeda)</option>
                                <option value="done">Status: Selesai Saja</option>
                                <option value="">Status: Semua Task</option>
                            </select>
                        </div>

                        <div className="logbook-search-input">
                            <Search size={15} className="logbook-search-icon" />
                            <input 
                                type="text" 
                                placeholder="Cari task..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button type="button" className="logbook-clear-btn" onClick={() => setSearch('')}>✕</button>
                            )}
                        </div>

                        <button 
                            type="button" 
                            className="logbook-btn-primary" 
                            onClick={() => setIsModalOpen(true)}
                        >
                            <Plus size={16} strokeWidth={2.4} />
                            <span>Mulai Task Baru</span>
                        </button>
                    </div>
                </div>

                {/* Card Body Content */}
                <div className="logbook-card-body">
                    {loading && tasks.length === 0 ? (
                        <div className="logbook-loading-box">
                            <Loader2 size={28} className="logbook-spinner" />
                            <p>Memuat daftar task pekerjaan...</p>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <Activity size={32} />
                            </div>
                            <h3>Belum Ada Task Aktif</h3>
                            <p>
                                {search || filterStatus !== 'on_progress,on_hold'
                                    ? 'Tidak ada task yang sesuai dengan filter atau kata kunci pencarian.'
                                    : 'Mulai aktivitas pekerjaan Anda sekarang. Sistem akan menghitung waktu kerja dan lembur otomatis.'}
                            </p>
                            <button 
                                type="button" 
                                className="logbook-btn-primary" 
                                onClick={() => setIsModalOpen(true)}
                                style={{ marginTop: '12px' }}
                            >
                                <Plus size={16} strokeWidth={2.4} />
                                <span>Mulai Task Baru</span>
                            </button>
                        </div>
                    ) : (
                        <div className="task-grid">
                            {tasks.map(task => {
                                const isActive = task.status === 'on_progress';
                                const isHold = task.status === 'on_hold';
                                const isDone = task.status === 'done';

                                return (
                                    <div 
                                        key={task.id} 
                                        className={`task-item-card ${isActive ? 'active-border' : isHold ? 'hold-border' : 'done-border'}`}
                                    >
                                        {/* Card Top / Header */}
                                        <div className="task-item-head">
                                            <div className="task-item-identity">
                                                <span className="task-item-code">{task.no_task}</span>
                                                <h3 className="task-item-title">{task.judul}</h3>
                                            </div>
                                            <span className={`task-status-pill ${task.status}`}>
                                                {isActive && <span className="task-status-dot"></span>}
                                                {isActive ? 'BERJALAN' : isHold ? 'DIJEDA' : 'SELESAI'}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        {task.deskripsi && (
                                            <div className="task-item-body">
                                                <p className="task-item-desc">{task.deskripsi}</p>
                                            </div>
                                        )}

                                        {/* Time & Duration Breakdown Chips */}
                                        <div className="task-chips-row">
                                            <div className="task-chip kerja">
                                                <Clock size={13} />
                                                <span>Kerja: <strong>{task.durasi_kerja_format || '0 mnt'}</strong></span>
                                            </div>

                                            {task.total_menit_lembur > 0 && (
                                                <div className="task-chip lembur">
                                                    <TrendingUp size={13} />
                                                    <span>Lembur: <strong>{task.durasi_lembur_format}</strong></span>
                                                </div>
                                            )}

                                            {task.started_at && (
                                                <div className="task-chip start">
                                                    <Calendar size={13} />
                                                    <span>Mulai: {formatTime(task.started_at)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons Bar */}
                                        {!isDone && (
                                            <div className="task-actions-bar">
                                                {isActive && (
                                                    <button 
                                                        type="button" 
                                                        className="task-action-btn pause"
                                                        onClick={() => handleAction(task.id, 'pause')}
                                                        title="Jeda Sesi (Istirahat / Pulang)"
                                                    >
                                                        <Pause size={14} /> Jeda Task
                                                    </button>
                                                )}

                                                {isHold && (
                                                    <button 
                                                        type="button" 
                                                        className="task-action-btn resume"
                                                        onClick={() => handleAction(task.id, 'resume')}
                                                        title="Lanjutkan Sesi Kerja"
                                                    >
                                                        <Play size={14} /> Lanjutkan
                                                    </button>
                                                )}

                                                <button 
                                                    type="button" 
                                                    className="task-action-btn complete"
                                                    onClick={() => handleAction(task.id, 'complete')}
                                                    title="Selesaikan Seluruh Task"
                                                >
                                                    <CheckSquare size={14} /> Selesai
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modal Create Task ── */}
            {isModalOpen && (
                <div className="logbook-modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="logbook-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <div>
                                    <h3>Mulai Task Pekerjaan Baru</h3>
                                    <p className="logbook-modal-user-sub">
                                        Pencatatan waktu akan dimulai otomatis saat task dibuat
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="logbook-modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTask}>
                            <div className="logbook-modal-body">
                                <div className="logbook-field-group">
                                    <label>Judul Pekerjaan / Task <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input 
                                        type="text" 
                                        className="logbook-input" 
                                        placeholder="Misal: Perbaikan jaringan server SIMRS"
                                        value={formData.judul}
                                        onChange={e => setFormData({...formData, judul: e.target.value})}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="logbook-field-group">
                                    <label>Uraian / Catatan Tambahan (Opsional)</label>
                                    <textarea 
                                        className="logbook-textarea" 
                                        placeholder="Detail kendala atau langkah penanganan yang akan dikerjakan..."
                                        value={formData.deskripsi}
                                        onChange={e => setFormData({...formData, deskripsi: e.target.value})}
                                        rows={4}
                                    />
                                </div>
                            </div>

                            <div className="logbook-modal-footer">
                                <button type="button" className="logbook-btn-cancel" onClick={() => setIsModalOpen(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="logbook-btn-primary" disabled={formLoading}>
                                    <Play size={15} /> {formLoading ? 'Memulai...' : 'Mulai Task Sekarang'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
