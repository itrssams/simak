import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import './SearchablePembiayaanSelect.css';

const normalize = (value) => String(value || '').toLowerCase().trim();

export default function SearchablePembiayaanSelect({
    options = [],
    value = '',
    onChange,
    placeholder = 'Pilih pembiayaan',
    className = '',
    disabled = false,
}) {
    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const popoverRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const selectedOption = useMemo(() => {
        const found = options.find((item) => String(item.value) === String(value));
        if (found) return found;
        if (value) return { value, label: value }; // Fallback to display the raw value if not in options
        return null;
    }, [options, value]);

    const filteredOptions = useMemo(() => {
        const needle = normalize(query);
        if (!needle) return options;
        return options.filter((item) => {
            const label = normalize(item.label);
            const optionValue = normalize(item.value);
            return label.includes(needle) || optionValue.includes(needle);
        });
    }, [options, query]);

    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event) => {
            const target = event.target;
            const insideRoot = rootRef.current?.contains(target);
            const insidePopover = popoverRef.current?.contains(target);
            if (!insideRoot && !insidePopover) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const updatePosition = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const gap = 6;
            const viewportPadding = 10;
            const popoverHeight = popoverRef.current?.offsetHeight || 260;
            const bottomTop = rect.bottom + gap;
            const topTop = rect.top - popoverHeight - gap;
            const top = bottomTop + popoverHeight > window.innerHeight - viewportPadding
                ? Math.max(viewportPadding, topTop)
                : bottomTop;

            setPosition({
                top,
                left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)),
                width: Math.max(rect.width, 0),
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

    useEffect(() => {
        if (open) {
            setActiveIndex(0);
        }
    }, [open, query]);

    const openList = () => {
        if (disabled) return;
        setOpen(true);
        setQuery('');
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const selectOption = (option) => {
        if (!option) return;
        onChange?.(option.value);
        setOpen(false);
        setQuery('');
    };

    const handleKeyDown = (event) => {
        if (disabled) return;
        if (!open && event.key.length === 1) {
            setOpen(true);
            setQuery(event.key);
            event.preventDefault();
            return;
        }
        if (!open && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
            openList();
            event.preventDefault();
            return;
        }
        if (!open) return;
        if (event.key === 'ArrowDown') {
            setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            setActiveIndex((index) => Math.max(index - 1, 0));
            event.preventDefault();
        } else if (event.key === 'Enter') {
            selectOption(filteredOptions[activeIndex]);
            event.preventDefault();
        } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
            event.preventDefault();
        }
    };

    const popover = open ? createPortal(
        <div
            ref={popoverRef}
            className="pbiaya-options df-popover-portal"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width,
                zIndex: 2147483647,
            }}
            role="listbox"
        >
            {filteredOptions.length === 0 ? (
                <div className="pbiaya-empty">Pilihan tidak ditemukan</div>
            ) : filteredOptions.map((option, index) => {
                const selected = String(option.value) === String(value);
                return (
                    <button
                        key={`${option.value}-${option.label}`}
                        type="button"
                        className={`${index === activeIndex ? 'active' : ''}${selected ? ' selected' : ''}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            selectOption(option);
                        }}
                        role="option"
                        aria-selected={selected}
                    >
                        <span>{option.label}</span>
                        {selected && <Check size={15} />}
                    </button>
                );
            })}
        </div>,
        document.body
    ) : null;

    return (
        <div
            ref={rootRef}
            className={`pbiaya-select ${className}`.trim()}
            onKeyDown={handleKeyDown}
        >
            <div className={`pbiaya-select-control${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} onClick={openList}>
                <Search size={15} />
                <input
                    ref={inputRef}
                    value={open ? query : selectedOption?.label || ''}
                    placeholder={selectedOption ? '' : placeholder}
                    disabled={disabled}
                    onFocus={openList}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                />
                <ChevronDown size={16} className={`pbiaya-chevron${open ? ' open' : ''}`} />
            </div>
            {popover}
        </div>
    );
}
