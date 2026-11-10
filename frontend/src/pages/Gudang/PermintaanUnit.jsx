import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    PackagePlus,
    PackageCheck,
    Send,
    CheckCircle2,
    Clock,
    XCircle,
    AlertCircle,
    Eye,
    Printer,
    Check,
    X,
    Trash2,
    Search,
    RotateCw,
    Plus,
    Building2,
    User,
    Calendar,
    FileText,
    Boxes,
    ChevronRight,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateField from '../../components/DateField';
import './PermintaanUnit.css';

export default function PermintaanUnit() {
    const { user } = useAuth();
    const toast = useToast();

    // Data States
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(15);

    // Reference Lists
    const [ruangList, setRuangList] = useState([]);
    const [barangList, setBarangList] = useState([]);

    // Filters
    const [search, setSearch] = useState('');
    const [filterRuang, setFilterRuang] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Modal: Buat Permintaan Baru
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formRuangId, setFormRuangId] = useState('');
    const [formTanggal, setFormTanggal] = useState(() => new Date().toISOString().slice(0, 10));
    const [formCatatan, setFormCatatan] = useState('');
    const [formItems, setFormItems] = useState([
        { barang_id: '', qty: 1, satuan: 'PCS', keterangan: '' }
    ]);

    // Modal: Detail & Tracking
    const [selectedReq, setSelectedReq] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Modal: Approve (Koordinator / Kasi)
    const [approveTarget, setApproveTarget] = useState(null);
    const [approveItems, setApproveItems] = useState([]);
    const [approveSubmitting, setApproveSubmitting] = useState(false);

    // Modal: Tolak (Koordinator / Kasi)
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectAlasan, setRejectAlasan] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);

    // Modal: Hapus Permintaan
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // ── Fetch Master Data (Ruang & Barang) ──
    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const [resRuang, resBarang] = await Promise.all([
                    api.get('/gudang/ruang/'),
                    api.get('/gudang/barang/?page_size=1000&is_active=true')
                ]);
                const ruangs = resRuang.data || [];
                setRuangList(ruangs);

                const barangs = resBarang.data?.results || resBarang.data || [];
                setBarangList(barangs);

                // Auto-detect user unit/ruangan
                if (user?.unit?.nama && ruangs.length > 0) {
                    const matched = ruangs.find(r =>
                        r.nama.toLowerCase().includes(user.unit.nama.toLowerCase()) ||
                        user.unit.nama.toLowerCase().includes(r.nama.toLowerCase())
                    );
                    if (matched) {
                        setFormRuangId(String(matched.id));
                    } else {
                        setFormRuangId(String(ruangs[0].id));
                    }
                } else if (ruangs.length > 0) {
                    setFormRuangId(String(ruangs[0].id));
                }
            } catch (err) {
                console.error('Failed to load master data', err);
            }
        };
        fetchMaster();
    }, [user]);

    // ── Fetch Daftar Permintaan ──
    const fetchRequests = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
            };
            if (search.trim()) params.search = search.trim();
            if (filterRuang) params.ruang = filterRuang;
            if (filterStatus) params.status = filterStatus;

            const res = await api.get('/gudang/permintaan/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setRequests(data);
                setTotalCount(data.length);
            } else {
                setRequests(data.results || []);
                setTotalCount(data.count || 0);
            }
        } catch (err) {
            console.error('Error fetching permintaan', err);
            toast.error('Gagal memuat daftar permintaan barang.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [page, filterRuang, filterStatus]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        fetchRequests();
    };

    const handleResetFilter = () => {
        setSearch('');
        setFilterRuang('');
        setFilterStatus('');
        setPage(1);
    };

    // ── Stats Summary Calculation ──
    const stats = useMemo(() => {
        let total = totalCount;
        let menunggu = 0;
        let disetujui = 0;
        let selesai = 0;
        let ditolak = 0;

        requests.forEach(r => {
            if (r.status === 'MENUNGGU') menunggu++;
            else if (r.status === 'DISETUJUI') disetujui++;
            else if (r.status === 'SELESAI') selesai++;
            else if (r.status === 'DITOLAK') ditolak++;
        });

        return { total, menunggu, disetujui, selesai, ditolak };
    }, [requests, totalCount]);

    // ── Form Permintaan Handlers ──
    const handleOpenCreateModal = () => {
        setFormTanggal(new Date().toISOString().slice(0, 10));
        setFormCatatan('');
        setFormItems([
            { barang_id: '', qty: 1, satuan: 'PCS', keterangan: '' }
        ]);
        setShowCreateModal(true);
    };

    const handleAddItemRow = () => {
        setFormItems(prev => [
            ...prev,
            { barang_id: '', qty: 1, satuan: 'PCS', keterangan: '' }
        ]);
    };

    const handleRemoveItemRow = (idx) => {
        if (formItems.length === 1) return;
        setFormItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleItemChange = (idx, field, value) => {
        const next = [...formItems];
        next[idx][field] = value;

        if (field === 'barang_id') {
            const b = barangList.find(x => String(x.id) === String(value));
            if (b) {
                next[idx].satuan = b.satuan_dasar?.kode || 'PCS';
            }
        }
        setFormItems(next);
    };

    const handleSubmitCreate = async (e) => {
        e.preventDefault();
        const validItems = formItems.filter(it => it.barang_id && Number(it.qty) > 0);
        if (!validItems.length) {
            toast.error('Pilih minimal satu barang dengan kuantitas > 0.');
            return;
        }

        setSaving(true);
        try {
            await api.post('/gudang/permintaan/', {
                ruang: formRuangId,
                tanggal: formTanggal,
                catatan: formCatatan,
                auto_submit: true, // Status otomatis MENUNGGU siap diverifikasi Koordinator
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    qty_minta: it.qty,
                    satuan: it.satuan,
                    keterangan: it.keterangan || ''
                }))
            });

            toast.success('Permintaan barang berhasil diajukan!');
            setShowCreateModal(false);
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal mengajukan permohonan.');
        } finally {
            setSaving(false);
        }
    };

    // ── Approve Handlers (Mas Febri / Koordinator) ──
    const handleOpenApproveModal = (req) => {
        setApproveTarget(req);
        setApproveItems(
            (req.items || []).map(it => ({
                id: it.id,
                barang_nama: it.barang_nama,
                barang_kode: it.barang_kode,
                satuan: it.satuan,
                qty_minta: it.qty_minta,
                qty_disetujui: it.qty_disetujui || it.qty_minta
            }))
        );
        setShowDetailModal(false);
    };

    const handleExecuteApprove = async () => {
        if (!approveTarget) return;
        setApproveSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${approveTarget.id}/approve/`, {
                items: approveItems.map(it => ({
                    id: it.id,
                    qty_disetujui: it.qty_disetujui
                }))
            });
            toast.success(`Permintaan ${approveTarget.nomor} telah disetujui.`);
            setApproveTarget(null);
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menyetujui permohonan.');
        } finally {
            setApproveSubmitting(false);
        }
    };

    // ── Reject Handlers ──
    const handleOpenRejectModal = (req) => {
        setRejectTarget(req);
        setRejectAlasan('');
        setShowDetailModal(false);
    };

    const handleExecuteReject = async (e) => {
        e.preventDefault();
        if (!rejectAlasan.trim()) {
            toast.error('Alasan penolakan wajib diisi.');
            return;
        }
        setRejectSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${rejectTarget.id}/reject/`, {
                alasan: rejectAlasan.trim()
            });
            toast.success(`Permintaan ${rejectTarget.nomor} berhasil ditolak.`);
            setRejectTarget(null);
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menolak permohonan.');
        } finally {
            setRejectSubmitting(false);
        }
    };

    // ── Delete / Cancel Handlers ──
    const handleExecuteDelete = async () => {
        if (!deleteTarget) return;
        setDeleteSubmitting(true);
        try {
            await api.delete(`/gudang/permintaan/${deleteTarget.id}/`);
            toast.success(`Permintaan ${deleteTarget.nomor} berhasil dihapus.`);
            setDeleteTarget(null);
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menghapus permohonan.');
        } finally {
            setDeleteSubmitting(false);
        }
    };

    // ── Print SPB Document ──
    const handlePrintSPB = (req) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Pop-up cetak diblokir oleh browser.');
            return;
        }

        const content = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Surat Permintaan Barang (SPB) - ${req.nomor}</title>
                    <style>
                        body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 25px; color: #111; font-size: 13px; line-height: 1.5; }
                        h2, h3 { margin: 0; padding: 0; }
                        .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
                        .header h2 { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
                        .header p { margin: 3px 0 0 0; font-size: 12px; color: #444; }
                        .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 16px; font-size: 12px; line-height: 1.7; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
                        th, td { border: 1px solid #333; padding: 7px 10px; font-size: 12px; }
                        th { background: #f2f2f2; font-weight: bold; }
                        .sign-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 35px; text-align: center; font-size: 12px; }
                        .sign-space { height: 60px; }
                        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>RS SIAGA AL MUNAWWARAH SAMARINDA</h2>
                        <p>SURAT PERMINTAAN BARANG (SPB / AMPRAHAN UNIT RUANGAN)</p>
                    </div>
                    <div class="info-grid">
                        <div>
                            <strong>Nomor SPB:</strong> ${req.nomor}<br/>
                            <strong>Tanggal Pengajuan:</strong> ${req.tanggal}<br/>
                            <strong>Unit Ruangan:</strong> ${req.ruang_nama}
                        </div>
                        <div>
                            <strong>Diajukan Oleh:</strong> ${req.created_by_nama || '-'}<br/>
                            <strong>Status Otorisasi:</strong> ${req.status}<br/>
                            <strong>Disetujui Oleh:</strong> ${req.approved_by_nama || '-'}
                        </div>
                    </div>
                    ${req.catatan ? `<p style="font-size: 12px; margin: 4px 0 10px;"><strong>Catatan Kebutuhan:</strong> ${req.catatan}</p>` : ''}
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 35px; text-align: center;">No</th>
                                <th style="width: 100px;">Kode Barang</th>
                                <th>Nama Barang / Spesifikasi</th>
                                <th style="width: 80px; text-align: right;">Qty Minta</th>
                                <th style="width: 80px; text-align: right;">Qty Setuju</th>
                                <th style="width: 70px; text-align: center;">Satuan</th>
                                <th>Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(req.items || []).map((it, idx) => `
                                <tr>
                                    <td align="center">${idx + 1}</td>
                                    <td>${it.barang_kode}</td>
                                    <td><strong>${it.barang_nama}</strong></td>
                                    <td align="right">${Number(it.qty_minta).toLocaleString('id-ID')}</td>
                                    <td align="right">${it.qty_disetujui ? Number(it.qty_disetujui).toLocaleString('id-ID') : '-'}</td>
                                    <td align="center">${it.satuan}</td>
                                    <td>${it.keterangan || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="sign-grid">
                        <div>
                            <p>Pemohon Unit Ruangan,</p>
                            <div class="sign-space"></div>
                            <p><strong>( ${req.created_by_nama || '................................'} )</strong></p>
                        </div>
                        <div>
                            <p>Koordinator / Menyetujui,</p>
                            <div class="sign-space"></div>
                            <p><strong>( ${req.approved_by_nama || 'Koordinator Logistik'} )</strong></p>
                        </div>
                        <div>
                            <p>Petugas Gudang Penyerah,</p>
                            <div class="sign-space"></div>
                            <p><strong>( ................................ )</strong></p>
                        </div>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
    };

    // Helper status badge styling
    const renderStatusBadge = (status) => {
        switch (status) {
            case 'MENUNGGU':
                return <span className="pu-badge amber"><Clock size={12} /> Menunggu Otorisasi</span>;
            case 'DISETUJUI':
                return <span className="pu-badge emerald"><CheckCircle2 size={12} /> Disetujui (Siap Diambil)</span>;
            case 'SELESAI':
                return <span className="pu-badge sky"><PackageCheck size={12} /> Selesai Diserahkan</span>;
            case 'DITOLAK':
                return <span className="pu-badge rose"><XCircle size={12} /> Ditolak</span>;
            default:
                return <span className="pu-badge slate">{status}</span>;
        }
    };

    return (
        <div className="pu-page">
            {/* ── 1. Hero Banner ── */}
            <div className="pu-hero">
                <div className="pu-hero-content">
                    <div className="pu-hero-icon">
                        <PackagePlus size={30} />
                    </div>
                    <div className="pu-hero-text">
                        <h1>Permintaan Barang Unit (Amprahan)</h1>
                        <p>
                            Portal mandiri untuk seluruh unit ruangan RS Siaga mengajukan barang kebutuhan operasional,
                            memantau status persetujuan Koordinator, dan mengambil fisik barang di loket gudang.
                        </p>
                    </div>
                </div>
                <div className="pu-hero-action">
                    <button type="button" className="pu-btn-create" onClick={handleOpenCreateModal}>
                        <Plus size={18} /> Ajukan Permintaan Barang
                    </button>
                </div>
            </div>

            {/* ── 2. Stat Summary Counters ── */}
            <div className="pu-stat-grid">
                <div className="pu-stat-card">
                    <div className="pu-stat-icon purple"><Boxes size={22} /></div>
                    <div className="pu-stat-info">
                        <span className="pu-stat-num">{stats.total}</span>
                        <span className="pu-stat-label">Total Permintaan</span>
                    </div>
                </div>
                <div className="pu-stat-card">
                    <div className="pu-stat-icon amber"><Clock size={22} /></div>
                    <div className="pu-stat-info">
                        <span className="pu-stat-num">{stats.menunggu}</span>
                        <span className="pu-stat-label">Menunggu Otorisasi</span>
                    </div>
                </div>
                <div className="pu-stat-card">
                    <div className="pu-stat-icon emerald"><CheckCircle2 size={22} /></div>
                    <div className="pu-stat-info">
                        <span className="pu-stat-num">{stats.disetujui}</span>
                        <span className="pu-stat-label">Disetujui (Siap Ambil)</span>
                    </div>
                </div>
                <div className="pu-stat-card">
                    <div className="pu-stat-icon sky"><PackageCheck size={22} /></div>
                    <div className="pu-stat-info">
                        <span className="pu-stat-num">{stats.selesai}</span>
                        <span className="pu-stat-label">Selesai Diserahkan</span>
                    </div>
                </div>
                <div className="pu-stat-card">
                    <div className="pu-stat-icon rose"><XCircle size={22} /></div>
                    <div className="pu-stat-info">
                        <span className="pu-stat-num">{stats.ditolak}</span>
                        <span className="pu-stat-label">Permintaan Ditolak</span>
                    </div>
                </div>
            </div>

            {/* ── 3. Filter & Table Card ── */}
            <div className="pu-card">
                <form className="pu-filter-row" onSubmit={handleSearchSubmit}>
                    <div className="pu-search-box">
                        <Search size={16} className="pu-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari nomor SPB, catatan, nama pemohon..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: '44px' }}
                        />
                    </div>
                    <select
                        className="pu-select"
                        value={filterRuang}
                        onChange={(e) => { setFilterRuang(e.target.value); setPage(1); }}
                    >
                        <option value="">Semua Ruangan</option>
                        {ruangList.map(r => (
                            <option key={r.id} value={r.id}>{r.nama}</option>
                        ))}
                    </select>
                    <select
                        className="pu-select"
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                    >
                        <option value="">Semua Status</option>
                        <option value="MENUNGGU">Menunggu Otorisasi</option>
                        <option value="DISETUJUI">Disetujui</option>
                        <option value="SELESAI">Selesai</option>
                        <option value="DITOLAK">Ditolak</option>
                    </select>
                    <button type="submit" className="pu-btn primary">
                        <Search size={14} /> Cari
                    </button>
                    {(search || filterRuang || filterStatus) && (
                        <button type="button" className="pu-btn soft" onClick={handleResetFilter}>
                            Reset
                        </button>
                    )}
                    <button type="button" className="pu-btn soft" onClick={fetchRequests} title="Muat Ulang">
                        <RotateCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </form>

                <div className="pu-table-wrap">
                    <table className="pu-table">
                        <thead>
                            <tr>
                                <th>No. Dokumen</th>
                                <th>Tanggal</th>
                                <th>Ruangan Pemohon</th>
                                <th>Item Diminta</th>
                                <th>Status</th>
                                <th>Pemohon</th>
                                <th>Persetujuan</th>
                                <th style={{ textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                            <RotateCw size={18} className="spin" /> Memuat daftar permintaan...
                                        </div>
                                    </td>
                                </tr>
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                        <PackagePlus size={32} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
                                        Belum ada permohonan barang yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                requests.map(req => {
                                    const items = req.items || [];
                                    const previewItems = items.slice(0, 2);
                                    const remainingCount = items.length - previewItems.length;

                                    return (
                                        <tr key={req.id}>
                                            <td>
                                                <strong style={{ color: '#a78bfa' }}>{req.nomor}</strong>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(req.tanggal).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Building2 size={13} style={{ color: '#818cf8' }} />
                                                    <strong>{req.ruang_nama}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="pu-items-preview">
                                                    {previewItems.map(it => (
                                                        <span key={it.id} className="pu-item-pill">
                                                            {it.barang_nama} ({Number(it.qty_minta)} {it.satuan})
                                                        </span>
                                                    ))}
                                                    {remainingCount > 0 && (
                                                        <span className="pu-item-pill" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd' }}>
                                                            +{remainingCount} lainnya
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {renderStatusBadge(req.status)}
                                            </td>
                                            <td>
                                                <small style={{ color: '#94a3b8' }}>{req.created_by_nama || '-'}</small>
                                            </td>
                                            <td>
                                                {req.approved_by_nama ? (
                                                    <small style={{ color: '#34d399', fontWeight: 600 }}>{req.approved_by_nama}</small>
                                                ) : req.status === 'DITOLAK' ? (
                                                    <small style={{ color: '#fb7185' }}>Ditolak</small>
                                                ) : (
                                                    <small style={{ color: '#64748b' }}>-</small>
                                                )}
                                            </td>
                                            <td>
                                                <div className="pu-action-btns" style={{ justifyContent: 'flex-end' }}>
                                                    {/* Lihat Detail & Tracking */}
                                                    <button
                                                        type="button"
                                                        className="pu-action-btn detail"
                                                        onClick={() => { setSelectedReq(req); setShowDetailModal(true); }}
                                                        title="Detail & Lacak Status"
                                                    >
                                                        <Eye size={15} />
                                                    </button>

                                                    {/* Cetak SPB */}
                                                    <button
                                                        type="button"
                                                        className="pu-action-btn print"
                                                        onClick={() => handlePrintSPB(req)}
                                                        title="Cetak SPB (Surat Permintaan)"
                                                    >
                                                        <Printer size={15} />
                                                    </button>

                                                    {/* Otorisasi Setujui (Mas Febri / Koordinator / Kasi) */}
                                                    {req.can_approve && req.status === 'MENUNGGU' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="pu-action-btn approve"
                                                                onClick={() => handleOpenApproveModal(req)}
                                                                title="Verifikasi & Setujui (Koordinator)"
                                                            >
                                                                <Check size={15} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="pu-action-btn reject"
                                                                onClick={() => handleOpenRejectModal(req)}
                                                                title="Tolak Permintaan"
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Hapus / Batalkan jika masih Draft/Menunggu dan milik pembuat */}
                                                    {(req.status === 'DRAFT' || req.status === 'MENUNGGU') &&
                                                        (user?.is_superuser || req.created_by === user?.id) && (
                                                            <button
                                                                type="button"
                                                                className="pu-action-btn delete"
                                                                onClick={() => setDeleteTarget(req)}
                                                                title="Batalkan / Hapus Permintaan"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
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

                {totalCount > pageSize && (
                    <div style={{ marginTop: '16px' }}>
                        <SimplePagination
                            page={page}
                            totalPages={Math.ceil(totalCount / pageSize)}
                            onPageChange={setPage}
                            totalCount={totalCount}
                            pageSize={pageSize}
                        />
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL 1: BUAT PERMINTAAN BARANG BARU */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {showCreateModal && createPortal(
                <div className="pu-modal-overlay" onClick={() => !saving && setShowCreateModal(false)}>
                    <div className="pu-modal" style={{ maxWidth: '780px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <PackagePlus size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', color: '#f8fafc' }}>Buat Permintaan Barang Baru</h3>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                                        Ajukan barang operasional ruangan ke gudang logistik RS Siaga
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="pu-action-btn" onClick={() => setShowCreateModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitCreate}>
                            <div className="pu-modal-body">
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                                            Unit / Ruangan Pemohon *
                                        </label>
                                        <select
                                            className="pu-select"
                                            style={{ width: '100%' }}
                                            value={formRuangId}
                                            onChange={e => setFormRuangId(e.target.value)}
                                            required
                                        >
                                            {ruangList.map(r => (
                                                <option key={r.id} value={r.id}>{r.nama}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                                            Tanggal Permintaan *
                                        </label>
                                        <DateField
                                            value={formTanggal}
                                            onChange={val => setFormTanggal(val)}
                                            placeholder="Pilih tanggal..."
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                                        Catatan / Keperluan Permintaan
                                    </label>
                                    <input
                                        type="text"
                                        className="pu-modal-input"
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.6)',
                                            color: '#f8fafc', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box'
                                        }}
                                        placeholder="Contoh: Kebutuhan operasional mingguan, perbaikan arsip..."
                                        value={formCatatan}
                                        onChange={e => setFormCatatan(e.target.value)}
                                    />
                                </div>

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>
                                            Daftar Barang yang Diminta
                                        </span>
                                        <button type="button" className="pu-btn soft" onClick={handleAddItemRow} style={{ padding: '6px 12px', fontSize: '12px' }}>
                                            <Plus size={14} /> Tambah Baris
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {formItems.map((item, idx) => (
                                            <div key={idx} style={{
                                                display: 'grid',
                                                gridTemplateColumns: '2.5fr 90px 75px 1.5fr 36px',
                                                gap: '8px',
                                                alignItems: 'center'
                                            }}>
                                                <select
                                                    className="pu-select"
                                                    style={{ width: '100%', fontSize: '12.5px' }}
                                                    value={item.barang_id}
                                                    onChange={e => handleItemChange(idx, 'barang_id', e.target.value)}
                                                    required
                                                >
                                                    <option value="">-- Pilih Barang --</option>
                                                    {barangList.map(b => (
                                                        <option key={b.id} value={b.id}>
                                                            [{b.kode}] {b.nama}
                                                        </option>
                                                    ))}
                                                </select>

                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="any"
                                                    style={{
                                                        padding: '10px 10px', borderRadius: '8px',
                                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.6)',
                                                        color: '#f8fafc', fontSize: '13px', textAlign: 'center', outline: 'none'
                                                    }}
                                                    placeholder="Qty"
                                                    value={item.qty}
                                                    onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                                                    required
                                                />

                                                <input
                                                    type="text"
                                                    readOnly
                                                    style={{
                                                        padding: '10px 6px', borderRadius: '8px',
                                                        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
                                                        color: '#cbd5e1', fontSize: '12px', textAlign: 'center'
                                                    }}
                                                    value={item.satuan}
                                                />

                                                <input
                                                    type="text"
                                                    style={{
                                                        padding: '10px 12px', borderRadius: '8px',
                                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.6)',
                                                        color: '#f8fafc', fontSize: '12px', outline: 'none'
                                                    }}
                                                    placeholder="Ket. spesifikasi (opsional)..."
                                                    value={item.keterangan}
                                                    onChange={e => handleItemChange(idx, 'keterangan', e.target.value)}
                                                />

                                                <button
                                                    type="button"
                                                    className="pu-action-btn delete"
                                                    onClick={() => handleRemoveItemRow(idx)}
                                                    disabled={formItems.length === 1}
                                                    title="Hapus baris"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="pu-modal-footer">
                                <button type="button" className="pu-btn soft" onClick={() => setShowCreateModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="pu-btn primary" disabled={saving}>
                                    <Send size={15} /> {saving ? 'Mengirim Permintaan...' : 'Kirim Pengajuan Permintaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL 2: DETAIL PERMINTAAN & STATUS TRACKING */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {showDetailModal && selectedReq && createPortal(
                <div className="pu-modal-overlay" onClick={() => setShowDetailModal(false)}>
                    <div className="pu-modal" style={{ maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
                                    Detail Permintaan: {selectedReq.nomor}
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                                    Ruangan: <strong>{selectedReq.ruang_nama}</strong> &bull; Diajukan: {selectedReq.tanggal}
                                </p>
                            </div>
                            <button type="button" className="pu-action-btn" onClick={() => setShowDetailModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            {/* Visual Timeline Stepper */}
                            <div className="pu-stepper">
                                <div className="pu-step done">
                                    <div className="pu-step-circle">1</div>
                                    <div className="pu-step-title">Diajukan</div>
                                    <div className="pu-step-sub">{selectedReq.created_by_nama || 'Pemohon'}</div>
                                </div>
                                <div className={`pu-step ${selectedReq.status === 'DITOLAK' ? 'rejected' : (selectedReq.status === 'DISETUJUI' || selectedReq.status === 'SELESAI' ? 'done' : 'active')}`}>
                                    <div className="pu-step-circle">2</div>
                                    <div className="pu-step-title">Otorisasi Koordinator</div>
                                    <div className="pu-step-sub">
                                        {selectedReq.status === 'DITOLAK' ? 'Ditolak' : (selectedReq.approved_by_nama || 'Menunggu Otorisasi')}
                                    </div>
                                </div>
                                <div className={`pu-step ${selectedReq.status === 'SELESAI' ? 'done' : 'pending'}`}>
                                    <div className="pu-step-circle">3</div>
                                    <div className="pu-step-title">Penyerahan Fisik</div>
                                    <div className="pu-step-sub">
                                        {selectedReq.status === 'SELESAI' ? (selectedReq.bon_pengeluaran_nomor || 'Selesai') : 'Loket Gudang'}
                                    </div>
                                </div>
                            </div>

                            {/* Alasan Ditolak Alert */}
                            {selectedReq.status === 'DITOLAK' && selectedReq.alasan_tolak && (
                                <div style={{
                                    background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)',
                                    borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center'
                                }}>
                                    <AlertCircle size={18} style={{ color: '#fb7185', flexShrink: 0 }} />
                                    <div>
                                        <strong style={{ color: '#fb7185', fontSize: '13px' }}>Permintaan Ditolak:</strong>
                                        <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#fecdd3' }}>{selectedReq.alasan_tolak}</p>
                                    </div>
                                </div>
                            )}

                            {selectedReq.catatan && (
                                <p style={{ fontSize: '13px', margin: 0, color: '#cbd5e1' }}>
                                    <strong>Catatan:</strong> {selectedReq.catatan}
                                </p>
                            )}

                            {/* Tabel Item Rincian */}
                            <div className="pu-table-wrap">
                                <table className="pu-table">
                                    <thead>
                                        <tr>
                                            <th>No</th>
                                            <th>Kode</th>
                                            <th>Nama Barang</th>
                                            <th style={{ textAlign: 'right' }}>Qty Minta</th>
                                            <th style={{ textAlign: 'right' }}>Qty Setuju</th>
                                            <th>Satuan</th>
                                            <th>Keterangan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedReq.items || []).map((it, idx) => (
                                            <tr key={it.id}>
                                                <td>{idx + 1}</td>
                                                <td><span style={{ color: '#a78bfa' }}>{it.barang_kode}</span></td>
                                                <td><strong>{it.barang_nama}</strong></td>
                                                <td align="right">{Number(it.qty_minta).toLocaleString('id-ID')}</td>
                                                <td align="right" style={{ color: it.qty_disetujui ? '#34d399' : '#94a3b8', fontWeight: 700 }}>
                                                    {it.qty_disetujui ? Number(it.qty_disetujui).toLocaleString('id-ID') : '-'}
                                                </td>
                                                <td>{it.satuan}</td>
                                                <td><small style={{ color: '#94a3b8' }}>{it.keterangan || '-'}</small></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="pu-modal-footer">
                            <button
                                type="button"
                                className="pu-btn soft"
                                onClick={() => handlePrintSPB(selectedReq)}
                            >
                                <Printer size={15} /> Cetak SPB
                            </button>

                            {selectedReq.can_approve && selectedReq.status === 'MENUNGGU' && (
                                <>
                                    <button
                                        type="button"
                                        className="pu-btn"
                                        style={{ background: '#e11d48', color: '#fff' }}
                                        onClick={() => handleOpenRejectModal(selectedReq)}
                                    >
                                        <X size={15} /> Tolak
                                    </button>
                                    <button
                                        type="button"
                                        className="pu-btn primary"
                                        onClick={() => handleOpenApproveModal(selectedReq)}
                                    >
                                        <Check size={15} /> Verifikasi & Setujui
                                    </button>
                                </>
                            )}

                            <button type="button" className="pu-btn soft" onClick={() => setShowDetailModal(false)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL 3: OTORISASI & PERSETUJUAN (KOORDINATOR MAS FEBRI) */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {approveTarget && createPortal(
                <div className="pu-modal-overlay" onClick={() => !approveSubmitting && setApproveTarget(null)}>
                    <div className="pu-modal" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 style={{ margin: 0, fontSize: '17px', color: '#f8fafc' }}>
                                    Verifikasi & Setujui Permintaan
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                    {approveTarget.nomor} &bull; Ruang: <strong>{approveTarget.ruang_nama}</strong>
                                </p>
                            </div>
                            <button type="button" className="pu-action-btn" onClick={() => setApproveTarget(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0 }}>
                                Anda dapat menyesuaikan kuantitas yang disetujui jika stok gudang terbatas atau sesuai jatah kuota unit:
                            </p>

                            <div className="pu-table-wrap">
                                <table className="pu-table">
                                    <thead>
                                        <tr>
                                            <th>Barang</th>
                                            <th style={{ textAlign: 'right' }}>Qty Minta</th>
                                            <th style={{ width: '130px', textAlign: 'center' }}>Qty Disetujui</th>
                                            <th>Satuan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {approveItems.map((it, idx) => (
                                            <tr key={it.id}>
                                                <td>
                                                    <strong>{it.barang_nama}</strong>
                                                    <small style={{ display: 'block', color: '#94a3b8' }}>{it.barang_kode}</small>
                                                </td>
                                                <td align="right">{Number(it.qty_minta).toLocaleString('id-ID')}</td>
                                                <td align="center">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        style={{
                                                            width: '90px', padding: '6px 8px', borderRadius: '6px',
                                                            border: '1px solid #7c3aed', background: 'rgba(124, 58, 237, 0.1)',
                                                            color: '#f8fafc', textAlign: 'center', fontWeight: 700
                                                        }}
                                                        value={it.qty_disetujui}
                                                        onChange={(e) => {
                                                            const next = [...approveItems];
                                                            next[idx].qty_disetujui = e.target.value;
                                                            setApproveItems(next);
                                                        }}
                                                    />
                                                </td>
                                                <td>{it.satuan}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="pu-modal-footer">
                            <button type="button" className="pu-btn soft" onClick={() => setApproveTarget(null)}>
                                Batal
                            </button>
                            <button
                                type="button"
                                className="pu-btn primary"
                                onClick={handleExecuteApprove}
                                disabled={approveSubmitting}
                            >
                                <Check size={15} /> {approveSubmitting ? 'Memproses...' : 'Setujui Permintaan Unit'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL 4: TOLAK PERMINTAAN */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {rejectTarget && createPortal(
                <div className="pu-modal-overlay" onClick={() => !rejectSubmitting && setRejectTarget(null)}>
                    <div className="pu-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 style={{ margin: 0, fontSize: '17px', color: '#fb7185' }}>
                                    Tolak Permintaan Barang
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                    {rejectTarget.nomor} — {rejectTarget.ruang_nama}
                                </p>
                            </div>
                            <button type="button" className="pu-action-btn" onClick={() => setRejectTarget(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteReject}>
                            <div className="pu-modal-body">
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                                    Alasan Penolakan *
                                </label>
                                <textarea
                                    rows="3"
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.6)',
                                        color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                                        resize: 'vertical'
                                    }}
                                    placeholder="Masukkan alasan penolakan untuk unit pemohon..."
                                    value={rejectAlasan}
                                    onChange={e => setRejectAlasan(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="pu-modal-footer">
                                <button type="button" className="pu-btn soft" onClick={() => setRejectTarget(null)}>
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="pu-btn"
                                    style={{ background: '#e11d48', color: '#fff' }}
                                    disabled={rejectSubmitting}
                                >
                                    <X size={15} /> {rejectSubmitting ? 'Menolak...' : 'Tolak Permintaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* MODAL 5: KONFIRMASI HAPUS PERMINTAAN */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {deleteTarget && createPortal(
                <div className="pu-modal-overlay" onClick={() => !deleteSubmitting && setDeleteTarget(null)}>
                    <div className="pu-modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 style={{ margin: 0, fontSize: '17px', color: '#f43f5e' }}>
                                    Hapus Permintaan Barang
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                    Tindakan ini tidak dapat dibatalkan
                                </p>
                            </div>
                            <button type="button" className="pu-action-btn" onClick={() => setDeleteTarget(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            <p style={{ fontSize: '13.5px', color: '#cbd5e1', margin: 0, lineHeight: 1.6 }}>
                                Apakah Anda yakin ingin menghapus permohonan <strong>{deleteTarget.nomor}</strong> ({deleteTarget.ruang_nama})?
                            </p>
                        </div>

                        <div className="pu-modal-footer">
                            <button type="button" className="pu-btn soft" onClick={() => setDeleteTarget(null)}>
                                Batal
                            </button>
                            <button
                                type="button"
                                className="pu-btn"
                                style={{ background: '#f43f5e', color: '#fff' }}
                                onClick={handleExecuteDelete}
                                disabled={deleteSubmitting}
                            >
                                <Trash2 size={15} /> {deleteSubmitting ? 'Menghapus...' : 'Hapus Permanen'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
