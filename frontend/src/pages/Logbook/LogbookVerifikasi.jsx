import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Search, Clock, Check, X, CheckCircle2, XCircle, AlertCircle, Eye, CheckCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import './MyLogbook.css';

const formatTime = (timeString) => {
    if (!timeString) return '-';
    return timeString.substring(0, 5);
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
        return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateString;
    }
};

const StatusBadge = ({ status, statusLabel }) => {
    let colorClass = 'status-badge-gray';
    let Icon = AlertCircle;
    
    if (status === 'perlu_verifikasi') {
        colorClass = 'status-badge-warning';
    } else if (status === 'disetujui') {
        colorClass = 'status-badge-success';
        Icon = CheckCircle2;
    } else if (status === 'ditolak') {
        colorClass = 'status-badge-danger';
        Icon = XCircle;
    }

    return (
        <span className={`status-badge ${colorClass}`}>
            <Icon size={14} /> {statusLabel || status}
        </span>
    );
};

export default function LogbookVerifikasi() {
    const toast = useToast();
    const [inbox, setInbox] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filter & Search
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('perlu_verifikasi');

    // Detail Modal state
    const [detailItem, setDetailItem] = useState(null);

    // Verifikasi state
    const [verifikasiItem, setVerifikasiItem] = useState(null);
    const [verifikasiAksi, setVerifikasiAksi] = useState(null); // 'setuju' | 'tolak'
    const [catatan, setCatatan] = useState('');
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        fetchInbox();
    }, [debouncedSearch, dateFilter, statusFilter]);

    const fetchInbox = async () => {
        setLoading(true);
        try {
            const params = {};
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            if (dateFilter) params.tanggal = dateFilter;
            if (statusFilter !== 'all') params.status = statusFilter;

            const res = await api.get('/logbook/inbox/', { params });
            setInbox(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
            toast.error('Gagal memuat inbox verifikasi.');
        } finally {
            setLoading(false);
        }
    };

    const handleAksiVerifikasi = (item, aksi) => {
        setVerifikasiItem(item);
        setVerifikasiAksi(aksi);
        setCatatan('');
    };

    const closeVerifikasiModal = () => {
        setVerifikasiItem(null);
        setVerifikasiAksi(null);
        setCatatan('');
    };

    const submitVerifikasi = async () => {
        if (verifikasiAksi === 'tolak' && !catatan.trim()) {
            toast.error('Catatan penolakan wajib diisi agar pegawai dapat merevisinya.');
            return;
        }

        setVerifying(true);
        try {
            await api.post(`/logbook/${verifikasiItem.id}/verifikasi/`, {
                aksi: verifikasiAksi,
                catatan: catatan
            });
            toast.success(`Aktivitas berhasil di${verifikasiAksi === 'setuju' ? 'setujui' : 'tolak'}.`);
            closeVerifikasiModal();
            fetchInbox();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.error || 'Gagal memverifikasi aktivitas.');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="logbook-page">
            <div className="logbook-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div className="logbook-title">
                    <span><CheckCheck size={22} /></span>
                    <div>
                        <h1>Verifikasi Logbook Bawahan</h1>
                        <p>Tinjau dan validasi catatan aktivitas harian yang diajukan oleh staf dan bawahan langsung Anda.</p>
                    </div>
                </div>
            </div>

            <div className="logbook-card">
                <div className="logbook-filters">
                    <div className="logbook-search-wrap">
                        <Search size={16} className="logbook-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari pegawai, unit, atau uraian..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="logbook-search-input"
                        />
                        {search && (
                            <button className="logbook-search-clear" onClick={() => setSearch('')} title="Reset pencarian">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <select 
                        className="logbook-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="perlu_verifikasi">Perlu Verifikasi</option>
                        <option value="disetujui">Disetujui</option>
                        <option value="ditolak">Ditolak</option>
                        <option value="all">Semua Status</option>
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input 
                            type="date" 
                            className="logbook-filter-date" 
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                        {dateFilter && (
                            <button className="logbook-btn-secondary" onClick={() => setDateFilter('')} style={{ height: '38px', padding: '0 12px' }}>
                                Reset Tanggal
                            </button>
                        )}
                    </div>
                </div>

                <div className="logbook-table-wrap">
                    {loading ? (
                        <div className="logbook-loading-box">
                            <p>Memuat data verifikasi...</p>
                        </div>
                    ) : inbox.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3>Inbox Kosong</h3>
                            <p>Tidak ada aktivitas yang perlu diverifikasi pada filter saat ini.</p>
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '56px', textAlign: 'center' }}>No</th>
                                    <th style={{ width: '180px' }}>Pegawai</th>
                                    <th>Aktivitas & Uraian</th>
                                    <th style={{ width: '170px' }}>Tanggal & Waktu</th>
                                    <th style={{ width: '130px', textAlign: 'center' }}>Status</th>
                                    <th style={{ width: '110px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inbox.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="logbook-row-idx">{idx + 1}</span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{item.user_nama}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                                <span style={{ fontWeight: 500 }}>{item.user_role_label}</span> &bull; {item.unit_nama}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>
                                                {item.uraian_tugas_text || 'Lainnya'}
                                            </div>
                                            {(item.nama_aktivitas || item.deskripsi) && (
                                                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
                                                    {item.nama_aktivitas ? <strong>{item.nama_aktivitas} &mdash; </strong> : null}
                                                    {item.deskripsi ? item.deskripsi.substring(0, 70) + (item.deskripsi.length > 70 ? '...' : '') : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="logbook-table-date">{formatDate(item.tanggal)}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                                                <Clock size={12} style={{ color: '#0284c7' }} />
                                                <span>{formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)}</span>
                                                <span>({item.durasi_format})</span>
                                            </div>
                                            {item.nilai_output > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '2px', fontWeight: 600 }}>
                                                    Output: {item.nilai_output} {item.satuan_output}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <StatusBadge status={item.status} statusLabel={item.status_label} />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                <button 
                                                    className="logbook-btn-icon logbook-text-gray" 
                                                    onClick={() => setDetailItem(item)}
                                                    title="Lihat Detail"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                {item.status === 'perlu_verifikasi' && (
                                                    <>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-green" 
                                                            onClick={() => handleAksiVerifikasi(item, 'setuju')}
                                                            title="Setujui Aktivitas"
                                                        >
                                                            <Check size={16} strokeWidth={2.5} />
                                                        </button>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-red" 
                                                            onClick={() => handleAksiVerifikasi(item, 'tolak')}
                                                            title="Tolak Aktivitas"
                                                        >
                                                            <X size={16} strokeWidth={2.5} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal Konfirmasi Verifikasi (Setuju / Tolak) */}
            {verifikasiItem && createPortal(
                <div className="logbook-modal-overlay" onClick={closeVerifikasiModal}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Konfirmasi {verifikasiAksi === 'setuju' ? 'Persetujuan' : 'Penolakan'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeVerifikasiModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div className="logbook-delete-body" style={{ padding: 0 }}>
                                <p style={{ fontSize: '13.5px', margin: 0 }}>
                                    Apakah Anda yakin ingin <strong>{verifikasiAksi === 'setuju' ? 'MENYETUJUI' : 'MENOLAK'}</strong> aktivitas yang diajukan oleh <strong>{verifikasiItem.user_nama}</strong>?
                                </p>
                                <div className="logbook-delete-item-preview" style={{ marginTop: '12px' }}>
                                    <small>{formatDate(verifikasiItem.tanggal)} &bull; {verifikasiItem.durasi_format}</small>
                                    <div>"{verifikasiItem.uraian_tugas_text || verifikasiItem.nama_aktivitas || verifikasiItem.deskripsi}"</div>
                                </div>
                            </div>
                            
                            {verifikasiAksi === 'tolak' && (
                                <div className="logbook-field-group" style={{ marginTop: '16px' }}>
                                    <label>Catatan Alasan Penolakan <span style={{color: '#ef4444'}}>*</span></label>
                                    <textarea
                                        rows={3}
                                        value={catatan}
                                        onChange={(e) => setCatatan(e.target.value)}
                                        className="logbook-textarea"
                                        placeholder="Berikan alasan spesifik mengapa aktivitas ini ditolak agar bawahan dapat merevisi..."
                                        required
                                    />
                                </div>
                            )}
                            
                            {verifikasiAksi === 'setuju' && (
                                <div className="logbook-field-group" style={{ marginTop: '16px' }}>
                                    <label>Catatan Tambahan (Opsional)</label>
                                    <textarea
                                        rows={2}
                                        value={catatan}
                                        onChange={(e) => setCatatan(e.target.value)}
                                        className="logbook-textarea"
                                        placeholder="Tambahkan catatan apresiasi atau arahan tambahan..."
                                    />
                                </div>
                            )}
                        </div>
                        <div className="logbook-modal-footer">
                            <button type="button" className="logbook-btn-cancel" onClick={closeVerifikasiModal} disabled={verifying}>
                                Batal
                            </button>
                            <button 
                                type="button" 
                                className={verifikasiAksi === 'setuju' ? 'logbook-btn-success' : 'logbook-btn-danger'}
                                onClick={submitVerifikasi} 
                                disabled={verifying}
                            >
                                {verifying ? 'Memproses...' : (verifikasiAksi === 'setuju' ? 'Ya, Setujui' : 'Ya, Tolak')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Detail Modal */}
            {detailItem && createPortal(
                <div className="logbook-modal-overlay" onClick={() => setDetailItem(null)}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Detail Aktivitas Pegawai</h3>
                            <button className="logbook-modal-close-btn" onClick={() => setDetailItem(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div className="logbook-detail-grid">
                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Pegawai yang Mengajukan</span>
                                    <div className="logbook-detail-value" style={{ fontWeight: 600, fontSize: '15px' }}>
                                        {detailItem.user_nama}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {detailItem.user_role_label} &bull; Divisi/Unit: {detailItem.unit_nama}
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Tanggal & Jam Aktivitas</span>
                                    <div className="logbook-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <strong>{formatDate(detailItem.tanggal)}</strong>
                                        <span>&bull;</span>
                                        <span>{formatTime(detailItem.jam_mulai)} - {formatTime(detailItem.jam_selesai)}</span>
                                        <span className="logbook-duration-badge" style={{ marginTop: 0, padding: '2px 8px', fontSize: '11.5px' }}>
                                            {detailItem.durasi_format}
                                        </span>
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Status Verifikasi</span>
                                    <div style={{ marginTop: '4px' }}>
                                        <StatusBadge status={detailItem.status} statusLabel={detailItem.status_label} />
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Uraian Tugas Pokok</span>
                                    <div className="logbook-detail-value">
                                        {detailItem.uraian_tugas_text || 'Lainnya (Di luar uraian tugas pokok)'}
                                    </div>
                                </div>

                                {detailItem.nama_aktivitas && (
                                    <div className="logbook-detail-row">
                                        <span className="logbook-detail-label">Nama Aktivitas</span>
                                        <div className="logbook-detail-value" style={{ fontWeight: 600 }}>
                                            {detailItem.nama_aktivitas}
                                        </div>
                                    </div>
                                )}

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Capaian / Nilai Output</span>
                                    <div className="logbook-detail-value">
                                        {detailItem.nilai_output > 0 ? (
                                            <strong>{detailItem.nilai_output} {detailItem.satuan_output}</strong>
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>Tidak ada target output spesifik</span>
                                        )}
                                    </div>
                                </div>

                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Deskripsi Pekerjaan</span>
                                    <div className="logbook-detail-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                        {detailItem.deskripsi}
                                    </div>
                                </div>

                                {detailItem.status === 'disetujui' && detailItem.catatan_verifikasi && (
                                    <div className="logbook-alert-box success">
                                        <strong style={{ display: 'block', marginBottom: '3px', fontSize: '12px' }}>Catatan Persetujuan:</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}

                                {detailItem.status === 'ditolak' && detailItem.catatan_verifikasi && (
                                    <div className="logbook-alert-box danger">
                                        <strong style={{ display: 'block', marginBottom: '3px', fontSize: '12px' }}>Catatan Penolakan:</strong>
                                        <div>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {detailItem.status === 'perlu_verifikasi' && (
                            <div className="logbook-modal-footer">
                                <button 
                                    className="logbook-btn-danger" 
                                    onClick={() => { const item = detailItem; setDetailItem(null); handleAksiVerifikasi(item, 'tolak'); }}
                                >
                                    <X size={15} /> Tolak
                                </button>
                                <button 
                                    className="logbook-btn-success" 
                                    onClick={() => { const item = detailItem; setDetailItem(null); handleAksiVerifikasi(item, 'setuju'); }}
                                >
                                    <Check size={15} /> Setujui
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
