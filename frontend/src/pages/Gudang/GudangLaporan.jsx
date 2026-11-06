import React, { useState, useEffect, useMemo } from 'react';
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
    CheckCircle2,
    Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import LogistikPieInfographic, { MACARON_PALETTE, getLogistikCuteMeta } from '../Logistik/LogistikPieInfographic';
import '../Logistik/LogistikLaporan.css';

export default function GudangLaporan() {
    const toast = useToast();
    const [subTab, setSubTab] = useState('stok_akhir'); // 'stok_akhir' | 'permintaan' | 'pemakaian' | 'pembelian'
    const [loading, setLoading] = useState(false);

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* SUB-TABS NAVIGATION */}
            <div>
                <div className="gdg-segmented-tabs">
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'stok_akhir' ? 'active' : ''}`}
                        onClick={() => setSubTab('stok_akhir')}
                    >
                        <span className="tab-icon"><Boxes size={17} /></span>
                        <span>Nilai Persediaan & Stok Akhir</span>
                    </button>
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'permintaan' ? 'active' : ''}`}
                        onClick={() => setSubTab('permintaan')}
                    >
                        <span className="tab-icon"><FileText size={17} /></span>
                        <span>Rekap Permintaan Tiap Unit</span>
                    </button>
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'pemakaian' ? 'active' : ''}`}
                        onClick={() => setSubTab('pemakaian')}
                    >
                        <span className="tab-icon"><TrendingUp size={17} /></span>
                        <span>Rekap Pemakaian per Ruangan</span>
                    </button>
                    <button
                        type="button"
                        className={`gdg-segmented-tab ${subTab === 'pembelian' ? 'active' : ''}`}
                        onClick={() => setSubTab('pembelian')}
                    >
                        <span className="tab-icon"><Truck size={17} /></span>
                        <span>Rekap Pembelian per Vendor</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: STOK AKHIR & NILAI PERSEDIAAN */}
            {subTab === 'stok_akhir' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* KPI CARDS */}
                    <div className="gdg-kpi-grid">
                        <div className="gdg-kpi-card blue">
                            <div className="gdg-kpi-icon">
                                <Boxes size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Varian Barang</span>
                                <strong>{stokAkhirData.summary?.total_items || 0} item</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Barang aktif terdaftar</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card amber">
                            <div className="gdg-kpi-icon">
                                <Layers size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Unit Fisik Gudang</span>
                                <strong>{formatQty(stokAkhirData.summary?.total_qty)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Kuantitas stok berjalan</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card emerald">
                            <div className="gdg-kpi-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Nilai Aset Persediaan</span>
                                <strong style={{ fontSize: '1.25rem' }}>{formatRp(stokAkhirData.summary?.total_nilai)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Berdasarkan HPP rata-rata (WMA)</small>
                            </div>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(stokAkhirData.results || []).length > 0 && (
                        pieModeStok === 'golongan' ? (
                            <LogistikPieInfographic
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
                                    }
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
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
                                }}
                            />
                        )
                    )}

                    <div className="gdg-card">
                        <div className="gdg-card-head">
                            <div className="gdg-card-title">
                                <h2>Laporan Nilai Persediaan Stok Gudang</h2>
                                <p>Valuasi aset persediaan logistik non-farmasi RS Siaga Al Munawwarah</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="gdg-btn soft" onClick={handleExportExcel} title="Export data ke spreadsheet Excel">
                                    <Download size={15} /> Export Excel
                                </button>
                                <button className="gdg-btn soft" onClick={handlePrint} title="Cetak laporan">
                                    <Printer size={15} /> Cetak
                                </button>
                                <button className="gdg-btn soft" onClick={fetchStokAkhir} disabled={loading}>
                                    <RefreshCw size={15} /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* FILTERS */}
                        <div className="gdg-toolbar">
                            <div className="gdg-search" style={{ minWidth: '240px' }}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari nama barang, kode..."
                                    value={searchStok}
                                    onChange={(e) => setSearchStok(e.target.value)}
                                />
                            </div>
                            <select
                                value={selectedGolongan}
                                onChange={(e) => setSelectedGolongan(e.target.value)}
                                className="gdg-select-control"
                                style={{ minWidth: '180px', height: '40px', borderRadius: '8px' }}
                            >
                                <option value="">Semua Golongan</option>
                                {golonganList.map(g => (
                                    <option key={g.id} value={g.id}>[{g.kode}] {g.nama}</option>
                                ))}
                            </select>
                            <select
                                value={selectedStatusStok}
                                onChange={(e) => setSelectedStatusStok(e.target.value)}
                                className="gdg-select-control"
                                style={{ minWidth: '180px', height: '40px', borderRadius: '8px' }}
                            >
                                <option value="">Semua Status Stok</option>
                                <option value="aman">Stok Aman (Di Atas Buffer)</option>
                                <option value="menipis">Stok Menipis (Buffer)</option>
                                <option value="habis">Stok Habis (0)</option>
                            </select>
                            {(searchStok || selectedGolongan || selectedStatusStok) && (
                                <button
                                    type="button"
                                    className="gdg-btn soft"
                                    onClick={() => {
                                        setSearchStok('');
                                        setSelectedGolongan('');
                                        setSelectedStatusStok('');
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap">
                            <table className="gdg-table">
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
                                    ) : (stokAkhirData.results || []).length === 0 ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Tidak ada data barang yang sesuai filter.</td></tr>
                                    ) : (
                                        stokAkhirData.results.map((r, idx) => (
                                            <tr key={idx}>
                                                <td className="gdg-code-cell">{r.kode}</td>
                                                <td className="gdg-cell-strong">{r.nama}</td>
                                                <td>{r.golongan_nama}</td>
                                                <td>{r.satuan}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--gdg-text-secondary, #64748b)', fontWeight: 600 }}>
                                                    {formatQty(r.stok_minimum)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                    {Number(r.qty_fisik) <= 0 ? (
                                                        <span className="gdg-badge danger" style={{ fontSize: '0.74rem' }}>0 Habis</span>
                                                    ) : Number(r.qty_fisik) <= Number(r.stok_minimum) ? (
                                                        <span className="gdg-badge warning" style={{ fontSize: '0.74rem' }}>{formatQty(r.qty_fisik)} Menipis</span>
                                                    ) : (
                                                        <span style={{ color: '#0284c7' }}>{formatQty(r.qty_fisik)}</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text-secondary, #475569)' }}>
                                                    {formatRp(r.avg_cost)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                                    {formatRp(r.total_nilai)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: REKAP PERMINTAAN TIAP UNIT */}
            {subTab === 'permintaan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* KPI CARDS */}
                    <div className="gdg-kpi-grid">
                        <div className="gdg-kpi-card blue">
                            <div className="gdg-kpi-icon">
                                <FileText size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Permintaan Barang</span>
                                <strong>{formatQty(permintaanUnitData.summary?.total_permintaan_minta)} item</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>{permintaanUnitData.summary?.total_transaksi || 0} transaksi amprahan unit</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card emerald">
                            <div className="gdg-kpi-icon">
                                <CheckCircle2 size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Kuantitas Disetujui</span>
                                <strong>{formatQty(permintaanUnitData.summary?.total_permintaan_setuju)} item</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Telah di-ACC petugas gudang</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card sky">
                            <div className="gdg-kpi-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Tingkat Pemenuhan (Fulfillment)</span>
                                <strong style={{ fontSize: '1.25rem' }}>{permintaanUnitData.summary?.fulfillment_rate || 0}%</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>{permintaanUnitData.summary?.total_unit_aktif || 0} unit aktif mengajukan</small>
                            </div>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(permintaanUnitData.results || []).length > 0 && (
                        pieModePermintaan === 'unit' ? (
                            <LogistikPieInfographic
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
                                }}
                            />
                        )
                    )}

                    {/* TABLE CARD */}
                    <div className="gdg-card">
                        <div className="gdg-card-head">
                            <div className="gdg-card-title">
                                <h2>Rekapitulasi Permintaan Barang Tiap Unit & Pemenuhan</h2>
                                <p>Daftar porsi permintaan dan rincian pemenuhan barang per departemen rumah sakit</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="gdg-btn soft" onClick={handleExportExcel} title="Export data ke spreadsheet Excel">
                                    <Download size={15} /> Export Excel
                                </button>
                                <button className="gdg-btn soft" onClick={handlePrint} title="Cetak laporan">
                                    <Printer size={15} /> Cetak
                                </button>
                                <button className="gdg-btn soft" onClick={fetchPermintaan} disabled={loading}>
                                    <RefreshCw size={15} /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* FILTERS */}
                        <div className="gdg-toolbar">
                            <div className="gdg-search" style={{ minWidth: '240px' }}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari nama unit, barang..."
                                    value={searchPermintaan}
                                    onChange={(e) => setSearchPermintaan(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.84rem', color: 'var(--gdg-text-secondary, #64748b)', fontWeight: 600 }}>Periode:</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={startDate}
                                        onChange={(val) => setStartDate(val)}
                                    />
                                </div>
                                <span style={{ color: '#64748b' }}>s/d</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={endDate}
                                        onChange={(val) => setEndDate(val)}
                                    />
                                </div>
                            </div>
                            <select
                                value={selectedRuangPermintaan}
                                onChange={(e) => setSelectedRuangPermintaan(e.target.value)}
                                className="gdg-select-control"
                                style={{ minWidth: '200px', height: '40px', borderRadius: '8px' }}
                            >
                                <option value="">Semua Unit Ruangan (48 Ruangan)</option>
                                {ruangList.map(r => (
                                    <option key={r.id} value={r.id}>{r.nama}</option>
                                ))}
                            </select>
                            {(searchPermintaan || selectedRuangPermintaan || startDate !== firstDayStr || endDate !== todayStr) && (
                                <button
                                    type="button"
                                    className="gdg-btn soft"
                                    onClick={() => {
                                        setSearchPermintaan('');
                                        setSelectedRuangPermintaan('');
                                        setStartDate(firstDayStr);
                                        setEndDate(todayStr);
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap">
                            <table className="gdg-table">
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
                                    ) : (permintaanUnitData.results || []).length === 0 ? (
                                        <tr><td colSpan="8" className="gdg-table-empty">Tidak ada data permintaan unit di periode terpilih.</td></tr>
                                    ) : (
                                        permintaanUnitData.results.map((u, idx) => {
                                            const rank = idx + 1;
                                            const isExpanded = expandedUnitPermintaan === u.unit_nama;
                                            const pal = MACARON_PALETTE[(rank - 1) % MACARON_PALETTE.length];
                                            const meta = getLogistikCuteMeta(u.unit_nama, true);

                                            return (
                                                <React.Fragment key={u.unit_nama}>
                                                    <tr
                                                        style={{ cursor: 'pointer', background: isExpanded ? 'rgba(37, 99, 235, 0.04)' : undefined }}
                                                        onClick={() => setExpandedUnitPermintaan(isExpanded ? null : u.unit_nama)}
                                                    >
                                                        <td style={{ fontWeight: 700, color: 'var(--gdg-text-secondary, #64748b)' }}>{rank}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <span
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '9px',
                                                                        background: pal.bg,
                                                                        color: pal.text,
                                                                        border: `1px solid ${pal.border}`,
                                                                        flexShrink: 0
                                                                    }}
                                                                >
                                                                    <meta.icon size={15} strokeWidth={2.4} />
                                                                </span>
                                                                <div>
                                                                    <div className="gdg-cell-strong">{u.unit_nama}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                        {u.total_jenis_barang} jenis barang diminta
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                            {formatQty(u.total_minta)} <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 400 }}>item</span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                                                            {formatQty(u.total_setuju)} <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 400 }}>item</span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{ flex: 1, height: '7px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                                                                    <div
                                                                        style={{
                                                                            height: '100%',
                                                                            width: `${Math.min(u.persentase, 100)}%`,
                                                                            background: pal.color,
                                                                            borderRadius: '999px'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--gdg-text-primary, #0f172a)', minWidth: '46px', textAlign: 'right' }}>
                                                                    {u.persentase}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span
                                                                className={`gdg-badge ${u.fulfillment_rate >= 90 ? 'success' : u.fulfillment_rate >= 60 ? 'warning' : 'danger'}`}
                                                                style={{ fontSize: '0.76rem', fontWeight: 700 }}
                                                            >
                                                                {u.fulfillment_rate}%
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--gdg-text-secondary, #64748b)' }}>
                                                            {u.total_transaksi}x
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                className={`gdg-btn soft ${isExpanded ? 'active' : ''}`}
                                                                style={{ padding: '4px 10px', fontSize: '0.76rem', borderRadius: '7px' }}
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
                                                                <div className="ll-drilldown-box">
                                                                    <div className="ll-drilldown-header">
                                                                        <Package size={16} />
                                                                        <h4>Rincian Barang yang Diminta oleh: <strong>{u.unit_nama}</strong></h4>
                                                                        <span className="ll-drilldown-total">
                                                                            Total: {formatQty(u.total_minta)} item • Disetujui: {formatQty(u.total_setuju)} item
                                                                        </span>
                                                                    </div>

                                                                    <div className="ll-drilldown-grid">
                                                                        {(!u.daftar_barang || u.daftar_barang.length === 0) ? (
                                                                            <p className="ll-drilldown-empty">Tidak ada rincian barang.</p>
                                                                        ) : (
                                                                            u.daftar_barang.map((bItem, bIdx) => {
                                                                                const bPal = MACARON_PALETTE[bIdx % MACARON_PALETTE.length];
                                                                                const bMeta = getLogistikCuteMeta(bItem.barang_nama, false);

                                                                                return (
                                                                                    <div key={bIdx} className="ll-unit-breakdown-card">
                                                                                        <div className="ll-ub-header">
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                                                                <bMeta.icon size={14} style={{ color: bPal.color, flexShrink: 0 }} />
                                                                                                <span className="ll-ub-title" title={bItem.barang_nama}>
                                                                                                    {bItem.barang_nama}
                                                                                                </span>
                                                                                            </div>
                                                                                            <span
                                                                                                className="ll-ub-pct"
                                                                                                style={{
                                                                                                    background: bPal.bg,
                                                                                                    color: bPal.text,
                                                                                                    borderColor: bPal.border
                                                                                                }}
                                                                                            >
                                                                                                {bItem.persentase}%
                                                                                            </span>
                                                                                        </div>

                                                                                        <div className="ll-ub-bar-wrap">
                                                                                            <div className="ll-ub-bar-track">
                                                                                                <div
                                                                                                    className="ll-ub-bar-fill"
                                                                                                    style={{
                                                                                                        width: `${Math.min(bItem.persentase, 100)}%`,
                                                                                                        background: bPal.color
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="ll-ub-footer">
                                                                                            <span>
                                                                                                Minta: <strong>{formatQty(bItem.qty_minta)}</strong> {bItem.satuan}
                                                                                            </span>
                                                                                            <span style={{ color: '#166534', fontWeight: 600 }}>
                                                                                                ACC: {formatQty(bItem.qty_setuju)}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
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
                    </div>
                </div>
            )}

            {/* TAB 3: REKAP PEMAKAIAN PER RUANGAN */}
            {subTab === 'pemakaian' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="gdg-kpi-grid">
                        <div className="gdg-kpi-card sky">
                            <div className="gdg-kpi-icon">
                                <FileSpreadsheet size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Serah Terima Fisik</span>
                                <strong>{pemakaianData.summary?.total_transaksi || 0} bon</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Bon pengeluaran disetujui</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card amber">
                            <div className="gdg-kpi-icon">
                                <Boxes size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Unit Dikeluarkan</span>
                                <strong>{formatQty(pemakaianData.summary?.total_qty)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Barang keluar ke ruangan</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card emerald">
                            <div className="gdg-kpi-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Biaya Pemakaian</span>
                                <strong style={{ fontSize: '1.25rem' }}>{formatRp(pemakaianData.summary?.total_biaya)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Berdasarkan HPP barang keluar</small>
                            </div>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(pemakaianData.results || []).length > 0 && (
                        pieModePemakaian === 'ruangan' ? (
                            <LogistikPieInfographic
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
                                    }
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
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
                                }}
                            />
                        )
                    )}

                    <div className="gdg-card">
                        <div className="gdg-card-head">
                            <div className="gdg-card-title">
                                <h2>Rekapitulasi Pemakaian Barang per Unit Ruangan</h2>
                                <p>Rincian mutasi keluar logistik ke ruangan di periode terpilih</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="gdg-btn soft" onClick={handleExportExcel} title="Export data ke spreadsheet Excel">
                                    <Download size={15} /> Export Excel
                                </button>
                                <button className="gdg-btn soft" onClick={handlePrint} title="Cetak laporan">
                                    <Printer size={15} /> Cetak
                                </button>
                                <button className="gdg-btn soft" onClick={fetchPemakaian} disabled={loading}>
                                    <RefreshCw size={15} /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* FILTERS */}
                        <div className="gdg-toolbar">
                            <div className="gdg-search" style={{ minWidth: '240px' }}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari nama barang, no bon, penerima..."
                                    value={searchPemakaian}
                                    onChange={(e) => setSearchPemakaian(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.84rem', color: 'var(--gdg-text-secondary, #64748b)', fontWeight: 600 }}>Periode:</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={startDate}
                                        onChange={(val) => setStartDate(val)}
                                    />
                                </div>
                                <span style={{ color: '#64748b' }}>s/d</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={endDate}
                                        onChange={(val) => setEndDate(val)}
                                    />
                                </div>
                            </div>
                            <select
                                value={selectedRuang}
                                onChange={(e) => setSelectedRuang(e.target.value)}
                                className="gdg-select-control"
                                style={{ minWidth: '200px', height: '40px', borderRadius: '8px' }}
                            >
                                <option value="">Semua Unit Ruangan (48 Ruangan)</option>
                                {ruangList.map(r => (
                                    <option key={r.id} value={r.id}>{r.nama}</option>
                                ))}
                            </select>
                            {(searchPemakaian || selectedRuang || startDate !== firstDayStr || endDate !== todayStr) && (
                                <button
                                    type="button"
                                    className="gdg-btn soft"
                                    onClick={() => {
                                        setSearchPemakaian('');
                                        setSelectedRuang('');
                                        setStartDate(firstDayStr);
                                        setEndDate(todayStr);
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap">
                            <table className="gdg-table">
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
                                    ) : (pemakaianData.results || []).length === 0 ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Tidak ada pemakaian di periode ini.</td></tr>
                                    ) : (
                                        pemakaianData.results.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.tanggal}</td>
                                                <td style={{ color: '#0284c7', fontWeight: 600 }}>{r.nomor_out}</td>
                                                <td className="gdg-cell-strong">{r.ruang_nama}</td>
                                                <td>{r.penerima_nama || '-'}</td>
                                                <td>
                                                    <span className="gdg-code-cell">[{r.barang_kode}]</span> <span className="gdg-cell-strong">{r.barang_nama}</span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatQty(r.qty)}</td>
                                                <td>{r.satuan}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text-secondary, #475569)' }}>
                                                    {formatRp(r.harga_unit)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                                    {formatRp(r.subtotal)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: REKAP PEMBELIAN PER VENDOR */}
            {subTab === 'pembelian' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="gdg-kpi-grid">
                        <div className="gdg-kpi-card blue">
                            <div className="gdg-kpi-icon">
                                <Truck size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Faktur Penerimaan</span>
                                <strong>{pembelianData.summary?.total_grn || 0} faktur</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Faktur fisik disetujui</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card amber">
                            <div className="gdg-kpi-icon">
                                <Boxes size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Unit Barang Masuk</span>
                                <strong>{formatQty(pembelianData.summary?.total_qty_dasar)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Satuan dasar barang</small>
                            </div>
                        </div>
                        <div className="gdg-kpi-card emerald">
                            <div className="gdg-kpi-icon">
                                <TrendingUp size={24} />
                            </div>
                            <div className="gdg-kpi-info">
                                <span>Total Nilai Belanja Logistik</span>
                                <strong style={{ fontSize: '1.25rem' }}>{formatRp(pembelianData.summary?.total_belanja)}</strong>
                                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Total penerimaan rekanan</small>
                            </div>
                        </div>
                    </div>

                    {/* INFOGRAFIS STATISTIK PIE CHART */}
                    {(pembelianData.results || []).length > 0 && (
                        pieModePembelian === 'vendor' ? (
                            <LogistikPieInfographic
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
                                }}
                            />
                        ) : (
                            <LogistikPieInfographic
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
                                }}
                            />
                        )
                    )}

                    <div className="gdg-card">
                        <div className="gdg-card-head">
                            <div className="gdg-card-title">
                                <h2>Rekapitulasi Pembelian Barang Masuk Rekanan</h2>
                                <p>Rincian penerimaan barang masuk dari vendor di periode terpilih</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="gdg-btn soft" onClick={handleExportExcel} title="Export data ke spreadsheet Excel">
                                    <Download size={15} /> Export Excel
                                </button>
                                <button className="gdg-btn soft" onClick={handlePrint} title="Cetak laporan">
                                    <Printer size={15} /> Cetak
                                </button>
                                <button className="gdg-btn soft" onClick={fetchPembelian} disabled={loading}>
                                    <RefreshCw size={15} /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* FILTERS */}
                        <div className="gdg-toolbar">
                            <div className="gdg-search" style={{ minWidth: '240px' }}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Cari vendor, nama barang, no faktur..."
                                    value={searchPembelian}
                                    onChange={(e) => setSearchPembelian(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.84rem', color: 'var(--gdg-text-secondary, #64748b)', fontWeight: 600 }}>Periode:</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={startDate}
                                        onChange={(val) => setStartDate(val)}
                                    />
                                </div>
                                <span style={{ color: '#64748b' }}>s/d</span>
                                <div style={{ width: '140px' }}>
                                    <DateField
                                        value={endDate}
                                        onChange={(val) => setEndDate(val)}
                                    />
                                </div>
                            </div>
                            {(searchPembelian || startDate !== firstDayStr || endDate !== todayStr) && (
                                <button
                                    type="button"
                                    className="gdg-btn soft"
                                    onClick={() => {
                                        setSearchPembelian('');
                                        setStartDate(firstDayStr);
                                        setEndDate(todayStr);
                                    }}
                                    title="Reset filter"
                                >
                                    <X size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* TABLE */}
                        <div className="gdg-table-wrap">
                            <table className="gdg-table">
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
                                    ) : (pembelianData.results || []).length === 0 ? (
                                        <tr><td colSpan="9" className="gdg-table-empty">Tidak ada pembelian di periode ini.</td></tr>
                                    ) : (
                                        pembelianData.results.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.tanggal}</td>
                                                <td style={{ color: '#0284c7', fontWeight: 600 }}>{r.nomor_grn}</td>
                                                <td>{r.no_faktur}</td>
                                                <td className="gdg-cell-strong">{r.vendor_nama}</td>
                                                <td>
                                                    <span className="gdg-code-cell">[{r.barang_kode}]</span> <span className="gdg-cell-strong">{r.barang_nama}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {formatQty(r.qty_kemasan)} {r.kemasan}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                    {formatQty(r.qty_dasar)} {r.satuan_dasar}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gdg-text-secondary, #475569)' }}>
                                                    {formatRp(r.harga_dasar)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                                    {formatRp(r.subtotal)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
