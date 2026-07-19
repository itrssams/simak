import React from 'react';
import './TableSkeleton.css';

export default function TableSkeleton({
    rows = 5,
    cols = 6,
    className = '',
    showHead = false,
}) {
    const rowArray = Array.from({ length: rows });
    const colArray = Array.from({ length: cols });

    return (
        <div className={`table-skeleton-wrap ${className}`}>
            <table className="table-skeleton">
                {showHead && (
                    <thead>
                        <tr>
                            {colArray.map((_, cIdx) => (
                                <th key={cIdx}>
                                    <div className="skeleton-line skeleton-th" style={{ width: `${50 + (cIdx % 3) * 15}%` }} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                )}
                <tbody>
                    {rowArray.map((_, rIdx) => (
                        <tr key={rIdx} className="skeleton-row">
                            {colArray.map((_, cIdx) => {
                                // Add subtle variety to cell width based on column index
                                let width = '70%';
                                if (cIdx === 0) width = '45px'; // Badge / Sumber / Checkbox
                                else if (cIdx === 1) width = '85%'; // Vendor / Nama
                                else if (cIdx === 2) width = '65%'; // Ref / No Faktur
                                else if (cIdx === cols - 1) width = '75px'; // Action button

                                return (
                                    <td key={cIdx}>
                                        <div className="skeleton-cell-content">
                                            <div
                                                className={`skeleton-line ${cIdx === 0 ? 'skeleton-pill' : cIdx === cols - 1 ? 'skeleton-btn' : ''}`}
                                                style={{ width }}
                                            />
                                            {cIdx === 1 && (
                                                <div className="skeleton-line skeleton-subtext" style={{ width: '45%' }} />
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
