import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    AlertCircle,
    Trash2,
    Layers,
    History,
    FileText
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import './MyLogbook.css';
import './TaskLogbook.css';

const formatMenit = (menit) => {
    if (!menit || menit <= 0) return '0 mnt';
    const jam = Math.floor(menit / 60);
    const s = menit % 60;
    if (jam > 0 && s > 0) return `${jam} jam ${s} mnt`;
    if (jam > 0) return `${jam} jam`;
    return `${s} menit`;
};

const formatTimeOnly = (isoString) => {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    } catch {
        return '-';
    }
};

const formatDateTimeDetail = (isoString) => {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).replace('.', ':') + ' WIB';
    } catch {
        return '-';
    }
};

const formatStopwatch = (totalSec) => {
    if (!totalSec || totalSec <= 0) return '00:00:00';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export default function TaskLogbook() {
    const toast = useToast();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [nowTime, setNowTime] = useState(Date.now());
    
    // Search & Filter
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [filterStatus, setFilterStatus] = useState('pending,on_progress,on_hold');
    
    // Uraian Tugas (Jobdesc) Options
    const [uraianTugasOpts, setUraianTugasOpts] = useState([]);

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
        fetchUraianTugasOpts();
    }, [fetchUraianTugasOpts]);

    // Modal Create
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ uraian_tugas_id: '', judul: '', deskripsi: '' });
    const [formLoading, setFormLoading] = useState(false);

    const selectedUraianTugas = useMemo(() => {
        if (!formData.uraian_tugas_id || formData.uraian_tugas_id === 'lainnya') return null;
        return uraianTugasOpts.find(opt => String(opt.id) === String(formData.uraian_tugas_id));
    }, [formData.uraian_tugas_id, uraianTugasOpts]);

    // Modal Finish Task
    const [taskToFinish, setTaskToFinish] = useState(null);
    const [finishForm, setFinishForm] = useState({
        uraian_tugas_id: '',
        judul: '',
        deskripsi: '',
        nilai_output: 0,
        satuan_output: ''
    });
    const [finishingTask, setFinishingTask] = useState(false);

    const selectedFinishUraianTugas = useMemo(() => {
        if (!finishForm.uraian_tugas_id || finishForm.uraian_tugas_id === 'lainnya') return null;
        return uraianTugasOpts.find(opt => String(opt.id) === String(finishForm.uraian_tugas_id));
    }, [finishForm.uraian_tugas_id, uraianTugasOpts]);

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

    // Realtime 1-second interval ticker for running tasks
    useEffect(() => {
        const hasActive = tasks.some(t => t.status === 'on_progress' || t.has_active_session);
        if (!hasActive) return;

        const timer = setInterval(() => {
            setNowTime(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, [tasks]);

    // Background auto-refresh every 30 seconds for active tasks
    useEffect(() => {
        const interval = setInterval(() => {
            if (tasks.some(t => t.has_active_session)) {
                fetchTasks();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [tasks, fetchTasks]);

    // Compute duration in seconds for a task
    const getTaskDurationSeconds = (task, nowTimestamp) => {
        if (task.status === 'pending') return 0;

        if (task.sesi_list && task.sesi_list.length > 0) {
            let totalSec = 0;
            task.sesi_list.forEach(s => {
                if (s.mulai) {
                    const start = new Date(s.mulai).getTime();
                    if (s.selesai) {
                        const end = new Date(s.selesai).getTime();
                        totalSec += Math.max(0, Math.floor((end - start) / 1000));
                    } else {
                        totalSec += Math.max(0, Math.floor((nowTimestamp - start) / 1000));
                    }
                }
            });
            return totalSec;
        }

        return ((task.total_menit_kerja || 0) + (task.total_menit_lembur || 0)) * 60;
    };

    // KPI Summary Stats
    const stats = useMemo(() => {
        const pending = tasks.filter(t => t.status === 'pending').length;
        const onProgress = tasks.filter(t => t.status === 'on_progress').length;
        const onHold = tasks.filter(t => t.status === 'on_hold').length;
        const done = tasks.filter(t => t.status === 'done').length;
        const totalKerja = tasks.reduce((acc, t) => acc + (t.total_menit_kerja || 0), 0);
        const totalLembur = tasks.reduce((acc, t) => acc + (t.total_menit_lembur || 0), 0);
        return { pending, onProgress, onHold, done, totalKerja, totalLembur };
    }, [tasks]);

    const handleCreateTask = async (e, autoStart = true) => {
        if (e && e.preventDefault) e.preventDefault();

        if (!formData.uraian_tugas_id) {
            toast.error('Uraian tugas wajib dipilih');
            return;
        }

        if (formData.uraian_tugas_id === 'lainnya' && !formData.judul.trim()) {
            toast.error('Nama aktivitas / judul task wajib diisi jika memilih "Lainnya"');
            return;
        }

        const finalJudul = formData.judul.trim() || (selectedUraianTugas ? selectedUraianTugas.deskripsi.slice(0, 200) : '');
        if (!finalJudul) {
            toast.error('Judul task wajib diisi');
            return;
        }

        setFormLoading(true);
        try {
            const payload = {
                uraian_tugas_id: formData.uraian_tugas_id === 'lainnya' || !formData.uraian_tugas_id ? null : parseInt(formData.uraian_tugas_id),
                judul: finalJudul,
                deskripsi: formData.deskripsi.trim(),
                auto_start: autoStart
            };
            await api.post('/logbook/tasks/', payload);
            if (autoStart) {
                toast.success('Task berhasil dibuat dan dimulai!');
            } else {
                toast.success('Rencana task disimpan (Siap Mulai).');
            }
            setIsModalOpen(false);
            setFormData({ uraian_tugas_id: '', judul: '', deskripsi: '' });
            fetchTasks();
        } catch (err) {
            const msg = err.response?.data?.judul?.[0] || err.response?.data?.uraian_tugas_id?.[0] || 'Gagal membuat task.';
            toast.error(msg);
        } finally {
            setFormLoading(false);
        }
    };

    const handleAction = async (taskId, actionName) => {
        try {
            await api.post(`/logbook/tasks/${taskId}/${actionName}/`);
            const labels = { start: 'dimulai', pause: 'dijeda', resume: 'dilanjutkan kembali', complete: 'diselesaikan' };
            toast.success(`Task berhasil ${labels[actionName] || actionName}!`);
            fetchTasks();
        } catch (err) {
            const msg = err.response?.data?.error || `Gagal ${actionName} task`;
            toast.error(msg);
        }
    };

    const handleDeleteTask = async (task) => {
        const isDone = task.status === 'done';
        const confirmMsg = isDone 
            ? `Hapus task "${task.judul}"?\n\nPerhatian: Catatan aktivitas terkait di riwayat Logbook juga akan ikut dihapus.`
            : `Hapus task "${task.judul}"? Tindakan ini tidak dapat dibatalkan.`;
        if (!window.confirm(confirmMsg)) return;

        try {
            await api.delete(`/logbook/tasks/${task.id}/`);
            toast.success('Task berhasil dihapus');
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error('Gagal menghapus task');
        }
    };

    const handleOpenFinishModal = (task) => {
        setTaskToFinish(task);
        setFinishForm({
            uraian_tugas_id: task.uraian_tugas_id ? String(task.uraian_tugas_id) : (task.uraian_tugas_text ? '' : 'lainnya'),
            judul: task.judul || '',
            deskripsi: task.deskripsi || '',
            nilai_output: task.nilai_output || 0,
            satuan_output: task.satuan_output || ''
        });
    };

    const handleCompleteTask = async (e) => {
        e.preventDefault();
        if (!taskToFinish) return;

        if (finishForm.uraian_tugas_id === 'lainnya' && !finishForm.judul.trim()) {
            toast.error('Judul aktivitas wajib diisi jika memilih "Lainnya"');
            return;
        }

        setFinishingTask(true);
        try {
            const payload = {
                uraian_tugas_id: finishForm.uraian_tugas_id === 'lainnya' || !finishForm.uraian_tugas_id ? null : parseInt(finishForm.uraian_tugas_id),
                judul: finishForm.judul.trim() || (selectedFinishUraianTugas ? selectedFinishUraianTugas.deskripsi.slice(0, 200) : taskToFinish.judul),
                deskripsi: finishForm.deskripsi.trim(),
                nilai_output: parseInt(finishForm.nilai_output) || 0,
                satuan_output: finishForm.satuan_output.trim()
            };
            await api.post(`/logbook/tasks/${taskToFinish.id}/complete/`, payload);
            toast.success('Task selesai dan otomatis dicatat ke riwayat Logbook!');
            setTaskToFinish(null);
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error('Gagal menyelesaikan task');
        } finally {
            setFinishingTask(false);
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
                                <option value="pending,on_progress,on_hold">Status: Aktif (Siap, Berjalan & Jeda)</option>
                                <option value="pending">Status: Siap Mulai Saja</option>
                                <option value="on_progress,on_hold">Status: Sedang Berjalan & Jeda</option>
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
                                const isPending = task.status === 'pending';
                                const isActive = task.status === 'on_progress';
                                const isHold = task.status === 'on_hold';
                                const isDone = task.status === 'done';
                                const isOwner = task.is_owner !== undefined ? task.is_owner : true;
                                const elapsedSec = getTaskDurationSeconds(task, nowTime);

                                return (
                                    <div 
                                        key={task.id} 
                                        className={`task-item-card ${isPending ? 'pending-border' : isActive ? 'active-border' : isHold ? 'hold-border' : 'done-border'}`}
                                    >
                                        {/* Card Top / Header */}
                                        <div className="task-item-head">
                                            <div className="task-item-identity">
                                                <div className="task-meta-row">
                                                    <span className="task-item-code">{task.no_task}</span>
                                                    <span className={`task-status-pill ${task.status}`}>
                                                        {isActive && <span className="task-status-dot"></span>}
                                                        {isPending ? 'SIAP MULAI' : isActive ? 'SEDANG BERJALAN' : isHold ? 'DIJEDA' : 'SELESAI'}
                                                    </span>
                                                    {!isOwner && task.user_nama && (
                                                        <span className="task-user-badge">{task.user_nama}</span>
                                                    )}
                                                </div>
                                                <h3 className="task-item-title">{task.judul}</h3>
                                                {task.uraian_tugas_text ? (
                                                    <div className="task-item-jobdesc-preview" title={`Uraian Tugas: ${task.uraian_tugas_text}`}>
                                                        <FileText size={12} className="task-jobdesc-icon" />
                                                        <span>{task.uraian_tugas_text}</span>
                                                    </div>
                                                ) : (
                                                    <div className="task-item-jobdesc-preview other" title="Di luar uraian tugas">
                                                        <FileText size={12} className="task-jobdesc-icon" />
                                                        <span>Lainnya (Di luar uraian tugas)</span>
                                                    </div>
                                                )}
                                            </div>
                                            {isOwner && (
                                                <button 
                                                    type="button" 
                                                    className="task-delete-top-btn" 
                                                    onClick={() => handleDeleteTask(task)}
                                                    title="Hapus Task"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Description & Output Target */}
                                        {(task.deskripsi || (task.nilai_output > 0 && task.satuan_output)) && (
                                            <div className="task-item-body">
                                                {task.deskripsi && <p className="task-item-desc">{task.deskripsi}</p>}
                                                {task.nilai_output > 0 && task.satuan_output && (
                                                    <div className="task-output-badge">
                                                        <span>Target Output: <strong>{task.nilai_output} {task.satuan_output}</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Real-time Digital Stopwatch Box */}
                                        <div className={`task-timer-block ${task.status}`}>
                                            <div className="task-timer-top">
                                                <span className="task-timer-label">
                                                    {isActive ? 'STOPWATCH AKTIF' : isHold ? 'STOPWATCH DIJEDA' : isPending ? 'STOPWATCH' : 'TOTAL WAKTU KERJA'}
                                                </span>
                                                {isActive && (
                                                    <span className="task-live-badge">
                                                        <span className="task-live-ping"></span>
                                                        LIVE
                                                    </span>
                                                )}
                                            </div>
                                            <div className="task-timer-time">
                                                <Timer size={22} className="task-timer-icon" />
                                                <span className="task-timer-digits">{formatStopwatch(elapsedSec)}</span>
                                            </div>
                                        </div>

                                        {/* Detailed Time Breakdown Grid */}
                                        <div className="task-time-details-grid">
                                            <div className="task-time-cell">
                                                <span className="time-cell-label"><Clock size={12} /> Waktu Mulai</span>
                                                <span className="time-cell-val">
                                                    {task.started_at ? formatDateTimeDetail(task.started_at) : 'Belum dimulai'}
                                                </span>
                                            </div>
                                            <div className="task-time-cell">
                                                <span className="time-cell-label"><Calendar size={12} /> Waktu Selesai</span>
                                                <span className="time-cell-val">
                                                    {task.completed_at 
                                                        ? formatDateTimeDetail(task.completed_at) 
                                                        : isActive 
                                                            ? 'Sedang Berjalan...' 
                                                            : isHold 
                                                                ? 'Dijeda sementara' 
                                                                : '—'}
                                                </span>
                                            </div>
                                            <div className="task-time-cell">
                                                <span className="time-cell-label"><Layers size={12} /> Kerja Reguler</span>
                                                <span className="time-cell-val blue-text">
                                                    {task.durasi_kerja_format || '0 mnt'}
                                                </span>
                                            </div>
                                            <div className="task-time-cell">
                                                <span className="time-cell-label"><TrendingUp size={12} /> Jam Lembur</span>
                                                <span className={`time-cell-val ${task.total_menit_lembur > 0 ? 'purple-badge' : ''}`}>
                                                    {task.total_menit_lembur > 0 ? `${task.durasi_lembur_format} (Lembur)` : '0 mnt'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Buttons Bar */}
                                        <div className="task-actions-bar">
                                            {!isOwner ? (
                                                <span className="task-readonly-owner-pill">
                                                    Milik: <strong>{task.user_nama || 'Pegawai Lain'}</strong> (Hanya Pantau)
                                                </span>
                                            ) : (
                                                <>
                                                    <button 
                                                        type="button" 
                                                        className="task-action-btn delete"
                                                        onClick={() => handleDeleteTask(task)}
                                                        title={isDone ? 'Hapus task dan riwayat Logbook terkait' : 'Hapus task'}
                                                    >
                                                        <Trash2 size={14} /> Hapus
                                                    </button>

                                                    {isPending && (
                                                        <button 
                                                            type="button" 
                                                            className="task-action-btn start"
                                                            onClick={() => handleAction(task.id, 'start')}
                                                            title="Mulai Stopwatch Sekarang"
                                                        >
                                                            <Play size={14} fill="currentColor" /> Mulai Sekarang
                                                        </button>
                                                    )}

                                                    {isActive && (
                                                        <>
                                                            <button 
                                                                type="button" 
                                                                className="task-action-btn pause"
                                                                onClick={() => handleAction(task.id, 'pause')}
                                                                title="Jeda Sesi (Istirahat / Pulang)"
                                                            >
                                                                <Pause size={14} /> Jeda Task
                                                            </button>
                                                            <button 
                                                                type="button" 
                                                                className="task-action-btn complete"
                                                                onClick={() => handleOpenFinishModal(task)}
                                                                title="Selesaikan & Simpan ke Logbook"
                                                            >
                                                                <CheckSquare size={14} /> Selesai
                                                            </button>
                                                        </>
                                                    )}

                                                    {isHold && (
                                                        <>
                                                            <button 
                                                                type="button" 
                                                                className="task-action-btn resume"
                                                                onClick={() => handleAction(task.id, 'resume')}
                                                                title="Lanjutkan Sesi Kerja"
                                                            >
                                                                <Play size={14} /> Lanjutkan
                                                            </button>
                                                            <button 
                                                                type="button" 
                                                                className="task-action-btn complete"
                                                                onClick={() => handleOpenFinishModal(task)}
                                                                title="Selesaikan & Simpan ke Logbook"
                                                            >
                                                                <CheckSquare size={14} /> Selesai
                                                            </button>
                                                        </>
                                                    )}

                                                    {isDone && (
                                                        <span className="task-done-tag">
                                                            <CheckCircle2 size={14} /> Selesai & Tercatat
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modal Create Task ── */}
            {isModalOpen && createPortal(
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
                                    <label>Uraian Tugas <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select
                                        name="uraian_tugas_id"
                                        value={formData.uraian_tugas_id}
                                        onChange={e => setFormData({ ...formData, uraian_tugas_id: e.target.value })}
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

                                <div className="logbook-field-group">
                                    <label>
                                        Nama Aktivitas / Judul Task {formData.uraian_tugas_id === 'lainnya' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>(Opsional jika uraian tugas dipilih)</span>}
                                    </label>
                                    <input 
                                        type="text" 
                                        className="logbook-input" 
                                        placeholder={formData.uraian_tugas_id === 'lainnya' ? "Contoh: Rapat koordinasi lintas divisi" : "Contoh: Perbaikan jaringan server SIMRS (opsional)"}
                                        value={formData.judul}
                                        onChange={e => setFormData({...formData, judul: e.target.value})}
                                        required={formData.uraian_tugas_id === 'lainnya'}
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
                                <button 
                                    type="button" 
                                    className="logbook-btn-secondary" 
                                    disabled={formLoading}
                                    onClick={(e) => handleCreateTask(e, false)}
                                >
                                    <Clock size={15} /> Simpan Dulu
                                </button>
                                <button 
                                    type="button" 
                                    className="logbook-btn-primary" 
                                    disabled={formLoading}
                                    onClick={(e) => handleCreateTask(e, true)}
                                >
                                    <Play size={15} fill="currentColor" /> {formLoading ? 'Memulai...' : 'Mulai Sekarang'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Modal Selesai Task ── */}
            {taskToFinish && createPortal(
                <div className="logbook-modal-overlay" onClick={() => setTaskToFinish(null)}>
                    <div className="logbook-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <div className="logbook-modal-title-wrap">
                                <h3>Selesaikan Task & Simpan ke Logbook</h3>
                                <p className="logbook-modal-user-sub">
                                    Durasi kerja reguler & lembur otomatis tercatat ke riwayat Logbook harian
                                </p>
                            </div>
                            <button type="button" className="logbook-modal-close-btn" onClick={() => setTaskToFinish(null)}>
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleCompleteTask}>
                            <div className="logbook-modal-body">
                                <div className="logbook-finish-summary">
                                    <div className="logbook-finish-metric">
                                        <span className="logbook-finish-metric-label">Waktu Kerja Reguler</span>
                                        <span className="logbook-finish-metric-value" style={{ color: '#0284c7' }}>
                                            {taskToFinish.durasi_kerja_format || '0m'}
                                        </span>
                                    </div>
                                    <div className="logbook-finish-metric">
                                        <span className="logbook-finish-metric-label">Waktu Lembur</span>
                                        <span className="logbook-finish-metric-value" style={{ color: taskToFinish.total_menit_lembur > 0 ? '#b45309' : '#64748b' }}>
                                            {taskToFinish.durasi_lembur_format || '0m'}
                                        </span>
                                    </div>
                                </div>

                                <div className="logbook-field-group">
                                    <label>Uraian Tugas <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select
                                        name="uraian_tugas_id"
                                        value={finishForm.uraian_tugas_id}
                                        onChange={e => setFinishForm({ ...finishForm, uraian_tugas_id: e.target.value })}
                                        className="logbook-select"
                                        required
                                    >
                                        <option value="">Pilih Uraian Tugas...</option>
                                        {uraianTugasOpts.map(opt => (
                                            <option key={opt.id} value={String(opt.id)}>{opt.deskripsi}</option>
                                        ))}
                                        <option value="lainnya">Lainnya (Di luar uraian tugas)</option>
                                    </select>
                                    {selectedFinishUraianTugas && (
                                        <div className="logbook-jobdesc-preview">
                                            <FileText size={15} className="logbook-jobdesc-preview-icon" />
                                            <div className="logbook-jobdesc-preview-body">
                                                <span className="logbook-jobdesc-preview-label">Deskripsi Lengkap Uraian Tugas:</span>
                                                <p className="logbook-jobdesc-preview-text">{selectedFinishUraianTugas.deskripsi}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="logbook-field-group">
                                    <label>
                                        Judul Aktivitas {finishForm.uraian_tugas_id === 'lainnya' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 400 }}>(Opsional jika uraian tugas dipilih)</span>}
                                    </label>
                                    <input 
                                        type="text" 
                                        className="logbook-input" 
                                        value={finishForm.judul}
                                        onChange={e => setFinishForm({ ...finishForm, judul: e.target.value })}
                                        placeholder={finishForm.uraian_tugas_id === 'lainnya' ? "Contoh: Rapat koordinasi lintas divisi" : "Contoh: Perbaikan server SIMRS (opsional)"}
                                        required={finishForm.uraian_tugas_id === 'lainnya'}
                                    />
                                </div>

                                <div className="logbook-form-grid">
                                    <div className="logbook-field-group">
                                        <label>Capaian Output</label>
                                        <input 
                                            type="number" 
                                            className="logbook-input" 
                                            placeholder="0"
                                            min="0"
                                            value={finishForm.nilai_output}
                                            onChange={e => setFinishForm({ ...finishForm, nilai_output: e.target.value })}
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Satuan Output</label>
                                        <input 
                                            type="text" 
                                            className="logbook-input" 
                                            placeholder="dokumen, berkas, pasien"
                                            value={finishForm.satuan_output}
                                            onChange={e => setFinishForm({ ...finishForm, satuan_output: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="logbook-field-group">
                                    <label>Uraian / Hasil Pekerjaan (Opsional)</label>
                                    <textarea 
                                        className="logbook-textarea" 
                                        rows={3}
                                        placeholder="Catatan detail penanganan yang telah dilakukan..."
                                        value={finishForm.deskripsi}
                                        onChange={e => setFinishForm({ ...finishForm, deskripsi: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="logbook-modal-footer">
                                <button type="button" className="logbook-btn-cancel" onClick={() => setTaskToFinish(null)} disabled={finishingTask}>
                                    Batal
                                </button>
                                <button 
                                    type="submit" 
                                    className="logbook-btn-primary" 
                                    style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    disabled={finishingTask}
                                >
                                    <CheckSquare size={16} />
                                    {finishingTask ? 'Menyimpan...' : 'Selesaikan & Catat ke Logbook'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
