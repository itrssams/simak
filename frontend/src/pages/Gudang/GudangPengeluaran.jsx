import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Send,
    Plus,
    Search,
    RefreshCw,
    CheckCircle2,
    Clock,
    XCircle,
    Eye,
    Check,
    X,
    FileText,
    ArrowRight,
    Printer,
    DownloadCloud,
    AlertCircle,
    PackageCheck
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';

export default function GudangPengeluaran() {
    const toast = useToast();
    const { user } = useAuth();
    const isSuper = Boolean(user?.is_superuser || user?.username === 'super' || user?.role === 'superadmin' || user?.role === 'direktur');
    const hasLogistikAccess = Boolean(user?.is_superuser || user?.username === 'super' || user?.is_logistik || ['direktur', 'wakil_direktur'].includes(user?.role));
    const isLogistikApprover = Boolean(
        user?.is_superuser ||
        user?.username === 'super' ||
        (hasLogistikAccess && ['koordinator', 'kepala_seksi', 'manajer', 'wakil_direktur', 'direktur', 'superadmin'].includes(user?.role))
    );

    const [subTab, setSubTab] = useState('permintaan'); // 'permintaan' | 'pengeluaran'

    // Data lists
    const [permintaanList, setPermintaanList] = useState([]);
    const [pengeluaranList, setPengeluaranList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Masters
    const [ruangList, setRuangList] = useState([]);
    const [barangList, setBarangList] = useState([]);

    // Modals
    const [showCreateReqModal, setShowCreateReqModal] = useState(false);
    const [showDetailReqModal, setShowDetailReqModal] = useState(false);
    const [showDetailOutModal, setShowDetailOutModal] = useState(false);
    const [selectedReq, setSelectedReq] = useState(null);
    const [selectedOut, setSelectedOut] = useState(null);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Modal: Penyerahan Barang Fisik (Done)
    const [showSerahkanModal, setShowSerahkanModal] = useState(false);
    const [serahkanTargetReq, setSerahkanTargetReq] = useState(null);
    const [serahPenerima, setSerahPenerima] = useState('');
    const [serahTanggal, setSerahTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [serahCatatan, setSerahCatatan] = useState('');
    const [serahItems, setSerahItems] = useState([]);
    const [serahSubmitting, setSerahSubmitting] = useState(false);

    // Modal: Verifikasi & Persetujuan Permintaan (Tentukan Qty Disetujui)
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [approveTargetReq, setApproveTargetReq] = useState(null);
    const [approveItems, setApproveItems] = useState([]);
    const [approveSubmitting, setApproveSubmitting] = useState(false);

    // Modal: Tolak Permintaan (Kasi)
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectTargetReq, setRejectTargetReq] = useState(null);
    const [rejectAlasan, setRejectAlasan] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);

    // Confirmation Modal State (Approve Permintaan / Approve Pengeluaran)
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);

    // Form states
    const [formRuangId, setFormRuangId] = useState('');
    const [formTanggal, setFormTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [formCatatan, setFormCatatan] = useState('');
    const [formItems, setFormItems] = useState([]);

    const fetchRuang = async () => {
        try {
            const res = await api.get('/gudang/ruang/');
            setRuangList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load ruangan', err);
        }
    };

    const fetchBarang = async () => {
        try {
            const res = await api.get('/gudang/barang/?page_size=1000');
            setBarangList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load barang', err);
        }
    };

    const fetchPermintaan = async () => {
        setLoading(true);
        try {
            let url = `/gudang/permintaan/?page=${page}&page_size=10`;
            if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
            if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

            const res = await api.get(url);
            setPermintaanList(res.data?.results || []);
            setTotalCount(res.data?.count || 0);
        } catch (err) {
            console.error('Failed to load permintaan', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPengeluaran = async () => {
        setLoading(true);
        try {
            let url = `/gudang/pengeluaran/?page=${page}&page_size=10`;
            if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
            if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

            const res = await api.get(url);
            setPengeluaranList(res.data?.results || []);
            setTotalCount(res.data?.count || 0);
        } catch (err) {
            console.error('Failed to load pengeluaran', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRuang();
        fetchBarang();
    }, []);

    useEffect(() => {
        if (subTab === 'permintaan') {
            fetchPermintaan();
        } else {
            fetchPengeluaran();
        }
    }, [subTab, page, searchQuery, statusFilter]);

    // Format Rupiah
    const formatRp = (val) =>
        `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    // Sync from Siaga
    const handleSyncSiaga = async () => {
        setSyncing(true);
        try {
            const res = await api.post('/gudang/permintaan/sync_siaga/');
            toast.success(res.data.message || 'Data permintaan dari Siaga berhasil disinkronkan.');
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Sinkronisasi gagal.');
        } finally {
            setSyncing(false);
        }
    };

    // Open Create Permintaan
    const handleOpenCreateReq = () => {
        setFormRuangId(ruangList[0]?.id || '');
        setFormTanggal(new Date().toISOString().slice(0, 10));
        setFormCatatan('');
        setFormItems([
            { barang_id: '', qty: 1, satuan: 'PCS', keterangan: '' }
        ]);
        setShowCreateReqModal(true);
    };

    // Open Penyerahan Barang Modal (Done)
    const handleOpenSerahkanModal = (req) => {
        setSerahkanTargetReq(req);
        setSerahPenerima('');
        setSerahTanggal(new Date().toISOString().slice(0, 10));
        setSerahCatatan(`Realisasi Permintaan ${req.nomor}`);
        const items = (req.items || [])
            .filter(it => Number(it.qty_disetujui) > 0)
            .map(it => {
                const targetQty = Number(it.qty_disetujui);
                const remaining = Math.max(0, targetQty - Number(it.qty_dikeluarkan || 0));
                return {
                    permintaan_item: it.id,
                    barang_id: it.barang,
                    barang_nama: it.barang_nama,
                    barang_kode: it.barang_kode,
                    satuan: it.satuan || it.satuan_dasar_kode || 'PCS',
                    qty_disetujui: targetQty,
                    qty_serah: remaining,
                    keterangan: it.keterangan || ''
                };
            });
        setSerahItems(items);
        setShowDetailReqModal(false);
        setShowSerahkanModal(true);
    };

    const handleSerahItemQtyChange = (idx, val) => {
        const next = [...serahItems];
        next[idx].qty_serah = val;
        setSerahItems(next);
    };

    const handleExecuteSerahkan = async (e) => {
        e.preventDefault();
        if (!serahPenerima.trim()) {
            toast.error('Nama petugas penerima fisik dari unit ruangan wajib diisi.');
            return;
        }
        const validItems = serahItems.filter(it => Number(it.qty_serah) > 0);
        if (!validItems.length) {
            toast.error('Minimal satu item harus diserahkan dengan kuantitas > 0.');
            return;
        }

        setSerahSubmitting(true);
        try {
            const res = await api.post(`/gudang/permintaan/${serahkanTargetReq.id}/serahkan/`, {
                penerima_nama: serahPenerima.trim(),
                tanggal: serahTanggal,
                catatan: serahCatatan.trim(),
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    permintaan_item: it.permintaan_item,
                    qty: it.qty_serah,
                    satuan: it.satuan,
                    keterangan: it.keterangan
                }))
            });

            toast.success(res.data?.message || 'Barang berhasil diserahkan! Stok gudang telah terpotong.');
            setShowSerahkanModal(false);
            setShowDetailReqModal(false);
            setSelectedReq(null);
            await fetchPermintaan();
            await fetchPengeluaran();

            // Auto-print receipt if bon id returned
            if (res.data?.pengeluaran_id) {
                try {
                    const outRes = await api.get(`/gudang/pengeluaran/${res.data.pengeluaran_id}/`);
                    if (outRes.data) {
                        handlePrintBon(outRes.data);
                    }
                } catch (printErr) {
                    console.warn('Gagal cetak otomatis bon', printErr);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal memproses penyerahan barang.');
        } finally {
            setSerahSubmitting(false);
        }
    };

    // Open Approve Modal (Approver menentukan kuantitas disetujui)
    const handleOpenApproveModal = (req) => {
        setApproveTargetReq(req);
        const items = (req.items || []).map(it => {
            const minta = Number(it.qty_minta || 0);
            const disetujui = Number(it.qty_disetujui || 0);
            return {
                id: it.id,
                barang_id: it.barang,
                barang_nama: it.barang_nama,
                barang_kode: it.barang_kode,
                satuan: it.satuan || it.satuan_dasar_kode || 'PCS',
                qty_minta: minta,
                stok_tersedia: Number(it.stok_tersedia || 0),
                qty_disetujui: disetujui > 0 ? disetujui : minta,
                keterangan: it.keterangan || ''
            };
        });
        setApproveItems(items);
        setShowDetailReqModal(false);
        setShowApproveModal(true);
    };

    const handleApproveItemQtyChange = (idx, val) => {
        const next = [...approveItems];
        next[idx].qty_disetujui = val;
        setApproveItems(next);
    };

    const handleApproveSetAllMax = () => {
        const next = approveItems.map(it => ({
            ...it,
            qty_disetujui: it.qty_minta
        }));
        setApproveItems(next);
    };

    const handleExecuteApprove = async (e) => {
        e.preventDefault();
        let hasApproved = false;
        for (const it of approveItems) {
            const qtyApp = Number(it.qty_disetujui || 0);
            if (qtyApp < 0) {
                toast.error(`Kuantitas yang disetujui untuk '${it.barang_nama}' tidak boleh bernilai negatif.`);
                return;
            }
            if (qtyApp > 0) {
                hasApproved = true;
                if (qtyApp > it.stok_tersedia) {
                    toast.error(`Qty disetujui untuk '${it.barang_nama}' (${qtyApp} ${it.satuan}) melebihi stok gudang yang tersedia (${it.stok_tersedia} ${it.satuan}).`);
                    return;
                }
            }
        }

        if (!hasApproved) {
            toast.error('Minimal satu barang harus disetujui dengan kuantitas > 0. Jika seluruh barang ditolak, gunakan tombol Tolak Permintaan.');
            return;
        }

        setApproveSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${approveTargetReq.id}/approve/`, {
                items: approveItems.map(it => ({
                    id: it.id,
                    qty_disetujui: Number(it.qty_disetujui || 0)
                }))
            });
            toast.success(`Permintaan ${approveTargetReq.nomor} telah disetujui.`);
            setShowApproveModal(false);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menyetujui permintaan.');
        } finally {
            setApproveSubmitting(false);
        }
    };

    // Tolak Permintaan (Kasi)
    const handleOpenRejectModal = (req) => {
        setRejectTargetReq(req);
        setRejectAlasan('');
        setShowDetailReqModal(false);
        setShowRejectModal(true);
    };

    const handleExecuteReject = async (e) => {
        e.preventDefault();
        if (!rejectAlasan.trim()) {
            toast.error('Alasan penolakan wajib diisi.');
            return;
        }
        setRejectSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${rejectTargetReq.id}/reject/`, {
                alasan: rejectAlasan.trim()
            });
            toast.success(`Permintaan ${rejectTargetReq.nomor} berhasil ditolak.`);
            setShowRejectModal(false);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menolak permohonan.');
        } finally {
            setRejectSubmitting(false);
        }
    };

    // Print Receipt from Permintaan (using connected Bon Pengeluaran)
    const handlePrintFromReq = async (req) => {
        try {
            if (req.bon_pengeluaran_id) {
                const res = await api.get(`/gudang/pengeluaran/${req.bon_pengeluaran_id}/`);
                if (res.data) {
                    handlePrintBon(res.data);
                    return;
                }
            }
            const res = await api.get(`/gudang/pengeluaran/?search=${encodeURIComponent(req.nomor)}`);
            const out = (res.data?.results || [])[0];
            if (out) {
                handlePrintBon(out);
            } else {
                toast.error('Dokumen bon serah terima belum tersedia untuk dicetak.');
            }
        } catch (err) {
            toast.error('Gagal memuat dokumen cetak: ' + (err.response?.data?.error || err.message));
        }
    };

    // Handle Item Row Changes
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

    const handleAddItemRow = () => {
        setFormItems([...formItems, { barang_id: '', permintaan_item: null, qty: 1, satuan: 'PCS', keterangan: '' }]);
    };

    const handleRemoveItemRow = (idx) => {
        if (formItems.length === 1) return;
        setFormItems(formItems.filter((_, i) => i !== idx));
    };

    // Submit Permintaan
    const handleSubmitCreateReq = async (e) => {
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
                auto_submit: true,
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    qty_minta: it.qty,
                    satuan: it.satuan,
                    keterangan: it.keterangan
                }))
            });
            setShowCreateReqModal(false);
            toast.success('Permintaan unit berhasil dibuat & diajukan.');
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSaving(false);
        }
    };

    // Approve Permintaan (Custom Modal Confirm oleh Kasi)
    const handleApproveReq = (req) => {
        setConfirmAction({
            type: 'APPROVE_REQ',
            target: req,
            title: 'Verifikasi & Setujui Permintaan (Kasi)',
            subtitle: `${req.nomor} — ${req.ruang_nama}`,
            message: `Verifikasi dan setujui permohonan amprahan dari ${req.ruang_nama}? Status permintaan akan menjadi DISETUJUI dan siap diserahkan fisiknya oleh petugas logistik.`,
            btnText: 'Verifikasi & Setujui',
            btnColor: 'success',
            icon: <Check size={20} />
        });
    };

    // Approve Pengeluaran / Cut Stock (Custom Modal Confirm)
    const handleApproveOut = (out) => {
        setConfirmAction({
            type: 'APPROVE_OUT',
            target: out,
            title: 'Setujui & Serahkan Fisik Barang',
            subtitle: `${out.nomor} — ${out.ruang_nama}`,
            message: `Setujui & Serahkan fisik barang ke ${out.ruang_nama}? Tindakan ini akan memotong saldo stok buku besar gudang secara permanen.`,
            btnText: 'Setujui & Potong Stok',
            btnColor: 'success',
            icon: <CheckCircle2 size={20} />
        });
    };

    const handleExecuteConfirmAction = async () => {
        if (!confirmAction || !confirmAction.target) return;
        const { type, target } = confirmAction;

        setConfirmSubmitting(true);
        try {
            if (type === 'APPROVE_REQ') {
                await api.post(`/gudang/permintaan/${target.id}/approve/`, {});
                toast.success(`Permintaan ${target.nomor} telah disetujui.`);
                fetchPermintaan();
                setShowDetailReqModal(false);
            } else if (type === 'APPROVE_OUT') {
                await api.post(`/gudang/pengeluaran/${target.id}/approve/`, {});
                toast.success('Barang fisik telah diserahkan dan saldo stok telah dipotong.');
                fetchPengeluaran();
                setShowDetailOutModal(false);
            }
            setConfirmAction(null);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal memproses aksi.');
        } finally {
            setConfirmSubmitting(false);
        }
    };

    // Print Receipt
    const handlePrintBon = (out) => {
        const printWindow = window.open('', '_blank');
        const content = `
            <html>
                <head>
                    <title>Bukti Pengeluaran Barang - ${out.nomor}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 25px; color: #111; font-size: 13px; }
                        h2, h3 { margin: 0; padding: 0; }
                        .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
                        .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 16px; font-size: 12px; line-height: 1.6; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #333; padding: 7px 10px; font-size: 12px; }
                        th { background: #eee; }
                        .sign-grid { display: grid; grid-template-columns: 1fr 1fr; margin-top: 40px; text-align: center; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>RS SIAGA AL MUNAWWARAH SAMARINDA</h2>
                        <p style="margin: 3px 0 0 0; font-size: 12px;">Gudang Logistik Umum (Non-Farmasi) - Bukti Pengeluaran Fisik</p>
                    </div>
                    <div class="info-grid">
                        <div>
                            <strong>Nomor Bon:</strong> ${out.nomor}<br/>
                            <strong>Tanggal:</strong> ${out.tanggal}<br/>
                            <strong>Unit Peminta:</strong> ${out.ruang_nama}
                        </div>
                        <div>
                            <strong>Penerima:</strong> ${out.penerima_nama || '-'}<br/>
                            <strong>Ref Permintaan:</strong> ${out.permintaan_nomor || 'Pengeluaran Langsung'}<br/>
                            <strong>Status:</strong> ${out.status}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>Kode</th>
                                <th>Nama Barang</th>
                                <th>Qty</th>
                                <th>Satuan</th>
                                <th>Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(out.items || []).map((it, idx) => `
                                <tr>
                                    <td align="center">${idx + 1}</td>
                                    <td>${it.barang_kode}</td>
                                    <td>${it.barang_nama}</td>
                                    <td align="right">${Number(it.qty).toLocaleString('id-ID')}</td>
                                    <td align="center">${it.satuan}</td>
                                    <td>${it.keterangan || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="sign-grid">
                        <div>
                            <p>Petugas Gudang Penyerah,</p>
                            <br/><br/><br/>
                            <p>( ${out.approved_by_nama || out.created_by_nama || 'Petugas Gudang'} )</p>
                        </div>
                        <div>
                            <p>Petugas Ruangan Penerima,</p>
                            <br/><br/><br/>
                            <p>( ${out.penerima_nama || '................................'} )</p>
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* SUB-TAB TOGGLE */}
            <div>
                <div className="gdg-segmented-tabs">
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'permintaan' ? 'active' : ''}`}
                        onClick={() => { setSubTab('permintaan'); setPage(1); setStatusFilter(''); }}
                    >
                        <span className="tab-icon"><Send size={16} /></span>
                        <span>Permintaan Ruangan (Amprahan)</span>
                    </button>
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'pengeluaran' ? 'active' : ''}`}
                        onClick={() => { setSubTab('pengeluaran'); setPage(1); setStatusFilter(''); }}
                    >
                        <span className="tab-icon"><FileText size={16} /></span>
                        <span>Bon Pengeluaran / Serah Terima Fisik</span>
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: PERMINTAAN */}
            {subTab === 'permintaan' && (
                <div className="gdg-card">
                    <div className="gdg-card-head">
                        <div className="gdg-card-title">
                            <h2>Permintaan Barang Unit Ruangan</h2>
                            <p>Daftar permohonan amprahan dari 48 unit ruangan RS Siaga Al Munawwarah</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="gdg-btn soft" onClick={handleSyncSiaga} disabled={syncing}>
                                <DownloadCloud size={15} />
                                {syncing ? 'Menarik data...' : 'Sinkron dari Siaga RS'}
                            </button>
                            <button className="gdg-btn soft" onClick={fetchPermintaan} disabled={loading}>
                                <RefreshCw size={15} /> Refresh
                            </button>
                            <button className="gdg-btn primary" onClick={handleOpenCreateReq}>
                                <Plus size={16} /> Buat Permintaan Unit
                            </button>
                        </div>
                    </div>

                    {/* TOOLBAR */}
                    <div className="gdg-toolbar">
                        <div className="gdg-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Cari nomor permintaan, nama ruangan..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            className="gdg-select-control"
                            style={{ minWidth: '180px', height: '40px', borderRadius: '8px' }}
                        >
                            <option value="">Semua Status Permintaan</option>
                            <option value="MENUNGGU">Menunggu Persetujuan</option>
                            <option value="DISETUJUI">Disetujui (Siap Serah Fisik)</option>
                            <option value="SELESAI">Selesai (Sudah Diserahkan)</option>
                            <option value="DITOLAK">Ditolak</option>
                        </select>
                        {(searchQuery || statusFilter) && (
                            <button
                                type="button"
                                className="gdg-btn soft"
                                onClick={() => {
                                    setSearchQuery('');
                                    setStatusFilter('');
                                    setPage(1);
                                }}
                                title="Reset filter"
                            >
                                <X size={14} /> Reset
                            </button>
                        )}
                    </div>

                    {/* TABLE */}
                    <div className="gdg-table-wrap">
                        <table className="gdg-table">
                            <thead>
                                <tr>
                                    <th>NO PERMINTAAN</th>
                                    <th>TGL MINTA</th>
                                    <th>TGL PENYERAHAN</th>
                                    <th>UNIT / RUANGAN</th>
                                    <th>JUMLAH ITEM</th>
                                    <th>STATUS</th>
                                    <th>PEMOHON</th>
                                    <th style={{ textAlign: 'right' }}>AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Memuat permohonan...</td></tr>
                                ) : permintaanList.length === 0 ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Tidak ada data permohonan.</td></tr>
                                ) : (
                                    permintaanList.map(req => (
                                        <tr key={req.id}>
                                            <td style={{ fontWeight: 600, color: '#38bdf8' }}>{req.nomor}</td>
                                            <td>{req.tanggal}</td>
                                            <td>
                                                {req.tanggal_penyerahan ? (
                                                    <span style={{ color: '#10b981', fontWeight: 600 }}>{req.tanggal_penyerahan}</span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                )}
                                            </td>
                                            <td className="gdg-cell-strong">{req.ruang_nama}</td>
                                            <td>{(req.items || []).length} item</td>
                                            <td>
                                                <span className={`gdg-badge ${
                                                    req.status === 'SELESAI' ? 'success' :
                                                    req.status === 'DISETUJUI' ? 'info' :
                                                    req.status === 'MENUNGGU' ? 'warning' :
                                                    req.status === 'DITOLAK' ? 'danger' : 'neutral'
                                                }`}>
                                                    {req.status === 'MENUNGGU' ? 'Menunggu Persetujuan' :
                                                     req.status === 'DISETUJUI' ? 'Disetujui (Siap Serah)' :
                                                     req.status === 'SELESAI' ? 'Selesai (Diserahkan)' :
                                                     req.status === 'DITOLAK' ? 'Ditolak' : req.status}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.85rem' }}>{req.created_by_nama || 'Unit Ruangan'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                    {/* 1. LIHAT DETAIL - SELALU MUNCUL */}
                                                    <button
                                                        type="button"
                                                        className="gdg-action-btn view"
                                                        title="Lihat Detail Permintaan"
                                                        onClick={() => { setSelectedReq(req); setShowDetailReqModal(true); }}
                                                    >
                                                        <Eye size={15} />
                                                    </button>

                                                    {/* 2. JIKA STATUS MENUNGGU: MUNCUL VERIFIKASI & TOLAK UNTUK APPROVER LOGISTIK */}
                                                    {req.status === 'MENUNGGU' && req.can_approve && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="gdg-action-btn success"
                                                                title="Verifikasi & Tentukan Kuantitas yang Disetujui"
                                                                onClick={() => handleOpenApproveModal(req)}
                                                            >
                                                                <Check size={15} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="gdg-action-btn delete"
                                                                title="Tolak Permintaan"
                                                                onClick={() => handleOpenRejectModal(req)}
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* 3. JIKA STATUS DISETUJUI: MUNCUL TOMBOL PENYERAHAN BARANG (DONE) UNTUK LOGISTIK */}
                                                    {req.status === 'DISETUJUI' && (
                                                        <button
                                                            type="button"
                                                            className="gdg-action-btn primary"
                                                            title="Serahkan Fisik Barang & Selesaikan (Done)"
                                                            onClick={() => handleOpenSerahkanModal(req)}
                                                        >
                                                            <PackageCheck size={16} />
                                                        </button>
                                                    )}

                                                    {/* 4. JIKA STATUS SELESAI: MUNCUL TOMBOL CETAK BUKTI SERAH TERIMA FISIK */}
                                                    {req.status === 'SELESAI' && (
                                                        <button
                                                            type="button"
                                                            className="gdg-action-btn print"
                                                            title="Cetak Bukti Serah Terima Fisik (PDF)"
                                                            onClick={() => handlePrintFromReq(req)}
                                                        >
                                                            <Printer size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalCount > 10 && (
                        <div style={{ marginTop: '16px' }}>
                            <SimplePagination page={page} totalPages={Math.ceil(totalCount / 10)} onPageChange={setPage} totalCount={totalCount} pageSize={10} />
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: PENGELUARAN */}
            {subTab === 'pengeluaran' && (
                <div className="gdg-card">
                    <div className="gdg-card-head">
                        <div className="gdg-card-title">
                            <h2>Bon Pengeluaran Barang (Serah Terima Fisik)</h2>
                            <p>Pencatatan serah terima fisik barang keluar ke unit ruangan yang memotong buku besar stok</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="gdg-btn soft" onClick={fetchPengeluaran} disabled={loading}>
                                <RefreshCw size={15} /> Refresh
                            </button>
                        </div>
                    </div>

                    {/* TOOLBAR */}
                    <div className="gdg-toolbar">
                        <div className="gdg-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Cari nomor bon keluar, penerima, ruangan..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            className="gdg-select-control"
                            style={{ minWidth: '180px', height: '40px', borderRadius: '8px' }}
                        >
                            <option value="">Semua Status Bon</option>
                            <option value="DRAFT">Draft (Belum Diserahkan)</option>
                            <option value="DISETUJUI">Disetujui (Stok Terpotong)</option>
                        </select>
                        {(searchQuery || statusFilter) && (
                            <button
                                type="button"
                                className="gdg-btn soft"
                                onClick={() => {
                                    setSearchQuery('');
                                    setStatusFilter('');
                                    setPage(1);
                                }}
                                title="Reset filter"
                            >
                                <X size={14} /> Reset
                            </button>
                        )}
                    </div>

                    {/* TABLE */}
                    <div className="gdg-table-wrap">
                        <table className="gdg-table">
                            <thead>
                                <tr>
                                    <th>NO BON OUT</th>
                                    <th>TGL PENYERAHAN</th>
                                    <th>UNIT / RUANGAN</th>
                                    <th>PENERIMA FISIK</th>
                                    <th>REF PERMINTAAN</th>
                                    <th>NILAI HPP</th>
                                    <th>STATUS</th>
                                    <th style={{ textAlign: 'right' }}>AKSI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Memuat bon pengeluaran...</td></tr>
                                ) : pengeluaranList.length === 0 ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Tidak ada data bon pengeluaran.</td></tr>
                                ) : (
                                    pengeluaranList.map(out => (
                                        <tr key={out.id}>
                                            <td style={{ fontWeight: 600, color: '#f59e0b' }}>{out.nomor}</td>
                                            <td style={{ fontWeight: 600, color: '#10b981' }}>{out.tanggal}</td>
                                            <td className="gdg-cell-strong">{out.ruang_nama}</td>
                                            <td>{out.penerima_nama || '-'}</td>
                                            <td>{out.permintaan_nomor ? <span style={{ color: '#38bdf8' }}>{out.permintaan_nomor}</span> : <span style={{ color: '#64748b' }}>Langsung</span>}</td>
                                            <td style={{ fontWeight: 600, color: '#10b981' }}>{formatRp(out.total_nilai)}</td>
                                            <td>
                                                <span className={`gdg-badge ${out.status === 'DISETUJUI' ? 'success' : 'neutral'}`}>
                                                    {out.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                    <button
                                                        type="button"
                                                        className="gdg-action-btn view"
                                                        title="Lihat Detail Bon Keluar"
                                                        onClick={() => { setSelectedOut(out); setShowDetailOutModal(true); }}
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="gdg-action-btn print"
                                                        title="Cetak Bon Pengeluaran (PDF)"
                                                        onClick={() => handlePrintBon(out)}
                                                    >
                                                        <Printer size={15} />
                                                    </button>
                                                    {out.can_approve && (
                                                        <button
                                                            type="button"
                                                            className="gdg-action-btn success"
                                                            title="Setujui & Potong Stok Gudang"
                                                            onClick={() => handleApproveOut(out)}
                                                        >
                                                            <Check size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalCount > 10 && (
                        <div style={{ marginTop: '16px' }}>
                            <SimplePagination page={page} totalPages={Math.ceil(totalCount / 10)} onPageChange={setPage} totalCount={totalCount} pageSize={10} />
                        </div>
                    )}
                </div>
            )}

            {/* MODAL: BUAT PERMINTAAN */}
            {showCreateReqModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateReqModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(37, 99, 235, 0.15)',
                                    color: '#2563eb'
                                }}>
                                    <Plus size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Buat Permintaan Barang (Amprahan)</h3>
                                    <p>Ajukan permohonan kebutuhan operasional unit ruangan ke gudang logistik</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowCreateReqModal(false)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitCreateReq}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Unit / Ruangan Pemohon</label>
                                        <select value={formRuangId} onChange={(e) => setFormRuangId(e.target.value)} required>
                                            {ruangList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                                        </select>
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Tanggal Permintaan *</label>
                                        <DateField
                                            value={formTanggal}
                                            onChange={(val) => setFormTanggal(val)}
                                            placeholder="Pilih tanggal..."
                                            className="gdg-date-field"
                                        />
                                    </div>
                                </div>
                                <div className="gdg-form-group">
                                    <label>Catatan / Keterangan</label>
                                    <input type="text" placeholder="Misal: Kebutuhan operasional mingguan" value={formCatatan} onChange={(e) => setFormCatatan(e.target.value)} />
                                </div>

                                <div className="gdg-detail-divider">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span className="gdg-detail-section-title">Daftar Barang yang Diminta</span>
                                        <button type="button" className="gdg-btn soft" onClick={handleAddItemRow}><Plus size={14} /> Tambah Baris</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {formItems.map((item, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 100px 80px 1.5fr 36px', gap: '8px', alignItems: 'center' }}>
                                                <select value={item.barang_id} onChange={(e) => handleItemChange(idx, 'barang_id', e.target.value)} required>
                                                    <option value="">-- Pilih Barang --</option>
                                                    {barangList.map(b => <option key={b.id} value={b.id}>[{b.kode}] {b.nama}</option>)}
                                                </select>
                                                <input type="number" min="0.1" step="any" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} required placeholder="Qty" />
                                                <input type="text" value={item.satuan} readOnly placeholder="Satuan" className="gdg-inline-input" style={{ textAlign: 'center' }} />
                                                <input type="text" placeholder="Ket..." value={item.keterangan} onChange={(e) => handleItemChange(idx, 'keterangan', e.target.value)} />
                                                <button type="button" className="gdg-btn soft" style={{ padding: '6px', color: '#f43f5e' }} onClick={() => handleRemoveItemRow(idx)} disabled={formItems.length === 1}><X size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn soft" onClick={() => setShowCreateReqModal(false)}>Batal</button>
                                <button type="submit" className="gdg-btn primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Ajukan Permintaan'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: PENYERAHAN BARANG FISIK (DONE OLEH LOGISTIK) */}
            {showSerahkanModal && serahkanTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !serahSubmitting && setShowSerahkanModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981'
                                }}>
                                    <PackageCheck size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Serah Terima Fisik Barang (Done)</h3>
                                    <p>Permintaan: <strong style={{ color: '#0284c7' }}>{serahkanTargetReq.nomor}</strong> — {serahkanTargetReq.ruang_nama}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => !serahSubmitting && setShowSerahkanModal(false)}
                                disabled={serahSubmitting}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteSerahkan}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Unit / Ruangan Penerima</label>
                                        <input
                                            type="text"
                                            value={serahkanTargetReq.ruang_nama}
                                            readOnly
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Tanggal Penyerahan Fisik *</label>
                                        <DateField
                                            value={serahTanggal}
                                            onChange={(val) => setSerahTanggal(val)}
                                            placeholder="Pilih tanggal penyerahan..."
                                            className="gdg-date-field"
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Nama Petugas Penerima Fisik (Ruangan) *</label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: Ns. Siti Rahma (Perawat IGD)"
                                            value={serahPenerima}
                                            onChange={(e) => setSerahPenerima(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                        <small style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '3px' }}>
                                            Nama perawat/staf unit ruangan yang mengambil fisik barang di loket gudang.
                                        </small>
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Catatan Penyerahan (Opsional)</label>
                                        <input
                                            type="text"
                                            placeholder="Misal: Penyerahan rutin amprahan mingguan"
                                            value={serahCatatan}
                                            onChange={(e) => setSerahCatatan(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-detail-divider">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span className="gdg-detail-section-title">Rincian Fisik Barang yang Diserahkan</span>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Kuantitas terisi otomatis sesuai persetujuan</span>
                                    </div>
                                    <div className="gdg-table-wrap">
                                        <table className="gdg-table" style={{ fontSize: '0.86rem' }}>
                                            <thead>
                                                <tr>
                                                    <th>KODE</th>
                                                    <th>NAMA BARANG</th>
                                                    <th style={{ textAlign: 'right' }}>DISETUJUI</th>
                                                    <th style={{ textAlign: 'right', width: '130px' }}>QTY DISERAHKAN *</th>
                                                    <th>SATUAN</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {serahItems.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ color: '#0284c7', fontWeight: 600 }}>{item.barang_kode}</td>
                                                        <td className="gdg-cell-strong">{item.barang_nama}</td>
                                                        <td style={{ textAlign: 'right', color: '#64748b', fontWeight: 600 }}>{Number(item.qty_disetujui).toLocaleString('id-ID')}</td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <input
                                                                type="number"
                                                                min="0.001"
                                                                step="any"
                                                                value={item.qty_serah}
                                                                onChange={(e) => handleSerahItemQtyChange(idx, e.target.value)}
                                                                required
                                                                className="gdg-inline-input"
                                                                style={{ width: '100%', textAlign: 'right', fontWeight: 600, color: '#10b981' }}
                                                            />
                                                        </td>
                                                        <td>{item.satuan}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="gdg-banner success">
                                    <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />
                                    <span>
                                        Mengonfirmasi penyerahan ini akan otomatis menerbitkan <strong>Bon Pengeluaran</strong>, memotong <strong>kartu stok gudang</strong>, dan mengubah status permohonan menjadi <strong>SELESAI</strong>.
                                    </span>
                                </div>
                            </div>

                            <div className="gdg-modal-foot" style={{ justifyContent: 'space-between' }}>
                                <button type="button" className="gdg-btn soft" onClick={() => setShowSerahkanModal(false)} disabled={serahSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn success" disabled={serahSubmitting}>
                                    <CheckCircle2 size={16} /> {serahSubmitting ? 'Memproses Penyerahan...' : 'Konfirmasi Penyerahan & Selesai (Done)'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: TOLAK PERMINTAAN */}
            {showRejectModal && rejectTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !rejectSubmitting && setShowRejectModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(244, 63, 94, 0.15)',
                                    color: '#f43f5e'
                                }}>
                                    <XCircle size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Tolak Permintaan Barang</h3>
                                    <p>{rejectTargetReq.nomor} — {rejectTargetReq.ruang_nama}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => !rejectSubmitting && setShowRejectModal(false)}
                                disabled={rejectSubmitting}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteReject}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-group">
                                    <label>Alasan Penolakan Permintaan *</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Tuliskan alasan penolakan permohonan amprahan ini..."
                                        value={rejectAlasan}
                                        onChange={(e) => setRejectAlasan(e.target.value)}
                                        required
                                        autoFocus
                                        className="gdg-inline-input"
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                    <small style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '3px' }}>
                                        Alasan ini akan dapat dibaca oleh staf unit ruangan yang bersangkutan.
                                    </small>
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn soft" onClick={() => setShowRejectModal(false)} disabled={rejectSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn danger" disabled={rejectSubmitting}>
                                    <X size={15} /> {rejectSubmitting ? 'Memproses...' : 'Tolak Permintaan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: DETAIL PERMINTAAN */}
            {showDetailReqModal && selectedReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailReqModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(14, 165, 233, 0.15)',
                                    color: '#0284c7'
                                }}>
                                    <FileText size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Detail Permintaan: {selectedReq.nomor}</h3>
                                    <p>
                                        Ruangan: <strong style={{ color: '#0284c7' }}>{selectedReq.ruang_nama}</strong> | Tanggal Pengajuan: {selectedReq.tanggal}
                                        {selectedReq.tanggal_penyerahan && ` | Diserahkan: ${selectedReq.tanggal_penyerahan}`}
                                        {selectedReq.approved_by_nama && ` | Diverifikasi: ${selectedReq.approved_by_nama}`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowDetailReqModal(false)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {selectedReq.status === 'DITOLAK' && selectedReq.alasan_tolak && (
                                <div className="gdg-banner danger">
                                    <XCircle size={16} color="#f43f5e" style={{ flexShrink: 0 }} />
                                    <span><strong>Alasan Penolakan:</strong> {selectedReq.alasan_tolak}</span>
                                </div>
                            )}

                            <div className="gdg-table-wrap">
                                <table className="gdg-table" style={{ fontSize: '0.86rem' }}>
                                    <thead>
                                        <tr>
                                            <th>KODE</th>
                                            <th>NAMA BARANG</th>
                                            <th style={{ textAlign: 'right' }}>DIMINTA</th>
                                            <th style={{ textAlign: 'right' }}>DISETUJUI</th>
                                            <th style={{ textAlign: 'right' }}>TERSEDIA GUDANG</th>
                                            <th>SATUAN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedReq.items || []).map((it, idx) => (
                                            <tr key={idx}>
                                                <td style={{ color: '#0284c7', fontWeight: 600 }}>{it.barang_kode}</td>
                                                <td className="gdg-cell-strong">{it.barang_nama}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(it.qty_minta).toLocaleString('id-ID')}</td>
                                                <td style={{ textAlign: 'right', color: Number(it.qty_disetujui) > 0 ? '#10b981' : (selectedReq.status === 'DISETUJUI' || selectedReq.status === 'SELESAI' ? '#f43f5e' : '#94a3b8'), fontWeight: 600 }}>
                                                    {selectedReq.status === 'MENUNGGU' || selectedReq.status === 'DRAFT'
                                                        ? '-'
                                                        : Number(it.qty_disetujui) > 0
                                                            ? Number(it.qty_disetujui).toLocaleString('id-ID')
                                                            : '0 (Ditolak)'}
                                                </td>
                                                <td style={{ textAlign: 'right', color: it.stok_tersedia < it.qty_minta ? '#f43f5e' : '#0284c7', fontWeight: 600 }}>
                                                    {Number(it.stok_tersedia).toLocaleString('id-ID')}
                                                </td>
                                                <td>{it.satuan}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="gdg-modal-foot">
                            <button className="gdg-btn soft" onClick={() => setShowDetailReqModal(false)}>Tutup</button>
                            {selectedReq.status === 'MENUNGGU' && selectedReq.can_approve && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="gdg-btn danger" onClick={() => handleOpenRejectModal(selectedReq)}>
                                        <X size={15} /> Tolak Permintaan
                                    </button>
                                    <button className="gdg-btn success" onClick={() => handleOpenApproveModal(selectedReq)}>
                                        <Check size={15} /> Verifikasi & Setujui
                                    </button>
                                </div>
                            )}
                            {selectedReq.status === 'DISETUJUI' && (
                                <button className="gdg-btn primary" onClick={() => handleOpenSerahkanModal(selectedReq)}>
                                    <PackageCheck size={16} /> Serahkan Barang (Done)
                                </button>
                            )}
                            {selectedReq.status === 'SELESAI' && (
                                <button className="gdg-btn soft" onClick={() => handlePrintFromReq(selectedReq)}>
                                    <Printer size={15} /> Cetak Bukti Serah Terima
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: DETAIL PENGELUARAN */}
            {showDetailOutModal && selectedOut && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailOutModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#d97706'
                                }}>
                                    <FileText size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Bon Pengeluaran: {selectedOut.nomor}</h3>
                                    <p>
                                        Unit: <strong style={{ color: '#d97706' }}>{selectedOut.ruang_nama}</strong> | Penerima: {selectedOut.penerima_nama || '-'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowDetailOutModal(false)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="gdg-modal-body">
                            <div className="gdg-table-wrap">
                                <table className="gdg-table" style={{ fontSize: '0.86rem' }}>
                                    <thead>
                                        <tr>
                                            <th>KODE</th>
                                            <th>NAMA BARANG</th>
                                            <th style={{ textAlign: 'right' }}>QTY KELUAR</th>
                                            <th>SATUAN</th>
                                            <th style={{ textAlign: 'right' }}>HPP BERJALAN</th>
                                            <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedOut.items || []).map((it, idx) => (
                                            <tr key={idx}>
                                                <td style={{ color: '#d97706', fontWeight: 600 }}>{it.barang_kode}</td>
                                                <td className="gdg-cell-strong">{it.barang_nama}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(it.qty).toLocaleString('id-ID')}</td>
                                                <td>{it.satuan}</td>
                                                <td style={{ textAlign: 'right', color: '#64748b' }}>{formatRp(it.harga_unit)}</td>
                                                <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{formatRp(it.subtotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
                                <span style={{ color: '#64748b', fontWeight: 500 }}>Total Nilai HPP Dikeluarkan:</span>
                                <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{formatRp(selectedOut.total_nilai)}</strong>
                            </div>
                        </div>
                        <div className="gdg-modal-foot">
                            <button className="gdg-btn soft" onClick={() => handlePrintBon(selectedOut)}>
                                <Printer size={15} /> Cetak Bukti Serah Terima
                            </button>
                            <button className="gdg-btn soft" onClick={() => setShowDetailOutModal(false)}>Tutup</button>
                            {selectedOut.can_approve && (
                                <button className="gdg-btn primary" onClick={() => handleApproveOut(selectedOut)}>
                                    <CheckCircle2 size={16} /> Setujui & Potong Stok Sekarang
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: VERIFIKASI & PERSETUJUAN PERMINTAAN (TENTUKAN JUMLAH YANG DISETUJUI) */}
            {showApproveModal && approveTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !approveSubmitting && setShowApproveModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981'
                                }}>
                                    <CheckCircle2 size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Persetujuan Permintaan Barang</h3>
                                    <p>Permintaan: <strong style={{ color: '#0284c7' }}>{approveTargetReq.nomor}</strong> — {approveTargetReq.ruang_nama}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => !approveSubmitting && setShowApproveModal(false)}
                                disabled={approveSubmitting}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteApprove}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Unit / Ruangan Pemohon</label>
                                        <input
                                            type="text"
                                            value={approveTargetReq.ruang_nama}
                                            readOnly
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Tanggal Pengajuan</label>
                                        <input
                                            type="text"
                                            value={approveTargetReq.tanggal}
                                            readOnly
                                        />
                                    </div>
                                </div>

                                {approveTargetReq.catatan && (
                                    <div className="gdg-form-group">
                                        <label>Catatan dari Ruangan</label>
                                        <div className="gdg-readonly-box">
                                            {approveTargetReq.catatan}
                                        </div>
                                    </div>
                                )}

                                <div className="gdg-detail-divider">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span className="gdg-detail-section-title">Tentukan Kuantitas yang Disetujui (ACC)</span>
                                        <button
                                            type="button"
                                            className="gdg-btn soft"
                                            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                            onClick={handleApproveSetAllMax}
                                        >
                                            Setujui Penuh Semua
                                        </button>
                                    </div>
                                    <div className="gdg-table-wrap">
                                        <table className="gdg-table" style={{ fontSize: '0.86rem' }}>
                                            <thead>
                                                <tr>
                                                    <th>KODE</th>
                                                    <th>NAMA BARANG</th>
                                                    <th style={{ textAlign: 'right' }}>DIMINTA</th>
                                                    <th style={{ textAlign: 'right' }}>STOK GUDANG</th>
                                                    <th style={{ textAlign: 'right', width: '140px' }}>QTY DISETUJUI *</th>
                                                    <th>SATUAN</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {approveItems.map((item, idx) => {
                                                    const qtyVal = Number(item.qty_disetujui || 0);
                                                    const stokVal = Number(item.stok_tersedia || 0);
                                                    const isOverStock = qtyVal > stokVal;
                                                    const isZeroOrLess = !item.qty_disetujui || qtyVal <= 0;
                                                    return (
                                                        <tr key={idx}>
                                                            <td style={{ color: '#0284c7', fontWeight: 600 }}>{item.barang_kode}</td>
                                                            <td className="gdg-cell-strong">{item.barang_nama}</td>
                                                            <td style={{ textAlign: 'right', color: '#64748b', fontWeight: 600 }}>
                                                                {Number(item.qty_minta).toLocaleString('id-ID')}
                                                            </td>
                                                            <td style={{
                                                                textAlign: 'right',
                                                                color: item.stok_tersedia <= 0 ? '#f43f5e' : '#0284c7',
                                                                fontWeight: 600
                                                            }}>
                                                                {Number(item.stok_tersedia).toLocaleString('id-ID')}
                                                                {item.stok_tersedia <= 0 && <small style={{ display: 'block', color: '#f43f5e', fontSize: '10px' }}>Habis</small>}
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.stok_tersedia || 0}
                                                                    step="any"
                                                                    value={item.qty_disetujui}
                                                                    onChange={(e) => handleApproveItemQtyChange(idx, e.target.value)}
                                                                    required
                                                                    className="gdg-inline-input"
                                                                    style={{
                                                                        width: '100%',
                                                                        textAlign: 'right',
                                                                        fontWeight: 600,
                                                                        color: isOverStock ? '#f43f5e' : isZeroOrLess ? '#64748b' : '#10b981',
                                                                        borderColor: isOverStock ? '#f43f5e' : isZeroOrLess ? '#cbd5e1' : undefined,
                                                                        background: isOverStock ? '#fff1f2' : isZeroOrLess ? '#f8fafc' : undefined
                                                                    }}
                                                                />
                                                                {isOverStock && <small style={{ display: 'block', color: '#f43f5e', fontSize: '10.5px' }}>Melebihi stok!</small>}
                                                                {isZeroOrLess && !isOverStock && <small style={{ display: 'block', color: '#64748b', fontSize: '10.5px' }}>Tidak disetujui (0)</small>}
                                                            </td>
                                                            <td>{item.satuan}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="gdg-banner info">
                                    <AlertCircle size={16} color="#0284c7" style={{ flexShrink: 0 }} />
                                    <span>
                                        Anda dapat menyesuaikan kuantitas yang disetujui jika stok fisik gudang terbatas atau sesuai jatah kuota ruangan. Barang yang diisi 0 berarti tidak disetujui.
                                    </span>
                                </div>

                                {approveItems.some(it => Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0)) && (
                                    <div className="gdg-banner danger" style={{ marginTop: '10px', background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                                        <span>Kuantitas yang disetujui melebihi stok gudang yang tersedia. Silakan kurangi kuantitas.</span>
                                    </div>
                                )}

                                {approveItems.every(it => Number(it.qty_disetujui || 0) <= 0) && !approveItems.some(it => Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0)) && (
                                    <div className="gdg-banner warning" style={{ marginTop: '10px', background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                                        <span>Seluruh kuantitas bernilai 0. Minimal harus ada 1 barang yang disetujui (&gt; 0). Jika seluruh barang ditolak, gunakan tombol <strong>Tolak Permintaan</strong>.</span>
                                    </div>
                                )}
                            </div>

                            <div className="gdg-modal-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    className="gdg-btn danger"
                                    onClick={() => {
                                        const target = approveTargetReq;
                                        setShowApproveModal(false);
                                        handleOpenRejectModal(target);
                                    }}
                                    disabled={approveSubmitting}
                                >
                                    <X size={15} /> Tolak Permintaan
                                </button>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" className="gdg-btn soft" onClick={() => setShowApproveModal(false)} disabled={approveSubmitting}>
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className="gdg-btn success"
                                        disabled={
                                            approveSubmitting ||
                                            approveItems.some(it => Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0)) ||
                                            approveItems.every(it => Number(it.qty_disetujui || 0) <= 0)
                                        }
                                        style={
                                            (approveItems.some(it => Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0)) ||
                                             approveItems.every(it => Number(it.qty_disetujui || 0) <= 0))
                                                ? { opacity: 0.5, cursor: 'not-allowed' }
                                                : {}
                                        }
                                    >
                                        <Check size={16} /> {approveSubmitting ? 'Menyimpan...' : 'Setujui & Terbitkan Izin Penyerahan'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL KONFIRMASI AKSI (SETUJUI PERMINTAAN / SETUJUI PENGELUARAN) */}
            {confirmAction && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !confirmSubmitting && setConfirmAction(null)}>
                    <div className="gdg-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981'
                                }}>
                                    {confirmAction.icon}
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>{confirmAction.title}</h3>
                                    <p>{confirmAction.subtitle}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => !confirmSubmitting && setConfirmAction(null)}
                                disabled={confirmSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body">
                            <p style={{ color: '#cbd5e1', fontSize: '0.92rem', lineHeight: '1.6', margin: '0 0 8px 0' }}>
                                {confirmAction.message}
                            </p>
                        </div>

                        <div className="gdg-modal-foot">
                            <button
                                type="button"
                                className="gdg-btn soft"
                                onClick={() => setConfirmAction(null)}
                                disabled={confirmSubmitting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className={`gdg-btn ${confirmAction.btnColor || 'primary'}`}
                                onClick={handleExecuteConfirmAction}
                                disabled={confirmSubmitting}
                            >
                                {confirmSubmitting ? 'Memproses...' : confirmAction.btnText}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
