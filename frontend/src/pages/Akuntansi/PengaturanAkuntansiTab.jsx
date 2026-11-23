import { useState, useEffect } from 'react';
import { Lock, Unlock, Save, Play, Plus, RefreshCw, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToastState } from '../../context/ToastContext';
import { getResults } from '../../utils/pagination.jsx';
import { formatDateId } from './akuntansiUtils';

const BULAN_OPTIONS = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' },
];

export default function PengaturanAkuntansiTab({ postableAccounts = [] }) {
    const { user } = useAuth();
    const canReopen = Boolean(
        user?.is_superuser || user?.username === 'super' || user?.role === 'direktur'
    );

    const now = new Date();
    const [periods, setPeriods] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingMap, setSavingMap] = useState(false);

    // New Period Form
    const [newYear, setNewYear] = useState(now.getFullYear());
    const [newMonth, setNewMonth] = useState(now.getMonth() + 1);

    // Depreciation Execution State
    const [deprYear, setDeprYear] = useState(now.getFullYear());
    const [deprMonth, setDeprMonth] = useState(now.getMonth() + 1);
    const [deprConfirmOpen, setDeprConfirmOpen] = useState(false);
    const [postingDepr, setPostingDepr] = useState(false);

    const [, setError] = useToastState('error');
    const [, setSuccess] = useToastState('success');

    const fetchSettingsData = async () => {
        setLoading(true);
        try {
            const [perRes, mapRes] = await Promise.all([
                api.get('/keuangan/periode/'),
                api.get('/keuangan/account-mapping/'),
            ]);
            setPeriods(getResults(perRes.data));
            setMappings(getResults(mapRes.data));
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat pengaturan akuntansi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettingsData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreatePeriod = async () => {
        try {
            const y = Number(newYear);
            const m = Number(newMonth);
            const lastDay = new Date(y, m, 0).getDate();
            const padM = String(m).padStart(2, '0');
            await api.post('/keuangan/periode/', {
                tahun: y,
                bulan: m,
                tanggal_mulai: `${y}-${padM}-01`,
                tanggal_selesai: `${y}-${padM}-${String(lastDay).padStart(2, '0')}`,
                status: 'open',
            });
            setSuccess(`Periode ${m}/${y} berhasil ditambahkan.`);
            fetchSettingsData();
        } catch (err) {
            setError(
                err.response?.data?.non_field_errors?.[0] ||
                    err.response?.data?.error ||
                    'Periode tersebut sudah terdaftar.'
            );
        }
    };

    const handlePeriodAction = async (period, actionPath) => {
        try {
            const res = await api.post(`/keuangan/periode/${period.id}/${actionPath}/`);
            setSuccess(res.data?.message || 'Status periode berhasil diperbarui.');
            fetchSettingsData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memperbarui status periode.');
        }
    };

    const handleMappingChange = (id, newAkunId) => {
        setMappings((prev) =>
            prev.map((m) => (m.id === id ? { ...m, akun: Number(newAkunId) } : m))
        );
    };

    const handleSaveMappings = async () => {
        setSavingMap(true);
        try {
            const payload = {
                mappings: mappings.map((m) => ({
                    id: m.id,
                    event_code: m.event_code,
                    akun: m.akun,
                    keterangan: m.keterangan,
                    is_active: m.is_active,
                })),
            };
            const res = await api.post('/keuangan/account-mapping/bulk-update/', payload);
            setSuccess(res.data?.message || 'Konfigurasi Account Mapping berhasil disimpan.');
            fetchSettingsData();
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal menyimpan konfigurasi pemetaan akun.');
        } finally {
            setSavingMap(false);
        }
    };

    const handlePostDepreciation = async () => {
        setPostingDepr(true);
        try {
            const res = await api.post('/keuangan/penyusutan/post/', {
                tahun: Number(deprYear),
                bulan: Number(deprMonth),
            });
            setSuccess(res.data?.message || 'Jurnal penyusutan bulanan berhasil diposting!');
            setDeprConfirmOpen(false);
        } catch (err) {
            setError(
                err.response?.data?.error ||
                    'Gagal memposting penyusutan bulanan. Pastikan terdapat aset aktif pada periode ini.'
            );
        } finally {
            setPostingDepr(false);
        }
    };

    const renderPeriodStatus = (st) => {
        if (st === 'open') return <span className="akt-badge akt-badge-open">OPEN</span>;
        if (st === 'soft_locked') return <span className="akt-badge akt-badge-soft">SOFT LOCKED</span>;
        return <span className="akt-badge akt-badge-closed">CLOSED</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Section 1: Panel Eksekusi Penyusutan Aset Tetap Bulanan (PMK 72/2023) */}
            <div
                style={{
                    borderTop: '1px solid var(--pu-border)',
                    borderBottom: '1px solid var(--pu-border)',
                    padding: '16px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pu-text)' }}>
                        Eksekusi Penyusutan Bulanan Aset Tetap (PMK No. 72 Tahun 2023)
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--pu-muted)', marginTop: 3 }}>
                        Menghitung beban penyusutan garis lurus seluruh aset tetap aktif dan mem-posting 1 jurnal
                        gabungan per periode (idempotent).
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                        className="akt-select"
                        value={deprMonth}
                        onChange={(e) => setDeprMonth(Number(e.target.value))}
                    >
                        {BULAN_OPTIONS.map((b) => (
                            <option key={b.value} value={b.value}>
                                {b.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        className="akt-input"
                        style={{ width: 90 }}
                        value={deprYear}
                        onChange={(e) => setDeprYear(Number(e.target.value))}
                    />
                    <button
                        type="button"
                        className="akt-btn akt-btn-primary"
                        onClick={() => setDeprConfirmOpen(true)}
                    >
                        <Play size={13} /> Posting Penyusutan Aset
                    </button>
                </div>
            </div>

            {/* Section 2: Manajemen Periode Akuntansi & Tutup Buku */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="akt-toolbar">
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>
                            Manajemen Periode Akuntansi & Tutup Buku
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--pu-muted)' }}>
                            Soft Lock membatasi posting hanya untuk Manajer Akuntansi; Closed mengunci seluruh mutasi
                            secara permanen.
                        </div>
                    </div>
                    <div className="akt-toolbar-right">
                        <select
                            className="akt-select"
                            value={newMonth}
                            onChange={(e) => setNewMonth(Number(e.target.value))}
                        >
                            {BULAN_OPTIONS.map((b) => (
                                <option key={b.value} value={b.value}>
                                    {b.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            className="akt-input"
                            style={{ width: 88 }}
                            value={newYear}
                            onChange={(e) => setNewYear(Number(e.target.value))}
                        />
                        <button
                            type="button"
                            className="akt-btn akt-btn-secondary"
                            onClick={handleCreatePeriod}
                        >
                            <Plus size={13} /> Buka Periode
                        </button>
                        <button
                            type="button"
                            className="akt-btn akt-btn-secondary"
                            onClick={fetchSettingsData}
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>

                <div className="akt-table-wrap">
                    <table className="akt-table">
                        <thead>
                            <tr>
                                <th>Periode</th>
                                <th>Rentang Tanggal</th>
                                <th>Status</th>
                                <th>Ditutup Oleh</th>
                                <th style={{ textAlign: 'right' }}>Aksi Kontrol Periode</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="akt-empty">
                                        Memuat daftar periode akuntansi...
                                    </td>
                                </tr>
                            ) : periods.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="akt-empty">
                                        Belum ada periode akuntansi terdaftar.
                                    </td>
                                </tr>
                            ) : (
                                periods.map((p) => (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 600 }}>
                                            {p.nama_periode || `${p.tahun}-${String(p.bulan).padStart(2, '0')}`}
                                        </td>
                                        <td>
                                            {formatDateId(p.tanggal_mulai)} — {formatDateId(p.tanggal_selesai)}
                                        </td>
                                        <td>{renderPeriodStatus(p.status)}</td>
                                        <td style={{ color: 'var(--pu-muted)', fontSize: 12 }}>
                                            {p.closed_by_name
                                                ? `${p.closed_by_name} (${formatDateId(p.closed_at)})`
                                                : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', gap: 6 }}>
                                                {p.status === 'open' && (
                                                    <button
                                                        type="button"
                                                        className="akt-btn-neutral"
                                                        onClick={() => handlePeriodAction(p, 'soft-lock')}
                                                    >
                                                        <Lock size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                        Soft Lock
                                                    </button>
                                                )}
                                                {p.status !== 'closed' && (
                                                    <button
                                                        type="button"
                                                        className="akt-btn-danger"
                                                        onClick={() => handlePeriodAction(p, 'close')}
                                                    >
                                                        <Lock size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                        Tutup Buku (Close)
                                                    </button>
                                                )}
                                                {p.status !== 'open' && canReopen && (
                                                    <button
                                                        type="button"
                                                        className="akt-btn-approve"
                                                        onClick={() => handlePeriodAction(p, 'reopen')}
                                                    >
                                                        <Unlock size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                                                        Buka Kembali (Reopen)
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
            </div>

            {/* Section 3: Konfigurasi Account Mapping Otomatis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="akt-toolbar">
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>
                            Konfigurasi Pemetaan Akun Otomatis (Auto-Posting Account Mapping)
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--pu-muted)' }}>
                            Menentukan akun Buku Besar default saat terjadi transaksi di Gudang, Invoice Klaim, Utang
                            Supplier, Petty Cash, dan Penyusutan Aset.
                        </div>
                    </div>
                    <div className="akt-toolbar-right">
                        <button
                            type="button"
                            className="akt-btn akt-btn-primary"
                            disabled={savingMap}
                            onClick={handleSaveMappings}
                        >
                            <Save size={14} /> {savingMap ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </button>
                    </div>
                </div>

                <div className="akt-table-wrap">
                    <table className="akt-table">
                        <thead>
                            <tr>
                                <th>Event Code</th>
                                <th>Komponen / Dimensi</th>
                                <th>Deskripsi Transaksi</th>
                                <th style={{ width: 340 }}>Akun CoA Tujuan (Postable)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="akt-empty">
                                        Memuat konfigurasi Account Mapping...
                                    </td>
                                </tr>
                            ) : (
                                mappings.map((m) => (
                                    <tr key={m.id}>
                                        <td className="akt-mono" style={{ fontWeight: 600 }}>
                                            {m.event_code}
                                        </td>
                                        <td>
                                            {m.komponen_pendapatan ? (
                                                <span className="akt-badge akt-badge-info">
                                                    Komponen: {m.komponen_pendapatan.toUpperCase()}
                                                </span>
                                            ) : m.golongan_barang_nama ? (
                                                <span className="akt-badge akt-badge-muted">
                                                    Golongan: {m.golongan_barang_nama}
                                                </span>
                                            ) : m.kategori_aset_nama ? (
                                                <span className="akt-badge akt-badge-muted">
                                                    Kategori Aset: {m.kategori_aset_nama}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--pu-faint)', fontSize: 12 }}>
                                                    Default Utama
                                                </span>
                                            )}
                                        </td>
                                        <td>{m.keterangan || m.event_label}</td>
                                        <td>
                                            <select
                                                className="akt-select"
                                                style={{ width: '100%' }}
                                                value={m.akun}
                                                onChange={(e) => handleMappingChange(m.id, e.target.value)}
                                            >
                                                {postableAccounts.map((acc) => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.kode_akun} — {acc.nama_akun}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Konfirmasi Posting Penyusutan Bulanan */}
            {deprConfirmOpen && (
                <div className="akt-modal-backdrop" onClick={() => setDeprConfirmOpen(false)}>
                    <div className="akt-modal akt-modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="akt-modal-header">
                            <h3>Konfirmasi Posting Penyusutan Aset</h3>
                            <button
                                type="button"
                                className="akt-btn-neutral"
                                onClick={() => setDeprConfirmOpen(false)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="akt-modal-body">
                            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--pu-text)' }}>
                                Sistem akan menghitung penyusutan garis lurus (PMK 72/2023) untuk seluruh aset tetap
                                aktif pada periode{' '}
                                <strong>
                                    {BULAN_OPTIONS.find((b) => b.value === Number(deprMonth))?.label} {deprYear}
                                </strong>{' '}
                                dan menerbitkan jurnal penyusutan gabungan (Debit Beban Penyusutan, Kredit Akumulasi
                                Penyusutan).
                            </div>
                        </div>
                        <div className="akt-modal-footer">
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                onClick={() => setDeprConfirmOpen(false)}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="akt-btn akt-btn-primary"
                                disabled={postingDepr}
                                onClick={handlePostDepreciation}
                            >
                                {postingDepr ? 'Memproses...' : 'Ya, Posting Jurnal Penyusutan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
