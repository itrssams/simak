import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToastState } from '../context/ToastContext';
import {
    Activity, AlertCircle, CalendarDays, FileClock, Filter, Search, ShieldCheck,
    UserRound,
} from 'lucide-react';
import api from '../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../utils/pagination.jsx';

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

const CSS = `
@keyframes alEnter{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.al-page{display:flex;flex-direction:column;gap:18px;animation:alEnter .35s ease both;font-family:'Plus Jakarta Sans',sans-serif;color:#17251d}
.al-hero{border:1px solid #d9e7df;border-radius:8px;background:linear-gradient(135deg,#10251a,#1a4731 58%,#22577a);box-shadow:0 16px 40px rgba(15,23,42,.12);overflow:hidden}
.al-hero-inner{padding:24px 26px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
.al-kicker{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#c8f7d6;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.al-title{margin:0;color:#fff;font-size:28px;font-weight:850;letter-spacing:0}
.al-sub{margin:7px 0 0;color:rgba(255,255,255,.66);font-size:13px;line-height:1.6}
.al-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.al-stat,.al-panel{background:#fff;border:1px solid #e7eee9;border-radius:8px;box-shadow:0 10px 28px rgba(15,23,42,.06)}
.al-stat{padding:16px;display:flex;align-items:center;gap:12px}
.al-stat-icon{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#f0fdf4;color:#1a4731}
.al-stat-label{margin:0;color:#64748b;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
.al-stat-value{margin:4px 0 0;color:#111827;font-size:21px;font-weight:850}
.al-panel{overflow:hidden}
.al-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:16px;border-bottom:1px solid #edf2f7;background:#fbfdfc}
.al-search,.al-field{height:38px;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1e293b;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;outline:none;box-sizing:border-box}
.al-search-wrap{position:relative;flex:1 1 260px;min-width:220px}
.al-search-wrap svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8}
.al-search{width:100%;padding:0 12px 0 38px}
.al-field{padding:0 10px}
.al-table-wrap{overflow:auto}
.al-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0}
.al-table th{padding:12px 14px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
.al-table td{padding:13px 14px;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;vertical-align:top}
.al-table tr:hover td{background:#fbfdfc}
.al-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;background:var(--bg);color:var(--fg);font-size:11px;font-weight:850;white-space:nowrap}
.al-desc{font-weight:750;color:#16251b;line-height:1.45}
.al-meta{margin-top:4px;color:#94a3b8;font-size:11px;line-height:1.5;max-width:440px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.al-empty{padding:38px 16px;text-align:center;color:#94a3b8;font-size:14px}
.al-error{display:flex;align-items:center;gap:9px;padding:12px 14px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;font-size:13px;font-weight:700}
.al-page-btn,.al-page-size{height:34px;border:1px solid #dbe7e1;border-radius:8px;background:#fff;color:#1e293b;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:800;padding:0 10px}
.al-page-btn{min-width:34px;cursor:pointer}.al-page-btn:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:900px){.al-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.al-hero-inner{align-items:flex-start}.al-title{font-size:24px}}
@media(max-width:560px){.al-stats{grid-template-columns:1fr}.al-toolbar{align-items:stretch}.al-field,.al-search-wrap{width:100%;flex:1 1 100%}}
`;

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
            <style>{CSS}</style>

            <section className="al-hero">
                <div className="al-hero-inner">
                    <div>
                        <div className="al-kicker"><ShieldCheck size={14} /> Audit Trail</div>
                        <h1 className="al-title">Log aktivitas sistem</h1>
                        <p className="al-sub">Pantau siapa melakukan apa, dari modul mana, kapan, dan lewat endpoint apa.</p>
                    </div>
                    <div style={{ color: '#fff', textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.58)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>Data tampil</p>
                        <p style={{ margin: '5px 0 0', fontSize: 31, fontWeight: 850 }}>{loading ? '...' : total}</p>
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
