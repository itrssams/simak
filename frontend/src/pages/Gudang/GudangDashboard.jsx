import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw,
    Send,
    Search,
    Inbox,
    History,
    Eye,
    BellRing,
    Clock,
    CheckCircle2,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';

export default function GudangDashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const [stats, setStats] = useState({
        total_item: 0,
        item_ada_stok: 0,
        item_stok_minimum: 0,
        total_nilai_aset_stok: 0,
    });
    const [lowStockItems, setLowStockItems] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [procurementAlerts, setProcurementAlerts] = useState({
        counts: { total_sedang_diajukan: 0, ready_count: 0, awaiting_count: 0, can_approve_followup: false },
        ready_for_followup: [],
        awaiting_stock: [],
    });

    // Permintaan Unit states
    const [permintaanList, setPermintaanList] = useState([]);
    const [permintaanLoading, setPermintaanLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPermintaan, setTotalPermintaan] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSummary = async () => {
        try {
            const [resSummary, resLow, resPending, resAlerts] = await Promise.allSettled([
                api.get('/gudang/barang/ringkasan_stok/'),
                api.get('/gudang/barang/?page_size=50'),
                api.get('/gudang/permintaan/?status=MENUNGGU&page_size=1'),
                api.get('/gudang/permintaan/procurement-alerts/'),
            ]);

            if (resSummary.status === 'fulfilled') {
                setStats(resSummary.value.data);
            }

            if (resLow.status === 'fulfilled') {
                const allItems = resLow.value.data?.results || resLow.value.data || [];
                setLowStockItems(allItems.filter((i) => i.is_stok_rendah).slice(0, 10));
            }

            if (resPending.status === 'fulfilled') {
                setPendingCount(resPending.value.data?.count || 0);
            }

            if (resAlerts.status === 'fulfilled' && resAlerts.value.data) {
                setProcurementAlerts(resAlerts.value.data);
            }
        } catch (err) {
            console.error('Failed to load gudang summary', err);
            toast.error('Gagal memuat ringkasan stok gudang.');
        }
    };

    const fetchPermintaan = async () => {
        setPermintaanLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
            };
            if (statusFilter) params.status = statusFilter;
            if (searchQuery.trim()) params.search = searchQuery.trim();

            const res = await api.get('/gudang/permintaan/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setPermintaanList(data);
                setTotalPermintaan(data.length);
            } else {
                setPermintaanList(data.results || []);
                setTotalPermintaan(data.count || 0);
            }
        } catch (err) {
            console.error('Failed to load permintaan list', err);
        } finally {
            setPermintaanLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchPermintaan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, statusFilter, searchQuery]);

    const handleRefreshAll = () => {
        fetchSummary();
        fetchPermintaan();
    };

    const formatCurrency = (val) => {
        return `Rp ${Number(val || 0).toLocaleString('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })}`;
    };

    const formatDate = (val) => {
        if (!val) return '-';
        try {
            const d = new Date(val);
            return d.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        } catch {
            return val;
        }
    };

    const renderStatusText = (status) => {
        switch (status) {
            case 'MENUNGGU':
                return (
                    <span className="gdg-status-text amber" title="Menunggu Persetujuan / Review Gudang">
                        <span className="gdg-status-dot" /> Menunggu Verifikasi
                    </span>
                );
            case 'DISETUJUI':
                return (
                    <span className="gdg-status-text indigo" title="Sudah Disetujui, Siap Bon Penyerahan">
                        <span className="gdg-status-dot" /> Disetujui (Siap Bon)
                    </span>
                );
            case 'PROSES_SEBAGIAN':
                return (
                    <span className="gdg-status-text cyan" title="Dalam Proses: Sebagian/Seluruh Item Menunggu Pengadaan Stok">
                        <span className="gdg-status-dot" /> Menunggu Pengadaan
                    </span>
                );
            case 'SELESAI':
                return (
                    <span className="gdg-status-text emerald" title="Barang Telah Diserahkan Penuh">
                        <span className="gdg-status-dot" /> Selesai Diserahkan
                    </span>
                );
            case 'DITOLAK':
                return (
                    <span className="gdg-status-text rose" title="Permintaan Ditolak Gudang">
                        <span className="gdg-status-dot" /> Ditolak
                    </span>
                );
            case 'DRAFT':
            default:
                return (
                    <span className="gdg-status-text slate">
                        <span className="gdg-status-dot" /> Draft
                    </span>
                );
        }
    };

    const hasLowStock = Number(stats.item_stok_minimum || 0) > 0;

    return (
        <div className="gdg-dash-root">
            {/* ── Flat Horizontal KPI Stat-Bar ── */}
            <div className="gdg-stat-bar">
                <div className="gdg-stat-cell">
                    <span className="gdg-stat-label">Total Katalog Barang</span>
                    <strong className="gdg-stat-val">
                        {stats.total_item.toLocaleString('id-ID')} <span className="gdg-stat-unit">item</span>
                    </strong>
                </div>

                <div className="gdg-stat-cell">
                    <span className="gdg-stat-label">Di Bawah Batas Minimum</span>
                    <strong className={`gdg-stat-val${hasLowStock ? ' is-warning' : ''}`}>
                        {stats.item_stok_minimum.toLocaleString('id-ID')} <span className="gdg-stat-unit">item</span>
                    </strong>
                </div>

                <div className="gdg-stat-cell">
                    <span className="gdg-stat-label">Permintaan Unit Pending</span>
                    <strong className="gdg-stat-val">
                        {pendingCount.toLocaleString('id-ID')} <span className="gdg-stat-unit">pengajuan</span>
                    </strong>
                </div>

                <div className="gdg-stat-cell">
                    <span className="gdg-stat-label">Total Nilai Aset Stok</span>
                    <strong className="gdg-stat-val">
                        {formatCurrency(stats.total_nilai_aset_stok)}
                    </strong>
                </div>
            </div>

            {/* ── Alert Antrean Pengadaan & Verifikasi Susulan (Mas Febri) ── */}
            {(procurementAlerts.ready_for_followup?.length > 0 || procurementAlerts.awaiting_stock?.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {procurementAlerts.ready_for_followup?.length > 0 && (
                        <section className="gdg-dash-section">
                            <div className="gdg-out-banner success" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <CheckCircle2 size={17} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '13.5px' }}>
                                            Stok Baru Masuk: {procurementAlerts.ready_for_followup.length} item pengajuan siap Verifikasi Susulan (ACC Mas Febri)
                                        </strong>
                                        <span style={{ fontSize: '12px', color: 'var(--gdg-muted)' }}>
                                            Item berstatus <em>Sedang Diajukan</em> kini memiliki stok fisik di gudang. Segera tentukan kuantitas yang disetujui untuk penyerahan tahap berikutnya.
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="gdg-btn-stripe primary"
                                    onClick={() => navigate('/gudang/pengeluaran?status=PROSES_SEBAGIAN')}
                                >
                                    Proses ACC Susulan
                                </button>
                            </div>
                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>No. Permintaan</th>
                                            <th>Unit / Ruangan</th>
                                            <th>Barang</th>
                                            <th style={{ textAlign: 'right' }}>Qty Diminta</th>
                                            <th style={{ textAlign: 'right' }}>Stok Masuk Kini</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {procurementAlerts.ready_for_followup.slice(0, 6).map((item) => (
                                            <tr key={item.id}>
                                                <td className="gdg-code-cell">{item.permintaan_nomor}</td>
                                                <td>{item.ruang_nama}</td>
                                                <td>
                                                    <strong>{item.barang_nama}</strong>
                                                    <span className="gdg-cell-muted" style={{ marginLeft: '6px', fontSize: '11.5px' }}>({item.barang_kode})</span>
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                    {Number(item.qty_minta).toLocaleString('id-ID')} {item.satuan}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                                                    {Number(item.stok_tersedia).toLocaleString('id-ID')} {item.satuan}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className="gdg-btn-stripe secondary"
                                                        style={{ height: '28px', padding: '0 10px', fontSize: '12px' }}
                                                        onClick={() => navigate(`/gudang/pengeluaran?status=PROSES_SEBAGIAN&permintaan=${item.permintaan_id}`)}
                                                    >
                                                        ACC Susulan
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {procurementAlerts.awaiting_stock?.length > 0 && (
                        <section className="gdg-dash-section">
                            <div className="gdg-out-banner warning" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <BellRing size={16} style={{ flexShrink: 0 }} />
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '13.5px' }}>
                                            Antrean Pengadaan Unit: {procurementAlerts.awaiting_stock.length} item masih menunggu stok gudang (0)
                                        </strong>
                                        <span style={{ fontSize: '12px', opacity: 0.9 }}>
                                            Permintaan unit tetap terbuka dan dapat dipenuhi setelah penerimaan barang (GRN), atau ditutup jika pengadaan dibatalkan.
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => navigate('/gudang/po')}
                                    >
                                        Cek / Buat PO
                                    </button>
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => navigate('/gudang/pengeluaran?status=PROSES_SEBAGIAN')}
                                    >
                                        Kelola Antrean
                                    </button>
                                </div>
                            </div>
                            <div className="gdg-table-wrap gdg-table-borderless">
                                <table className="gdg-table gdg-table-stripe">
                                    <thead>
                                        <tr>
                                            <th>No. Permintaan</th>
                                            <th>Unit / Ruangan</th>
                                            <th>Barang</th>
                                            <th style={{ textAlign: 'right' }}>Qty Diminta</th>
                                            <th style={{ textAlign: 'right' }}>Lama Menunggu</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {procurementAlerts.awaiting_stock.slice(0, 6).map((item) => (
                                            <tr key={item.id}>
                                                <td className="gdg-code-cell">{item.permintaan_nomor}</td>
                                                <td>{item.ruang_nama}</td>
                                                <td>
                                                    <strong>{item.barang_nama}</strong>
                                                    <span className="gdg-cell-muted" style={{ marginLeft: '6px', fontSize: '11.5px' }}>({item.barang_kode})</span>
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                    {Number(item.qty_minta).toLocaleString('id-ID')} {item.satuan}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: item.waiting_days >= 3 ? '#f59e0b' : 'var(--gdg-muted)' }}>
                                                        <Clock size={12} /> {item.waiting_days} hari
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* ── Stok Minimum Alert Section (Borderless) ── */}
            {lowStockItems.length > 0 && (
                <section className="gdg-dash-section">
                    <div className="gdg-dash-section-head">
                        <div>
                            <h2>Perhatian: Barang di Bawah Stok Minimum</h2>
                            <p>Segera buatkan Surat Pesanan (PO) ke rekanan untuk item berikut agar tidak terjadi kekosongan fisik</p>
                        </div>
                        <button className="gdg-btn-stripe primary" onClick={() => navigate('/gudang/po')}>
                            Buat Surat Pesanan (PO)
                        </button>
                    </div>

                    <div className="gdg-table-wrap gdg-table-borderless">
                        <table className="gdg-table gdg-table-stripe">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Barang</th>
                                    <th>Golongan</th>
                                    <th>Stok Fisik</th>
                                    <th>Batas Minimum</th>
                                    <th>Satuan</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.map((item) => (
                                    <tr key={item.id}>
                                        <td className="gdg-code-cell">{item.kode}</td>
                                        <td><strong>{item.nama}</strong></td>
                                        <td className="gdg-cell-muted">{item.golongan?.nama || '-'}</td>
                                        <td className="gdg-num-cell is-danger-text">
                                            {Number(item.stok_saat_ini || 0).toLocaleString('id-ID')} {item.satuan_dasar?.kode}
                                        </td>
                                        <td className="gdg-num-cell">
                                            {Number(item.stok_minimum || 0).toLocaleString('id-ID')} {item.satuan_dasar?.kode}
                                        </td>
                                        <td className="gdg-cell-muted">{item.satuan_dasar?.nama}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                className="gdg-icon-action"
                                                onClick={() => navigate(`/gudang/kartu-stok?barang=${item.id}`)}
                                                title="Buka Kartu Stok"
                                                aria-label="Buka Kartu Stok"
                                            >
                                                <History size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* ── Informasi & Antrean Permintaan Barang Unit (Borderless) ── */}
            <section className="gdg-dash-section">
                <div className="gdg-dash-section-head">
                    <div>
                        <h2>Informasi & Antrean Permintaan Barang Unit</h2>
                        <p>Ringkasan pengajuan barang dari unit/ruangan. Detail rincian item & realisasi penyerahan fisik dikelola di menu Pengeluaran Unit</p>
                    </div>
                    <div className="gdg-dash-actions">
                        <button
                            type="button"
                            className="gdg-btn-stripe secondary"
                            onClick={handleRefreshAll}
                            disabled={permintaanLoading}
                        >
                            <RefreshCw size={14} strokeWidth={1.75} /> Refresh
                        </button>
                        <button
                            type="button"
                            className="gdg-btn-stripe primary"
                            onClick={() => navigate('/gudang/pengeluaran')}
                        >
                            <Send size={14} strokeWidth={1.75} /> Buka Pengeluaran Unit
                        </button>
                    </div>
                </div>

                {/* Combined Filter Tabs & Search Toolbar */}
                <div className="gdg-dash-toolbar">
                    <div className="gdg-dash-tabs" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === ''}
                            className={`gdg-dash-tab ${statusFilter === '' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('');
                                setPage(1);
                            }}
                        >
                            Semua Status
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === 'MENUNGGU'}
                            className={`gdg-dash-tab ${statusFilter === 'MENUNGGU' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('MENUNGGU');
                                setPage(1);
                            }}
                        >
                            Menunggu Verifikasi{pendingCount > 0 ? ` (${pendingCount})` : ''}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === 'DISETUJUI'}
                            className={`gdg-dash-tab ${statusFilter === 'DISETUJUI' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('DISETUJUI');
                                setPage(1);
                            }}
                        >
                            Disetujui (Siap Bon)
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === 'PROSES_SEBAGIAN'}
                            className={`gdg-dash-tab ${statusFilter === 'PROSES_SEBAGIAN' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('PROSES_SEBAGIAN');
                                setPage(1);
                            }}
                        >
                            Menunggu Pengadaan{procurementAlerts.counts?.total_sedang_diajukan > 0 ? ` (${procurementAlerts.counts.total_sedang_diajukan})` : ''}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === 'SELESAI'}
                            className={`gdg-dash-tab ${statusFilter === 'SELESAI' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('SELESAI');
                                setPage(1);
                            }}
                        >
                            Selesai Diserahkan
                        </button>
                    </div>

                    <div className="gdg-dash-search">
                        <Search size={15} className="gdg-dash-search-icon" />
                        <input
                            type="text"
                            placeholder="Cari nomor permintaan, ruangan, catatan..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                </div>

                {/* Borderless Table */}
                <div className="gdg-table-wrap gdg-table-borderless">
                    <table className="gdg-table gdg-table-stripe">
                        <thead>
                            <tr>
                                <th>No. Dokumen</th>
                                <th>Tanggal</th>
                                <th>Unit / Ruangan</th>
                                <th style={{ textAlign: 'center' }}>Total Item</th>
                                <th>Keperluan</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {permintaanLoading ? (
                                <tr>
                                    <td colSpan="7" className="gdg-table-empty">
                                        Memuat data permintaan unit...
                                    </td>
                                </tr>
                            ) : permintaanList.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="gdg-table-empty">
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <Inbox size={28} className="gdg-icon-muted" />
                                            <span>Tidak ada permohonan barang yang cocok dengan filter.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                permintaanList.map((req) => (
                                    <tr key={req.id}>
                                        <td className="gdg-code-cell">{req.nomor}</td>
                                        <td className="gdg-date-cell">{formatDate(req.tanggal)}</td>
                                        <td>
                                            <div className="gdg-unit-name">{req.ruang_nama || req.ruang?.nama || '-'}</div>
                                            {req.created_by_nama && (
                                                <div className="gdg-unit-by">Oleh: {req.created_by_nama}</div>
                                            )}
                                        </td>
                                        <td className="gdg-num-cell" style={{ textAlign: 'center' }}>
                                            {(req.items || []).length} item
                                        </td>
                                        <td className="gdg-cell-muted" style={{ maxWidth: '280px' }}>
                                            {req.catatan || '—'}
                                        </td>
                                        <td>{renderStatusText(req.status)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                className="gdg-icon-action"
                                                onClick={() => navigate('/gudang/pengeluaran')}
                                                title="Buka rincian & proses di menu Pengeluaran Unit"
                                                aria-label="Buka rincian permintaan"
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <SimplePagination
                    className="gdg-dash-pagination"
                    page={page}
                    pageSize={pageSize}
                    total={totalPermintaan}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            </section>
        </div>
    );
}
