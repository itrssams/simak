import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Wrench,
    CheckCircle2,
    Search,
    Edit3,
    Eye,
    X,
    Save,
    Camera,
    Trash2,
    Check,
    UserCheck
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination';
import DateField from '../../components/DateField';
import useBodyScrollLock from './useBodyScrollLock';
import resolveMediaUrl from '../../utils/resolveMediaUrl';
import './Aset.css';

// Stepper Alur Tahapan Perbaikan (Pipeline Linier Otomatis Mirip Petty Cash)
const REPAIR_STEPS = [
    { key: 'lapor', label: '1. Pelaporan', desc: 'Tiket dibuat' },
    { key: 'inspeksi', label: '2. Inspeksi Teknisi', desc: 'Penugasan & cek fisik' },
    { key: 'dalam_proses', label: '3. Pengerjaan Servis', desc: 'Tindakan perbaikan' },
    { key: 'selesai', label: '4. Selesai (Finish)', desc: 'Penetapan kelayakan' },
];

function RepairStepper({ currentStatus, activeTargetStep }) {
    // Tentukan tahap mana yang sedang aktif dijalankan:
    // 0: Pelaporan, 1: Inspeksi Teknisi, 2: Pengerjaan Servis, 3: Selesai
    let activeIndex = 1;
    if (currentStatus === 'selesai') {
        activeIndex = 4; // Semua tahap (0, 1, 2, 3) telah selesai
    } else if (activeTargetStep !== undefined) {
        activeIndex = activeTargetStep;
    } else if (currentStatus === 'belum_mulai') {
        activeIndex = 1; // Tahap 2 (index 1) sedang aktif
    } else if (currentStatus === 'inspeksi') {
        activeIndex = 2; // Tahap 3 (index 2) sedang aktif
    } else if (currentStatus === 'dalam_proses') {
        activeIndex = 2; // Tahap 3 (index 2) sedang aktif
    }

    return (
        <div className="aset-steps">
            {REPAIR_STEPS.map((s, i) => {
                const isCompleted = currentStatus === 'selesai' || i < activeIndex;
                const isCurrentActive = currentStatus !== 'selesai' && i === activeIndex;

                let dotClass = 'aset-step-dot';
                let stepClass = 'aset-step';

                if (isCompleted) {
                    dotClass += ' completed';
                    stepClass += ' completed';
                } else if (isCurrentActive) {
                    const activeType = i === 1 ? '1' : i === 2 ? '2' : '3';
                    dotClass += ` active-step-${activeType}`;
                    stepClass += ` active-${activeType}`;
                }

                // Garis dari step i ke step i+1 selesai jika step i sudah tuntas dan alur sudah melangkah maju
                const isLineCompleted = currentStatus === 'selesai' || i < activeIndex;

                return (
                    <div key={s.key} className={stepClass}>
                        {i < REPAIR_STEPS.length - 1 && (
                            <div className={`aset-step-line ${isLineCompleted ? 'completed' : ''}`} />
                        )}
                        <div className={dotClass}>
                            {isCompleted ? <Check size={14} strokeWidth={3} /> : i + 1}
                        </div>
                        <div className="aset-step-label">
                            <div>{s.label}</div>
                            <div className="aset-step-desc">{s.desc}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function AsetPerbaikan() {
    const { user } = useAuth();
    const toast = useToast();

    // Akses Utama Manajemen Aset
    const isAsetAdmin = Boolean(
        user?.is_superuser ||
        user?.is_aset_admin ||
        ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role) ||
        (user?.role === 'kepala_seksi' && user?.unit_nama?.toLowerCase().includes('umum'))
    );

    const [perbaikanList, setPerbaikanList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTingkat, setFilterTingkat] = useState('');

    // Modal Detail Tiket
    const [detailTicket, setDetailTicket] = useState(null);

    // Modal Update Progress Tindak Lanjut (Regular)
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [updateForm, setUpdateForm] = useState({
        teknisi: '',
        hasil_inspeksi: '',
        estimasi_biaya: 0,
        tindak_lanjut: '',
        catatan_progres: '',
    });
    const [estimasiBiayaDisplay, setEstimasiBiayaDisplay] = useState('');
    const [fotoProgressFile, setFotoProgressFile] = useState(null);
    const [fotoProgressPreview, setFotoProgressPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const fotoProgressInputRef = useRef(null);

    // Modal Dedicated Finish / Selesaikan Perbaikan
    const [finishTicket, setFinishTicket] = useState(null);
    const [finishForm, setFinishForm] = useState({
        kondisi_ringkas: '',
        status_kelayakan_baru: 'A',
        biaya_riil: 0,
        catatan_penutupan: '',
        tanggal_selesai: new Date().toISOString().split('T')[0],
    });
    const [finishBiayaDisplay, setFinishBiayaDisplay] = useState('');
    const [finishFotoFile, setFinishFotoFile] = useState(null);
    const [finishFotoPreview, setFinishFotoPreview] = useState(null);
    const [finishing, setFinishing] = useState(false);
    const finishFotoInputRef = useRef(null);

    // Kunci scroll halaman belakang saat modal terbuka
    useBodyScrollLock(isUpdateModalOpen || Boolean(detailTicket) || Boolean(finishTicket), () => {
        setIsUpdateModalOpen(false);
        setDetailTicket(null);
        setFinishTicket(null);
    });

    useEffect(() => {
        loadTickets();
    }, [page, pageSize, filterStatus, filterTingkat]);

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

            const res = await api.get('/aset/perbaikan/', { params });
            const data = res.data;
            if (data.results) {
                setPerbaikanList(data.results);
                setTotalCount(data.count || 0);
            } else if (Array.isArray(data)) {
                setPerbaikanList(data);
                setTotalCount(data.length);
            }
        } catch {
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

    const handleEstimasiBiayaChange = (e) => {
        const inputVal = e.target.value;
        if (!inputVal || inputVal === 'Rp' || inputVal === 'Rp ') {
            setEstimasiBiayaDisplay('');
            setUpdateForm(prev => ({ ...prev, estimasi_biaya: 0 }));
            return;
        }
        const formatted = formatRupiahDisplay(inputVal);
        const raw = parseRupiahRaw(inputVal);
        setEstimasiBiayaDisplay(formatted);
        setUpdateForm(prev => ({ ...prev, estimasi_biaya: raw || 0 }));
    };

    const handleFinishBiayaChange = (e) => {
        const inputVal = e.target.value;
        if (!inputVal || inputVal === 'Rp' || inputVal === 'Rp ') {
            setFinishBiayaDisplay('');
            setFinishForm(prev => ({ ...prev, biaya_riil: 0 }));
            return;
        }
        const formatted = formatRupiahDisplay(inputVal);
        const raw = parseRupiahRaw(inputVal);
        setFinishBiayaDisplay(formatted);
        setFinishForm(prev => ({ ...prev, biaya_riil: raw || 0 }));
    };

    // Buka Modal Update Tindak Lanjut / Progres
    const handleOpenUpdate = (ticket) => {
        if (!isAsetAdmin) {
            toast.error('Hanya pengguna dengan akses utama Manajemen Aset yang berhak mengisi tindak lanjut perbaikan.');
            return;
        }
        setSelectedTicket(ticket);
        const est = Number(ticket.estimasi_biaya) || 0;
        setUpdateForm({
            teknisi: ticket.teknisi || '',
            hasil_inspeksi: ticket.hasil_inspeksi || '',
            estimasi_biaya: est,
            tindak_lanjut: ticket.tindak_lanjut || '',
            catatan_progres: '',
        });
        setEstimasiBiayaDisplay(est > 0 ? formatRupiahDisplay(est) : '');
        setFotoProgressFile(null);
        setFotoProgressPreview(null);
        setIsUpdateModalOpen(true);
    };

    const handleFotoProgressChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoProgressFile(file);
            setFotoProgressPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveFotoProgress = (e) => {
        e.stopPropagation();
        setFotoProgressFile(null);
        if (fotoProgressPreview) URL.revokeObjectURL(fotoProgressPreview);
        setFotoProgressPreview(null);
        if (fotoProgressInputRef.current) fotoProgressInputRef.current.value = '';
    };

    // Submit Update Progres (Alur Tahapan Otomatis: Belum Mulai -> Inspeksi -> Dalam Proses)
    const handleSubmitUpdate = async (e) => {
        e.preventDefault();
        if (!selectedTicket) return;

        const currentStatus = selectedTicket.status_perbaikan;
        const formData = new FormData();

        if (currentStatus === 'belum_mulai') {
            // Tahap 2: Penugasan Teknisi & Mulai Inspeksi
            if (!updateForm.teknisi.trim()) {
                toast.error('Wajib mengisi Nama Teknisi / Vendor Rekanan untuk menugaskan inspeksi.');
                return;
            }
            formData.append('status_perbaikan', 'inspeksi');
            formData.append('teknisi', updateForm.teknisi.trim());
            if (updateForm.tindak_lanjut.trim()) {
                formData.append('tindak_lanjut', updateForm.tindak_lanjut.trim());
            }
        } else if (currentStatus === 'inspeksi') {
            // Tahap 3: Input Hasil Inspeksi & Mulai Servis
            if (!updateForm.teknisi.trim()) {
                toast.error('Wajib mengisi Nama Teknisi.');
                return;
            }
            if (!updateForm.hasil_inspeksi.trim()) {
                toast.error('Wajib mengisi Hasil Inspeksi / Diagnosa Kerusakan.');
                return;
            }
            if (!updateForm.tindak_lanjut.trim()) {
                toast.error('Wajib mengisi Rencana Tindak Lanjut Servis.');
                return;
            }
            if (updateForm.estimasi_biaya === '' || updateForm.estimasi_biaya === null || isNaN(Number(updateForm.estimasi_biaya))) {
                toast.error('Wajib mencantumkan Estimasi Biaya Perbaikan (bisa Rp 0 jika non-biaya/garansi).');
                return;
            }
            formData.append('status_perbaikan', 'dalam_proses');
            formData.append('teknisi', updateForm.teknisi.trim());
            formData.append('hasil_inspeksi', updateForm.hasil_inspeksi.trim());
            formData.append('tindak_lanjut', updateForm.tindak_lanjut.trim());
            formData.append('estimasi_biaya', updateForm.estimasi_biaya || 0);
        } else if (currentStatus === 'dalam_proses') {
            // Update Catatan Progres Pengerjaan Berkala
            if (!updateForm.catatan_progres.trim()) {
                toast.error('Tuliskan Catatan Progres Pengerjaan Terkini.');
                return;
            }
            formData.append('status_perbaikan', 'dalam_proses');
            formData.append('tindak_lanjut', updateForm.catatan_progres.trim());
        }

        if (fotoProgressFile) {
            formData.append('foto_setelah_perbaikan', fotoProgressFile);
        }

        setSaving(true);
        try {
            await api.patch(`/aset/perbaikan/${selectedTicket.id}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (currentStatus === 'belum_mulai') {
                toast.success(`Teknisi "${updateForm.teknisi}" berhasil ditugaskan. Status tiket otomatis beralih ke Inspeksi.`);
            } else if (currentStatus === 'inspeksi') {
                toast.success(`Hasil inspeksi tersimpan. Status tiket otomatis beralih ke Dalam Proses pengerjaan servis.`);
            } else {
                toast.success(`Catatan progres tiket ${selectedTicket.nomor_tiket} berhasil ditambahkan.`);
            }

            setIsUpdateModalOpen(false);
            loadTickets();
        } catch (err) {
            const dataErr = err.response?.data;
            const msg = dataErr && typeof dataErr === 'object' ? Object.values(dataErr)[0] : 'Gagal menyimpan update perbaikan.';
            toast.error(typeof msg === 'string' ? msg : 'Gagal menyimpan update perbaikan.');
        } finally {
            setSaving(false);
        }
    };

    // Buka Modal Dedicated Finish Perbaikan
    const handleOpenFinish = (ticket) => {
        if (!isAsetAdmin) {
            toast.error('Hanya pengguna dengan akses utama Manajemen Aset yang berhak menyelesaikan perbaikan.');
            return;
        }
        setFinishTicket(ticket);
        const biayaAwal = Number(ticket.biaya_perbaikan) || Number(ticket.estimasi_biaya) || 0;
        setFinishForm({
            kondisi_ringkas: '',
            status_kelayakan_baru: ticket.status_kelayakan || 'A',
            biaya_riil: biayaAwal,
            catatan_penutupan: '',
            tanggal_selesai: ticket.tanggal_selesai || new Date().toISOString().split('T')[0],
        });
        setFinishBiayaDisplay(biayaAwal > 0 ? formatRupiahDisplay(biayaAwal) : '');
        setFinishFotoFile(null);
        setFinishFotoPreview(ticket.foto_setelah_perbaikan || null);
    };

    const handleFinishFotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFinishFotoFile(file);
            setFinishFotoPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveFinishFoto = (e) => {
        e.stopPropagation();
        setFinishFotoFile(null);
        if (finishFotoPreview) URL.revokeObjectURL(finishFotoPreview);
        setFinishFotoPreview(null);
        if (finishFotoInputRef.current) finishFotoInputRef.current.value = '';
    };

    // Submit Finish Perbaikan
    const handleSubmitFinish = async (e) => {
        e.preventDefault();
        if (!finishForm.kondisi_ringkas.trim()) {
            toast.error('Wajib mengisi Kondisi Setelah Perbaikan sebelum menyelesaikan tiket.');
            return;
        }

        setFinishing(true);
        try {
            const formData = new FormData();
            formData.append('kondisi_setelah_perbaikan', 'berfungsi_normal');
            formData.append('kondisi_ringkas', finishForm.kondisi_ringkas.trim());
            formData.append('status_kelayakan_baru', finishForm.status_kelayakan_baru);
            formData.append('biaya_riil', finishForm.biaya_riil || 0);
            formData.append('catatan_penutupan', finishForm.catatan_penutupan);
            formData.append('tanggal_selesai', finishForm.tanggal_selesai);
            if (finishFotoFile) {
                formData.append('foto_setelah_perbaikan', finishFotoFile);
            }

            await api.post(`/aset/perbaikan/${finishTicket.id}/finish/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success(`Tiket ${finishTicket.nomor_tiket} tuntas diselesaikan. Status kelayakan aset berhasil diperbarui.`);
            setFinishTicket(null);
            loadTickets();
        } catch (err) {
            const dataErr = err.response?.data;
            const msg = dataErr && typeof dataErr === 'object' ? Object.values(dataErr)[0] : 'Gagal menyelesaikan tiket perbaikan.';
            toast.error(typeof msg === 'string' ? msg : 'Gagal menyelesaikan tiket perbaikan.');
        } finally {
            setFinishing(false);
        }
    };

    // KPI Counters
    const kpiSummary = useMemo(() => {
        const total = totalCount;
        const belumMulai = perbaikanList.filter(p => p.status_perbaikan === 'belum_mulai').length;
        const inspeksi = perbaikanList.filter(p => p.status_perbaikan === 'inspeksi').length;
        const dalamProses = perbaikanList.filter(p => p.status_perbaikan === 'dalam_proses').length;
        const selesai = perbaikanList.filter(p => p.status_perbaikan === 'selesai').length;
        return { total, belumMulai, inspeksi, dalamProses, selesai };
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
                    <h1>Monitoring Kerusakan &amp; Tindak Lanjut Perbaikan</h1>
                    <p className="aset-subtitle">
                        Panel monitoring tiket laporan kerusakan aset, progress penanganan teknisi, dan evaluasi hasil perbaikan alkes &amp; fasilitas &bull; {totalCount} total tiket tercatat
                    </p>
                </div>
            </div>

            {/* Stat-Bar KPI Ringkasan */}
            <div className="aset-stat-bar is-five">
                <div className="aset-stat-cell">
                    <div className="aset-stat-label">Total Laporan</div>
                    <div className="aset-stat-val">{kpiSummary.total}</div>
                    <div className="aset-stat-sub">Seluruh unit RS</div>
                </div>

                <div className="aset-stat-cell">
                    <div className="aset-stat-label">Belum Mulai</div>
                    <div className="aset-stat-val is-danger">{kpiSummary.belumMulai}</div>
                    <div className="aset-stat-sub">Menunggu teknisi</div>
                </div>

                <div className="aset-stat-cell">
                    <div className="aset-stat-label">Inspeksi Teknisi</div>
                    <div className="aset-stat-val is-info">{kpiSummary.inspeksi}</div>
                    <div className="aset-stat-sub">Pengecekan alkes</div>
                </div>

                <div className="aset-stat-cell">
                    <div className="aset-stat-label">Dalam Proses</div>
                    <div className="aset-stat-val is-warning">{kpiSummary.dalamProses}</div>
                    <div className="aset-stat-sub">Servis &amp; sparepart</div>
                </div>

                <div className="aset-stat-cell">
                    <div className="aset-stat-label">Selesai</div>
                    <div className="aset-stat-val is-success">{kpiSummary.selesai}</div>
                    <div className="aset-stat-sub">Tuntas diperbaiki</div>
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
                    <option value="inspeksi">Inspeksi / Penugasan Teknisi</option>
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

                <button type="submit" className="btn-aset btn-aset-secondary">
                    Terapkan Filter
                </button>
            </form>

            {/* Tabel Tiket Kerusakan & Perbaikan */}
            <div className="aset-table-wrapper aset-table-borderless">
                <table className="aset-table aset-table-stripe">
                    <thead>
                        <tr>
                            <th style={{ width: '125px' }}>No. Tiket</th>
                            <th style={{ width: '110px' }}>Tgl Lapor</th>
                            <th>Nama Barang &amp; Kode</th>
                            <th>Unit &amp; Lokasi</th>
                            <th style={{ width: '110px' }}>Tingkat</th>
                            <th>Rincian Kerusakan</th>
                            <th style={{ width: '135px' }}>Status</th>
                            <th style={{ textAlign: 'right', width: '96px' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--gdg-muted)' }}>
                                    Memuat daftar tiket kerusakan &amp; perbaikan...
                                </td>
                            </tr>
                        ) : perbaikanList.length === 0 ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '35px', color: 'var(--gdg-muted)' }}>
                                    Belum ada laporan kerusakan atau tidak ada data yang cocok dengan filter.
                                </td>
                            </tr>
                        ) : (
                            perbaikanList.map(item => {
                                const tingkatTone = item.tingkat_kerusakan === 'berat'
                                    ? 'rose'
                                    : item.tingkat_kerusakan === 'sedang'
                                        ? 'amber'
                                        : 'sky';
                                const statusTone = item.status_perbaikan === 'selesai'
                                    ? 'emerald'
                                    : item.status_perbaikan === 'dalam_proses'
                                        ? 'amber'
                                        : item.status_perbaikan === 'inspeksi'
                                            ? 'sky'
                                            : 'rose';

                                return (
                                    <tr key={item.id}>
                                        <td>
                                            <span className="aset-code-mono">
                                                {item.nomor_tiket}
                                            </span>
                                        </td>
                                        <td className="aset-num-cell" style={{ fontSize: '12px', color: 'var(--gdg-muted)' }}>
                                            <div>{item.tanggal_laporan}</div>
                                            {item.tanggal_kerusakan && item.tanggal_kerusakan !== item.tanggal_laporan && (
                                                <div className="aset-cell-sub">
                                                    Rusak: {item.tanggal_kerusakan}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="aset-cell-title">
                                                {item.aset_nama} {item.aset_merk ? `(${item.aset_merk})` : ''}
                                            </div>
                                            <div className="aset-cell-sub" style={{ fontFamily: 'monospace' }}>
                                                {item.aset_kode}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="aset-cell-title" style={{ fontWeight: 500 }}>
                                                {item.unit_nama || '-'}
                                            </div>
                                            <div className="aset-cell-sub">
                                                {item.ruangan_nama || item.lokasi_teks || '-'}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`aset-status-text ${tingkatTone}`}>
                                                <span className="aset-status-dot" />
                                                <span>{item.tingkat_kerusakan_label}</span>
                                            </span>
                                        </td>
                                        <td style={{ maxWidth: '240px', fontSize: '12.5px' }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--gdg-text)' }} title={item.rincian_kerusakan}>
                                                {item.rincian_kerusakan}
                                            </div>
                                            {item.pelapor_nama && (
                                                <div className="aset-cell-sub">
                                                    Pelapor: {item.pelapor_nama}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`aset-status-text ${statusTone}`}>
                                                <span className="aset-status-dot" />
                                                <span>{item.status_perbaikan_label}</span>
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="aset-icon-action"
                                                    onClick={() => setDetailTicket(item)}
                                                    title="Lihat Detail &amp; Riwayat Tiket"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                {isAsetAdmin && (
                                                    <>
                                                        {/* Tahap 2: Tugaskan Teknisi */}
                                                        {item.status_perbaikan === 'belum_mulai' && (
                                                            <button
                                                                type="button"
                                                                className="aset-icon-action is-info"
                                                                onClick={() => handleOpenUpdate(item)}
                                                                title="Tahap 2: Tugaskan Teknisi &amp; Mulai Inspeksi"
                                                            >
                                                                <UserCheck size={14} />
                                                            </button>
                                                        )}

                                                        {/* Tahap 3: Input Hasil Inspeksi & Mulai Servis */}
                                                        {item.status_perbaikan === 'inspeksi' && (
                                                            <button
                                                                type="button"
                                                                className="aset-icon-action is-warning"
                                                                onClick={() => handleOpenUpdate(item)}
                                                                title="Tahap 3: Input Hasil Inspeksi &amp; Mulai Servis"
                                                            >
                                                                <Wrench size={14} />
                                                            </button>
                                                        )}

                                                        {/* Tahap 3 (Progres) & Tahap 4 (Finish) */}
                                                        {item.status_perbaikan === 'dalam_proses' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="aset-icon-action is-info"
                                                                    onClick={() => handleOpenUpdate(item)}
                                                                    title="Update Catatan Progres Pengerjaan"
                                                                >
                                                                    <Edit3 size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="aset-icon-action is-success"
                                                                    onClick={() => handleOpenFinish(item)}
                                                                    title="Tahap 4: Selesaikan Perbaikan (Finish)"
                                                                >
                                                                    <CheckCircle2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
                <SimplePagination
                    className="aset-pagination"
                    page={page}
                    pageSize={pageSize}
                    total={totalCount}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            )}

            {/* MODAL DETAIL TIKET PERBAIKAN */}
            {detailTicket && createPortal(
                <div className="aset-modal-overlay" onClick={() => setDetailTicket(null)}>
                    <div className="aset-modal-content" style={{ maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span className="aset-modal-title-text">
                                    Detail Tiket: {detailTicket.nomor_tiket}
                                </span>
                                <span className={`aset-status-text ${detailTicket.status_perbaikan === 'selesai' ? 'emerald' : detailTicket.status_perbaikan === 'dalam_proses' ? 'amber' : detailTicket.status_perbaikan === 'inspeksi' ? 'sky' : 'rose'}`}>
                                    <span className="aset-status-dot" />
                                    <span>{detailTicket.status_perbaikan_label}</span>
                                </span>
                            </div>
                            <button className="aset-modal-close" onClick={() => setDetailTicket(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="aset-modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                            {/* Stepper Pipeline Alur Perbaikan (Datar menyatu dengan permukaan modal) */}
                            <RepairStepper currentStatus={detailTicket.status_perbaikan} />

                            {/* Identitas Aset */}
                            <div className="aset-detail-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                            {detailTicket.aset_nama} {detailTicket.aset_merk ? `(${detailTicket.aset_merk})` : ''}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--gdg-muted)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 500, marginTop: '2px' }}>
                                            {detailTicket.aset_kode}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gdg-text)' }}>{detailTicket.unit_nama || '-'}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--gdg-muted)', marginTop: '2px' }}>
                                            {detailTicket.ruangan_nama || detailTicket.lokasi_teks || '-'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: 'var(--gdg-muted)' }}>Status Kelayakan Fisik Aset</span>
                                    <span className={`aset-status-text ${detailTicket.status_kelayakan === 'A' ? 'emerald' : detailTicket.status_kelayakan === 'B' ? 'sky' : detailTicket.status_kelayakan === 'C' ? 'amber' : detailTicket.status_kelayakan === 'D' ? 'orange' : 'rose'}`}>
                                        <span className="aset-status-dot" />
                                        <span>{detailTicket.status_kelayakan_label || `Grade ${detailTicket.status_kelayakan || 'A'}`}</span>
                                    </span>
                                </div>
                            </div>

                            {/* Section 1: Data Laporan Kerusakan */}
                            <div className="aset-detail-section">
                                <div className="aset-detail-section-title">Data Laporan Kerusakan</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <div className="aset-detail-label">Tanggal Laporan</div>
                                        <div className="aset-detail-value">{detailTicket.tanggal_laporan || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Tanggal Kejadian Rusak</div>
                                        <div className="aset-detail-value">{detailTicket.tanggal_kerusakan || detailTicket.tanggal_laporan || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Pelapor</div>
                                        <div className="aset-detail-value">{detailTicket.pelapor_nama || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Tingkat Kerusakan</div>
                                        <span className={`aset-status-text ${detailTicket.tingkat_kerusakan === 'berat' ? 'rose' : detailTicket.tingkat_kerusakan === 'sedang' ? 'amber' : 'sky'}`}>
                                            <span className="aset-status-dot" />
                                            <span>{detailTicket.tingkat_kerusakan_label}</span>
                                        </span>
                                    </div>
                                </div>

                                <div style={{ marginTop: '12px' }}>
                                    <div className="aset-detail-label">Rincian / Gejala Kerusakan</div>
                                    <div className="aset-detail-prose">
                                        {detailTicket.rincian_kerusakan}
                                    </div>
                                </div>

                                {detailTicket.foto_kerusakan && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div className="aset-detail-label">Foto Bukti Kerusakan</div>
                                        <a href={resolveMediaUrl(detailTicket.foto_kerusakan)} target="_blank" rel="noreferrer">
                                            <img
                                                src={resolveMediaUrl(detailTicket.foto_kerusakan)}
                                                alt="Foto Bukti Kerusakan"
                                                style={{ maxHeight: '120px', borderRadius: '6px', border: '1px solid var(--gdg-border)', objectFit: 'cover', marginTop: '2px' }}
                                            />
                                        </a>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Hasil Penanganan & Tindak Lanjut Servis */}
                            <div className="aset-detail-section">
                                <div className="aset-detail-section-title">Hasil Penanganan &amp; Tindak Lanjut Servis</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <div className="aset-detail-label">Teknisi Penanggung Jawab</div>
                                        <div className="aset-detail-value">{detailTicket.teknisi || 'Belum ditugaskan'}</div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Tanggal Selesai Penanganan</div>
                                        <div className="aset-detail-value">{detailTicket.tanggal_selesai || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Biaya Perbaikan</div>
                                        <div className={`aset-detail-value aset-num-cell ${Number(detailTicket.biaya_perbaikan) > 0 ? 'is-success' : ''}`}>
                                            {formatRp(detailTicket.biaya_perbaikan)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="aset-detail-label">Kondisi Pasca Servis</div>
                                        {detailTicket.kondisi_setelah_perbaikan ? (
                                            <span className={`aset-status-text ${detailTicket.kondisi_setelah_perbaikan === 'berfungsi_normal' ? 'emerald' : 'rose'}`}>
                                                <span className="aset-status-dot" />
                                                <span>{detailTicket.kondisi_setelah_perbaikan_label}</span>
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '12.5px', color: 'var(--gdg-muted)' }}>Belum dievaluasi</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginTop: '12px' }}>
                                    <div className="aset-detail-label">Tindak Lanjut &amp; Catatan Teknisi</div>
                                    <div className="aset-detail-prose">
                                        {detailTicket.tindak_lanjut || <span style={{ color: 'var(--gdg-muted)' }}>Belum ada catatan tindak lanjut dari teknisi.</span>}
                                    </div>
                                </div>

                                {detailTicket.tindak_lanjut_berikutnya && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div className="aset-detail-label">Tindak Lanjut Lanjutan (RTL Masih Bermasalah)</div>
                                        <div className="aset-detail-rtl">
                                            {detailTicket.tindak_lanjut_berikutnya}
                                        </div>
                                    </div>
                                )}

                                {detailTicket.foto_setelah_perbaikan && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div className="aset-detail-label">Foto Bukti Setelah Perbaikan</div>
                                        <a href={resolveMediaUrl(detailTicket.foto_setelah_perbaikan)} target="_blank" rel="noreferrer">
                                            <img
                                                src={resolveMediaUrl(detailTicket.foto_setelah_perbaikan)}
                                                alt="Foto Bukti Setelah Perbaikan"
                                                style={{ maxHeight: '120px', borderRadius: '6px', border: '1px solid var(--gdg-border)', objectFit: 'cover', marginTop: '2px' }}
                                            />
                                        </a>
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Riwayat Log Kronologis Penanganan Perbaikan */}
                            {detailTicket.log_list && detailTicket.log_list.length > 0 && (
                                <div className="aset-detail-section">
                                    <div className="aset-detail-section-title">
                                        Riwayat Log Kronologis Penanganan ({detailTicket.log_list.length} Catatan)
                                    </div>
                                    <div className="aset-timeline aset-timeline-flat">
                                        {detailTicket.log_list.map((logItem, idx) => (
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
                                                        {Number(logItem.estimasi_biaya) > 0 && <span>Est: {formatRp(logItem.estimasi_biaya)}</span>}
                                                        {Number(logItem.biaya_riil) > 0 && <span>Biaya Riil: {formatRp(logItem.biaya_riil)}</span>}
                                                        <span>Dicatat oleh: {logItem.dibuat_oleh_nama}</span>
                                                    </div>
                                                    {logItem.foto && (
                                                        <div style={{ marginTop: '8px' }}>
                                                            <a href={resolveMediaUrl(logItem.foto)} target="_blank" rel="noreferrer">
                                                                <img
                                                                    src={resolveMediaUrl(logItem.foto)}
                                                                    alt="Lampiran Log"
                                                                    style={{ maxHeight: '72px', borderRadius: '6px', border: '1px solid var(--gdg-border)' }}
                                                                />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="aset-modal-footer">
                            <button
                                type="button"
                                className="btn-aset btn-aset-secondary"
                                onClick={() => setDetailTicket(null)}
                            >
                                Tutup
                            </button>
                            {isAsetAdmin && detailTicket.status_perbaikan !== 'selesai' && (
                                <>
                                    {detailTicket.status_perbaikan === 'belum_mulai' && (
                                        <button
                                            type="button"
                                            className="btn-aset btn-aset-primary"
                                            onClick={() => {
                                                const t = detailTicket;
                                                setDetailTicket(null);
                                                handleOpenUpdate(t);
                                            }}
                                        >
                                            <UserCheck size={14} /> Tahap 2: Tugaskan Teknisi
                                        </button>
                                    )}
                                    {detailTicket.status_perbaikan === 'inspeksi' && (
                                        <button
                                            type="button"
                                            className="btn-aset btn-aset-primary"
                                            onClick={() => {
                                                const t = detailTicket;
                                                setDetailTicket(null);
                                                handleOpenUpdate(t);
                                            }}
                                        >
                                            <Wrench size={14} /> Tahap 3: Input Hasil Inspeksi &amp; Mulai Servis
                                        </button>
                                    )}
                                    {detailTicket.status_perbaikan === 'dalam_proses' && (
                                        <>
                                            <button
                                                type="button"
                                                className="btn-aset btn-aset-secondary"
                                                onClick={() => {
                                                    const t = detailTicket;
                                                    setDetailTicket(null);
                                                    handleOpenUpdate(t);
                                                }}
                                            >
                                                <Edit3 size={14} /> Update Progres
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-aset btn-aset-primary"
                                                onClick={() => {
                                                    const t = detailTicket;
                                                    setDetailTicket(null);
                                                    handleOpenFinish(t);
                                                }}
                                            >
                                                <CheckCircle2 size={14} /> Tahap 4: Selesaikan (Finish)
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL UPDATE PROGRES & TINDAK LANJUT PERBAIKAN (ALUR TAHAPAN OTOMATIS) */}
            {isAsetAdmin && isUpdateModalOpen && selectedTicket && createPortal(
                <div className="aset-modal-overlay" onClick={() => setIsUpdateModalOpen(false)}>
                    <div className="aset-modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {selectedTicket.status_perbaikan === 'belum_mulai' ? (
                                    <span className="aset-modal-title-text">
                                        Tahap 2: Penugasan Teknisi &amp; Mulai Inspeksi
                                    </span>
                                ) : selectedTicket.status_perbaikan === 'inspeksi' ? (
                                    <span className="aset-modal-title-text">
                                        Tahap 3: Input Hasil Inspeksi &amp; Mulai Servis
                                    </span>
                                ) : (
                                    <span className="aset-modal-title-text">
                                        Update Catatan Progres Servis
                                    </span>
                                )}
                                <span style={{ fontSize: '11.5px', color: 'var(--gdg-muted)', fontFamily: 'monospace' }}>
                                    ({selectedTicket.nomor_tiket})
                                </span>
                            </div>
                            <button className="aset-modal-close" onClick={() => setIsUpdateModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitUpdate}>
                            <div className="aset-modal-body">
                                {/* Stepper Pipeline Alur Perbaikan (Mirip Petty Cash) */}
                                <RepairStepper
                                    currentStatus={selectedTicket.status_perbaikan}
                                    activeTargetStep={
                                        selectedTicket.status_perbaikan === 'belum_mulai' ? 1 :
                                        selectedTicket.status_perbaikan === 'inspeksi' ? 2 : 2
                                    }
                                />

                                {/* Shortcut Selesaikan Perbaikan (Khusus jika sudah dalam_proses) */}
                                {selectedTicket.status_perbaikan === 'dalam_proses' && (
                                    <div className="aset-detail-section" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                Pengerjaan Servis Sudah Selesai Tuntas?
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--gdg-muted)', marginTop: '2px' }}>
                                                Klik untuk input evaluasi kondisi, biaya aktual riil, dan pembaruan kelayakan fisik.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-aset btn-aset-primary"
                                            style={{ height: '32px', minHeight: '32px', padding: '0 12px', fontSize: '12px' }}
                                            onClick={() => {
                                                const t = selectedTicket;
                                                setIsUpdateModalOpen(false);
                                                handleOpenFinish(t);
                                            }}
                                        >
                                            <CheckCircle2 size={13} /> Selesaikan Tiket (Finish)
                                        </button>
                                    </div>
                                )}

                                {/* Preview Aset & Laporan */}
                                <div className="aset-detail-section">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                {selectedTicket.aset_nama} {selectedTicket.aset_merk ? `(${selectedTicket.aset_merk})` : ''}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--gdg-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ color: 'var(--gdg-text)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{selectedTicket.aset_kode}</span>
                                                <span>&bull;</span>
                                                <span>Unit: {selectedTicket.unit_nama || '-'}</span>
                                                <span>&bull;</span>
                                                <span>Lokasi: {selectedTicket.lokasi_teks || selectedTicket.ruangan_nama || '-'}</span>
                                            </div>
                                        </div>
                                        <span className={`aset-status-text ${selectedTicket.tingkat_kerusakan === 'berat' ? 'rose' : selectedTicket.tingkat_kerusakan === 'sedang' ? 'amber' : 'sky'}`}>
                                            <span className="aset-status-dot" />
                                            <span>Kerusakan {selectedTicket.tingkat_kerusakan_label}</span>
                                        </span>
                                    </div>
                                    <div style={{ marginTop: '10px' }}>
                                        <div className="aset-detail-label">Keluhan Kerusakan</div>
                                        <div className="aset-detail-prose">{selectedTicket.rincian_kerusakan}</div>
                                    </div>
                                </div>

                                {/* FORM TAHAP 2: PENUGASAN TEKNISI & MULAI INSPEKSI */}
                                {selectedTicket.status_perbaikan === 'belum_mulai' && (
                                    <>
                                        <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                            <label className="aset-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Nama Teknisi / Vendor Rekanan *</span>
                                                <span style={{ fontSize: '10.5px', color: '#38bdf8' }}>Status otomatis beralih ke Inspeksi</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="aset-form-input"
                                                placeholder="Contoh: Teknisi IPSRS (Bpk. Joko) / Vendor PT Mindray"
                                                value={updateForm.teknisi}
                                                onChange={e => setUpdateForm({ ...updateForm, teknisi: e.target.value })}
                                                required
                                                autoFocus
                                            />
                                        </div>

                                        <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                            <label className="aset-form-label">Arahan / Catatan Awal untuk Teknisi (Opsional)</label>
                                            <textarea
                                                className="aset-form-textarea"
                                                rows="2"
                                                placeholder="Tuliskan arahan pengecekan alkes/aset (contoh: tolong cek power supply dan kelistrikan)..."
                                                value={updateForm.tindak_lanjut}
                                                onChange={e => setUpdateForm({ ...updateForm, tindak_lanjut: e.target.value })}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* FORM TAHAP 3: INPUT HASIL INSPEKSI & MULAI SERVIS */}
                                {selectedTicket.status_perbaikan === 'inspeksi' && (
                                    <>
                                        <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                            <label className="aset-form-label">Nama Teknisi Penanggung Jawab *</label>
                                            <input
                                                type="text"
                                                className="aset-form-input"
                                                placeholder="Nama Teknisi"
                                                value={updateForm.teknisi}
                                                onChange={e => setUpdateForm({ ...updateForm, teknisi: e.target.value })}
                                                required
                                            />
                                        </div>

                                        <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                            <label className="aset-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Hasil Inspeksi / Diagnosa Kerusakan *</span>
                                                <span style={{ fontSize: '10.5px', color: '#fbbf24' }}>Status otomatis beralih ke Dalam Proses</span>
                                            </label>
                                            <textarea
                                                className="aset-form-textarea"
                                                rows="2"
                                                placeholder="Hasil diagnosa kerusakan oleh teknisi (contoh: Fuse power supply putus, pipa pendingin bocor)..."
                                                value={updateForm.hasil_inspeksi}
                                                onChange={e => setUpdateForm({ ...updateForm, hasil_inspeksi: e.target.value })}
                                                required
                                                autoFocus
                                            />
                                        </div>

                                        <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                            <div className="aset-form-group" style={{ margin: 0 }}>
                                                <label className="aset-form-label">Estimasi Biaya Perbaikan (Rp) *</label>
                                                <input
                                                    type="text"
                                                    className="aset-form-input"
                                                    placeholder="Rp 0"
                                                    value={estimasiBiayaDisplay}
                                                    onChange={handleEstimasiBiayaChange}
                                                    required
                                                />
                                                <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
                                                    Isi Rp 0 jika non-biaya / garansi vendor
                                                </span>
                                            </div>

                                            <div className="aset-form-group" style={{ margin: 0 }}>
                                                <label className="aset-form-label">Rencana Tindak Lanjut Servis *</label>
                                                <input
                                                    type="text"
                                                    className="aset-form-input"
                                                    placeholder="Contoh: Pengelasan pipa &amp; pengisian freon R410A"
                                                    value={updateForm.tindak_lanjut}
                                                    onChange={e => setUpdateForm({ ...updateForm, tindak_lanjut: e.target.value })}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* FORM TAHAP 3 (BERJALAN): UPDATE CATATAN PROGRES */}
                                {selectedTicket.status_perbaikan === 'dalam_proses' && (
                                    <>
                                        <div className="aset-detail-section">
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                                                <div>
                                                    <div className="aset-detail-label">Teknisi</div>
                                                    <div className="aset-detail-value">{selectedTicket.teknisi || '-'}</div>
                                                </div>
                                                <div>
                                                    <div className="aset-detail-label">Estimasi Biaya</div>
                                                    <div className="aset-detail-value">{formatRp(selectedTicket.estimasi_biaya)}</div>
                                                </div>
                                            </div>
                                            {selectedTicket.hasil_inspeksi && (
                                                <div style={{ marginTop: '10px' }}>
                                                    <div className="aset-detail-label">Diagnosa Inspeksi</div>
                                                    <div className="aset-detail-prose">{selectedTicket.hasil_inspeksi}</div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                            <label className="aset-form-label">Catatan Progres Pengerjaan Terkini *</label>
                                            <textarea
                                                className="aset-form-textarea"
                                                rows="3"
                                                placeholder="Tuliskan perkembangan perbaikan hari ini, kendala lapangan, atau update kedatangan suku cadang..."
                                                value={updateForm.catatan_progres}
                                                onChange={e => setUpdateForm({ ...updateForm, catatan_progres: e.target.value })}
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Upload Foto Bukti Progress / Hasil Inspeksi */}
                                <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                    <label className="aset-form-label">Foto Bukti / Dokumentasi (Opsional)</label>
                                    <input
                                        type="file"
                                        ref={fotoProgressInputRef}
                                        accept="image/*"
                                        onChange={handleFotoProgressChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        className="aset-file-dropzone"
                                        onClick={() => fotoProgressInputRef.current?.click()}
                                        style={{ height: 'auto', padding: '10px 14px' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            <Camera size={16} color="#818cf8" />
                                            <span style={{ fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {fotoProgressFile ? fotoProgressFile.name : (fotoProgressPreview ? 'Foto Bukti Terlampir' : 'Upload Foto Dokumentasi Progres...')}
                                            </span>
                                        </div>
                                        <span className="aset-file-dropzone-badge">
                                            Pilih Foto
                                        </span>
                                    </div>

                                    {fotoProgressPreview && (
                                        <div className="aset-file-preview-card" style={{ padding: '8px 12px' }}>
                                            <img
                                                src={resolveMediaUrl(fotoProgressPreview)}
                                                alt="Preview Progres"
                                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600 }}>
                                                    {fotoProgressFile?.name || 'Dokumentasi Progres'}
                                                </div>
                                                <div style={{ fontSize: '10.5px', opacity: 0.75 }}>
                                                    {fotoProgressFile ? `${(fotoProgressFile.size / 1024).toFixed(0)} KB` : ''}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFotoProgress}
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
                                    {saving ? (
                                        'Menyimpan...'
                                    ) : selectedTicket.status_perbaikan === 'belum_mulai' ? (
                                        <><UserCheck size={14} /> Tugaskan Teknisi (Mulai Inspeksi)</>
                                    ) : selectedTicket.status_perbaikan === 'inspeksi' ? (
                                        <><Wrench size={14} /> Mulai Pengerjaan Servis</>
                                    ) : (
                                        <><Save size={14} /> Simpan Catatan Progres</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL DEDICATED FINISH / SELESAIKAN PERBAIKAN */}
            {isAsetAdmin && finishTicket && createPortal(
                <div className="aset-modal-overlay" onClick={() => setFinishTicket(null)}>
                    <div className="aset-modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <span className="aset-modal-title-text">
                                Selesaikan Perbaikan: {finishTicket.nomor_tiket}
                            </span>
                            <button className="aset-modal-close" onClick={() => setFinishTicket(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitFinish}>
                            <div className="aset-modal-body">
                                {/* Stepper Pipeline Alur Perbaikan (Tahap 4 Aktif) */}
                                <RepairStepper currentStatus={finishTicket.status_perbaikan} activeTargetStep={3} />

                                {/* Info Aset Singkat */}
                                <div className="aset-detail-section">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                {finishTicket.aset_nama} {finishTicket.aset_merk ? `(${finishTicket.aset_merk})` : ''}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--gdg-muted)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 500, marginTop: '2px' }}>
                                                {finishTicket.aset_kode} &bull; {finishTicket.unit_nama || '-'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div className="aset-detail-label">Kelayakan Fisik Saat Ini</div>
                                            <span className={`aset-status-text ${finishTicket.status_kelayakan === 'A' ? 'emerald' : finishTicket.status_kelayakan === 'B' ? 'sky' : finishTicket.status_kelayakan === 'C' ? 'amber' : finishTicket.status_kelayakan === 'D' ? 'orange' : 'rose'}`}>
                                                <span className="aset-status-dot" />
                                                <span>Grade {finishTicket.status_kelayakan || 'A'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 1. Input Kondisi Setelah Perbaikan */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Kondisi Setelah Perbaikan *</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Contoh: Unit menyala normal, suhu dingin stabil, fungsi normal..."
                                        value={finishForm.kondisi_ringkas}
                                        onChange={e => setFinishForm({ ...finishForm, kondisi_ringkas: e.target.value })}
                                        required
                                    />
                                </div>

                                {/* 2. Update Penetapan Status Kelayakan Fisik Aset Pasca Servis */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Update Penetapan Status Kelayakan Fisik Aset *</span>
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Status Lama: Grade {finishTicket.status_kelayakan || 'A'}</span>
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                                        {[
                                            { code: 'A', label: 'Grade A', desc: '90-100%', color: '#10b981' },
                                            { code: 'B', label: 'Grade B', desc: '70-89%', color: '#38bdf8' },
                                            { code: 'C', label: 'Grade C', desc: '50-69%', color: '#eab308' },
                                            { code: 'D', label: 'Grade D', desc: '30-49%', color: '#f97316' },
                                            { code: 'E', label: 'Grade E', desc: '<30%', color: '#ef4444' },
                                        ].map(gr => {
                                            const isSel = finishForm.status_kelayakan_baru === gr.code;
                                            return (
                                                <div
                                                    key={gr.code}
                                                    onClick={() => setFinishForm({ ...finishForm, status_kelayakan_baru: gr.code })}
                                                    className={`aset-choice-card ${isSel ? `selected grade-card-${gr.code}` : ''}`}
                                                    style={{ textAlign: 'center', padding: '9px 4px', position: 'relative' }}
                                                    role="button"
                                                    aria-pressed={isSel}
                                                    tabIndex={0}
                                                >
                                                    {isSel && (
                                                        <CheckCircle2
                                                            size={13}
                                                            color={gr.color}
                                                            style={{ position: 'absolute', top: '5px', right: '5px' }}
                                                        />
                                                    )}
                                                    <span className={`badge-kelayakan grade-${gr.code}`} style={{ fontSize: '11px', padding: '2px 6px', display: 'inline-block' }}>
                                                        {gr.label}
                                                    </span>
                                                    <div style={{ fontSize: '9.5px', opacity: isSel ? 0.95 : 0.7, fontWeight: isSel ? 600 : 400, marginTop: '4px' }}>{gr.desc}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 3. Biaya Perbaikan Riil & Tanggal Selesai */}
                                <div className="aset-form-grid-2" style={{ marginBottom: '14px' }}>
                                    <div className="aset-form-group" style={{ margin: 0 }}>
                                        <label className="aset-form-label">
                                            Biaya Perbaikan Riil (Rp) *
                                        </label>
                                        <input
                                            type="text"
                                            className="aset-form-input"
                                            placeholder="Rp 0"
                                            value={finishBiayaDisplay}
                                            onChange={handleFinishBiayaChange}
                                            required
                                        />
                                        {Number(finishTicket.estimasi_biaya) > 0 && (
                                            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                                                Estimasi sebelumnya: {formatRp(finishTicket.estimasi_biaya)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="aset-form-group" style={{ margin: 0 }}>
                                        <label className="aset-form-label">Tanggal Selesai Penanganan *</label>
                                        <DateField
                                            value={finishForm.tanggal_selesai}
                                            onChange={val => setFinishForm({ ...finishForm, tanggal_selesai: val })}
                                            placeholder="Pilih tanggal selesai..."
                                        />
                                    </div>
                                </div>

                                {/* 4. Catatan Penutupan */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Catatan Penutupan Tiket / Ringkasan Pekerjaan</label>
                                    <textarea
                                        className="aset-form-textarea"
                                        rows="2"
                                        placeholder="Catatan penutupan teknisi (contoh: Servis modul tuntas, komponen IC diganti baru, alkes dites menyala dan berfungsi normal)..."
                                        value={finishForm.catatan_penutupan}
                                        onChange={e => setFinishForm({ ...finishForm, catatan_penutupan: e.target.value })}
                                    />
                                </div>

                                {/* 5. Foto Bukti Setelah Perbaikan */}
                                <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                    <label className="aset-form-label">Foto Bukti Setelah Perbaikan (Opsional)</label>
                                    <input
                                        type="file"
                                        ref={finishFotoInputRef}
                                        accept="image/*"
                                        onChange={handleFinishFotoChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        className="aset-file-dropzone"
                                        onClick={() => finishFotoInputRef.current?.click()}
                                        style={{ height: 'auto', padding: '10px 14px' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            <Camera size={16} color="#34d399" />
                                            <span style={{ fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {finishFotoFile ? finishFotoFile.name : (finishFotoPreview ? 'Foto Bukti Terlampir' : 'Upload Foto Bukti Setelah Perbaikan (Klik di sini)...')}
                                            </span>
                                        </div>
                                        <span className="aset-file-dropzone-badge">
                                            Pilih Foto
                                        </span>
                                    </div>

                                    {finishFotoPreview && (
                                        <div className="aset-file-preview-card" style={{ padding: '8px 12px' }}>
                                            <img
                                                src={resolveMediaUrl(finishFotoPreview)}
                                                alt="Preview Bukti Setelah Perbaikan"
                                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>
                                                    Foto Bukti Pasca Servis
                                                </div>
                                                <div style={{ fontSize: '10.5px', opacity: 0.75 }}>
                                                    {finishFotoFile ? `${(finishFotoFile.size / 1024).toFixed(0)} KB` : 'Foto tersimpan'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFinishFoto}
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
                                    onClick={() => setFinishTicket(null)}
                                    disabled={finishing}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="btn-aset btn-aset-primary"
                                    disabled={finishing}
                                >
                                    {finishing ? (
                                        <><Save size={14} className="aset-spin" /> Menyimpan...</>
                                    ) : (
                                        <><CheckCircle2 size={14} /> Selesaikan Tiket &amp; Update Kelayakan</>
                                    )}
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

