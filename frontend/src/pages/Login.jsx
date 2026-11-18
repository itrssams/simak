import { useState, useEffect } from 'react';
import { useToastState } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, User, LockKeyhole, Sun, Moon } from 'lucide-react';
import './Login.css';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useToastState('error');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [shake, setShake] = useState(false);

    // Theme state (sinkron dengan simak_theme di seluruh SIMAK)
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('simak_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('simak_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

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
            {/* Compact Theme Switcher Button */}
            <button
                type="button"
                className="login-theme-toggle-btn"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Ganti ke Mode Terang (Light)' : 'Ganti ke Mode Gelap (Dark)'}
                aria-label="Ganti Tema"
            >
                {theme === 'dark' ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
                <span className="login-theme-toggle-text">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {/* Centered Split-Card */}
            <div className={`login-card-container ${shake ? 'shake' : ''}`}>
                {/* Sisi Kiri: Form Login Rata Kiri */}
                <div className="login-form-side">
                    <div className="login-form-top">
                        {/* Header Institusi */}
                        <div className="login-inst-header">
                            <img
                                src="/logo.png"
                                alt="Logo RS Siaga"
                                className="login-inst-logo"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="login-inst-meta">
                                <span className="login-inst-name">RS Siaga Al Munawwarah</span>
                                <span className="login-inst-sub">Samarinda</span>
                            </div>
                        </div>

                        {/* Judul Rata Kiri */}
                        <div className="login-hero-block">
                            <h1 className="login-main-title">Masuk ke SIMAK</h1>
                            <p className="login-main-sub">Sistem Informasi Manajemen Aset &amp; Keuangan</p>
                        </div>

                        {/* Form Input */}
                        <form onSubmit={handleSubmit} className="login-form-body">
                            <div className="login-input-group">
                                <label className="login-input-label" htmlFor="login-username">Username / Akun</label>
                                <div className={`login-input-wrapper ${error ? 'is-error' : ''}`}>
                                    <User className="input-ico" size={15} />
                                    <input
                                        id="login-username"
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
                                <label className="login-input-label" htmlFor="login-password">Kata Sandi</label>
                                <div className={`login-input-wrapper ${error ? 'is-error' : ''}`}>
                                    <LockKeyhole className="input-ico" size={15} />
                                    <input
                                        id="login-password"
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
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="login-error-alert" role="alert">
                                    <AlertCircle size={14} className="error-ico" />
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
                    </div>

                    {/* Footer Info */}
                    <div className="login-bottom-info">
                        <p className="login-help">
                            Kendala akses sistem? <span className="login-help-link">Hubungi IT Support</span>
                        </p>
                    </div>
                </div>

                {/* Sisi Kanan: Ilustrasi Vektor Minimalis (Line-Art) */}
                <div className="login-art-side">
                    <div className="login-art-inner">
                        <svg
                            className="login-blueprint-svg"
                            viewBox="0 0 360 280"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            role="img"
                            aria-label="Ilustrasi arsitektur modul medis, keuangan, dan inventaris aset SIMAK"
                        >
                            {/* Architectural Blueprint Grid Guides */}
                            <g className="bp-guide" strokeWidth="1.25" strokeDasharray="3 4">
                                <line x1="20" y1="142" x2="340" y2="142" />
                                <line x1="180" y1="20" x2="180" y2="260" />
                            </g>

                            {/* Corner Registration Crosshairs */}
                            <g className="bp-faint" strokeWidth="1.25" strokeLinecap="round">
                                <path d="M20 26V18M16 22H24" />
                                <path d="M340 26V18M336 22H344" />
                                <path d="M20 262V254M16 258H24" />
                                <path d="M340 262V254M336 258H344" />
                            </g>

                            {/* Top-Left Blueprint Module: Medical & Clinical Telemetry */}
                            <g className="bp-stroke" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="38" y="34" width="124" height="90" rx="4" />
                                <line x1="38" y1="54" x2="162" y2="54" className="bp-faint" />
                                <circle cx="48" cy="44" r="2" className="bp-faint" />
                                <circle cx="56" cy="44" r="2" className="bp-faint" />
                                {/* Minimalist Medical Cross */}
                                <path d="M62 72H70V64H78V72H86V80H78V88H70V80H62V72Z" />
                                {/* Subtle ECG / Pulse Trace */}
                                <polyline points="96,78 106,78 111,68 117,88 123,74 128,78 148,78" className="bp-muted" />
                                {/* Calibration ticks */}
                                <line x1="50" y1="108" x2="148" y2="108" className="bp-faint" />
                                <line x1="62" y1="104" x2="62" y2="112" className="bp-faint" />
                                <line x1="92" y1="104" x2="92" y2="112" className="bp-faint" />
                                <line x1="122" y1="104" x2="122" y2="112" className="bp-faint" />
                            </g>

                            {/* Top-Right Blueprint Module: Asset & Warehouse Orthographic Wireframe */}
                            <g className="bp-stroke" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="198" y="34" width="124" height="90" rx="4" />
                                <line x1="198" y1="54" x2="322" y2="54" className="bp-faint" />
                                {/* Wireframe Isometric Asset Cube */}
                                <polygon points="242,66 262,76 262,102 242,112 222,102 222,76" />
                                <polyline points="222,76 242,86 262,76" className="bp-muted" />
                                <line x1="242" y1="86" x2="242" y2="112" className="bp-muted" />
                                {/* Inventory Rack Hierarchy Nodes */}
                                <line x1="278" y1="74" x2="308" y2="74" className="bp-muted" />
                                <line x1="278" y1="88" x2="302" y2="88" className="bp-faint" />
                                <line x1="278" y1="102" x2="308" y2="102" className="bp-muted" />
                                <circle cx="272" cy="74" r="2" />
                                <circle cx="272" cy="88" r="2" className="bp-faint" />
                                <circle cx="272" cy="102" r="2" />
                            </g>

                            {/* Bottom Module: Financial Balance Sheet & Ledger Chart */}
                            <g className="bp-stroke" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="54" y="158" width="252" height="88" rx="4" />
                                {/* Vertical ledger gridlines */}
                                <line x1="104" y1="168" x2="104" y2="226" className="bp-faint" />
                                <line x1="154" y1="168" x2="154" y2="226" className="bp-faint" />
                                <line x1="204" y1="168" x2="204" y2="226" className="bp-faint" />
                                <line x1="254" y1="168" x2="254" y2="226" className="bp-faint" />
                                {/* Baseline axis */}
                                <line x1="72" y1="226" x2="288" y2="226" className="bp-muted" />
                                {/* Minimalist wireframe ledger bars */}
                                <rect x="82" y="206" width="14" height="20" rx="1.5" className="bp-muted" />
                                <rect x="132" y="196" width="14" height="30" rx="1.5" className="bp-muted" />
                                <rect x="182" y="200" width="14" height="26" rx="1.5" className="bp-muted" />
                                <rect x="232" y="182" width="14" height="44" rx="1.5" className="bp-muted" />
                                <rect x="272" y="174" width="12" height="52" rx="1.5" className="bp-faint" />
                            </g>

                            {/* Connector Stems to Central Axis */}
                            <g className="bp-faint" strokeWidth="1.25" strokeLinecap="round">
                                <polyline points="100,124 100,142 180,142" />
                                <polyline points="260,124 260,142 180,142" />
                                <line x1="180" y1="142" x2="180" y2="158" />
                            </g>

                            {/* Single Stripe Indigo (#635bff) Accent Line: Ledger Trajectory */}
                            <path
                                d="M89 202 L139 190 L189 194 L239 175 L278 167"
                                stroke="#635bff"
                                strokeWidth="1.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <circle cx="89" cy="202" r="2.25" stroke="#635bff" strokeWidth="1.25" className="bp-node-fill" />
                            <circle cx="139" cy="190" r="2.25" stroke="#635bff" strokeWidth="1.25" className="bp-node-fill" />
                            <circle cx="189" cy="194" r="2.25" stroke="#635bff" strokeWidth="1.25" className="bp-node-fill" />
                            <circle cx="239" cy="175" r="2.25" stroke="#635bff" strokeWidth="1.25" className="bp-node-fill" />
                            <circle cx="278" cy="167" r="2.75" stroke="#635bff" strokeWidth="1.25" className="bp-node-fill" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Footer Halaman */}
            <footer className="login-page-footer">
                <span>&copy; {new Date().getFullYear()} RS Siaga Al Munawwarah Samarinda</span>
                <span className="login-footer-sep">&bull;</span>
                <span>SIMAK v2.0</span>
            </footer>
        </main>
    );
}
