import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Boxes,
    LayoutDashboard,
    Package,
    Building2,
    FileSpreadsheet,
    FileCheck2,
    Send,
    History,
    ClipboardCheck,
    Archive,
    BarChart3,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import './Gudang.css';
import GudangDashboard from './GudangDashboard';
import GudangBarang from './GudangBarang';
import GudangVendor from './GudangVendor';
import GudangKartuStok from './GudangKartuStok';
import GudangPO from './GudangPO';
import GudangPenerimaan from './GudangPenerimaan';
import GudangPengeluaran from './GudangPengeluaran';
import GudangOpname from './GudangOpname';
import GudangLaporan from './GudangLaporan';

const HERO_CONFIG = {
    dashboard: {
        title: 'Dashboard & Ringkasan Stok',
        subtitle: 'Monitoring ketersediaan stok fisik gudang, nilai persediaan, dan peringatan stok minimum',
        Icon: LayoutDashboard,
        gradient: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    },
    barang: {
        title: 'Master Katalog Barang',
        subtitle: 'Pengelolaan katalog barang logistik, penggolongan, satuan dasar, dan konversi multi-kemasan',
        Icon: Package,
        gradient: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    },
    vendor: {
        title: 'Master Vendor & Rekanan',
        subtitle: 'Direktori rekanan penyedia barang kebutuhan rumah sakit untuk pengadaan Surat Pesanan (PO) dan GRN',
        Icon: Building2,
        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
    },
    po: {
        title: 'Surat Pesanan Barang (PO)',
        subtitle: 'Pembuatan surat pesanan pembelian ke vendor dan persetujuan pengadaan barang gudang',
        Icon: FileSpreadsheet,
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    },
    penerimaan: {
        title: 'Penerimaan Barang Masuk (GRN)',
        subtitle: 'Pencatatan barang datang dari rekanan berdasarkan faktur atau surat jalan serta penambahan stok otomatis',
        Icon: FileCheck2,
        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    },
    pengeluaran: {
        title: 'Pengeluaran & Distribusi Unit',
        subtitle: 'Pelayanan permintaan barang dari ruangan/instalasi dan pencatatan bon pengeluaran fisik gudang',
        Icon: Send,
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
    },
    'kartu-stok': {
        title: 'Kartu Stok & Buku Besar (Ledger)',
        subtitle: 'Jejak audit mutasi masuk, keluar, dan penyesuaian stok setiap item barang secara kronologis',
        Icon: History,
        gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    },
    opname: {
        title: 'Stock Opname & Penyesuaian Fisik',
        subtitle: 'Pencatatan hasil hitung fisik gudang, penetapan saldo awal cut-over, dan penyesuaian selisih stok',
        Icon: ClipboardCheck,
        gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    },
    laporan: {
        title: 'Laporan Persediaan & Logistik',
        subtitle: 'Rekapitulasi posisi stok akhir, pemakaian barang per unit ruangan, dan realisasi pembelian per vendor',
        Icon: BarChart3,
        gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    },
};

export default function GudangIndex() {
    const { section } = useParams();
    const navigate = useNavigate();

    const activeSection = useMemo(() => {
        if (!section) return 'dashboard';
        return section;
    }, [section]);

    const [collapsed, setCollapsed] = useState(() => {
        return localStorage.getItem('simak_gudang_sidebar_collapsed') === 'true';
    });

    const toggleCollapse = () => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('simak_gudang_sidebar_collapsed', String(next));
            return next;
        });
    };

    const heroInfo = HERO_CONFIG[activeSection] || HERO_CONFIG.dashboard;
    const HeroIcon = heroInfo.Icon;

    return (
        <div className="gdg-module-root">
            {/* ── Dedicated Internal Gudang Sidebar (SDM Concept) ── */}
            <aside className={`gdg-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Navigasi Modul Gudang Logistik">
                <div className="gdg-sb-head">
                    {!collapsed && (
                        <div className="gdg-sb-title-wrap">
                            <div className="gdg-sb-title-icon" title="Modul Gudang Logistik">
                                <Boxes size={15} strokeWidth={2.3} />
                            </div>
                            <span className="gdg-sb-title-text">Menu Logistik</span>
                        </div>
                    )}

                    <button
                        type="button"
                        className="gdg-sb-toggle-btn"
                        onClick={toggleCollapse}
                        title={collapsed ? 'Lebarkan Sidebar (Buka)' : 'Ciutkan Sidebar (Lega)'}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <nav className="gdg-sb-nav">
                    {/* GROUP 1: OVERVIEW & BUKU BESAR */}
                    <div className="gdg-sb-group">
                        <span className="gdg-sb-label">Overview & Buku Besar</span>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'dashboard' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang')}
                            title={collapsed ? 'Dashboard & Stok' : undefined}
                        >
                            <span className="gdg-sb-icon"><LayoutDashboard size={16} /></span>
                            <span className="gdg-sb-text">Dashboard & Stok</span>
                        </button>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'kartu-stok' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/kartu-stok')}
                            title={collapsed ? 'Kartu Stok (Ledger)' : undefined}
                        >
                            <span className="gdg-sb-icon"><History size={16} /></span>
                            <span className="gdg-sb-text">Kartu Stok (Ledger)</span>
                        </button>
                    </div>

                    {/* GROUP 2: MASTER DATA */}
                    <div className="gdg-sb-group">
                        <span className="gdg-sb-label">Master Data</span>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'barang' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/barang')}
                            title={collapsed ? 'Master Barang' : undefined}
                        >
                            <span className="gdg-sb-icon"><Package size={16} /></span>
                            <span className="gdg-sb-text">Master Barang</span>
                        </button>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'vendor' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/vendor')}
                            title={collapsed ? 'Master Vendor' : undefined}
                        >
                            <span className="gdg-sb-icon"><Building2 size={16} /></span>
                            <span className="gdg-sb-text">Master Vendor</span>
                        </button>
                    </div>

                    {/* GROUP 3: PENGADAAN & PEMBELIAN */}
                    <div className="gdg-sb-group">
                        <span className="gdg-sb-label">Pengadaan & Pembelian</span>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'po' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/po')}
                            title={collapsed ? 'Surat Pesanan (PO)' : undefined}
                        >
                            <span className="gdg-sb-icon"><FileSpreadsheet size={16} /></span>
                            <span className="gdg-sb-text">Surat Pesanan (PO)</span>
                        </button>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'penerimaan' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/penerimaan')}
                            title={collapsed ? 'Penerimaan (GRN)' : undefined}
                        >
                            <span className="gdg-sb-icon"><FileCheck2 size={16} /></span>
                            <span className="gdg-sb-text">Penerimaan (GRN)</span>
                        </button>
                    </div>

                    {/* GROUP 4: DISTRIBUSI & INVENTARIS */}
                    <div className="gdg-sb-group">
                        <span className="gdg-sb-label">Distribusi & Inventaris</span>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'pengeluaran' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/pengeluaran')}
                            title={collapsed ? 'Pengeluaran Unit' : undefined}
                        >
                            <span className="gdg-sb-icon"><Send size={16} /></span>
                            <span className="gdg-sb-text">Pengeluaran Unit</span>
                        </button>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'opname' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/opname')}
                            title={collapsed ? 'Stok Opname' : undefined}
                        >
                            <span className="gdg-sb-icon"><ClipboardCheck size={16} /></span>
                            <span className="gdg-sb-text">Stok Opname</span>
                        </button>
                    </div>

                    {/* GROUP 5: PELAPORAN & ARSIP */}
                    <div className="gdg-sb-group">
                        <span className="gdg-sb-label">Pelaporan & Arsip</span>

                        <button
                            type="button"
                            className={`gdg-sb-item ${activeSection === 'laporan' ? 'active' : ''}`}
                            onClick={() => navigate('/gudang/laporan')}
                            title={collapsed ? 'Laporan Logistik' : undefined}
                        >
                            <span className="gdg-sb-icon"><BarChart3 size={16} /></span>
                            <span className="gdg-sb-text">Laporan Logistik</span>
                        </button>

                        <button
                            type="button"
                            className="gdg-sb-item"
                            onClick={() => navigate('/logistik/barang')}
                            title={collapsed ? 'Arsip Logistik Lama' : undefined}
                        >
                            <span className="gdg-sb-icon"><Archive size={16} /></span>
                            <span className="gdg-sb-text">Arsip Logistik Lama</span>
                        </button>
                    </div>
                </nav>

                <div className="gdg-sb-foot" title={collapsed ? 'Gudang Umum RS Siaga' : undefined}>
                    <div className="gdg-sb-foot-online">
                        <span className="gdg-sb-dot-pulse" />
                        {!collapsed && <span className="gdg-sb-foot-text">Gudang Umum RS</span>}
                    </div>
                </div>
            </aside>

            {/* ── Main Content Workspace Area ── */}
            <div className="gdg-content-area">
                {/* ── Standard SIMAK Hero Header ── */}
                <div className="gdg-page-hero">
                    <div className="gdg-page-hero-main">
                        <div className="gdg-page-title">
                            <span
                                className="gdg-page-title-icon"
                                style={{ background: heroInfo.gradient }}
                            >
                                <HeroIcon size={24} />
                            </span>
                            <div>
                                <h1>{heroInfo.title}</h1>
                                <p>{heroInfo.subtitle}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Active Section View ── */}
                {activeSection === 'dashboard' && <GudangDashboard />}
                {activeSection === 'barang' && <GudangBarang />}
                {activeSection === 'vendor' && <GudangVendor />}
                {activeSection === 'po' && <GudangPO />}
                {activeSection === 'penerimaan' && <GudangPenerimaan />}
                {activeSection === 'pengeluaran' && <GudangPengeluaran />}
                {activeSection === 'kartu-stok' && <GudangKartuStok />}
                {activeSection === 'opname' && <GudangOpname />}
                {activeSection === 'laporan' && <GudangLaporan />}
            </div>
        </div>
    );
}
