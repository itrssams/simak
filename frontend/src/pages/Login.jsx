import { useState } from 'react';
import { useToastState } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, User, LockKeyhole, Sparkles, Building2 } from 'lucide-react';
import './Login.css';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useToastState('error');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [shake, setShake] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (error) setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!form.username || !form.password) {
            setError('Username dan kata sandi harus diisi');
            setShake(true);
            setTimeout(() => setShake(false), 450);
            return;
        }

        setError('');
        setLoading(true);

        try {
            await login(form.username, form.password);
            navigate('/');
        } catch {
            setError('Username atau kata sandi tidak sesuai');
            setShake(true);
            setTimeout(() => setShake(false), 450);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-canvas">
            {/* Ambient Floating Decorative Shapes */}
            <div className="login-bg-shape shape-1" />
            <div className="login-bg-shape shape-2" />
            <div className="login-bg-shape shape-3" />
            <div className="login-bg-polygon poly-1" />
            <div className="login-bg-polygon poly-2" />

            {/* Central Floating Card */}
            <div className={`login-card-container ${shake ? 'shake' : ''}`}>
                {/* Sisi Kiri: Form Login */}
                <div className="login-form-side">
                    {/* Header Institusi */}
                    <div className="login-inst-header">
                        <img
                            src="/logo.png"
                            alt="Logo RS Siaga"
                            className="login-inst-logo"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="login-inst-meta">
                            <span className="login-inst-name">RS SIAGA AL MUNAWWARAH</span>
                            <span className="login-inst-sub">SAMARINDA</span>
                        </div>
                    </div>

                    {/* Avatar Badge & Judul Layanan */}
                    <div className="login-hero-block">
                        <div className="login-avatar-ring">
                            <div className="login-avatar-core">
                                <User size={24} className="login-avatar-icon" />
                            </div>
                        </div>
                        <h1 className="login-main-title">PORTAL MASUK SISTEM</h1>
                        <p className="login-main-sub">Sistem Informasi Manajemen Aset & Keuangan (SIMAK)</p>
                    </div>

                    {/* Form Input */}
                    <form onSubmit={handleSubmit} className="login-form-body">
                        <div className="login-input-group">
                            <label className="login-input-label">Username / Akun</label>
                            <div className={`login-input-wrapper ${error ? 'is-error' : ''}`}>
                                <User className="input-ico" size={17} />
                                <input
                                    type="text"
                                    name="username"
                                    placeholder="Masukkan username"
                                    value={form.username}
                                    onChange={handleChange}
                                    autoFocus
                                    disabled={loading}
                                    className="login-native-input"
                                />
                            </div>
                        </div>

                        <div className="login-input-group">
                            <label className="login-input-label">Kata Sandi</label>
                            <div className={`login-input-wrapper ${error ? 'is-error' : ''}`}>
                                <LockKeyhole className="input-ico" size={17} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    placeholder="Masukkan kata sandi"
                                    value={form.password}
                                    onChange={handleChange}
                                    disabled={loading}
                                    className="login-native-input"
                                />
                                <button
                                    type="button"
                                    className="toggle-pwd-btn"
                                    onClick={() => setShowPassword((v) => !v)}
                                    disabled={loading}
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="login-error-alert">
                                <AlertCircle size={15} className="error-ico" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="login-action-row">
                            <button type="submit" className="login-cta-btn" disabled={loading}>
                                {loading ? (
                                    <span className="cta-loading">
                                        <span className="cta-spinner" />
                                        <span>Memproses...</span>
                                    </span>
                                ) : (
                                    <span>Masuk</span>
                                )}
                            </button>
                        </div>
                    </form>

                    {/* Footer Info */}
                    <div className="login-bottom-info">
                        <p className="login-help">
                            Kendala akses sistem? <span className="login-help-link">Hubungi IT Support</span>
                        </p>
                        <p className="login-copyright">
                            © {new Date().getFullYear()} RS Siaga Al Munawwarah Samarinda
                        </p>
                    </div>
                </div>

                {/* Sisi Kanan: Ilustrasi 3D Isometrik Ungu SIMAK */}
                <div className="login-art-side">
                    <div className="login-art-inner">
                        <img
                            src="/login-isometric.jpg"
                            alt="SIMAK Smart Hospital & Finance 3D Isometric"
                            className="login-art-image"
                        />
                    </div>
                    {/* Carousel Dots Indicator */}
                    <div className="login-art-dots" aria-hidden="true">
                        <span className="art-dot active" />
                        <span className="art-dot" />
                        <span className="art-dot" />
                    </div>
                </div>
            </div>

            {/* Aksesori Pojok Bawah */}
            <div className="login-floor-accent">
                <span className="floor-badge">
                    <Sparkles size={13} />
                    SIMAK Integrated Hospital ERP
                </span>
            </div>
        </main>
    );
}
