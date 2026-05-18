import { useState, useEffect, useMemo } from 'react';
import { useToastState } from '../../context/ToastContext';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { createPortal } from 'react-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtDT = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const BANK_META = {
    bri: { label: 'BRI', grad: 'linear-gradient(135deg,#1565c0,#1976d2)', light: '#e3f2fd', color: '#1565c0', text: '#fff' },
    bsi: { label: 'BSI', grad: 'linear-gradient(135deg,#1b5e20,#2e7d32)', light: '#e8f5e9', color: '#1b5e20', text: '#fff' },
    lainnya: { label: 'Bank Lainnya', grad: 'linear-gradient(135deg,#4a148c,#6a1b9a)', light: '#f3e5f5', color: '#4a148c', text: '#fff' },
};

const BANK_OPTIONS = [
    { value: 'bri', label: 'Bank BRI' },
    { value: 'bsi', label: 'Bank BSI' },
    { value: 'lainnya', label: 'Bank Lainnya' },
];

const initialForm = { nama_rekening: '', bank: 'bri', nama_bank: '', nomor_rekening: '', saldo: '', keterangan: '', is_active: true };

const STYLES = `
@keyframes fadeInUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn     { from{opacity:0} to{opacity:1} }
@keyframes slideUp    { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes shimmer    { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
@keyframes pulse-glow { 0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.2)} 50%{box-shadow:0 0 0 8px rgba(255,255,255,0)} }
@keyframes countUp    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes barGrow    { from{width:0} to{width:var(--w)} }

.rb-page { animation: fadeInUp .4s ease both; }
.rb-tr   { animation: fadeInUp .3s ease both; }

/* ── Inputs ── */
.rb-input,.rb-select,.rb-textarea {
    width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px;
    font-size:14px; font-family:'Plus Jakarta Sans',sans-serif; color:#1e293b;
    background:#fff; outline:none; transition:border-color .15s,box-shadow .15s; box-sizing:border-box;
}
.rb-input:focus,.rb-select:focus,.rb-textarea:focus { border-color:#2d6a4f; box-shadow:0 0 0 3px rgba(45,106,79,.08); }
.rb-textarea { resize:vertical; min-height:70px; line-height:1.55; }

/* ── Buttons ── */
.rb-btn-primary {
    padding:10px 22px; background:#1a4731; color:#fff; border:none; border-radius:8px;
    font-size:14px; font-weight:600; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif;
    transition:background .15s,transform .1s,box-shadow .15s;
    display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
}
.rb-btn-primary:hover  { background:#153d28; transform:translateY(-1px); box-shadow:0 4px 12px rgba(26,71,49,.25); }
.rb-btn-primary:disabled { opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
.rb-btn-primary.danger { background:#dc2626; }
.rb-btn-primary.danger:hover { background:#b91c1c; }
.rb-btn-ghost {
    padding:10px 20px; background:#f1f5f9; color:#475569;
    border:1px solid #e2e8f0; border-radius:8px; font-size:14px; font-weight:600;
    cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; transition:background .15s;
}
.rb-btn-ghost:hover { background:#e2e8f0; }
.rb-btn-sm {
    padding:6px 13px; border-radius:7px; font-size:12px; font-weight:600;
    cursor:pointer; border:1px solid; font-family:'Plus Jakarta Sans',sans-serif;
    transition:background .14s,transform .1s,box-shadow .12s; white-space:nowrap;
}
.rb-btn-sm:hover { transform:translateY(-1px); box-shadow:0 3px 8px rgba(0,0,0,.1); }
.rb-btn-sm.g { border-color:#86efac; color:#166534; background:#fff; }
.rb-btn-sm.g:hover { background:#dcfce7; }
.rb-btn-sm.r { border-color:#fca5a5; color:#dc2626; background:#fff; }
.rb-btn-sm.r:hover { background:#fee2e2; }
.rb-btn-sm.n { border-color:#e2e8f0; color:#475569; background:#fff; }
.rb-btn-sm.n:hover { background:#f8fafc; }
.rb-btn-sm.b { border-color:#93c5fd; color:#1d4ed8; background:#fff; }
.rb-btn-sm.b:hover { background:#eff6ff; }

/* ── Bank card ── */
.rb-card {
    position:relative; overflow:hidden; border-radius:20px;
    cursor:pointer; transition:transform .2s, box-shadow .2s;
    animation:fadeInUp .4s ease both;
}
.rb-card:hover { transform:translateY(-4px); box-shadow:0 20px 50px rgba(0,0,0,.18) !important; }
.rb-card-shimmer {
    position:absolute; top:0; left:0; width:40%; height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);
    transform:translateX(-100%); pointer-events:none;
}
.rb-card:hover .rb-card-shimmer { animation:shimmer 1s ease; }

/* ── Summary cards ── */
.rb-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:28px; }
.rb-sum-card {
    background:#fff; border-radius:16px; padding:22px 24px;
    box-shadow:0 2px 12px rgba(0,0,0,.06); border:1px solid #f1f5f9;
    animation:fadeInUp .4s ease both; transition:box-shadow .2s,transform .2s; position:relative; overflow:hidden;
}
.rb-sum-card:hover { box-shadow:0 6px 24px rgba(0,0,0,.1); transform:translateY(-2px); }

/* ── Tables ── */
.rb-table { width:100%; border-collapse:collapse; }
.rb-table thead th { padding:12px 16px; text-align:left; font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #e2e8f0; background:#f8fafc; }
.rb-table tbody td { padding:13px 16px; font-size:13px; color:#334155; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
.rb-table tbody tr:last-child td { border-bottom:none; }
.rb-table tbody tr:hover td { background:#f8fafb; }
.rb-htable { width:100%; border-collapse:collapse; font-size:12px; }
.rb-htable th { padding:9px 14px; text-align:left; font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
.rb-htable td { padding:9px 14px; color:#334155; border-bottom:1px solid #f1f5f9; }
.rb-htable tr:last-child td { border-bottom:none; }

/* ── Modal ── */
.rb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px; animation:fadeIn .18s ease; backdrop-filter:blur(3px); }
.rb-modal { background:#fff; border-radius:16px; padding:32px; width:100%; max-width:560px; max-height:90vh; overflow-y:auto; box-shadow:0 8px 40px rgba(0,0,0,.18); animation:slideUp .22s ease; }
.rb-modal.sm { max-width:440px; }
.rb-modal.lg { max-width:880px; }
.rb-field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
.rb-label { font-size:13px; font-weight:600; color:#475569; }
.rb-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.rb-modal-footer { display:flex; gap:12px; justify-content:flex-end; padding-top:16px; border-top:1px solid #f1f5f9; }
.rb-alert-ok  { background:#dcfce7; border:1px solid #86efac; border-radius:8px; color:#166534; padding:12px 16px; font-size:14px; margin-bottom:16px; animation:fadeInUp .25s ease; }
.rb-alert-err { background:#fee2e2; border:1px solid #fca5a5; border-radius:8px; color:#991b1b; padding:12px 16px; font-size:14px; margin-bottom:16px; }

/* ── History ── */
.rb-history { background:#fff; border-radius:20px; border:1px solid #f1f5f9; box-shadow:0 2px 12px rgba(0,0,0,.05); padding:28px; margin-top:8px; animation:fadeInUp .4s ease both; }
.rb-filter-select,.rb-filter-input { padding:8px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px; font-family:'Plus Jakarta Sans',sans-serif; color:#334155; background:#f8fafc; outline:none; cursor:pointer; font-weight:500; transition:border-color .15s; }
.rb-filter-select:focus,.rb-filter-input:focus { border-color:#2d6a4f; }
.rb-recent-item { display:flex; align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid #f8fafc; animation:fadeInUp .3s ease both; }
.rb-recent-item:last-child { border-bottom:none; }

/* ── Progress bar ── */
.rb-bar-track { height:3px; background:rgba(255,255,255,.2); border-radius:99px; overflow:hidden; margin-top:12px; }
.rb-bar-fill  { height:100%; border-radius:99px; background:rgba(255,255,255,.6); animation:barGrow .9s .3s cubic-bezier(.4,0,.2,1) both; }

/* datepicker & recharts tooltip */
.recharts-tooltip-wrapper .recharts-default-tooltip { font-family:'Plus Jakarta Sans',sans-serif !important; border-radius:10px !important; border:1px solid #e2e8f0 !important; }
`;

function Modal({ children }) {
    return createPortal(<div className="rb-overlay">{children}</div>, document.body);
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function RekeningBank() {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [saving, setSaving] = useState(false);

    const [modalTambah, setModalTambah] = useState(false);
    const [modalEdit, setModalEdit] = useState(null);
    const [modalUpdateSaldo, setModalUpdateSaldo] = useState(null);
    const [modalHistory, setModalHistory] = useState(null);
    const [modalHapus, setModalHapus] = useState(null);

    const [form, setForm] = useState(initialForm);
    const [updateSaldoForm, setUpdateSaldoForm] = useState({ saldo_baru: '', keterangan: '' });

    useEffect(() => { fetchList(); }, []);

    const fetchList = async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/rekening/');
            setList(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const resetError = () => setError('');

    const handleTambah = async () => {
        resetError();
        const { nama_rekening, bank, nomor_rekening } = form;
        if (!nama_rekening || !bank || !nomor_rekening) return setError('Nama rekening, bank, dan nomor rekening wajib diisi.');
        if (form.bank === 'lainnya' && !form.nama_bank) return setError('Nama bank wajib diisi.');
        setSaving(true);
        try {
            await api.post('/keuangan/rekening/', form);
            showSuccess('Rekening berhasil ditambahkan!');
            setModalTambah(false); setForm(initialForm); fetchList();
        } catch (e) { setError(e.response?.data?.nomor_rekening?.[0] || e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleEdit = async () => {
        resetError();
        const { nama_rekening, bank, nomor_rekening } = form;
        if (!nama_rekening || !bank || !nomor_rekening) return setError('Nama rekening, bank, dan nomor rekening wajib diisi.');
        setSaving(true);
        try {
            await api.put(`/keuangan/rekening/${modalEdit.id}/`, form);
            showSuccess('Rekening berhasil diperbarui!');
            setModalEdit(null); setForm(initialForm); fetchList();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal memperbarui.'); }
        finally { setSaving(false); }
    };

    const handleUpdateSaldo = async () => {
        resetError();
        if (updateSaldoForm.saldo_baru === '') return setError('Saldo baru wajib diisi.');
        if (Number(updateSaldoForm.saldo_baru) < 0) return setError('Saldo tidak boleh negatif.');
        setSaving(true);
        try {
            await api.post(`/keuangan/rekening/${modalUpdateSaldo.id}/update-saldo/`, updateSaldoForm);
            showSuccess('Saldo berhasil diperbarui!');
            setModalUpdateSaldo(null); setUpdateSaldoForm({ saldo_baru: '', keterangan: '' }); fetchList();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal memperbarui saldo.'); }
        finally { setSaving(false); }
    };

    const handleHapus = async () => {
        setSaving(true);
        try {
            await api.delete(`/keuangan/rekening/${modalHapus.id}/`);
            showSuccess('Rekening berhasil dihapus!');
            setModalHapus(null); fetchList();
        } catch { setError('Gagal menghapus rekening.'); }
        finally { setSaving(false); }
    };

    const totalSaldo = list.reduce((a, b) => a + Number(b.saldo), 0);
    const totalBRI = list.filter(r => r.bank === 'bri').reduce((a, b) => a + Number(b.saldo), 0);
    const totalBSI = list.filter(r => r.bank === 'bsi').reduce((a, b) => a + Number(b.saldo), 0);
    const maxSaldo = Math.max(...list.map(r => Number(r.saldo)), 1);

    return (
        <div className="rb-page">
            <style>{STYLES}</style>

            {/* Header */}
            <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a2e1a' }}>Rekening Bank</h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Pantau dan kelola saldo rekening bank rumah sakit</p>
                </div>
                <button className="rb-btn-primary" onClick={() => { setForm(initialForm); resetError(); setModalTambah(true); }}>
                    + Tambah Rekening
                </button>
            </div>

            {success && <div className="rb-alert-ok">✓ {success}</div>}

            {/* Summary cards */}
            <div className="rb-summary">
                {/* Total */}
                <div className="rb-sum-card" style={{ animationDelay: '0s', background: 'linear-gradient(135deg,#0a1f11,#1a4731)', border: 'none' }}>
                    <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.04)', pointerEvents: 'none' }} />
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>Total Semua Rekening</p>
                    <p style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-.5px', lineHeight: 1, animation: 'countUp .5s .1s ease both' }}>{fmt(totalSaldo)}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 8 }}>{list.length} rekening aktif</p>
                </div>
                {/* BRI */}
                <div className="rb-sum-card" style={{ animationDelay: '.07s' }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(21,101,192,.06)', pointerEvents: 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#1565c0,#1976d2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>B</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1565c0' }}>BANK BRI</span>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 700, color: '#1565c0', letterSpacing: '-.02em' }}>{fmt(totalBRI)}</p>
                    <div style={{ height: 3, background: '#e3f2fd', borderRadius: 99, overflow: 'hidden', marginTop: 12 }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#90caf9,#1565c0)', borderRadius: 99, width: `${Math.min((totalBRI / totalSaldo || 0) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                    </div>
                </div>
                {/* BSI */}
                <div className="rb-sum-card" style={{ animationDelay: '.14s' }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(27,94,32,.06)', pointerEvents: 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#1b5e20,#2e7d32)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>B</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1b5e20' }}>BANK BSI</span>
                    </div>
                    <p style={{ fontSize: 22, fontWeight: 700, color: '#1b5e20', letterSpacing: '-.02em' }}>{fmt(totalBSI)}</p>
                    <div style={{ height: 3, background: '#e8f5e9', borderRadius: 99, overflow: 'hidden', marginTop: 12 }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#a5d6a7,#1b5e20)', borderRadius: 99, width: `${Math.min((totalBSI / totalSaldo || 0) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                    </div>
                </div>
            </div>

            {/* Rekening cards */}
            {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9' }}>Memuat data rekening...</div>
            ) : list.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 20, border: '1px dashed #e2e8f0' }}>
                    <p style={{ fontSize: 32, marginBottom: 12 }}>🏦</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Belum ada rekening</p>
                    <p style={{ fontSize: 13 }}>Klik "+ Tambah Rekening" untuk memulai</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20, marginBottom: 32 }}>
                    {list.map((rek, idx) => {
                        const meta = BANK_META[rek.bank] || BANK_META.lainnya;
                        const pct = Math.min((Number(rek.saldo) / maxSaldo) * 100, 100).toFixed(0);
                        return (
                            <div key={rek.id} className="rb-card"
                                style={{ background: meta.grad, boxShadow: '0 8px 32px rgba(0,0,0,.18)', animationDelay: `${idx * .08}s` }}>
                                <div className="rb-card-shimmer" />
                                {/* Decorative circle */}
                                <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.06)', pointerEvents: 'none' }} />
                                <div style={{ position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.04)', pointerEvents: 'none' }} />

                                <div style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                                    {/* Top row */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                                        <div>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '4px 10px', marginBottom: 10 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.9)', letterSpacing: '.06em' }}>
                                                    {rek.bank === 'lainnya' ? (rek.nama_bank || 'Bank Lainnya') : meta.label}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{rek.nama_rekening}</p>
                                        </div>
                                        {!rek.is_active && (
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', background: 'rgba(0,0,0,.2)', padding: '3px 8px', borderRadius: 6 }}>Non-aktif</span>
                                        )}
                                    </div>

                                    {/* No rekening chip */}
                                    <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.5)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>Nomor Rekening</p>
                                        <p style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '.08em' }}>{rek.nomor_rekening}</p>
                                    </div>

                                    {/* Saldo */}
                                    <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.55)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Saldo Terkini</p>
                                    <p style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-.5px', lineHeight: 1, animation: 'countUp .5s ease both' }}>{fmt(rek.saldo)}</p>
                                    {rek.updated_by_name && (
                                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 5 }}>
                                            Diperbarui · {rek.updated_by_name}
                                        </p>
                                    )}

                                    {/* Progress bar */}
                                    <div className="rb-bar-track">
                                        <div className="rb-bar-fill" style={{ '--w': `${pct}%` }} />
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                                        <button onClick={() => { setUpdateSaldoForm({ saldo_baru: rek.saldo, keterangan: '' }); resetError(); setModalUpdateSaldo(rek); }}
                                            style={{ padding: '7px 13px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", transition: 'background .15s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}>
                                            ✎ Update Saldo
                                        </button>
                                        <button onClick={() => setModalHistory(rek)}
                                            style={{ padding: '7px 13px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", transition: 'background .15s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}>
                                            📋 Riwayat
                                        </button>
                                        <button onClick={() => { setForm({ nama_rekening: rek.nama_rekening, bank: rek.bank, nama_bank: rek.nama_bank || '', nomor_rekening: rek.nomor_rekening, saldo: rek.saldo, keterangan: rek.keterangan || '', is_active: rek.is_active }); resetError(); setModalEdit(rek); }}
                                            style={{ padding: '7px 13px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", transition: 'background .15s', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.18)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}>
                                            Edit
                                        </button>
                                        <button onClick={() => setModalHapus(rek)}
                                            style={{ padding: '7px 13px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", transition: 'background .15s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.15)'}>
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* History section */}
            {list.length > 0 && <HistorySection list={list} />}

            {/* ════ MODALS ════ */}

            {/* Tambah */}
            {modalTambah && (
                <Modal>
                    <div className="rb-modal">
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 }}>Tambah Rekening Bank</h2>
                        {error && <div className="rb-alert-err">{error}</div>}
                        <div className="rb-grid2">
                            <div className="rb-field">
                                <label className="rb-label">Bank *</label>
                                <select className="rb-select" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })}>
                                    {BANK_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </div>
                            {form.bank === 'lainnya' && (
                                <div className="rb-field">
                                    <label className="rb-label">Nama Bank *</label>
                                    <input className="rb-input" placeholder="Contoh: Bank Mandiri" value={form.nama_bank} onChange={e => setForm({ ...form, nama_bank: e.target.value })} />
                                </div>
                            )}
                        </div>
                        <div className="rb-field"><label className="rb-label">Nama Rekening / Alias *</label><input className="rb-input" placeholder="Contoh: Rekening Operasional" value={form.nama_rekening} onChange={e => setForm({ ...form, nama_rekening: e.target.value })} /></div>
                        <div className="rb-field"><label className="rb-label">Nomor Rekening *</label><input className="rb-input" placeholder="1234567890" value={form.nomor_rekening} onChange={e => setForm({ ...form, nomor_rekening: e.target.value })} /></div>
                        <div className="rb-field"><label className="rb-label">Saldo Awal (Rp)</label><input className="rb-input" type="number" placeholder="0" value={form.saldo} onChange={e => setForm({ ...form, saldo: e.target.value })} /></div>
                        <div className="rb-field"><label className="rb-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label><textarea className="rb-textarea" style={{ minHeight: 60 }} value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} /></div>
                        <div className="rb-modal-footer">
                            <button className="rb-btn-ghost" onClick={() => { setModalTambah(false); resetError(); }}>Batal</button>
                            <button className="rb-btn-primary" onClick={handleTambah} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Rekening'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Edit */}
            {modalEdit && (
                <Modal>
                    <div className="rb-modal">
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 }}>Edit Rekening</h2>
                        {error && <div className="rb-alert-err">{error}</div>}
                        <div className="rb-grid2">
                            <div className="rb-field">
                                <label className="rb-label">Bank *</label>
                                <select className="rb-select" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })}>
                                    {BANK_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </div>
                            {form.bank === 'lainnya' && (
                                <div className="rb-field">
                                    <label className="rb-label">Nama Bank *</label>
                                    <input className="rb-input" value={form.nama_bank} onChange={e => setForm({ ...form, nama_bank: e.target.value })} />
                                </div>
                            )}
                        </div>
                        <div className="rb-field"><label className="rb-label">Nama Rekening / Alias *</label><input className="rb-input" value={form.nama_rekening} onChange={e => setForm({ ...form, nama_rekening: e.target.value })} /></div>
                        <div className="rb-field"><label className="rb-label">Nomor Rekening *</label><input className="rb-input" value={form.nomor_rekening} onChange={e => setForm({ ...form, nomor_rekening: e.target.value })} /></div>
                        <div className="rb-field"><label className="rb-label">Keterangan</label><textarea className="rb-textarea" style={{ minHeight: 60 }} value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} /></div>
                        <div className="rb-field">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                                Rekening aktif
                            </label>
                        </div>
                        <div className="rb-modal-footer">
                            <button className="rb-btn-ghost" onClick={() => { setModalEdit(null); resetError(); }}>Batal</button>
                            <button className="rb-btn-primary" onClick={handleEdit} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Update Saldo */}
            {modalUpdateSaldo && (
                <Modal>
                    <div className="rb-modal sm">
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 }}>Update Saldo Rekening</h2>
                        {/* Info card */}
                        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 20, background: BANK_META[modalUpdateSaldo.bank]?.grad || BANK_META.lainnya.grad, padding: '18px 20px', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.08)', pointerEvents: 'none' }} />
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                                {modalUpdateSaldo.bank === 'lainnya' ? (modalUpdateSaldo.nama_bank || 'Bank Lainnya') : BANK_META[modalUpdateSaldo.bank]?.label}
                            </p>
                            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{modalUpdateSaldo.nama_rekening}</p>
                            <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,.6)', marginBottom: 12 }}>{modalUpdateSaldo.nomor_rekening}</p>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 2 }}>Saldo saat ini</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{fmt(modalUpdateSaldo.saldo)}</p>
                        </div>
                        {error && <div className="rb-alert-err">{error}</div>}
                        <div className="rb-field">
                            <label className="rb-label">Saldo Baru (Rp) *</label>
                            <input className="rb-input" type="number" placeholder="0" value={updateSaldoForm.saldo_baru} onChange={e => setUpdateSaldoForm({ ...updateSaldoForm, saldo_baru: e.target.value })} />
                            {updateSaldoForm.saldo_baru !== '' && (
                                <p style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: Number(updateSaldoForm.saldo_baru) >= Number(modalUpdateSaldo.saldo) ? '#166534' : '#dc2626' }}>
                                    {Number(updateSaldoForm.saldo_baru) >= Number(modalUpdateSaldo.saldo)
                                        ? `▲ Naik ${fmt(Number(updateSaldoForm.saldo_baru) - Number(modalUpdateSaldo.saldo))}`
                                        : `▼ Turun ${fmt(Number(modalUpdateSaldo.saldo) - Number(updateSaldoForm.saldo_baru))}`}
                                </p>
                            )}
                        </div>
                        <div className="rb-field">
                            <label className="rb-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label>
                            <textarea className="rb-textarea" style={{ minHeight: 70 }} placeholder="Contoh: Update saldo per 13 Maret 2026..." value={updateSaldoForm.keterangan} onChange={e => setUpdateSaldoForm({ ...updateSaldoForm, keterangan: e.target.value })} />
                        </div>
                        <div className="rb-modal-footer">
                            <button className="rb-btn-ghost" onClick={() => { setModalUpdateSaldo(null); resetError(); }}>Batal</button>
                            <button className="rb-btn-primary" onClick={handleUpdateSaldo} disabled={saving}>{saving ? 'Menyimpan...' : 'Update Saldo'}</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Riwayat */}
            {modalHistory && (
                <Modal>
                    <div className="rb-modal lg">
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 6 }}>Riwayat Saldo</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ padding: '2px 10px', borderRadius: 99, background: BANK_META[modalHistory.bank]?.light || '#f3e5f5', color: BANK_META[modalHistory.bank]?.color || '#4a148c', fontSize: 11, fontWeight: 700 }}>
                                        {modalHistory.bank === 'lainnya' ? (modalHistory.nama_bank || 'Bank Lainnya') : BANK_META[modalHistory.bank]?.label}
                                    </span>
                                    <span style={{ fontSize: 13, color: '#64748b' }}>{modalHistory.nama_rekening}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{modalHistory.nomor_rekening}</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Saldo Terkini</p>
                                <p style={{ fontSize: 22, fontWeight: 700, color: '#1a4731' }}>{fmt(modalHistory.saldo)}</p>
                            </div>
                        </div>
                        {!modalHistory.riwayat?.length ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Belum ada riwayat perubahan saldo.</div>
                        ) : (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
                                <table className="rb-htable">
                                    <thead><tr>
                                        <th>Waktu</th><th>Saldo Sebelum</th><th>Saldo Sesudah</th><th>Selisih</th><th>Keterangan</th><th>Diperbarui Oleh</th>
                                    </tr></thead>
                                    <tbody>
                                        {modalHistory.riwayat.map((r, i) => {
                                            const naik = Number(r.selisih) >= 0;
                                            return (
                                                <tr key={i} className="rb-tr" style={{ animationDelay: `${i * .03}s` }}>
                                                    <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{fmtDT(r.created_at)}</td>
                                                    <td style={{ color: '#64748b' }}>{fmt(r.saldo_sebelum)}</td>
                                                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(r.saldo_sesudah)}</td>
                                                    <td>
                                                        <span style={{ fontWeight: 700, fontSize: 12, color: naik ? '#166534' : '#dc2626', background: naik ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                                                            {naik ? '▲' : '▼'} {fmt(Math.abs(Number(r.selisih)))}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: '#64748b', maxWidth: 200 }}>{r.keterangan || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                                    <td style={{ fontWeight: 500, color: '#334155' }}>{r.updated_by_name || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="rb-modal-footer" style={{ marginTop: 20 }}>
                            <button className="rb-btn-ghost" onClick={() => setModalHistory(null)}>Tutup</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Hapus */}
            {modalHapus && (
                <Modal>
                    <div className="rb-modal sm">
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 16 }}>Hapus Rekening?</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>Rekening ini akan dihapus permanen.</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{modalHapus.nama_rekening}</p>
                            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', marginTop: 2 }}>{modalHapus.nomor_rekening}</p>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginTop: 6 }}>Saldo: {fmt(modalHapus.saldo)}</p>
                        </div>
                        <div className="rb-modal-footer" style={{ paddingTop: 0, borderTop: 'none' }}>
                            <button className="rb-btn-ghost" onClick={() => setModalHapus(null)}>Batal</button>
                            <button className="rb-btn-primary danger" onClick={handleHapus} disabled={saving}>{saving ? 'Menghapus...' : 'Ya, Hapus'}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   HISTORY SECTION
═══════════════════════════════════════════════════════════ */
function HistorySection({ list }) {
    const [filterRekening, setFilterRekening] = useState('all');
    const [filterBulan, setFilterBulan] = useState(() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    });

    const allRiwayat = useMemo(() =>
        list.flatMap(rek => (rek.riwayat || []).map(r => ({ ...r, rek })))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        , [list]);

    const filtered = useMemo(() => allRiwayat.filter(r => {
        const d = new Date(r.created_at);
        const bln = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return (filterRekening === 'all' || String(r.rek.id) === filterRekening) && bln === filterBulan;
    }), [allRiwayat, filterRekening, filterBulan]);

    const totalNaik = filtered.filter(r => Number(r.selisih) > 0).reduce((a, r) => a + Number(r.selisih), 0);
    const totalTurun = filtered.filter(r => Number(r.selisih) < 0).reduce((a, r) => a + Math.abs(Number(r.selisih)), 0);

    const chartData = useMemo(() => {
        if (filterRekening === 'all') {
            const byDate = {};
            [...filtered].reverse().forEach(r => {
                const tgl = new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                if (!byDate[tgl]) byDate[tgl] = { label: tgl };
                byDate[tgl][r.rek.nama_rekening] = Number(r.saldo_sesudah);
            });
            return Object.values(byDate);
        }
        return [...filtered].reverse().map((r, i) => ({
            label: new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
            saldo: Number(r.saldo_sesudah), idx: i,
        }));
    }, [filtered, filterRekening]);

    const rekeningLines = useMemo(() => {
        if (filterRekening !== 'all') return [];
        return [...new Set(filtered.map(r => r.rek.nama_rekening))];
    }, [filtered, filterRekening]);

    const COLORS = ['#1a4731', '#1565c0', '#c9a84c', '#7c3aed', '#dc2626'];
    const recent5 = filtered.slice(0, 5);

    if (!allRiwayat.length) return null;

    return (
        <div className="rb-history">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1a2e1a', marginBottom: 2 }}>Riwayat Perubahan Saldo</h2>
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>Pantau perubahan saldo rekening bank</p>
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
                <select className="rb-filter-select" value={filterRekening} onChange={e => setFilterRekening(e.target.value)}>
                    <option value="all">Semua Rekening</option>
                    {list.map(r => <option key={r.id} value={String(r.id)}>{r.nama_rekening} ({r.bank.toUpperCase()})</option>)}
                </select>
                <input type="month" className="rb-filter-input" value={filterBulan} onChange={e => setFilterBulan(e.target.value)} />
                {filtered.length > 0 && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{filtered.length} update</span>}
            </div>

            {/* Stats mini */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
                {[
                    { label: 'Total Naik', val: fmt(totalNaik), color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', Icon: TrendingUp },
                    { label: 'Total Turun', val: fmt(totalTurun), color: '#dc2626', bg: '#fef2f2', border: '#fecaca', Icon: TrendingDown },
                    { label: 'Jumlah Update', val: `${filtered.length}×`, color: '#334155', bg: '#f8fafc', border: '#e2e8f0', Icon: BarChart3 },
                    { label: 'Perubahan Bersih', val: fmt(Math.abs(totalNaik - totalTurun)), color: totalNaik - totalTurun >= 0 ? '#166534' : '#dc2626', bg: totalNaik - totalTurun >= 0 ? '#f0fdf4' : '#fef2f2', border: totalNaik - totalTurun >= 0 ? '#bbf7d0' : '#fecaca', Icon: totalNaik - totalTurun >= 0 ? TrendingUp : TrendingDown },
                ].map((s, i) => (
                    <div key={i} style={{ borderRadius: 12, padding: '14px 16px', background: s.bg, border: `1px solid ${s.border}` }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{s.label}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <s.Icon size={18} color={s.color} strokeWidth={1.5} />
                            <p style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {chartData.length > 1 ? (
                <div style={{ marginBottom: 28 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 14 }}>
                        Grafik Saldo — {filterRekening === 'all' ? 'Semua Rekening' : list.find(r => String(r.id) === filterRekening)?.nama_rekening}
                    </p>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <defs>
                                {filterRekening !== 'all' ? (
                                    <linearGradient id="grad0" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#1a4731" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#1a4731" stopOpacity={0} />
                                    </linearGradient>
                                ) : rekeningLines.map((n, i) => (
                                    <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.12} />
                                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'Plus Jakarta Sans' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'Plus Jakarta Sans' }} tickFormatter={v => 'Rp' + (v >= 1e6 ? (v / 1e6).toFixed(0) + 'Jt' : (v / 1e3).toFixed(0) + 'Rb')} width={72} />
                            <Tooltip contentStyle={{ fontFamily: 'Plus Jakarta Sans', fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }} formatter={(v, n) => [fmt(v), n]} />
                            {filterRekening !== 'all' ? (
                                <Area type="monotone" dataKey="saldo" stroke="#1a4731" strokeWidth={2.5} fill="url(#grad0)" dot={{ r: 4, fill: '#1a4731' }} activeDot={{ r: 6 }} name="Saldo" />
                            ) : rekeningLines.map((n, i) => (
                                <Area key={n} type="monotone" dataKey={n} stroke={COLORS[i % COLORS.length]} strokeWidth={2} fill={`url(#grad${i})`} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            ))}
                            {rekeningLines.length > 1 && <Legend />}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : chartData.length === 1 ? (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Butuh minimal 2 titik data untuk menampilkan grafik.
                </div>
            ) : null}

            {/* Recent list */}
            {recent5.length > 0 && (
                <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>{filtered.length <= 5 ? 'Semua Update' : '5 Update Terbaru'}</p>
                    {recent5.map((r, i) => {
                        const naik = Number(r.selisih) >= 0;
                        const meta = BANK_META[r.rek.bank] || BANK_META.lainnya;
                        return (
                            <div key={i} className="rb-recent-item" style={{ animationDelay: `${i * .05}s` }}>
                                <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: naik ? 'linear-gradient(135deg,#bbf7d0,#86efac)' : 'linear-gradient(135deg,#fecaca,#fca5a5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: naik ? '#166534' : '#dc2626' }}>
                                    {naik ? '▲' : '▼'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{r.rek.nama_rekening}</span>
                                        <span style={{ padding: '1px 8px', borderRadius: 99, background: meta.light, color: meta.color, fontSize: 10, fontWeight: 700 }}>
                                            {r.rek.bank === 'lainnya' ? (r.rek.nama_bank || 'Bank Lainnya') : meta.label}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {fmtDT(r.created_at)}
                                        {r.keterangan && <span style={{ color: '#64748b' }}> · {r.keterangan}</span>}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: naik ? '#dcfce7' : '#fee2e2', color: naik ? '#166534' : '#dc2626', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                                        {naik ? '+' : '-'}{fmt(Math.abs(Number(r.selisih)))}
                                    </div>
                                    <p style={{ fontSize: 11, color: '#94a3b8' }}>→ {fmt(r.saldo_sesudah)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Tidak ada riwayat untuk filter yang dipilih.</div>
            )}
        </div>
    );
}
