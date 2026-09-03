import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Receipt, Plus, Search, Filter, Calendar, DollarSign,
    CheckCircle, XCircle, Clock, AlertTriangle, Eye, RefreshCw,
    X, Paperclip, Upload, Trash2, Maximize2, ShieldAlert, ArrowLeft,
    Check, AlertCircle, FileText, User, ChevronRight, CornerDownRight
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';
import DateRangePicker from '../../components/DateRangePicker';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';
import './Reimbursement.css';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};
const todayStr = () => new Date().toISOString().split('T')[0];

const RB_STATUS = {
    pending:   { label: 'Menunggu Approval', class: 'pending', icon: Clock },
    disetujui: { label: 'Disetujui', class: 'disetujui', icon: CheckCircle },
    dicairkan: { label: 'Dicairkan', class: 'dicairkan', icon: DollarSign },
    ditolak:   { label: 'Ditolak', class: 'ditolak', icon: XCircle },
    dibatalkan:{ label: 'Dibatalkan', class: 'dibatalkan', icon: AlertTriangle },
};

export default function Reimbursement({ isEmbedded = false }) {
    const { user } = useAuth();

    // Permission checks
    const canAccess = useMemo(() => {
        if (!user) return false;
        return Boolean(
            user.is_superuser ||
            user.akses_reimbursement ||
            user.is_keuangan ||
            user.is_petty_cash_cashier ||
            ['manajer', 'wakil_direktur', 'direktur'].includes(user.role)
        );
    }, [user]);

    const isDirekturWadir = useMemo(() => {
        if (!user) return false;
        return ['direktur', 'wakil_direktur'].includes(user.role) || user.is_superuser;
    }, [user]);

    const isManajerOrAbove = useMemo(() => {
        if (!user) return false;
        return ['manajer', 'wakil_direktur', 'direktur'].includes(user.role) || user.is_superuser;
    }, [user]);

    // Data states
    const [listRB, setListRB] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filters & Pagination
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDari, setFilterDari] = useState('');
    const [filterSampai, setFilterSampai] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [totalCount, setTotalCount] = useState(0);

    // Modals
    const [modalAjukan, setModalAjukan] = useState(false);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalBatal, setModalBatal] = useState(null);
    const [modalRevisi, setModalRevisi] = useState(null);
    const [modalLightbox, setModalLightbox] = useState(null);

    // Form state for Ajukan / Revisi
    const [formData, setFormData] = useState({
        tanggal_pengajuan: todayStr(),
        tanggal_nota: todayStr(),
        nominal: '',
        keperluan: '',
        keterangan: '',
    });
    const [berkasUtama, setBerkasUtama] = useState(null);
    const [berkasUtamaInfo, setBerkasUtamaInfo] = useState(null);
    const [fotoList, setFotoList] = useState([]); // [{ file, url, name, size }]

    const fileInputRef = useRef(null);
    const multiPhotoInputRef = useRef(null);

    // Approval form state
    const [approvalForm, setApprovalForm] = useState({
        aksi: 'setujui',
        catatan_tolak: '',
    });

    // Batal form state
    const [batalForm, setBatalForm] = useState({
        alasan: '',
    });

    // Fetch data
    const fetchList = async () => {
        if (!canAccess) return;
        setLoading(true);
        setError('');
        try {
            const params = {
                page,
                page_size: pageSize,
                status: filterStatus || undefined,
                dari: filterDari || undefined,
                sampai: filterSampai || undefined,
                search: search ? search.trim() : undefined,
            };
            const res = await api.get('/keuangan/reimbursement/', { params });
            if (res.data && res.data.results !== undefined) {
                setListRB(res.data.results);
                setTotalCount(res.data.count || res.data.results.length);
            } else if (Array.isArray(res.data)) {
                setListRB(res.data);
                setTotalCount(res.data.length);
            }
        } catch (err) {
            console.error('Failed to fetch reimbursements:', err);
            setError(err.response?.data?.detail || 'Gagal memuat data reimbursement.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchList();
    }, [page, pageSize, filterStatus, filterDari, filterSampai]);

    // Handle search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchList();
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    // Notification helper
    const showSuccess = (msg) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 4000);
    };

    // Reset Form
    const resetForm = () => {
        setFormData({
            tanggal_pengajuan: todayStr(),
            tanggal_nota: todayStr(),
            nominal: '',
            keperluan: '',
            keterangan: '',
        });
        setBerkasUtama(null);
        setBerkasUtamaInfo(null);
        setFotoList([]);
        setError('');
    };

    // Handle single berkas pick
    const handleBerkasChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
            const val = validateImageFile(file);
            if (!val.isValid) {
                setError(val.error);
                return;
            }
            try {
                const [compressed] = await compressImages([file], { maxSizeMB: 0.8, maxWidthOrHeight: 1920 });
                setBerkasUtama(compressed);
                setBerkasUtamaInfo({
                    name: file.name,
                    size: formatFileSize(compressed.size),
                    originalSize: formatFileSize(file.size),
                });
            } catch {
                setBerkasUtama(file);
                setBerkasUtamaInfo({ name: file.name, size: formatFileSize(file.size) });
            }
        } else {
            setBerkasUtama(file);
            setBerkasUtamaInfo({ name: file.name, size: formatFileSize(file.size) });
        }
    };

    // Handle multi photo pick
    const handleMultiPhotoChange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newPhotos = [];
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const [compressed] = await compressImages([file], { maxSizeMB: 0.8, maxWidthOrHeight: 1920 });
                newPhotos.push({
                    file: compressed,
                    url: URL.createObjectURL(compressed),
                    name: file.name,
                    size: formatFileSize(compressed.size),
                });
            } catch {
                newPhotos.push({
                    file,
                    url: URL.createObjectURL(file),
                    name: file.name,
                    size: formatFileSize(file.size),
                });
            }
        }
        setFotoList(prev => [...prev, ...newPhotos]);
    };

    const removePhoto = (idx) => {
        setFotoList(prev => {
            const copy = [...prev];
            if (copy[idx]?.url) URL.revokeObjectURL(copy[idx].url);
            copy.splice(idx, 1);
            return copy;
        });
    };

    // Submit Buat Reimbursement
    const handleBuatRB = async (e) => {
        e?.preventDefault();
        setError('');

        if (!formData.tanggal_nota) return setError('Tanggal nota / bukti transaksi wajib diisi.');
        if (!formData.nominal || Number(formData.nominal) <= 0) return setError('Nominal reimbursement harus lebih dari 0.');
        if (!formData.keperluan.trim()) return setError('Keperluan reimbursement wajib diisi.');
        if (!berkasUtama && fotoList.length === 0) return setError('Lampirkan minimal 1 bukti nota / kuitansi fisik.');

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal_nota', formData.tanggal_nota);
            fd.append('nominal', formData.nominal);
            fd.append('keperluan', formData.keperluan.trim());
            if (formData.keterangan.trim()) fd.append('keterangan', formData.keterangan.trim());

            if (berkasUtama) {
                fd.append('berkas', berkasUtama);
            } else if (fotoList.length > 0) {
                fd.append('berkas', fotoList[0].file);
            }

            fotoList.forEach(item => {
                fd.append('fotos', item.file);
            });

            await api.post('/keuangan/reimbursement/', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            showSuccess('Pengajuan reimbursement berhasil disubmit!');
            setModalAjukan(false);
            resetForm();
            fetchList();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || err.response?.data?.error || 'Gagal mengajukan reimbursement.');
        } finally {
            setSaving(false);
        }
    };

    // Submit Revisi
    const handleRevisiRB = async (e) => {
        e?.preventDefault();
        if (!modalRevisi) return;
        setError('');

        if (!formData.tanggal_nota) return setError('Tanggal nota wajib diisi.');
        if (!formData.nominal || Number(formData.nominal) <= 0) return setError('Nominal reimbursement harus lebih dari 0.');
        if (!formData.keperluan.trim()) return setError('Keperluan reimbursement wajib diisi.');

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal_nota', formData.tanggal_nota);
            fd.append('nominal', formData.nominal);
            fd.append('keperluan', formData.keperluan.trim());
            if (formData.keterangan.trim()) fd.append('keterangan', formData.keterangan.trim());

            if (berkasUtama) {
                fd.append('berkas', berkasUtama);
            }
            fotoList.forEach(item => {
                fd.append('fotos', item.file);
            });

            await api.post(`/keuangan/reimbursement/${modalRevisi.id}/revisi/`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            showSuccess('Reimbursement berhasil direvisi dan diajukan ulang!');
            setModalRevisi(null);
            resetForm();
            fetchList();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || err.response?.data?.error || 'Gagal menyimpan revisi.');
        } finally {
            setSaving(false);
        }
    };

    // Handle Approval (Bu Nevi / Direksi)
    const handleApproval = async () => {
        if (!modalApproval) return;
        setError('');
        if (approvalForm.aksi === 'tolak' && !approvalForm.catatan_tolak.trim()) {
            return setError('Catatan alasan tolak wajib diisi.');
        }

        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalApproval.id}/approval/`, {
                aksi: approvalForm.aksi,
                catatan_tolak: approvalForm.catatan_tolak.trim(),
            });
            showSuccess(`Reimbursement berhasil ${approvalForm.aksi === 'setujui' ? 'disetujui (diteruskan ke Catatan Utang)' : 'ditolak'}!`);
            setModalApproval(null);
            fetchList();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Gagal memproses approval.');
        } finally {
            setSaving(false);
        }
    };

    // Handle Batal
    const handleBatal = async () => {
        if (!modalBatal) return;
        setError('');
        if (!batalForm.alasan.trim()) {
            return setError('Alasan pembatalan wajib diisi.');
        }

        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalBatal.id}/batal/`, {
                alasan_batal: batalForm.alasan.trim(),
                alasan: batalForm.alasan.trim(),
            });
            showSuccess('Reimbursement berhasil dibatalkan.');
            setModalBatal(null);
            setBatalForm({ alasan: '' });
            fetchList();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Gagal membatalkan reimbursement.');
        } finally {
            setSaving(false);
        }
    };

    // Summary counts
    const stats = useMemo(() => {
        const total = listRB.length;
        const pending = listRB.filter(i => i.status === 'pending').length;
        const disetujui = listRB.filter(i => i.status === 'disetujui').length;
        const dicairkan = listRB.filter(i => i.status === 'dicairkan').length;
        const ditolak = listRB.filter(i => i.status === 'ditolak').length;
        return { total, pending, disetujui, dicairkan, ditolak };
    }, [listRB]);

    // Access Denied Screen
    if (!canAccess) {
        return (
            <div className="rb-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ maxWidth: 460, margin: '0 auto', background: '#fff', padding: 36, borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 20, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Akses Terbatas</h2>
                    <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                        Anda belum memiliki izin akses untuk fitur Reimbursement. Hubungi Administrator untuk mengaktifkan izin <strong>Akses Reimbursement</strong> di Manajemen User.
                    </p>
                </div>
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return (
        <div className="rb-container">
            {/* Header Banner */}
            {!isEmbedded && (
                <div className="rb-header-banner">
                    <div className="rb-header-title">
                        <div className="rb-header-icon">
                            <Receipt size={28} />
                        </div>
                        <div>
                            <h1>Modul Reimbursement</h1>
                            <p>Pengajuan penggantian biaya operasional dan sinkronisasi otomatis ke Catatan Utang.</p>
                        </div>
                    </div>
                    <button
                        className="rb-btn-submit-hero"
                        onClick={() => { resetForm(); setModalAjukan(true); }}
                    >
                        <Plus size={18} />
                        Ajukan Reimbursement
                    </button>
                </div>
            )}

            {/* Notifications */}
            {success && (
                <div className="rb-alert success" style={{ marginBottom: 16 }}>
                    <Check size={18} />
                    <span>{success}</span>
                </div>
            )}
            {error && !modalAjukan && !modalApproval && !modalBatal && !modalRevisi && (
                <div className="rb-alert error" style={{ marginBottom: 16 }}>
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Stats Overview */}
            <div className="rb-stats-grid">
                <div className="rb-stat-card">
                    <div className="rb-stat-icon blue"><Receipt size={22} /></div>
                    <div className="rb-stat-info">
                        <p>Total Data</p>
                        <h3>{totalCount}</h3>
                    </div>
                </div>
                <div className="rb-stat-card">
                    <div className="rb-stat-icon amber"><Clock size={22} /></div>
                    <div className="rb-stat-info">
                        <p>Menunggu Approval</p>
                        <h3>{stats.pending}</h3>
                    </div>
                </div>
                <div className="rb-stat-card">
                    <div className="rb-stat-icon purple"><CheckCircle size={22} /></div>
                    <div className="rb-stat-info">
                        <p>Disetujui</p>
                        <h3>{stats.disetujui}</h3>
                    </div>
                </div>
                <div className="rb-stat-card">
                    <div className="rb-stat-icon green"><DollarSign size={22} /></div>
                    <div className="rb-stat-info">
                        <p>Dicairkan</p>
                        <h3>{stats.dicairkan}</h3>
                    </div>
                </div>
                <div className="rb-stat-card">
                    <div className="rb-stat-icon rose"><XCircle size={22} /></div>
                    <div className="rb-stat-info">
                        <p>Ditolak</p>
                        <h3>{stats.ditolak}</h3>
                    </div>
                </div>
            </div>

            {/* Main Section */}
            <div className="rb-section-card">
                {/* Filter Bar */}
                <div className="rb-filter-bar">
                    <div className="rb-search-box">
                        <Search className="rb-search-icon" size={16} />
                        <input
                            type="text"
                            placeholder="Cari No. RB, keperluan, pemohon..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="rb-filter-actions">
                        <select
                            className="rb-select"
                            value={filterStatus}
                            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                        >
                            <option value="">Semua Status</option>
                            <option value="pending">Menunggu Approval</option>
                            <option value="disetujui">Disetujui</option>
                            <option value="dicairkan">Dicairkan</option>
                            <option value="ditolak">Ditolak</option>
                            <option value="dibatalkan">Dibatalkan</option>
                        </select>

                        <DateRangePicker
                            dari={filterDari}
                            sampai={filterSampai}
                            onChange={({ dari, sampai }) => {
                                setFilterDari(dari || '');
                                setFilterSampai(sampai || '');
                                setPage(1);
                            }}
                        />

                        {(search || filterStatus || filterDari || filterSampai) && (
                            <button
                                className="rb-btn-reset"
                                onClick={() => {
                                    setSearch('');
                                    setFilterStatus('');
                                    setFilterDari('');
                                    setFilterSampai('');
                                    setPage(1);
                                }}
                            >
                                <RefreshCw size={14} />
                                Reset
                            </button>
                        )}

                        {isEmbedded && (
                            <button
                                className="rb-btn-action primary"
                                style={{ padding: '9px 16px', borderRadius: 10 }}
                                onClick={() => { resetForm(); setModalAjukan(true); }}
                            >
                                <Plus size={16} />
                                Ajukan Reimbursement
                            </button>
                        )}
                    </div>
                </div>

                {/* Table Data */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                        <RefreshCw className="spin" size={24} style={{ margin: '0 auto 10px' }} />
                        <p style={{ margin: 0, fontSize: 14 }}>Memuat daftar reimbursement...</p>
                    </div>
                ) : listRB.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                        <Receipt size={40} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#334155' }}>Tidak ada data pengajuan</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: 13 }}>Belum ada reimbursement yang sesuai dengan filter pencarian.</p>
                    </div>
                ) : (
                    <div className="rb-table-wrap">
                        <table className="rb-table">
                            <thead>
                                <tr>
                                    <th>No. Reimburse</th>
                                    <th>Tgl Pengajuan</th>
                                    <th>Tgl Nota</th>
                                    <th>Pemohon</th>
                                    <th>Keperluan</th>
                                    <th>Nominal</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listRB.map((item) => {
                                    const st = RB_STATUS[item.status] || RB_STATUS.pending;
                                    const StIcon = st.icon;
                                    return (
                                        <tr key={item.id}>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#065f46', fontSize: 13 }}>
                                                    {item.no_reimbursement}
                                                </span>
                                            </td>
                                            <td style={{ color: '#64748b', fontSize: 13 }}>{fmtTgl(item.tanggal)}</td>
                                            <td style={{ color: '#0f172a', fontWeight: 600, fontSize: 13 }}>
                                                {item.tanggal_nota ? fmtTgl(item.tanggal_nota) : '-'}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.created_by_name || '-'}</div>
                                                {item.created_by_unit && (
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.created_by_unit}</div>
                                                )}
                                            </td>
                                            <td style={{ maxWidth: 220 }}>
                                                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.keperluan}>
                                                    {item.keperluan}
                                                </div>
                                                {item.keterangan && (
                                                    <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.keterangan}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 800, color: '#047857', fontSize: 14 }}>
                                                    {fmt(item.nominal)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`rb-badge ${st.class}`}>
                                                    <StIcon size={12} />
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="rb-action-group">
                                                    {isDirekturWadir && item.status === 'pending' && (
                                                        <button
                                                            className="rb-btn-action primary"
                                                            onClick={() => {
                                                                setApprovalForm({ aksi: 'setujui', catatan_tolak: '' });
                                                                setError('');
                                                                setModalApproval(item);
                                                            }}
                                                        >
                                                            <CheckCircle size={13} />
                                                            Proses
                                                        </button>
                                                    )}

                                                    <button
                                                        className="rb-btn-action default"
                                                        onClick={() => setModalDetail(item)}
                                                    >
                                                        <Eye size={13} />
                                                        Detail
                                                    </button>

                                                    {item.status === 'ditolak' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button
                                                            className="rb-btn-action blue"
                                                            onClick={() => {
                                                                setFormData({
                                                                    tanggal_pengajuan: item.tanggal,
                                                                    tanggal_nota: item.tanggal_nota || item.tanggal,
                                                                    nominal: item.nominal,
                                                                    keperluan: item.keperluan,
                                                                    keterangan: item.keterangan || '',
                                                                });
                                                                setBerkasUtama(null);
                                                                setBerkasUtamaInfo(null);
                                                                setFotoList([]);
                                                                setError('');
                                                                setModalRevisi(item);
                                                            }}
                                                        >
                                                            <RefreshCw size={13} />
                                                            Revisi
                                                        </button>
                                                    )}

                                                    {item.status !== 'dibatalkan' && item.status !== 'dicairkan' &&
                                                        (item.created_by === user?.id || isDirekturWadir || user?.is_superuser) && (
                                                        <button
                                                            className="rb-btn-action danger"
                                                            onClick={() => {
                                                                setBatalForm({ alasan: '' });
                                                                setError('');
                                                                setModalBatal(item);
                                                            }}
                                                        >
                                                            <Trash2 size={13} />
                                                            Batal
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalCount > 0 && (
                    <div className="rb-pagination">
                        <div className="rb-page-info">
                            Menampilkan hal {page} dari {totalPages} ({totalCount} total data)
                        </div>
                        <div className="rb-page-buttons">
                            <button
                                className="rb-page-btn"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                Sebelumnya
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                .map((p, idx, arr) => (
                                    <React.Fragment key={p}>
                                        {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}
                                        <button
                                            className={`rb-page-btn ${page === p ? 'active' : ''}`}
                                            onClick={() => setPage(p)}
                                        >
                                            {p}
                                        </button>
                                    </React.Fragment>
                                ))
                            }
                            <button
                                className="rb-page-btn"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                            >
                                Berikutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL AJUKAN REIMBURSEMENT */}
            {modalAjukan && (
                <div className="rb-modal-overlay">
                    <div className="rb-modal-card">
                        <div className="rb-modal-header">
                            <div className="rb-modal-title">
                                <Receipt size={20} color="#059669" />
                                <h2>Ajukan Reimbursement</h2>
                            </div>
                            <button className="rb-modal-close" onClick={() => setModalAjukan(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleBuatRB}>
                            <div className="rb-modal-body">
                                {error && (
                                    <div className="rb-alert error">
                                        <AlertCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="rb-form-grid-2">
                                    <div className="rb-form-group">
                                        <label className="rb-label">
                                            Tanggal Pengajuan <small>(Terkunci Hari Ini)</small>
                                        </label>
                                        <DateField
                                            value={formData.tanggal_pengajuan}
                                            disabled={true}
                                            placeholder="Hari ini..."
                                        />
                                    </div>

                                    <div className="rb-form-group">
                                        <label className="rb-label">
                                            Tanggal Nota / Kuitansi Fisik *
                                        </label>
                                        <DateField
                                            value={formData.tanggal_nota}
                                            onChange={t => setFormData({ ...formData, tanggal_nota: t })}
                                            placeholder="Pilih tanggal nota..."
                                        />
                                    </div>
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Nominal (Rp) *</label>
                                    <input
                                        type="number"
                                        className="rb-input"
                                        placeholder="0"
                                        value={formData.nominal}
                                        onChange={e => setFormData({ ...formData, nominal: e.target.value })}
                                        min="1"
                                    />
                                    {formData.nominal && (
                                        <small style={{ color: '#059669', fontWeight: 600, marginTop: 3 }}>
                                            {fmt(formData.nominal)}
                                        </small>
                                    )}
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Keperluan Pengeluaran *</label>
                                    <textarea
                                        className="rb-textarea"
                                        placeholder="Contoh: Pembelian perlengkapan kantor darurat, konsumsi rapat pimpinan..."
                                        value={formData.keperluan}
                                        onChange={e => setFormData({ ...formData, keperluan: e.target.value })}
                                    />
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Keterangan Tambahan <small>(Opsional)</small></label>
                                    <textarea
                                        className="rb-textarea"
                                        style={{ minHeight: 64 }}
                                        placeholder="Catatan tambahan bila diperlukan..."
                                        value={formData.keterangan}
                                        onChange={e => setFormData({ ...formData, keterangan: e.target.value })}
                                    />
                                </div>

                                {/* Upload Berkas Utama & Multi Foto */}
                                <div className="rb-form-group">
                                    <label className="rb-label">Upload Bukti Nota / Kuitansi Fisik *</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        style={{ display: 'none' }}
                                        onChange={handleBerkasChange}
                                    />
                                    <input
                                        ref={multiPhotoInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={handleMultiPhotoChange}
                                    />

                                    <div
                                        className="rb-upload-dropzone"
                                        onClick={() => multiPhotoInputRef.current?.click()}
                                    >
                                        <Upload size={24} color="#059669" style={{ margin: '0 auto' }} />
                                        <p>Klik untuk upload foto bukti nota / kuitansi</p>
                                        <span>Bisa upload beberapa foto sekaligus (JPG, PNG)</span>
                                    </div>

                                    {/* Preview Berkas Utama */}
                                    {berkasUtamaInfo && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '8px 14px', borderRadius: 8, marginTop: 8, border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                                                <Paperclip size={14} color="#059669" />
                                                <span>{berkasUtamaInfo.name} ({berkasUtamaInfo.size})</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setBerkasUtama(null); setBerkasUtamaInfo(null); }}
                                                style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Thumbnails of multi photos */}
                                    {fotoList.length > 0 && (
                                        <div className="rb-photos-grid">
                                            {fotoList.map((item, idx) => (
                                                <div key={idx} className="rb-photo-thumb">
                                                    <img src={item.url} alt={`Bukti ${idx+1}`} />
                                                    <button
                                                        type="button"
                                                        className="rb-photo-remove"
                                                        onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="rb-modal-footer">
                                <button
                                    type="button"
                                    className="rb-btn-action default"
                                    onClick={() => setModalAjukan(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="rb-btn-action primary"
                                    disabled={saving}
                                >
                                    {saving ? 'Menyimpan...' : 'Submit Pengajuan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL REVISI REIMBURSEMENT */}
            {modalRevisi && (
                <div className="rb-modal-overlay">
                    <div className="rb-modal-card">
                        <div className="rb-modal-header">
                            <div className="rb-modal-title">
                                <RefreshCw size={20} color="#2563eb" />
                                <h2>Revisi Reimbursement - {modalRevisi.no_reimbursement}</h2>
                            </div>
                            <button className="rb-modal-close" onClick={() => setModalRevisi(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleRevisiRB}>
                            <div className="rb-modal-body">
                                {modalRevisi.catatan_tolak && (
                                    <div className="rb-alert error">
                                        <AlertTriangle size={16} />
                                        <div>
                                            <strong>Alasan Penolakan:</strong>
                                            <div>{modalRevisi.catatan_tolak}</div>
                                        </div>
                                    </div>
                                )}
                                {error && (
                                    <div className="rb-alert error">
                                        <AlertCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="rb-form-grid-2">
                                    <div className="rb-form-group">
                                        <label className="rb-label">Tanggal Nota Fisik *</label>
                                        <DateField
                                            value={formData.tanggal_nota}
                                            onChange={t => setFormData({ ...formData, tanggal_nota: t })}
                                            placeholder="Pilih tanggal nota..."
                                        />
                                    </div>
                                    <div className="rb-form-group">
                                        <label className="rb-label">Nominal (Rp) *</label>
                                        <input
                                            type="number"
                                            className="rb-input"
                                            value={formData.nominal}
                                            onChange={e => setFormData({ ...formData, nominal: e.target.value })}
                                            min="1"
                                        />
                                    </div>
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Keperluan *</label>
                                    <textarea
                                        className="rb-textarea"
                                        value={formData.keperluan}
                                        onChange={e => setFormData({ ...formData, keperluan: e.target.value })}
                                    />
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Keterangan</label>
                                    <textarea
                                        className="rb-textarea"
                                        style={{ minHeight: 64 }}
                                        value={formData.keterangan}
                                        onChange={e => setFormData({ ...formData, keterangan: e.target.value })}
                                    />
                                </div>

                                <div className="rb-form-group">
                                    <label className="rb-label">Update Bukti / Lampiran (Bila Ada)</label>
                                    <input
                                        ref={multiPhotoInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={handleMultiPhotoChange}
                                    />
                                    <div
                                        className="rb-upload-dropzone"
                                        onClick={() => multiPhotoInputRef.current?.click()}
                                    >
                                        <Upload size={20} color="#059669" style={{ margin: '0 auto' }} />
                                        <p>Klik untuk tambah foto baru</p>
                                    </div>
                                    {fotoList.length > 0 && (
                                        <div className="rb-photos-grid">
                                            {fotoList.map((item, idx) => (
                                                <div key={idx} className="rb-photo-thumb">
                                                    <img src={item.url} alt={`Foto ${idx+1}`} />
                                                    <button
                                                        type="button"
                                                        className="rb-photo-remove"
                                                        onClick={() => removePhoto(idx)}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="rb-modal-footer">
                                <button
                                    type="button"
                                    className="rb-btn-action default"
                                    onClick={() => setModalRevisi(null)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="rb-btn-action blue"
                                    disabled={saving}
                                >
                                    {saving ? 'Menyimpan...' : 'Submit Revisi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DETAIL REIMBURSEMENT */}
            {modalDetail && (
                <div className="rb-modal-overlay">
                    <div className="rb-modal-card wide">
                        <div className="rb-modal-header">
                            <div className="rb-modal-title">
                                <FileText size={20} color="#047857" />
                                <div>
                                    <h2>Detail Reimbursement</h2>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{modalDetail.no_reimbursement}</span>
                                </div>
                            </div>
                            <button className="rb-modal-close" onClick={() => setModalDetail(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="rb-modal-body">
                            {/* Status Banner */}
                            {modalDetail.status === 'disetujui' && (
                                <div className="rb-alert info">
                                    <CheckCircle size={18} />
                                    <div>
                                        <strong>Pengajuan Disetujui Pimpinan</strong>
                                        <div style={{ fontSize: 12.5, marginTop: 2 }}>
                                            Reimbursement ini otomatis masuk ke antrean <strong>Menunggu Verifikasi</strong> pada modul <strong>Catatan Utang</strong> untuk proses realisasi pembayaran oleh Keuangan.
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalDetail.status === 'ditolak' && modalDetail.catatan_tolak && (
                                <div className="rb-alert error">
                                    <XCircle size={18} />
                                    <div>
                                        <strong>Alasan Penolakan:</strong>
                                        <div style={{ fontSize: 13, marginTop: 2 }}>{modalDetail.catatan_tolak}</div>
                                    </div>
                                </div>
                            )}

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, background: '#f8fafc', padding: 18, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>STATUS</span>
                                    <div style={{ marginTop: 4 }}>
                                        <span className={`rb-badge ${RB_STATUS[modalDetail.status]?.class || 'pending'}`}>
                                            {RB_STATUS[modalDetail.status]?.label || modalDetail.status}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TANGGAL PENGAJUAN</span>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                                        {fmtTgl(modalDetail.tanggal)}
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TANGGAL NOTA FISIK</span>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                                        {modalDetail.tanggal_nota ? fmtTgl(modalDetail.tanggal_nota) : '-'}
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>NOMINAL REIMBURSEMENT</span>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#047857', marginTop: 2 }}>
                                        {fmt(modalDetail.nominal)}
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>PEMOHON</span>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                                        {modalDetail.created_by_name || '-'}
                                    </div>
                                    {modalDetail.created_by_unit && (
                                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{modalDetail.created_by_unit}</div>
                                    )}
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>DISETUJUI OLEH</span>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', marginTop: 4 }}>
                                        {modalDetail.disetujui_oleh_name || '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Keperluan & Keterangan */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Keperluan:</span>
                                    <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#0f172a', lineHeight: 1.5, background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                        {modalDetail.keperluan}
                                    </p>
                                </div>
                                {modalDetail.keterangan && (
                                    <div>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Keterangan Tambahan:</span>
                                        <p style={{ margin: '4px 0 0 0', fontSize: 13.5, color: '#334155', lineHeight: 1.5, background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                            {modalDetail.keterangan}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Lampiran & Galeri Bukti Nota */}
                            <div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>
                                    Bukti Fisik Transaksi & Lampiran:
                                </span>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    {modalDetail.berkas_url && (
                                        <a
                                            href={modalDetail.berkas_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                                        >
                                            <Paperclip size={15} />
                                            <span>Buka Berkas Utama (PDF/Gambar)</span>
                                        </a>
                                    )}

                                    {modalDetail.foto_list && modalDetail.foto_list.length > 0 && modalDetail.foto_list.map((f, i) => (
                                        <div
                                            key={f.id || i}
                                            style={{ width: 90, height: 90, borderRadius: 10, overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'pointer', position: 'relative' }}
                                            onClick={() => setModalLightbox(f.foto)}
                                        >
                                            <img src={f.foto} alt={`Bukti ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, textAlign: 'center', padding: '2px 0' }}>
                                                Foto {i+1}
                                            </div>
                                        </div>
                                    ))}

                                    {!modalDetail.berkas_url && (!modalDetail.foto_list || modalDetail.foto_list.length === 0) && (
                                        <span style={{ fontSize: 13, color: '#94a3b8' }}>Tidak ada lampiran berkas fisik.</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rb-modal-footer">
                            {isDirekturWadir && modalDetail.status === 'pending' && (
                                <button
                                    className="rb-btn-action primary"
                                    onClick={() => {
                                        setModalApproval(modalDetail);
                                        setApprovalForm({ aksi: 'setujui', catatan_tolak: '' });
                                    }}
                                >
                                    <CheckCircle size={14} />
                                    Proses Approval
                                </button>
                            )}
                            <button
                                className="rb-btn-action default"
                                onClick={() => setModalDetail(null)}
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL APPROVAL (PIMPINAN / BU NEVI) */}
            {modalApproval && (
                <div className="rb-modal-overlay">
                    <div className="rb-modal-card">
                        <div className="rb-modal-header">
                            <div className="rb-modal-title">
                                <CheckCircle size={20} color="#059669" />
                                <h2>Approval Reimbursement</h2>
                            </div>
                            <button className="rb-modal-close" onClick={() => setModalApproval(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="rb-modal-body">
                            {error && (
                                <div className="rb-alert error">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>Nomor: <strong>{modalApproval.no_reimbursement}</strong></div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                                    {fmt(modalApproval.nominal)}
                                </div>
                                <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4 }}>
                                    {modalApproval.keperluan}
                                </div>
                            </div>

                            <div className="rb-form-group">
                                <label className="rb-label">Tindakan</label>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        type="button"
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            borderRadius: 10,
                                            border: `2px solid ${approvalForm.aksi === 'setujui' ? '#059669' : '#e2e8f0'}`,
                                            background: approvalForm.aksi === 'setujui' ? '#ecfdf5' : '#fff',
                                            color: approvalForm.aksi === 'setujui' ? '#065f46' : '#64748b',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                        }}
                                        onClick={() => setApprovalForm({ ...approvalForm, aksi: 'setujui' })}
                                    >
                                        <CheckCircle size={18} />
                                        Setujui Pengajuan
                                    </button>

                                    <button
                                        type="button"
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            borderRadius: 10,
                                            border: `2px solid ${approvalForm.aksi === 'tolak' ? '#dc2626' : '#e2e8f0'}`,
                                            background: approvalForm.aksi === 'tolak' ? '#fef2f2' : '#fff',
                                            color: approvalForm.aksi === 'tolak' ? '#b91c1c' : '#64748b',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                        }}
                                        onClick={() => setApprovalForm({ ...approvalForm, aksi: 'tolak' })}
                                    >
                                        <XCircle size={18} />
                                        Tolak Pengajuan
                                    </button>
                                </div>
                            </div>

                            {approvalForm.aksi === 'tolak' && (
                                <div className="rb-form-group">
                                    <label className="rb-label">Catatan Alasan Penolakan *</label>
                                    <textarea
                                        className="rb-textarea"
                                        placeholder="Berikan alasan penolakan agar pemohon dapat memperbaiki pengajuannya..."
                                        value={approvalForm.catatan_tolak}
                                        onChange={e => setApprovalForm({ ...approvalForm, catatan_tolak: e.target.value })}
                                    />
                                </div>
                            )}

                            {approvalForm.aksi === 'setujui' && (
                                <div style={{ fontSize: 13, color: '#047857', background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                                    Setelah disetujui, pengajuan akan otomatis terdaftar di <strong>Catatan Utang</strong> bagian Keuangan untuk verifikasi dan penjadwalan pembayaran.
                                </div>
                            )}
                        </div>

                        <div className="rb-modal-footer">
                            <button
                                className="rb-btn-action default"
                                onClick={() => setModalApproval(null)}
                                disabled={saving}
                            >
                                Batal
                            </button>
                            <button
                                className={`rb-btn-action ${approvalForm.aksi === 'setujui' ? 'primary' : 'danger'}`}
                                onClick={handleApproval}
                                disabled={saving}
                            >
                                {saving ? 'Memproses...' : approvalForm.aksi === 'setujui' ? 'Konfirmasi Setujui' : 'Konfirmasi Tolak'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL BATAL */}
            {modalBatal && (
                <div className="rb-modal-overlay">
                    <div className="rb-modal-card">
                        <div className="rb-modal-header">
                            <div className="rb-modal-title">
                                <Trash2 size={20} color="#dc2626" />
                                <h2>Batalkan Reimbursement</h2>
                            </div>
                            <button className="rb-modal-close" onClick={() => setModalBatal(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="rb-modal-body">
                            {error && (
                                <div className="rb-alert error">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                                Anda akan membatalkan reimbursement <strong>{modalBatal.no_reimbursement}</strong> senilai <strong>{fmt(modalBatal.nominal)}</strong>.
                            </p>

                            <div className="rb-form-group">
                                <label className="rb-label">Alasan Pembatalan *</label>
                                <textarea
                                    className="rb-textarea"
                                    placeholder="Jelaskan alasan pembatalan reimbursement..."
                                    value={batalForm.alasan}
                                    onChange={e => setBatalForm({ alasan: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="rb-modal-footer">
                            <button
                                className="rb-btn-action default"
                                onClick={() => setModalBatal(null)}
                                disabled={saving}
                            >
                                Kembali
                            </button>
                            <button
                                className="rb-btn-action danger"
                                onClick={handleBatal}
                                disabled={saving}
                            >
                                {saving ? 'Membatalkan...' : 'Ya, Batalkan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX MODAL ZOOM PREVIEW */}
            {modalLightbox && (
                <div className="rb-lightbox-overlay" onClick={() => setModalLightbox(null)}>
                    <div className="rb-lightbox-content" onClick={e => e.stopPropagation()}>
                        <button className="rb-lightbox-close" onClick={() => setModalLightbox(null)}>
                            <X size={18} />
                        </button>
                        <img src={modalLightbox} alt="Bukti Zoom" className="rb-lightbox-img" />
                    </div>
                </div>
            )}
        </div>
    );
}
