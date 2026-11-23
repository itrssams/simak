import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
    Send,
    Plus,
    Search,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Eye,
    Check,
    X,
    FileText,
    Printer,
    DownloadCloud,
    AlertCircle,
    PackageCheck,
    ChevronDown,
    Clock,
    Ban,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';
import {
    useConcurrentPermintaanCheck,
    checkPermintaanDuplicatesApi,
} from './concurrentRequestUtils';
import {
    ConcurrentApproverBanner,
    ConcurrentCreateWarningBanner,
    ConcurrentDuplicateConfirmModal,
    ConcurrentItemInlineList,
    ConcurrentTableBadge,
} from './ConcurrentRequestNotice';

export default function GudangPengeluaran({ heroActionsTarget = null }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialStatusParam = searchParams.get('status') || '';
    const initialPermintaanId = searchParams.get('permintaan') || '';
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
    const [statusFilter, setStatusFilter] = useState(initialStatusParam);

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

    // Modal: Verifikasi & Persetujuan Permintaan (Tentukan Qty Disetujui / Pengadaan / Tolak)
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [approveTargetReq, setApproveTargetReq] = useState(null);
    const [approveItems, setApproveItems] = useState([]);
    const [approveSubmitting, setApproveSubmitting] = useState(false);

    // Modal: Verifikasi Susulan (ACC Mas Febri setelah stok SEDANG_DIAJUKAN masuk)
    const [showFollowupModal, setShowFollowupModal] = useState(false);
    const [followupTargetReq, setFollowupTargetReq] = useState(null);
    const [followupItems, setFollowupItems] = useState([]);
    const [followupSubmitting, setFollowupSubmitting] = useState(false);

    // Modal: Tutup / Batalkan Pengadaan Item
    const [closeItemTarget, setCloseItemTarget] = useState(null);
    const [closeItemAlasan, setCloseItemAlasan] = useState('');
    const [closeItemSubmitting, setCloseItemSubmitting] = useState(false);

    // Modal: Tolak Permintaan (Kasi)
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectTargetReq, setRejectTargetReq] = useState(null);
    const [rejectAlasan, setRejectAlasan] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);

    // Modal: Batalkan Permintaan / Amprahan (yang belum selesai diserahkan)
    const [showCancelReqModal, setShowCancelReqModal] = useState(false);
    const [cancelTargetReq, setCancelTargetReq] = useState(null);
    const [cancelReqAlasan, setCancelReqAlasan] = useState('');
    const [cancelReqSubmitting, setCancelReqSubmitting] = useState(false);

    // Modal: Batalkan Bon Pengeluaran (DRAFT)
    const [showCancelOutModal, setShowCancelOutModal] = useState(false);
    const [cancelTargetOut, setCancelTargetOut] = useState(null);
    const [cancelOutAlasan, setCancelOutAlasan] = useState('');
    const [cancelOutSubmitting, setCancelOutSubmitting] = useState(false);

    // Confirmation Modal State (Approve Permintaan / Approve Pengeluaran)
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);

    // Form states
    const [formRuangId, setFormRuangId] = useState('');
    const [formTanggal, setFormTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [formCatatan, setFormCatatan] = useState('');
    const [formItems, setFormItems] = useState([]);
    const [pendingDuplicateConfirm, setPendingDuplicateConfirm] = useState(null);

    const { ruangNama: liveDupRuangNama, duplicates: liveCreateDuplicates } = useConcurrentPermintaanCheck({
        isOpen: showCreateReqModal,
        ruangId: formRuangId,
        formItems,
    });

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
        if (initialPermintaanId) {
            api.get(`/gudang/permintaan/${initialPermintaanId}/`)
                .then((res) => {
                    const req = res.data;
                    if (!req) return;
                    if (req.can_followup_approve) {
                        handleOpenFollowupModal(req);
                    } else {
                        setSelectedReq(req);
                        setShowDetailReqModal(true);
                    }
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete('permintaan');
                    setSearchParams(nextParams, { replace: true });
                })
                .catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPermintaanId]);

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

    // Open Penyerahan Barang Modal (Done) — hanya item berstatus DISETUJUI dengan sisa > 0
    const handleOpenSerahkanModal = (req) => {
        setSerahkanTargetReq(req);
        setSerahPenerima('');
        setSerahTanggal(new Date().toISOString().slice(0, 10));
        setSerahCatatan(`Realisasi Permintaan ${req.nomor}`);
        const items = (req.items || [])
            .filter(it => {
                const isReadyStatus = !it.status || it.status === 'DISETUJUI';
                const remaining = Number(it.qty_disetujui || 0) - Number(it.qty_dikeluarkan || 0);
                return isReadyStatus && Number(it.qty_disetujui) > 0 && remaining > 0;
            })
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

    // Open Approve Modal (Approver menentukan Keputusan: SETUJUI / AJUKAN / TOLAK & Qty Disetujui)
    const handleOpenApproveModal = (req) => {
        setApproveTargetReq(req);
        const items = (req.items || []).map(it => {
            const minta = Number(it.qty_minta || 0);
            const stok = Number(it.stok_tersedia || 0);
            const defaultDecision = stok > 0 ? 'SETUJUI' : 'AJUKAN';
            const disetujui = Number(it.qty_disetujui || 0);
            const initialQty = defaultDecision === 'SETUJUI'
                ? (disetujui > 0 ? Math.min(disetujui, stok) : Math.min(minta, stok))
                : 0;
            return {
                id: it.id,
                barang_id: it.barang,
                barang_nama: it.barang_nama,
                barang_kode: it.barang_kode,
                satuan: it.satuan || it.satuan_dasar_kode || 'PCS',
                qty_minta: minta,
                stok_tersedia: stok,
                keputusan: defaultDecision,
                qty_disetujui: initialQty,
                catatan_verif: it.alasan_tolak || '',
                keterangan: it.keterangan || '',
                concurrent_active_requests: it.concurrent_active_requests || []
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

    const handleApproveDecisionChange = (idx, keputusan) => {
        const next = [...approveItems];
        const cur = next[idx];
        cur.keputusan = keputusan;
        if (keputusan === 'SETUJUI') {
            const maxAvail = Number(cur.stok_tersedia || 0);
            if (!Number(cur.qty_disetujui) || Number(cur.qty_disetujui) <= 0) {
                cur.qty_disetujui = Math.min(Number(cur.qty_minta || 0), maxAvail);
            }
        } else if (keputusan === 'AJUKAN' || keputusan === 'TOLAK') {
            cur.qty_disetujui = 0;
        }
        setApproveItems(next);
    };

    const handleApproveAlasanChange = (idx, val) => {
        const next = [...approveItems];
        next[idx].catatan_verif = val;
        setApproveItems(next);
    };

    const handleApproveSetAllMax = () => {
        const next = approveItems.map(it => {
            const stok = Number(it.stok_tersedia || 0);
            if (stok > 0) {
                return {
                    ...it,
                    keputusan: 'SETUJUI',
                    qty_disetujui: Math.min(Number(it.qty_minta || 0), stok),
                };
            }
            return {
                ...it,
                keputusan: 'AJUKAN',
                qty_disetujui: 0,
            };
        });
        setApproveItems(next);
    };

    const handleExecuteApprove = async (e) => {
        e.preventDefault();
        for (const it of approveItems) {
            if (it.keputusan === 'SETUJUI') {
                const qtyApp = Number(it.qty_disetujui || 0);
                if (qtyApp <= 0) {
                    toast.error(`Qty disetujui untuk '${it.barang_nama}' harus > 0 jika memilih Setujui.`);
                    return;
                }
                if (qtyApp > it.stok_tersedia) {
                    toast.error(`Qty disetujui untuk '${it.barang_nama}' (${qtyApp} ${it.satuan}) melebihi stok gudang yang tersedia (${it.stok_tersedia} ${it.satuan}).`);
                    return;
                }
            } else if (it.keputusan === 'TOLAK') {
                if (!String(it.catatan_verif || '').trim()) {
                    toast.error(`Keterangan / alasan penolakan untuk '${it.barang_nama}' wajib diisi.`);
                    return;
                }
            }
        }

        setApproveSubmitting(true);
        try {
            const res = await api.post(`/gudang/permintaan/${approveTargetReq.id}/approve/`, {
                items: approveItems.map(it => ({
                    id: it.id,
                    keputusan: it.keputusan,
                    qty_disetujui: it.keputusan === 'SETUJUI' ? Number(it.qty_disetujui || 0) : 0,
                    alasan_tolak: it.keputusan === 'TOLAK' ? String(it.catatan_verif || '').trim() : '',
                    keterangan: it.keputusan !== 'TOLAK' ? String(it.catatan_verif || '').trim() : '',
                }))
            });
            const hasProcurement = approveItems.some(it => it.keputusan === 'AJUKAN');
            toast.success(
                res.data?.status === 'DITOLAK'
                    ? `Permintaan ${approveTargetReq.nomor} ditolak.`
                    : hasProcurement
                        ? `Persetujuan disimpan. Item stok siap dapat langsung diserahkan, sedangkan item stok 0 masuk antrean Pengadaan.`
                        : `Permintaan ${approveTargetReq.nomor} telah disetujui.`
            );
            setShowApproveModal(false);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menyetujui permintaan.');
        } finally {
            setApproveSubmitting(false);
        }
    };

    // Open Verifikasi Susulan Modal (Item SEDANG_DIAJUKAN setelah stok masuk)
    const handleOpenFollowupModal = (req) => {
        setFollowupTargetReq(req);
        const pendingItems = (req.items || [])
            .filter(it => it.status === 'SEDANG_DIAJUKAN')
            .map(it => {
                const stok = Number(it.stok_tersedia || 0);
                const minta = Number(it.qty_minta || 0);
                return {
                    id: it.id,
                    barang_id: it.barang,
                    barang_nama: it.barang_nama,
                    barang_kode: it.barang_kode,
                    satuan: it.satuan || it.satuan_dasar_kode || 'PCS',
                    qty_minta: minta,
                    stok_tersedia: stok,
                    keputusan: stok > 0 ? 'SETUJUI' : 'AJUKAN',
                    qty_disetujui: stok > 0 ? Math.min(minta, stok) : 0,
                    alasan_tolak: '',
                    concurrent_active_requests: it.concurrent_active_requests || [],
                };
            });
        setFollowupItems(pendingItems);
        setShowDetailReqModal(false);
        setShowFollowupModal(true);
    };

    const handleFollowupDecisionChange = (idx, keputusan) => {
        const next = [...followupItems];
        const cur = next[idx];
        cur.keputusan = keputusan;
        if (keputusan === 'SETUJUI') {
            const maxAvail = Number(cur.stok_tersedia || 0);
            if (!Number(cur.qty_disetujui) || Number(cur.qty_disetujui) <= 0) {
                cur.qty_disetujui = Math.min(Number(cur.qty_minta || 0), maxAvail);
            }
            cur.alasan_tolak = '';
        } else {
            cur.qty_disetujui = 0;
        }
        setFollowupItems(next);
    };

    const handleExecuteFollowup = async (e) => {
        e.preventDefault();
        const actionable = followupItems.filter(it => it.keputusan !== 'AJUKAN');
        if (!actionable.length) {
            toast.error('Pilih minimal satu item untuk Disetujui, Ditolak, atau Ditutup Pengadaannya.');
            return;
        }
        for (const it of actionable) {
            if (it.keputusan === 'SETUJUI') {
                const q = Number(it.qty_disetujui || 0);
                if (q <= 0 || q > it.stok_tersedia) {
                    toast.error(`Qty disetujui susulan '${it.barang_nama}' harus > 0 dan <= stok (${it.stok_tersedia}).`);
                    return;
                }
            } else if (it.keputusan === 'TOLAK' && !String(it.alasan_tolak || '').trim()) {
                toast.error(`Alasan penolakan untuk '${it.barang_nama}' wajib diisi.`);
                return;
            }
        }

        setFollowupSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${followupTargetReq.id}/approve-followup/`, {
                items: followupItems.map(it => ({
                    id: it.id,
                    keputusan: it.keputusan,
                    qty_disetujui: it.keputusan === 'SETUJUI' ? Number(it.qty_disetujui || 0) : 0,
                    alasan_tolak: (it.keputusan === 'TOLAK' || it.keputusan === 'BATAL_PENGADAAN') ? String(it.alasan_tolak || '').trim() : '',
                }))
            });
            toast.success(`Verifikasi susulan untuk ${followupTargetReq.nomor} berhasil disimpan.`);
            setShowFollowupModal(false);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menyimpan verifikasi susulan.');
        } finally {
            setFollowupSubmitting(false);
        }
    };

    // Tutup / Batalkan Pengadaan Item Tunggal
    const handleOpenCloseItemModal = (req, item) => {
        setCloseItemTarget({ req, item });
        setCloseItemAlasan('');
    };

    const handleExecuteCloseItem = async (e) => {
        e.preventDefault();
        if (!closeItemTarget) return;
        setCloseItemSubmitting(true);
        try {
            const res = await api.post(`/gudang/permintaan/${closeItemTarget.req.id}/close-item/`, {
                item_id: closeItemTarget.item.id,
                alasan: closeItemAlasan.trim() || 'Pengadaan item ditutup / tidak dilanjutkan',
            });
            toast.success(`Item pengadaan '${closeItemTarget.item.barang_nama}' telah ditutup.`);
            if (selectedReq && selectedReq.id === closeItemTarget.req.id && res.data) {
                setSelectedReq(res.data);
            }
            setCloseItemTarget(null);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menutup item pengadaan.');
        } finally {
            setCloseItemSubmitting(false);
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

    // Batalkan Permintaan (untuk yang belum selesai diserahkan)
    const handleOpenCancelReqModal = (req) => {
        setCancelTargetReq(req);
        setCancelReqAlasan('');
        setShowDetailReqModal(false);
        setShowCancelReqModal(true);
    };

    const handleExecuteCancelReq = async (e) => {
        e.preventDefault();
        if (!cancelReqAlasan.trim()) {
            toast.error('Alasan pembatalan wajib diisi.');
            return;
        }
        setCancelReqSubmitting(true);
        try {
            await api.post(`/gudang/permintaan/${cancelTargetReq.id}/batal/`, {
                alasan: cancelReqAlasan.trim()
            });
            toast.success(`Permintaan ${cancelTargetReq.nomor} berhasil dibatalkan.`);
            setShowCancelReqModal(false);
            setCancelTargetReq(null);
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal membatalkan permintaan.');
        } finally {
            setCancelReqSubmitting(false);
        }
    };

    // Batalkan Bon Pengeluaran (DRAFT)
    const handleOpenCancelOutModal = (out) => {
        setCancelTargetOut(out);
        setCancelOutAlasan('');
        setShowDetailOutModal(false);
        setShowCancelOutModal(true);
    };

    const handleExecuteCancelOut = async (e) => {
        e.preventDefault();
        if (!cancelOutAlasan.trim()) {
            toast.error('Alasan pembatalan bon pengeluaran wajib diisi.');
            return;
        }
        setCancelOutSubmitting(true);
        try {
            await api.post(`/gudang/pengeluaran/${cancelTargetOut.id}/batal/`, {
                alasan: cancelOutAlasan.trim()
            });
            toast.success(`Bon pengeluaran ${cancelTargetOut.nomor} berhasil dibatalkan.`);
            setShowCancelOutModal(false);
            setCancelTargetOut(null);
            fetchPengeluaran();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal membatalkan bon pengeluaran.');
        } finally {
            setCancelOutSubmitting(false);
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

    const executeCreateReqPayload = async (payload) => {
        setSaving(true);
        try {
            await api.post('/gudang/permintaan/', payload);
            setPendingDuplicateConfirm(null);
            setShowCreateReqModal(false);
            toast.success('Permintaan unit berhasil dibuat & diajukan.');
            fetchPermintaan();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSaving(false);
        }
    };

    // Submit Permintaan
    const handleSubmitCreateReq = async (e) => {
        e.preventDefault();
        const validItems = formItems.filter(it => it.barang_id && Number(it.qty) > 0);
        if (!validItems.length) {
            toast.error('Pilih minimal satu barang dengan kuantitas > 0.');
            return;
        }

        const payload = {
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
        };

        setSaving(true);
        try {
            const dupRes = await checkPermintaanDuplicatesApi({
                ruangId: formRuangId,
                barangIds: validItems.map(it => it.barang_id),
            });
            if (dupRes?.has_duplicates && dupRes.duplicates?.length > 0) {
                const ruangFallback = ruangList.find(r => String(r.id) === String(formRuangId))?.nama || '';
                setSaving(false);
                setPendingDuplicateConfirm({
                    ruangNama: dupRes.ruang_nama || ruangFallback,
                    duplicates: dupRes.duplicates,
                    payload,
                });
                return;
            }
        } catch {
            // Jika check-duplicates gagal sementara, lanjutkan submit standar
        }

        await executeCreateReqPayload(payload);
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

    const heroActions = subTab === 'permintaan' ? (
        <>
            <button type="button" className="gdg-btn-stripe secondary" onClick={handleSyncSiaga} disabled={syncing}>
                <DownloadCloud size={14} />
                <span>{syncing ? 'Menarik data...' : 'Sinkron dari Siaga RS'}</span>
            </button>
            <button type="button" className="gdg-btn-stripe secondary" onClick={fetchPermintaan} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
            </button>
            <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreateReq}>
                <Plus size={14} />
                <span>Buat Permintaan Unit</span>
            </button>
        </>
    ) : (
        <button type="button" className="gdg-btn-stripe secondary" onClick={fetchPengeluaran} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
        </button>
    );

    return (
        <div className="gdg-dash-root">
            {heroActionsTarget
                ? createPortal(heroActions, heroActionsTarget)
                : <div className="gdg-brg-fallback-actions">{heroActions}</div>}

            {/* SUB-TAB TOGGLE */}
            <div>
                <div className="gdg-segmented-tabs">
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'permintaan' ? 'active' : ''}`}
                        onClick={() => { setSubTab('permintaan'); setPage(1); setStatusFilter(''); }}
                    >
                        <span className="tab-icon"><Send size={15} /></span>
                        <span>Permintaan Ruangan (Amprahan)</span>
                    </button>
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'pengeluaran' ? 'active' : ''}`}
                        onClick={() => { setSubTab('pengeluaran'); setPage(1); setStatusFilter(''); }}
                    >
                        <span className="tab-icon"><FileText size={15} /></span>
                        <span>Bon Pengeluaran / Serah Terima Fisik</span>
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: PERMINTAAN */}
            {subTab === 'permintaan' && (
                <section className="gdg-dash-section">
                    {/* TOOLBAR */}
                    <div className="gdg-brg-toolbar">
                        <div className="gdg-brg-toolbar-left">
                            <div className="gdg-dash-search">
                                <Search size={14} className="gdg-dash-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Cari nomor permintaan, nama ruangan..."
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="gdg-ks-select-wrap">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    className="gdg-ks-select gdg-brg-select"
                                >
                                    <option value="">Semua Status Permintaan</option>
                                    <option value="MENUNGGU">Menunggu Persetujuan</option>
                                    <option value="DISETUJUI">Disetujui (Siap Serah Fisik)</option>
                                    <option value="PROSES_SEBAGIAN">Menunggu Pengadaan / Sebagian</option>
                                    <option value="SELESAI">Selesai (Sudah Diserahkan)</option>
                                    <option value="DITOLAK">Ditolak</option>
                                    <option value="BATAL">Dibatalkan</option>
                                </select>
                                <ChevronDown size={14} className="gdg-ks-select-chevron" />
                            </div>
                            {(searchQuery || statusFilter) && (
                                <button
                                    type="button"
                                    className="gdg-btn-stripe secondary"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setStatusFilter('');
                                        setPage(1);
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                        <div className="gdg-brg-total-hint">
                            Menampilkan {permintaanList.length} dari {totalCount} permohonan
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="gdg-table-wrap gdg-table-borderless">
                        <table className="gdg-table gdg-table-stripe">
                            <thead>
                                <tr>
                                    <th>No. Permintaan</th>
                                    <th>Tgl Minta</th>
                                    <th>Tgl Penyerahan</th>
                                    <th>Unit / Ruangan</th>
                                    <th>Jumlah Item</th>
                                    <th>Status</th>
                                    <th>Pemohon</th>
                                    <th>Penerima</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="9" className="gdg-table-empty">
                                            Memuat permohonan...
                                        </td>
                                    </tr>
                                ) : permintaanList.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" className="gdg-table-empty gdg-po-empty-cell">
                                            <div className="gdg-po-empty-box">
                                                <Send size={28} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                                <div className="gdg-po-empty-title">Tidak ada data permohonan</div>
                                                <p className="gdg-po-empty-desc">
                                                    Belum ada permohonan amprahan unit ruangan yang sesuai dengan filter saat ini.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    permintaanList.map(req => {
                                        const statusTone =
                                            req.status === 'SELESAI' ? 'emerald' :
                                            req.status === 'DISETUJUI' ? 'indigo' :
                                            req.status === 'PROSES_SEBAGIAN' ? 'cyan' :
                                            req.status === 'MENUNGGU' ? 'amber' :
                                            req.status === 'DITOLAK' || req.status === 'BATAL' ? 'rose' : 'slate';
                                        const statusLabel =
                                            req.status === 'MENUNGGU' ? 'Menunggu Persetujuan' :
                                            req.status === 'DISETUJUI' ? 'Disetujui (Siap Serah)' :
                                            req.status === 'PROSES_SEBAGIAN' ? 'Dalam Proses / Pengadaan' :
                                            req.status === 'SELESAI' ? 'Selesai (Diserahkan)' :
                                            req.status === 'DITOLAK' ? 'Ditolak' :
                                            req.status === 'BATAL' ? 'Dibatalkan' : req.status;

                                        return (
                                            <tr key={req.id}>
                                                <td className="gdg-code-cell">{req.nomor}</td>
                                                <td className="gdg-num-cell">{req.tanggal}</td>
                                                <td className="gdg-num-cell">
                                                    {req.tanggal_penyerahan ? (
                                                        <span style={{ color: '#10b981', fontWeight: 500 }}>{req.tanggal_penyerahan}</span>
                                                    ) : (
                                                        <span className="gdg-po-meta-cell">-</span>
                                                    )}
                                                </td>
                                                <td className="gdg-po-vendor-name">{req.ruang_nama}</td>
                                                <td className="gdg-num-cell">{(req.items || []).length} item</td>
                                                <td>
                                                    <span className={`gdg-status-text ${statusTone}`}>
                                                        <span className="gdg-status-dot" />
                                                        <span>{statusLabel}</span>
                                                    </span>
                                                    <ConcurrentTableBadge
                                                        count={req.concurrent_duplicate_count}
                                                        duplicateItems={req.concurrent_duplicate_items}
                                                    />
                                                    {req.item_status_counts?.ready_followup > 0 && (
                                                        <span style={{ display: 'block', fontSize: '11px', color: '#10b981', marginTop: '2px', fontWeight: 600 }}>
                                                            {req.item_status_counts.ready_followup} item stok masuk (siap ACC)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="gdg-po-meta-cell">{req.created_by_nama || 'Unit Ruangan'}</td>
                                                <td className="gdg-po-meta-cell">
                                                    {req.penerima_nama ? (
                                                        <span className="gdg-po-vendor-name" style={{ fontWeight: 500 }}>{req.penerima_nama}</span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div className="gdg-brg-row-actions">
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn"
                                                            title="Lihat Detail Permintaan"
                                                            onClick={() => { setSelectedReq(req); setShowDetailReqModal(true); }}
                                                        >
                                                            <Eye size={14} />
                                                        </button>

                                                        {req.status === 'MENUNGGU' && req.can_approve && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="gdg-brg-icon-btn success"
                                                                    title="Verifikasi & Tentukan Keputusan per Item"
                                                                    onClick={() => handleOpenApproveModal(req)}
                                                                >
                                                                    <Check size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="gdg-brg-icon-btn danger"
                                                                    title="Tolak Permintaan"
                                                                    onClick={() => handleOpenRejectModal(req)}
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </>
                                                        )}

                                                        {req.can_followup_approve && (
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn indigo"
                                                                title="Verifikasi Susulan Item Pengadaan (Mas Febri)"
                                                                onClick={() => handleOpenFollowupModal(req)}
                                                            >
                                                                <Clock size={14} />
                                                            </button>
                                                        )}

                                                        {req.can_issue && (
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn success"
                                                                title="Serahkan Fisik Barang"
                                                                onClick={() => handleOpenSerahkanModal(req)}
                                                            >
                                                                <PackageCheck size={14} />
                                                            </button>
                                                        )}

                                                        {(req.status === 'SELESAI' || (req.pengeluaran_list && req.pengeluaran_list.length > 0)) && (
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn"
                                                                title="Cetak Bukti Serah Terima Fisik (PDF)"
                                                                onClick={() => handlePrintFromReq(req)}
                                                            >
                                                                <Printer size={14} />
                                                            </button>
                                                        )}

                                                        {req.can_cancel && (
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn danger"
                                                                title="Batalkan Permintaan (Belum Selesai Diserahkan)"
                                                                onClick={() => handleOpenCancelReqModal(req)}
                                                            >
                                                                <Ban size={14} />
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

                    <SimplePagination
                        className="gdg-dash-pagination"
                        page={page}
                        totalPages={Math.ceil(totalCount / 10)}
                        onPageChange={setPage}
                        total={totalCount}
                        totalCount={totalCount}
                        pageSize={10}
                    />
                </section>
            )}

            {/* TAB CONTENT: PENGELUARAN */}
            {subTab === 'pengeluaran' && (
                <section className="gdg-dash-section">
                    {/* TOOLBAR */}
                    <div className="gdg-brg-toolbar">
                        <div className="gdg-brg-toolbar-left">
                            <div className="gdg-dash-search">
                                <Search size={14} className="gdg-dash-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Cari nomor bon keluar, penerima, ruangan..."
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="gdg-ks-select-wrap">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    className="gdg-ks-select gdg-brg-select"
                                >
                                    <option value="">Semua Status Bon</option>
                                    <option value="DRAFT">Draft (Belum Diserahkan)</option>
                                    <option value="DISETUJUI">Disetujui (Stok Terpotong)</option>
                                    <option value="BATAL">Dibatalkan</option>
                                </select>
                                <ChevronDown size={14} className="gdg-ks-select-chevron" />
                            </div>
                            {(searchQuery || statusFilter) && (
                                <button
                                    type="button"
                                    className="gdg-btn-stripe secondary"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setStatusFilter('');
                                        setPage(1);
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                        <div className="gdg-brg-total-hint">
                            Menampilkan {pengeluaranList.length} dari {totalCount} bon pengeluaran
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="gdg-table-wrap gdg-table-borderless">
                        <table className="gdg-table gdg-table-stripe">
                            <thead>
                                <tr>
                                    <th>No. Bon Out</th>
                                    <th>Tgl Penyerahan</th>
                                    <th>Unit / Ruangan</th>
                                    <th>Penerima Fisik</th>
                                    <th>Ref Permintaan</th>
                                    <th style={{ textAlign: 'right' }}>Nilai HPP</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="8" className="gdg-table-empty">
                                            Memuat bon pengeluaran...
                                        </td>
                                    </tr>
                                ) : pengeluaranList.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="gdg-table-empty gdg-po-empty-cell">
                                            <div className="gdg-po-empty-box">
                                                <FileText size={28} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                                <div className="gdg-po-empty-title">Tidak ada data bon pengeluaran</div>
                                                <p className="gdg-po-empty-desc">
                                                    Bon pengeluaran otomatis terbentuk saat barang fisik diserahkan ke unit ruangan.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    pengeluaranList.map(out => (
                                        <tr key={out.id}>
                                            <td className="gdg-code-cell">{out.nomor}</td>
                                            <td className="gdg-num-cell">{out.tanggal}</td>
                                            <td className="gdg-po-vendor-name">{out.ruang_nama}</td>
                                            <td className="gdg-po-meta-cell">{out.penerima_nama || '-'}</td>
                                            <td className="gdg-code-cell" style={{ color: out.permintaan_nomor ? '#635bff' : 'var(--gdg-muted)' }}>
                                                {out.permintaan_nomor || 'Langsung'}
                                            </td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {formatRp(out.total_nilai)}
                                            </td>
                                            <td>
                                                <span className={`gdg-status-text ${out.status === 'DISETUJUI' ? 'emerald' : out.status === 'BATAL' ? 'rose' : 'slate'}`}>
                                                    <span className="gdg-status-dot" />
                                                    <span>{out.status === 'BATAL' ? 'Dibatalkan' : out.status}</span>
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="gdg-brg-row-actions">
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        title="Lihat Detail Bon Keluar"
                                                        onClick={() => { setSelectedOut(out); setShowDetailOutModal(true); }}
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        title="Cetak Bon Pengeluaran (PDF)"
                                                        onClick={() => handlePrintBon(out)}
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    {out.can_approve && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn success"
                                                            title="Setujui & Potong Stok Gudang"
                                                            onClick={() => handleApproveOut(out)}
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                    )}
                                                    {out.can_cancel && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn danger"
                                                            title="Batalkan Bon Pengeluaran"
                                                            onClick={() => handleOpenCancelOutModal(out)}
                                                        >
                                                            <Ban size={14} />
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

                    <SimplePagination
                        className="gdg-dash-pagination"
                        page={page}
                        totalPages={Math.ceil(totalCount / 10)}
                        onPageChange={setPage}
                        total={totalCount}
                        totalCount={totalCount}
                        pageSize={10}
                    />
                </section>
            )}

            {/* MODAL: BUAT PERMINTAAN */}
            {showCreateReqModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateReqModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Buat Permintaan Barang (Amprahan)</h3>
                                <p>Ajukan permohonan kebutuhan operasional unit ruangan ke gudang logistik</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowCreateReqModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitCreateReq}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Unit / Ruangan Pemohon</label>
                                        </div>
                                        <select value={formRuangId} onChange={(e) => setFormRuangId(e.target.value)} required>
                                            {ruangList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                                        </select>
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Tanggal Permintaan *</label>
                                        </div>
                                        <DateField
                                            value={formTanggal}
                                            onChange={(val) => setFormTanggal(val)}
                                            placeholder="Pilih tanggal..."
                                            className="gdg-date-field gdg-po-date-field"
                                        />
                                    </div>
                                </div>
                                <div className="gdg-form-group">
                                    <label>Catatan / Keterangan</label>
                                    <input type="text" placeholder="Misal: Kebutuhan operasional mingguan" value={formCatatan} onChange={(e) => setFormCatatan(e.target.value)} />
                                </div>

                                <div className="gdg-detail-divider">
                                    <div className="gdg-po-items-head">
                                        <span className="gdg-detail-section-title">Daftar Barang yang Diminta</span>
                                        <button type="button" className="gdg-btn-stripe secondary" onClick={handleAddItemRow}>
                                            <Plus size={14} />
                                            <span>Tambah Baris</span>
                                        </button>
                                    </div>
                                    <div className="gdg-po-items-list">
                                        {formItems.map((item, idx) => (
                                            <div key={idx} className="gdg-out-item-grid gdg-item-row">
                                                <select value={item.barang_id} onChange={(e) => handleItemChange(idx, 'barang_id', e.target.value)} className="gdg-inline-input" required>
                                                    <option value="">-- Pilih Barang --</option>
                                                    {barangList.map(b => <option key={b.id} value={b.id}>[{b.kode}] {b.nama}</option>)}
                                                </select>
                                                <input type="number" min="0.1" step="any" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} className="gdg-inline-input gdg-num-cell" required placeholder="Qty" />
                                                <input type="text" value={item.satuan} readOnly placeholder="Satuan" className="gdg-inline-input gdg-po-readonly-input" style={{ textAlign: 'center' }} />
                                                <input type="text" placeholder="Ket..." value={item.keterangan} onChange={(e) => handleItemChange(idx, 'keterangan', e.target.value)} className="gdg-inline-input" />
                                                <button type="button" className="gdg-brg-icon-btn danger" onClick={() => handleRemoveItemRow(idx)} disabled={formItems.length === 1} title="Hapus baris">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {liveCreateDuplicates.length > 0 && (
                                        <div style={{ marginTop: '10px' }}>
                                            <ConcurrentCreateWarningBanner
                                                duplicates={liveCreateDuplicates}
                                                ruangNama={liveDupRuangNama || ruangList.find(r => String(r.id) === String(formRuangId))?.nama || ''}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCreateReqModal(false)}>Batal</button>
                                <button type="submit" className="gdg-btn-stripe primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Ajukan Permintaan'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: PENYERAHAN BARANG FISIK (DONE OLEH LOGISTIK) */}
            {showSerahkanModal && serahkanTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !serahSubmitting && setShowSerahkanModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Serah Terima Fisik Barang (Done)</h3>
                                <p>
                                    Permintaan: <span className="gdg-code-cell">{serahkanTargetReq.nomor}</span> · {serahkanTargetReq.ruang_nama}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !serahSubmitting && setShowSerahkanModal(false)}
                                disabled={serahSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteSerahkan}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Unit / Ruangan Penerima</label>
                                        </div>
                                        <input
                                            type="text"
                                            value={serahkanTargetReq.ruang_nama}
                                            readOnly
                                            className="gdg-po-readonly-input"
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Tanggal Penyerahan Fisik *</label>
                                        </div>
                                        <DateField
                                            value={serahTanggal}
                                            onChange={(val) => setSerahTanggal(val)}
                                            placeholder="Pilih tanggal penyerahan..."
                                            className="gdg-date-field gdg-po-date-field"
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Nama Petugas Penerima Fisik (Ruangan) *</label>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Contoh: Ns. Siti Rahma (Perawat IGD)"
                                            value={serahPenerima}
                                            onChange={(e) => setSerahPenerima(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                        <small className="gdg-grn-hint">
                                            Nama perawat/staf unit ruangan yang mengambil fisik barang di loket gudang.
                                        </small>
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Catatan Penyerahan (Opsional)</label>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Misal: Penyerahan rutin amprahan mingguan"
                                            value={serahCatatan}
                                            onChange={(e) => setSerahCatatan(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-detail-divider">
                                    <div className="gdg-po-items-head">
                                        <span className="gdg-detail-section-title">Rincian Fisik Barang yang Diserahkan</span>
                                        <span className="gdg-po-section-meta">Kuantitas terisi otomatis sesuai persetujuan</span>
                                    </div>
                                    <div className="gdg-table-wrap gdg-table-borderless">
                                        <table className="gdg-table gdg-table-stripe">
                                            <thead>
                                                <tr>
                                                    <th>Kode</th>
                                                    <th>Nama Barang</th>
                                                    <th style={{ textAlign: 'right' }}>Disetujui</th>
                                                    <th style={{ textAlign: 'right', width: '130px' }}>Qty Diserahkan *</th>
                                                    <th>Satuan</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {serahItems.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td className="gdg-code-cell">{item.barang_kode}</td>
                                                        <td className="gdg-po-vendor-name">{item.barang_nama}</td>
                                                        <td className="gdg-num-cell gdg-po-meta-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                            {Number(item.qty_disetujui).toLocaleString('id-ID')}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <input
                                                                type="number"
                                                                min="0.001"
                                                                step="any"
                                                                value={item.qty_serah}
                                                                onChange={(e) => handleSerahItemQtyChange(idx, e.target.value)}
                                                                required
                                                                className="gdg-inline-input gdg-num-cell"
                                                                style={{ width: '100%', textAlign: 'right', fontWeight: 600, height: '34px' }}
                                                            />
                                                        </td>
                                                        <td className="gdg-po-meta-cell">{item.satuan}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="gdg-out-banner success">
                                    <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                                    <span>
                                        Mengonfirmasi penyerahan ini akan otomatis menerbitkan <strong>Bon Pengeluaran</strong>, memotong <strong>kartu stok gudang</strong>, dan mengubah status permohonan menjadi <strong>SELESAI</strong>.
                                    </span>
                                </div>
                            </div>

                            <div className="gdg-modal-foot gdg-po-modal-foot-split">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowSerahkanModal(false)} disabled={serahSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe success" disabled={serahSubmitting}>
                                    <CheckCircle2 size={14} />
                                    <span>{serahSubmitting ? 'Memproses Penyerahan...' : 'Konfirmasi Penyerahan & Selesai (Done)'}</span>
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
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Tolak Permintaan Barang</h3>
                                <p>{rejectTargetReq.nomor} · {rejectTargetReq.ruang_nama}</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !rejectSubmitting && setShowRejectModal(false)}
                                disabled={rejectSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteReject}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-group" style={{ margin: 0 }}>
                                    <label>Alasan Penolakan Permintaan *</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Tuliskan alasan penolakan permohonan amprahan ini..."
                                        value={rejectAlasan}
                                        onChange={(e) => setRejectAlasan(e.target.value)}
                                        required
                                        autoFocus
                                        className="gdg-po-textarea"
                                    />
                                    <small className="gdg-grn-hint">
                                        Alasan ini akan dapat dibaca oleh staf unit ruangan yang bersangkutan.
                                    </small>
                                </div>
                            </div>

                                <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowRejectModal(false)} disabled={rejectSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe danger" disabled={rejectSubmitting}>
                                    <X size={14} />
                                    <span>{rejectSubmitting ? 'Memproses...' : 'Tolak Permintaan'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: BATALKAN PERMINTAAN */}
            {showCancelReqModal && cancelTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !cancelReqSubmitting && setShowCancelReqModal(false)}>
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Batalkan Permintaan Barang</h3>
                                <p>{cancelTargetReq.nomor} · {cancelTargetReq.ruang_nama}</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !cancelReqSubmitting && setShowCancelReqModal(false)}
                                disabled={cancelReqSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteCancelReq}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-group" style={{ margin: 0 }}>
                                    <label>Alasan Pembatalan *</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Tuliskan alasan pembatalan permintaan ini..."
                                        value={cancelReqAlasan}
                                        onChange={(e) => setCancelReqAlasan(e.target.value)}
                                        required
                                        autoFocus
                                        className="gdg-po-textarea"
                                    />
                                    <small className="gdg-grn-hint">
                                        Permintaan yang dibatalkan tidak lagi diproses penyerahan fisiknya oleh gudang.
                                    </small>
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCancelReqModal(false)} disabled={cancelReqSubmitting}>
                                    Kembali
                                </button>
                                <button type="submit" className="gdg-btn-stripe danger" disabled={cancelReqSubmitting}>
                                    <Ban size={14} />
                                    <span>{cancelReqSubmitting ? 'Membatalkan...' : 'Batalkan Permintaan'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: BATALKAN BON PENGELUARAN (DRAFT) */}
            {showCancelOutModal && cancelTargetOut && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !cancelOutSubmitting && setShowCancelOutModal(false)}>
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Batalkan Bon Pengeluaran</h3>
                                <p>{cancelTargetOut.nomor} · {cancelTargetOut.ruang_nama}</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !cancelOutSubmitting && setShowCancelOutModal(false)}
                                disabled={cancelOutSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteCancelOut}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-form-group" style={{ margin: 0 }}>
                                    <label>Alasan Pembatalan Bon *</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Tuliskan alasan pembatalan bon pengeluaran draft ini..."
                                        value={cancelOutAlasan}
                                        onChange={(e) => setCancelOutAlasan(e.target.value)}
                                        required
                                        autoFocus
                                        className="gdg-po-textarea"
                                    />
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCancelOutModal(false)} disabled={cancelOutSubmitting}>
                                    Kembali
                                </button>
                                <button type="submit" className="gdg-btn-stripe danger" disabled={cancelOutSubmitting}>
                                    <Ban size={14} />
                                    <span>{cancelOutSubmitting ? 'Membatalkan...' : 'Batalkan Bon'}</span>
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
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Detail Permintaan: {selectedReq.nomor}</h3>
                                <p>
                                    Ruangan: <span className="gdg-po-detail-strong">{selectedReq.ruang_nama}</span> · Tanggal: {selectedReq.tanggal}
                                    {selectedReq.tanggal_penyerahan && ` · Diserahkan: ${selectedReq.tanggal_penyerahan}`}
                                    {selectedReq.penerima_nama && ` (Penerima: ${selectedReq.penerima_nama})`}
                                    {selectedReq.approved_by_nama && ` · Diverifikasi: ${selectedReq.approved_by_nama}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowDetailReqModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(selectedReq.status === 'DITOLAK' || selectedReq.status === 'BATAL') && selectedReq.alasan_tolak && (
                                <div className="gdg-out-banner danger">
                                    <XCircle size={15} style={{ flexShrink: 0 }} />
                                    <span>
                                        <strong>{selectedReq.status === 'BATAL' ? 'Alasan Pembatalan:' : 'Alasan Penolakan:'}</strong>{' '}
                                        {selectedReq.alasan_tolak}
                                    </span>
                                </div>
                            )}

                            {selectedReq.concurrent_duplicate_count > 0 && (
                                <ConcurrentApproverBanner
                                    duplicateItems={selectedReq.concurrent_duplicate_items}
                                    ruangNama={selectedReq.ruang_nama}
                                />
                            )}

                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>Kode</th>
                                            <th>Nama Barang</th>
                                            <th style={{ textAlign: 'right' }}>Diminta</th>
                                            <th style={{ textAlign: 'right' }}>Disetujui</th>
                                            <th style={{ textAlign: 'right' }}>Diserahkan</th>
                                            <th style={{ textAlign: 'right' }}>Stok Gudang</th>
                                            <th>Status Item</th>
                                            {hasLogistikAccess && <th style={{ textAlign: 'right' }}>Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedReq.items || []).map((it, idx) => {
                                            const itemStatus = it.status || 'MENUNGGU';
                                            const badgeTone =
                                                itemStatus === 'SELESAI' ? 'emerald' :
                                                itemStatus === 'DISETUJUI' ? 'indigo' :
                                                itemStatus === 'SEDANG_DIAJUKAN' ? 'cyan' :
                                                itemStatus === 'DITOLAK' || itemStatus === 'BATAL_PENGADAAN' ? 'rose' : 'amber';
                                            const badgeText =
                                                it.status_label || (
                                                    itemStatus === 'SEDANG_DIAJUKAN' ? 'Sedang Diajukan' :
                                                    itemStatus === 'DISETUJUI' ? 'Siap Diambil' :
                                                    itemStatus === 'SELESAI' ? 'Sudah Diserahkan' :
                                                    itemStatus === 'DITOLAK' ? 'Ditolak' :
                                                    itemStatus === 'BATAL_PENGADAAN' ? 'Pengadaan Ditutup' : 'Menunggu ACC'
                                                );

                                            return (
                                                <tr key={idx}>
                                                    <td className="gdg-code-cell">{it.barang_kode}</td>
                                                    <td>
                                                        <div className="gdg-po-vendor-name">{it.barang_nama}</div>
                                                        {it.keterangan && (
                                                            <div style={{ fontSize: '11.5px', color: 'var(--gdg-muted)', marginTop: '2px' }}>
                                                                Ket: {it.keterangan}
                                                            </div>
                                                        )}
                                                        {it.alasan_tolak && (
                                                            <div style={{ fontSize: '11.5px', color: '#f43f5e', marginTop: '2px' }}>
                                                                Alasan: {it.alasan_tolak}
                                                            </div>
                                                        )}
                                                        <ConcurrentItemInlineList entries={it.concurrent_active_requests} />
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                        {Number(it.qty_minta).toLocaleString('id-ID')} {it.satuan}
                                                    </td>
                                                    <td
                                                        className="gdg-num-cell"
                                                        style={{
                                                            textAlign: 'right',
                                                            color: Number(it.qty_disetujui) > 0 ? '#10b981' : 'var(--gdg-muted)',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        {itemStatus === 'MENUNGGU'
                                                            ? '-'
                                                            : `${Number(it.qty_disetujui || 0).toLocaleString('id-ID')} ${it.satuan}`}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                        {Number(it.qty_dikeluarkan || 0).toLocaleString('id-ID')} {it.satuan}
                                                    </td>
                                                    <td
                                                        className="gdg-num-cell"
                                                        style={{
                                                            textAlign: 'right',
                                                            color: it.stok_tersedia <= 0 ? '#f43f5e' : 'var(--gdg-text)',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        {Number(it.stok_tersedia || 0).toLocaleString('id-ID')}
                                                    </td>
                                                    <td>
                                                        <span className={`gdg-status-text ${badgeTone}`}>
                                                            <span className="gdg-status-dot" />
                                                            <span>{badgeText}</span>
                                                        </span>
                                                    </td>
                                                    {hasLogistikAccess && (
                                                        <td style={{ textAlign: 'right' }}>
                                                            {itemStatus === 'SEDANG_DIAJUKAN' && (
                                                                <button
                                                                    type="button"
                                                                    className="gdg-btn-stripe secondary"
                                                                    style={{ height: '26px', padding: '0 8px', fontSize: '11px' }}
                                                                    onClick={() => handleOpenCloseItemModal(selectedReq, it)}
                                                                    title="Tutup / Batalkan antrean pengadaan item ini"
                                                                >
                                                                    Tutup Pengadaan
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {selectedReq.pengeluaran_list && selectedReq.pengeluaran_list.length > 0 && (
                                <div className="gdg-detail-divider">
                                    <span className="gdg-detail-section-title" style={{ display: 'block', marginBottom: '6px' }}>
                                        Riwayat Bon Penyerahan Fisik ({selectedReq.pengeluaran_list.length})
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {selectedReq.pengeluaran_list.map((bon) => (
                                            <div
                                                key={bon.id}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--gdg-border)',
                                                    background: 'var(--gdg-surface-elevated, var(--gdg-surface))',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                <strong className="gdg-code-cell">{bon.nomor}</strong>
                                                {' · '}{bon.tanggal}
                                                {bon.penerima_nama ? ` · Penerima: ${bon.penerima_nama}` : ''}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowDetailReqModal(false)}>Tutup</button>
                            <div className="gdg-po-foot-group">
                                {selectedReq.status === 'MENUNGGU' && selectedReq.can_approve && (
                                    <>
                                        <button type="button" className="gdg-btn-stripe danger" onClick={() => handleOpenRejectModal(selectedReq)}>
                                            <X size={14} />
                                            <span>Tolak Permintaan</span>
                                        </button>
                                        <button type="button" className="gdg-btn-stripe success" onClick={() => handleOpenApproveModal(selectedReq)}>
                                            <Check size={14} />
                                            <span>Verifikasi &amp; Setujui</span>
                                        </button>
                                    </>
                                )}
                                {selectedReq.can_followup_approve && (
                                    <button type="button" className="gdg-btn-stripe primary" onClick={() => handleOpenFollowupModal(selectedReq)}>
                                        <Clock size={14} />
                                        <span>Verifikasi Susulan (ACC Stok Masuk)</span>
                                    </button>
                                )}
                                {selectedReq.can_issue && (
                                    <button type="button" className="gdg-btn-stripe success" onClick={() => handleOpenSerahkanModal(selectedReq)}>
                                        <PackageCheck size={14} />
                                        <span>Serahkan Barang</span>
                                    </button>
                                )}
                                {selectedReq.can_cancel && (
                                    <button type="button" className="gdg-btn-stripe danger" onClick={() => handleOpenCancelReqModal(selectedReq)}>
                                        <Ban size={14} />
                                        <span>Batalkan Permintaan</span>
                                    </button>
                                )}
                                {(selectedReq.status === 'SELESAI' || (selectedReq.pengeluaran_list && selectedReq.pengeluaran_list.length > 0)) && (
                                    <button type="button" className="gdg-btn-stripe secondary" onClick={() => handlePrintFromReq(selectedReq)}>
                                        <Printer size={14} />
                                        <span>Cetak Bukti Serah Terima</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: DETAIL PENGELUARAN */}
            {showDetailOutModal && selectedOut && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailOutModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Bon Pengeluaran: {selectedOut.nomor}</h3>
                                <p>
                                    Unit: <span className="gdg-po-detail-strong">{selectedOut.ruang_nama}</span> · Penerima: {selectedOut.penerima_nama || '-'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowDetailOutModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="gdg-modal-body">
                            {selectedOut.status === 'BATAL' && selectedOut.alasan_batal && (
                                <div className="gdg-out-banner danger" style={{ marginBottom: '12px' }}>
                                    <XCircle size={15} style={{ flexShrink: 0 }} />
                                    <span><strong>Alasan Pembatalan:</strong> {selectedOut.alasan_batal}</span>
                                </div>
                            )}
                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>Kode</th>
                                            <th>Nama Barang</th>
                                            <th style={{ textAlign: 'right' }}>Qty Keluar</th>
                                            <th>Satuan</th>
                                            <th style={{ textAlign: 'right' }}>HPP Berjalan</th>
                                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedOut.items || []).map((it, idx) => (
                                            <tr key={idx}>
                                                <td className="gdg-code-cell">{it.barang_kode}</td>
                                                <td className="gdg-po-vendor-name">{it.barang_nama}</td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {Number(it.qty).toLocaleString('id-ID')}
                                                </td>
                                                <td className="gdg-po-meta-cell">{it.satuan}</td>
                                                <td className="gdg-num-cell gdg-po-meta-cell" style={{ textAlign: 'right' }}>
                                                    {formatRp(it.harga_unit)}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {formatRp(it.subtotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="gdg-po-grand-total">
                                <span className="gdg-po-grand-total-label">Total Nilai HPP Dikeluarkan</span>
                                <strong className="gdg-po-grand-total-value gdg-num-cell">{formatRp(selectedOut.total_nilai)}</strong>
                            </div>
                        </div>
                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <button type="button" className="gdg-btn-stripe secondary" onClick={() => handlePrintBon(selectedOut)}>
                                <Printer size={14} />
                                <span>Cetak Bukti Serah Terima</span>
                            </button>
                            <div className="gdg-po-foot-group">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowDetailOutModal(false)}>Tutup</button>
                                {selectedOut.can_cancel && (
                                    <button type="button" className="gdg-btn-stripe danger" onClick={() => handleOpenCancelOutModal(selectedOut)}>
                                        <Ban size={14} />
                                        <span>Batalkan Bon</span>
                                    </button>
                                )}
                                {selectedOut.can_approve && (
                                    <button type="button" className="gdg-btn-stripe primary" onClick={() => handleApproveOut(selectedOut)}>
                                        <CheckCircle2 size={14} />
                                        <span>Setujui &amp; Potong Stok Sekarang</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: VERIFIKASI & PERSETUJUAN PERMINTAAN (TENTUKAN JUMLAH YANG DISETUJUI) */}
            {showApproveModal && approveTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !approveSubmitting && setShowApproveModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '1040px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Persetujuan Permintaan Barang</h3>
                                <p>
                                    Permintaan: <span className="gdg-code-cell">{approveTargetReq.nomor}</span> · {approveTargetReq.ruang_nama}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !approveSubmitting && setShowApproveModal(false)}
                                disabled={approveSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteApprove}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="gdg-modal-meta-strip">
                                    <div className="gdg-modal-meta-cell">
                                        <span className="gdg-modal-meta-label">Unit / Ruangan Pemohon</span>
                                        <span className="gdg-modal-meta-value" title={approveTargetReq.ruang_nama}>{approveTargetReq.ruang_nama}</span>
                                    </div>
                                    <div className="gdg-modal-meta-cell">
                                        <span className="gdg-modal-meta-label">Tanggal Pengajuan</span>
                                        <span className="gdg-modal-meta-value gdg-num-cell">{approveTargetReq.tanggal}</span>
                                    </div>
                                    <div className="gdg-modal-meta-cell">
                                        <span className="gdg-modal-meta-label">Catatan dari Ruangan</span>
                                        <span className="gdg-modal-meta-value" title={approveTargetReq.catatan || '—'} style={{ fontWeight: approveTargetReq.catatan ? 500 : 400 }}>
                                            {approveTargetReq.catatan || '—'}
                                        </span>
                                    </div>
                                </div>

                                {approveTargetReq.concurrent_duplicate_count > 0 && (
                                    <ConcurrentApproverBanner
                                        duplicateItems={approveTargetReq.concurrent_duplicate_items}
                                        ruangNama={approveTargetReq.ruang_nama}
                                    />
                                )}

                                <div>
                                    <div className="gdg-po-items-head">
                                        <span className="gdg-detail-section-title">Keputusan &amp; Kuantitas per Baris Barang</span>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe secondary"
                                            onClick={handleApproveSetAllMax}
                                        >
                                            Sesuaikan Semua dengan Stok
                                        </button>
                                    </div>
                                    <div className="gdg-table-wrap gdg-table-borderless">
                                        <table className="gdg-table gdg-table-stripe">
                                            <thead>
                                                <tr>
                                                    <th>Barang</th>
                                                    <th style={{ textAlign: 'right' }}>Minta</th>
                                                    <th style={{ textAlign: 'right' }}>Stok</th>
                                                    <th style={{ width: '168px' }}>Keputusan</th>
                                                    <th style={{ textAlign: 'right', width: '140px' }}>Qty ACC</th>
                                                    <th style={{ width: '210px' }}>Keterangan</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {approveItems.map((item, idx) => {
                                                    const stokVal = Number(item.stok_tersedia || 0);
                                                    const qtyVal = Number(item.qty_disetujui || 0);
                                                    const isApprove = item.keputusan === 'SETUJUI';
                                                    const isAjukan = item.keputusan === 'AJUKAN';
                                                    const isTolak = item.keputusan === 'TOLAK';
                                                    const isOverStock = isApprove && qtyVal > stokVal;
                                                    const isBadZero = isApprove && qtyVal <= 0;
                                                    const isMissingReason = isTolak && !String(item.catatan_verif || '').trim();
                                                    return (
                                                        <tr key={idx}>
                                                            <td>
                                                                <div className="gdg-po-vendor-name">{item.barang_nama}</div>
                                                                <span className="gdg-code-cell" style={{ fontSize: '11px' }}>{item.barang_kode}</span>
                                                                <ConcurrentItemInlineList entries={item.concurrent_active_requests} />
                                                            </td>
                                                            <td className="gdg-num-cell gdg-po-meta-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {Number(item.qty_minta).toLocaleString('id-ID')} {item.satuan}
                                                            </td>
                                                            <td
                                                                className="gdg-num-cell"
                                                                style={{
                                                                    textAlign: 'right',
                                                                    color: stokVal <= 0 ? '#f43f5e' : 'var(--gdg-text)',
                                                                    fontWeight: 600
                                                                }}
                                                            >
                                                                {stokVal.toLocaleString('id-ID')} {item.satuan}
                                                            </td>
                                                            <td>
                                                                <div className="gdg-decision-group">
                                                                    {stokVal > 0 ? (
                                                                        <button
                                                                            type="button"
                                                                            className={`gdg-decision-btn setuju ${isApprove ? 'active' : ''}`}
                                                                            title="Setujui dengan qty terkontrol"
                                                                            onClick={() => handleApproveDecisionChange(idx, 'SETUJUI')}
                                                                        >
                                                                            Setujui
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            className={`gdg-decision-btn ajukan ${isAjukan ? 'active' : ''}`}
                                                                            title="Masukkan ke antrean pengadaan karena stok kosong (0)"
                                                                            onClick={() => handleApproveDecisionChange(idx, 'AJUKAN')}
                                                                        >
                                                                            Pengadaan
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        className={`gdg-decision-btn tolak ${isTolak ? 'active' : ''}`}
                                                                        title="Tolak item dengan alasan jelas"
                                                                        onClick={() => handleApproveDecisionChange(idx, 'TOLAK')}
                                                                    >
                                                                        Tolak
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="gdg-acc-qty-cell">
                                                                    <input
                                                                        type="number"
                                                                        min={isApprove ? '0.001' : '0'}
                                                                        max={isApprove ? stokVal : undefined}
                                                                        step="any"
                                                                        disabled={!isApprove}
                                                                        value={isApprove ? item.qty_disetujui : 0}
                                                                        onChange={(e) => handleApproveItemQtyChange(idx, e.target.value)}
                                                                        required={isApprove}
                                                                        className="gdg-inline-input gdg-num-cell gdg-acc-qty-input"
                                                                        style={{
                                                                            color: isApprove
                                                                                ? ((isOverStock || isBadZero) ? '#f43f5e' : '#10b981')
                                                                                : undefined,
                                                                            borderColor: (isOverStock || isBadZero) ? '#f43f5e' : undefined
                                                                        }}
                                                                    />
                                                                    <span className="gdg-acc-qty-unit">{item.satuan}</span>
                                                                </div>
                                                                {isOverStock && <small style={{ display: 'block', color: '#f43f5e', fontSize: '10.5px', marginTop: '3px' }}>Melebihi stok!</small>}
                                                                {isBadZero && !isOverStock && <small style={{ display: 'block', color: '#f43f5e', fontSize: '10.5px', marginTop: '3px' }}>Harus &gt; 0</small>}
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    placeholder={isTolak ? 'Alasan ditolak (wajib)...' : 'Keterangan (opsional)...'}
                                                                    value={item.catatan_verif}
                                                                    onChange={(e) => handleApproveAlasanChange(idx, e.target.value)}
                                                                    required={isTolak}
                                                                    className="gdg-inline-input"
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '36px',
                                                                        minHeight: '36px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '12.5px',
                                                                        borderColor: isMissingReason ? '#f43f5e' : undefined,
                                                                    }}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="gdg-callout-neutral">
                                    Pengurangan qty yang disetujui (mis. minta 10, disetujui 4) langsung selesai tanpa membuat utang sisa. Item stok kosong dapat dipilih <strong>Pengadaan</strong> agar tetap tercatat menunggu stok masuk.
                                </div>

                                {approveItems.some(it => it.keputusan === 'SETUJUI' && (Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0) || Number(it.qty_disetujui || 0) <= 0)) && (
                                    <div className="gdg-out-banner danger">
                                        <AlertCircle size={15} style={{ flexShrink: 0 }} />
                                        <span>Pastikan setiap item yang dipilih <strong>Setujui</strong> memiliki kuantitas &gt; 0 dan tidak melebihi stok gudang.</span>
                                    </div>
                                )}
                            </div>

                            <div className="gdg-modal-foot gdg-po-modal-foot-split">
                                <button
                                    type="button"
                                    className="gdg-btn-stripe danger"
                                    style={{ height: '36px', borderRadius: '6px' }}
                                    onClick={() => {
                                        const target = approveTargetReq;
                                        setShowApproveModal(false);
                                        handleOpenRejectModal(target);
                                    }}
                                    disabled={approveSubmitting}
                                >
                                    Tolak Semua
                                </button>
                                <div className="gdg-po-foot-group">
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        style={{ height: '36px', borderRadius: '6px' }}
                                        onClick={() => setShowApproveModal(false)}
                                        disabled={approveSubmitting}
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className="gdg-btn-stripe primary"
                                        style={{ height: '36px', borderRadius: '6px' }}
                                        disabled={
                                            approveSubmitting ||
                                            approveItems.some(it => it.keputusan === 'SETUJUI' && (Number(it.qty_disetujui || 0) > Number(it.stok_tersedia || 0) || Number(it.qty_disetujui || 0) <= 0)) ||
                                            approveItems.some(it => it.keputusan === 'TOLAK' && !String(it.catatan_verif || '').trim())
                                        }
                                    >
                                        {approveSubmitting ? 'Menyimpan...' : 'Simpan Keputusan Verifikasi'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: VERIFIKASI SUSULAN (MAS FEBRI ACC ITEM SEDANG_DIAJUKAN SETELAH STOK MASUK) */}
            {showFollowupModal && followupTargetReq && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !followupSubmitting && setShowFollowupModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '880px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Verifikasi Susulan Antrean Pengadaan</h3>
                                <p>
                                    Permintaan: <span className="gdg-code-cell">{followupTargetReq.nomor}</span> · {followupTargetReq.ruang_nama}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !followupSubmitting && setShowFollowupModal(false)}
                                disabled={followupSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleExecuteFollowup}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="gdg-callout-neutral">
                                    Tentukan kuantitas yang disetujui untuk item pengadaan setelah stok baru masuk gudang, atau tutup/tolak jika pengadaan tidak dilanjutkan.
                                </div>

                                {followupItems.some(fi => (fi.concurrent_active_requests || []).length > 0) && (
                                    <ConcurrentApproverBanner
                                        duplicateItems={(followupTargetReq.concurrent_duplicate_items || []).filter(d =>
                                            followupItems.some(fi => fi.id === d.item_id)
                                        )}
                                        ruangNama={followupTargetReq.ruang_nama}
                                    />
                                )}

                                <div className="gdg-table-wrap gdg-table-borderless">
                                    <table className="gdg-table gdg-table-stripe">
                                        <thead>
                                            <tr>
                                                <th>Barang</th>
                                                <th style={{ textAlign: 'right' }}>Minta</th>
                                                <th style={{ textAlign: 'right' }}>Stok Masuk Kini</th>
                                                <th style={{ width: '260px' }}>Keputusan</th>
                                                <th style={{ textAlign: 'right', width: '150px' }}>Qty ACC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {followupItems.map((it, idx) => {
                                                const stok = Number(it.stok_tersedia || 0);
                                                const isSetuju = it.keputusan === 'SETUJUI';
                                                const isTolakOrTutup = it.keputusan === 'TOLAK' || it.keputusan === 'BATAL_PENGADAAN';
                                                return (
                                                    <tr key={it.id}>
                                                        <td>
                                                            <div className="gdg-po-vendor-name">{it.barang_nama}</div>
                                                            <span className="gdg-code-cell" style={{ fontSize: '11px' }}>{it.barang_kode}</span>
                                                            <ConcurrentItemInlineList entries={it.concurrent_active_requests} />
                                                        </td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                            {Number(it.qty_minta).toLocaleString('id-ID')} {it.satuan}
                                                        </td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600, color: stok > 0 ? '#10b981' : '#f43f5e' }}>
                                                            {stok.toLocaleString('id-ID')} {it.satuan}
                                                        </td>
                                                        <td>
                                                            <div className="gdg-decision-group">
                                                                {stok > 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        className={`gdg-decision-btn setuju ${isSetuju ? 'active' : ''}`}
                                                                        onClick={() => handleFollowupDecisionChange(idx, 'SETUJUI')}
                                                                    >
                                                                        Setujui
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        className={`gdg-decision-btn ajukan ${it.keputusan === 'AJUKAN' ? 'active' : ''}`}
                                                                        onClick={() => handleFollowupDecisionChange(idx, 'AJUKAN')}
                                                                    >
                                                                        Tunggu
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    className={`gdg-decision-btn tolak ${it.keputusan === 'BATAL_PENGADAAN' ? 'active' : ''}`}
                                                                    onClick={() => handleFollowupDecisionChange(idx, 'BATAL_PENGADAAN')}
                                                                >
                                                                    Tutup
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`gdg-decision-btn tolak ${it.keputusan === 'TOLAK' ? 'active' : ''}`}
                                                                    onClick={() => handleFollowupDecisionChange(idx, 'TOLAK')}
                                                                >
                                                                    Tolak
                                                                </button>
                                                            </div>
                                                            {isTolakOrTutup && (
                                                                <input
                                                                    type="text"
                                                                    placeholder={it.keputusan === 'TOLAK' ? 'Alasan penolakan (wajib)...' : 'Catatan penutupan (opsional)...'}
                                                                    value={it.alasan_tolak}
                                                                    onChange={(e) => {
                                                                        const next = [...followupItems];
                                                                        next[idx].alasan_tolak = e.target.value;
                                                                        setFollowupItems(next);
                                                                    }}
                                                                    className="gdg-inline-input"
                                                                    style={{ height: '32px', fontSize: '12px', marginTop: '6px' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div className="gdg-acc-qty-cell">
                                                                <input
                                                                    type="number"
                                                                    min={isSetuju ? '0.001' : '0'}
                                                                    max={isSetuju ? stok : undefined}
                                                                    step="any"
                                                                    disabled={!isSetuju}
                                                                    value={isSetuju ? it.qty_disetujui : 0}
                                                                    onChange={(e) => {
                                                                        const next = [...followupItems];
                                                                        next[idx].qty_disetujui = e.target.value;
                                                                        setFollowupItems(next);
                                                                    }}
                                                                    className="gdg-inline-input gdg-num-cell gdg-acc-qty-input"
                                                                />
                                                                <span className="gdg-acc-qty-unit">{it.satuan}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" style={{ height: '36px', borderRadius: '6px' }} onClick={() => setShowFollowupModal(false)} disabled={followupSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe primary" style={{ height: '36px', borderRadius: '6px' }} disabled={followupSubmitting}>
                                    {followupSubmitting ? 'Menyimpan...' : 'Simpan Verifikasi Susulan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: TUTUP / BATALKAN PENGADAAN ITEM TUNGGAL */}
            {closeItemTarget && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !closeItemSubmitting && setCloseItemTarget(null)}>
                    <div className="gdg-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Tutup Antrean Pengadaan Item</h3>
                                <p>{closeItemTarget.req.nomor} · {closeItemTarget.item.barang_nama}</p>
                            </div>
                            <button type="button" className="gdg-brg-icon-btn" onClick={() => !closeItemSubmitting && setCloseItemTarget(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleExecuteCloseItem}>
                            <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div className="gdg-out-banner warning">
                                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                                    <span>Item ini tidak lagi menunggu stok. Jika seluruh item lain sudah selesai, status dokumen otomatis menjadi <strong>Selesai</strong>.</span>
                                </div>
                                <div className="gdg-form-group">
                                    <label>Alasan Penutupan Pengadaan (Opsional)</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: Item tidak dilanjutkan pengadaannya / unit sudah tidak membutuhkan"
                                        value={closeItemAlasan}
                                        onChange={(e) => setCloseItemAlasan(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setCloseItemTarget(null)} disabled={closeItemSubmitting}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe danger" disabled={closeItemSubmitting}>
                                    {closeItemSubmitting ? 'Menutup...' : 'Tutup Pengadaan Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL KONFIRMASI AKSI (SETUJUI PERMINTAAN / SETUJUI PENGELUARAN) */}
            {confirmAction && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !confirmSubmitting && setConfirmAction(null)}>
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>{confirmAction.title}</h3>
                                <p>{confirmAction.subtitle}</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => !confirmSubmitting && setConfirmAction(null)}
                                disabled={confirmSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <p className="gdg-po-confirm-msg">
                                {confirmAction.message}
                            </p>
                            {confirmAction.type === 'APPROVE_REQ' && confirmAction.target?.concurrent_duplicate_count > 0 && (
                                <ConcurrentApproverBanner
                                    duplicateItems={confirmAction.target.concurrent_duplicate_items}
                                    ruangNama={confirmAction.target.ruang_nama}
                                />
                            )}
                        </div>

                        <div className="gdg-modal-foot">
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                onClick={() => setConfirmAction(null)}
                                disabled={confirmSubmitting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className={`gdg-btn-stripe ${confirmAction.btnColor || 'primary'}`}
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

            <ConcurrentDuplicateConfirmModal
                isOpen={Boolean(pendingDuplicateConfirm)}
                ruangNama={pendingDuplicateConfirm?.ruangNama || ''}
                duplicates={pendingDuplicateConfirm?.duplicates || []}
                submitting={saving}
                onCancel={() => setPendingDuplicateConfirm(null)}
                onConfirm={() => {
                    if (!pendingDuplicateConfirm) return;
                    executeCreateReqPayload(pendingDuplicateConfirm.payload);
                }}
            />
        </div>
    );
}
