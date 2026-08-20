import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
    LayoutGrid,
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
            color: '#10b981',
            glowColor: 'rgba(16, 185, 129, 0.45)',
            glassGlow: 'rgba(16, 185, 129, 0.22)',
            path: '/keuangan/catatan-utang/obat-bhp',
            allowed: Boolean(canCatatanUtang),
        },
        {
            id: 'penagihan-invoice',
            name: 'Penagihan & Invoice',
            icon: ReceiptText,
            color: '#06b6d4',
            glowColor: 'rgba(6, 182, 212, 0.45)',
            glassGlow: 'rgba(6, 182, 212, 0.22)',
            path: '/keuangan/invoices/dashboard',
            allowed: Boolean(isKeuangan),
        },
        {
            id: 'gudang-logistik',
            name: 'Gudang Logistik',
            icon: Package,
            color: '#f59e0b',
            glowColor: 'rgba(245, 158, 11, 0.45)',
            glassGlow: 'rgba(245, 158, 11, 0.22)',
            path: '/logistik/barang',
            allowed: Boolean(isLogistik),
        },
        {
            id: 'petty-cash',
            name: 'Petty Cash',
            icon: WalletCards,
            color: '#22c55e',
            glowColor: 'rgba(34, 197, 94, 0.45)',
            glassGlow: 'rgba(34, 197, 94, 0.22)',
            path: '/petty-cash',
            allowed: true,
        },
        {
            id: 'driver',
            name: 'Driver & Armada',
            icon: CarFront,
            color: '#818cf8',
            glowColor: 'rgba(99, 102, 241, 0.45)',
            glassGlow: 'rgba(99, 102, 241, 0.22)',
            path: '/driver',
            allowed: Boolean(isDriverAccess),
        },
        {
            id: 'akuntansi',
            name: 'Akuntansi & Kas',
            icon: Landmark,
            color: '#c084fc',
            glowColor: 'rgba(168, 85, 247, 0.45)',
            glassGlow: 'rgba(168, 85, 247, 0.22)',
            path: '/dashboard-analytics',
            allowed: Boolean(canAkuntansi),
        },
        {
            id: 'pengumuman',
            name: 'Pengumuman',
            icon: Megaphone,
            color: '#fb7185',
            glowColor: 'rgba(244, 63, 94, 0.45)',
            glassGlow: 'rgba(244, 63, 94, 0.22)',
            path: '/pengumuman',
            allowed: Boolean(isManajerUp),
        },
        {
            id: 'audit-log',
            name: 'Audit Log',
            icon: ShieldCheck,
            color: '#cbd5e1',
            glowColor: 'rgba(148, 163, 184, 0.45)',
            glassGlow: 'rgba(148, 163, 184, 0.22)',
            path: '/audit-log',
            allowed: Boolean(isManajerUp || isIT),
        },
        {
            id: 'manajemen-user',
            name: 'Manajemen User',
            icon: Users,
            color: '#38bdf8',
            glowColor: 'rgba(14, 165, 233, 0.45)',
            glassGlow: 'rgba(14, 165, 233, 0.22)',
            path: '/admin/users',
            allowed: Boolean(isDirekturUp),
        },
        {
            id: 'manajemen-sistem',
            name: 'Manajemen Sistem',
            icon: Server,
            color: '#2dd4bf',
            glowColor: 'rgba(20, 184, 166, 0.45)',
            glassGlow: 'rgba(20, 184, 166, 0.22)',
            path: '/admin/system-maintenance',
            allowed: Boolean(user?.is_superuser),
        },
        {
            id: 'statistik-analitik',
            name: 'Statistik & Analitik',
            icon: BarChart3,
            color: '#a855f7',
            glowColor: 'rgba(168, 85, 247, 0.45)',
            glassGlow: 'rgba(168, 85, 247, 0.22)',
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
                        <LayoutGrid size={20} color="#38bdf8" strokeWidth={2.3} />
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
                        <button className="odoo-modal-close-btn" onClick={onClose} title="Tutup">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="odoo-modal-search">
                    <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Ketik untuk mencari modul..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    {searchQuery && (
                        <button className="odoo-modal-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                    )}
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
                                <div
                                    className="odoo-modal-tile-icon"
                                    style={{
                                        '--glow-color': app.glowColor,
                                        '--glass-glow': app.glassGlow,
                                    }}
                                >
                                    <div className="odoo-tile-shine" />
                                    <Icon size={28} color={app.color} strokeWidth={2.1} />
                                </div>
                                <span className="odoo-modal-tile-name">{app.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
