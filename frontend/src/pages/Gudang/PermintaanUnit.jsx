import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    PackagePlus,
    PackageCheck,
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
    ChevronRight,
    Lock,
    MoreHorizontal,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';
import './PermintaanUnit.css';

export default function PermintaanUnit() {
    const { user } = useAuth();
    const toast = useToast();

    // Data States
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [unfilteredTotal, setUnfilteredTotal] = useState(0);
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

    // Row action dropdown menu (position: fixed via portal)
    const [openMenu, setOpenMenu] = useState(null);

    useEffect(() => {
        if (!openMenu) return;
        const closeMenu = () => setOpenMenu(null);
        document.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('resize', closeMenu);
        return () => {
            document.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('resize', closeMenu);
        };
    }, [openMenu]);

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
            } catch (err) {
                console.error('Failed to load master data', err);
            }
        };
        fetchMaster();
    }, []);

    // ── User Unit & Ruangan Mapping (Read-Only) ──
    const userUnitId = typeof user?.unit === 'object' ? user?.unit?.id : user?.unit;
    const userUnitNama = user?.unit_nama || (typeof user?.unit === 'object' ? user?.unit?.nama : null);

    const userRuang = useMemo(() => {
        if (!ruangList.length) return null;

        // 1. Prioritaskan nama yang sama persis (misal 'IT')
        if (userUnitNama) {
            const needle = userUnitNama.toLowerCase().trim();
            const byExact = ruangList.find(r => r.nama.toLowerCase().trim() === needle);
            if (byExact) return byExact;
        }

        // 2. Cocokkan berdasarkan relasi unit_id atau unit
        if (userUnitId) {
            const byUnitId = ruangList.find(r => {
                const rUnit = r.unit_id ?? (typeof r.unit === 'object' ? r.unit?.id : r.unit);
                return String(rUnit) === String(userUnitId);
            });
            if (byUnitId) return byUnitId;
        }

        // 3. Fallback partial matching hanya jika nama unit > 2 huruf untuk cegah salah cocok (seperti 'IT' di 'Kulit')
        if (userUnitNama) {
            const needle = userUnitNama.toLowerCase().trim();
            if (needle.length > 2) {
                const byPartial = ruangList.find(r =>
                    r.nama.toLowerCase().includes(needle) || needle.includes(r.nama.toLowerCase())
                );
                if (byPartial) return byPartial;
            }
        }
        return null;
    }, [ruangList, userUnitId, userUnitNama]);

    const isLogistikAdmin = Boolean(
        user?.is_superuser ||
        user?.username === 'super' ||
        user?.is_logistik ||
        user?.view_logistik ||
        user?.role === 'direktur' ||
        user?.role === 'wakil_direktur'
    );

    const userRuangOptions = useMemo(() => {
        if (isLogistikAdmin) return ruangList;
        if (!ruangList.length) return [];
        return ruangList.filter(r => {
            const rUnit = r.unit_id ?? (typeof r.unit === 'object' ? r.unit?.id : r.unit);
            return (userUnitId && String(rUnit) === String(userUnitId)) ||
                   (userRuang?.id && r.id === userRuang.id) ||
                   (userUnitNama && r.nama.toLowerCase().trim() === userUnitNama.toLowerCase().trim());
        });
    }, [ruangList, isLogistikAdmin, userUnitId, userRuang, userUnitNama]);

    // Options for SearchableSelect (tetap izinkan memilih barang stok 0 untuk antrean pengadaan)
    const barangOptions = useMemo(() => {
        return (barangList || []).map((b) => {
            const stokNum = Number(b.stok_saat_ini || 0);
            const isHabis = stokNum <= 0;
            return {
                value: String(b.id),
                label: b.kode ? `[${b.kode}] ${b.nama}${isHabis ? ' • [Stok 0 · Pengadaan]' : ''}` : b.nama,
                subtext: [
                    b.kode,
                    b.golongan?.nama ? `Gol: ${b.golongan.nama}` : '',
                    b.satuan_dasar?.kode ? `Satuan: ${b.satuan_dasar.kode}` : '',
                    `Stok: ${stokNum.toLocaleString('id-ID')}${isHabis ? ' (Kosong · Bisa diajukan)' : ''}`
                ].filter(Boolean).join(' • '),
                tag: isHabis ? 'PENGADAAN' : (b.satuan_dasar?.kode || undefined),
            };
        });
    }, [barangList]);

    useEffect(() => {
        if (userRuang?.id) {
            setFormRuangId(String(userRuang.id));
        }
    }, [userRuang]);

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
            const isUnfiltered = !search.trim() && !filterRuang && !filterStatus;
            if (Array.isArray(data)) {
                setRequests(data);
                setTotalCount(data.length);
                if (isUnfiltered) setUnfilteredTotal(data.length);
            } else {
                const cnt = data.count || 0;
                setRequests(data.results || []);
                setTotalCount(cnt);
                if (isUnfiltered) setUnfilteredTotal(cnt);
            }

            if (!isUnfiltered) {
                api.get('/gudang/permintaan/', { params: { page: 1, page_size: 1 } })
                    .then(r => {
                        const d = r.data;
                        setUnfilteredTotal(Array.isArray(d) ? d.length : (d.count || 0));
                    })
                    .catch(() => {});
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
        let total = unfilteredTotal;
        let menunggu = 0;
        let disetujui = 0;
        let prosesSebagian = 0;
        let selesai = 0;
        let ditolak = 0;

        requests.forEach(r => {
            if (r.status === 'MENUNGGU') menunggu++;
            else if (r.status === 'DISETUJUI') disetujui++;
            else if (r.status === 'PROSES_SEBAGIAN') prosesSebagian++;
            else if (r.status === 'SELESAI') selesai++;
            else if (r.status === 'DITOLAK') ditolak++;
        });

        return { total, menunggu, disetujui, prosesSebagian, selesai, ditolak };
    }, [requests, unfilteredTotal]);

    // ── Form Permintaan Handlers ──
    const handleOpenCreateModal = () => {
        if (userRuang?.id) {
            setFormRuangId(String(userRuang.id));
        }
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

        const effectiveRuangId = formRuangId || userRuang?.id;
        if (!effectiveRuangId && !userUnitNama) {
            toast.error('Unit pemohon tidak terdeteksi pada profil akun Anda. Hubungi administrator.');
            return;
        }

        const unselectedItem = formItems.find(it => !it.barang_id);
        if (unselectedItem) {
            toast.error('Pastikan semua baris barang telah dipilih.');
            return;
        }

        const validItems = formItems.filter(it => it.barang_id && Number(it.qty) > 0);
        if (!validItems.length) {
            toast.error('Pilih minimal satu barang dengan kuantitas > 0.');
            return;
        }

        setSaving(true);
        try {
            await api.post('/gudang/permintaan/', {
                ruang: effectiveRuangId || undefined,
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

            if (!effectiveRuangId) {
                api.get('/gudang/ruang/').then(r => setRuangList(r.data || [])).catch(() => {});
            }

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
            (req.items || []).map(it => {
                const minta = Number(it.qty_minta || 0);
                const disetujui = Number(it.qty_disetujui || 0);
                const stokTersedia = Number(it.stok_tersedia ?? (barangList.find(b => b.id === it.barang)?.stok_saat_ini || 0));
                const keputusan = stokTersedia > 0 ? 'SETUJUI' : 'AJUKAN';
                return {
                    id: it.id,
                    barang_nama: it.barang_nama,
                    barang_kode: it.barang_kode,
                    satuan: it.satuan,
                    qty_minta: minta,
                    stok_tersedia: stokTersedia,
                    keputusan,
                    qty_disetujui: keputusan === 'SETUJUI' ? (disetujui > 0 ? Math.min(disetujui, stokTersedia) : Math.min(minta, stokTersedia)) : 0,
                    catatan_verif: it.alasan_tolak || ''
                };
            })
        );
        setShowDetailModal(false);
    };

    const handleExecuteApprove = async () => {
        if (!approveTarget) return;

        for (const it of approveItems) {
            if (it.keputusan === 'SETUJUI') {
                const qtyApp = Number(it.qty_disetujui || 0);
                if (qtyApp <= 0) {
                    toast.error(`Kuantitas yang disetujui untuk '${it.barang_nama}' harus > 0.`);
                    return;
                }
                if (qtyApp > it.stok_tersedia) {
                    toast.error(`Qty disetujui untuk '${it.barang_nama}' (${qtyApp} ${it.satuan}) melebihi stok gudang yang tersedia (${it.stok_tersedia} ${it.satuan}).`);
                    return;
                }
            } else if (it.keputusan === 'TOLAK' && !String(it.catatan_verif || '').trim()) {
                toast.error(`Keterangan / alasan penolakan untuk '${it.barang_nama}' wajib diisi.`);
                return;
            }
        }

        setApproveSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${approveTarget.id}/approve/`, {
                items: approveItems.map(it => ({
                    id: it.id,
                    keputusan: it.keputusan,
                    qty_disetujui: it.keputusan === 'SETUJUI' ? Number(it.qty_disetujui || 0) : 0,
                    alasan_tolak: it.keputusan === 'TOLAK' ? String(it.catatan_verif || '').trim() : '',
                    keterangan: it.keputusan !== 'TOLAK' ? String(it.catatan_verif || '').trim() : ''
                }))
            });
            toast.success(`Verifikasi permintaan ${approveTarget.nomor} berhasil disimpan.`);
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

    // Helper format tanggal manusiawi (e.g. 10 Nov 2026)
    const formatTanggal = (val) => {
        if (!val) return '—';
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return val;
        return d.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    // Helper status badge styling
    const renderStatusBadge = (status) => {
        switch (status) {
            case 'MENUNGGU':
                return <span className="pu-badge amber"><span className="pu-status-dot" /> Menunggu Otorisasi</span>;
            case 'DISETUJUI':
                return <span className="pu-badge emerald"><span className="pu-status-dot" /> Disetujui (Siap Diambil)</span>;
            case 'PROSES_SEBAGIAN':
                return <span className="pu-badge sky"><span className="pu-status-dot" /> Dalam Proses / Pengadaan</span>;
            case 'SELESAI':
                return <span className="pu-badge sky"><span className="pu-status-dot" /> Selesai Diserahkan</span>;
            case 'DITOLAK':
                return <span className="pu-badge rose"><span className="pu-status-dot" /> Ditolak</span>;
            default:
                return <span className="pu-badge slate"><span className="pu-status-dot" /> {status}</span>;
        }
    };

    const renderItemStatusBadge = (item) => {
        switch (item?.status) {
            case 'SEDANG_DIAJUKAN':
                return <span className="pu-badge sky"><span className="pu-status-dot" /> Sedang Diajukan</span>;
            case 'DISETUJUI':
                return <span className="pu-badge emerald"><span className="pu-status-dot" /> Siap Diambil</span>;
            case 'SELESAI':
                return <span className="pu-badge sky"><span className="pu-status-dot" /> Sudah Diserahkan</span>;
            case 'DITOLAK':
                return <span className="pu-badge rose"><span className="pu-status-dot" /> Ditolak</span>;
            case 'BATAL_PENGADAAN':
                return <span className="pu-badge slate"><span className="pu-status-dot" /> Pengadaan Ditutup</span>;
            default:
                return <span className="pu-badge amber"><span className="pu-status-dot" /> Menunggu ACC</span>;
        }
    };

    const selectedOutOfStockItems = useMemo(() => {
        return formItems
            .map(it => barangList.find(b => String(b.id) === String(it.barang_id)))
            .filter(b => b && Number(b.stok_saat_ini || 0) <= 0);
    }, [formItems, barangList]);

    const duplicatePendingItemNames = useMemo(() => {
        const selectedIds = new Set(formItems.map(it => String(it.barang_id)).filter(Boolean));
        if (!selectedIds.size) return [];
        const targetRuangId = String(formRuangId || userRuang?.id || '');
        const names = new Set();
        requests.forEach(r => {
            if (!['MENUNGGU', 'PROSES_SEBAGIAN'].includes(r.status)) return;
            if (targetRuangId && String(r.ruang) !== targetRuangId) return;
            (r.items || []).forEach(it => {
                if (selectedIds.has(String(it.barang)) && ['MENUNGGU', 'SEDANG_DIAJUKAN'].includes(it.status)) {
                    names.add(it.barang_nama);
                }
            });
        });
        return Array.from(names);
    }, [formItems, requests, formRuangId, userRuang]);

    return (
        <div className="pu-page">
            {/* ── 1. Compact Page Header ── */}
            <div className="pu-header">
                <div className="pu-header-text">
                    <h1>Permintaan Barang Unit (Amprahan)</h1>
                    <p>Ajukan barang kebutuhan ruangan, pantau persetujuan Koordinator, dan ambil barang di loket gudang.</p>
                </div>
                <button type="button" className="pu-btn-create" onClick={handleOpenCreateModal}>
                    <Plus size={16} /> Ajukan Permintaan Barang
                </button>
            </div>

            {/* ── 2. Flat Interactive Stat Bar (Filter Status) ── */}
            <div className="pu-stat-bar" role="tablist" aria-label="Filter status permintaan">
                {[
                    { value: '', num: stats.total, label: 'Total Permintaan' },
                    { value: 'MENUNGGU', num: stats.menunggu, label: 'Menunggu Otorisasi' },
                    { value: 'DISETUJUI', num: stats.disetujui, label: 'Disetujui (Siap Ambil)' },
                    { value: 'PROSES_SEBAGIAN', num: stats.prosesSebagian, label: 'Proses / Pengadaan' },
                    { value: 'SELESAI', num: stats.selesai, label: 'Selesai Diserahkan' },
                    { value: 'DITOLAK', num: stats.ditolak, label: 'Permintaan Ditolak' },
                ].map(item => (
                    <button
                        key={item.value || 'ALL'}
                        type="button"
                        role="tab"
                        aria-selected={filterStatus === item.value}
                        className={`pu-stat-item ${filterStatus === item.value ? 'active' : ''}`}
                        onClick={() => { setFilterStatus(item.value); setPage(1); }}
                    >
                        <span className="pu-stat-num">{item.num}</span>
                        <span className="pu-stat-label">{item.label}</span>
                    </button>
                ))}
            </div>

            {/* ── 3. Toolbar + Tabel (satu kontainer) ── */}
            <div className="pu-card">
                <form className="pu-filter-row" onSubmit={handleSearchSubmit}>
                    <div className="pu-search-box">
                        <button type="submit" className="pu-search-submit" title="Cari (Enter)">
                            <Search size={15} />
                        </button>
                        <input
                            type="text"
                            placeholder="Cari nomor SPB, catatan, nama pemohon..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    {isLogistikAdmin ? (
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
                    ) : userRuangOptions.length > 1 ? (
                        <select
                            className="pu-select"
                            value={filterRuang}
                            onChange={(e) => { setFilterRuang(e.target.value); setPage(1); }}
                        >
                            <option value="">Semua Ruangan ({userUnitNama || 'Unit'})</option>
                            {userRuangOptions.map(r => (
                                <option key={r.id} value={r.id}>{r.nama}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="pu-chip">
                            <Building2 size={14} />
                            <span>{userRuang?.nama || userUnitNama || 'Unit Pemohon'}</span>
                        </div>
                    )}
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
                    {(search || filterRuang || filterStatus) && (
                        <button type="button" className="pu-tool-btn" onClick={handleResetFilter}>
                            <X size={13} /> Reset
                        </button>
                    )}
                    <button type="button" className="pu-tool-btn" onClick={fetchRequests} title="Muat Ulang">
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
                                                <span className="pu-doc-no">{req.nomor}</span>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(req.tanggal).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td>
                                                <div className="pu-ruang-cell">
                                                    <Building2 size={13} />
                                                    <span>{req.ruang_nama}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="pu-items-preview">
                                                    {previewItems.map(it => (
                                                        <div key={it.id} className="pu-item-line">
                                                            <span className="pu-item-name">{it.barang_nama}</span>{' '}
                                                            <span className="pu-item-qty">({Number(it.qty_minta)} {it.satuan})</span>
                                                        </div>
                                                    ))}
                                                    {remainingCount > 0 && (
                                                        <span className="pu-item-more">
                                                            +{remainingCount} item lainnya
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {renderStatusBadge(req.status)}
                                            </td>
                                            <td>
                                                {req.created_by_nama ? (
                                                    <span className="pu-cell-muted">{req.created_by_nama}</span>
                                                ) : (
                                                    <span className="pu-cell-empty">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {req.approved_by_nama ? (
                                                    <span className="pu-approver-ok">{req.approved_by_nama}</span>
                                                ) : req.status === 'DITOLAK' ? (
                                                    <span className="pu-approver-no">Ditolak</span>
                                                ) : (
                                                    <span className="pu-cell-empty">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {(() => {
                                                    const canReject = req.can_approve && req.status === 'MENUNGGU';
                                                    const canDelete = (req.status === 'DRAFT' || req.status === 'MENUNGGU') &&
                                                        (user?.is_superuser || req.created_by === user?.id);
                                                    const hasMoreActions = canReject || canDelete;

                                                    return (
                                                        <div className="pu-action-btns">
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
                                                            {canReject && (
                                                                <button
                                                                    type="button"
                                                                    className="pu-action-btn approve"
                                                                    onClick={() => handleOpenApproveModal(req)}
                                                                    title="Verifikasi & Setujui (Koordinator)"
                                                                >
                                                                    <Check size={15} />
                                                                </button>
                                                            )}

                                                            {/* Menu dropdown aksi tambahan (Tolak / Hapus) */}
                                                            {hasMoreActions && (
                                                                <div className="pu-action-menu-wrap" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        type="button"
                                                                        className="pu-action-btn"
                                                                        aria-haspopup="menu"
                                                                        aria-expanded={openMenu?.id === req.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (openMenu?.id === req.id) {
                                                                                setOpenMenu(null);
                                                                            } else {
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setOpenMenu({
                                                                                    id: req.id,
                                                                                    top: rect.bottom + 4,
                                                                                    right: Math.max(8, window.innerWidth - rect.right),
                                                                                });
                                                                            }
                                                                        }}
                                                                        title="Aksi Lainnya"
                                                                    >
                                                                        <MoreHorizontal size={15} />
                                                                    </button>
                                                                    {openMenu?.id === req.id && createPortal(
                                                                        <div
                                                                            className="pu-action-menu"
                                                                            role="menu"
                                                                            style={{ top: openMenu.top, right: openMenu.right }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            {canReject && (
                                                                                <button
                                                                                    type="button"
                                                                                    role="menuitem"
                                                                                    className="pu-action-menu-item danger"
                                                                                    onClick={() => {
                                                                                        setOpenMenu(null);
                                                                                        handleOpenRejectModal(req);
                                                                                    }}
                                                                                >
                                                                                    <X size={14} /> Tolak Permintaan
                                                                                </button>
                                                                            )}
                                                                            {canDelete && (
                                                                                <button
                                                                                    type="button"
                                                                                    role="menuitem"
                                                                                    className="pu-action-menu-item danger"
                                                                                    onClick={() => {
                                                                                        setOpenMenu(null);
                                                                                        setDeleteTarget(req);
                                                                                    }}
                                                                                >
                                                                                    <Trash2 size={14} /> Hapus / Batalkan
                                                                                </button>
                                                                            )}
                                                                        </div>,
                                                                        document.body
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {totalCount > pageSize && (
                    <div className="pu-pagination">
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
                    <div className="pu-modal" style={{ maxWidth: '860px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 className="pu-modal-title">Buat Permintaan Barang Baru</h3>
                                <p className="pu-modal-subtitle">
                                    Ajukan barang operasional ruangan ke gudang logistik RS Siaga
                                </p>
                            </div>
                            <button type="button" className="pu-modal-close" onClick={() => setShowCreateModal(false)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitCreate}>
                            <div className="pu-modal-body">
                                <div className="pu-form-grid-2col">
                                    <div>
                                        <label className="pu-form-label">
                                            <span>Unit / Ruangan Pemohon *</span>
                                        </label>
                                        <div className="pu-locked-box">
                                            <Building2 size={15} style={{ color: '#8792a2', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <span className="pu-locked-box-text">
                                                    {userRuang?.nama || userUnitNama || (formRuangId ? (ruangList.find(r => String(r.id) === String(formRuangId))?.nama) : 'Memuat Unit Akun...')}
                                                </span>
                                                {userRuang?.kode && (
                                                    <span className="pu-locked-box-code">
                                                        ({userRuang.kode})
                                                    </span>
                                                )}
                                            </div>
                                            <Lock size={13} style={{ color: '#8792a2', flexShrink: 0 }} />
                                        </div>
                                        {!userRuang && !userUnitNama && (
                                            <span style={{ display: 'block', fontSize: '11px', color: '#f87171', marginTop: '4px' }}>
                                                * Akun Anda belum memiliki unit di Manajemen User. Hubungi Admin.
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <label className="pu-form-label">
                                            <span>Tanggal Permintaan *</span>
                                        </label>
                                        <DateField
                                            value={formTanggal}
                                            onChange={val => setFormTanggal(val)}
                                            placeholder="Pilih tanggal..."
                                            disabled={true}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="pu-form-label" style={{ display: 'block' }}>
                                        Catatan / Keperluan Permintaan
                                    </label>
                                    <input
                                        type="text"
                                        className="pu-form-textarea"
                                        placeholder="Contoh: Kebutuhan operasional mingguan, perbaikan arsip..."
                                        value={formCatatan}
                                        onChange={e => setFormCatatan(e.target.value)}
                                    />
                                </div>

                                <div className="pu-modal-section-divider">
                                    <div className="pu-items-header">
                                        <span className="pu-section-title">
                                            Daftar Barang yang Diminta
                                        </span>
                                        <button type="button" className="pu-btn-add-item" onClick={handleAddItemRow}>
                                            <Plus size={14} /> Tambah Baris
                                        </button>
                                    </div>

                                    <div className="pu-items-col-headers">
                                        <span className="pu-col-barang">Barang</span>
                                        <div className="pu-col-right-group">
                                            <span className="pu-col-qty">Jumlah</span>
                                            <span className="pu-col-satuan">Satuan</span>
                                            <span className="pu-col-catatan">Catatan</span>
                                            <span className="pu-col-del-spacer" />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {formItems.map((item, idx) => (
                                            <div key={idx} className="pu-item-row">
                                                <div className="pu-item-select-wrap">
                                                    <SearchableSelect
                                                        options={barangOptions}
                                                        value={item.barang_id ? String(item.barang_id) : ''}
                                                        onChange={(val) => handleItemChange(idx, 'barang_id', val)}
                                                        placeholder="-- Cari / Pilih Barang --"
                                                        searchPlaceholder="Ketik nama atau kode barang..."
                                                        emptyMessage="Barang tidak ditemukan"
                                                        minDropdownWidth={260}
                                                        maxDropdownWidth={600}
                                                    />
                                                </div>

                                                <div className="pu-item-inputs-wrap">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="any"
                                                        className="pu-input-qty"
                                                        placeholder="Qty"
                                                        value={item.qty}
                                                        onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                                                        required
                                                    />

                                                    <input
                                                        type="text"
                                                        readOnly
                                                        className="pu-input-satuan"
                                                        value={item.satuan}
                                                    />

                                                    <input
                                                        type="text"
                                                        className="pu-input-keterangan"
                                                        placeholder="Ket. spesifikasi (opsional)..."
                                                        value={item.keterangan}
                                                        onChange={e => handleItemChange(idx, 'keterangan', e.target.value)}
                                                    />

                                                    <button
                                                        type="button"
                                                        className="pu-btn-del-item"
                                                        onClick={() => handleRemoveItemRow(idx)}
                                                        disabled={formItems.length === 1}
                                                        title="Hapus baris"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {selectedOutOfStockItems.length > 0 && (
                                        <div className="pu-alert-banner warning" style={{ marginTop: '10px' }}>
                                            <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                                            <span>
                                                {selectedOutOfStockItems.length} barang yang dipilih sedang kosong di gudang (<strong>{selectedOutOfStockItems.map(b => b.nama).slice(0, 3).join(', ')}</strong>). Permohonan tetap dapat diajukan dan item tersebut akan masuk status <strong>Sedang Diajukan (Antrean Pengadaan)</strong> hingga stok datang.
                                            </span>
                                        </div>
                                    )}

                                    {duplicatePendingItemNames.length > 0 && (
                                        <div className="pu-alert-banner info" style={{ marginTop: '8px' }}>
                                            <Clock size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
                                            <span>
                                                Catatan: Unit Anda sudah memiliki pengajuan aktif untuk <strong>{duplicatePendingItemNames.join(', ')}</strong> yang masih menunggu ACC / pengadaan.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pu-modal-footer">
                                <button type="button" className="pu-btn soft" onClick={() => setShowCreateModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="pu-btn primary" disabled={saving}>
                                    {saving ? 'Mengirim Permintaan...' : 'Kirim Pengajuan Permintaan'}
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
                                <h3 className="pu-modal-title">
                                    Detail Permintaan: {selectedReq.nomor}
                                </h3>
                            </div>
                            <button type="button" className="pu-modal-close" onClick={() => setShowDetailModal(false)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            {/* Grid Metadata Key-Value */}
                            <div className="pu-detail-meta-grid">
                                <div className="pu-detail-meta-item">
                                    <span className="pu-detail-meta-label">Ruangan</span>
                                    <span className="pu-detail-meta-value">{selectedReq.ruang_nama || '—'}</span>
                                </div>
                                <div className="pu-detail-meta-item">
                                    <span className="pu-detail-meta-label">Tanggal Diajukan</span>
                                    <span className="pu-detail-meta-value">{formatTanggal(selectedReq.tanggal)}</span>
                                </div>
                                <div className="pu-detail-meta-item">
                                    <span className="pu-detail-meta-label">Tanggal Diserahkan</span>
                                    <span className="pu-detail-meta-value">
                                        {selectedReq.tanggal_penyerahan ? formatTanggal(selectedReq.tanggal_penyerahan) : '—'}
                                    </span>
                                </div>
                                <div className="pu-detail-meta-item">
                                    <span className="pu-detail-meta-label">Penerima</span>
                                    <span className="pu-detail-meta-value">{selectedReq.penerima_nama || '—'}</span>
                                </div>
                            </div>

                            {/* Compact Horizontal Audit Trail */}
                            {(() => {
                                const authState = selectedReq.status === 'DITOLAK'
                                    ? 'rejected'
                                    : (selectedReq.status === 'DISETUJUI' || selectedReq.status === 'PROSES_SEBAGIAN' || selectedReq.status === 'SELESAI' ? 'done' : 'active');
                                const handState = selectedReq.status === 'SELESAI'
                                    ? 'done'
                                    : (selectedReq.status === 'PROSES_SEBAGIAN' ? 'active' : 'pending');
                                const renderAuditIcon = (state) => {
                                    if (state === 'done') return <CheckCircle2 size={14} className="pu-audit-icon" />;
                                    if (state === 'rejected') return <XCircle size={14} className="pu-audit-icon" />;
                                    return <Clock size={14} className="pu-audit-icon" />;
                                };

                                return (
                                    <div className="pu-audit-trail">
                                        <div className="pu-audit-step done">
                                            <div className="pu-audit-step-head">
                                                {renderAuditIcon('done')}
                                                <span className="pu-audit-step-title">Diajukan</span>
                                            </div>
                                            <span className="pu-audit-step-sub">{selectedReq.created_by_nama || 'Pemohon'}</span>
                                        </div>
                                        <div className={`pu-audit-step ${authState}`}>
                                            <div className="pu-audit-step-head">
                                                {renderAuditIcon(authState)}
                                                <span className="pu-audit-step-title">Otorisasi Koordinator</span>
                                            </div>
                                            <span className="pu-audit-step-sub">
                                                {selectedReq.status === 'DITOLAK' ? 'Ditolak' : (selectedReq.approved_by_nama || 'Menunggu Otorisasi')}
                                            </span>
                                        </div>
                                        <div className={`pu-audit-step ${handState}`}>
                                            <div className="pu-audit-step-head">
                                                {renderAuditIcon(handState)}
                                                <span className="pu-audit-step-title">Penyerahan Fisik</span>
                                            </div>
                                            <span className="pu-audit-step-sub">
                                                {selectedReq.status === 'SELESAI'
                                                    ? (selectedReq.bon_pengeluaran_nomor || 'Selesai')
                                                    : selectedReq.status === 'PROSES_SEBAGIAN'
                                                        ? 'Bertahap / Menunggu Pengadaan'
                                                        : 'Loket Gudang'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Alasan Ditolak Alert */}
                            {selectedReq.status === 'DITOLAK' && selectedReq.alasan_tolak && (
                                <div className="pu-alert-banner danger">
                                    <AlertCircle size={18} style={{ color: '#fb7185', flexShrink: 0 }} />
                                    <div>
                                        <strong style={{ fontSize: '13px' }}>Permintaan Ditolak:</strong>
                                        <p style={{ margin: '2px 0 0', fontSize: '12.5px' }}>{selectedReq.alasan_tolak}</p>
                                    </div>
                                </div>
                            )}

                            {selectedReq.catatan && (
                                <p className="pu-detail-note">
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
                                            <th style={{ textAlign: 'right' }}>Minta</th>
                                            <th style={{ textAlign: 'right' }}>Setuju</th>
                                            <th style={{ textAlign: 'right' }}>Diterima</th>
                                            <th>Status Item</th>
                                            <th>Satuan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedReq.items || []).map((it, idx) => (
                                            <tr key={it.id}>
                                                <td>{idx + 1}</td>
                                                <td><span className="pu-code-badge">{it.barang_kode}</span></td>
                                                <td>
                                                    <strong>{it.barang_nama}</strong>
                                                    {it.keterangan && (
                                                        <small style={{ display: 'block', color: '#94a3b8' }}>Ket: {it.keterangan}</small>
                                                    )}
                                                    {it.alasan_tolak && (
                                                        <small style={{ display: 'block', color: '#f87171', marginTop: '2px' }}>
                                                            Alasan: {it.alasan_tolak}
                                                        </small>
                                                    )}
                                                </td>
                                                <td align="right">{Number(it.qty_minta).toLocaleString('id-ID')}</td>
                                                <td align="right" style={{ color: Number(it.qty_disetujui) > 0 ? '#10b981' : '#94a3b8', fontWeight: 700 }}>
                                                    {it.status === 'MENUNGGU'
                                                        ? '-'
                                                        : Number(it.qty_disetujui || 0).toLocaleString('id-ID')}
                                                </td>
                                                <td align="right">{Number(it.qty_dikeluarkan || 0).toLocaleString('id-ID')}</td>
                                                <td>{renderItemStatusBadge(it)}</td>
                                                <td>{it.satuan}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {selectedReq.pengeluaran_list && selectedReq.pengeluaran_list.length > 0 && (
                                <div style={{ marginTop: '12px', fontSize: '12px', color: '#94a3b8' }}>
                                    <strong style={{ display: 'block', marginBottom: '6px' }}>Riwayat Penyerahan Fisik:</strong>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {selectedReq.pengeluaran_list.map(bon => (
                                            <span key={bon.id} className="pu-code-badge">
                                                {bon.nomor} · {bon.tanggal}{bon.penerima_nama ? ` (${bon.penerima_nama})` : ''}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pu-modal-footer">
                            <button type="button" className="pu-btn soft" onClick={() => setShowDetailModal(false)}>
                                Tutup
                            </button>

                            {selectedReq.can_approve && selectedReq.status === 'MENUNGGU' && (
                                <>
                                    <button
                                        type="button"
                                        className="pu-btn soft"
                                        style={{ color: '#dc2626' }}
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

                            <button
                                type="button"
                                className="pu-btn primary"
                                onClick={() => handlePrintSPB(selectedReq)}
                            >
                                <Printer size={15} /> Cetak SPB
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
                    <div className="pu-modal" style={{ maxWidth: '1040px' }} onClick={e => e.stopPropagation()}>
                        <div className="pu-modal-header">
                            <div>
                                <h3 className="pu-modal-title">
                                    Verifikasi &amp; Setujui Permintaan
                                </h3>
                                <div className="pu-modal-meta-row">
                                    <span className="pu-modal-meta-code">{approveTarget.nomor}</span>
                                    <span>Ruang: <strong>{approveTarget.ruang_nama}</strong></span>
                                </div>
                            </div>
                            <button type="button" className="pu-modal-close" onClick={() => setApproveTarget(null)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            <div className="pu-modal-meta-strip">
                                <div className="pu-modal-meta-cell">
                                    <span className="pu-modal-meta-label">Unit / Ruangan Pemohon</span>
                                    <span className="pu-modal-meta-val" title={approveTarget.ruang_nama}>{approveTarget.ruang_nama}</span>
                                </div>
                                <div className="pu-modal-meta-cell">
                                    <span className="pu-modal-meta-label">Tanggal Pengajuan</span>
                                    <span className="pu-modal-meta-val pu-num-cell">{approveTarget.tanggal}</span>
                                </div>
                                <div className="pu-modal-meta-cell">
                                    <span className="pu-modal-meta-label">Catatan dari Ruangan</span>
                                    <span className="pu-modal-meta-val" title={approveTarget.catatan || '—'} style={{ fontWeight: approveTarget.catatan ? 500 : 400 }}>
                                        {approveTarget.catatan || '—'}
                                    </span>
                                </div>
                            </div>

                            <div className="pu-table-wrap">
                                <table className="pu-table">
                                    <thead>
                                        <tr>
                                            <th>Barang</th>
                                            <th style={{ textAlign: 'right' }}>Stok</th>
                                            <th style={{ textAlign: 'right' }}>Minta</th>
                                            <th style={{ width: '168px' }}>Keputusan</th>
                                            <th style={{ width: '140px', textAlign: 'right' }}>Qty ACC</th>
                                            <th style={{ width: '210px' }}>Keterangan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {approveItems.map((it, idx) => {
                                            const qtyVal = Number(it.qty_disetujui || 0);
                                            const stokVal = Number(it.stok_tersedia || 0);
                                            const isSetuju = it.keputusan === 'SETUJUI';
                                            const isAjukan = it.keputusan === 'AJUKAN';
                                            const isTolak = it.keputusan === 'TOLAK';
                                            const isOverStock = isSetuju && qtyVal > stokVal;
                                            const isBadZero = isSetuju && qtyVal <= 0;
                                            const isMissingReason = isTolak && !String(it.catatan_verif || '').trim();
                                            return (
                                                <tr key={it.id}>
                                                    <td>
                                                        <strong>{it.barang_nama}</strong>
                                                        <small style={{ display: 'block', color: 'var(--pu-muted)' }}>{it.barang_kode}</small>
                                                    </td>
                                                    <td
                                                        align="right"
                                                        className="pu-num-cell"
                                                        style={{ color: stokVal <= 0 ? '#f43f5e' : 'var(--pu-text)', fontWeight: 600 }}
                                                    >
                                                        {stokVal.toLocaleString('id-ID')} {it.satuan}
                                                    </td>
                                                    <td align="right" className="pu-num-cell">{Number(it.qty_minta).toLocaleString('id-ID')} {it.satuan}</td>
                                                    <td>
                                                        <div className="gdg-decision-group">
                                                            {stokVal > 0 ? (
                                                                <button
                                                                    type="button"
                                                                    className={`gdg-decision-btn setuju ${isSetuju ? 'active' : ''}`}
                                                                    onClick={() => {
                                                                        const next = [...approveItems];
                                                                        next[idx].keputusan = 'SETUJUI';
                                                                        if (!Number(next[idx].qty_disetujui)) {
                                                                            next[idx].qty_disetujui = Math.min(next[idx].qty_minta, stokVal);
                                                                        }
                                                                        setApproveItems(next);
                                                                    }}
                                                                >
                                                                    Setujui
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className={`gdg-decision-btn ajukan ${isAjukan ? 'active' : ''}`}
                                                                    onClick={() => {
                                                                        const next = [...approveItems];
                                                                        next[idx].keputusan = 'AJUKAN';
                                                                        next[idx].qty_disetujui = 0;
                                                                        setApproveItems(next);
                                                                    }}
                                                                >
                                                                    Pengadaan
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className={`gdg-decision-btn tolak ${isTolak ? 'active' : ''}`}
                                                                onClick={() => {
                                                                    const next = [...approveItems];
                                                                    next[idx].keputusan = 'TOLAK';
                                                                    next[idx].qty_disetujui = 0;
                                                                    setApproveItems(next);
                                                                }}
                                                            >
                                                                Tolak
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td align="right">
                                                        <div className="pu-acc-qty-cell">
                                                            <input
                                                                type="number"
                                                                min={isSetuju ? '0.001' : '0'}
                                                                max={isSetuju ? stokVal : undefined}
                                                                step="any"
                                                                disabled={!isSetuju}
                                                                className={`pu-acc-qty-input ${(isOverStock || isBadZero) ? 'overstock' : ''}`}
                                                                style={{
                                                                    color: isSetuju
                                                                        ? ((isOverStock || isBadZero) ? '#f87171' : '#10b981')
                                                                        : undefined,
                                                                    borderColor: (isOverStock || isBadZero) ? '#f87171' : undefined,
                                                                }}
                                                                value={isSetuju ? it.qty_disetujui : 0}
                                                                onChange={(e) => {
                                                                    const next = [...approveItems];
                                                                    next[idx].qty_disetujui = e.target.value;
                                                                    setApproveItems(next);
                                                                }}
                                                            />
                                                            <span className="pu-acc-qty-unit">{it.satuan}</span>
                                                        </div>
                                                        {isOverStock && (
                                                            <small style={{ display: 'block', color: '#f87171', fontSize: '10.5px', marginTop: '3px' }}>
                                                                Melebihi stok!
                                                            </small>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            placeholder={isTolak ? 'Alasan ditolak (wajib)...' : 'Keterangan (opsional)...'}
                                                            value={it.catatan_verif || ''}
                                                            required={isTolak}
                                                            onChange={(e) => {
                                                                const next = [...approveItems];
                                                                next[idx].catatan_verif = e.target.value;
                                                                setApproveItems(next);
                                                            }}
                                                            className="pu-input-keterangan"
                                                            style={{
                                                                width: '100%',
                                                                height: '36px',
                                                                minHeight: '36px',
                                                                borderRadius: '6px',
                                                                fontSize: '12.5px',
                                                                borderColor: isMissingReason ? '#f87171' : undefined
                                                            }}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="pu-callout-neutral">
                                Pengurangan qty yang disetujui (mis. minta 10, disetujui 4) langsung selesai tanpa membuat utang sisa. Item stok kosong dapat dipilih <strong>Pengadaan</strong> agar tetap tercatat menunggu stok masuk.
                            </div>

                            {approveItems.some(it => it.keputusan === 'SETUJUI' && (Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0) || Number(it.qty_disetujui || 0) <= 0)) && (
                                <div className="pu-alert-banner danger" style={{ marginTop: '10px' }}>
                                    <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0 }} />
                                    <span>Pastikan setiap item yang dipilih <strong>Setujui</strong> memiliki kuantitas &gt; 0 dan tidak melebihi stok gudang.</span>
                                </div>
                            )}
                        </div>

                        <div className="pu-approve-modal-footer">
                            <button
                                type="button"
                                className="pu-btn pu-btn-tolak-outline"
                                style={{ height: '36px', borderRadius: '6px' }}
                                onClick={() => {
                                    const target = approveTarget;
                                    setApproveTarget(null);
                                    handleOpenRejectModal(target);
                                }}
                            >
                                Tolak Semua
                            </button>
                            <div className="pu-approve-modal-footer-right">
                                <button type="button" className="pu-btn soft" style={{ height: '36px', borderRadius: '6px' }} onClick={() => setApproveTarget(null)}>
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    className="pu-btn primary"
                                    style={{ height: '36px', borderRadius: '6px' }}
                                    onClick={handleExecuteApprove}
                                    disabled={
                                        approveSubmitting ||
                                        approveItems.some(it => it.keputusan === 'SETUJUI' && (Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0) || Number(it.qty_disetujui || 0) <= 0)) ||
                                        approveItems.some(it => it.keputusan === 'TOLAK' && !String(it.catatan_verif || '').trim())
                                    }
                                >
                                    {approveSubmitting ? 'Menyimpan...' : 'Simpan Verifikasi'}
                                </button>
                            </div>
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
                                <h3 className="pu-modal-title">
                                    Tolak Permintaan Barang
                                </h3>
                                <div className="pu-modal-meta-row">
                                    <span className="pu-modal-meta-code">{rejectTarget.nomor}</span>
                                    <span>Ruang: <strong>{rejectTarget.ruang_nama}</strong></span>
                                </div>
                            </div>
                            <button type="button" className="pu-modal-close" onClick={() => setRejectTarget(null)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteReject}>
                            <div className="pu-modal-body">
                                <label className="pu-form-label" style={{ display: 'block' }}>
                                    Alasan Penolakan *
                                </label>
                                <textarea
                                    rows="3"
                                    className="pu-form-textarea"
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
                                    className="pu-btn danger"
                                    disabled={rejectSubmitting}
                                >
                                    {rejectSubmitting ? 'Menolak...' : 'Tolak Permintaan'}
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
                                <h3 className="pu-modal-title">
                                    Hapus Permintaan Barang
                                </h3>
                                <p className="pu-modal-subtitle">
                                    Tindakan ini tidak dapat dibatalkan
                                </p>
                            </div>
                            <button type="button" className="pu-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Tutup modal">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="pu-modal-body">
                            <p className="pu-modal-desc" style={{ fontSize: '13.5px', lineHeight: 1.6 }}>
                                Apakah Anda yakin ingin menghapus permohonan <strong>{deleteTarget.nomor}</strong> ({deleteTarget.ruang_nama})?
                            </p>
                        </div>

                        <div className="pu-modal-footer">
                            <button type="button" className="pu-btn soft" onClick={() => setDeleteTarget(null)}>
                                Batal
                            </button>
                            <button
                                type="button"
                                className="pu-btn danger"
                                onClick={handleExecuteDelete}
                                disabled={deleteSubmitting}
                            >
                                {deleteSubmitting ? 'Menghapus...' : 'Hapus Permanen'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
