import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { AKUN_BIAYA_PETTY_CASH, AKUN_MAP } from './pettyCashAccounts';

export default function SearchableAkunBiayaSelect({
    value = '',
    onChange,
    placeholder = 'Pilih Akun Biaya',
    disabled = false,
}) {
    const rootRef = useRef(null);
    const searchInputRef = useRef(null);
    const popoverRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const selectedAccount = useMemo(() => {
        if (!value) return null;
        return AKUN_MAP[value] || { kode: value, nama: value, pos: '' };
    }, [value]);

    // Filter groups based on search query
    const filteredGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return AKUN_BIAYA_PETTY_CASH;

        return AKUN_BIAYA_PETTY_CASH.map(group => {
            const matchPos = group.pos.toLowerCase().includes(q) || group.kode_pos.toLowerCase().includes(q);
            if (matchPos) return group; // Show all if group matches

            const matchedAccounts = group.accounts.filter(acc =>
                acc.kode.toLowerCase().includes(q) || acc.nama.toLowerCase().includes(q)
            );

            return {
                ...group,
                accounts: matchedAccounts
            };
        }).filter(group => group.accounts.length > 0);
    }, [search]);

    const totalMatches = useMemo(() => {
        return filteredGroups.reduce((acc, g) => acc + g.accounts.length, 0);
    }, [filteredGroups]);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (e) => {
            if (
                rootRef.current && !rootRef.current.contains(e.target) &&
                popoverRef.current && !popoverRef.current.contains(e.target)
            ) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open]);

    // Calculate position
    useEffect(() => {
        if (!open) return;
        const updatePosition = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;

            const popoverWidth = Math.max(rect.width, 320);
            const popoverHeight = 320;
            const gap = 4;
            const padding = 10;

            const bottom = rect.bottom + gap;
            const topFallback = rect.top - popoverHeight - gap;
            const top = (bottom + popoverHeight > window.innerHeight - padding)
                ? Math.max(padding, topFallback)
                : bottom;

            const left = Math.max(padding, Math.min(rect.left, window.innerWidth - popoverWidth - padding));

            setPosition({ top, left, width: popoverWidth });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open]);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 30);
        }
    }, [open]);

    const handleSelect = (kode) => {
        onChange?.(kode);
        setOpen(false);
        setSearch('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setOpen(false);
            setSearch('');
        }
    };

    const popover = open ? createPortal(
        <div
            ref={popoverRef}
            className="pc-akun-popover"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width,
                zIndex: 2147483647,
            }}
            onKeyDown={handleKeyDown}
        >
            {/* Search Box */}
            <div className="pc-akun-search-wrap">
                <Search size={14} className="pc-akun-search-icon" />
                <input
                    ref={searchInputRef}
                    type="text"
                    className="pc-akun-search-input"
                    placeholder="Cari kode / nama akun..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <button
                        type="button"
                        className="pc-akun-search-clear"
                        onClick={() => setSearch('')}
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* List Akun Biaya */}
            <div className="pc-akun-list">
                {totalMatches === 0 ? (
                    <div className="pc-akun-empty">
                        Tidak ada akun biaya yang cocok dengan "<strong>{search}</strong>"
                    </div>
                ) : (
                    filteredGroups.map(group => (
                        <div key={group.pos} className="pc-akun-group">
                            <div className="pc-akun-group-header">
                                <span>{group.pos}</span>
                                <span className="pc-akun-badge-count">{group.accounts.length}</span>
                            </div>
                            {group.accounts.map(acc => {
                                const isSelected = acc.kode === value;
                                return (
                                    <div
                                        key={acc.kode}
                                        className={`pc-akun-item${isSelected ? ' selected' : ''}`}
                                        onClick={() => handleSelect(acc.kode)}
                                    >
                                        <div className="pc-akun-item-info">
                                            <span className="pc-akun-kode">{acc.kode}</span>
                                            <span className="pc-akun-nama">{acc.nama}</span>
                                        </div>
                                        {isSelected && <Check size={14} className="pc-akun-check" />}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div ref={rootRef} className="pc-akun-select-wrap">
            <button
                type="button"
                className={`pc-akun-select-trigger${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
            >
                {selectedAccount ? (
                    <span className="pc-akun-trigger-value">
                        <strong className="pc-akun-trigger-kode">{selectedAccount.kode}</strong> - {selectedAccount.nama}
                    </span>
                ) : (
                    <span className="pc-akun-trigger-placeholder">{placeholder}</span>
                )}
                <ChevronDown size={14} className={`pc-akun-trigger-chevron${open ? ' open' : ''}`} />
            </button>
            {popover}
        </div>
    );
}
