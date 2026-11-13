import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Plus,
    Search,
    RefreshCw,
    CheckCircle2,
    Eye,
    Printer,
    X,
    Layers,
    ChevronDown
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';

export default function GudangOpname({ heroActionsTarget = null }) {
    const toast = useToast();

    const [opnameList, setOpnameList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [jenisFilter, setJenisFilter] = useState('');

    // Master Barang for dropdown
    const [barangList, setBarangList] = useState([]);

    // Options for SearchableSelect
    const barangOptions = useMemo(() => {
        return (barangList || []).map((b) => {
            const stokNum = Number(b.stok_saat_ini || 0);
            return {
                value: String(b.id),
                label: b.kode ? `[${b.kode}] ${b.nama}` : b.nama,
                subtext: [
                    b.kode,
                    b.kategori || '',
                    b.satuan_dasar?.kode ? `Satuan: ${b.satuan_dasar.kode}` : '',
                    `Stok Sistem: ${stokNum.toLocaleString('id-ID')}`
                ].filter(Boolean).join(' • '),
                tag: b.satuan_dasar?.kode || undefined,
            };
        });
    }, [barangList]);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedOpname, setSelectedOpname] = useState(null);
    const [saving, setSaving] = useState(false);
    const [loadingTemplate, setLoadingTemplate] = useState(false);

    // Form states
    const [formJenis, setFormJenis] = useState('SALDO_AWAL'); // 'SALDO_AWAL' | 'RUTIN'
    const [formTanggal, setFormTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [formCatatan, setFormCatatan] = useState('');
    const [formItems, setFormItems] = useState([]);

    const fetchBarangList = async () => {
        try {
            const res = await api.get('/gudang/barang/?page_size=1000');
            setBarangList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to load barang', err);
        }
    };

    const fetchOpnames = async () => {
        setLoading(true);
        try {
            let url = `/gudang/opname/?page=${page}&page_size=${pageSize}`;
            if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
            if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
            if (jenisFilter) url += `&jenis=${encodeURIComponent(jenisFilter)}`;

            const res = await api.get(url);
            setOpnameList(res.data?.results || []);
            setTotalCount(res.data?.count || 0);
        } catch (err) {
            toast.error('Gagal memuat daftar dokumen opname.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBarangList();
    }, []);

    useEffect(() => {
        fetchOpnames();
    }, [page, searchQuery, statusFilter, jenisFilter]);

    const formatRp = (val) =>
        `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const formatQty = (val) =>
        Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    // Open Create Modal
    const handleOpenCreate = () => {
        setFormJenis('RUTIN');
        setFormTanggal(new Date().toISOString().slice(0, 10));
        setFormCatatan('');
        setFormItems([
            {
                barang_id: '',
                barang_kode: '',
                barang_nama: '',
                qty_sistem: 0,
                qty_fisik: 0,
                selisih: 0,
                satuan: 'PCS',
                harga_unit: 0,
                keterangan: ''
            }
        ]);
        setShowCreateModal(true);
    };

    // Load template of all active items with current system stock
    const handleLoadTemplate = async () => {
        setLoadingTemplate(true);
        try {
            const res = await api.get('/gudang/opname/current_stock_template/');
            const items = res.data || [];
            if (!items.length) {
                toast.info('Belum ada katalog barang aktif yang terdaftar. Tambah barang terlebih dahulu di Master Barang.');
                return;
            }

            const mapped = items.map(it => {
                const qtySistem = Number(it.qty_sistem) || 0;
                const qtyFisik = formJenis === 'SALDO_AWAL' ? 0 : qtySistem;
                const selisih = formJenis === 'SALDO_AWAL' ? qtyFisik : (qtyFisik - qtySistem);
                const hargaUnit = Number(it.harga_unit) || 0;
                return {
                    barang_id: it.barang_id,
                    barang_kode: it.barang_kode,
                    barang_nama: it.barang_nama,
                    qty_sistem: qtySistem,
                    qty_fisik: qtyFisik,
                    selisih: selisih,
                    satuan: it.satuan,
                    harga_unit: hargaUnit,
                    keterangan: ''
                };
            });

            setFormItems(mapped);
            toast.success(`Berhasil memuat ${mapped.length} barang dari katalog.`);
        } catch (err) {
            toast.error('Gagal memuat template barang.');
        } finally {
            setLoadingTemplate(false);
        }
    };

    // Handle Item Row Changes
    const handleItemChange = (idx, field, value) => {
        const next = [...formItems];
        next[idx][field] = value;

        if (field === 'barang_id') {
            const b = barangList.find(x => String(x.id) === String(value));
            if (b) {
                next[idx].barang_kode = b.kode;
                next[idx].barang_nama = b.nama;
                next[idx].satuan = b.satuan_dasar?.kode || 'PCS';
                next[idx].harga_unit = Number(b.nilai_rata_rata) || 0;
                next[idx].qty_sistem = Number(b.stok_saat_ini) || 0;
                next[idx].qty_fisik = formJenis === 'SALDO_AWAL' ? 0 : next[idx].qty_sistem;
            } else {
                next[idx].barang_kode = '';
                next[idx].barang_nama = '';
                next[idx].satuan = 'PCS';
                next[idx].harga_unit = 0;
                next[idx].qty_sistem = 0;
                next[idx].qty_fisik = 0;
            }
        }

        const qSistem = Number(next[idx].qty_sistem) || 0;
        const qFisik = Number(next[idx].qty_fisik) || 0;

        next[idx].selisih = formJenis === 'SALDO_AWAL' ? qFisik : (qFisik - qSistem);

        setFormItems(next);
    };

    const handleAddItemRow = () => {
        setFormItems([
            ...formItems,
            { barang_id: '', barang_kode: '', barang_nama: '', qty_sistem: 0, qty_fisik: 0, selisih: 0, satuan: 'PCS', harga_unit: 0, keterangan: '' }
        ]);
    };

    const handleRemoveItemRow = (idx) => {
        if (formItems.length === 1) return;
        setFormItems(formItems.filter((_, i) => i !== idx));
    };

    // Calculate totals
    const totalQtyFisik = formItems.reduce((acc, it) => acc + (Number(it.qty_fisik) || 0), 0);
    const totalSelisihQty = formItems.reduce((acc, it) => acc + (Number(it.selisih) || 0), 0);

    // Submit Create
    const handleSubmitOpname = async (autoApprove = false) => {
        const validItems = formItems.filter(it => it.barang_id);
        if (!validItems.length) {
            toast.error('Pilih minimal satu barang.');
            return;
        }

        setSaving(true);
        try {
            await api.post('/gudang/opname/', {
                tanggal: formTanggal,
                jenis: formJenis,
                catatan: formCatatan,
                auto_approve: autoApprove,
                items: validItems.map(it => ({
                    barang: it.barang_id,
                    qty_fisik: it.qty_fisik,
                    satuan: it.satuan,
                    harga_unit: it.harga_unit,
                    keterangan: it.keterangan
                }))
            });

            setShowCreateModal(false);
            toast.success(autoApprove ? 'Saldo stok berhasil disetujui & diterapkan ke buku besar.' : 'Draft opname berhasil disimpan.');
            fetchOpnames();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Gagal menyimpan opname.');
        } finally {
            setSaving(false);
        }
    };

    // Approve Opname
    const handleApproveOpname = async (opn) => {
        const textConfirm = opn.jenis === 'SALDO_AWAL'
            ? `Setujui Saldo Awal ${opn.nomor}? Semua kuantitas fisik akan dicatat sebagai saldo awal resmi di buku besar.`
            : `Setujui Penyesuaian Opname ${opn.nomor}? Selisih fisik akan memicu jurnal penyesuaian (ADJ_IN / ADJ_OUT).`;

        if (!window.confirm(textConfirm)) return;

        try {
            await api.post(`/gudang/opname/${opn.id}/approve/`, {});
            toast.success(`Dokumen ${opn.nomor} telah disetujui & diterapkan ke stok.`);
            fetchOpnames();
            setShowDetailModal(false);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    // Print Count Sheet
    const handlePrintSheet = (opn) => {
        const printWindow = window.open('', '_blank');
        const content = `
            <html>
                <head>
                    <title>Lembar Hitung Fisik Stock Opname - ${opn.nomor}</title>
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
                        <p style="margin: 3px 0 0 0; font-size: 12px;">Gudang Logistik Umum - Berita Acara Hitung Fisik (Stock Opname)</p>
                    </div>
                    <div class="info-grid">
                        <div>
                            <strong>Nomor Dokumen:</strong> ${opn.nomor}<br/>
                            <strong>Tanggal Opname:</strong> ${opn.tanggal}<br/>
                            <strong>Jenis:</strong> ${opn.jenis === 'SALDO_AWAL' ? 'Saldo Awal Cut-Over' : 'Opname Rutin Fisik'}
                        </div>
                        <div>
                            <strong>Gudang:</strong> ${opn.gudang_nama || 'Gudang Logistik Umum'}<br/>
                            <strong>Status:</strong> ${opn.status}<br/>
                            <strong>Catatan:</strong> ${opn.catatan || '-'}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>Kode</th>
                                <th>Nama Barang</th>
                                <th>Satuan</th>
                                <th style="text-align: right;">Qty Sistem</th>
                                <th style="text-align: right;">Qty Fisik</th>
                                <th style="text-align: right;">Selisih</th>
                                <th>Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(opn.items || []).map((it, idx) => `
                                <tr>
                                    <td align="center">${idx + 1}</td>
                                    <td>${it.barang_kode}</td>
                                    <td>${it.barang_nama}</td>
                                    <td align="center">${it.satuan}</td>
                                    <td align="right">${Number(it.qty_sistem).toLocaleString('id-ID')}</td>
                                    <td align="right"><strong>${Number(it.qty_fisik).toLocaleString('id-ID')}</strong></td>
                                    <td align="right">${Number(it.selisih) > 0 ? '+' : ''}${Number(it.selisih).toLocaleString('id-ID')}</td>
                                    <td>${it.keterangan || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="sign-grid">
                        <div>
                            <p>Petugas Penghitung Fisik,</p>
                            <br/><br/><br/>
                            <p>( .................................................... )</p>
                        </div>
                        <div>
                            <p>Kepala Seksi Logistik / Saksi,</p>
                            <br/><br/><br/>
                            <p>( ${opn.approved_by_nama || '....................................................'} )</p>
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

    const heroActions = (
        <>
            <button type="button" className="gdg-btn-stripe secondary" onClick={fetchOpnames} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
            </button>
            <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                <Plus size={14} />
                <span>Input Opname / Saldo Awal</span>
            </button>
        </>
    );

    return (
        <div className="gdg-dash-root">
            {heroActionsTarget
                ? createPortal(heroActions, heroActionsTarget)
                : <div className="gdg-brg-fallback-actions">{heroActions}</div>}

            <section className="gdg-dash-section">
                {/* TOOLBAR */}
                <div className="gdg-brg-toolbar">
                    <div className="gdg-brg-toolbar-left">
                        <div className="gdg-dash-search">
                            <Search size={14} className="gdg-dash-search-icon" />
                            <input
                                type="text"
                                placeholder="Cari nomor opname, catatan..."
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
                                <option value="">Semua Status</option>
                                <option value="DRAFT">Draft</option>
                                <option value="DISETUJUI">Disetujui (Stok Diterapkan)</option>
                                <option value="BATAL">Batal</option>
                            </select>
                            <ChevronDown size={14} className="gdg-ks-select-chevron" />
                        </div>

                        <div className="gdg-ks-select-wrap">
                            <select
                                value={jenisFilter}
                                onChange={(e) => {
                                    setJenisFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="gdg-ks-select gdg-brg-select"
                            >
                                <option value="">Semua Jenis Dokumen</option>
                                <option value="SALDO_AWAL">Saldo Awal Cut-Over</option>
                                <option value="RUTIN">Opname Rutin / Fisik</option>
                            </select>
                            <ChevronDown size={14} className="gdg-ks-select-chevron" />
                        </div>

                        {(searchQuery || statusFilter || jenisFilter) && (
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                onClick={() => {
                                    setSearchQuery('');
                                    setStatusFilter('');
                                    setJenisFilter('');
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
                        Menampilkan {opnameList.length} dari {totalCount} dokumen
                    </div>
                </div>

                {/* TABLE */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th>No. Opname</th>
                                <th>Tanggal</th>
                                <th>Jenis Dokumen</th>
                                <th>Jumlah Barang</th>
                                <th style={{ textAlign: 'right' }}>Total Fisik</th>
                                <th>Total Selisih</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty">
                                        Memuat dokumen opname...
                                    </td>
                                </tr>
                            ) : opnameList.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty gdg-po-empty-cell">
                                        <div className="gdg-po-empty-box">
                                            <Layers size={28} strokeWidth={1.6} className="gdg-po-empty-icon" />
                                            <div className="gdg-po-empty-title">
                                                Belum ada dokumen opname atau saldo awal
                                            </div>
                                            <p className="gdg-po-empty-desc">
                                                Catat hasil hitung fisik stok gudang atau tetapkan saldo awal resmi persediaan.
                                            </p>
                                            <button type="button" className="gdg-btn-stripe primary" onClick={handleOpenCreate}>
                                                <Plus size={14} />
                                                <span>Input Opname / Saldo Awal</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                opnameList.map(opn => {
                                    const totalFisik = (opn.items || []).reduce((acc, it) => acc + Number(it.qty_fisik || 0), 0);
                                    const statusTone = opn.status === 'DISETUJUI' ? 'emerald' : opn.status === 'BATAL' ? 'rose' : 'slate';
                                    const selisihVal = Number(opn.total_selisih_qty);

                                    return (
                                        <tr key={opn.id}>
                                            <td className="gdg-code-cell">{opn.nomor}</td>
                                            <td className="gdg-num-cell">{opn.tanggal}</td>
                                            <td>
                                                <span className={`gdg-status-text ${opn.jenis === 'SALDO_AWAL' ? 'emerald' : 'indigo'}`}>
                                                    <span className="gdg-status-dot" />
                                                    <span>{opn.jenis === 'SALDO_AWAL' ? 'Saldo Awal Cut-Over' : 'Opname Rutin'}</span>
                                                </span>
                                            </td>
                                            <td className="gdg-num-cell">{(opn.items || []).length} barang</td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {formatQty(totalFisik)}
                                            </td>
                                            <td className="gdg-num-cell">
                                                {opn.jenis === 'SALDO_AWAL' ? (
                                                    <span className="gdg-status-text slate">
                                                        <span className="gdg-status-dot" />
                                                        <span>Saldo Awal</span>
                                                    </span>
                                                ) : selisihVal === 0 ? (
                                                    <span className="gdg-status-text emerald">
                                                        <span className="gdg-status-dot" />
                                                        <span>0 (Cocok)</span>
                                                    </span>
                                                ) : selisihVal > 0 ? (
                                                    <span className="gdg-status-text indigo">
                                                        <span className="gdg-status-dot" />
                                                        <span>+{formatQty(opn.total_selisih_qty)}</span>
                                                    </span>
                                                ) : (
                                                    <span className="gdg-status-text rose">
                                                        <span className="gdg-status-dot" />
                                                        <span>{formatQty(opn.total_selisih_qty)}</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`gdg-status-text ${statusTone}`}>
                                                    <span className="gdg-status-dot" />
                                                    <span>{opn.status}</span>
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="gdg-brg-row-actions">
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        title="Lihat Detail Opname"
                                                        onClick={() => { setSelectedOpname(opn); setShowDetailModal(true); }}
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="gdg-brg-icon-btn"
                                                        title="Cetak Berita Acara / Lembar Opname"
                                                        onClick={() => handlePrintSheet(opn)}
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    {opn.can_approve && (
                                                        <button
                                                            type="button"
                                                            className="gdg-brg-icon-btn success"
                                                            title="Setujui & Terapkan Saldo Stok"
                                                            onClick={() => handleApproveOpname(opn)}
                                                        >
                                                            <CheckCircle2 size={14} />
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
                    totalPages={Math.ceil(totalCount / pageSize)}
                    onPageChange={setPage}
                    total={totalCount}
                    totalCount={totalCount}
                    pageSize={pageSize}
                />
            </section>

            {/* MODAL: INPUT OPNAME */}
            {showCreateModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Input Stock Opname &amp; Saldo Awal Fisik</h3>
                                <p>Pencatatan hitung fisik riil di gudang logistik dan penetapan selisih stok</p>
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
                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="gdg-form-row">
                                <div className="gdg-form-group">
                                    <div className="gdg-form-label-row">
                                        <label>Jenis Dokumen Opname</label>
                                    </div>
                                    <select
                                        value={formJenis}
                                        onChange={(e) => {
                                            const nextJenis = e.target.value;
                                            setFormJenis(nextJenis);
                                            setFormItems(prev => prev.map(it => {
                                                const qS = Number(it.qty_sistem) || 0;
                                                const qF = Number(it.qty_fisik) || 0;
                                                return {
                                                    ...it,
                                                    selisih: nextJenis === 'SALDO_AWAL' ? qF : (qF - qS)
                                                };
                                            }));
                                        }}
                                    >
                                        <option value="RUTIN">Stock Opname Fisik Berkala / Rutin</option>
                                        <option value="SALDO_AWAL">Saldo Awal Resmi (Cut-Over Go-Live)</option>
                                    </select>
                                </div>
                                <div className="gdg-form-group">
                                    <div className="gdg-form-label-row">
                                        <label>Tanggal Hitung Fisik *</label>
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
                                <input
                                    type="text"
                                    placeholder="Contoh: Opname fisik berkala persediaan gudang umum"
                                    value={formCatatan}
                                    onChange={(e) => setFormCatatan(e.target.value)}
                                />
                            </div>

                            {/* ITEM LIST */}
                            <div className="gdg-detail-divider">
                                <div className="gdg-po-items-head">
                                    <span className="gdg-detail-section-title">
                                        Daftar Hasil Hitung Fisik ({formItems.length} barang)
                                    </span>
                                    <div className="gdg-po-foot-group">
                                        <button type="button" className="gdg-btn-stripe secondary" onClick={handleLoadTemplate} disabled={loadingTemplate}>
                                            <Layers size={14} />
                                            <span>{loadingTemplate ? 'Memuat...' : 'Muat Semua Katalog Barang'}</span>
                                        </button>
                                        <button type="button" className="gdg-btn-stripe secondary" onClick={handleAddItemRow}>
                                            <Plus size={14} />
                                            <span>Tambah Baris</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Table Column Headers */}
                                <div className="gdg-opn-item-grid gdg-po-item-header">
                                    <div>Barang</div>
                                    <div style={{ textAlign: 'center' }}>Satuan</div>
                                    <div style={{ textAlign: 'right' }}>Stok Sistem</div>
                                    <div style={{ textAlign: 'right' }}>Qty Fisik *</div>
                                    <div style={{ textAlign: 'center' }}>Selisih</div>
                                    <div>Keterangan Fisik</div>
                                    <div></div>
                                </div>

                                <div className="gdg-opn-items-scroll">
                                    {formItems.map((item, idx) => (
                                        <div key={idx} className="gdg-opn-item-grid gdg-item-row">
                                            <div style={{ minWidth: 0 }}>
                                                <SearchableSelect
                                                    options={barangOptions}
                                                    value={item.barang_id ? String(item.barang_id) : ''}
                                                    onChange={(val) => handleItemChange(idx, 'barang_id', val)}
                                                    placeholder="-- Cari / Pilih Barang --"
                                                    searchPlaceholder="Ketik nama atau kode barang..."
                                                    emptyMessage="Barang tidak ditemukan"
                                                    minDropdownWidth={340}
                                                    maxDropdownWidth={600}
                                                    popoverClassName="gdg-ks-ss-popover"
                                                />
                                            </div>
                                            <div className="gdg-po-meta-cell" style={{ textAlign: 'center', fontWeight: 600 }}>
                                                {item.satuan}
                                            </div>
                                            <div className="gdg-po-meta-cell gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {formatQty(item.qty_sistem)}
                                            </div>
                                            <div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={item.qty_fisik}
                                                    onChange={(e) => handleItemChange(idx, 'qty_fisik', e.target.value)}
                                                    required
                                                    placeholder="0"
                                                    className="gdg-inline-input gdg-num-cell"
                                                    style={{ textAlign: 'right', fontWeight: 600 }}
                                                />
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                {Number(item.selisih) === 0 ? (
                                                    <span className="gdg-status-text emerald">
                                                        <span className="gdg-status-dot" />
                                                        <span>0 Sesuai</span>
                                                    </span>
                                                ) : Number(item.selisih) > 0 ? (
                                                    <span className="gdg-status-text indigo">
                                                        <span className="gdg-status-dot" />
                                                        <span>+{formatQty(item.selisih)}</span>
                                                    </span>
                                                ) : (
                                                    <span className="gdg-status-text rose">
                                                        <span className="gdg-status-dot" />
                                                        <span>{formatQty(item.selisih)}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <input
                                                    type="text"
                                                    value={item.keterangan || ''}
                                                    onChange={(e) => handleItemChange(idx, 'keterangan', e.target.value)}
                                                    placeholder="Catatan kondisi fisik..."
                                                    className="gdg-inline-input"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="gdg-brg-icon-btn danger"
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

                                {/* TOTALS SUMMARY */}
                                <div className="gdg-po-grand-total">
                                    <span className="gdg-po-grand-total-label">
                                        Total Barang: <strong style={{ color: 'var(--gdg-text)' }}>{formItems.length} item</strong> · Total Qty Fisik:{' '}
                                        <strong className="gdg-num-cell" style={{ color: 'var(--gdg-text)' }}>{formatQty(totalQtyFisik)}</strong>
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="gdg-po-section-meta">Status Selisih Fisik:</span>
                                        {formItems.some(it => Number(it.selisih) !== 0) ? (
                                            <span className="gdg-status-text amber">
                                                <span className="gdg-status-dot" />
                                                <span>Ada Selisih ({formItems.filter(it => Number(it.selisih) !== 0).length} barang)</span>
                                            </span>
                                        ) : (
                                            <span className="gdg-status-text emerald">
                                                <span className="gdg-status-dot" />
                                                <span>Semua Sesuai Stok Buku</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowCreateModal(false)}>Batal</button>
                            <div className="gdg-po-foot-group">
                                <button type="button" className="gdg-btn-stripe secondary" disabled={saving} onClick={() => handleSubmitOpname(false)}>
                                    Simpan Draft
                                </button>
                                <button type="button" className="gdg-btn-stripe primary" disabled={saving} onClick={() => handleSubmitOpname(true)}>
                                    <CheckCircle2 size={14} />
                                    <span>{saving ? 'Memproses...' : 'Terapkan Hasil Opname'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: DETAIL OPNAME */}
            {showDetailModal && selectedOpname && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailModal(false)}>
                    <div className="gdg-modal gdg-po-modal-wide" style={{ maxWidth: '900px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-text">
                                <h3>Dokumen Opname: {selectedOpname.nomor}</h3>
                                <p>
                                    Jenis: <span className="gdg-po-detail-strong">{selectedOpname.jenis === 'SALDO_AWAL' ? 'Saldo Awal Cut-Over' : 'Opname Rutin Fisik'}</span> · Tanggal: {selectedOpname.tanggal} · Status: {selectedOpname.status}
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
                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>Kode</th>
                                            <th>Nama Barang</th>
                                            <th>Satuan</th>
                                            <th style={{ textAlign: 'right' }}>Qty Sistem</th>
                                            <th style={{ textAlign: 'right' }}>Qty Fisik</th>
                                            <th style={{ textAlign: 'center' }}>Selisih</th>
                                            <th>Keterangan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedOpname.items || []).map((it, idx) => (
                                            <tr key={idx}>
                                                <td className="gdg-code-cell">{it.barang_kode}</td>
                                                <td className="gdg-po-vendor-name">{it.barang_nama}</td>
                                                <td className="gdg-po-meta-cell">{it.satuan}</td>
                                                <td className="gdg-num-cell gdg-po-meta-cell" style={{ textAlign: 'right' }}>
                                                    {formatQty(it.qty_sistem)}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {formatQty(it.qty_fisik)}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'center' }}>
                                                    {Number(it.selisih) === 0 ? (
                                                        <span className="gdg-status-text emerald">
                                                            <span className="gdg-status-dot" />
                                                            <span>0 (Sesuai)</span>
                                                        </span>
                                                    ) : Number(it.selisih) > 0 ? (
                                                        <span className="gdg-status-text indigo">
                                                            <span className="gdg-status-dot" />
                                                            <span>+{formatQty(it.selisih)}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="gdg-status-text rose">
                                                            <span className="gdg-status-dot" />
                                                            <span>{formatQty(it.selisih)}</span>
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="gdg-po-meta-cell">{it.keterangan || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="gdg-po-grand-total">
                                <span className="gdg-po-grand-total-label">
                                    Total Item: <strong style={{ color: 'var(--gdg-text)' }}>{(selectedOpname.items || []).length} barang</strong>
                                </span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span className="gdg-po-section-meta">Total Selisih Fisik:</span>
                                    <strong
                                        className="gdg-num-cell"
                                        style={{
                                            fontSize: '15px',
                                            color: Number(selectedOpname.total_selisih_qty) === 0 ? '#10b981' : '#f59e0b'
                                        }}
                                    >
                                        {Number(selectedOpname.total_selisih_qty) > 0
                                            ? `+${formatQty(selectedOpname.total_selisih_qty)}`
                                            : formatQty(selectedOpname.total_selisih_qty)} unit
                                    </strong>
                                </div>
                            </div>
                        </div>
                        <div className="gdg-modal-foot gdg-po-modal-foot-split">
                            <button type="button" className="gdg-btn-stripe secondary" onClick={() => handlePrintSheet(selectedOpname)}>
                                <Printer size={14} />
                                <span>Cetak Berita Acara</span>
                            </button>
                            <div className="gdg-po-foot-group">
                                <button type="button" className="gdg-btn-stripe secondary" onClick={() => setShowDetailModal(false)}>Tutup</button>
                                {selectedOpname.can_approve && (
                                    <button type="button" className="gdg-btn-stripe primary" onClick={() => handleApproveOpname(selectedOpname)}>
                                        <CheckCircle2 size={14} />
                                        <span>Setujui &amp; Terapkan Hasil Opname</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

