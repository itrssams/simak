import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart3,
    FileSpreadsheet,
    Printer,
    Download,
    Search,
    RefreshCw,
    Building2,
    Calendar,
    Layers,
    Boxes,
    Truck,
    TrendingUp,
    X,
    AlertTriangle,
    Inbox,
    PieChart as PieChartIcon,
    Eye,
    ChevronDown,
    ChevronUp,
    FileText,
    CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import { SimplePagination } from '../../utils/pagination.jsx';
import LogistikPieInfographic, { MACARON_PALETTE } from '../Logistik/LogistikPieInfographic';
import '../Logistik/LogistikLaporan.css';

export default function GudangLaporan({ heroActionsTarget = null }) {
    const toast = useToast();
    const [subTab, setSubTab] = useState('stok_akhir'); // 'stok_akhir' | 'permintaan' | 'pemakaian' | 'pembelian'
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    // Pie chart modes
    const [pieModeStok, setPieModeStok] = useState('golongan'); // 'golongan' | 'top_barang'
    const [pieModePermintaan, setPieModePermintaan] = useState('unit'); // 'unit' | 'barang'
    const [pieModePemakaian, setPieModePemakaian] = useState('ruangan'); // 'ruangan' | 'barang'
    const [pieModePembelian, setPieModePembelian] = useState('vendor'); // 'vendor' | 'barang'

    // Masters for filter
    const [golonganList, setGolonganList] = useState([]);
    const [ruangList, setRuangList] = useState([]);

    // Common filter dates (default this month in local time)
    const now = new Date();
    const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = formatYMD(now);
    const firstDayStr = formatYMD(new Date(now.getFullYear(), now.getMonth(), 1));

    const [startDate, setStartDate] = useState(firstDayStr);
    const [endDate, setEndDate] = useState(todayStr);

    // Tab 1: Stok Akhir state
    const [searchStok, setSearchStok] = useState('');
    const [selectedGolongan, setSelectedGolongan] = useState('');
    const [selectedStatusStok, setSelectedStatusStok] = useState('');
    const [stokAkhirData, setStokAkhirData] = useState({ summary: {}, results: [] });

    // Tab 2: Permintaan per Unit state
    const [searchPermintaan, setSearchPermintaan] = useState('');
    const [selectedRuangPermintaan, setSelectedRuangPermintaan] = useState('');
    const [permintaanUnitData, setPermintaanUnitData] = useState({ summary: {}, results: [] });
    const [expandedUnitPermintaan, setExpandedUnitPermintaan] = useState(null);

    // Tab 3: Pemakaian Ruangan state
    const [searchPemakaian, setSearchPemakaian] = useState('');
    const [selectedRuang, setSelectedRuang] = useState('');
    const [pemakaianData, setPemakaianData] = useState({ summary: {}, results: [] });

    // Tab 4: Pembelian Vendor state
    const [searchPembelian, setSearchPembelian] = useState('');
    const [pembelianData, setPembelianData] = useState({ summary: {}, results: [] });

    const fetchFilters = async () => {
        try {
            const [resGol, resRuang] = await Promise.all([
                api.get('/gudang/golongan/'),
                api.get('/gudang/ruang/')
            ]);
            setGolonganList(resGol.data || []);
            setRuangList(resRuang.data?.results || resRuang.data || []);
        } catch (err) {
            console.error('Failed to load filter options', err);
        }
    };

    const fetchStokAkhir = async () => {
        setLoading(true);
        try {
            let url = `/gudang/laporan/stok_akhir/?`;
            if (searchStok) url += `search=${encodeURIComponent(searchStok)}&`;
            if (selectedGolongan) url += `golongan=${selectedGolongan}&`;
            if (selectedStatusStok) url += `status_stok=${selectedStatusStok}&`;

            const res = await api.get(url);
            setStokAkhirData(res.data);
        } catch (err) {
            toast.error('Gagal memuat laporan stok akhir.');
        } finally {
            setLoading(false);
        }
    };

    const fetchPermintaan = async () => {
        setLoading(true);
        try {
            let url = `/gudang/laporan/permintaan_unit/?start_date=${startDate}&end_date=${endDate}&`;
            if (searchPermintaan) url += `search=${encodeURIComponent(searchPermintaan)}&`;
            if (selectedRuangPermintaan) url += `ruang=${selectedRuangPermintaan}&`;

            const res = await api.get(url);
            setPermintaanUnitData(res.data);
            if (res.data?.results?.length > 0 && !expandedUnitPermintaan) {
                setExpandedUnitPermintaan(res.data.results[0].unit_nama);
            }
        } catch (err) {
            toast.error('Gagal memuat laporan permintaan unit.');
        } finally {
            setLoading(false);
        }
    };

    const fetchPemakaian = async () => {
        setLoading(true);
        try {
            let url = `/gudang/laporan/pemakaian_ruangan/?start_date=${startDate}&end_date=${endDate}&`;
            if (searchPemakaian) url += `search=${encodeURIComponent(searchPemakaian)}&`;
            if (selectedRuang) url += `ruang=${selectedRuang}&`;

            const res = await api.get(url);
            setPemakaianData(res.data);
        } catch (err) {
            toast.error('Gagal memuat laporan pemakaian ruangan.');
        } finally {
            setLoading(false);
        }
    };

    const fetchPembelian = async () => {
        setLoading(true);
        try {
            let url = `/gudang/laporan/pembelian_vendor/?start_date=${startDate}&end_date=${endDate}&`;
            if (searchPembelian) url += `search=${encodeURIComponent(searchPembelian)}&`;

            const res = await api.get(url);
            setPembelianData(res.data);
        } catch (err) {
            toast.error('Gagal memuat laporan pembelian vendor.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFilters();
    }, []);

    useEffect(() => {
        if (subTab === 'stok_akhir') fetchStokAkhir();
        if (subTab === 'permintaan') fetchPermintaan();
        if (subTab === 'pemakaian') fetchPemakaian();
        if (subTab === 'pembelian') fetchPembelian();
    }, [subTab, searchStok, selectedGolongan, selectedStatusStok, startDate, endDate, searchPermintaan, selectedRuangPermintaan, searchPemakaian, selectedRuang, searchPembelian]);

    const formatRp = (val) =>
        `Rp ${Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const formatQty = (val) =>
        Number(val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    // ── DATA INFOGRAFIS PIE PER TAB ─────────────────────────
    // Tab 1: Nilai per Golongan & Top Barang Stok
    const pieDataGolongan = useMemo(() => {
        const map = {};
        (stokAkhirData.results || []).forEach(r => {
            const gName = r.golongan_nama || 'Lainnya';
            if (!map[gName]) {
                map[gName] = { id: gName, name: gName, value: 0, count: 0, qty: 0 };
            }
            map[gName].value += Number(r.total_nilai || 0);
            map[gName].qty += Number(r.qty_fisik || 0);
            map[gName].count += 1;
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                value: Math.round(m.value),
                sublabel: `${m.count} varian barang • ${Number(m.qty).toLocaleString('id-ID')} unit fisik`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [stokAkhirData.results]);

    const pieDataTopBarangStok = useMemo(() => {
        return (stokAkhirData.results || [])
            .filter(r => Number(r.total_nilai) > 0)
            .map(r => ({
                id: r.kode,
                name: r.nama,
                value: Math.round(Number(r.total_nilai || 0)),
                sublabel: `${r.golongan_nama} • Stok: ${Number(r.qty_fisik).toLocaleString('id-ID')} ${r.satuan}`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [stokAkhirData.results]);

    // Tab 2: Permintaan per Unit & Top Barang Diminta
    const pieDataPermintaanUnit = useMemo(() => {
        return (permintaanUnitData.results || []).map((u) => ({
            id: u.unit_nama,
            name: u.unit_nama,
            value: u.total_minta,
            satuan: 'item',
            sublabel: `${u.total_jenis_barang} varian barang • ${u.fulfillment_rate}% disetujui`,
        }));
    }, [permintaanUnitData.results]);

    const pieDataTopBarangMinta = useMemo(() => {
        const map = {};
        (permintaanUnitData.results || []).forEach(u => {
            (u.daftar_barang || []).forEach(b => {
                const k = b.barang_kode || b.barang_nama;
                if (!map[k]) {
                    map[k] = { id: k, name: b.barang_nama, value: 0, satuan: b.satuan, units: new Set() };
                }
                map[k].value += Number(b.qty_minta || 0);
                map[k].units.add(u.unit_nama);
            });
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                value: m.value,
                satuan: m.satuan || 'item',
                sublabel: `Diminta oleh ${m.units.size} ruangan`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [permintaanUnitData.results]);

    // Tab 3: Pemakaian per Ruangan & Top Barang Keluar
    const pieDataRuang = useMemo(() => {
        const map = {};
        (pemakaianData.results || []).forEach(r => {
            const name = r.ruang_nama || 'Unit Ruangan';
            if (!map[name]) {
                map[name] = { id: name, name, value: 0, qty: 0, count: 0, ruangId: r.ruang_id };
            }
            map[name].value += Number(r.subtotal || 0);
            map[name].qty += Number(r.qty || 0);
            map[name].count += 1;
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                ruangId: m.ruangId,
                value: Math.round(m.value),
                sublabel: `${m.count} transaksi bon • ${Number(m.qty).toLocaleString('id-ID')} unit barang`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [pemakaianData.results]);

    const pieDataBarangKeluar = useMemo(() => {
        const map = {};
        (pemakaianData.results || []).forEach(r => {
            const key = r.barang_kode || r.barang_nama;
            if (!map[key]) {
                map[key] = { id: key, name: r.barang_nama, value: 0, subtotal: 0, satuan: r.satuan, ruangs: new Set() };
            }
            map[key].value += Number(r.qty || 0);
            map[key].subtotal += Number(r.subtotal || 0);
            if (r.ruang_nama) map[key].ruangs.add(r.ruang_nama);
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                value: m.value,
                satuan: m.satuan || 'item',
                sublabel: `Rp ${Number(m.subtotal).toLocaleString('id-ID')} • ke ${m.ruangs.size} ruangan`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [pemakaianData.results]);

    // Tab 3: Belanja per Vendor & Top Belanja Barang
    const pieDataVendor = useMemo(() => {
        const map = {};
        (pembelianData.results || []).forEach(r => {
            const name = r.vendor_nama || 'Rekanan';
            if (!map[name]) {
                map[name] = { id: name, name, value: 0, count: 0, qtyDasar: 0 };
            }
            map[name].value += Number(r.subtotal || 0);
            map[name].count += 1;
            map[name].qtyDasar += Number(r.qty_dasar || 0);
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                value: Math.round(m.value),
                sublabel: `${m.count} faktur masuk • ${Number(m.qtyDasar).toLocaleString('id-ID')} unit dasar`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [pembelianData.results]);

    const pieDataBarangBeli = useMemo(() => {
        const map = {};
        (pembelianData.results || []).forEach(r => {
            const key = r.barang_kode || r.barang_nama;
            if (!map[key]) {
                map[key] = { id: key, name: r.barang_nama, value: 0, qtyDasar: 0, satuan: r.satuan_dasar };
            }
            map[key].value += Number(r.subtotal || 0);
            map[key].qtyDasar += Number(r.qty_dasar || 0);
        });
        return Object.values(map)
            .map(m => ({
                id: m.id,
                name: m.name,
                value: Math.round(m.value),
                sublabel: `Total kuantitas: ${Number(m.qtyDasar).toLocaleString('id-ID')} ${m.satuan || 'item'}`,
            }))
            .sort((a, b) => b.value - a.value);
    }, [pembelianData.results]);

    // Export to Excel
    const handleExportExcel = () => {
        let exportRows = [];
        let filename = '';

        if (subTab === 'stok_akhir') {
            filename = `Laporan_Nilai_Persediaan_Gudang_${todayStr}.xlsx`;
            exportRows = (stokAkhirData.results || []).map((r, idx) => ({
                No: idx + 1,
                'Kode Barang': r.kode,
                'Nama Barang': r.nama,
                Merk: r.merk,
                Golongan: r.golongan_nama,
                Satuan: r.satuan,
                'Stok Min': r.stok_minimum,
                'Qty Fisik': r.qty_fisik,
                'HPP Rata-rata': r.avg_cost,
                'Total Nilai Persediaan (Rp)': r.total_nilai
            }));
        } else if (subTab === 'permintaan') {
            filename = `Rekap_Permintaan_Unit_${startDate}_sd_${endDate}.xlsx`;
            (permintaanUnitData.results || []).forEach((u) => {
                if (!u.daftar_barang || !u.daftar_barang.length) {
                    exportRows.push({
                        No: exportRows.length + 1,
                        'Unit Ruangan': u.unit_nama,
                        'Total Minta Unit': u.total_minta,
                        'Total Disetujui Unit': u.total_setuju,
                        'Porsi Permintaan (%)': `${u.persentase}%`,
                        'Fulfillment (%)': `${u.fulfillment_rate}%`,
                        'Kode Barang': '-',
                        'Nama Barang': '-',
                        'Qty Diminta': 0,
                        'Qty Disetujui': 0,
                        Satuan: '-',
                        'Porsi Barang di Unit (%)': '-'
                    });
                } else {
                    u.daftar_barang.forEach((b) => {
                        exportRows.push({
                            No: exportRows.length + 1,
                            'Unit Ruangan': u.unit_nama,
                            'Total Minta Unit': u.total_minta,
                            'Total Disetujui Unit': u.total_setuju,
                            'Porsi Permintaan (%)': `${u.persentase}%`,
                            'Fulfillment (%)': `${u.fulfillment_rate}%`,
                            'Kode Barang': b.barang_kode,
                            'Nama Barang': b.barang_nama,
                            'Qty Diminta': b.qty_minta,
                            'Qty Disetujui': b.qty_setuju,
                            Satuan: b.satuan,
                            'Porsi Barang di Unit (%)': `${b.persentase}%`
                        });
                    });
                }
            });
        } else if (subTab === 'pemakaian') {
            filename = `Rekap_Pemakaian_Ruangan_${startDate}_sd_${endDate}.xlsx`;
            exportRows = (pemakaianData.results || []).map((r, idx) => ({
                No: idx + 1,
                Tanggal: r.tanggal,
                'No Bon OUT': r.nomor_out,
                'Unit Ruangan': r.ruang_nama,
                Penerima: r.penerima_nama,
                'Kode Barang': r.barang_kode,
                'Nama Barang': r.barang_nama,
                Qty: r.qty,
                Satuan: r.satuan,
                'Harga Unit (HPP)': r.harga_unit,
                'Subtotal (Rp)': r.subtotal,
                Keterangan: r.keterangan
            }));
        } else {
            filename = `Rekap_Pembelian_Vendor_${startDate}_sd_${endDate}.xlsx`;
            exportRows = (pembelianData.results || []).map((r, idx) => ({
                No: idx + 1,
                Tanggal: r.tanggal,
                'No GRN': r.nomor_grn,
                'No Faktur': r.no_faktur,
                'Nama Vendor': r.vendor_nama,
                'Kode Barang': r.barang_kode,
                'Nama Barang': r.barang_nama,
                'Qty Kemasan': r.qty_kemasan,
                Kemasan: r.kemasan,
                'Qty Dasar': r.qty_dasar,
                'Satuan Dasar': r.satuan_dasar,
                'Harga Beli': r.harga_dasar,
                'Subtotal (Rp)': r.subtotal
            }));
        }

        if (!exportRows.length) {
            toast.info('Tidak ada data untuk diekspor.');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
        XLSX.writeFile(wb, filename);
        toast.success(`Berhasil mengunduh ${filename}`);
    };

    // Print Report
    const handlePrint = () => {
        window.print();
    };

    const handleRefreshActiveTab = () => {
        if (subTab === 'stok_akhir') fetchStokAkhir();
        else if (subTab === 'permintaan') fetchPermintaan();
        else if (subTab === 'pemakaian') fetchPemakaian();
        else fetchPembelian();
    };

    const switchSubTab = (tab) => {
        setSubTab(tab);
        setPage(1);
    };

    const paginateRows = (rows = []) => {
        const total = rows.length;
        const maxPage = Math.max(1, Math.ceil(total / pageSize));
        const curPage = Math.min(page, maxPage);
        return {
            total,
            curPage,
            items: rows.slice((curPage - 1) * pageSize, curPage * pageSize),
        };
    };

    const heroActions = (
        <>
            <button
                type="button"
                className="gdg-btn-stripe secondary"
                onClick={handleExportExcel}
                disabled={loading}
            >
                <FileSpreadsheet size={14} />
                <span>Export Excel</span>
            </button>
            <button
                type="button"
                className="gdg-btn-stripe secondary"
                onClick={handlePrint}
            >
                <Printer size={14} />
                <span>Cetak</span>
            </button>
            <button
                type="button"
                className="gdg-btn-stripe secondary"
                onClick={handleRefreshActiveTab}
                disabled={loading}
            >
                <RefreshCw size={14} className={loading ? 'gdg-spin' : ''} />
                <span>Refresh</span>
            </button>
        </>
    );

    const stokPage = paginateRows(stokAkhirData.results || []);
    const permintaanPage = paginateRows(permintaanUnitData.results || []);
    const pemakaianPage = paginateRows(pemakaianData.results || []);
    const pembelianPage = paginateRows(pembelianData.results || []);

    return (
        <div className="gdg-dash-root">
            {heroActionsTarget && createPortal(heroActions, heroActionsTarget)}
            {!heroActionsTarget && (
                <div className="gdg-brg-fallback-actions">{heroActions}</div>
            )}

            {/* SUB-TABS NAVIGATION */}
            <div className="gdg-segmented-tabs">
                <button
                    type="button"
                    className={`gdg-segmented-tab ${subTab === 'stok_akhir' ? 'active' : ''}`}
                    onClick={() => switchSubTab('stok_akhir')}
                >
                    <Boxes size={15} />
                    <span>Nilai Persediaan & Stok Akhir</span>
                </button>
                <button
                    type="button"
                    className={`gdg-segmented-tab ${subTab === 'permintaan' ? 'active' : ''}`}
                    onClick={() => switchSubTab('permintaan')}
                >
                    <FileText size={15} />
                    <span>Rekap Permintaan Tiap Unit</span>
                </button>
                <button
                    type="button"
                    className={`gdg-segmented-tab ${subTab === 'pemakaian' ? 'active' : ''}`}
                    onClick={() => switchSubTab('pemakaian')}
                >
                    <TrendingUp size={15} />
                    <span>Rekap Pemakaian per Ruangan</span>
                </button>
                <button
                    type="button"
                    className={`gdg-segmented-tab ${subTab === 'pembelian' ? 'active' : ''}`}
                    onClick={() => switchSubTab('pembelian')}
                >
                    <Truck size={15} />
                    <span>Rekap Pembelian per Vendor</span>
                </button>
            </div>

            {/* TAB 1: STOK AKHIR & NILAI PERSEDIAAN */}
            {subTab === 'stok_akhir' && (
                <div className="gdg-dash-root">
                    {/* STAT-BAR */}
                    <div className="gdg-stat-bar gdg-stat-bar-3">
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Varian Barang</span>
                            <strong className="gdg-stat-val">
                                {(stokAkhirData.summary?.total_items || 0).toLocaleString('id-ID')}
                                <span className="gdg-stat-unit">item</span>
                            </strong>
                            <span className="gdg-stat-sub">Barang aktif terdaftar</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Unit Fisik Gudang</span>
                            <strong className="gdg-stat-val">{formatQty(stokAkhirData.summary?.total_qty)}</strong>
                            <span className="gdg-stat-sub">Kuantitas stok berjalan</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Nilai Aset Persediaan</span>
                            <strong className="gdg-stat-val">{formatRp(stokAkhirData.summary?.total_nilai)}</strong>
                            <span className="gdg-stat-sub">Berdasarkan HPP rata-rata (WMA)</span>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(stokAkhirData.results || []).length > 0 && (
                        pieModeStok === 'golongan' ? (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataGolongan}
                                totalValue={stokAkhirData.summary?.total_nilai}
                                title="Infografis Porsi Valuasi Nilai Persediaan per Golongan"
                                subtitle="Distribusi persentase nilai persediaan stok gudang berdasarkan penggolongan barang"
                                valuePrefix="Rp "
                                unitLabel=""
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModeStok === 'golongan' ? 'active' : ''}`}
                                            onClick={() => setPieModeStok('golongan')}
                                        >
                                            Porsi Golongan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModeStok === 'top_barang' ? 'active' : ''}`}
                                            onClick={() => setPieModeStok('top_barang')}
                                        >
                                            Top Barang
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    const matched = golonganList.find(g => g.nama === it.name);
                                    if (matched) {
                                        setSelectedGolongan(selectedGolongan === String(matched.id) ? '' : String(matched.id));
                                        setPage(1);
                                    }
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataTopBarangStok}
                                totalValue={stokAkhirData.summary?.total_nilai}
                                title="Infografis Top Barang Valuasi Tertinggi"
                                subtitle="Persentase kontribusi aset barang terhadap total nilai persediaan gudang"
                                valuePrefix="Rp "
                                unitLabel=""
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModeStok === 'golongan' ? 'active' : ''}`}
                                            onClick={() => setPieModeStok('golongan')}
                                        >
                                            Porsi Golongan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModeStok === 'top_barang' ? 'active' : ''}`}
                                            onClick={() => setPieModeStok('top_barang')}
                                        >
                                            Top Barang
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setSearchStok(searchStok === it.name ? '' : it.name);
                                    setPage(1);
                                }}
                            />
                        )
                    )}

                    <section className="gdg-dash-section">
                        {/* FILTERS */}
                        <div className="gdg-brg-toolbar">
                            <div className="gdg-brg-toolbar-left">
                                <div className="gdg-dash-search">
                                    <Search size={14} className="gdg-dash-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari nama barang, kode..."
                                        value={searchStok}
                                        onChange={(e) => { setSearchStok(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <div className="gdg-ks-select-wrap">
                                    <select
                                        value={selectedGolongan}
                                        onChange={(e) => { setSelectedGolongan(e.target.value); setPage(1); }}
                                        className="gdg-ks-select gdg-brg-select"
                                    >
                                        <option value="">Semua Golongan</option>
                                        {golonganList.map(g => (
                                            <option key={g.id} value={g.id}>[{g.kode}] {g.nama}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="gdg-ks-select-chevron" />
                                </div>
                                <div className="gdg-ks-select-wrap">
                                    <select
                                        value={selectedStatusStok}
                                        onChange={(e) => { setSelectedStatusStok(e.target.value); setPage(1); }}
                                        className="gdg-ks-select gdg-brg-select"
                                    >
                                        <option value="">Semua Status Stok</option>
                                        <option value="aman">Stok Aman (Di Atas Buffer)</option>
                                        <option value="menipis">Stok Menipis (Buffer)</option>
                                        <option value="habis">Stok Habis (0)</option>
                                    </select>
                                    <ChevronDown size={13} className="gdg-ks-select-chevron" />
                                </div>
                                {(searchStok || selectedGolongan || selectedStatusStok) && (
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => {
                                            setSearchStok('');
                                            setSelectedGolongan('');
                                            setSelectedStatusStok('');
                                            setPage(1);
                                        }}
                                        title="Reset filter"
                                    >
                                        <X size={13} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap gdg-table-borderless">
                            <table className="gdg-table gdg-table-stripe">
                                <thead>
                                    <tr>
                                        <th>KODE</th>
                                        <th>NAMA BARANG</th>
                                        <th>GOLONGAN</th>
                                        <th>SATUAN</th>
                                        <th style={{ textAlign: 'right' }}>MIN BUFFER</th>
                                        <th style={{ textAlign: 'right' }}>STOK FISIK</th>
                                        <th style={{ textAlign: 'right' }}>HPP UNIT</th>
                                        <th style={{ textAlign: 'right' }}>TOTAL NILAI PERSEDIAAN</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Memuat laporan persediaan...</td></tr>
                                    ) : stokPage.total === 0 ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Tidak ada data barang yang sesuai filter.</td></tr>
                                    ) : (
                                        stokPage.items.map((r, idx) => {
                                            const qtyNum = Number(r.qty_fisik);
                                            const minNum = Number(r.stok_minimum);
                                            const isAlert = qtyNum <= 0 || qtyNum <= minNum;
                                            return (
                                                <tr key={idx}>
                                                    <td className="gdg-code-cell">{r.kode}</td>
                                                    <td className="gdg-cell-strong">{r.nama}</td>
                                                    <td>{r.golongan_nama}</td>
                                                    <td>{r.satuan}</td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', color: 'var(--gdg-muted)' }}>
                                                        {formatQty(r.stok_minimum)}
                                                    </td>
                                                    <td
                                                        className="gdg-num-cell"
                                                        style={{
                                                            textAlign: 'right',
                                                            fontWeight: 600,
                                                            color: isAlert ? '#f43f5e' : 'var(--gdg-text)'
                                                        }}
                                                    >
                                                        {formatQty(r.qty_fisik)}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', color: 'var(--gdg-muted)' }}>
                                                        {formatRp(r.avg_cost)}
                                                    </td>
                                                    <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                        {formatRp(r.total_nilai)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {stokPage.total > 0 && (
                            <SimplePagination
                                className="gdg-dash-pagination"
                                page={stokPage.curPage}
                                totalCount={stokPage.total}
                                pageSize={pageSize}
                                onPageChange={setPage}
                                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                            />
                        )}
                    </section>
                </div>
            )}

            {/* TAB 2: REKAP PERMINTAAN TIAP UNIT */}
            {subTab === 'permintaan' && (
                <div className="gdg-dash-root">
                    {/* STAT-BAR */}
                    <div className="gdg-stat-bar gdg-stat-bar-3">
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Permintaan Barang</span>
                            <strong className="gdg-stat-val">
                                {formatQty(permintaanUnitData.summary?.total_permintaan_minta)}
                                <span className="gdg-stat-unit">item</span>
                            </strong>
                            <span className="gdg-stat-sub">{permintaanUnitData.summary?.total_transaksi || 0} transaksi amprahan unit</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Kuantitas Disetujui</span>
                            <strong className="gdg-stat-val">
                                {formatQty(permintaanUnitData.summary?.total_permintaan_setuju)}
                                <span className="gdg-stat-unit">item</span>
                            </strong>
                            <span className="gdg-stat-sub">Telah di-ACC petugas gudang</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Tingkat Pemenuhan (Fulfillment)</span>
                            <strong className="gdg-stat-val">{permintaanUnitData.summary?.fulfillment_rate || 0}%</strong>
                            <span className="gdg-stat-sub">{permintaanUnitData.summary?.total_unit_aktif || 0} unit aktif mengajukan</span>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(permintaanUnitData.results || []).length > 0 && (
                        pieModePermintaan === 'unit' ? (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataPermintaanUnit}
                                totalValue={permintaanUnitData.summary?.total_permintaan_minta}
                                title="Infografis Porsi Permintaan Barang Tiap Unit"
                                subtitle="Porsi persentase akumulasi permintaan barang dari masing-masing unit ruangan"
                                unitLabel="item diminta"
                                isUnitMode={true}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePermintaan === 'unit' ? 'active' : ''}`}
                                            onClick={() => setPieModePermintaan('unit')}
                                        >
                                            Porsi Tiap Unit
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePermintaan === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePermintaan('barang')}
                                        >
                                            Top Barang Diminta
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setExpandedUnitPermintaan(expandedUnitPermintaan === it.name ? null : it.name);
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataTopBarangMinta}
                                totalValue={permintaanUnitData.summary?.total_permintaan_minta}
                                title="Infografis Top Barang Paling Banyak Diminta"
                                subtitle="Porsi kebutuhan komoditas barang yang paling sering diajukan oleh seluruh unit"
                                unitLabel="item"
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePermintaan === 'unit' ? 'active' : ''}`}
                                            onClick={() => setPieModePermintaan('unit')}
                                        >
                                            Porsi Tiap Unit
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePermintaan === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePermintaan('barang')}
                                        >
                                            Top Barang Diminta
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setSearchPermintaan(searchPermintaan === it.name ? '' : it.name);
                                    setPage(1);
                                }}
                            />
                        )
                    )}

                    {/* TABLE SECTION */}
                    <section className="gdg-dash-section">
                        {/* FILTERS */}
                        <div className="gdg-brg-toolbar">
                            <div className="gdg-brg-toolbar-left">
                                <div className="gdg-dash-search">
                                    <Search size={14} className="gdg-dash-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari nama unit, barang..."
                                        value={searchPermintaan}
                                        onChange={(e) => { setSearchPermintaan(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <div className="gdg-lap-period-group">
                                    <span className="gdg-lap-period-label">Periode:</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={startDate}
                                            onChange={(val) => { setStartDate(val); setPage(1); }}
                                        />
                                    </div>
                                    <span className="gdg-lap-period-sep">s/d</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={endDate}
                                            onChange={(val) => { setEndDate(val); setPage(1); }}
                                        />
                                    </div>
                                </div>
                                <div className="gdg-ks-select-wrap">
                                    <select
                                        value={selectedRuangPermintaan}
                                        onChange={(e) => { setSelectedRuangPermintaan(e.target.value); setPage(1); }}
                                        className="gdg-ks-select gdg-brg-select"
                                    >
                                        <option value="">Semua Unit Ruangan (48 Ruangan)</option>
                                        {ruangList.map(r => (
                                            <option key={r.id} value={r.id}>{r.nama}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="gdg-ks-select-chevron" />
                                </div>
                                {(searchPermintaan || selectedRuangPermintaan || startDate !== firstDayStr || endDate !== todayStr) && (
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => {
                                            setSearchPermintaan('');
                                            setSelectedRuangPermintaan('');
                                            setStartDate(firstDayStr);
                                            setEndDate(todayStr);
                                            setPage(1);
                                        }}
                                        title="Reset filter"
                                    >
                                        <X size={13} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap gdg-table-borderless">
                            <table className="gdg-table gdg-table-stripe">
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>#</th>
                                        <th>UNIT / DEPARTEMEN RUMAH SAKIT</th>
                                        <th style={{ textAlign: 'right', width: 130 }}>TOTAL DIMINTA</th>
                                        <th style={{ textAlign: 'right', width: 130 }}>DISETUJUI</th>
                                        <th style={{ width: 220 }}>PORSI PERMINTAAN (%)</th>
                                        <th style={{ textAlign: 'center', width: 130 }}>PEMENUHAN</th>
                                        <th style={{ textAlign: 'center', width: 110 }}>TRANSAKSI</th>
                                        <th style={{ textAlign: 'center', width: 110 }}>AKSI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Memuat rekap permintaan unit...</td></tr>
                                    ) : permintaanPage.total === 0 ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Tidak ada data permintaan unit di periode terpilih.</td></tr>
                                    ) : (
                                        permintaanPage.items.map((u, idx) => {
                                            const rank = (permintaanPage.curPage - 1) * pageSize + idx + 1;
                                            const isExpanded = expandedUnitPermintaan === u.unit_nama;
                                            const pal = MACARON_PALETTE[(rank - 1) % MACARON_PALETTE.length];
                                            const dotColor = u.fulfillment_rate >= 90 ? '#10b981' : u.fulfillment_rate >= 60 ? '#f59e0b' : '#f43f5e';

                                            return (
                                                <React.Fragment key={u.unit_nama}>
                                                    <tr
                                                        style={{ cursor: 'pointer', background: isExpanded ? 'rgba(99, 91, 255, 0.05)' : undefined }}
                                                        onClick={() => setExpandedUnitPermintaan(isExpanded ? null : u.unit_nama)}
                                                    >
                                                        <td className="gdg-num-cell" style={{ fontWeight: 600, color: 'var(--gdg-muted)' }}>{rank}</td>
                                                        <td>
                                                            <div className="gdg-cell-strong">{u.unit_nama}</div>
                                                            <div style={{ fontSize: '11.5px', color: 'var(--gdg-muted)' }}>
                                                                {u.total_jenis_barang} jenis barang diminta
                                                            </div>
                                                        </td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                            {formatQty(u.total_minta)} <span style={{ fontSize: '11.5px', color: 'var(--gdg-muted)', fontWeight: 400 }}>item</span>
                                                        </td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                                            {formatQty(u.total_setuju)} <span style={{ fontSize: '11.5px', color: 'var(--gdg-muted)', fontWeight: 400 }}>item</span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{ flex: 1, height: '6px', background: 'var(--gdg-border)', borderRadius: '999px', overflow: 'hidden' }}>
                                                                    <div
                                                                        style={{
                                                                            height: '100%',
                                                                            width: `${Math.min(u.persentase, 100)}%`,
                                                                            background: pal.color,
                                                                            borderRadius: '999px'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="gdg-num-cell" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gdg-text)', minWidth: '44px', textAlign: 'right' }}>
                                                                    {u.persentase}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span className="gdg-status-text" style={{ justifyContent: 'center' }}>
                                                                <span className="gdg-status-dot" style={{ background: dotColor }} />
                                                                <span className="gdg-num-cell">{u.fulfillment_rate}%</span>
                                                            </span>
                                                        </td>
                                                        <td className="gdg-num-cell" style={{ textAlign: 'center', color: 'var(--gdg-muted)' }}>
                                                            {u.total_transaksi}x
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                className="gdg-btn-stripe secondary"
                                                                style={{ height: '28px', padding: '0 10px', fontSize: '12px' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setExpandedUnitPermintaan(isExpanded ? null : u.unit_nama);
                                                                }}
                                                            >
                                                                {isExpanded ? <ChevronUp size={13} /> : <Eye size={13} />}
                                                                <span>{isExpanded ? 'Tutup' : 'Rincian'}</span>
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {/* ACCORDION DRILLDOWN DAFTAR BARANG YANG DIMINTA */}
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan="8" style={{ padding: 0 }}>
                                                                <div className="gdg-lap-drilldown">
                                                                    <div className="gdg-lap-drilldown-head">
                                                                        <h4>Rincian Barang Diminta: <strong>{u.unit_nama}</strong></h4>
                                                                        <span className="gdg-lap-drilldown-meta">
                                                                            Total: {formatQty(u.total_minta)} item • Disetujui: {formatQty(u.total_setuju)} item
                                                                        </span>
                                                                    </div>

                                                                    {(!u.daftar_barang || u.daftar_barang.length === 0) ? (
                                                                        <div className="gdg-lap-drilldown-empty">Tidak ada rincian barang.</div>
                                                                    ) : (
                                                                        <table className="gdg-lap-drilldown-table">
                                                                            <thead>
                                                                                <tr>
                                                                                    <th>NAMA BARANG</th>
                                                                                    <th style={{ textAlign: 'right', width: 150 }}>MINTA</th>
                                                                                    <th style={{ textAlign: 'right', width: 130 }}>ACC</th>
                                                                                    <th style={{ textAlign: 'right', width: 110 }}>PEMENUHAN</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {u.daftar_barang.map((bItem, bIdx) => (
                                                                                    <tr key={bIdx}>
                                                                                        <td className="gdg-cell-strong">{bItem.barang_nama}</td>
                                                                                        <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                                                            Minta: <strong>{formatQty(bItem.qty_minta)}</strong> {bItem.satuan}
                                                                                        </td>
                                                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                                                                                            ACC: {formatQty(bItem.qty_setuju)}
                                                                                        </td>
                                                                                        <td className="gdg-num-cell" style={{ textAlign: 'right', color: 'var(--gdg-muted)' }}>
                                                                                            {bItem.persentase}%
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {permintaanPage.total > 0 && (
                            <SimplePagination
                                className="gdg-dash-pagination"
                                page={permintaanPage.curPage}
                                totalCount={permintaanPage.total}
                                pageSize={pageSize}
                                onPageChange={setPage}
                                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                            />
                        )}
                    </section>
                </div>
            )}

            {/* TAB 3: REKAP PEMAKAIAN PER RUANGAN */}
            {subTab === 'pemakaian' && (
                <div className="gdg-dash-root">
                    <div className="gdg-stat-bar gdg-stat-bar-3">
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Serah Terima Fisik</span>
                            <strong className="gdg-stat-val">
                                {(pemakaianData.summary?.total_transaksi || 0).toLocaleString('id-ID')}
                                <span className="gdg-stat-unit">bon</span>
                            </strong>
                            <span className="gdg-stat-sub">Bon pengeluaran disetujui</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Unit Dikeluarkan</span>
                            <strong className="gdg-stat-val">{formatQty(pemakaianData.summary?.total_qty)}</strong>
                            <span className="gdg-stat-sub">Barang keluar ke ruangan</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Biaya Pemakaian</span>
                            <strong className="gdg-stat-val">{formatRp(pemakaianData.summary?.total_biaya)}</strong>
                            <span className="gdg-stat-sub">Berdasarkan HPP barang keluar</span>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(pemakaianData.results || []).length > 0 && (
                        pieModePemakaian === 'ruangan' ? (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataRuang}
                                totalValue={pemakaianData.summary?.total_biaya}
                                title="Infografis Porsi Pemakaian per Unit Ruangan"
                                subtitle="Visualisasi sebaran porsi pengeluaran & biaya logistik antar instalasi / ruangan"
                                valuePrefix="Rp "
                                unitLabel=""
                                isUnitMode={true}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePemakaian === 'ruangan' ? 'active' : ''}`}
                                            onClick={() => setPieModePemakaian('ruangan')}
                                        >
                                            Porsi Ruangan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePemakaian === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePemakaian('barang')}
                                        >
                                            Top Barang Keluar
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    const matched = ruangList.find(r => r.nama === it.name);
                                    if (matched) {
                                        setSelectedRuang(selectedRuang === String(matched.id) ? '' : String(matched.id));
                                        setPage(1);
                                    }
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataBarangKeluar}
                                totalValue={pemakaianData.summary?.total_qty}
                                title="Infografis Barang Paling Banyak Keluar (Dipakai)"
                                subtitle="Porsi kuantitas fisik barang keluar gudang ke seluruh unit ruangan"
                                valuePrefix=""
                                unitLabel="item"
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePemakaian === 'ruangan' ? 'active' : ''}`}
                                            onClick={() => setPieModePemakaian('ruangan')}
                                        >
                                            Porsi Ruangan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePemakaian === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePemakaian('barang')}
                                        >
                                            Top Barang Keluar
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setSearchPemakaian(searchPemakaian === it.name ? '' : it.name);
                                    setPage(1);
                                }}
                            />
                        )
                    )}

                    <section className="gdg-dash-section">
                        {/* FILTERS */}
                        <div className="gdg-brg-toolbar">
                            <div className="gdg-brg-toolbar-left">
                                <div className="gdg-dash-search">
                                    <Search size={14} className="gdg-dash-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari nama barang, no bon, penerima..."
                                        value={searchPemakaian}
                                        onChange={(e) => { setSearchPemakaian(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <div className="gdg-lap-period-group">
                                    <span className="gdg-lap-period-label">Periode:</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={startDate}
                                            onChange={(val) => { setStartDate(val); setPage(1); }}
                                        />
                                    </div>
                                    <span className="gdg-lap-period-sep">s/d</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={endDate}
                                            onChange={(val) => { setEndDate(val); setPage(1); }}
                                        />
                                    </div>
                                </div>
                                <div className="gdg-ks-select-wrap">
                                    <select
                                        value={selectedRuang}
                                        onChange={(e) => { setSelectedRuang(e.target.value); setPage(1); }}
                                        className="gdg-ks-select gdg-brg-select"
                                    >
                                        <option value="">Semua Unit Ruangan (48 Ruangan)</option>
                                        {ruangList.map(r => (
                                            <option key={r.id} value={r.id}>{r.nama}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="gdg-ks-select-chevron" />
                                </div>
                                {(searchPemakaian || selectedRuang || startDate !== firstDayStr || endDate !== todayStr) && (
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => {
                                            setSearchPemakaian('');
                                            setSelectedRuang('');
                                            setStartDate(firstDayStr);
                                            setEndDate(todayStr);
                                            setPage(1);
                                        }}
                                        title="Reset filter"
                                    >
                                        <X size={13} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap gdg-table-borderless">
                            <table className="gdg-table gdg-table-stripe">
                                <thead>
                                    <tr>
                                        <th>TANGGAL</th>
                                        <th>NO BON OUT</th>
                                        <th>UNIT RUANGAN</th>
                                        <th>PENERIMA</th>
                                        <th>KODE & NAMA BARANG</th>
                                        <th style={{ textAlign: 'right' }}>QTY KELUAR</th>
                                        <th>SATUAN</th>
                                        <th style={{ textAlign: 'right' }}>HPP UNIT</th>
                                        <th style={{ textAlign: 'right' }}>SUBTOTAL BIAYA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Memuat rekap pemakaian...</td></tr>
                                    ) : pemakaianPage.total === 0 ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Tidak ada pemakaian di periode ini.</td></tr>
                                    ) : (
                                        pemakaianPage.items.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.tanggal}</td>
                                                <td className="gdg-code-cell">{r.nomor_out}</td>
                                                <td className="gdg-cell-strong">{r.ruang_nama}</td>
                                                <td>{r.penerima_nama || '-'}</td>
                                                <td>
                                                    <span className="gdg-code-cell">[{r.barang_kode}]</span>{' '}
                                                    <span className="gdg-cell-strong">{r.barang_nama}</span>
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>{formatQty(r.qty)}</td>
                                                <td>{r.satuan}</td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', color: 'var(--gdg-muted)' }}>
                                                    {formatRp(r.harga_unit)}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                    {formatRp(r.subtotal)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {pemakaianPage.total > 0 && (
                            <SimplePagination
                                className="gdg-dash-pagination"
                                page={pemakaianPage.curPage}
                                totalCount={pemakaianPage.total}
                                pageSize={pageSize}
                                onPageChange={setPage}
                                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                            />
                        )}
                    </section>
                </div>
            )}

            {/* TAB 4: REKAP PEMBELIAN PER VENDOR */}
            {subTab === 'pembelian' && (
                <div className="gdg-dash-root">
                    <div className="gdg-stat-bar gdg-stat-bar-3">
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Faktur Penerimaan</span>
                            <strong className="gdg-stat-val">
                                {(pembelianData.summary?.total_grn || 0).toLocaleString('id-ID')}
                                <span className="gdg-stat-unit">faktur</span>
                            </strong>
                            <span className="gdg-stat-sub">Faktur fisik disetujui</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Unit Barang Masuk</span>
                            <strong className="gdg-stat-val">{formatQty(pembelianData.summary?.total_qty_dasar)}</strong>
                            <span className="gdg-stat-sub">Satuan dasar barang</span>
                        </div>
                        <div className="gdg-stat-cell">
                            <span className="gdg-stat-label">Total Nilai Belanja Logistik</span>
                            <strong className="gdg-stat-val">{formatRp(pembelianData.summary?.total_belanja)}</strong>
                            <span className="gdg-stat-sub">Total penerimaan rekanan</span>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(pembelianData.results || []).length > 0 && (
                        pieModePembelian === 'vendor' ? (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataVendor}
                                totalValue={pembelianData.summary?.total_belanja}
                                title="Infografis Porsi Belanja per Rekanan / Vendor"
                                subtitle="Persentase akumulasi realisasi belanja barang masuk dari mitra rekanan"
                                valuePrefix="Rp "
                                unitLabel=""
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePembelian === 'vendor' ? 'active' : ''}`}
                                            onClick={() => setPieModePembelian('vendor')}
                                        >
                                            Porsi Rekanan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePembelian === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePembelian('barang')}
                                        >
                                            Top Komoditas Masuk
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setSearchPembelian(searchPembelian === it.name ? '' : it.name);
                                    setPage(1);
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
                                variant="stripe"
                                items={pieDataBarangBeli}
                                totalValue={pembelianData.summary?.total_belanja}
                                title="Infografis Top Belanja Barang Masuk"
                                subtitle="Proporsi alokasi dana belanja pengadaan logistik per komoditas barang"
                                valuePrefix="Rp "
                                unitLabel=""
                                isUnitMode={false}
                                extraActions={
                                    <div className="lpi-limit-pills">
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePembelian === 'vendor' ? 'active' : ''}`}
                                            onClick={() => setPieModePembelian('vendor')}
                                        >
                                            Porsi Rekanan
                                        </button>
                                        <button
                                            type="button"
                                            className={`lpi-limit-pill ${pieModePembelian === 'barang' ? 'active' : ''}`}
                                            onClick={() => setPieModePembelian('barang')}
                                        >
                                            Top Komoditas Masuk
                                        </button>
                                    </div>
                                }
                                onSelectItem={(it) => {
                                    if (it.isOthers) return;
                                    setSearchPembelian(searchPembelian === it.name ? '' : it.name);
                                    setPage(1);
                                }}
                            />
                        )
                    )}

                    <section className="gdg-dash-section">
                        {/* FILTERS */}
                        <div className="gdg-brg-toolbar">
                            <div className="gdg-brg-toolbar-left">
                                <div className="gdg-dash-search">
                                    <Search size={14} className="gdg-dash-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Cari vendor, nama barang, no faktur..."
                                        value={searchPembelian}
                                        onChange={(e) => { setSearchPembelian(e.target.value); setPage(1); }}
                                    />
                                </div>
                                <div className="gdg-lap-period-group">
                                    <span className="gdg-lap-period-label">Periode:</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={startDate}
                                            onChange={(val) => { setStartDate(val); setPage(1); }}
                                        />
                                    </div>
                                    <span className="gdg-lap-period-sep">s/d</span>
                                    <div className="gdg-lap-date-box">
                                        <DateField
                                            className="gdg-po-date-field"
                                            value={endDate}
                                            onChange={(val) => { setEndDate(val); setPage(1); }}
                                        />
                                    </div>
                                </div>
                                {(searchPembelian || startDate !== firstDayStr || endDate !== todayStr) && (
                                    <button
                                        type="button"
                                        className="gdg-btn-stripe secondary"
                                        onClick={() => {
                                            setSearchPembelian('');
                                            setStartDate(firstDayStr);
                                            setEndDate(todayStr);
                                            setPage(1);
                                        }}
                                        title="Reset filter"
                                    >
                                        <X size={13} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap gdg-table-borderless">
                            <table className="gdg-table gdg-table-stripe">
                                <thead>
                                    <tr>
                                        <th>TANGGAL</th>
                                        <th>NO GRN</th>
                                        <th>NO FAKTUR</th>
                                        <th>REKANAN / VENDOR</th>
                                        <th>KODE & NAMA BARANG</th>
                                        <th style={{ textAlign: 'right' }}>QTY KEMASAN</th>
                                        <th style={{ textAlign: 'right' }}>TOTAL DASAR</th>
                                        <th style={{ textAlign: 'right' }}>HARGA DASAR</th>
                                        <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Memuat rekap pembelian...</td></tr>
                                    ) : pembelianPage.total === 0 ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Tidak ada pembelian di periode ini.</td></tr>
                                    ) : (
                                        pembelianPage.items.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.tanggal}</td>
                                                <td className="gdg-code-cell">{r.nomor_grn}</td>
                                                <td>{r.no_faktur}</td>
                                                <td className="gdg-cell-strong">{r.vendor_nama}</td>
                                                <td>
                                                    <span className="gdg-code-cell">[{r.barang_kode}]</span>{' '}
                                                    <span className="gdg-cell-strong">{r.barang_nama}</span>
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right' }}>
                                                    {formatQty(r.qty_kemasan)} {r.kemasan}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {formatQty(r.qty_dasar)} {r.satuan_dasar}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', color: 'var(--gdg-muted)' }}>
                                                    {formatRp(r.harga_dasar)}
                                                </td>
                                                <td className="gdg-num-cell" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text)' }}>
                                                    {formatRp(r.subtotal)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {pembelianPage.total > 0 && (
                            <SimplePagination
                                className="gdg-dash-pagination"
                                page={pembelianPage.curPage}
                                totalCount={pembelianPage.total}
                                pageSize={pageSize}
                                onPageChange={setPage}
                                onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                            />
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
