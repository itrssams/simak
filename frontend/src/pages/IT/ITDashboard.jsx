import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Archive, CalendarClock, CheckCircle2, ClipboardList, DatabaseBackup,
    KeyRound, Laptop, Pill, RefreshCw, ShieldCheck, Plus, ArrowRight,
    BarChart3, ArrowRightLeft
} from 'lucide-react';
import api from '../../api/axiosConfig';
import './ITCenter.css';

function MetricCard({ icon: Icon, label, value, sub, color, bg, to }) {
    const content = (
        <>
            <div className="pc-stat-icon" style={{ color, background: bg }}>
                <Icon size={22} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
                <p className="pc-stat-label">{label}</p>
                <h3 className="pc-stat-value" style={{ color: value > 0 ? undefined : undefined }}>{value}</h3>
                {sub && <p className="pc-stat-sub">{sub}</p>}
            </div>
        </>
    );

    if (to) {
        return (
            <Link to={to} className="pc-stat-card" style={{ cursor: 'pointer' }}>
                {content}
            </Link>
        );
    }

    return (
        <div className="pc-stat-card">
            {content}
        </div>
    );
}

const IT_MODULES = [
    {
        title: 'Backup Database',
        desc: 'Riwayat pencadangan database SIMRS harian, verifikasi status, dan ukuran arsip dump.',
        path: '/it/backups',
        icon: DatabaseBackup,
        color: '#1d4ed8',
        bg: '#eff6ff',
    },
    {
        title: 'Perbaikan IT (Helpdesk)',
        desc: 'Permintaan perbaikan hardware, jaringan, printer, aplikasi, dan penanganan insiden.',
        path: '/it/tickets',
        icon: ClipboardList,
        color: '#ea580c',
        bg: '#fff7ed',
    },
    {
        title: 'Akun & Link Kredensial',
        desc: 'Penyimpanan aman informasi akun server, portal vendor eksternal, dan tautan SIMRS.',
        path: '/it/credentials',
        icon: KeyRound,
        color: '#4f46e5',
        bg: '#eef2ff',
    },
    {
        title: 'Remote Access',
        desc: 'Daftar ID AnyDesk dan RustDesk untuk remote komputer user dan server operasional.',
        path: '/it/remote',
        icon: Laptop,
        color: '#2563eb',
        bg: '#eff6ff',
    },
    {
        title: 'Langganan & Lisensi',
        desc: 'Monitoring masa berlaku domain, hosting, internet, lisensi aplikasi, dan tagihan.',
        path: '/it/subscriptions',
        icon: CalendarClock,
        color: '#7c3aed',
        bg: '#f5f3ff',
    },
    {
        title: 'Koreksi Data Transaksi',
        desc: 'Utilitas koreksi tanggal transaksi dan pemindahan kunjungan rawat inap/jalan SIMRS.',
        path: '/it/koreksi-transaksi',
        icon: ArrowRightLeft,
        color: '#4f46e5',
        bg: '#eef2ff',
    },
    {
        title: 'Laporan Operasional IT',
        desc: 'Rekapitulasi cetak audit backup, tiket perbaikan, dan aktivitas teknis bulanan.',
        path: '/laporan/it',
        icon: BarChart3,
        color: '#0891b2',
        bg: '#ecfeff',
    },
];

export default function ITDashboard() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(false);

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const [backupRes, ticketRes, subscriptionRes] = await Promise.all([
                api.get('/it/backups/summary/'),
                api.get('/it/repair-requests/summary/'),
                api.get('/it/subscriptions/summary/'),
            ]);
            setSummary({ backups: backupRes.data, tickets: ticketRes.data, subscriptions: subscriptionRes.data });
        } catch {
            setSummary({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    return (
        <div className="pc-page it-page">
            {/* Hero Section */}
            <section className="pc-hero">
                <div className="pc-hero-main">
                    <div>
                        <div className="pc-eyebrow">
                            <ShieldCheck size={15} /> Area IT & SIMRS
                        </div>
                        <h1 className="pc-title">IT Dashboard</h1>
                        <p className="pc-subtitle">
                            Kelola backup database, perbaikan operasional IT, kredensial akun, remote access, dan utilitas SIMRS secara terpadu.
                        </p>
                    </div>
                    <div className="pc-hero-actions">
                        <button
                            className="pc-action-soft"
                            onClick={fetchSummary}
                            disabled={loading}
                            type="button"
                        >
                            <RefreshCw size={15} className={loading ? 'spin' : ''} />
                            <span>Refresh</span>
                        </button>
                        <button
                            className="pc-action-primary"
                            onClick={() => navigate('/it/tickets')}
                            type="button"
                        >
                            <Plus size={16} />
                            <span>Tiket Perbaikan</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* Quick Metrics */}
            <section className="pc-stats-mini">
                <MetricCard
                    icon={Archive}
                    label="Catatan Backup"
                    value={summary.backups?.total || 0}
                    sub={`${summary.backups?.failed || 0} gagal`}
                    color="#1d4ed8"
                    bg="#eff6ff"
                    to="/it/backups"
                />
                <MetricCard
                    icon={ClipboardList}
                    label="Tiket Terbuka"
                    value={(summary.tickets?.open || 0) + (summary.tickets?.in_progress || 0)}
                    sub={`${summary.tickets?.urgent || 0} darurat`}
                    color="#c2410c"
                    bg="#fff7ed"
                    to="/it/tickets"
                />
                <MetricCard
                    icon={CheckCircle2}
                    label="Tiket Selesai"
                    value={summary.tickets?.done || 0}
                    sub="Riwayat tersimpan"
                    color="#0284c7"
                    bg="#f0f9ff"
                    to="/it/tickets"
                />
                <MetricCard
                    icon={CalendarClock}
                    label="Langganan"
                    value={summary.subscriptions?.total || 0}
                    sub={`${summary.subscriptions?.expiring || 0} hampir habis`}
                    color="#7c3aed"
                    bg="#f5f3ff"
                    to="/it/subscriptions"
                />
            </section>

            {/* IT Modules Grid */}
            <section style={{ marginTop: '10px' }}>
                <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'inherit' }}>Modul IT</h2>
                        <p style={{ fontSize: '12.5px', color: '#64748b', margin: '3px 0 0' }}>Pilih modul untuk melihat dan mengelola data.</p>
                    </div>
                </div>

                <div className="it-modules-grid">
                    {IT_MODULES.map((mod) => {
                        const Icon = mod.icon;
                        return (
                            <Link key={mod.path} to={mod.path} className="it-module-card">
                                <div className="it-module-head">
                                    <div className="it-module-icon" style={{ background: mod.bg, color: mod.color }}>
                                        <Icon size={20} />
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <h3 className="it-module-title">{mod.title}</h3>
                                        <p className="it-module-desc">{mod.desc}</p>
                                    </div>
                                </div>
                                <div className="it-module-action">
                                    <span>Buka Modul</span>
                                    <ArrowRight size={15} />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
