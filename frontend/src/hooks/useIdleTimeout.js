import { useEffect, useRef, useCallback } from 'react';

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

/**
 * useIdleTimeout
 * @param {Function} onIdle      - dipanggil saat user idle melebihi idleMs
 * @param {Function} onWarning   - dipanggil saat memasuki warning window (sebelum logout)
 * @param {Function} onActive    - dipanggil saat user aktif kembali sebelum logout
 * @param {number}   idleMs      - total idle timeout dalam ms (default 30 menit)
 * @param {number}   warningMs   - berapa ms sebelum logout warning ditampilkan (default 2 menit)
 * @param {boolean}  enabled     - aktifkan atau matikan hook ini
 */
export function useIdleTimeout({
    onIdle,
    onWarning,
    onActive,
    idleMs = 30 * 60 * 1000,
    warningMs = 2 * 60 * 1000,
    enabled = true,
}) {
    const idleTimer    = useRef(null);
    const warningTimer = useRef(null);
    const isWarning    = useRef(false);

    const clearTimers = useCallback(() => {
        clearTimeout(idleTimer.current);
        clearTimeout(warningTimer.current);
    }, []);

    const startTimers = useCallback(() => {
        clearTimers();

        // Warning timer: (idleMs - warningMs) setelah aktivitas terakhir
        warningTimer.current = setTimeout(() => {
            isWarning.current = true;
            onWarning?.();
        }, idleMs - warningMs);

        // Idle timer: idleMs setelah aktivitas terakhir → logout
        idleTimer.current = setTimeout(() => {
            isWarning.current = false;
            onIdle?.();
        }, idleMs);
    }, [clearTimers, idleMs, warningMs, onIdle, onWarning]);

    const handleActivity = useCallback(() => {
        if (!enabled) return;

        // Kalau sedang di warning window dan user aktif → batalkan logout
        if (isWarning.current) {
            isWarning.current = false;
            onActive?.();
        }

        startTimers();
    }, [enabled, onActive, startTimers]);

    useEffect(() => {
        if (!enabled) {
            clearTimers();
            return;
        }

        // Mulai timer saat pertama kali
        startTimers();

        IDLE_EVENTS.forEach((event) =>
            window.addEventListener(event, handleActivity, { passive: true }),
        );

        return () => {
            clearTimers();
            IDLE_EVENTS.forEach((event) =>
                window.removeEventListener(event, handleActivity),
            );
        };
    }, [enabled, startTimers, handleActivity, clearTimers]);

    // Expose reset manual (untuk dipakai di tombol "Tetap Login")
    return { resetTimer: handleActivity };
}