import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const WARNING_SECONDS = 120; // 2 menit

export default function IdleWarningModal({ visible, onStayLoggedIn, onLogoutNow }) {
    const [seconds, setSeconds] = useState(WARNING_SECONDS);

    useEffect(() => {
        if (!visible) {
            setSeconds(WARNING_SECONDS);
            return;
        }

        setSeconds(WARNING_SECONDS);

        const interval = setInterval(() => {
            setSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [visible]);

    if (!visible) return null;

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeLabel = mins > 0
        ? `${mins}:${String(secs).padStart(2, '0')} menit`
        : `${secs} detik`;

    const progress = (seconds / WARNING_SECONDS) * 100;

    return createPortal(
        <div style={styles.backdrop}>
            <div style={styles.modal}>
                {/* Icon */}
                <div style={styles.iconWrap}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </div>

                {/* Copy */}
                <h2 style={styles.title}>Sesi Akan Berakhir</h2>
                <p style={styles.desc}>
                    Anda tidak aktif. Sesi akan otomatis berakhir dalam:
                </p>

                {/* Countdown */}
                <div style={styles.countdown}>{timeLabel}</div>

                {/* Progress bar */}
                <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                </div>

                {/* Actions */}
                <div style={styles.actions}>
                    <button style={styles.btnDanger} type="button" onClick={onLogoutNow}>
                        Logout Sekarang
                    </button>
                    <button style={styles.btnPrimary} type="button" onClick={onStayLoggedIn}>
                        Tetap Login
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

const styles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
    },
    modal: {
        background: '#fff',
        borderRadius: '24px',
        padding: '36px 32px 28px',
        width: '100%',
        maxWidth: '400px',
        margin: '16px',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'center',
    },
    iconWrap: {
        width: '56px',
        height: '56px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        marginBottom: '4px',
    },
    title: {
        margin: 0,
        fontSize: '20px',
        fontWeight: 800,
        color: '#0f172a',
    },
    desc: {
        margin: 0,
        fontSize: '14px',
        color: '#64748b',
        lineHeight: 1.5,
    },
    countdown: {
        fontSize: '32px',
        fontWeight: 900,
        color: '#d97706',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
    },
    progressTrack: {
        width: '100%',
        height: '6px',
        background: '#e2e8f0',
        borderRadius: '999px',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
        borderRadius: 'inherit',
        transition: 'width 1s linear',
    },
    actions: {
        display: 'flex',
        gap: '10px',
        width: '100%',
        marginTop: '8px',
    },
    btnPrimary: {
        flex: 1,
        height: '44px',
        border: 'none',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 800,
        cursor: 'pointer',
    },
    btnDanger: {
        flex: 1,
        height: '44px',
        border: '1px solid #fecaca',
        borderRadius: '14px',
        background: '#fef2f2',
        color: '#dc2626',
        fontSize: '14px',
        fontWeight: 800,
        cursor: 'pointer',
    },
};
