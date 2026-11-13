import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw,
    Send,
    Search,
    Inbox,
    History,
    Eye,
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
            const [resSummary, resLow, resPending] = await Promise.allSettled([
                api.get('/gudang/barang/ringkasan_stok/'),
                api.get('/gudang/barang/?page_size=50'),
                api.get('/gudang/permintaan/?status=MENUNGGU&page_size=1'),
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
                            <RefreshCw size={14} /> Refresh
                        </button>
                        <button
                            type="button"
                            className="gdg-btn-stripe primary"
                            onClick={() => navigate('/gudang/pengeluaran')}
                        >
                            <Send size={14} /> Buka Pengeluaran Unit
                        </button>
                    </div>
                </div>

                {/* Underline Status Tabs */}
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

                {/* Search Toolbar */}
                <div className="gdg-dash-toolbar">
                    <div className="gdg-dash-search">
                        <Search size={15} />
                        <input
                            type="text"
                            placeholder="Cari nomor permintaan, nama ruangan, atau catatan..."
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
                <div style={{ marginTop: '14px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalPermintaan}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </section>
        </div>
    );
}
