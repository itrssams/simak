import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Check } from 'lucide-react';
import './DateRangePicker.css';

const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

function toYMD(d) {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function DateRangePicker({ dari = '', sampai = '', onChange, placeholder = 'Pilih Periode', className = '', disabled = false }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    const [tempDari, setTempDari] = useState(dari);
    const [tempSampai, setTempSampai] = useState(sampai);
    const [hoverDate, setHoverDate] = useState('');

    const initialView = useMemo(() => {
        const d = dari ? new Date(dari) : new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    }, [dari]);

    const [viewYear, setViewYear] = useState(initialView.year);
    const [viewMonth, setViewMonth] = useState(initialView.month);

    useEffect(() => {
        setTempDari(dari);
        setTempSampai(sampai);
        if (dari) {
            const d = new Date(dari);
            if (!isNaN(d.getTime())) {
                setViewYear(d.getFullYear());
                setViewMonth(d.getMonth());
            }
        }
    }, [dari, sampai, open]);

    useEffect(() => {
        if (!open) return undefined;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(viewYear - 1);
        } else {
            setViewMonth(viewMonth - 1);
        }
    };

    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(viewYear + 1);
        } else {
            setViewMonth(viewMonth + 1);
        }
    };

    const handleDayClick = (ymd) => {
        if (!tempDari || (tempDari && tempSampai)) {
            setTempDari(ymd);
            setTempSampai('');
        } else if (tempDari && !tempSampai) {
            if (ymd < tempDari) {
                setTempDari(ymd);
                setTempSampai('');
            } else {
                setTempSampai(ymd);
            }
        }
    };

    const applyPreset = (type) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let start = new Date(today);
        let end = new Date(today);

        if (type === 'today') {
            // start & end = today
        } else if (type === '7days') {
            start.setDate(today.getDate() - 6);
        } else if (type === '30days') {
            start.setDate(today.getDate() - 29);
        } else if (type === 'thisMonth') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (type === 'clear') {
            setTempDari('');
            setTempSampai('');
            onChange({ dari: '', sampai: '' });
            setOpen(false);
            return;
        }

        const ymdStart = toYMD(start);
        const ymdEnd = toYMD(end);

        setTempDari(ymdStart);
        setTempSampai(ymdEnd);
        setViewYear(start.getFullYear());
        setViewMonth(start.getMonth());

        onChange({ dari: ymdStart, sampai: ymdEnd });
        setOpen(false);
    };

    const handleApply = () => {
        onChange({ dari: tempDari, sampai: tempSampai });
        setOpen(false);
    };

    const calendarDays = useMemo(() => {
        const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
        const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

        let startDay = firstDayOfMonth.getDay() - 1;
        if (startDay < 0) startDay = 6;

        const totalDays = lastDayOfMonth.getDate();
        const days = [];

        const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
        for (let i = startDay - 1; i >= 0; i--) {
            days.push({ day: prevMonthLastDay - i, isCurrentMonth: false, ymd: '' });
        }

        for (let d = 1; d <= totalDays; d++) {
            const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ day: d, isCurrentMonth: true, ymd });
        }

        const remaining = 42 - days.length;
        for (let d = 1; d <= remaining; d++) {
            days.push({ day: d, isCurrentMonth: false, ymd: '' });
        }

        return days;
    }, [viewYear, viewMonth]);

    const triggerText = useMemo(() => {
        if (dari && sampai) {
            return `${formatDateShort(dari)} — ${formatDateShort(sampai)}`;
        }
        if (dari) {
            return `Dari ${formatDateShort(dari)}`;
        }
        if (sampai) {
            return `Sampai ${formatDateShort(sampai)}`;
        }
        return placeholder;
    }, [dari, sampai, placeholder]);

    return (
        <div className={`drp-container ${className}`.trim()} ref={containerRef}>
            <button
                type="button"
                className={`drp-trigger ${open ? 'active' : ''} ${(dari || sampai) ? 'has-value' : ''}`}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
            >
                <CalendarDays size={15} className="drp-icon" />
                <span className="drp-label">{triggerText}</span>
                <ChevronDown size={14} className={`drp-chevron ${open ? 'open' : ''}`} />
            </button>

            {open && (
                <div className="drp-popover" role="dialog">
                    <div className="drp-presets">
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('today')}>Hari Ini</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('7days')}>7 Hari</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('30days')}>30 Hari</button>
                        <button type="button" className="drp-preset-btn" onClick={() => applyPreset('thisMonth')}>Bulan Ini</button>
                        <button type="button" className="drp-preset-btn clear" onClick={() => applyPreset('clear')}>Semua</button>
                    </div>

                    <div className="drp-month-nav">
                        <button type="button" className="drp-nav-btn" onClick={prevMonth} aria-label="Bulan sebelumnya">
                            <ChevronLeft size={17} />
                        </button>
                        <span className="drp-month-title">
                            {MONTH_NAMES[viewMonth]} {viewYear}
                        </span>
                        <button type="button" className="drp-nav-btn" onClick={nextMonth} aria-label="Bulan berikutnya">
                            <ChevronRight size={17} />
                        </button>
                    </div>

                    <div className="drp-weekdays">
                        {DAY_NAMES.map((name) => (
                            <span key={name} className="drp-weekday">{name}</span>
                        ))}
                    </div>

                    <div className="drp-days-grid">
                        {calendarDays.map((item, idx) => {
                            if (!item.isCurrentMonth) {
                                return <div key={idx} className="drp-day muted">{item.day}</div>;
                            }

                            const isStart = item.ymd === tempDari;
                            const isEnd = item.ymd === tempSampai;
                            const isSelected = isStart || isEnd;

                            let inRange = false;
                            if (tempDari && tempSampai) {
                                inRange = item.ymd >= tempDari && item.ymd <= tempSampai;
                            } else if (tempDari && !tempSampai && hoverDate) {
                                const rangeMin = tempDari < hoverDate ? tempDari : hoverDate;
                                const rangeMax = tempDari > hoverDate ? tempDari : hoverDate;
                                inRange = item.ymd >= rangeMin && item.ymd <= rangeMax;
                            }

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    className={`drp-day ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} ${isSelected ? 'selected' : ''} ${inRange ? 'in-range' : ''}`}
                                    onClick={() => handleDayClick(item.ymd)}
                                    onMouseEnter={() => setHoverDate(item.ymd)}
                                >
                                    <span>{item.day}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="drp-footer">
                        <button type="button" className="drp-btn-soft" onClick={() => applyPreset('clear')}>
                            <RotateCcw size={13} /> Reset
                        </button>
                        <button type="button" className="drp-btn-primary" onClick={handleApply}>
                            <Check size={14} /> Selesai
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
