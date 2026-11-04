import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, Upload, AlertTriangle } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import useBodyScrollLock from './useBodyScrollLock';
import './Aset.css';

const KELAYAKAN_OPTIONS = [
    { value: 'A', label: 'Sangat Layak (A)', desc: 'Kondisi 90-100%, berfungsi sempurna tanpa cacat', color: '#10b981' },
    { value: 'B', label: 'Layak (B)', desc: 'Kondisi 70-89%, berfungsi normal pemakaian wajar', color: '#38bdf8' },
    { value: 'C', label: 'Cukup Layak (C)', desc: 'Kondisi 50-69%, fungsi menurun, butuh perbaikan kecil', color: '#eab308' },
    { value: 'D', label: 'Kurang Layak (D)', desc: 'Kondisi 30-49%, sering rusak, biaya servis mahal', color: '#f97316' },
    { value: 'E', label: 'Tidak Layak (E)', desc: 'Kondisi <30%, rusak total / tidak aman digunakan', color: '#ef4444' },
];

export default function UpdateKelayakanModal({ aset, isOpen, onClose, onSuccess }) {
    useBodyScrollLock(isOpen, onClose);

    const toast = useToast();
    const [statusKelayakan, setStatusKelayakan] = useState(aset?.status_kelayakan || 'A');
    const [rekomendasi, setRekomendasi] = useState(aset?.rekomendasi_tindakan || '');
    const [catatan, setCatatan] = useState('');
    const [fotoFile, setFotoFile] = useState(null);
    const [fotoPreview, setFotoPreview] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && aset) {
            setStatusKelayakan(aset.status_kelayakan || 'A');
            setRekomendasi(aset.rekomendasi_tindakan || '');
            setCatatan('');
            setFotoFile(null);
            setFotoPreview(null);
        }
    }, [isOpen, aset]);

    if (!isOpen || !aset) return null;

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoFile(file);
            setFotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('status_kelayakan', statusKelayakan);
            formData.append('rekomendasi_tindakan', rekomendasi || '');
            if (catatan) formData.append('catatan', catatan);
            if (fotoFile) formData.append('foto', fotoFile);

            const res = await api.post(`/aset/aset/${aset.id}/update_kelayakan/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            toast.success(res.data.message || 'Status kelayakan berhasil diperbarui.');
            if (onSuccess) onSuccess(res.data.data);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal memperbarui status kelayakan.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="aset-modal-overlay">
            <div className="aset-modal-content">
                <div className="aset-modal-header">
                    <h3>
                        <CheckCircle size={18} color="#10b981" />
                        Update Status Kelayakan Fisik
                    </h3>
                    <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="aset-modal-body">
                        {/* Aset info preview */}
                        <div className="aset-form-section" style={{ padding: '10px 14px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px' }}>{aset.kode_aset}</span>
                                <span className="badge-unit">{aset.unit_nama}</span>
                            </div>
                            <div style={{ marginTop: '2px', fontSize: '12px' }}>
                                <strong>{aset.deskripsi}</strong> {aset.merk} {aset.spesifikasi}
                            </div>
                            <div style={{ fontSize: '11px', marginTop: '3px', opacity: 0.75 }}>
                                Lokasi: {aset.lokasi_teks || aset.ruangan_nama || '-'}
                            </div>
                        </div>

                        {/* Status Kelayakan Selector */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Tingkat Kelayakan Saat Ini:</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {KELAYAKAN_OPTIONS.map((opt) => (
                                    <label
                                        key={opt.value}
                                        className={`aset-kelayakan-radio-card ${statusKelayakan === opt.value ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="status_kelayakan"
                                            value={opt.value}
                                            checked={statusKelayakan === opt.value}
                                            onChange={(e) => setStatusKelayakan(e.target.value)}
                                            style={{ accentColor: '#6366f1' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 600, color: opt.color, fontSize: '12px' }}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '10.5px', opacity: 0.75, marginTop: '1px' }}>
                                                {opt.desc}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Rekomendasi Tindakan */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Rekomendasi Tindakan (opsional):</label>
                            <input
                                type="text"
                                className="aset-form-input"
                                placeholder="Contoh: Perlu cuci AC berkala / Isi freon / Ganti sparepart"
                                value={rekomendasi}
                                onChange={(e) => setRekomendasi(e.target.value)}
                            />
                        </div>

                        {/* Catatan Perubahan */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Catatan Kondisi / Kerusakan:</label>
                            <textarea
                                className="aset-form-textarea"
                                rows={2}
                                placeholder="Jelaskan kondisi fisik aset terkini..."
                                value={catatan}
                                onChange={(e) => setCatatan(e.target.value)}
                            />
                        </div>

                        {/* Foto Kondisi Fisik */}
                        <div className="aset-form-group">
                            <label className="aset-form-label">Upload Foto Kondisi (opsional):</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    id="aset-foto-input"
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                                <label
                                    htmlFor="aset-foto-input"
                                    className="btn-aset btn-aset-secondary"
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Upload size={14} /> Pilih Foto
                                </label>
                                {fotoFile && <span style={{ fontSize: '11px', color: '#38bdf8' }}>{fotoFile.name}</span>}
                            </div>
                            {fotoPreview && (
                                <div style={{ marginTop: '8px' }}>
                                    <img
                                        src={fotoPreview}
                                        alt="Preview"
                                        style={{ maxHeight: '120px', borderRadius: '4px', border: '1px solid #334155' }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="aset-modal-footer">
                        <button type="button" className="btn-aset btn-aset-secondary" onClick={onClose} disabled={loading}>
                            Batal
                        </button>
                        <button type="submit" className="btn-aset btn-aset-primary" disabled={loading}>
                            {loading ? 'Menyimpan...' : 'Simpan Pembaruan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

