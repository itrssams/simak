import { useState } from 'react';
import { useToastState } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, User, LockKeyhole, ShieldCheck } from 'lucide-react';
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
            setError('Username dan password harus diisi');
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
            setError('Username atau password salah');
            setShake(true);
            setTimeout(() => setShake(false), 450);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-root">
            <section className="login-left">
                <div className="login-photo-layer" />
                <div className="login-left-overlay" />

                <div className="login-left-content">
                    <div>
                        <div className="login-badge">
                            <ShieldCheck size={16} />
                            Sistem Internal Rumah Sakit
                        </div>

                        <p className="login-kicker">Selamat datang di</p>
                        <h1 className="login-brand">SIMAK</h1>
                        <p className="login-description">
                            Sistem Informasi Manajemen Aset dan Keuangan Terintegrasi
                        </p>
                    </div>

                    <div className="login-left-footer">
                        <div className="login-tags">
                            {['Keuangan', 'Petty Cash', 'Driver', 'Laporan'].map((item) => (
                                <span key={item} className="login-tag">{item}</span>
                            ))}
                        </div>
                        <p className="login-hospital">RS Siaga Al Munawwarah Samarinda</p>
                    </div>
                </div>
            </section>

            <section className="login-right">
                <div className={`login-card ${shake ? 'shake' : ''}`}>
                    <div className="login-header">
                        <img
                            src="/logo.png"
                            alt="RS Siaga"
                            className="login-logo"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />

                        <h2 className="login-title">Masuk ke Sistem</h2>
                        <p className="login-subtitle">Gunakan akun yang sudah terdaftar untuk melanjutkan.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        <label className="login-field">
                            <span className="login-label">Username</span>
                            <span className="login-input-wrap">
                                <User className="icon-left" size={18} />
                                <input
                                    className={`login-input ${error ? 'error' : ''}`}
                                    type="text"
                                    name="username"
                                    placeholder="Masukkan username"
                                    value={form.username}
                                    onChange={handleChange}
                                    autoFocus
                                    disabled={loading}
                                />
                            </span>
                        </label>

                        <label className="login-field">
                            <span className="login-label">Password</span>
                            <span className="login-input-wrap">
                                <LockKeyhole className="icon-left" size={18} />
                                <input
                                    className={`login-input ${error ? 'error' : ''}`}
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    placeholder="Masukkan password"
                                    value={form.password}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="password-btn"
                                    onClick={() => setShowPassword((value) => !value)}
                                    disabled={loading}
                                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </span>
                        </label>

                        {error && (
                            <div className="login-error-box">
                                <AlertCircle size={17} />
                                <span>{error}</span>
                            </div>
                        )}

                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? (
                                <span className="login-loading-text">
                                    <span className="spinner" />
                                    Memproses...
                                </span>
                            ) : (
                                'Masuk'
                            )}
                        </button>
                    </form>

                    <p className="login-help-text">
                        Butuh bantuan? <span className="login-help-strong">Hubungi IT Support</span>
                    </p>

                    <div className="login-divider" />

                    <p className="login-copy">
                        © {new Date().getFullYear()} RS Siaga Al Munawwarah
                    </p>
                </div>
            </section>
        </main>
    );
}
