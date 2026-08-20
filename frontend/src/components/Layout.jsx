import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
    Bell,
    LayoutDashboard,
    Users,
    Building2,
    BookOpen,
    ArrowRightLeft,
    BarChart3,
    WalletCards,
    Landmark,
    UserCog,
    ChevronDown,
    LogOut,
    Menu,
    CarFront,
    FileClock,
    MonitorCog,
    Megaphone,
    Package,
    HandCoins,
    ReceiptText,
    Sun,
    Moon,
    ShieldCheck,
    LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axiosConfig';
import AppSwitcherModal from './AppSwitcherModal';

const IconConfig = {
    dashboard: { icon: LayoutDashboard, size: 18 },
    pelanggan: { icon: Users, size: 18 },
    pemasok: { icon: Building2, size: 18 },
    akuntansi: { icon: BookOpen, size: 18 },
    transaksi: { icon: ArrowRightLeft, size: 18 },
    laporan: { icon: BarChart3, size: 18 },
    pettycash: { icon: WalletCards, size: 18 },
    rekening: { icon: Landmark, size: 18 },
    users: { icon: UserCog, size: 18 },
    system: { icon: ShieldCheck, size: 18 },
    chevron: { icon: ChevronDown, size: 15 },
    logout: { icon: LogOut, size: 16 },
    menu: { icon: Menu, size: 20 },
    driver: { icon: CarFront, size: 18 },
    audit: { icon: FileClock, size: 18 },
    it: { icon: MonitorCog, size: 18 },
    announcement: { icon: Megaphone, size: 18 },
    inventory: { icon: Package, size: 18 },
    finance: { icon: HandCoins, size: 18 },
    invoice: { icon: ReceiptText, size: 18 },
    debt: { icon: FileClock, size: 18 },
};

const renderIcon = (iconKey, overrideSize) => {
    const config = IconConfig[iconKey];
    if (!config) return null;
    const IconComponent = config.icon;
    return <IconComponent size={overrideSize || config.size} strokeWidth={2.15} />;
};

const MENU_SUPERUSER_ONLY = [
    { label: 'Manajemen Sistem', path: '/admin/system-maintenance', icon: 'system' },
];

const MENU_MANAJER_DIREKTUR = [
    { label: 'Dashboard', path: '/', icon: 'dashboard' },
    { label: 'Audit Log', path: '/audit-log', icon: 'audit' },
    { label: 'Pengumuman', path: '/pengumuman', icon: 'announcement' },
    { label: 'Inventaris', path: '/inventaris', icon: 'inventory' },
    { label: 'Driver', path: '/driver', icon: 'driver' },
    { label: 'Petty Cash', path: '/petty-cash', icon: 'pettycash' },
    {
        label: 'Laporan', icon: 'laporan', children: [
            { label: 'Laporan Petty Cash', path: '/laporan/petty-cash' },
        ],
    },
];
const MENU_DIREKTUR_ONLY = [
    { label: 'Manajemen User', path: '/admin/users', icon: 'users' },
];
const MENU_KARYAWAN_KASIR = [
    { label: 'Petty Cash', path: '/petty-cash', icon: 'pettycash' },
];
const MENU_KEPALA_SEKSI = [
    { label: 'Petty Cash', path: '/petty-cash', icon: 'pettycash' },
    { label: 'Inventaris', path: '/inventaris', icon: 'inventory' },
];
const MENU_DRIVER = [
    { label: 'Petty Cash', path: '/petty-cash', icon: 'pettycash' },
    { label: 'Driver', path: '/driver', icon: 'driver' },
];
const MENU_IT = [
    { label: 'IT Center', path: '/it', icon: 'it' },
    { label: 'Audit Log', path: '/audit-log', icon: 'audit' },
    { label: 'Petty Cash', path: '/petty-cash', icon: 'pettycash' },
    {
        label: 'Laporan', icon: 'laporan', children: [
            { label: 'Laporan IT', path: '/laporan/it' },
        ],
    },
];
const MENU_KEUANGAN = [
    {
        label: 'Penagihan', icon: 'invoice', children: [
            { label: 'Dashboard Invoice', path: '/keuangan/invoices/dashboard' },
            { label: 'Daftar Kunjungan', path: '/keuangan/kunjungan-invoice' },
            { label: 'Daftar Invoice', path: '/keuangan/invoices' },
            { label: 'Verifikasi Pembayaran', path: '/keuangan/invoices/verifikasi' },
            { label: 'Alokasi Pembiayaan', path: '/keuangan/alokasi-pembiayaan' },
            { label: 'Master Pembiayaan', path: '/keuangan/master-pembiayaan' },
        ],
    },
];
const MENU_CATATAN_UTANG = [
    {
        label: 'Catatan Utang', icon: 'debt', children: [
            { label: 'Daftar Catatan', path: '/keuangan/catatan-utang/obat-bhp' },
            { label: 'Master Vendor', path: '/logistik/vendor?sumber=semua' },
        ],
    },
];
const MENU_LOGISTIK = [
    {
        label: 'Gudang Logistik', icon: 'inventory', children: [
            { label: 'Daftar Barang', path: '/logistik/barang' },
            { label: 'Master Vendor', path: '/logistik/vendor?sumber=logistik' },
            { label: 'SPB', path: '/logistik/spb' },
            { label: 'Penerimaan', path: '/logistik/penerimaan' },
            { label: 'Permintaan & Barang Keluar', path: '/logistik/permintaan' },
            { label: 'Stok Minimum', path: '/logistik/stok-minimum' },
            { label: 'Kartu Stok', path: '/logistik/kartu-stok' },
            { label: 'Opname', path: '/logistik/opname' },
        ],
    },
];

const FEATURE_INVENTARIS_ENABLED = false;
const FEATURE_IT_ENABLED = false;
const MENU_ORDER = ['Dashboard', 'Penagihan', 'Catatan Utang', 'Gudang Logistik', 'Petty Cash', 'Driver', 'Laporan', 'Pengumuman', 'Audit Log', 'Manajemen User', 'Manajemen Sistem'];

function uniqueMenus(items) {
    const result = [];
    const indexByKey = new Map();
    items.forEach((item) => {
        const key = item.path || item.label;
        const existingIndex = indexByKey.get(key);
        if (existingIndex !== undefined) {
            const existing = result[existingIndex];
            if (existing.children || item.children) {
                const childMap = new Map((existing.children || []).map((child) => [child.path || child.label, child]));
                (item.children || []).forEach((child) => childMap.set(child.path || child.label, child));
                result[existingIndex] = { ...existing, ...item, children: Array.from(childMap.values()) };
            }
            return;
        }
        indexByKey.set(key, result.length);
        result.push(item);
    });
    return result;
}

function filterDisabledMenus(items) {
    return items.flatMap((item) => {
        if (!FEATURE_INVENTARIS_ENABLED && item.path === '/inventaris') return [];
        if (!FEATURE_IT_ENABLED && (item.path === '/it' || item.path === '/laporan/it')) return [];
        if (!item.children) return [item];

        const children = filterDisabledMenus(item.children);
        if (children.length === 0) return [];
        return [{ ...item, children }];
    });
}

function orderMenus(items) {
    const orderOf = (label) => {
        const index = MENU_ORDER.indexOf(label);
        return index === -1 ? MENU_ORDER.length : index;
    };
    return [...items].sort((a, b) => orderOf(a.label) - orderOf(b.label));
}

function getMenuItems(user) {
    const role = user?.role;
    const base = [];
    if (user?.is_superuser) return orderMenus(filterDisabledMenus(uniqueMenus([...MENU_SUPERUSER_ONLY, ...MENU_MANAJER_DIREKTUR, ...MENU_DIREKTUR_ONLY, ...MENU_IT, ...MENU_KEUANGAN, ...MENU_CATATAN_UTANG, ...MENU_LOGISTIK])));
    if (role === 'direktur' || role === 'wakil_direktur') base.push(...MENU_MANAJER_DIREKTUR, ...MENU_DIREKTUR_ONLY);
    else if (role === 'manajer') base.push(...MENU_MANAJER_DIREKTUR);
    else if (role === 'kepala_seksi') base.push(...MENU_KEPALA_SEKSI);
    else base.push(...MENU_KARYAWAN_KASIR);
    if (user?.is_driver) base.push(...MENU_DRIVER);
    if (user?.is_it) base.push(...MENU_IT);
    if (user?.is_keuangan) base.push(...MENU_KEUANGAN);
    if (user?.akses_catatan_utang) base.push(...MENU_CATATAN_UTANG);
    if (user?.is_logistik || isManajerUp(user)) base.push(...MENU_LOGISTIK);
    return orderMenus(filterDisabledMenus(uniqueMenus(base)));
}

const ROLE_LABEL = {
    karyawan: 'Karyawan',
    kepala_seksi: 'Kepala Seksi',
    manajer: 'Manajer',
    wakil_direktur: 'Wakil Direktur',
    direktur: 'Direktur',
};

const isManajerUp = (user) => user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatTopbarDate = (value) => value.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
});

const formatTopbarTime = (value) => value.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

const SIDEBAR_OPEN_W = 236;
const SIDEBAR_CLOSED_W = 64;
const TOPBAR_H = 52;

function SidebarItem({ item, location, onClose, collapsed, index }) {
    const matchPath = (path) => {
        if (!path) return false;
        if (path === '/keuangan/invoices') return location.pathname === path || /^\/keuangan\/invoices\/\d+/.test(location.pathname);
        return location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));
    };
    const isChildActive = item.children?.some(c => matchPath(c.path));
    const isActive = item.path ? matchPath(item.path) : isChildActive;
    const [open, setOpen] = useState(isChildActive);
    const expanded = open || isChildActive;

    const label = item.label;

    if (!item.children) {
        return (
            <Link
                to={item.path}
                onClick={onClose}
                className={`sb-link${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`}
                style={{ '--delay': `${index * 32}ms` }}
                title={collapsed ? label : undefined}
            >
                <span className="sb-active-rail" />
                <span className="sb-icon">{renderIcon(item.icon)}</span>
                <span className="sb-label">{label}</span>
            </Link>
        );
    }

    return (
        <div className={`sb-group${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`} style={{ '--delay': `${index * 32}ms` }}>
            <button
                className={`sb-link sb-group-btn${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`}
                onClick={() => {
                    if (!collapsed) setOpen(v => !v);
                }}
                title={collapsed ? label : undefined}
                type="button"
            >
                <span className="sb-active-rail" />
                <span className="sb-icon">{renderIcon(item.icon)}</span>
                <span className="sb-label">{label}</span>
                <span className={`sb-chevron${expanded ? ' open' : ''}`}>{renderIcon('chevron')}</span>
            </button>

            {!collapsed && (
                <div className={`sb-children${expanded ? ' open' : ''}`}>
                    {item.children.map((child) => {
                        if (child.disabled) {
                            return (
                                <span key={child.label} className="sb-child disabled" title="Belum aktif">
                                    <span className="sb-child-dot" />
                                    <span>{child.label}</span>
                                </span>
                            );
                        }
                        const childActive = matchPath(child.path);
                        return (
                            <Link
                                key={child.path}
                                to={child.path}
                                onClick={onClose}
                                className={`sb-child${childActive ? ' active' : ''}`}
                            >
                                <span className="sb-child-dot" />
                                <span>{child.label}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Odoo-Style Active Module & Horizontal Submenus Config ─────────────────
const getActiveModuleConfig = (pathname) => {
    // Akuntansi & Keuangan Umum
    if (
        pathname.startsWith('/akuntansi') ||
        pathname.startsWith('/pelanggan') ||
        pathname.startsWith('/pemasok') ||
        pathname.startsWith('/transaksi') ||
        pathname.startsWith('/laporan/arus-kas') ||
        pathname.startsWith('/rekening-bank') ||
        pathname.startsWith('/dashboard-analytics')
    ) {
        return {
            id: 'akuntansi',
            title: 'Akuntansi',
            iconColor: '#a855f7',
            menus: [
                { label: 'Dashboard', path: '/dashboard-analytics' },
                {
                    label: 'Pelanggan',
                    children: [
                        { label: 'Data Pelanggan', path: '/pelanggan' },
                        { label: 'Faktur Pelanggan', path: '/pelanggan/faktur' },
                    ],
                },
                {
                    label: 'Pemasok',
                    children: [
                        { label: 'Data Pemasok', path: '/pemasok' },
                        { label: 'Tagihan Pemasok', path: '/pemasok/tagihan' },
                    ],
                },
                {
                    label: 'Akuntansi',
                    children: [
                        { label: 'Bagan Akun (COA)', path: '/akuntansi/bagan-akun' },
                        { label: 'Entri Jurnal', path: '/akuntansi/entri-jurnal' },
                    ],
                },
                {
                    label: 'Transaksi',
                    children: [
                        { label: 'Input Transaksi', path: '/transaksi/input' },
                        { label: 'Daftar Transaksi', path: '/transaksi/list' },
                    ],
                },
                {
                    label: 'Laporan',
                    children: [
                        { label: 'Laporan Arus Kas', path: '/laporan/arus-kas' },
                    ],
                },
                { label: 'Rekening Bank', path: '/rekening-bank' },
            ],
        };
    }

    // Catatan Utang
    if (pathname.startsWith('/keuangan/catatan-utang')) {
        return {
            id: 'catatan-utang',
            title: 'Catatan Utang',
            iconColor: '#10b981',
            menus: [
                { label: 'Faktur Obat & BHP', path: '/keuangan/catatan-utang/obat-bhp?tab=faktur' },
                { label: 'Pengajuan Pembayaran', path: '/keuangan/catatan-utang/obat-bhp?tab=pengajuan' },
                { label: 'Riwayat Pembayaran', path: '/keuangan/catatan-utang/obat-bhp?tab=history' },
                { label: 'Import Saldo OTS', path: '/keuangan/catatan-utang/import-ots' },
            ],
        };
    }

    // Penagihan & Invoice
    if (pathname.startsWith('/keuangan')) {
        return {
            id: 'penagihan-invoice',
            title: 'Penagihan & Invoice',
            iconColor: '#06b6d4',
            menus: [
                { label: 'Daftar Kunjungan', path: '/keuangan/kunjungan-invoice' },
                { label: 'Dashboard Invoice', path: '/keuangan/invoices/dashboard' },
                { label: 'Daftar Invoice', path: '/keuangan/invoices' },
                { label: 'Verifikasi Pembayaran', path: '/keuangan/invoices/verifikasi' },
                {
                    label: 'Master & Alokasi',
                    children: [
                        { label: 'Master Pembiayaan', path: '/keuangan/master-pembiayaan' },
                        { label: 'Alokasi Pembiayaan', path: '/keuangan/alokasi-pembiayaan' },
                    ],
                },
            ],
        };
    }

    // Gudang Logistik
    if (pathname.startsWith('/logistik')) {
        return {
            id: 'gudang-logistik',
            title: 'Gudang Logistik',
            iconColor: '#f59e0b',
            menus: [
                { label: 'Data Barang', path: '/logistik/barang' },
                { label: 'Stok Minimum', path: '/logistik/stok-minimum' },
                { label: 'Penerimaan', path: '/logistik/penerimaan' },
                { label: 'Pengeluaran', path: '/logistik/pengeluaran' },
                { label: 'Laporan & Mutasi', path: '/logistik/laporan' },
            ],
        };
    }

    // Petty Cash
    if (pathname.startsWith('/petty-cash') || pathname.startsWith('/laporan/petty-cash')) {
        return {
            id: 'petty-cash',
            title: 'Petty Cash',
            iconColor: '#22c55e',
            menus: [
                { label: 'Pengajuan & Kasbon', path: '/petty-cash' },
                { label: 'Laporan Petty Cash', path: '/laporan/petty-cash' },
            ],
        };
    }

    // Driver & Armada
    if (pathname.startsWith('/driver')) {
        return {
            id: 'driver',
            title: 'Driver & Armada',
            iconColor: '#6366f1',
            menus: [
                { label: 'Logbook Perjalanan Driver', path: '/driver' },
            ],
        };
    }

    // Manajemen Sistem
    if (pathname.startsWith('/admin/system-maintenance')) {
        return {
            id: 'system-maintenance',
            title: 'Manajemen Sistem',
            iconColor: '#10b981',
            menus: [
                { label: 'Health & Storage Metrics', path: '/admin/system-maintenance' },
                { label: 'Backup & Restore DB', path: '/admin/system-maintenance' },
                { label: 'Optimasi Tabel MySQL', path: '/admin/system-maintenance' },
            ],
        };
    }

    // Manajemen User
    if (pathname.startsWith('/admin/users')) {
        return {
            id: 'users',
            title: 'Manajemen User',
            iconColor: '#0ea5e9',
            menus: [
                { label: 'Daftar Pengguna & Role', path: '/admin/users' },
            ],
        };
    }

    // Pengumuman
    if (pathname.startsWith('/pengumuman')) {
        return {
            id: 'pengumuman',
            title: 'Pengumuman',
            iconColor: '#f43f5e',
            menus: [
                { label: 'Daftar Pengumuman Internal', path: '/pengumuman' },
            ],
        };
    }

    // Audit Log
    if (pathname.startsWith('/audit-log')) {
        return {
            id: 'audit-log',
            title: 'Audit Log',
            iconColor: '#64748b',
            menus: [
                { label: 'Riwayat Aktivitas User', path: '/audit-log' },
            ],
        };
    }

    return null;
};

// ── Topbar Submenu Item & Dropdown ────────────────────────────────────────
function TopNavSubmenuItem({ item, location, navigate }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open]);

    const hasChildren = Boolean(item.children?.length);
    const isCurrentActive = hasChildren
        ? item.children.some((c) => {
            if (c.path.includes('?')) {
                return (location.pathname + location.search) === c.path;
            }
            return location.pathname === c.path || location.pathname.startsWith(c.path + '/');
        })
        : (item.path.includes('?') ? (location.pathname + location.search) === item.path : location.pathname === item.path);

    if (!hasChildren) {
        return (
            <button
                type="button"
                className={`topbar-menu-item ${isCurrentActive ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
            >
                {item.label}
            </button>
        );
    }

    return (
        <div ref={ref} className={`topbar-menu-dropdown-wrap ${open ? 'open' : ''}`}>
            <button
                type="button"
                className={`topbar-menu-item dropdown-toggle ${isCurrentActive ? 'active' : ''}`}
                onClick={() => setOpen((o) => !o)}
            >
                <span>{item.label}</span>
                <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>

            {open && (
                <div className="topbar-dropdown-menu">
                    {item.children.map((child, cIdx) => {
                        const isChildActive = child.path.includes('?')
                            ? (location.pathname + location.search) === child.path
                            : location.pathname === child.path;
                        return (
                            <button
                                key={cIdx}
                                type="button"
                                className={`topbar-dropdown-link ${isChildActive ? 'active' : ''}`}
                                onClick={() => {
                                    setOpen(false);
                                    navigate(child.path);
                                }}
                            >
                                {child.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [profileOpen, setProfileOpen] = useState(false);
    const [announcementOpen, setAnnouncementOpen] = useState(false);
    const [announcements, setAnnouncements] = useState([]);
    const [announcementUnread, setAnnouncementUnread] = useState(0);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('simak_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    });
    const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
    const profileRef = useRef(null);
    const announcementRef = useRef(null);

    const activeModuleConfig = useMemo(() => getActiveModuleConfig(location.pathname), [location.pathname]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('simak_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const menuItems = getMenuItems(user);
    const featureLabels = [
        user?.is_driver ? 'Driver' : '',
        user?.is_it ? 'IT' : '',
        user?.is_keuangan ? 'Keuangan' : '',
        user?.is_petty_cash_cashier ? 'Kas Petty Cash' : '',
        user?.akses_catatan_utang ? 'Catatan Utang' : '',
        user?.is_logistik ? 'Logistik' : '',
    ].filter(Boolean);
    const baseRoleLabel = ROLE_LABEL[user?.role] || (user?.is_superuser ? 'Superuser' : user?.role || '');
    const roleLabel = featureLabels.length ? `${baseRoleLabel} + ${featureLabels.join(' + ')}` : baseRoleLabel;
    const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username;
    const userInitial = (user?.first_name?.[0] || user?.username?.[0] || '?').toUpperCase();
    const canManageAnnouncements = isManajerUp(user);
    const collapsed = !isMobile && !sidebarOpen;
    const sidebarWidth = collapsed ? SIDEBAR_CLOSED_W : SIDEBAR_OPEN_W;

    useEffect(() => {
        const handle = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            setSidebarOpen(!mobile);
        };
        handle();
        window.addEventListener('resize', handle);
        return () => window.removeEventListener('resize', handle);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileOpen(false);
            }
            if (announcementRef.current && !announcementRef.current.contains(e.target)) {
                setAnnouncementOpen(false);
            }
        };
        if (profileOpen || announcementOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [profileOpen, announcementOpen]);

    const fetchAnnouncements = async () => {
        try {
            const [listRes, countRes] = await Promise.all([
                api.get('/keuangan/announcements/', { params: { page: 1, page_size: 8 } }),
                api.get('/keuangan/announcements/unread-count/'),
            ]);
            const list = Array.isArray(listRes.data) ? listRes.data : listRes.data.results || [];
            setAnnouncements(list);
            setAnnouncementUnread(countRes.data?.unread || 0);
        } catch (err) {
            console.error('Gagal memuat pengumuman', err);
        }
    };

    useEffect(() => {
        if (!user) return undefined;
        fetchAnnouncements();
        const timer = setInterval(fetchAnnouncements, 60000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const openAnnouncements = async () => {
        setAnnouncementOpen((value) => !value);
        setProfileOpen(false);
        if (!announcementOpen) await fetchAnnouncements();
    };

    const markAnnouncementRead = async (item) => {
        if (item.is_read) return;
        try {
            await api.post(`/keuangan/announcements/${item.id}/mark-read/`);
            await fetchAnnouncements();
        } catch (err) {
            console.error('Gagal menandai pengumuman', err);
        }
    };

    const markAllAnnouncementsRead = async () => {
        try {
            await api.post('/keuangan/announcements/mark-all-read/');
            await fetchAnnouncements();
        } catch (err) {
            console.error('Gagal menandai semua pengumuman', err);
        }
    };

    const closeMobileSidebar = () => {
        if (isMobile) setSidebarOpen(false);
    };

    return (
        <div className="app-shell">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                html, body, #root { width: 100%; min-height: 100vh; }
                body {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    background:
                        radial-gradient(circle at 12% 8%, rgba(99,102,241,.16), transparent 28%),
                        radial-gradient(circle at 88% 14%, rgba(6,182,212,.14), transparent 27%),
                        radial-gradient(circle at 52% 92%, rgba(236,72,153,.10), transparent 30%),
                        var(--inv-bg);
                    color: var(--inv-text);
                }
                a { color: inherit; }
                button { font-family: inherit; }
                *:focus { outline: none !important; }
                *:focus-visible { outline: none !important; box-shadow: 0 0 0 3px rgba(99,102,241,.16) !important; }
                ::-webkit-scrollbar { width: 5px; height: 5px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(99,102,241,.28); border-radius: 999px; }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal) {
                    max-height: min(90vh, calc(100vh - 36px)) !important;
                    overflow-y: auto !important;
                    scrollbar-gutter: stable !important;
                    scrollbar-width: thin !important;
                    scrollbar-color: rgba(99,102,241,.56) transparent !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar {
                    width: 11px !important;
                    height: 11px !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar-track {
                    background: transparent !important;
                    border-radius: 999px !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar-thumb {
                    background: rgba(99,102,241,.56) !important;
                    background-clip: content-box !important;
                    border: 3px solid transparent !important;
                    border-radius: 999px !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar-thumb:hover {
                    background: rgba(79,70,229,.72) !important;
                    background-clip: content-box !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar-corner {
                    background: transparent !important;
                }
                :where(.pc-modal-footer,.dr-modal-footer,.lp-modal-footer,.rb-modal-footer,.mu-modal-foot,.pg-modal-foot) {
                    position: sticky !important;
                    bottom: 0 !important;
                    z-index: 5 !important;
                    background: linear-gradient(180deg, rgba(255,255,255,0), #fff 28%) !important;
                    border-top: 1px solid rgba(226,232,240,.78) !important;
                }

                @keyframes sbItemIn {
                    from { opacity: 0; transform: translateX(-12px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-8px) scale(.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes overlayIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .app-shell {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background:
                        radial-gradient(circle at 12% 8%, rgba(99,102,241,.18), transparent 28%),
                        radial-gradient(circle at 88% 10%, rgba(6,182,212,.15), transparent 27%),
                        radial-gradient(circle at 56% 92%, rgba(236,72,153,.10), transparent 28%),
                        var(--inv-bg);
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13.5px;
                }

                .topbar {
                    position: sticky;
                    top: 0;
                    z-index: 200;
                    height: ${TOPBAR_H}px;
                    background: rgba(255,255,255,.78);
                    backdrop-filter: blur(22px);
                    -webkit-backdrop-filter: blur(22px);
                    border-bottom: 1px solid rgba(255,255,255,.70);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 14px;
                    gap: 10px;
                    box-shadow: var(--inv-shadow);
                    flex-shrink: 0;
                }
                .topbar-left,
                .topbar-right {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                }
                .topbar-left {
                    gap: 10px;
                    flex: 1 1 auto;
                    min-width: 0;
                }
                .topbar-right {
                    gap: 8px;
                    justify-content: flex-end;
                    flex: 0 0 auto;
                }
                .topbar-btn {
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border: 1px solid rgba(99,102,241,.16);
                    border-radius: 11px;
                    background: rgba(255,255,255,.72);
                    color: var(--inv-primary-dark);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: background .12s ease, border-color .12s ease;
                    flex-shrink: 0;
                }
                .topbar-btn:hover {
                    background: rgba(238,242,255,.95);
                    border-color: rgba(99,102,241,.32);
                }
                .topbar-btn svg,
                .notify-btn svg,
                .profile-avatar svg {
                    width: auto;
                    height: auto;
                    flex-shrink: 0;
                    display: block;
                    color: currentColor;
                    stroke: currentColor;
                }
                .topbar-brand {
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    min-width: 0;
                    flex: 0 1 auto;
                }
                .topbar-logo {
                    height: 30px;
                    max-width: 72px;
                    object-fit: contain;
                    flex-shrink: 0;
                }
                .topbar-title {
                    font-size: 12.5px;
                    font-weight: 800;
                    color: var(--inv-primary-dark);
                    line-height: 1.1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .topbar-subtitle {
                    font-size: 10px;
                    color: var(--inv-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                /* ── Odoo-Style Topbar App Header & Horizontal Submenus ── */
                .topbar-app-switcher-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid rgba(56, 189, 248, 0.25);
                    background: rgba(56, 189, 248, 0.08);
                    color: #38bdf8;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                }
                .topbar-app-switcher-btn:hover {
                    background: rgba(56, 189, 248, 0.22);
                    color: #ffffff;
                    transform: scale(1.05);
                }

                .topbar-app-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }

                .topbar-app-title-wrap {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    cursor: pointer;
                    padding-right: 12px;
                    border-right: 1px solid rgba(255, 255, 255, 0.14);
                    flex-shrink: 0;
                }
                [data-theme="light"] .topbar-app-title-wrap {
                    border-right-color: rgba(0, 0, 0, 0.12);
                }

                .app-title-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .app-title-text {
                    font-size: 14.5px;
                    font-weight: 850;
                    color: #f8fafc;
                    letter-spacing: -0.2px;
                    white-space: nowrap;
                }
                [data-theme="light"] .app-title-text {
                    color: #0f172a;
                }

                .odoo-horizontal-submenus {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    overflow-x: auto;
                    scrollbar-width: none;
                }
                .odoo-horizontal-submenus::-webkit-scrollbar { display: none; }

                .content-shell.full-width {
                    width: 100%;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .topbar-menu-item {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 5px 9px;
                    border-radius: 7px;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.72);
                    font-size: 12px;
                    font-weight: 650;
                    cursor: pointer;
                    transition: all 0.14s ease;
                    white-space: nowrap;
                    font-family: inherit;
                }
                [data-theme="light"] .topbar-menu-item { color: #475569; }
                .topbar-menu-item:hover {
                    color: #ffffff;
                    background: rgba(255, 255, 255, 0.1);
                }
                [data-theme="light"] .topbar-menu-item:hover {
                    color: #0f172a;
                    background: rgba(0, 0, 0, 0.05);
                }
                .topbar-menu-item.active {
                    color: #38bdf8;
                    background: rgba(56, 189, 248, 0.14);
                    font-weight: 750;
                }
                [data-theme="light"] .topbar-menu-item.active {
                    color: #0284c7;
                    background: rgba(2, 132, 199, 0.12);
                }
                .topbar-menu-dropdown-wrap { position: relative; }
                .topbar-dropdown-menu {
                    position: absolute;
                    top: calc(100% + 6px);
                    left: 0;
                    min-width: 170px;
                    background: rgba(15, 23, 42, 0.96);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 11px;
                    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
                    padding: 6px;
                    z-index: 500;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    animation: fadeInDown 0.15s ease both;
                }
                [data-theme="light"] .topbar-dropdown-menu {
                    background: rgba(255, 255, 255, 0.98);
                    border-color: rgba(226, 232, 240, 0.95);
                    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
                }
                .topbar-dropdown-link {
                    display: flex;
                    align-items: center;
                    padding: 6.5px 11px;
                    border-radius: 7px;
                    border: none;
                    background: transparent;
                    color: #e2e8f0;
                    font-size: 12px;
                    font-weight: 600;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.12s ease;
                    white-space: nowrap;
                    width: 100%;
                    font-family: inherit;
                }
                [data-theme="light"] .topbar-dropdown-link { color: #334155; }
                .topbar-dropdown-link:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #38bdf8;
                    padding-left: 14px;
                }
                [data-theme="light"] .topbar-dropdown-link:hover {
                    background: #f1f5f9;
                    color: #0284c7;
                }
                .topbar-dropdown-link.active {
                    color: #38bdf8;
                    background: rgba(56, 189, 248, 0.14);
                    font-weight: 750;
                }
                [data-theme="light"] .topbar-dropdown-link.active {
                    color: #0284c7;
                    background: rgba(2, 132, 199, 0.12);
                }

                .topbar-clock {
                    width: min(100%, 280px);
                    min-height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                .topbar-date {
                    min-width: 0;
                    color: #64748b;
                    font-size: 11.5px;
                    font-weight: 800;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .topbar-time {
                    color: var(--inv-text);
                    font-size: 12.5px;
                    font-weight: 900;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .topbar-time::before {
                    content: '';
                    display: inline-block;
                    width: 5px;
                    height: 5px;
                    border-radius: 999px;
                    background: linear-gradient(135deg, var(--inv-primary), var(--inv-secondary));
                    margin-right: 8px;
                    vertical-align: 2px;
                }
                .profile-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    flex-shrink: 0;
                    border: 1px solid rgba(99,102,241,.14);
                    border-radius: 999px;
                    background: rgba(255,255,255,.76);
                    padding: 3px 3px 3px 10px;
                    box-shadow: 0 12px 30px rgba(99,102,241,.10);
                }
                .notify-wrap {
                    position: relative;
                    flex-shrink: 0;
                }
                .notify-btn {
                    position: relative;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border: 1px solid rgba(99,102,241,.16);
                    border-radius: 11px;
                    background: rgba(255,255,255,.72);
                    color: var(--inv-primary-dark);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background .12s ease, border-color .12s ease;
                }
                .notify-btn:hover { background: rgba(238,242,255,.95); border-color: rgba(99,102,241,.32); }
                .notify-badge {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    min-width: 18px;
                    height: 18px;
                    padding: 0 5px;
                    border-radius: 999px;
                    background: linear-gradient(135deg, var(--inv-danger), var(--inv-accent));
                    color: #fff;
                    border: 2px solid #fff;
                    font-size: 10px;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .notify-panel {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 10px;
                    width: min(420px, calc(100vw - 24px));
                    max-height: min(72vh, 640px);
                    overflow: hidden;
                    background: rgba(255,255,255,.92);
                    backdrop-filter: blur(22px);
                    -webkit-backdrop-filter: blur(22px);
                    border: 1px solid rgba(255,255,255,.68);
                    border-radius: 18px;
                    box-shadow: 0 24px 60px rgba(15,23,42,.18);
                    animation: fadeInDown .16s ease both;
                    z-index: 340;
                    display: flex;
                    flex-direction: column;
                }
                .notify-head {
                    padding: 14px 16px;
                    border-bottom: 1px solid rgba(226,232,240,.72);
                    background: linear-gradient(135deg, rgba(238,242,255,.80), rgba(236,254,255,.52));
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .notify-title { font-size: 14px; font-weight: 850; color: var(--inv-text); display: flex; align-items: center; gap: 8px; }
                .notify-actions { display: flex; align-items: center; gap: 6px; }
                .notify-mini-btn {
                    border: 1px solid rgba(99,102,241,.16);
                    background: rgba(255,255,255,.74);
                    color: var(--inv-primary-dark);
                    border-radius: 10px;
                    height: 30px;
                    padding: 0 9px;
                    font-size: 11.5px;
                    font-weight: 800;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .notify-list { padding: 8px; overflow-y: auto; }
                .notify-item {
                    width: 100%;
                    border: 1px solid rgba(226,232,240,.72);
                    background: rgba(255,255,255,.72);
                    border-radius: 12px;
                    padding: 11px 12px;
                    margin-bottom: 8px;
                    text-align: left;
                    cursor: pointer;
                    transition: background .12s, border-color .12s;
                }
                .notify-item:hover { background: rgba(238,242,255,.58); border-color: rgba(99,102,241,.22); }
                .notify-item.unread { background: rgba(238,242,255,.76); border-color: rgba(99,102,241,.28); }
                .notify-item-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
                .notify-item-title { color: var(--inv-text); font-size: 13px; font-weight: 850; line-height: 1.3; }
                .notify-priority { border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 850; white-space: nowrap; background: #f1f5f9; color: #475569; }
                .notify-priority.important { background: #fef3c7; color: #92400e; }
                .notify-priority.urgent { background: #fee2e2; color: #b91c1c; }
                .notify-message { font-size: 12.5px; color: #475569; line-height: 1.5; white-space: pre-wrap; }
                .notify-meta { font-size: 11px; color: #94a3b8; margin-top: 8px; display: flex; justify-content: space-between; gap: 10px; }
                .notify-empty { padding: 34px 16px; text-align: center; color: #94a3b8; font-size: 13px; }
                .notify-form { padding: 12px 14px 14px; border-bottom: 1px solid rgba(226,232,240,.72); background: rgba(255,255,255,.82); }
                .notify-form-grid { display: grid; grid-template-columns: 1fr 130px; gap: 8px; margin-bottom: 8px; }
                .notify-input, .notify-select, .notify-textarea {
                    width: 100%;
                    border: 1px solid rgba(226,232,240,.86);
                    border-radius: 11px;
                    background: rgba(255,255,255,.84);
                    color: var(--inv-text);
                    font: inherit;
                    font-size: 12.5px;
                    padding: 9px 10px;
                    outline: none;
                }
                .notify-textarea { min-height: 82px; resize: vertical; line-height: 1.5; margin-bottom: 8px; }
                .notify-audience { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-bottom: 8px; }
                .notify-check { min-height: 34px; display: flex; align-items: center; gap: 7px; border: 1px solid rgba(226,232,240,.86); border-radius: 11px; padding: 7px 9px; font-size: 12px; font-weight: 800; color: #475569; background: rgba(255,255,255,.82); }
                .notify-check input { accent-color: var(--inv-primary); }
                .notify-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 9px; padding: 8px 10px; font-size: 12px; margin-bottom: 8px; }
                .notify-row-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
                .profile-text { text-align: right; }
                .profile-name { font-size: 13px; font-weight: 800; color: var(--inv-text); }
                .profile-role { font-size: 11px; color: var(--inv-muted); margin-top: 1px; }
                .profile-avatar {
                    width: 34px;
                    height: 34px;
                    padding: 0;
                    border-radius: 999px;
                    background: linear-gradient(135deg, var(--inv-primary), #3b82f6, var(--inv-secondary));
                    color: #fff;
                    font-weight: 800;
                    font-size: 13px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: none;
                    transition: background .12s ease;
                }
                .profile-avatar:hover {
                    background: linear-gradient(135deg, var(--inv-primary-dark), #2563eb, var(--inv-secondary));
                }
                .profile-menu {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 10px;
                    background: rgba(255,255,255,.92);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 14px;
                    min-width: 190px;
                    box-shadow: 0 18px 45px rgba(15,23,42,.16);
                    border: 1px solid rgba(255,255,255,.68);
                    animation: fadeInDown .16s ease both;
                    z-index: 320;
                    overflow: hidden;
                }
                .profile-menu-head {
                    padding: 13px 14px;
                    background: linear-gradient(135deg, rgba(238,242,255,.82), rgba(236,254,255,.52));
                    border-bottom: 1px solid rgba(226,232,240,.72);
                }
                .profile-logout {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 14px;
                    border: none;
                    cursor: pointer;
                    color: #dc2626;
                    background: transparent;
                    font-size: 13px;
                    font-weight: 800;
                    text-align: left;
                    transition: background .16s ease;
                }
                .profile-logout:hover { background: #fff1f1; }

                .body-shell {
                    flex: 1;
                    display: flex;
                    min-height: 0;
                    position: relative;
                    overflow: hidden;
                }
                .mobile-overlay {
                    position: fixed;
                    inset: ${TOPBAR_H}px 0 0 0;
                    background:
                        radial-gradient(circle at 15% 10%, rgba(99,102,241,.25), transparent 34%),
                        rgba(15,23,42,.42);
                    z-index: 98;
                    animation: overlayIn .18s ease both;
                }
                .sidebar {
                    position: relative;
                    width: var(--sidebar-w);
                    min-width: var(--sidebar-w);
                    background:
                        radial-gradient(circle at 20% 0%, rgba(99,102,241,.35), transparent 34%),
                        radial-gradient(circle at 95% 20%, rgba(6,182,212,.24), transparent 30%),
                        linear-gradient(180deg, #101632 0%, #161b3f 52%, #111827 100%);
                    color: rgba(255,255,255,.82);
                    display: flex;
                    flex-direction: column;
                    z-index: 100;
                    flex-shrink: 0;
                    overflow: hidden;
                    transition: width .18s ease, min-width .18s ease, transform .18s ease;
                    will-change: width, min-width, transform;
                    box-shadow: 10px 0 35px rgba(15,23,42,.12);
                }
                .sidebar::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background:
                        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,0)),
                        radial-gradient(circle at 15% 98%, rgba(236,72,153,.18), transparent 28%);
                    pointer-events: none;
                }
                .sidebar-inner {
                    position: relative;
                    z-index: 1;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }
                .sidebar.collapsed .sb-label,
                .sidebar.collapsed .sb-chevron,
                .sidebar.collapsed .sidebar-section-label {
                    opacity: 0;
                    pointer-events: none;
                    transform: translateX(-8px);
                }
                .sidebar-section-label {
                    padding: 12px 14px 6px;
                    color: rgba(255,255,255,.48);
                    font-size: 9.5px;
                    font-weight: 800;
                    letter-spacing: .12em;
                    text-transform: uppercase;
                    transition: none;
                }
                .sidebar-nav {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 4px 8px 10px;
                }
                .sb-link {
                    position: relative;
                    min-height: 36px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 7px 8px;
                    border-radius: 9px;
                    border: 1px solid transparent;
                    color: rgba(255,255,255,.68);
                    background: transparent;
                    text-decoration: none;
                    text-align: left;
                    font-size: 12.2px;
                    font-weight: 700;
                    line-height: 1;
                    cursor: pointer;
                    margin-bottom: 4px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    appearance: none;
                    -webkit-appearance: none;
                    transform: translateX(0);
                    opacity: 1;
                    transition: background .1s ease, color .1s ease, border-color .1s ease;
                }
                .sb-link:hover {
                    color: #fff;
                    background: rgba(255,255,255,.08);
                    border-color: rgba(255,255,255,.08);
                }
                .sb-link.active {
                    color: #fff;
                    background: linear-gradient(135deg, rgba(99,102,241,.72), rgba(6,182,212,.46), rgba(255,255,255,.10));
                    border-color: rgba(255,255,255,.20);
                    box-shadow: 0 12px 28px rgba(99,102,241,.18);
                }
                .sb-link.collapsed {
                    justify-content: center;
                    padding: 10px;
                    gap: 0;
                }
                .sb-active-rail {
                    position: absolute;
                    left: -10px;
                    width: 4px;
                    height: 22px;
                    border-radius: 999px;
                    background: linear-gradient(180deg, var(--inv-accent), var(--inv-secondary));
                    opacity: 0;
                    transform: scaleY(.35);
                    transition: none;
                }
                .sb-link.active .sb-active-rail {
                    opacity: 1;
                    transform: scaleY(1);
                }
                .sb-icon {
                    width: 20px;
                    min-width: 20px;
                    height: 20px;
                    border-radius: 8px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,.58);
                    transition: color .14s ease, background .14s ease;
                }
                .sb-link:hover .sb-icon,
                .sb-link.active .sb-icon {
                    color: #ffffff;
                    background: rgba(255,255,255,.08);
                    transform: none;
                }
                .sb-label {
                    min-width: 0;
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    transition: none;
                }
                .sidebar.collapsed .sb-label,
                .sidebar.collapsed .sb-chevron {
                    width: 0;
                    min-width: 0;
                    flex: 0 0 0;
                    overflow: hidden;
                }
                .sb-group-btn {
                    border: none;
                    justify-content: flex-start;
                }
                .sb-chevron {
                    display: inline-flex;
                    transition: transform .1s ease;
                }
                .sb-chevron.open { transform: rotate(180deg); }
                .sb-children {
                    max-height: 0;
                    overflow: hidden;
                    padding-left: 16px;
                    transition: none;
                    opacity: 0;
                }
                .sb-children.open {
                    max-height: 500px;
                    opacity: 1;
                }
                .sb-child {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    padding: 7px 8px 7px 10px;
                    border-radius: 9px;
                    color: rgba(255,255,255,.54);
                    text-decoration: none;
                    font-size: 11.5px;
                    font-weight: 700;
                    margin-bottom: 3px;
                    transition: background .1s ease, color .1s ease;
                }
                .sb-child:hover {
                    color: #fff;
                    background: rgba(255,255,255,.07);
                }
                .sb-child.active {
                    color: #fff;
                    background: rgba(99,102,241,.28);
                }
                .sb-child.disabled {
                    cursor: not-allowed;
                    opacity: .42;
                }
                .sb-child.disabled:hover {
                    color: rgba(255,255,255,.54);
                    background: transparent;
                }
                .sb-child-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 999px;
                    background: rgba(255,255,255,.24);
                    flex-shrink: 0;
                }
                .sb-child.active .sb-child-dot {
                    background: var(--inv-secondary);
                }
                .content-shell {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    transition: none;
                }
                .main-content {
                    flex: 1;
                    padding: 16px;
                    overflow-x: hidden;
                    background:
                        radial-gradient(circle at 18% 10%, rgba(99,102,241,.12), transparent 28%),
                        radial-gradient(circle at 88% 0%, rgba(6,182,212,.10), transparent 24%),
                        transparent;
                }
                .app-footer {
                    background: linear-gradient(135deg, #101632, #161b3f);
                    color: rgba(255,255,255,.68);
                    text-align: center;
                    padding: 12px;
                    font-size: 12px;
                    flex-shrink: 0;
                }

                @media (max-width: 1400px) {
                    .app-shell { font-size: 13px; }
                    .main-content { padding: 14px; }
                    .topbar { padding: 0 12px; }
                }

                @media (max-width: 1200px) {
                    .app-shell { font-size: 12.5px; }
                    .main-content { padding: 12px; }
                    .profile-role { display: none; }
                }

                @media (max-width: 768px) {
                    .topbar {
                        padding: 0 12px;
                        gap: 10px;
                    }
                    .topbar-left { flex: 1 1 auto; gap: 9px; }
                    .topbar-right { flex: 0 0 auto; gap: 8px; }
                    .topbar-subtitle { display: none; }
                    .topbar-logo { height: 32px; max-width: 70px; }
                    .profile-text { display: none; }
                    .profile-wrap {
                        padding: 0;
                        border: none;
                        background: transparent;
                        box-shadow: none;
                    }
                    .profile-avatar { width: 38px; height: 38px; border-radius: 12px; }
                    .notify-panel { right: -54px; }
                    .notify-form-grid, .notify-audience { grid-template-columns: 1fr; }
                    .sidebar {
                        position: fixed;
                        top: ${TOPBAR_H}px;
                        left: 0;
                        height: calc(100vh - ${TOPBAR_H}px);
                        width: ${SIDEBAR_OPEN_W}px !important;
                        min-width: ${SIDEBAR_OPEN_W}px !important;
                        transform: translateX(-105%);
                    }
                    .sidebar.mobile-open {
                        transform: translateX(0);
                        box-shadow: 6px 0 18px rgba(0,0,0,.18);
                    }
                    .main-content { padding: 18px 14px; }
                }
            `}</style>

            <header className="topbar">
                <div className="topbar-left">
                    <button
                        className="topbar-app-switcher-btn"
                        onClick={() => setAppSwitcherOpen(true)}
                        title="Pilih Modul Aplikasi (App Switcher)"
                        type="button"
                    >
                        <LayoutGrid size={19} strokeWidth={2.4} />
                    </button>

                    {activeModuleConfig ? (
                        <div className="topbar-app-header">
                            <div
                                className="topbar-app-title-wrap"
                                onClick={() => navigate(activeModuleConfig.menus[0]?.path || '/')}
                                title={`Modul ${activeModuleConfig.title}`}
                            >
                                <span className="app-title-dot" style={{ background: activeModuleConfig.iconColor }}></span>
                                <span className="app-title-text">{activeModuleConfig.title}</span>
                            </div>

                            <nav className="odoo-horizontal-submenus">
                                {activeModuleConfig.menus.map((item, idx) => (
                                    <TopNavSubmenuItem
                                        key={idx}
                                        item={item}
                                        location={location}
                                        navigate={navigate}
                                    />
                                ))}
                            </nav>
                        </div>
                    ) : (
                        <div className="topbar-app-header">
                            <span className="app-title-text">SIMAK</span>
                        </div>
                    )}
                </div>

                <div className="topbar-right">
                    <button
                        className="notify-btn theme-toggle-btn"
                        onClick={toggleTheme}
                        title={theme === 'dark' ? 'Ganti ke Mode Terang (Light)' : 'Ganti ke Mode Gelap (Dark)'}
                        type="button"
                    >
                        {theme === 'dark' ? <Sun size={17} strokeWidth={2.4} /> : <Moon size={17} strokeWidth={2.4} />}
                    </button>
                    <div ref={announcementRef} className="notify-wrap">
                        <button className="notify-btn" onClick={openAnnouncements} title="Pengumuman">
                            <Bell size={17} strokeWidth={2.4} />
                            {announcementUnread > 0 && <span className="notify-badge">{announcementUnread > 9 ? '9+' : announcementUnread}</span>}
                        </button>
                        {announcementOpen && (
                            <div className="notify-panel">
                                <div className="notify-head">
                                    <div className="notify-title"><Megaphone size={16} /> Pengumuman</div>
                                    <div className="notify-actions">
                                        {canManageAnnouncements && (
                                            <button
                                                className="notify-mini-btn"
                                                onClick={() => {
                                                    setAnnouncementOpen(false);
                                                    navigate('/pengumuman');
                                                }}
                                                type="button"
                                            >
                                                Kelola
                                            </button>
                                        )}
                                        <button className="notify-mini-btn" onClick={markAllAnnouncementsRead} type="button">Baca Semua</button>
                                    </div>
                                </div>

                                <div className="notify-list">
                                    {announcements.length === 0 ? (
                                        <div className="notify-empty">Belum ada pengumuman.</div>
                                    ) : announcements.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`notify-item${item.is_read ? '' : ' unread'}`}
                                            onClick={() => markAnnouncementRead(item)}
                                        >
                                            <div className="notify-item-top">
                                                <div className="notify-item-title">{item.title}</div>
                                                <span className={`notify-priority ${item.priority}`}>{item.priority_label || item.priority}</span>
                                            </div>
                                            <div className="notify-message">{item.message}</div>
                                            <div className="notify-meta">
                                                <span>{item.created_by_name || 'System'}</span>
                                                <span>{formatDateTime(item.created_at || item.publish_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div ref={profileRef} className="profile-wrap">
                        <div className="profile-text">
                            <div className="profile-name">{displayName}</div>
                            <div className="profile-role">{baseRoleLabel}</div>
                        </div>
                        <button className="profile-avatar" onClick={() => setProfileOpen(o => !o)} title={displayName}>
                            {userInitial}
                        </button>

                        {profileOpen && (
                            <div className="profile-menu">
                                <div className="profile-menu-head">
                                    <div className="profile-name">{displayName}</div>
                                    <div className="profile-role">{roleLabel}</div>
                                </div>
                                <button
                                    className="profile-logout"
                                    onClick={() => { setProfileOpen(false); logout(); navigate('/login'); }}
                                >
                                    {renderIcon('logout')}
                                    <span>Keluar</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="body-shell">
                <div className="content-shell full-width">
                    <main className="main-content">
                        {children}
                    </main>
                    <footer className="app-footer">
                        RS Siaga Al Munawwarah Samarinda &copy; {new Date().getFullYear()} - Sistem Informasi Keuangan
                    </footer>
                </div>
            </div>

            {/* Odoo-style 9-Dots App Switcher Modal */}
            <AppSwitcherModal isOpen={appSwitcherOpen} onClose={() => setAppSwitcherOpen(false)} />
        </div>
    );
}

