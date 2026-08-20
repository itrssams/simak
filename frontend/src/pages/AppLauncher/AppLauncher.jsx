import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    LogOut,
    Sun,
    Moon,
    ChevronRight,
    Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AppLauncher.css';

// ── Luxury Vector Icons for Each Module ─────────────────────────────────

const IconCatatanUtang = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="5" width="34" height="38" rx="8" fill="white" fillOpacity="0.22" />
        <rect x="7" y="5" width="34" height="38" rx="8" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M14 14H34M14 20H34M14 26H25" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="32" cy="31" r="7" fill="#34D399" />
        <path d="M29 31L31 33L35 29" stroke="#064E3B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconPenagihanInvoice = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 8C10 6.34315 11.3431 5 13 5H29L38 14V40C38 41.6569 36.6569 43 35 43H13C11.3431 43 10 41.6569 10 40V8Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M28 5V14H37" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M16 22H32M16 28H28M16 34H24" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
);

const IconGudangLogistik = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6L40 15V33L24 42L8 33V15L24 6Z" fill="white" fillOpacity="0.18" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M24 6V24M24 24L40 15M24 24L8 15" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 24V42" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16 10.5L32 19.5" stroke="white" strokeWidth="1.8" strokeOpacity="0.6" strokeLinecap="round" />
    </svg>
);

const IconPettyCash = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="11" width="36" height="26" rx="6" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M6 18H42" stroke="white" strokeWidth="2" strokeOpacity="0.5" />
        <circle cx="24" cy="27" r="5" fill="#FDE047" fillOpacity="0.9" />
        <path d="M24 24.5V29.5M22 26H26" stroke="#854D0E" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const IconDriverArmada = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 26L12 12C12.5 10.5 14 9.5 16 9.5H32C34 9.5 35.5 10.5 36 12L40 26V36C40 37.1 39.1 38 38 38H36C34.9 38 34 37.1 34 36V34H14V36C14 37.1 13.1 38 12 38H10C8.9 38 8 37.1 8 36V26Z" fill="white" fillOpacity="0.22" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="14" cy="28" r="3" fill="white" />
        <circle cx="34" cy="28" r="3" fill="white" />
        <path d="M12 21H36L33 14H15L12 21Z" fill="white" fillOpacity="0.4" />
    </svg>
);

const IconAkuntansiKas = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="6" width="34" height="36" rx="8" fill="white" fillOpacity="0.18" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M15 33L33 15" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <circle cx="18" cy="18" r="4.5" fill="#38BDF8" />
        <circle cx="30" cy="30" r="4.5" fill="#F472B6" />
    </svg>
);

const IconPengumuman = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 20V28H14L26 36V12L14 20H8Z" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M31 16C33.5 18.5 35 21.5 35 24C35 26.5 33.5 29.5 31 32" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M36 11C40 15 42 19.5 42 24C42 28.5 40 33 36 37" stroke="white" strokeWidth="2.2" strokeOpacity="0.7" strokeLinecap="round" />
        <path d="M14 28V38H19V28" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5" />
    </svg>
);

const IconAuditLog = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 5L38 10V22C38 31.5 32 39.5 24 43C16 39.5 10 31.5 10 22V10L24 5Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="24" cy="24" r="8" stroke="white" strokeWidth="2" />
        <path d="M24 20V24L27 26" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const IconManajemenUser = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="16" r="6" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5" />
        <path d="M9 36C9 30 14 26 20 26C26 26 31 30 31 36" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="34" cy="20" r="4" fill="#38BDF8" />
        <path d="M30 34C30 31 32 28.5 35 28.5" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const IconManajemenSistem = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="32" height="12" rx="4" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <rect x="8" y="28" width="32" height="12" rx="4" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="14" cy="14" r="2" fill="#34D399" />
        <circle cx="20" cy="14" r="2" fill="white" fillOpacity="0.6" />
        <circle cx="14" cy="34" r="2" fill="#34D399" />
        <circle cx="20" cy="34" r="2" fill="white" fillOpacity="0.6" />
        <path d="M32 20V28M28 24L32 28L36 24" stroke="#6EE7B7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconStatistikAnalitik = () => (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="7" width="14" height="14" rx="4" fill="#38BDF8" fillOpacity="0.9" />
        <rect x="27" y="7" width="14" height="14" rx="4" fill="#F472B6" fillOpacity="0.9" />
        <rect x="7" y="27" width="14" height="14" rx="4" fill="#FBBF24" fillOpacity="0.9" />
        <rect x="27" y="27" width="14" height="14" rx="4" fill="#34D399" fillOpacity="0.9" />
    </svg>
);

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

    // Master App List with Rich Color Palettes
    const allApps = useMemo(() => [
        {
            id: 'catatan-utang',
            name: 'Catatan Utang',
            subtitle: 'Obat, BHP & Logistik',
            iconComponent: IconCatatanUtang,
            gradient: 'linear-gradient(145deg, #10b981 0%, #059669 60%, #047857 100%)',
            glowColor: 'rgba(16, 185, 129, 0.45)',
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
            iconComponent: IconPenagihanInvoice,
            gradient: 'linear-gradient(145deg, #06b6d4 0%, #0284c7 50%, #1d4ed8 100%)',
            glowColor: 'rgba(6, 182, 212, 0.45)',
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
            iconComponent: IconGudangLogistik,
            gradient: 'linear-gradient(145deg, #f59e0b 0%, #ea580c 60%, #c2410c 100%)',
            glowColor: 'rgba(245, 158, 11, 0.45)',
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
            iconComponent: IconPettyCash,
            gradient: 'linear-gradient(145deg, #22c55e 0%, #16a34a 60%, #15803d 100%)',
            glowColor: 'rgba(34, 197, 94, 0.45)',
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
            iconComponent: IconDriverArmada,
            gradient: 'linear-gradient(145deg, #6366f1 0%, #4f46e5 60%, #3730a3 100%)',
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
            iconComponent: IconAkuntansiKas,
            gradient: 'linear-gradient(145deg, #a855f7 0%, #7c3aed 60%, #5b21b6 100%)',
            glowColor: 'rgba(168, 85, 247, 0.45)',
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
            iconComponent: IconPengumuman,
            gradient: 'linear-gradient(145deg, #f43f5e 0%, #e11d48 60%, #be123c 100%)',
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
            iconComponent: IconAuditLog,
            gradient: 'linear-gradient(145deg, #64748b 0%, #475569 60%, #334155 100%)',
            glowColor: 'rgba(100, 116, 139, 0.45)',
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
            iconComponent: IconManajemenUser,
            gradient: 'linear-gradient(145deg, #0ea5e9 0%, #0284c7 60%, #0369a1 100%)',
            glowColor: 'rgba(14, 165, 233, 0.45)',
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
            iconComponent: IconManajemenSistem,
            gradient: 'linear-gradient(145deg, #10b981 0%, #0d9488 60%, #115e59 100%)',
            glowColor: 'rgba(16, 185, 129, 0.45)',
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
            iconComponent: IconStatistikAnalitik,
            gradient: 'linear-gradient(145deg, #8b5cf6 0%, #7c3aed 60%, #6d28d9 100%)',
            glowColor: 'rgba(139, 92, 246, 0.45)',
            path: '/dashboard-analytics',
            allowed: Boolean(isManajerUp),
            submenus: [
                { label: 'Ringkasan Dashboard', path: '/dashboard-analytics' },
            ],
        },
    ], [canCatatanUtang, isKeuangan, isLogistik, isDriverAccess, isManajerUp, isIT, isDirekturUp, user?.is_superuser]);

    // Filter by search query
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
                        const IconComp = app.iconComponent;
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
                                    <div
                                        className="odoo-app-tile"
                                        style={{
                                            background: app.gradient,
                                            '--glow-color': app.glowColor,
                                        }}
                                    >
                                        <div className="odoo-tile-shine"></div>
                                        <IconComp />
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
