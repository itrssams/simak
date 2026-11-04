import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, Calculator, History, FileText, QrCode, Image as ImageIcon, Wrench, Camera } from 'lucide-react';
import api from '../../api/axiosConfig';
import useBodyScrollLock from './useBodyScrollLock';
import resolveMediaUrl from '../../utils/resolveMediaUrl';
import './Aset.css';

export default function AsetDetailModal({ asetId, isOpen, onClose, isFinancialViewer, onOpenQr }) {
    useBodyScrollLock(isOpen, onClose);

    const bodyRef = useRef(null);
    const [tab, setTab] = useState('info');
    const [data, setData] = useState(null);
    const [jadwal, setJadwal] = useState(null);
    const [jadwalView, setJadwalView] = useState('tahunan'); // 'tahunan' | 'bulanan'
    const [loading, setLoading] = useState(false);
    const [loadingJadwal, setLoadingJadwal] = useState(false);

    useEffect(() => {
        if (isOpen && asetId) {
            setTab('info');
            loadDetail();
            if (isFinancialViewer) {
                loadJadwal();
            }
        }
    }, [isOpen, asetId]);

    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = 0;
        }
    }, [tab]);

    const loadDetail = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/aset/aset/${asetId}/`);
            setData(res.data);
        } catch (err) {
            console.error('Failed to load asset detail', err);
        } finally {
            setLoading(false);
        }
    };

    const loadJadwal = async () => {
        setLoadingJadwal(true);
        try {
            const res = await api.get(`/aset/aset/${asetId}/jadwal_penyusutan/`);
            setJadwal(res.data);
        } catch (err) {
            console.error('Failed to load depreciation schedule', err);
        } finally {
            setLoadingJadwal(false);
        }
    };

    if (!isOpen) return null;

    const formatRp = (val) => {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    return createPortal(
        <div className="aset-modal-overlay" onClick={onClose}>
            <div className="aset-modal-content aset-modal-lg aset-modal-detail" onClick={e => e.stopPropagation()}>
                <div className="aset-modal-header">
                    <h3>
                        <Info size={18} color="#818cf8" />
                        Detail Aset: {data?.kode_aset || 'Memuat...'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {data && (
                            <button
                                className="btn-aset btn-aset-secondary"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={() => onOpenQr && onOpenQr(data)}
                            >
                                <QrCode size={13} /> Label QR
                            </button>
                        )}
                        <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="aset-tabs" style={{ padding: '0 18px', marginTop: '10px' }}>
                    <button
                        className={`aset-tab-btn ${tab === 'info' ? 'active' : ''}`}
                        onClick={() => setTab('info')}
                    >
                        <FileText size={14} /> Informasi Fisik
                    </button>
                    {isFinancialViewer && (
                        <button
                            className={`aset-tab-btn ${tab === 'jadwal' ? 'active' : ''}`}
                            onClick={() => setTab('jadwal')}
                        >
                            <Calculator size={14} /> Jadwal Penyusutan PMK 72
                        </button>
                    )}
                    <button
                        className={`aset-tab-btn ${tab === 'riwayat' ? 'active' : ''}`}
                        onClick={() => setTab('riwayat')}
                    >
                        <History size={14} /> Riwayat & Mutasi ({data?.riwayat_list?.length || 0})
                    </button>
                    <button
                        className={`aset-tab-btn ${tab === 'perbaikan' ? 'active' : ''}`}
                        onClick={() => setTab('perbaikan')}
                    >
                        <Wrench size={14} /> Riwayat Perbaikan ({data?.perbaikan_list?.length || 0})
                    </button>
                </div>

                <div className="aset-modal-body" ref={bodyRef}>
                    {loading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Memuat data aset...</div>
                    ) : !data ? (
                        <div style={{ padding: '20px', color: '#ef4444' }}>Aset tidak ditemukan.</div>
                    ) : (
                        <>
                            {/* TAB 1: INFORMASI FISIK */}
                            {tab === 'info' && (
                                <div>
                                    <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                        <div>
                                            <label className="aset-form-label">Kode Aset:</label>
                                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#818cf8' }}>
                                                {data.kode_aset}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Tingkat Kelayakan:</label>
                                            <span className={`badge-kelayakan badge-kelayakan-${data.status_kelayakan}`}>
                                                {data.status_kelayakan_label}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                        <div>
                                            <label className="aset-form-label">Deskripsi & Nama Barang:</label>
                                            <div style={{ color: '#f8fafc', fontWeight: 600 }}>{data.deskripsi}</div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Merek & Spesifikasi:</label>
                                            <div style={{ color: '#cbd5e1' }}>
                                                {data.merk || '-'} {data.spesifikasi ? `(${data.spesifikasi})` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="aset-form-section aset-form-grid-3" style={{ padding: '10px 12px', marginBottom: '14px' }}>
                                        <div>
                                            <label className="aset-form-label">Nomor Seri (S/N):</label>
                                            <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>
                                                {data.nomor_seri || '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Nomor Registrasi:</label>
                                            <div style={{ color: data.nomor_registrasi ? '#0284c7' : 'inherit', fontWeight: data.nomor_registrasi ? 600 : 400 }}>
                                                {data.nomor_registrasi || '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Kalibrasi Berkala:</label>
                                            <div>
                                                {data.perlu_kalibrasi ? (
                                                    <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                                        ⚡ Wajib Kalibrasi
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', opacity: 0.75 }}>
                                                        Tidak Perlu
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                        <div>
                                            <label className="aset-form-label">Unit Penanggung Jawab:</label>
                                            <span className="badge-unit">{data.unit_nama}</span>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Ruangan / Lokasi Fisik:</label>
                                            <div style={{ color: '#f8fafc' }}>
                                                {data.lokasi_teks || data.ruangan_nama || '-'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="aset-form-grid-3" style={{ marginBottom: '14px' }}>
                                        <div>
                                            <label className="aset-form-label">Status Aset:</label>
                                            <div style={{ textTransform: 'capitalize' }}>{data.status_aset_label}</div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Status Kepemilikan:</label>
                                            <div style={{ textTransform: 'capitalize' }}>{data.status_kepemilikan?.replace('_', ' ')}</div>
                                        </div>
                                        <div>
                                            <label className="aset-form-label">Status Data:</label>
                                            <span className={data.status_data === 'lengkap' ? 'badge-lengkap' : 'badge-belum-lengkap'}>
                                                {data.status_data_label}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bagian Finansial (Hanya untuk Admin / Keuangan) */}
                                    {isFinancialViewer && (
                                        <div className="aset-form-section" style={{ marginTop: '16px', padding: '12px' }}>
                                            <div className="aset-form-section-title">
                                                DATA PEROLEHAN & PENYUSUTAN (PMK 72/2023)
                                            </div>
                                            <div className="aset-form-grid-3">
                                                <div>
                                                    <label className="aset-form-label">Harga Perolehan:</label>
                                                    <div style={{ fontWeight: 700 }}>{formatRp(data.harga_perolehan)}</div>
                                                </div>
                                                <div>
                                                    <label className="aset-form-label">Bulan/Tahun Perolehan:</label>
                                                    <div>{data.bulan_perolehan || '-'}</div>
                                                </div>
                                                <div>
                                                    <label className="aset-form-label">Kelompok Fiskal:</label>
                                                    <div>{data.kelompok_nama || '-'} ({data.masa_manfaat_bulan} Bln)</div>
                                                </div>
                                            </div>

                                            {data.penyusutan?.is_calculable && (
                                                <div className="aset-form-grid-3" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(148, 163, 184, 0.3)' }}>
                                                    <div>
                                                        <label className="aset-form-label">Beban per Bulan:</label>
                                                        <div>{formatRp(data.penyusutan.beban_bulanan)}</div>
                                                    </div>
                                                    <div>
                                                        <label className="aset-form-label">Akumulasi Penyusutan:</label>
                                                        <div style={{ color: '#f97316' }}>{formatRp(data.penyusutan.akumulasi_penyusutan)}</div>
                                                    </div>
                                                    <div>
                                                        <label className="aset-form-label">Nilai Buku Bersih (NBV):</label>
                                                        <div style={{ fontWeight: 700, color: '#10b981' }}>{formatRp(data.penyusutan.nilai_buku)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rekomendasi & Foto */}
                                    {data.rekomendasi_tindakan && (
                                        <div style={{ marginTop: '14px' }}>
                                            <label className="aset-form-label">Rekomendasi Tindakan:</label>
                                            <div className="aset-form-section" style={{ padding: '8px 12px', color: '#eab308', marginBottom: 0 }}>
                                                {data.rekomendasi_tindakan}
                                            </div>
                                        </div>
                                    )}

                                    {/* Komparasi Dua Foto: Saat Registrasi Awal vs Terkini dari Unit */}
                                    {(data.foto_awal || data.foto || data.foto_terkini) && (
                                        <div className="aset-form-section" style={{ marginTop: '16px', padding: '12px' }}>
                                            <div className="aset-form-section-title purple" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <Camera size={14} /> Komparasi Kondisi Fisik (Registrasi Awal vs Terkini Lapangan)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                                {/* Foto Registrasi Awal */}
                                                <div className="aset-file-preview-card" style={{ display: 'block', textAlign: 'center', padding: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8, marginBottom: '6px' }}>
                                                        1. Kondisi Saat Registrasi Awal
                                                     </div>
                                                    {(data.foto_awal || data.foto) ? (
                                                        <img
                                                            src={resolveMediaUrl(data.foto_awal || data.foto)}
                                                            alt="Foto Registrasi Awal"
                                                            style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                                                            onClick={() => window.open(resolveMediaUrl(data.foto_awal || data.foto), '_blank')}
                                                            title="Klik untuk membuka foto ukuran penuh"
                                                        />
                                                    ) : (
                                                        <div style={{ padding: '30px 10px', fontSize: '11px', opacity: 0.6 }}>Belum ada foto registrasi</div>
                                                    )}
                                                </div>

                                                {/* Foto Terkini dari Unit */}
                                                <div className="aset-file-preview-card" style={{ display: 'block', textAlign: 'center', padding: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#0284c7', marginBottom: '6px' }}>
                                                        2. Kondisi Terkini di Lapangan
                                                    </div>
                                                    {data.foto_terkini ? (
                                                        <img
                                                            src={resolveMediaUrl(data.foto_terkini)}
                                                            alt="Foto Terkini Unit"
                                                            style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                                                            onClick={() => window.open(resolveMediaUrl(data.foto_terkini), '_blank')}
                                                            title="Klik untuk membuka foto ukuran penuh"
                                                        />
                                                    ) : (
                                                        <div style={{ padding: '30px 10px', fontSize: '11px', opacity: 0.6 }}>Belum ada update foto unit</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: JADWAL PENYUSUTAN */}
                            {tab === 'jadwal' && isFinancialViewer && (
                                <div>
                                    {loadingJadwal ? (
                                        <div style={{ textAlign: 'center', padding: '20px' }}>Menghitung jadwal penyusutan...</div>
                                    ) : !jadwal?.is_calculable ? (
                                        <div style={{ padding: '20px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fbbf24' }}>
                                            ⚠️ {jadwal?.alasan || 'Aset ini belum memiliki kelengkapan data harga atau tanggal perolehan.'}
                                        </div>
                                    ) : (
                                        <div>
                                            {/* Toggle Tahunan / Bulanan */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                                    Metode Garis Lurus (PMK No. 72/2023) &bull; Tarif: <strong>{jadwal.tarif_persen}% / thn</strong>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        className={`btn-aset ${jadwalView === 'tahunan' ? 'btn-aset-primary' : 'btn-aset-secondary'}`}
                                                        style={{ padding: '4px 8px', fontSize: '11px' }}
                                                        onClick={() => setJadwalView('tahunan')}
                                                    >
                                                        Ringkasan Tahunan
                                                    </button>
                                                    <button
                                                        className={`btn-aset ${jadwalView === 'bulanan' ? 'btn-aset-primary' : 'btn-aset-secondary'}`}
                                                        style={{ padding: '4px 8px', fontSize: '11px' }}
                                                        onClick={() => setJadwalView('bulanan')}
                                                    >
                                                        Rincian Bulanan
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Table Schedule */}
                                            <div className="aset-table-wrapper" style={{ maxHeight: '340px' }}>
                                                {jadwalView === 'tahunan' ? (
                                                    <table className="aset-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Tahun Pajak</th>
                                                                <th>Porsi Bulan</th>
                                                                <th>Tarif</th>
                                                                <th>Beban Penyusutan</th>
                                                                <th>Akumulasi</th>
                                                                <th>Nilai Sisa Buku</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {jadwal.jadwal_tahunan.map((row) => (
                                                                <tr key={row.tahun}>
                                                                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>{row.tahun}</td>
                                                                    <td>{row.porsi} ({row.bulan_dihitung} bln)</td>
                                                                    <td>{row.tarif_persen}%</td>
                                                                    <td>{formatRp(row.beban_penyusutan)}</td>
                                                                    <td style={{ color: '#fb923c' }}>{formatRp(row.akumulasi_penyusutan)}</td>
                                                                    <td style={{ fontWeight: 600, color: '#34d399' }}>{formatRp(row.nilai_buku_akhir)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <table className="aset-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Bulan Ke</th>
                                                                <th>Periode</th>
                                                                <th>Beban Bulan Ini</th>
                                                                <th>Akumulasi</th>
                                                                <th>Nilai Sisa Buku</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {jadwal.jadwal_bulanan.map((row) => (
                                                                <tr key={row.bulan_ke}>
                                                                    <td>{row.bulan_ke}</td>
                                                                    <td style={{ fontWeight: 600 }}>{row.periode}</td>
                                                                    <td>{formatRp(row.beban_bulan)}</td>
                                                                    <td style={{ color: '#fb923c' }}>{formatRp(row.akumulasi_penyusutan)}</td>
                                                                    <td style={{ fontWeight: 600, color: '#34d399' }}>{formatRp(row.nilai_buku)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: RIWAYAT & MUTASI */}
                            {tab === 'riwayat' && (
                                <div>
                                    {(!data.riwayat_list || data.riwayat_list.length === 0) ? (
                                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                                            <History size={36} color="#475569" style={{ margin: '0 auto 10px', display: 'block' }} />
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>Belum Ada Riwayat Perubahan Fisik</div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                Perubahan status kelayakan fisik atau mutasi ruangan akan tercatat otomatis di sini.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="aset-timeline">
                                            {data.riwayat_list.map((item) => (
                                                <div className="aset-timeline-item" key={item.id}>
                                                    <div className="aset-timeline-dot" />
                                                    <div className="aset-timeline-header">
                                                        <strong style={{ color: '#f8fafc' }}>{item.aksi_label}</strong>
                                                        <span>{new Date(item.created_at).toLocaleString('id-ID')}</span>
                                                    </div>
                                                    <div className="aset-timeline-content">
                                                        <div>{item.catatan}</div>
                                                        <div style={{ display: 'flex', gap: '8px', fontSize: '10.5px', color: '#94a3b8', marginTop: '4px' }}>
                                                            {item.status_kelayakan_baru && (
                                                                <span>
                                                                    Kelayakan:{' '}
                                                                    <strong>
                                                                        {item.status_kelayakan_lama && item.status_kelayakan_lama !== item.status_kelayakan_baru
                                                                            ? `${item.status_kelayakan_lama} → ${item.status_kelayakan_baru}`
                                                                            : item.status_kelayakan_baru}
                                                                    </strong>
                                                                </span>
                                                            )}
                                                            {item.ruangan_baru && (
                                                                <span>Lokasi: <strong>{item.ruangan_baru}</strong></span>
                                                            )}
                                                            <span>Oleh: <strong>{item.dilakukan_oleh_nama}</strong></span>
                                                        </div>
                                                        {item.foto && (
                                                            <div style={{ marginTop: '6px' }}>
                                                                <img
                                                                    src={resolveMediaUrl(item.foto)}
                                                                    alt="Foto kondisi"
                                                                    style={{ maxHeight: '80px', borderRadius: '4px', border: '1px solid #334155', cursor: 'pointer' }}
                                                                    onClick={() => window.open(resolveMediaUrl(item.foto), '_blank')}
                                                                    title="Klik untuk membuka foto ukuran penuh"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 4: RIWAYAT PERBAIKAN & KERUSAKAN */}
                            {tab === 'perbaikan' && (
                                <div>
                                    {(!data.perbaikan_list || data.perbaikan_list.length === 0) ? (
                                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                                            <Wrench size={36} color="#475569" style={{ margin: '0 auto 10px', display: 'block' }} />
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>Kondisi Normal / Belum Ada Tiket Perbaikan</div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                Laporan kerusakan dan tindak lanjut servis teknisi untuk unit ini akan tercatat di sini.
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {data.perbaikan_list.map((pbk) => (
                                                <div key={pbk.id} className="aset-form-section" style={{
                                                    padding: '12px 14px',
                                                    marginBottom: 0
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#818cf8', fontSize: '12px' }}>
                                                                {pbk.nomor_tiket}
                                                            </span>
                                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                                {pbk.tanggal_laporan}
                                                            </span>
                                                        </div>
                                                        <span style={{
                                                            fontSize: '10.5px',
                                                            fontWeight: 700,
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            background: pbk.status_perbaikan === 'selesai' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                                                            color: pbk.status_perbaikan === 'selesai' ? '#34d399' : '#fbbf24'
                                                        }}>
                                                            {pbk.status_perbaikan_label}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>
                                                        <strong>Keluhan:</strong> {pbk.rincian_kerusakan}
                                                    </div>
                                                    {pbk.tindak_lanjut && (
                                                        <div style={{ fontSize: '12px', color: '#38bdf8', marginBottom: '4px' }}>
                                                            <strong>Tindak Lanjut:</strong> {pbk.tindak_lanjut}
                                                        </div>
                                                    )}
                                                    {pbk.tindak_lanjut_berikutnya && (
                                                        <div style={{ fontSize: '11.5px', color: '#f472b6' }}>
                                                            <strong>Tindak Lanjut Lanjutan:</strong> {pbk.tindak_lanjut_berikutnya}
                                                        </div>
                                                    )}
                                                    {pbk.teknisi && (
                                                        <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px' }}>
                                                            Teknisi: {pbk.teknisi}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="aset-modal-footer">
                    <button type="button" className="btn-aset btn-aset-secondary" onClick={onClose}>
                        Tutup
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

