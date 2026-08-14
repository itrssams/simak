import { useEffect, useState, useRef } from 'react';
import { Search, X } from 'lucide-react';

export default function DebouncedSearchInput({
    value = '',
    onChange,
    placeholder = 'Cari...',
    delay = 400,
    className = '',
    iconSize = 16,
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const timeoutRef = useRef(null);

    // Synchronize internal state whenever `value` prop changes from parent (e.g. Reset Filter)
    useEffect(() => {
        setSearchTerm(value || '');
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, [value]);

    const handleInputChange = (e) => {
        const newVal = e.target.value;
        setSearchTerm(newVal);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            onChange(newVal);
        }, delay);
    };

    const handleClear = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setSearchTerm('');
        onChange('');
    };

    return (
        <label className={`dki-search ${className}`.trim()}>
            <Search size={iconSize} />
            <input
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                placeholder={placeholder}
            />
            {searchTerm && (
                <button
                    type="button"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: 0.65,
                    }}
                    onClick={handleClear}
                    title="Hapus pencarian"
                >
                    <X size={14} />
                </button>
            )}
        </label>
    );
}
