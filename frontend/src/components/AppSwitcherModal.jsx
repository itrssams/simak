import { useState, useMemo, useEffect } from 'react';
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
    X,
    Home,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AppSwitcherModal.css';

export default function AppSwitcherModal({ isOpen, onClose }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const isManajerUp = user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);
    const isDirekturUp = user?.is_superuser || ['wakil_direktur', 'direktur'].includes(user?.role);
    const isIT = user?.is_superuser || user?.is_it;
    const isKeuangan = user?.is_superuser || user?.is_keuangan;
    const isLogistik = user?.is_superuser || user?.is_logistik || isManajerUp;
    const canCatatanUtang = user?.is_superuser || user?.akses_catatan_utang;
    const canAkuntansi = user?.is_superuser || user?.is_akuntansi;
    const isDriverAccess = user?.is_driver || isManajerUp;

    const allApps = useMemo(() => [
        {
            id: 'catatan-utang',
            name: 'Catatan Utang',
            icon: FileSpreadsheet,
            gradient: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
            path: '/keuangan/catatan-utang/obat-bhp',
            allowed: Boolean(canCatatanUtang),
        },
        {
            id: 'penagihan-invoice',
            name: 'Penagihan & Invoice',
            icon: ReceiptText,
            gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
            path: '/keuangan/kunjungan-invoice',
            allowed: Boolean(isKeuangan),
        },
        {
            id: 'gudang-logistik',
            name: 'Gudang Logistik',
            icon: Package,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            path: '/logistik/barang',
            allowed: Boolean(isLogistik),
        },
        {
            id: 'petty-cash',
            name: 'Petty Cash',
            icon: WalletCards,
            gradient: 'linear-gradient(135deg, #22c55e 0%, #059669 100%)',
            path: '/petty-cash',
            allowed: true,
        },
        {
            id: 'driver',
            name: 'Driver & Armada',
            icon: CarFront,
            gradient: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            path: '/driver',
            allowed: Boolean(isDriverAccess),
        },
        {
            id: 'akuntansi',
            name: 'Akuntansi & Kas',
            icon: BookOpen,
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            path: '/akuntansi/bagan-akun',
            allowed: Boolean(canAkuntansi),
        },
        {
            id: 'pengumuman',
            name: 'Pengumuman',
            icon: Megaphone,
            gradient: 'linear-gradient(135deg, #f43f5e 0%, #db2777 100%)',
            path: '/pengumuman',
            allowed: Boolean(isManajerUp),
        },
        {
            id: 'audit-log',
            name: 'Audit Log',
            icon: FileClock,
            gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
            path: '/audit-log',
            allowed: Boolean(isManajerUp || isIT),
        },
        {
            id: 'manajemen-user',
            name: 'Manajemen User',
            icon: UserCog,
            gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            path: '/admin/users',
            allowed: Boolean(isDirekturUp),
        },
        {
            id: 'manajemen-sistem',
            name: 'Manajemen Sistem',
            icon: ShieldCheck,
            gradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
            path: '/admin/system-maintenance',
            allowed: Boolean(user?.is_superuser),
        },
        {
            id: 'statistik-analitik',
            name: 'Statistik & Analitik',
            icon: LayoutDashboard,
            gradient: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
            path: '/dashboard-analytics',
            allowed: Boolean(canAkuntansi || isManajerUp),
        },
    ], [canCatatanUtang, canAkuntansi, isKeuangan, isLogistik, isDriverAccess, isManajerUp, isIT, isDirekturUp, user]);

    const visibleApps = useMemo(() => {
        return allApps
            .filter((app) => app.allowed)
            .filter((app) => {
                if (!searchQuery.trim()) return true;
                return app.name.toLowerCase().includes(searchQuery.toLowerCase());
            });
    }, [allApps, searchQuery]);

    if (!isOpen) return null;

    return (
        <div className="odoo-modal-backdrop" onClick={onClose}>
            <div className="odoo-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="odoo-modal-header">
                    <div className="odoo-modal-title">
                        <div className="odoo-modal-dots">
                            <span></span><span></span><span></span>
                            <span></span><span></span><span></span>
                            <span></span><span></span><span></span>
                        </div>
                        <h3>Pilih Modul Aplikasi</h3>
                    </div>
                    <div className="odoo-modal-actions-top">
                        <button
                            className="odoo-modal-home-btn"
                            onClick={() => {
                                onClose();
                                navigate('/');
                            }}
                            title="Ke Layar Utama (Home Launcher)"
                        >
                            <Home size={15} /> Layar Utama
                        </button>
                        <button className="odoo-modal-close-btn" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="odoo-modal-search">
                    <Search size={14} style={{ color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Ketik untuk mencari modul..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="odoo-modal-grid">
                    {visibleApps.map((app) => {
                        const Icon = app.icon;
                        return (
                            <button
                                key={app.id}
                                className="odoo-modal-tile-btn"
                                onClick={() => {
                                    onClose();
                                    navigate(app.path);
                                }}
                            >
                                <div className="odoo-modal-tile-icon" style={{ background: app.gradient }}>
                                    <Icon size={26} color="#ffffff" strokeWidth={2} />
                                </div>
                                <span>{app.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
