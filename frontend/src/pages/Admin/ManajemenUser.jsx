import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastState } from '../../context/ToastContext';
import {
    AlertTriangle,
    Building2,
    CheckCircle2,
    Edit3,
    Eye,
    EyeOff,
    KeyRound,
    Layers3,
    Lock,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    UserCog,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { getCount, getResults, pageCount, pageParams, RowSizeSelect } from '../../utils/pagination.jsx';

const ROLE_CHOICES = [
    { value: 'karyawan', label: 'Karyawan' },
    { value: 'kepala_seksi', label: 'Kepala Seksi' },
    { value: 'manajer', label: 'Manajer' },
    { value: 'wakil_direktur', label: 'Wakil Direktur' },
    { value: 'direktur', label: 'Direktur' },
];

const ROLE_META = {
    karyawan: { label: 'Karyawan', bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
    kepala_seksi: { label: 'Kepala Seksi', bg: '#e0f2fe', color: '#075985', border: '#bae6fd' },
    manajer: { label: 'Manajer', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    wakil_direktur: { label: 'Wakil Direktur', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
    direktur: { label: 'Direktur', bg: '#f3e8ff', color: '#6b21a8', border: '#e9d5ff' },
};

const initialForm = {
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    role: 'karyawan',
    is_driver: false,
    is_it: false,
    unit: '',
    password: '',
    is_active: true,
};

const STYLES = `
@keyframes muFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes muFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes muScale { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

.mu-page {
    animation: muFadeUp .35s ease both;
    color: #172033;
}
.mu-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 18px;
}
.mu-title {
    display: flex;
    align-items: center;
    gap: 12px;
}
.mu-title-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #0f5132;
    background: #e7f4ee;
    border: 1px solid #cfe7db;
}
.mu-title h1 {
    font-size: 24px;
    line-height: 1.15;
    margin: 0;
    color: #10251b;
    font-weight: 800;
}
.mu-title p {
    margin: 4px 0 0;
    color: #667085;
    font-size: 13px;
}
.mu-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.mu-btn {
    border: 1px solid transparent;
    height: 38px;
    border-radius: 8px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: transform .15s, box-shadow .15s, background .15s, border-color .15s;
    white-space: nowrap;
}
.mu-btn:hover { transform: translateY(-1px); }
.mu-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.mu-btn.primary {
    background: #155c3b;
    color: #fff;
    box-shadow: 0 8px 18px rgba(21, 92, 59, .18);
}
.mu-btn.primary:hover { background: #104d31; }
.mu-btn.soft {
    background: #fff;
    color: #344054;
    border-color: #d8dee8;
}
.mu-btn.soft:hover { background: #f8fafc; }
.mu-btn.danger {
    background: #dc2626;
    color: #fff;
}
.mu-btn.danger:hover { background: #b91c1c; }
.mu-btn.icon {
    width: 34px;
    height: 34px;
    padding: 0;
    border-color: #e4e7ec;
    background: #fff;
    color: #475467;
}
.mu-btn.icon:hover { background: #f8fafc; }
.mu-btn.icon.danger {
    border-color: #fecaca;
    background: #fff;
    color: #dc2626;
}
.mu-btn.icon.danger:hover { background: #fef2f2; }

.mu-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}
.mu-stat {
    background: #fff;
    border: 1px solid #e9edf3;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    min-height: 78px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
}
.mu-stat p {
    margin: 0;
    color: #667085;
    font-size: 12px;
    font-weight: 700;
}
.mu-stat strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
    color: #101828;
    line-height: 1;
}
.mu-stat span {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
}

.mu-shell {
    background: #fff;
    border: 1px solid #e9edf3;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
    overflow: hidden;
}
.mu-tabs {
    display: flex;
    gap: 2px;
    padding: 8px;
    border-bottom: 1px solid #edf1f6;
    background: #f8fafc;
}
.mu-tab {
    height: 36px;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #667085;
    background: transparent;
    cursor: pointer;
}
.mu-tab.active {
    background: #fff;
    color: #155c3b;
    border-color: #e4e7ec;
    box-shadow: 0 1px 2px rgba(16, 24, 40, .05);
}
.mu-toolbar {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 190px 160px auto;
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid #edf1f6;
    align-items: center;
}
.mu-searchbox {
    position: relative;
}
.mu-searchbox svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #98a2b3;
}
.mu-input,
.mu-select {
    width: 100%;
    height: 38px;
    border: 1px solid #d8dee8;
    border-radius: 8px;
    background: #fff;
    color: #1f2937;
    font-size: 13px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    outline: none;
    padding: 0 12px;
    box-sizing: border-box;
}
.mu-textarea {
    width: 100%;
    min-height: 76px;
    border: 1px solid #d8dee8;
    border-radius: 8px;
    background: #fff;
    color: #1f2937;
    font-size: 13px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    outline: none;
    padding: 10px 12px;
    box-sizing: border-box;
    resize: vertical;
}
.mu-searchbox .mu-input { padding-left: 38px; }
.mu-input:focus,
.mu-select:focus,
.mu-textarea:focus {
    border-color: #155c3b;
    box-shadow: 0 0 0 3px rgba(21, 92, 59, .09);
}
.mu-table-wrap {
    overflow-x: auto;
    width: 100%;
}
.mu-table {
    width: 100%;
    border-collapse: collapse;
}
.mu-table th {
    height: 42px;
    background: #fbfcfe;
    border-bottom: 1px solid #edf1f6;
    padding: 0 14px;
    text-align: left;
    color: #667085;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    white-space: nowrap;
}
.mu-table td {
    border-bottom: 1px solid #f1f4f8;
    padding: 12px 14px;
    color: #344054;
    font-size: 13px;
    vertical-align: middle;
}
.mu-table tr:hover td { background: #fbfcfe; }
.mu-table tr:last-child td { border-bottom: none; }
.mu-user {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
}
.mu-avatar {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: #e7f4ee;
    color: #155c3b;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    flex: 0 0 auto;
}
.mu-user-name {
    font-weight: 800;
    color: #1d2939;
}
.mu-user-sub {
    color: #667085;
    font-size: 12px;
    margin-top: 2px;
}
.mu-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    border-radius: 999px;
    padding: 0 10px;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid transparent;
    white-space: nowrap;
}
.mu-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
}
.mu-row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
}
.mu-empty {
    padding: 54px 18px;
    text-align: center;
    color: #667085;
}
.mu-empty svg {
    color: #98a2b3;
    margin-bottom: 10px;
}
.mu-alert {
    margin-bottom: 14px;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    font-weight: 700;
}
.mu-alert.ok {
    background: #ecfdf3;
    border: 1px solid #abefc6;
    color: #067647;
}
.mu-alert.err {
    background: #fef3f2;
    border: 1px solid #fecdca;
    color: #b42318;
}
.mu-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(15, 23, 42, .58);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    animation: muFade .16s ease both;
    backdrop-filter: blur(3px);
}
.mu-modal {
    width: min(100%, 560px);
    max-height: 92vh;
    overflow: auto;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, .24);
    animation: muScale .18s ease both;
}
.mu-modal.sm { width: min(100%, 430px); }
.mu-modal-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding: 18px 20px;
    border-bottom: 1px solid #edf1f6;
}
.mu-modal-head h2 {
    margin: 0;
    color: #101828;
    font-size: 18px;
    font-weight: 800;
}
.mu-modal-head p {
    margin: 4px 0 0;
    color: #667085;
    font-size: 13px;
}
.mu-modal-body {
    padding: 18px 20px 4px;
}
.mu-modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px 20px;
}
.mu-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
}
.mu-field label {
    color: #475467;
    font-size: 12px;
    font-weight: 800;
}
.mu-grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.mu-check {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #d8dee8;
    border-radius: 8px;
    color: #344054;
    font-size: 13px;
    font-weight: 800;
    background: #fff;
}
.mu-check input { width: 16px; height: 16px; accent-color: #155c3b; }
.mu-password {
    position: relative;
}
.mu-password .mu-input { padding-right: 42px; }
.mu-password button {
    position: absolute;
    right: 4px;
    top: 4px;
}
.mu-note {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.5;
    margin-bottom: 14px;
}

@media (max-width: 960px) {
    .mu-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mu-toolbar { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 680px) {
    .mu-head { flex-direction: column; }
    .mu-actions, .mu-btn.primary { width: 100%; }
    .mu-btn.primary { justify-content: center; }
    .mu-stats { grid-template-columns: 1fr; }
    .mu-toolbar { grid-template-columns: 1fr; }
    .mu-tabs { overflow-x: auto; }
    .mu-grid2 { grid-template-columns: 1fr; gap: 0; }
    .mu-modal-foot { flex-direction: column-reverse; }
    .mu-modal-foot .mu-btn { width: 100%; }
}
`;

export default function ManajemenUser() {
    const { user: currentUser } = useAuth();
    const canManage = ['direktur', 'wakil_direktur'].includes(currentUser?.role) || currentUser?.is_superuser;

    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [userPage, setUserPage] = useState(1);
    const [userPageSize, setUserPageSize] = useState(10);
    const [userTotal, setUserTotal] = useState(0);

    const [modalBuat, setModalBuat] = useState(false);
    const [modalEdit, setModalEdit] = useState(null);
    const [modalPwd, setModalPwd] = useState(null);
    const [modalKonfirm, setModalKonfirm] = useState(null);
    const [modalHapus, setModalHapus] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [pwdForm, setPwdForm] = useState({ password: '', confirm: '' });
    const [showPwd, setShowPwd] = useState(false);

    const [modalUnit, setModalUnit] = useState(false);
    const [modalEditUnit, setModalEditUnit] = useState(null);
    const [modalHapusUnit, setModalHapusUnit] = useState(null);
    const [unitForm, setUnitForm] = useState({ nama: '', is_active: true });

    useEffect(() => {
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userPage, userPageSize, filterRole]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [userRes, unitRes] = await Promise.all([
                api.get('/users/', { params: pageParams(userPage, userPageSize, { role: filterRole || undefined }) }),
                api.get('/users/units/'),
            ]);
            setUsers(getResults(userRes.data));
            setUserTotal(getCount(userRes.data));
            setUnits(getResults(unitRes.data));
        } catch (e) {
            console.error(e);
            setError('Gagal memuat data user.');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3500);
    };

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((u) => {
            const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
            const matchSearch = !q || [u.username, u.email, fullName, u.unit_nama].some((v) => String(v || '').toLowerCase().includes(q));
            const matchRole = filterRole ? u.role === filterRole : true;
            const matchStatus = filterStatus === '' ? true : filterStatus === 'aktif' ? u.is_active : !u.is_active;
            return matchSearch && matchRole && matchStatus;
        });
    }, [users, search, filterRole, filterStatus]);

    const activeUnits = useMemo(() => units.filter((u) => u.is_active), [units]);

    const stats = useMemo(() => {
        const active = users.filter((u) => u.is_active).length;
        const inactive = users.length - active;
        const approvers = users.filter((u) => ['direktur', 'wakil_direktur'].includes(u.role) || u.is_superuser).length;
        return {
            total: users.length,
            active,
            inactive,
            approvers,
            units: units.length,
        };
    }, [users, units]);

    const closeUserModals = () => {
        setModalBuat(false);
        setModalEdit(null);
        setModalPwd(null);
        setModalKonfirm(null);
        setModalHapus(null);
        setError('');
        setShowPwd(false);
    };

    const closeUnitModals = () => {
        setModalUnit(false);
        setModalEditUnit(null);
        setModalHapusUnit(null);
        setError('');
    };

    const openCreateUser = () => {
        setForm(initialForm);
        setError('');
        setShowPwd(false);
        setModalBuat(true);
    };

    const openEditUser = (u) => {
        setForm({
            username: u.username || '',
            email: u.email || '',
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            role: u.role || 'karyawan',
            is_driver: Boolean(u.is_driver),
            is_it: Boolean(u.is_it),
            unit: u.unit || '',
            password: '',
            is_active: u.is_active,
        });
        setError('');
        setModalEdit(u);
    };

    const parseError = (e, fallback) => {
        const data = e.response?.data;
        if (!data) return fallback;
        if (typeof data === 'string') return data;
        if (data.detail || data.error) return data.detail || data.error;
        return Object.entries(data)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`)
            .join(' | ') || fallback;
    };

    const handleBuat = async () => {
        setError('');
        if (!form.username.trim()) return setError('Username wajib diisi.');
        if (!form.password || form.password.length < 6) return setError('Password wajib diisi minimal 6 karakter.');
        if (['karyawan', 'kepala_seksi'].includes(form.role) && !form.unit) return setError('Unit wajib dipilih untuk role Karyawan/Kepala Seksi.');
        setSaving(true);
        try {
            await api.post('/users/', { ...form, username: form.username.trim(), unit: form.unit || null });
            showSuccess(`Akun ${form.username} berhasil dibuat.`);
            closeUserModals();
            setForm(initialForm);
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal membuat akun.'));
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        setError('');
        if (['karyawan', 'kepala_seksi'].includes(form.role) && !form.unit) return setError('Unit wajib dipilih untuk role Karyawan/Kepala Seksi.');
        setSaving(true);
        try {
            await api.patch(`/users/${modalEdit.id}/`, {
                email: form.email,
                first_name: form.first_name,
                last_name: form.last_name,
                role: form.role,
                is_driver: form.is_driver,
                is_it: form.is_it,
                unit: ['karyawan', 'kepala_seksi'].includes(form.role) ? (form.unit || null) : null,
            });
            showSuccess(`Akun ${modalEdit.username} berhasil diupdate.`);
            closeUserModals();
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal mengupdate akun.'));
        } finally {
            setSaving(false);
        }
    };

    const handleResetPwd = async () => {
        setError('');
        if (pwdForm.password.length < 6) return setError('Password minimal 6 karakter.');
        if (pwdForm.password !== pwdForm.confirm) return setError('Konfirmasi password tidak cocok.');
        setSaving(true);
        try {
            await api.post(`/users/${modalPwd.id}/set-password/`, { password: pwdForm.password });
            showSuccess(`Password ${modalPwd.username} berhasil direset.`);
            closeUserModals();
            setPwdForm({ password: '', confirm: '' });
        } catch (e) {
            setError(parseError(e, 'Gagal mereset password.'));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleAktif = async () => {
        setSaving(true);
        try {
            const res = await api.post(`/users/${modalKonfirm.id}/toggle-aktif/`);
            showSuccess(res.data.message || 'Status akun berhasil diubah.');
            closeUserModals();
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal mengubah status akun.'));
        } finally {
            setSaving(false);
        }
    };

    const handleHapus = async () => {
        setSaving(true);
        try {
            await api.delete(`/users/${modalHapus.id}/`);
            showSuccess(`Akun ${modalHapus.username} berhasil dihapus.`);
            closeUserModals();
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal menghapus akun.'));
        } finally {
            setSaving(false);
        }
    };

    const handleBuatUnit = async () => {
        setError('');
        if (!unitForm.nama.trim()) return setError('Nama unit wajib diisi.');
        setSaving(true);
        try {
            await api.post('/users/units/', { ...unitForm, nama: unitForm.nama.trim() });
            showSuccess(`Unit ${unitForm.nama} berhasil ditambahkan.`);
            closeUnitModals();
            setUnitForm({ nama: '', is_active: true });
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal menambah unit.'));
        } finally {
            setSaving(false);
        }
    };

    const handleEditUnit = async () => {
        setError('');
        if (!unitForm.nama.trim()) return setError('Nama unit wajib diisi.');
        setSaving(true);
        try {
            await api.patch(`/users/units/${modalEditUnit.id}/`, { ...unitForm, nama: unitForm.nama.trim() });
            showSuccess('Unit berhasil diupdate.');
            closeUnitModals();
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal mengupdate unit.'));
        } finally {
            setSaving(false);
        }
    };

    const handleHapusUnit = async () => {
        setSaving(true);
        try {
            await api.delete(`/users/units/${modalHapusUnit.id}/`);
            showSuccess(`Unit ${modalHapusUnit.nama} berhasil dihapus.`);
            closeUnitModals();
            fetchAll();
        } catch (e) {
            setError(parseError(e, 'Gagal menghapus unit.'));
        } finally {
            setSaving(false);
        }
    };

    if (!canManage) {
        return (
            <div style={{ padding: '64px 20px', textAlign: 'center', color: '#667085' }}>
                <Lock size={34} />
                <p style={{ fontSize: 18, fontWeight: 800, margin: '14px 0 6px' }}>Akses Ditolak</p>
                <p style={{ fontSize: 13, margin: 0 }}>Halaman ini hanya dapat diakses oleh direktur atau wakil direktur.</p>
            </div>
        );
    }

    return (
        <div className="mu-page">
            <style>{STYLES}</style>

            <div className="mu-head">
                <div className="mu-title">
                    <div className="mu-title-icon"><UserCog size={22} /></div>
                    <div>
                        <h1>Manajemen User</h1>
                        <p>Kelola akun, role, akses login, dan unit kerja pengguna.</p>
                    </div>
                </div>
                <div className="mu-actions">
                    <button className="mu-btn soft" onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    {activeTab === 'users' ? (
                        <button className="mu-btn primary" onClick={openCreateUser}>
                            <UserPlus size={16} /> Buat Akun
                        </button>
                    ) : (
                        <button
                            className="mu-btn primary"
                            onClick={() => {
                                setUnitForm({ nama: '', is_active: true });
                                setError('');
                                setModalUnit(true);
                            }}
                        >
                            <Plus size={16} /> Tambah Unit
                        </button>
                    )}
                </div>
            </div>

            {success && <Alert type="ok" message={success} />}
            {error && !modalBuat && !modalEdit && !modalPwd && !modalKonfirm && !modalHapus && !modalUnit && !modalEditUnit && !modalHapusUnit && (
                <Alert type="err" message={error} />
            )}

            <div className="mu-stats">
                <StatCard label="Total Akun" value={stats.total} icon={<Users size={19} />} tone="#e7f4ee" color="#155c3b" />
                <StatCard label="Akun Aktif" value={stats.active} icon={<CheckCircle2 size={19} />} tone="#ecfdf3" color="#067647" />
                <StatCard label="Nonaktif" value={stats.inactive} icon={<EyeOff size={19} />} tone="#f2f4f7" color="#475467" />
                <StatCard label="Approver" value={stats.approvers} icon={<ShieldCheck size={19} />} tone="#fef3c7" color="#92400e" />
            </div>

            <div className="mu-shell">
                <div className="mu-tabs">
                    <button className={`mu-tab${activeTab === 'users' ? ' active' : ''}`} onClick={() => setActiveTab('users')}>
                        <Users size={16} /> Akun User
                    </button>
                    <button className={`mu-tab${activeTab === 'units' ? ' active' : ''}`} onClick={() => setActiveTab('units')}>
                        <Building2 size={16} /> Kelola Unit
                    </button>
                </div>

                {activeTab === 'users' && (
                    <>
                        <div className="mu-toolbar">
                            <div className="mu-searchbox">
                                <Search size={16} />
                                <input className="mu-input" placeholder="Cari nama, username, email, atau unit..." value={search} onChange={(e) => setSearch(e.target.value)} />
                            </div>
                            <select className="mu-select" value={filterRole} onChange={(e) => { setUserPage(1); setFilterRole(e.target.value); }}>
                                <option value="">Semua Role</option>
                                {ROLE_CHOICES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <select className="mu-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                <option value="">Semua Status</option>
                                <option value="aktif">Aktif</option>
                                <option value="nonaktif">Nonaktif</option>
                            </select>
                            <button className="mu-btn soft" onClick={() => { setUserPage(1); setSearch(''); setFilterRole(''); setFilterStatus(''); }}>
                                <X size={15} /> Reset
                            </button>
                        </div>
                        <UsersTable
                            loading={loading}
                            users={filteredUsers}
                            currentUser={currentUser}
                            onEdit={openEditUser}
                            onPassword={(u) => { setPwdForm({ password: '', confirm: '' }); setError(''); setShowPwd(false); setModalPwd(u); }}
                            onToggle={(u) => { setError(''); setModalKonfirm(u); }}
                            onDelete={(u) => { setError(''); setModalHapus(u); }}
                        />
                        <div className="mu-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderTop: '1px solid #eef2f6', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: '#667085' }}>Hal {userPage} dari {pageCount(search || filterStatus ? filteredUsers.length : userTotal, userPageSize)} · {search || filterStatus ? filteredUsers.length : userTotal} user</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <RowSizeSelect className="mu-select" value={userPageSize} onChange={(size) => { setUserPageSize(size); setUserPage(1); }} />
                                <button className="mu-btn soft" disabled={userPage === 1} onClick={() => setUserPage((p) => Math.max(1, p - 1))}>{'<'}</button>
                                <button className="mu-btn soft" disabled={userPage >= pageCount(search || filterStatus ? filteredUsers.length : userTotal, userPageSize)} onClick={() => setUserPage((p) => Math.min(pageCount(search || filterStatus ? filteredUsers.length : userTotal, userPageSize), p + 1))}>{'>'}</button>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'units' && (
                    <UnitsTable
                        loading={loading}
                        units={units}
                        stats={stats}
                        onEdit={(u) => { setUnitForm({ nama: u.nama, is_active: u.is_active }); setError(''); setModalEditUnit(u); }}
                        onDelete={(u) => { setError(''); setModalHapusUnit(u); }}
                    />
                )}
            </div>

            {modalBuat && (
                <UserFormModal
                    title="Buat Akun Baru"
                    subtitle="Akun baru langsung bisa login setelah dibuat."
                    form={form}
                    setForm={setForm}
                    units={activeUnits}
                    error={error}
                    saving={saving}
                    showPwd={showPwd}
                    setShowPwd={setShowPwd}
                    onClose={closeUserModals}
                    onSubmit={handleBuat}
                    submitText="Buat Akun"
                    showUsername
                    showPassword
                />
            )}

            {modalEdit && (
                <UserFormModal
                    title="Edit Akun"
                    subtitle={`@${modalEdit.username}`}
                    form={form}
                    setForm={setForm}
                    units={activeUnits}
                    error={error}
                    saving={saving}
                    onClose={closeUserModals}
                    onSubmit={handleEdit}
                    submitText="Simpan"
                />
            )}

            {modalPwd && (
                <PasswordModal
                    user={modalPwd}
                    form={pwdForm}
                    setForm={setPwdForm}
                    error={error}
                    saving={saving}
                    showPwd={showPwd}
                    setShowPwd={setShowPwd}
                    onClose={closeUserModals}
                    onSubmit={handleResetPwd}
                />
            )}

            {modalKonfirm && (
                <ConfirmModal
                    title={`${modalKonfirm.is_active ? 'Nonaktifkan' : 'Aktifkan'} Akun`}
                    body={modalKonfirm.is_active
                        ? `Akun @${modalKonfirm.username} akan dinonaktifkan dan tidak bisa login.`
                        : `Akun @${modalKonfirm.username} akan diaktifkan kembali.`}
                    error={error}
                    saving={saving}
                    confirmText={modalKonfirm.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    danger={modalKonfirm.is_active}
                    onClose={closeUserModals}
                    onConfirm={handleToggleAktif}
                />
            )}

            {modalHapus && (
                <ConfirmModal
                    title="Hapus Akun"
                    body={`Yakin ingin menghapus akun @${modalHapus.username}? Tindakan ini tidak bisa dibatalkan.`}
                    error={error}
                    saving={saving}
                    confirmText="Hapus"
                    danger
                    onClose={closeUserModals}
                    onConfirm={handleHapus}
                />
            )}

            {modalUnit && (
                <UnitFormModal
                    title="Tambah Unit"
                    form={unitForm}
                    setForm={setUnitForm}
                    error={error}
                    saving={saving}
                    onClose={closeUnitModals}
                    onSubmit={handleBuatUnit}
                    submitText="Tambah"
                />
            )}

            {modalEditUnit && (
                <UnitFormModal
                    title="Edit Unit"
                    form={unitForm}
                    setForm={setUnitForm}
                    error={error}
                    saving={saving}
                    onClose={closeUnitModals}
                    onSubmit={handleEditUnit}
                    submitText="Simpan"
                    showStatus
                />
            )}

            {modalHapusUnit && (
                <ConfirmModal
                    title="Hapus Unit"
                    body={`Yakin ingin menghapus unit ${modalHapusUnit.nama}?`}
                    note={modalHapusUnit.user_count > 0 ? `Unit ini masih memiliki ${modalHapusUnit.user_count} user aktif. User tersebut tidak akan memiliki unit setelah unit dihapus.` : ''}
                    error={error}
                    saving={saving}
                    confirmText="Hapus"
                    danger
                    onClose={closeUnitModals}
                    onConfirm={handleHapusUnit}
                />
            )}
        </div>
    );
}

function StatCard({ label, value, icon, tone, color }) {
    return (
        <div className="mu-stat">
            <div>
                <p>{label}</p>
                <strong>{value}</strong>
            </div>
            <span style={{ background: tone, color }}>{icon}</span>
        </div>
    );
}

function Alert({ type, message }) {
    return (
        <div className={`mu-alert ${type}`}>
            {type === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <div>{message}</div>
        </div>
    );
}

function UsersTable({ loading, users, currentUser, onEdit, onPassword, onToggle, onDelete }) {
    if (loading) return <EmptyState icon={<RefreshCw size={28} />} title="Memuat data user..." />;
    if (users.length === 0) return <EmptyState icon={<Users size={28} />} title="Tidak ada user ditemukan." />;

    return (
        <div className="mu-table-wrap">
            <table className="mu-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Unit</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => {
                        const isSelf = currentUser?.id === u.id;
                        return (
                            <tr key={u.id}>
                                <td>
                                    <div className="mu-user">
                                        <div className="mu-avatar">{initials(u)}</div>
                                        <div>
                                            <div className="mu-user-name">{displayName(u)}</div>
                                            <div className="mu-user-sub">@{u.username}{u.email ? ` | ${u.email}` : ''}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><RoleBadge user={u} /></td>
                                <td>{u.unit_nama || <span style={{ color: '#98a2b3' }}>Tidak ada unit</span>}</td>
                                <td><StatusBadge active={u.is_active} /></td>
                                <td>
                                    <div className="mu-row-actions">
                                        <button className="mu-btn icon" title="Edit akun" onClick={() => onEdit(u)}><Edit3 size={15} /></button>
                                        <button className="mu-btn icon" title="Reset password" onClick={() => onPassword(u)}><KeyRound size={15} /></button>
                                        {!isSelf && (
                                            <button className="mu-btn icon" title={u.is_active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => onToggle(u)}>
                                                {u.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        )}
                                        {!isSelf && <button className="mu-btn icon danger" title="Hapus akun" onClick={() => onDelete(u)}><Trash2 size={15} /></button>}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function UnitsTable({ loading, units, stats, onEdit, onDelete }) {
    if (loading) return <EmptyState icon={<RefreshCw size={28} />} title="Memuat data unit..." />;
    if (units.length === 0) return <EmptyState icon={<Building2 size={28} />} title="Belum ada unit." />;

    return (
        <div className="mu-table-wrap">
            <table className="mu-table">
                <thead>
                    <tr>
                        <th>Nama Unit</th>
                        <th>User Aktif</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {units.map((u) => (
                        <tr key={u.id}>
                            <td>
                                <div className="mu-user">
                                    <div className="mu-avatar"><Building2 size={16} /></div>
                                    <div>
                                        <div className="mu-user-name">{u.nama}</div>
                                        <div className="mu-user-sub">Bagian dari {stats.units} unit terdaftar</div>
                                    </div>
                                </div>
                            </td>
                            <td>{u.user_count || 0} user</td>
                            <td><StatusBadge active={u.is_active} /></td>
                            <td>
                                <div className="mu-row-actions">
                                    <button className="mu-btn icon" title="Edit unit" onClick={() => onEdit(u)}><Edit3 size={15} /></button>
                                    <button className="mu-btn icon danger" title="Hapus unit" onClick={() => onDelete(u)}><Trash2 size={15} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EmptyState({ icon, title }) {
    return (
        <div className="mu-empty">
            {icon}
            <div style={{ fontWeight: 800 }}>{title}</div>
        </div>
    );
}

function RoleBadge({ user }) {
    const role = user?.role;
    const superUser = user?.is_superuser;
    const meta = ROLE_META[role] || { label: role || 'Tanpa role', bg: '#f2f4f7', color: '#475467', border: '#e4e7ec' };
    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="mu-badge" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>
                <span className="mu-dot" />
                {superUser ? 'Superuser' : meta.label}
            </span>
            {user?.is_driver && <span className="mu-badge" style={{ background: '#ecfeff', color: '#0e7490', borderColor: '#a5f3fc' }}>Driver</span>}
            {user?.is_it && <span className="mu-badge" style={{ background: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }}>IT</span>}
        </div>
    );
}

function StatusBadge({ active }) {
    return (
        <span className="mu-badge" style={{
            background: active ? '#ecfdf3' : '#f2f4f7',
            color: active ? '#067647' : '#667085',
            borderColor: active ? '#abefc6' : '#e4e7ec',
        }}>
            <span className="mu-dot" />
            {active ? 'Aktif' : 'Nonaktif'}
        </span>
    );
}

function UserFormModal({ title, subtitle, form, setForm, units, error, saving, onClose, onSubmit, submitText, showUsername = false, showPassword = false, showPwd, setShowPwd }) {
    return createPortal(
        <div className="mu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mu-modal">
                <ModalHead title={title} subtitle={subtitle} onClose={onClose} />
                <div className="mu-modal-body">
                    {error && <Alert type="err" message={error} />}
                    {showUsername && (
                        <div className="mu-field">
                            <label>Username *</label>
                            <input className="mu-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username" />
                        </div>
                    )}
                    <div className="mu-grid2">
                        <div className="mu-field">
                            <label>Nama Depan</label>
                            <input className="mu-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Nama depan" />
                        </div>
                        <div className="mu-field">
                            <label>Nama Belakang</label>
                            <input className="mu-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Nama belakang" />
                        </div>
                    </div>
                    <div className="mu-field">
                        <label>Email</label>
                        <input className="mu-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@contoh.com" />
                    </div>
                    <div className="mu-grid2">
                        <div className="mu-field">
                            <label>Role *</label>
                            <select className="mu-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, unit: '' })}>
                                {ROLE_CHOICES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                        <div className="mu-field">
                            <label>Unit {['karyawan', 'kepala_seksi'].includes(form.role) ? '*' : ''}</label>
                            <select className="mu-select" value={form.unit} disabled={!['karyawan', 'kepala_seksi'].includes(form.role)} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                                <option value="">Tidak ada unit</option>
                                {units.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="mu-grid2">
                        <label className="mu-check">
                            <input type="checkbox" checked={form.is_driver} onChange={(e) => setForm({ ...form, is_driver: e.target.checked })} />
                            <span>Akses fitur Driver</span>
                        </label>
                        <label className="mu-check">
                            <input type="checkbox" checked={form.is_it} onChange={(e) => setForm({ ...form, is_it: e.target.checked })} />
                            <span>Akses fitur IT</span>
                        </label>
                    </div>
                    {showPassword && (
                        <div className="mu-field">
                            <label>Password *</label>
                            <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} show={showPwd} setShow={setShowPwd} placeholder="Minimal 6 karakter" />
                        </div>
                    )}
                </div>
                <div className="mu-modal-foot">
                    <button className="mu-btn soft" onClick={onClose}>Batal</button>
                    <button className="mu-btn primary" onClick={onSubmit} disabled={saving}>{saving ? 'Menyimpan...' : submitText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function PasswordModal({ user, form, setForm, error, saving, showPwd, setShowPwd, onClose, onSubmit }) {
    return createPortal(
        <div className="mu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mu-modal sm">
                <ModalHead title="Reset Password" subtitle={`@${user.username}`} onClose={onClose} />
                <div className="mu-modal-body">
                    {error && <Alert type="err" message={error} />}
                    <div className="mu-note">Gunakan password sementara yang aman, lalu minta user menggantinya setelah login.</div>
                    <div className="mu-field">
                        <label>Password Baru *</label>
                        <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} show={showPwd} setShow={setShowPwd} placeholder="Minimal 6 karakter" />
                    </div>
                    <div className="mu-field">
                        <label>Konfirmasi Password *</label>
                        <PasswordInput value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} show={showPwd} setShow={setShowPwd} placeholder="Ulangi password" />
                    </div>
                </div>
                <div className="mu-modal-foot">
                    <button className="mu-btn soft" onClick={onClose}>Batal</button>
                    <button className="mu-btn primary" onClick={onSubmit} disabled={saving}>{saving ? 'Menyimpan...' : 'Reset Password'}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function UnitFormModal({ title, form, setForm, error, saving, onClose, onSubmit, submitText, showStatus = false }) {
    return createPortal(
        <div className="mu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mu-modal sm">
                <ModalHead title={title} subtitle="Unit dipakai untuk pengelompokan user karyawan." onClose={onClose} />
                <div className="mu-modal-body">
                    {error && <Alert type="err" message={error} />}
                    <div className="mu-field">
                        <label>Nama Unit *</label>
                        <input className="mu-input" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Contoh: Radiologi" />
                    </div>
                    {showStatus && (
                        <div className="mu-field">
                            <label>Status</label>
                            <select className="mu-select" value={form.is_active ? 'aktif' : 'nonaktif'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'aktif' })}>
                                <option value="aktif">Aktif</option>
                                <option value="nonaktif">Nonaktif</option>
                            </select>
                        </div>
                    )}
                </div>
                <div className="mu-modal-foot">
                    <button className="mu-btn soft" onClick={onClose}>Batal</button>
                    <button className="mu-btn primary" onClick={onSubmit} disabled={saving}>{saving ? 'Menyimpan...' : submitText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ConfirmModal({ title, body, note, error, saving, confirmText, danger = false, onClose, onConfirm }) {
    return createPortal(
        <div className="mu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="mu-modal sm">
                <ModalHead title={title} subtitle="" onClose={onClose} />
                <div className="mu-modal-body">
                    {note && <div className="mu-note">{note}</div>}
                    <p style={{ color: '#475467', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>{body}</p>
                    {error && <Alert type="err" message={error} />}
                </div>
                <div className="mu-modal-foot">
                    <button className="mu-btn soft" onClick={onClose}>Batal</button>
                    <button className={`mu-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={saving}>{saving ? 'Memproses...' : confirmText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ModalHead({ title, subtitle }) {
    return (
        <div className="mu-modal-head">
            <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
            </div>
        </div>
    );
}

function PasswordInput({ value, onChange, show, setShow, placeholder }) {
    return (
        <div className="mu-password">
            <input className="mu-input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
            <button className="mu-btn icon" type="button" onClick={() => setShow((v) => !v)} title={show ? 'Sembunyikan password' : 'Lihat password'}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
        </div>
    );
}

function displayName(u) {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return name || u.username;
}

function initials(u) {
    const source = displayName(u);
    return source
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}
