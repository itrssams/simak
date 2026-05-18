import { useState, useEffect } from 'react';
import { useToastState } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';

const STATUS_COLOR = {
    draft: { bg: '#f1f5f9', color: '#475569' },
    dikirim: { bg: '#dbeafe', color: '#1e40af' },
    sebagian: { bg: '#fff7ed', color: '#c2410c' },
    lunas: { bg: '#dcfce7', color: '#166534' },
    batal: { bg: '#fee2e2', color: '#991b1b' },
};
const STATUS_LABEL = { draft: 'Draft', dikirim: 'Dikirim', sebagian: 'Dibayar Sebagian', lunas: 'Lunas', batal: 'Dibatalkan' };
const METODE_OPTIONS = [
    { value: 'tunai', label: 'Tunai' },
    { value: 'transfer', label: 'Transfer Bank' },
    { value: 'bpjs', label: 'BPJS' },
    { value: 'asuransi', label: 'Asuransi' },
];

const formatRp = (v) => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 0 });
const formatTgl = (v) => v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const generateNomor = () => { const n = new Date(); return `INV-${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}-${String(n.getTime()).slice(-4)}`; };
const emptyItem = { deskripsi: '', kuantitas: 1, harga_satuan: '', subtotal: 0 };

export default function FakturPelanggan() {
    const [list, setList] = useState([]);
    const [pelangganList, setPelangganList] = useState([]);
    const [akunList, setAkunList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('list'); // list | form | detail
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useToastState('error');
    const [success, setSuccess] = useToastState('success');
    const [filterStatus, setFilterStatus] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    // Form state
    const [form, setForm] = useState({
        nomor_faktur: generateNomor(),
        tanggal: new Date().toISOString().split('T')[0],
        jatuh_tempo: '',
        pelanggan: '',
        keterangan: '',
        status: 'draft',
        items: [{ ...emptyItem }],
    });

    // Bayar modal
    const [bayarModal, setBayarModal] = useState(false);
    const [bayarForm, setBayarForm] = useState({ tanggal: new Date().toISOString().split('T')[0], jumlah: '', metode: 'tunai', keterangan: '', akun: '' });

    useEffect(() => { fetchAll(); }, [page, pageSize]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [f, p, a] = await Promise.all([
                api.get('/keuangan/faktur/', { params: pageParams(page, pageSize) }),
                api.get('/keuangan/pelanggan/'),
                api.get('/keuangan/akun/'),
            ]);
            setList(getResults(f.data));
            setTotal(getCount(f.data));
            setPelangganList(getResults(p.data));
            setAkunList(getResults(a.data));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const totalForm = form.items.reduce((a, b) => a + (Number(b.kuantitas) || 0) * (Number(b.harga_satuan) || 0), 0);

    const handleItemChange = (i, field, val) => {
        const items = [...form.items];
        items[i] = { ...items[i], [field]: val };
        setForm({ ...form, items });
    };

    const addItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
    const removeItem = (i) => { if (form.items.length <= 1) return; setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) }); };

    const openForm = () => {
        setForm({ nomor_faktur: generateNomor(), tanggal: new Date().toISOString().split('T')[0], jatuh_tempo: '', pelanggan: '', keterangan: '', status: 'draft', items: [{ ...emptyItem }] });
        setError('');
        setView('form');
    };

    const handleSave = async () => {
        setError('');
        if (!form.pelanggan || !form.tanggal || !form.jatuh_tempo) { setError('Pelanggan, tanggal, dan jatuh tempo wajib diisi.'); return; }
        const validItems = form.items.filter(i => i.deskripsi && Number(i.harga_satuan) > 0);
        if (validItems.length === 0) { setError('Minimal 1 item faktur.'); return; }
        setSaving(true);
        try {
            await api.post('/keuangan/faktur/', {
                ...form,
                items: validItems.map(i => ({ deskripsi: i.deskripsi, kuantitas: Number(i.kuantitas), harga_satuan: Number(i.harga_satuan), subtotal: Number(i.kuantitas) * Number(i.harga_satuan) })),
            });
            setSuccess('Faktur berhasil dibuat!');
            setView('list');
            fetchAll();
            setTimeout(() => setSuccess(''), 3000);
        } catch { setError('Gagal menyimpan faktur. Pastikan nomor faktur belum dipakai.'); }
        finally { setSaving(false); }
    };

    const openDetail = async (item) => {
        try {
            const res = await api.get(`/keuangan/faktur/${item.id}/`);
            setSelected(res.data);
            setView('detail');
        } catch { setError('Gagal memuat detail faktur.'); }
    };

    const handleKirim = async () => {
        try {
            await api.post(`/keuangan/faktur/${selected.id}/kirim/`);
            setSuccess('Faktur berhasil dikirim!');
            const res = await api.get(`/keuangan/faktur/${selected.id}/`);
            setSelected(res.data);
            fetchAll();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError(e.response?.data?.error || 'Gagal mengirim faktur.'); }
    };

    const handleBatal = async () => {
        if (!window.confirm('Batalkan faktur ini?')) return;
        try {
            await api.post(`/keuangan/faktur/${selected.id}/batal/`);
            setSuccess('Faktur dibatalkan.');
            const res = await api.get(`/keuangan/faktur/${selected.id}/`);
            setSelected(res.data);
            fetchAll();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError(e.response?.data?.error || 'Gagal membatalkan.'); }
    };

    const handleBayar = async () => {
        setError('');
        if (!bayarForm.jumlah || !bayarForm.akun) { setError('Jumlah dan akun wajib diisi.'); return; }
        setSaving(true);
        try {
            await api.post(`/keuangan/faktur/${selected.id}/bayar/`, { ...bayarForm, faktur: selected.id, jumlah: Number(bayarForm.jumlah) });
            setSuccess('Pembayaran berhasil dicatat!');
            setBayarModal(false);
            const res = await api.get(`/keuangan/faktur/${selected.id}/`);
            setSelected(res.data);
            fetchAll();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencatat pembayaran.'); }
        finally { setSaving(false); }
    };

    const filtered = list.filter(i => {
        const matchStatus = filterStatus ? i.status === filterStatus : true;
        const matchSearch = i.nomor_faktur.toLowerCase().includes(search.toLowerCase()) || (i.pelanggan_detail?.nama || '').toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch;
    });

    return (
        <div>
            <style>{`
                .fi { width:100%; padding:9px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px; font-family:'Plus Jakarta Sans',sans-serif; color:#1e293b; background:#fff; outline:none; }
                .fi:focus { border-color:#2d6a4f; box-shadow:0 0 0 3px rgba(45,106,79,0.08); }
                .fta { resize:vertical; min-height:60px; }
                .btn-primary { padding:9px 20px; background:#1a4731; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
                .btn-primary:hover { background:#2d6a4f; }
                .btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
                .btn-secondary { padding:9px 18px; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
                .btn-secondary:hover { background:#e2e8f0; }
                .btn-gold { padding:9px 18px; background:#c9a84c; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
                .btn-gold:hover { background:#b8923d; }
                .btn-danger { padding:9px 18px; background:#fff; color:#dc2626; border:1px solid #fca5a5; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
                .btn-danger:hover { background:#fee2e2; }
                .btn-sm { padding:5px 12px; font-size:12px; border-radius:6px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
                .dt { width:100%; border-collapse:collapse; }
                .dt thead th { padding:11px 14px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #e2e8f0; background:#f8fafc; }
                .dt tbody td { padding:12px 14px; font-size:13px; color:#334155; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
                .dt tbody tr:hover td { background:#f8fafb; cursor:pointer; }
                .it { width:100%; border-collapse:collapse; }
                .it th { padding:9px 10px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; background:#f8fafc; border-bottom:2px solid #e2e8f0; }
                .it td { padding:7px 6px; border-bottom:1px solid #f1f5f9; }
                .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:999; }
                .modal { background:#fff; border-radius:16px; padding:28px; width:480px; box-shadow:0 8px 40px rgba(0,0,0,0.18); max-height:90vh; overflow-y:auto; }
                .page-btn,.page-size{height:34px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;padding:0 10px}
                .page-btn{min-width:34px;cursor:pointer}.page-btn:disabled{opacity:.45;cursor:not-allowed}
            `}</style>

            {/* HEADER */}
            <div style={S.header}>
                <div>
                    <h1 style={S.title}>Faktur Pelanggan</h1>
                    <p style={S.sub}>{list.length} faktur tercatat</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {view !== 'list' && <button className="btn-secondary" onClick={() => setView('list')}>← Kembali</button>}
                    {view === 'list' && <button className="btn-primary" onClick={openForm}>+ Faktur Baru</button>}
                </div>
            </div>

            {success && <div style={S.ok}>{success}</div>}
            {error && view !== 'form' && <div style={S.err}>{error}</div>}

            {/* LIST */}
            {view === 'list' && (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <input className="fi" style={{ width: '240px' }} placeholder="Cari nomor / pelanggan..." value={search} onChange={e => setSearch(e.target.value)} />
                        <select className="fi" style={{ width: '180px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">Semua Status</option>
                            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div style={S.card}>
                        {loading ? <div style={S.empty}>Memuat...</div> : filtered.length === 0 ? <div style={S.empty}>Belum ada faktur.</div> : (
                            <table className="dt">
                                <thead><tr>
                                    <th>No. Faktur</th><th>Pelanggan</th><th>Tanggal</th><th>Jatuh Tempo</th>
                                    <th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Sisa</th><th>Status</th>
                                </tr></thead>
                                <tbody>
                                    {filtered.map(f => (
                                        <tr key={f.id} onClick={() => openDetail(f)}>
                                            <td style={{ fontWeight: '600', color: '#1a4731', fontFamily: 'monospace' }}>{f.nomor_faktur}</td>
                                            <td>{f.pelanggan_detail?.nama}</td>
                                            <td>{formatTgl(f.tanggal)}</td>
                                            <td style={{ color: new Date(f.jatuh_tempo) < new Date() && f.status !== 'lunas' ? '#dc2626' : '#334155' }}>{formatTgl(f.jatuh_tempo)}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>Rp {formatRp(f.total_tagihan)}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: Number(f.sisa_tagihan) > 0 ? '#dc2626' : '#166534' }}>Rp {formatRp(f.sisa_tagihan)}</td>
                                            <td><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', ...STATUS_COLOR[f.status] }}>{STATUS_LABEL[f.status]}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <SimplePagination page={page} pageSize={pageSize} total={search || filterStatus ? filtered.length : total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="page-btn" selectClassName="page-size" />
                    </div>
                </>
            )}

            {/* FORM BUAT FAKTUR */}
            {view === 'form' && (
                <div style={S.card}>
                    <span style={S.sectionTitle}>Faktur Baru</span>
                    {error && <div style={{ ...S.err, marginBottom: '16px' }}>{error}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div style={S.field}><label style={S.lbl}>No. Faktur *</label><input className="fi" value={form.nomor_faktur} onChange={e => setForm({ ...form, nomor_faktur: e.target.value })} /></div>
                        <div style={S.field}><label style={S.lbl}>Tanggal *</label><input className="fi" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} /></div>
                        <div style={S.field}><label style={S.lbl}>Jatuh Tempo *</label><input className="fi" type="date" value={form.jatuh_tempo} onChange={e => setForm({ ...form, jatuh_tempo: e.target.value })} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div style={S.field}>
                            <label style={S.lbl}>Pelanggan *</label>
                            <select className="fi" value={form.pelanggan} onChange={e => setForm({ ...form, pelanggan: e.target.value })}>
                                <option value="">-- Pilih Pelanggan --</option>
                                {pelangganList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                            </select>
                        </div>
                        <div style={S.field}><label style={S.lbl}>Keterangan</label><input className="fi" placeholder="Catatan..." value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} /></div>
                    </div>

                    {/* Items */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a2e1a' }}>Item Layanan</span>
                            <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={addItem}>+ Tambah Baris</button>
                        </div>
                        <table className="it">
                            <thead><tr>
                                <th style={{ width: '40%' }}>Deskripsi</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                                <th style={{ width: '22%', textAlign: 'right' }}>Harga Satuan</th>
                                <th style={{ width: '20%', textAlign: 'right' }}>Subtotal</th>
                                <th style={{ width: '6%' }}></th>
                            </tr></thead>
                            <tbody>
                                {form.items.map((item, i) => (
                                    <tr key={i}>
                                        <td><input className="fi" placeholder="Nama layanan..." value={item.deskripsi} onChange={e => handleItemChange(i, 'deskripsi', e.target.value)} /></td>
                                        <td><input className="fi" type="number" min="1" value={item.kuantitas} onChange={e => handleItemChange(i, 'kuantitas', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td><input className="fi" type="number" min="0" placeholder="0" value={item.harga_satuan} onChange={e => handleItemChange(i, 'harga_satuan', e.target.value)} style={{ textAlign: 'right' }} /></td>
                                        <td style={{ textAlign: 'right', padding: '7px 10px', fontFamily: 'monospace', fontSize: '13px', color: '#1a4731', fontWeight: '600' }}>
                                            {formatRp((Number(item.kuantitas) || 0) * (Number(item.harga_satuan) || 0))}
                                        </td>
                                        <td style={{ textAlign: 'center' }}><button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}>×</button></td>
                                    </tr>
                                ))}
                                <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={3} style={{ padding: '10px 14px', fontWeight: '700', fontSize: '14px' }}>Total</td>
                                    <td style={{ textAlign: 'right', padding: '10px 10px', fontFamily: 'monospace', fontWeight: '700', fontSize: '14px', color: '#1a4731' }}>Rp {formatRp(totalForm)}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                        <button className="btn-secondary" onClick={() => setView('list')}>Batal</button>
                        <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Faktur'}</button>
                    </div>
                </div>
            )}

            {/* DETAIL */}
            {view === 'detail' && selected && (
                <div style={S.card}>
                    {/* Header detail */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a2e1a', fontFamily: 'monospace' }}>{selected.nomor_faktur}</h2>
                            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{selected.pelanggan_detail?.nama} · {selected.pelanggan_detail?.tipe_label}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', ...STATUS_COLOR[selected.status] }}>{STATUS_LABEL[selected.status]}</span>
                            {selected.status === 'draft' && <button className="btn-gold" onClick={handleKirim}>Kirim</button>}
                            {['dikirim', 'sebagian'].includes(selected.status) && <button className="btn-primary" onClick={() => { setBayarForm({ tanggal: new Date().toISOString().split('T')[0], jumlah: selected.sisa_tagihan, metode: 'tunai', keterangan: '', akun: '' }); setBayarModal(true); setError(''); }}>Catat Pembayaran</button>}
                            {!['lunas', 'batal'].includes(selected.status) && <button className="btn-danger" onClick={handleBatal}>Batalkan</button>}
                        </div>
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: '32px', padding: '14px 18px', background: '#f8fafc', borderRadius: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        {[['Tanggal', formatTgl(selected.tanggal)], ['Jatuh Tempo', formatTgl(selected.jatuh_tempo)], ['Total Tagihan', `Rp ${formatRp(selected.total_tagihan)}`], ['Dibayar', `Rp ${formatRp(selected.total_dibayar)}`], ['Sisa', `Rp ${formatRp(selected.sisa_tagihan)}`]].map(([k, v]) => (
                            <div key={k}><div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px', textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: '14px', fontWeight: '600', color: k === 'Sisa' && Number(selected.sisa_tagihan) > 0 ? '#dc2626' : '#1e293b' }}>{v}</div></div>
                        ))}
                    </div>

                    {/* Items */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>Item Layanan</div>
                        <table className="dt">
                            <thead><tr><th>Deskripsi</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Harga Satuan</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                            <tbody>
                                {selected.items?.map((item, i) => (
                                    <tr key={i}>
                                        <td>{item.deskripsi}</td>
                                        <td style={{ textAlign: 'right' }}>{item.kuantitas}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>Rp {formatRp(item.harga_satuan)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '600', color: '#1a4731' }}>Rp {formatRp(item.subtotal)}</td>
                                    </tr>
                                ))}
                                <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={3} style={{ padding: '10px 14px', fontWeight: '700' }}>Total</td>
                                    <td style={{ textAlign: 'right', padding: '10px 14px', fontFamily: 'monospace', fontWeight: '700', color: '#1a4731' }}>Rp {formatRp(selected.total_tagihan)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Riwayat Pembayaran */}
                    {selected.pembayaran?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>Riwayat Pembayaran</div>
                            <table className="dt">
                                <thead><tr><th>Tanggal</th><th>Metode</th><th>Akun</th><th>Keterangan</th><th style={{ textAlign: 'right' }}>Jumlah</th></tr></thead>
                                <tbody>
                                    {selected.pembayaran.map((p, i) => (
                                        <tr key={i}>
                                            <td>{formatTgl(p.tanggal)}</td>
                                            <td>{METODE_OPTIONS.find(m => m.value === p.metode)?.label || p.metode}</td>
                                            <td style={{ fontSize: '12px' }}>{p.akun_detail?.kode_akun} - {p.akun_detail?.nama_akun}</td>
                                            <td>{p.keterangan || '-'}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '600', color: '#166534' }}>Rp {formatRp(p.jumlah)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL BAYAR */}
            {bayarModal && (
                <div className="overlay">
                    <div className="modal">
                        <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#1a2e1a', marginBottom: '20px' }}>Catat Pembayaran</h3>
                        {error && <div style={{ ...S.err, marginBottom: '14px' }}>{error}</div>}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                            <div style={S.field}><label style={S.lbl}>Tanggal</label><input className="fi" type="date" value={bayarForm.tanggal} onChange={e => setBayarForm({ ...bayarForm, tanggal: e.target.value })} /></div>
                            <div style={S.field}><label style={S.lbl}>Metode</label>
                                <select className="fi" value={bayarForm.metode} onChange={e => setBayarForm({ ...bayarForm, metode: e.target.value })}>
                                    {METODE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={S.field}><label style={S.lbl}>Jumlah *</label><input className="fi" type="number" min="0" value={bayarForm.jumlah} onChange={e => setBayarForm({ ...bayarForm, jumlah: e.target.value })} /></div>
                        <div style={S.field}>
                            <label style={S.lbl}>Akun Kas *</label>
                            <select className="fi" value={bayarForm.akun} onChange={e => setBayarForm({ ...bayarForm, akun: e.target.value })}>
                                <option value="">-- Pilih Akun --</option>
                                {akunList.filter(a => a.is_kas_setara || a.tipe === 'aset_lancar').map(a => <option key={a.id} value={a.id}>{a.kode_akun} - {a.nama_akun}</option>)}
                            </select>
                        </div>
                        <div style={S.field}><label style={S.lbl}>Keterangan</label><input className="fi" placeholder="Catatan pembayaran..." value={bayarForm.keterangan} onChange={e => setBayarForm({ ...bayarForm, keterangan: e.target.value })} /></div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                            <button className="btn-secondary" onClick={() => setBayarModal(false)}>Batal</button>
                            <button className="btn-primary" onClick={handleBayar} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Pembayaran'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const S = {
    header: { marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: '24px', fontWeight: '700', color: '#1a2e1a' },
    sub: { fontSize: '14px', color: '#64748b', marginTop: '4px' },
    ok: { background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', padding: '12px 16px', fontSize: '14px', marginBottom: '16px' },
    err: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', padding: '12px 16px', fontSize: '14px' },
    card: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', padding: '24px' },
    empty: { padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' },
    sectionTitle: { fontSize: '16px', fontWeight: '700', color: '#1a2e1a', marginBottom: '20px', display: 'block' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
    lbl: { fontSize: '13px', fontWeight: '600', color: '#475569' },
};
