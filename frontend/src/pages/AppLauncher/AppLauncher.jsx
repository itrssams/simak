import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileSpreadsheet,
    ReceiptText,
    Package,
    WalletCards,
    CarFront,
    BookOpen,
    Megaphone,
    FileClock,
    UserCog,
    ShieldCheck,
    LayoutDashboard,
    Search,
    LogOut,
    Sun,
    Moon,
    ChevronRight,
    Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AppLauncher.css';

export default function AppLauncher() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeHoverApp, setActiveHoverApp] = useState(null);
    const [theme, setTheme] = useState(() => localStorage.getItem('simak_theme') || 'dark');

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('simak_theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    const isManajerUp = user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);
    const isDirekturUp = user?.is_superuser || ['wakil_direktur', 'direktur'].includes(user?.role);
    const isIT = user?.is_superuser || user?.is_it;
    const isKeuangan = user?.is_superuser || user?.is_keuangan;
    const isLogistik = user?.is_superuser || user?.is_logistik || isManajerUp;
    const canCatatanUtang = user?.is_superuser || user?.akses_catatan_utang;
    const isDriverAccess = user?.is_driver || isManajerUp;

    // Daftar Aplikasi Modul
    const allApps = useMemo(() => [
        {
            id: 'catatan-utang',
            name: 'Catatan Utang',
            subtitle: 'Obat, BHP & Logistik',
            icon: FileSpreadsheet,
            gradient: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
            path: '/keuangan/catatan-utang/obat-bhp',
            allowed: Boolean(canCatatanUtang),
            submenus: [
                { label: 'Faktur Obat & BHP', path: '/keuangan/catatan-utang/obat-bhp?tab=faktur' },
                { label: 'Pengajuan Pembayaran', path: '/keuangan/catatan-utang/obat-bhp?tab=pengajuan' },
                { label: 'Riwayat Pembayaran', path: '/keuangan/catatan-utang/obat-bhp?tab=history' },
                { label: 'Import Saldo OTS', path: '/keuangan/catatan-utang/import-ots' },
            ],
        },
        {
            id: 'penagihan-invoice',
            name: 'Penagihan & Invoice',
            subtitle: 'Piutang & Verifikasi',
            icon: ReceiptText,
            gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
            path: '/keuangan/kunjungan-invoice',
            allowed: Boolean(isKeuangan),
            submenus: [
                { label: 'Daftar Kunjungan Invoice', path: '/keuangan/kunjungan-invoice' },
                { label: 'Dashboard Invoice', path: '/keuangan/invoices/dashboard' },
                { label: 'Daftar Invoice', path: '/keuangan/invoices' },
                { label: 'Verifikasi Pembayaran', path: '/keuangan/invoices/verifikasi' },
                { label: 'Master Pembiayaan', path: '/keuangan/master-pembiayaan' },
                { label: 'Alokasi Pembiayaan', path: '/keuangan/alokasi-pembiayaan' },
            ],
        },
        {
            id: 'gudang-logistik',
            name: 'Gudang Logistik',
            subtitle: 'Stok & Distribusi Barang',
            icon: Package,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            path: '/logistik/barang',
            allowed: Boolean(isLogistik),
            submenus: [
                { label: 'Data Barang Logistik', path: '/logistik/barang' },
                { label: 'Stok Minimum & Alert', path: '/logistik/stok-minimum' },
                { label: 'Penerimaan Barang', path: '/logistik/penerimaan' },
                { label: 'Pengeluaran / Distribusi', path: '/logistik/pengeluaran' },
                { label: 'Laporan & Mutasi', path: '/logistik/laporan' },
            ],
        },
        {
            id: 'petty-cash',
            name: 'Petty Cash',
            subtitle: 'Kas Kecil & Pengeluaran',
            icon: WalletCards,
            gradient: 'linear-gradient(135deg, #22c55e 0%, #059669 100%)',
            path: '/petty-cash',
            allowed: true,
            submenus: [
                { label: 'Pengajuan & Kasbon', path: '/petty-cash' },
                { label: 'Laporan Petty Cash', path: '/laporan/petty-cash' },
            ],
        },
        {
            id: 'driver',
            name: 'Driver & Armada',
            subtitle: 'Operasional Kendaraan',
            icon: CarFront,
            gradient: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            path: '/driver',
            allowed: Boolean(isDriverAccess),
            submenus: [
                { label: 'Logbook Perjalanan Driver', path: '/driver' },
            ],
        },
        {
            id: 'akuntansi',
            name: 'Akuntansi & Kas',
            subtitle: 'COA, Jurnal & Arus Kas',
            icon: BookOpen,
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            path: '/akuntansi/bagan-akun',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Bagan Akun (COA)', path: '/akuntansi/bagan-akun' },
                { label: 'Entri Jurnal', path: '/akuntansi/entri-jurnal' },
                { label: 'Input Transaksi', path: '/transaksi/input' },
                { label: 'Daftar Transaksi', path: '/transaksi/list' },
                { label: 'Laporan Arus Kas', path: '/laporan/arus-kas' },
                { label: 'Rekening Bank', path: '/rekening-bank' },
                { label: 'Data Pelanggan', path: '/pelanggan' },
                { label: 'Data Pemasok', path: '/pemasok' },
            ],
        },
        {
            id: 'pengumuman',
            name: 'Pengumuman',
            subtitle: 'Broadcast Berita Internal',
            icon: Megaphone,
            gradient: 'linear-gradient(135deg, #f43f5e 0%, #db2777 100%)',
            path: '/pengumuman',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Daftar Pengumuman Internal', path: '/pengumuman' },
            ],
        },
        {
            id: 'audit-log',
            name: 'Audit Log',
            subtitle: 'Riwayat Aktivitas User',
            icon: FileClock,
            gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
            path: '/audit-log',
            allowed: Boolean(isManajerUp || isIT),
            submenus: [
                { label: 'Log Aktivitas Sistem', path: '/audit-log' },
            ],
        },
        {
            id: 'manajemen-user',
            name: 'Manajemen User',
            subtitle: 'Kelola Akun & Hak Akses',
            icon: UserCog,
            gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            path: '/admin/users',
            allowed: Boolean(isDirekturUp),
            submenus: [
                { label: 'Daftar Pengguna & Role', path: '/admin/users' },
            ],
        },
        {
            id: 'manajemen-sistem',
            name: 'Manajemen Sistem',
            subtitle: 'Backup Database & Health',
            icon: ShieldCheck,
            gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            path: '/admin/system-maintenance',
            allowed: Boolean(user?.is_superuser),
            submenus: [
                { label: 'Health & Storage Metrics', path: '/admin/system-maintenance' },
                { label: 'Backup & Restore Database', path: '/admin/system-maintenance' },
                { label: 'Optimasi Tabel MySQL', path: '/admin/system-maintenance' },
            ],
        },
        {
            id: 'dashboard-stat',
            name: 'Statistik & Analitik',
            subtitle: 'Executive Summary',
            icon: LayoutDashboard,
            gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            path: '/dashboard-analytics',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Ringkasan Dashboard', path: '/dashboard-analytics' },
            ],
        },
    ], [canCatatanUtang, isKeuangan, isLogistik, isDriverAccess, isManajerUp, isIT, isDirekturUp, user?.is_superuser]);

    // Filter berdasar izin & query search
    const visibleApps = useMemo(() => {
        return allApps
            .filter((app) => app.allowed)
            .filter((app) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                const matchName = app.name.toLowerCase().includes(q);
                const matchSub = app.subtitle.toLowerCase().includes(q);
                const matchChild = app.submenus?.some((s) => s.label.toLowerCase().includes(q));
                return matchName || matchSub || matchChild;
            });
    }, [allApps, searchQuery]);

    const handleAppClick = (app) => {
        navigate(app.path);
    };

    return (
        <div className="odoo-launcher-page">
            {/* Minimalist Topbar */}
            <header className="odoo-topbar">
                <div className="odoo-brand">
                    <div className="odoo-logo-dots">
                        <span></span><span></span><span></span>
                        <span></span><span></span><span></span>
                        <span></span><span></span><span></span>
                    </div>
                    <span className="odoo-hospital-name">RS SIAGA MEDIKA</span>
                    <span className="odoo-simak-badge">SIMAK</span>
                </div>

                <div className="odoo-search-container">
                    <Search size={15} className="odoo-search-icon" />
                    <input
                        type="text"
                        placeholder="Cari modul atau menu... (Ketik untuk filter)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="odoo-search-input"
                        autoFocus
                    />
                    {searchQuery && (
                        <button className="odoo-clear-btn" onClick={() => setSearchQuery('')}>✕</button>
                    )}
                </div>

                <div className="odoo-top-actions">
                    <button className="odoo-icon-btn" onClick={toggleTheme} title="Ganti Tema">
                        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                    </button>

                    <div className="odoo-user-profile">
                        <div className="odoo-avatar">
                            {user?.first_name ? user.first_name[0].toUpperCase() : user?.username?.[0]?.toUpperCase() || 'U'}
                            <span className="odoo-online-dot"></span>
                        </div>
                        <div className="odoo-user-details">
                            <span className="odoo-user-name">{user?.first_name || user?.username}</span>
                            <span className="odoo-user-role">{user?.role_label || user?.role || 'Karyawan'}</span>
                        </div>
                    </div>

                    <button className="odoo-logout-btn" onClick={logout} title="Logout">
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* Main App Grid Canvas */}
            <main className="odoo-canvas">
                <div className="odoo-welcome-banner">
                    <h1>Selamat Datang, <strong>{user?.first_name || user?.username}</strong></h1>
                    <p>Pilih modul aplikasi di bawah untuk memulai pekerjaan Anda hari ini.</p>
                </div>

                <div className="odoo-app-grid">
                    {visibleApps.map((app) => {
                        const IconComponent = app.icon;
                        const isHovered = activeHoverApp === app.id;

                        return (
                            <div
                                key={app.id}
                                className={`odoo-app-card ${isHovered ? 'hovered' : ''}`}
                                onMouseEnter={() => setActiveHoverApp(app.id)}
                                onMouseLeave={() => setActiveHoverApp(null)}
                            >
                                <div
                                    className="odoo-app-tile-wrapper"
                                    onClick={() => handleAppClick(app)}
                                >
                                    <div className="odoo-app-tile" style={{ background: app.gradient }}>
                                        <IconComponent size={38} className="odoo-tile-icon" strokeWidth={2} />
                                    </div>
                                    <span className="odoo-app-name">{app.name}</span>
                                    <span className="odoo-app-sub">{app.subtitle}</span>
                                </div>

                                {/* Flyout Quick Submenu on Hover */}
                                {app.submenus && app.submenus.length > 1 && (
                                    <div className="odoo-submenus-flyout">
                                        <div className="odoo-flyout-header">
                                            <Sparkles size={13} style={{ color: '#38bdf8' }} /> {app.name}
                                        </div>
                                        <div className="odoo-flyout-list">
                                            {app.submenus.map((sub, idx) => (
                                                <button
                                                    key={idx}
                                                    className="odoo-flyout-item"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(sub.path);
                                                    }}
                                                >
                                                    <span>{sub.label}</span>
                                                    <ChevronRight size={13} className="arrow" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {visibleApps.length === 0 && (
                    <div className="odoo-empty-search">
                        <p>Tidak ada modul yang cocok dengan kata kunci &quot;<strong>{searchQuery}</strong>&quot;</p>
                        <button className="odoo-reset-search-btn" onClick={() => setSearchQuery('')}>
                            Tampilkan Semua Modul
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
