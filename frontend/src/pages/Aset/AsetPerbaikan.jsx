import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Wrench,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Search,
    Filter,
    Edit3,
    Eye,
    X,
    Save,
    RotateCcw,
    User,
    Calendar,
    ArrowRight,
    Camera,
    Trash2
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination';
import DateField from '../../components/DateField';
import useBodyScrollLock from './useBodyScrollLock';
import resolveMediaUrl from '../../utils/resolveMediaUrl';
import './Aset.css';

export default function AsetPerbaikan() {
    const { user } = useAuth();
    const toast = useToast();

    const [perbaikanList, setPerbaikanList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTingkat, setFilterTingkat] = useState('');
    const [filterKondisi, setFilterKondisi] = useState('');

    // Modal Detail Tiket
    const [detailTicket, setDetailTicket] = useState(null);

    // Modal Update Tindak Lanjut
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [updateForm, setUpdateForm] = useState({
        status_perbaikan: 'belum_mulai',
        teknisi: '',
        biaya_perbaikan: 0,
        tindak_lanjut: '',
        kondisi_setelah_perbaikan: '',
        tindak_lanjut_berikutnya: '',
        tanggal_selesai: '',
    });
    const [fotoSetelahFile, setFotoSetelahFile] = useState(null);
    const [fotoSetelahPreview, setFotoSetelahPreview] = useState(null);
    const [biayaDisplay, setBiayaDisplay] = useState('');
    const [saving, setSaving] = useState(false);
    const fotoSetelahInputRef = useRef(null);

    // Kunci scroll halaman belakang saat modal terbuka
    useBodyScrollLock(isUpdateModalOpen || Boolean(detailTicket), () => {
        setIsUpdateModalOpen(false);
        setDetailTicket(null);
    });

    useEffect(() => {
        loadTickets();
    }, [page, pageSize, filterStatus, filterTingkat, filterKondisi]);

    const loadTickets = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
            };
            if (search) params.q = search;
            if (filterStatus) params.status_perbaikan = filterStatus;
            if (filterTingkat) params.tingkat_kerusakan = filterTingkat;
            if (filterKondisi) params.kondisi_setelah_perbaikan = filterKondisi;

            const res = await api.get('/aset/perbaikan/', { params });
            const data = res.data;
            if (data.results) {
                setPerbaikanList(data.results);
                setTotalCount(data.count || 0);
            } else if (Array.isArray(data)) {
                setPerbaikanList(data);
                setTotalCount(data.length);
            }
        } catch (err) {
            toast.error('Gagal memuat data kerusakan & perbaikan.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        loadTickets();
    };

    // Format input mata uang Rupiah
    const formatRupiahDisplay = (val) => {
        if (val === null || val === undefined || val === '') return '';
        let str = String(val).replace(/Rp\s?/i, '').trim();
        if (!str) return '';

        let parts = str.split(',');
        let intRaw = parts[0].replace(/\D/g, '');
        let decRaw = parts.length > 1 ? parts[1].replace(/\D/g, '') : null;
        let hasTrailingComma = parts.length > 1 && parts[1] === '';

        if (!intRaw && parts.length > 0 && str.startsWith('.')) {
            const dotParts = str.split('.');
            if (dotParts.length === 2 && dotParts[1].length <= 2) {
                intRaw = dotParts[0].replace(/\D/g, '');
                decRaw = dotParts[1].replace(/\D/g, '');
            }
        }

        if (!intRaw && !decRaw) return '';

        const intFormatted = intRaw ? new Intl.NumberFormat('id-ID').format(Number(intRaw)) : '0';
        let result = `Rp ${intFormatted}`;

        if (hasTrailingComma && !decRaw) {
            result += ',';
        } else if (decRaw && decRaw !== '00') {
            result += `,${decRaw.slice(0, 2)}`;
        }

        return result;
    };

    const parseRupiahRaw = (displayStr) => {
        if (!displayStr) return 0;
        const clean = String(displayStr).replace(/Rp\s?/i, '').trim();
        if (!clean) return 0;

        let parts = clean.split(',');
        let intPart = parts[0].replace(/\D/g, '');
        let decPart = parts.length > 1 ? parts[1].replace(/\D/g, '').slice(0, 2) : '';

        if (!intPart && !decPart) return 0;
        if (decPart && decPart !== '00') {
            return Number(`${intPart || '0'}.${decPart}`);
        }
        return Number(intPart) || 0;
    };

    const handleBiayaChange = (e) => {
        const inputVal = e.target.value;
        if (!inputVal || inputVal === 'Rp' || inputVal === 'Rp ') {
            setBiayaDisplay('');
            setUpdateForm(prev => ({ ...prev, biaya_perbaikan: 0 }));
            return;
        }
        const formatted = formatRupiahDisplay(inputVal);
        const raw = parseRupiahRaw(inputVal);
        setBiayaDisplay(formatted);
        setUpdateForm(prev => ({ ...prev, biaya_perbaikan: raw || 0 }));
    };

    // Buka Modal Update Tindak Lanjut
    const handleOpenUpdate = (ticket) => {
        setSelectedTicket(ticket);
        const biaya = Number(ticket.biaya_perbaikan) || 0;
        setUpdateForm({
            status_perbaikan: ticket.status_perbaikan || 'belum_mulai',
            teknisi: ticket.teknisi || '',
            biaya_perbaikan: biaya,
            tindak_lanjut: ticket.tindak_lanjut || '',
            kondisi_setelah_perbaikan: ticket.kondisi_setelah_perbaikan || '',
            tindak_lanjut_berikutnya: ticket.tindak_lanjut_berikutnya || '',
            tanggal_selesai: ticket.tanggal_selesai || '',
        });
        setBiayaDisplay(biaya > 0 ? formatRupiahDisplay(biaya) : '');
        setFotoSetelahFile(null);
        setFotoSetelahPreview(ticket.foto_setelah_perbaikan || null);
        setIsUpdateModalOpen(true);
    };

    const handleFotoSetelahChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoSetelahFile(file);
            setFotoSetelahPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveFotoSetelah = (e) => {
        e.stopPropagation();
        setFotoSetelahFile(null);
        if (fotoSetelahPreview && fotoSetelahFile) URL.revokeObjectURL(fotoSetelahPreview);
        setFotoSetelahPreview(null);
        if (fotoSetelahInputRef.current) fotoSetelahInputRef.current.value = '';
    };

    // Submit Update Tindak Lanjut
    const handleSubmitUpdate = async (e) => {
        e.preventDefault();

        // VALIDASI KRITIS: Jika kondisi setelah perbaikan masih bermasalah, WAJIB isi tindak lanjut berikutnya!
        if (updateForm.kondisi_setelah_perbaikan === 'masih_bermasalah') {
            if (!updateForm.tindak_lanjut_berikutnya.trim()) {
                toast.error('Wajib mengisi Tindak Lanjut Berikutnya karena kondisi barang dilaporkan masih bermasalah!');
                return;
            }
        }

        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('status_perbaikan', updateForm.status_perbaikan);
            formData.append('teknisi', updateForm.teknisi);
            formData.append('biaya_perbaikan', updateForm.biaya_perbaikan || 0);
            formData.append('tindak_lanjut', updateForm.tindak_lanjut);
            if (updateForm.kondisi_setelah_perbaikan) {
                formData.append('kondisi_setelah_perbaikan', updateForm.kondisi_setelah_perbaikan);
            }
            formData.append('tindak_lanjut_berikutnya', updateForm.tindak_lanjut_berikutnya);
            if (updateForm.tanggal_selesai) {
                formData.append('tanggal_selesai', updateForm.tanggal_selesai);
            }
            if (fotoSetelahFile) {
                formData.append('foto_setelah_perbaikan', fotoSetelahFile);
            }

            await api.patch(`/aset/perbaikan/${selectedTicket.id}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success(`Tindak lanjut tiket ${selectedTicket.nomor_tiket} berhasil disimpan.`);
            setIsUpdateModalOpen(false);
            loadTickets();
        } catch (err) {
            toast.error(err.response?.data?.tindak_lanjut_berikutnya?.[0] || 'Gagal menyimpan update perbaikan.');
        } finally {
            setSaving(false);
        }
    };

    // KPI Counters
    const kpiSummary = useMemo(() => {
        const total = totalCount;
        const belumMulai = perbaikanList.filter(p => p.status_perbaikan === 'belum_mulai').length;
        const dalamProses = perbaikanList.filter(p => p.status_perbaikan === 'dalam_proses').length;
        const selesai = perbaikanList.filter(p => p.status_perbaikan === 'selesai').length;
        const bermasalah = perbaikanList.filter(p => p.kondisi_setelah_perbaikan === 'masih_bermasalah').length;
        return { total, belumMulai, dalamProses, selesai, bermasalah };
    }, [perbaikanList, totalCount]);

    const formatRp = (val) => {
        if (!val || val === 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="aset-container">
            {/* Header */}
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <Wrench size={22} color="#f59e0b" />
                        Monitoring Kerusakan &amp; Tindak Lanjut Perbaikan
                    </h1>
                    <p className="aset-subtitle">
                        Panel monitoring tiket laporan kerusakan aset, progress penanganan teknisi, dan evaluasi hasil perbaikan alkes &amp; fasilitas &bull; {totalCount} total tiket tercatat
                    </p>
                </div>
            </div>

            {/* KPI Cards Ringkasan */}
            <div className="aset-stats-grid">
                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                        <Wrench size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Total Laporan</div>
                        <div className="aset-stat-value">{kpiSummary.total}</div>
                        <div className="aset-stat-subtext">Seluruh unit RS</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Belum Ditangani</div>
                        <div className="aset-stat-value" style={{ color: '#f87171' }}>{kpiSummary.belumMulai}</div>
                        <div className="aset-stat-subtext">Menunggu teknisi / Kasi</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                        <Clock size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Sedang Diproses</div>
                        <div className="aset-stat-value" style={{ color: '#fbbf24' }}>{kpiSummary.dalamProses}</div>
                        <div className="aset-stat-subtext">Dalam tahap servis / part</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Selesai Normal</div>
                        <div className="aset-stat-value" style={{ color: '#34d399' }}>{kpiSummary.selesai}</div>
                        <div className="aset-stat-subtext">Berfungsi normal kembali</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
                        <RotateCcw size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Masih Bermasalah</div>
                        <div className="aset-stat-value" style={{ color: '#f472b6' }}>{kpiSummary.bermasalah}</div>
                        <div className="aset-stat-subtext">Perlu tindak lanjut ulang</div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <form onSubmit={handleSearchSubmit} className="aset-filter-bar">
                <div className="aset-search-input-wrapper">
                    <Search size={14} className="aset-search-icon" />
                    <input
                        type="text"
                        className="aset-search-input"
                        placeholder="Cari tiket, kode aset, nama barang, atau teknisi..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <select
                    className="aset-select"
                    value={filterStatus}
                    onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Status</option>
                    <option value="belum_mulai">Belum Mulai</option>
                    <option value="dalam_proses">Dalam Proses</option>
                    <option value="selesai">Selesai</option>
                </select>

                <select
                    className="aset-select"
                    value={filterTingkat}
                    onChange={e => { setFilterTingkat(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Tingkat</option>
                    <option value="ringan">Tingkat: Ringan</option>
                    <option value="sedang">Tingkat: Sedang</option>
                    <option value="berat">Tingkat: Berat</option>
                </select>

                <select
                    className="aset-select"
                    value={filterKondisi}
                    onChange={e => { setFilterKondisi(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Kondisi Pasca</option>
                    <option value="berfungsi_normal">Berfungsi Normal</option>
                    <option value="masih_bermasalah">Masih Bermasalah</option>
                </select>

                <button type="submit" className="btn-aset btn-aset-secondary">
                    Terapkan Filter
                </button>
            </form>

            {/* Tabel Tiket Kerusakan & Perbaikan */}
            <div className="aset-table-wrapper">
                <table className="aset-table">
                    <thead>
                        <tr>
                            <th style={{ width: '110px' }}>No. Tiket</th>
                            <th style={{ width: '100px' }}>Tgl Lapor</th>
                            <th>Nama Barang &amp; Kode</th>
                            <th>Unit &amp; Lokasi</th>
                            <th style={{ textAlign: 'center', width: '90px' }}>Tingkat</th>
                            <th>Rincian Kerusakan</th>
                            <th style={{ textAlign: 'center', width: '120px' }}>Status</th>
                            <th style={{ textAlign: 'center', width: '130px' }}>Kondisi Pasca</th>
                            <th style={{ textAlign: 'center', width: '80px' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Memuat daftar tiket kerusakan &amp; perbaikan...
                                </td>
                            </tr>
                        ) : perbaikanList.length === 0 ? (
                            <tr>
                                <td colSpan="9" style={{ textAlign: 'center', padding: '35px', color: '#94a3b8' }}>
                                    Belum ada laporan kerusakan atau tidak ada data yang cocok dengan filter.
                                </td>
                            </tr>
                        ) : (
                            perbaikanList.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <span style={{
                                            fontFamily: 'monospace',
                                            fontWeight: 700,
                                            fontSize: '11.5px',
                                            color: '#818cf8'
                                        }}>
                                            {item.nomor_tiket}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                                        {item.tanggal_laporan}
                                        {item.tanggal_kerusakan && item.tanggal_kerusakan !== item.tanggal_laporan && (
                                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                Rusak: {item.tanggal_kerusakan}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                                            {item.aset_nama} {item.aset_merk ? `(${item.aset_merk})` : ''}
                                        </div>
                                        <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: '#94a3b8' }}>
                                            {item.aset_kode}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '12px', color: '#e2e8f0' }}>{item.unit_nama || '-'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            {item.ruangan_nama || item.lokasi_teks || '-'}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            background: item.tingkat_kerusakan === 'berat'
                                                ? 'rgba(239, 68, 68, 0.2)'
                                                : item.tingkat_kerusakan === 'sedang'
                                                    ? 'rgba(245, 158, 11, 0.2)'
                                                    : 'rgba(56, 189, 248, 0.2)',
                                            color: item.tingkat_kerusakan === 'berat'
                                                ? '#f87171'
                                                : item.tingkat_kerusakan === 'sedang'
                                                    ? '#fbbf24'
                                                    : '#38bdf8',
                                            border: '1px solid rgba(255,255,255,0.08)'
                                        }}>
                                            {item.tingkat_kerusakan_label}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: '240px', fontSize: '11.5px', color: '#cbd5e1' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.rincian_kerusakan}>
                                            {item.rincian_kerusakan}
                                        </div>
                                        {item.pelapor_nama && (
                                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                                                Pelapor: {item.pelapor_nama}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                            padding: '3px 8px',
                                            borderRadius: '5px',
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            background: item.status_perbaikan === 'selesai'
                                                ? 'rgba(16, 185, 129, 0.2)'
                                                : item.status_perbaikan === 'dalam_proses'
                                                    ? 'rgba(245, 158, 11, 0.2)'
                                                    : 'rgba(239, 68, 68, 0.18)',
                                            color: item.status_perbaikan === 'selesai'
                                                ? '#34d399'
                                                : item.status_perbaikan === 'dalam_proses'
                                                    ? '#fbbf24'
                                                    : '#f87171',
                                            border: '1px solid rgba(255,255,255,0.06)'
                                        }}>
                                            {item.status_perbaikan_label}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {item.kondisi_setelah_perbaikan ? (
                                            <span style={{
                                                padding: '2px 7px',
                                                borderRadius: '4px',
                                                fontSize: '10.5px',
                                                fontWeight: 700,
                                                background: item.kondisi_setelah_perbaikan === 'berfungsi_normal'
                                                    ? 'rgba(16, 185, 129, 0.18)'
                                                    : 'rgba(236, 72, 153, 0.18)',
                                                color: item.kondisi_setelah_perbaikan === 'berfungsi_normal'
                                                    ? '#34d399'
                                                    : '#f472b6',
                                            }}>
                                                {item.kondisi_setelah_perbaikan_label}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#64748b', fontSize: '11px' }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                onClick={() => setDetailTicket(item)}
                                                title="Lihat Detail Tiket"
                                            >
                                                <Eye size={14} color="#a855f7" />
                                            </button>
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                onClick={() => handleOpenUpdate(item)}
                                                title="Tindak Lanjut & Evaluasi Perbaikan"
                                            >
                                                <Edit3 size={14} color="#38bdf8" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
                <div style={{ marginTop: '14px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalCount}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            )}

            {/* MODAL DETAIL TIKET PERBAIKAN */}
            {detailTicket && createPortal(
                <div className="aset-modal-overlay" onClick={() => setDetailTicket(null)}>
                    <div className="aset-modal-content" style={{ maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Wrench size={18} color="#f59e0b" />
                                <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                                    Detail Tiket: {detailTicket.nomor_tiket}
                                </span>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '5px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: detailTicket.status_perbaikan === 'selesai'
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : detailTicket.status_perbaikan === 'dalam_proses'
                                            ? 'rgba(245, 158, 11, 0.2)'
                                            : 'rgba(239, 68, 68, 0.18)',
                                    color: detailTicket.status_perbaikan === 'selesai'
                                        ? '#34d399'
                                        : detailTicket.status_perbaikan === 'dalam_proses'
                                            ? '#fbbf24'
                                            : '#f87171',
                                    border: '1px solid rgba(255,255,255,0.06)'
                                }}>
                                    {detailTicket.status_perbaikan_label}
                                </span>
                            </div>
                            <button className="aset-modal-close" onClick={() => setDetailTicket(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="aset-modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                            {/* Card Identitas Aset */}
                            <div className="aset-form-section" style={{ padding: '12px 14px', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700 }}>
                                            {detailTicket.aset_nama} {detailTicket.aset_merk ? `(${detailTicket.aset_merk})` : ''}
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#6366f1', fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>
                                            {detailTicket.aset_kode}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span className="badge-unit">{detailTicket.unit_nama || '-'}</span>
                                        <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '3px' }}>
                                            {detailTicket.ruangan_nama || detailTicket.lokasi_teks || '-'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(148, 163, 184, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                                    <span style={{ opacity: 0.75 }}>Status Kelayakan Fisik Aset:</span>
                                    <span className={`badge-kelayakan grade-${detailTicket.status_kelayakan || 'A'}`} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                        {detailTicket.status_kelayakan_label || `Grade ${detailTicket.status_kelayakan || 'A'}`}
                                    </span>
                                </div>
                            </div>

                            {/* Section 1: Laporan & Kerusakan */}
                            <div className="aset-form-section" style={{ padding: '12px 14px', marginBottom: '14px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={14} /> Data Laporan Kerusakan
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Tanggal Laporan</div>
                                        <div style={{ fontWeight: 600 }}>{detailTicket.tanggal_laporan || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Tanggal Kejadian Rusak</div>
                                        <div style={{ fontWeight: 600 }}>{detailTicket.tanggal_kerusakan || detailTicket.tanggal_laporan || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Pelapor</div>
                                        <div style={{ fontWeight: 600 }}>{detailTicket.pelapor_nama || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Tingkat Kerusakan</div>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            marginTop: '2px',
                                            background: detailTicket.tingkat_kerusakan === 'berat'
                                                ? 'rgba(239, 68, 68, 0.2)'
                                                : detailTicket.tingkat_kerusakan === 'sedang'
                                                    ? 'rgba(245, 158, 11, 0.2)'
                                                    : 'rgba(56, 189, 248, 0.2)',
                                            color: detailTicket.tingkat_kerusakan === 'berat'
                                                ? '#f87171'
                                                : detailTicket.tingkat_kerusakan === 'sedang'
                                                    ? '#fbbf24'
                                                    : '#38bdf8',
                                        }}>
                                            {detailTicket.tingkat_kerusakan_label}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ opacity: 0.75, fontSize: '10.5px', marginBottom: '3px' }}>Rincian / Gejala Kerusakan:</div>
                                    <div className="aset-readonly-box" style={{ padding: '8px 10px', height: 'auto', whiteSpace: 'normal', lineHeight: '1.4' }}>
                                        {detailTicket.rincian_kerusakan}
                                    </div>
                                </div>

                                {detailTicket.foto_kerusakan && (
                                    <div style={{ marginTop: '10px' }}>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px', marginBottom: '4px' }}>Foto Bukti Kerusakan:</div>
                                        <a href={resolveMediaUrl(detailTicket.foto_kerusakan)} target="_blank" rel="noreferrer">
                                            <img
                                                src={resolveMediaUrl(detailTicket.foto_kerusakan)}
                                                alt="Foto Bukti Kerusakan"
                                                style={{ maxHeight: '120px', borderRadius: '6px', border: '1px solid #334155', objectFit: 'cover' }}
                                            />
                                        </a>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Penanganan & Tindak Lanjut Servis */}
                            <div className="aset-form-section" style={{ padding: '12px 14px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Wrench size={14} /> Hasil Penanganan &amp; Tindak Lanjut Servis
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Teknisi Penanggung Jawab</div>
                                        <div style={{ fontWeight: 600 }}>{detailTicket.teknisi || 'Belum ditugaskan'}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Tanggal Selesai Penanganan</div>
                                        <div style={{ fontWeight: 600 }}>{detailTicket.tanggal_selesai || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Biaya Perbaikan</div>
                                        <div style={{ color: '#10b981', fontWeight: 700 }}>{formatRp(detailTicket.biaya_perbaikan)}</div>
                                    </div>
                                    <div>
                                        <div style={{ opacity: 0.75, fontSize: '10.5px' }}>Kondisi Pasca Servis</div>
                                        {detailTicket.kondisi_setelah_perbaikan ? (
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '2px 7px',
                                                borderRadius: '4px',
                                                fontSize: '10.5px',
                                                fontWeight: 700,
                                                marginTop: '2px',
                                                background: detailTicket.kondisi_setelah_perbaikan === 'berfungsi_normal'
                                                    ? 'rgba(16, 185, 129, 0.18)'
                                                    : 'rgba(236, 72, 153, 0.18)',
                                                color: detailTicket.kondisi_setelah_perbaikan === 'berfungsi_normal'
                                                    ? '#10b981'
                                                    : '#ec4899',
                                            }}>
                                                {detailTicket.kondisi_setelah_perbaikan_label}
                                            </span>
                                        ) : (
                                            <span style={{ opacity: 0.6 }}>Belum dievaluasi</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ opacity: 0.75, fontSize: '10.5px', marginBottom: '3px' }}>Tindak Lanjut &amp; Catatan Teknisi:</div>
                                    <div className="aset-readonly-box" style={{ padding: '8px 10px', height: 'auto', whiteSpace: 'normal', lineHeight: '1.4' }}>
                                        {detailTicket.tindak_lanjut || <span style={{ opacity: 0.6 }}>Belum ada catatan tindak lanjut dari teknisi.</span>}
                                    </div>
                                </div>

                                {detailTicket.tindak_lanjut_berikutnya && (
                                    <div style={{ marginTop: '10px' }}>
                                        <div style={{ color: '#f472b6', fontSize: '10.5px', marginBottom: '3px', fontWeight: 600 }}>Tindak Lanjut Lanjutan (RTL Masih Bermasalah):</div>
                                        <div style={{ background: 'rgba(236, 72, 153, 0.1)', border: '1px solid #ec4899', padding: '8px 10px', borderRadius: '6px', fontSize: '11.5px', color: '#fbcfe8', lineHeight: '1.4' }}>
                                            {detailTicket.tindak_lanjut_berikutnya}
                                        </div>
                                    </div>
                                )}

                                {detailTicket.foto_setelah_perbaikan && (
                                    <div style={{ marginTop: '10px' }}>
                                        <div style={{ color: '#94a3b8', fontSize: '10.5px', marginBottom: '4px' }}>Foto Bukti Setelah Perbaikan:</div>
                                        <a href={resolveMediaUrl(detailTicket.foto_setelah_perbaikan)} target="_blank" rel="noreferrer">
                                            <img
                                                src={resolveMediaUrl(detailTicket.foto_setelah_perbaikan)}
                                                alt="Foto Bukti Setelah Perbaikan"
                                                style={{ maxHeight: '120px', borderRadius: '6px', border: '1px solid #334155', objectFit: 'cover' }}
                                            />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="aset-modal-footer">
                            <button
                                type="button"
                                className="btn-aset btn-aset-secondary"
                                onClick={() => setDetailTicket(null)}
                            >
                                Tutup
                            </button>
                            <button
                                type="button"
                                className="btn-aset btn-aset-primary"
                                onClick={() => {
                                    const t = detailTicket;
                                    setDetailTicket(null);
                                    handleOpenUpdate(t);
                                }}
                            >
                                <Edit3 size={14} /> Proses Tindak Lanjut
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL UPDATE TINDAK LANJUT & EVALUASI PERBAIKAN */}
            {isUpdateModalOpen && selectedTicket && createPortal(
                <div className="aset-modal-overlay" onClick={() => setIsUpdateModalOpen(false)}>
                    <div className="aset-modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <h3>
                                <Wrench size={18} color="#f59e0b" />
                                Tindak Lanjut Tiket: {selectedTicket.nomor_tiket}
                            </h3>
                            <button className="aset-modal-close" onClick={() => setIsUpdateModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitUpdate}>
                            <div className="aset-modal-body">
                                {/* Preview Aset & Laporan */}
                                <div className="aset-form-section" style={{ padding: '12px 14px', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '13.5px', fontWeight: 700 }}>
                                                {selectedTicket.aset_nama} {selectedTicket.aset_merk ? `(${selectedTicket.aset_merk})` : ''}
                                            </div>
                                            <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: '#6366f1', fontFamily: 'monospace', fontWeight: 600 }}>{selectedTicket.aset_kode}</span>
                                                <span>&bull;</span>
                                                <span>Unit: {selectedTicket.unit_nama || '-'}</span>
                                                <span>&bull;</span>
                                                <span>Lokasi: {selectedTicket.lokasi_teks || selectedTicket.ruangan_nama || '-'}</span>
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            background: selectedTicket.tingkat_kerusakan === 'berat'
                                                ? 'rgba(239, 68, 68, 0.18)'
                                                : selectedTicket.tingkat_kerusakan === 'sedang'
                                                    ? 'rgba(245, 158, 11, 0.18)'
                                                    : 'rgba(56, 189, 248, 0.18)',
                                            color: selectedTicket.tingkat_kerusakan === 'berat'
                                                ? '#f87171'
                                                : selectedTicket.tingkat_kerusakan === 'sedang'
                                                    ? '#fbbf24'
                                                    : '#38bdf8',
                                            border: '1px solid rgba(255,255,255,0.08)'
                                        }}>
                                            Kerusakan {selectedTicket.tingkat_kerusakan_label}
                                        </span>
                                    </div>
                                    <div className="aset-readonly-box" style={{ marginTop: '10px', padding: '8px 10px', height: 'auto', whiteSpace: 'normal', fontSize: '11.5px', lineHeight: '1.4' }}>
                                        <strong style={{ opacity: 0.8, marginRight: '4px' }}>Keluhan:</strong> {selectedTicket.rincian_kerusakan}
                                    </div>
                                </div>

                                {/* Form Input Progress */}
                                {/* 1. Status Perbaikan (3 Pilihan Visual Card) */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Status Perbaikan *</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                        {[
                                            { id: 'belum_mulai', label: 'Belum Mulai', desc: 'Menunggu teknisi', color: '#94a3b8', borderActive: '#94a3b8', bgActive: 'rgba(148, 163, 184, 0.15)' },
                                            { id: 'dalam_proses', label: 'Dalam Proses', desc: 'Sedang dikerjakan', color: '#fbbf24', borderActive: '#f59e0b', bgActive: 'rgba(245, 158, 11, 0.15)' },
                                            { id: 'selesai', label: 'Selesai (Fixed)', desc: 'Servis tuntas', color: '#34d399', borderActive: '#10b981', bgActive: 'rgba(16, 185, 129, 0.15)' },
                                        ].map(st => {
                                            const isSel = updateForm.status_perbaikan === st.id;
                                            return (
                                                <div
                                                    key={st.id}
                                                    onClick={() => setUpdateForm({ ...updateForm, status_perbaikan: st.id })}
                                                    className="aset-choice-card"
                                                    style={{
                                                        borderColor: isSel ? st.borderActive : undefined,
                                                        background: isSel ? st.bgActive : undefined,
                                                    }}
                                                >
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: isSel ? st.color : 'inherit' }}>
                                                        {st.label}
                                                    </div>
                                                    <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '2px' }}>
                                                        {st.desc}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 2. Grid 2: Teknisi & Tanggal Selesai (DateField) */}
                                <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                    <div className="aset-form-group" style={{ margin: 0 }}>
                                        <label className="aset-form-label">Teknisi / Bengkel Rekanan</label>
                                        <input
                                            type="text"
                                            className="aset-form-input"
                                            placeholder="Contoh: Teknisi IPSRS / Vendor Sharp"
                                            value={updateForm.teknisi}
                                            onChange={e => setUpdateForm({ ...updateForm, teknisi: e.target.value })}
                                        />
                                    </div>
                                    <div className="aset-form-group" style={{ margin: 0 }}>
                                        <label className="aset-form-label">Tanggal Selesai Penanganan</label>
                                        <DateField
                                            value={updateForm.tanggal_selesai}
                                            onChange={val => setUpdateForm({ ...updateForm, tanggal_selesai: val })}
                                            placeholder="Pilih tanggal selesai..."
                                        />
                                    </div>
                                </div>

                                {/* 3. Biaya Perbaikan dengan format Rupiah otomatis */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Biaya Perbaikan / Sparepart</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Rp 0"
                                        value={biayaDisplay}
                                        onChange={handleBiayaChange}
                                    />
                                </div>

                                {/* 4. Tindak Lanjut / Tindakan yang Dilakukan */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Tindak Lanjut / Tindakan yang Dilakukan *</label>
                                    <textarea
                                        className="aset-form-textarea"
                                        rows="2"
                                        placeholder="Jelaskan apa yang sudah diperbaiki / diganti sparepartnya..."
                                        value={updateForm.tindak_lanjut}
                                        onChange={e => setUpdateForm({ ...updateForm, tindak_lanjut: e.target.value })}
                                        required
                                    />
                                </div>

                                {/* 5. Kondisi Setelah Perbaikan (2 Pilihan Visual Card) */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Kondisi Setelah Perbaikan</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {[
                                            { id: 'berfungsi_normal', label: '✅ Berfungsi Normal', desc: 'Kondisi baik & normal, siap digunakan kembali', color: '#10b981', border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
                                            { id: 'masih_bermasalah', label: '⚠️ Masih Bermasalah', desc: 'Masih ada kendala, butuh tindak lanjut berikutnya', color: '#ec4899', border: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
                                        ].map(opt => {
                                            const isSel = updateForm.kondisi_setelah_perbaikan === opt.id;
                                            return (
                                                <div
                                                    key={opt.id}
                                                    onClick={() => setUpdateForm({ ...updateForm, kondisi_setelah_perbaikan: opt.id })}
                                                    className="aset-choice-card"
                                                    style={{
                                                        padding: '10px 12px',
                                                        borderColor: isSel ? opt.border : undefined,
                                                        background: isSel ? opt.bg : undefined,
                                                    }}
                                                >
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: isSel ? opt.color : 'inherit' }}>
                                                        {opt.label}
                                                    </div>
                                                    <div style={{ fontSize: '10.5px', opacity: 0.75, marginTop: '3px', lineHeight: '1.25' }}>
                                                        {opt.desc}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ATURAN KHUSUS ATASAN: JIKA MASIH BERMASALAH MAKA WAJIB MENGISI TINDAK LANJUT BERIKUTNYA */}
                                {updateForm.kondisi_setelah_perbaikan === 'masih_bermasalah' && (
                                    <div style={{
                                        background: 'rgba(236, 72, 153, 0.08)',
                                        border: '1.5px solid #ec4899',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '14px'
                                    }}>
                                        <label className="aset-form-label" style={{ color: '#ec4899', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <AlertTriangle size={13} color="#ec4899" /> Tindak Lanjut Berikutnya (Wajib Diisi karena Masih Bermasalah) *
                                        </label>
                                        <textarea
                                            className="aset-form-textarea"
                                            rows="2"
                                            placeholder="Jelaskan langkah lanjutan (contoh: Menunggu kedatangan komponen IC board dari distributor, usulan kalibrasi ulang BPFK, atau pengusulan pengadaan baru)..."
                                            value={updateForm.tindak_lanjut_berikutnya}
                                            onChange={e => setUpdateForm({ ...updateForm, tindak_lanjut_berikutnya: e.target.value })}
                                            required
                                            style={{ borderColor: '#ec4899' }}
                                        />
                                        <div style={{ fontSize: '10.5px', color: '#ec4899', marginTop: '4px' }}>
                                            Barang belum dinyatakan normal, sehingga rencana penanganan tahap berikutnya harus terdokumentasi.
                                        </div>
                                    </div>
                                )}

                                {/* Upload Foto Bukti Setelah Perbaikan dengan Dropzone Modern */}
                                <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                    <label className="aset-form-label">Foto Bukti Setelah Perbaikan (Opsional)</label>
                                    <input
                                        type="file"
                                        ref={fotoSetelahInputRef}
                                        accept="image/*"
                                        onChange={handleFotoSetelahChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        className="aset-file-dropzone"
                                        onClick={() => fotoSetelahInputRef.current?.click()}
                                        style={{ height: 'auto', padding: '10px 14px' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            <Camera size={16} color="#818cf8" />
                                            <span style={{ fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {fotoSetelahFile ? fotoSetelahFile.name : (fotoSetelahPreview ? 'Foto Bukti Terlampir' : 'Upload Foto Bukti Setelah Perbaikan (Klik di sini)...')}
                                            </span>
                                        </div>
                                        <span className="aset-file-dropzone-badge">
                                            Pilih Foto
                                        </span>
                                    </div>

                                    {fotoSetelahPreview && (
                                        <div className="aset-file-preview-card" style={{ padding: '8px 12px' }}>
                                            <img
                                                src={resolveMediaUrl(fotoSetelahPreview)}
                                                alt="Preview Bukti Setelah Perbaikan"
                                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {fotoSetelahFile?.name || 'Foto Setelah Perbaikan'}
                                                </div>
                                                <div style={{ fontSize: '10.5px', opacity: 0.75 }}>
                                                    {fotoSetelahFile ? `${(fotoSetelahFile.size / 1024).toFixed(0)} KB` : 'Foto tersimpan'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFotoSetelah}
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
                                <button
                                    type="button"
                                    className="btn-aset btn-aset-secondary"
                                    onClick={() => setIsUpdateModalOpen(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="btn-aset btn-aset-primary"
                                    disabled={saving}
                                >
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Tindak Lanjut'}
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

