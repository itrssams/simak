import React, { useState } from 'react';
import { Calendar, ArrowRightLeft, Pill } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import './ITCenter.css';

export default function ApotikUtility() {
    const toast = useToast();
    const [loadingDate, setLoadingDate] = useState(false);
    const [loadingMove, setLoadingMove] = useState(false);

    const [dateForm, setDateForm] = useState({ no_tran: '', new_date: '' });
    const [moveForm, setMoveForm] = useState({ no_tran: '', target_kunj: '' });

    const handleDateSubmit = async (e) => {
        e.preventDefault();
        if (!dateForm.no_tran || !dateForm.new_date) {
            toast.error("Semua kolom harus diisi.");
            return;
        }
        if (!window.confirm(`Yakin ingin mengubah tanggal transaksi ${dateForm.no_tran} menjadi ${dateForm.new_date}?`)) return;
        
        setLoadingDate(true);
        try {
            const res = await api.post(`/keuangan/it/apotik/correction/change-date/`, {
                no_tran: dateForm.no_tran,
                new_date: dateForm.new_date.replace('T', ' ')
            });
            toast.success(res.data.message || "Tanggal transaksi berhasil diubah.");
            setDateForm({ no_tran: '', new_date: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal mengubah tanggal transaksi.");
        } finally {
            setLoadingDate(false);
        }
    };

    const handleMoveSubmit = async (e) => {
        e.preventDefault();
        if (!moveForm.no_tran || !moveForm.target_kunj) {
            toast.error("Semua kolom harus diisi.");
            return;
        }
        if (!window.confirm(`Yakin ingin memindahkan transaksi ${moveForm.no_tran} ke Kunjungan ${moveForm.target_kunj}?`)) return;

        setLoadingMove(true);
        try {
            const res = await api.post(`/keuangan/it/apotik/correction/move/`, {
                no_tran: moveForm.no_tran,
                target_kunj: moveForm.target_kunj
            });
            toast.success(res.data.message || "Transaksi berhasil dipindahkan.");
            setMoveForm({ no_tran: '', target_kunj: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal memindahkan transaksi.");
        } finally {
            setLoadingMove(false);
        }
    };

    return (
        <div className="pc-page it-page">
            <section className="pc-hero">
                <div className="pc-hero-main">
                    <div>
                        <div className="pc-eyebrow">
                            <ArrowRightLeft size={15} /> Utilitas IT & SIMRS
                        </div>
                        <h1 className="pc-title">Koreksi Data Transaksi</h1>
                        <p className="pc-subtitle">
                            Modifikasi data transaksi langsung ke database SIMRS (koreksi tanggal dan pemindahan kunjungan) tanpa melalui query manual SQLyog.
                        </p>
                    </div>
                </div>
            </section>

            <div className="pc-section-card" style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                
                {/* Panel 1: Ubah Tanggal */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ padding: '8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '6px' }}>
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Ubah Tanggal Transaksi</h3>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>Koreksi tanggal header dan detail struk apotik.</p>
                        </div>
                    </div>
                    
                    <form onSubmit={handleDateSubmit}>
                        <div className="pc-form-group" style={{ marginBottom: '12px' }}>
                            <label className="pc-label">Nomor Transaksi (APT-xxxx)</label>
                            <input 
                                type="text" 
                                className="pc-input" 
                                placeholder="Contoh: APT-26037018"
                                value={dateForm.no_tran}
                                onChange={(e) => setDateForm({ ...dateForm, no_tran: e.target.value })}
                                required
                            />
                        </div>
                        <div className="pc-form-group" style={{ marginBottom: '16px' }}>
                            <label className="pc-label">Tanggal Baru</label>
                            <input 
                                type="datetime-local" 
                                className="pc-input" 
                                value={dateForm.new_date}
                                onChange={(e) => setDateForm({ ...dateForm, new_date: e.target.value })}
                                required
                                step="1"
                            />
                        </div>
                        <button type="submit" className="pc-btn-primary" disabled={loadingDate} style={{ width: '100%', justifyContent: 'center' }}>
                            {loadingDate ? 'Memproses...' : 'Ubah Tanggal'}
                        </button>
                    </form>
                </div>

                {/* Panel 2: Pindah Kunjungan */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ padding: '8px', background: '#ffedd5', color: '#c2410c', borderRadius: '6px' }}>
                            <ArrowRightLeft size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Pindah Kunjungan</h3>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>Pindahkan 1 struk utuh ke pasien/kunjungan lain.</p>
                        </div>
                    </div>

                    <form onSubmit={handleMoveSubmit}>
                        <div className="pc-form-group" style={{ marginBottom: '12px' }}>
                            <label className="pc-label">Nomor Transaksi Asal (APT-xxxx)</label>
                            <input 
                                type="text" 
                                className="pc-input" 
                                placeholder="Contoh: APT-26037018"
                                value={moveForm.no_tran}
                                onChange={(e) => setMoveForm({ ...moveForm, no_tran: e.target.value })}
                                required
                            />
                        </div>
                        <div className="pc-form-group" style={{ marginBottom: '16px' }}>
                            <label className="pc-label">Nomor Kunjungan Tujuan</label>
                            <input 
                                type="text" 
                                className="pc-input" 
                                placeholder="Contoh: 26045602"
                                value={moveForm.target_kunj}
                                onChange={(e) => setMoveForm({ ...moveForm, target_kunj: e.target.value })}
                                required
                            />
                        </div>
                        <button type="submit" className="pc-btn-primary" disabled={loadingMove} style={{ width: '100%', justifyContent: 'center', background: '#c2410c', borderColor: '#c2410c' }}>
                            {loadingMove ? 'Memproses...' : 'Pindah Kunjungan'}
                        </button>
                    </form>
                </div>

            </div>
            
            <div style={{ marginTop: '24px', padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', gap: '12px' }}>
                <div style={{ color: '#dc2626' }}>⚠</div>
                <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>Peringatan!</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#b91c1c', lineHeight: 1.5 }}>
                        Fitur ini langsung memodifikasi database legacy SIMRS (Tabel <code>tran_apt</code>, <code>item_tran_apt</code>, dan <code>kunjung</code>). Pastikan Nomor Transaksi dan Nomor Kunjungan yang dimasukkan sudah valid. Pemindahan data tidak memodifikasi tabel <code>tb_bayar</code> jika pasien asal sudah lunas, pastikan kwitansi sudah di-void jika perlu.
                    </p>
                </div>
            </div>
        </div>
        </div>
    );
}
