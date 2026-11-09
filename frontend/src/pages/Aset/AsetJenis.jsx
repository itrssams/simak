import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Plus, Search, Edit2, Trash2, X, Save, Sparkles, Check, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination';
import useBodyScrollLock from './useBodyScrollLock';
import './Aset.css';

// Kamus Standar Alkes & Inventaris Rumah Sakit untuk Auto-Suggestion & Mencegah Typo
const STANDARD_HOSPITAL_EQUIPMENT = [
    { nama: 'Termometer Digital', kode: 'TERMO', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Termometer Inframerah (Thermal Gun)', kode: 'TERMO', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Tensimeter Digital', kode: 'TENSI', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Tensimeter Aneroid (Jarum)', kode: 'TENSI', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Stetoskop Medis', kode: 'STETO', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Patient Monitor', kode: 'MONIT', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Pulse Oximeter', kode: 'OXIM', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Suction Pump Medis', kode: 'SUCT', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Infusion Pump', kode: 'INFUS', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Syringe Pump', kode: 'SYRINGE', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Nebulizer Kompresor', kode: 'NEBU', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Defibrillator / AED', kode: 'DEFIB', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Elektrokardiograf (ECG / EKG)', kode: 'ECG', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'USG Color Doppler', kode: 'USG', kategoriKode: 'AM', kelompokKode: 'K3' },
    { nama: 'Autoclave Sterilisator', kode: 'AUTO', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Centrifuge Laboratorium', kode: 'CENTRI', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Mikroskop Laboratorium Binokuler', kode: 'MIKRO', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Lampu Operasi LED', kode: 'LAMP-OP', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Meja Operasi (Operating Table)', kode: 'MEJA-OP', kategoriKode: 'AM', kelompokKode: 'K3' },
    { nama: 'Tabung Oksigen & Regulator', kode: 'O2', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Bed Pasien Electric (3 Crank)', kode: 'BED', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Bed Pasien Manual (2 Crank)', kode: 'BED', kategoriKode: 'FU', kelompokKode: 'K2' },
    { nama: 'Bed Ginekologi / Obgyn', kode: 'BED-OB', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Kursi Roda Standar', kode: 'RODA', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Brankar Pasien (Stretcher)', kode: 'BRANK', kategoriKode: 'AM', kelompokKode: 'K2' },
    { nama: 'Timbangan Bayi Digital', kode: 'TIMB-B', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Timbangan Pasien Dewasa + Pengukur TB', kode: 'TIMB-D', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Doppler Janin Portabel', kode: 'DOPPLER', kategoriKode: 'AM', kelompokKode: 'K1' },
    { nama: 'Sphygnomanometer Stand', kode: 'TENSI', kategoriKode: 'AM', kelompokKode: 'K2' },

    // Non-Medis & Penunjang
    { nama: 'AC Split 1 PK', kode: 'AC', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'AC Split 2 PK', kode: 'AC', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'AC Cassette 4 PK', kode: 'AC-CAS', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'Kulkas Vaksin / Medis', kode: 'KLK-MED', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'Kulkas Dua Pintu Non Medis', kode: 'KLK', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'Dispenser Air Panas & Dingin', kode: 'DISP', kategoriKode: 'PE', kelompokKode: 'K1' },
    { nama: 'Televisi LED 32 Inch', kode: 'TV', kategoriKode: 'PE', kelompokKode: 'K1' },
    { nama: 'Televisi LED 43 Inch', kode: 'TV', kategoriKode: 'PE', kelompokKode: 'K1' },
    { nama: 'Mesin Cuci Laundry Rumah Sakit', kode: 'MC', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'Pengering Pakaian Laundry', kode: 'DRY', kategoriKode: 'PE', kelompokKode: 'K2' },
    { nama: 'Water Heater Kamar Mandi Pasien', kode: 'WH', kategoriKode: 'PE', kelompokKode: 'K1' },
    { nama: 'Komputer PC All-in-One', kode: 'PC', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'Printer Laser Multifungsi', kode: 'PRINT', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'Printer Label / Barcode Pasien', kode: 'PRINT-LBL', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'Server Komputer Rackmount', kode: 'SRV', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'UPS Online 1000VA - 3000VA', kode: 'UPS', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'Switch Hub Jaringan Gigabit', kode: 'NET-SW', kategoriKode: 'IT', kelompokKode: 'K1' },
    { nama: 'Lemari Obat Kaca 2 Pintu', kode: 'LEMARI-OB', kategoriKode: 'FU', kelompokKode: 'K1' },
    { nama: 'Meja Dokter & Kursi Kerja', kode: 'MEJA-DKT', kategoriKode: 'FU', kelompokKode: 'K1' },
    { nama: 'Kursi Tunggu Pasien 4 Dudukan', kode: 'KURSI-TNG', kategoriKode: 'FU', kelompokKode: 'K1' },
    { nama: 'Ambulans Transport Pasien', kode: 'AMB', kategoriKode: 'KD', kelompokKode: 'K2' },
    { nama: 'Genset Standby 100 kVA', kode: 'GEN', kategoriKode: 'PE', kelompokKode: 'K3' },
];

export default function AsetJenis() {
    const toast = useToast();
    const [jenisList, setJenisList] = useState([]);
    const [kategoriList, setKategoriList] = useState([]);
    const [kelompokList, setKelompokList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filterKategori, setFilterKategori] = useState('');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [modalData, setModalData] = useState({
        nama: '',
        kode: '',
        kategori: '',
        kelompok_default: '',
        sort_order: 0,
    });
    const [saving, setSaving] = useState(false);

    // Modal Konfirmasi Hapus state
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Kunci scroll halaman belakang saat modal terbuka
    useBodyScrollLock(isModalOpen || Boolean(deleteTarget), () => {
        if (!saving && !deleting) {
            setIsModalOpen(false);
            setDeleteTarget(null);
        }
    });

    // Suggestion state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionSource, setSuggestionSource] = useState('local');
    const [loadingSuggest, setLoadingSuggest] = useState(false);
    const suggestionRef = useRef(null);
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        loadData();
    }, []);

    // Close suggestion dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (suggestionRef.current && !suggestionRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [jRes, kRes, klRes] = await Promise.all([
                api.get('/aset/jenis/'),
                api.get('/aset/kategori/'),
                api.get('/aset/kelompok/'),
            ]);
            setJenisList(jRes.data.results || jRes.data || []);
            setKategoriList(kRes.data.results || kRes.data || []);
            setKelompokList(klRes.data.results || klRes.data || []);
        } catch (err) {
            toast.error('Gagal memuat master jenis aset.');
        } finally {
            setLoading(false);
        }
    };

    // Filter daftar jenis aset
    const filteredList = useMemo(() => {
        return jenisList.filter(item => {
            const matchQ = !search ||
                item.nama.toLowerCase().includes(search.toLowerCase()) ||
                item.kode.toLowerCase().includes(search.toLowerCase()) ||
                (item.kategori_nama && item.kategori_nama.toLowerCase().includes(search.toLowerCase()));
            const matchKat = !filterKategori || String(item.kategori) === String(filterKategori);
            return matchQ && matchKat;
        });
    }, [jenisList, search, filterKategori]);

    // Data halaman aktif
    const paginatedList = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredList.slice(start, start + pageSize);
    }, [filteredList, page, pageSize]);

    // Handle input nama jenis aset (tanpa auto-hit API saat mengetik)
    const handleNamaChange = (val) => {
        setModalData(prev => ({ ...prev, nama: val }));
        if (!val.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Tombol Hit API Bantuan AI Rekomendasi Alkes / Jenis Aset
    const handleTriggerAiSuggest = async () => {
        const trimmed = (modalData.nama || '').trim();
        if (trimmed.length < 2) {
            toast.error('Ketik minimal 2 karakter nama barang terlebih dahulu untuk meminta rekomendasi AI.');
            return;
        }

        setLoadingSuggest(true);
        try {
            const res = await api.get('/aset/jenis/suggest/', { params: { q: trimmed } });
            const results = res.data?.results || [];
            if (results.length === 0) {
                // Fallback to local dictionary
                const matches = STANDARD_HOSPITAL_EQUIPMENT.filter(eq =>
                    eq.nama.toLowerCase().includes(trimmed.toLowerCase())
                );
                setSuggestions(matches);
                setSuggestionSource('local_dictionary');
                setShowSuggestions(matches.length > 0);
                if (matches.length === 0) {
                    toast.info('Tidak ditemukan rekomendasi alkes yang cocok.');
                }
            } else {
                setSuggestions(results);
                setSuggestionSource(res.data?.source || 'gemini_ai');
                setShowSuggestions(true);
            }
        } catch (err) {
            const matches = STANDARD_HOSPITAL_EQUIPMENT.filter(eq =>
                eq.nama.toLowerCase().includes(trimmed.toLowerCase())
            );
            setSuggestions(matches);
            setSuggestionSource('local_dictionary');
            setShowSuggestions(matches.length > 0);
        } finally {
            setLoadingSuggest(false);
        }
    };

    // Pilih item suggestion dari kamus alkes RS
    const handleSelectSuggestion = (item) => {
        const katKode = item.kategori_kode || item.kategoriKode;
        const kelKode = item.kelompok_kode || item.kelompokKode;

        // Cari id kategori yang cocok
        const matchedKat = kategoriList.find(k => k.kode === katKode);
        // Cari id kelas aset yang cocok
        const matchedKel = kelompokList.find(kl => kl.kode === kelKode);

        setModalData(prev => ({
            ...prev,
            nama: item.nama,
            kode: prev.kode || item.kode,
            kategori: matchedKat ? matchedKat.id : prev.kategori,
            kelompok_default: matchedKel ? matchedKel.id : prev.kelompok_default,
        }));
        setShowSuggestions(false);
    };

    const handleOpenAdd = () => {
        setEditItem(null);
        setModalData({
            nama: '',
            kode: '',
            kategori: kategoriList[0]?.id || '',
            kelompok_default: kelompokList[0]?.id || '',
            sort_order: 0,
        });
        setShowSuggestions(false);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (item) => {
        setEditItem(item);
        setModalData({
            nama: item.nama,
            kode: item.kode,
            kategori: item.kategori,
            kelompok_default: item.kelompok_default || '',
            sort_order: item.sort_order || 0,
        });
        setShowSuggestions(false);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editItem) {
                await api.patch(`/aset/jenis/${editItem.id}/`, modalData);
                toast.success(`Jenis barang ${modalData.nama} berhasil diperbarui.`);
            } else {
                await api.post('/aset/jenis/', modalData);
                toast.success(`Jenis barang ${modalData.nama} berhasil ditambahkan.`);
            }
            setIsModalOpen(false);
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.nama?.[0] || 'Gagal menyimpan jenis aset.');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/aset/jenis/${deleteTarget.id}/`);
            toast.success(`Jenis aset "${deleteTarget.nama}" berhasil dihapus.`);
            setDeleteTarget(null);
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal menghapus jenis aset (kemungkinan masih memiliki relasi data).');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="aset-container">
            {/* Header */}
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <Layers size={22} color="#818cf8" />
                        Master Jenis Aset &amp; Kelas Pajak
                    </h1>
                    <p className="aset-subtitle">
                        Kelola katalog jenis barang inventaris RS Siaga Al Munawwarah &bull; Menentukan otomatis kategori dan kelas aset penyusutan (PMK 72/2023) saat pendaftaran aset baru.
                    </p>
                </div>
                <div className="aset-actions">
                    <button className="btn-aset btn-aset-primary" onClick={handleOpenAdd}>
                        <Plus size={15} /> Tambah Jenis Barang
                    </button>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="aset-filter-bar">
                <div className="aset-search-input-wrapper">
                    <Search size={14} className="aset-search-icon" />
                    <input
                        type="text"
                        className="aset-search-input"
                        placeholder="Cari nama jenis barang atau kode awalan (misal: AC, Bed, Termometer)..."
                        value={search}
                        onChange={e => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <select
                    className="aset-select"
                    value={filterKategori}
                    onChange={e => {
                        setFilterKategori(e.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">Semua Kategori</option>
                    {kategoriList.map(k => (
                        <option key={k.id} value={k.id}>{k.nama} ({k.kode})</option>
                    ))}
                </select>
            </div>

            {/* Tabel Data Master Jenis */}
            <div className="aset-table-wrapper">
                <table className="aset-table">
                    <thead>
                        <tr>
                            <th style={{ width: '45px' }}>No</th>
                            <th style={{ width: '130px' }}>Kode Prefix</th>
                            <th>Nama Jenis Barang</th>
                            <th>Kategori Aset</th>
                            <th>Kelas Aset (PMK 72/2023)</th>
                            <th style={{ textAlign: 'center', width: '140px' }}>Masa Manfaat</th>
                            <th style={{ textAlign: 'center', width: '90px' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Memuat daftar master jenis aset...
                                </td>
                            </tr>
                        ) : filteredList.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '35px', color: '#94a3b8' }}>
                                    Tidak ada master jenis barang yang cocok dengan pencarian.
                                </td>
                            </tr>
                        ) : (
                            paginatedList.map((item, idx) => (
                                <tr key={item.id}>
                                    <td style={{ color: '#64748b', fontSize: '11px' }}>
                                        {(page - 1) * pageSize + idx + 1}
                                    </td>
                                    <td>
                                        <span className="badge-prefix">
                                            {item.kode}
                                        </span>
                                    </td>
                                    <td className="aset-text-main">
                                        {item.nama}
                                    </td>
                                    <td>
                                        <span className="aset-text-muted">
                                            {item.kategori_nama || '-'} [{item.kategori_kode || '-'}]
                                        </span>
                                    </td>
                                    <td>
                                        <span className="aset-text-highlight">
                                            {item.kelompok_nama || 'Non-Depresiasi'}
                                        </span>
                                    </td>
                                    <td className="aset-text-muted" style={{ textAlign: 'center' }}>
                                        {item.masa_manfaat_bulan
                                            ? `${Math.round(item.masa_manfaat_bulan / 12)} Thn (${item.masa_manfaat_bulan} bln)`
                                            : '-'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                                            <button
                                                className="btn-action edit"
                                                onClick={() => handleOpenEdit(item)}
                                                title="Edit Jenis Barang"
                                            >
                                                <Edit2 size={13} color="#38bdf8" />
                                            </button>
                                            <button
                                                className="btn-action delete"
                                                onClick={() => setDeleteTarget(item)}
                                                title="Hapus Jenis Barang"
                                            >
                                                <Trash2 size={13} color="#f87171" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {filteredList.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={filteredList.length}
                        onPageChange={setPage}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                    />
                </div>
            )}

            {/* Modal Tambah / Edit Jenis Barang */}
            {isModalOpen && createPortal(
                <div className="aset-modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="aset-modal-content" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header">
                            <h3>
                                <Layers size={18} color="#6366f1" />
                                {editItem ? `Edit Jenis Barang: ${editItem.nama}` : 'Tambah Jenis Barang Baru'}
                            </h3>
                            <button className="aset-modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="aset-modal-body">
                                {/* Input Nama Jenis Barang dengan Auto-Suggestion */}
                                <div className="aset-form-group" style={{ position: 'relative' }} ref={suggestionRef}>
                                    <label className="aset-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Nama Jenis Barang *</span>
                                        {loadingSuggest ? (
                                            <span style={{ fontSize: '11px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                <Loader2 size={12} className="aset-spin" /> Menganalisis dengan Gemini AI...
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '10.5px', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Sparkles size={11} /> Rekomendasi Baku Gemini AI
                                            </span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                                        <input
                                            type="text"
                                            className="aset-form-input"
                                            placeholder="Ketik nama jenis (misal: Termometer, Tensimeter, Bed Pasien)..."
                                            value={modalData.nama}
                                            onChange={e => handleNamaChange(e.target.value)}
                                            required
                                            autoComplete="off"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleTriggerAiSuggest}
                                            disabled={loadingSuggest}
                                            className="btn-aset btn-aset-secondary"
                                            style={{
                                                padding: '0 12px',
                                                height: '38px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                                                borderColor: '#8b5cf6',
                                                color: '#c084fc',
                                                whiteSpace: 'nowrap',
                                                cursor: 'pointer',
                                            }}
                                            title="Hit API AI Rekomendasi Jenis & Kelompok Aset"
                                        >
                                            {loadingSuggest ? (
                                                <><Loader2 size={14} className="aset-spin" /> Analisis...</>
                                            ) : (
                                                <><Sparkles size={14} /> Bantuan AI</>
                                            )}
                                        </button>
                                    </div>

                                    {/* Dropdown Auto-Suggestion Popup */}
                                    {showSuggestions && (
                                        <div className="aset-autocomplete-dropdown">
                                            <div className="aset-autocomplete-header">
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    {suggestionSource === 'gemini_ai' ? (
                                                        <>✨ <span>Rekomendasi Cerdas Google Gemini AI</span></>
                                                    ) : (
                                                        <>📚 <span>Rekomendasi Kamus Baku Alkes RS</span></>
                                                    )}
                                                </span>
                                                <span style={{ fontSize: '10px', opacity: 0.75 }}>Klik untuk terapkan</span>
                                            </div>
                                            {suggestions.map((s, sIdx) => (
                                                <div
                                                    key={sIdx}
                                                    onClick={() => handleSelectSuggestion(s)}
                                                    className="aset-autocomplete-item"
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 600 }}>{s.nama}</span>
                                                        <span style={{ fontSize: '10.5px', color: '#6366f1', fontFamily: 'monospace' }}>
                                                            [{s.kode}] &bull; {s.kategori_kode || s.kategoriKode} &bull; {s.kelompok_kode || s.kelompokKode}
                                                        </span>
                                                    </div>
                                                    {s.penjelasan && (
                                                        <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                                                            {s.penjelasan}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Kode Prefix */}
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Kode Singkatan / Prefix Aset *</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Contoh: AC / BED / TERMO / USG"
                                        value={modalData.kode}
                                        onChange={e => setModalData({ ...modalData, kode: e.target.value.toUpperCase() })}
                                        required
                                    />
                                    <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
                                        Digunakan pada pembentukan kode aset fisik, contoh: <code>PE.AC.0001</code>
                                    </span>
                                </div>

                                {/* Kategori Aset */}
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Kategori Aset *</label>
                                    <select
                                        className="aset-form-select"
                                        value={modalData.kategori}
                                        onChange={e => setModalData({ ...modalData, kategori: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Pilih Kategori --</option>
                                        {kategoriList.map(k => (
                                            <option key={k.id} value={k.id}>{k.nama} ({k.kode})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Kelas Aset / Kelompok PMK 72/2023 */}
                                <div className="aset-form-group">
                                    <label className="aset-form-label">Kelas Aset Default (PMK 72/2023) *</label>
                                    <select
                                        className="aset-form-select"
                                        value={modalData.kelompok_default}
                                        onChange={e => setModalData({ ...modalData, kelompok_default: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Pilih Kelas Aset --</option>
                                        {kelompokList.map(kl => (
                                            <option key={kl.id} value={kl.id}>
                                                {kl.nama} ({kl.masa_manfaat_tahun} Thn / Tarif {kl.tarif_garis_lurus}%)
                                            </option>
                                        ))}
                                    </select>
                                    <span style={{ fontSize: '10.5px', color: '#38bdf8', marginTop: '2px', display: 'block' }}>
                                        Saat pendaftaran aset baru, kelas aset ini otomatis terkunci (read-only) untuk jenis ini.
                                    </span>
                                </div>
                            </div>

                            <div className="aset-modal-footer">
                                <button
                                    type="button"
                                    className="btn-aset btn-aset-secondary"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="btn-aset btn-aset-primary"
                                    disabled={saving}
                                >
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Master Jenis'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal Konfirmasi Hapus Jenis */}
            {deleteTarget && createPortal(
                <div className="aset-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="aset-modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="aset-modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
                            <h3 style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={18} color="#ef4444" />
                                Konfirmasi Hapus Jenis Barang
                            </h3>
                            <button
                                className="aset-modal-close"
                                onClick={() => !deleting && setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="aset-modal-body" style={{ padding: '20px' }}>
                            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
                                Apakah Anda yakin ingin menghapus master jenis barang <strong style={{ color: '#f8fafc' }}>{deleteTarget.nama}</strong>?
                            </p>
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                fontSize: '12px',
                                color: '#fca5a5',
                                lineHeight: 1.5,
                                display: 'flex',
                                gap: '10px'
                            }}>
                                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#f87171' }} />
                                <div>
                                    Kode prefix <code className="badge-prefix" style={{ padding: '2px 6px', borderRadius: '4px' }}>{deleteTarget.kode}</code>.
                                    Jika jenis ini telah digunakan oleh unit fisik aset terdaftar, sistem akan menolak penghapusan demi menjaga keutuhan data.
                                </div>
                            </div>
                        </div>

                        <div className="aset-modal-footer">
                            <button
                                type="button"
                                className="btn-aset btn-aset-secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="btn-aset btn-aset-danger"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                            >
                                {deleting ? (
                                    <>
                                        <Loader2 size={14} className="aset-spin" /> Menghapus...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={14} /> Ya, Hapus Jenis
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

