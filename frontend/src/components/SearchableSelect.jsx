import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check, FileText, Sparkles } from 'lucide-react';
import './SearchableSelect.css';

const normalize = (value) => String(value || '').toLowerCase().trim();

export default function SearchableSelect({
    options = [],
    value = '',
    onChange,
    placeholder = 'Pilih opsi...',
    searchPlaceholder = 'Ketik untuk mencari...',
    emptyMessage = 'Pilihan tidak ditemukan',
    className = '',
    disabled = false,
    required = false,
    name = '',
    clearable = false,
    minDropdownWidth = 420,
    maxDropdownWidth = 720,
}) {
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);
    const searchInputRef = useRef(null);
    const listRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0, openUp: false });

    // Find selected option object
    const selectedOption = useMemo(() => {
        return options.find((item) => String(item.value) === String(value)) || null;
    }, [options, value]);

    // Filter options based on query
    const filteredOptions = useMemo(() => {
        const needle = normalize(query);
        if (!needle) return options;
        return options.filter((item) => {
            const label = normalize(item.label);
            const subtext = normalize(item.subtext);
            return label.includes(needle) || subtext.includes(needle);
        });
    }, [options, query]);

    // Keep activeIndex within bounds
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    // Close on click outside
    useEffect(() => {
        if (!open) return undefined;
        const handlePointerDown = (event) => {
            const target = event.target;
            const insideTrigger = rootRef.current?.contains(target);
            const insidePopover = popoverRef.current?.contains(target);
            if (!insideTrigger && !insidePopover) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open]);

    // Update position of popover
    const updatePosition = useCallback(() => {
        const triggerRect = triggerRef.current?.getBoundingClientRect();
        if (!triggerRect) return;

        const viewportPadding = 12;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Compute desired width (at least trigger width, bounded by min/max and viewport)
        let desiredWidth = Math.max(triggerRect.width, minDropdownWidth);
        desiredWidth = Math.min(desiredWidth, maxDropdownWidth);
        desiredWidth = Math.min(desiredWidth, viewportWidth - (viewportPadding * 2));

        // Horizontal alignment: try left align with trigger, but clamp within viewport
        let left = triggerRect.left;
        if (left + desiredWidth > viewportWidth - viewportPadding) {
            left = viewportWidth - desiredWidth - viewportPadding;
        }
        if (left < viewportPadding) {
            left = viewportPadding;
        }

        // Vertical alignment: check space below vs above
        const gap = 6;
        const estimatedHeight = popoverRef.current?.offsetHeight || 320;
        const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
        const spaceAbove = triggerRect.top - viewportPadding;

        let openUp = false;
        let top = triggerRect.bottom + gap;

        if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
            openUp = true;
            top = Math.max(viewportPadding, triggerRect.top - estimatedHeight - gap);
        }

        setPosition({
            top,
            left,
            width: desiredWidth,
            openUp,
        });
    }, [minDropdownWidth, maxDropdownWidth]);

    useEffect(() => {
        if (!open) return undefined;
        updatePosition();

        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        // Auto focus search input
        const timer = setTimeout(() => {
            searchInputRef.current?.focus();
        }, 30);

        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            clearTimeout(timer);
        };
    }, [open, updatePosition]);

    // Scroll active item into view
    useEffect(() => {
        if (!open || !listRef.current) return;
        const activeEl = listRef.current.children[activeIndex];
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, open]);

    const handleOpen = () => {
        if (disabled) return;
        setOpen(true);
        setQuery('');
    };

    const handleClose = () => {
        setOpen(false);
        setQuery('');
        triggerRef.current?.focus();
    };

    const handleSelect = (option) => {
        if (!option) return;
        onChange?.(option.value);
        setOpen(false);
        setQuery('');
        triggerRef.current?.focus();
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange?.('');
        setQuery('');
    };

    // Keyboard navigation on trigger
    const handleTriggerKeyDown = (e) => {
        if (disabled) return;
        if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            handleOpen();
        }
    };

    // Keyboard navigation inside popover
    const handlePopoverKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredOptions[activeIndex]) {
                handleSelect(filteredOptions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleClose();
        }
    };

    const popoverContent = open ? (
        <div
            ref={popoverRef}
            className={`searchable-select-popover ${position.openUp ? 'popover-up' : 'popover-down'}`}
            style={{
                position: 'fixed',
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width}px`,
                zIndex: 999999,
            }}
            onKeyDown={handlePopoverKeyDown}
            role="dialog"
            aria-modal="true"
        >
            {/* Popover Header / Search */}
            <div className="searchable-select-header">
                <div className="searchable-select-search-wrap">
                    <Search size={15} className="searchable-select-search-icon" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="searchable-select-search-input"
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handlePopoverKeyDown}
                    />
                    {query && (
                        <button
                            type="button"
                            className="searchable-select-search-clear"
                            onClick={() => {
                                setQuery('');
                                searchInputRef.current?.focus();
                            }}
                            title="Bersihkan pencarian"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="searchable-select-count">
                    {filteredOptions.length} pilihan
                </div>
            </div>

            {/* Options List */}
            <div ref={listRef} className="searchable-select-list" role="listbox">
                {filteredOptions.length === 0 ? (
                    <div className="searchable-select-empty">
                        <FileText size={22} className="searchable-select-empty-icon" />
                        <span>{emptyMessage}</span>
                    </div>
                ) : (
                    filteredOptions.map((opt, idx) => {
                        const isSelected = String(opt.value) === String(value);
                        const isActive = idx === activeIndex;
                        const isSpecial = Boolean(opt.isSpecial);

                        return (
                            <button
                                key={`${opt.value}-${idx}`}
                                type="button"
                                className={`searchable-select-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''} ${isSpecial ? 'special-item' : ''}`}
                                onClick={() => handleSelect(opt)}
                                onMouseEnter={() => setActiveIndex(idx)}
                                role="option"
                                aria-selected={isSelected}
                            >
                                <div className="searchable-select-item-icon">
                                    {isSpecial ? (
                                        <Sparkles size={15} />
                                    ) : (
                                        <span className="searchable-select-item-num">{idx + 1}</span>
                                    )}
                                </div>
                                <div className="searchable-select-item-content">
                                    <div className="searchable-select-item-label">
                                        {opt.label}
                                    </div>
                                    {opt.subtext && (
                                        <div className="searchable-select-item-subtext">
                                            {opt.subtext}
                                        </div>
                                    )}
                                </div>
                                {isSelected && (
                                    <div className="searchable-select-item-check">
                                        <Check size={16} />
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={rootRef} className={`searchable-select-container ${className}`}>
            {/* Hidden native input for form compatibility/validation */}
            {name && (
                <input
                    type="hidden"
                    name={name}
                    value={value || ''}
                    required={required}
                />
            )}

            {/* Trigger Button */}
            <div
                ref={triggerRef}
                tabIndex={disabled ? -1 : 0}
                className={`searchable-select-trigger ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${!selectedOption ? 'placeholder' : ''}`}
                onClick={handleOpen}
                onKeyDown={handleTriggerKeyDown}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <div className="searchable-select-trigger-text">
                    {selectedOption ? (
                        <span className="searchable-select-value-text">
                            {selectedOption.isSpecial ? (
                                <span className="searchable-select-special-tag">
                                    <Sparkles size={12} /> {selectedOption.label}
                                </span>
                            ) : (
                                selectedOption.label
                            )}
                        </span>
                    ) : (
                        <span className="searchable-select-placeholder-text">{placeholder}</span>
                    )}
                </div>

                <div className="searchable-select-trigger-actions">
                    {clearable && selectedOption && !disabled && (
                        <button
                            type="button"
                            className="searchable-select-clear-btn"
                            onClick={handleClear}
                            title="Hapus pilihan"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={16} className={`searchable-select-chevron ${open ? 'open' : ''}`} />
                </div>
            </div>

            {/* Portal Popover */}
            {typeof document !== 'undefined' && createPortal(popoverContent, document.body)}
        </div>
    );
}

