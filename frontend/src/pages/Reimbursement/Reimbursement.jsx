import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Receipt, Plus, Search,
    AlertTriangle, Eye, Paperclip, Upload, Trash2,
    Check, AlertCircle, FileText, User, ZoomIn, ZoomOut, RotateCw,
    Maximize2, Calendar, ClipboardList, ShieldAlert, X
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { getCount, getResults, pageCount, pageParams, RowSizeSelect } from '../../utils/pagination.jsx';
import DateField from '../../components/DateField';
import DateRangePicker from '../../components/DateRangePicker';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';
import '../PettyCash/PettyCash.css';
import './Reimbursement.css';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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

const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp');
};

const RB_STATUS = {
    pending:   { label: 'Menunggu Approval', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui',         bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    dicairkan: { label: 'Dicairkan',         bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    ditolak:   { label: 'Ditolak',           bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dibatalkan:{ label: 'Dibatalkan',        bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};

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

function ModalSection({ icon, title, children }) {
    return (
        <section className="pc-modal-section">
            {title && <p className="pc-modal-section-title">{icon}{title}</p>}
            {children}
        </section>
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

function MultiAttachmentItemPreview({ item, onRemove, onPreview }) {
    const isImg = item.file ? item.file.type.startsWith('image/') : isImageUrl(item.url);
    return (
        <div className="pc-upload-preview" style={{ marginBottom: 0 }}>
            {isImg && item.url ? (
                <img
                    className="pc-upload-thumb"
                    src={item.url}
                    alt={item.name}
                    onClick={() => onPreview({ url: item.url, name: item.name, file: item.file })}
                />
            ) : (
                <div
                    className="pc-upload-doc"
                    onClick={() => onPreview({ url: item.url, name: item.name, file: item.file })}
                >
                    <Paperclip size={20} />
                </div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{item.name}</p>
                <p className="pc-upload-info">
                    {item.size ? formatFileSize(item.size) : 'Berkas'}
                    {item.compressed && (
                        <span style={{ color: '#16a34a', marginLeft: 6, fontWeight: 700 }}>
                            (Terkonversi)
                        </span>
                    )}
                </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                {item.url && (
                    <button
                        className="pc-btn-sm n"
                        type="button"
                        onClick={() => onPreview({ url: item.url, name: item.name, file: item.file })}
                        title="Lihat file ini"
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
                        {items.length > 0 ? `${items.length} file nota / struk dipilih` : 'Upload Nota / Struk Bukti Fisik *'}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>
                        Bisa pilih lebih dari 1 file nota (JPG, PNG, PDF). Gambar otomatis dikompres.
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

function ExistingAttachmentsList({ list, fallbackUrl, label = 'Nota / Bukti Fisik', onPreview }) {
    const items = (list && list.length > 0)
        ? list
        : (fallbackUrl ? [{ id: 'main', url: fallbackUrl, name: label }] : []);

    if (items.length === 0) return null;

    return (
        <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {label} ({items.length} berkas)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, idx) => {
                    const fullUrl = resolveMediaUrl(item.url);
                    const isImg = isImageUrl(fullUrl);
                    const itemLabel = item.name ? `${item.name}` : `${label} #${idx + 1}`;
                    return (
                        <div key={item.id || idx} className="pc-upload-preview" style={{ marginBottom: 0 }}>
                            {isImg ? (
                                <img
                                    className="pc-upload-thumb"
                                    src={fullUrl}
                                    alt={itemLabel}
                                    onClick={() => onPreview({ url: fullUrl, name: itemLabel })}
                                />
                            ) : (
                                <div
                                    className="pc-upload-doc"
                                    onClick={() => window.open(fullUrl, '_blank')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Paperclip size={20} />
                                </div>
                            )}
                            <div className="pc-upload-meta">
                                <p className="pc-upload-name">{itemLabel}</p>
                                <p className="pc-upload-info" style={{ color: isImg ? '#10b981' : '#64748b' }}>
                                    {isImg ? 'Foto tersimpan di server' : 'Dokumen berkas nota'}
                                </p>
                            </div>
                            <button
                                className="pc-btn-sm n"
                                type="button"
                                onClick={() => {
                                    if (isImg) onPreview({ url: fullUrl, name: itemLabel });
                                    else window.open(fullUrl, '_blank');
                                }}
                            >
                                {isImg ? 'Lihat Bukti' : 'Buka File'}
                            </button>
                        </div>
                    );
                })}
            </div>
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

function StableFilterBar({ searchVal, onSearch, statusVal, onStatus, statusCfg, dariVal, onDari, sampaiVal, onSampai, onReset, hasFilter }) {
    return (
        <div className="kb-filter-bar">
            <div className="kb-filter-row">
                <div className="kb-filter-search">
                    <Search size={15} />
                    <input
                        className="kb-filter-input"
                        placeholder="Cari No. RB, keperluan, atau pemohon..."
                        value={searchVal}
                        onChange={e => onSearch(e.target.value)}
                    />
                </div>
                <select className="kb-filter-select" value={statusVal} onChange={e => onStatus(e.target.value)}>
                    <option value="">Semua Status</option>
                    {Object.entries(statusCfg).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
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

    // Data states
    const [listRB, setListRB] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filters & Pagination
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDari, setFilterDari] = useState(null);
    const [filterSampai, setFilterSampai] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    // Modals
    const [modalAjukan, setModalAjukan] = useState(false);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalBatal, setModalBatal] = useState(null);
    const [modalRevisi, setModalRevisi] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

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
    const [fotoList, setFotoList] = useState([]); // [{ file, url, name, size, compressed }]

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

    const showSuccess = (msg) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3500);
    };

    const resetError = () => setError('');

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
        fotoList.forEach(item => {
            if (item.url && item.url.startsWith('blob:')) {
                URL.revokeObjectURL(item.url);
            }
        });
        setFotoList([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (multiPhotoInputRef.current) multiPhotoInputRef.current.value = '';
        setError('');
    };

    // Fetch list from API
    const fetchList = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
                ordering: '-tanggal',
            };
            if (filterStatus) params.status = filterStatus;
            if (filterDari) params.dari = dateToStr(filterDari);
            if (filterSampai) params.sampai = dateToStr(filterSampai);

            const res = await api.get('/keuangan/reimbursement/', { params });
            const data = res.data;
            if (data.results) {
                setListRB(data.results);
                setTotalCount(data.count || 0);
            } else if (Array.isArray(data)) {
                setListRB(data);
                setTotalCount(data.length);
            }
        } catch (err) {
            console.error(err);
            setError('Gagal memuat data reimbursement.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canAccess) {
            fetchList();
        }
    }, [canAccess, page, pageSize, filterStatus, filterDari, filterSampai]);

    // Multi Photo Handler with compression
    const handleMultiPhotoChange = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        setError('');
        const validFiles = [];
        for (const file of files) {
            const err = validateImageFile(file, { maxSizeMB: 20 });
            if (err) {
                setError(err);
                continue;
            }
            validFiles.push(file);
        }

        if (!validFiles.length) return;

        try {
            const compressed = await compressImages(validFiles, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
            const newItems = compressed.map(item => ({
                file: item.file,
                url: URL.createObjectURL(item.file),
                name: item.file.name,
                size: item.file.size,
                compressed: item.compressed,
            }));
            setFotoList(prev => [...prev, ...newItems]);
        } catch (err) {
            console.error(err);
            setError('Gagal memproses/mengompres foto bukti nota.');
        } finally {
            if (multiPhotoInputRef.current) multiPhotoInputRef.current.value = '';
        }
    };

    const removeFotoItem = (index) => {
        setFotoList(prev => {
            const item = prev[index];
            if (item?.url && item.url.startsWith('blob:')) {
                URL.revokeObjectURL(item.url);
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    // Handle submit pengajuan baru
    const handleAjukan = async () => {
        setError('');
        if (!formData.keperluan.trim()) {
            return setError('Keperluan pengajuan wajib diisi.');
        }
        if (!formData.nominal || Number(formData.nominal) <= 0) {
            return setError('Nominal reimbursement harus lebih besar dari 0.');
        }
        if (!formData.tanggal_nota) {
            return setError('Tanggal nota bukti fisik wajib diisi.');
        }

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal', todayStr());
            fd.append('tanggal_nota', formData.tanggal_nota || todayStr());
            fd.append('keperluan', formData.keperluan.trim());
            fd.append('nominal', formData.nominal);
            if (formData.keterangan.trim()) {
                fd.append('keterangan', formData.keterangan.trim());
            }
            if (berkasUtama) {
                fd.append('berkas', berkasUtama);
            }
            fotoList.forEach(item => {
                fd.append('fotos', item.file);
            });

            await api.post('/keuangan/reimbursement/', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            showSuccess('Pengajuan reimbursement berhasil diajukan!');
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

    // Handle submit revisi
    const handleRevisi = async () => {
        if (!modalRevisi) return;
        setError('');
        if (!formData.keperluan.trim()) {
            return setError('Keperluan pengajuan wajib diisi.');
        }
        if (!formData.nominal || Number(formData.nominal) <= 0) {
            return setError('Nominal reimbursement harus lebih besar dari 0.');
        }

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal', modalRevisi.tanggal ? String(modalRevisi.tanggal) : todayStr());
            fd.append('tanggal_nota', formData.tanggal_nota || todayStr());
            fd.append('keperluan', formData.keperluan.trim());
            fd.append('nominal', formData.nominal);
            if (formData.keterangan.trim()) {
                fd.append('keterangan', formData.keterangan.trim());
            }
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

    // Client-side search & filtering
    const filteredRB = useMemo(() => {
        return listRB.filter(i => {
            if (filterStatus && i.status !== filterStatus) return false;
            if (search) {
                const q = search.toLowerCase();
                const matchNo = i.no_reimbursement?.toLowerCase().includes(q);
                const matchKep = i.keperluan?.toLowerCase().includes(q);
                const matchUser = i.created_by_name?.toLowerCase().includes(q);
                if (!matchNo && !matchKep && !matchUser) return false;
            }
            if (filterDari && new Date(i.tanggal) < filterDari) return false;
            if (filterSampai) {
                const s = new Date(filterSampai);
                s.setHours(23, 59, 59);
                if (new Date(i.tanggal) > s) return false;
            }
            return true;
        });
    }, [listRB, filterStatus, search, filterDari, filterSampai]);


    const totalPages = pageCount(search ? filteredRB.length : totalCount, pageSize);
    const pagedRB = search ? filteredRB : listRB;

    // Access Denied Screen
    if (!canAccess) {
        return (
            <div className="pc-page pc-shell" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ maxWidth: 460, margin: '0 auto', background: '#fff', padding: 36, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
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

    const mainContent = (
        <>
            {/* Notifications */}
            {success && (
                <div className="pc-alert-ok">
                    <Check size={16} /> {success}
                </div>
            )}
            {error && !modalAjukan && !modalApproval && !modalBatal && !modalRevisi && (
                <div className="pc-alert-err">
                    <AlertCircle size={16} /> {error}
                </div>
            )}


            {/* Section Card */}
            <div className="pc-section-card">
                <div className="pc-table-titlebar">
                    <div>
                        <p className="pc-table-heading">Daftar Reimbursement</p>
                        <p className="pc-table-subheading">
                            {search ? filteredRB.length : totalCount} pengajuan ditemukan
                        </p>
                    </div>
                    <button
                        className="pc-action-primary"
                        onClick={() => {
                            resetForm();
                            setModalAjukan(true);
                        }}
                    >
                        <Plus size={16} />
                        Ajukan Reimbursement
                    </button>
                </div>

                <StableFilterBar
                    searchVal={search}
                    onSearch={setSearch}
                    statusVal={filterStatus}
                    onStatus={setFilterStatus}
                    statusCfg={RB_STATUS}
                    dariVal={filterDari}
                    onDari={setFilterDari}
                    sampaiVal={filterSampai}
                    onSampai={setFilterSampai}
                    onReset={() => {
                        setSearch('');
                        setFilterStatus('');
                        setFilterDari(null);
                        setFilterSampai(null);
                    }}
                    hasFilter={Boolean(search || filterStatus || filterDari || filterSampai)}
                />

                {loading ? (
                    <div className="pc-empty-state">Memuat data...</div>
                ) : pagedRB.length === 0 ? (
                    <div className="pc-empty-state">Tidak ada data pengajuan reimbursement.</div>
                ) : (
                    <div className="pc-table-wrap">
                        <table className="pc-table">
                            <thead>
                                <tr>
                                    <th>No. Reimbursement</th>
                                    <th>Tanggal Pengajuan</th>
                                    <th>Keperluan</th>
                                    <th>Diajukan Oleh</th>
                                    <th>Nominal</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRB.map((item, idx) => (
                                    <tr key={item.id} className="pc-tr" style={{ animationDelay: `${Math.min(idx, 8) * 0.03}s` }}>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a4731', fontSize: 13 }}>
                                                {item.no_reimbursement}
                                            </span>
                                        </td>
                                        <td style={{ color: '#64748b' }}>{fmtTgl(item.tanggal)}</td>
                                        <td style={{ maxWidth: 220 }}>
                                            <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                                                {item.keperluan}
                                            </p>
                                            {item.tanggal_nota && (
                                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, margin: 0 }}>
                                                    Tgl Nota: {fmtTgl(item.tanggal_nota)}
                                                </p>
                                            )}
                                        </td>
                                        <td>{item.created_by_name || '-'}</td>
                                        <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                        <td>
                                            {(() => {
                                                const st = RB_STATUS[item.status] || { label: item.status, bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
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
                                                    <button
                                                        className="pc-btn-sm g"
                                                        onClick={() => {
                                                            setApprovalForm({ aksi: 'setujui', catatan_tolak: '' });
                                                            resetError();
                                                            setModalApproval(item);
                                                        }}
                                                    >
                                                        Approval
                                                    </button>
                                                )}
                                                <button className="pc-btn-sm n" onClick={() => setModalDetail(item)}>
                                                    Detail
                                                </button>
                                                {item.status === 'ditolak' && item.created_by === user?.id && (
                                                    <button
                                                        className="pc-btn-sm b revision"
                                                        onClick={() => {
                                                            setFormData({
                                                                tanggal_pengajuan: item.tanggal ? String(item.tanggal) : todayStr(),
                                                                tanggal_nota: item.tanggal_nota ? String(item.tanggal_nota) : todayStr(),
                                                                nominal: item.nominal,
                                                                keperluan: item.keperluan,
                                                                keterangan: item.keterangan || '',
                                                            });
                                                            setBerkasUtama(null);
                                                            setBerkasUtamaInfo(null);
                                                            setFotoList([]);
                                                            resetError();
                                                            setModalRevisi(item);
                                                        }}
                                                        title="Revisi Pengajuan"
                                                    >
                                                        Revisi
                                                    </button>
                                                )}
                                                {['pending', 'disetujui'].includes(item.status) && (item.created_by === user?.id || isDirekturWadir) && (
                                                    <button
                                                        className="pc-btn-sm r"
                                                        onClick={() => {
                                                            resetError();
                                                            setBatalForm({ alasan: '' });
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

                {(search ? filteredRB.length : totalCount) > 0 && (
                    <div className="pc-pagination">
                        <span className="pc-page-info">
                            Hal {page} dari {totalPages} - {search ? filteredRB.length : totalCount} data
                        </span>
                        <div className="pc-page-btns">
                            <RowSizeSelect
                                className="pc-filter-select"
                                value={pageSize}
                                onChange={(size) => {
                                    setPageSize(size);
                                    setPage(1);
                                }}
                            />
                            <button className="pc-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                                &lt;
                            </button>
                            <button className="pc-page-btn active">{page}</button>
                            <button className="pc-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                                &gt;
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );

    return (
        <>
            {isEmbedded ? (
                mainContent
            ) : (
                <div className="pc-page pc-shell">
                    <div className="pc-hero">
                        <div className="pc-hero-main">
                            <div className="pc-page-title">
                                <span><Receipt size={22} /></span>
                                <div>
                                    <h1 className="pc-title">Reimbursement</h1>
                                    <p className="pc-subtitle">
                                        Pengajuan penggantian biaya operasional dan pencatatan otomatis ke Catatan Utang.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {mainContent}
                </div>
            )}

            {/* ══ MODAL AJUKAN / REVISI REIMBURSEMENT ══ */}
            {(modalAjukan || modalRevisi) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-modal-native-scroll">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title={modalRevisi ? `Revisi - ${modalRevisi.no_reimbursement}` : 'Ajukan Reimbursement'}
                            subtitle={modalRevisi ? 'Perbaiki data pengajuan sesuai catatan evaluasi pimpinan.' : 'Isi tanggal nota, nominal biaya, keperluan, dan lampirkan bukti nota/kuitansi.'}
                        />

                        {modalRevisi?.catatan_tolak && (
                            <div className="pc-rejection">
                                <strong>Alasan Evaluasi / Penolakan:</strong> {modalRevisi.catatan_tolak}
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
                                    <div className="pc-input-readonly" title="Tanggal pengajuan terkunci otomatis hari ini">
                                        <Calendar size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                        <span>{fmtTgl(modalRevisi ? modalRevisi.tanggal : todayStr())}</span>
                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: 6, marginLeft: 'auto' }}>
                                            Hari Ini (Otomatis)
                                        </span>
                                    </div>
                                </div>

                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Nota / Bukti Fisik *</label>
                                    <DateField
                                        value={formData.tanggal_nota}
                                        onChange={tanggal_nota => setFormData({ ...formData, tanggal_nota })}
                                        placeholder="Pilih tanggal nota..."
                                    />
                                </div>
                            </div>
                        </ModalSection>

                        <ModalSection icon={<DollarSign size={14} />} title="Rincian Penggantian">
                            <div className="pc-field">
                                <label className="pc-label">Nominal Reimbursement (Rp) *</label>
                                <input
                                    className="pc-input"
                                    type="number"
                                    placeholder="Contoh: 150000"
                                    value={formData.nominal}
                                    onChange={e => setFormData({ ...formData, nominal: e.target.value })}
                                />
                            </div>

                            <div className="pc-field">
                                <label className="pc-label">Keperluan Penggantian *</label>
                                <input
                                    className="pc-input"
                                    type="text"
                                    placeholder="Contoh: Pembelian bensin operasional ambulans darurat..."
                                    value={formData.keperluan}
                                    onChange={e => setFormData({ ...formData, keperluan: e.target.value })}
                                />
                            </div>

                            <div className="pc-field">
                                <label className="pc-label">Keterangan Tambahan (Opsional)</label>
                                <textarea
                                    className="pc-textarea"
                                    style={{ minHeight: 70 }}
                                    placeholder="Catatan rincian biaya atau informasi pendukung lainnya..."
                                    value={formData.keterangan}
                                    onChange={e => setFormData({ ...formData, keterangan: e.target.value })}
                                />
                            </div>
                        </ModalSection>

                        <ModalSection icon={<Paperclip size={14} />} title="Bukti Nota / Kuitansi">
                            {modalRevisi && ((modalRevisi.foto_list && modalRevisi.foto_list.length > 0) || modalRevisi.berkas_url || modalRevisi.berkas) && fotoList.length === 0 && !berkasUtama && (
                                <div style={{ marginBottom: 12 }}>
                                    <ExistingAttachmentsList
                                        list={modalRevisi.foto_list}
                                        fallbackUrl={modalRevisi.berkas_url || modalRevisi.berkas}
                                        label="Berkas & Nota Saat Ini"
                                        onPreview={setImagePreview}
                                    />
                                    <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                        Berkas dan foto nota lama akan tetap tersimpan jika Anda tidak mengunggah file baru di bawah.
                                    </p>
                                </div>
                            )}
                            <MultiAttachmentUploader
                                items={fotoList}
                                onRemove={removeFotoItem}
                                onPreview={setImagePreview}
                                onPick={() => multiPhotoInputRef.current?.click()}
                            />
                            <input
                                ref={multiPhotoInputRef}
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                style={{ display: 'none' }}
                                onChange={handleMultiPhotoChange}
                            />

                            {/* Berkas PDF Tambahan */}
                            <div style={{ marginTop: 14 }}>
                                <FileUploadZone
                                    file={berkasUtama}
                                    label="Upload Berkas Lampiran Utama (PDF/Dokumen) jika ada"
                                    hint="Format PDF, DOCX, atau ZIP maksimal 10 MB"
                                    onPick={() => fileInputRef.current?.click()}
                                />
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setBerkasUtama(file);
                                            setBerkasUtamaInfo({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' });
                                        }
                                    }}
                                />
                            </div>
                        </ModalSection>

                        <div className="pc-modal-footer">
                            <button
                                className="pc-btn-ghost"
                                onClick={() => {
                                    setModalAjukan(false);
                                    setModalRevisi(null);
                                    resetError();
                                }}
                            >
                                Batal
                            </button>
                            <button
                                className="pc-btn-primary"
                                onClick={modalRevisi ? handleRevisi : handleAjukan}
                                disabled={saving}
                            >
                                {saving ? 'Menyimpan...' : modalRevisi ? 'Submit Revisi' : 'Submit Reimbursement'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL DETAIL REIMBURSEMENT ══ */}
            {modalDetail && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-modal-native-scroll">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title={`Detail - ${modalDetail.no_reimbursement}`}
                            subtitle={`Diajukan pada ${fmtTgl(modalDetail.tanggal)}`}
                        />

                        <ModalSummary
                            label="Nominal Penggantian"
                            value={fmt(modalDetail.nominal)}
                            description={modalDetail.keperluan}
                            meta={`Diajukan oleh: ${modalDetail.created_by_name || '-'}`}
                            side={
                                (() => {
                                    const st = RB_STATUS[modalDetail.status] || { label: modalDetail.status, bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
                                    return (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, background: st.bg, color: st.color, fontSize: 12, fontWeight: 700 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                                            {st.label}
                                        </span>
                                    );
                                })()
                            }
                        />

                        <ModalSection icon={<ClipboardList size={14} />} title="Informasi Lengkap">
                            <div className="pc-grid2" style={{ marginBottom: 12 }}>
                                <div>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Tanggal Pengajuan</p>
                                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalDetail.tanggal)}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Tanggal Nota / Kuitansi</p>
                                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalDetail.tanggal_nota || modalDetail.tanggal)}</p>
                                </div>
                            </div>

                            {modalDetail.keterangan && (
                                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Keterangan Tambahan:</p>
                                    <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.5 }}>{modalDetail.keterangan}</p>
                                </div>
                            )}

                            {modalDetail.catatan_tolak && (
                                <div className="pc-rejection" style={{ marginBottom: 12 }}>
                                    <strong>Catatan Penolakan / Evaluasi:</strong> {modalDetail.catatan_tolak}
                                </div>
                            )}

                            {modalDetail.kas_besar_info && (
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', margin: 0 }}>
                                        Dihasilkan dari Kas Besar Over-Budget:
                                    </p>
                                    <p style={{ fontSize: 13, color: '#1e40af', margin: '3px 0 0', fontWeight: 600 }}>
                                        {modalDetail.kas_besar_info.no_pengajuan} - {modalDetail.kas_besar_info.keperluan}
                                    </p>
                                </div>
                            )}

                            {/* Bukti Nota & Foto */}
                            <ExistingAttachmentsList
                                list={modalDetail.foto_list}
                                fallbackUrl={modalDetail.berkas}
                                label="Bukti Nota / Kuitansi Fisik"
                                onPreview={setImagePreview}
                            />
                        </ModalSection>

                        <div className="pc-modal-footer">
                            {['pending', 'disetujui'].includes(modalDetail.status) && (modalDetail.created_by === user?.id || isDirekturWadir) && (
                                <button
                                    className="pc-btn-primary danger"
                                    style={{ marginRight: 'auto' }}
                                    onClick={() => {
                                        const target = modalDetail;
                                        setModalDetail(null);
                                        resetError();
                                        setBatalForm({ alasan: '' });
                                        setModalBatal(target);
                                    }}
                                >
                                    <X size={15} /> Batalkan Reimbursement
                                </button>
                            )}
                            <button className="pc-btn-ghost" onClick={() => setModalDetail(null)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL APPROVAL REIMBURSEMENT (BU NEVI / DIREKSI) ══ */}
            {modalApproval && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <div style={{ marginBottom: 18 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f2d1a', margin: 0 }}>Proses Reimbursement</h2>
                            <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 0' }}>
                                Tinjau bukti nota dan setujui untuk diteruskan ke Catatan Utang Rumah Sakit.
                            </p>
                        </div>

                        <div className="pc-approval-summary">
                            <div className="pc-approval-top">
                                <span className="pc-approval-no">{modalApproval.no_reimbursement}</span>
                                <span className="pc-approval-date">{fmtTgl(modalApproval.tanggal)}</span>
                            </div>
                            <div className="pc-approval-amount-row">
                                <p className="pc-approval-amount">{fmt(modalApproval.nominal)}</p>
                                <span className="pc-approval-amount-sub">Nominal Penggantian</span>
                            </div>

                            <div className="pc-popup-applicant-block">
                                <div className="pc-popup-grid-row">
                                    <span className="pc-popup-grid-label">
                                        <User size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Pemohon :
                                    </span>
                                    <span className="pc-popup-grid-val">{modalApproval.created_by_name || '-'}</span>
                                </div>
                                <div className="pc-popup-grid-row">
                                    <span className="pc-popup-grid-label">
                                        <FileText size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Keperluan :
                                    </span>
                                    <span className="pc-popup-grid-val">{modalApproval.keperluan}</span>
                                </div>
                                {modalApproval.tanggal_nota && (
                                    <div className="pc-popup-grid-row">
                                        <span className="pc-popup-grid-label">
                                            <Calendar size={14} style={{ color: '#10b981', flexShrink: 0 }} /> Tgl Nota :
                                        </span>
                                        <span className="pc-popup-grid-val">{fmtTgl(modalApproval.tanggal_nota)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field" style={{ marginTop: 14 }}>
                            <label className="pc-label">Keputusan Persetujuan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalForm.aksi === 'setujui' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_rb"
                                        value="setujui"
                                        checked={approvalForm.aksi === 'setujui'}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'setujui' })}
                                    />
                                    <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_rb"
                                        value="tolak"
                                        checked={approvalForm.aksi === 'tolak'}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'tolak' })}
                                    />
                                    <X size={15} /> Tolak
                                </label>
                            </div>
                        </div>

                        {approvalForm.aksi === 'tolak' && (
                            <div className="pc-field">
                                <label className="pc-label">Catatan Penolakan / Evaluasi *</label>
                                <textarea
                                    className="pc-textarea"
                                    placeholder="Tuliskan alasan penolakan..."
                                    value={approvalForm.catatan_tolak}
                                    onChange={e => setApprovalForm({ ...approvalForm, catatan_tolak: e.target.value })}
                                />
                            </div>
                        )}

                        <div className="pc-modal-footer">
                            <button
                                className="pc-btn-ghost"
                                onClick={() => {
                                    setModalApproval(null);
                                    resetError();
                                }}
                            >
                                Batal
                            </button>
                            <button
                                className={`pc-btn-primary${approvalForm.aksi === 'tolak' ? ' danger' : ''}`}
                                onClick={handleApproval}
                                disabled={saving}
                            >
                                {saving ? 'Memproses...' : approvalForm.aksi === 'setujui' ? 'Setujui Reimbursement' : 'Tolak Reimbursement'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ MODAL BATAL REIMBURSEMENT ══ */}
            {modalBatal && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <div style={{ marginBottom: 18 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', margin: 0 }}>Batalkan Reimbursement</h2>
                            <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 0' }}>
                                Apakah Anda yakin ingin membatalkan pengajuan <strong>{modalBatal.no_reimbursement}</strong>?
                            </p>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field">
                            <label className="pc-label">Alasan Pembatalan *</label>
                            <textarea
                                className="pc-textarea"
                                placeholder="Tuliskan alasan mengapa reimbursement ini dibatalkan..."
                                value={batalForm.alasan}
                                onChange={e => setBatalForm({ alasan: e.target.value })}
                            />
                        </div>

                        <div className="pc-modal-footer">
                            <button
                                className="pc-btn-ghost"
                                onClick={() => {
                                    setModalBatal(null);
                                    resetError();
                                }}
                            >
                                Tutup
                            </button>
                            <button
                                className="pc-btn-primary danger"
                                onClick={handleBatal}
                                disabled={saving}
                            >
                                {saving ? 'Membatalkan...' : 'Konfirmasi Batal'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══ LIGHTBOX / IMAGE ZOOM MODAL ══ */}
            {imagePreview && (
                <ImageZoomModal
                    data={imagePreview}
                    onClose={() => setImagePreview(null)}
                />
            )}
        </>
    );
}
