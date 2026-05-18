/* eslint-disable react-refresh/only-export-components */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const getResults = (data) => (Array.isArray(data) ? data : data?.results || []);

export const getCount = (data) => (Array.isArray(data) ? data.length : Number(data?.count || 0));

export const pageParams = (page, pageSize, extra = {}) => ({
    ...extra,
    page,
    page_size: pageSize,
});

export const pageCount = (total, pageSize) => Math.max(1, Math.ceil(Number(total || 0) / Number(pageSize || 1)));

export function RowSizeSelect({ value, onChange, className, style }) {
    return (
        <select className={className} style={style} value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} baris</option>)}
        </select>
    );
}

export function SimplePagination({ page, pageSize, total, onPageChange, onPageSizeChange, className = '', buttonClassName = '', selectClassName = '', style }) {
    const totalPages = pageCount(total, pageSize);
    const from = total ? ((page - 1) * pageSize) + 1 : 0;
    const to = Math.min(page * pageSize, total);

    return (
        <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid #edf2f7', ...style }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>{from}-{to} dari {total}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <RowSizeSelect className={selectClassName} value={pageSize} onChange={(size) => { onPageSizeChange(size); onPageChange(1); }} />
                <button className={buttonClassName} disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>{'<'}</button>
                <span style={{ fontSize: 13, color: '#64748b', minWidth: 72, textAlign: 'center' }}>Hal {page}/{totalPages}</span>
                <button className={buttonClassName} disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>{'>'}</button>
            </div>
        </div>
    );
}
