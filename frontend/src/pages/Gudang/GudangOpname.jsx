import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    ClipboardCheck,
    Plus,
    Search,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Eye,
    Printer,
    FileSpreadsheet,
    X,
    Calendar,
    Layers,
    AlertCircle,
    Check
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';

export default function GudangOpname() {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gdg-card">
                <div className="gdg-card-head">
                    <div className="gdg-card-title">
                        <h2>Stock Opname & Saldo Awal (Fisik)</h2>
                        <p>Pencatatan hitung fisik gudang dan pembentukan saldo awal resmi persediaan</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="gdg-btn soft" onClick={fetchOpnames} disabled={loading}>
                            <RefreshCw size={15} /> Refresh
                        </button>
                        <button className="gdg-btn primary" onClick={handleOpenCreate}>
                            <Plus size={16} /> Input Opname / Saldo Awal
                        </button>
                    </div>
                </div>

                {/* TOOLBAR */}
                <div className="gdg-toolbar">
                    <div className="gdg-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Cari nomor opname, catatan..."
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
                        <option value="">Semua Status</option>
                        <option value="DRAFT">Draft</option>
                        <option value="DISETUJUI">Disetujui (Stok Diterapkan)</option>
                        <option value="BATAL">Batal</option>
                    </select>
                    <select
                        value={jenisFilter}
                        onChange={(e) => {
                            setJenisFilter(e.target.value);
                            setPage(1);
                        }}
                        className="gdg-select-control"
                        style={{ minWidth: '180px', height: '40px', borderRadius: '8px' }}
                    >
                        <option value="">Semua Jenis Dokumen</option>
                        <option value="SALDO_AWAL">Saldo Awal Cut-Over</option>
                        <option value="RUTIN">Opname Rutin / Fisik</option>
                    </select>
                    {(searchQuery || statusFilter || jenisFilter) && (
                        <button
                            type="button"
                            className="gdg-btn soft"
                            onClick={() => {
                                setSearchQuery('');
                                setStatusFilter('');
                                setJenisFilter('');
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
                                <th>NO OPNAME</th>
                                <th>TANGGAL</th>
                                <th>JENIS DOKUMEN</th>
                                <th>JUMLAH BARANG</th>
                                <th>TOTAL FISIK</th>
                                <th>TOTAL SELISIH</th>
                                <th>STATUS</th>
                                <th style={{ textAlign: 'right' }}>AKSI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Memuat dokumen opname...</td></tr>
                            ) : opnameList.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                        Belum ada dokumen opname atau saldo awal. Klik <strong>"+ Input Opname / Saldo Awal"</strong> untuk memulai.
                                    </td>
                                </tr>
                            ) : (
                                opnameList.map(opn => {
                                    const totalFisik = (opn.items || []).reduce((acc, it) => acc + Number(it.qty_fisik || 0), 0);
                                    return (
                                        <tr key={opn.id}>
                                            <td style={{ fontWeight: 600, color: '#0284c7' }}>{opn.nomor}</td>
                                            <td>{opn.tanggal}</td>
                                            <td>
                                                <span className={`gdg-badge ${opn.jenis === 'SALDO_AWAL' ? 'success' : 'info'}`}>
                                                    {opn.jenis === 'SALDO_AWAL' ? 'Saldo Awal Cut-Over' : 'Opname Rutin'}
                                                </span>
                                            </td>
                                            <td>{(opn.items || []).length} barang</td>
                                            <td style={{ fontWeight: 600 }}>{formatQty(totalFisik)}</td>
                                            <td>
                                                {opn.jenis === 'SALDO_AWAL' ? (
                                                    <span className="gdg-badge neutral">Saldo Awal</span>
                                                ) : Number(opn.total_selisih_qty) === 0 ? (
                                                    <span className="gdg-badge success">0 (Cocok)</span>
                                                ) : Number(opn.total_selisih_qty) > 0 ? (
                                                    <span className="gdg-badge info">+{formatQty(opn.total_selisih_qty)}</span>
                                                ) : (
                                                    <span className="gdg-badge danger">{formatQty(opn.total_selisih_qty)}</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`gdg-badge ${opn.status === 'DISETUJUI' ? 'success' : opn.status === 'BATAL' ? 'danger' : 'neutral'}`}>
                                                    {opn.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="gdg-action-btn view"
                                                        title="Lihat Detail Opname"
                                                        onClick={() => { setSelectedOpname(opn); setShowDetailModal(true); }}
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                    <button
                                                        className="gdg-action-btn print"
                                                        title="Cetak Berita Acara / Lembar Opname"
                                                        onClick={() => handlePrintSheet(opn)}
                                                    >
                                                        <Printer size={15} />
                                                    </button>
                                                    {opn.can_approve && (
                                                        <button
                                                            className="gdg-action-btn success"
                                                            title="Setujui & Terapkan Saldo Stok"
                                                            onClick={() => handleApproveOpname(opn)}
                                                        >
                                                            <CheckCircle2 size={15} />
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
                        <SimplePagination page={page} totalPages={Math.ceil(totalCount / pageSize)} onPageChange={setPage} totalCount={totalCount} pageSize={pageSize} />
                    </div>
                )}
            </div>

            {/* MODAL: INPUT OPNAME */}
            {showCreateModal && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                    <div className="gdg-modal" style={{ maxWidth: '980px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div>
                                <h3>Input Stock Opname & Saldo Awal Fisik</h3>
                                <p style={{ color: 'var(--gdg-text-secondary, #64748b)', margin: '2px 0 0 0', fontSize: '0.84rem' }}>
                                    Pencatatan hitung fisik riil di gudang logistik dan penetapan selisih stok
                                </p>
                            </div>
                            <button className="gdg-btn soft" style={{ padding: '6px' }} onClick={() => setShowCreateModal(false)}><X size={16} /></button>
                        </div>
                        <div className="gdg-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="gdg-form-row">
                                <div className="gdg-form-group">
                                    <label>Jenis Dokumen Opname</label>
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
                                    <label>Tanggal Hitung Fisik *</label>
                                    <DateField
                                        value={formTanggal}
                                        onChange={(val) => setFormTanggal(val)}
                                        placeholder="Pilih tanggal..."
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
                            <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '16px', marginTop: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--gdg-text-main, #0f172a)' }}>
                                        Daftar Hasil Hitung Fisik ({formItems.length} barang)
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button type="button" className="gdg-btn soft" onClick={handleLoadTemplate} disabled={loadingTemplate}>
                                            <Layers size={14} /> {loadingTemplate ? 'Memuat...' : 'Muat Semua Katalog Barang'}
                                        </button>
                                        <button type="button" className="gdg-btn soft" onClick={handleAddItemRow}>
                                            <Plus size={14} /> Tambah Baris
                                        </button>
                                    </div>
                                </div>

                                {/* Table Column Headers */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2.5fr 70px 100px 110px 110px 1.8fr 36px',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    background: 'rgba(148, 163, 184, 0.08)',
                                    borderRadius: '6px',
                                    marginBottom: '6px'
                                }}>
                                    <div>Barang</div>
                                    <div style={{ textAlign: 'center' }}>Satuan</div>
                                    <div style={{ textAlign: 'right' }}>Stok Sistem</div>
                                    <div style={{ textAlign: 'right' }}>Qty Fisik *</div>
                                    <div style={{ textAlign: 'center' }}>Selisih</div>
                                    <div>Keterangan Fisik</div>
                                    <div></div>
                                </div>

                                <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                                    {formItems.map((item, idx) => (
                                        <div key={idx} className="gdg-item-row" style={{
                                            display: 'grid',
                                            gridTemplateColumns: '2.5fr 70px 100px 110px 110px 1.8fr 36px',
                                            gap: '8px',
                                            alignItems: 'center',
                                            padding: '8px 10px'
                                        }}>
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
                                                />
                                            </div>
                                            <div style={{ textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gdg-text-secondary, #64748b)' }}>
                                                {item.satuan}
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.84rem', fontWeight: 600, color: 'var(--gdg-text-secondary, #64748b)' }}>
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
                                                    className="gdg-inline-input"
                                                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.84rem', fontWeight: 700, height: '36px', textAlign: 'right' }}
                                                />
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                {Number(item.selisih) === 0 ? (
                                                    <span className="gdg-badge success" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                                                        0 Sesuai
                                                    </span>
                                                ) : Number(item.selisih) > 0 ? (
                                                    <span className="gdg-badge info" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                                                        +{formatQty(item.selisih)}
                                                    </span>
                                                ) : (
                                                    <span className="gdg-badge danger" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                                                        {formatQty(item.selisih)}
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
                                                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem', height: '36px' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="gdg-action-btn delete"
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
                                <div style={{
                                    marginTop: '14px',
                                    padding: '12px 16px',
                                    background: 'rgba(56, 189, 248, 0.08)',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--gdg-text-secondary, #475569)' }}>
                                        Total Barang: <strong style={{ color: 'var(--gdg-text-main, #0f172a)' }}>{formItems.length} item</strong> | Total Qty Fisik: <strong style={{ color: 'var(--gdg-text-main, #0f172a)' }}>{formatQty(totalQtyFisik)}</strong>
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.86rem', color: 'var(--gdg-text-secondary, #64748b)' }}>Status Selisih Fisik:</span>
                                        {formItems.some(it => Number(it.selisih) !== 0) ? (
                                            <span className="gdg-badge warning" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>
                                                Ada Selisih ({formItems.filter(it => Number(it.selisih) !== 0).length} barang)
                                            </span>
                                        ) : (
                                            <span className="gdg-badge success" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>
                                                Semua Sesuai Stok Buku
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="gdg-modal-foot" style={{ justifyContent: 'space-between' }}>
                            <button type="button" className="gdg-btn soft" onClick={() => setShowCreateModal(false)}>Batal</button>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" className="gdg-btn soft" disabled={saving} onClick={() => handleSubmitOpname(false)}>
                                    Simpan Draft
                                </button>
                                <button type="button" className="gdg-btn primary" disabled={saving} onClick={() => handleSubmitOpname(true)}>
                                    <CheckCircle2 size={16} /> {saving ? 'Memproses...' : 'Terapkan Hasil Opname'}
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
                    <div className="gdg-modal" style={{ maxWidth: '900px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div>
                                <h3>Dokumen Opname: {selectedOpname.nomor}</h3>
                                <p style={{ color: 'var(--gdg-text-secondary, #64748b)', margin: '2px 0 0 0', fontSize: '0.84rem' }}>
                                    Jenis: <strong>{selectedOpname.jenis === 'SALDO_AWAL' ? 'Saldo Awal Cut-Over' : 'Opname Rutin Fisik'}</strong> | Tanggal: {selectedOpname.tanggal} | Status: {selectedOpname.status}
                                </p>
                            </div>
                            <button className="gdg-btn soft" style={{ padding: '6px' }} onClick={() => setShowDetailModal(false)}><X size={16} /></button>
                        </div>
                        <div className="gdg-modal-body">
                            <div className="gdg-table-wrap">
                                <table className="gdg-table" style={{ fontSize: '0.86rem' }}>
                                    <thead>
                                        <tr>
                                            <th>KODE</th>
                                            <th>NAMA BARANG</th>
                                            <th>SATUAN</th>
                                            <th style={{ textAlign: 'right' }}>QTY SISTEM</th>
                                            <th style={{ textAlign: 'right' }}>QTY FISIK</th>
                                            <th style={{ textAlign: 'center' }}>SELISIH</th>
                                            <th>KETERANGAN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedOpname.items || []).map((it, idx) => (
                                            <tr key={idx}>
                                                <td style={{ color: '#0284c7', fontWeight: 600 }}>{it.barang_kode}</td>
                                                <td className="gdg-cell-strong">{it.barang_nama}</td>
                                                <td>{it.satuan}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--gdg-text-secondary, #64748b)' }}>{formatQty(it.qty_sistem)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>{formatQty(it.qty_fisik)}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {Number(it.selisih) === 0 ? (
                                                        <span className="gdg-badge success" style={{ fontSize: '0.74rem' }}>0 (Sesuai)</span>
                                                    ) : Number(it.selisih) > 0 ? (
                                                        <span className="gdg-badge info" style={{ fontSize: '0.74rem' }}>+{formatQty(it.selisih)}</span>
                                                    ) : (
                                                        <span className="gdg-badge danger" style={{ fontSize: '0.74rem' }}>{formatQty(it.selisih)}</span>
                                                    )}
                                                </td>
                                                <td style={{ color: 'var(--gdg-text-secondary, #64748b)' }}>{it.keterangan || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--gdg-text-secondary, #64748b)', fontSize: '0.88rem' }}>
                                    Total Item: <strong>{(selectedOpname.items || []).length} barang</strong>
                                </span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--gdg-text-secondary, #64748b)' }}>Total Selisih Fisik:</span>
                                    <strong style={{ fontSize: '1.1rem', color: Number(selectedOpname.total_selisih_qty) === 0 ? '#10b981' : '#f59e0b' }}>
                                        {Number(selectedOpname.total_selisih_qty) > 0 ? `+${formatQty(selectedOpname.total_selisih_qty)}` : formatQty(selectedOpname.total_selisih_qty)} unit
                                    </strong>
                                </div>
                            </div>
                        </div>
                        <div className="gdg-modal-foot" style={{ justifyContent: 'space-between' }}>
                            <button className="gdg-btn soft" onClick={() => handlePrintSheet(selectedOpname)}>
                                <Printer size={15} /> Cetak Berita Acara
                            </button>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="gdg-btn soft" onClick={() => setShowDetailModal(false)}>Tutup</button>
                                {selectedOpname.can_approve && (
                                    <button className="gdg-btn primary" onClick={() => handleApproveOpname(selectedOpname)}>
                                        <CheckCircle2 size={16} /> Setujui & Terapkan Hasil Opname
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

