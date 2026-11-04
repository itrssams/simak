import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Plus, Edit2, Trash2, Printer, Search, X, Save } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { SimplePagination } from '../../utils/pagination';
import useBodyScrollLock from './useBodyScrollLock';
import './Aset.css';

export default function AsetRuangan() {
    const { user } = useAuth();
    const toast = useToast();

    const [ruanganList, setRuanganList] = useState([]);
    const [units, setUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [formData, setFormData] = useState({ nama: '', unit: '', lantai_gedung: '', keterangan: '' });
    const [saving, setSaving] = useState(false);

    // Kunci scroll halaman belakang saat modal ruangan terbuka
    useBodyScrollLock(isModalOpen, () => setIsModalOpen(false));

    useEffect(() => {
        loadUnits();
        loadRuangan();
    }, [selectedUnit]);

    const loadUnits = async () => {
        try {
            const res = await api.get('/users/units/');
            setUnits(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to load units', err);
        }
    };

    const loadRuangan = async () => {
        setLoading(true);
        try {
            const params = {};
            if (selectedUnit) params.unit_id = selectedUnit;
            const res = await api.get('/aset/ruangan/', { params });
            setRuanganList(res.data.results || res.data || []);
        } catch (err) {
            toast.error('Gagal memuat master ruangan.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (item = null) => {
        if (item) {
            setEditData(item);
            setFormData({
                nama: item.nama,
                unit: item.unit,
                lantai_gedung: item.lantai_gedung || '',
                keterangan: item.keterangan || '',
            });
        } else {
            setEditData(null);
            setFormData({
                nama: '',
                unit: selectedUnit || (units[0]?.id || ''),
                lantai_gedung: '',
                keterangan: '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editData) {
                await api.patch(`/aset/ruangan/${editData.id}/`, formData);
                toast.success('Data ruangan berhasil diperbarui.');
            } else {
                await api.post('/aset/ruangan/', formData);
                toast.success('Ruangan baru berhasil ditambahkan.');
            }
            setIsModalOpen(false);
            loadRuangan();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal menyimpan ruangan.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item) => {
        if (item.aset_count > 0) {
            toast.warning(`Ruangan "${item.nama}" memiliki ${item.aset_count} aset aktif. Tidak dapat dihapus.`);
            return;
        }
        if (!window.confirm(`Hapus ruangan "${item.nama}"?`)) return;
        try {
            await api.delete(`/aset/ruangan/${item.id}/`);
            toast.success(`Ruangan "${item.nama}" berhasil dihapus.`);
            loadRuangan();
        } catch (err) {
            toast.error('Gagal menghapus ruangan.');
        }
    };

    const filteredRooms = ruanganList.filter(r =>
        r.nama.toLowerCase().includes(search.toLowerCase()) ||
        (r.unit_nama && r.unit_nama.toLowerCase().includes(search.toLowerCase()))
    );

    const paginatedRooms = filteredRooms.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="aset-container">
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <Building2 size={20} color="#818cf8" />
                        Master Ruangan & Lokasi Aset
                    </h1>
                    <p className="aset-subtitle">
                        Daftar ruangan fisik terstruktur berdasarkan Unit Penanggung Jawab &bull; {filteredRooms.length} ruangan
                    </p>
                </div>
                <div className="aset-actions">
                    <button className="btn-aset btn-aset-primary" onClick={() => handleOpenModal()}>
                        <Plus size={14} /> Tambah Ruangan
                    </button>
                </div>
            </div>

            {/* Filter */}
            <div className="aset-filter-bar">
                <div className="aset-search-input-wrapper">
                    <Search size={14} className="aset-search-icon" />
                    <input
                        type="text"
                        className="aset-search-input"
                        placeholder="Cari nama ruangan..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <select
                    className="aset-select"
                    value={selectedUnit}
                    onChange={e => { setSelectedUnit(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Unit</option>
                    {units.map(u => (
                        <option key={u.id} value={u.id}>{u.nama}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="aset-table-wrapper">
                <table className="aset-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>No</th>
                            <th>Nama Ruangan</th>
                            <th>Unit Penanggung Jawab</th>
                            <th>Lantai / Gedung</th>
                            <th>Jumlah Aset</th>
                            <th style={{ textAlign: 'center' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Memuat ruangan...
                                </td>
                            </tr>
                        ) : filteredRooms.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Tidak ada ruangan terdaftar.
                                </td>
                            </tr>
                        ) : (
                            paginatedRooms.map((item, idx) => (
                                <tr key={item.id}>
                                    <td style={{ color: '#64748b' }}>{(page - 1) * pageSize + idx + 1}</td>
                                    <td className="aset-text-main">{item.nama}</td>
                                    <td>
                                        <span className="badge-unit">{item.unit_nama}</span>
                                    </td>
                                    <td className="aset-text-muted">{item.lantai_gedung || '-'}</td>
                                    <td>
                                        <span style={{ fontWeight: 700 }} className={item.aset_count > 0 ? "aset-text-highlight" : "aset-text-muted"}>
                                            {item.aset_count} unit aset
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '3px 6px' }}
                                                onClick={() => handleOpenModal(item)}
                                                title="Edit Ruangan"
                                            >
                                                <Edit2 size={12} color="#38bdf8" />
                                            </button>
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '3px 6px' }}
                                                onClick={() => handleDelete(item)}
                                                title="Hapus Ruangan"
                                                disabled={item.aset_count > 0}
                                            >
                                                <Trash2 size={12} color={item.aset_count > 0 ? '#475569' : '#f87171'} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {filteredRooms.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={filteredRooms.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            )}

            {/* Modal Tambah/Edit Ruangan */}
            {isModalOpen && createPortal(
                <div className="aset-modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="aset-modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <h3>
                                <Building2 size={18} color="#6366f1" />
                                {editData ? 'Edit Ruangan' : 'Tambah Ruangan Baru'}
                            </h3>
                            <button className="aset-modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="aset-modal-body">
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Nama Ruangan *</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Contoh: Ruang VIP 1 / OK 1 / Apotik"
                                        value={formData.nama}
                                        onChange={e => setFormData({ ...formData, nama: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Unit Penanggung Jawab *</label>
                                    <select
                                        className="aset-form-select"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Pilih Unit --</option>
                                        {units.map(u => (
                                             <option key={u.id} value={u.id}>{u.nama}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Lantai / Gedung (opsional)</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Contoh: Gedung A Lt. 2"
                                        value={formData.lantai_gedung}
                                        onChange={e => setFormData({ ...formData, lantai_gedung: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="aset-modal-footer">
                                <button type="button" className="btn-aset btn-aset-secondary" onClick={() => setIsModalOpen(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="btn-aset btn-aset-primary" disabled={saving}>
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
