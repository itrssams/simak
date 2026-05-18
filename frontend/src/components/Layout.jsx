import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axiosConfig';

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
    chevron: { icon: ChevronDown, size: 15 },
    logout: { icon: LogOut, size: 16 },
    menu: { icon: Menu, size: 20 },
    driver: { icon: CarFront, size: 18 },
    audit: { icon: FileClock, size: 18 },
    it: { icon: MonitorCog, size: 18 },
    announcement: { icon: Megaphone, size: 18 },
};

const renderIcon = (iconKey, overrideSize) => {
    const config = IconConfig[iconKey];
    if (!config) return null;
    const IconComponent = config.icon;
    return <IconComponent size={overrideSize || config.size} strokeWidth={2.15} />;
};

const MENU_MANAJER_DIREKTUR = [
    { label: 'Dashboard', path: '/', icon: 'dashboard' },
    { label: 'Audit Log', path: '/audit-log', icon: 'audit' },
    { label: 'Pengumuman', path: '/pengumuman', icon: 'announcement' },
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

function getMenuItems(user) {
    const role = user?.role;
    const base = [];
    if (user?.is_superuser) return uniqueMenus([...MENU_MANAJER_DIREKTUR, ...MENU_DIREKTUR_ONLY, ...MENU_IT]);
    if (role === 'direktur' || role === 'wakil_direktur') base.push(...MENU_MANAJER_DIREKTUR, ...MENU_DIREKTUR_ONLY);
    else if (role === 'manajer') base.push(...MENU_MANAJER_DIREKTUR);
    else base.push(...MENU_KARYAWAN_KASIR);
    if (user?.is_driver) base.push(...MENU_DRIVER);
    if (user?.is_it) base.push(...MENU_IT);
    return uniqueMenus(base);
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

const SIDEBAR_OPEN_W = 284;
const SIDEBAR_CLOSED_W = 84;
const TOPBAR_H = 62;

function SidebarItem({ item, location, onClose, collapsed, index }) {
    const isChildActive = item.children?.some(c => c.path === location.pathname);
    const isActive = item.path ? location.pathname === item.path : isChildActive;
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
                        const childActive = location.pathname === child.path;
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
    const profileRef = useRef(null);
    const announcementRef = useRef(null);

    const menuItems = getMenuItems(user);
    const featureLabels = [user?.is_driver ? 'Driver' : '', user?.is_it ? 'IT' : ''].filter(Boolean);
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
                body { font-family: 'Plus Jakarta Sans', sans-serif; background: #edf3ef; color: #17251d; }
                a { color: inherit; }
                button { font-family: inherit; }
                *:focus { outline: none !important; }
                *:focus-visible { outline: none !important; box-shadow: 0 0 0 3px rgba(26,71,49,.14) !important; }
                ::-webkit-scrollbar { width: 5px; height: 5px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cfdcd5; border-radius: 999px; }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal) {
                    max-height: min(90vh, calc(100vh - 36px)) !important;
                    overflow-y: auto !important;
                    scrollbar-gutter: stable !important;
                    scrollbar-width: thin !important;
                    scrollbar-color: #9aa7a0 transparent !important;
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
                    background: #9aa7a0 !important;
                    background-clip: content-box !important;
                    border: 3px solid transparent !important;
                    border-radius: 999px !important;
                }
                :where(.pc-modal,.dr-modal,.lp-modal,.rb-modal,.mu-modal,.pg-modal,.lpc-modal,.lit-modal,.modal)::-webkit-scrollbar-thumb:hover {
                    background: #6f7f77 !important;
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
                    border-top: 1px solid rgba(225,236,230,.75) !important;
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
                    background: #edf3ef;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }

                .topbar {
                    position: sticky;
                    top: 0;
                    z-index: 200;
                    height: ${TOPBAR_H}px;
                    background: rgba(248,251,249,.94);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border-bottom: 1px solid rgba(213,226,219,.95);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 20px;
                    gap: 16px;
                    box-shadow: 0 8px 24px rgba(15,23,42,.06);
                    flex-shrink: 0;
                }
                .topbar-left,
                .topbar-center,
                .topbar-right {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                }
                .topbar-left {
                    gap: 12px;
                    flex: 1 1 320px;
                }
                .topbar-center {
                    flex: 0 1 360px;
                    justify-content: center;
                }
                .topbar-right {
                    gap: 10px;
                    justify-content: flex-end;
                    flex: 1 1 320px;
                }
                .topbar-btn {
                    width: 38px;
                    height: 38px;
                    padding: 0;
                    border: 1px solid #dce8e2;
                    border-radius: 10px;
                    background: #fff;
                    color: #1a4731;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: background .12s ease, border-color .12s ease;
                    flex-shrink: 0;
                }
                .topbar-btn:hover {
                    background: #eef8f2;
                    border-color: #b9d8c8;
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
                    gap: 11px;
                    min-width: 0;
                    flex: 0 1 auto;
                }
                .topbar-logo {
                    height: 36px;
                    max-width: 82px;
                    object-fit: contain;
                    flex-shrink: 0;
                }
                .topbar-title {
                    font-size: 14px;
                    font-weight: 800;
                    color: #1a4731;
                    line-height: 1.1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .topbar-subtitle {
                    font-size: 10.5px;
                    color: #7b8d85;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .topbar-clock {
                    width: min(100%, 340px);
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                .topbar-date {
                    min-width: 0;
                    color: #64748b;
                    font-size: 12px;
                    font-weight: 800;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .topbar-time {
                    color: #17251d;
                    font-size: 13px;
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
                    background: #c9a84c;
                    margin-right: 10px;
                    vertical-align: 2px;
                }
                .profile-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                    border: 1px solid #dce8e2;
                    border-radius: 999px;
                    background: #fff;
                    padding: 4px 4px 4px 12px;
                    box-shadow: 0 8px 18px rgba(15,23,42,.04);
                }
                .notify-wrap {
                    position: relative;
                    flex-shrink: 0;
                }
                .notify-btn {
                    position: relative;
                    width: 38px;
                    height: 38px;
                    padding: 0;
                    border: 1px solid #dce8e2;
                    border-radius: 10px;
                    background: #fff;
                    color: #1a4731;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background .12s ease, border-color .12s ease;
                }
                .notify-btn:hover { background: #eef8f2; border-color: #b9d8c8; }
                .notify-badge {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    min-width: 18px;
                    height: 18px;
                    padding: 0 5px;
                    border-radius: 999px;
                    background: #dc2626;
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
                    background: #fff;
                    border: 1px solid #e1ece6;
                    border-radius: 16px;
                    box-shadow: 0 18px 45px rgba(15,23,42,.16);
                    animation: fadeInDown .16s ease both;
                    z-index: 340;
                    display: flex;
                    flex-direction: column;
                }
                .notify-head {
                    padding: 14px 16px;
                    border-bottom: 1px solid #edf3ef;
                    background: #f8fbf9;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .notify-title { font-size: 14px; font-weight: 850; color: #17251d; display: flex; align-items: center; gap: 8px; }
                .notify-actions { display: flex; align-items: center; gap: 6px; }
                .notify-mini-btn {
                    border: 1px solid #dce8e2;
                    background: #fff;
                    color: #1a4731;
                    border-radius: 8px;
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
                    border: 1px solid #edf3ef;
                    background: #fff;
                    border-radius: 12px;
                    padding: 11px 12px;
                    margin-bottom: 8px;
                    text-align: left;
                    cursor: pointer;
                    transition: background .12s, border-color .12s;
                }
                .notify-item:hover { background: #fbfdfc; border-color: #cfe8da; }
                .notify-item.unread { background: #f0fdf4; border-color: #b9d8c8; }
                .notify-item-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
                .notify-item-title { color: #17251d; font-size: 13px; font-weight: 850; line-height: 1.3; }
                .notify-priority { border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 850; white-space: nowrap; background: #f1f5f9; color: #475569; }
                .notify-priority.important { background: #fef3c7; color: #92400e; }
                .notify-priority.urgent { background: #fee2e2; color: #b91c1c; }
                .notify-message { font-size: 12.5px; color: #475569; line-height: 1.5; white-space: pre-wrap; }
                .notify-meta { font-size: 11px; color: #94a3b8; margin-top: 8px; display: flex; justify-content: space-between; gap: 10px; }
                .notify-empty { padding: 34px 16px; text-align: center; color: #94a3b8; font-size: 13px; }
                .notify-form { padding: 12px 14px 14px; border-bottom: 1px solid #edf3ef; background: #fff; }
                .notify-form-grid { display: grid; grid-template-columns: 1fr 130px; gap: 8px; margin-bottom: 8px; }
                .notify-input, .notify-select, .notify-textarea {
                    width: 100%;
                    border: 1px solid #dce8e2;
                    border-radius: 9px;
                    background: #fff;
                    color: #17251d;
                    font: inherit;
                    font-size: 12.5px;
                    padding: 9px 10px;
                    outline: none;
                }
                .notify-textarea { min-height: 82px; resize: vertical; line-height: 1.5; margin-bottom: 8px; }
                .notify-audience { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-bottom: 8px; }
                .notify-check { min-height: 34px; display: flex; align-items: center; gap: 7px; border: 1px solid #dce8e2; border-radius: 9px; padding: 7px 9px; font-size: 12px; font-weight: 800; color: #475569; background: #fff; }
                .notify-check input { accent-color: #1a4731; }
                .notify-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 9px; padding: 8px 10px; font-size: 12px; margin-bottom: 8px; }
                .notify-row-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
                .profile-text { text-align: right; }
                .profile-name { font-size: 13px; font-weight: 800; color: #17251d; }
                .profile-role { font-size: 11px; color: #7b8d85; margin-top: 1px; }
                .profile-avatar {
                    width: 34px;
                    height: 34px;
                    padding: 0;
                    border-radius: 999px;
                    background: linear-gradient(135deg, #1a4731, #2d6a4f);
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
                    background: linear-gradient(135deg, #236348, #2d6a4f);
                }
                .profile-menu {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 10px;
                    background: #fff;
                    border-radius: 14px;
                    min-width: 190px;
                    box-shadow: 0 8px 20px rgba(15,23,42,.12);
                    border: 1px solid #e1ece6;
                    animation: fadeInDown .16s ease both;
                    z-index: 320;
                    overflow: hidden;
                }
                .profile-menu-head {
                    padding: 13px 14px;
                    background: #f8fbf9;
                    border-bottom: 1px solid #edf3ef;
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
                    background: rgba(10,22,16,.42);
                    z-index: 98;
                    animation: overlayIn .18s ease both;
                }
                .sidebar {
                    position: relative;
                    width: var(--sidebar-w);
                    min-width: var(--sidebar-w);
                    background: #0f2419;
                    color: #dbece3;
                    display: flex;
                    flex-direction: column;
                    z-index: 100;
                    flex-shrink: 0;
                    overflow: hidden;
                    transition: width .18s ease, min-width .18s ease, transform .18s ease;
                    will-change: width, min-width, transform;
                    box-shadow: none;
                }
                .sidebar::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: transparent;
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
                    padding: 18px 20px 8px;
                    color: rgba(255,255,255,.38);
                    font-size: 10px;
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
                    padding: 4px 12px 14px;
                }
                .sb-link {
                    position: relative;
                    min-height: 46px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 12px;
                    border-radius: 14px;
                    border: 1px solid transparent;
                    color: rgba(255,255,255,.68);
                    background: transparent;
                    text-decoration: none;
                    text-align: left;
                    font-size: 13.5px;
                    font-weight: 700;
                    line-height: 1;
                    cursor: pointer;
                    margin-bottom: 6px;
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
                    background: linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.08));
                    border-color: rgba(255,255,255,.16);
                    box-shadow: none;
                }
                .sb-link.collapsed {
                    justify-content: center;
                    padding: 10px;
                    gap: 0;
                }
                .sb-active-rail {
                    position: absolute;
                    left: -12px;
                    width: 4px;
                    height: 24px;
                    border-radius: 999px;
                    background: #c9a84c;
                    opacity: 0;
                    transform: scaleY(.35);
                    transition: none;
                }
                .sb-link.active .sb-active-rail {
                    opacity: 1;
                    transform: scaleY(1);
                }
                .sb-icon {
                    width: 24px;
                    min-width: 24px;
                    height: 24px;
                    border-radius: 9px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,.58);
                    transition: color .14s ease, background .14s ease;
                }
                .sb-link:hover .sb-icon,
                .sb-link.active .sb-icon {
                    color: #f4d87a;
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
                    padding-left: 22px;
                    transition: none;
                    opacity: 0;
                }
                .sb-children.open {
                    max-height: 160px;
                    opacity: 1;
                }
                .sb-child {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    padding: 9px 10px 9px 14px;
                    border-radius: 12px;
                    color: rgba(255,255,255,.54);
                    text-decoration: none;
                    font-size: 12.5px;
                    font-weight: 700;
                    margin-bottom: 4px;
                    transition: background .1s ease, color .1s ease;
                }
                .sb-child:hover {
                    color: #fff;
                    background: rgba(255,255,255,.07);
                }
                .sb-child.active {
                    color: #fff;
                    background: rgba(201,168,76,.16);
                }
                .sb-child-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 999px;
                    background: rgba(255,255,255,.24);
                    flex-shrink: 0;
                }
                .sb-child.active .sb-child-dot {
                    background: #c9a84c;
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
                    padding: 28px;
                    overflow-x: hidden;
                }
                .app-footer {
                    background: #0f2419;
                    color: rgba(255,255,255,.52);
                    text-align: center;
                    padding: 12px;
                    font-size: 12px;
                    flex-shrink: 0;
                }

                @media (max-width: 768px) {
                    .topbar {
                        padding: 0 12px;
                        gap: 10px;
                    }
                    .topbar-left { flex: 1 1 auto; gap: 9px; }
                    .topbar-center { display: none; }
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
                    <button className="topbar-btn" onClick={() => setSidebarOpen(o => !o)} aria-label={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}>
                        <Menu size={22} strokeWidth={2.4} />
                    </button>

                    <div className="topbar-brand">
                        <img src="/logo.png" alt="Logo" className="topbar-logo" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        <div style={{ minWidth: 0 }}>
                            <div className="topbar-title">SIMAK</div>
                            <div className="topbar-subtitle">Sistem Manajemen Aset & Keuangan</div>
                        </div>
                    </div>
                </div>

                <div className="topbar-center">
                    <div className="topbar-clock" title={`${formatTopbarDate(currentTime)} ${formatTopbarTime(currentTime)}`}>
                        <span className="topbar-date">{formatTopbarDate(currentTime)}</span>
                        <span className="topbar-time">{formatTopbarTime(currentTime)}</span>
                    </div>
                </div>

                <div className="topbar-right">
                    <div ref={announcementRef} className="notify-wrap">
                        <button className="notify-btn" onClick={openAnnouncements} title="Pengumuman">
                            <Bell size={18} strokeWidth={2.4} />
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
                            <div className="profile-role">{roleLabel}</div>
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
                {isMobile && sidebarOpen && <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}

                <aside
                    className={`sidebar${collapsed ? ' collapsed' : ''}${isMobile && sidebarOpen ? ' mobile-open' : ''}`}
                    style={{ '--sidebar-w': `${sidebarWidth}px` }}
                >
                    <div className="sidebar-inner">
                        <div className="sidebar-section-label">Menu</div>
                        <nav className="sidebar-nav">
                            {menuItems.map((item, index) => (
                                <SidebarItem
                                    key={item.label}
                                    item={item}
                                    location={location}
                                    onClose={closeMobileSidebar}
                                    collapsed={collapsed}
                                    index={index}
                                />
                            ))}
                        </nav>

                    </div>
                </aside>

                <div className="content-shell">
                    <main className="main-content">
                        {children}
                    </main>
                    <footer className="app-footer">
                        RS Siaga Al Munawwarah Samarinda &copy; {new Date().getFullYear()} - Sistem Informasi Keuangan
                    </footer>
                </div>
            </div>
        </div>
    );
}
