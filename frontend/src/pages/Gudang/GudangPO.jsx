import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Eye,
    Send,
    CheckCircle2,
    XCircle,
    Printer,
    FileText,
    Trash2,
    X,
    Check,
    ReceiptText,
    ChevronDown
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';

export default function GudangPO({ heroActionsTarget = null }) {
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();
    const isSuper = Boolean(user?.is_superuser || user?.username === 'super' || user?.role === 'superadmin' || user?.role === 'direktur');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [poList, setPoList] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Master options
    const [vendorList, setVendorList] = useState([]);
    const [barangList, setBarangList] = useState([]);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedPO, setSelectedPO] = useState(null);

    // Confirmation Modal State (Submit to Kasi, Approve, Reject)
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);

    // Form state
    const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
    const [formVendor, setFormVendor] = useState({ id: null, nama: '' });
    const [formCatatan, setFormCatatan] = useState('');
    const [formItems, setFormItems] = useState([
        { barang_id: '', kemasan: 'PCS', isi: 1, qty_kemasan: 1, harga_kemasan: 0, subtotal: 0 }
    ]);

    const vendorOptions = useMemo(() => {
        return (vendorList || []).map((v) => ({
            value: String(v.id),
            label: v.nama,
            subtext: [
                v.kode,
                v.kc || v.kontak_person ? `PIC: ${v.kc || v.kontak_person}` : '',
                v.telp || v.telepon ? `Telp: ${v.telp || v.telepon}` : '',
                v.alamat
            ].filter(Boolean).join(' • '),
            tag: v.kategori || undefined,
            raw: v
        }));
    }, [vendorList]);

    const barangOptions = useMemo(() => {
        return (barangList || []).map((b) => ({
            value: String(b.id),
            label: b.nama,
            subtext: [
                b.kode,
                b.golongan?.nama ? `Gol: ${b.golongan.nama}` : '',
                b.satuan_dasar?.kode ? `Satuan: ${b.satuan_dasar.kode}` : '',
                b.merk ? `Merk: ${b.merk}` : ''
            ].filter(Boolean).join(' • '),
            tag: b.satuan_dasar?.kode || undefined,
            raw: b
        }));
    }, [barangList]);

    const fetchVendors = async () => {
        try {
            const res = await api.get('/gudang/vendor/');
            setVendorList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load vendors', err);
        }
    };

    const fetchBarangOptions = async () => {
        try {
            const res = await api.get('/gudang/barang/?page_size=1000');
            setBarangList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load barang', err);
        }
    };

    const fetchPOs = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
                search: searchQuery,
            };
            if (statusFilter) params.status = statusFilter;

            const res = await api.get('/gudang/po/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setPoList(data);
                setTotalCount(data.length);
            } else {
                setPoList(data.results || []);
                setTotalCount(data.count || 0);
            }
        } catch (err) {
            console.error('Failed to load POs', err);
            toast.error('Gagal memuat daftar Surat Pesanan (PO).');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendors();
        fetchBarangOptions();
    }, []);

    useEffect(() => {
        fetchPOs();
    }, [page, pageSize, searchQuery, statusFilter]);

    const handleOpenCreate = () => {
        fetchVendors();
        setFormDate(new Date().toISOString().slice(0, 10));
        setFormVendor({ id: null, nama: '' });
        setFormCatatan('');
        setFormItems([
            { barang_id: '', kemasan: 'PCS', isi: 1, qty_kemasan: 1, harga_kemasan: 0, subtotal: 0 }
        ]);
        setShowCreateModal(true);
    };

    const handleAddItemRow = () => {
        setFormItems(prev => [
            ...prev,
            { barang_id: '', kemasan: 'PCS', isi: 1, qty_kemasan: 1, harga_kemasan: 0, subtotal: 0 }
        ]);
    };

    const handleRemoveItemRow = (index) => {
        setFormItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index, field, value) => {
        setFormItems(prev => {
            const updated = [...prev];
            const current = { ...updated[index], [field]: value };

            if (field === 'barang_id') {
                const b = barangList.find(x => String(x.id) === String(value));
                if (b) {
                    current.kemasan = b.satuan_dasar?.kode || 'PCS';
                    current.isi = 1;
                    // if has default kemasan
                    if (b.kemasan_list && b.kemasan_list.length > 0) {
                        const def = b.kemasan_list.find(k => k.is_default_beli) || b.kemasan_list[0];
                        current.kemasan = def.nama_kemasan;
                        current.isi = Number(def.isi_per_kemasan) || 1;
                    }
                }
            } else if (field === 'kemasan') {
                const b = barangList.find(x => String(x.id) === String(current.barang_id));
                if (b) {
                    if (value === b.satuan_dasar?.kode) {
                        current.isi = 1;
                    } else {
                        const k = b.kemasan_list?.find(x => x.nama_kemasan === value);
                        if (k) current.isi = Number(k.isi_per_kemasan) || 1;
                    }
                }
            }

            // Calculate subtotal
            const qty = Number(current.qty_kemasan) || 0;
            const harga = Number(current.harga_kemasan) || 0;
            current.subtotal = qty * harga;

            updated[index] = current;
            return updated;
        });
    };

    const grandTotal = useMemo(() => {
        return formItems.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
    }, [formItems]);

    const handleSubmitPO = async (e) => {
        e.preventDefault();
        if (!formVendor.nama) {
            toast.error('Silakan pilih atau ketik nama Rekanan/Vendor.');
            return;
        }
        const validItems = formItems.filter(it => it.barang_id && Number(it.qty_kemasan) > 0);
        if (validItems.length === 0) {
            toast.error('Minimal masukkan 1 barang dengan jumlah pesanan lebih dari 0.');
            return;
        }

        setSaving(true);
        try {
            await api.post('/gudang/po/', {
                tanggal: formDate,
                vendor_id: formVendor.id,
                vendor_nama: formVendor.nama,
                catatan: formCatatan,
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    kemasan: it.kemasan,
                    isi: it.isi,
                    qty_kemasan: it.qty_kemasan,
                    harga_kemasan: it.harga_kemasan
                }))
            });
            toast.success('Surat Pesanan (PO) berhasil dibuat sebagai Draft.');
            setShowCreateModal(false);
            fetchPOs();
        } catch (err) {
            console.error('Create PO failed', err);
            const msg = err.response?.data?.error || 'Gagal membuat Surat Pesanan.';
            toast.error(String(msg));
        } finally {
            setSaving(false);
        }
    };

    const handleActionSubmitToKasi = (po) => {
        setConfirmAction({
            type: 'SUBMIT',
            po,
            title: 'Ajukan Surat Pesanan ke Atasan',
            subtitle: 'Persetujuan berjenjang Kepala Seksi / Atasan',
            message: `Apakah Anda yakin ingin mengajukan Surat Pesanan ${po.nomor} (${po.vendor_nama}) senilai ${formatMoney(po.total_nilai)} kepada Kepala Seksi / Atasan untuk approval?`,
            btnText: 'Ya, Ajukan Surat Pesanan',
            btnColor: 'primary',
            icon: <Send size={20} />
        });
    };

    const handleActionApprove = (po) => {
        setConfirmAction({
            type: 'APPROVE',
            po,
            title: 'Setujui Surat Pesanan (PO)',
            subtitle: 'Dokumen akan berstatus DISETUJUI & siap diproses GRN',
            message: `Apakah Anda yakin ingin menyetujui Surat Pesanan ${po.nomor} (${po.vendor_nama}) senilai ${formatMoney(po.total_nilai)}? Dokumen yang disetujui dapat diproses untuk penerimaan barang (GRN).`,
            btnText: 'Ya, Setujui PO',
            btnColor: 'success',
            icon: <Check size={20} />
        });
    };

    const handleActionReject = (po) => {
        setConfirmAction({
            type: 'REJECT',
            po,
            title: 'Tolak Surat Pesanan (PO)',
            subtitle: 'Dokumen akan ditolak dan dikembalikan ke pembuat',
            message: `Surat Pesanan ${po.nomor} (${po.vendor_nama}) akan ditolak. Masukkan catatan atau alasan penolakan:`,
            rejectReason: '',
            btnText: 'Tolak Surat Pesanan',
            btnColor: 'danger',
            icon: <XCircle size={20} />
        });
    };

    const handleActionDeletePO = (po) => {
        setConfirmAction({
            type: 'DELETE',
            po,
            title: 'Hapus Surat Pesanan (PO)',
            subtitle: 'Tindakan ini tidak dapat dibatalkan',
            message: `Apakah Anda yakin ingin menghapus permanen Surat Pesanan ${po.nomor} (${po.vendor_nama}) senilai ${formatMoney(po.total_nilai)}?`,
            btnText: 'Hapus Permanen',
            btnColor: 'danger',
            icon: <Trash2 size={20} />
        });
    };

    const handleActionBatalPO = (po) => {
        setConfirmAction({
            type: 'BATAL',
            po,
            title: 'Batalkan Surat Pesanan (PO)',
            subtitle: 'Dokumen akan berstatus DIBATALKAN',
            message: `Surat Pesanan ${po.nomor} (${po.vendor_nama}) akan dibatalkan. Masukkan alasan pembatalan:`,
            rejectReason: '',
            btnText: 'Batalkan PO',
            btnColor: 'danger',
            icon: <XCircle size={20} />
        });
    };

    const handleActionClosePO = (po) => {
        setConfirmAction({
            type: 'CLOSE_PO',
            po,
            title: 'Selesaikan & Tutup Surat Pesanan (SPB)',
            subtitle: 'Sisa barang yang belum terkirim dianggap hangus',
            message: `Apakah Anda yakin ingin menyelesaikan Surat Pesanan ${po.nomor} (${po.vendor_nama})? Status dokumen akan menjadi SELESAI dan tidak akan muncul lagi di daftar penerimaan.`,
            btnText: 'Selesaikan SPB',
            btnColor: 'primary',
            icon: <CheckCircle2 size={20} />
        });
    };

    const handleExecuteConfirmAction = async () => {
        if (!confirmAction || !confirmAction.po) return;
        const { type, po, rejectReason } = confirmAction;

        setConfirmSubmitting(true);
        try {
            if (type === 'SUBMIT') {
                await api.post(`/gudang/po/${po.id}/submit/`);
                toast.success(`PO ${po.nomor} berhasil diajukan untuk approval.`);
            } else if (type === 'APPROVE') {
                await api.post(`/gudang/po/${po.id}/approve/`);
                toast.success(`PO ${po.nomor} telah DISETUJUI.`);
            } else if (type === 'REJECT') {
                await api.post(`/gudang/po/${po.id}/reject/`, { catatan_tolak: rejectReason || '' });
                toast.success(`PO ${po.nomor} telah DITOLAK.`);
            } else if (type === 'DELETE') {
                await api.delete(`/gudang/po/${po.id}/`);
                toast.success(`PO ${po.nomor} berhasil dihapus.`);
            } else if (type === 'BATAL') {
                await api.post(`/gudang/po/${po.id}/batal/`, { alasan_batal: rejectReason || '' });
                toast.success(`PO ${po.nomor} telah DIBATALKAN.`);
            } else if (type === 'CLOSE_PO') {
                await api.post(`/gudang/po/${po.id}/close_po/`);
                toast.success(`Surat Pesanan ${po.nomor} telah ditutup sebagai SELESAI.`);
            }
            setConfirmAction(null);
            fetchPOs();
        } catch (err) {
            console.error('Action failed', err);
            const msg = err.response?.data?.error || 'Gagal memproses aksi.';
            toast.error(String(msg));
        } finally {
            setConfirmSubmitting(false);
        }
    };

    const formatMoney = (val) => {
        return `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const printPO = (po) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const html = `
            <html>
            <head>
                <title>Surat Pesanan - ${po.nomor}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; }
                    .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 20px; }
                    .header h2 { margin: 0; font-size: 20px; text-transform: uppercase; }
                    .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
                    th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
                    .total { font-weight: bold; font-size: 15px; text-align: right; }
                    .footer { margin-top: 40px; display: flex; justify-content: space-between; text-align: center; }
                    .sign { margin-top: 60px; font-weight: bold; border-top: 1px solid #000; display: inline-block; min-width: 160px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>RS Siaga Al Munawwarah Samarinda</h2>
                    <p>SURAT PESANAN BARANG LOGISTIK (PO)</p>
                </div>
                <div class="meta">
                    <div>
                        <strong>Nomor PO:</strong> ${po.nomor}<br>
                        <strong>Tanggal:</strong> ${po.tanggal}<br>
                        <strong>Status:</strong> ${po.status}
                    </div>
                    <div>
                        <strong>Kepada Rekanan:</strong><br>
                        ${po.vendor_nama}<br>
                        ${po.catatan ? `<em>Catatan: ${po.catatan}</em>` : ''}
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Kode</th>
                            <th>Nama Barang</th>
                            <th>Merk</th>
                            <th>Kemasan</th>
                            <th>Qty Pesan</th>
                            <th>Total Satuan Dasar</th>
                            <th>Harga Satuan</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(po.items || []).map((it, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>${it.barang_kode}</td>
                                <td><strong>${it.barang_nama}</strong></td>
                                <td>${it.barang_merk || '-'}</td>
                                <td>${it.kemasan} (isi ${Number(it.isi)})</td>
                                <td>${Number(it.qty_kemasan)} ${it.kemasan}</td>
                                <td>${Number(it.qty_dasar)} ${it.satuan_dasar_kode}</td>
                                <td>Rp ${Number(it.harga_kemasan).toLocaleString('id-ID')}</td>
                                <td>Rp ${Number(it.subtotal).toLocaleString('id-ID')}</td>
                            </tr>
                        `).join('')}
                        <tr>
                            <td colspan="8" class="total">GRAND TOTAL NILAI PESANAN:</td>
                            <td class="total">Rp ${Number(po.total_nilai).toLocaleString('id-ID')}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="footer">
                    <div>
                        Pembuat Dokumen,<br>
                        <div class="sign">${po.created_by_nama || 'Petugas Gudang'}</div>
                    </div>
                    <div>
                        Menyetujui (Atasan),<br>
                        <div class="sign">${po.approved_by_nama || 'Kepala Seksi / Manajer'}</div>
                    </div>
                </div>
                <script>window.print();</script>
            </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const heroActions = (
        <>
            <button type="button" className="gdg-btn-stripe secondary" onClick={fetchPOs} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
            </button>
            <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                <Plus size={14} />
                <span>Buat Surat Pesanan (PO)</span>
            </button>
        </>
    );

    return (
        <div className="gdg-dash-root">
            {heroActionsTarget
                ? createPortal(heroActions, heroActionsTarget)
                : <div className="gdg-brg-fallback-actions">{heroActions}</div>}

            <section className="gdg-dash-section">
                {/* FILTER TOOLBAR */}
                <div className="gdg-brg-toolbar">
                    <div className="gdg-brg-toolbar-left">
                        <div className="gdg-dash-search">
                            <Search size={14} className="gdg-dash-search-icon" />
                            <input
                                type="text"
                                placeholder="Cari nomor PO, rekanan/vendor..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            />
                        </div>

                        <div className="gdg-ks-select-wrap">
                            <select
                                className="gdg-ks-select gdg-brg-select"
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            >
                                <option value="">Semua Status ({totalCount})</option>
                                <option value="DRAFT">Draft</option>
                                <option value="MENUNGGU_APPROVAL">Menunggu Approval</option>
                                <option value="DISETUJUI">Disetujui</option>
                                <option value="SELESAI">Selesai (GRN)</option>
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
                                title="Reset pencarian dan filter"
                            >
                                <X size={14} />
                                <span>Reset</span>
                            </button>
                        )}
                    </div>
                    <div className="gdg-brg-total-hint">
                        Menampilkan {poList.length} dari {totalCount} PO
                    </div>
                </div>

                {/* PO TABLE */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th style={{ width: '130px' }}>No. PO</th>
                                <th style={{ width: '110px' }}>Tanggal</th>
                                <th>Rekanan / Vendor</th>
                                <th style={{ width: '150px', textAlign: 'right' }}>Total Nilai</th>
                                <th style={{ width: '165px' }}>Status</th>
                                <th style={{ width: '130px' }}>Pembuat</th>
                                <th style={{ width: '130px' }}>Penyetuju</th>
                                <th style={{ width: '160px', textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty">
                                        Memuat daftar Surat Pesanan...
                                    </td>
                                </tr>
                            ) : poList.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty gdg-po-empty-cell">
                                        <div className="gdg-po-empty-box">
                                            <FileText size={28} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                            <div className="gdg-po-empty-title">
                                                {searchQuery || statusFilter
                                                    ? 'Tidak ada Surat Pesanan yang cocok dengan pencarian / filter.'
                                                    : 'Belum ada data Surat Pesanan (PO)'}
                                            </div>
                                            <p className="gdg-po-empty-desc">
                                                {searchQuery || statusFilter
                                                    ? 'Silakan periksa kembali kata kunci pencarian atau reset filter status.'
                                                    : 'Buat Surat Pesanan (PO) baru untuk memesan stok barang ke vendor rekanan.'}
                                            </p>
                                            {!searchQuery && !statusFilter && (
                                                <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                                                    <Plus size={14} />
                                                    <span>Buat Surat Pesanan Pertama</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                poList.map((po) => {
                                    const isDraft = po.status === 'DRAFT';
                                    const isMenunggu = po.status === 'MENUNGGU_APPROVAL';
                                    const isSelesai = po.status === 'SELESAI';
                                    const isDitolak = po.status === 'DITOLAK';

                                    let statusTone = 'slate';
                                    if (isDraft) statusTone = 'slate';
                                    else if (isMenunggu) statusTone = 'amber';
                                    else if (po.status === 'DISETUJUI') statusTone = 'emerald';
                                    else if (isSelesai) statusTone = 'indigo';
                                    else if (isDitolak || po.status === 'BATAL') statusTone = 'rose';

                                    return (
                                        <tr key={po.id}>
                                            <td className="gdg-code-cell">{po.nomor}</td>
                                            <td className="gdg-num-cell">{po.tanggal}</td>
                                            <td>
                                                <div className="gdg-po-vendor-name">{po.vendor_nama}</div>
                                                {po.catatan && <div className="gdg-po-vendor-note">{po.catatan}</div>}
                                            </td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {formatMoney(po.total_nilai)}
                                            </td>
                                            <td>
                                                <span className={`gdg-status-text ${statusTone}`}>
                                                    <span className="gdg-status-dot" />
                                                    <span>{po.status}</span>
                                                </span>
                                                {po.catatan_tolak && isDitolak && (
                                                    <div className="gdg-po-reject-note">{po.catatan_tolak}</div>
                                                )}
                                            </td>
                                            <td className="gdg-po-meta-cell">{po.created_by_nama || '-'}</td>
                                            <td className="gdg-po-meta-cell">{po.approved_by_nama || '-'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="gdg-brg-row-actions">
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        onClick={() => { setSelectedPO(po); setShowDetailModal(true); }}
                                                        title="Lihat Detail Barang PO"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        onClick={() => printPO(po)}
                                                        title="Cetak Surat Pesanan (Print PDF)"
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    {/* Draft: Ajukan */}
                                                    {isDraft && (
                                                        <button
                                                            type="button"
                                                            className="gdg-btn-stripe primary gdg-po-ajukan-btn"
                                                            onClick={() => handleActionSubmitToKasi(po)}
                                                            title="Ajukan ke Kepala Seksi / Atasan"
                                                        >
                                                            <Send size={12} />
                                                            <span>Ajukan</span>
                                                        </button>
                                                    )}

                                                    {/* Menunggu: Approve & Reject */}
                                                    {isMenunggu && (po.can_approve || isSuper) && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn success"
                                                                onClick={() => handleActionApprove(po)}
                                                                title="Setujui PO Ini"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="gdg-brg-icon-btn danger"
                                                                onClick={() => handleActionReject(po)}
                                                                title="Tolak PO Ini"
                                                            >
                                                                <XCircle size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {isMenunggu && !po.can_approve && !isSuper && (
                                                        <span
                                                            className="gdg-po-waiting-hint"
                                                            title="Menunggu persetujuan Kepala Seksi / Atasan (Pembuat tidak dapat menyetujui dokumen sendiri)"
                                                        >
                                                            Menunggu Atasan
                                                        </span>
                                                    )}

                                                    {/* Batal PO: Khusus Superuser jika sudah disetujui tapi belum diterima */}
                                                    {po.status === 'DISETUJUI' && isSuper && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn danger"
                                                            onClick={() => handleActionBatalPO(po)}
                                                            title="Batalkan PO (Superadmin Override)"
                                                        >
                                                            <XCircle size={14} />
                                                        </button>
                                                    )}

                                                    {/* Hapus PO: Draft, Ditolak, Batal, atau Superuser */}
                                                    {(isDraft || isDitolak || po.status === 'BATAL' || isSuper) && po.status !== 'SELESAI' && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn danger"
                                                            onClick={() => handleActionDeletePO(po)}
                                                            title="Hapus Surat Pesanan"
                                                        >
                                                            <Trash2 size={14} />
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

                {/* PAGINATION */}
                <SimplePagination
                    className="gdg-dash-pagination"
                    page={page}
                    pageSize={pageSize}
                    total={totalCount}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            </section>

            {/* MODAL BUAT SURAT PESANAN (PO) */}
            {showCreateModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Buat Surat Pesanan Barang (PO / SPB)</h3>
                                <p>Pilih rekanan penyedia dan tentukan rincian item barang yang akan dipesan ke distributor.</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowCreateModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitPO}>
                            <div className="gdg-modal-body">
                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Tanggal Surat Pesanan *</label>
                                        </div>
                                        <DateField
                                            value={formDate}
                                            onChange={(newDate) => setFormDate(newDate)}
                                            placeholder="Pilih tanggal pesanan..."
                                            className="gdg-date-field gdg-po-date-field"
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Rekanan / Vendor *</label>
                                        </div>
                                        <SearchableSelect
                                            options={vendorOptions}
                                            value={formVendor.id ? String(formVendor.id) : (formVendor.nama || '')}
                                            onChange={(val, opt) => {
                                                if (!val) {
                                                    setFormVendor({ id: null, nama: '' });
                                                    return;
                                                }
                                                if (opt?.isNew) {
                                                    setFormVendor({ id: null, nama: opt.rawLabel || val });
                                                    return;
                                                }
                                                const found = opt?.raw || (vendorList || []).find((v) => String(v.id) === String(val));
                                                if (found) {
                                                    setFormVendor({
                                                        id: found.id,
                                                        nama: found.nama
                                                    });
                                                } else {
                                                    setFormVendor({ id: null, nama: val });
                                                }
                                            }}
                                            placeholder="Pilih Rekanan / Vendor..."
                                            searchPlaceholder="Cari kode, nama vendor, atau PIC..."
                                            emptyMessage={
                                                vendorOptions.length === 0
                                                    ? "Belum ada vendor di SIMAK. Tambahkan di menu Master Vendor atau ketik nama vendor..."
                                                    : "Rekanan tidak ditemukan"
                                            }
                                            clearable={true}
                                            creatable={true}
                                            minDropdownWidth={360}
                                            popoverClassName="gdg-ks-ss-popover"
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-group">
                                    <label>Catatan Tambahan (Opsional)</label>
                                    <input
                                        type="text"
                                        placeholder="Misal: Mohon dikirim paling lambat akhir pekan ini..."
                                        value={formCatatan}
                                        onChange={(e) => setFormCatatan(e.target.value)}
                                    />
                                </div>

                                {/* ITEM LIST */}
                                <div className="gdg-detail-divider">
                                    <div className="gdg-po-items-head">
                                        <span className="gdg-detail-section-title">
                                            Daftar Barang yang Dipesan
                                        </span>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe secondary"
                                            onClick={handleAddItemRow}
                                        >
                                            <Plus size={14} />
                                            <span>Tambah Item</span>
                                        </button>
                                    </div>

                                    <div className="gdg-po-items-list">
                                        {/* Column Headers for Items */}
                                        <div className="gdg-po-item-grid gdg-po-item-header">
                                            <div>Barang *</div>
                                            <div>Merk</div>
                                            <div>Kemasan</div>
                                            <div>Qty Pesan</div>
                                            <div>Harga / Kemasan</div>
                                            <div style={{ textAlign: 'right' }}>Subtotal</div>
                                            <div></div>
                                        </div>

                                        {formItems.map((item, idx) => {
                                            const selectedBrg = barangList.find(b => String(b.id) === String(item.barang_id));
                                            const kemasanOptions = selectedBrg ? [
                                                { nama: selectedBrg.satuan_dasar?.kode, isi: 1 },
                                                ...(selectedBrg.kemasan_list || []).map(k => ({ nama: k.nama_kemasan, isi: Number(k.isi_per_kemasan) }))
                                            ] : [];

                                            return (
                                                <div key={idx} className="gdg-po-item-grid gdg-item-row">
                                                    <div style={{ minWidth: 0 }}>
                                                        <SearchableSelect
                                                            options={barangOptions}
                                                            value={item.barang_id ? String(item.barang_id) : ''}
                                                            onChange={(val) => handleItemChange(idx, 'barang_id', val)}
                                                            placeholder="-- Pilih Barang --"
                                                            searchPlaceholder="Cari kode atau nama barang..."
                                                            emptyMessage="Barang tidak ditemukan"
                                                            minDropdownWidth={360}
                                                            maxDropdownWidth={600}
                                                            popoverClassName="gdg-ks-ss-popover"
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={selectedBrg?.merk || '-'}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input gdg-po-readonly-input"
                                                            title={selectedBrg?.merk ? `Merk: ${selectedBrg.merk}` : 'Tidak ada merk terdaftar'}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <select
                                                            value={item.kemasan}
                                                            onChange={(e) => handleItemChange(idx, 'kemasan', e.target.value)}
                                                            className="gdg-inline-input"
                                                        >
                                                            {kemasanOptions.map((k, kIdx) => (
                                                                <option key={kIdx} value={k.nama}>
                                                                    {k.nama} (isi {k.isi})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            value={item.qty_kemasan}
                                                            onChange={(e) => handleItemChange(idx, 'qty_kemasan', e.target.value)}
                                                            className="gdg-inline-input gdg-num-cell"
                                                            required
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="100"
                                                            value={item.harga_kemasan}
                                                            onChange={(e) => handleItemChange(idx, 'harga_kemasan', e.target.value)}
                                                            className="gdg-inline-input gdg-num-cell"
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="gdg-po-subtotal-val gdg-num-cell">
                                                            {formatMoney(item.subtotal)}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn danger"
                                                        onClick={() => handleRemoveItemRow(idx)}
                                                        disabled={formItems.length === 1}
                                                        title="Hapus baris barang"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* GRAND TOTAL ROW */}
                                    <div className="gdg-po-grand-total">
                                        <span className="gdg-po-grand-total-label">
                                            Total Estimasi Nilai Pesanan (PO)
                                        </span>
                                        <strong className="gdg-po-grand-total-value gdg-num-cell">
                                            {formatMoney(grandTotal)}
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCreateModal(false)} disabled={saving}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe primary" disabled={saving}>
                                    {saving ? 'Menyimpan...' : 'Simpan Sebagai Draft'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL DETAIL PO & PERBANDINGAN PENERIMAAN */}
            {showDetailModal && selectedPO && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailModal(false)}>
                    <div className="gdg-modal gdg-po-modal-detail" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Detail Surat Pesanan: {selectedPO.nomor}</h3>
                                <p className="gdg-po-detail-sub">
                                    <span>Rekanan: <span className="gdg-po-detail-strong">{selectedPO.vendor_nama}</span></span>
                                    <span>·</span>
                                    <span>Tanggal: <span className="gdg-num-cell">{selectedPO.tanggal}</span></span>
                                    <span>·</span>
                                    <span className={`gdg-status-text ${
                                        selectedPO.status === 'DISETUJUI' ? 'emerald' :
                                        selectedPO.status === 'SELESAI' ? 'indigo' :
                                        selectedPO.status === 'MENUNGGU_APPROVAL' ? 'amber' :
                                        selectedPO.status === 'DITOLAK' || selectedPO.status === 'BATAL' ? 'rose' : 'slate'
                                    }`}>
                                        <span className="gdg-status-dot" />
                                        <span>{selectedPO.status}</span>
                                    </span>
                                </p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setShowDetailModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body">
                            {/* SECTION 1: PERBANDINGAN ITEM PESANAN VS PENERIMAAN */}
                            <div className="gdg-po-section-head">
                                <span className="gdg-po-section-title">
                                    Perbandingan Item Pesanan &amp; Realisasi Penerimaan (GRN)
                                </span>
                                <span className="gdg-po-section-meta">
                                    Total Estimasi PO:{' '}
                                    <strong className="gdg-num-cell">{formatMoney(selectedPO.total_nilai)}</strong>
                                </span>
                            </div>

                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>Barang</th>
                                            <th>Merk</th>
                                            <th>Kemasan Pesan</th>
                                            <th style={{ textAlign: 'center' }}>Total Pesan</th>
                                            <th style={{ textAlign: 'center' }}>Diterima (GRN)</th>
                                            <th style={{ textAlign: 'center' }}>Sisa Belum Datang</th>
                                            <th style={{ textAlign: 'center' }}>Status Pemenuhan</th>
                                            <th style={{ textAlign: 'right' }}>Harga Kemasan</th>
                                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedPO.items || []).map((it) => {
                                            const qtyDasar = Number(it.qty_dasar) || 0;
                                            const qtyDiterima = Number(it.qty_diterima) || 0;
                                            const sisaDasar = Math.max(0, qtyDasar - qtyDiterima);
                                            const sisaKemasan = it.isi > 0 ? (sisaDasar / Number(it.isi)) : sisaDasar;
                                            const isLengkap = qtyDiterima >= qtyDasar && qtyDasar > 0;
                                            const isParsial = qtyDiterima > 0 && qtyDiterima < qtyDasar;
                                            const pct = qtyDasar > 0 ? Math.round((qtyDiterima / qtyDasar) * 100) : 100;

                                            return (
                                                <tr key={it.id}>
                                                    <td>
                                                        <div className="gdg-po-vendor-name">{it.barang_nama}</div>
                                                        <div className="gdg-po-vendor-note">{it.barang_kode}</div>
                                                    </td>
                                                    <td className="gdg-po-meta-cell">
                                                        {it.barang_merk || '-'}
                                                    </td>
                                                    <td>{Number(it.qty_kemasan)} {it.kemasan}</td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'center', fontWeight: 600 }}>
                                                        {qtyDasar} {it.satuan_dasar_kode}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'center' }}>
                                                        <span style={{ fontWeight: 600, color: qtyDiterima > 0 ? '#10b981' : '#64748b' }}>
                                                            {qtyDiterima} {it.satuan_dasar_kode}
                                                        </span>
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'center' }}>
                                                        {sisaDasar > 0 ? (
                                                            <span style={{ color: '#f59e0b', fontWeight: 500 }}>
                                                                {sisaKemasan} {it.kemasan} ({sisaDasar} {it.satuan_dasar_kode})
                                                            </span>
                                                        ) : (
                                                            <span className="gdg-po-meta-cell">-</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {isLengkap ? (
                                                            <span className="gdg-status-text emerald">
                                                                <span className="gdg-status-dot" />
                                                                <span>Selesai Penuh (100%)</span>
                                                            </span>
                                                        ) : isParsial ? (
                                                            <span className="gdg-status-text amber">
                                                                <span className="gdg-status-dot" />
                                                                <span>Diterima Sebagian ({pct}%)</span>
                                                            </span>
                                                        ) : (
                                                            <span className="gdg-status-text slate">
                                                                <span className="gdg-status-dot" />
                                                                <span>Belum Diterima</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right' }}>{formatMoney(it.harga_kemasan)}</td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(it.subtotal)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* SECTION 2: RIWAYAT DOKUMEN PENERIMAAN FISIK (GRN TERKAIT) */}
                            <div className="gdg-po-detail-grn-wrap">
                                <div className="gdg-po-section-head">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <ReceiptText size={16} className="gdg-po-grn-icon" />
                                        <span className="gdg-po-section-title">
                                            Riwayat Dokumen Penerimaan Fisik (GRN Terkait)
                                        </span>
                                    </div>
                                    <span className="gdg-po-section-meta">
                                        {(selectedPO.penerimaan_list || []).length} Dokumen
                                    </span>
                                </div>

                                {(selectedPO.penerimaan_list || []).length === 0 ? (
                                    <div className="gdg-po-grn-empty">
                                        Belum ada dokumen Penerimaan Fisik (GRN) yang dicatat untuk Surat Pesanan ini.
                                    </div>
                                ) : (
                                    <div className="gdg-table-wrap gdg-table-borderless">
                                        <table className="gdg-table gdg-table-stripe">
                                            <thead>
                                                <tr>
                                                    <th>No. GRN</th>
                                                    <th>Tanggal Terima</th>
                                                    <th>No. Faktur Rekanan</th>
                                                    <th>Metode Bayar</th>
                                                    <th style={{ textAlign: 'right' }}>Total Nilai Fisik</th>
                                                    <th style={{ textAlign: 'center' }}>Status GRN</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedPO.penerimaan_list.map((grn) => (
                                                    <tr key={grn.id}>
                                                        <td className="gdg-code-cell">{grn.nomor}</td>
                                                        <td className="gdg-num-cell">{grn.tanggal}</td>
                                                        <td className="gdg-code-cell" style={{ color: grn.no_faktur ? 'inherit' : '#64748b' }}>
                                                            {grn.no_faktur || '-'}
                                                        </td>
                                                        <td>{grn.metode_pembayaran}</td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                            {formatMoney(grn.total_nilai)}
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span className={`gdg-status-text ${grn.status === 'DISETUJUI' ? 'emerald' : grn.status === 'BATAL' ? 'rose' : 'amber'}`}>
                                                                <span className="gdg-status-dot" />
                                                                <span>
                                                                    {grn.status === 'DISETUJUI' ? 'Disetujui (Stok Bertambah)' : grn.status === 'BATAL' ? 'Dibatalkan' : 'Draft'}
                                                                </span>
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <div className="gdg-po-foot-group">
                                <button
                                    type="button"
                                    className="gdg-btn-stripe secondary"
                                    onClick={() => printPO(selectedPO)}
                                >
                                    <Printer size={14} />
                                    <span>Cetak SPB / PO</span>
                                </button>
                                {selectedPO.status === 'DISETUJUI' && (
                                    <>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe primary"
                                            onClick={() => {
                                                setShowDetailModal(false);
                                                navigate('/gudang/penerimaan');
                                            }}
                                            title="Buka menu Penerimaan (GRN) untuk memproses barang pesanan ini"
                                        >
                                            <ReceiptText size={14} />
                                            <span>Proses Penerimaan (GRN)</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe secondary"
                                            onClick={() => {
                                                setShowDetailModal(false);
                                                handleActionClosePO(selectedPO);
                                            }}
                                            title="Tutup SPB ini menjadi SELESAI (sisa barang yang belum datang dianggap hangus)"
                                        >
                                            <CheckCircle2 size={14} />
                                            <span>Selesaikan SPB</span>
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="gdg-po-foot-group">
                                {selectedPO.status === 'MENUNGGU_APPROVAL' && (selectedPO.can_approve || isSuper) && (
                                    <>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe danger"
                                            onClick={() => {
                                                setShowDetailModal(false);
                                                handleActionReject(selectedPO);
                                            }}
                                        >
                                            <XCircle size={14} />
                                            <span>Tolak PO</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="gdg-btn-stripe success"
                                            onClick={() => {
                                                setShowDetailModal(false);
                                                handleActionApprove(selectedPO);
                                            }}
                                        >
                                            <Check size={14} />
                                            <span>Setujui PO</span>
                                        </button>
                                    </>
                                )}
                                {selectedPO.status === 'DISETUJUI' && isSuper && (
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe danger"
                                        onClick={() => {
                                            setShowDetailModal(false);
                                            handleActionBatalPO(selectedPO);
                                        }}
                                    >
                                        <XCircle size={14} />
                                        <span>Batalkan PO</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL KONFIRMASI AKSI (SUBMIT / APPROVE / REJECT) */}
            {confirmAction && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !confirmSubmitting && setConfirmAction(null)}>
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>{confirmAction.title}</h3>
                                <p>{confirmAction.subtitle || `${confirmAction.po.nomor} • ${confirmAction.po.vendor_nama}`}</p>
                            </div>
                            <button
                                type="button"
                                className="gdg-brg-icon-btn"
                                onClick={() => setConfirmAction(null)}
                                disabled={confirmSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <p className="gdg-po-confirm-msg">
                                {confirmAction.message}
                            </p>

                            {/* Info Card Summary */}
                            <div className="gdg-po-confirm-card">
                                <div>
                                    <span className="gdg-po-confirm-label">Nomor Dokumen</span>
                                    <strong className="gdg-po-confirm-val gdg-code-cell">{confirmAction.po.nomor}</strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Total Estimasi Nilai</span>
                                    <strong className="gdg-po-confirm-val gdg-num-cell">{formatMoney(confirmAction.po.total_nilai)}</strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Rekanan / Vendor</span>
                                    <strong className="gdg-po-confirm-val gdg-po-ellipsis">
                                        {confirmAction.po.vendor_nama}
                                    </strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Tanggal Pesanan</span>
                                    <strong className="gdg-po-confirm-val gdg-num-cell">{confirmAction.po.tanggal}</strong>
                                </div>
                            </div>

                            {confirmAction.type === 'REJECT' && (
                                <div className="gdg-form-group" style={{ margin: 0 }}>
                                    <label>Alasan Penolakan *</label>
                                    <textarea
                                        rows={3}
                                        className="gdg-po-textarea"
                                        placeholder="Tuliskan catatan atau alasan penolakan surat pesanan..."
                                        value={confirmAction.rejectReason || ''}
                                        onChange={(e) => setConfirmAction(prev => ({ ...prev, rejectReason: e.target.value }))}
                                        autoFocus
                                    />
                                </div>
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
                                className={`gdg-btn-stripe ${confirmAction.btnColor === 'danger' ? 'danger' : confirmAction.btnColor === 'success' ? 'success' : 'primary'}`}
                                onClick={handleExecuteConfirmAction}
                                disabled={confirmSubmitting || (confirmAction.type === 'REJECT' && !confirmAction.rejectReason?.trim())}
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

