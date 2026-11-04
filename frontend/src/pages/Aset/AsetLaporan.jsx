import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileSpreadsheet, Printer, Download, Building2, Calculator, Layers, Search, DollarSign, TrendingDown, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import './Aset.css';

export default function AsetLaporan() {
    const { user } = useAuth();
    const [tab, setTab] = useState('rekap'); // 'rekap' | 'kir'

    // Rekap State
    const [tahun, setTahun] = useState(new Date().getFullYear());
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);

    // KIR State
    const [ruanganList, setRuanganList] = useState([]);
    const [selectedRuanganId, setSelectedRuanganId] = useState('');
    const [kirAssets, setKirAssets] = useState([]);
    const [loadingKir, setLoadingKir] = useState(false);
    const kirPrintRef = useRef(null);

    useEffect(() => {
        loadRekap();
        loadRuanganList();
    }, [tahun]);

    useEffect(() => {
        if (selectedRuanganId) {
            loadKirAssets(selectedRuanganId);
        } else {
            setKirAssets([]);
        }
    }, [selectedRuanganId]);

    const loadRekap = async () => {
        setLoading(true);
        try {
            const res = await api.get('/aset/aset/');
            setAssets(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to load assets for report', err);
        } finally {
            setLoading(false);
        }
    };

    const loadRuanganList = async () => {
        try {
            const res = await api.get('/aset/ruangan/');
            const list = res.data.results || res.data || [];
            setRuanganList(list);
            if (list.length > 0 && !selectedRuanganId) {
                setSelectedRuanganId(list[0].id);
            }
        } catch (err) {
            console.error('Failed to load ruangan list', err);
        }
    };

    const loadKirAssets = async (ruanganId) => {
        setLoadingKir(true);
        try {
            const res = await api.get('/aset/aset/', { params: { ruangan_id: ruanganId } });
            setKirAssets(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to load KIR assets', err);
        } finally {
            setLoadingKir(false);
        }
    };

    const formatRp = (val) => {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    // Calculate grouping for Rekap
    const rekapByKategori = () => {
        const groups = {};
        assets.forEach(a => {
            const kat = a.kategori_nama || 'Lainnya';
            if (!groups[kat]) {
                groups[kat] = {
                    kategori: kat,
                    count: 0,
                    total_harga: 0,
                    akumulasi_penyusutan: 0,
                    nilai_buku: 0,
                };
            }
            groups[kat].count += 1;
            if (a.harga_perolehan) groups[kat].total_harga += Number(a.harga_perolehan);
            if (a.penyusutan?.akumulasi_penyusutan) groups[kat].akumulasi_penyusutan += Number(a.penyusutan.akumulasi_penyusutan);
            if (a.penyusutan?.nilai_buku) groups[kat].nilai_buku += Number(a.penyusutan.nilai_buku);
        });
        return Object.values(groups);
    };

    const exportRekapExcel = () => {
        const rows = rekapByKategori().map((r, i) => ({
            'No': i + 1,
            'Kategori Aset': r.kategori,
            'Jumlah Unit': r.count,
            'Total Harga Perolehan (Rp)': r.total_harga,
            'Akumulasi Penyusutan (Rp)': r.akumulasi_penyusutan,
            'Nilai Buku Bersih (Rp)': r.nilai_buku,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Rekap_Penyusutan_${tahun}`);
        XLSX.writeFile(wb, `Laporan_Penyusutan_Aset_${tahun}.xlsx`);
    };

    const handlePrintKIR = () => {
        const content = kirPrintRef.current;
        if (!content) return;
        const printWindow = window.open('', '', 'width=950,height=800');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <title>KIR - ${selectedRoom?.nama || 'Ruangan'}</title>
                    <style>
                        @page {
                            size: A4 portrait;
                            margin: 12mm 15mm 15mm 15mm;
                        }
                        * {
                            box-sizing: border-box;
                        }
                        body {
                            font-family: "Segoe UI", Arial, Helvetica, sans-serif;
                            color: #000;
                            margin: 0;
                            padding: 10px;
                            font-size: 10pt;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .kir-header {
                            display: flex;
                            align-items: center;
                            gap: 16px;
                            margin-bottom: 8px;
                        }
                        .kir-logo {
                            width: 60px;
                            height: 60px;
                            object-fit: contain;
                        }
                        .kir-header-center {
                            flex: 1;
                            text-align: center;
                        }
                        .kir-inst-title {
                            font-size: 14pt;
                            font-weight: 800;
                            letter-spacing: 0.5px;
                            color: #000;
                            text-transform: uppercase;
                        }
                        .kir-inst-sub {
                            font-size: 9pt;
                            font-weight: 700;
                            color: #222;
                            margin-top: 2px;
                        }
                        .kir-inst-address {
                            font-size: 8pt;
                            color: #444;
                            margin-top: 2px;
                        }
                        .kir-divider-double {
                            border-top: 2.5px solid #000;
                            border-bottom: 1px solid #000;
                            height: 3px;
                            margin-bottom: 14px;
                        }
                        .kir-doc-title-area {
                            text-align: center;
                            margin-bottom: 14px;
                        }
                        .kir-title {
                            font-size: 13pt;
                            font-weight: 800;
                            text-transform: uppercase;
                            margin: 0;
                            letter-spacing: 1px;
                            color: #000;
                        }
                        .kir-doc-number {
                            font-size: 8.5pt;
                            color: #444;
                            margin-top: 2px;
                        }
                        .kir-meta-grid {
                            display: flex;
                            justify-content: space-between;
                            background: #f8fafc;
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            padding: 8px 12px;
                            margin-bottom: 14px;
                            font-size: 8.5pt;
                        }
                        .kir-meta-col {
                            display: flex;
                            flex-direction: column;
                            gap: 3px;
                        }
                        .kir-meta-row {
                            display: flex;
                        }
                        .kir-meta-label {
                            width: 140px;
                            color: #475569;
                        }
                        .kir-meta-val {
                            color: #000;
                            font-weight: 600;
                        }
                        table.kir-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 8.5pt;
                            margin-bottom: 20px;
                        }
                        table.kir-table th, table.kir-table td {
                            border: 1px solid #000;
                            padding: 6px 8px;
                            text-align: left;
                        }
                        table.kir-table th {
                            background-color: #f1f5f9 !important;
                            text-align: center;
                            font-weight: 700;
                            font-size: 8pt;
                            color: #000;
                        }
                        table.kir-table td {
                            color: #000;
                        }
                        .kir-grade-badge {
                            display: inline-block;
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-weight: 700;
                            font-size: 8pt;
                            border: 1px solid #444;
                        }
                        .kir-sign-area {
                            display: flex;
                            justify-content: space-between;
                            margin-top: 30px;
                            font-size: 9pt;
                            page-break-inside: avoid;
                        }
                        .kir-sign-col {
                            text-align: center;
                            width: 240px;
                        }
                        .kir-sign-space {
                            height: 60px;
                        }
                        .kir-sign-name {
                            font-weight: bold;
                        }
                        .kir-sign-nip {
                            font-size: 8pt;
                            color: #333;
                            margin-top: 2px;
                        }
                        .kir-footer-notes {
                            margin-top: 30px;
                            font-size: 7.5pt;
                            color: #555;
                            font-style: italic;
                            border-top: 1px dashed #aaa;
                            padding-top: 6px;
                        }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                    <script>
                        window.onload = function() {
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const selectedRoom = ruanganList.find(r => String(r.id) === String(selectedRuanganId));
    const rekapData = rekapByKategori();

    // Grand total untuk Rekapitulasi
    const grandTotals = useMemo(() => {
        return rekapData.reduce((acc, row) => ({
            count: acc.count + (row.count || 0),
            total_harga: acc.total_harga + (row.total_harga || 0),
            akumulasi_penyusutan: acc.akumulasi_penyusutan + (row.akumulasi_penyusutan || 0),
            nilai_buku: acc.nilai_buku + (row.nilai_buku || 0),
        }), { count: 0, total_harga: 0, akumulasi_penyusutan: 0, nilai_buku: 0 });
    }, [rekapData]);

    return (
        <div className="aset-container">
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <FileSpreadsheet size={22} color="#818cf8" />
                        Laporan &amp; Kartu Inventaris Ruangan (KIR)
                    </h1>
                    <p className="aset-subtitle">
                        Rekapitulasi beban penyusutan fiskal &amp; dokumen inventaris resmi ruangan RS
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="aset-tabs">
                <button
                    className={`aset-tab-btn ${tab === 'rekap' ? 'active' : ''}`}
                    onClick={() => setTab('rekap')}
                >
                    <Calculator size={14} /> Rekapitulasi Penyusutan per Kategori
                </button>
                <button
                    className={`aset-tab-btn ${tab === 'kir' ? 'active' : ''}`}
                    onClick={() => setTab('kir')}
                >
                    <Building2 size={14} /> Cetak Kartu Inventaris Ruangan (KIR)
                </button>
            </div>

            {/* TAB 1: REKAPITULASI PENYUSUTAN */}
            {tab === 'rekap' && (
                <div>
                    {/* Ringkasan Eksekutif Finansial Aset */}
                    <div className="aset-stats-grid" style={{ marginBottom: '16px' }}>
                        <div className="aset-stat-card">
                            <div className="aset-stat-header">
                                <span className="aset-stat-title">Total Unit Aset</span>
                                <Layers size={16} color="#818cf8" />
                            </div>
                            <div className="aset-stat-value">{grandTotals.count} <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>unit</span></div>
                            <div className="aset-stat-sub">Terdata dalam {rekapData.length} kategori aktif</div>
                        </div>

                        <div className="aset-stat-card">
                            <div className="aset-stat-header">
                                <span className="aset-stat-title">Total Nilai Perolehan</span>
                                <DollarSign size={16} color="#38bdf8" />
                            </div>
                            <div className="aset-stat-value" style={{ fontSize: '18px', color: '#f8fafc' }}>
                                {formatRp(grandTotals.total_harga)}
                            </div>
                            <div className="aset-stat-sub">Harga perolehan awal aset RS</div>
                        </div>

                        <div className="aset-stat-card">
                            <div className="aset-stat-header">
                                <span className="aset-stat-title">Akumulasi Penyusutan</span>
                                <TrendingDown size={16} color="#fb923c" />
                            </div>
                            <div className="aset-stat-value" style={{ fontSize: '18px', color: '#fb923c' }}>
                                {formatRp(grandTotals.akumulasi_penyusutan)}
                            </div>
                            <div className="aset-stat-sub">Beban penyusutan per {tahun} (PMK 72/2023)</div>
                        </div>

                        <div className="aset-stat-card">
                            <div className="aset-stat-header">
                                <span className="aset-stat-title">Nilai Buku Bersih (NBV)</span>
                                <CheckCircle2 size={16} color="#34d399" />
                            </div>
                            <div className="aset-stat-value" style={{ fontSize: '18px', color: '#34d399' }}>
                                {formatRp(grandTotals.nilai_buku)}
                            </div>
                            <div className="aset-stat-sub">Sisa nilai buku di neraca RS</div>
                        </div>
                    </div>

                    <div className="aset-filter-bar" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Posisi Tahun Pajak:</span>
                            <select
                                className="aset-select"
                                value={tahun}
                                onChange={e => setTahun(Number(e.target.value))}
                            >
                                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <button className="btn-aset btn-aset-primary" onClick={exportRekapExcel}>
                            <Download size={14} /> Download Rekap Excel
                        </button>
                    </div>

                    <div className="aset-table-wrapper">
                        <table className="aset-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '45px' }}>No</th>
                                    <th>Kategori Aset</th>
                                    <th>Jumlah Unit</th>
                                    <th>Total Nilai Perolehan</th>
                                    <th>Akumulasi Penyusutan</th>
                                    <th>Nilai Buku Bersih (NBV)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                            Menghitung rekapitulasi...
                                        </td>
                                    </tr>
                                ) : rekapData.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                            Tidak ada data perolehan aset.
                                        </td>
                                    </tr>
                                ) : (
                                    rekapData.map((row, idx) => (
                                        <tr key={row.kategori}>
                                            <td style={{ color: '#64748b' }}>{idx + 1}</td>
                                            <td style={{ fontWeight: 600, color: '#f8fafc' }}>{row.kategori}</td>
                                            <td>
                                                <span className="badge-unit">{row.count} unit</span>
                                            </td>
                                            <td style={{ fontWeight: 500, color: '#f1f5f9' }}>{formatRp(row.total_harga)}</td>
                                            <td style={{ color: '#fb923c' }}>{formatRp(row.akumulasi_penyusutan)}</td>
                                            <td style={{ fontWeight: 700, color: '#34d399' }}>{formatRp(row.nilai_buku)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {rekapData.length > 0 && (
                                <tfoot>
                                    <tr className="aset-table-total-row">
                                        <td colSpan={2} style={{ textAlign: 'right', padding: '12px 14px' }}>
                                            TOTAL KESELURUHAN:
                                        </td>
                                        <td>
                                            <span className="badge-unit">
                                                {grandTotals.count} unit
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 700 }}>
                                            {formatRp(grandTotals.total_harga)}
                                        </td>
                                        <td style={{ color: '#fb923c', fontWeight: 700 }}>
                                            {formatRp(grandTotals.akumulasi_penyusutan)}
                                        </td>
                                        <td style={{ color: '#34d399', fontWeight: 700 }}>
                                            {formatRp(grandTotals.nilai_buku)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: CETAK KIR RUANGAN */}
            {tab === 'kir' && (
                <div>
                    <div className="aset-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Building2 size={15} color="#818cf8" />
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Pilih Ruangan:</span>
                            </div>
                            <select
                                className="aset-select"
                                value={selectedRuanganId}
                                onChange={e => setSelectedRuanganId(e.target.value)}
                                style={{ minWidth: '260px' }}
                            >
                                {ruanganList.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.nama} [{r.unit_nama}] {r.lantai_gedung ? `• ${r.lantai_gedung}` : ''}
                                    </option>
                                ))}
                            </select>
                            <span style={{
                                fontSize: '12px',
                                color: '#38bdf8',
                                background: 'rgba(56, 189, 248, 0.1)',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(56, 189, 248, 0.2)'
                            }}>
                                <strong>{kirAssets.length}</strong> unit aset terdata
                            </span>
                        </div>
                        <button className="btn-aset btn-aset-primary" onClick={handlePrintKIR} disabled={kirAssets.length === 0}>
                            <Printer size={15} /> Cetak Lembar KIR
                        </button>
                    </div>

                    {/* Lembar KIR Preview */}
                    <div className="kir-paper-wrapper">
                        <div className="kir-sheet" ref={kirPrintRef}>
                            {/* Kop Surat Rumah Sakit */}
                            <div className="kir-header">
                                <img
                                    src="/logo.png"
                                    alt="Logo RS"
                                    className="kir-logo"
                                    onError={e => { e.currentTarget.style.display = 'none'; }}
                                />
                                <div className="kir-header-center">
                                    <div className="kir-inst-title">RUMAH SAKIT SIAGA AL-MUNAWWARAH</div>
                                    <div className="kir-inst-sub">INSTALASI PEMELIHARAAN SARANA &amp; PRASARANA RUMAH SAKIT (IPSRS)</div>
                                    <div className="kir-inst-address">Jl. Ramania No. 3 Samarinda, Kalimantan Timur 75123 &bull; Telp: (0541) 743000</div>
                                </div>
                            </div>
                            <div className="kir-divider-double"></div>

                            {/* Judul Dokumen KIR */}
                            <div className="kir-doc-title-area">
                                <h2 className="kir-title">KARTU INVENTARIS RUANGAN (KIR)</h2>
                                <div className="kir-doc-number">
                                    NOMOR REGISTRASI: <strong>KIR/{selectedRoom?.unit_nama || 'UMUM'}/{selectedRoom?.nama?.replace(/\s+/g, '-').toUpperCase() || 'R'}/{new Date().getFullYear()}</strong>
                                </div>
                            </div>

                            {/* Metadata Ruangan */}
                            <div className="kir-meta-grid">
                                <div className="kir-meta-col">
                                    <div className="kir-meta-row">
                                        <span className="kir-meta-label">Nama Ruangan</span>
                                        <span className="kir-meta-val">: <strong>{selectedRoom?.nama || '-'}</strong></span>
                                    </div>
                                    <div className="kir-meta-row">
                                        <span className="kir-meta-label">Lantai / Gedung</span>
                                        <span className="kir-meta-val">: {selectedRoom?.lantai_gedung || '-'}</span>
                                    </div>
                                </div>
                                <div className="kir-meta-col">
                                    <div className="kir-meta-row">
                                        <span className="kir-meta-label">Unit Penanggung Jawab</span>
                                        <span className="kir-meta-val">: <strong>{selectedRoom?.unit_nama || '-'}</strong></span>
                                    </div>
                                    <div className="kir-meta-row">
                                        <span className="kir-meta-label">Tanggal Cetak</span>
                                        <span className="kir-meta-val">: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tabel Daftar Barang Fisik */}
                            <table className="kir-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '32px' }}>NO</th>
                                        <th style={{ width: '130px' }}>KODE ASET</th>
                                        <th>NAMA BARANG / DESKRIPSI</th>
                                        <th>MERK / SPESIFIKASI</th>
                                        <th style={{ width: '90px' }}>KONDISI</th>
                                        <th>CATATAN / TINDAK LANJUT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {kirAssets.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontStyle: 'italic' }}>
                                                Tidak ada inventaris barang fisik yang terdaftar di ruangan ini.
                                            </td>
                                        </tr>
                                    ) : (
                                        kirAssets.map((item, idx) => (
                                            <tr key={item.id}>
                                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                                                <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.kode_aset}</td>
                                                <td style={{ fontWeight: '600' }}>{item.deskripsi}</td>
                                                <td>{item.merk || '-'} {item.spesifikasi ? `(${item.spesifikasi})` : ''}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`kir-grade-badge grade-${item.status_kelayakan || 'A'}`}>
                                                        Grade {item.status_kelayakan || 'A'}
                                                    </span>
                                                </td>
                                                <td>{item.rekomendasi_tindakan || item.catatan || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>

                            {/* Kolom Tanda Tangan */}
                            <div className="kir-sign-area">
                                <div className="kir-sign-col">
                                    <div>Mengetahui,</div>
                                    <div style={{ fontWeight: 'bold', marginTop: '3px' }}>Kepala Seksi Umum &amp; Sarpras</div>
                                    <div className="kir-sign-space"></div>
                                    <div className="kir-sign-name">( ............................................................ )</div>
                                    <div className="kir-sign-nip">NIP. ....................................................</div>
                                </div>
                                <div className="kir-sign-col">
                                    <div>Samarinda, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                    <div style={{ fontWeight: 'bold', marginTop: '3px' }}>Penanggung Jawab Ruangan</div>
                                    <div className="kir-sign-space"></div>
                                    <div className="kir-sign-name">( ............................................................ )</div>
                                    <div className="kir-sign-nip">NIP. ....................................................</div>
                                </div>
                            </div>

                            {/* Catatan Kaki Dokumen */}
                            <div className="kir-footer-notes">
                                * Catatan: Lembar Kartu Inventaris Ruangan (KIR) ini wajib dipasang pada dinding/pintu ruangan terkait. Apabila terjadi mutasi lokasi barang atau kerusakan fisik, segera laporkan melalui SIMAK Aset.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

