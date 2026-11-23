import { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, Eye, Check, RotateCcw, Trash2, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import { getResults, getCount, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import {
    JENIS_JURNAL_OPTIONS,
    JENIS_JURNAL_LABELS,
    formatRp,
    formatDateId,
    getMonthDateRange,
} from './akuntansiUtils';

const EMPTY_LINE = {
    akun: '',
    keterangan: '',
    debit: '',
    kredit: '',
    unit: '',
    partner_type: '',
    partner_id: '',
};

export default function JurnalTab({ postableAccounts = [], units = [], onNavigateBook }) {
    const defaultRange = useMemo(() => getMonthDateRange(), []);
    const [jurnals, setJurnals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);

    // Filter state
    const [search, setSearch] = useState('');
    const [jenisJurnal, setJenisJurnal] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tanggalAwal, setTanggalAwal] = useState(defaultRange.start_date);
    const [tanggalAkhir, setTanggalAkhir] = useState(defaultRange.end_date);

    // Detail Modal / Drawer
    const [detailJurnal, setDetailJurnal] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Reverse Modal
    const [reverseTarget, setReverseTarget] = useState(null);
    const [reverseDate, setReverseDate] = useState(defaultRange.today);
    const [reverseReason, setReverseReason] = useState('');
    const [reversing, setReversing] = useState(false);

    // Create Manual Journal Modal
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        tanggal: defaultRange.today,
        jenis_jurnal: 'umum',
        keterangan: '',
        lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }],
    });

    const [, setError] = useToastState('error');
    const [, setSuccess] = useToastState('success');

    const fetchJurnals = async () => {
        setLoading(true);
        try {
            const params = {
                ...pageParams(page, pageSize),
                ...(search.trim() ? { search: search.trim() } : {}),
                ...(jenisJurnal ? { jenis_jurnal: jenisJurnal } : {}),
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(tanggalAwal ? { tanggal_awal: tanggalAwal } : {}),
                ...(tanggalAkhir ? { tanggal_akhir: tanggalAkhir } : {}),
            };
            const res = await api.get('/keuangan/jurnal/', { params });
            setJurnals(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat daftar jurnal.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJurnals();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, jenisJurnal, statusFilter, tanggalAwal, tanggalAkhir]);

    // Summary KPI metrics from current dataset
    const metrics = useMemo(() => {
        const autoPosted = jurnals.filter((j) => Boolean(j.source_type)).length;
        const manualCount = jurnals.filter((j) => !j.source_type).length;
        const draftCount = jurnals.filter((j) => j.status === 'draft').length;
        return {
            totalCount: total || jurnals.length,
            autoPosted,
            manualCount,
            draftCount,
        };
    }, [jurnals, total]);

    const openDetail = async (jurnal) => {
        try {
            const res = await api.get(`/keuangan/jurnal/${jurnal.id}/`);
            setDetailJurnal(res.data);
            setDetailOpen(true);
        } catch {
            setDetailJurnal(jurnal);
            setDetailOpen(true);
        }
    };

    const handlePostDraft = async (jurnal) => {
        try {
            await api.post(`/keuangan/jurnal/${jurnal.id}/post/`);
            setSuccess(`Jurnal ${jurnal.nomor_jurnal} berhasil diposting.`);
            fetchJurnals();
            if (detailJurnal?.id === jurnal.id) {
                const res = await api.get(`/keuangan/jurnal/${jurnal.id}/`);
                setDetailJurnal(res.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memposting jurnal.');
        }
    };

    const handleConfirmReverse = async () => {
        if (!reverseTarget) return;
        if (!reverseReason.trim()) {
            setError('Alasan pembalikan (reversal) wajib diisi.');
            return;
        }
        setReversing(true);
        try {
            const res = await api.post(`/keuangan/jurnal/${reverseTarget.id}/reverse/`, {
                tanggal_reversal: reverseDate,
                alasan: reverseReason.trim(),
            });
            setSuccess(res.data?.message || 'Jurnal berhasil di-reverse.');
            setReverseTarget(null);
            setReverseReason('');
            fetchJurnals();
            if (detailJurnal?.id === reverseTarget.id) {
                const updated = await api.get(`/keuangan/jurnal/${reverseTarget.id}/`);
                setDetailJurnal(updated.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal membalik jurnal.');
        } finally {
            setReversing(false);
        }
    };

    // Create Manual Journal logic
    const formTotals = useMemo(() => {
        let d = 0;
        let k = 0;
        form.lines.forEach((l) => {
            d += Number(l.debit) || 0;
            k += Number(l.kredit) || 0;
        });
        const diff = Math.abs(d - k);
        const isBalanced = d > 0 && diff < 0.005;
        return { totalDebit: d, totalKredit: k, selisih: diff, isBalanced };
    }, [form.lines]);

    const updateLine = (idx, field, val) => {
        const next = [...form.lines];
        const updated = { ...next[idx], [field]: val };
        // Mutual exclusion on single row: typing debit clears kredit and vice-versa
        if (field === 'debit' && Number(val) > 0) updated.kredit = '';
        if (field === 'kredit' && Number(val) > 0) updated.debit = '';
        next[idx] = updated;
        setForm({ ...form, lines: next });
    };

    const addLine = () => {
        setForm({ ...form, lines: [...form.lines, { ...EMPTY_LINE }] });
    };

    const removeLine = (idx) => {
        if (form.lines.length <= 2) return;
        setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
    };

    const handleSaveManual = async (targetStatus = 'posted') => {
        if (!form.tanggal || !form.keterangan.trim()) {
            setError('Tanggal dan keterangan jurnal wajib diisi.');
            return;
        }
        const validLines = form.lines.filter(
            (l) => l.akun && ((Number(l.debit) || 0) > 0 || (Number(l.kredit) || 0) > 0)
        );
        if (validLines.length < 2) {
            setError('Jurnal wajib memiliki minimal 2 baris akun dengan nominal > 0.');
            return;
        }
        if (!formTotals.isBalanced) {
            setError('Jurnal belum seimbang! Total Debit harus sama dengan Total Kredit.');
            return;
        }

        // Check reconcilable account partner requirement
        for (let i = 0; i < validLines.length; i += 1) {
            const line = validLines[i];
            const accObj = postableAccounts.find((a) => String(a.id) === String(line.akun));
            if (
                accObj &&
                accObj.is_reconcilable &&
                !accObj.is_kas_setara &&
                form.jenis_jurnal !== 'penyesuaian' &&
                (!line.partner_type || !line.partner_id)
            ) {
                setError(
                    `Baris #${i + 1} (${accObj.kode_akun} - ${accObj.nama_akun}) adalah akun Piutang/Utang (Reconcilable) sehingga wajib mengisi Tipe Partner & ID Partner.`
                );
                return;
            }
        }

        setSaving(true);
        try {
            const payload = {
                tanggal: form.tanggal,
                jenis_jurnal: form.jenis_jurnal,
                keterangan: form.keterangan.trim(),
                status: targetStatus,
                items: validLines.map((l) => ({
                    akun: Number(l.akun),
                    keterangan: (l.keterangan || form.keterangan).trim(),
                    debit: (Number(l.debit) || 0).toFixed(2),
                    kredit: (Number(l.kredit) || 0).toFixed(2),
                    unit: l.unit ? Number(l.unit) : null,
                    partner_type: l.partner_type || null,
                    partner_id: l.partner_id ? Number(l.partner_id) : null,
                })),
            };
            await api.post('/keuangan/jurnal/', payload);
            setSuccess(
                targetStatus === 'posted'
                    ? 'Jurnal manual berhasil disimpan & diposting!'
                    : 'Draft jurnal berhasil disimpan.'
            );
            setCreateOpen(false);
            setForm({
                tanggal: defaultRange.today,
                jenis_jurnal: 'umum',
                keterangan: '',
                lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }],
            });
            fetchJurnals();
        } catch (err) {
            const detail =
                err.response?.data?.detail ||
                err.response?.data?.error ||
                JSON.stringify(err.response?.data || 'Gagal menyimpan jurnal.');
            setError(detail);
        } finally {
            setSaving(false);
        }
    };

    const renderStatusBadge = (st) => {
        if (st === 'posted') return <span className="akt-badge akt-badge-posted">POSTED</span>;
        if (st === 'reversed') return <span className="akt-badge akt-badge-reversed">REVERSED</span>;
        return <span className="akt-badge akt-badge-draft">DRAFT</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Unboxed Stat-Bar */}
            <div className="akt-stat-bar">
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Total Jurnal Periode</span>
                    <span className="akt-stat-value">{metrics.totalCount}</span>
                    <span className="akt-stat-sub">Entri buku harian</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Jurnal Otomatis (Auto-Posted)</span>
                    <span className="akt-stat-value">{metrics.autoPosted}</span>
                    <span className="akt-stat-sub">Gudang, Klaim, Utang, Kas & Aset</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Jurnal Manual / Memorial</span>
                    <span className="akt-stat-value">{metrics.manualCount}</span>
                    <span className="akt-stat-sub">Penyesuaian & memorial</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Draft Menunggu Posting</span>
                    <span className="akt-stat-value">{metrics.draftCount}</span>
                    <span className="akt-stat-sub">Belum masuk Buku Besar</span>
                </div>
            </div>

            {/* 2. Compact 32px Filter Toolbar */}
            <div className="akt-toolbar">
                <div className="akt-toolbar-left">
                    <input
                        type="text"
                        className="akt-input"
                        style={{ width: 220 }}
                        placeholder="Cari nomor jurnal / sumber / ket..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                setPage(1);
                                fetchJurnals();
                            }
                        }}
                    />
                    <select
                        className="akt-select"
                        value={jenisJurnal}
                        onChange={(e) => {
                            setJenisJurnal(e.target.value);
                            setPage(1);
                        }}
                    >
                        {JENIS_JURNAL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <select
                        className="akt-select"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">Semua Status</option>
                        <option value="posted">Posted</option>
                        <option value="draft">Draft</option>
                        <option value="reversed">Reversed</option>
                    </select>
                    <input
                        type="date"
                        className="akt-input"
                        value={tanggalAwal}
                        onChange={(e) => {
                            setTanggalAwal(e.target.value);
                            setPage(1);
                        }}
                        title="Tanggal Awal"
                    />
                    <span style={{ color: 'var(--pu-muted)', fontSize: 12 }}>s/d</span>
                    <input
                        type="date"
                        className="akt-input"
                        value={tanggalAkhir}
                        onChange={(e) => {
                            setTanggalAkhir(e.target.value);
                            setPage(1);
                        }}
                        title="Tanggal Akhir"
                    />
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={() => {
                            setPage(1);
                            fetchJurnals();
                        }}
                        title="Segarkan Data"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>

                <div className="akt-toolbar-right">
                    <button
                        type="button"
                        className="akt-btn akt-btn-primary"
                        onClick={() => setCreateOpen(true)}
                    >
                        <Plus size={14} /> Buat Jurnal Manual
                    </button>
                </div>
            </div>

            {/* 3. Minimalist Journal Table */}
            <div className="akt-table-wrap">
                <table className="akt-table">
                    <thead>
                        <tr>
                            <th>Nomor Jurnal</th>
                            <th>Tanggal</th>
                            <th>Jenis</th>
                            <th>Sumber Dokumen</th>
                            <th>Keterangan</th>
                            <th className="akt-num">Total Debit</th>
                            <th className="akt-num">Total Kredit</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="akt-empty">
                                    Memuat data jurnal umum...
                                </td>
                            </tr>
                        ) : jurnals.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="akt-empty">
                                    Tidak ditemukan data jurnal pada filter yang dipilih.
                                </td>
                            </tr>
                        ) : (
                            jurnals.map((j) => (
                                <tr
                                    key={j.id}
                                    onClick={() => openDetail(j)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td className="akt-mono" style={{ fontWeight: 600 }}>
                                        {j.nomor_jurnal}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateId(j.tanggal)}</td>
                                    <td>
                                        <span className="akt-badge akt-badge-muted">
                                            {JENIS_JURNAL_LABELS[j.jenis_jurnal] || j.jenis_jurnal}
                                        </span>
                                    </td>
                                    <td className="akt-mono" style={{ color: 'var(--pu-muted)' }}>
                                        {j.source_number || (j.source_type ? `${j.source_type}#${j.source_id}` : 'Manual')}
                                    </td>
                                    <td style={{ maxWidth: 320 }}>{j.keterangan}</td>
                                    <td className="akt-num">{formatRp(j.total_debit)}</td>
                                    <td className="akt-num">{formatRp(j.total_kredit)}</td>
                                    <td>{renderStatusBadge(j.status)}</td>
                                    <td
                                        style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div style={{ display: 'inline-flex', gap: 6 }}>
                                            <button
                                                type="button"
                                                className="akt-btn-neutral"
                                                onClick={() => openDetail(j)}
                                                title="Lihat Rincian Baris Jurnal"
                                            >
                                                <Eye size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                Detail
                                            </button>
                                            {j.status === 'draft' && (
                                                <button
                                                    type="button"
                                                    className="akt-btn-approve"
                                                    onClick={() => handlePostDraft(j)}
                                                    title="Posting ke Buku Besar"
                                                >
                                                    <Check size={13} style={{ marginRight: 3, verticalAlign: 'text-bottom' }} />
                                                    Post
                                                </button>
                                            )}
                                            {j.status === 'posted' && !j.reversal_of && (
                                                <button
                                                    type="button"
                                                    className="akt-btn-danger"
                                                    onClick={() => {
                                                        setReverseTarget(j);
                                                        setReverseDate(j.tanggal || defaultRange.today);
                                                        setReverseReason('');
                                                    }}
                                                    title="Buat Jurnal Pembalik (Reversal)"
                                                >
                                                    <RotateCcw size={12} style={{ marginRight: 3, verticalAlign: 'text-bottom' }} />
                                                    Reverse
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
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setPage(1);
                }}
            />

            {/* Modal Detail Jurnal */}
            {detailOpen && detailJurnal && (
                <div className="akt-modal-backdrop" onClick={() => setDetailOpen(false)}>
                    <div className="akt-modal akt-modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="akt-modal-header">
                            <div>
                                <h3>Rincian Jurnal {detailJurnal.nomor_jurnal}</h3>
                                <div style={{ fontSize: 12, color: 'var(--pu-muted)', marginTop: 2 }}>
                                    Tanggal: {formatDateId(detailJurnal.tanggal)} · Jenis:{' '}
                                    {JENIS_JURNAL_LABELS[detailJurnal.jenis_jurnal] || detailJurnal.jenis_jurnal} · Sumber:{' '}
                                    {detailJurnal.source_number || detailJurnal.source_type || 'Entri Manual'}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="akt-btn-neutral"
                                onClick={() => setDetailOpen(false)}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="akt-modal-body">
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 10,
                                    paddingBottom: 10,
                                    borderBottom: '1px solid var(--pu-border)',
                                }}
                            >
                                <div style={{ fontSize: 13 }}>
                                    <strong>Keterangan:</strong> {detailJurnal.keterangan}
                                </div>
                                <div>{renderStatusBadge(detailJurnal.status)}</div>
                            </div>

                            <div className="akt-table-wrap">
                                <table className="akt-table">
                                    <thead>
                                        <tr>
                                            <th>Kode Akun</th>
                                            <th>Nama Akun</th>
                                            <th>Keterangan Baris</th>
                                            <th>Unit / Cost Center</th>
                                            <th>Partner</th>
                                            <th className="akt-num">Debit</th>
                                            <th className="akt-num">Kredit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(detailJurnal.items || []).map((it) => (
                                            <tr key={it.id}>
                                                <td className="akt-mono" style={{ fontWeight: 600 }}>
                                                    <button
                                                        type="button"
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            padding: 0,
                                                            color: 'var(--pu-accent)',
                                                            cursor: 'pointer',
                                                            fontWeight: 600,
                                                            fontFamily: 'inherit',
                                                        }}
                                                        onClick={() => {
                                                            setDetailOpen(false);
                                                            if (onNavigateBook) onNavigateBook(it.akun);
                                                        }}
                                                        title="Buka di Buku Besar"
                                                    >
                                                        {it.akun_detail?.kode_akun || it.akun}
                                                    </button>
                                                </td>
                                                <td>{it.akun_detail?.nama_akun || '—'}</td>
                                                <td>{it.keterangan || '—'}</td>
                                                <td>
                                                    {units.find((u) => u.id === it.unit)?.nama ||
                                                        (it.unit ? `Unit #${it.unit}` : '—')}
                                                </td>
                                                <td>
                                                    {it.partner_type
                                                        ? `${it.partner_type} #${it.partner_id}`
                                                        : '—'}
                                                </td>
                                                <td className="akt-num">{formatRp(it.debit)}</td>
                                                <td className="akt-num">{formatRp(it.kredit)}</td>
                                            </tr>
                                        ))}
                                        <tr className="akt-row-grandtotal">
                                            <td colSpan={5} style={{ textAlign: 'right' }}>
                                                TOTAL JURNAL
                                            </td>
                                            <td className="akt-num">{formatRp(detailJurnal.total_debit)}</td>
                                            <td className="akt-num">{formatRp(detailJurnal.total_kredit)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="akt-modal-footer">
                            {detailJurnal.status === 'draft' && (
                                <button
                                    type="button"
                                    className="akt-btn-approve"
                                    onClick={() => handlePostDraft(detailJurnal)}
                                >
                                    <Check size={13} style={{ marginRight: 4 }} />
                                    Posting Jurnal Ini
                                </button>
                            )}
                            {detailJurnal.status === 'posted' && !detailJurnal.reversal_of && (
                                <button
                                    type="button"
                                    className="akt-btn-danger"
                                    onClick={() => {
                                        setReverseTarget(detailJurnal);
                                        setReverseDate(detailJurnal.tanggal || defaultRange.today);
                                        setReverseReason('');
                                    }}
                                >
                                    <RotateCcw size={13} style={{ marginRight: 4 }} />
                                    Reverse / Balik Jurnal
                                </button>
                            )}
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                onClick={() => setDetailOpen(false)}
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Reversal */}
            {reverseTarget && (
                <div className="akt-modal-backdrop" onClick={() => setReverseTarget(null)}>
                    <div className="akt-modal akt-modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="akt-modal-header">
                            <h3>Balik Jurnal (Reversal)</h3>
                            <button
                                type="button"
                                className="akt-btn-neutral"
                                onClick={() => setReverseTarget(null)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="akt-modal-body">
                            <div style={{ fontSize: 12.5, color: 'var(--pu-muted)', lineHeight: 1.5 }}>
                                Anda akan membalik jurnal <strong>{reverseTarget.nomor_jurnal}</strong> senilai{' '}
                                <strong>{formatRp(reverseTarget.total_debit)}</strong>. Sistem akan menerbitkan jurnal
                                pembalik baru dengan posisi Debit & Kredit ditukar secara otomatis.
                            </div>
                            <div className="akt-field">
                                <label>Tanggal Jurnal Pembalik</label>
                                <input
                                    type="date"
                                    className="akt-input"
                                    value={reverseDate}
                                    onChange={(e) => setReverseDate(e.target.value)}
                                />
                            </div>
                            <div className="akt-field">
                                <label>Alasan Pembalikan (Wajib)</label>
                                <textarea
                                    className="akt-textarea"
                                    placeholder="Contoh: Koreksi salah pilih akun beban / pembatalan transaksi..."
                                    value={reverseReason}
                                    onChange={(e) => setReverseReason(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="akt-modal-footer">
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                onClick={() => setReverseTarget(null)}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="akt-btn-danger"
                                style={{ height: 32, padding: '0 14px' }}
                                disabled={reversing}
                                onClick={handleConfirmReverse}
                            >
                                {reversing ? 'Memproses...' : 'Konfirmasi Reverse Jurnal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Buat Jurnal Manual */}
            {createOpen && (
                <div className="akt-modal-backdrop" onClick={() => setCreateOpen(false)}>
                    <div className="akt-modal akt-modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="akt-modal-header">
                            <h3>Buat Jurnal Manual / Penyesuaian</h3>
                            <button
                                type="button"
                                className="akt-btn-neutral"
                                onClick={() => setCreateOpen(false)}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="akt-modal-body">
                            <div className="akt-form-grid">
                                <div className="akt-field">
                                    <label>Tanggal Transaksi</label>
                                    <input
                                        type="date"
                                        className="akt-input"
                                        value={form.tanggal}
                                        onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                                    />
                                </div>
                                <div className="akt-field">
                                    <label>Jenis Jurnal</label>
                                    <select
                                        className="akt-select"
                                        value={form.jenis_jurnal}
                                        onChange={(e) => setForm({ ...form, jenis_jurnal: e.target.value })}
                                    >
                                        {JENIS_JURNAL_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="akt-field" style={{ gridColumn: 'span 2' }}>
                                    <label>Keterangan / Memo Jurnal</label>
                                    <input
                                        type="text"
                                        className="akt-input"
                                        placeholder="Contoh: Penyesuaian beban dibayar di muka bulan November 2026..."
                                        value={form.keterangan}
                                        onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="akt-table-wrap">
                                <table className="akt-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '28%' }}>Akun (Postable Leaf)</th>
                                            <th style={{ width: '20%' }}>Keterangan Baris</th>
                                            <th style={{ width: '16%' }}>Unit (Cost Center)</th>
                                            <th style={{ width: '14%' }}>Partner (Opsional)</th>
                                            <th className="akt-num" style={{ width: '10%' }}>
                                                Debit (Rp)
                                            </th>
                                            <th className="akt-num" style={{ width: '10%' }}>
                                                Kredit (Rp)
                                            </th>
                                            <th style={{ width: 36 }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {form.lines.map((line, idx) => (
                                            <tr key={idx}>
                                                <td>
                                                    <select
                                                        className="akt-select"
                                                        style={{ width: '100%' }}
                                                        value={line.akun}
                                                        onChange={(e) => updateLine(idx, 'akun', e.target.value)}
                                                    >
                                                        <option value="">— Pilih Akun —</option>
                                                        {postableAccounts.map((acc) => (
                                                            <option key={acc.id} value={acc.id}>
                                                                {acc.kode_akun} - {acc.nama_akun}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="akt-input"
                                                        style={{ width: '100%' }}
                                                        placeholder="Uraian baris..."
                                                        value={line.keterangan}
                                                        onChange={(e) =>
                                                            updateLine(idx, 'keterangan', e.target.value)
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="akt-select"
                                                        style={{ width: '100%' }}
                                                        value={line.unit}
                                                        onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                                                    >
                                                        <option value="">— Tanpa Unit —</option>
                                                        {units.map((u) => (
                                                            <option key={u.id} value={u.id}>
                                                                {u.nama}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <select
                                                            className="akt-select"
                                                            style={{ width: 92 }}
                                                            value={line.partner_type}
                                                            onChange={(e) =>
                                                                updateLine(idx, 'partner_type', e.target.value)
                                                            }
                                                        >
                                                            <option value="">Tipe</option>
                                                            <option value="pelanggan">Pelanggan</option>
                                                            <option value="pemasok">Pemasok</option>
                                                            <option value="karyawan">Karyawan</option>
                                                        </select>
                                                        {line.partner_type && (
                                                            <input
                                                                type="number"
                                                                className="akt-input"
                                                                style={{ width: 64 }}
                                                                placeholder="ID"
                                                                value={line.partner_id}
                                                                onChange={(e) =>
                                                                    updateLine(idx, 'partner_id', e.target.value)
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="akt-input akt-num"
                                                        style={{ width: 120 }}
                                                        placeholder="0.00"
                                                        value={line.debit}
                                                        onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="akt-input akt-num"
                                                        style={{ width: 120 }}
                                                        placeholder="0.00"
                                                        value={line.kredit}
                                                        onChange={(e) => updateLine(idx, 'kredit', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    {form.lines.length > 2 && (
                                                        <button
                                                            type="button"
                                                            className="akt-btn-neutral"
                                                            onClick={() => removeLine(idx)}
                                                            title="Hapus Baris"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="akt-row-subtotal">
                                            <td colSpan={4}>
                                                <button
                                                    type="button"
                                                    className="akt-btn akt-btn-secondary"
                                                    onClick={addLine}
                                                >
                                                    <Plus size={13} /> Tambah Baris
                                                </button>
                                            </td>
                                            <td className="akt-num">{formatRp(formTotals.totalDebit)}</td>
                                            <td className="akt-num">{formatRp(formTotals.totalKredit)}</td>
                                            <td />
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: 12.5,
                                }}
                            >
                                <div>
                                    {formTotals.isBalanced ? (
                                        <span className="akt-badge akt-badge-posted">
                                            ✓ Seimbang (Balanced)
                                        </span>
                                    ) : (
                                        <span className="akt-badge akt-badge-reversed">
                                            Selisih: {formatRp(formTotals.selisih)} (Wajib 0,00)
                                        </span>
                                    )}
                                </div>
                                <div style={{ color: 'var(--pu-muted)' }}>
                                    Penomoran jurnal otomatis sesuai jenis & periode transaksi.
                                </div>
                            </div>
                        </div>

                        <div className="akt-modal-footer">
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                onClick={() => setCreateOpen(false)}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                disabled={!formTotals.isBalanced || saving}
                                onClick={() => handleSaveManual('draft')}
                            >
                                Simpan sebagai Draft
                            </button>
                            <button
                                type="button"
                                className="akt-btn akt-btn-primary"
                                disabled={!formTotals.isBalanced || saving}
                                onClick={() => handleSaveManual('posted')}
                            >
                                {saving ? 'Menyimpan...' : 'Simpan & Post Jurnal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
