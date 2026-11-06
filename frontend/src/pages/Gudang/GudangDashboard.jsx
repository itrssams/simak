import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Boxes,
    PackageCheck,
    AlertTriangle,
    BadgePercent,
    RefreshCw,
    Plus,
    Send,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    ArrowRight,
    Building2,
    Inbox,
    History,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';

export default function GudangDashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
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

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'MENUNGGU':
                return (
                    <span className="gdg-badge amber" title="Menunggu Persetujuan / Review Gudang">
                        <Clock size={12} /> Menunggu Verifikasi
                    </span>
                );
            case 'DISETUJUI':
                return (
                    <span className="gdg-badge blue" title="Sudah Disetujui, Siap Bon Penyerahan">
                        <CheckCircle2 size={12} /> Disetujui (Siap Bon)
                    </span>
                );
            case 'SELESAI':
                return (
                    <span className="gdg-badge emerald" title="Barang Telah Diserahkan Penuh">
                        <CheckCircle2 size={12} /> Selesai Diserahkan
                    </span>
                );
            case 'DITOLAK':
                return (
                    <span className="gdg-badge rose" title="Permintaan Ditolak Gudang">
                        <XCircle size={12} /> Ditolak
                    </span>
                );
            case 'DRAFT':
            default:
                return <span className="gdg-badge slate">Draft</span>;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI GRID */}
            <div className="gdg-kpi-grid">
                <div className="gdg-kpi-card blue">
                    <div className="gdg-kpi-icon">
                        <Boxes size={24} />
                    </div>
                    <div className="gdg-kpi-info">
                        <span>Total Katalog Barang</span>
                        <strong>{stats.total_item.toLocaleString('id-ID')} item</strong>
                    </div>
                </div>

                <div className="gdg-kpi-card amber">
                    <div className="gdg-kpi-icon">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="gdg-kpi-info">
                        <span>Di Bawah Batas Minimum</span>
                        <strong>{stats.item_stok_minimum.toLocaleString('id-ID')} item</strong>
                    </div>
                </div>

                <div className="gdg-kpi-card sky">
                    <div className="gdg-kpi-icon">
                        <Inbox size={24} />
                    </div>
                    <div className="gdg-kpi-info">
                        <span>Permintaan Unit Pending</span>
                        <strong>{pendingCount.toLocaleString('id-ID')} pengajuan</strong>
                    </div>
                </div>

                <div className="gdg-kpi-card purple">
                    <div className="gdg-kpi-icon">
                        <BadgePercent size={24} />
                    </div>
                    <div className="gdg-kpi-info">
                        <span>Total Nilai Aset Stok</span>
                        <strong style={{ fontSize: '1.25rem' }}>{formatCurrency(stats.total_nilai_aset_stok)}</strong>
                    </div>
                </div>
            </div>

            {/* STOK MINIMUM ALERT TABLE */}
            {lowStockItems.length > 0 && (
                <div className="gdg-card">
                    <div className="gdg-card-head">
                        <div className="gdg-card-title">
                            <h2>Perhatian: Barang di Bawah Stok Minimum</h2>
                            <p>Segera buatkan Surat Pesanan (PO) ke rekanan untuk item berikut agar tidak terjadi kekosongan fisik</p>
                        </div>
                        <button className="gdg-btn primary" onClick={() => navigate('/gudang/po')}>
                            Buat Surat Pesanan (PO)
                        </button>
                    </div>

                    <div className="gdg-table-wrap">
                        <table className="gdg-table">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Barang</th>
                                    <th>Golongan</th>
                                    <th>Stok Fisik</th>
                                    <th>Batas Minimum</th>
                                    <th>Satuan</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.map((item) => (
                                    <tr key={item.id}>
                                        <td className="gdg-code-cell">{item.kode}</td>
                                        <td><strong>{item.nama}</strong></td>
                                        <td>{item.golongan?.nama || '-'}</td>
                                        <td>
                                            <span className="gdg-badge rose">
                                                {Number(item.stok_saat_ini || 0).toLocaleString('id-ID')} {item.satuan_dasar?.kode}
                                            </span>
                                        </td>
                                        <td>{Number(item.stok_minimum || 0).toLocaleString('id-ID')} {item.satuan_dasar?.kode}</td>
                                        <td>{item.satuan_dasar?.nama}</td>
                                        <td>
                                            <button
                                                className="gdg-btn soft"
                                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                                onClick={() => navigate(`/gudang/kartu-stok?barang=${item.id}`)}
                                            >
                                                <History size={13} /> Kartu Stok
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* INFORMASI PERMINTAAN BARANG DARI UNIT / RUANGAN */}
            <div className="gdg-card">
                <div className="gdg-card-head">
                    <div className="gdg-card-title">
                        <h2>Informasi & Antrean Permintaan Barang Unit</h2>
                        <p>Ringkasan pengajuan barang dari unit/ruangan. Detail rincian item & realisasi penyerahan fisik dikelola di menu Pengeluaran Unit</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="gdg-btn soft" onClick={handleRefreshAll} disabled={permintaanLoading}>
                            <RefreshCw size={15} /> Refresh
                        </button>
                        <button className="gdg-btn primary" onClick={() => navigate('/gudang/pengeluaran')}>
                            <Send size={15} /> Buka Pengeluaran Unit
                        </button>
                    </div>
                </div>

                {/* TOOLBAR FILTER & SEARCH */}
                <div className="gdg-toolbar">
                    <div className="gdg-search">
                        <Search size={16} />
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

                    <div className="gdg-chips">
                        <button
                            type="button"
                            className={`gdg-chip ${statusFilter === '' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('');
                                setPage(1);
                            }}
                        >
                            Semua Status
                        </button>
                        <button
                            type="button"
                            className={`gdg-chip ${statusFilter === 'MENUNGGU' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('MENUNGGU');
                                setPage(1);
                            }}
                        >
                            Menunggu Verifikasi {pendingCount > 0 ? `(${pendingCount})` : ''}
                        </button>
                        <button
                            type="button"
                            className={`gdg-chip ${statusFilter === 'DISETUJUI' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('DISETUJUI');
                                setPage(1);
                            }}
                        >
                            Disetujui (Siap Bon)
                        </button>
                        <button
                            type="button"
                            className={`gdg-chip ${statusFilter === 'SELESAI' ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter('SELESAI');
                                setPage(1);
                            }}
                        >
                            Selesai Diserahkan
                        </button>
                    </div>
                </div>

                {/* TABLE PERMINTAAN */}
                <div className="gdg-table-wrap">
                    <table className="gdg-table">
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
                                            <Inbox size={32} className="gdg-icon-muted" />
                                            <span>Tidak ada permohonan barang yang cocok dengan filter.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                permintaanList.map((req) => (
                                    <tr key={req.id}>
                                        <td className="gdg-code-cell">
                                            {req.nomor}
                                        </td>
                                        <td>{formatDate(req.tanggal)}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Building2 size={14} className="gdg-icon-muted" />
                                                <strong>{req.ruang_nama || req.ruang?.nama || '-'}</strong>
                                            </div>
                                            {req.created_by_nama && (
                                                <small className="gdg-cell-muted" style={{ display: 'block', fontSize: '0.74rem', marginTop: '2px' }}>
                                                    Oleh: {req.created_by_nama}
                                                </small>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="gdg-badge slate" style={{ fontWeight: 600 }}>
                                                {(req.items || []).length} item
                                            </span>
                                        </td>
                                        <td className="gdg-cell-muted" style={{ maxWidth: '280px' }}>
                                            {req.catatan || '-'}
                                        </td>
                                        <td>{renderStatusBadge(req.status)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="gdg-btn soft"
                                                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                                                onClick={() => navigate('/gudang/pengeluaran')}
                                                title="Buka rincian & proses di menu Pengeluaran Unit"
                                            >
                                                Buka Detail <ArrowRight size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION CONTROL */}
                <div style={{ marginTop: '16px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalPermintaan}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </div>
        </div>
    );
}
