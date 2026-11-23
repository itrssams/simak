import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { formatConcurrentEntryText, getConcurrentToneClass } from './concurrentRequestUtils';
import './ConcurrentRequestNotice.css';

export function ConcurrentItemInlineList({ entries = [] }) {
    if (!entries || entries.length === 0) return null;
    return (
        <div className="ccr-inline-list" role="status">
            {entries.map((entry) => (
                <div key={`${entry.permintaan_id}-${entry.id}`} className="ccr-inline-item">
                    <AlertTriangle size={12} className="ccr-inline-icon" aria-hidden="true" />
                    <span className="ccr-inline-text">
                        Ada di <strong className="ccr-inline-nomor">{entry.nomor}</strong>
                        {entry.tanggal ? ` (${entry.tanggal})` : ''} ·{' '}
                        <span className="ccr-num">{formatConcurrentEntryText(entry)}</span> ·{' '}
                        <span className="ccr-inline-status">
                            {entry.item_status_label || entry.item_status}
                        </span>
                    </span>
                </div>
            ))}
        </div>
    );
}

export function ConcurrentApproverBanner({ duplicateItems = [], ruangNama = '', title }) {
    if (!duplicateItems || duplicateItems.length === 0) return null;

    return (
        <div className="ccr-banner is-warning" role="alert">
            <div className="ccr-banner-head">
                <AlertTriangle size={16} className="ccr-banner-icon" />
                <div>
                    <div className="ccr-banner-title">
                        {title || `Perhatian: ${duplicateItems.length} Barang Memiliki Permintaan Lain yang Belum Selesai`}
                    </div>
                    <div className="ccr-banner-sub">
                        Ruangan <strong>{ruangNama || 'ini'}</strong> masih memiliki pengajuan aktif untuk barang berikut agar terhindar dari ACC ganda:
                    </div>
                </div>
            </div>

            <div className="ccr-banner-items">
                {duplicateItems.map((item, idx) => (
                    <div key={item.item_id || item.barang_id || idx} className="ccr-banner-item-row">
                        <div className="ccr-banner-item-name">
                            <strong>{item.barang_nama}</strong>
                            {item.barang_kode && <span className="ccr-code">{item.barang_kode}</span>}
                        </div>
                        <div className="ccr-banner-entries">
                            {(item.other_requests || item.active_requests || []).map((entry) => (
                                <div key={`${entry.permintaan_id}-${entry.id}`} className="ccr-banner-entry">
                                    <span className="ccr-code">{entry.nomor}</span>
                                    {entry.tanggal && <span className="ccr-muted">({entry.tanggal})</span>}
                                    <span className="ccr-num">{formatConcurrentEntryText(entry)}</span>
                                    <span className={`ccr-status-inline ${getConcurrentToneClass(entry.item_status)}`}>
                                        <span className="ccr-status-dot" aria-hidden="true" />
                                        <span>{entry.item_status_label || entry.item_status}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ConcurrentCreateWarningBanner({ duplicates = [], ruangNama = '' }) {
    if (!duplicates || duplicates.length === 0) return null;
    return (
        <ConcurrentApproverBanner
            duplicateItems={duplicates}
            ruangNama={ruangNama}
            title={`Peringatan: ${duplicates.length} Barang Masih Ada di Permintaan Sebelumnya`}
        />
    );
}

export function ConcurrentTableBadge({ count = 0, duplicateItems = [] }) {
    if (!count || count <= 0) return null;
    const summaryText = (duplicateItems || [])
        .map((it) => {
            const reqSummary = (it.other_requests || [])
                .map((r) => `${r.nomor}: ${r.item_status_label || r.item_status}`)
                .join(', ');
            return `${it.barang_nama} (${reqSummary})`;
        })
        .join(' | ');

    return (
        <div
            className="ccr-table-badge"
            title={summaryText || `${count} item memiliki permintaan lain yang belum selesai`}
        >
            <AlertTriangle size={12} className="ccr-table-badge-icon" aria-hidden="true" />
            <span>{count} item pengajuan ganda</span>
        </div>
    );
}

export function ConcurrentDuplicateConfirmModal({
    isOpen,
    ruangNama = '',
    duplicates = [],
    submitting = false,
    onCancel,
    onConfirm,
}) {
    if (!isOpen) return null;

    return createPortal(
        <div className="ccr-confirm-overlay" onClick={() => !submitting && onCancel?.()}>
            <div className="ccr-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="ccr-confirm-title" onClick={(e) => e.stopPropagation()}>
                <div className="ccr-confirm-head">
                    <div className="ccr-confirm-head-left">
                        <AlertTriangle size={18} className="ccr-banner-icon" />
                        <div>
                            <h4 id="ccr-confirm-title">Permintaan Serupa Belum Selesai Ditemukan</h4>
                            <p>Unit <strong>{ruangNama || 'pemohon'}</strong> masih memiliki pengajuan aktif untuk barang berikut.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ccr-confirm-close"
                        onClick={onCancel}
                        disabled={submitting}
                        aria-label="Tutup konfirmasi"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="ccr-confirm-body">
                    <div className="ccr-banner-items ccr-confirm-list">
                        {(duplicates || []).map((dup) => (
                            <div key={dup.barang_id} className="ccr-banner-item-row">
                                <div className="ccr-banner-item-name">
                                    <strong>{dup.barang_nama}</strong>
                                    {dup.barang_kode && <span className="ccr-code">{dup.barang_kode}</span>}
                                </div>
                                <div className="ccr-banner-entries">
                                    {(dup.active_requests || []).map((entry) => (
                                        <div key={`${entry.permintaan_id}-${entry.id}`} className="ccr-banner-entry">
                                            <span className="ccr-code">{entry.nomor}</span>
                                            {entry.tanggal && <span className="ccr-muted">({entry.tanggal})</span>}
                                            <span className="ccr-num">{formatConcurrentEntryText(entry)}</span>
                                            <span className={`ccr-status-inline ${getConcurrentToneClass(entry.item_status)}`}>
                                                <span className="ccr-status-dot" aria-hidden="true" />
                                                <span>{entry.item_status_label || entry.item_status}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="ccr-confirm-note">
                        Untuk mencegah persetujuan/pengambilan ganda, pastikan permintaan baru ini memang tambahan di luar pengajuan yang masih aktif di atas. Tetap kirim pengajuan permintaan ini?
                    </p>
                </div>

                <div className="ccr-confirm-foot">
                    <button
                        type="button"
                        className="ccr-btn secondary"
                        onClick={onCancel}
                        disabled={submitting}
                    >
                        Kembali &amp; Periksa
                    </button>
                    <button
                        type="button"
                        className="ccr-btn primary"
                        onClick={onConfirm}
                        disabled={submitting}
                    >
                        {submitting ? 'Mengirim Permintaan...' : 'Ya, Tetap Ajukan Permintaan'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
