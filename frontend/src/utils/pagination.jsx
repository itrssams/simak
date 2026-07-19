/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './pagination.css';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const getResults = (data) => (Array.isArray(data) ? data : data?.results || []);

export const getCount = (data) => (Array.isArray(data) ? data.length : Number(data?.count || 0));

export const pageParams = (page, pageSize, extra = {}) => ({
    ...extra,
    page,
    page_size: pageSize,
});

export const pageCount = (total, pageSize) => Math.max(1, Math.ceil(Number(total || 0) / Number(pageSize || 1)));

export function RowSizeSelect({ value, onChange, className = '', style }) {
    return (
        <div className="sp-size-wrap">
            <select className={`sp-size-select ${className}`.trim()} style={style} value={value} onChange={(e) => onChange(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} per halaman</option>)}
            </select>
        </div>
    );
}

export function SimplePagination({ page, pageSize, total, onPageChange, onPageSizeChange, className = '', style }) {
    const totalPages = pageCount(total, pageSize);
    const from = total ? ((page - 1) * pageSize) + 1 : 0;
    const to = Math.min(page * pageSize, total);

    return (
        <div className={`sp-container ${className}`.trim()} style={style}>
            <div className="sp-info">
                Menampilkan <strong>{from}–{to}</strong> dari <strong>{total}</strong> data
            </div>

            <div className="sp-controls">
                <RowSizeSelect value={pageSize} onChange={(size) => { onPageSizeChange(size); onPageChange(1); }} />

                <div className="sp-nav-group">
                    <button
                        type="button"
                        className="sp-nav-btn"
                        disabled={page <= 1}
                        onClick={() => onPageChange(1)}
                        title="Halaman pertama"
                    >
                        <ChevronsLeft size={16} />
                    </button>
                    <button
                        type="button"
                        className="sp-nav-btn"
                        disabled={page <= 1}
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                        title="Halaman sebelumnya"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <div className="sp-page-pill">
                        Halaman <strong>{page}</strong> / {totalPages}
                    </div>

                    <button
                        type="button"
                        className="sp-nav-btn"
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        title="Halaman berikutnya"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <button
                        type="button"
                        className="sp-nav-btn"
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(totalPages)}
                        title="Halaman terakhir"
                    >
                        <ChevronsRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
