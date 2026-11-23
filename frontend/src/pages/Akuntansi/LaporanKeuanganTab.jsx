import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Printer } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import {
    formatRp,
    formatDateId,
    getMonthDateRange,
    exportToExcel,
    printReportPdf,
} from './akuntansiUtils';

const REPORT_TYPES = [
    { id: 'laba_rugi', label: 'Laba Rugi (Profit & Loss)' },
    { id: 'neraca', label: 'Neraca (Balance Sheet)' },
    { id: 'neraca_saldo', label: 'Neraca Saldo (Trial Balance)' },
    { id: 'aging', label: 'Aging Piutang & Utang' },
];

export default function LaporanKeuanganTab({ units = [], onOpenLedger }) {
    const defaultRange = useMemo(() => getMonthDateRange(), []);
    const [reportType, setReportType] = useState('laba_rugi');

    // Filter state
    const [startDate, setStartDate] = useState(defaultRange.start_date);
    const [endDate, setEndDate] = useState(defaultRange.end_date);
    const [asOfDate, setAsOfDate] = useState(defaultRange.end_date);
    const [unitId, setUnitId] = useState('');
    const [partnerType, setPartnerType] = useState('pelanggan');

    const [loading, setLoading] = useState(false);
    const [plData, setPlData] = useState(null);
    const [bsData, setBsData] = useState(null);
    const [tbData, setTbData] = useState(null);
    const [agingData, setAgingData] = useState(null);
    const [, setError] = useToastState('error');

    const fetchActiveReport = async () => {
        setLoading(true);
        try {
            if (reportType === 'laba_rugi') {
                const res = await api.get('/keuangan/laporan/laba-rugi/', {
                    params: {
                        start_date: startDate,
                        end_date: endDate,
                        ...(unitId ? { unit_id: unitId } : {}),
                    },
                });
                setPlData(res.data);
            } else if (reportType === 'neraca') {
                const res = await api.get('/keuangan/laporan/neraca/', {
                    params: { as_of_date: asOfDate },
                });
                setBsData(res.data);
            } else if (reportType === 'neraca_saldo') {
                const res = await api.get('/keuangan/laporan/neraca-saldo/', {
                    params: { start_date: startDate, end_date: endDate },
                });
                setTbData(res.data);
            } else if (reportType === 'aging') {
                const res = await api.get('/keuangan/laporan/aging/', {
                    params: { partner_type: partnerType, as_of_date: asOfDate },
                });
                setAgingData(res.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat laporan keuangan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActiveReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportType, startDate, endDate, asOfDate, unitId, partnerType]);

    const handleExportExcel = () => {
        if (reportType === 'laba_rugi' && plData) {
            const sec = plData.sections || {};
            const rows = [];
            const pushSec = (title, items, totalLabel, totalVal) => {
                rows.push(['', title, '']);
                (items || []).forEach((it) => {
                    rows.push([it.kode_akun, it.nama_akun, Number(it.amount || 0)]);
                });
                rows.push(['', totalLabel, Number(totalVal || 0)]);
            };
            pushSec('PENDAPATAN PELAYANAN RS', sec.pendapatan, 'TOTAL PENDAPATAN PELAYANAN', plData.total_pendapatan);
            pushSec('BEBAN POKOK PELAYANAN (HPP)', sec.harga_pokok, 'TOTAL HPP', plData.total_harga_pokok);
            rows.push(['', 'LABA KOTOR (GROSS PROFIT)', Number(plData.gross_profit || 0)]);
            pushSec('BEBAN OPERASIONAL & UMUM', sec.beban_operasional, 'TOTAL BEBAN OPERASIONAL', plData.total_beban_operasional);
            rows.push(['', 'LABA OPERASIONAL', Number(plData.operating_income || 0)]);
            pushSec('PENDAPATAN LAIN-LAIN', sec.pendapatan_lainnya, 'TOTAL PENDAPATAN LAINNYA', plData.total_pendapatan_lainnya);
            pushSec('BEBAN LAIN-LAIN', sec.beban_lainnya, 'TOTAL BEBAN LAINNYA', plData.total_beban_lainnya);
            rows.push(['', 'LABA / (RUGI) BERSIH PERIODE BERJALAN', Number(plData.net_income || 0)]);

            exportToExcel({
                filename: `Laba_Rugi_${startDate}_${endDate}.xls`,
                sheetName: 'Laba_Rugi',
                headers: ['Kode Akun', 'Uraian Pos Laba Rugi', 'Nominal (Rp)'],
                rows,
            });
        } else if (reportType === 'neraca' && bsData) {
            const sec = bsData.sections || {};
            const tot = bsData.totals_by_section || {};
            const rows = [];
            const pushSec = (title, items, totalLabel, totalVal) => {
                rows.push(['', title, '']);
                (items || []).forEach((it) => {
                    rows.push([it.kode_akun, it.nama_akun, Number(it.balance || 0)]);
                });
                rows.push(['', totalLabel, Number(totalVal || 0)]);
            };
            pushSec('ASET LANCAR', sec.aset_lancar, 'Subtotal Aset Lancar', tot.aset_lancar);
            pushSec('ASET TETAP & AKUMULASI PENYUSUTAN', sec.aset_tetap, 'Subtotal Aset Tetap (Neto)', tot.aset_tetap);
            pushSec('ASET LAINNYA', sec.aset_lainnya, 'Subtotal Aset Lainnya', tot.aset_lainnya);
            rows.push(['', 'TOTAL ASET', Number(bsData.total_assets || 0)]);
            pushSec('KEWAJIBAN LANCAR', sec.kewajiban_lancar, 'Subtotal Kewajiban Lancar', tot.kewajiban_lancar);
            pushSec('KEWAJIBAN JANGKA PANJANG', sec.kewajiban_jangka_panjang, 'Subtotal Kewajiban Jangka Panjang', tot.kewajiban_jangka_panjang);
            rows.push(['', 'TOTAL KEWAJIBAN', Number(bsData.total_liabilities || 0)]);
            pushSec('EKUITAS', sec.ekuitas, 'Subtotal Akun Ekuitas', bsData.total_equity_accounts);
            rows.push(['3113', 'Laba / (Rugi) Tahun Berjalan (Current Year Earnings)', Number(bsData.current_year_earnings || 0)]);
            rows.push(['', 'TOTAL EKUITAS', Number(bsData.total_equity || 0)]);
            rows.push(['', 'TOTAL KEWAJIBAN & EKUITAS', Number(bsData.total_liabilities_and_equity || 0)]);

            exportToExcel({
                filename: `Neraca_${asOfDate}.xls`,
                sheetName: 'Neraca',
                headers: ['Kode Akun', 'Uraian Pos Neraca', 'Saldo (Rp)'],
                rows,
            });
        } else if (reportType === 'neraca_saldo' && tbData) {
            const rows = (tbData.rows || []).map((r) => [
                r.kode_akun,
                r.nama_akun,
                r.is_postable ? 'Postable' : 'Header',
                Number(r.opening_debit || 0),
                Number(r.opening_kredit || 0),
                Number(r.mutation_debit || 0),
                Number(r.mutation_kredit || 0),
                Number(r.closing_debit || 0),
                Number(r.closing_kredit || 0),
            ]);
            rows.push([
                '',
                'TOTAL NERACA SALDO (POSTABLE)',
                '',
                Number(tbData.total_opening_debit || 0),
                Number(tbData.total_opening_kredit || 0),
                Number(tbData.total_mutation_debit || 0),
                Number(tbData.total_mutation_kredit || 0),
                Number(tbData.total_closing_debit || 0),
                Number(tbData.total_closing_kredit || 0),
            ]);
            exportToExcel({
                filename: `Neraca_Saldo_${startDate}_${endDate}.xls`,
                sheetName: 'Neraca_Saldo',
                headers: [
                    'Kode Akun',
                    'Nama Akun',
                    'Tipe',
                    'Saldo Awal (D)',
                    'Saldo Awal (K)',
                    'Mutasi (D)',
                    'Mutasi (K)',
                    'Saldo Akhir (D)',
                    'Saldo Akhir (K)',
                ],
                rows,
            });
        } else if (reportType === 'aging' && agingData) {
            const rows = (agingData.partners || []).map((p) => [
                p.partner_id,
                p.partner_name,
                Number(p.current || 0),
                Number(p.days_1_30 || 0),
                Number(p.days_31_60 || 0),
                Number(p.days_61_90 || 0),
                Number(p.days_over_90 || 0),
                Number(p.total || 0),
            ]);
            const s = agingData.summary || {};
            rows.push([
                '',
                'TOTAL KESELURUHAN',
                Number(s.current || 0),
                Number(s.days_1_30 || 0),
                Number(s.days_31_60 || 0),
                Number(s.days_61_90 || 0),
                Number(s.days_over_90 || 0),
                Number(s.total || 0),
            ]);
            exportToExcel({
                filename: `Aging_${partnerType}_${asOfDate}.xls`,
                sheetName: 'Aging_Report',
                headers: [
                    'ID Partner',
                    'Nama Partner',
                    'Belum Jatuh Tempo',
                    '1 - 30 Hari',
                    '31 - 60 Hari',
                    '61 - 90 Hari',
                    '> 90 Hari',
                    'Total Saldo Terbuka',
                ],
                rows,
            });
        }
    };

    const handlePrintPdf = () => {
        const el = document.getElementById('akt-report-printable');
        if (!el) return;
        const activeMeta = REPORT_TYPES.find((r) => r.id === reportType);
        const sub =
            reportType === 'neraca' || reportType === 'aging'
                ? `Per Tanggal: ${formatDateId(asOfDate)}`
                : `Periode: ${formatDateId(startDate)} s/d ${formatDateId(endDate)}`;
        printReportPdf({
            title: activeMeta?.label || 'Laporan Keuangan',
            subtitle: sub,
            htmlContent: el.innerHTML,
        });
    };

    const renderAccountLink = (akunId, kodeAkun) => (
        <button
            type="button"
            className="akt-mono"
            style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--pu-accent)',
                fontWeight: 600,
                cursor: 'pointer',
            }}
            onClick={() => onOpenLedger && onOpenLedger(akunId || kodeAkun)}
            title="Lihat rincian di Buku Besar"
        >
            {kodeAkun}
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Secondary Sub-Tabs for 4 Core Financial Reports */}
            <div className="akt-subtabs">
                {REPORT_TYPES.map((rt) => (
                    <button
                        key={rt.id}
                        type="button"
                        className={`akt-subtab ${reportType === rt.id ? 'active' : ''}`}
                        onClick={() => setReportType(rt.id)}
                    >
                        {rt.label}
                    </button>
                ))}
            </div>

            {/* 2. Compact 32px Filter Toolbar */}
            <div className="akt-toolbar">
                <div className="akt-toolbar-left">
                    {(reportType === 'laba_rugi' || reportType === 'neraca_saldo') && (
                        <>
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
                        </>
                    )}

                    {reportType === 'laba_rugi' && (
                        <select
                            className="akt-select"
                            value={unitId}
                            onChange={(e) => setUnitId(e.target.value)}
                        >
                            <option value="">Semua Unit / Cost Center (Konsolidasi RS)</option>
                            {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                    Unit: {u.nama}
                                </option>
                            ))}
                        </select>
                    )}

                    {(reportType === 'neraca' || reportType === 'aging') && (
                        <>
                            <span style={{ fontSize: 12.5, color: 'var(--pu-muted)', fontWeight: 500 }}>
                                Per Tanggal (Cut-off):
                            </span>
                            <input
                                type="date"
                                className="akt-input"
                                value={asOfDate}
                                onChange={(e) => setAsOfDate(e.target.value)}
                            />
                        </>
                    )}

                    {reportType === 'aging' && (
                        <select
                            className="akt-select"
                            value={partnerType}
                            onChange={(e) => setPartnerType(e.target.value)}
                        >
                            <option value="pelanggan">Umur Piutang (Penjamin / Pelanggan)</option>
                            <option value="pemasok">Umur Utang (Supplier / Vendor)</option>
                        </select>
                    )}

                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={fetchActiveReport}
                        title="Segarkan Laporan"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>

                <div className="akt-toolbar-right">
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={handleExportExcel}
                    >
                        <Download size={13} /> Export Excel (.xlsx)
                    </button>
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={handlePrintPdf}
                    >
                        <Printer size={13} /> Cetak PDF
                    </button>
                </div>
            </div>

            {/* 3. Report Body */}
            <div id="akt-report-printable">
                {loading ? (
                    <div className="akt-empty">Menghitung laporan keuangan...</div>
                ) : reportType === 'laba_rugi' && plData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="akt-stat-bar">
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total Pendapatan Pelayanan</span>
                                <span className="akt-stat-value">{formatRp(plData.total_pendapatan)}</span>
                                <span className="akt-stat-sub">Neto setelah potongan COB</span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total HPP Pelayanan</span>
                                <span className="akt-stat-value">{formatRp(plData.total_harga_pokok)}</span>
                                <span className="akt-stat-sub">Obat, BHP & Logistik</span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Laba Kotor (Gross Profit)</span>
                                <span className="akt-stat-value">{formatRp(plData.gross_profit)}</span>
                                <span className="akt-stat-sub">Pendapatan dikurangi HPP</span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Laba / (Rugi) Bersih</span>
                                <span className="akt-stat-value">{formatRp(plData.net_income)}</span>
                                <span className="akt-stat-sub">Bottom-line periode ini</span>
                            </div>
                        </div>

                        <div className="akt-table-wrap">
                            <table className="akt-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 110 }}>Kode Akun</th>
                                        <th>Uraian Pos Laba Rugi</th>
                                        <th className="akt-num" style={{ width: 220 }}>
                                            Nominal (Rp)
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="akt-row-section">
                                        <td colSpan={3}>Pendapatan Pelayanan Rumah Sakit</td>
                                    </tr>
                                    {(plData.sections?.pendapatan || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={3} style={{ color: 'var(--pu-faint)' }}>
                                                Belum ada mutasi pendapatan pada periode ini.
                                            </td>
                                        </tr>
                                    ) : (
                                        plData.sections.pendapatan.map((row) => (
                                            <tr key={row.akun_id}>
                                                <td>{renderAccountLink(row.akun_id, row.kode_akun)}</td>
                                                <td>{row.nama_akun}</td>
                                                <td className="akt-num">{formatRp(row.amount)}</td>
                                            </tr>
                                        ))
                                    )}
                                    <tr className="akt-row-subtotal">
                                        <td colSpan={2}>Total Pendapatan Pelayanan</td>
                                        <td className="akt-num">{formatRp(plData.total_pendapatan)}</td>
                                    </tr>

                                    <tr className="akt-row-section">
                                        <td colSpan={3}>Harga Pokok Pelayanan (HPP)</td>
                                    </tr>
                                    {(plData.sections?.harga_pokok || []).map((row) => (
                                        <tr key={row.akun_id}>
                                            <td>{renderAccountLink(row.akun_id, row.kode_akun)}</td>
                                            <td>{row.nama_akun}</td>
                                            <td className="akt-num">{formatRp(row.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr className="akt-row-subtotal">
                                        <td colSpan={2}>Total Harga Pokok Pelayanan (HPP)</td>
                                        <td className="akt-num">{formatRp(plData.total_harga_pokok)}</td>
                                    </tr>

                                    <tr className="akt-row-subtotal">
                                        <td colSpan={2}>LABA KOTOR (GROSS PROFIT)</td>
                                        <td className="akt-num">{formatRp(plData.gross_profit)}</td>
                                    </tr>

                                    <tr className="akt-row-section">
                                        <td colSpan={3}>Beban Operasional & Umum</td>
                                    </tr>
                                    {(plData.sections?.beban_operasional || []).map((row) => (
                                        <tr key={row.akun_id}>
                                            <td>{renderAccountLink(row.akun_id, row.kode_akun)}</td>
                                            <td>{row.nama_akun}</td>
                                            <td className="akt-num">{formatRp(row.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr className="akt-row-subtotal">
                                        <td colSpan={2}>Total Beban Operasional</td>
                                        <td className="akt-num">{formatRp(plData.total_beban_operasional)}</td>
                                    </tr>

                                    {((plData.sections?.pendapatan_lainnya || []).length > 0 ||
                                        (plData.sections?.beban_lainnya || []).length > 0) && (
                                        <>
                                            <tr className="akt-row-section">
                                                <td colSpan={3}>Pendapatan & Beban Lain-Lain</td>
                                            </tr>
                                            {(plData.sections?.pendapatan_lainnya || []).map((row) => (
                                                <tr key={row.akun_id}>
                                                    <td>{renderAccountLink(row.akun_id, row.kode_akun)}</td>
                                                    <td>{row.nama_akun}</td>
                                                    <td className="akt-num">{formatRp(row.amount)}</td>
                                                </tr>
                                            ))}
                                            {(plData.sections?.beban_lainnya || []).map((row) => (
                                                <tr key={row.akun_id}>
                                                    <td>{renderAccountLink(row.akun_id, row.kode_akun)}</td>
                                                    <td>{row.nama_akun}</td>
                                                    <td className="akt-num">{formatRp(-Number(row.amount || 0))}</td>
                                                </tr>
                                            ))}
                                        </>
                                    )}

                                    <tr className="akt-row-grandtotal">
                                        <td colSpan={2}>LABA / (RUGI) BERSIH PERIODE BERJALAN</td>
                                        <td className="akt-num">{formatRp(plData.net_income)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : reportType === 'neraca' && bsData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="akt-stat-bar">
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total Aset (Aktiva)</span>
                                <span className="akt-stat-value">{formatRp(bsData.total_assets)}</span>
                                <span className="akt-stat-sub">Per {formatDateId(asOfDate)}</span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total Kewajiban (Liabilitas)</span>
                                <span className="akt-stat-value">{formatRp(bsData.total_liabilities)}</span>
                                <span className="akt-stat-sub">Jangka pendek & panjang</span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total Ekuitas (Modal + Laba Berjalan)</span>
                                <span className="akt-stat-value">{formatRp(bsData.total_equity)}</span>
                                <span className="akt-stat-sub">
                                    Termasuk Laba Berjalan {formatRp(bsData.current_year_earnings)}
                                </span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Status Keseimbangan Neraca</span>
                                <span className="akt-stat-value">
                                    {bsData.is_balanced ? (
                                        <span className="akt-badge akt-badge-posted" style={{ fontSize: 13 }}>
                                            ✓ BALANCED
                                        </span>
                                    ) : (
                                        <span className="akt-badge akt-badge-reversed" style={{ fontSize: 13 }}>
                                            UNBALANCED
                                        </span>
                                    )}
                                </span>
                                <span className="akt-stat-sub">Aktiva = Pasiva (Kewajiban + Ekuitas)</span>
                            </div>
                        </div>

                        <div className="akt-split-grid">
                            {/* Left: Assets */}
                            <div className="akt-table-wrap">
                                <table className="akt-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 90 }}>Kode</th>
                                            <th>Aktiva (Aset)</th>
                                            <th className="akt-num">Saldo (Rp)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="akt-row-section">
                                            <td colSpan={3}>Aset Lancar</td>
                                        </tr>
                                        {(bsData.sections?.aset_lancar || []).map((r) => (
                                            <tr key={r.akun_id}>
                                                <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                <td>{r.nama_akun}</td>
                                                <td className="akt-num">{formatRp(r.balance)}</td>
                                            </tr>
                                        ))}
                                        <tr className="akt-row-subtotal">
                                            <td colSpan={2}>Subtotal Aset Lancar</td>
                                            <td className="akt-num">
                                                {formatRp(bsData.totals_by_section?.aset_lancar || 0)}
                                            </td>
                                        </tr>

                                        <tr className="akt-row-section">
                                            <td colSpan={3}>Aset Tetap & Akumulasi Penyusutan</td>
                                        </tr>
                                        {(bsData.sections?.aset_tetap || []).map((r) => (
                                            <tr key={r.akun_id}>
                                                <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                <td>{r.nama_akun}</td>
                                                <td className="akt-num">{formatRp(r.balance)}</td>
                                            </tr>
                                        ))}
                                        <tr className="akt-row-subtotal">
                                            <td colSpan={2}>Subtotal Aset Tetap (Nilai Buku Neto)</td>
                                            <td className="akt-num">
                                                {formatRp(bsData.totals_by_section?.aset_tetap || 0)}
                                            </td>
                                        </tr>

                                        {(bsData.sections?.aset_lainnya || []).length > 0 && (
                                            <>
                                                <tr className="akt-row-section">
                                                    <td colSpan={3}>Aset Lainnya</td>
                                                </tr>
                                                {bsData.sections.aset_lainnya.map((r) => (
                                                    <tr key={r.akun_id}>
                                                        <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                        <td>{r.nama_akun}</td>
                                                        <td className="akt-num">{formatRp(r.balance)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        <tr className="akt-row-grandtotal">
                                            <td colSpan={2}>TOTAL ASET (AKTIVA)</td>
                                            <td className="akt-num">{formatRp(bsData.total_assets)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Right: Liabilities & Equity */}
                            <div className="akt-table-wrap">
                                <table className="akt-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 90 }}>Kode</th>
                                            <th>Pasiva (Kewajiban & Ekuitas)</th>
                                            <th className="akt-num">Saldo (Rp)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="akt-row-section">
                                            <td colSpan={3}>Kewajiban Lancar</td>
                                        </tr>
                                        {(bsData.sections?.kewajiban_lancar || []).map((r) => (
                                            <tr key={r.akun_id}>
                                                <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                <td>{r.nama_akun}</td>
                                                <td className="akt-num">{formatRp(r.balance)}</td>
                                            </tr>
                                        ))}
                                        <tr className="akt-row-subtotal">
                                            <td colSpan={2}>Subtotal Kewajiban Lancar</td>
                                            <td className="akt-num">
                                                {formatRp(bsData.totals_by_section?.kewajiban_lancar || 0)}
                                            </td>
                                        </tr>

                                        {(bsData.sections?.kewajiban_jangka_panjang || []).length > 0 && (
                                            <>
                                                <tr className="akt-row-section">
                                                    <td colSpan={3}>Kewajiban Jangka Panjang</td>
                                                </tr>
                                                {bsData.sections.kewajiban_jangka_panjang.map((r) => (
                                                    <tr key={r.akun_id}>
                                                        <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                        <td>{r.nama_akun}</td>
                                                        <td className="akt-num">{formatRp(r.balance)}</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        <tr className="akt-row-subtotal">
                                            <td colSpan={2}>TOTAL KEWAJIBAN</td>
                                            <td className="akt-num">{formatRp(bsData.total_liabilities)}</td>
                                        </tr>

                                        <tr className="akt-row-section">
                                            <td colSpan={3}>Ekuitas & Laba Tahun Berjalan</td>
                                        </tr>
                                        {(bsData.sections?.ekuitas || []).map((r) => (
                                            <tr key={r.akun_id}>
                                                <td>{renderAccountLink(r.akun_id, r.kode_akun)}</td>
                                                <td>{r.nama_akun}</td>
                                                <td className="akt-num">{formatRp(r.balance)}</td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td className="akt-mono" style={{ color: 'var(--pu-muted)' }}>
                                                3113*
                                            </td>
                                            <td>
                                                Laba / (Rugi) Tahun Berjalan{' '}
                                                <span className="akt-badge akt-badge-info">Auto Roll-up</span>
                                            </td>
                                            <td className="akt-num">
                                                {formatRp(bsData.current_year_earnings)}
                                            </td>
                                        </tr>
                                        <tr className="akt-row-subtotal">
                                            <td colSpan={2}>TOTAL EKUITAS</td>
                                            <td className="akt-num">{formatRp(bsData.total_equity)}</td>
                                        </tr>

                                        <tr className="akt-row-grandtotal">
                                            <td colSpan={2}>TOTAL KEWAJIBAN & EKUITAS (PASIVA)</td>
                                            <td className="akt-num">
                                                {formatRp(bsData.total_liabilities_and_equity)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : reportType === 'neraca_saldo' && tbData ? (
                    <div className="akt-table-wrap">
                        <table className="akt-table">
                            <thead>
                                <tr>
                                    <th>Kode Akun</th>
                                    <th>Nama Akun</th>
                                    <th>Level</th>
                                    <th className="akt-num">Saldo Awal (D)</th>
                                    <th className="akt-num">Saldo Awal (K)</th>
                                    <th className="akt-num">Mutasi (D)</th>
                                    <th className="akt-num">Mutasi (K)</th>
                                    <th className="akt-num">Saldo Akhir (D)</th>
                                    <th className="akt-num">Saldo Akhir (K)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(tbData.rows || []).map((r) => {
                                    const hasActivity =
                                        Number(r.opening_debit) !== 0 ||
                                        Number(r.opening_kredit) !== 0 ||
                                        Number(r.mutation_debit) !== 0 ||
                                        Number(r.mutation_kredit) !== 0 ||
                                        Number(r.closing_debit) !== 0 ||
                                        Number(r.closing_kredit) !== 0;
                                    if (!hasActivity && r.is_postable) return null;
                                    return (
                                        <tr
                                            key={r.akun_id}
                                            style={
                                                !r.is_postable
                                                    ? {
                                                          fontWeight: 600,
                                                          background: 'var(--pu-surface-2)',
                                                      }
                                                    : undefined
                                            }
                                        >
                                            <td>
                                                {r.is_postable ? (
                                                    renderAccountLink(r.akun_id, r.kode_akun)
                                                ) : (
                                                    <span className="akt-mono">{r.kode_akun}</span>
                                                )}
                                            </td>
                                            <td style={{ paddingLeft: r.is_postable ? 22 : 12 }}>
                                                {r.nama_akun}
                                            </td>
                                            <td>
                                                {r.is_postable ? (
                                                    <span className="akt-badge akt-badge-muted">Detail</span>
                                                ) : (
                                                    <span className="akt-badge akt-badge-info">Header</span>
                                                )}
                                            </td>
                                            <td className="akt-num">{formatRp(r.opening_debit, false)}</td>
                                            <td className="akt-num">{formatRp(r.opening_kredit, false)}</td>
                                            <td className="akt-num">{formatRp(r.mutation_debit, false)}</td>
                                            <td className="akt-num">{formatRp(r.mutation_kredit, false)}</td>
                                            <td className="akt-num">{formatRp(r.closing_debit, false)}</td>
                                            <td className="akt-num">{formatRp(r.closing_kredit, false)}</td>
                                        </tr>
                                    );
                                })}
                                <tr className="akt-row-grandtotal">
                                    <td colSpan={3}>
                                        TOTAL NERACA SALDO{' '}
                                        {tbData.is_balanced ? (
                                            <span className="akt-badge akt-badge-posted" style={{ marginLeft: 8 }}>
                                                ✓ BALANCED
                                            </span>
                                        ) : (
                                            <span className="akt-badge akt-badge-reversed" style={{ marginLeft: 8 }}>
                                                UNBALANCED
                                            </span>
                                        )}
                                    </td>
                                    <td className="akt-num">{formatRp(tbData.total_opening_debit)}</td>
                                    <td className="akt-num">{formatRp(tbData.total_opening_kredit)}</td>
                                    <td className="akt-num">{formatRp(tbData.total_mutation_debit)}</td>
                                    <td className="akt-num">{formatRp(tbData.total_mutation_kredit)}</td>
                                    <td className="akt-num">{formatRp(tbData.total_closing_debit)}</td>
                                    <td className="akt-num">{formatRp(tbData.total_closing_kredit)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ) : reportType === 'aging' && agingData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="akt-stat-bar">
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Belum Jatuh Tempo (Current)</span>
                                <span className="akt-stat-value">
                                    {formatRp(agingData.summary?.current || 0)}
                                </span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Menunggak 1 – 30 Hari</span>
                                <span className="akt-stat-value">
                                    {formatRp(agingData.summary?.days_1_30 || 0)}
                                </span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Menunggak 31 – 90 Hari</span>
                                <span className="akt-stat-value">
                                    {formatRp(
                                        Number(agingData.summary?.days_31_60 || 0) +
                                            Number(agingData.summary?.days_61_90 || 0)
                                    )}
                                </span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Menunggak &gt; 90 Hari</span>
                                <span className="akt-stat-value">
                                    {formatRp(agingData.summary?.days_over_90 || 0)}
                                </span>
                            </div>
                            <div className="akt-stat-item">
                                <span className="akt-stat-label">Total Saldo Terbuka</span>
                                <span className="akt-stat-value">
                                    {formatRp(agingData.summary?.total || 0)}
                                </span>
                            </div>
                        </div>

                        <div className="akt-table-wrap">
                            <table className="akt-table">
                                <thead>
                                    <tr>
                                        <th>ID Partner</th>
                                        <th>
                                            {partnerType === 'pelanggan'
                                                ? 'Nama Penjamin / Pelanggan'
                                                : 'Nama Supplier / Vendor'}
                                        </th>
                                        <th className="akt-num">Belum Jatuh Tempo</th>
                                        <th className="akt-num">1 – 30 Hari</th>
                                        <th className="akt-num">31 – 60 Hari</th>
                                        <th className="akt-num">61 – 90 Hari</th>
                                        <th className="akt-num">&gt; 90 Hari</th>
                                        <th className="akt-num">Total Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(agingData.partners || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="akt-empty">
                                                Tidak ada saldo terbuka untuk kategori partner ini per{' '}
                                                {formatDateId(asOfDate)}.
                                            </td>
                                        </tr>
                                    ) : (
                                        agingData.partners.map((p) => (
                                            <tr key={p.partner_id}>
                                                <td className="akt-mono">#{p.partner_id}</td>
                                                <td style={{ fontWeight: 600 }}>{p.partner_name}</td>
                                                <td className="akt-num">{formatRp(p.current)}</td>
                                                <td className="akt-num">{formatRp(p.days_1_30)}</td>
                                                <td className="akt-num">{formatRp(p.days_31_60)}</td>
                                                <td className="akt-num">{formatRp(p.days_61_90)}</td>
                                                <td className="akt-num">{formatRp(p.days_over_90)}</td>
                                                <td className="akt-num" style={{ fontWeight: 600 }}>
                                                    {formatRp(p.total)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    <tr className="akt-row-grandtotal">
                                        <td colSpan={2}>TOTAL AGING KESELURUHAN</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.current || 0)}</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.days_1_30 || 0)}</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.days_31_60 || 0)}</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.days_61_90 || 0)}</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.days_over_90 || 0)}</td>
                                        <td className="akt-num">{formatRp(agingData.summary?.total || 0)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
