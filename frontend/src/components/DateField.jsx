import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { id as localeId } from 'date-fns/locale';
import './DateField.css';

const dateToStr = (date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
const strToDate = (value) => value ? new Date(value) : null;

export default function DateField({ value, onChange, disabled = false, placeholder = 'dd/mm/yy', className = '' }) {
    const wrapRef = useRef(null);
    const popoverRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(() => strToDate(value));
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event) => {
            const target = event.target;
            const insideInput = wrapRef.current?.contains(target);
            const insidePopover = popoverRef.current?.contains(target);
            if (!insideInput && !insidePopover) {
                setOpen(false);
                setDraft(strToDate(value));
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open, value]);

    useEffect(() => {
        if (!open) return undefined;
        const updatePosition = () => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (!rect) return;
            const popoverWidth = 292;
            const popoverHeight = popoverRef.current?.offsetHeight || 330;
            const gap = 6;
            const viewportPadding = 10;
            const maxLeft = window.innerWidth - popoverWidth - viewportPadding;
            const bottomTop = rect.bottom + gap;
            const topTop = rect.top - popoverHeight - gap;
            const top = bottomTop + popoverHeight > window.innerHeight - viewportPadding
                ? Math.max(viewportPadding, topTop)
                : bottomTop;
            setPosition({
                top,
                left: Math.max(viewportPadding, Math.min(rect.left, maxLeft)),
            });
        };

        updatePosition();
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open]);

    const apply = () => {
        onChange(dateToStr(draft));
        setOpen(false);
    };

    const cancel = () => {
        setDraft(strToDate(value));
        setOpen(false);
    };

    const openPicker = () => {
        if (disabled) return;
        setDraft(strToDate(value));
        setOpen(true);
    };

    const popover = open ? createPortal(
        <div
            ref={popoverRef}
            className="df-popover"
            style={{ top: position.top, left: position.left }}
        >
            <DatePicker
                inline
                selected={draft}
                onChange={(date) => setDraft(date)}
                locale={localeId}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                showDaysOutsideCurrentMonth
            />
            <div className="df-actions">
                <button type="button" className="df-btn soft" onClick={cancel}>Batal</button>
                <button type="button" className="df-btn ok" onClick={apply} disabled={!draft}>OK</button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <span ref={wrapRef} className={`df-wrap ${className}`}>
            <input
                className="df-input"
                type="text"
                value={value ? dateToStr(strToDate(value)).split('-').reverse().join('/') : ''}
                placeholder={placeholder}
                disabled={disabled}
                readOnly
                onClick={openPicker}
            />
            {popover}
        </span>
    );
}
