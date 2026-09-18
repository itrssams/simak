import { useState, useRef, useEffect } from 'react';
import {
    User,
    KeyRound,
    Camera,
    Trash2,
    Save,
    Eye,
    EyeOff,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    Building2,
    Mail,
    Lock,
    Sparkles,
    Calendar,
    Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import './Profile.css';

export default function Profile() {
    const { user, updateUser, refetchUser } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef(null);

    // Profile Info state
    const [profileForm, setProfileForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // Photo state
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoPreview, setPhotoPreview] = useState(null);

    // Password state
    const [passwordForm, setPasswordForm] = useState({
        current_password: '',
        new_password: '',
        confirm_password: '',
    });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const resolveMediaUrl = (url) => {
        if (!url) return null;
        if (typeof url === 'string' && url.includes('backend:8000')) {
            return url.replace(/^https?:\/\/backend:8000/, '');
        }
        return url;
    };

    // Synchronize profile data when user changes
    useEffect(() => {
        if (user) {
            setProfileForm({
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                email: user.email || '',
            });
            setPhotoPreview(resolveMediaUrl(user.foto) || null);
        }
    }, [user]);

    // Format Joined Date
    const formatJoinedDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    // Calculate avatar initial
    const avatarInitial = (user?.first_name ? user.first_name[0] : user?.username?.[0] || 'U').toUpperCase();
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Pengguna';

    // Handle Profile Form Change
    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setProfileForm((prev) => ({ ...prev, [name]: value }));
    };

    // Handle Save Profile
    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setIsSavingProfile(true);
        try {
            const res = await api.patch('/users/me/', {
                first_name: profileForm.first_name.trim(),
                last_name: profileForm.last_name.trim(),
                email: profileForm.email.trim(),
            });

            if (res.data?.user) {
                updateUser(res.data.user);
            } else {
                refetchUser();
            }

            toast?.success?.(res.data?.message || 'Profil berhasil diperbarui.');
        } catch (err) {
            const errMsg = err.response?.data?.error ||
                (err.response?.data && typeof err.response.data === 'object' ? Object.values(err.response.data).flat().join(' ') : null) ||
                'Gagal memperbarui data profil.';
            toast?.error?.(errMsg);
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Handle Photo File Select
    const handlePhotoSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation: max 5MB
        if (file.size > 5 * 1024 * 1024) {
            toast?.error?.('Ukuran foto terlalu besar. Maksimal 5MB.');
            return;
        }

        // Validation: image type
        if (!file.type.startsWith('image/')) {
            toast?.error?.('Berkas harus berupa gambar (JPG, PNG, atau WEBP).');
            return;
        }

        const formData = new FormData();
        formData.append('foto', file);

        setPhotoUploading(true);
        try {
            const res = await api.post('/users/upload-photo/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const rawFoto = res.data?.foto || res.data?.user?.foto;
            const newFoto = resolveMediaUrl(rawFoto);
            setPhotoPreview(newFoto);
            if (res.data?.user) {
                updateUser({
                    ...res.data.user,
                    foto: newFoto,
                });
            } else {
                refetchUser();
            }
            toast?.success?.(res.data?.message || 'Foto profil berhasil diperbarui.');
        } catch (err) {
            const errMsg = err.response?.data?.error || 'Gagal mengunggah foto profil.';
            toast?.error?.(errMsg);
        } finally {
            setPhotoUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Handle Delete Photo
    const handleDeletePhoto = async () => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus foto profil ini?')) {
            return;
        }

        setPhotoUploading(true);
        try {
            const res = await api.delete('/users/delete-photo/');
            setPhotoPreview(null);
            if (res.data?.user) {
                updateUser(res.data.user);
            } else {
                refetchUser();
            }
            toast?.success?.(res.data?.message || 'Foto profil berhasil dihapus.');
        } catch (err) {
            const errMsg = err.response?.data?.error || 'Gagal menghapus foto profil.';
            toast?.error?.(errMsg);
        } finally {
            setPhotoUploading(false);
        }
    };

    // Handle Password Change Form
    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordForm((prev) => ({ ...prev, [name]: value }));
        if (passwordError) setPasswordError('');
        if (passwordSuccess) setPasswordSuccess('');
    };

    // Handle Save Password
    const handleSavePassword = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (!passwordForm.current_password) {
            setPasswordError('Silakan masukkan password saat ini.');
            return;
        }

        if (passwordForm.new_password.length < 6) {
            setPasswordError('Password baru minimal 6 karakter.');
            return;
        }

        if (passwordForm.new_password !== passwordForm.confirm_password) {
            setPasswordError('Konfirmasi password baru tidak cocok.');
            return;
        }

        if (passwordForm.new_password === passwordForm.current_password) {
            setPasswordError('Password baru tidak boleh sama dengan password saat ini.');
            return;
        }

        setIsSavingPassword(true);
        try {
            const res = await api.post('/users/change-password/', {
                current_password: passwordForm.current_password,
                new_password: passwordForm.new_password,
                confirm_password: passwordForm.confirm_password,
            });

            const successMsg = res.data?.message || 'Password Anda berhasil diperbarui.';
            setPasswordSuccess(successMsg);
            toast?.success?.(successMsg);
            setPasswordForm({
                current_password: '',
                new_password: '',
                confirm_password: '',
            });
        } catch (err) {
            const errData = err.response?.data;
            let errMsg = 'Gagal memperbarui password.';
            if (errData?.current_password) {
                errMsg = Array.isArray(errData.current_password) ? errData.current_password[0] : errData.current_password;
            } else if (errData?.confirm_password) {
                errMsg = Array.isArray(errData.confirm_password) ? errData.confirm_password[0] : errData.confirm_password;
            } else if (errData?.new_password) {
                errMsg = Array.isArray(errData.new_password) ? errData.new_password[0] : errData.new_password;
            } else if (errData?.non_field_errors) {
                errMsg = Array.isArray(errData.non_field_errors) ? errData.non_field_errors[0] : errData.non_field_errors;
            } else if (errData?.detail) {
                errMsg = errData.detail;
            } else if (errData?.error) {
                errMsg = errData.error;
            } else if (!err.response || err.response.status >= 500) {
                errMsg = 'Server sedang memproses atau memuat ulang. Silakan coba lagi.';
            }
            setPasswordError(errMsg);
            toast?.error?.(errMsg);
        } finally {
            setIsSavingPassword(false);
        }
    };

    // Password validation feedback
    const isMinLength = passwordForm.new_password.length >= 6;
    const isMatching = Boolean(passwordForm.new_password && passwordForm.confirm_password && passwordForm.new_password === passwordForm.confirm_password);

    return (
        <div className="profile-page-container">
            {/* Hidden native file input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                style={{ display: 'none' }}
            />

            {/* Profile Hero Card */}
            <div className="profile-hero-card">
                <div className="profile-hero-bg-shapes">
                    <div className="shape shape-1"></div>
                    <div className="shape shape-2"></div>
                </div>

                <div className="profile-hero-content">
                    <div className="profile-avatar-wrapper">
                        <div className="profile-hero-avatar">
                            {photoPreview ? (
                                <img src={resolveMediaUrl(photoPreview)} alt={fullName} className="profile-hero-img" />
                            ) : (
                                <span className="profile-hero-initial">{avatarInitial}</span>
                            )}
                            {photoUploading && (
                                <div className="profile-avatar-overlay loading">
                                    <Loader2 className="spinner" size={24} />
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="profile-camera-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={photoUploading}
                            title="Ganti Foto Profil"
                        >
                            <Camera size={16} />
                        </button>
                    </div>

                    <div className="profile-hero-info">
                        <div className="profile-hero-name-row">
                            <h1 className="profile-hero-name">{fullName}</h1>
                            <span className="profile-role-badge">
                                <ShieldCheck size={14} />
                                {user?.role_label || user?.role || 'Karyawan'}
                            </span>
                        </div>

                        <div className="profile-hero-meta">
                            <span className="profile-meta-item">
                                <User size={13} />
                                @{user?.username}
                            </span>
                            {user?.unit_nama && (
                                <span className="profile-meta-item">
                                    <Building2 size={13} />
                                    Unit {user.unit_nama}
                                </span>
                            )}
                            {user?.date_joined && (
                                <span className="profile-meta-item">
                                    <Calendar size={13} />
                                    Bergabung {formatJoinedDate(user.date_joined)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Two Column Grid */}
            <div className="profile-grid">
                {/* Column 1: Info Profil & Foto */}
                <div className="profile-card">
                    <div className="profile-card-header">
                        <div className="profile-card-icon primary">
                            <User size={20} />
                        </div>
                        <div>
                            <h2 className="profile-card-title">Informasi Akun</h2>
                            <p className="profile-card-desc">Kelola identitas dan foto profil akun SIMAK Anda</p>
                        </div>
                    </div>

                    <div className="profile-card-body">
                        {/* Photo Manager Section */}
                        <div className="profile-photo-manager">
                            <div className="profile-photo-thumb">
                                {photoPreview ? (
                                    <img src={resolveMediaUrl(photoPreview)} alt={fullName} />
                                ) : (
                                    <div className="profile-thumb-placeholder">{avatarInitial}</div>
                                )}
                            </div>
                            <div className="profile-photo-actions">
                                <div className="profile-photo-label">Foto Profil Anda</div>
                                <div className="profile-photo-hint">Format PNG, JPG, atau WEBP. Maksimum 5MB.</div>
                                <div className="profile-photo-btn-group">
                                    <button
                                        type="button"
                                        className="btn-profile-primary sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={photoUploading}
                                    >
                                        <Camera size={14} />
                                        <span>{photoPreview ? 'Ganti Foto' : 'Unggah Foto'}</span>
                                    </button>
                                    {photoPreview && (
                                        <button
                                            type="button"
                                            className="btn-profile-danger sm"
                                            onClick={handleDeletePhoto}
                                            disabled={photoUploading}
                                        >
                                            <Trash2 size={14} />
                                            <span>Hapus</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <hr className="profile-divider" />

                        {/* Profile Info Form */}
                        <form onSubmit={handleSaveProfile} className="profile-form">
                            <div className="form-group-row">
                                <div className="form-group">
                                    <label className="form-label">Username</label>
                                    <div className="input-with-icon disabled">
                                        <User size={16} className="input-icon" />
                                        <input
                                            type="text"
                                            value={user?.username || ''}
                                            disabled
                                            className="form-control"
                                        />
                                        <Lock size={14} className="input-lock" title="Username tidak dapat diubah" />
                                    </div>
                                    <span className="field-hint">Dikelola oleh Administrator</span>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Unit / Bagian</label>
                                    <div className="input-with-icon disabled">
                                        <Building2 size={16} className="input-icon" />
                                        <input
                                            type="text"
                                            value={user?.unit_nama || 'Umum / Pusat'}
                                            disabled
                                            className="form-control"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="form-group-row">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="first_name">Nama Depan</label>
                                    <input
                                        id="first_name"
                                        type="text"
                                        name="first_name"
                                        value={profileForm.first_name}
                                        onChange={handleProfileChange}
                                        placeholder="Nama depan Anda"
                                        className="form-control"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label" htmlFor="last_name">Nama Belakang</label>
                                    <input
                                        id="last_name"
                                        type="text"
                                        name="last_name"
                                        value={profileForm.last_name}
                                        onChange={handleProfileChange}
                                        placeholder="Nama belakang Anda"
                                        className="form-control"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="email">Alamat Email</label>
                                <div className="input-with-icon">
                                    <Mail size={16} className="input-icon" />
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        value={profileForm.email}
                                        onChange={handleProfileChange}
                                        placeholder="nama@email.com"
                                        className="form-control"
                                    />
                                </div>
                            </div>

                            <div className="profile-form-footer">
                                <button
                                    type="submit"
                                    className="btn-profile-primary"
                                    disabled={isSavingProfile}
                                >
                                    {isSavingProfile ? (
                                        <>
                                            <Loader2 size={16} className="spinner" />
                                            <span>Menyimpan...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={16} />
                                            <span>Simpan Perubahan Data</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Column 2: Ubah Password Mandiri */}
                <div className="profile-card">
                    <div className="profile-card-header">
                        <div className="profile-card-icon amber">
                            <KeyRound size={20} />
                        </div>
                        <div>
                            <h2 className="profile-card-title">Ubah Password Mandiri</h2>
                            <p className="profile-card-desc">Tingkatkan keamanan akun dengan memperbarui password secara berkala</p>
                        </div>
                    </div>

                    <div className="profile-card-body">
                        {passwordError && (
                            <div className="profile-alert danger">
                                <AlertCircle size={16} />
                                <span>{passwordError}</span>
                            </div>
                        )}
                        {passwordSuccess && (
                            <div className="profile-alert success">
                                <CheckCircle2 size={16} />
                                <span>{passwordSuccess}</span>
                            </div>
                        )}
                        <form onSubmit={handleSavePassword} className="profile-form">
                            <div className="form-group">
                                <label className="form-label" htmlFor="current_password">Password Saat Ini</label>
                                <div className="input-with-icon">
                                    <Lock size={16} className="input-icon" />
                                    <input
                                        id="current_password"
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        name="current_password"
                                        value={passwordForm.current_password}
                                        onChange={handlePasswordChange}
                                        placeholder="Masukkan password saat ini"
                                        required
                                        className="form-control"
                                    />
                                    <button
                                        type="button"
                                        className="btn-toggle-eye"
                                        onClick={() => setShowCurrentPassword(o => !o)}
                                        title={showCurrentPassword ? 'Sembunyikan' : 'Lihat'}
                                    >
                                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="new_password">Password Baru</label>
                                <div className="input-with-icon">
                                    <KeyRound size={16} className="input-icon" />
                                    <input
                                        id="new_password"
                                        type={showNewPassword ? 'text' : 'password'}
                                        name="new_password"
                                        value={passwordForm.new_password}
                                        onChange={handlePasswordChange}
                                        placeholder="Minimal 6 karakter"
                                        required
                                        className="form-control"
                                    />
                                    <button
                                        type="button"
                                        className="btn-toggle-eye"
                                        onClick={() => setShowNewPassword(o => !o)}
                                        title={showNewPassword ? 'Sembunyikan' : 'Lihat'}
                                    >
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="confirm_password">Konfirmasi Password Baru</label>
                                <div className="input-with-icon">
                                    <KeyRound size={16} className="input-icon" />
                                    <input
                                        id="confirm_password"
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        name="confirm_password"
                                        value={passwordForm.confirm_password}
                                        onChange={handlePasswordChange}
                                        placeholder="Ulangi password baru"
                                        required
                                        className="form-control"
                                    />
                                    <button
                                        type="button"
                                        className="btn-toggle-eye"
                                        onClick={() => setShowConfirmPassword(o => !o)}
                                        title={showConfirmPassword ? 'Sembunyikan' : 'Lihat'}
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Password Checklist / Criteria */}
                            <div className="password-checklist">
                                <div className={`checklist-item ${isMinLength ? 'valid' : ''}`}>
                                    {isMinLength ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                    <span>Minimal 6 karakter</span>
                                </div>
                                <div className={`checklist-item ${isMatching ? 'valid' : ''}`}>
                                    {isMatching ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                    <span>Konfirmasi password cocok</span>
                                </div>
                            </div>

                            <div className="profile-form-footer">
                                <button
                                    type="submit"
                                    className="btn-profile-amber"
                                    disabled={isSavingPassword || !passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password}
                                >
                                    {isSavingPassword ? (
                                        <>
                                            <Loader2 size={16} className="spinner" />
                                            <span>Memperbarui Password...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} />
                                            <span>Perbarui Password</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
