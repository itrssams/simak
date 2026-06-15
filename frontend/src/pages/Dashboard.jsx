import { useEffect, useMemo, useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    CarFront, CheckCircle2, Clock3, Gauge, ReceiptText, ShieldCheck, WalletCards,
} from 'lucide-react';
import api from '../api/axiosConfig';
import { getResults } from '../utils/pagination.jsx';
import './Dashboard.css';

const fmt = (value) => Number(value || 0).toLocaleString('id-ID');
const fmtRp = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
const sum = (rows, key) => rows.reduce((total, item) => total + Number(item?.[key] || 0), 0);

function MetricCard({ label, value, sub, icon, bg, fg }) {
    const IconComponent = icon;
    return (
        <div className="db-card">
            <div>
                <p className="db-card-label">{label}</p>
                <p className="db-card-value">{value}</p>
                <p className="db-card-sub">{sub}</p>
            </div>
            <div className="db-card-icon" style={{ '--bg': bg, '--fg': fg }}><IconComponent size={21} /></div>
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
        return {
            pcPending,
            rbPending,
            driverPending,
            driverReports,
            activePc,
            statusChart,
            moduleChart,
            nominalPending: sum(pcPending, 'nominal') + sum(rbPending, 'nominal'),
        };
    }, [pc, rb, trips]);

    return (
        <div className="db-page">
            <section className="db-hero">
                <div className="db-page-title">
                    <span><ShieldCheck size={22} /></span>
                    <div>
                    <h1 className="db-title">Dashboard Operasional</h1>
                    <p className="db-sub">Ringkasan Petty Cash, Reimbursement, dan Driver dalam satu tampilan.</p>
                    </div>
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
