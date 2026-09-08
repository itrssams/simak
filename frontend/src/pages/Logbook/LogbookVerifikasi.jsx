import React, { useState, useEffect } from 'react';
import { FileText, Search, Clock, Check, X, CheckCircle2, XCircle, AlertCircle, Eye } from 'lucide-react';
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
            if (dateFilter) params.start_date = dateFilter; // for simplicity exact date or start
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
            toast.error('Catatan penolakan wajib diisi.');
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
        <div className="logbook-container">
            <div className="logbook-header">
                <div>
                    <h2>Verifikasi Aktivitas</h2>
                    <p>Inbox aktivitas bawahan yang perlu diverifikasi.</p>
                </div>
            </div>

            <div className="logbook-card">
                <div className="logbook-filters">
                    <div className="logbook-search-wrap">
                        <Search size={18} className="logbook-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari pegawai / aktivitas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="logbook-search-input"
                        />
                    </div>
                    <div>
                        <select 
                            className="logbook-select" 
                            style={{ height: '38px' }}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="perlu_verifikasi">Status: Perlu Verifikasi</option>
                            <option value="disetujui">Status: Disetujui</option>
                            <option value="ditolak">Status: Ditolak</option>
                            <option value="all">Status: Semua</option>
                        </select>
                    </div>
                    <div>
                        <input 
                            type="date" 
                            className="logbook-date-input" 
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                    </div>
                    {dateFilter && (
                        <button className="logbook-btn-cancel" onClick={() => setDateFilter('')}>
                            Clear Date
                        </button>
                    )}
                </div>

                <div className="logbook-table-wrap">
                    {loading ? (
                        <div className="logbook-loading-box">
                            <p>Memuat data...</p>
                        </div>
                    ) : inbox.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3>Inbox Kosong</h3>
                            <p>Tidak ada aktivitas yang sesuai dengan filter saat ini.</p>
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center' }}>No</th>
                                    <th>Pegawai</th>
                                    <th>Aktivitas</th>
                                    <th>Waktu / Output</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ width: '130px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inbox.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.user_nama}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.user_role_label} &middot; {item.unit_nama}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500, color: '#0f172a' }}>
                                                {item.uraian_tugas_text || 'Lainnya'}
                                            </div>
                                            {(item.nama_aktivitas || item.deskripsi) && (
                                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                                                    {item.nama_aktivitas || item.deskripsi.substring(0, 50) + (item.deskripsi.length > 50 ? '...' : '')}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
                                                {formatDate(item.tanggal)}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                                {formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)} ({item.durasi_format})
                                            </div>
                                            {item.nilai_output > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: '#0ea5e9', marginTop: '2px', fontWeight: 500 }}>
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
                                                    title="Detail"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                {item.status === 'perlu_verifikasi' && (
                                                    <>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-green" 
                                                            onClick={() => handleAksiVerifikasi(item, 'setuju')}
                                                            title="Setujui"
                                                        >
                                                            <Check size={16} strokeWidth={3} />
                                                        </button>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-red" 
                                                            onClick={() => handleAksiVerifikasi(item, 'tolak')}
                                                            title="Tolak"
                                                        >
                                                            <X size={16} strokeWidth={3} />
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

            {/* Modal Verifikasi */}
            {verifikasiItem && (
                <div className="logbook-modal-overlay" onClick={closeVerifikasiModal}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Konfirmasi {verifikasiAksi === 'setuju' ? 'Persetujuan' : 'Penolakan'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeVerifikasiModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <p>
                                Anda akan <strong>{verifikasiAksi === 'setuju' ? 'MENYETUJUI' : 'MENOLAK'}</strong> aktivitas dari <strong>{verifikasiItem.user_nama}</strong>.
                            </p>
                            
                            {verifikasiAksi === 'tolak' && (
                                <div className="logbook-field-group" style={{ marginTop: '16px' }}>
                                    <label>Catatan Penolakan <span style={{color: 'red'}}>*</span></label>
                                    <textarea
                                        rows={3}
                                        value={catatan}
                                        onChange={(e) => setCatatan(e.target.value)}
                                        className="logbook-textarea"
                                        placeholder="Berikan alasan mengapa aktivitas ini ditolak..."
                                    />
                                </div>
                            )}
                            
                            {verifikasiAksi === 'setuju' && (
                                <div className="logbook-field-group" style={{ marginTop: '16px' }}>
                                    <label>Catatan (Opsional)</label>
                                    <textarea
                                        rows={2}
                                        value={catatan}
                                        onChange={(e) => setCatatan(e.target.value)}
                                        className="logbook-textarea"
                                        placeholder="Tambahkan catatan jika perlu..."
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
                                className={`logbook-btn-primary ${verifikasiAksi === 'tolak' ? 'danger' : ''}`}
                                style={verifikasiAksi === 'setuju' ? { backgroundColor: '#10b981' } : { backgroundColor: '#ef4444' }}
                                onClick={submitVerifikasi} 
                                disabled={verifying}
                            >
                                {verifying ? 'Memproses...' : (verifikasiAksi === 'setuju' ? 'Setujui' : 'Tolak')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {detailItem && (
                <div className="logbook-modal-overlay" onClick={() => setDetailItem(null)}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Detail Aktivitas Bawahan</h3>
                            <button className="logbook-modal-close-btn" onClick={() => setDetailItem(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Pegawai</span>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{detailItem.user_nama}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{detailItem.user_role_label} &middot; {detailItem.unit_nama}</div>
                                </div>
                                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tanggal & Waktu</span>
                                    <div style={{ fontWeight: 500, color: '#0f172a' }}>
                                        {formatDate(detailItem.tanggal)} &middot; {formatTime(detailItem.jam_mulai)} - {formatTime(detailItem.jam_selesai)} ({detailItem.durasi_format})
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Status</span>
                                    <div style={{ marginTop: '4px' }}>
                                        <StatusBadge status={detailItem.status} statusLabel={detailItem.status_label} />
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Uraian Tugas</span>
                                    <div style={{ fontWeight: 500, color: '#0f172a' }}>{detailItem.uraian_tugas_text || 'Lainnya'}</div>
                                </div>
                                {detailItem.nama_aktivitas && (
                                    <div>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Nama Aktivitas</span>
                                        <div style={{ color: '#0f172a' }}>{detailItem.nama_aktivitas}</div>
                                    </div>
                                )}
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Output</span>
                                    <div style={{ color: '#0f172a' }}>
                                        {detailItem.nilai_output > 0 ? `${detailItem.nilai_output} ${detailItem.satuan_output}` : '-'}
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Deskripsi</span>
                                    <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap' }}>{detailItem.deskripsi}</div>
                                </div>
                                {detailItem.status === 'ditolak' && detailItem.catatan_verifikasi && (
                                    <div style={{ backgroundColor: '#fef2f2', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 'bold' }}>Catatan Penolakan:</span>
                                        <div style={{ color: '#991b1b', marginTop: '4px' }}>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}
                                {detailItem.status === 'disetujui' && detailItem.catatan_verifikasi && (
                                    <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #22c55e' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 'bold' }}>Catatan Persetujuan:</span>
                                        <div style={{ color: '#166534', marginTop: '4px' }}>{detailItem.catatan_verifikasi}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {detailItem.status === 'perlu_verifikasi' && (
                            <div className="logbook-modal-footer">
                                <button 
                                    className="logbook-btn-danger" 
                                    onClick={() => { setDetailItem(null); handleAksiVerifikasi(detailItem, 'tolak'); }}
                                >
                                    <X size={16} /> Tolak
                                </button>
                                <button 
                                    className="logbook-btn-success" 
                                    onClick={() => { setDetailItem(null); handleAksiVerifikasi(detailItem, 'setuju'); }}
                                >
                                    <Check size={16} /> Setujui
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
