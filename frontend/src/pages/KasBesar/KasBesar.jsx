import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useToastState } from '../../context/ToastContext';
import { Search, X, Check, Paperclip, AlertCircle, FileText, ZoomIn, ZoomOut, RotateCw, Maximize2, Trash2, Plus, Wallet, ClipboardList, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { getCount, getResults, pageCount, pageParams, RowSizeSelect } from '../../utils/pagination.jsx';
import './KasBesar.css';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import { AKUN_MAP } from './kasBesarAccounts';
import SearchableAkunBiayaSelect from './SearchableAkunBiayaSelect';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};
const dateToStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayStr = () => dateToStr(new Date());
const resolveMediaUrl = (url) => {
    if (!url) return '';
    let clean = String(url).trim();
    if (clean.includes('://backend') || clean.includes('://simak-backend')) {
        try {
            const parsed = new URL(clean);
            clean = parsed.pathname + parsed.search;
        } catch {
            clean = clean.replace(/^https?:\/\/[^/]+/, '');
        }
    }
    if (clean.startsWith('blob:') || clean.startsWith('data:')) return clean;
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    return clean.startsWith('/') ? clean : `/${clean}`;
};

const KB_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    menunggu_realisasi: { label: 'Menunggu Realisasi', bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dicairkan: { label: 'Dicairkan', bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    menunggu_approval_laporan: { label: 'Menunggu Approval Laporan', bg: '#eef2ff', color: '#4338ca', dot: '#6366f1' },
    dilaporkan: { label: 'Dilaporkan', bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
    menunggu_pengembalian: { label: 'Menunggu Kembali', bg: '#fefce8', color: '#a16207', dot: '#eab308' },
    menunggu_reimburse: { label: 'Menunggu Reimbursement', bg: '#fef3c7', color: '#b45309', dot: '#f59e0b' },
    selesai: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    dibatalkan: { label: 'Dibatalkan', bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};

const getStatusDisplay = (item) => {
    if (!item) return { label: '-', bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
    if (item.status === 'menunggu_realisasi' || item.status === 'disetujui') {
        if (item.is_realisasi_utang) {
            return { label: 'Siap Dicairkan', bg: '#dcfce7', color: '#166534', dot: '#22c55e' };
        }
        if (item.catatan_utang_info?.diverifikasi) {
            return { label: 'Menunggu Realisasi Bayar', bg: '#e0f2fe', color: '#0369a1', dot: '#0284c7' };
        }
        return { label: 'Menunggu Verifikasi Utang', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' };
    }
    return KB_STATUS[item.status] || { label: item.status, bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
};

function StableFilterBar({ searchVal, onSearch, statusVal, onStatus, statusCfg, dariVal, onDari, sampaiVal, onSampai, onReset, hasFilter }) {
    return (
        <div className="kb-filter-bar">
            <div className="kb-filter-row">
                <div className="kb-filter-search">
                    <Search size={15} />
                    <input className="kb-filter-input" placeholder="Cari nomor atau keperluan..." value={searchVal} onChange={e => onSearch(e.target.value)} />
                </div>
                <select className="kb-filter-select" value={statusVal} onChange={e => onStatus(e.target.value)}>
                    <option value="">Semua Status</option>
                    {Object.entries(statusCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <DateRangePicker
                    dari={dateToStr(dariVal)}
                    sampai={dateToStr(sampaiVal)}
                    onChange={({ dari, sampai }) => {
                        onDari(dari ? new Date(dari) : null);
                        onSampai(sampai ? new Date(sampai) : null);
                    }}
                    placeholder="Pilih Periode Tanggal"
                />
                {hasFilter && <button className="kb-filter-reset" onClick={onReset}>Reset</button>}
            </div>
        </div>
    );
}

function ModalHeader({ icon, title, subtitle }) {
    return (
        <div className="pc-modal-head">
            <span className="pc-modal-title-icon">{icon}</span>
            <div className="pc-modal-head-copy">
                <h2 className="pc-modal-head-title">{title}</h2>
                {subtitle && <p className="pc-modal-head-subtitle">{subtitle}</p>}
            </div>
        </div>
    );
}

function ModalSummary({ label, value, description, meta, side }) {
    return (
        <div className="pc-modal-summary">
            <div>
                <p className="pc-modal-summary-label">{label}</p>
                <p className="pc-modal-summary-value">{value}</p>
                {description && <p className="pc-modal-summary-desc">{description}</p>}
                {meta && <p className="pc-modal-summary-meta">{meta}</p>}
            </div>
            {side}
        </div>
    );
}

function ModalSection({ icon, title, children }) {
    return (
        <section className="pc-modal-section">
            {title && <p className="pc-modal-section-title">{icon}{title}</p>}
            {children}
        </section>
    );
}

function FileUploadZone({ file, label, hint, onPick }) {
    return (
        <div className={`pc-file-zone${file ? ' has' : ''}`} onClick={onPick} style={{ cursor: 'pointer' }}>
            <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: file ? '#166534' : '#475569', marginBottom: 2 }}>
                    {file ? file.name : label}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</p>
            </div>
            <span className="pc-file-pick">{file ? 'Ganti' : 'Pilih File'}</span>
        </div>
    );
}

export default function KasBesar() {
    const { user } = useAuth();
    const isDirekturWadir = Boolean(user?.is_superuser) || ['wakil_direktur', 'direktur'].includes(user?.role);
    const isKasBesarCashier = Boolean(user?.is_superuser) || Boolean(user?.is_petty_cash_cashier);
    const canMinta = Boolean(user?.is_superuser) || Boolean(user?.akses_kas_besar);

    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [saving, setSaving] = useState(false);

    const [listKB, setListKB] = useState([]);
    const [loadingKB, setLoadingKB] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDari, setFilterDari] = useState(null);
    const [filterSampai, setFilterSampai] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSizeKB, setPageSizeKB] = useState(10);
    const [totalKB, setTotalKB] = useState(0);

    const [modalBuat, setModalBuat] = useState(false);
    const [modalRevisi, setModalRevisi] = useState(null);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalCairkan, setModalCairkan] = useState(null);
    const [modalLaporan, setModalLaporan] = useState(null);
    const [modalApprovalLaporan, setModalApprovalLaporan] = useState(null);
    const [modalKonfirmasi, setModalKonfirmasi] = useState(null);
    const [modalBatal, setModalBatal] = useState(null);
    const [formBatal, setFormBatal] = useState({ alasan: '' });

    const [formKB, setFormKB] = useState({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' });
    const [berkasKB, setBerkasKB] = useState(null);
    const [berkasKBInfo, setBerkasKBInfo] = useState(null);
    
    const [formLaporan, setFormLaporan] = useState({ tanggal_laporan: todayStr(), tanggal_nota: todayStr(), nominal_digunakan: '', rincian: '' });
    const [laporanItems, setLaporanItems] = useState([{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
    const [notaList, setNotaList] = useState([]);
    
    const [approvalForm, setApprovalForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const [approvalLaporanForm, setApprovalLaporanForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const [imagePreview, setImagePreview] = useState(null);

    const berkasRef = useRef(); const notaRef = useRef();

    const fetchAll = async () => {
        setLoadingKB(true);
        try {
            const res = await api.get('/keuangan/kas-besar/', { params: pageParams(page, pageSizeKB, { status: filterStatus || undefined, dari: dateToStr(filterDari), sampai: dateToStr(filterSampai) }) });
            setListKB(getResults(res.data));
            setTotalKB(getCount(res.data));
        } catch (e) { console.error(e); }
        finally { setLoadingKB(false); }
    };

    useEffect(() => { fetchAll(); }, [page, pageSizeKB, filterStatus, filterDari, filterSampai]);

    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const resetError = () => setError('');

    const filteredKB = useMemo(() => listKB.filter(i => {
        if (filterStatus && i.status !== filterStatus) return false;
        if (search) { const q = search.toLowerCase(); if (!i.no_pengajuan?.toLowerCase().includes(q) && !i.keperluan?.toLowerCase().includes(q)) return false; }
        if (filterDari && new Date(i.tanggal) < filterDari) return false;
        if (filterSampai) { const s = new Date(filterSampai); s.setHours(23, 59, 59); if (new Date(i.tanggal) > s) return false; }
        return true;
    }), [listKB, filterStatus, search, filterDari, filterSampai]);

    const totalPagesKB = pageCount(search ? filteredKB.length : totalKB, pageSizeKB);
    const pagedKB = search ? filteredKB : filteredKB;

    const handleBuatKB = async () => {
        setError('');
        const tgl = formKB.tanggal || todayStr();
        if (!tgl || !formKB.keperluan || !formKB.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formKB.nominal) < 1000000) return setError('Nominal Kas Besar minimal Rp 1.000.000. Jika di bawah itu, gunakan Petty Cash.');
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal', tgl);
            fd.append('keperluan', formKB.keperluan);
            fd.append('nominal', formKB.nominal);
            if (formKB.keterangan) fd.append('keterangan', formKB.keterangan);
            if (berkasKB) {
                fd.append('berkas', berkasKB);
                fd.append('file_surat', berkasKB);
            }
            await api.post('/keuangan/kas-besar/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan Kas Besar berhasil disubmit!');
            setModalBuat(false); setFormKB({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' }); setBerkasKB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleRevisiKB = async () => {
        setError('');
        const tgl = formKB.tanggal || todayStr();
        if (!tgl || !formKB.keperluan || !formKB.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formKB.nominal) < 1000000) return setError('Nominal Kas Besar minimal Rp 1.000.000. Jika di bawah itu, gunakan Petty Cash.');
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal', tgl);
            fd.append('keperluan', formKB.keperluan);
            fd.append('nominal', formKB.nominal);
            if (formKB.keterangan) fd.append('keterangan', formKB.keterangan);
            if (berkasKB) {
                fd.append('berkas', berkasKB);
                fd.append('file_surat', berkasKB);
            }
            await api.post(`/keuangan/kas-besar/${modalRevisi.id}/revisi/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan Kas Besar berhasil direvisi!');
            setModalRevisi(null);
            setFormKB({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' });
            setBerkasKB(null);
            setBerkasKBInfo(null);
            fetchAll();
        } catch (e) {
            setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal merevisi.');
        } finally {
            setSaving(false);
        }
    };

    const handleApprovalKB = async () => {
        setError('');
        if (approvalForm.aksi === 'tolak' && !approvalForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/kas-besar/${modalApproval.id}/approval/`, approvalForm);
            showSuccess(`Pengajuan berhasil ${approvalForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApproval(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleCairkanKB = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/kas-besar/${modalCairkan.id}/cairkan/`);
            showSuccess('Dana berhasil dicairkan!');
            setModalCairkan(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencairkan.'); }
        finally { setSaving(false); }
    };

    const handleMultipleNotaChange = async (e) => {
        setError('');
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;

        try {
            const processedItems = [];
            for (const file of selectedFiles) {
                if (file.type.startsWith('image/')) {
                    const validation = validateImageFile(file);
                    if (!validation.isValid) {
                        setError(`File "${file.name}": ${validation.error}`);
                        continue;
                    }
                    const [compressed] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
                    const reduction = Math.max(0, (1 - compressed.size / file.size) * 100).toFixed(1);
                    const previewUrl = URL.createObjectURL(compressed);
                    processedItems.push({
                        file: compressed,
                        url: previewUrl,
                        name: file.name,
                        originalSize: formatFileSize(file.size),
                        compressedSize: formatFileSize(compressed.size),
                        reduction,
                        compressed: true
                    });
                } else {
                    const previewUrl = URL.createObjectURL(file);
                    processedItems.push({
                        file,
                        url: previewUrl,
                        name: file.name,
                        originalSize: formatFileSize(file.size),
                        compressedSize: formatFileSize(file.size),
                        reduction: '0.0',
                        compressed: false
                    });
                }
            }

            if (processedItems.length > 0) {
                setNotaList(prev => [...prev, ...processedItems]);
            }
        } catch (err) {
            setError(`Gagal memproses file nota: ${err.message}`);
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    const removeNotaItem = (index) => {
        setNotaList(prev => {
            const target = prev[index];
            if (target?.url) {
                try { URL.revokeObjectURL(target.url); } catch {}
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const clearNotaList = () => {
        setNotaList(prev => {
            prev.forEach(it => {
                if (it?.url) {
                    try { URL.revokeObjectURL(it.url); } catch {}
                }
            });
            return [];
        });
    };

    const handleLaporanKB = async () => {
        setError('');
        const tglLaporan = formLaporan.tanggal_laporan || todayStr();
        if (!tglLaporan || !formLaporan.tanggal_nota) {
            return setError('Tanggal laporan dan tanggal nota belanja wajib diisi.');
        }

        const validItems = laporanItems.filter(it => it.kode_akun && it.deskripsi && it.nilai && Number(it.nilai) > 0);
        if (validItems.length === 0) {
            return setError('Wajib mengisi minimal 1 baris rincian pengeluaran lengkap (Akun Biaya, Deskripsi, dan Nilai).');
        }

        const nominalDigunakan = validItems.reduce((sum, it) => sum + Number(it.nilai), 0);
        if (nominalDigunakan <= 0) {
            return setError('Total nominal rincian pengeluaran harus lebih besar dari Rp 0.');
        }

        if (notaList.length === 0) {
            return setError('Wajib mengunggah minimal 1 bukti nota / struk belanja.');
        }

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal_laporan', tglLaporan);
            fd.append('tanggal_nota', formLaporan.tanggal_nota);
            fd.append('nominal_digunakan', String(nominalDigunakan));
            fd.append('rincian', validItems.map(it => `[${it.kode_akun}] ${it.deskripsi} (${fmt(it.nilai)})`).join('; '));
            fd.append('items', JSON.stringify(validItems));

            notaList.forEach(item => {
                if (item.file) {
                    fd.append('nota', item.file);
                }
            });

            await api.post(`/keuangan/kas-besar/${modalLaporan.id}/laporan/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Laporan penggunaan kas besar berhasil disubmit!');
            setModalLaporan(null);
            setFormLaporan({ tanggal_laporan: todayStr(), tanggal_nota: todayStr(), nominal_digunakan: '', rincian: '' });
            setLaporanItems([{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
            clearNotaList();
            fetchAll();
        } catch (e) {
            setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal submit laporan.');
        } finally {
            setSaving(false);
        }
    };

    const handleApprovalLaporanKB = async () => {
        setError('');
        if (approvalLaporanForm.aksi === 'tolak' && !approvalLaporanForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/kas-besar/${modalApprovalLaporan.id}/approval-laporan/`, approvalLaporanForm);
            showSuccess(`Laporan berhasil ${approvalLaporanForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalLaporan(null); fetchAll();
        } catch (e) {
            setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal memproses approval laporan.');
        } finally { setSaving(false); }
    };

    const handleKonfirmasiKembali = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/kas-besar/${modalKonfirmasi.id}/konfirmasi-pengembalian/`);
            showSuccess('Pengembalian dana sisa berhasil dikonfirmasi!');
            setModalKonfirmasi(null); fetchAll();
        } catch (e) {
            setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal memproses konfirmasi.');
        } finally { setSaving(false); }
    };

    const handleBatalKB = async () => {
        setError('');
        if (!formBatal.alasan) return setError('Alasan pembatalan wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/kas-besar/${modalBatal.id}/batal/`, formBatal);
            showSuccess('Pengajuan berhasil dibatalkan!');
            setModalBatal(null); setFormBatal({ alasan: '' }); fetchAll();
        } catch (e) { setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal membatalkan.'); }
        finally { setSaving(false); }
    };

    const updateLaporanItem = (index, field, value) => {
        setLaporanItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            if (field === 'kode_akun') {
                const acc = AKUN_MAP[value];
                if (acc) {
                    next[index].nama_akun = acc.nama;
                    next[index].pos_biaya = acc.pos;
                } else {
                    next[index].nama_akun = '';
                    next[index].pos_biaya = '';
                }
            }
            return next;
        });
    };
    
    const addLaporanItem = () => setLaporanItems(prev => [...prev, { kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
    const removeLaporanItem = (index) => setLaporanItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== index) : [{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
    const totalLaporanItems = useMemo(() => laporanItems.reduce((sum, it) => sum + (Number(it.nilai) || 0), 0), [laporanItems]);

    return (
        <>
            <div className="pc-section-card">
            <div className="pc-table-titlebar">
                <div>
                    <p className="pc-table-heading">Daftar Kas Besar</p>
                    <p className="pc-table-subheading">{search ? filteredKB.length : totalKB} pengajuan ditemukan</p>
                </div>
                {canMinta && (
                    <button className="pc-action-primary" onClick={() => {
                        setFormKB({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' });
                        setBerkasKB(null);
                        resetError();
                        setModalBuat(true);
                    }}>
                        <Plus size={16} />
                        Ajukan Kas Besar
                    </button>
                )}
            </div>

            <StableFilterBar
                searchVal={search} onSearch={setSearch}
                statusVal={filterStatus} onStatus={setFilterStatus} statusCfg={KB_STATUS}
                dariVal={filterDari} onDari={setFilterDari}
                sampaiVal={filterSampai} onSampai={setFilterSampai}
                onReset={() => { setSearch(''); setFilterStatus(''); setFilterDari(null); setFilterSampai(null); }}
                hasFilter={Boolean(search || filterStatus || filterDari || filterSampai)}
            />

            {loadingKB ? (
                <div className="pc-empty-state">Memuat data...</div>
            ) : pagedKB.length === 0 ? (
                <div className="pc-empty-state">Tidak ada data pengajuan Kas Besar.</div>
            ) : (
                <div className="pc-table-wrap">
                    <table className="pc-table">
                        <thead>
                            <tr>
                                <th>No. Pengajuan</th>
                                <th>Tanggal</th>
                                <th>Keperluan</th>
                                <th>Diajukan Oleh</th>
                                <th>Nominal</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedKB.map(item => (
                                <tr key={item.id}>
                                    <td style={{ fontWeight: 600, color: '#0f2d1a' }}>{item.no_pengajuan}</td>
                                    <td style={{ color: '#94a3b8' }}>{fmtTgl(item.tanggal)}</td>
                                    <td style={{ maxWidth: 220 }}>
                                        <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keperluan}</p>
                                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_by_name}</p>
                                    </td>
                                    <td>{item.created_by_name}</td>
                                    <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                    <td>
                                        {(() => {
                                            const st = getStatusDisplay(item);
                                            return (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.color, fontSize: 11.5, fontWeight: 600 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                                                    {st.label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="pc-action-cell">
                                            {item.status === 'pending' && isDirekturWadir && (
                                                <button className="pc-btn-sm g" onClick={() => { setModalApproval(item); setApprovalForm({ aksi: 'setujui', catatan_tolak: '' }); }}>Approval</button>
                                            )}
                                            {['menunggu_realisasi', 'disetujui'].includes(item.status) && isKasBesarCashier && (
                                                <button
                                                    className="pc-btn-sm b"
                                                    disabled={!item.is_realisasi_utang}
                                                    style={!item.is_realisasi_utang ? { opacity: 0.45, cursor: 'not-allowed', filter: 'grayscale(0.6)' } : {}}
                                                    title={!item.is_realisasi_utang ? (item.catatan_utang_info?.diverifikasi ? 'Menunggu realisasi pembayaran di Catatan Utang' : 'Menunggu verifikasi di Catatan Utang') : 'Cairkan Dana'}
                                                    onClick={() => {
                                                        if (item.is_realisasi_utang) setModalCairkan(item);
                                                    }}
                                                >
                                                    Cairkan
                                                </button>
                                            )}
                                            <button className="pc-btn-sm n" onClick={() => setModalDetail(item)}>Detail</button>
                                            {item.status === 'dicairkan' && item.created_by === user?.id && (
                                                <button className="pc-btn-sm p" onClick={() => { setModalLaporan(item); setLaporanItems([{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]); setNotaList([]); setFormLaporan({ tanggal_laporan: todayStr(), tanggal_nota: todayStr(), nominal_digunakan: '', rincian: '' }); }}>Laporan</button>
                                            )}
                                            {item.status === 'menunggu_approval_laporan' && isDirekturWadir && (
                                                <button className="pc-btn-sm g" onClick={() => { setModalApprovalLaporan(item); setApprovalLaporanForm({ aksi: 'setujui', catatan_tolak: '' }); }}>Approval Laporan</button>
                                            )}
                                            {item.status === 'menunggu_pengembalian' && isKasBesarCashier && (
                                                <button className="pc-btn-sm y" onClick={() => setModalKonfirmasi(item)}>Terima Pengembalian</button>
                                            )}
                                            {item.status === 'ditolak' && item.created_by === user?.id && (
                                                <button
                                                    className="pc-btn-sm b revision"
                                                    onClick={() => {
                                                        setFormKB({ tanggal: item.tanggal, keperluan: item.keperluan, nominal: item.nominal, keterangan: item.keterangan || '' });
                                                        setBerkasKB(null);
                                                        setBerkasKBInfo(null);
                                                        resetError();
                                                        setModalRevisi(item);
                                                    }}
                                                    title="Revisi Pengajuan"
                                                >
                                                    Revisi
                                                </button>
                                            )}
                                            {item.status !== 'dibatalkan' && item.status !== 'selesai' && (item.created_by === user?.id || isKasBesarCashier || isDirekturWadir) && (
                                                <button
                                                    className="pc-btn-sm r"
                                                    onClick={() => {
                                                        resetError();
                                                        setFormBatal({ alasan: '' });
                                                        setModalBatal(item);
                                                    }}
                                                    title="Batalkan Pengajuan"
                                                >
                                                    Batal
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {(search ? filteredKB.length : totalKB) > 0 && (
                <div className="pc-pagination">
                    <span className="pc-page-info">Hal {page} dari {totalPagesKB} - {search ? filteredKB.length : totalKB} data</span>
                    <div className="pc-page-btns">
                        <RowSizeSelect className="pc-filter-select" value={pageSizeKB} onChange={(size) => { setPageSizeKB(size); setPage(1); }} />
                        <button className="pc-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>&lt;</button>
                        <button className="pc-page-btn active">{page}</button>
                        <button className="pc-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPagesKB}>&gt;</button>
                    </div>
                </div>
            )}
        </div>
            
            {/* ══ MODAL FORM KAS BESAR (BUAT / REVISI) ══ */}
            {(modalBuat || modalRevisi) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-modal-native-scroll">
                        <ModalHeader
                            icon={<Wallet size={18} />}
                            title={modalRevisi ? 'Revisi Pengajuan Kas Besar' : 'Ajukan Kas Besar'}
                            subtitle={modalRevisi ? `Memperbaiki pengajuan ${modalRevisi.no_pengajuan}` : 'Isi data pengajuan operasional bernominal di atas Rp 1.000.000.'}
                        />
                        {modalRevisi?.catatan_tolak && (
                            <div className="pc-rejection">
                                <strong>Catatan Penolakan:</strong> {modalRevisi.catatan_tolak}
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Pengajuan">
                            <div className="pc-field">
                                <label className="pc-label">Nama Pengaju</label>
                                <div className="pc-input-readonly">
                                    <User size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span>{modalRevisi ? (modalRevisi.created_by_name || '-') : (user?.full_name || user?.nama || user?.username || '-')}</span>
                                    {(user?.unit_nama || user?.unit?.nama) && (
                                        <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                                            {user?.unit_nama || user?.unit?.nama}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Pengajuan</label>
                                    <DateField value={formKB.tanggal || todayStr()} onChange={val => setFormKB({ ...formKB, tanggal: val })} placeholder="Pilih tanggal..." />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal (Rp) *</label>
                                    <input
                                        className="pc-input"
                                        type="number"
                                        placeholder="0"
                                        value={formKB.nominal}
                                        onChange={e => setFormKB({ ...formKB, nominal: e.target.value })}
                                    />
                                    {Number(formKB.nominal) > 0 && Number(formKB.nominal) < 1000000 && (
                                        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <AlertTriangle size={13} /> Nominal minimal Rp 1.000.000 (di bawah Rp 1.000.000 gunakan Petty Cash).
                                        </p>
                                    )}
                                    {!formKB.nominal && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Min. Rp 1.000.000</p>}
                                </div>
                            </div>

                            <div className="pc-field">
                                <label className="pc-label">Keperluan *</label>
                                <textarea
                                    className="pc-textarea"
                                    placeholder="Jelaskan keperluan pengajuan dana kas besar..."
                                    value={formKB.keperluan}
                                    onChange={e => setFormKB({ ...formKB, keperluan: e.target.value })}
                                />
                            </div>

                            <div className="pc-field">
                                <label className="pc-label">Keterangan Tambahan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                                <textarea
                                    className="pc-textarea"
                                    style={{ minHeight: 60 }}
                                    placeholder="Catatan atau keterangan tambahan (opsional)..."
                                    value={formKB.keterangan}
                                    onChange={e => setFormKB({ ...formKB, keterangan: e.target.value })}
                                />
                            </div>
                        </ModalSection>

                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran Surat / Dokumen">
                            {modalRevisi?.berkas_url && !berkasKB && (
                                <div style={{ marginBottom: 10 }}>
                                    <ExistingAttachmentPreview url={modalRevisi.berkas_url} label="Berkas Saat Ini" onPreview={setImagePreview} />
                                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                        Berkas lama akan tetap digunakan jika Anda tidak memilih berkas baru di bawah.
                                    </p>
                                </div>
                            )}
                            <input ref={berkasRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setBerkasKB(e.target.files[0])} />
                            <FileUploadZone file={berkasKB} label={modalRevisi?.berkas_url ? 'Ganti Berkas Pengajuan' : 'Lampirkan Surat Pengajuan (Opsional)'} hint="PDF, JPG, atau PNG." onPick={() => berkasRef.current?.click()} />
                        </ModalSection>

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBuat(false); setModalRevisi(null); setBerkasKB(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={modalRevisi ? handleRevisiKB : handleBuatKB} disabled={saving}>
                                {saving ? 'Menyimpan...' : (modalRevisi ? 'Kirim Revisi' : 'Ajukan Kas Besar')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL DETAIL KAS BESAR ══ */}
            {modalDetail && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg pc-modal-native-scroll">
                        <ModalHeader
                            icon={<ClipboardList size={18} />}
                            title="Detail Kas Besar"
                            subtitle="Ringkasan pengajuan dana, approval, riwayat pencairan, dan laporan penggunaan."
                        />
                        <ModalSummary
                            label={modalDetail.no_pengajuan}
                            value={fmt(modalDetail.nominal)}
                            description={modalDetail.keperluan}
                            meta={`Tanggal pengajuan ${fmtTgl(modalDetail.tanggal)}`}
                            side={
                                (() => {
                                    const st = getStatusDisplay(modalDetail);
                                    return (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.color, fontSize: 11.5, fontWeight: 600 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                                            {st.label}
                                        </span>
                                    );
                                })()
                            }
                        />

                        <ModalSection icon={<User size={14} />} title="Informasi Pengajuan & Riwayat">
                            <div className="pc-detail-grid">
                                <div className="pc-detail-item">
                                    <p className="pc-detail-label">Diajukan Oleh</p>
                                    <p className="pc-detail-value">{modalDetail.created_by_name} ({fmtDT(modalDetail.created_at)})</p>
                                </div>
                                <div className="pc-detail-item">
                                    <p className="pc-detail-label">Status Saat Ini</p>
                                    <p className="pc-detail-value" style={{ fontWeight: 700, color: getStatusDisplay(modalDetail).color }}>{getStatusDisplay(modalDetail).label}</p>
                                </div>
                                {modalDetail.approved_by_name && (
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Disetujui Oleh</p>
                                        <p className="pc-detail-value">{modalDetail.approved_by_name} ({fmtDT(modalDetail.approved_at)})</p>
                                    </div>
                                )}
                                {modalDetail.dicairkan_by_name && (
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Dicairkan Oleh</p>
                                        <p className="pc-detail-value">{modalDetail.dicairkan_by_name} ({fmtDT(modalDetail.dicairkan_at)})</p>
                                    </div>
                                )}
                                {modalDetail.catatan_utang_info && modalDetail.catatan_utang_info.tercatat && (
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Status Catatan Utang</p>
                                        <p className="pc-detail-value" style={{ fontWeight: 600, color: modalDetail.is_realisasi_utang ? '#166534' : '#b45309' }}>
                                            {modalDetail.is_realisasi_utang
                                                ? '✓ Sudah Realisasi Pembayaran'
                                                : (modalDetail.catatan_utang_info.diverifikasi ? 'Terverifikasi (Menunggu Realisasi)' : 'Menunggu Verifikasi di Keuangan')}
                                        </p>
                                    </div>
                                )}
                                {modalDetail.catatan_tolak && (
                                    <div className="pc-detail-item" style={{ gridColumn: '1 / -1' }}>
                                        <p className="pc-detail-label" style={{ color: '#dc2626' }}>Catatan Penolakan / Revisi</p>
                                        <p className="pc-detail-value" style={{ color: '#dc2626' }}>{modalDetail.catatan_tolak}</p>
                                    </div>
                                )}
                                {modalDetail.keterangan && (
                                    <div className="pc-detail-item" style={{ gridColumn: '1 / -1' }}>
                                        <p className="pc-detail-label">Keterangan Tambahan</p>
                                        <p className="pc-detail-value">{modalDetail.keterangan}</p>
                                    </div>
                                )}
                                {modalDetail.file_surat && (
                                    <div className="pc-detail-item" style={{ gridColumn: '1 / -1' }}>
                                        <p className="pc-detail-label">Berkas Surat</p>
                                        <a href={resolveMediaUrl(modalDetail.file_surat)} target="_blank" rel="noreferrer" className="pc-form-link" style={{ margin: 0 }}>
                                            <Paperclip size={14} /> Lihat Berkas Surat
                                        </a>
                                    </div>
                                )}
                            </div>
                        </ModalSection>

                        {modalDetail.laporan && (
                            <ModalSection icon={<FileText size={14} />} title="Laporan Penggunaan Dana">
                                <div className="pc-detail-grid" style={{ marginBottom: 12 }}>
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Nominal Digunakan</p>
                                        <p className="pc-detail-value" style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>{fmt(modalDetail.laporan.nominal_digunakan)}</p>
                                    </div>
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">
                                            {Number(modalDetail.laporan.nominal_digunakan) > Number(modalDetail.nominal) ? 'Kekurangan Belanja' : 'Sisa / Kembalian'}
                                        </p>
                                        <p className="pc-detail-value" style={{ fontSize: 16, fontWeight: 700, color: Number(modalDetail.laporan.nominal_digunakan) > Number(modalDetail.nominal) ? '#dc2626' : '#d97706' }}>
                                            {fmt(Math.abs(Number(modalDetail.nominal) - Number(modalDetail.laporan.nominal_digunakan)))}
                                        </p>
                                    </div>
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Tanggal Nota Belanja</p>
                                        <p className="pc-detail-value">{fmtTgl(modalDetail.laporan.tanggal_nota)}</p>
                                    </div>
                                    <div className="pc-detail-item">
                                        <p className="pc-detail-label">Rincian Ringkas</p>
                                        <p className="pc-detail-value">{modalDetail.laporan.rincian || '-'}</p>
                                    </div>
                                </div>

                                {modalDetail.reimbursement_info && (
                                    <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                            <div>
                                                <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AlertCircle size={15} /> Kekurangan Belanja Dialihkan ke Reimbursement
                                                </p>
                                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 4, marginBottom: 2 }}>
                                                    {modalDetail.reimbursement_info.no_reimbursement}
                                                </p>
                                                <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                                                    Nominal: <strong style={{ color: '#b45309' }}>{fmt(modalDetail.reimbursement_info.nominal)}</strong> • Tanggal: {fmtTgl(modalDetail.reimbursement_info.tanggal)}
                                                </p>
                                            </div>
                                            <span style={{
                                                fontSize: 11.5,
                                                fontWeight: 600,
                                                padding: '3px 10px',
                                                borderRadius: 99,
                                                background: modalDetail.reimbursement_info.status === 'dicairkan' ? '#dcfce7' : '#fef3c7',
                                                color: modalDetail.reimbursement_info.status === 'dicairkan' ? '#166534' : '#b45309',
                                                border: `1px solid ${modalDetail.reimbursement_info.status === 'dicairkan' ? '#86efac' : '#fcd34d'}`
                                            }}>
                                                {modalDetail.reimbursement_info.status === 'dicairkan' ? '✓ Sudah Dicairkan' : `Status: ${modalDetail.reimbursement_info.status_label || modalDetail.reimbursement_info.status}`}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {modalDetail.laporan.items && modalDetail.laporan.items.length > 0 && (
                                    <div className="pc-table-wrap" style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        <table className="pc-table">
                                            <thead>
                                                <tr>
                                                    <th>Kategori Akun Biaya</th>
                                                    <th>Deskripsi</th>
                                                    <th style={{ textAlign: 'right' }}>Nilai (Rp)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modalDetail.laporan.items.map(it => (
                                                    <tr key={it.id}>
                                                        <td><strong>{it.kode_akun}</strong> - {it.nama_akun}</td>
                                                        <td>{it.deskripsi}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(it.nilai)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {modalDetail.laporan.fotos && modalDetail.laporan.fotos.length > 0 && (
                                    <div style={{ marginTop: 14 }}>
                                        <p className="pc-detail-label">Bukti Nota / Struk ({modalDetail.laporan.fotos.length} foto)</p>
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                                            {modalDetail.laporan.fotos.map(f => (
                                                <div key={f.id} onClick={() => setImagePreview(resolveMediaUrl(f.file))} style={{ cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 8, padding: 4, background: '#fff' }}>
                                                    <img src={resolveMediaUrl(f.file)} alt="Nota" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </ModalSection>
                        )}

                        <div className="pc-modal-footer">
                            <button className="pc-btn-primary" onClick={() => setModalDetail(null)}>Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL APPROVAL KAS BESAR ══ */}
            {modalApproval && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <div style={{ marginBottom: 18 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f2d1a', margin: 0 }}>Proses Pengajuan</h2>
                            <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 0' }}>Tinjau dan tentukan persetujuan untuk pengajuan Kas Besar.</p>
                        </div>
                        <div className="pc-approval-summary">
                            <div className="pc-approval-top">
                                <span className="pc-approval-no">{modalApproval.no_pengajuan}</span>
                                <span className="pc-approval-date">{fmtTgl(modalApproval.tanggal)}</span>
                            </div>
                            <div className="pc-approval-amount-row">
                                <p className="pc-approval-amount">{fmt(modalApproval.nominal)}</p>
                                <span className="pc-approval-amount-sub">Nominal Pengajuan</span>
                            </div>
                            <div className="pc-popup-applicant-block">
                                <div className="pc-popup-grid-row">
                                    <span className="pc-popup-grid-label">
                                        <User size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Pemohon :
                                    </span>
                                    <span className="pc-popup-grid-val">
                                        {modalApproval.created_by_name || '-'}
                                    </span>
                                </div>
                                <div className="pc-popup-grid-row">
                                    <span className="pc-popup-grid-label">
                                        <FileText size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Keperluan :
                                    </span>
                                    <span className="pc-popup-grid-val">{modalApproval.keperluan}</span>
                                </div>
                                {modalApproval.keterangan && (
                                    <div className="pc-popup-grid-row">
                                        <span className="pc-popup-grid-label">
                                            <ClipboardList size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Keterangan :
                                        </span>
                                        <span className="pc-popup-grid-val">{modalApproval.keterangan}</span>
                                    </div>
                                )}
                                {modalApproval.file_surat && (
                                    <div className="pc-popup-grid-row" style={{ marginTop: 2 }}>
                                        <span className="pc-popup-grid-label">
                                            <Paperclip size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Berkas :
                                        </span>
                                        <span className="pc-popup-grid-val">
                                            <a href={resolveMediaUrl(modalApproval.file_surat)} target="_blank" rel="noreferrer" className="pc-form-link" style={{ margin: 0 }}>
                                                Lihat Berkas Surat
                                            </a>
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalForm.aksi === 'setujui' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_kb"
                                        value="setujui"
                                        checked={approvalForm.aksi === 'setujui'}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'setujui' })}
                                    /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_kb"
                                        value="tolak"
                                        checked={approvalForm.aksi === 'tolak'}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'tolak' })}
                                    /> <X size={15} /> Tolak
                                </label>
                            </div>
                        </div>

                        {approvalForm.aksi === 'tolak' && (
                            <div className="pc-field">
                                <label className="pc-label">Catatan Tolak *</label>
                                <textarea
                                    className="pc-textarea"
                                    placeholder="Alasan penolakan..."
                                    value={approvalForm.catatan_tolak}
                                    onChange={e => setApprovalForm({ ...approvalForm, catatan_tolak: e.target.value })}
                                />
                            </div>
                        )}

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApproval(null); resetError(); }}>Batal</button>
                            <button
                                className={`pc-btn-primary${approvalForm.aksi === 'tolak' ? ' danger' : ''}`}
                                onClick={handleApprovalKB}
                                disabled={saving}
                            >
                                {saving ? 'Memproses...' : approvalForm.aksi === 'setujui' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL CAIRKAN KAS BESAR ══ */}
            {modalCairkan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <ModalHeader
                            icon={<Wallet size={18} />}
                            title="Pencairan Kas Besar"
                            subtitle="Konfirmasi pencairan dana pengajuan kas besar."
                        />
                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-form-note" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>Pembayaran untuk pengajuan ini telah <strong>direalisasikan</strong> di <strong>Catatan Utang</strong>. Tekan <strong>Cairkan Dana</strong> untuk mengonfirmasi penyerahan dana kepada pemohon.</span>
                        </div>

                        <ModalSummary
                            label={modalCairkan.no_pengajuan}
                            value={fmt(modalCairkan.nominal)}
                            description={modalCairkan.keperluan}
                            meta={`Diajukan oleh ${modalCairkan.created_by_name}`}
                        />

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => setModalCairkan(null)}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleCairkanKB} disabled={saving}>
                                {saving ? 'Memproses...' : 'Cairkan Dana'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL BATALKAN KAS BESAR ══ */}
            {modalBatal && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <ModalHeader
                            icon={<AlertTriangle size={18} />}
                            title="Batalkan Pengajuan"
                            subtitle={`No. Pengajuan: ${modalBatal.no_pengajuan}`}
                        />
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 4, fontWeight: 600 }}>Konfirmasi pembatalan pengajuan kas besar:</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalBatal.no_pengajuan}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', margin: '4px 0 8px' }}>{fmt(modalBatal.nominal)}</p>
                            <div className="pc-popup-applicant-block" style={{ borderTopColor: '#fca5a5' }}>
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalBatal.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalBatal.keperluan}
                                </div>
                                {modalBatal.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalBatal.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field" style={{ marginBottom: 16 }}>
                            <label className="pc-label">Alasan Pembatalan <span style={{ color: '#dc2626' }}>*</span></label>
                            <textarea
                                className="pc-textarea"
                                required
                                style={{ minHeight: 80 }}
                                placeholder="Tuliskan alasan pembatalan pengajuan ini..."
                                value={formBatal.alasan}
                                onChange={(e) => setFormBatal({ alasan: e.target.value })}
                            />
                        </div>

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBatal(null); setFormBatal({ alasan: '' }); resetError(); }}>Kembali</button>
                            <button className="pc-btn-primary danger" onClick={handleBatalKB} disabled={saving || !formBatal.alasan.trim()}>
                                {saving ? 'Memproses...' : 'Ya, Batalkan Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL SUBMIT LAPORAN ══ */}
            {modalLaporan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal xl">
                        <ModalHeader
                            icon={<FileText size={18} />}
                            title="Upload Laporan Penggunaan"
                            subtitle="Isi realisasi dana, rincian penggunaan, dan unggah nota bila ada."
                        />
                        <ModalSummary
                            label="Dana yang dicairkan"
                            value={fmt(modalLaporan.nominal)}
                            description={modalLaporan.keperluan}
                            meta={
                                <span>
                                    <strong>{modalLaporan.no_pengajuan}</strong> • Diajukan Oleh: <strong>{modalLaporan.created_by_name || '-'}</strong>
                                    {modalLaporan.keterangan ? ` • Ket: ${modalLaporan.keterangan}` : ''}
                                </span>
                            }
                        />
                        {modalLaporan.catatan_tolak && <div className="pc-rejection"><strong>Catatan penolakan laporan:</strong> {modalLaporan.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Laporan">
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Laporan (Hari Ini)</label>
                                    <DateField value={formLaporan.tanggal_laporan || todayStr()} disabled placeholder="Pilih tanggal..." />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Nota / Pembelian *</label>
                                    <DateField value={formLaporan.tanggal_nota} onChange={tanggal_nota => setFormLaporan({ ...formLaporan, tanggal_nota })} placeholder="Pilih tanggal nota..." />
                                </div>
                            </div>

                            {/* Tabel 3 Kolom: Kategori (Akun Biaya), Deskripsi, Nilai */}
                            <div style={{ marginTop: 8 }}>
                                <label className="pc-label" style={{ marginBottom: 6 }}>
                                    Rincian Pengeluaran Belanja (Akun Biaya) <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <div className="pc-items-table-wrapper">
                                    <table className="pc-items-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '38px', textAlign: 'center' }}>No</th>
                                                <th style={{ width: '36%' }}>Kategori (Akun Biaya) <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th>Deskripsi Belanja <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th style={{ width: '160px', textAlign: 'right' }}>Nilai (Rp) <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th style={{ width: '46px', textAlign: 'center' }}>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {laporanItems.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                                                    <td>
                                                        <SearchableAkunBiayaSelect
                                                            value={item.kode_akun}
                                                            onChange={(kode) => updateLaporanItem(idx, 'kode_akun', kode)}
                                                            placeholder="Pilih Akun Biaya"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="pc-input-table"
                                                            placeholder="Contoh: Kertas F4 2 rim & pulpen..."
                                                            value={item.deskripsi}
                                                            onChange={(e) => updateLaporanItem(idx, 'deskripsi', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="pc-input-table text-right"
                                                            placeholder="0"
                                                            value={item.nilai}
                                                            onChange={(e) => updateLaporanItem(idx, 'nilai', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            className="pc-btn-delete-row"
                                                            onClick={() => removeLaporanItem(idx)}
                                                            title="Hapus baris ini"
                                                            disabled={laporanItems.length === 1 && !item.kode_akun && !item.deskripsi && !item.nilai}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
                                    <button type="button" className="pc-btn-add-item" onClick={addLaporanItem}>
                                        <Plus size={14} /> Tambah Baris Pengeluaran
                                    </button>
                                </div>

                                {/* Summary Kalkulasi Otomatis */}
                                <div className="pc-report-calc-card">
                                    <div className="pc-report-calc-row">
                                        <span>Dana Awal Dicairkan:</span>
                                        <strong>{fmt(modalLaporan.nominal)}</strong>
                                    </div>
                                    <div className="pc-report-calc-row highlight">
                                        <span>Total Nilai Digunakan (Otomatis):</span>
                                        <strong style={{ color: '#2563eb', fontSize: '15px' }}>{fmt(totalLaporanItems)}</strong>
                                    </div>
                                    <div className="pc-report-calc-divider" />
                                    <div className="pc-report-calc-row">
                                        <span>{totalLaporanItems > Number(modalLaporan.nominal) ? 'Kekurangan Dana (Over-Budget):' : 'Sisa Kembalian ke Kasir:'}</span>
                                        <strong style={{
                                            color: totalLaporanItems > Number(modalLaporan.nominal) ? '#ea580c' : '#16a34a',
                                            fontSize: '16px'
                                        }}>
                                            {totalLaporanItems > Number(modalLaporan.nominal)
                                                ? fmt(totalLaporanItems - Number(modalLaporan.nominal))
                                                : fmt(Number(modalLaporan.nominal) - totalLaporanItems)
                                            }
                                        </strong>
                                    </div>
                                    {totalLaporanItems > Number(modalLaporan.nominal) && (
                                        <div className="pc-report-warn" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, marginTop: 8 }}>
                                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
                                            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                                                <strong>Kekurangan dana {fmt(totalLaporanItems - Number(modalLaporan.nominal))} ditalangi pemohon.</strong>
                                                <div style={{ color: '#3b82f6', marginTop: 2 }}>
                                                    Setelah laporan ini disetujui Pimpinan, sistem akan <strong>otomatis menerbitkan Reimbursement</strong> penggantian dana dan mencatatkannya di Catatan Utang.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran Laporan (Bisa Lebih Dari 1 Nota)">
                            <input
                                ref={notaRef}
                                type="file"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png"
                                style={{ display: 'none' }}
                                onChange={handleMultipleNotaChange}
                            />
                            <MultiAttachmentUploader
                                items={notaList}
                                onRemove={removeNotaItem}
                                onPreview={setImagePreview}
                                onPick={() => notaRef.current?.click()}
                            />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalLaporan(null); clearNotaList(); resetError(); }}>Batal</button>
                            <button
                                className="pc-btn-primary"
                                onClick={handleLaporanKB}
                                disabled={saving || notaList.length === 0 || totalLaporanItems <= 0}
                            >
                                {saving ? 'Menyimpan...' : 'Submit Laporan'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL APPROVAL LAPORAN KAS BESAR ══ */}
            {modalApprovalLaporan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<Check size={18} />}
                            title="Approve Laporan Penggunaan"
                            subtitle="Review realisasi dana sebelum proses kas besar bisa dilanjutkan."
                        />
                        {modalApprovalLaporan.laporan && (
                            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                                    <div>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalApprovalLaporan.no_pengajuan}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                            <User size={13} style={{ color: '#10b981' }} />
                                            <span>Diajukan Oleh: <strong style={{ color: '#1e293b' }}>{modalApprovalLaporan.created_by_name || '-'}</strong></span>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalApprovalLaporan.tanggal)}</span>
                                </div>
                                <div style={{ fontSize: 13, color: '#334155', marginBottom: 12, lineHeight: 1.45 }}>
                                    <div><strong>Keperluan:</strong> {modalApprovalLaporan.keperluan}</div>
                                    {modalApprovalLaporan.keterangan && (
                                        <div className="pc-popup-keterangan" style={{ marginTop: 6 }}>
                                            <strong>Keterangan Pengajuan:</strong> {modalApprovalLaporan.keterangan}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Tgl Laporan</p><p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalApprovalLaporan.laporan.tanggal_laporan)}</p></div>
                                    <div><p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Tgl Nota / Belanja</p><p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalApprovalLaporan.laporan.tanggal_nota || modalApprovalLaporan.laporan.tanggal_laporan)}</p></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Dana Dicairkan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalApprovalLaporan.nominal)}</p></div>
                                    <div><p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Dana Digunakan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalApprovalLaporan.laporan.nominal_digunakan)}</p></div>
                                </div>
                                {(modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan) < 0 ? (
                                     <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', marginBottom: 12 }}>
                                         <p style={{ fontSize: 12, color: '#1e40af', fontWeight: 600, marginBottom: 2 }}>Kekurangan Dana (Over-Budget)</p>
                                         <p style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', margin: 0 }}>{fmt(Math.abs(modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan))}</p>
                                         <p style={{ fontSize: 12, color: '#1d4ed8', margin: '4px 0 0', lineHeight: 1.4 }}>
                                             ℹ️ Menyetujui laporan ini akan <strong>otomatis menerbitkan Reimbursement</strong> senilai kekurangan dana dan dicatatkan di Catatan Utang ("Menunggu Verifikasi").
                                         </p>
                                     </div>
                                 ) : (
                                     <div style={{ padding: '10px 14px', background: (modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan) > 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${(modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan) > 0 ? '#86efac' : '#f1f5f9'}`, marginBottom: 12 }}>
                                         <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Selisih / Kembalian ke Kasir</p>
                                         <p style={{ fontSize: 20, fontWeight: 700, color: (modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan) > 0 ? '#166534' : '#475569' }}>{fmt(modalApprovalLaporan.nominal - modalApprovalLaporan.laporan.nominal_digunakan)}</p>
                                     </div>
                                 )}
                                {modalApprovalLaporan.laporan.items && modalApprovalLaporan.laporan.items.length > 0 ? (
                                    <div style={{ marginBottom: 14 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                            Rincian Akun Biaya Pengeluaran:
                                        </p>
                                        <div className="pc-items-table-wrapper">
                                            <table className="pc-items-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '36px', textAlign: 'center' }}>No</th>
                                                        <th style={{ width: '38%' }}>Akun Biaya</th>
                                                        <th>Deskripsi Belanja</th>
                                                        <th style={{ textAlign: 'right', width: '130px' }}>Nilai</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalApprovalLaporan.laporan.items.map((it, idx) => (
                                                        <tr key={it.id || idx}>
                                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                                            <td>
                                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.kode_akun} - {it.nama_akun}</div>
                                                                {it.pos_biaya && <div style={{ fontSize: '11px', color: '#64748b' }}>{it.pos_biaya}</div>}
                                                            </td>
                                                            <td style={{ color: '#334155' }}>{it.deskripsi}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(it.nilai)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b', padding: '10px 12px' }}>Total Digunakan</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb', padding: '10px 12px' }}>{fmt(modalApprovalLaporan.laporan.nominal_digunakan)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    modalApprovalLaporan.laporan.rincian && (
                                        <div style={{ marginBottom: 12 }}>
                                            <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Rincian Belanja</p>
                                            <p style={{ fontSize: 13, color: '#334155' }}>{modalApprovalLaporan.laporan.rincian}</p>
                                        </div>
                                    )
                                )}
                                <ExistingAttachmentsList
                                    list={modalApprovalLaporan.laporan.berkas_nota_list}
                                    fallbackUrl={modalApprovalLaporan.laporan.nota_url}
                                    label="Nota / Struk Bukti Belanja"
                                    onPreview={setImagePreview}
                                />
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalLaporanForm.aksi === 'setujui' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_laporan_kb"
                                        value="setujui"
                                        checked={approvalLaporanForm.aksi === 'setujui'}
                                        onChange={() => setApprovalLaporanForm({ ...approvalLaporanForm, aksi: 'setujui' })}
                                    /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalLaporanForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_laporan_kb"
                                        value="tolak"
                                        checked={approvalLaporanForm.aksi === 'tolak'}
                                        onChange={() => setApprovalLaporanForm({ ...approvalLaporanForm, aksi: 'tolak' })}
                                    /> <X size={15} /> Tolak
                                </label>
                            </div>
                        </div>
                        {approvalLaporanForm.aksi === 'tolak' && (
                            <div className="pc-field">
                                <label className="pc-label">Catatan Revisi Laporan *</label>
                                <textarea className="pc-textarea" placeholder="Jelaskan bagian laporan yang perlu diperbaiki..." value={approvalLaporanForm.catatan_tolak} onChange={e => setApprovalLaporanForm({ ...approvalLaporanForm, catatan_tolak: e.target.value })} />
                            </div>
                        )}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalLaporan(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${approvalLaporanForm.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalLaporanKB} disabled={saving}>
                                {saving ? 'Memproses...' : approvalLaporanForm.aksi === 'setujui' ? 'Setujui Laporan' : 'Tolak Laporan'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL KONFIRMASI PENGEMBALIAN DANA ══ */}
            {modalKonfirmasi && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <ModalHeader
                            icon={<Wallet size={18} />}
                            title="Konfirmasi Pengembalian Dana"
                            subtitle={`No. Pengajuan: ${modalKonfirmasi.no_pengajuan}`}
                        />
                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-form-note" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>
                            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>Terdapat sisa dana yang harus dikembalikan oleh pihak pengaju. Pastikan Anda telah menerima fisik dana tersebut sebelum mengonfirmasi.</span>
                        </div>

                        <ModalSummary
                            label="Sisa Dana Dikembalikan"
                            value={fmt(modalKonfirmasi.nominal - (modalKonfirmasi.laporan?.nominal_digunakan || 0))}
                            description={`Pengaju: ${modalKonfirmasi.created_by_name}`}
                        />

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => setModalKonfirmasi(null)}>Batal</button>
                            <button className="pc-btn-success" onClick={handleKonfirmasiKembali} disabled={saving}>
                                {saving ? 'Memproses...' : 'Konfirmasi Dana Diterima'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ IMAGE PREVIEW LIGHTBOX ══ */}
            {imagePreview && <ImageZoomModal data={imagePreview} onClose={() => setImagePreview(null)} />}
        </>
    );
}

function isImageFile(file) {
    return file?.type?.startsWith('image/');
}

function isImageUrl(url) {
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url || '');
}

function MultiAttachmentItemPreview({ item, onRemove, onPreview }) {
    const isImage = isImageFile(item?.file) || isImageUrl(item?.name || item?.url);
    const displayUrl = item?.url;

    return (
        <div className="pc-upload-preview" style={{ marginBottom: 0 }}>
            {isImage && displayUrl ? (
                <img
                    className="pc-upload-thumb"
                    src={displayUrl}
                    alt={item.name}
                    onClick={() => onPreview({ url: displayUrl, name: item.name, file: item.file })}
                />
            ) : (
                <div
                    className="pc-upload-doc"
                    onClick={() => displayUrl && onPreview({ url: displayUrl, name: item.name, file: item.file })}
                    style={{ cursor: displayUrl ? 'pointer' : 'default' }}
                >
                    <Paperclip size={20} />
                </div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{item.name}</p>
                <p className="pc-upload-info">
                    {item.compressed
                        ? `${item.originalSize} -> ${item.compressedSize} (${item.reduction}% lebih kecil)`
                        : `${item.originalSize} - tidak dikompres`}
                </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {displayUrl && (
                    <button
                        className="pc-btn-sm n"
                        type="button"
                        onClick={() => onPreview({ url: displayUrl, name: item.name, file: item.file })}
                    >
                        Preview
                    </button>
                )}
                <button
                    className="pc-btn-sm r"
                    type="button"
                    onClick={onRemove}
                    title="Hapus file ini"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function MultiAttachmentUploader({ items, onRemove, onPreview, onPick }) {
    return (
        <div>
            <div className="pc-file-zone" onClick={onPick} style={{ cursor: 'pointer' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: items.length > 0 ? '#166534' : '#475569', marginBottom: 2 }}>
                        {items.length > 0 ? `${items.length} file nota / struk dipilih` : 'Upload Nota / Struk Bukti Belanja (Wajib) *'}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>
                        Bisa pilih lebih dari 1 file nota (PDF, JPG, PNG). Gambar otomatis dikompres.
                    </p>
                </div>
                <span className="pc-file-pick">
                    {items.length > 0 ? '+ Tambah Nota' : 'Pilih File'}
                </span>
            </div>

            {items.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((it, idx) => (
                        <MultiAttachmentItemPreview
                            key={idx}
                            item={it}
                            onRemove={() => onRemove(idx)}
                            onPreview={onPreview}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ExistingAttachmentsList({ list, fallbackUrl, label = 'Nota / Struk', onPreview }) {
    const items = (list && list.length > 0)
        ? list
        : (fallbackUrl ? [{ id: 'main', url: fallbackUrl, name: label }] : []);

    if (items.length === 0) return null;

    return (
        <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {label} ({items.length} berkas)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, idx) => (
                    <ExistingAttachmentPreview
                        key={item.id || idx}
                        url={item.url}
                        label={item.name ? `${item.name}` : `${label} #${idx + 1}`}
                        onPreview={onPreview}
                    />
                ))}
            </div>
        </div>
    );
}

function ExistingAttachmentPreview({ url, label, onPreview }) {
    if (!url) return null;
    const fullUrl = resolveMediaUrl(url);
    if (isImageUrl(fullUrl)) {
        return (
            <div className="pc-upload-preview" style={{ marginBottom: 0 }}>
                <img
                    className="pc-upload-thumb"
                    src={fullUrl}
                    alt={label}
                    onClick={() => onPreview({ url: fullUrl, name: label })}
                />
                <div className="pc-upload-meta">
                    <p className="pc-upload-name">{label}</p>
                    <p className="pc-upload-info" style={{ color: '#10b981' }}>File tersimpan di server</p>
                </div>
                <button
                    className="pc-btn-sm n"
                    type="button"
                    onClick={() => onPreview({ url: fullUrl, name: label })}
                >
                    Lihat Bukti
                </button>
            </div>
        );
    }
    return (
        <div className="pc-upload-preview" style={{ marginBottom: 0 }}>
            <div
                className="pc-upload-doc"
                onClick={() => window.open(fullUrl, '_blank')}
                style={{ cursor: 'pointer' }}
            >
                <Paperclip size={20} />
            </div>
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{label}</p>
                <p className="pc-upload-info" style={{ color: '#64748b' }}>Dokumen berkas nota</p>
            </div>
            <a
                href={fullUrl}
                target="_blank"
                rel="noreferrer"
                className="pc-btn-sm n"
                style={{ textDecoration: 'none' }}
            >
                Buka File
            </a>
        </div>
    );
}

function ImageZoomModal({ data, onClose }) {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);

    const rawUrl = typeof data === 'object' && data !== null ? data.url : data;
    const title = typeof data === 'object' && data !== null ? data.name : 'Preview Berkas';
    const fullUrl = resolveMediaUrl(rawUrl);
    const isPdf = Boolean(
        (title && title.toLowerCase().endsWith('.pdf')) ||
        (rawUrl && rawUrl.toLowerCase().includes('.pdf')) ||
        (typeof data === 'object' && data?.file?.type === 'application/pdf')
    );

    const handleZoomIn = (e) => {
        e?.stopPropagation();
        setScale(s => Math.min(Number((s + 0.25).toFixed(2)), 4));
    };

    const handleZoomOut = (e) => {
        e?.stopPropagation();
        setScale(s => Math.max(Number((s - 0.25).toFixed(2)), 0.5));
    };

    const handleRotate = (e) => {
        e?.stopPropagation();
        setRotation(r => (r + 90) % 360);
    };

    const handleReset = (e) => {
        e?.stopPropagation();
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    };

    const handleWheel = (e) => {
        if (isPdf) return;
        e.preventDefault();
        if (e.deltaY < 0) {
            setScale(s => Math.min(Number((s + 0.15).toFixed(2)), 4));
        } else {
            setScale(s => Math.max(Number((s - 0.15).toFixed(2)), 0.5));
        }
    };

    const handleMouseDown = (e) => {
        if (isPdf || e.button !== 0) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    return createPortal(
        <div
            className="pc-overlay"
            onClick={onClose}
            style={{
                zIndex: 10005,
                backdropFilter: 'blur(8px)',
                background: 'rgba(15, 23, 42, 0.82)',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: 'min(96vw, 1100px)',
                    height: '92vh',
                    background: '#0b1329',
                    borderRadius: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header Toolbar */}
                <div style={{
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(15, 23, 42, 0.75)',
                    color: '#f8fafc'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <FileText size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!isPdf && (
                            <>
                                <button type="button" onClick={handleZoomOut} style={zoomBtnStyle} title="Zoom Out (-)"><ZoomOut size={16} /></button>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', minWidth: 42, textAlign: 'center' }}>
                                    {Math.round(scale * 100)}%
                                </span>
                                <button type="button" onClick={handleZoomIn} style={zoomBtnStyle} title="Zoom In (+)"><ZoomIn size={16} /></button>
                                <button type="button" onClick={handleRotate} style={zoomBtnStyle} title="Rotate (R)"><RotateCw size={16} /></button>
                                <button type="button" onClick={handleReset} style={zoomBtnStyle} title="Reset"><Maximize2 size={16} /></button>
                                <div style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.15)', margin: '0 4px' }} />
                            </>
                        )}
                        <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ ...zoomBtnStyle, textDecoration: 'none', color: '#f8fafc', fontSize: 12, padding: '0 10px', width: 'auto', gap: 4 }}
                        >
                            Buka di Tab Baru
                        </a>
                        <button type="button" onClick={onClose} style={{ ...zoomBtnStyle, background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }} title="Tutup (Esc)">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Content Viewport */}
                <div
                    ref={containerRef}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        cursor: isPdf ? 'default' : (isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'default')),
                        background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                        userSelect: 'none'
                    }}
                >
                    {isPdf ? (
                        <iframe
                            src={fullUrl}
                            title={title}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                    ) : (
                        <img
                            src={fullUrl}
                            alt={title}
                            draggable={false}
                            style={{
                                maxWidth: '90%',
                                maxHeight: '90%',
                                objectFit: 'contain',
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                                pointerEvents: 'none'
                            }}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

const zoomBtnStyle = {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 6,
    color: '#f8fafc',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s'
};
