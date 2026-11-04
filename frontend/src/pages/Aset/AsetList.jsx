import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Package,
    Search,
    Plus,
    Filter,
    Download,
    Eye,
    CheckCircle,
    Edit3,
    Trash2,
    QrCode,
    RefreshCw,
    Building2,
    SlidersHorizontal,
    Wrench
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination';
import './Aset.css';
import AsetFormModal from './AsetFormModal';
import UpdateKelayakanModal from './UpdateKelayakanModal';
import AsetDetailModal from './AsetDetailModal';
import QrLabelModal from './QrLabelModal';
import LaporPerbaikanModal from './LaporPerbaikanModal';

export default function AsetList() {
    const { user } = useAuth();
    const toast = useToast();
    const location = useLocation();

    const isAsetAdmin = Boolean(
        user?.is_superuser ||
        user?.is_aset_admin ||
        ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role) ||
        (user?.role === 'kepala_seksi' && user?.unit_nama?.toLowerCase().includes('umum'))
    );

    const isFinancialViewer = Boolean(isAsetAdmin || user?.is_akuntansi);

    const [assets, setAssets] = useState([]);
    const [units, setUnits] = useState([]);
    const [ruanganList, setRuanganList] = useState([]);
    const [kategoris, setKategoris] = useState([]);

    const [loading, setLoading] = useState(true);

    // Pagination State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    // Filters from query params or default
    const queryParams = new URLSearchParams(location.search);
    const [search, setSearch] = useState(queryParams.get('q') || '');
    const [selectedUnit, setSelectedUnit] = useState(queryParams.get('unit_id') || '');
    const [selectedRuangan, setSelectedRuangan] = useState(queryParams.get('ruangan_id') || '');
    const [selectedKategori, setSelectedKategori] = useState(queryParams.get('kategori_kode') || '');
    const [selectedKelayakan, setSelectedKelayakan] = useState(queryParams.get('status_kelayakan') || '');
    const [selectedStatusData, setSelectedStatusData] = useState(queryParams.get('status_data') || '');

    // Modals
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [kelayakanTarget, setKelayakanTarget] = useState(null);
    const [perbaikanTarget, setPerbaikanTarget] = useState(null);
    const [detailTargetId, setDetailTargetId] = useState(null);
    const [qrTarget, setQrTarget] = useState(null);

    useEffect(() => {
        loadFilterOptions();
    }, []);

    useEffect(() => {
        loadAssets();
    }, [page, pageSize, search, selectedUnit, selectedRuangan, selectedKategori, selectedKelayakan, selectedStatusData]);

    const loadFilterOptions = async () => {
        try {
            const [uRes, rRes, kRes] = await Promise.all([
                api.get('/users/units/'),
                api.get('/aset/ruangan/'),
                api.get('/aset/kategori/'),
            ]);
            setUnits(uRes.data.results || uRes.data || []);
            setRuanganList(rRes.data.results || rRes.data || []);
            setKategoris(kRes.data.results || kRes.data || []);
        } catch (err) {
            console.error('Failed to load filter options', err);
        }
    };

    const loadAssets = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
            };
            if (search) params.q = search;
            if (selectedUnit) params.unit_id = selectedUnit;
            if (selectedRuangan) params.ruangan_id = selectedRuangan;
            if (selectedKategori) params.kategori_kode = selectedKategori;
            if (selectedKelayakan) params.status_kelayakan = selectedKelayakan;
            if (selectedStatusData) params.status_data = selectedStatusData;

            const res = await api.get('/aset/aset/', { params });
            if (res.data && res.data.results) {
                setAssets(res.data.results);
                setTotalCount(res.data.count || 0);
            } else {
                const list = Array.isArray(res.data) ? res.data : [];
                setAssets(list);
                setTotalCount(list.length);
            }
        } catch (err) {
            toast.error('Gagal memuat daftar aset.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (aset) => {
        if (!window.confirm(`Hapus data aset ${aset.kode_aset} (${aset.deskripsi})?`)) return;
        try {
            await api.delete(`/aset/aset/${aset.id}/`);
            toast.success(`Aset ${aset.kode_aset} berhasil dihapus.`);
            loadAssets();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal menghapus aset.');
        }
    };

    const exportToExcel = async () => {
        try {
            toast.info('Menyiapkan seluruh data inventaris untuk diekspor...');
            const params = {};
            if (search) params.q = search;
            if (selectedUnit) params.unit_id = selectedUnit;
            if (selectedRuangan) params.ruangan_id = selectedRuangan;
            if (selectedKategori) params.kategori_kode = selectedKategori;
            if (selectedKelayakan) params.status_kelayakan = selectedKelayakan;
            if (selectedStatusData) params.status_data = selectedStatusData;

            const res = await api.get('/aset/aset/', { params });
            const allItems = res.data.results || (Array.isArray(res.data) ? res.data : []);

            if (!allItems.length) {
                toast.warning('Tidak ada data aset untuk diekspor.');
                return;
            }

            const exportData = allItems.map((a, idx) => {
                const row = {
                    'No': idx + 1,
                    'Kode Aset': a.kode_aset,
                    'Deskripsi Aset': a.deskripsi,
                    'Merk': a.merk || '-',
                    'Spesifikasi': a.spesifikasi || '-',
                    'Unit Penanggung Jawab': a.unit_nama,
                    'Ruangan / Lokasi': a.lokasi_teks || a.ruangan_nama || '-',
                    'Status Kelayakan': a.status_kelayakan_label,
                    'Status Aset': a.status_aset_label,
                    'Status Data': a.status_data_label,
                    'Rekomendasi Tindakan': a.rekomendasi_tindakan || '-',
                };
                if (isFinancialViewer) {
                    row['Harga Perolehan (Rp)'] = a.harga_perolehan || 0;
                    row['Bulan Perolehan'] = a.bulan_perolehan || '-';
                    row['Kelompok Pajak'] = a.kelompok_nama || '-';
                    row['Akumulasi Penyusutan (Rp)'] = a.penyusutan?.akumulasi_penyusutan || 0;
                    row['Nilai Buku Bersih (Rp)'] = a.penyusutan?.nilai_buku || 0;
                }
                return row;
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Daftar Aset');
            XLSX.writeFile(wb, `Daftar_Aset_RSSAMS_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('File Excel berhasil diunduh.');
        } catch (err) {
            toast.error('Gagal mengekspor file Excel.');
        }
    };

    const formatRp = (val) => {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    const filteredRuangan = selectedUnit
        ? ruanganList.filter(r => String(r.unit) === String(selectedUnit))
        : ruanganList;

    return (
        <div className="aset-container">
            {/* Header */}
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <Package size={22} color="#818cf8" />
                        Daftar Inventaris & Aset
                    </h1>
                    <p className="aset-subtitle">
                        {!isAsetAdmin && user?.unit_nama ? (
                            <>Menampilkan inventaris khusus unit <strong>{user.unit_nama}</strong></>
                        ) : (
                            <>Seluruh register inventaris aktif RS SIAGA AL-MUNAWWARAH</>
                        )}
                        {' '}&bull; {totalCount} total aset terdaftar
                    </p>
                </div>
                <div className="aset-actions">
                    <button className="btn-aset btn-aset-secondary" onClick={exportToExcel} title="Export ke Excel">
                        <Download size={14} /> Export Excel
                    </button>
                    {isAsetAdmin && (
                        <button className="btn-aset btn-aset-primary" onClick={() => { setEditData(null); setIsFormOpen(true); }}>
                            <Plus size={14} /> Tambah Aset
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="aset-filter-bar">
                {/* Search */}
                <div className="aset-search-input-wrapper">
                    <Search size={14} className="aset-search-icon" />
                    <input
                        type="text"
                        className="aset-search-input"
                        placeholder="Cari kode aset, nama, merk, spek, ruangan..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>

                {/* Filter Unit (hanya untuk admin) */}
                {isAsetAdmin && (
                    <select
                        className="aset-select"
                        value={selectedUnit}
                        onChange={e => { setSelectedUnit(e.target.value); setSelectedRuangan(''); setPage(1); }}
                    >
                        <option value="">Semua Unit</option>
                        {units.map(u => (
                            <option key={u.id} value={u.id}>{u.nama}</option>
                        ))}
                    </select>
                )}

                {/* Filter Ruangan */}
                <select
                    className="aset-select"
                    value={selectedRuangan}
                    onChange={e => { setSelectedRuangan(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Ruangan</option>
                    {filteredRuangan.map(r => (
                        <option key={r.id} value={r.id}>{r.nama}</option>
                    ))}
                </select>

                {/* Filter Kategori */}
                <select
                    className="aset-select"
                    value={selectedKategori}
                    onChange={e => { setSelectedKategori(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Kategori</option>
                    {kategoris.map(k => (
                        <option key={k.id} value={k.kode}>{k.nama}</option>
                    ))}
                </select>

                {/* Filter Kelayakan */}
                <select
                    className="aset-select"
                    value={selectedKelayakan}
                    onChange={e => { setSelectedKelayakan(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Kelayakan</option>
                    <option value="A">Sangat Layak (A)</option>
                    <option value="B">Layak (B)</option>
                    <option value="C">Cukup Layak (C)</option>
                    <option value="D">Kurang Layak (D)</option>
                    <option value="E">Tidak Layak (E)</option>
                </select>

                {/* Filter Status Data */}
                {isFinancialViewer && (
                    <select
                        className="aset-select"
                        value={selectedStatusData}
                        onChange={e => { setSelectedStatusData(e.target.value); setPage(1); }}
                    >
                        <option value="">Semua Status Data</option>
                        <option value="lengkap">Data Lengkap</option>
                        <option value="belum_lengkap">Belum Lengkap</option>
                    </select>
                )}

                {(search || selectedUnit || selectedRuangan || selectedKategori || selectedKelayakan || selectedStatusData) && (
                    <button
                        className="btn-aset btn-aset-secondary"
                        style={{ padding: '6px 8px', fontSize: '11px' }}
                        onClick={() => {
                            setSearch('');
                            setSelectedUnit('');
                            setSelectedRuangan('');
                            setSelectedKategori('');
                            setSelectedKelayakan('');
                            setSelectedStatusData('');
                            setPage(1);
                        }}
                    >
                        Reset Filter
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="aset-table-wrapper">
                <table className="aset-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>No</th>
                            <th>Kode Aset</th>
                            <th>Deskripsi & Spesifikasi</th>
                            <th>Unit Penanggung Jawab</th>
                            <th>Ruangan / Lokasi</th>
                            <th>Kelayakan Fisik</th>
                            {isFinancialViewer && <th>Harga Beli</th>}
                            {isFinancialViewer && <th>Nilai Buku Bersih</th>}
                            <th style={{ textAlign: 'center' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={isFinancialViewer ? 9 : 7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Memuat daftar aset...
                                </td>
                            </tr>
                        ) : assets.length === 0 ? (
                            <tr>
                                <td colSpan={isFinancialViewer ? 9 : 7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Tidak ada data aset yang cocok dengan filter pencarian.
                                </td>
                            </tr>
                        ) : (
                            assets.map((item, index) => (
                                <tr key={item.id}>
                                    <td style={{ color: '#64748b', fontSize: '11px' }}>
                                        {(page - 1) * pageSize + index + 1}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontWeight: 700, color: '#818cf8', letterSpacing: '0.02em' }}>
                                                {item.kode_aset}
                                            </span>
                                            <button
                                                className="aset-modal-close"
                                                style={{ padding: '2px' }}
                                                onClick={() => setQrTarget(item)}
                                                title="Lihat & Cetak QR"
                                            >
                                                <QrCode size={12} color="#94a3b8" />
                                            </button>
                                        </div>
                                        {item.status_data === 'belum_lengkap' && (
                                            <span className="badge-belum-lengkap" style={{ display: 'inline-block', marginTop: '2px' }}>
                                                Belum Lengkap
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.deskripsi}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                            <span>{item.merk ? `Merek: ${item.merk}` : 'Tanpa Merek'} {item.spesifikasi ? `(${item.spesifikasi})` : ''}</span>
                                            {item.nomor_registrasi && (
                                                <span className="badge-prefix" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                                    Reg: {item.nomor_registrasi}
                                                </span>
                                            )}
                                            {item.perlu_kalibrasi && (
                                                <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                                    ⚡ Wajib Kalibrasi
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge-unit">{item.unit_nama}</span>
                                    </td>
                                    <td>
                                        <div style={{ color: '#cbd5e1' }}>
                                            {item.lokasi_teks || item.ruangan_nama || '-'}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge-kelayakan badge-kelayakan-${item.status_kelayakan}`}>
                                            {item.status_kelayakan_label}
                                        </span>
                                    </td>
                                    {isFinancialViewer && (
                                        <td>
                                            <div style={{ fontWeight: 500, color: '#f1f5f9' }}>
                                                {formatRp(item.harga_perolehan)}
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                                {item.bulan_perolehan ? item.bulan_perolehan.slice(0, 7) : '-'}
                                            </div>
                                        </td>
                                    )}
                                    {isFinancialViewer && (
                                        <td>
                                            {item.penyusutan?.is_calculable ? (
                                                <div style={{ fontWeight: 600, color: '#34d399' }}>
                                                    {formatRp(item.penyusutan.nilai_buku)}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#64748b', fontSize: '11px' }}>-</span>
                                            )}
                                        </td>
                                    )}
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                                            {/* Update Kelayakan (untuk User Unit & Admin) */}
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                onClick={() => setKelayakanTarget(item)}
                                                title="Update Kondisi / Kelayakan"
                                            >
                                                <CheckCircle size={14} color="#34d399" />
                                            </button>

                                            {/* Lapor Perbaikan Kerusakan */}
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center', borderColor: 'rgba(245, 158, 11, 0.35)' }}
                                                onClick={() => setPerbaikanTarget(item)}
                                                title="Lapor Kerusakan / Permintaan Perbaikan"
                                            >
                                                <Wrench size={14} color="#f59e0b" />
                                            </button>

                                            {/* Detail Inspector */}
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                onClick={() => setDetailTargetId(item.id)}
                                                title="Lihat Detail & Riwayat"
                                            >
                                                <Eye size={14} color="#94a3b8" />
                                            </button>

                                            {/* Admin Actions */}
                                            {isAsetAdmin && (
                                                <>
                                                    <button
                                                        className="btn-aset btn-aset-secondary"
                                                        style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                        onClick={() => { setEditData(item); setIsFormOpen(true); }}
                                                        title="Edit Aset"
                                                    >
                                                        <Edit3 size={14} color="#38bdf8" />
                                                    </button>
                                                    <button
                                                        className="btn-aset btn-aset-secondary"
                                                        style={{ padding: '5px 7px', minWidth: '28px', height: '28px', justifyContent: 'center' }}
                                                        onClick={() => handleDelete(item)}
                                                        title="Hapus Aset"
                                                    >
                                                        <Trash2 size={14} color="#f87171" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
                <div style={{ marginTop: '14px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalCount}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            )}

            {/* Modal Update Kelayakan */}
            <UpdateKelayakanModal
                aset={kelayakanTarget}
                isOpen={Boolean(kelayakanTarget)}
                onClose={() => setKelayakanTarget(null)}
                onSuccess={() => loadAssets()}
            />

            {/* Modal Lapor Perbaikan */}
            <LaporPerbaikanModal
                aset={perbaikanTarget}
                isOpen={Boolean(perbaikanTarget)}
                onClose={() => setPerbaikanTarget(null)}
                onSuccess={() => loadAssets()}
            />

            {/* Modal Detail Inspector */}
            <AsetDetailModal
                asetId={detailTargetId}
                isOpen={Boolean(detailTargetId)}
                onClose={() => setDetailTargetId(null)}
                isFinancialViewer={isFinancialViewer}
                onOpenQr={(a) => setQrTarget(a)}
            />

            {/* Modal Cetak QR */}
            <QrLabelModal
                aset={qrTarget}
                isOpen={Boolean(qrTarget)}
                onClose={() => setQrTarget(null)}
            />

            {/* Modal Form Tambah/Edit */}
            <AsetFormModal
                isOpen={isFormOpen}
                initialData={editData}
                onClose={() => { setIsFormOpen(false); setEditData(null); }}
                onSuccess={() => loadAssets()}
            />
        </div>
    );
}
