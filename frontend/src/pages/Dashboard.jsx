import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    ArrowRight, CarFront, CheckCircle2, Clock3, FileText, Gauge, Loader2, ReceiptText,
    Route, ShieldCheck, WalletCards,
} from 'lucide-react';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { getResults } from '../utils/pagination.jsx';

const fmt = (value) => Number(value || 0).toLocaleString('id-ID');
const fmtRp = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
const fmtDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const sum = (rows, key) => rows.reduce((total, item) => total + Number(item?.[key] || 0), 0);

const STATUS_META = {
    pending: { label: 'Pending', color: '#f97316', bg: '#fff7ed' },
    disetujui: { label: 'Disetujui', color: '#16a34a', bg: '#dcfce7' },
    ditolak: { label: 'Ditolak', color: '#dc2626', bg: '#fee2e2' },
    dicairkan: { label: 'Dicairkan', color: '#2563eb', bg: '#dbeafe' },
    dilaporkan: { label: 'Dilaporkan', color: '#7c3aed', bg: '#f3e8ff' },
    menunggu_pengembalian: { label: 'Kembalian', color: '#a16207', bg: '#fef3c7' },
    selesai: { label: 'Selesai', color: '#15803d', bg: '#dcfce7' },
};

const DRIVER_STATUS_META = {
    pending: { label: 'Pending', color: '#f97316', bg: '#fff7ed' },
    disetujui: { label: 'Disetujui', color: '#16a34a', bg: '#dcfce7' },
    ditolak: { label: 'Ditolak', color: '#dc2626', bg: '#fee2e2' },
    dilaporkan: { label: 'Dilaporkan', color: '#7c3aed', bg: '#f3e8ff' },
    selesai: { label: 'Selesai', color: '#15803d', bg: '#dcfce7' },
};

const CSS = `
@keyframes dbEnter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.db-page{display:flex;flex-direction:column;gap:16px;color:#17251d;font-family:'Plus Jakarta Sans',sans-serif;animation:dbEnter .28s ease both}
.db-hero{border:1px solid #dce8e2;border-radius:8px;background:linear-gradient(135deg,#10251a 0%,#1a4731 58%,#22577a 100%);box-shadow:0 16px 40px rgba(15,23,42,.12);padding:24px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
.db-kicker{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#c8f7d6;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.db-title{margin:0;color:#fff;font-size:28px;font-weight:850;line-height:1.18;letter-spacing:0}
.db-sub{margin:7px 0 0;color:rgba(255,255,255,.68);font-size:13px;line-height:1.6;max-width:720px}
.db-hero-side{text-align:right;color:#fff}.db-hero-side span{display:block;color:rgba(255,255,255,.62);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.db-hero-side strong{display:block;margin-top:5px;font-size:32px;font-weight:850;line-height:1}
.db-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.db-grid-2{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:14px}
.db-card,.db-panel{background:#fff;border:1px solid #e7eee9;border-radius:8px;box-shadow:0 10px 28px rgba(15,23,42,.06)}
.db-card{padding:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:126px}.db-card-icon{width:42px;height:42px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);flex-shrink:0}.db-card-label{margin:0;color:#64748b;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.db-card-value{margin:7px 0 0;color:#111827;font-size:25px;font-weight:850;line-height:1}.db-card-sub{margin:7px 0 0;color:#8aa097;font-size:12px;line-height:1.45}
.db-panel{overflow:hidden}.db-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #edf3ef;background:#fbfdfc}.db-panel-title{margin:0;color:#16251b;font-size:15px;font-weight:850;display:flex;align-items:center;gap:8px}.db-panel-sub{margin:4px 0 0;color:#8aa097;font-size:12px;line-height:1.5}.db-panel-body{padding:16px 18px}.db-chart{height:260px}
.db-action{height:34px;border:1px solid #d8e7df;background:#fff;color:#1a4731;border-radius:8px;padding:0 12px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:850;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.db-action:hover{background:#f0fdf4;border-color:#9dd8b8}
.db-table{width:100%;border-collapse:separate;border-spacing:0}.db-table th{padding:10px 12px;text-align:left;background:#f8fbf9;color:#718178;border-bottom:1px solid #e1ece6;font-size:10.5px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.db-table td{padding:11px 12px;border-bottom:1px solid #edf3ef;color:#334155;font-size:12.5px;vertical-align:middle}.db-table tr:last-child td{border-bottom:none}.db-title-cell{font-weight:850;color:#17251d;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.db-meta{display:block;margin-top:3px;color:#94a3b8;font-size:11px}
.db-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;background:var(--bg);color:var(--fg);font-size:11px;font-weight:850;white-space:nowrap}.db-empty{padding:28px;text-align:center;color:#94a3b8;font-size:13px}.db-mini-list{display:flex;flex-direction:column;gap:10px}.db-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #edf3ef;border-radius:8px;background:#fbfdfc;padding:11px 12px}.db-row-title{margin:0;color:#17251d;font-size:13px;font-weight:850}.db-row-meta{margin:4px 0 0;color:#94a3b8;font-size:11px}.db-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:34px;color:#64748b;font-size:13px;font-weight:750}
@media(max-width:1100px){.db-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}.db-grid-2{grid-template-columns:1fr}.db-hero-side{text-align:left}}
@media(max-width:640px){.db-hero{padding:20px}.db-title{font-size:24px}.db-grid-4{grid-template-columns:1fr}.db-panel-head{flex-direction:column}.db-chart{height:230px}.db-table-wrap{overflow:auto}.db-table{min-width:680px}}
`;

function StatusBadge({ status, driver = false }) {
    const meta = (driver ? DRIVER_STATUS_META : STATUS_META)[status] || { label: status || '-', color: '#64748b', bg: '#f1f5f9' };
    return <span className="db-badge" style={{ '--bg': meta.bg, '--fg': meta.color }}>{meta.label}</span>;
}

function MetricCard({ label, value, sub, icon: Icon, bg, fg }) {
    return (
        <div className="db-card">
            <div>
                <p className="db-card-label">{label}</p>
                <p className="db-card-value">{value}</p>
                <p className="db-card-sub">{sub}</p>
            </div>
            <div className="db-card-icon" style={{ '--bg': bg, '--fg': fg }}><Icon size={21} /></div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 11px', boxShadow: '0 12px 32px rgba(15,23,42,.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 850, color: '#17251d', marginBottom: 6 }}>{label}</div>
            {payload.map((item) => (
                <div key={item.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: item.color }} />
                    <span>{item.name}</span>
                    <strong style={{ color: '#17251d', marginLeft: 'auto' }}>{fmt(item.value)}</strong>
                </div>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [pc, setPc] = useState([]);
    const [rb, setRb] = useState([]);
    const [trips, setTrips] = useState([]);

    useEffect(() => {
        let alive = true;
        const fetchData = async () => {
            setLoading(true);
            try {
                const [pcRes, rbRes, tripRes] = await Promise.all([
                    api.get('/keuangan/petty-cash/', { params: { page_size: 100 } }),
                    api.get('/keuangan/reimbursement/', { params: { page_size: 100 } }),
                    api.get('/keuangan/log-perjalanan/', { params: { page_size: 100 } }),
                ]);
                if (!alive) return;
                setPc(getResults(pcRes.data));
                setRb(getResults(rbRes.data));
                setTrips(getResults(tripRes.data));
            } catch (error) {
                console.error('Gagal memuat dashboard approval', error);
            } finally {
                if (alive) setLoading(false);
            }
        };
        fetchData();
        return () => { alive = false; };
    }, []);

    const data = useMemo(() => {
        const pcPending = pc.filter((item) => item.status === 'pending');
        const rbPending = rb.filter((item) => item.status === 'pending');
        const driverPending = trips.filter((item) => item.status === 'pending');
        const driverReports = trips.filter((item) => item.status === 'dilaporkan');
        const activePc = pc.filter((item) => ['dicairkan', 'dilaporkan', 'menunggu_pengembalian'].includes(item.status));
        const pcNeedAction = [
            ...pcPending.map((item) => ({ kind: 'Petty Cash', id: item.id, no: item.no_pengajuan, title: item.keperluan, date: item.tanggal, status: item.status, amount: item.nominal })),
            ...rbPending.map((item) => ({ kind: 'Reimbursement', id: item.id, no: item.no_reimbursement, title: item.keperluan, date: item.tanggal, status: item.status, amount: item.nominal })),
        ];
        const driverNeedAction = [
            ...driverPending.map((item) => ({ kind: 'Izin Driver', id: item.id, no: item.no_perjalanan, title: item.tujuan, date: item.tanggal, status: item.status, meta: item.kendaraan_info })),
            ...driverReports.map((item) => ({ kind: 'Laporan Driver', id: item.id, no: item.no_perjalanan, title: item.tujuan, date: item.tanggal, status: item.status, meta: item.kendaraan_info })),
        ];
        const statusChart = [
            { name: 'PC Pending', value: pcPending.length, color: '#2563eb' },
            { name: 'RB Pending', value: rbPending.length, color: '#c9a84c' },
            { name: 'Driver Pending', value: driverPending.length, color: '#0e7490' },
            { name: 'Laporan Driver', value: driverReports.length, color: '#7c3aed' },
        ];
        const moduleChart = [
            { name: 'Petty Cash', pending: pcPending.length, selesai: pc.filter((item) => item.status === 'selesai').length, berjalan: activePc.length },
            { name: 'Reimburse', pending: rbPending.length, selesai: rb.filter((item) => item.status === 'dicairkan').length, berjalan: rb.filter((item) => item.status === 'disetujui').length },
            { name: 'Driver', pending: driverPending.length, selesai: trips.filter((item) => item.status === 'selesai').length, berjalan: trips.filter((item) => ['disetujui', 'dilaporkan'].includes(item.status)).length },
        ];
        const totalPending = pcPending.length + rbPending.length + driverPending.length + driverReports.length;
        return {
            pcPending,
            rbPending,
            driverPending,
            driverReports,
            activePc,
            pcNeedAction,
            driverNeedAction,
            statusChart,
            moduleChart,
            totalPending,
            nominalPending: sum(pcPending, 'nominal') + sum(rbPending, 'nominal'),
        };
    }, [pc, rb, trips]);

    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const userName = user?.first_name || user?.username || 'User';

    return (
        <div className="db-page">
            <style>{CSS}</style>

            <section className="db-hero">
                <div>
                    <div className="db-kicker"><ShieldCheck size={14} /> Approval Center</div>
                    <h1 className="db-title">Halo, {userName}. Ini ringkasan approval hari ini.</h1>
                    <p className="db-sub">Dashboard dibuat simpel untuk memantau Petty Cash, Reimbursement, dan Driver.</p>
                </div>
                <div className="db-hero-side">
                    <span>{today}</span>
                    <strong>{loading ? '...' : fmt(data.totalPending)}</strong>
                    <p className="db-sub" style={{ marginTop: 7 }}>butuh perhatian</p>
                </div>
            </section>

            <div className="db-grid-4">
                <MetricCard label="Pending PC" value={loading ? '...' : fmt(data.pcPending.length)} sub={`${fmtRp(sum(data.pcPending, 'nominal'))} menunggu approval`} icon={WalletCards} bg="#dbeafe" fg="#2563eb" />
                <MetricCard label="Pending RB" value={loading ? '...' : fmt(data.rbPending.length)} sub={`${fmtRp(sum(data.rbPending, 'nominal'))} menunggu approval`} icon={ReceiptText} bg="#fef3c7" fg="#a16207" />
                <MetricCard label="Driver Pending" value={loading ? '...' : fmt(data.driverPending.length)} sub={`${fmt(data.driverReports.length)} laporan driver perlu selesai`} icon={CarFront} bg="#ecfeff" fg="#0e7490" />
                <MetricCard label="Nominal Approval" value={loading ? '...' : fmtRp(data.nominalPending)} sub="Total PC dan RB pending" icon={Gauge} bg="#f0fdf4" fg="#15803d" />
            </div>

            <div className="db-grid-2">
                <section className="db-panel">
                    <div className="db-panel-head">
                        <div>
                            <h2 className="db-panel-title"><FileText size={18} color="#1a4731" /> Antrian Approval</h2>
                            <p className="db-panel-sub">Daftar item yang perlu dicek lebih dulu.</p>
                        </div>
                        <button className="db-action" onClick={() => navigate('/petty-cash')}>Buka PC/RB <ArrowRight size={15} /></button>
                    </div>
                    <div className="db-panel-body">
                        {loading ? <div className="db-loading"><Loader2 size={16} className="spin" /> Memuat data...</div> : (
                            <div className="db-table-wrap">
                                <table className="db-table">
                                    <thead>
                                        <tr>
                                            <th>Jenis</th>
                                            <th>No</th>
                                            <th>Keperluan</th>
                                            <th>Tanggal</th>
                                            <th>Nominal</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.pcNeedAction.slice(0, 8).map((item) => (
                                            <tr key={`${item.kind}-${item.id}`}>
                                                <td>{item.kind}</td>
                                                <td style={{ fontFamily: 'monospace', color: '#1a4731', fontWeight: 850 }}>{item.no}</td>
                                                <td><div className="db-title-cell">{item.title}</div></td>
                                                <td>{fmtDate(item.date)}</td>
                                                <td>{fmtRp(item.amount)}</td>
                                                <td><StatusBadge status={item.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!data.pcNeedAction.length && <div className="db-empty">Tidak ada approval PC/RB yang menunggu.</div>}
                            </div>
                        )}
                    </div>
                </section>

                <section className="db-panel">
                    <div className="db-panel-head">
                        <div>
                            <h2 className="db-panel-title"><Route size={18} color="#0e7490" /> Antrian Driver</h2>
                            <p className="db-panel-sub">Izin perjalanan dan laporan driver.</p>
                        </div>
                        <button className="db-action" onClick={() => navigate('/driver')}>Buka Driver <ArrowRight size={15} /></button>
                    </div>
                    <div className="db-panel-body">
                        <div className="db-mini-list">
                            {loading ? <div className="db-loading"><Loader2 size={16} /> Memuat data...</div> : data.driverNeedAction.slice(0, 7).map((item) => (
                                <div className="db-row" key={`${item.kind}-${item.id}`}>
                                    <div>
                                        <p className="db-row-title">{item.no || item.kind} - {item.title}</p>
                                        <p className="db-row-meta">{item.kind} - {fmtDate(item.date)} - {item.meta || '-'}</p>
                                    </div>
                                    <StatusBadge status={item.status} driver />
                                </div>
                            ))}
                            {!loading && !data.driverNeedAction.length && <div className="db-empty">Tidak ada approval driver yang menunggu.</div>}
                        </div>
                    </div>
                </section>
            </div>

            <div className="db-grid-2">
                <section className="db-panel">
                    <div className="db-panel-head">
                        <div>
                            <h2 className="db-panel-title"><CheckCircle2 size={18} color="#15803d" /> Status per Modul</h2>
                            <p className="db-panel-sub">Perbandingan pending, berjalan, dan selesai.</p>
                        </div>
                    </div>
                    <div className="db-panel-body">
                        <div className="db-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.moduleChart} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="pending" name="Pending" fill="#f97316" radius={[5, 5, 0, 0]} />
                                    <Bar dataKey="berjalan" name="Berjalan" fill="#2563eb" radius={[5, 5, 0, 0]} />
                                    <Bar dataKey="selesai" name="Selesai" fill="#16a34a" radius={[5, 5, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="db-panel">
                    <div className="db-panel-head">
                        <div>
                            <h2 className="db-panel-title"><Clock3 size={18} color="#f97316" /> Komposisi Pending</h2>
                            <p className="db-panel-sub">Item yang perlu diproses berdasarkan modul.</p>
                        </div>
                    </div>
                    <div className="db-panel-body">
                        <div className="db-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.statusChart.filter((item) => item.value > 0)}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={62}
                                        outerRadius={92}
                                        paddingAngle={4}
                                        label={({ name, value }) => `${name}: ${value}`}
                                    >
                                        {data.statusChart.filter((item) => item.value > 0).map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
