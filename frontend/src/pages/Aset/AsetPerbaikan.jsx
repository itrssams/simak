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
    Trash2,
    Check,
    UserCheck,
    Play
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
    const [filterKondisi, setFilterKondisi] = useState('');

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
        kondisi_setelah_perbaikan: 'berfungsi_normal',
        status_kelayakan_baru: 'A',
        biaya_riil: 0,
        tindak_lanjut_berikutnya: '',
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
            kondisi_setelah_perbaikan: ticket.kondisi_setelah_perbaikan || 'berfungsi_normal',
            status_kelayakan_baru: ticket.status_kelayakan || 'A',
            biaya_riil: biayaAwal,
            tindak_lanjut_berikutnya: ticket.tindak_lanjut_berikutnya || '',
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
        if (finishForm.kondisi_setelah_perbaikan === 'masih_bermasalah' && !finishForm.tindak_lanjut_berikutnya.trim()) {
            toast.error('Wajib mengisi Tindak Lanjut Berikutnya (RTL) karena kondisi barang dilaporkan masih bermasalah!');
            return;
        }

        setFinishing(true);
        try {
            const formData = new FormData();
            formData.append('kondisi_setelah_perbaikan', finishForm.kondisi_setelah_perbaikan);
            formData.append('status_kelayakan_baru', finishForm.status_kelayakan_baru);
            formData.append('biaya_riil', finishForm.biaya_riil || 0);
            formData.append('tindak_lanjut_berikutnya', finishForm.tindak_lanjut_berikutnya);
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
        const bermasalah = perbaikanList.filter(p => p.kondisi_setelah_perbaikan === 'masih_bermasalah').length;
        return { total, belumMulai, inspeksi, dalamProses, selesai, bermasalah };
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
                        <div className="aset-stat-label">Belum Mulai</div>
                        <div className="aset-stat-value" style={{ color: '#f87171' }}>{kpiSummary.belumMulai}</div>
                        <div className="aset-stat-subtext">Menunggu teknisi</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                        <Clock size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Inspeksi Teknisi</div>
                        <div className="aset-stat-value" style={{ color: '#38bdf8' }}>{kpiSummary.inspeksi}</div>
                        <div className="aset-stat-subtext">Pengecekan alkes</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                        <Clock size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Dalam Proses</div>
                        <div className="aset-stat-value" style={{ color: '#fbbf24' }}>{kpiSummary.dalamProses}</div>
                        <div className="aset-stat-subtext">Servis &amp; sparepart</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Selesai Normal</div>
                        <div className="aset-stat-value" style={{ color: '#34d399' }}>{kpiSummary.selesai}</div>
                        <div className="aset-stat-subtext">Berfungsi normal</div>
                    </div>
                </div>

                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
                        <RotateCcw size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Masih Bermasalah</div>
                        <div className="aset-stat-value" style={{ color: '#f472b6' }}>{kpiSummary.bermasalah}</div>
                        <div className="aset-stat-subtext">Perlu tindak lanjut RTL</div>
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
                                                    : item.status_perbaikan === 'inspeksi'
                                                        ? 'rgba(56, 189, 248, 0.2)'
                                                        : 'rgba(239, 68, 68, 0.18)',
                                            color: item.status_perbaikan === 'selesai'
                                                ? '#34d399'
                                                : item.status_perbaikan === 'dalam_proses'
                                                    ? '#fbbf24'
                                                    : item.status_perbaikan === 'inspeksi'
                                                        ? '#38bdf8'
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
                                                title="Lihat Detail &amp; Riwayat Tiket"
                                            >
                                                <Eye size={14} color="#a855f7" />
                                            </button>
                                            {isAsetAdmin && (
                                                <>
                                                    {/* Tahap 2: Tugaskan Teknisi */}
                                                    {item.status_perbaikan === 'belum_mulai' && (
                                                        <button
                                                            className="btn-aset btn-aset-secondary"
                                                            style={{
                                                                padding: '5px 7px',
                                                                minWidth: '28px',
                                                                height: '28px',
                                                                justifyContent: 'center',
                                                                borderColor: 'rgba(56, 189, 248, 0.4)',
                                                                background: 'rgba(56, 189, 248, 0.12)'
                                                            }}
                                                            onClick={() => handleOpenUpdate(item)}
                                                            title="Tahap 2: Tugaskan Teknisi &amp; Mulai Inspeksi"
                                                        >
                                                            <UserCheck size={14} color="#38bdf8" />
                                                        </button>
                                                    )}

                                                    {/* Tahap 3: Input Hasil Inspeksi & Mulai Servis */}
                                                    {item.status_perbaikan === 'inspeksi' && (
                                                        <button
                                                            className="btn-aset btn-aset-secondary"
                                                            style={{
                                                                padding: '5px 7px',
                                                                minWidth: '28px',
                                                                height: '28px',
                                                                justifyContent: 'center',
                                                                borderColor: 'rgba(245, 158, 11, 0.4)',
                                                                background: 'rgba(245, 158, 11, 0.12)'
                                                            }}
                                                            onClick={() => handleOpenUpdate(item)}
                                                            title="Tahap 3: Input Hasil Inspeksi &amp; Mulai Servis"
                                                        >
                                                            <Wrench size={14} color="#fbbf24" />
                                                        </button>
                                                    )}

                                                    {/* Tahap 3 (Progres) & Tahap 4 (Finish) */}
                                                    {item.status_perbaikan === 'dalam_proses' && (
                                                        <>
                                                            <button
                                                                className="btn-aset btn-aset-secondary"
                                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                                onClick={() => handleOpenUpdate(item)}
                                                                title="Update Catatan Progres Pengerjaan"
                                                            >
                                                                <Edit3 size={14} color="#38bdf8" />
                                                            </button>
                                                            <button
                                                                className="btn-aset btn-aset-secondary"
                                                                style={{
                                                                    padding: '5px 7px',
                                                                    minWidth: '28px',
                                                                    height: '28px',
                                                                    justifyContent: 'center',
                                                                    borderColor: 'rgba(16, 185, 129, 0.5)',
                                                                    background: 'rgba(16, 185, 129, 0.12)'
                                                                }}
                                                                onClick={() => handleOpenFinish(item)}
                                                                title="Tahap 4: Selesaikan Perbaikan (Finish)"
                                                            >
                                                                <CheckCircle2 size={14} color="#34d399" />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
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
                            {/* Stepper Pipeline Alur Perbaikan (Mirip Petty Cash) */}
                            <RepairStepper currentStatus={detailTicket.status_perbaikan} />

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

                            {/* Section 3: Riwayat Log Kronologis Penanganan Perbaikan */}
                            {detailTicket.log_list && detailTicket.log_list.length > 0 && (
                                <div className="aset-form-section" style={{ padding: '12px 14px', marginTop: '14px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} /> Riwayat Log Kronologis Penanganan ({detailTicket.log_list.length} Catatan)
                                    </div>
                                    <div className="aset-timeline">
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
                                                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                                        {logItem.status_sesudah_label}
                                                    </span>
                                                    <span>{new Date(logItem.created_at).toLocaleString('id-ID')}</span>
                                                </div>
                                                <div className="aset-timeline-content" style={{ marginTop: '4px' }}>
                                                    <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                                                        {logItem.tindakan}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px', fontSize: '11px', opacity: 0.8 }}>
                                                        {logItem.teknisi && <span>Teknisi: <strong>{logItem.teknisi}</strong></span>}
                                                        {Number(logItem.estimasi_biaya) > 0 && <span>Est: <strong>{formatRp(logItem.estimasi_biaya)}</strong></span>}
                                                        {Number(logItem.biaya_riil) > 0 && <span>Biaya Riil: <strong>{formatRp(logItem.biaya_riil)}</strong></span>}
                                                        <span>Dicatat oleh: <strong>{logItem.dibuat_oleh_nama}</strong></span>
                                                    </div>
                                                    {logItem.foto && (
                                                        <div style={{ marginTop: '8px' }}>
                                                            <a href={resolveMediaUrl(logItem.foto)} target="_blank" rel="noreferrer">
                                                                <img
                                                                    src={resolveMediaUrl(logItem.foto)}
                                                                    alt="Lampiran Log"
                                                                    style={{ maxHeight: '75px', borderRadius: '4px', border: '1px solid #334155' }}
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
                                            style={{ background: '#0284c7', borderColor: '#0284c7' }}
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
                                            style={{ background: '#d97706', borderColor: '#d97706' }}
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
                                                <Edit3 size={14} color="#38bdf8" /> Update Progres
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-aset btn-aset-primary"
                                                style={{ background: '#10b981', borderColor: '#059669' }}
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
                                    <>
                                        <UserCheck size={18} color="#38bdf8" />
                                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                                            Tahap 2: Penugasan Teknisi &amp; Mulai Inspeksi
                                        </span>
                                    </>
                                ) : selectedTicket.status_perbaikan === 'inspeksi' ? (
                                    <>
                                        <Wrench size={18} color="#fbbf24" />
                                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                                            Tahap 3: Input Hasil Inspeksi &amp; Mulai Servis
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Clock size={18} color="#818cf8" />
                                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                                            Update Catatan Progres Servis
                                        </span>
                                    </>
                                )}
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
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
                                    <div style={{
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        border: '1px solid rgba(16, 185, 129, 0.35)',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        marginBottom: '14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399' }}>
                                                Pengerjaan Servis Sudah Selesai Tuntas?
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: '#cbd5e1', marginTop: '2px' }}>
                                                Klik untuk input evaluasi kondisi, biaya aktual riil, dan pembaruan kelayakan fisik.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-aset btn-aset-primary"
                                            style={{ background: '#10b981', borderColor: '#059669', padding: '5px 12px', fontSize: '11.5px' }}
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
                                        <div className="aset-form-section" style={{ padding: '10px 12px', marginBottom: '14px', background: 'rgba(0,0,0,0.18)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '11.5px' }}>
                                                <div>
                                                    <span style={{ opacity: 0.7 }}>Teknisi:</span> <strong>{selectedTicket.teknisi || '-'}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ opacity: 0.7 }}>Estimasi Biaya:</span> <strong style={{ color: '#fbbf24' }}>{formatRp(selectedTicket.estimasi_biaya)}</strong>
                                                </div>
                                            </div>
                                            {selectedTicket.hasil_inspeksi && (
                                                <div style={{ marginTop: '6px', fontSize: '11px', opacity: 0.85 }}>
                                                    <span style={{ opacity: 0.7 }}>Diagnosa:</span> {selectedTicket.hasil_inspeksi}
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
                                    style={{
                                        background: selectedTicket.status_perbaikan === 'belum_mulai' ? '#0284c7' :
                                            selectedTicket.status_perbaikan === 'inspeksi' ? '#d97706' : '#2563eb',
                                        borderColor: selectedTicket.status_perbaikan === 'belum_mulai' ? '#0284c7' :
                                            selectedTicket.status_perbaikan === 'inspeksi' ? '#d97706' : '#2563eb'
                                    }}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle2 size={18} color="#10b981" />
                                <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
                                    Selesaikan Perbaikan: {finishTicket.nomor_tiket}
                                </span>
                            </div>
                            <button className="aset-modal-close" onClick={() => setFinishTicket(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitFinish}>
                            <div className="aset-modal-body">
                                {/* Stepper Pipeline Alur Perbaikan (Tahap 4 Aktif) */}
                                <RepairStepper currentStatus={finishTicket.status_perbaikan} activeTargetStep={3} />

                                {/* Info Aset Singkat */}
                                <div className="aset-form-section" style={{ padding: '12px 14px', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '13.5px', fontWeight: 700 }}>
                                                {finishTicket.aset_nama} {finishTicket.aset_merk ? `(${finishTicket.aset_merk})` : ''}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6366f1', fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>
                                                {finishTicket.aset_kode} &bull; {finishTicket.unit_nama || '-'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '10.5px', opacity: 0.75 }}>Kelayakan Fisik Saat Ini:</div>
                                            <span className={`badge-kelayakan grade-${finishTicket.status_kelayakan || 'A'}`} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                                Grade {finishTicket.status_kelayakan || 'A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 1. Kondisi Setelah Perbaikan */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label">Kondisi Setelah Perbaikan *</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {[
                                            { id: 'berfungsi_normal', label: '✅ Berfungsi Normal', desc: 'Kondisi baik & normal, aset siap digunakan kembali', color: '#10b981' },
                                            { id: 'masih_bermasalah', label: '⚠️ Masih Bermasalah', desc: 'Masih ada kendala, butuh tindak lanjut berikutnya', color: '#ec4899' },
                                        ].map(opt => {
                                            const isSel = finishForm.kondisi_setelah_perbaikan === opt.id;
                                            return (
                                                <div
                                                    key={opt.id}
                                                    onClick={() => setFinishForm({ ...finishForm, kondisi_setelah_perbaikan: opt.id })}
                                                    className={`aset-choice-card ${isSel ? `selected kondisi-${opt.id}` : ''}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    style={{ padding: '10px 12px' }}
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

                                {/* RTL jika Masih Bermasalah */}
                                {finishForm.kondisi_setelah_perbaikan === 'masih_bermasalah' && (
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
                                            placeholder="Jelaskan langkah lanjutan (contoh: Menunggu kedatangan komponen IC board distributor, usulan penggantian unit)..."
                                            value={finishForm.tindak_lanjut_berikutnya}
                                            onChange={e => setFinishForm({ ...finishForm, tindak_lanjut_berikutnya: e.target.value })}
                                            required
                                            style={{ borderColor: '#ec4899' }}
                                        />
                                    </div>
                                )}

                                {/* 2. Update Penetapan Status Kelayakan Fisik Aset Pasca Servis */}
                                <div className="aset-form-group" style={{ marginBottom: '14px' }}>
                                    <label className="aset-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Update Penetapan Status Kelayakan Fisik Aset *</span>
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Status Lama: Grade {finishTicket.status_kelayakan || 'A'}</span>
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                                        {[
                                            { code: 'A', label: 'Grade A', desc: '90-100%' },
                                            { code: 'B', label: 'Grade B', desc: '70-89%' },
                                            { code: 'C', label: 'Grade C', desc: '50-69%' },
                                            { code: 'D', label: 'Grade D', desc: '30-49%' },
                                            { code: 'E', label: 'Grade E', desc: '<30%' },
                                        ].map(gr => {
                                            const isSel = finishForm.status_kelayakan_baru === gr.code;
                                            return (
                                                <div
                                                    key={gr.code}
                                                    onClick={() => setFinishForm({ ...finishForm, status_kelayakan_baru: gr.code })}
                                                    className={`aset-choice-card ${isSel ? 'selected' : ''}`}
                                                    style={{ textAlign: 'center', padding: '8px 4px' }}
                                                    role="button"
                                                    tabIndex={0}
                                                >
                                                    <span className={`badge-kelayakan grade-${gr.code}`} style={{ fontSize: '11px', padding: '2px 6px', display: 'inline-block' }}>
                                                        {gr.label}
                                                    </span>
                                                    <div style={{ fontSize: '9.5px', opacity: 0.75, marginTop: '4px' }}>{gr.desc}</div>
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
                                    style={{ background: '#10b981', borderColor: '#059669' }}
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

