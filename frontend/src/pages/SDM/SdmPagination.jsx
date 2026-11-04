import React, { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function SdmPagination({
  totalItems = 0,
  page = 1,
  setPage,
  pageSize = 15,
  setPageSize,
  label = 'data',
  pageSizeOptions = [10, 15, 25, 50, 100],
}) {
  const effectivePageSize = pageSize === 'all' ? Math.max(totalItems, 1) : Number(pageSize) || 15;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, setPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (page >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  }, [page, totalPages]);

  if (totalItems === 0) return null;

  const fromItem = pageSize === 'all' ? 1 : Math.min((page - 1) * effectivePageSize + 1, totalItems);
  const toItem = pageSize === 'all' ? totalItems : Math.min(page * effectivePageSize, totalItems);

  return (
    <div className="sdm-pagination-bar">
      <div className="sdm-pagination-info">
        {pageSize === 'all' ? (
          <span>
            Menampilkan seluruh <strong>{totalItems}</strong> {label}
          </span>
        ) : (
          <span>
            Menampilkan <strong>{fromItem}–{toItem}</strong> dari <strong>{totalItems}</strong> {label}
          </span>
        )}
      </div>

      <div className="sdm-pagination-controls">
        <div className="sdm-pagination-size">
          <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
              setPageSize(val);
              setPage(1);
            }}
            className="sdm-pagination-select"
            title="Jumlah baris per halaman"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / hal
              </option>
            ))}
            <option value="all">Semua</option>
          </select>
        </div>

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="sdm-pagination-nav">
            <button
              type="button"
              className="sdm-page-btn"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              title="Halaman sebelumnya"
            >
              <ChevronLeft size={14} />
            </button>

            {pageNumbers.map((p, idx) =>
              p === '...' ? (
                <span key={`dots-${idx}`} className="sdm-page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`sdm-page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              className="sdm-page-btn"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              title="Halaman berikutnya"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

