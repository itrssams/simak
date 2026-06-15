import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToastState } from '../context/ToastContext';
import {
    Activity, AlertCircle, CalendarDays, FileClock, Filter, Search, ShieldCheck,
    UserRound,
} from 'lucide-react';
import api from '../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../utils/pagination.jsx';
import './AuditLog.css';

const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' '
        + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const ACTION_META = {
    create: { label: 'Buat', bg: '#dcfce7', fg: '#166534' },
    update: { label: 'Ubah', bg: '#eff6ff', fg: '#1d4ed8' },
    delete: { label: 'Hapus', bg: '#fee2e2', fg: '#991b1b' },
    action: { label: 'Proses', bg: '#f5f3ff', fg: '#6d28d9' },
    login: { label: 'Login', bg: '#fefce8', fg: '#a16207' },
};

const ENTITY_LABELS = {
    'petty-cash': 'Petty Cash',
    reimbursement: 'Reimbursement',
    'saldo-petty-cash': 'Saldo Petty Cash',
    'penambahan-saldo': 'Penambahan Saldo',
    kendaraan: 'Kendaraan',
    'log-perjalanan': 'Log Perjalanan',
    'log-bbm': 'Log BBM',
    'log-maintenance': 'Log Maintenance',
    transaksi: 'Transaksi',
    jurnal: 'Jurnal',
    akun: 'Akun',
    users: 'User',
    auth: 'Auth',
};

function ActionBadge({ action }) {
    const meta = ACTION_META[action] || { label: action || '-', bg: '#f1f5f9', fg: '#64748b' };
    return <span className="al-badge" style={{ '--bg': meta.bg, '--fg': meta.fg }}>{meta.label}</span>;
}

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useToastState('error');
    const [filters, setFilters] = useState({ search: '', action: '', entity: '', dari: '', sampai: '' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams(pageParams(page, pageSize));
            Object.entries(filters).forEach(([key, value]) => {
                if (value) params.set(key, value);
            });
            const res = await api.get(`/keuangan/audit-log/${params.toString() ? `?${params.toString()}` : ''}`);
            setLogs(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (e) {
            setError(e.response?.data?.error || 'Gagal mengambil audit log.');
        } finally {
            setLoading(false);
        }
    }, [filters, page, pageSize, setError]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const stats = useMemo(() => ({
        total: logs.length,
        create: logs.filter((i) => i.action === 'create').length,
        update: logs.filter((i) => i.action === 'update').length,
        delete: logs.filter((i) => i.action === 'delete').length,
    }), [logs]);

    const updateFilter = (key, value) => { setPage(1); setFilters((prev) => ({ ...prev, [key]: value })); };

    return (
        <div className="al-page">
            <section className="al-hero">
                <div className="al-page-title">
                    <span><ShieldCheck size={22} /></span>
                    <div>
                        <h1 className="al-title">Log aktivitas sistem</h1>
                        <p className="al-sub">Pantau siapa melakukan apa, dari modul mana, kapan, dan lewat endpoint apa.</p>
                    </div>
                </div>
            </section>

            <div className="al-stats">
                <div className="al-stat"><div className="al-stat-icon"><Activity size={20} /></div><div><p className="al-stat-label">Total Log</p><p className="al-stat-value">{stats.total}</p></div></div>
                <div className="al-stat"><div className="al-stat-icon"><FileClock size={20} /></div><div><p className="al-stat-label">Create</p><p className="al-stat-value">{stats.create}</p></div></div>
                <div className="al-stat"><div className="al-stat-icon"><Filter size={20} /></div><div><p className="al-stat-label">Update</p><p className="al-stat-value">{stats.update}</p></div></div>
                <div className="al-stat"><div className="al-stat-icon"><AlertCircle size={20} /></div><div><p className="al-stat-label">Delete</p><p className="al-stat-value">{stats.delete}</p></div></div>
            </div>

            {error && <div className="al-error"><AlertCircle size={16} /> {error}</div>}

            <section className="al-panel">
                <div className="al-toolbar">
                    <div className="al-search-wrap">
                        <Search size={16} />
                        <input className="al-search" placeholder="Cari user, deskripsi, modul, endpoint..." value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs(); }} />
                    </div>
                    <select className="al-field" value={filters.action} onChange={(e) => updateFilter('action', e.target.value)}>
                        <option value="">Semua aksi</option>
                        {Object.entries(ACTION_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                    </select>
                    <input className="al-field" placeholder="Modul" value={filters.entity} onChange={(e) => updateFilter('entity', e.target.value)} />
                    <input className="al-field" type="date" value={filters.dari} onChange={(e) => updateFilter('dari', e.target.value)} />
                    <input className="al-field" type="date" value={filters.sampai} onChange={(e) => updateFilter('sampai', e.target.value)} />
                    <button className="al-field" style={{ cursor: 'pointer', fontWeight: 850, color: '#1a4731' }} onClick={fetchLogs}>Terapkan</button>
                </div>

                <div className="al-table-wrap">
                    <table className="al-table">
                        <thead>
                            <tr>
                                <th>Waktu</th>
                                <th>User</th>
                                <th>Aksi</th>
                                <th>Modul</th>
                                <th>Deskripsi</th>
                                <th>IP</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}><CalendarDays size={13} style={{ verticalAlign: -2, marginRight: 5, color: '#94a3b8' }} />{fmtDT(log.created_at)}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <UserRound size={15} color="#64748b" />
                                            <div>
                                                <div style={{ fontWeight: 800, color: '#17251d' }}>{log.user_display || log.username || '-'}</div>
                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{log.role || '-'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><ActionBadge action={log.action} /></td>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{ENTITY_LABELS[log.entity] || log.entity || '-'}</div>
                                        {log.entity_id && <div style={{ fontSize: 11, color: '#94a3b8' }}>ID {log.entity_id}</div>}
                                    </td>
                                    <td>
                                        <div className="al-desc">{log.description}</div>
                                        <div className="al-meta">{log.method} {log.path}</div>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{log.ip_address || '-'}</td>
                                    <td>{log.status_code || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && logs.length === 0 && <div className="al-empty">Belum ada audit log untuk filter ini.</div>}
                    {loading && <div className="al-empty">Memuat audit log...</div>}
                </div>
                <SimplePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    buttonClassName="al-page-btn"
                    selectClassName="al-page-size"
                />
            </section>
        </div>
    );
}
