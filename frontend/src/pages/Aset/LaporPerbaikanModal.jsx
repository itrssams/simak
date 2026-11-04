import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Wrench, AlertTriangle, Calendar, Upload, Save, Camera, Trash2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import useBodyScrollLock from './useBodyScrollLock';
import './Aset.css';

export default function LaporPerbaikanModal({ isOpen, onClose, onSuccess, aset }) {
    useBodyScrollLock(isOpen, onClose);

    const toast = useToast();
    const today = new Date().toISOString().split('T')[0];

    const [tanggalLaporan, setTanggalLaporan] = useState(today);
    const [tanggalKerusakan, setTanggalKerusakan] = useState(today);
    const [tingkatKerusakan, setTingkatKerusakan] = useState('ringan');
    const [rincianKerusakan, setRincianKerusakan] = useState('');
    const [fotoKerusakan, setFotoKerusakan] = useState(null);
    const [fotoPreview, setFotoPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    if (!isOpen || !aset) return null;

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoKerusakan(file);
            setFotoPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveFoto = (e) => {
        e.stopPropagation();
        setFotoKerusakan(null);
        if (fotoPreview) URL.revokeObjectURL(fotoPreview);
        setFotoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!rincianKerusakan.trim()) {
            toast.error('Mohon isi rincian kerusakan atau gejala yang dialami.');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('aset', aset.id);
            formData.append('tanggal_laporan', tanggalLaporan);
            if (tanggalKerusakan) formData.append('tanggal_kerusakan', tanggalKerusakan);
            formData.append('tingkat_kerusakan', tingkatKerusakan);
            formData.append('rincian_kerusakan', rincianKerusakan);
            if (fotoKerusakan) formData.append('foto_kerusakan', fotoKerusakan);

            const res = await api.post('/aset/perbaikan/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success(`Tiket perbaikan ${res.data?.nomor_tiket || ''} berhasil dibuat.`);
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal mengirim laporan perbaikan.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="aset-modal-overlay" onClick={onClose}>
            <div className="aset-modal-content" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
                <div className="aset-modal-header">
                    <h3>
                        <Wrench size={18} color="#f59e0b" />
                        Lapor Kerusakan / Permintaan Perbaikan
                    </h3>
                    <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="aset-modal-body">
                        {/* Info Aset Singkat */}
                        <div className="aset-form-section" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 14px',
                            marginBottom: '16px'
                        }}>
                            <div>
                                <div style={{ fontSize: '10.5px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
                                    Unit Fisik Aset
                                </div>
                                <div style={{ fontSize: '14.5px', fontWeight: 700, marginTop: '2px' }}>
                                    {aset.deskripsi} {aset.merk ? `(${aset.merk})` : ''}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#6366f1', marginTop: '2px', fontFamily: 'monospace' }}>
                                    {aset.kode_aset} &bull; {aset.unit_nama || '-'} {aset.lokasi_teks ? `• ${aset.lokasi_teks}` : ''}
                                </div>
                            </div>
                            <span className={`badge-kelayakan badge-kelayakan-${aset.status_kelayakan || 'A'}`} style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 600 }}>
                                Grade {aset.status_kelayakan || 'A'}
                            </span>
                        </div>

                        {/* Tanggal Pelaporan & Tanggal Kejadian (Side-by-Side dengan DateField) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                            <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                <label className="aset-form-label">Tanggal Pelaporan</label>
                                <DateField
                                    value={tanggalLaporan}
                                    onChange={val => setTanggalLaporan(val)}
                                    placeholder="Pilih tanggal..."
                                />
                            </div>
                            <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                <label className="aset-form-label">Tanggal Kerusakan Terjadi *</label>
                                <DateField
                                    value={tanggalKerusakan}
                                    onChange={val => setTanggalKerusakan(val)}
                                    placeholder="Pilih tanggal kejadian..."
                                />
                            </div>
                        </div>

                        {/* Tingkat Kerusakan (Pilihan Visual Card) */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Tingkat Kerusakan *</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '2px' }}>
                                {[
                                    { id: 'ringan', label: 'Ringan', icon: '🟡', desc: 'Fungsi sebagian', borderActive: '#eab308', bgActive: 'rgba(234, 179, 8, 0.15)' },
                                    { id: 'sedang', label: 'Sedang', icon: '🟠', desc: 'Terganggu / butuh servis', borderActive: '#f97316', bgActive: 'rgba(249, 115, 22, 0.15)' },
                                    { id: 'berat', label: 'Berat', icon: '🔴', desc: 'Mati total / tidak fungsi', borderActive: '#ef4444', bgActive: 'rgba(239, 68, 68, 0.15)' },
                                ].map(item => {
                                    const isSelected = tingkatKerusakan === item.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setTingkatKerusakan(item.id)}
                                            className="aset-choice-card"
                                            style={{
                                                borderColor: isSelected ? item.borderActive : undefined,
                                                background: isSelected ? item.bgActive : undefined,
                                            }}
                                        >
                                            <div style={{ fontSize: '12.5px', fontWeight: 600 }}>
                                                {item.icon} {item.label}
                                            </div>
                                            <div style={{ fontSize: '10.5px', opacity: 0.75, marginTop: '2px', lineHeight: 1.2 }}>
                                                {item.desc}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Rincian Kerusakan */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Rincian / Gejala Kerusakan *</label>
                            <textarea
                                className="aset-form-textarea"
                                rows="3"
                                placeholder="Jelaskan detail masalah (contoh: AC tidak dingin hanya keluar angin, layar monitor mati saat dinyalakan, kabel power putus, dll)..."
                                value={rincianKerusakan}
                                onChange={e => setRincianKerusakan(e.target.value)}
                                required
                            />
                        </div>

                        {/* Upload Foto Kerusakan dengan Dropzone Modern */}
                        <div className="aset-form-group" style={{ marginBottom: 0 }}>
                            <label className="aset-form-label">Foto Bukti Kerusakan (Opsional)</label>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <div
                                className="aset-file-dropzone"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ height: 'auto', padding: '10px 14px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <Camera size={16} color="#818cf8" />
                                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {fotoKerusakan ? fotoKerusakan.name : 'Upload Foto Bukti Kerusakan (Klik di sini)...'}
                                    </span>
                                </div>
                                <span className="aset-file-dropzone-badge">
                                    Pilih Foto
                                </span>
                            </div>

                            {fotoPreview && (
                                <div className="aset-file-preview-card" style={{ padding: '8px 12px' }}>
                                    <img
                                        src={fotoPreview}
                                        alt="Preview Kerusakan"
                                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {fotoKerusakan?.name || 'Foto Kerusakan'}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                            {fotoKerusakan ? `${(fotoKerusakan.size / 1024).toFixed(0)} KB` : ''}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFoto}
                                        className="aset-modal-close"
                                        style={{ color: '#ef4444', padding: '4px' }}
                                        title="Hapus Foto"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="aset-modal-footer">
                        <button type="button" className="btn-aset btn-aset-secondary" onClick={onClose} disabled={loading}>
                            Batal
                        </button>
                        <button
                            type="submit"
                            className="btn-aset"
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                color: '#ffffff',
                                fontWeight: 600,
                                border: 'none',
                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                                padding: '7px 16px',
                            }}
                            disabled={loading}
                        >
                            <Save size={14} /> {loading ? 'Mengirim...' : 'Kirim Laporan Perbaikan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
