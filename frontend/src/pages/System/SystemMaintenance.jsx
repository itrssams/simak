import { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck,
    Database,
    HardDrive,
    Server,
    Download,
    Trash2,
    RefreshCw,
    Wrench,
    CheckCircle2,
    AlertCircle,
    Cpu,
    FileSpreadsheet,
    Sparkles,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import './SystemMaintenance.css';

const errorMessage = (err, fallback) => err?.response?.data?.detail || err?.response?.data?.error || fallback;

export default function SystemMaintenance() {
    const toast = useToast();
    const [healthData, setHealthData] = useState(null);
    const [backups, setBackups] = useState([]);
    const [loadingHealth, setLoadingHealth] = useState(true);
    const [loadingBackups, setLoadingBackups] = useState(true);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [targetDb, setTargetDb] = useState('simak');

    const fetchHealth = useCallback(async () => {
        setLoadingHealth(true);
        try {
            const res = await api.get('/system/maintenance/health/');
            setHealthData(res.data);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat status sistem server.'));
        } finally {
            setLoadingHealth(false);
        }
    }, []);

    const fetchBackups = useCallback(async () => {
        setLoadingBackups(true);
        try {
            const res = await api.get('/system/maintenance/backups/');
            setBackups(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat daftar backup database.'));
        } finally {
            setLoadingBackups(false);
        }
    }, []);

    useEffect(() => {
        fetchHealth();
        fetchBackups();
    }, [fetchHealth, fetchBackups]);

    const handleCreateBackup = async () => {
        setCreatingBackup(true);
        toast.info(`Sedang membuat backup database ${targetDb.toUpperCase()}...`);
        try {
            const res = await api.post('/system/maintenance/create-backup/', { database: targetDb });
            toast.success(res.data.message || 'Backup database berhasil dibuat!');
            await fetchBackups();
            await fetchHealth();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membuat backup database.'));
        } finally {
            setCreatingBackup(false);
        }
    };

    const handleDownloadBackup = async (filename) => {
        try {
            const response = await api.get('/system/maintenance/download-backup/', {
                params: { filename },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Mengunduh ${filename}...`);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengunduh file backup.'));
        }
    };

    const handleDeleteBackup = async (filename) => {
        if (!window.confirm(`HAPUS BACKUP DATABASE:\n\nApakah Anda yakin ingin menghapus file backup '${filename}'?\n\nFile ini akan dihapus secara permanen dari server.`)) return;

        try {
            const res = await api.post('/system/maintenance/delete-backup/', { filename });
            toast.success(res.data.message || 'File backup berhasil dihapus.');
            await fetchBackups();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menghapus file backup.'));
        }
    };

    const handleOptimizeTables = async () => {
        if (!window.confirm('OPTIMASI TABEL DATABASE:\n\nApakah Anda yakin ingin mengoptimasi seluruh tabel database SIMAK?\n\nProses ini akan merapikan indeks dan mengklaim kembali sisa disk space terbuang.')) return;

        setOptimizing(true);
        toast.info('Memproses OPTIMIZE TABLE untuk seluruh tabel database...');
        try {
            const res = await api.post('/system/maintenance/optimize-tables/');
            toast.success(res.data.message || 'Optimasi tabel database berhasil!');
            await fetchHealth();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mengoptimasi tabel database.'));
        } finally {
            setOptimizing(false);
        }
    };

    const disk = healthData?.disk_space || {};
    const sysInfo = healthData?.system_info || {};

    return (
        <div className="sysm-page">
            {/* Hero Header */}
            <div className="sysm-hero">
                <div className="sysm-title">
                    <span className="sysm-title-icon">
                        <ShieldCheck size={28} />
                    </span>
                    <div>
                        <h1>Manajemen Sistem &amp; Maintenance</h1>
                        <p>Khusus Superuser / Admin Sistem — Monitoring Performa, Backup Database &amp; Maintenance Engine</p>
                    </div>
                </div>
                <div className="sysm-hero-actions">
                    <button className="sysm-btn soft" type="button" onClick={() => { fetchHealth(); fetchBackups(); }} disabled={loadingHealth || loadingBackups}>
                        <RefreshCw size={15} className={loadingHealth || loadingBackups ? 'sysm-spin' : ''} /> Refresh Status
                    </button>
                </div>
            </div>

            {/* Health & Performance Metrics Grid */}
            <div className="sysm-stats-grid">
                <div className="sysm-stat-card">
                    <div className="sysm-stat-icon ok">
                        <Database size={22} />
                    </div>
                    <div className="sysm-stat-info">
                        <span className="sysm-stat-label">Database SIMAK (App DB)</span>
                        <div className="sysm-stat-value ok">
                            {healthData?.simak_status === 'online' ? (
                                <span className="sysm-badge online"><span className="dot"></span> ONLINE</span>
                            ) : (
                                <span className="sysm-badge offline"><AlertCircle size={13} /> {healthData?.simak_status || 'Checking...'}</span>
                            )}
                        </div>
                        <small className="sysm-stat-desc">MySQL {sysInfo.mysql_version || '-'}</small>
                    </div>
                </div>

                <div className="sysm-stat-card">
                    <div className="sysm-stat-icon info">
                        <Server size={22} />
                    </div>
                    <div className="sysm-stat-info">
                        <span className="sysm-stat-label">Database RSSAMS (Legacy ERP)</span>
                        <div className="sysm-stat-value info">
                            {healthData?.rssams_status === 'online' ? (
                                <span className="sysm-badge online blue"><span className="dot blue"></span> ONLINE</span>
                            ) : (
                                <span className="sysm-badge offline"><AlertCircle size={13} /> {healthData?.rssams_status || 'Checking...'}</span>
                            )}
                        </div>
                        <small className="sysm-stat-desc">Linked Server Connection</small>
                    </div>
                </div>

                <div className="sysm-stat-card">
                    <div className="sysm-stat-icon warn">
                        <HardDrive size={22} />
                    </div>
                    <div className="sysm-stat-info" style={{ width: '100%' }}>
                        <span className="sysm-stat-label">Storage Disk Server</span>
                        <div className="sysm-stat-value">
                            {disk.free_gb !== undefined ? `${disk.free_gb} GB Free` : 'Checking...'}
                            <span className="sysm-stat-sub">/ {disk.total_gb || 0} GB</span>
                        </div>
                        <div className="sysm-progress-bg">
                            <div
                                className={`sysm-progress-fill ${disk.used_percent > 85 ? 'danger' : disk.used_percent > 70 ? 'warn' : 'ok'}`}
                                style={{ width: `${disk.used_percent || 0}%` }}
                            />
                        </div>
                        <small className="sysm-stat-desc">{disk.used_percent || 0}% Terpakai ({disk.used_gb || 0} GB)</small>
                    </div>
                </div>

                <div className="sysm-stat-card">
                    <div className="sysm-stat-icon purple">
                        <Cpu size={22} />
                    </div>
                    <div className="sysm-stat-info">
                        <span className="sysm-stat-label">System Environment</span>
                        <div className="sysm-stat-value purple">
                            Python {sysInfo.python_version || '-'}
                        </div>
                        <small className="sysm-stat-desc">Django {sysInfo.django_version || '-'} ({sysInfo.platform || 'Server'})</small>
                    </div>
                </div>
            </div>

            {/* Backup Database Panel */}
            <div className="sysm-card">
                <div className="sysm-card-head">
                    <div className="sysm-card-title">
                        <h2><Database size={20} className="sysm-heading-icon" /> Backup Database Server</h2>
                        <p>Generate &amp; kelola file dump database terkompresi (.sql.gz) untuk cadangan data aman</p>
                    </div>
                    <div className="sysm-backup-action-group">
                        <select
                            className="sysm-select"
                            value={targetDb}
                            onChange={(e) => setTargetDb(e.target.value)}
                            disabled={creatingBackup}
                        >
                            <option value="simak">Database SIMAK (App DB)</option>
                            <option value="rssams">Database RSSAMS (ERP DB)</option>
                        </select>
                        <button className="sysm-btn primary" type="button" onClick={handleCreateBackup} disabled={creatingBackup}>
                            <Sparkles size={16} /> {creatingBackup ? 'Membuat Backup...' : `Buat Backup ${targetDb.toUpperCase()}`}
                        </button>
                    </div>
                </div>

                <div className="sysm-card-body">
                    {loadingBackups ? (
                        <div className="sysm-loading-placeholder">Memuat daftar backup database...</div>
                    ) : backups.length > 0 ? (
                        <div className="sysm-table-wrap">
                            <table className="sysm-table">
                                <thead>
                                    <tr>
                                        <th>Nama File Backup</th>
                                        <th>Target Database</th>
                                        <th>Ukuran File</th>
                                        <th>Tanggal Pembuatan</th>
                                        <th style={{ textAlign: 'center' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backups.map((b) => (
                                        <tr key={b.filename}>
                                            <td className="sysm-mono bold">{b.filename}</td>
                                            <td>
                                                <span className={`sysm-db-badge ${b.database}`}>
                                                    {b.database.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="sysm-mono">{b.size_formatted}</td>
                                            <td>{b.created_at}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div className="sysm-action-group">
                                                    <button
                                                        className="sysm-action-btn download"
                                                        type="button"
                                                        onClick={() => handleDownloadBackup(b.filename)}
                                                        title="Unduh File Backup"
                                                    >
                                                        <Download size={15} /> Unduh
                                                    </button>
                                                    <button
                                                        className="sysm-action-btn danger"
                                                        type="button"
                                                        onClick={() => handleDeleteBackup(b.filename)}
                                                        title="Hapus File Backup"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="sysm-empty-state">
                            <FileSpreadsheet size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                            <p>Belum ada file backup database yang dibuat.</p>
                            <small>Klik tombol <strong>Buat Backup</strong> di atas untuk membuat cadangan database pertama Anda.</small>
                        </div>
                    )}
                </div>
            </div>

            {/* System Utilities Panel */}
            <div className="sysm-card" style={{ marginTop: 20 }}>
                <div className="sysm-card-head">
                    <div className="sysm-card-title">
                        <h2><Wrench size={20} className="sysm-heading-icon" /> Maintenance &amp; Optimasi Database</h2>
                        <p>Utilitas pemeliharaan rutin untuk menjaga performa query dan efisiensi penyimpanan server</p>
                    </div>
                </div>
                <div className="sysm-card-body" style={{ padding: 20 }}>
                    <div className="sysm-utility-item">
                        <div className="sysm-utility-text">
                            <h3><CheckCircle2 size={18} style={{ color: '#10b981' }} /> Optimasi &amp; Rapikan Tabel MySQL (Optimize Tables)</h3>
                            <p>Mengeksekusi perintah <code>OPTIMIZE TABLE</code> pada seluruh tabel database SIMAK untuk merapikan indeks, mendefragmentasi baris data, dan mereclaim disk space yang terbuang.</p>
                        </div>
                        <button className="sysm-btn soft" type="button" onClick={handleOptimizeTables} disabled={optimizing}>
                            <Wrench size={16} /> {optimizing ? 'Mengoptimasi...' : 'Jalankan Optimize Table'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
