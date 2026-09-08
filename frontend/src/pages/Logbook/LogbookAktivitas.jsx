import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, FileText, Search, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
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

export default function LogbookAktivitas() {
    const toast = useToast();
    const [aktivitas, setAktivitas] = useState([]);
    const [uraianTugasOpts, setUraianTugasOpts] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filter & Search
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        tanggal: new Date().toISOString().split('T')[0],
        uraian_tugas_id: '',
        nama_aktivitas: '',
        nilai_output: 0,
        satuan_output: '',
        jam_mulai: '',
        jam_selesai: '',
        deskripsi: ''
    });

    // Live duration computation for modal
    const durationPreview = useMemo(() => {
        if (!formData.jam_mulai || !formData.jam_selesai) return null;
        const [h1, m1] = formData.jam_mulai.split(':').map(Number);
        const [h2, m2] = formData.jam_selesai.split(':').map(Number);
        if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return null;
        let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight
        const jam = Math.floor(diffMinutes / 60);
        const menit = diffMinutes % 60;
        if (jam > 0 && menit > 0) return `${jam} jam ${menit} mnt`;
        if (jam > 0) return `${jam} jam`;
        return `${menit} menit`;
    }, [formData.jam_mulai, formData.jam_selesai]);

    // Detail Modal state
    const [detailItem, setDetailItem] = useState(null);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchAktivitas();
    }, [debouncedSearch, dateFilter, statusFilter]);

    useEffect(() => {
        fetchUraianTugasOpts();
    }, []);

    const fetchAktivitas = async () => {
        setLoading(true);
        try {
            const params = {};
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            if (dateFilter) params.tanggal = dateFilter;
            if (statusFilter !== 'all') params.status = statusFilter;

            const res = await api.get('/logbook/', { params });
            setAktivitas(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
            toast.error('Gagal memuat data aktivitas.');
        } finally {
            setLoading(false);
        }
    };

    const fetchUraianTugasOpts = async () => {
        try {
            const res = await api.get('/logbook/uraian-tugas/');
            const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setUraianTugasOpts(data.filter(item => item.is_active));
        } catch (err) {
            console.error('Error fetching uraian tugas:', err);
        }
    };

    const openModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                tanggal: item.tanggal,
                uraian_tugas_id: item.uraian_tugas_id || 'lainnya',
                nama_aktivitas: item.nama_aktivitas || '',
                nilai_output: item.nilai_output || 0,
                satuan_output: item.satuan_output || '',
                jam_mulai: item.jam_mulai ? item.jam_mulai.substring(0,5) : '',
                jam_selesai: item.jam_selesai ? item.jam_selesai.substring(0,5) : '',
                deskripsi: item.deskripsi || ''
            });
        } else {
            setEditingItem(null);
            setFormData({
                tanggal: new Date().toISOString().split('T')[0],
                uraian_tugas_id: '',
                nama_aktivitas: '',
                nilai_output: 0,
                satuan_output: '',
                jam_mulai: '',
                jam_selesai: '',
                deskripsi: ''
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (formData.uraian_tugas_id === 'lainnya' && !formData.nama_aktivitas.trim()) {
            toast.error('Nama aktivitas wajib diisi jika memilih "Lainnya"');
            return;
        }

        const payload = {
            ...formData,
            uraian_tugas_id: formData.uraian_tugas_id === 'lainnya' || !formData.uraian_tugas_id ? null : parseInt(formData.uraian_tugas_id)
        };

        setSubmitting(true);
        try {
            if (editingItem) {
                await api.put(`/logbook/${editingItem.id}/`, payload);
                toast.success('Aktivitas berhasil diperbarui');
            } else {
                await api.post('/logbook/', payload);
                toast.success('Aktivitas berhasil ditambahkan');
            }
            closeModal();
            fetchAktivitas();
        } catch (err) {
            console.error(err);
            const errData = err.response?.data;
            if (errData && typeof errData === 'object') {
                const firstKey = Object.keys(errData)[0];
                toast.error(Array.isArray(errData[firstKey]) ? errData[firstKey][0] : JSON.stringify(errData[firstKey]));
            } else {
                toast.error('Gagal menyimpan aktivitas');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = (item) => setDeleteItem(item);
    const closeDeleteConfirm = () => setDeleteItem(null);

    const handleDelete = async () => {
        if (!deleteItem) return;
        setDeleting(true);
        try {
            await api.delete(`/logbook/${deleteItem.id}/`);
            toast.success('Aktivitas berhasil dihapus');
            closeDeleteConfirm();
            fetchAktivitas();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.detail || 'Gagal menghapus aktivitas (mungkin diluar batas waktu).');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="logbook-page">
            <div className="logbook-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div className="logbook-title">
                    <span><FileText size={22} /></span>
                    <div>
                        <h1>Aktivitas Logbook</h1>
                        <p>Catat pekerjaan harian Anda, kelola target capaian output, dan pantau status verifikasi atasan.</p>
                    </div>
                </div>
                <button className="logbook-btn-primary" onClick={() => openModal()}>
                    <Plus size={16} /> Tambah Aktivitas
                </button>
            </div>

            <div className="logbook-card">
                <div className="logbook-filters">
                    <div className="logbook-search-wrap">
                        <Search size={16} className="logbook-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari uraian tugas, aktivitas, output..."
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
                        <option value="all">Semua Status</option>
                        <option value="perlu_verifikasi">Perlu Verifikasi</option>
                        <option value="disetujui">Disetujui</option>
                        <option value="ditolak">Ditolak</option>
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
                            <p>Memuat data aktivitas...</p>
                        </div>
                    ) : aktivitas.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <FileText size={32} />
                            </div>
                            <h3>Belum Ada Aktivitas</h3>
                            <p>Belum ada catatan aktivitas logbook yang cocok dengan filter yang dipilih.</p>
                            <button className="logbook-btn-primary" onClick={() => openModal()} style={{ marginTop: '12px' }}>
                                <Plus size={16} /> Tambah Aktivitas Sekarang
                            </button>
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '56px', textAlign: 'center' }}>No</th>
                                    <th style={{ width: '120px' }}>Tanggal</th>
                                    <th>Aktivitas & Uraian</th>
                                    <th style={{ width: '170px' }}>Waktu / Durasi</th>
                                    <th style={{ width: '130px' }}>Output</th>
                                    <th style={{ width: '150px', textAlign: 'center' }}>Status</th>
                                    <th style={{ width: '110px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aktivitas.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="logbook-row-idx">{idx + 1}</span>
                                        </td>
                                        <td>
                                            <span className="logbook-table-date">
                                                {formatDate(item.tanggal)}
                                            </span>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.88rem' }}>
                                                <Clock size={13} style={{ color: '#0284c7' }} />
                                                <span>{formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)}</span>
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                Durasi: <strong>{item.durasi_format}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            {item.nilai_output > 0 ? (
                                                <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{item.nilai_output} {item.satuan_output}</span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>-</span>
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
                                                    title="Lihat Detail Aktivitas"
                                                >
                                                    <FileText size={15} />
                                                </button>
                                                {(item.status === 'perlu_verifikasi' || item.status === 'ditolak') && (
                                                    <>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-blue" 
                                                            onClick={() => openModal(item)}
                                                            title="Edit Aktivitas"
                                                        >
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-red" 
                                                            onClick={() => confirmDelete(item)}
                                                            title="Hapus Aktivitas"
                                                        >
                                                            <Trash2 size={15} />
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

            {/* Modal Form Tambah / Edit */}
            {isModalOpen && (
                <div className="logbook-modal-overlay" onClick={closeModal}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>{editingItem ? 'Edit Aktivitas' : 'Tambah Aktivitas'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="logbook-modal-body">
                                <div className="logbook-form-grid">
                                    <div className="logbook-field-group">
                                        <label>Tanggal Aktivitas <span style={{color: '#ef4444'}}>*</span></label>
                                        <input
                                            type="date"
                                            name="tanggal"
                                            value={formData.tanggal}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Uraian Tugas <span style={{color: '#ef4444'}}>*</span></label>
                                        <select
                                            name="uraian_tugas_id"
                                            value={formData.uraian_tugas_id}
                                            onChange={handleFormChange}
                                            className="logbook-select"
                                            required
                                        >
                                            <option value="">Pilih Uraian Tugas...</option>
                                            {uraianTugasOpts.map(opt => (
                                                <option key={opt.id} value={opt.id}>{opt.deskripsi}</option>
                                            ))}
                                            <option value="lainnya">Lainnya (Di luar uraian tugas)</option>
                                        </select>
                                    </div>
                                    
                                    {(formData.uraian_tugas_id === 'lainnya' || formData.uraian_tugas_id === '') && (
                                        <div className="logbook-field-group logbook-full-width">
                                            <label>Nama Aktivitas {formData.uraian_tugas_id === 'lainnya' && <span style={{color: '#ef4444'}}>*</span>}</label>
                                            <input
                                                type="text"
                                                name="nama_aktivitas"
                                                value={formData.nama_aktivitas}
                                                onChange={handleFormChange}
                                                className="logbook-input"
                                                placeholder="Contoh: Rapat koordinasi lintas divisi"
                                                required={formData.uraian_tugas_id === 'lainnya'}
                                            />
                                        </div>
                                    )}

                                    <div className="logbook-field-group">
                                        <label>Jam Mulai <span style={{color: '#ef4444'}}>*</span></label>
                                        <input
                                            type="time"
                                            name="jam_mulai"
                                            value={formData.jam_mulai}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Jam Selesai <span style={{color: '#ef4444'}}>*</span></label>
                                        <input
                                            type="time"
                                            name="jam_selesai"
                                            value={formData.jam_selesai}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
                                    </div>

                                    <div className="logbook-field-group logbook-full-width" style={{ marginTop: '-4px', marginBottom: '4px' }}>
                                        {durationPreview ? (
                                            <div className="logbook-duration-badge">
                                                <Clock size={14} /> Total Durasi Terhitung: <strong>{durationPreview}</strong>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                                *Pilih jam mulai dan jam selesai untuk menghitung durasi aktivitas secara otomatis.
                                            </div>
                                        )}
                                    </div>

                                    <div className="logbook-field-group">
                                        <label>Nilai Output</label>
                                        <input
                                            type="number"
                                            name="nilai_output"
                                            value={formData.nilai_output}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            placeholder="0"
                                            min="0"
                                        />
                                    </div>
                                    <div className="logbook-field-group">
                                        <label>Satuan Output</label>
                                        <input
                                            type="text"
                                            name="satuan_output"
                                            value={formData.satuan_output}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            placeholder="contoh: lembar, berkas, dokumen"
                                        />
                                    </div>

                                    <div className="logbook-field-group logbook-full-width">
                                        <label>Uraian / Deskripsi Lengkap <span style={{color: '#ef4444'}}>*</span></label>
                                        <textarea
                                            rows={3}
                                            name="deskripsi"
                                            value={formData.deskripsi}
                                            onChange={handleFormChange}
                                            className="logbook-textarea"
                                            placeholder="Jelaskan detail pekerjaan dan hasil yang dicapai..."
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="logbook-modal-footer">
                                <button type="button" className="logbook-btn-cancel" onClick={closeModal} disabled={submitting}>
                                    Batal
                                </button>
                                <button type="submit" className="logbook-btn-primary" disabled={submitting}>
                                    {submitting ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {detailItem && (
                <div className="logbook-modal-overlay" onClick={() => setDetailItem(null)}>
                    <div className="logbook-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Detail Aktivitas</h3>
                            <button className="logbook-modal-close-btn" onClick={() => setDetailItem(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-modal-body">
                            <div className="logbook-detail-grid">
                                <div className="logbook-detail-row">
                                    <span className="logbook-detail-label">Tanggal & Waktu Kerja</span>
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

                                {detailItem.verified_by_nama && (
                                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', borderTop: '1px dashed rgba(100, 116, 139, 0.25)', paddingTop: '10px' }}>
                                        Diverifikasi oleh: <strong>{detailItem.verified_by_nama}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteItem && (
                <div className="logbook-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Hapus Aktivitas</h3>
                            <button className="logbook-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-delete-body">
                            <p>Apakah Anda yakin ingin menghapus catatan aktivitas ini?</p>
                            <div className="logbook-delete-item-preview">
                                <small>{formatDate(deleteItem.tanggal)} &bull; {deleteItem.durasi_format}</small>
                                <div>"{deleteItem.uraian_tugas_text || deleteItem.nama_aktivitas || deleteItem.deskripsi}"</div>
                            </div>
                        </div>
                        <div className="logbook-modal-footer">
                            <button type="button" className="logbook-btn-cancel" onClick={closeDeleteConfirm} disabled={deleting}>
                                Batal
                            </button>
                            <button type="button" className="logbook-btn-danger" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
