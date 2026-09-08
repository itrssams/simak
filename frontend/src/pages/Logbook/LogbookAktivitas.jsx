import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, FileText, Search, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import useDebounce from '../../hooks/useDebounce';
import './MyLogbook.css';

const formatMenit = (menit) => {
    if (!menit || menit <= 0) return '0 mnt';
    const jam = Math.floor(menit / 60);
    const s = menit % 60;
    if (jam > 0 && s > 0) return `${jam}j ${s}m`;
    if (jam > 0) return `${jam}j`;
    return `${s}m`;
};

const formatTime = (timeString) => {
    if (!timeString) return '-';
    // Remove seconds if present "08:00:00" -> "08:00"
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

    // Detail Modal state
    const [detailItem, setDetailItem] = useState(null);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchAktivitas();
    }, [debouncedSearch, dateFilter]);

    useEffect(() => {
        fetchUraianTugasOpts();
    }, []);

    const fetchAktivitas = async () => {
        setLoading(true);
        try {
            const params = {};
            if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
            if (dateFilter) params.tanggal = dateFilter;

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
        
        // Basic validation
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
        <div className="logbook-container">
            <div className="logbook-header">
                <div>
                    <h2>Aktivitas Logbook</h2>
                    <p>Catat pekerjaan harian Anda di sini.</p>
                </div>
                <button className="logbook-btn-primary" onClick={() => openModal()}>
                    <Plus size={16} /> Tambah Aktivitas
                </button>
            </div>

            <div className="logbook-card">
                <div className="logbook-filters">
                    <div className="logbook-search-wrap">
                        <Search size={18} className="logbook-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari aktivitas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="logbook-search-input"
                        />
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
                    ) : aktivitas.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <FileText size={32} />
                            </div>
                            <h3>Belum Ada Aktivitas</h3>
                            <p>Belum ada catatan logbook yang ditemukan.</p>
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px', textAlign: 'center' }}>No</th>
                                    <th>Tanggal</th>
                                    <th>Aktivitas</th>
                                    <th>Waktu / Durasi</th>
                                    <th>Output</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aktivitas.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                        <td>{formatDate(item.tanggal)}</td>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}>
                                                <Clock size={14} color="#64748b" />
                                                <span>{formatTime(item.jam_mulai)} - {formatTime(item.jam_selesai)}</span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                                Durasi: {item.durasi_format}
                                            </div>
                                        </td>
                                        <td>
                                            {item.nilai_output > 0 ? (
                                                <span>{item.nilai_output} {item.satuan_output}</span>
                                            ) : '-'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <StatusBadge status={item.status} statusLabel={item.status_label} />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                <button 
                                                    className="logbook-btn-icon logbook-text-gray" 
                                                    onClick={() => setDetailItem(item)}
                                                    title="Detail"
                                                >
                                                    <FileText size={16} />
                                                </button>
                                                {item.status === 'perlu_verifikasi' || item.status === 'ditolak' ? (
                                                    <>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-blue" 
                                                            onClick={() => openModal(item)}
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button 
                                                            className="logbook-btn-icon logbook-text-red" 
                                                            onClick={() => confirmDelete(item)}
                                                            title="Hapus"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal Form */}
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
                                        <label>Tanggal Aktivitas <span style={{color: 'red'}}>*</span></label>
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
                                        <label>Uraian Tugas <span style={{color: 'red'}}>*</span></label>
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
                                            <label>Nama Aktivitas <span style={{color: 'red'}}>*</span></label>
                                            <input
                                                type="text"
                                                name="nama_aktivitas"
                                                value={formData.nama_aktivitas}
                                                onChange={handleFormChange}
                                                className="logbook-input"
                                                placeholder="Contoh: Rapat koordinasi divisi"
                                                required={formData.uraian_tugas_id === 'lainnya'}
                                            />
                                        </div>
                                    )}

                                    <div className="logbook-field-group">
                                        <label>Jam Mulai <span style={{color: 'red'}}>*</span></label>
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
                                        <label>Jam Selesai <span style={{color: 'red'}}>*</span></label>
                                        <input
                                            type="time"
                                            name="jam_selesai"
                                            value={formData.jam_selesai}
                                            onChange={handleFormChange}
                                            className="logbook-input"
                                            required
                                        />
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
                                            placeholder="contoh: lembar, dokumen"
                                        />
                                    </div>

                                    <div className="logbook-field-group logbook-full-width">
                                        <label>Uraian / Deskripsi Lengkap <span style={{color: 'red'}}>*</span></label>
                                        <textarea
                                            rows={3}
                                            name="deskripsi"
                                            value={formData.deskripsi}
                                            onChange={handleFormChange}
                                            className="logbook-textarea"
                                            placeholder="Jelaskan detail pekerjaan yang dilakukan"
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                                {detailItem.verified_by_nama && (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', marginTop: '8px' }}>
                                        Diverifikasi oleh: {detailItem.verified_by_nama}
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
                        <div className="logbook-modal-body">
                            <p>Apakah Anda yakin ingin menghapus aktivitas ini?</p>
                            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f1f5f9', borderRadius: '4px', fontSize: '0.9rem' }}>
                                <strong>{formatDate(deleteItem.tanggal)}</strong><br/>
                                {deleteItem.deskripsi.substring(0, 100)}...
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
