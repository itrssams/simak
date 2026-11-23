import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import {
    QUICK_DURATION_OPTIONS,
    toTimeHHMM,
    isValidTimeHHMM,
    getCurrentTimeHHMM,
    addMinutesToTime,
    calculateDurationInfo,
    normalizeManualTimeInput,
} from '../utils/timeUtils';
import './TimeField.css';

const DIAL_SIZE = 220;
const DIAL_CENTER = DIAL_SIZE / 2;
const OUTER_RADIUS = 86;
const INNER_RADIUS = 54;
const RING_THRESHOLD = (OUTER_RADIUS + INNER_RADIUS) / 2;

const OUTER_HOURS = Array.from({ length: 12 }, (_, idx) => ({
    value: idx === 0 ? 12 : idx,
    label: idx === 0 ? '12' : String(idx),
    angle: idx * 30,
}));

const INNER_HOURS = Array.from({ length: 12 }, (_, idx) => ({
    value: idx === 0 ? 0 : idx + 12,
    label: idx === 0 ? '00' : String(idx + 12),
    angle: idx * 30,
}));

const MINUTE_TICKS = Array.from({ length: 12 }, (_, idx) => {
    const val = idx * 5;
    return {
        value: val,
        label: String(val).padStart(2, '0'),
        angle: val * 6,
    };
});

function getDialCoords(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
        x: DIAL_CENTER + radius * Math.sin(rad),
        y: DIAL_CENTER - radius * Math.cos(rad),
    };
}

export function TimeQuickDurationBar({
    startTime,
    endTime,
    onSetStartTime,
    onSetStartAndEnd,
    disabled = false,
}) {
    const durationInfo = calculateDurationInfo(startTime, endTime);

    const handleSetNow = () => {
        if (disabled) return;
        onSetStartTime?.(getCurrentTimeHHMM());
    };

    const handleQuickDuration = (deltaMinutes) => {
        if (disabled) return;
        const baseStart = toTimeHHMM(startTime) || getCurrentTimeHHMM();
        const nextEnd = addMinutesToTime(baseStart, deltaMinutes);
        onSetStartAndEnd?.(baseStart, nextEnd);
    };

    return (
        <div className="tp-quick-bar">
            <div className="tp-quick-chips" role="group" aria-label="Pintasan waktu dan durasi cepat">
                <button
                    type="button"
                    className="tp-quick-chip tp-quick-chip-now"
                    disabled={disabled}
                    onClick={handleSetNow}
                    title="Isi Jam Mulai dengan waktu saat ini"
                >
                    Sekarang
                </button>
                {QUICK_DURATION_OPTIONS.map((opt) => {
                    const isActive = durationInfo?.minutes === opt.minutes;
                    return (
                        <button
                            key={opt.label}
                            type="button"
                            className={`tp-quick-chip ${isActive ? 'active' : ''}`}
                            disabled={disabled}
                            onClick={() => handleQuickDuration(opt.minutes)}
                            title={`Hitung Jam Selesai ${opt.label} dari Jam Mulai`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {durationInfo && (
                <span className="tp-duration-badge">
                    <Clock size={12} />
                    <span>
                        Durasi: <strong>{durationInfo.label}</strong>
                    </span>
                </span>
            )}
        </div>
    );
}

export default function TimeField({
    value = '',
    onChange,
    placeholder = 'HH:mm',
    disabled = false,
    required = false,
    name,
    id,
    ariaLabel,
    className = '',
}) {
    const normalizedProp = toTimeHHMM(value) || (typeof value === 'string' ? value : '');
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(null);
    const [mode, setMode] = useState('hour');
    const [dialHour, setDialHour] = useState(() => new Date().getHours());
    const [dialMinute, setDialMinute] = useState(0);
    const [hoverPick, setHoverPick] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState({ top: 0, left: 0 });

    const wrapRef = useRef(null);
    const inputRef = useRef(null);
    const popoverRef = useRef(null);
    const dialRef = useRef(null);
    const draggingRef = useRef(false);

    const displayText = draft !== null ? draft : normalizedProp;
    const currentValid = toTimeHHMM(displayText) || toTimeHHMM(value);

    const openPopover = () => {
        if (disabled) return;
        if (currentValid) {
            const [h, m] = currentValid.split(':').map(Number);
            setDialHour(h);
            setDialMinute(m);
        } else {
            const now = new Date();
            setDialHour(now.getHours());
            setDialMinute(0);
        }
        setHoverPick(null);
        setIsDragging(false);
        draggingRef.current = false;
        setMode('hour');
        setOpen(true);
    };

    useLayoutEffect(() => {
        if (!open) return;

        const updatePosition = () => {
            if (!wrapRef.current) return;
            const rect = wrapRef.current.getBoundingClientRect();
            const popW = popoverRef.current?.offsetWidth || 254;
            const popH = popoverRef.current?.offsetHeight || 384;
            const spaceBelow = window.innerHeight - rect.bottom - 8;
            const spaceAbove = rect.top - 8;

            let top;
            if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
                top = Math.min(window.innerHeight - popH - 8, rect.bottom + 4);
            } else {
                top = Math.max(8, rect.top - popH - 4);
            }
            top = Math.max(8, top);

            const left = Math.max(8, Math.min(rect.left, window.innerWidth - popW - 8));
            setPopoverStyle({ top, left });
        };

        const frame = requestAnimationFrame(updatePosition);
        const onScroll = (e) => {
            if (popoverRef.current?.contains(e.target)) return;
            updatePosition();
        };
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleOutside = (e) => {
            if (wrapRef.current?.contains(e.target)) return;
            if (popoverRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                inputRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open]);

    const commitDraft = (rawText) => {
        const trimmed = (rawText || '').trim();
        setDraft(null);
        if (inputRef.current) inputRef.current.setCustomValidity('');
        if (!trimmed) {
            if (value !== '') onChange?.('');
            return true;
        }
        const normalized = normalizeManualTimeInput(trimmed);
        if (normalized) {
            if (normalized !== toTimeHHMM(value)) onChange?.(normalized);
            return true;
        }
        return false;
    };

    const emitDialTime = (hr, min) => {
        const formatted = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        setDraft(null);
        if (inputRef.current) inputRef.current.setCustomValidity('');
        onChange?.(formatted);
    };

    const handleInputChange = (e) => {
        const raw = e.target.value;
        const isAdding = raw.length >= displayText.length;

        let cleaned = raw.replace(/[^\d:]/g, '');
        const colonIdx = cleaned.indexOf(':');
        if (colonIdx !== -1) {
            const before = cleaned.slice(0, colonIdx).slice(0, 2);
            const after = cleaned.slice(colonIdx + 1).replace(/:/g, '').slice(0, 2);
            cleaned = `${before}:${after}`;
        } else if (isAdding && cleaned.length >= 2) {
            const firstDigit = cleaned[0];
            if (firstDigit >= '3' && firstDigit <= '9') {
                cleaned = `0${firstDigit}:${cleaned.slice(1, 3)}`;
            } else if (cleaned.length >= 3) {
                cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
            }
        }

        cleaned = cleaned.slice(0, 5);

        if (cleaned === '') {
            setDraft(null);
            e.target.setCustomValidity('');
            if (value !== '') onChange?.('');
            return;
        }

        if (isValidTimeHHMM(cleaned)) {
            setDraft(null);
            e.target.setCustomValidity('');
            const [h, m] = cleaned.split(':').map(Number);
            setDialHour(h);
            setDialMinute(m);
            onChange?.(cleaned);
        } else {
            setDraft(cleaned);
            e.target.setCustomValidity('Gunakan format jam 24-jam HH:mm (contoh 08:30)');
        }
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            openPopover();
            return;
        }
        if (e.key === 'Tab') {
            setOpen(false);
            return;
        }
        if (e.key === 'Enter') {
            commitDraft(displayText);
            if (open) {
                e.preventDefault();
                setOpen(false);
            }
        }
    };

    const resolveDialSelection = (clientX, clientY, activeMode) => {
        const el = dialRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const scale = DIAL_SIZE / rect.width;
        const dist = Math.hypot(dx, dy) * scale;
        const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;

        if (activeMode === 'hour') {
            const sector = Math.round(deg / 30) % 12;
            const isInner = dist < RING_THRESHOLD;
            const value = isInner ? (sector === 0 ? 0 : sector + 12) : sector === 0 ? 12 : sector;
            return { value, insideDial: dist <= DIAL_CENTER + 4 };
        }
        return { value: Math.round(deg / 6) % 60, insideDial: dist <= DIAL_CENTER + 4 };
    };

    const commitDialPick = (pickedValue, activeMode) => {
        if (activeMode === 'hour') {
            setDialHour(pickedValue);
            emitDialTime(pickedValue, dialMinute);
        } else {
            setDialMinute(pickedValue);
            emitDialTime(dialHour, pickedValue);
        }
    };

    const handleDialPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        setIsDragging(true);
        const res = resolveDialSelection(e.clientX, e.clientY, mode);
        if (res) {
            setHoverPick({ mode, value: res.value });
            commitDialPick(res.value, mode);
        }
    };

    const handleDialPointerMove = (e) => {
        const res = resolveDialSelection(e.clientX, e.clientY, mode);
        if (!res) return;

        if (draggingRef.current) {
            setHoverPick({ mode, value: res.value });
            commitDialPick(res.value, mode);
            return;
        }

        if (res.insideDial) {
            setHoverPick({ mode, value: res.value });
        } else {
            setHoverPick(null);
        }
    };

    const handleDialPointerUp = (e) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setIsDragging(false);
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        const res = resolveDialSelection(e.clientX, e.clientY, mode);
        if (res) {
            commitDialPick(res.value, mode);
        }
        setHoverPick(null);
        if (mode === 'hour') {
            setMode('minute');
        }
    };

    const handleDialPointerLeave = () => {
        if (!draggingRef.current) {
            setHoverPick(null);
        }
    };

    const handleDialPointerCancel = () => {
        draggingRef.current = false;
        setIsDragging(false);
        setHoverPick(null);
    };

    const handlePopoverNow = () => {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        setHoverPick(null);
        setDialHour(h);
        setDialMinute(m);
        emitDialTime(h, m);
        setOpen(false);
    };

    const handlePopoverOk = () => {
        setHoverPick(null);
        emitDialTime(dialHour, dialMinute);
        setOpen(false);
    };

    // Active display values (real-time hover/drag preview falls back to committed dial values)
    const activeHour = hoverPick?.mode === 'hour' ? hoverPick.value : dialHour;
    const activeMinute = hoverPick?.mode === 'minute' ? hoverPick.value : dialMinute;
    const isInteracting = isDragging || hoverPick !== null;

    // Compute hand geometry for active mode
    const isInnerHour = mode === 'hour' && (activeHour === 0 || activeHour >= 13);
    const handAngle = mode === 'hour' ? (activeHour % 12) * 30 : activeMinute * 6;
    const handRadius = mode === 'hour' && isInnerHour ? INNER_RADIUS : OUTER_RADIUS;
    const tip = getDialCoords(handAngle, handRadius);
    const isOffTickMinute = mode === 'minute' && activeMinute % 5 !== 0;
    const tipCircleRadius = mode === 'hour'
        ? (isInnerHour ? 14 : 16)
        : (isOffTickMinute ? 12 : 16);

    return (
        <div
            ref={wrapRef}
            className={`tp-wrap ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
        >
            <input
                ref={inputRef}
                id={id}
                name={name}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                value={displayText}
                placeholder={placeholder}
                disabled={disabled}
                required={required}
                aria-label={ariaLabel || placeholder}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="tp-input"
                onClick={openPopover}
                onChange={handleInputChange}
                onBlur={(e) => {
                    if (popoverRef.current?.contains(e.relatedTarget)) return;
                    commitDraft(displayText);
                }}
                onKeyDown={handleInputKeyDown}
            />
            <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                className="tp-trigger-btn"
                title="Pilih jam"
                aria-label="Buka jam analog pemilih waktu"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                    if (disabled) return;
                    if (open) {
                        setOpen(false);
                    } else {
                        openPopover();
                    }
                    inputRef.current?.focus();
                }}
            >
                <Clock size={14} />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={popoverRef}
                        className="tp-popover"
                        role="dialog"
                        aria-label="Pemilih Waktu Jam Analog"
                        style={{ top: popoverStyle.top, left: popoverStyle.left }}
                        onMouseDown={(e) => {
                            if (e.target.closest('button')) {
                                e.preventDefault();
                            }
                        }}
                    >
                        {/* Digital Header (Clickable HH : mm) */}
                        <div className="tp-clock-header">
                            <span className="tp-clock-mode-label">
                                {mode === 'hour' ? 'Pilih Jam (24j)' : 'Pilih Menit'}
                            </span>
                            <div className="tp-clock-digital" role="group" aria-label="Pilih mode jam atau menit">
                                <button
                                    type="button"
                                    className={`tp-digital-seg ${mode === 'hour' ? 'active' : ''}`}
                                    aria-pressed={mode === 'hour'}
                                    onClick={() => {
                                        setHoverPick(null);
                                        setMode('hour');
                                    }}
                                >
                                    {String(activeHour).padStart(2, '0')}
                                </button>
                                <span className="tp-digital-sep" aria-hidden="true">:</span>
                                <button
                                    type="button"
                                    className={`tp-digital-seg ${mode === 'minute' ? 'active' : ''}`}
                                    aria-pressed={mode === 'minute'}
                                    onClick={() => {
                                        setHoverPick(null);
                                        setMode('minute');
                                    }}
                                >
                                    {String(activeMinute).padStart(2, '0')}
                                </button>
                            </div>
                        </div>

                        {/* Analog Clock Dial 220x220 */}
                        <div
                            ref={dialRef}
                            className={`tp-dial ${isInteracting ? 'is-interacting' : ''}`}
                            role="slider"
                            aria-label={mode === 'hour' ? 'Dial Jam 24-Jam' : 'Dial Menit'}
                            aria-valuemin={0}
                            aria-valuemax={mode === 'hour' ? 23 : 59}
                            aria-valuenow={mode === 'hour' ? activeHour : activeMinute}
                            onPointerDown={handleDialPointerDown}
                            onPointerMove={handleDialPointerMove}
                            onPointerUp={handleDialPointerUp}
                            onPointerLeave={handleDialPointerLeave}
                            onPointerCancel={handleDialPointerCancel}
                        >
                            <svg
                                className="tp-dial-svg"
                                width={DIAL_SIZE}
                                height={DIAL_SIZE}
                                viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
                                aria-hidden="true"
                            >
                                <line
                                    x1={DIAL_CENTER}
                                    y1={DIAL_CENTER}
                                    x2={tip.x}
                                    y2={tip.y}
                                    stroke="#635bff"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                />
                                <circle
                                    cx={DIAL_CENTER}
                                    cy={DIAL_CENTER}
                                    r="3.5"
                                    fill="#635bff"
                                />
                                <circle
                                    cx={tip.x}
                                    cy={tip.y}
                                    r={tipCircleRadius}
                                    fill="#635bff"
                                />
                                {isOffTickMinute && (
                                    <circle
                                        cx={tip.x}
                                        cy={tip.y}
                                        r="2.5"
                                        fill="#ffffff"
                                    />
                                )}
                            </svg>

                            {mode === 'hour' ? (
                                <>
                                    {OUTER_HOURS.map((item) => {
                                        const pos = getDialCoords(item.angle, OUTER_RADIUS);
                                        const isActive = activeHour === item.value;
                                        return (
                                            <span
                                                key={item.label}
                                                className={`tp-dial-num outer ${isActive ? 'active' : ''}`}
                                                style={{ left: pos.x, top: pos.y }}
                                            >
                                                {item.label}
                                            </span>
                                        );
                                    })}
                                    {INNER_HOURS.map((item) => {
                                        const pos = getDialCoords(item.angle, INNER_RADIUS);
                                        const isActive = activeHour === item.value;
                                        return (
                                            <span
                                                key={item.label}
                                                className={`tp-dial-num inner ${isActive ? 'active' : ''}`}
                                                style={{ left: pos.x, top: pos.y }}
                                            >
                                                {item.label}
                                            </span>
                                        );
                                    })}
                                </>
                            ) : (
                                MINUTE_TICKS.map((item) => {
                                    const pos = getDialCoords(item.angle, OUTER_RADIUS);
                                    const isActive = activeMinute === item.value;
                                    return (
                                        <span
                                            key={item.label}
                                            className={`tp-dial-num outer ${isActive ? 'active' : ''}`}
                                            style={{ left: pos.x, top: pos.y }}
                                        >
                                            {item.label}
                                        </span>
                                    );
                                })
                            )}
                        </div>

                        {/* Compact Footer Actions */}
                        <div className="tp-clock-footer">
                            <button
                                type="button"
                                className="tp-footer-btn tp-footer-now"
                                onClick={handlePopoverNow}
                            >
                                Sekarang
                            </button>
                            <button
                                type="button"
                                className="tp-footer-btn tp-footer-ok"
                                onClick={handlePopoverOk}
                            >
                                OK
                            </button>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
