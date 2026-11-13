import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Eye,
    CheckCircle2,
    Trash2,
    X,
    Check,
    PackageCheck,
    ChevronDown
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';

export default function GudangPenerimaan({ heroActionsTarget = null }) {
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();
    const isSuper = Boolean(user?.is_superuser || user?.username === 'super' || user?.role === 'superadmin' || user?.role === 'direktur');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [grnList, setGrnList] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Masters & Approved PO options
    const [vendorList, setVendorList] = useState([]);
    const [barangList, setBarangList] = useState([]);
    const [approvedPOs, setApprovedPOs] = useState([]);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedGRN, setSelectedGRN] = useState(null);

    // Confirmation Modal State (Approve GRN)
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);

    // Form state
    const [formPOId, setFormPOId] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
    const [formVendor, setFormVendor] = useState({ id: null, nama: '' });
    const [formNoFaktur, setFormNoFaktur] = useState('');
    const [formDueDate, setFormDueDate] = useState('');
    const [formMetode, setFormMetode] = useState('Tunai');
    const [formCatatan, setFormCatatan] = useState('');
    const [formTutupPO, setFormTutupPO] = useState(true);
    const [formItems, setFormItems] = useState([]);

    const fetchVendors = async () => {
        try {
            const res = await api.get('/gudang/vendor/');
            setVendorList(res.data || []);
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

    const fetchApprovedPOs = async () => {
        try {
            const res = await api.get('/gudang/po/approved_options/');
            setApprovedPOs(res.data || []);
        } catch (err) {
            console.error('Failed to load approved POs', err);
        }
    };

    const fetchGRNs = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
                search: searchQuery,
            };
            if (statusFilter) params.status = statusFilter;

            const res = await api.get('/gudang/penerimaan/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setGrnList(data);
                setTotalCount(data.length);
            } else {
                setGrnList(data.results || []);
                setTotalCount(data.count || 0);
            }
        } catch (err) {
            console.error('Failed to load GRNs', err);
            toast.error('Gagal memuat daftar Penerimaan Barang (GRN).');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendors();
        fetchBarangOptions();
        fetchApprovedPOs();
    }, []);

    useEffect(() => {
        fetchGRNs();
    }, [page, pageSize, searchQuery, statusFilter]);

    const handleOpenCreate = () => {
        fetchApprovedPOs();
        setFormPOId('');
        setFormDate(new Date().toISOString().slice(0, 10));
        setFormVendor({ id: null, nama: '' });
        setFormNoFaktur('');
        setFormDueDate('');
        setFormMetode('Tunai');
        setFormCatatan('');
        setFormTutupPO(true);
        setFormItems([]);
        setShowCreateModal(true);
    };

    const handleSelectPO = (poId) => {
        setFormPOId(poId);
        if (!poId) {
            setFormVendor({ id: null, nama: '' });
            setFormItems([]);
            return;
        }

        const po = approvedPOs.find(p => String(p.id) === String(poId));
        if (po) {
            setFormVendor({ id: po.vendor_id, nama: po.vendor_nama });
            setFormItems((po.items || []).map(it => ({
                barang_id: it.barang_id,
                barang_nama: it.barang_nama,
                barang_kode: it.barang_kode,
                barang_merk: it.barang_merk || '',
                po_item_id: it.po_item_id,
                kemasan: it.kemasan,
                isi: it.isi,
                sisa_kemasan: it.sisa_kemasan,
                qty_kemasan: it.sisa_kemasan,
                harga_kemasan: it.harga_kemasan,
                subtotal: it.sisa_kemasan * it.harga_kemasan,
                batch_no: '',
                exp_date: ''
            })));
        }
    };

    const handleAddItemRow = () => {
        setFormItems(prev => [
            ...prev,
            { barang_id: '', po_item_id: null, kemasan: 'PCS', isi: 1, qty_kemasan: 1, harga_kemasan: 0, subtotal: 0, batch_no: '', exp_date: '' }
        ]);
    };

    const handleRemoveItemRow = (index) => {
        setFormItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index, field, value) => {
        setFormItems(prev => {
            const updated = [...prev];
            const current = { ...updated[index], [field]: value };

            if (field === 'qty_kemasan') {
                const num = Number(value) || 0;
                if (current.sisa_kemasan && num > Number(current.sisa_kemasan)) {
                    toast.error(`Maksimal qty yang belum diterima dari SPB adalah ${current.sisa_kemasan} ${current.kemasan}`);
                    current.qty_kemasan = current.sisa_kemasan;
                }
            }

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

    const handleSubmitGRN = async (e) => {
        e.preventDefault();
        if (!formPOId) {
            toast.error('Wajib memilih Surat Pesanan (SPB / PO) yang telah disetujui.');
            return;
        }
        const validItems = formItems.filter(it => it.barang_id && Number(it.qty_kemasan) > 0);
        if (validItems.length === 0) {
            toast.error('Minimal ada 1 barang fisik yang diterima.');
            return;
        }

        // Pastikan qty tidak melebihi sisa pesanan
        for (const it of validItems) {
            if (it.sisa_kemasan && Number(it.qty_kemasan) > Number(it.sisa_kemasan)) {
                toast.error(`Qty terima untuk ${it.barang_nama} (${it.qty_kemasan}) melebihi sisa pesanan SPB (${it.sisa_kemasan} ${it.kemasan}).`);
                return;
            }
        }

        setSaving(true);
        try {
            await api.post('/gudang/penerimaan/', {
                tanggal: formDate,
                po_id: formPOId,
                vendor_id: formVendor.id,
                vendor_nama: formVendor.nama,
                no_faktur: (formNoFaktur || '').trim(),
                tgl_jatuh_tempo: formDueDate || null,
                metode_pembayaran: formMetode,
                tutup_po: formTutupPO,
                catatan: formCatatan,
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    po_item: it.po_item_id || null,
                    kemasan: it.kemasan,
                    isi: it.isi,
                    qty_kemasan: Number(it.qty_kemasan) || 1,
                    harga_kemasan: Number(it.harga_kemasan) || 0,
                    batch_no: it.batch_no || '',
                    exp_date: it.exp_date || null
                }))
            });
            toast.success('Penerimaan Barang (GRN) berhasil disimpan sebagai Draft.');
            setShowCreateModal(false);
            fetchGRNs();
            fetchApprovedPOs();
        } catch (err) {
            console.error('Create GRN failed', err);
            const msg = err.response?.data?.error || 'Gagal menyimpan Penerimaan Barang.';
            toast.error(String(msg));
        } finally {
            setSaving(false);
        }
    };

    const handleActionApprove = (grn) => {
        setConfirmAction({
            type: 'APPROVE',
            grn,
            title: 'Setujui Penerimaan Barang (GRN)',
            subtitle: 'Stok barang akan otomatis bertambah di buku besar gudang',
            message: `Apakah Anda yakin ingin menyetujui Penerimaan ${grn.nomor} dari ${grn.vendor_nama} senilai ${formatMoney(grn.total_nilai)}?\n\nSetelah disetujui:\n1. Stok barang otomatis BERTAMBAH di Buku Besar Gudang.\n2. Harga Pokok rata-rata (Moving Average) dihitung ulang secara otomatis.`,
            btnText: 'Setujui & Tambah Stok',
            btnColor: 'success',
            icon: <Check size={20} />
        });
    };

    const handleExecuteConfirmAction = async () => {
        if (!confirmAction || !confirmAction.grn) return;
        const { grn } = confirmAction;

        setConfirmSubmitting(true);
        try {
            await api.post(`/gudang/penerimaan/${grn.id}/approve/`);
            toast.success(`Penerimaan ${grn.nomor} berhasil DISETUJUI. Stok telah bertambah!`);
            setConfirmAction(null);
            fetchGRNs();
        } catch (err) {
            console.error('Approve GRN failed', err);
            const msg = err.response?.data?.error || 'Gagal menyetujui Penerimaan.';
            toast.error(String(msg));
        } finally {
            setConfirmSubmitting(false);
        }
    };

    const formatMoney = (val) => {
        return `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const heroActions = (
        <>
            <button type="button" className="gdg-btn-stripe secondary" onClick={fetchGRNs} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
            </button>
            <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                <Plus size={14} />
                <span>Input Penerimaan (GRN)</span>
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
                                placeholder="Cari nomor GRN, nomor faktur, vendor..."
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
                                <option value="DISETUJUI">Disetujui (Stok Bertambah)</option>
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
                        Menampilkan {grnList.length} dari {totalCount} GRN
                    </div>
                </div>

                {/* GRN TABLE */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th>No. GRN</th>
                                <th>Tanggal</th>
                                <th>No. Faktur</th>
                                <th>No. PO</th>
                                <th>Rekanan / Vendor</th>
                                <th style={{ textAlign: 'right' }}>Total Nilai</th>
                                <th>Metode Bayar</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="gdg-table-empty">
                                        Memuat daftar Penerimaan Barang...
                                    </td>
                                </tr>
                            ) : grnList.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="gdg-table-empty gdg-po-empty-cell">
                                        <div className="gdg-po-empty-box">
                                            <PackageCheck size={28} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                            <div className="gdg-po-empty-title">
                                                {searchQuery || statusFilter
                                                    ? 'Tidak ada Penerimaan Barang yang cocok dengan filter.'
                                                    : 'Belum ada transaksi Penerimaan Barang (GRN)'}
                                            </div>
                                            <p className="gdg-po-empty-desc">
                                                {searchQuery || statusFilter
                                                    ? 'Silakan periksa kembali kata kunci pencarian atau reset filter status.'
                                                    : 'Catat faktur & fisik barang masuk dari Surat Pesanan (PO) yang telah disetujui.'}
                                            </p>
                                            {!searchQuery && !statusFilter && (
                                                <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                                                    <Plus size={14} />
                                                    <span>Input Penerimaan Pertama</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                grnList.map((grn) => {
                                    const isDraft = grn.status === 'DRAFT';
                                    const isDisetujui = grn.status === 'DISETUJUI';
                                    const isBatal = grn.status === 'BATAL';
                                    const statusTone = isDisetujui ? 'emerald' : isBatal ? 'rose' : 'amber';

                                    return (
                                        <tr key={grn.id}>
                                            <td className="gdg-code-cell">{grn.nomor}</td>
                                            <td className="gdg-num-cell">{grn.tanggal}</td>
                                            <td className="gdg-code-cell" style={{ color: grn.no_faktur ? 'var(--gdg-text)' : 'var(--gdg-muted)' }}>
                                                {grn.no_faktur || '-'}
                                            </td>
                                            <td className="gdg-code-cell" style={{ color: grn.po_nomor ? '#635bff' : 'var(--gdg-muted)' }}>
                                                {grn.po_nomor || 'Langsung'}
                                            </td>
                                            <td>
                                                <div className="gdg-po-vendor-name">{grn.vendor_nama}</div>
                                            </td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {formatMoney(grn.total_nilai)}
                                            </td>
                                            <td className="gdg-po-meta-cell">{grn.metode_pembayaran}</td>
                                            <td>
                                                <span className={`gdg-status-text ${statusTone}`}>
                                                    <span className="gdg-status-dot" />
                                                    <span>{isDisetujui ? 'Disetujui (Stok Masuk)' : isBatal ? 'Dibatalkan' : 'Draft'}</span>
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="gdg-brg-row-actions">
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        onClick={() => { setSelectedGRN(grn); setShowDetailModal(true); }}
                                                        title="Lihat Detail Penerimaan"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {isDraft && (grn.can_approve || isSuper) && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn success"
                                                            onClick={() => handleActionApprove(grn)}
                                                            title="Setujui Penerimaan & Tambah Stok"
                                                        >
                                                            <Check size={14} />
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

            {/* MODAL INPUT PENERIMAAN (GRN) */}
            {showCreateModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Input Penerimaan Barang Masuk (GRN)</h3>
                                <p>Catat faktur &amp; fisik barang masuk rekanan, otomatis perbarui kartu stok buku besar gudang.</p>
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

                        <form onSubmit={handleSubmitGRN}>
                            <div className="gdg-modal-body">
                                <div className="gdg-form-group">
                                    <label>Surat Pesanan Barang (SPB / PO) *</label>
                                    <select
                                        value={formPOId}
                                        onChange={(e) => handleSelectPO(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Pilih Surat Pesanan (SPB) yang Telah Disetujui --</option>
                                        {approvedPOs.map((po) => (
                                            <option key={po.id} value={po.id}>
                                                {po.nomor} — {po.vendor_nama} (Tgl: {po.tanggal}) — {po.items?.length || 0} item belum diterima
                                            </option>
                                        ))}
                                    </select>
                                    {approvedPOs.length === 0 ? (
                                        <small className="gdg-grn-hint warn">
                                            * Belum ada Surat Pesanan (SPB) berstatus DISETUJUI yang memiliki sisa barang. Silakan ajukan dan setujui SPB di menu Surat Pesanan terlebih dahulu.
                                        </small>
                                    ) : (
                                        <small className="gdg-grn-hint">
                                            * Penerimaan hanya dapat diproses dari Surat Pesanan yang telah disetujui (Approved).
                                        </small>
                                    )}
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Tanggal Penerimaan Fisik *</label>
                                        </div>
                                        <DateField
                                            value={formDate}
                                            onChange={(newDate) => setFormDate(newDate)}
                                            placeholder="Pilih tanggal penerimaan..."
                                            className="gdg-date-field gdg-po-date-field"
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Rekanan / Vendor <span className="gdg-grn-label-muted">(Terkunci dari SPB)</span></label>
                                        </div>
                                        <input
                                            type="text"
                                            value={formVendor.nama || ''}
                                            placeholder="Otomatis terisi saat SPB dipilih..."
                                            readOnly
                                            className="gdg-po-readonly-input"
                                            style={{ cursor: 'not-allowed', fontWeight: formVendor.nama ? 600 : 400 }}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Nomor Faktur / Surat Jalan Rekanan <span className="gdg-grn-label-muted">(Opsional)</span></label>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Contoh: INV-2026/XI/0091 atau SJ/981"
                                            value={formNoFaktur}
                                            onChange={(e) => setFormNoFaktur(e.target.value)}
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Tanggal Jatuh Tempo Pembayaran</label>
                                        </div>
                                        <DateField
                                            value={formDueDate}
                                            onChange={(newDate) => setFormDueDate(newDate)}
                                            placeholder="Pilih tanggal jatuh tempo (opsional)..."
                                            className="gdg-date-field gdg-po-date-field"
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Metode Pembayaran</label>
                                        </div>
                                        <select
                                            value={formMetode}
                                            onChange={(e) => setFormMetode(e.target.value)}
                                        >
                                            <option value="Tunai">Tunai / Cash</option>
                                            <option value="Kredit">Kredit / Utang Usaha (Tempo)</option>
                                        </select>
                                    </div>
                                    <div className="gdg-form-group">
                                        <div className="gdg-form-label-row">
                                            <label>Catatan / Keterangan (Opsional)</label>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Misal: Titipan pengiriman tahap 1, kardus aman"
                                            value={formCatatan}
                                            onChange={(e) => setFormCatatan(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* ITEM LIST */}
                                <div className="gdg-detail-divider">
                                    <div className="gdg-po-items-head">
                                        <div>
                                            <span className="gdg-detail-section-title">
                                                Daftar Fisik Barang yang Diterima
                                            </span>
                                            {formPOId && (
                                                <small className="gdg-grn-hint">
                                                    Keluarkan baris jika item belum dikirim (mendukung pengiriman parsial/bertahap).
                                                </small>
                                            )}
                                        </div>
                                        {formPOId && (
                                            <button
                                                type="button"
                                                className="gdg-btn-stripe secondary"
                                                onClick={() => handleSelectPO(formPOId)}
                                                title="Muat ulang seluruh item asli dari SPB ini"
                                            >
                                                <RefreshCw size={13} />
                                                <span>Muat Ulang Item SPB</span>
                                            </button>
                                        )}
                                    </div>

                                    {!formPOId ? (
                                        <div className="gdg-grn-empty-box">
                                            <PackageCheck size={32} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                            <p className="gdg-po-empty-title" style={{ margin: 0 }}>
                                                Silakan pilih Surat Pesanan (SPB / PO) di atas
                                            </p>
                                            <small className="gdg-grn-hint">
                                                Daftar item pesanan beserta merk, kemasan, sisa pesanan, dan harga akan dimuat secara otomatis.
                                            </small>
                                        </div>
                                    ) : formItems.length === 0 ? (
                                        <div className="gdg-grn-empty-box">
                                            <p className="gdg-po-empty-title" style={{ margin: 0 }}>
                                                Semua baris item dikeluarkan dari pengiriman ini.
                                            </p>
                                            <button
                                                type="button"
                                                className="gdg-btn-stripe secondary"
                                                onClick={() => handleSelectPO(formPOId)}
                                            >
                                                <RefreshCw size={13} />
                                                <span>Muat Ulang Item SPB</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="gdg-po-items-list">
                                            {/* Column Headers for Items */}
                                            <div className="gdg-grn-item-grid gdg-po-item-header">
                                                <div>Barang</div>
                                                <div>Merk</div>
                                                <div>Kemasan</div>
                                                <div style={{ textAlign: 'center' }}>Sisa SPB</div>
                                                <div style={{ textAlign: 'center' }}>Qty Datang *</div>
                                                <div style={{ textAlign: 'right' }}>Harga / Kemasan *</div>
                                                <div style={{ textAlign: 'right' }}>Subtotal</div>
                                                <div></div>
                                            </div>

                                            {formItems.map((item, idx) => (
                                                <div key={idx} className="gdg-grn-item-grid gdg-item-row">
                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={`[${item.barang_kode}] ${item.barang_nama}`}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input gdg-po-readonly-input"
                                                            title={`[${item.barang_kode}] ${item.barang_nama}`}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={item.barang_merk || '-'}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input gdg-po-readonly-input"
                                                            title={`Merk: ${item.barang_merk || '-'}`}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={`${item.kemasan} (isi ${item.isi})`}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input gdg-po-readonly-input"
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0, textAlign: 'center' }}>
                                                        <span className="gdg-grn-sisa-text gdg-num-cell" title="Sisa barang yang belum diterima dari SPB">
                                                            {item.sisa_kemasan} {item.kemasan}
                                                        </span>
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={item.sisa_kemasan || undefined}
                                                            step="1"
                                                            value={item.qty_kemasan}
                                                            onChange={(e) => handleItemChange(idx, 'qty_kemasan', e.target.value)}
                                                            className="gdg-inline-input gdg-num-cell"
                                                            style={{ textAlign: 'center', fontWeight: 600 }}
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
                                                            style={{ textAlign: 'right', fontWeight: 600 }}
                                                            required
                                                            title="Harga per kemasan faktur (dapat disesuaikan jika berbeda dengan PO)"
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="gdg-po-subtotal-val gdg-num-cell">
                                                            {formatMoney(item.subtotal)}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn danger"
                                                            onClick={() => handleRemoveItemRow(idx)}
                                                            title="Keluarkan item ini jika belum dikirim pada pengiriman ini (Pengiriman Parsial)"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* GRAND TOTAL */}
                                    <div className="gdg-po-grand-total">
                                        <span className="gdg-po-grand-total-label">
                                            Total Nilai Penerimaan Fisik
                                        </span>
                                        <strong className="gdg-po-grand-total-value gdg-num-cell">
                                            {formatMoney(grandTotal)}
                                        </strong>
                                    </div>

                                    {/* OPSI PENYELESAIAN SPB */}
                                    {formPOId && (
                                        <div className="gdg-grn-checkbox-card">
                                            <input
                                                type="checkbox"
                                                id="tutup-po-checkbox"
                                                checked={formTutupPO}
                                                onChange={(e) => setFormTutupPO(e.target.checked)}
                                            />
                                            <label htmlFor="tutup-po-checkbox">
                                                Tandai Surat Pesanan (SPB) ini SELESAI / Final saat penerimaan disetujui
                                                <span>
                                                    (Sesuai SOP logistik: transaksi pesanan langsung ditutup, sisa barang yang tidak datang dianggap hangus/tidak ada susulan)
                                                </span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCreateModal(false)} disabled={saving}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn-stripe primary" disabled={saving || !formPOId || formItems.length === 0}>
                                    {saving ? 'Menyimpan...' : 'Simpan Penerimaan (Draft)'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL DETAIL GRN */}
            {showDetailModal && selectedGRN && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '860px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Penerimaan Barang: {selectedGRN.nomor}</h3>
                                <p>
                                    Vendor: <span className="gdg-po-detail-strong">{selectedGRN.vendor_nama}</span> · No. Faktur: {selectedGRN.no_faktur || '-'}
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
                            <div className="gdg-grn-detail-meta">
                                <div>
                                    <span className="gdg-po-confirm-label">Tanggal Terima</span>
                                    <div className="gdg-po-confirm-val gdg-num-cell">{selectedGRN.tanggal}</div>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Surat Pesanan (PO)</span>
                                    <div className="gdg-po-confirm-val gdg-code-cell" style={{ color: selectedGRN.po_nomor ? '#635bff' : 'var(--gdg-muted)' }}>
                                        {selectedGRN.po_nomor || 'Langsung'}
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Metode Bayar</span>
                                    <div className="gdg-po-confirm-val">{selectedGRN.metode_pembayaran}</div>
                                </div>
                            </div>

                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>Barang</th>
                                            <th>Merk</th>
                                            <th>Kemasan Masuk</th>
                                            <th>Total Masuk Fisik</th>
                                            <th style={{ textAlign: 'right' }}>Harga Faktur</th>
                                            <th style={{ textAlign: 'right' }}>Perbandingan SPB</th>
                                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedGRN.items || []).map((it) => {
                                            const hasPOPrice = it.po_harga_kemasan !== null && it.po_harga_kemasan !== undefined;
                                            const diff = Number(it.selisih_harga) || 0;
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
                                                    <td className="gdg-num-cell">
                                                        <span className="gdg-status-text emerald">
                                                            <span className="gdg-status-dot" />
                                                            <span>+{Number(it.qty_dasar)} {it.satuan_dasar_kode}</span>
                                                        </span>
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                        {formatMoney(it.harga_kemasan)}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {hasPOPrice ? (
                                                            diff === 0 ? (
                                                                <span className="gdg-status-text slate" title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    <span className="gdg-status-dot" />
                                                                    <span>Sesuai SPB</span>
                                                                </span>
                                                            ) : diff > 0 ? (
                                                                <span className="gdg-status-text amber" title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    <span className="gdg-status-dot" />
                                                                    <span>Naik +{formatMoney(diff)}</span>
                                                                </span>
                                                            ) : (
                                                                <span className="gdg-status-text emerald" title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    <span className="gdg-status-dot" />
                                                                    <span>Turun {formatMoney(diff)}</span>
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="gdg-po-meta-cell">-</span>
                                                        )}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                        {formatMoney(it.subtotal)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                onClick={() => setShowDetailModal(false)}
                            >
                                Tutup
                            </button>
                            {selectedGRN.status === 'DRAFT' && (selectedGRN.can_approve || isSuper) && (
                                <button
                                    type="button"
                                    className="gdg-btn-stripe success"
                                    onClick={() => {
                                        setShowDetailModal(false);
                                        handleActionApprove(selectedGRN);
                                    }}
                                >
                                    <Check size={14} />
                                    <span>Setujui Penerimaan &amp; Tambah Stok</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL KONFIRMASI APPROVE GRN */}
            {confirmAction && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => !confirmSubmitting && setConfirmAction(null)}>
                    <div className="gdg-modal gdg-po-modal-confirm" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>{confirmAction.title}</h3>
                                <p>{confirmAction.subtitle || `${confirmAction.grn.nomor} • ${confirmAction.grn.vendor_nama}`}</p>
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
                            <p className="gdg-po-confirm-msg" style={{ whiteSpace: 'pre-line' }}>
                                {confirmAction.message}
                            </p>

                            {/* Info Card Summary */}
                            <div className="gdg-po-confirm-card">
                                <div>
                                    <span className="gdg-po-confirm-label">Nomor GRN</span>
                                    <strong className="gdg-po-confirm-val gdg-code-cell">{confirmAction.grn.nomor}</strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Total Nilai Faktur</span>
                                    <strong className="gdg-po-confirm-val gdg-num-cell">{formatMoney(confirmAction.grn.total_nilai)}</strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">Rekanan / Vendor</span>
                                    <strong className="gdg-po-confirm-val gdg-po-ellipsis">
                                        {confirmAction.grn.vendor_nama}
                                    </strong>
                                </div>
                                <div>
                                    <span className="gdg-po-confirm-label">No. Surat Pesanan (PO)</span>
                                    <strong className="gdg-po-confirm-val gdg-code-cell">
                                        {confirmAction.grn.po_nomor || 'Langsung'}
                                    </strong>
                                </div>
                            </div>
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
                                className="gdg-btn-stripe success"
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

