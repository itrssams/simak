/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_TTL = {
    success: 3200,
    error: 5200,
    info: 3600,
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((items) => items.filter((item) => item.id !== id));
    }, []);

    const notify = useCallback((type, message, options = {}) => {
        if (!message) return null;
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const toast = {
            id,
            type: type || 'info',
            message: String(message),
        };
        setToasts((items) => [toast, ...items].slice(0, 5));

        const ttl = options.duration ?? TOAST_TTL[toast.type] ?? TOAST_TTL.info;
        if (ttl > 0) {
            window.setTimeout(() => dismiss(id), ttl);
        }
        return id;
    }, [dismiss]);

    const value = useMemo(() => ({
        notify,
        success: (message, options) => notify('success', message, options),
        error: (message, options) => notify('error', message, options),
        info: (message, options) => notify('info', message, options),
        dismiss,
    }), [dismiss, notify]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastViewport toasts={toasts} dismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast harus dipakai di dalam ToastProvider');
    }
    return ctx;
}

export function useToastState(type = 'info') {
    const toast = useToast();
    const setter = useCallback((value) => {
        const message = typeof value === 'function' ? value('') : value;
        if (message) toast.notify(type, message);
    }, [toast, type]);
    return ['', setter];
}

function ToastViewport({ toasts, dismiss }) {
    return (
        <>
            <style>{TOAST_STYLE}</style>
            <div className="toast-viewport" aria-live="polite" aria-atomic="false">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
                ))}
            </div>
        </>
    );
}

function ToastItem({ toast, onClose }) {
    const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;
    return (
        <div className={`app-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <div className="app-toast-icon"><Icon size={18} /></div>
            <div className="app-toast-message">{toast.message}</div>
            <button className="app-toast-close" type="button" onClick={onClose} aria-label="Tutup notifikasi">
                <X size={15} />
            </button>
        </div>
    );
}

const TOAST_STYLE = `
@keyframes appToastIn {
    from { opacity: 0; transform: translate3d(18px, -8px, 0) scale(.98); }
    to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
.toast-viewport {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    width: min(420px, calc(100vw - 28px));
}
.app-toast {
    pointer-events: auto;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, .98);
    border: 1px solid #e4e7ec;
    box-shadow: 0 18px 48px rgba(15, 23, 42, .18), 0 2px 8px rgba(15, 23, 42, .08);
    color: #1f2937;
    animation: appToastIn .18s ease both;
    font-family: 'Plus Jakarta Sans', sans-serif;
}
.app-toast.success { border-left: 4px solid #16a34a; }
.app-toast.error { border-left: 4px solid #dc2626; }
.app-toast.info { border-left: 4px solid #2563eb; }
.app-toast-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    margin-top: -1px;
}
.app-toast.success .app-toast-icon { color: #166534; background: #dcfce7; }
.app-toast.error .app-toast-icon { color: #b91c1c; background: #fee2e2; }
.app-toast.info .app-toast-icon { color: #1d4ed8; background: #dbeafe; }
.app-toast-message {
    font-size: 13px;
    line-height: 1.45;
    font-weight: 700;
    white-space: pre-line;
    overflow-wrap: anywhere;
    padding-top: 4px;
}
.app-toast-close {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #667085;
    display: grid;
    place-items: center;
    cursor: pointer;
}
.app-toast-close:hover { background: #f2f4f7; color: #1f2937; }
@media (max-width: 640px) {
    .toast-viewport {
        top: 12px;
        right: 12px;
        left: 12px;
        width: auto;
    }
}
`;
