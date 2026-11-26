import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
    Search,
    Plus,
    Download,
    Eye,
    CheckCircle,
    Edit3,
    Trash2,
    QrCode,
    Wrench,
    Lock,
    Unlock,
    Check,
    XCircle,
    X
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
import useBodyScrollLock from './useBodyScrollLock';
import { isAsetManagerUser, isFinancialViewerUser, getUserUnitId } from './asetPermissions';

export default function AsetList() {
    const { user } = useAuth();
    const toast = useToast();
    const location = useLocation();

    const isAsetAdmin = isAsetManagerUser(user);
    const isFinancialViewer = isFinancialViewerUser(user);
    const userUnitId = getUserUnitId(user);

    const [assets, setAssets] = useState([]);
    const [units, setUnits] = useState([]);
    const [ruanganList, setRuanganList] = useState([]);
    const [kategoris, setKategoris] = useState([]);
    const [unitRegOpen, setUnitRegOpen] = useState(false);
    const [togglingReg, setTogglingReg] = useState(false);

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
    const [selectedVerifikasi, setSelectedVerifikasi] = useState(queryParams.get('status_verifikasi') || '');

    // Modals
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [kelayakanTarget, setKelayakanTarget] = useState(null);
    const [perbaikanTarget, setPerbaikanTarget] = useState(null);
    const [detailTargetId, setDetailTargetId] = useState(null);
    const [qrTarget, setQrTarget] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [savingVerif, setSavingVerif] = useState(false);

    useBodyScrollLock(Boolean(rejectTarget), () => setRejectTarget(null));

    useEffect(() => {
        loadFilterOptions();
    }, []);

    useEffect(() => {
        loadAssets();
    }, [page, pageSize, search, selectedUnit, selectedRuangan, selectedKategori, selectedKelayakan, selectedStatusData, selectedVerifikasi]);

    const loadFilterOptions = async () => {
        try {
            const [uRes, rRes, kRes, pRes] = await Promise.all([
                api.get('/users/units/'),
                api.get('/aset/ruangan/'),
                api.get('/aset/kategori/'),
                api.get('/aset/aset/pengaturan/'),
            ]);
            setUnits(uRes.data.results || uRes.data || []);
            setRuanganList(rRes.data.results || rRes.data || []);
            setKategoris(kRes.data.results || kRes.data || []);
            setUnitRegOpen(Boolean(pRes.data?.izinkan_pendaftaran_unit));
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
            if (selectedVerifikasi) params.status_verifikasi = selectedVerifikasi;

            const res = await api.get('/aset/aset/', { params });
            if (res.data && res.data.results) {
                setAssets(res.data.results);
                setTotalCount(res.data.count || 0);
            } else {
                const list = Array.isArray(res.data) ? res.data : [];
                setAssets(list);
                setTotalCount(list.length);
            }
        } catch {
            toast.error('Gagal memuat daftar aset.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleUnitRegistration = async () => {
        setTogglingReg(true);
        try {
            const res = await api.patch('/aset/aset/pengaturan/', {
                izinkan_pendaftaran_unit: !unitRegOpen,
            });
            const nextOpen = Boolean(res.data?.izinkan_pendaftaran_unit);
            setUnitRegOpen(nextOpen);
            toast.success(
                nextOpen
                    ? 'Pendaftaran aset mandiri untuk seluruh unit sekarang DIBUKA.'
                    : 'Pendaftaran aset mandiri oleh unit sekarang DITUTUP.'
            );
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal mengubah pengaturan pendaftaran unit.');
        } finally {
            setTogglingReg(false);
        }
    };

    const handleVerify = async (aset) => {
        if (!window.confirm(`Verifikasi dan setujui aset "${aset.deskripsi}" (${aset.kode_aset}) ke daftar inventaris resmi?`)) return;
        setSavingVerif(true);
        try {
            await api.post(`/aset/aset/${aset.id}/verifikasi/`, {});
            toast.success(`Aset ${aset.kode_aset} berhasil diverifikasi.`);
            loadAssets();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal memverifikasi aset.');
        } finally {
            setSavingVerif(false);
        }
    };

    const handleSubmitReject = async (e) => {
        e.preventDefault();
        if (!rejectTarget) return;
        if (!rejectReason.trim()) {
            toast.error('Mohon isi alasan penolakan / catatan perbaikan untuk unit.');
            return;
        }
        setSavingVerif(true);
        try {
            await api.post(`/aset/aset/${rejectTarget.id}/tolak_verifikasi/`, {
                catatan_verifikasi: rejectReason.trim(),
            });
            toast.success(`Pengajuan ${rejectTarget.kode_aset} dikembalikan ke unit untuk perbaikan data.`);
            setRejectTarget(null);
            setRejectReason('');
            loadAssets();
        } catch (err) {
            toast.error(err.response?.data?.catatan_verifikasi || err.response?.data?.detail || 'Gagal menolak pengajuan aset.');
        } finally {
            setSavingVerif(false);
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
            const params = {
                status_verifikasi: selectedVerifikasi || 'terverifikasi',
            };
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
        } catch {
            toast.error('Gagal mengekspor file Excel.');
        }
    };

    const formatRp = (val) => {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    const getKelayakanTone = (grade) => {
        switch (grade) {
            case 'A': return 'emerald';
            case 'B': return 'sky';
            case 'C': return 'amber';
            case 'D': return 'orange';
            case 'E': return 'rose';
            default: return 'slate';
        }
    };

    const formatKelayakanText = (label) => {
        if (!label) return '-';
        return String(label).replace(/\s+-\s+/, ' • ');
    };

    const filteredRuangan = selectedUnit
        ? ruanganList.filter(r => String(r.unit) === String(selectedUnit))
        : ruanganList;

    return (
        <div className="aset-container">
            {/* Header */}
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>Daftar Inventaris &amp; Aset</h1>
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
                    {isAsetAdmin && (
                        <button
                            type="button"
                            className={`btn-aset ${unitRegOpen ? 'btn-aset-warning-outline' : 'btn-aset-secondary'}`}
                            onClick={handleToggleUnitRegistration}
                            disabled={togglingReg}
                            title={unitRegOpen
                                ? 'Pendaftaran unit sedang dibuka sementara. Klik untuk menutup.'
                                : 'Pendaftaran unit sedang ditutup. Klik untuk membuka pendaftaran sementara bagi seluruh unit.'}
                        >
                            {unitRegOpen ? <Unlock size={14} strokeWidth={1.75} /> : <Lock size={14} strokeWidth={1.75} />}
                            {unitRegOpen ? 'Pendaftaran Unit: Dibuka' : 'Pendaftaran Unit: Ditutup'}
                        </button>
                    )}
                    <button type="button" className="btn-aset btn-aset-secondary" onClick={exportToExcel} title="Export ke Excel">
                        <Download size={14} strokeWidth={1.75} /> Export Excel
                    </button>
                    {(isAsetAdmin || (unitRegOpen && userUnitId)) && (
                        <button type="button" className="btn-aset btn-aset-primary" onClick={() => { setEditData(null); setIsFormOpen(true); }}>
                            <Plus size={14} strokeWidth={1.75} /> Tambah Aset
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

                {/* Filter Status Verifikasi */}
                <select
                    className="aset-select"
                    value={selectedVerifikasi}
                    onChange={e => { setSelectedVerifikasi(e.target.value); setPage(1); }}
                >
                    <option value="">Semua Status Verifikasi</option>
                    <option value="terverifikasi">Terverifikasi</option>
                    <option value="menunggu_verifikasi">Menunggu Verifikasi</option>
                    <option value="ditolak">Ditolak (Perlu Perbaikan)</option>
                </select>

                {(search || selectedUnit || selectedRuangan || selectedKategori || selectedKelayakan || selectedStatusData || selectedVerifikasi) && (
                    <button
                        type="button"
                        className="btn-aset btn-aset-secondary"
                        onClick={() => {
                            setSearch('');
                            setSelectedUnit('');
                            setSelectedRuangan('');
                            setSelectedKategori('');
                            setSelectedKelayakan('');
                            setSelectedStatusData('');
                            setSelectedVerifikasi('');
                            setPage(1);
                        }}
                    >
                        Reset Filter
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="aset-table-borderless">
                <table className="aset-table-stripe">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>No</th>
                            <th>Kode Aset</th>
                            <th>Deskripsi &amp; Spesifikasi</th>
                            <th>Unit Penanggung Jawab</th>
                            <th>Ruangan / Lokasi</th>
                            <th>Kelayakan Fisik</th>
                            {isFinancialViewer && <th>Harga Beli</th>}
                            {isFinancialViewer && <th>Nilai Buku Bersih</th>}
                            <th className="aset-col-aksi">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={isFinancialViewer ? 9 : 7} style={{ textAlign: 'center', padding: '30px' }} className="aset-cell-muted">
                                    Memuat daftar aset...
                                </td>
                            </tr>
                        ) : assets.length === 0 ? (
                            <tr>
                                <td colSpan={isFinancialViewer ? 9 : 7} style={{ textAlign: 'center', padding: '30px' }} className="aset-cell-muted">
                                    Tidak ada data aset yang cocok dengan filter pencarian.
                                </td>
                            </tr>
                        ) : (
                            assets.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="aset-num-cell aset-cell-muted" style={{ fontSize: '12px' }}>
                                        {(page - 1) * pageSize + index + 1}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span className="aset-code-mono">
                                                {item.kode_aset}
                                            </span>
                                            {item.status_verifikasi === 'terverifikasi' && (
                                                <button
                                                    type="button"
                                                    className="aset-icon-action"
                                                    onClick={() => setQrTarget(item)}
                                                    title="Lihat & Cetak QR"
                                                    aria-label="Lihat dan cetak QR"
                                                >
                                                    <QrCode size={13} />
                                                </button>
                                            )}
                                        </div>
                                        {item.status_verifikasi === 'menunggu_verifikasi' && (
                                            <span className="aset-status-warn-text is-pending">
                                                Menunggu Verifikasi
                                            </span>
                                        )}
                                        {item.status_verifikasi === 'ditolak' && (
                                            <span
                                                className="aset-status-warn-text is-rejected"
                                                title={item.catatan_verifikasi || 'Ditolak oleh Admin Aset'}
                                            >
                                                Ditolak &bull; Perlu Revisi
                                            </span>
                                        )}
                                        {item.status_data === 'belum_lengkap' && (
                                            <span className="aset-status-warn-text">
                                                Belum Lengkap
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="aset-cell-title">{item.deskripsi}</div>
                                        <div className="aset-cell-sub">
                                            <span>{item.merk ? `Merek: ${item.merk}` : 'Tanpa Merek'} {item.spesifikasi ? `(${item.spesifikasi})` : ''}</span>
                                            {item.nomor_registrasi && (
                                                <span> &bull; Reg: {item.nomor_registrasi}</span>
                                            )}
                                            {item.perlu_kalibrasi && (
                                                <span> &bull; Wajib Kalibrasi</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="aset-cell-title" style={{ fontWeight: 500 }}>{item.unit_nama || '—'}</span>
                                    </td>
                                    <td className="aset-cell-muted">
                                        {item.lokasi_teks || item.ruangan_nama || '—'}
                                    </td>
                                    <td>
                                        <span className={`aset-status-text ${getKelayakanTone(item.status_kelayakan)}`}>
                                            <span className="aset-status-dot" />
                                            {formatKelayakanText(item.status_kelayakan_label)}
                                        </span>
                                    </td>
                                    {isFinancialViewer && (
                                        <td>
                                            <div className="aset-num-cell" style={{ fontWeight: 500 }}>
                                                {formatRp(item.harga_perolehan)}
                                            </div>
                                            <div className="aset-cell-sub">
                                                {item.bulan_perolehan ? item.bulan_perolehan.slice(0, 7) : '—'}
                                            </div>
                                        </td>
                                    )}
                                    {isFinancialViewer && (
                                        <td>
                                            {item.penyusutan?.is_calculable ? (
                                                <span className="aset-num-cell is-success">
                                                    {formatRp(item.penyusutan.nilai_buku)}
                                                </span>
                                            ) : (
                                                <span className="aset-cell-muted">—</span>
                                            )}
                                        </td>
                                    )}
                                    <td className="aset-col-aksi">
                                        <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                                            {/* Update Kelayakan & Lapor Perbaikan hanya untuk aset terverifikasi */}
                                            {item.status_verifikasi === 'terverifikasi' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="aset-icon-action is-success"
                                                        onClick={() => setKelayakanTarget(item)}
                                                        title="Update Kondisi / Kelayakan"
                                                        aria-label="Update Kondisi"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="aset-icon-action is-warning"
                                                        onClick={() => setPerbaikanTarget(item)}
                                                        title="Lapor Kerusakan / Permintaan Perbaikan"
                                                        aria-label="Lapor Kerusakan"
                                                    >
                                                        <Wrench size={14} />
                                                    </button>
                                                </>
                                            )}

                                            {/* Verifikasi / Tolak oleh Admin Aset (Mas Febry / Pak Edy / Bu Nevi) */}
                                            {isAsetAdmin && item.status_verifikasi !== 'terverifikasi' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="aset-icon-action is-success"
                                                        onClick={() => handleVerify(item)}
                                                        disabled={savingVerif}
                                                        title="Verifikasi & Setujui Aset"
                                                        aria-label="Verifikasi Aset"
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    {item.status_verifikasi === 'menunggu_verifikasi' && (
                                                        <button
                                                            type="button"
                                                            className="aset-icon-action is-danger"
                                                            onClick={() => { setRejectTarget(item); setRejectReason(''); }}
                                                            disabled={savingVerif}
                                                            title="Tolak / Kembalikan ke Unit untuk Revisi"
                                                            aria-label="Tolak Pengajuan"
                                                        >
                                                            <XCircle size={14} />
                                                        </button>
                                                    )}
                                                </>
                                            )}

                                            {/* Detail Inspector */}
                                            <button
                                                type="button"
                                                className="aset-icon-action"
                                                onClick={() => setDetailTargetId(item.id)}
                                                title="Lihat Detail & Riwayat"
                                                aria-label="Lihat Detail"
                                            >
                                                <Eye size={14} />
                                            </button>

                                            {/* Edit: Admin selalu boleh; Unit pengaju boleh selama masih menunggu_verifikasi / ditolak */}
                                            {(isAsetAdmin || (Number(item.unit) === Number(userUnitId) && ['menunggu_verifikasi', 'ditolak'].includes(item.status_verifikasi))) && (
                                                <button
                                                    type="button"
                                                    className="aset-icon-action is-info"
                                                    onClick={() => { setEditData(item); setIsFormOpen(true); }}
                                                    title="Edit Aset"
                                                    aria-label="Edit Aset"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            )}

                                            {/* Hapus: Hanya Admin Aset */}
                                            {isAsetAdmin && (
                                                <button
                                                    type="button"
                                                    className="aset-icon-action is-danger"
                                                    onClick={() => handleDelete(item)}
                                                    title="Hapus Aset"
                                                    aria-label="Hapus Aset"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
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
                <SimplePagination
                    className="aset-pagination"
                    page={page}
                    pageSize={pageSize}
                    total={totalCount}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
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

            {/* Modal Tolak Pengajuan Pendaftaran Unit */}
            {rejectTarget && createPortal(
                <div className="aset-modal-overlay" onClick={() => setRejectTarget(null)}>
                    <div className="aset-modal-content" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <h3>Kembalikan Pengajuan: {rejectTarget.kode_aset}</h3>
                            <button type="button" className="aset-modal-close" onClick={() => setRejectTarget(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitReject}>
                            <div className="aset-modal-body">
                                <p style={{ fontSize: '13px', color: 'var(--gdg-muted)', marginTop: 0 }}>
                                    Tuliskan catatan perbaikan agar unit <strong>{rejectTarget.unit_nama}</strong> dapat memperbarui pengajuan <strong>{rejectTarget.deskripsi}</strong>.
                                </p>
                                <div className="aset-form-group" style={{ marginBottom: 0 }}>
                                    <label className="aset-form-label">Alasan Penolakan / Catatan Perbaikan *</label>
                                    <textarea
                                        className="aset-form-input"
                                        rows={3}
                                        placeholder="Contoh: Mohon lengkapi merek atau perbaiki penamaan ruangan..."
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="aset-modal-footer">
                                <button type="button" className="btn-aset btn-aset-secondary" onClick={() => setRejectTarget(null)} disabled={savingVerif}>
                                    Batal
                                </button>
                                <button type="submit" className="btn-aset btn-aset-danger" disabled={savingVerif}>
                                    {savingVerif ? 'Menyimpan...' : 'Tolak & Minta Revisi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
