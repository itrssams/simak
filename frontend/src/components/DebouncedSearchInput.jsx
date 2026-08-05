import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';

export default function DebouncedSearchInput({
    value = '',
    onChange,
    placeholder = 'Cari...',
    delay = 400,
    className = '',
    iconSize = 16,
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const debouncedSearchTerm = useDebounce(searchTerm, delay);

    useEffect(() => {
        setSearchTerm(value || '');
    }, [value]);

    useEffect(() => {
        if (debouncedSearchTerm !== value) {
            onChange(debouncedSearchTerm);
        }
    }, [debouncedSearchTerm, onChange, value]);

    return (
        <label className={`dki-search ${className}`.trim()}>
            <Search size={iconSize} />
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
                    onClick={() => {
                        setSearchTerm('');
                        onChange('');
                    }}
                    title="Hapus pencarian"
                >
                    <X size={14} />
                </button>
            )}
        </label>
    );
}
