import React from 'react';
import './TableSkeleton.css';

export default function TableSkeleton({
    text = 'Memuat data...',
    className = '',
    minHeight = 220,
}) {
    return (
        <div className={`simak-loading-container ${className}`} style={{ minHeight }}>
            <div className="simak-loading-content">
                <div className="simak-spinner-ring" />
                <span className="simak-loading-text">{text}</span>
            </div>
        </div>
    );
}
