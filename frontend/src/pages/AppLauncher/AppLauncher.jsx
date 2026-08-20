import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    LogOut,
    Sun,
    Moon,
    FileSpreadsheet,
    ReceiptText,
    Package,
    WalletCards,
    CarFront,
    Landmark,
    Megaphone,
    ShieldCheck,
    Users,
    Server,
    BarChart3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AppLauncher.css';

export default function AppLauncher() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('simak_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark');
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('simak_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
    };

    const isManajerUp = user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);
    const isDirekturUp = user?.is_superuser || ['wakil_direktur', 'direktur'].includes(user?.role);
    const isIT = user?.is_superuser || user?.is_it;
    const isKeuangan = user?.is_superuser || user?.is_keuangan;
    const isLogistik = user?.is_superuser || user?.is_logistik || isManajerUp;
    const canCatatanUtang = user?.is_superuser || user?.akses_catatan_utang;
    const isDriverAccess = user?.is_driver || isManajerUp;

    // Master App List with Rich Color Palettes & Pure Lucide Vector Icons
    const allApps = useMemo(() => [
        {
            id: 'catatan-utang',
            name: 'Catatan Utang',
            subtitle: 'Obat, BHP & Vendor',
            icon: FileSpreadsheet,
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            glowColor: 'rgba(16, 185, 129, 0.45)',
            path: '/keuangan/catatan-utang/obat-bhp',
            allowed: Boolean(canCatatanUtang),
            submenus: [
                { label: 'Daftar Catatan Utang', path: '/keuangan/catatan-utang/obat-bhp' },
                { label: 'Master Vendor', path: '/logistik/vendor?sumber=semua' },
            ],
        },
        {
            id: 'penagihan-invoice',
            name: 'Penagihan & Invoice',
            subtitle: 'Piutang & Verifikasi',
            icon: ReceiptText,
            gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
            glowColor: 'rgba(6, 182, 212, 0.45)',
            path: '/keuangan/invoices/dashboard',
            allowed: Boolean(isKeuangan),
            submenus: [
                { label: 'Dashboard Invoice', path: '/keuangan/invoices/dashboard' },
                { label: 'Daftar Kunjungan Invoice', path: '/keuangan/kunjungan-invoice' },
                { label: 'Daftar Invoice', path: '/keuangan/invoices' },
                { label: 'Verifikasi Pembayaran', path: '/keuangan/invoices/verifikasi' },
                { label: 'Alokasi Pembiayaan', path: '/keuangan/alokasi-pembiayaan' },
                { label: 'Master Pembiayaan', path: '/keuangan/master-pembiayaan' },
            ],
        },
        {
            id: 'gudang-logistik',
            name: 'Gudang Logistik',
            subtitle: 'Stok & Distribusi Barang',
            icon: Package,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            glowColor: 'rgba(245, 158, 11, 0.45)',
            path: '/logistik/barang',
            allowed: Boolean(isLogistik),
            submenus: [
                { label: 'Daftar Barang', path: '/logistik/barang' },
                { label: 'Master Vendor', path: '/logistik/vendor?sumber=logistik' },
                { label: 'SPB', path: '/logistik/spb' },
                { label: 'Penerimaan Barang', path: '/logistik/penerimaan' },
                { label: 'Permintaan & Barang Keluar', path: '/logistik/permintaan' },
                { label: 'Stok Minimum & Alert', path: '/logistik/stok-minimum' },
                { label: 'Kartu Stok', path: '/logistik/kartu-stok' },
                { label: 'Opname', path: '/logistik/opname' },
            ],
        },
        {
            id: 'petty-cash',
            name: 'Petty Cash',
            subtitle: 'Kas Kecil & Pengeluaran',
            icon: WalletCards,
            gradient: 'linear-gradient(135deg, #22c55e 0%, #059669 100%)',
            glowColor: 'rgba(34, 197, 94, 0.45)',
            path: '/petty-cash',
            allowed: true,
            submenus: [
                { label: 'Pengajuan & Kasbon', path: '/petty-cash' },
                ...(isManajerUp ? [{ label: 'Laporan Petty Cash', path: '/laporan/petty-cash' }] : []),
            ],
        },
        {
            id: 'driver',
            name: 'Driver & Armada',
            subtitle: 'Operasional Kendaraan',
            icon: CarFront,
            gradient: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            glowColor: 'rgba(99, 102, 241, 0.45)',
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
            icon: Landmark,
            gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            glowColor: 'rgba(168, 85, 247, 0.45)',
            path: '/dashboard-analytics',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Dashboard', path: '/dashboard-analytics' },
                { label: 'Data Pelanggan', path: '/pelanggan' },
                { label: 'Faktur Pelanggan', path: '/pelanggan/faktur' },
                { label: 'Data Pemasok', path: '/pemasok' },
                { label: 'Tagihan Pemasok', path: '/pemasok/tagihan' },
                { label: 'Bagan Akun (COA)', path: '/akuntansi/bagan-akun' },
                { label: 'Entri Jurnal', path: '/akuntansi/entri-jurnal' },
                { label: 'Input Transaksi', path: '/transaksi/input' },
                { label: 'Daftar Transaksi', path: '/transaksi/list' },
                { label: 'Laporan Arus Kas', path: '/laporan/arus-kas' },
                { label: 'Rekening Bank', path: '/rekening-bank' },
            ],
        },
        {
            id: 'pengumuman',
            name: 'Pengumuman',
            subtitle: 'Broadcast Berita Internal',
            icon: Megaphone,
            gradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
            glowColor: 'rgba(244, 63, 94, 0.45)',
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
            icon: ShieldCheck,
            gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
            glowColor: 'rgba(100, 116, 139, 0.45)',
            path: '/audit-log',
            allowed: Boolean(isManajerUp || isIT),
            submenus: [
                { label: 'Riwayat Aktivitas User', path: '/audit-log' },
            ],
        },
        {
            id: 'users',
            name: 'Manajemen User',
            subtitle: 'Kelola Akun & Hak Akses',
            icon: Users,
            gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            glowColor: 'rgba(14, 165, 233, 0.45)',
            path: '/admin/users',
            allowed: Boolean(isDirekturUp),
            submenus: [
                { label: 'Daftar Pengguna & Role', path: '/admin/users' },
            ],
        },
        {
            id: 'system-maintenance',
            name: 'Manajemen Sistem',
            subtitle: 'Backup Database & Health',
            icon: Server,
            gradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
            glowColor: 'rgba(20, 184, 166, 0.45)',
            path: '/admin/system-maintenance',
            allowed: Boolean(user?.is_superuser),
            submenus: [
                { label: 'Health & Storage Metrics', path: '/admin/system-maintenance' },
                { label: 'Backup & Restore DB', path: '/admin/system-maintenance' },
                { label: 'Optimasi Tabel MySQL', path: '/admin/system-maintenance' },
            ],
        },
        {
            id: 'statistik-analitik',
            name: 'Statistik & Analitik',
            subtitle: 'Executive Summary',
            icon: BarChart3,
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
            glowColor: 'rgba(139, 92, 246, 0.45)',
            path: '/dashboard-analytics',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Dashboard Analytics', path: '/dashboard-analytics' },
            ],
        },
    ], [canCatatanUtang, isKeuangan, isLogistik, isDriverAccess, isManajerUp, isIT, isDirekturUp, user]);

    // Filter apps based on search & permissions
    const visibleApps = useMemo(() => {
        const allowed = allApps.filter(app => app.allowed);
        if (!searchQuery.trim()) return allowed;

        const q = searchQuery.toLowerCase().trim();
        return allowed.filter(app => {
            const matchName = app.name.toLowerCase().includes(q);
            const matchSub = app.subtitle.toLowerCase().includes(q);
            const matchSubmenus = app.submenus?.some(sub => sub.label.toLowerCase().includes(q));
            return matchName || matchSub || matchSubmenus;
        });
    }, [allApps, searchQuery]);

    const handleAppClick = (app) => {
        navigate(app.path);
    };

    return (
        <div className="odoo-launcher-page">
            {/* Topbar Glass Header */}
            <header className="odoo-topbar">
                <div className="topbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <img src="/logo.png" alt="Logo" className="topbar-logo" onError={e => { e.currentTarget.style.display = 'none'; }} />
                    <div>
                        <div className="topbar-title">SIMAK</div>
                        <div className="topbar-subtitle">Sistem Manajemen Aset & Keuangan</div>
                    </div>
                </div>

                <div className="odoo-search-container">
                    <Search size={16} className="odoo-search-icon" />
                    <input
                        type="text"
                        placeholder="Cari modul atau menu..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="odoo-search-input"
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

                        return (
                            <div
                                key={app.id}
                                className="odoo-app-item"
                                onClick={() => handleAppClick(app)}
                            >
                                <div className="odoo-app-tile-wrapper">
                                    <div
                                        className="odoo-app-tile"
                                        style={{
                                            background: app.gradient,
                                            '--glow-color': app.glowColor,
                                        }}
                                    >
                                        <div className="odoo-tile-shine"></div>
                                        <IconComponent
                                            size={38}
                                            color="#ffffff"
                                            strokeWidth={2.0}
                                            className="odoo-tile-icon"
                                        />
                                    </div>
                                    <span className="odoo-app-name">{app.name}</span>
                                    <span className="odoo-app-sub">{app.subtitle}</span>
                                </div>
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
