import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Calculator, History, FileText, QrCode, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
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
    const [expandedRepairIds, setExpandedRepairIds] = useState({});

    useEffect(() => {
        if (isOpen && asetId) {
            setTab('info');
            setExpandedRepairIds({});
            loadDetail();
            if (isFinancialViewer) {
                loadJadwal();
            }
        }
    }, [isOpen, asetId]);

    const toggleRepairExpand = (pbkId) => {
        setExpandedRepairIds(prev => ({ ...prev, [pbkId]: !prev[pbkId] }));
    };

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

    const getKelayakanTone = (grade) => {
        if (grade === 'A') return 'emerald';
        if (grade === 'B') return 'sky';
        if (grade === 'C') return 'amber';
        if (grade === 'D') return 'orange';
        return 'rose';
    };

    const getPerbaikanTone = (status) => {
        if (status === 'selesai') return 'emerald';
        if (status === 'dalam_proses') return 'amber';
        if (status === 'inspeksi') return 'sky';
        return 'rose';
    };

    return createPortal(
        <div className="aset-modal-overlay" onClick={onClose}>
            <div className="aset-modal-content aset-modal-lg aset-modal-detail" onClick={e => e.stopPropagation()}>
                <div className="aset-modal-header">
                    <h3>Detail Aset: {data?.kode_aset || 'Memuat...'}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {data && (
                            <button
                                type="button"
                                className="aset-btn-ghost aset-btn-qr"
                                onClick={() => onOpenQr && onOpenQr(data)}
                            >
                                <QrCode size={14} /> Label QR
                            </button>
                        )}
                        <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="aset-tabs">
                    <button
                        type="button"
                        className={`aset-tab-btn ${tab === 'info' ? 'active' : ''}`}
                        onClick={() => setTab('info')}
                    >
                        <FileText size={14} /> Informasi Fisik
                    </button>
                    {isFinancialViewer && (
                        <button
                            type="button"
                            className={`aset-tab-btn ${tab === 'jadwal' ? 'active' : ''}`}
                            onClick={() => setTab('jadwal')}
                        >
                            <Calculator size={14} /> Jadwal Penyusutan PMK 72
                        </button>
                    )}
                    <button
                        type="button"
                        className={`aset-tab-btn ${tab === 'riwayat' ? 'active' : ''}`}
                        onClick={() => setTab('riwayat')}
                    >
                        <History size={14} /> Riwayat & Mutasi ({data?.riwayat_list?.length || 0})
                    </button>
                    <button
                        type="button"
                        className={`aset-tab-btn ${tab === 'perbaikan' ? 'active' : ''}`}
                        onClick={() => setTab('perbaikan')}
                    >
                        <Wrench size={14} /> Riwayat Perbaikan ({data?.perbaikan_list?.length || 0})
                    </button>
                </div>

                <div className="aset-modal-body" ref={bodyRef}>
                    {loading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--gdg-muted)' }}>Memuat data aset...</div>
                    ) : !data ? (
                        <div style={{ padding: '20px', color: '#ef4444' }}>Aset tidak ditemukan.</div>
                    ) : (
                        <>
                            {/* TAB 1: INFORMASI FISIK */}
                            {tab === 'info' && (
                                <div>
                                    <div className="aset-detail-section">
                                        <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                            <div>
                                                <div className="aset-detail-label">Kode Aset</div>
                                                <div className="aset-detail-value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                    {data.kode_aset}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Tingkat Kelayakan</div>
                                                <span className={`aset-status-text ${getKelayakanTone(data.status_kelayakan)}`}>
                                                    <span className="aset-status-dot" />
                                                    <span>{data.status_kelayakan_label}</span>
                                                </span>
                                            </div>
                                        </div>

                                        <div className="aset-form-grid-2">
                                            <div>
                                                <div className="aset-detail-label">Deskripsi &amp; Nama Barang</div>
                                                <div className="aset-detail-value" style={{ fontWeight: 600 }}>{data.deskripsi}</div>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Merek &amp; Spesifikasi</div>
                                                <div className="aset-detail-value" style={{ color: 'var(--gdg-muted)', fontWeight: 400 }}>
                                                    {data.merk || '-'} {data.spesifikasi ? `(${data.spesifikasi})` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="aset-detail-section aset-form-grid-3">
                                        <div>
                                            <div className="aset-detail-label">Nomor Seri (S/N)</div>
                                            <div className="aset-detail-value" style={{ fontFamily: 'monospace' }}>
                                                {data.nomor_seri || '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="aset-detail-label">Nomor Registrasi</div>
                                            <div className="aset-detail-value">
                                                {data.nomor_registrasi || '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="aset-detail-label">Kalibrasi Berkala</div>
                                            {data.perlu_kalibrasi ? (
                                                <span className="aset-status-text emerald">
                                                    <span className="aset-status-dot" />
                                                    <span>Wajib Kalibrasi</span>
                                                </span>
                                            ) : (
                                                <div className="aset-detail-value" style={{ color: 'var(--gdg-muted)', fontWeight: 400 }}>
                                                    Tidak Perlu
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="aset-detail-section">
                                        <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                            <div>
                                                <div className="aset-detail-label">Unit Penanggung Jawab</div>
                                                <div className="aset-detail-value" style={{ fontWeight: 600 }}>{data.unit_nama}</div>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Ruangan / Lokasi Fisik</div>
                                                <div className="aset-detail-value">
                                                    {data.lokasi_teks || data.ruangan_nama || '-'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="aset-form-grid-3">
                                            <div>
                                                <div className="aset-detail-label">Status Aset</div>
                                                <div className="aset-detail-value" style={{ textTransform: 'capitalize' }}>{data.status_aset_label}</div>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Status Kepemilikan</div>
                                                <div className="aset-detail-value" style={{ textTransform: 'capitalize' }}>{data.status_kepemilikan?.replace('_', ' ')}</div>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Status Data</div>
                                                <span className={`aset-status-text ${data.status_data === 'lengkap' ? 'emerald' : 'amber'}`}>
                                                    <span className="aset-status-dot" />
                                                    <span>{data.status_data_label}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <div className="aset-form-grid-2" style={{ marginTop: '14px' }}>
                                            <div>
                                                <div className="aset-detail-label">Status Verifikasi</div>
                                                <span className={`aset-status-text ${
                                                    data.status_verifikasi === 'terverifikasi'
                                                        ? 'emerald'
                                                        : data.status_verifikasi === 'ditolak'
                                                            ? 'rose'
                                                            : 'amber'
                                                }`}>
                                                    <span className="aset-status-dot" />
                                                    <span>{data.status_verifikasi_label || data.status_verifikasi}</span>
                                                </span>
                                            </div>
                                            <div>
                                                <div className="aset-detail-label">Diverifikasi Oleh</div>
                                                <div className="aset-detail-value">
                                                    {data.verified_by_nama || (data.status_verifikasi === 'terverifikasi' ? 'Admin Aset' : 'Menunggu Verifikasi')}
                                                </div>
                                            </div>
                                        </div>
                                        {data.catatan_verifikasi && (
                                            <div style={{ marginTop: '12px' }}>
                                                <div className="aset-detail-label">Catatan Verifikasi</div>
                                                <div className="aset-detail-prose">{data.catatan_verifikasi}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bagian Finansial (Hanya untuk Admin / Keuangan) */}
                                    {isFinancialViewer && (
                                        <div className="aset-detail-section">
                                            <div className="aset-detail-section-title" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '11.5px' }}>
                                                Data Perolehan &amp; Penyusutan (PMK 72/2023)
                                            </div>
                                            <div className="aset-form-grid-3">
                                                <div>
                                                    <div className="aset-detail-label">Harga Perolehan</div>
                                                    <div className="aset-detail-value" style={{ fontWeight: 600 }}>{formatRp(data.harga_perolehan)}</div>
                                                </div>
                                                <div>
                                                    <div className="aset-detail-label">Bulan/Tahun Perolehan</div>
                                                    <div className="aset-detail-value">{data.bulan_perolehan || '-'}</div>
                                                </div>
                                                <div>
                                                    <div className="aset-detail-label">Kelompok Fiskal</div>
                                                    <div className="aset-detail-value">{data.kelompok_nama || '-'} ({data.masa_manfaat_bulan} Bln)</div>
                                                </div>
                                            </div>

                                            {data.penyusutan?.is_calculable && (
                                                <div className="aset-form-grid-3" style={{ marginTop: '12px' }}>
                                                    <div>
                                                        <div className="aset-detail-label">Beban per Bulan</div>
                                                        <div className="aset-detail-value">{formatRp(data.penyusutan.beban_bulanan)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="aset-detail-label">Akumulasi Penyusutan</div>
                                                        <div className="aset-detail-value aset-num-cell is-warning">{formatRp(data.penyusutan.akumulasi_penyusutan)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="aset-detail-label">Nilai Buku Bersih (NBV)</div>
                                                        <div className="aset-detail-value aset-num-cell is-success">{formatRp(data.penyusutan.nilai_buku)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rekomendasi Tindakan */}
                                    {data.rekomendasi_tindakan && (
                                        <div className="aset-detail-section">
                                            <div className="aset-detail-label">Rekomendasi Tindakan</div>
                                            <div className="aset-detail-prose">
                                                {data.rekomendasi_tindakan}
                                            </div>
                                        </div>
                                    )}

                                    {/* Komparasi Dua Foto: Saat Registrasi Awal vs Terkini dari Unit */}
                                    {(data.foto_awal || data.foto || data.foto_terkini) && (
                                        <div className="aset-detail-section">
                                            <div className="aset-detail-section-title">
                                                Komparasi Kondisi Fisik (Registrasi Awal vs Terkini Lapangan)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                                <div style={{ textAlign: 'center', padding: '10px', border: '1px solid var(--gdg-border)', borderRadius: '6px' }}>
                                                    <div className="aset-detail-label" style={{ marginBottom: '8px' }}>
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
                                                        <div style={{ padding: '30px 10px', fontSize: '12px', color: 'var(--gdg-muted)' }}>Belum ada foto registrasi</div>
                                                    )}
                                                </div>

                                                <div style={{ textAlign: 'center', padding: '10px', border: '1px solid var(--gdg-border)', borderRadius: '6px' }}>
                                                    <div className="aset-detail-label" style={{ marginBottom: '8px' }}>
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
                                                        <div style={{ padding: '30px 10px', fontSize: '12px', color: 'var(--gdg-muted)' }}>Belum ada update foto unit</div>
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
                                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--gdg-muted)' }}>Menghitung jadwal penyusutan...</div>
                                    ) : !jadwal?.is_calculable ? (
                                        <div style={{ padding: '8px 0' }}>
                                            <span className="aset-status-text amber">
                                                <span className="aset-status-dot" />
                                                <span>{jadwal?.alasan || 'Aset ini belum memiliki kelengkapan data harga atau tanggal perolehan.'}</span>
                                            </span>
                                        </div>
                                    ) : (
                                        <div>
                                            {/* Toggle Tahunan / Bulanan */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                                <div style={{ fontSize: '12.5px', color: 'var(--gdg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                    Metode Garis Lurus (PMK No. 72/2023) &bull; Tarif: <span style={{ color: 'var(--gdg-text)', fontWeight: 600 }}>{jadwal.tarif_persen}% / thn</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        className={`btn-aset ${jadwalView === 'tahunan' ? 'btn-aset-primary' : 'btn-aset-secondary'}`}
                                                        style={{ height: '30px', minHeight: '30px', padding: '0 10px', fontSize: '12px' }}
                                                        onClick={() => setJadwalView('tahunan')}
                                                    >
                                                        Ringkasan Tahunan
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`btn-aset ${jadwalView === 'bulanan' ? 'btn-aset-primary' : 'btn-aset-secondary'}`}
                                                        style={{ height: '30px', minHeight: '30px', padding: '0 10px', fontSize: '12px' }}
                                                        onClick={() => setJadwalView('bulanan')}
                                                    >
                                                        Rincian Bulanan
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Table Schedule */}
                                            <div className="aset-table-borderless" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                                {jadwalView === 'tahunan' ? (
                                                    <table className="aset-table aset-table-stripe">
                                                        <thead>
                                                            <tr>
                                                                <th>Tahun Pajak</th>
                                                                <th>Porsi Bulan</th>
                                                                <th>Tarif</th>
                                                                <th>Beban Penyusutan</th>
                                                                <th>Akumulasi</th>
                                                                <th style={{ textAlign: 'right' }}>Nilai Sisa Buku</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {jadwal.jadwal_tahunan.map((row) => (
                                                                <tr key={row.tahun}>
                                                                    <td className="aset-num-cell" style={{ fontWeight: 600, color: 'var(--gdg-text)' }}>{row.tahun}</td>
                                                                    <td className="aset-num-cell">{row.porsi} ({row.bulan_dihitung} bln)</td>
                                                                    <td className="aset-num-cell">{row.tarif_persen}%</td>
                                                                    <td className="aset-num-cell">{formatRp(row.beban_penyusutan)}</td>
                                                                    <td className="aset-num-cell is-warning">{formatRp(row.akumulasi_penyusutan)}</td>
                                                                    <td className="aset-num-cell is-success" style={{ textAlign: 'right' }}>{formatRp(row.nilai_buku_akhir)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <table className="aset-table aset-table-stripe">
                                                        <thead>
                                                            <tr>
                                                                <th>Bulan Ke</th>
                                                                <th>Periode</th>
                                                                <th>Beban Bulan Ini</th>
                                                                <th>Akumulasi</th>
                                                                <th style={{ textAlign: 'right' }}>Nilai Sisa Buku</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {jadwal.jadwal_bulanan.map((row) => (
                                                                <tr key={row.bulan_ke}>
                                                                    <td className="aset-num-cell">{row.bulan_ke}</td>
                                                                    <td className="aset-num-cell" style={{ fontWeight: 600, color: 'var(--gdg-text)' }}>{row.periode}</td>
                                                                    <td className="aset-num-cell">{formatRp(row.beban_bulan)}</td>
                                                                    <td className="aset-num-cell is-warning">{formatRp(row.akumulasi_penyusutan)}</td>
                                                                    <td className="aset-num-cell is-success" style={{ textAlign: 'right' }}>{formatRp(row.nilai_buku)}</td>
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
                                        <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--gdg-muted)' }}>
                                            <History size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.45 }} />
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gdg-text)' }}>Belum Ada Riwayat Perubahan Fisik</div>
                                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                                Perubahan status kelayakan fisik atau mutasi ruangan akan tercatat otomatis di sini.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="aset-timeline aset-timeline-flat">
                                            {data.riwayat_list.map((item) => (
                                                <div className="aset-timeline-item" key={item.id}>
                                                    <div className="aset-timeline-dot" />
                                                    <div className="aset-timeline-header">
                                                        <span style={{ fontWeight: 600, color: 'var(--gdg-text)' }}>{item.aksi_label}</span>
                                                        <span>{new Date(item.created_at).toLocaleString('id-ID')}</span>
                                                    </div>
                                                    <div className="aset-timeline-content">
                                                        <div>{item.catatan}</div>
                                                        <div className="aset-timeline-meta">
                                                            {item.status_kelayakan_baru && (
                                                                <span>
                                                                    Kelayakan:{' '}
                                                                    {item.status_kelayakan_lama && item.status_kelayakan_lama !== item.status_kelayakan_baru
                                                                        ? `${item.status_kelayakan_lama} → ${item.status_kelayakan_baru}`
                                                                        : item.status_kelayakan_baru}
                                                                </span>
                                                            )}
                                                            {item.ruangan_baru && (
                                                                <span>Lokasi: {item.ruangan_baru}</span>
                                                            )}
                                                            <span>Oleh: {item.dilakukan_oleh_nama}</span>
                                                        </div>
                                                        {item.foto && (
                                                            <div style={{ marginTop: '8px' }}>
                                                                <img
                                                                    src={resolveMediaUrl(item.foto)}
                                                                    alt="Foto kondisi"
                                                                    style={{ maxHeight: '76px', borderRadius: '6px', border: '1px solid var(--gdg-border)', cursor: 'pointer' }}
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
                                        <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--gdg-muted)' }}>
                                            <Wrench size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.45 }} />
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gdg-text)' }}>Kondisi Normal / Belum Ada Tiket Perbaikan</div>
                                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                                Laporan kerusakan dan tindak lanjut servis teknisi untuk unit ini akan tercatat di sini.
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            {data.perbaikan_list.map((pbk) => {
                                                const logs = pbk.log_list || [];
                                                const isExpanded = Boolean(expandedRepairIds[pbk.id]);

                                                return (
                                                    <div key={pbk.id} className="aset-detail-section">
                                                        <div
                                                            onClick={() => toggleRepairExpand(pbk.id)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRepairExpand(pbk.id); } }}
                                                            style={{ cursor: 'pointer', userSelect: 'none' }}
                                                            title={isExpanded ? 'Klik untuk tutup log perbaikan' : 'Klik untuk lihat log perbaikan'}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--gdg-muted)' }}>
                                                                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                                                    </span>
                                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--gdg-text)', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {pbk.nomor_tiket}
                                                                    </span>
                                                                    <span style={{ fontSize: '12px', color: 'var(--gdg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {pbk.tanggal_laporan}
                                                                    </span>
                                                                </div>
                                                                <span className={`aset-status-text ${getPerbaikanTone(pbk.status_perbaikan)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                                    <span className="aset-status-dot" />
                                                                    <span>{pbk.status_perbaikan_label} &bull; {logs.length} Log</span>
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '13px', color: 'var(--gdg-text)', marginBottom: '4px', paddingLeft: '23px' }}>
                                                                <span style={{ color: 'var(--gdg-muted)' }}>Keluhan: </span>{pbk.rincian_kerusakan}
                                                            </div>
                                                            {pbk.tindak_lanjut && (
                                                                <div style={{ fontSize: '13px', color: 'var(--gdg-text)', marginBottom: '4px', paddingLeft: '23px' }}>
                                                                    <span style={{ color: 'var(--gdg-muted)' }}>Tindak Lanjut: </span>{pbk.tindak_lanjut}
                                                                </div>
                                                            )}
                                                            <div className="aset-timeline-meta" style={{ paddingLeft: '23px', marginTop: '4px' }}>
                                                                {pbk.teknisi && <span>Teknisi: {pbk.teknisi}</span>}
                                                                {isFinancialViewer && Number(pbk.estimasi_biaya) > 0 && (
                                                                    <span>Est: {formatRp(pbk.estimasi_biaya)}</span>
                                                                )}
                                                                {isFinancialViewer && Number(pbk.biaya_perbaikan) > 0 && (
                                                                    <span className="aset-num-cell is-success">Biaya Riil: {formatRp(pbk.biaya_perbaikan)}</span>
                                                                )}
                                                                <span style={{ color: 'var(--gdg-text)', fontWeight: 500 }}>
                                                                    {isExpanded ? 'Sembunyikan log' : 'Lihat log perbaikan'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Accordion Expand: Kronologis Log Perbaikan (Timeline Datar) */}
                                                        {isExpanded && (
                                                            <div style={{
                                                                marginTop: '12px',
                                                                paddingTop: '12px',
                                                                paddingLeft: '23px',
                                                                borderTop: '1px solid var(--gdg-border)',
                                                            }}>
                                                                {logs.length === 0 ? (
                                                                    <div style={{ fontSize: '12px', color: 'var(--gdg-muted)' }}>
                                                                        Belum ada catatan log kronologis untuk tiket ini.
                                                                    </div>
                                                                ) : (
                                                                    <div className="aset-timeline aset-timeline-flat">
                                                                        {logs.map((logItem, idx) => (
                                                                            <div key={logItem.id || idx} className="aset-timeline-item">
                                                                                <div className="aset-timeline-dot" style={{
                                                                                    background: logItem.status_sesudah === 'selesai'
                                                                                        ? '#10b981'
                                                                                        : logItem.status_sesudah === 'dalam_proses'
                                                                                            ? '#fbbf24'
                                                                                            : logItem.status_sesudah === 'inspeksi'
                                                                                                ? '#38bdf8'
                                                                                                : '#94a3b8'
                                                                                }} />
                                                                                <div className="aset-timeline-header">
                                                                                    <span style={{ fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                                                        {logItem.status_sesudah_label}
                                                                                    </span>
                                                                                    <span>{new Date(logItem.created_at).toLocaleString('id-ID')}</span>
                                                                                </div>
                                                                                <div className="aset-timeline-content">
                                                                                    <div>{logItem.tindakan}</div>
                                                                                    <div className="aset-timeline-meta">
                                                                                        {logItem.teknisi && <span>Teknisi: {logItem.teknisi}</span>}
                                                                                        {isFinancialViewer && Number(logItem.estimasi_biaya) > 0 && (
                                                                                            <span>Est: {formatRp(logItem.estimasi_biaya)}</span>
                                                                                        )}
                                                                                        {isFinancialViewer && Number(logItem.biaya_riil) > 0 && (
                                                                                            <span className="aset-num-cell is-success">Biaya Riil: {formatRp(logItem.biaya_riil)}</span>
                                                                                        )}
                                                                                        <span>Dicatat oleh: {logItem.dibuat_oleh_nama}</span>
                                                                                    </div>
                                                                                    {logItem.foto && (
                                                                                        <div style={{ marginTop: '8px' }}>
                                                                                            <img
                                                                                                src={resolveMediaUrl(logItem.foto)}
                                                                                                alt="Lampiran Log Perbaikan"
                                                                                                style={{ maxHeight: '72px', borderRadius: '6px', border: '1px solid var(--gdg-border)', cursor: 'pointer' }}
                                                                                                onClick={() => window.open(resolveMediaUrl(logItem.foto), '_blank')}
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
                                                    </div>
                                                );
                                            })}
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

