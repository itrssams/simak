import { useState } from 'react';
import { useToastState } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, User, LockKeyhole, ShieldCheck } from 'lucide-react';

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
        <main style={S.root}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

                *, *::before, *::after { box-sizing: border-box; }
                html, body, #root {
                    width: 100%;
                    min-height: 100vh;
                    margin: 0;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }

                @keyframes fadeLeft {
                    from { opacity: 0; transform: translateX(-24px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(18px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-7px); }
                    75% { transform: translateX(7px); }
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .login-left {
                    animation: fadeLeft .65s cubic-bezier(.2,.8,.2,1) both;
                }

                .login-card {
                    animation: fadeUp .65s cubic-bezier(.2,.8,.2,1) both;
                }

                .shake {
                    animation: shake .35s ease both;
                }

                .login-input {
                    width: 100%;
                    height: 48px;
                    padding: 0 46px;
                    border: 1px solid #dbe3ea;
                    border-radius: 12px;
                    background: #f8fafc;
                    color: #102118;
                    font-size: 14px;
                    font-family: inherit;
                    outline: none;
                    transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
                }

                .login-input:focus {
                    border-color: #177245;
                    background: #fff;
                    box-shadow: 0 0 0 4px rgba(23, 114, 69, .1);
                }

                .login-input.error {
                    border-color: #dc2626;
                    background: #fff5f5;
                }

                .icon-left {
                    position: absolute;
                    left: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #8da19a;
                    pointer-events: none;
                }

                .password-btn {
                    position: absolute;
                    right: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 32px;
                    height: 32px;
                    border: 0;
                    border-radius: 8px;
                    background: transparent;
                    color: #8da19a;
                    display: grid;
                    place-items: center;
                    cursor: pointer;
                    transition: background .18s ease, color .18s ease;
                }

                .password-btn:hover:not(:disabled) {
                    background: #edf7f1;
                    color: #177245;
                }

                .submit-btn {
                    width: 100%;
                    height: 48px;
                    border: 0;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #135f3a 0%, #1f8b59 100%);
                    color: white;
                    font-family: inherit;
                    font-size: 15px;
                    font-weight: 800;
                    cursor: pointer;
                    box-shadow: 0 14px 28px rgba(19, 95, 58, .24);
                    transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
                }

                .submit-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 18px 34px rgba(19, 95, 58, .3);
                }

                .submit-btn:disabled {
                    opacity: .75;
                    cursor: not-allowed;
                }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border-radius: 999px;
                    border: 2px solid rgba(255,255,255,.35);
                    border-top-color: #fff;
                    animation: spin .65s linear infinite;
                }

                @media (max-width: 860px) {
                    .login-left { display: none; }
                    .login-right { width: 100%; padding: 24px; }
                }

                @media (max-width: 420px) {
                    .login-right { padding: 16px; }
                    .login-card { padding: 24px 18px !important; border-radius: 18px !important; }
                }
            `}</style>

            <section className="login-left" style={S.left}>
                <div style={S.photoLayer} />
                <div style={S.leftOverlay} />

                <div style={S.leftContent}>
                    <div>
                        <div style={S.badge}>
                            <ShieldCheck size={16} />
                            Sistem Internal Rumah Sakit
                        </div>

                        <p style={S.kicker}>Selamat datang di</p>
                        <h1 style={S.brand}>SIMAK</h1>
                        <p style={S.description}>
                            Sistem Informasi Manajemen Aset dan Keuangan Terintegrasi
                        </p>
                    </div>

                    <div style={S.leftFooter}>
                        <div style={S.tags}>
                            {['Keuangan', 'Petty Cash', 'Driver', 'Laporan'].map((item) => (
                                <span key={item} style={S.tag}>{item}</span>
                            ))}
                        </div>
                        <p style={S.hospital}>RS Siaga Al Munawwarah Samarinda</p>
                    </div>
                </div>
            </section>

            <section className="login-right" style={S.right}>
                <div className={`login-card ${shake ? 'shake' : ''}`} style={S.card}>
                    <div style={S.header}>
                        <img
                            src="/logo.png"
                            alt="RS Siaga"
                            style={S.logo}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />

                        <h2 style={S.title}>Masuk ke Sistem</h2>
                        <p style={S.subtitle}>Gunakan akun yang sudah terdaftar untuk melanjutkan.</p>
                    </div>

                    <form onSubmit={handleSubmit} style={S.form}>
                        <label style={S.field}>
                            <span style={S.label}>Username</span>
                            <span style={S.inputWrap}>
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

                        <label style={S.field}>
                            <span style={S.label}>Password</span>
                            <span style={S.inputWrap}>
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
                            <div style={S.errorBox}>
                                <AlertCircle size={17} />
                                <span>{error}</span>
                            </div>
                        )}

                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? (
                                <span style={S.loadingText}>
                                    <span className="spinner" />
                                    Memproses...
                                </span>
                            ) : (
                                'Masuk'
                            )}
                        </button>
                    </form>

                    <p style={S.helpText}>
                        Butuh bantuan? <span style={S.helpStrong}>Hubungi IT Support</span>
                    </p>

                    <div style={S.divider} />

                    <p style={S.copy}>
                        © {new Date().getFullYear()} RS Siaga Al Munawwarah
                    </p>
                </div>
            </section>
        </main>
    );
}

const S = {
    root: {
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        overflow: 'hidden',
        background: '#eef4f0',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
    },
    left: {
        width: '46%',
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#0e3323',
    },
    photoLayer: {
        position: 'absolute',
        inset: 0,
        backgroundImage: "url('/images/rs-siaga.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: 'scale(1.02)',
    },
    leftOverlay: {
        position: 'absolute',
        inset: 0,
        background: `
            linear-gradient(135deg, rgba(5, 28, 18, .88), rgba(10, 58, 37, .76) 48%, rgba(20, 119, 72, .62)),
            radial-gradient(circle at 18% 20%, rgba(255,255,255,.16), transparent 28%)
        `,
    },
    leftContent: {
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh',
        padding: '48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#fff',
    },
    badge: {
        width: 'fit-content',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        borderRadius: 999,
        background: 'rgba(255,255,255,.12)',
        border: '1px solid rgba(255,255,255,.18)',
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255,255,255,.88)',
        marginBottom: 56,
    },
    kicker: {
        margin: 0,
        fontSize: 15,
        color: 'rgba(255,255,255,.7)',
        fontWeight: 600,
    },
    brand: {
        margin: '8px 0 14px',
        fontSize: 62,
        lineHeight: 1,
        letterSpacing: 2,
        fontWeight: 800,
        color: '#fff',
        textShadow: '0 18px 45px rgba(0,0,0,.32)',
    },
    description: {
        maxWidth: 460,
        margin: 0,
        fontSize: 18,
        lineHeight: 1.6,
        color: 'rgba(255,255,255,.82)',
        fontWeight: 500,
    },
    leftFooter: {
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
    },
    tags: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
    },
    tag: {
        padding: '7px 12px',
        borderRadius: 999,
        background: 'rgba(255,255,255,.12)',
        border: '1px solid rgba(255,255,255,.18)',
        color: 'rgba(255,255,255,.88)',
        fontSize: 12,
        fontWeight: 700,
    },
    hospital: {
        margin: 0,
        fontSize: 13,
        color: 'rgba(255,255,255,.62)',
        fontWeight: 600,
    },
    right: {
        flex: 1,
        minHeight: '100vh',
        padding: 32,
        display: 'grid',
        placeItems: 'center',
    },
    card: {
        width: '100%',
        maxWidth: 430,
        padding: '32px 30px',
        borderRadius: 22,
        background: '#fff',
        border: '1px solid rgba(15, 23, 42, .06)',
        boxShadow: '0 24px 70px rgba(15, 23, 42, .12)',
    },
    header: {
        textAlign: 'center',
        marginBottom: 24,
    },
    logo: {
        width: 96,
        height: 70,
        objectFit: 'contain',
        marginBottom: 10,
    },
    title: {
        margin: 0,
        color: '#13251b',
        fontSize: 24,
        lineHeight: 1.25,
        fontWeight: 800,
    },
    subtitle: {
        margin: '8px 0 0',
        color: '#7b8d85',
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 500,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
    },
    label: {
        color: '#43564d',
        fontSize: 12,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.4px',
    },
    inputWrap: {
        position: 'relative',
        display: 'block',
    },
    errorBox: {
        minHeight: 42,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: '#fff1f1',
        border: '1px solid #ffcaca',
        color: '#a71919',
        fontSize: 13,
        fontWeight: 700,
    },
    loadingText: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
    },
    helpText: {
        margin: '18px 0 0',
        textAlign: 'center',
        color: '#8da19a',
        fontSize: 12,
        fontWeight: 500,
    },
    helpStrong: {
        color: '#135f3a',
        fontWeight: 800,
    },
    divider: {
        height: 1,
        background: '#eef2f0',
        margin: '18px 0 12px',
    },
    copy: {
        margin: 0,
        textAlign: 'center',
        color: '#b1beb8',
        fontSize: 11,
        fontWeight: 600,
    },
};
