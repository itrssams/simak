import { useState, useRef } from 'react';
import { useToastState } from '../../context/ToastContext';
import { Download, Loader } from 'lucide-react';
import api from '../../api/axiosConfig';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const formatRupiah = (value) => {
    const num = Number(value);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 2 });
};

const isNegative = (value) => Number(value) < 0;

export default function ArusKas() {
    const now = new Date();
    const [dari, setDari] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    const [sampai, setSampai] = useState(now.toISOString().split('T')[0]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useToastState('error');
    const reportRef = useRef();

    const fetchLaporan = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await api.get(`/keuangan/transaksi/laporan-arus-kas/?dari=${dari}&sampai=${sampai}`);
            setData(res.data);
        } catch {
            setError('Gagal memuat laporan. Pastikan server berjalan.');
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setExporting(true);
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const fileName = `laporan-arus-kas-${dari}-sd-${sampai}.pdf`;
            pdf.save(fileName);
        } catch (e) {
            console.error(e);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div>
            <style>{`
                .filter-input {
                    padding: 9px 14px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b;
                    outline: none;
                    transition: border-color 0.15s;
                    background: #fff;
                }
                .filter-input:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }

                .filter-btn {
                    padding: 9px 24px;
                    background: #1a4731;
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .filter-btn:hover { background: #2d6a4f; }
                .filter-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .export-btn {
                    padding: 9px 20px;
                    background: #c9a84c;
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    cursor: pointer;
                    transition: background 0.15s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .export-btn:hover { background: #b8923d; }
                .export-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .report-table { width: 100%; border-collapse: collapse; }

                .row-section { background: #1a4731; color: #fff; }
                .row-section td { padding: 10px 16px; font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }

                .row-group { background: #f0f7f3; }
                .row-group td { padding: 9px 16px; font-weight: 600; font-size: 13px; color: #1a4731; border-bottom: 1px solid #e2e8f0; }

                .row-item td { padding: 8px 16px 8px 36px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; }
                .row-item:hover td { background: #f8fafb; }

                .row-grand td { padding: 12px 16px; font-weight: 700; font-size: 14px; background: #1a4731; color: #fff; }

                .row-kas-awal td { padding: 11px 16px; font-weight: 600; font-size: 13px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #1e293b; }

                .amount { text-align: right; font-variant-numeric: tabular-nums; }
                .amount-neg { color: #dc2626; }
                .amount-pos { color: #166534; }
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Laporan Arus Kas</h1>
                    <p style={styles.subtitle}>RS Siaga Al Munawwarah Samarinda</p>
                </div>
                {data && (
                    <button className="export-btn" onClick={handleExportPDF} disabled={exporting}>
                        {exporting ? <><Loader size={16} style={{ marginRight: 6, animation: 'spin 2s infinite' }} /> Mengekspor...</> : <><Download size={16} style={{ marginRight: 6 }} /> Export PDF</>}
                    </button>
                )}
            </div>

            {/* Filter */}
            <div style={styles.filterCard}>
                <div style={styles.filterRow}>
                    <div style={styles.filterField}>
                        <label style={styles.filterLabel}>Dari Tanggal</label>
                        <input className="filter-input" type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
                    </div>
                    <div style={styles.filterField}>
                        <label style={styles.filterLabel}>Sampai Tanggal</label>
                        <input className="filter-input" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
                    </div>
                    <button className="filter-btn" onClick={fetchLaporan} disabled={loading} style={{ alignSelf: 'flex-end' }}>
                        {loading ? 'Memuat...' : 'Tampilkan'}
                    </button>
                </div>
            </div>

            {error && <div style={styles.alertError}>{error}</div>}

            {/* Laporan */}
            {data && (
                <div style={styles.reportCard} ref={reportRef}>

                    {/* Periode Header */}
                    <div style={styles.periodeHeader}>
                        <span style={styles.periodeTitle}>RS Siaga Al Munawwarah Samarinda</span>
                        <div style={styles.periodeRight}>
                            <div style={styles.periodeBadge}>
                                {new Date(dari).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' — '}
                                {new Date(sampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={styles.saldoLabel}>Saldo</div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="report-table">
                        <tbody>

                            {/* KAS AWAL */}
                            <tr className="row-kas-awal">
                                <td>Kas dan setara kas, permulaan periode</td>
                                <td className={`amount ${isNegative(data.kas_awal) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.kas_awal)}
                                </td>
                            </tr>

                            {/* SECTION: Aktiva */}
                            <tr className="row-section">
                                <td colSpan={2}>Aktiva yang meningkat dalam kas dan setara kas</td>
                            </tr>

                            {/* OPERASI */}
                            <tr className="row-group"><td colSpan={2}>Aliran kas dari aktivitas operasi</td></tr>
                            <tr className="row-item">
                                <td>Tagihan Muka yang diterima dari pelanggan</td>
                                <td className={`amount ${isNegative(data.operasi.tagihan_muka_pelanggan.masuk - data.operasi.tagihan_muka_pelanggan.keluar) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.operasi.tagihan_muka_pelanggan.masuk - data.operasi.tagihan_muka_pelanggan.keluar)}
                                </td>
                            </tr>
                            <tr className="row-item">
                                <td>Uang kas yang diterima dari kegiatan operasi</td>
                                <td className={`amount ${isNegative(data.operasi.kas_masuk_operasi.masuk - data.operasi.kas_masuk_operasi.keluar) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.operasi.kas_masuk_operasi.masuk - data.operasi.kas_masuk_operasi.keluar)}
                                </td>
                            </tr>
                            <tr className="row-item">
                                <td>Tagihan muka yang dibuat untuk pemasok</td>
                                <td className={`amount ${isNegative(data.operasi.tagihan_muka_pemasok.masuk - data.operasi.tagihan_muka_pemasok.keluar) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.operasi.tagihan_muka_pemasok.masuk - data.operasi.tagihan_muka_pemasok.keluar)}
                                </td>
                            </tr>
                            <tr className="row-item">
                                <td>Uang kas yang dibayar untuk kegiatan operasi</td>
                                <td className={`amount ${isNegative(data.operasi.kas_keluar_operasi.masuk - data.operasi.kas_keluar_operasi.keluar) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.operasi.kas_keluar_operasi.masuk - data.operasi.kas_keluar_operasi.keluar)}
                                </td>
                            </tr>

                            {/* INVESTASI */}
                            <tr className="row-group"><td colSpan={2}>Aliran kas dari aktivitas investasi & kejadian luar biasa</td></tr>
                            <tr className="row-item">
                                <td>Kas masuk</td>
                                <td className={`amount ${isNegative(data.investasi.kas_masuk) ? 'amount-neg' : ''}`}>{formatRupiah(data.investasi.kas_masuk)}</td>
                            </tr>
                            <tr className="row-item">
                                <td>Kas keluar</td>
                                <td className={`amount ${isNegative(data.investasi.kas_keluar) ? 'amount-neg' : ''}`}>{formatRupiah(data.investasi.kas_keluar)}</td>
                            </tr>

                            {/* KEUANGAN */}
                            <tr className="row-group"><td colSpan={2}>Aliran kas dari aktivitas keuangan</td></tr>
                            <tr className="row-item">
                                <td>Kas masuk</td>
                                <td className={`amount ${isNegative(data.keuangan.kas_masuk) ? 'amount-neg' : ''}`}>{formatRupiah(data.keuangan.kas_masuk)}</td>
                            </tr>
                            <tr className="row-item">
                                <td>Kas keluar</td>
                                <td className={`amount ${isNegative(data.keuangan.kas_keluar) ? 'amount-neg' : ''}`}>{formatRupiah(data.keuangan.kas_keluar)}</td>
                            </tr>

                            {/* TIDAK DIKLASIFIKASI */}
                            <tr className="row-group"><td colSpan={2}>Aliran kas dari aktivitas yang tidak diklasifikasikan</td></tr>

                            {data.tidak_diklasifikasi.per_akun.filter(a => Number(a.kas_masuk) > 0).length > 0 && <>
                                <tr className="row-item">
                                    <td style={{ paddingLeft: '24px', fontWeight: '600', color: '#475569' }}>Kas masuk</td>
                                    <td></td>
                                </tr>
                                {data.tidak_diklasifikasi.per_akun.filter(a => Number(a.kas_masuk) > 0).map((akun, i) => (
                                    <tr className="row-item" key={`masuk-${i}`}>
                                        <td style={{ paddingLeft: '48px' }}>{akun.kode_akun} {akun.nama_akun}</td>
                                        <td className="amount">{formatRupiah(akun.kas_masuk)}</td>
                                    </tr>
                                ))}
                                <tr className="row-item">
                                    <td style={{ paddingLeft: '24px', fontWeight: '700', color: '#1a2e1a' }}>Total Kas masuk</td>
                                    <td className="amount amount-pos" style={{ fontWeight: '700' }}>{formatRupiah(data.tidak_diklasifikasi.total_masuk)}</td>
                                </tr>
                            </>}

                            {data.tidak_diklasifikasi.per_akun.filter(a => Number(a.kas_keluar) > 0).length > 0 && <>
                                <tr className="row-item">
                                    <td style={{ paddingLeft: '24px', fontWeight: '600', color: '#475569' }}>Kas keluar</td>
                                    <td></td>
                                </tr>
                                {data.tidak_diklasifikasi.per_akun.filter(a => Number(a.kas_keluar) > 0).map((akun, i) => (
                                    <tr className="row-item" key={`keluar-${i}`}>
                                        <td style={{ paddingLeft: '48px' }}>{akun.kode_akun} {akun.nama_akun}</td>
                                        <td className="amount amount-neg">-{formatRupiah(akun.kas_keluar)}</td>
                                    </tr>
                                ))}
                                <tr className="row-item">
                                    <td style={{ paddingLeft: '24px', fontWeight: '700', color: '#1a2e1a' }}>Total Kas keluar</td>
                                    <td className="amount amount-neg" style={{ fontWeight: '700' }}>-{formatRupiah(data.tidak_diklasifikasi.total_keluar)}</td>
                                </tr>
                            </>}

                            {/* KAS AKHIR */}
                            <tr className="row-section"><td colSpan={2}>Kas dan setara kas, saldo penutupan</td></tr>
                            {data.kas_akhir.per_akun.map((akun, i) => (
                                <tr className="row-item" key={i}>
                                    <td style={{ paddingLeft: '36px' }}>{akun.kode_akun} {akun.nama_akun}</td>
                                    <td className={`amount ${isNegative(akun.total) ? 'amount-neg' : ''}`}>{formatRupiah(akun.total)}</td>
                                </tr>
                            ))}
                            <tr className="row-grand">
                                <td>Total Kas dan setara kas, saldo penutupan</td>
                                <td className={`amount ${isNegative(data.kas_akhir.total) ? 'amount-neg' : ''}`}>
                                    {formatRupiah(data.kas_akhir.total)}
                                </td>
                            </tr>

                        </tbody>
                    </table></div>
                </div>
            )}
        </div>
    );
}

const styles = {
    header: { marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
    title: { fontSize: '24px', fontWeight: '700', color: '#1a2e1a' },
    subtitle: { fontSize: '14px', color: '#64748b', marginTop: '4px' },
    filterCard: { background: '#fff', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' },
    filterRow: { display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' },
    filterField: { display: 'flex', flexDirection: 'column', gap: '6px' },
    filterLabel: { fontSize: '12px', fontWeight: '600', color: '#475569' },
    alertError: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', padding: '12px 16px', fontSize: '14px', marginBottom: '16px' },
    reportCard: { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' },
    periodeHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '2px solid #1a4731', background: '#f8fafb' },
    periodeTitle: { fontWeight: '700', color: '#1a2e1a', fontSize: '15px' },
    periodeRight: { display: 'flex', alignItems: 'center', gap: '24px' },
    periodeBadge: { background: '#1a4731', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600' },
    saldoLabel: { fontWeight: '700', color: '#475569', fontSize: '13px', minWidth: '80px', textAlign: 'right' },
};