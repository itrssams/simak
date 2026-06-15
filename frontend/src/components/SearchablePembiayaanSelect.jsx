import { useEffect, useMemo, useRef, useState } from 'react';
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
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const selectedOption = useMemo(
        () => options.find((item) => String(item.value) === String(value)),
        [options, value],
    );

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
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
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
            {open && (
                <div className="pbiaya-options" role="listbox">
                    {filteredOptions.length === 0 ? (
                        <div className="pbiaya-empty">Pembiayaan tidak ditemukan</div>
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
                </div>
            )}
        </div>
    );
}
