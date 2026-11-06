import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Eye,
    CheckCircle2,
    FileCheck2,
    Building2,
    Calendar,
    ReceiptText,
    Trash2,
    X,
    FileSpreadsheet,
    Check,
    PackageCheck
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';

export default function GudangPenerimaan() {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gdg-card">
                <div className="gdg-card-head">
                    <div className="gdg-card-title">
                        <h2>Penerimaan Barang Masuk (GRN)</h2>
                        <p>Catat faktur & fisik barang masuk rekanan, otomatis perbarui stok & kartu stok buku besar (independen gudang)</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="gdg-btn soft" onClick={fetchGRNs} disabled={loading}>
                            <RefreshCw size={15} /> Refresh
                        </button>
                        <button className="gdg-btn primary" onClick={handleOpenCreate}>
                            <Plus size={16} /> Input Penerimaan (GRN)
                        </button>
                    </div>
                </div>

                {/* FILTER TOOLBAR */}
                <div className="gdg-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="gdg-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Cari nomor GRN, nomor faktur, vendor..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                        />
                    </div>

                    <select
                        className="gdg-select-control"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ minWidth: '220px' }}
                    >
                        <option value="">Semua Status ({totalCount})</option>
                        <option value="DRAFT">Draft</option>
                        <option value="DISETUJUI">Disetujui (Stok Bertambah)</option>
                        <option value="BATAL">Dibatalkan</option>
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
                            title="Reset pencarian dan filter"
                        >
                            <X size={14} /> Reset
                        </button>
                    )}
                </div>

                {/* GRN TABLE */}
                <div className="gdg-table-wrap">
                    <table className="gdg-table">
                        <thead>
                            <tr>
                                <th>No. GRN</th>
                                <th>Tanggal</th>
                                <th>No. Faktur</th>
                                <th>No. PO</th>
                                <th>Rekanan / Vendor</th>
                                <th>Total Nilai</th>
                                <th>Metode Bayar</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                        Memuat daftar Penerimaan Barang...
                                    </td>
                                </tr>
                            ) : grnList.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                        Belum ada transaksi Penerimaan Barang (GRN).
                                    </td>
                                </tr>
                            ) : (
                                grnList.map((grn) => {
                                    const isDraft = grn.status === 'DRAFT';
                                    const isDisetujui = grn.status === 'DISETUJUI';

                                    return (
                                        <tr key={grn.id}>
                                            <td style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                                                {grn.nomor}
                                            </td>
                                            <td>{grn.tanggal}</td>
                                            <td style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
                                                {grn.no_faktur || '-'}
                                            </td>
                                            <td style={{ color: grn.po_nomor ? '#38bdf8' : '#64748b' }}>
                                                {grn.po_nomor || 'Langsung'}
                                            </td>
                                            <td>
                                                <strong style={{ color: '#f8fafc' }}>{grn.vendor_nama}</strong>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{formatMoney(grn.total_nilai)}</td>
                                            <td>
                                                <span className={`gdg-badge ${grn.metode_pembayaran === 'Kredit' ? 'blue' : 'slate'}`}>
                                                    {grn.metode_pembayaran}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`gdg-badge ${isDisetujui ? 'emerald' : 'amber'}`}>
                                                    {isDisetujui ? 'Disetujui (Stok Masuk)' : 'Draft'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                                    <button
                                                        type="button"
                                                        className="gdg-action-btn view"
                                                        onClick={() => { setSelectedGRN(grn); setShowDetailModal(true); }}
                                                        title="Lihat Detail Penerimaan"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {isDraft && (grn.can_approve || isSuper) && (
                                                        <button
                                                            type="button"
                                                            className="gdg-action-btn success"
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
                <div style={{ marginTop: '16px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalCount}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </div>

            {/* MODAL INPUT PENERIMAAN (GRN) */}
            {showCreateModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '940px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                    <ReceiptText size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Input Penerimaan Barang Masuk (GRN)</h3>
                                    <p>Catat faktur & fisik barang masuk rekanan, otomatis perbarui kartu stok buku besar gudang.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
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
                                        className="gdg-select-control"
                                        style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: formPOId ? 600 : 400 }}
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
                                        <small style={{ color: '#f59e0b', marginTop: '4px', display: 'block' }}>
                                            * Belum ada Surat Pesanan (SPB) berstatus DISETUJUI yang memiliki sisa barang. Silakan ajukan dan setujui SPB di menu Surat Pesanan terlebih dahulu.
                                        </small>
                                    ) : (
                                        <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>
                                            * Penerimaan hanya dapat diproses dari Surat Pesanan yang telah disetujui (Approved).
                                        </small>
                                    )}
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Tanggal Penerimaan Fisik *</label>
                                        <DateField
                                            value={formDate}
                                            onChange={(newDate) => setFormDate(newDate)}
                                            placeholder="Pilih tanggal penerimaan..."
                                            className="gdg-date-field"
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Rekanan / Vendor <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Terkunci dari SPB)</span></label>
                                        <input
                                            type="text"
                                            value={formVendor.nama || ''}
                                            placeholder="Otomatis terisi saat SPB dipilih..."
                                            readOnly
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.04)',
                                                cursor: 'not-allowed',
                                                color: formVendor.nama ? 'inherit' : '#64748b',
                                                fontWeight: formVendor.nama ? 600 : 400
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Nomor Faktur / Surat Jalan Rekanan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Opsional)</span></label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: INV-2026/XI/0091 atau SJ/981"
                                            value={formNoFaktur}
                                            onChange={(e) => setFormNoFaktur(e.target.value)}
                                        />
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Tanggal Jatuh Tempo Pembayaran</label>
                                        <DateField
                                            value={formDueDate}
                                            onChange={(newDate) => setFormDueDate(newDate)}
                                            placeholder="Pilih tanggal jatuh tempo (opsional)..."
                                            className="gdg-date-field"
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Metode Pembayaran</label>
                                        <select
                                            value={formMetode}
                                            onChange={(e) => setFormMetode(e.target.value)}
                                            className="gdg-select-control"
                                            style={{ width: '100%', height: '40px', borderRadius: '8px' }}
                                        >
                                            <option value="Tunai">Tunai / Cash</option>
                                            <option value="Kredit">Kredit / Utang Usaha (Tempo)</option>
                                        </select>
                                    </div>
                                    <div className="gdg-form-group">
                                        <label>Catatan / Keterangan (Opsional)</label>
                                        <input
                                            type="text"
                                            placeholder="Misal: Titipan pengiriman tahap 1, kardus aman"
                                            value={formCatatan}
                                            onChange={(e) => setFormCatatan(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* ITEM LIST */}
                                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>
                                                Daftar Fisik Barang yang Diterima
                                            </span>
                                            {formPOId && (
                                                <small style={{ display: 'block', color: '#64748b', marginTop: '2px' }}>
                                                    Keluarkan baris jika item belum dikirim (mendukung pengiriman parsial/bertahap).
                                                </small>
                                            )}
                                        </div>
                                        {formPOId && (
                                            <button
                                                type="button"
                                                className="gdg-btn soft"
                                                style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                                                onClick={() => handleSelectPO(formPOId)}
                                                title="Muat ulang seluruh item asli dari SPB ini"
                                            >
                                                <RefreshCw size={13} /> Muat Ulang Item SPB
                                            </button>
                                        )}
                                    </div>

                                    {!formPOId ? (
                                        <div style={{
                                            padding: '36px 20px',
                                            textAlign: 'center',
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px dashed rgba(255, 255, 255, 0.12)',
                                            borderRadius: '10px',
                                            color: '#94a3b8'
                                        }}>
                                            <PackageCheck size={40} style={{ margin: '0 auto 10px', opacity: 0.6, color: '#38bdf8' }} />
                                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#cbd5e1' }}>
                                                Silakan pilih Surat Pesanan (SPB / PO) di atas
                                            </p>
                                            <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>
                                                Daftar item pesanan beserta merk, kemasan, sisa pesanan, dan harga akan dimuat secara otomatis.
                                            </small>
                                        </div>
                                    ) : formItems.length === 0 ? (
                                        <div style={{
                                            padding: '32px 20px',
                                            textAlign: 'center',
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px dashed rgba(255, 255, 255, 0.12)',
                                            borderRadius: '10px',
                                            color: '#94a3b8'
                                        }}>
                                            <p style={{ margin: 0, fontWeight: 500, fontSize: '0.92rem', color: '#cbd5e1' }}>
                                                Semua baris item dikeluarkan dari pengiriman ini.
                                            </p>
                                            <button
                                                type="button"
                                                className="gdg-btn soft"
                                                style={{ marginTop: '10px', padding: '6px 14px', fontSize: '0.8rem' }}
                                                onClick={() => handleSelectPO(formPOId)}
                                            >
                                                <RefreshCw size={13} /> Muat Ulang Item SPB
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {/* Column Headers for Items */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '2.5fr 1.2fr 1.1fr 1fr 1fr 1.2fr 1.3fr 36px',
                                                gap: '10px',
                                                padding: '0 2px 4px 2px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                color: '#94a3b8'
                                            }}>
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
                                                <div key={idx} className="gdg-item-row" style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '2.5fr 1.2fr 1.1fr 1fr 1fr 1.2fr 1.3fr 36px',
                                                    gap: '10px',
                                                    alignItems: 'center'
                                                }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={`[${item.barang_kode}] ${item.barang_nama}`}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input"
                                                            style={{ width: '100%', height: '40px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)', fontWeight: 500 }}
                                                            title={`[${item.barang_kode}] ${item.barang_nama}`}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={item.barang_merk || '-'}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input"
                                                            style={{ width: '100%', height: '40px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)', color: item.barang_merk ? 'inherit' : '#64748b' }}
                                                            title={`Merk: ${item.barang_merk || '-'}`}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <input
                                                            type="text"
                                                            value={`${item.kemasan} (isi ${item.isi})`}
                                                            readOnly
                                                            tabIndex={-1}
                                                            className="gdg-inline-input"
                                                            style={{ width: '100%', height: '40px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.04)' }}
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                                                        <span className="gdg-badge blue" style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px' }} title="Sisa barang yang belum diterima dari SPB">
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
                                                            className="gdg-inline-input"
                                                            style={{ width: '100%', height: '40px', borderRadius: '8px', textAlign: 'center', fontWeight: 700 }}
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
                                                            className="gdg-inline-input"
                                                            style={{ width: '100%', height: '40px', borderRadius: '8px', textAlign: 'right', fontWeight: 600 }}
                                                            required
                                                            title="Harga per kemasan faktur (dapat disesuaikan jika berbeda dengan PO)"
                                                        />
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="gdg-subtotal-val" style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', fontWeight: 600 }}>
                                                            {formatMoney(item.subtotal)}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        <button
                                                            type="button"
                                                            className="gdg-btn soft"
                                                            style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center', color: '#f43f5e' }}
                                                            onClick={() => handleRemoveItemRow(idx)}
                                                            title="Keluarkan item ini jika belum dikirim pada pengiriman ini (Pengiriman Parsial)"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* GRAND TOTAL */}
                                    <div style={{
                                        marginTop: '16px',
                                        padding: '14px 20px',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                                            Total Nilai Penerimaan Fisik:
                                        </span>
                                        <strong style={{ fontSize: '1.25rem', color: '#34d399' }}>
                                            {formatMoney(grandTotal)}
                                        </strong>
                                    </div>

                                    {/* OPSI PENYELESAIAN SPB */}
                                    {formPOId && (
                                        <div style={{
                                            marginTop: '14px',
                                            padding: '12px 16px',
                                            background: 'rgba(56, 189, 248, 0.06)',
                                            border: '1px solid rgba(56, 189, 248, 0.25)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}>
                                            <input
                                                type="checkbox"
                                                id="tutup-po-checkbox"
                                                checked={formTutupPO}
                                                onChange={(e) => setFormTutupPO(e.target.checked)}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#38bdf8', flexShrink: 0 }}
                                            />
                                            <label htmlFor="tutup-po-checkbox" style={{ margin: 0, cursor: 'pointer', fontSize: '0.88rem', color: '#f8fafc', fontWeight: 600 }}>
                                                Tandai Surat Pesanan (SPB) ini SELESAI / Final saat penerimaan disetujui
                                                <span style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 400, marginTop: '2px' }}>
                                                    (Sesuai SOP logistik: transaksi pesanan langsung ditutup, sisa barang yang tidak datang dianggap hangus/tidak ada susulan)
                                                </span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button type="button" className="gdg-btn soft" onClick={() => setShowCreateModal(false)} disabled={saving}>
                                    Batal
                                </button>
                                <button type="submit" className="gdg-btn primary" disabled={saving || !formPOId || formItems.length === 0}>
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
                    <div className="gdg-modal" style={{ maxWidth: '840px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                    <ReceiptText size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>Penerimaan Barang: {selectedGRN.nomor}</h3>
                                    <p>Vendor: <strong>{selectedGRN.vendor_nama}</strong> | No. Faktur: {selectedGRN.no_faktur || '-'}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowDetailModal(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Tanggal Terima</span>
                                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{selectedGRN.tanggal}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Surat Pesanan (PO)</span>
                                    <div style={{ fontWeight: 600, color: selectedGRN.po_nomor ? '#38bdf8' : '#cbd5e1' }}>
                                        {selectedGRN.po_nomor || 'Langsung'}
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Metode Bayar</span>
                                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{selectedGRN.metode_pembayaran}</div>
                                </div>
                            </div>

                            <div className="gdg-table-wrap">
                                <table className="gdg-table">
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
                                                        <strong>{it.barang_nama}</strong>
                                                        <small style={{ display: 'block', color: '#64748b' }}>{it.barang_kode}</small>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: it.barang_merk ? 'inherit' : '#64748b', fontSize: '0.85rem' }}>
                                                            {it.barang_merk || '-'}
                                                        </span>
                                                    </td>
                                                    <td>{Number(it.qty_kemasan)} {it.kemasan}</td>
                                                    <td>
                                                        <span className="gdg-badge emerald">
                                                            +{Number(it.qty_dasar)} {it.satuan_dasar_kode}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(it.harga_kemasan)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {hasPOPrice ? (
                                                            diff === 0 ? (
                                                                <span className="gdg-badge slate" style={{ fontSize: '0.75rem' }} title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    Sesuai SPB ({formatMoney(it.po_harga_kemasan)})
                                                                </span>
                                                            ) : diff > 0 ? (
                                                                <span className="gdg-badge amber" style={{ fontSize: '0.75rem' }} title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    Naik +{formatMoney(diff)}
                                                                </span>
                                                            ) : (
                                                                <span className="gdg-badge emerald" style={{ fontSize: '0.75rem' }} title={`Harga SPB: ${formatMoney(it.po_harga_kemasan)}`}>
                                                                    Turun {formatMoney(diff)}
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>-</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(it.subtotal)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="gdg-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                onClick={() => setShowDetailModal(false)}
                            >
                                Tutup
                            </button>
                            {selectedGRN.status === 'DRAFT' && (selectedGRN.can_approve || isSuper) && (
                                <button
                                    type="button"
                                    className="gdg-btn success"
                                    onClick={() => {
                                        setShowDetailModal(false);
                                        handleActionApprove(selectedGRN);
                                    }}
                                >
                                    <Check size={15} /> Setujui Penerimaan & Tambah Stok
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
                                    <p>{confirmAction.subtitle || `${confirmAction.grn.nomor} • ${confirmAction.grn.vendor_nama}`}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setConfirmAction(null)}
                                disabled={confirmSubmitting}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.5', color: 'var(--text-secondary, #cbd5e1)', whiteSpace: 'pre-line' }}>
                                {confirmAction.message}
                            </p>

                            {/* Info Card Summary */}
                            <div style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '10px',
                                fontSize: '0.84rem'
                            }}>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>Nomor GRN</span>
                                    <strong style={{ color: '#38bdf8' }}>{confirmAction.grn.nomor}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>Total Nilai Faktur</span>
                                    <strong style={{ color: '#34d399' }}>{formatMoney(confirmAction.grn.total_nilai)}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>Rekanan / Vendor</span>
                                    <strong style={{ color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                        {confirmAction.grn.vendor_nama}
                                    </strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>No. Surat Pesanan (PO)</span>
                                    <strong style={{ color: confirmAction.grn.po_nomor ? '#38bdf8' : '#94a3b8' }}>
                                        {confirmAction.grn.po_nomor || 'Langsung'}
                                    </strong>
                                </div>
                            </div>
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
                                className="gdg-btn success"
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

