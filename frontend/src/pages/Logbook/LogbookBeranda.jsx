import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, ClipboardList } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import './MyLogbook.css'; // Reusing some base styles

export default function LogbookBeranda() {
    const toast = useToast();
    const [uraianTugas, setUraianTugas] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ deskripsi: '' });
    const [editingItem, setEditingItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Delete Modal state
    const [deleteItem, setDeleteItem] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchUraianTugas();
    }, []);

    const fetchUraianTugas = async () => {
        setLoading(true);
        try {
            const res = await api.get('/logbook/uraian-tugas/');
            setUraianTugas(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        } catch (err) {
            console.error(err);
            toast.error('Gagal memuat data uraian tugas.');
        } finally {
            setLoading(false);
        }
    };

    const openModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setFormData({ deskripsi: item.deskripsi });
        } else {
            setEditingItem(null);
            setFormData({ deskripsi: '' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setFormData({ deskripsi: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.deskripsi.trim()) {
            toast.error('Deskripsi uraian tugas tidak boleh kosong');
            return;
        }

        setSubmitting(true);
        try {
            if (editingItem) {
                await api.put(`/logbook/uraian-tugas/${editingItem.id}/`, formData);
                toast.success('Uraian tugas berhasil diperbarui');
            } else {
                await api.post('/logbook/uraian-tugas/', formData);
                toast.success('Uraian tugas berhasil ditambahkan');
            }
            closeModal();
            fetchUraianTugas();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.deskripsi?.[0] || 'Gagal menyimpan uraian tugas');
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
            await api.delete(`/logbook/uraian-tugas/${deleteItem.id}/`);
            toast.success('Uraian tugas berhasil dihapus');
            closeDeleteConfirm();
            fetchUraianTugas();
        } catch (err) {
            console.error(err);
            toast.error('Gagal menghapus uraian tugas');
        } finally {
            setDeleting(false);
        }
    };

    // Filter out inactive items just in case, though backend should handle it or we can display them with a badge
    const activeUraianTugas = uraianTugas.filter(item => item.is_active);

    return (
        <div className="logbook-page">
            <div className="logbook-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div className="logbook-title">
                    <span><ClipboardList size={22} /></span>
                    <div>
                        <h1>Beranda & Uraian Tugas</h1>
                        <p>Kelola daftar uraian tugas / job description harian Anda sebagai acuan logbook.</p>
                    </div>
                </div>
                <button className="logbook-btn-primary" onClick={() => openModal()}>
                    <Plus size={16} /> Tambah Uraian Tugas
                </button>
            </div>

            <div className="logbook-card">
                <div className="logbook-card-head">
                    <div className="logbook-card-title">
                        <h2>Daftar Uraian Tugas Aktif</h2>
                        <p>Total {activeUraianTugas.length} uraian tugas terdaftar</p>
                    </div>
                </div>
                <div className="logbook-table-wrap">
                    {loading ? (
                        <div className="logbook-loading-box">
                            <p>Memuat data...</p>
                        </div>
                    ) : activeUraianTugas.length === 0 ? (
                        <div className="logbook-empty-box">
                            <div className="logbook-empty-icon-wrap">
                                <ClipboardList size={32} />
                            </div>
                            <h3>Belum Ada Uraian Tugas</h3>
                            <p>Anda belum mendaftarkan satupun uraian tugas. Klik tombol Tambah Uraian Tugas untuk mulai mendaftarkan job description Anda.</p>
                            <button className="logbook-btn-primary" onClick={() => openModal()} style={{ marginTop: '12px' }}>
                                <Plus size={16} /> Tambah Uraian Tugas
                            </button>
                        </div>
                    ) : (
                        <table className="logbook-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '60px', textAlign: 'center' }}>No</th>
                                    <th>Uraian Tugas / Job Description</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeUraianTugas.map((item, idx) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="logbook-row-idx">{idx + 1}</span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 500 }}>{item.deskripsi}</span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                <button 
                                                    className="logbook-btn-icon logbook-text-blue" 
                                                    onClick={() => openModal(item)}
                                                    title="Edit Uraian Tugas"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                <button 
                                                    className="logbook-btn-icon logbook-text-red" 
                                                    onClick={() => confirmDelete(item)}
                                                    title="Hapus Uraian Tugas"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
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
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>{editingItem ? 'Edit Uraian Tugas' : 'Tambah Uraian Tugas'}</h3>
                            <button className="logbook-modal-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="logbook-modal-body">
                                <div className="logbook-field-group">
                                    <label>Deskripsi Uraian Tugas <span style={{color: '#ef4444'}}>*</span></label>
                                    <textarea
                                        rows={4}
                                        value={formData.deskripsi}
                                        onChange={(e) => setFormData({ deskripsi: e.target.value })}
                                        className="logbook-textarea"
                                        placeholder="Contoh: Menyusun laporan keuangan bulanan"
                                        required
                                    />
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

            {/* Delete Confirmation */}
            {deleteItem && (
                <div className="logbook-modal-overlay" onClick={closeDeleteConfirm}>
                    <div className="logbook-modal-card sm" onClick={(e) => e.stopPropagation()}>
                        <div className="logbook-modal-header">
                            <h3>Hapus Uraian Tugas</h3>
                            <button className="logbook-modal-close-btn" onClick={closeDeleteConfirm}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="logbook-delete-body">
                            <p>Apakah Anda yakin ingin menghapus uraian tugas ini?</p>
                            <div className="logbook-delete-item-preview">
                                <small>Deskripsi Tugas:</small>
                                <div>"{deleteItem.deskripsi}"</div>
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
