import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CheckCircle2, ChevronDown, Eye, FilePlus2, Pencil, Plus, RefreshCw, Search, Trash2, Warehouse, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import '../Keuangan/InvoicePembiayaan.css';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => Number(value || 0).toLocaleString('id-ID');
const money = (value) => `Rp ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (err, fallback) => err?.response?.data?.error || err?.response?.data?.detail || fallback;
const itemTotal = (items = []) => items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.harga || 0), 0);
const purchaseTotal = (row) => Number(row?.nilai || 0) || itemTotal(row?.items || []);
const parseMoneyInput = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value || '').replace(/[^\d.,-]/g, '');
    if (!raw) return 0;
    const negative = raw.startsWith('-');
    const unsigned = raw.replace(/-/g, '');
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    let normalized = unsigned;
    if (lastComma >= 0 && lastDot >= 0) {
        const decimalSep = lastComma > lastDot ? ',' : '.';
        const thousandSep = decimalSep === ',' ? '.' : ',';
        normalized = unsigned.split(thousandSep).join('').replace(decimalSep, '.');
    } else {
        const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
        if (sep) {
            const parts = unsigned.split(sep);
            const fraction = parts[parts.length - 1] || '';
            normalized = fraction.length > 0 && fraction.length <= 2 ? `${parts.slice(0, -1).join('')}.${fraction}` : parts.join('');
        }
    }
    const parsed = Number(`${negative ? '-' : ''}${normalized}`);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const raw = String(value);
    const draftMatch = raw.match(/^(-?\d+)(\.(\d{0,2})?)$/);
    if (draftMatch) {
        const [, integer, decimal = ''] = draftMatch;
        return `Rp ${Number(integer || 0).toLocaleString('en-US')}${decimal}`;
    }
    const amount = parseMoneyInput(value);
    if (!amount) return raw.endsWith('.') ? 'Rp 0.' : '';
    const hasDecimal = !Number.isInteger(amount);
    return `Rp ${amount.toLocaleString('en-US', { minimumFractionDigits: hasDecimal ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const normalizeMoneyDraft = (value) => {
    const raw = String(value || '').replace(/[^\d.,]/g, '');
    if (!raw) return '';
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma >= 0 || lastDot >= 0) {
        const decimalIndex = Math.max(lastComma, lastDot);
        const afterSeparator = raw.slice(decimalIndex + 1).replace(/\D/g, '');
        const beforeSeparator = raw.slice(0, decimalIndex).replace(/\D/g, '');
        const hasMultipleSeparators = (raw.match(/[.,]/g) || []).length > 1;
        if (decimalIndex === raw.length - 1) return `${beforeSeparator || '0'}.`;
        const isDecimalDraft = afterSeparator.length <= 2 && (!hasMultipleSeparators || afterSeparator.length > 0);
        if (!isDecimalDraft) return raw.replace(/\D/g, '');
        return `${beforeSeparator || '0'}.${afterSeparator.slice(0, 2)}`;
    }
    return raw.replace(/\D/g, '');
};

const TITLES = {
    barang: ['Daftar Barang', 'Kelola daftar barang gudang logistik dari RSSAMS.'],
    vendor: ['Master Vendor', 'Kelola rekanan/vendor untuk SPB dan penerimaan gudang logistik.'],
    spb: ['SPB', 'Surat Pesanan Barang gudang logistik.'],
    penerimaan: ['Penerimaan', 'Daftar barang masuk dari invoice rekanan.'],
    'barang-keluar': ['Barang Keluar', 'Mutasi barang keluar dari gudang logistik.'],
    permintaan: ['Permintaan', 'Permintaan barang dari unit.'],
    verifikasi: ['Verifikasi Permintaan', 'Persetujuan permintaan barang unit.'],
    'stok-minimum': ['Stok Minimum', 'Barang yang stoknya berada di bawah batas minimum.'],
    'kartu-stok': ['Kartu Stok', 'Riwayat masuk dan keluar per barang.'],
    opname: ['Opname', 'Catatan stock opname gudang logistik.'],
};

const emptyBarang = { nama_barang: '', kemasan: '', satuan: 'PCS', isi: 1, merk: '', golongan: '', stok_minimum: 0 };
const emptyVendor = { nama: '', alamat: '', telp: '', kc: '' };
const emptySpb = { tanggal: today(), id_rekanan: '', no_spb: '', metode_pembayaran: 'Kredit' };
const emptyItem = { barang: '', original_barang: '', qty: 1, isi: 1, harga: '', no_invoice: '', editing: false };
const UNIT_OPTIONS = ['PCS', 'BOX', 'BTL', 'KALENG', 'PAK', 'STRIP', 'SET', 'LITER', 'GRAM', 'METER'];
const emptyMutasi = { barang: '', tanggal: today(), ruang: '', qty: 1, keterangan: '' };
const emptyPermintaan = { barang: '', tanggal: today(), ruang: '', qty_minta: 1, catatan: '' };
const emptyOpname = { barang: '', tanggal: today(), real_stock: 0, keterangan: '' };

export default function Logistik() {
    const toast = useToast();
    const { section = 'barang' } = useParams();
    const title = TITLES[section] || TITLES.barang;
    const [rows, setRows] = useState([]);
    const [barangOptions, setBarangOptions] = useState([]);
    const [vendorOptions, setVendorOptions] = useState([]);
    const [ruangOptions, setRuangOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [modal, setModal] = useState(null);
    const [showAllBarang, setShowAllBarang] = useState(false);
    const [penerimaanFilter, setPenerimaanFilter] = useState('all');
    const [detail, setDetail] = useState(null);
    const [activePurchase, setActivePurchase] = useState(null);
    const [kartuBarang, setKartuBarang] = useState('');
    const [kartuRows, setKartuRows] = useState([]);
    const [forms, setForms] = useState({
        barang: emptyBarang,
        vendor: emptyVendor,
        spb: emptySpb,
        item: emptyItem,
        mutasi: emptyMutasi,
        permintaan: emptyPermintaan,
        opname: emptyOpname,
    });

    const setForm = (key, patch) => setForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    const fetchOptions = useCallback(async () => {
        const [barangRes, ruangRes, vendorRes] = await Promise.all([
            api.get('/keuangan/logistik/barang/', { params: { page_size: 1000, show_all: 'true' } }),
            api.get('/keuangan/logistik/barang/ruang-options/'),
            api.get('/keuangan/logistik/vendor/options/'),
        ]);
        setBarangOptions(getResults(barangRes.data));
        setRuangOptions(getResults(ruangRes.data));
        setVendorOptions(getResults(vendorRes.data));
    }, []);

    const endpointFor = useCallback(() => {
        if (section === 'vendor') return '/keuangan/logistik/vendor/';
        if (section === 'spb' || section === 'penerimaan') return '/keuangan/logistik/pembelian/';
        if (section === 'barang-keluar') return '/keuangan/logistik/mutasi/';
        if (section === 'permintaan' || section === 'verifikasi') return '/keuangan/logistik/permintaan/';
        if (section === 'opname') return '/keuangan/logistik/opname/';
        return '/keuangan/logistik/barang/';
    }, [section]);

    const fetchRows = useCallback(async () => {
        if (section === 'kartu-stok') return;
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, { search });
            if (section === 'stok-minimum') params.minimum = true;
            if (section === 'verifikasi') params.status = 'menunggu';
            if (section === 'barang') params.show_all = showAllBarang ? 'true' : 'false';
            const listRes = await api.get(endpointFor(), { params });
            setRows(getResults(listRes.data));
            setTotal(getCount(listRes.data));
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat data gudang logistik.'));
        } finally {
            setLoading(false);
        }
    }, [endpointFor, page, pageSize, search, section, showAllBarang, toast]);

    useEffect(() => { fetchOptions().catch(() => toast.error('Gagal memuat pilihan logistik.')); }, [fetchOptions, toast]);
    useEffect(() => { setPage(1); setRows([]); setKartuRows([]); }, [section]);
    useEffect(() => { fetchRows(); }, [fetchRows]);

    const openCreate = () => {
        const target = section === 'stok-minimum' ? 'barang' : section;
        if (target === 'barang') setForms((v) => ({ ...v, barang: emptyBarang }));
        if (target === 'vendor') setForms((v) => ({ ...v, vendor: emptyVendor }));
        if (target === 'spb' || target === 'penerimaan') setForms((v) => ({ ...v, spb: emptySpb }));
        if (target === 'barang-keluar') setForms((v) => ({ ...v, mutasi: emptyMutasi }));
        if (target === 'permintaan') setForms((v) => ({ ...v, permintaan: emptyPermintaan }));
        if (target === 'opname') setForms((v) => ({ ...v, opname: emptyOpname }));
        setModal(target === 'penerimaan' ? 'spb' : target);
    };

    const saveBarang = async (e) => {
        e.preventDefault();
        await api.post('/keuangan/logistik/barang/', forms.barang);
        toast.success('Barang berhasil ditambahkan.');
        setModal(null); fetchOptions(); fetchRows();
    };

    const saveVendor = async (e) => {
        e.preventDefault();
        const payload = forms.vendor;
        if (payload.id) await api.patch(`/keuangan/logistik/vendor/${payload.id}/`, payload);
        else await api.post('/keuangan/logistik/vendor/', payload);
        toast.success('Vendor berhasil disimpan.');
        setModal(null); fetchOptions(); fetchRows();
    };

    const saveSpb = async (e) => {
        e.preventDefault();
        const payload = { ...forms.spb };
        if (payload.id) {
            await api.patch(`/keuangan/logistik/pembelian/${payload.id}/`, payload);
            toast.success('Penerimaan berhasil diperbarui.');
        } else {
            await api.post('/keuangan/logistik/pembelian/', payload);
            toast.success(section === 'penerimaan' ? 'Penerimaan berhasil dibuat.' : 'SPB berhasil dibuat.');
        }
        setModal(null); fetchRows();
    };

    const saveItem = async (e) => {
        e.preventDefault();
        if (!activePurchase?.id) {
            toast.error('Pilih penerimaan terlebih dahulu.');
            return;
        }
        const payload = { ...forms.item, harga: parseMoneyInput(forms.item.harga), pembelian: activePurchase.id };
        if (forms.item.editing) {
            await api.patch(`/keuangan/logistik/batch/${activePurchase.id}/`, payload);
            toast.success('Barang masuk berhasil diperbarui.');
        } else {
            await api.post('/keuangan/logistik/batch/', payload);
            toast.success('Barang masuk berhasil ditambahkan.');
        }
        setModal(null); fetchRows();
    };

    const saveMutasi = async (e) => {
        e.preventDefault();
        await api.post('/keuangan/logistik/mutasi/', forms.mutasi);
        toast.success('Barang keluar berhasil disimpan.');
        setModal(null); fetchRows(); fetchOptions();
    };

    const savePermintaan = async (e) => {
        e.preventDefault();
        await api.post('/keuangan/logistik/permintaan/', forms.permintaan);
        toast.success('Permintaan berhasil dibuat.');
        setModal(null); fetchRows();
    };

    const saveOpname = async (e) => {
        e.preventDefault();
        await api.post('/keuangan/logistik/opname/', forms.opname);
        toast.success('Opname berhasil dicatat.');
        setModal(null); fetchRows();
    };

    const verify = async (row, status) => {
        const qty = status === 'disetujui' ? Number(window.prompt('Qty disetujui', row.qty_minta) || 0) : 0;
        try {
            await api.post(`/keuangan/logistik/permintaan/${row.id}/verifikasi/`, { status, qty_setuju: qty });
            toast.success('Permintaan berhasil diverifikasi.');
            fetchRows();
        } catch (err) {
            toast.error(getError(err, 'Gagal verifikasi permintaan.'));
        }
    };

    const loadKartu = async (id = kartuBarang) => {
        if (!id) return setKartuRows([]);
        const res = await api.get(`/keuangan/logistik/barang/${id}/kartu-stok/`);
        setKartuRows(res.data || []);
    };

    const deleteBarang = async (row) => {
        if (!window.confirm(`Hapus ${row.nama_barang}?`)) return;
        await api.delete(`/keuangan/logistik/barang/${row.id}/`);
        toast.success('Barang dihapus.');
        fetchRows(); fetchOptions();
    };

    const deleteVendor = async (row) => {
        if (!window.confirm(`Hapus vendor ${row.nama}?`)) return;
        await api.delete(`/keuangan/logistik/vendor/${row.id}/`);
        toast.success('Vendor dihapus.');
        fetchRows(); fetchOptions();
    };

    const canCreate = !['verifikasi', 'stok-minimum', 'kartu-stok', 'penerimaan'].includes(section);

    const filteredRows = useMemo(() => {
        if (section !== 'penerimaan') return rows;
        const query = search.toLowerCase();
        return rows.filter((row) => {
            const matchesSearch = !query || [row.nomor, row.pemasok, row.no_faktur, row.tanggal].some((value) => String(value || '').toLowerCase().includes(query));
            if (!matchesSearch) return false;
            if (penerimaanFilter === 'with_items') return (row.items || []).length > 0;
            if (penerimaanFilter === 'empty') return (row.items || []).length === 0;
            return true;
        });
    }, [rows, search, section, penerimaanFilter]);

    return (
        <div className="inv-page log-page">
            <style>{LOG_STYLE}</style>
            <section className="inv-hero">
                <div className="inv-title">
                    <span><Warehouse size={24} /></span>
                    <div>
                        <h1>{title[0]}</h1>
                        <p>{title[1]}</p>
                    </div>
                </div>
            </section>

            {section !== 'kartu-stok' && (
                <section className="inv-card table">
                    <div className="inv-card-head">
                        <div className="inv-card-title">
                            <h2>Daftar Data</h2>
                            <p>Total {fmt(total)} data</p>
                        </div>
                        <div className="inv-card-actions">
                            <button className="inv-btn soft" onClick={fetchRows} type="button"><RefreshCw size={16} /> Refresh</button>
                            {canCreate && <button className="inv-btn primary" onClick={openCreate} type="button"><FilePlus2 size={16} /> Tambah</button>}
                        </div>
                    </div>
                    <div className="dki-filter">
                        <div className="dki-filter-row-1">
                            <label className="dki-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari data..." /></label>
                            {section === 'barang' && (
                                <div className="log-filter-segment" role="group" aria-label="Filter barang">
                                    <button className={!showAllBarang ? 'active' : ''} type="button" onClick={() => setShowAllBarang(false)}>Stok tersedia</button>
                                    <button className={showAllBarang ? 'active' : ''} type="button" onClick={() => setShowAllBarang(true)}>Semua</button>
                                </div>
                            )}
                            {section === 'penerimaan' && (
                                <div className="log-filter-segment" role="group" aria-label="Filter penerimaan">
                                    <button className={penerimaanFilter === 'all' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('all')}>Semua</button>
                                    <button className={penerimaanFilter === 'with_items' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('with_items')}>Ada barang</button>
                                    <button className={penerimaanFilter === 'empty' ? 'active' : ''} type="button" onClick={() => setPenerimaanFilter('empty')}>Kosong</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <DataTable
                        section={section}
                        rows={section === 'penerimaan' ? filteredRows : rows}
                        loading={loading}
                        onDetail={setDetail}
                        onItem={(row) => {
                            setDetail(null);
                            setActivePurchase(row);
                            setForms((v) => ({ ...v, item: { ...emptyItem, no_invoice: row.no_faktur || '' } }));
                            setModal('item');
                        }}
                        onEditVendor={(row) => { setForms((v) => ({ ...v, vendor: row })); setModal('vendor'); }}
                        onEditPenerimaan={(row) => {
                            const matchedVendor = vendorOptions.find((vendor) => vendor.nama === row.pemasok);
                            setDetail(null);
                            setActivePurchase(row);
                            setForms((v) => ({ ...v, spb: { ...emptySpb, id: row.id, tanggal: row.tanggal || today(), id_rekanan: matchedVendor?.id || '', no_spb: row.no_faktur || '', metode_pembayaran: 'Kredit' } }));
                            setModal('spb');
                        }}
                        onDeleteBarang={deleteBarang}
                        onDeleteVendor={deleteVendor}
                        onVerify={verify}
                    />
                    <SimplePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="inv-page-btn" selectClassName="inv-page-select" />
                </section>
            )}

            {section === 'kartu-stok' && (
                <section className="inv-card table">
                    <div className="inv-card-head">
                        <div className="inv-card-title"><h2>Kartu Stok</h2><p>Pilih barang untuk melihat riwayat.</p></div>
                        <div className="inv-card-actions">
                            <select className="dki-select" value={kartuBarang} onChange={(e) => { setKartuBarang(e.target.value); loadKartu(e.target.value); }}>
                                <option value="">Pilih barang</option>
                                {barangOptions.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}
                            </select>
                            <button className="inv-btn soft" onClick={() => loadKartu()} type="button"><Eye size={16} /> Tampilkan</button>
                        </div>
                    </div>
                    <KartuTable rows={kartuRows} />
                </section>
            )}

            {detail && (
                <Modal title={`Detail ${detail.nomor || detail.id}`} description="Informasi lengkap dan daftar barang." variant="detail" icon={<Eye size={20} />} onClose={() => setDetail(null)}>
                    <DetailInfo row={detail} section={section} />
                    <MiniItems items={detail.items || []} />
                </Modal>
            )}

            {modal === 'barang' && <BarangModal form={forms.barang} setForm={(p) => setForm('barang', p)} onSubmit={saveBarang} onClose={() => setModal(null)} />}
            {modal === 'vendor' && <VendorModal form={forms.vendor} setForm={(p) => setForm('vendor', p)} onSubmit={saveVendor} onClose={() => setModal(null)} />}
            {modal === 'spb' && (
                <SpbModal
                    mode={section === 'penerimaan' ? 'penerimaan' : 'spb'}
                    form={forms.spb}
                    setForm={(p) => setForm('spb', p)}
                    vendors={vendorOptions}
                    purchase={activePurchase}
                    onEditItem={(item) => {
                        setForms((v) => ({
                            ...v,
                            item: {
                                ...emptyItem,
                                editing: true,
                                barang: item.barang,
                                original_barang: item.barang,
                                qty: item.qty,
                                isi: item.isi,
                                harga: item.harga,
                                no_invoice: activePurchase?.no_faktur || '',
                            },
                        }));
                        setModal('item');
                    }}
                    onSubmit={saveSpb}
                    onClose={() => setModal(null)}
                />
            )}
            {modal === 'item' && <ItemModal form={forms.item} setForm={(p) => setForm('item', p)} barang={barangOptions} onSubmit={saveItem} onClose={() => setModal(null)} purchase={activePurchase} />}
            {modal === 'barang-keluar' && <MutasiModal form={forms.mutasi} setForm={(p) => setForm('mutasi', p)} barang={barangOptions} ruang={ruangOptions} onSubmit={saveMutasi} onClose={() => setModal(null)} />}
            {modal === 'permintaan' && <PermintaanModal form={forms.permintaan} setForm={(p) => setForm('permintaan', p)} barang={barangOptions} ruang={ruangOptions} onSubmit={savePermintaan} onClose={() => setModal(null)} />}
            {modal === 'opname' && <OpnameModal form={forms.opname} setForm={(p) => setForm('opname', p)} barang={barangOptions} onSubmit={saveOpname} onClose={() => setModal(null)} />}
        </div>
    );
}

function DataTable({ section, rows, loading, onDetail, onItem, onEditVendor, onEditPenerimaan, onDeleteBarang, onDeleteVendor, onVerify }) {
    const headers = {
        barang: ['Barang', 'Kemasan', 'Satuan', 'Merek', 'Stok', 'Minimum', 'Aksi'],
        vendor: ['Vendor', 'Alamat', 'Telepon', 'Nama PIC', 'Aksi'],
        spb: ['No SPB', 'Tanggal', 'Vendor', 'Nilai', 'Aksi'],
        penerimaan: ['Tanggal', 'No SPB', 'Vendor', 'Qty Masuk', 'Grand Total', 'Aksi'],
        'barang-keluar': ['Nomor', 'Tanggal', 'Barang', 'Ruang', 'Qty', 'Harga', 'Status'],
        permintaan: ['Tanggal', 'Barang', 'Ruang', 'Minta', 'Setuju', 'Status', 'Aksi'],
        verifikasi: ['Tanggal', 'Barang', 'Ruang', 'Minta', 'Setuju', 'Status', 'Aksi'],
        'stok-minimum': ['Barang', 'Kemasan', 'Satuan', 'Merek', 'Stok', 'Minimum', 'Aksi'],
        opname: ['Tanggal', 'Barang', 'Stok Sistem', 'Real', 'Selisih', 'Keterangan'],
    }[section] || [];

    const body = () => {
        if (loading) return <tr><td colSpan={headers.length} className="inv-empty">Memuat data...</td></tr>;
        if (!rows.length) return <tr><td colSpan={headers.length} className="inv-empty">Belum ada data.</td></tr>;
        if (['barang', 'stok-minimum'].includes(section)) return rows.map((r) => <tr key={r.id}><td><strong>{r.nama_barang}</strong></td><td>{r.kemasan || '-'} x {fmt(r.isi)}</td><td>{r.satuan}</td><td>{r.merk || '-'}</td><td><Badge danger={r.stok_minimum_alert}>{fmt(r.stok)}</Badge></td><td>{fmt(r.stok_minimum)}</td><td><button className="inv-row-btn" onClick={() => onDeleteBarang(r)}><Trash2 size={15} /></button></td></tr>);
        if (section === 'vendor') return rows.map((r) => <tr key={r.id}><td><strong>{r.nama}</strong></td><td>{r.alamat || '-'}</td><td>{r.telp || '-'}</td><td>{r.kc || '-'}</td><td><div className="inv-row-actions"><button onClick={() => onEditVendor(r)}><Pencil size={15} /></button><button onClick={() => onDeleteVendor(r)}><Trash2 size={15} /></button></div></td></tr>);
        if (section === 'spb') return rows.map((r) => <tr key={r.id}><td><strong>{r.nomor}</strong></td><td>{r.tanggal || '-'}</td><td>{r.pemasok || '-'}</td><td>{money(purchaseTotal(r))}</td><td><div className="inv-row-actions"><button onClick={() => onDetail(r)} title="Lihat detail SPB"><Eye size={15} /></button></div></td></tr>);
        if (section === 'penerimaan') return rows.map((r) => {
            const items = r.items || [];
            const qtyMasuk = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.isi || 0), 0);
            const grandTotal = purchaseTotal(r);
            return (
                <tr key={r.id}>
                    <td>{r.tanggal || '-'}</td>
                    <td><strong>{r.nomor}</strong></td>
                    <td>{r.pemasok || '-'}</td>
                    <td>{items.length ? fmt(qtyMasuk) : '-'}</td>
                    <td>{money(grandTotal)}</td>
                    <td><div className="inv-row-actions"><button onClick={() => onDetail(r)} title="Lihat penerimaan"><Eye size={15} /></button><button onClick={() => onItem(r)} title="Tambah barang masuk"><Plus size={15} /></button><button onClick={() => onEditPenerimaan(r)} title="Edit invoice penerimaan"><Pencil size={15} /></button></div></td>
                </tr>
            );
        });
        if (section === 'barang-keluar') return rows.map((r) => <tr key={r.id}><td>{r.nomor}</td><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{r.ruang}</td><td>{fmt(r.qty)} {r.satuan}</td><td>{money(r.harga)}</td><td><Badge>{r.status}</Badge></td></tr>);
        if (['permintaan', 'verifikasi'].includes(section)) return rows.map((r) => <tr key={r.id}><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{r.ruang}</td><td>{fmt(r.qty_minta)} {r.satuan}</td><td>{fmt(r.qty_setuju)}</td><td><Badge>{r.status_label || r.status}</Badge></td><td>{section === 'verifikasi' ? <div className="inv-row-actions"><button onClick={() => onVerify(r, 'disetujui')}><CheckCircle2 size={15} /></button><button onClick={() => onVerify(r, 'ditolak')}><X size={15} /></button></div> : '-'}</td></tr>);
        if (section === 'opname') return rows.map((r) => <tr key={r.id}><td>{r.tanggal}</td><td>{r.barang_nama}</td><td>{fmt(r.stok_sistem)}</td><td>{fmt(r.real_stock)}</td><td>{fmt(r.selisih)}</td><td>{r.keterangan || '-'}</td></tr>);
        return null;
    };

    return <div className="inv-table-wrap"><table className="inv-table log-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{body()}</tbody></table></div>;
}

function Badge({ children, danger }) {
    return <span className={`inv-status ${danger ? 'danger' : 'success'}`}>{children}</span>;
}

function DetailInfo({ row, section }) {
    const isPurchase = ['spb', 'penerimaan'].includes(section);
    const fields = isPurchase
        ? [
            ['No SPB', row.nomor || row.id],
            ['Tanggal', row.tanggal],
            ['Vendor', row.pemasok],
            ['No Faktur', row.no_faktur],
            ['Grand Total', money(purchaseTotal(row))],
            ['Dibuat', row.created_at],
        ]
        : Object.entries(row)
            .filter(([key]) => !['items', 'status'].includes(key))
            .slice(0, 12)
            .map(([key, value]) => [humanLabel(key), value]);
    return (
        <div className="log-detail-grid">
            {fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
        </div>
    );
}

function humanLabel(key) {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Modal({ title, description = 'Lengkapi data lalu simpan.', children, onClose, variant = 'create', icon = <FilePlus2 size={20} /> }) {
    const isDetail = variant === 'detail';
    return (
        <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div className={`inv-modal ${isDetail ? 'detail' : 'create'} log-modal`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                <div className={`inv-modal-head ${isDetail ? 'inv-detail-head' : ''}`}>
                    <div className={isDetail ? 'inv-detail-title' : 'log-modal-title'}>
                        <span className={`inv-modal-head-icon ${isDetail ? 'detail' : ''}`}>{icon}</span>
                        <div>
                            <h2>{title}</h2>
                            <p>{description}</p>
                        </div>
                    </div>
                    <button className="inv-close" type="button" onClick={onClose}><X size={18} /> Tutup</button>
                </div>
                <div className={isDetail ? 'inv-detail-body' : 'inv-modal-body'}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return <label className="inv-field">{label}{children}</label>;
}

function SearchableBarangSelect({ options = [], value = '', onChange }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const selected = useMemo(() => options.find((item) => String(item.id) === String(value)), [options, value]);
    const filtered = useMemo(() => {
        const needle = query.toLowerCase().trim();
        if (!needle) return options;
        return options.filter((item) => [item.nama_barang, item.merk, item.kemasan, item.satuan, item.id]
            .some((part) => String(part || '').toLowerCase().includes(needle)));
    }, [options, query]);

    useEffect(() => {
        if (!open) return undefined;
        const close = () => {
            setOpen(false);
            setQuery('');
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [open]);

    useEffect(() => { setActiveIndex(0); }, [query, open]);

    const selectItem = (item) => {
        if (!item) return;
        onChange?.(item.id);
        setOpen(false);
        setQuery('');
    };

    const handleKeyDown = (event) => {
        if (!open && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
            setOpen(true);
            event.preventDefault();
            return;
        }
        if (!open) return;
        if (event.key === 'ArrowDown') {
            setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            setActiveIndex((index) => Math.max(index - 1, 0));
            event.preventDefault();
        } else if (event.key === 'Enter') {
            selectItem(filtered[activeIndex]);
            event.preventDefault();
        } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
            event.preventDefault();
        }
    };

    return (
        <div className="log-search-select" onClick={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
            <div className={`log-search-control${open ? ' open' : ''}`} onClick={() => setOpen(true)}>
                <Search size={15} />
                <input
                    value={open ? query : selected?.nama_barang || ''}
                    placeholder="Cari / pilih barang"
                    onFocus={() => setOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    required
                />
                <ChevronDown size={16} className={open ? 'open' : ''} />
            </div>
            {open && (
                <div className="log-search-options" role="listbox">
                    {filtered.length === 0 ? <div className="log-search-empty">Barang tidak ditemukan</div> : filtered.map((item, index) => {
                        const isSelected = String(item.id) === String(value);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`${index === activeIndex ? 'active' : ''}${isSelected ? ' selected' : ''}`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectItem(item);
                                }}
                                role="option"
                                aria-selected={isSelected}
                            >
                                <span><strong>{item.nama_barang}</strong><small>{item.kemasan || '-'} x {fmt(item.isi)} | stok {fmt(item.stok)} {item.satuan || ''}</small></span>
                                {isSelected && <Check size={15} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function BarangModal({ form, setForm, onSubmit, onClose }) {
    return <Modal title="Tambah Barang" description="Isi master barang logistik." onClose={onClose}><form onSubmit={onSubmit}><div className="inv-form-grid"><Field label="Nama Barang"><input className="inv-input" required value={form.nama_barang} onChange={(e) => setForm({ nama_barang: e.target.value })} /></Field><Field label="Satuan"><select className="inv-input" required value={form.satuan} onChange={(e) => setForm({ satuan: e.target.value })}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field><Field label="Kemasan"><input className="inv-input" value={form.kemasan} onChange={(e) => setForm({ kemasan: e.target.value })} /></Field><Field label="Isi"><input className="inv-input" type="number" min="1" value={form.isi} onChange={(e) => setForm({ isi: e.target.value })} /></Field><Field label="Merek"><input className="inv-input" value={form.merk} onChange={(e) => setForm({ merk: e.target.value })} /></Field><Field label="Stok Minimum"><input className="inv-input" type="number" min="0" value={form.stok_minimum} onChange={(e) => setForm({ stok_minimum: e.target.value })} /></Field></div><ModalFoot onClose={onClose} /></form></Modal>;
}

function VendorModal({ form, setForm, onSubmit, onClose }) {
    return <Modal title={form.id ? 'Edit Vendor' : 'Tambah Vendor'} description="Lengkapi data rekanan dan PIC." onClose={onClose} icon={<Pencil size={20} />}><form onSubmit={onSubmit}><div className="inv-form-grid"><Field label="Nama Vendor"><input className="inv-input" required value={form.nama} onChange={(e) => setForm({ nama: e.target.value })} /></Field><Field label="Telepon"><input className="inv-input" value={form.telp} onChange={(e) => setForm({ telp: e.target.value })} /></Field><Field label="Alamat"><input className="inv-input" value={form.alamat} onChange={(e) => setForm({ alamat: e.target.value })} /></Field><Field label="Nama PIC"><input className="inv-input" value={form.kc} onChange={(e) => setForm({ kc: e.target.value })} /></Field></div><ModalFoot onClose={onClose} /></form></Modal>;
}

function SpbModal({ mode = 'spb', form, setForm, vendors, purchase, onEditItem, onSubmit, onClose }) {
    const isPenerimaan = mode === 'penerimaan';
    return <Modal title={isPenerimaan ? 'Edit Penerimaan' : 'Tambah SPB'} description={isPenerimaan ? 'Perbarui invoice dan daftar barang penerimaan.' : 'Buat SPB baru untuk dasar penerimaan.'} onClose={onClose} icon={isPenerimaan ? <Pencil size={20} /> : <FilePlus2 size={20} />}><form onSubmit={onSubmit}><div className={isPenerimaan ? 'log-edit-penerimaan-grid' : 'inv-form-grid'}><div className="inv-form-grid log-form-panel"><Field label={isPenerimaan ? 'Tanggal Penerimaan' : 'Tanggal SPB'}><input className="inv-input" type="date" required value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field><Field label="Vendor"><select className="inv-input" required value={form.id_rekanan} onChange={(e) => setForm({ id_rekanan: e.target.value })}><option value="">Pilih vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.nama}</option>)}</select></Field>{isPenerimaan && <Field label="No Invoice"><input className="inv-input" value={form.no_spb} onChange={(e) => setForm({ no_spb: e.target.value })} /></Field>}<Field label="Metode Pembayaran"><input className="inv-input" value={form.metode_pembayaran} onChange={(e) => setForm({ metode_pembayaran: e.target.value })} /></Field></div>{isPenerimaan && <ItemsTable items={purchase?.items || []} editable onEdit={onEditItem} />}</div><ModalFoot onClose={onClose} submitLabel={isPenerimaan ? 'Simpan Penerimaan' : 'Simpan SPB'} /></form></Modal>;
}

function ItemModal({ form, setForm, barang, onSubmit, onClose, purchase }) {
    const qtyMasuk = Number(form.qty || 0) * Number(form.isi || 0);
    const harga = parseMoneyInput(form.harga);
    const grandTotal = Number(form.qty || 0) * harga;
    return <Modal title={form.editing ? 'Edit Barang Masuk' : 'Tambah Barang Masuk'} description="Isi rincian barang yang masuk pada invoice ini." onClose={onClose} icon={form.editing ? <Pencil size={20} /> : <Plus size={20} />}><form onSubmit={onSubmit}><div className="log-penerimaan-layout"><div className="log-split-panel log-info-panel"><h3>Informasi penerimaan</h3><div className="log-summary-list"><div className="log-summary-item"><span>No SPB</span><strong>{purchase?.nomor || '-'}</strong></div><div className="log-summary-item"><span>Vendor</span><strong>{purchase?.pemasok || '-'}</strong></div><div className="log-summary-item"><span>Tanggal</span><strong>{purchase?.tanggal || '-'}</strong></div><div className="log-summary-item"><span>No Invoice</span><strong>{form.no_invoice || purchase?.no_faktur || '-'}</strong></div></div></div><div className="log-split-panel log-item-form"><Field label="No Invoice"><input className="inv-input" value={form.no_invoice} onChange={(e) => setForm({ no_invoice: e.target.value })} /></Field><Field label="Barang"><SearchableBarangSelect options={barang} value={form.barang} onChange={(value) => setForm({ barang: value })} /></Field><Field label="Qty"><input className="inv-input" type="number" min="1" required value={form.qty} onChange={(e) => setForm({ qty: e.target.value })} /></Field><Field label="Isi dalam kemasan"><input className="inv-input" type="number" min="1" required value={form.isi} onChange={(e) => setForm({ isi: e.target.value })} /></Field><Field label="Harga"><input className="inv-input inv-input-right" type="text" inputMode="decimal" placeholder="Rp 0" value={formatMoneyInput(form.harga)} onChange={(e) => setForm({ harga: normalizeMoneyDraft(e.target.value) })} /></Field><div className="log-total-strip"><div><span>Isi pack</span><strong>{fmt(qtyMasuk)}</strong></div><div><span>Qty</span><strong>{fmt(form.qty || 0)}</strong></div><div><span>Harga</span><strong>{harga ? money(harga) : '-'}</strong></div><div className="total"><span>Grand Total</span><strong>{money(grandTotal)}</strong></div></div></div></div><ModalFoot onClose={onClose} submitLabel={form.editing ? 'Simpan Barang' : 'Tambah Barang'} /></form></Modal>;
}

function MutasiModal({ form, setForm, barang, ruang, onSubmit, onClose }) {
    return <Modal title="Barang Keluar" onClose={onClose}><form onSubmit={onSubmit}><div className="inv-form-grid"><Field label="Barang"><select required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}><option value="">Pilih barang</option>{barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang} - stok {fmt(b.stok)}</option>)}</select></Field><Field label="Tanggal"><input type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field><Field label="Ruang"><select required value={form.ruang} onChange={(e) => setForm({ ruang: e.target.value })}><option value="">Pilih ruang</option>{ruang.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</select></Field><Field label="Qty"><input type="number" min="1" value={form.qty} onChange={(e) => setForm({ qty: e.target.value })} /></Field><Field label="Keterangan"><input value={form.keterangan} onChange={(e) => setForm({ keterangan: e.target.value })} /></Field></div><ModalFoot onClose={onClose} /></form></Modal>;
}

function PermintaanModal({ form, setForm, barang, ruang, onSubmit, onClose }) {
    return <Modal title="Permintaan Barang" onClose={onClose}><form onSubmit={onSubmit}><div className="inv-form-grid"><Field label="Barang"><select required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}><option value="">Pilih barang</option>{barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}</select></Field><Field label="Tanggal"><input type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field><Field label="Ruang"><select required value={form.ruang} onChange={(e) => setForm({ ruang: e.target.value })}><option value="">Pilih ruang</option>{ruang.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</select></Field><Field label="Qty Minta"><input type="number" min="1" value={form.qty_minta} onChange={(e) => setForm({ qty_minta: e.target.value })} /></Field><Field label="Catatan"><input value={form.catatan} onChange={(e) => setForm({ catatan: e.target.value })} /></Field></div><ModalFoot onClose={onClose} /></form></Modal>;
}

function OpnameModal({ form, setForm, barang, onSubmit, onClose }) {
    return <Modal title="Stock Opname" onClose={onClose}><form onSubmit={onSubmit}><div className="inv-form-grid"><Field label="Barang"><select required value={form.barang} onChange={(e) => setForm({ barang: e.target.value })}><option value="">Pilih barang</option>{barang.map((b) => <option key={b.id} value={b.id}>{b.nama_barang}</option>)}</select></Field><Field label="Tanggal"><input type="date" value={form.tanggal} onChange={(e) => setForm({ tanggal: e.target.value })} /></Field><Field label="Real Stock"><input type="number" value={form.real_stock} onChange={(e) => setForm({ real_stock: e.target.value })} /></Field><Field label="Keterangan"><input value={form.keterangan} onChange={(e) => setForm({ keterangan: e.target.value })} /></Field></div><ModalFoot onClose={onClose} /></form></Modal>;
}

function ModalFoot({ onClose, submitLabel = 'Simpan' }) {
    return <div className="inv-modal-actions"><button className="inv-btn soft" type="button" onClick={onClose}>Batal</button><button className="inv-btn primary" type="submit"><FilePlus2 size={16} /> {submitLabel}</button></div>;
}

function MiniItems({ items }) {
    return <ItemsTable items={items} />;
}

function ItemsTable({ items, editable = false, onEdit }) {
    const grandTotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.harga || 0), 0);
    if (editable) {
        return (
            <section className="log-items-section">
                <div className="log-items-head">
                    <div>
                        <h3>Daftar Barang</h3>
                        <p>{items.length ? `${items.length} barang tercatat` : 'Belum ada barang masuk.'}</p>
                    </div>
                    <strong>{money(grandTotal)}</strong>
                </div>
                <div className="log-edit-items">
                    {items.map((item) => {
                        const qtyMasuk = Number(item.qty || 0) * Number(item.isi || 0);
                        const total = Number(item.qty || 0) * Number(item.harga || 0);
                        return (
                            <div className="log-edit-item" key={`${item.id}-${item.barang}`}>
                                <div className="name"><strong>{item.barang_nama}</strong><span>{fmt(qtyMasuk)} {item.satuan || ''}</span></div>
                                <div><span>Qty</span><strong>{fmt(item.qty)}</strong></div>
                                <div><span>Isi</span><strong>{fmt(item.isi)}</strong></div>
                                <div><span>Harga</span><strong>{money(item.harga)}</strong></div>
                                <div><span>Total</span><strong>{money(total)}</strong></div>
                                <button className="inv-row-btn" type="button" onClick={() => onEdit(item)} title="Edit barang"><Pencil size={15} /></button>
                            </div>
                        );
                    })}
                    {!items.length && <div className="inv-empty">Belum ada barang di invoice ini.</div>}
                </div>
            </section>
        );
    }
    return (
        <section className="log-items-section">
            <div className="log-items-head">
                <div>
                    <h3>Daftar Barang</h3>
                    <p>{items.length ? `${items.length} barang tercatat` : 'Belum ada barang masuk.'}</p>
                </div>
                <strong>{money(grandTotal)}</strong>
            </div>
            <div className="inv-table-wrap log-items-wrap">
                <table className="inv-table log-items-table">
                    <thead><tr><th>Barang</th><th>Qty</th><th>Isi</th><th>Qty Masuk</th><th>Harga</th><th>Total</th>{editable && <th>Aksi</th>}</tr></thead>
                    <tbody>
                        {items.map((item) => {
                            const qtyMasuk = Number(item.qty || 0) * Number(item.isi || 0);
                            const total = Number(item.qty || 0) * Number(item.harga || 0);
                            return (
                                <tr key={`${item.id}-${item.barang}`}>
                                    <td><strong>{item.barang_nama}</strong><small>{item.satuan || '-'}</small></td>
                                    <td>{fmt(item.qty)}</td>
                                    <td>{fmt(item.isi)}</td>
                                    <td>{fmt(qtyMasuk)} {item.satuan || ''}</td>
                                    <td>{money(item.harga)}</td>
                                    <td><strong>{money(total)}</strong></td>
                                    {editable && <td><button className="inv-row-btn" type="button" onClick={() => onEdit(item)} title="Edit barang"><Pencil size={15} /></button></td>}
                                </tr>
                            );
                        })}
                        {!items.length && <tr><td colSpan={editable ? 7 : 6} className="inv-empty">Belum ada barang di invoice ini.</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function KartuTable({ rows }) {
    return <div className="inv-table-wrap"><table className="inv-table log-table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nomor</th><th>Ruang/Vendor</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.nomor}-${i}`}><td>{r.tanggal}</td><td>{r.jenis}</td><td>{r.nomor}</td><td>{r.ruang || '-'}</td><td>{fmt(r.masuk)}</td><td>{fmt(r.keluar)}</td><td><strong>{fmt(r.saldo)}</strong></td></tr>)}{rows.length === 0 && <tr><td colSpan="7" className="inv-empty">Pilih barang untuk melihat kartu stok.</td></tr>}</tbody></table></div>;
}

const LOG_STYLE = `
.log-page .inv-card { border-radius: 18px; }
.log-page .inv-card-head { border-radius: 18px 18px 0 0; }
.log-table { min-width: 980px; }
.log-table td, .log-table th { white-space: nowrap; }
.log-table td:first-child, .log-table td:nth-child(3) { white-space: normal; }
.inv-row-actions { display: inline-flex; align-items: center; gap: 7px; }
.inv-row-actions button, .inv-row-btn {
  width: 34px; height: 34px; border: 1px solid rgba(226,232,240,.9); border-radius: 10px;
  background: rgba(255,255,255,.86); color: #4f46e5; display: inline-flex; align-items: center;
  justify-content: center; cursor: pointer;
}
.log-modal .inv-close {
  width: auto; min-width: 86px; height: 40px; padding: 0 13px; border-radius: 14px;
  justify-content: center; white-space: nowrap; flex: 0 0 auto;
}
.log-filter-segment {
  display: inline-flex; align-items: center; gap: 4px; min-height: 42px; padding: 4px;
  border-radius: 14px; border: 1px solid rgba(226,232,240,.86);
  background: rgba(248,250,252,.88);
}
.log-filter-segment button {
  border: 0; border-radius: 10px; min-height: 32px; padding: 0 12px;
  background: transparent; color: #64748b; font-size: 12px; font-weight: 900; cursor: pointer;
}
.log-filter-segment button.active {
  color: #4f46e5; background: white; box-shadow: 0 8px 20px rgba(15,23,42,.08);
}
.inv-status { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 900; }
.inv-status.success { color: #047857; background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.22); }
.inv-status.danger { color: #b91c1c; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.22); }
.log-modal.inv-modal.create { width: min(1050px, calc(100vw - 32px)); }
.log-modal.inv-modal.detail { width: min(1220px, calc(100vw - 32px)); }
.log-modal .inv-modal-head { justify-content: space-between; gap: 14px; }
.log-modal-title { display: flex; align-items: center; gap: 13px; min-width: 0; }
.log-modal-title p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 700; }
.log-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.log-detail-grid div { border: 1px solid rgba(226,232,240,.85); border-radius: 14px; padding: 10px; background: rgba(255,255,255,.72); }
.log-detail-grid span { display: block; color: #64748b; font-size: 12px; font-weight: 900; margin-bottom: 4px; text-transform: capitalize; }
.log-detail-grid strong { display: block; color: #0f172a; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
.inv-field select, .inv-field input { width: 100%; border: 1px solid rgba(226,232,240,.95); border-radius: 12px; min-height: 40px; padding: 8px 11px; font: inherit; font-size: 13px; font-weight: 750; color: #0f172a; background: rgba(255,255,255,.9); }
.log-page .inv-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .log-penerimaan-layout { display: grid; grid-template-columns: minmax(260px, 340px) minmax(420px, 1fr); gap: 14px; align-items: start; }
    .log-edit-penerimaan-grid { display: grid; grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .log-form-panel { border: 1px solid rgba(226,232,240,.86); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.58); grid-template-columns: 1fr; align-self: start; }
    .log-split-panel { border: 1px solid rgba(226,232,240,.9); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.7); display: grid; gap: 10px; }
    .log-info-panel { align-self: start; }
    .log-item-form { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
    .log-item-form label:nth-child(2) { grid-column: span 2; }
    .log-split-panel h3 { margin: 0; font-size: 14px; color: #0f172a; }
    .log-summary-list { display: grid; gap: 8px; }
    .log-summary-item { border: 1px solid rgba(226,232,240,.8); border-radius: 12px; padding: 9px 10px; background: white; }
    .log-summary-item span { display: block; color: #64748b; font-size: 11px; font-weight: 900; margin-bottom: 3px; }
    .log-summary-item strong { display: block; color: #0f172a; font-size: 13px; }
    .log-summary-item.total { background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(6,182,212,.10)); border-color: rgba(99,102,241,.2); }
    .log-search-select { position: relative; width: 100%; }
    .log-search-control {
      min-height: 40px; border: 1px solid rgba(226,232,240,.95); border-radius: 12px;
      padding: 0 10px; display: flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,.92); color: #64748b;
    }
    .log-search-control.open { border-color: rgba(99,102,241,.42); box-shadow: 0 0 0 4px rgba(99,102,241,.10); }
    .log-search-control input {
      border: 0; outline: 0; background: transparent; min-width: 0; flex: 1;
      font: inherit; font-size: 13px; font-weight: 800; color: #0f172a;
    }
    .log-search-control svg:last-child { transition: transform .18s ease; }
    .log-search-control svg:last-child.open { transform: rotate(180deg); }
    .log-search-options {
      position: absolute; z-index: 1300; top: calc(100% + 8px); left: 0; right: 0;
      max-height: 280px; overflow-y: auto; padding: 8px; border-radius: 16px;
      border: 1px solid rgba(226,232,240,.86); background: rgba(255,255,255,.96);
      box-shadow: 0 22px 45px rgba(15,23,42,.18); backdrop-filter: blur(18px);
    }
    .log-search-options button {
      width: 100%; border: 0; background: transparent; border-radius: 12px; padding: 10px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      text-align: left; color: #0f172a; cursor: pointer;
    }
    .log-search-options button.active, .log-search-options button:hover { background: rgba(99,102,241,.10); }
    .log-search-options button.selected { color: #4f46e5; }
    .log-search-options strong { display: block; font-size: 13px; line-height: 1.25; }
    .log-search-options small { display: block; margin-top: 3px; color: #64748b; font-size: 11px; font-weight: 800; }
    .log-search-empty { padding: 12px; color: #64748b; font-size: 12px; font-weight: 850; }
    .log-total-strip { grid-column: span 2; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .log-total-strip div { border: 1px solid rgba(226,232,240,.82); border-radius: 12px; padding: 9px 10px; background: white; }
    .log-total-strip span { display: block; color: #64748b; font-size: 11px; font-weight: 900; margin-bottom: 3px; }
    .log-total-strip strong { display: block; color: #0f172a; font-size: 13px; }
    .log-total-strip .total { background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(6,182,212,.10)); border-color: rgba(99,102,241,.2); }
    .log-items-section { border: 1px solid rgba(255,255,255,.68); border-radius: 20px; padding: 16px; background: rgba(255,255,255,.72); display: grid; gap: 12px; }
    .log-items-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .log-items-head h3 { margin: 0; font-size: 15px; color: #0f172a; font-weight: 950; }
    .log-items-head p { margin: 4px 0 0; color: #64748b; font-size: 12px; font-weight: 750; }
    .log-items-head > strong { color: #4f46e5; font-size: 15px; }
    .log-items-wrap { border-radius: 16px; }
    .log-items-table { min-width: 760px; }
    .log-items-table td small { display: block; color: #64748b; font-size: 11px; margin-top: 3px; }
    .log-items-table th, .log-items-table td { white-space: nowrap; }
    .log-items-table td:first-child { white-space: normal; min-width: 220px; }
    .log-edit-items { display: grid; gap: 9px; }
    .log-edit-item { display: grid; grid-template-columns: minmax(180px, 1.4fr) repeat(4, minmax(72px, .55fr)) 38px; gap: 8px; align-items: center; border: 1px solid rgba(226,232,240,.86); border-radius: 14px; padding: 10px; background: rgba(255,255,255,.82); }
    .log-edit-item .name { min-width: 0; }
    .log-edit-item .name strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .log-edit-item .name span, .log-edit-item div span { display: block; color: #64748b; font-size: 11px; font-weight: 850; margin-top: 2px; }
    .log-edit-item div strong { display: block; color: #0f172a; font-size: 12px; line-height: 1.25; }
    @media (max-width: 1100px) { .log-penerimaan-layout, .log-edit-penerimaan-grid { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .log-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .log-edit-item { grid-template-columns: minmax(0, 1fr) 38px; } .log-edit-item div:not(.name) { display: none; } }
    @media (max-width: 760px) { .log-page .inv-form-grid, .log-detail-grid, .log-penerimaan-layout, .log-item-form, .log-total-strip { grid-template-columns: 1fr; } .log-item-form label:nth-child(2), .log-total-strip { grid-column: auto; } .log-filter-segment { width: 100%; } .log-filter-segment button { flex: 1; } }
`;




