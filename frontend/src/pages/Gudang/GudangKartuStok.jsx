import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    RefreshCw,
    Printer,
    Info,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import SearchableSelect from '../../components/SearchableSelect';
import DateRangePicker from '../../components/DateRangePicker';
import './Gudang.css';

export default function GudangKartuStok() {
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const paramBarangId = searchParams.get('barang');
    const [barangList, setBarangList] = useState([]);
    const [selectedBarangId, setSelectedBarangId] = useState(paramBarangId || '');
    const [selectedBarang, setSelectedBarang] = useState(null);

    const [loading, setLoading] = useState(false);
    const [loadingLedger, setLoadingLedger] = useState(false);

    // v2 Ledger states
    const [v2Ledger, setV2Ledger] = useState([]);
    const [totalV2, setTotalV2] = useState(0);
    const [pageV2, setPageV2] = useState(1);
    const [pageSizeV2, setPageSizeV2] = useState(25);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [jenisFilter, setJenisFilter] = useState('');

    // Fetch master barang list once
    const fetchBarangList = async () => {
        try {
            const res = await api.get('/gudang/barang/?page_size=1000');
            const items = res.data?.results || res.data || [];
            setBarangList(items);

            if (paramBarangId) {
                const found = items.find((b) => String(b.id) === String(paramBarangId));
                if (found) {
                    setSelectedBarang(found);
                    setSelectedBarangId(String(found.id));
                }
            } else if (items.length > 0 && !selectedBarangId) {
                setSelectedBarangId(String(items[0].id));
                setSelectedBarang(items[0]);
            }
        } catch (err) {
            console.error('Failed to load barang list for stock card', err);
        }
    };

    // Fetch v2 Ledger transactions from /gudang/ledger/
    const fetchLedgerData = async (barangId) => {
        if (!barangId) return;
        setLoadingLedger(true);
        try {
            const params = {
                barang: barangId,
                page: pageV2,
                page_size: pageSizeV2,
            };
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (jenisFilter) params.jenis = jenisFilter;

            const res = await api.get('/gudang/ledger/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setV2Ledger(data);
                setTotalV2(data.length);
            } else {
                setV2Ledger(data.results || []);
                setTotalV2(data.count || 0);
            }
        } catch (err) {
            console.error('Failed to load ledger v2', err);
        } finally {
            setLoadingLedger(false);
        }
    };

    // Fetch barang details and ledger
    const fetchStockData = async (barangId) => {
        if (!barangId) return;
        setLoading(true);
        try {
            // 1. Fetch current barang detail with up-to-date balances
            const resBarang = await api.get(`/gudang/barang/${barangId}/`);
            setSelectedBarang(resBarang.data);

            // 2. Fetch v2 ledger
            await fetchLedgerData(barangId);
        } catch (err) {
            console.error('Failed to load stock data', err);
            toast.error('Gagal memuat informasi kartu stok.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBarangList();
    }, []);

    useEffect(() => {
        if (selectedBarangId) {
            fetchStockData(selectedBarangId);
            setSearchParams({ barang: selectedBarangId });
        }
    }, [selectedBarangId]);

    useEffect(() => {
        if (selectedBarangId) {
            fetchLedgerData(selectedBarangId);
        }
    }, [pageV2, pageSizeV2, startDate, endDate, jenisFilter]);

    // Options for SearchableSelect
    const barangOptions = useMemo(() => {
        return barangList.map((b) => {
            const kode = b.kode || '';
            const nama = b.nama || '';
            const merk = b.merk ? ` (${b.merk})` : '';
            const stok = Number(b.stok_saat_ini || 0).toLocaleString('id-ID');
            const satuan = b.satuan_dasar?.kode || b.satuan_dasar?.nama || '';
            const gol = b.golongan?.nama || 'Umum';
            return {
                value: String(b.id),
                label: `[${kode}] ${nama}${merk}`,
                subtext: `Saldo Fisik: ${stok} ${satuan} • Golongan: ${gol}`,
            };
        });
    }, [barangList]);

    const handleBarangChange = (newId) => {
        if (!newId) return;
        setSelectedBarangId(String(newId));
        setSearchParams({ barang: String(newId) });
        setPageV2(1);
    };

    // Summary of movements in current v2Ledger view
    const movementSummary = useMemo(() => {
        let masuk = 0;
        let keluar = 0;
        v2Ledger.forEach((r) => {
            const qty = Number(r.qty_dasar || 0);
            if (qty > 0) masuk += qty;
            else if (qty < 0) keluar += Math.abs(qty);
        });
        return {
            masuk,
            keluar,
            net: masuk - keluar,
        };
    }, [v2Ledger]);

    const formatMoney = (val) => {
        return `Rp ${Number(val || 0).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })}`;
    };

    const formatDate = (val) => {
        if (!val) return '-';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            return d.toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return val;
        }
    };

    const renderJenisText = (jenis, row) => {
        // Deteksi transaksi Stock Opname
        if (row?.sumber_tipe === 'ADJ_IN' || (row?.sumber_nomor && row.sumber_nomor.startsWith('OPN-') && Number(row.qty_dasar) > 0)) {
            return <span className="gdg-status-text amber"><span className="gdg-status-dot" /> Stock Opname (+)</span>;
        }
        if (row?.sumber_tipe === 'ADJ_OUT' || (row?.sumber_nomor && row.sumber_nomor.startsWith('OPN-') && Number(row.qty_dasar) < 0)) {
            return <span className="gdg-status-text amber"><span className="gdg-status-dot" /> Stock Opname (-)</span>;
        }

        switch (jenis) {
            case 'INIT':
            case 'SALDO_AWAL':
                return <span className="gdg-status-text indigo"><span className="gdg-status-dot" /> Saldo Awal</span>;
            case 'IN':
                return <span className="gdg-status-text emerald"><span className="gdg-status-dot" /> Penerimaan (GRN)</span>;
            case 'OUT':
                return <span className="gdg-status-text rose"><span className="gdg-status-dot" /> Pengeluaran Unit</span>;
            case 'ADJ_PLUS':
                return <span className="gdg-status-text amber"><span className="gdg-status-dot" /> Stock Opname (+)</span>;
            case 'ADJ_MINUS':
                return <span className="gdg-status-text amber"><span className="gdg-status-dot" /> Stock Opname (-)</span>;
            case 'REV_IN':
                return <span className="gdg-status-text slate"><span className="gdg-status-dot" /> Batal GRN</span>;
            case 'REV_OUT':
                return <span className="gdg-status-text slate"><span className="gdg-status-dot" /> Batal Out</span>;
            default:
                return <span className="gdg-status-text slate"><span className="gdg-status-dot" /> {jenis}</span>;
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const isStokRendah = selectedBarang
        ? Number(selectedBarang.stok_saat_ini || 0) <= Number(selectedBarang.stok_minimum || 0)
        : false;

    const totalNilaiStok = selectedBarang
        ? Number(selectedBarang.stok_saat_ini || 0) * Number(selectedBarang.nilai_rata_rata || 0)
        : 0;

    return (
        <div className="gdg-dash-root">
            {/* ── FLAT SECTION 1: PILIH BARANG & PROFIL BARANG AKTIF ── */}
            <section className="gdg-ks-top-section">
                <div className="gdg-ks-picker-bar">
                    <span className="gdg-ks-picker-label">Pilih Barang</span>

                    <div className="gdg-ks-picker-select">
                        <SearchableSelect
                            options={barangOptions}
                            value={selectedBarangId}
                            onChange={handleBarangChange}
                            placeholder="Cari berdasarkan kode, nama barang, merk, atau golongan..."
                            searchPlaceholder="Ketik kode, nama, merk, atau golongan..."
                            emptyMessage="Barang tidak ditemukan"
                            minDropdownWidth={500}
                            maxDropdownWidth={850}
                        />
                    </div>

                    <button
                        type="button"
                        className="gdg-btn-stripe secondary"
                        onClick={() => fetchStockData(selectedBarangId)}
                        disabled={loading || !selectedBarangId}
                        title="Segarkan data kartu stok"
                    >
                        <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'gdg-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>

                {selectedBarang && (
                    <>
                        <div className="gdg-ks-item-header">
                            <div className="gdg-ks-item-title-row">
                                <h2 className="gdg-ks-item-name">[{selectedBarang.kode}] {selectedBarang.nama}</h2>
                                {isStokRendah ? (
                                    <span className="gdg-status-text rose" title="Stok berada di bawah atau sama dengan batas buffer minimum">
                                        <span className="gdg-status-dot" /> Di Bawah Minimum ({Number(selectedBarang.stok_minimum || 0).toLocaleString('id-ID')} {selectedBarang.satuan_dasar?.kode})
                                    </span>
                                ) : (
                                    <span className="gdg-status-text emerald" title="Posisi saldo fisik aman di atas batas minimum">
                                        <span className="gdg-status-dot" /> Stok Aman
                                    </span>
                                )}
                            </div>
                            <div className="gdg-ks-item-meta">
                                <span>Golongan: <strong>{selectedBarang.golongan?.nama || 'Umum'}</strong></span>
                                {selectedBarang.merk && (
                                    <span>Merk: <strong>{selectedBarang.merk}</strong></span>
                                )}
                                <span>Satuan Dasar: <strong>{selectedBarang.satuan_dasar?.kode || selectedBarang.satuan_dasar?.nama}</strong></span>
                                {selectedBarang.kemasan_list && selectedBarang.kemasan_list.length > 0 && (
                                    <span>Konversi: <strong>{selectedBarang.kemasan_list.map((k) => `1 ${k.nama_kemasan} = ${Number(k.isi_per_kemasan)} ${selectedBarang.satuan_dasar?.kode}`).join(', ')}</strong></span>
                                )}
                            </div>
                        </div>

                        {/* ── FLAT HORIZONTAL STAT-BAR (4 KPI) ── */}
                        <div className="gdg-stat-bar">
                            <div className="gdg-stat-cell">
                                <span className="gdg-stat-label">Saldo Fisik Saat Ini</span>
                                <strong className={`gdg-stat-val${isStokRendah ? ' is-danger' : ''}`}>
                                    {Number(selectedBarang.stok_saat_ini || 0).toLocaleString('id-ID')}{' '}
                                    <span className="gdg-stat-unit">{selectedBarang.satuan_dasar?.kode}</span>
                                </strong>
                                <span className="gdg-stat-sub">
                                    {isStokRendah ? 'Perlu Restock PO Segera' : 'Kondisi Stok Cukup'}
                                </span>
                            </div>

                            <div className="gdg-stat-cell">
                                <span className="gdg-stat-label">Batas Buffer Minimum</span>
                                <strong className="gdg-stat-val">
                                    {Number(selectedBarang.stok_minimum || 0).toLocaleString('id-ID')}{' '}
                                    <span className="gdg-stat-unit">{selectedBarang.satuan_dasar?.kode}</span>
                                </strong>
                                <span className="gdg-stat-sub">Ambang Batas Peringatan</span>
                            </div>

                            <div className="gdg-stat-cell">
                                <span className="gdg-stat-label">HPP Satuan (Average)</span>
                                <strong className="gdg-stat-val">
                                    {formatMoney(selectedBarang.nilai_rata_rata)}
                                </strong>
                                <span className="gdg-stat-sub">Weighted Moving Average</span>
                            </div>

                            <div className="gdg-stat-cell">
                                <span className="gdg-stat-label">Total Nilai Persediaan</span>
                                <strong className="gdg-stat-val">
                                    {formatMoney(totalNilaiStok)}
                                </strong>
                                <span className="gdg-stat-sub">Saldo Fisik × HPP Satuan</span>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {/* ── FLAT SECTION 2: BUKU BESAR MUTASI (LEDGER) ── */}
            <section className="gdg-dash-section">
                <div className="gdg-dash-section-head">
                    <div>
                        <div className="gdg-ks-ledger-title-row">
                            <h2>Buku Besar Mutasi Stok (Ledger)</h2>
                            <span className="gdg-ks-tx-count">{totalV2} transaksi</span>
                        </div>
                        <p>Jurnal mutasi kronologis stok fisik dengan metode persediaan Weighted Moving Average</p>
                    </div>

                    <div className="gdg-ks-filter-bar">
                        <DateRangePicker
                            dari={startDate}
                            sampai={endDate}
                            onChange={({ dari, sampai }) => {
                                setStartDate(dari);
                                setEndDate(sampai);
                                setPageV2(1);
                            }}
                            placeholder="Pilih Periode Mutasi"
                            triggerStyle={{
                                height: '36px',
                                minHeight: '36px',
                                maxHeight: '36px',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 500,
                                padding: '0 12px',
                                boxSizing: 'border-box',
                            }}
                        />

                        <select
                            value={jenisFilter}
                            onChange={(e) => {
                                setJenisFilter(e.target.value);
                                setPageV2(1);
                            }}
                            className="gdg-ks-select"
                        >
                            <option value="">Semua Jenis Transaksi</option>
                            <option value="INIT">Saldo Awal</option>
                            <option value="IN">Penerimaan (GRN)</option>
                            <option value="OUT">Pengeluaran Unit</option>
                            <option value="OPNAME">Stock Opname (+ / -)</option>
                            <option value="ADJ_PLUS">Stock Opname (+ Lebih)</option>
                            <option value="ADJ_MINUS">Stock Opname (- Kurang)</option>
                        </select>

                        {(startDate || endDate || jenisFilter) && (
                            <button
                                type="button"
                                className="gdg-btn-stripe secondary"
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setJenisFilter('');
                                    setPageV2(1);
                                }}
                                title="Reset filter"
                            >
                                <X size={14} strokeWidth={1.75} /> Reset Filter
                            </button>
                        )}

                        <button
                            type="button"
                            className="gdg-btn-stripe secondary"
                            onClick={handlePrint}
                            title="Cetak lembar kartu stok resmi"
                        >
                            <Printer size={14} strokeWidth={1.75} /> Cetak Kartu Stok
                        </button>
                    </div>
                </div>

                {/* BORDERLESS TABLE V2 LEDGER */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th>Waktu & Tanggal</th>
                                <th>No. Dokumen / Bukti</th>
                                <th>Jenis Transaksi</th>
                                <th style={{ textAlign: 'right' }}>Mutasi (+ / -)</th>
                                <th style={{ textAlign: 'right' }}>Saldo Akhir</th>
                                <th style={{ textAlign: 'right' }}>HPP Satuan</th>
                                <th style={{ textAlign: 'right' }}>Total Nilai</th>
                                <th>Keterangan & Petugas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingLedger ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty">
                                        Memuat jurnal mutasi buku besar...
                                    </td>
                                </tr>
                            ) : v2Ledger.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="gdg-table-empty">
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <Info size={28} className="gdg-icon-muted" />
                                            <span>Belum ada transaksi mutasi tercatat untuk periode ini.</span>
                                            <small className="gdg-cell-muted">
                                                Mutasi otomatis bertambah setiap ada Penerimaan (GRN), Pengeluaran Unit, atau Opname Fisik.
                                            </small>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                v2Ledger.map((row) => {
                                    const qty = Number(row.qty_dasar || 0);
                                    const isPos = qty > 0;
                                    return (
                                        <tr key={row.id}>
                                            <td className="gdg-date-cell">{formatDate(row.tanggal_efektif)}</td>
                                            <td className="gdg-code-cell">{row.sumber_nomor || '—'}</td>
                                            <td>{renderJenisText(row.jenis, row)}</td>
                                            <td
                                                className={`gdg-num-cell ${isPos ? 'is-pos-text' : 'is-danger-text'}`}
                                                style={{ textAlign: 'right', fontWeight: 600 }}
                                            >
                                                {isPos ? `+${qty.toLocaleString('id-ID')}` : qty.toLocaleString('id-ID')}{' '}
                                                <span className="gdg-cell-muted" style={{ fontSize: '12px', fontWeight: 500 }}>
                                                    {selectedBarang?.satuan_dasar?.kode}
                                                </span>
                                            </td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {Number(row.saldo_qty_setelah || 0).toLocaleString('id-ID')}{' '}
                                                <span className="gdg-cell-muted" style={{ fontSize: '12px', fontWeight: 500 }}>
                                                    {selectedBarang?.satuan_dasar?.kode}
                                                </span>
                                            </td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right' }}>{formatMoney(row.nilai_unit)}</td>
                                            <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(row.nilai_total)}</td>
                                            <td>
                                                <div>{row.keterangan || '—'}</div>
                                                {row.created_by_nama && row.created_by_nama !== '-' && (
                                                    <div className="gdg-unit-by">Oleh: {row.created_by_nama}</div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* MOVEMENT SUMMARY BAR */}
                {v2Ledger.length > 0 && (
                    <div className="gdg-ks-summary-bar">
                        <div className="gdg-ks-summary-item">
                            <span>Total Masuk (+)</span>
                            <strong className="is-pos-text">
                                +{movementSummary.masuk.toLocaleString('id-ID')} {selectedBarang?.satuan_dasar?.kode}
                            </strong>
                        </div>
                        <div className="gdg-ks-summary-item">
                            <span>Total Keluar (-)</span>
                            <strong className="is-danger-text">
                                -{movementSummary.keluar.toLocaleString('id-ID')} {selectedBarang?.satuan_dasar?.kode}
                            </strong>
                        </div>
                        <div className="gdg-ks-summary-item">
                            <span>Net Mutasi</span>
                            <strong className={movementSummary.net >= 0 ? 'is-pos-text' : 'is-danger-text'}>
                                {movementSummary.net >= 0 ? `+${movementSummary.net.toLocaleString('id-ID')}` : movementSummary.net.toLocaleString('id-ID')}{' '}
                                {selectedBarang?.satuan_dasar?.kode}
                            </strong>
                        </div>
                        <div className="gdg-ks-summary-item">
                            <span>Saldo Berjalan</span>
                            <strong>
                                {Number(selectedBarang?.stok_saat_ini || 0).toLocaleString('id-ID')}{' '}
                                {selectedBarang?.satuan_dasar?.kode}
                            </strong>
                        </div>
                    </div>
                )}

                {/* PAGINATION V2 */}
                <SimplePagination
                    className="gdg-dash-pagination"
                    page={pageV2}
                    pageSize={pageSizeV2}
                    total={totalV2}
                    onPageChange={setPageV2}
                    onPageSizeChange={setPageSizeV2}
                />
            </section>
        </div>
    );
}
