import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Printer } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import {
    JENIS_JURNAL_LABELS,
    formatRp,
    formatDateId,
    getMonthDateRange,
    exportToExcel,
    printReportPdf,
} from './akuntansiUtils';

export default function BukuBesarTab({ accounts = [], units = [], initialAccountId = '' }) {
    const defaultRange = useMemo(() => getMonthDateRange(), []);
    const postableAccounts = useMemo(
        () => accounts.filter((a) => a.is_postable),
        [accounts]
    );

    const [selectedAkun, setSelectedAkun] = useState('');
    const [startDate, setStartDate] = useState(defaultRange.start_date);
    const [endDate, setEndDate] = useState(defaultRange.end_date);
    const [unitId, setUnitId] = useState('');
    const [loading, setLoading] = useState(false);
    const [ledger, setLedger] = useState(null);
    const [, setError] = useToastState('error');

    useEffect(() => {
        if (initialAccountId) {
            setSelectedAkun(String(initialAccountId));
        } else if (!selectedAkun && postableAccounts.length > 0) {
            const defaultCash =
                postableAccounts.find((a) => a.kode_akun === '1113') || postableAccounts[0];
            setSelectedAkun(String(defaultCash.id));
        }
    }, [initialAccountId, postableAccounts, selectedAkun]);

    const fetchLedger = async () => {
        if (!selectedAkun) return;
        setLoading(true);
        try {
            const params = {
                akun_id: selectedAkun,
                start_date: startDate,
                end_date: endDate,
                ...(unitId ? { unit_id: unitId } : {}),
            };
            const res = await api.get('/keuangan/laporan/buku-besar/', { params });
            setLedger(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat Buku Besar.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedAkun) {
            fetchLedger();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAkun, startDate, endDate, unitId]);

    const handleExportExcel = () => {
        if (!ledger) return;
        const headers = [
            'Tanggal',
            'Nomor Jurnal',
            'Jenis',
            'Sumber Dokumen',
            'Keterangan',
            'Unit / Cost Center',
            'Debit (Rp)',
            'Kredit (Rp)',
            'Saldo Berjalan (Rp)',
        ];
        const rows = [
            [
                startDate,
                '—',
                'SALDO AWAL',
                '—',
                `Saldo Awal per ${startDate}`,
                '—',
                0,
                0,
                Number(ledger.opening_balance || 0),
            ],
            ...(ledger.entries || []).map((e) => [
                e.tanggal,
                e.nomor_jurnal,
                JENIS_JURNAL_LABELS[e.jenis_jurnal] || e.jenis_jurnal,
                e.source_number || e.source_type || 'Manual',
                e.keterangan,
                e.unit_nama || '—',
                Number(e.debit || 0),
                Number(e.kredit || 0),
                Number(e.running_balance || 0),
            ]),
            [
                endDate,
                '—',
                'SALDO AKHIR',
                '—',
                `Total Mutasi & Saldo Akhir per ${endDate}`,
                '—',
                Number(ledger.total_debit || 0),
                Number(ledger.total_kredit || 0),
                Number(ledger.closing_balance || 0),
            ],
        ];
        exportToExcel({
            filename: `Buku_Besar_${ledger.akun?.kode_akun}_${startDate}_${endDate}.xls`,
            sheetName: `BB_${ledger.akun?.kode_akun || 'Akun'}`,
            headers,
            rows,
        });
    };

    const handlePrintPdf = () => {
        const el = document.getElementById('akt-buku-besar-printable');
        if (!el || !ledger) return;
        printReportPdf({
            title: `BUKU BESAR: ${ledger.akun?.kode_akun} - ${ledger.akun?.nama_akun}`,
            subtitle: `Periode: ${formatDateId(startDate)} s/d ${formatDateId(endDate)} · Saldo Normal: ${String(
                ledger.akun?.saldo_normal || ''
            ).toUpperCase()}`,
            htmlContent: el.innerHTML,
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Compact Toolbar */}
            <div className="akt-toolbar">
                <div className="akt-toolbar-left">
                    <select
                        className="akt-select"
                        style={{ minWidth: 280 }}
                        value={selectedAkun}
                        onChange={(e) => setSelectedAkun(e.target.value)}
                    >
                        <option value="">— Pilih Akun Buku Besar —</option>
                        {postableAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {acc.kode_akun} — {acc.nama_akun}
                            </option>
                        ))}
                    </select>
                    <input
                        type="date"
                        className="akt-input"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span style={{ color: 'var(--pu-muted)', fontSize: 12 }}>s/d</span>
                    <input
                        type="date"
                        className="akt-input"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                    <select
                        className="akt-select"
                        value={unitId}
                        onChange={(e) => setUnitId(e.target.value)}
                    >
                        <option value="">Semua Unit / Cost Center</option>
                        {units.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.nama}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={fetchLedger}
                        title="Segarkan Buku Besar"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>

                <div className="akt-toolbar-right">
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        disabled={!ledger}
                        onClick={handleExportExcel}
                    >
                        <Download size={13} /> Export Excel
                    </button>
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        disabled={!ledger}
                        onClick={handlePrintPdf}
                    >
                        <Printer size={13} /> Cetak PDF
                    </button>
                </div>
            </div>

            {/* 2. Unboxed Stat-Bar */}
            <div className="akt-stat-bar">
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Saldo Awal Periode</span>
                    <span className="akt-stat-value">
                        {formatRp(ledger?.opening_balance || 0)}
                    </span>
                    <span className="akt-stat-sub">
                        Sebelum {formatDateId(startDate)}
                    </span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Total Mutasi Debit</span>
                    <span className="akt-stat-value">
                        {formatRp(ledger?.total_debit || 0)}
                    </span>
                    <span className="akt-stat-sub">Periode berjalan</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Total Mutasi Kredit</span>
                    <span className="akt-stat-value">
                        {formatRp(ledger?.total_kredit || 0)}
                    </span>
                    <span className="akt-stat-sub">Periode berjalan</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Saldo Akhir ({ledger?.akun?.kode_akun || '—'})</span>
                    <span className="akt-stat-value">
                        {formatRp(ledger?.closing_balance || 0)}
                    </span>
                    <span className="akt-stat-sub">
                        Saldo Normal: {String(ledger?.akun?.saldo_normal || 'debit').toUpperCase()}
                    </span>
                </div>
            </div>

            {/* 3. Chronological General Ledger Table */}
            <div id="akt-buku-besar-printable" className="akt-table-wrap">
                <table className="akt-table">
                    <thead>
                        <tr>
                            <th>Tanggal</th>
                            <th>Nomor Jurnal</th>
                            <th>Sumber</th>
                            <th>Keterangan</th>
                            <th>Unit / Cost Center</th>
                            <th className="akt-num">Debit</th>
                            <th className="akt-num">Kredit</th>
                            <th className="akt-num">Saldo Berjalan</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="akt-row-subtotal">
                            <td>{formatDateId(startDate)}</td>
                            <td className="akt-mono">—</td>
                            <td>—</td>
                            <td>Saldo Awal Periode</td>
                            <td>—</td>
                            <td className="akt-num">{formatRp(0)}</td>
                            <td className="akt-num">{formatRp(0)}</td>
                            <td className="akt-num">{formatRp(ledger?.opening_balance || 0)}</td>
                        </tr>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="akt-empty">
                                    Memuat mutasi Buku Besar...
                                </td>
                            </tr>
                        ) : !ledger || (ledger.entries || []).length === 0 ? (
                            <tr>
                                <td colSpan={8} className="akt-empty">
                                    Belum ada mutasi transaksi untuk akun ini pada rentang tanggal tersebut.
                                </td>
                            </tr>
                        ) : (
                            ledger.entries.map((row) => (
                                <tr key={row.item_id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateId(row.tanggal)}</td>
                                    <td className="akt-mono" style={{ fontWeight: 600 }}>
                                        {row.nomor_jurnal}
                                    </td>
                                    <td className="akt-mono" style={{ color: 'var(--pu-muted)' }}>
                                        {row.source_number || row.source_type || 'Manual'}
                                    </td>
                                    <td>{row.keterangan}</td>
                                    <td>{row.unit_nama || '—'}</td>
                                    <td className="akt-num">{formatRp(row.debit)}</td>
                                    <td className="akt-num">{formatRp(row.kredit)}</td>
                                    <td className="akt-num" style={{ fontWeight: 600 }}>
                                        {formatRp(row.running_balance)}
                                    </td>
                                </tr>
                            ))
                        )}
                        <tr className="akt-row-grandtotal">
                            <td colSpan={5} style={{ textAlign: 'right' }}>
                                TOTAL MUTASI & SALDO AKHIR ({ledger?.akun?.kode_akun || ''})
                            </td>
                            <td className="akt-num">{formatRp(ledger?.total_debit || 0)}</td>
                            <td className="akt-num">{formatRp(ledger?.total_kredit || 0)}</td>
                            <td className="akt-num">{formatRp(ledger?.closing_balance || 0)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
