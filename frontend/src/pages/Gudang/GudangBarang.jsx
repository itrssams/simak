import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    RefreshCw,
    Pencil,
    Eye,
    Package,
    X,
    Check,
    AlertCircle,
    Layers,
    FileSpreadsheet,
    Boxes,
    Download,
    Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { SimplePagination } from '../../utils/pagination.jsx';
import './Gudang.css';

export default function GudangBarang() {
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [barangList, setBarangList] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [golonganList, setGolonganList] = useState([]);
    const [satuanList, setSatuanList] = useState([]);

    const [selectedGolongan, setSelectedGolongan] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const totalSemuaBarang = useMemo(() => {
        const sum = golonganList.reduce((acc, g) => acc + (Number(g.total_barang) || 0), 0);
        return sum > 0 ? sum : totalCount;
    }, [golonganList, totalCount]);

    // Modals
    const [showModalForm, setShowModalForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedBarang, setSelectedBarang] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        id: null,
        kode: '',
        nama: '',
        merk: '',
        golongan_id: '',
        satuan_dasar_id: '',
        stok_minimum: 0,
        kemasan_list: []
    });

    const currentSatuanKode = useMemo(() => {
        const found = satuanList.find(s => String(s.id) === String(formData.satuan_dasar_id));
        return found?.kode || 'Satuan Dasar';
    }, [satuanList, formData.satuan_dasar_id]);

    // Inline quick add satuan state
    const [showAddSatuan, setShowAddSatuan] = useState(false);
    const [newSatuanKode, setNewSatuanKode] = useState('');
    const [newSatuanNama, setNewSatuanNama] = useState('');

    const fetchGolongan = async () => {
        try {
            const res = await api.get('/gudang/golongan/');
            setGolonganList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch golongan', err);
        }
    };

    const fetchSatuan = async () => {
        try {
            const res = await api.get('/gudang/satuan/');
            setSatuanList(res.data?.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch satuan', err);
        }
    };

    const fetchBarang = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                page_size: pageSize,
                search: searchQuery,
            };
            if (selectedGolongan) {
                params.golongan = selectedGolongan;
            }
            const res = await api.get('/gudang/barang/', { params });
            const data = res.data;
            if (Array.isArray(data)) {
                setBarangList(data);
                setTotalCount(data.length);
            } else {
                setBarangList(data.results || []);
                setTotalCount(data.count || 0);
            }
        } catch (err) {
            console.error('Failed to load barang', err);
            toast.error('Gagal memuat daftar barang.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGolongan();
        fetchSatuan();
    }, []);

    useEffect(() => {
        fetchBarang();
    }, [page, pageSize, selectedGolongan, searchQuery]);

    const handleOpenCreate = () => {
        setIsEditMode(false);
        setFormData({
            id: null,
            kode: '',
            nama: '',
            merk: '',
            golongan_id: golonganList[0]?.id || '',
            satuan_dasar_id: satuanList.find(s => s.kode === 'PCS')?.id || satuanList[0]?.id || '',
            stok_minimum: 0,
            kemasan_list: []
        });
        setShowModalForm(true);
    };

    const handleOpenEdit = (barang) => {
        setIsEditMode(true);
        setFormData({
            id: barang.id,
            kode: barang.kode,
            nama: barang.nama,
            merk: barang.merk || '',
            golongan_id: barang.golongan?.id || '',
            satuan_dasar_id: barang.satuan_dasar?.id || '',
            stok_minimum: barang.stok_minimum || 0,
            kemasan_list: (barang.kemasan_list || []).map(k => ({
                nama_kemasan: k.nama_kemasan,
                isi_per_kemasan: k.isi_per_kemasan,
                is_default_beli: k.is_default_beli
            }))
        });
        setShowModalForm(true);
    };

    const handleOpenDetail = (barang) => {
        setSelectedBarang(barang);
        setShowDetailModal(true);
    };

    const handleAddKemasanRow = () => {
        setFormData(prev => ({
            ...prev,
            kemasan_list: [
                ...prev.kemasan_list,
                { nama_kemasan: 'BOX', isi_per_kemasan: 10, is_default_beli: prev.kemasan_list.length === 0 }
            ]
        }));
    };

    const handleRemoveKemasanRow = (index) => {
        setFormData(prev => ({
            ...prev,
            kemasan_list: prev.kemasan_list.filter((_, i) => i !== index)
        }));
    };

    const handleKemasanChange = (index, field, value) => {
        setFormData(prev => {
            const updated = [...prev.kemasan_list];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, kemasan_list: updated };
        });
    };

    const handleQuickAddSatuan = async (e) => {
        e.preventDefault();
        const kode = newSatuanKode.trim().toUpperCase();
        if (!kode) {
            toast.error('Kode satuan wajib diisi.');
            return;
        }
        try {
            const res = await api.post('/gudang/satuan/quick_create/', {
                kode,
                nama: newSatuanNama.trim() || kode
            });
            toast.success(`Satuan ${kode} berhasil ditambahkan.`);
            await fetchSatuan();
            setFormData(prev => ({ ...prev, satuan_dasar_id: res.data.id }));
            setShowAddSatuan(false);
            setNewSatuanKode('');
            setNewSatuanNama('');
        } catch (err) {
            toast.error('Gagal menambahkan satuan baru.');
        }
    };

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        if (!formData.nama.trim()) {
            toast.error('Nama barang wajib diisi.');
            return;
        }
        if (!formData.golongan_id) {
            toast.error('Golongan barang wajib dipilih.');
            return;
        }
        if (!formData.satuan_dasar_id) {
            toast.error('Satuan dasar wajib dipilih.');
            return;
        }

        setSaving(true);
        try {
            if (isEditMode) {
                await api.put(`/gudang/barang/${formData.id}/`, formData);
                toast.success('Barang berhasil diperbarui.');
            } else {
                await api.post('/gudang/barang/', formData);
                toast.success('Barang baru berhasil ditambahkan.');
            }
            setShowModalForm(false);
            fetchBarang();
        } catch (err) {
            console.error('Save barang error', err);
            const data = err.response?.data;
            let msg = 'Gagal menyimpan barang.';
            if (data?.detail) {
                msg = data.detail;
            } else if (typeof data === 'object' && data !== null) {
                const firstKey = Object.keys(data)[0];
                const firstVal = data[firstKey];
                const cleanVal = Array.isArray(firstVal) ? firstVal.join(', ') : firstVal;
                msg = firstKey ? `${firstKey}: ${cleanVal}` : cleanVal;
            }
            toast.error(String(msg));
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadTemplate = () => {
        const sampleRows = [
            {
                KODE_GOLONGAN: 'B1',
                KODE_BARANG: 'B1-0001',
                NAMA_BARANG: 'KERTAS HVS A4 70 GSM',
                MERK: 'SIDU',
                SATUAN_DASAR: 'RIM',
                MIN_STOK: 10,
                KEMASAN_BELI: 'BOX',
                ISI_KEMASAN: 5
            },
            {
                KODE_GOLONGAN: 'B1',
                KODE_BARANG: 'B1-0002',
                NAMA_BARANG: 'PULPEN GEL HITAM 0.5MM',
                MERK: 'STANDARD',
                SATUAN_DASAR: 'PCS',
                MIN_STOK: 50,
                KEMASAN_BELI: 'LUSIN',
                ISI_KEMASAN: 12
            },
            {
                KODE_GOLONGAN: 'B4',
                KODE_BARANG: 'B4-0001',
                NAMA_BARANG: 'SABUN CUCI PIRING 800ML',
                MERK: 'SUNLIGHT',
                SATUAN_DASAR: 'BTL',
                MIN_STOK: 5,
                KEMASAN_BELI: 'DUS',
                ISI_KEMASAN: 12
            }
        ];

        const ws = XLSX.utils.json_to_sheet(sampleRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template_Barang');
        XLSX.writeFile(wb, 'Template_Katalog_Barang_Logistik_v2.xlsx');
        toast.success('Template Excel berhasil diunduh.');
    };

    const handleImportExcel = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (!data || !data.length) {
                    toast.error('File Excel kosong atau format tidak sesuai.');
                    return;
                }

                const items = data.map(row => ({
                    golongan: row.KODE_GOLONGAN || row.golongan || 'B1',
                    kode: row.KODE_BARANG || row.kode || '',
                    nama: row.NAMA_BARANG || row.nama || '',
                    merk: row.MERK || row.merk || '',
                    satuan_dasar: row.SATUAN_DASAR || row.satuan || 'PCS',
                    stok_minimum: Number(row.MIN_STOK || row.stok_minimum || 0),
                    kemasan: row.KEMASAN_BELI || row.kemasan || '',
                    isi_kemasan: Number(row.ISI_KEMASAN || row.isi || 0)
                })).filter(it => it.nama.trim().length > 0);

                if (!items.length) {
                    toast.error('Tidak ada baris barang yang valid (Nama barang wajib diisi).');
                    return;
                }

                setLoading(true);
                const res = await api.post('/gudang/barang/import_batch/', { items });
                toast.success(res.data.message || `Berhasil mengimpor ${res.data.count} barang.`);
                fetchBarang();
            } catch (err) {
                console.error('Import excel error', err);
                toast.error(err.response?.data?.error || 'Gagal membaca atau mengimpor file Excel.');
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gdg-card">
                <div className="gdg-card-head">
                    <div className="gdg-card-title">
                        <h2>Master Katalog Barang</h2>
                        <p>Total {totalCount.toLocaleString('id-ID')} barang aktif dengan normalisasi satuan & kemasan</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="gdg-btn soft" onClick={handleDownloadTemplate} title="Unduh format spreadsheet untuk impor masal">
                            <Download size={15} /> Unduh Template Excel
                        </button>
                        <label className="gdg-btn soft" style={{ cursor: 'pointer', margin: 0 }}>
                            <Upload size={15} /> Import File Excel
                            <input
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleImportExcel}
                                style={{ display: 'none' }}
                            />
                        </label>
                        <button className="gdg-btn soft" onClick={fetchBarang} disabled={loading}>
                            <RefreshCw size={15} /> Refresh
                        </button>
                        <button className="gdg-btn primary" onClick={handleOpenCreate}>
                            <Plus size={16} /> Tambah Barang
                        </button>
                    </div>
                </div>

                {/* SEARCH & FILTER TOOLBAR */}
                <div className="gdg-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="gdg-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Cari kode material, nama barang, merk..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                        />
                    </div>

                    <select
                        value={selectedGolongan}
                        onChange={(e) => { setSelectedGolongan(e.target.value); setPage(1); }}
                        className="gdg-select-control"
                        style={{ minWidth: '220px' }}
                    >
                        <option value="">Semua Golongan ({totalSemuaBarang})</option>
                        {golonganList.map((g) => (
                            <option key={g.id} value={String(g.id)}>
                                {g.kode} - {g.nama} {g.total_barang !== undefined ? `(${g.total_barang})` : ''}
                            </option>
                        ))}
                    </select>

                    {(searchQuery || selectedGolongan) && (
                        <button
                            type="button"
                            className="gdg-btn soft"
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedGolongan('');
                                setPage(1);
                            }}
                            title="Reset pencarian dan filter"
                        >
                            <X size={14} /> Reset
                        </button>
                    )}
                </div>

                {/* BARANG TABLE */}
                <div className="gdg-table-wrap">
                    <table className="gdg-table">
                        <thead>
                            <tr>
                                <th>Kode</th>
                                <th>Nama Barang</th>
                                <th>Golongan</th>
                                <th>Satuan Dasar</th>
                                <th>Kemasan Pembelian</th>
                                <th>Merk</th>
                                <th>Stok Fisik</th>
                                <th>Min. Buffer</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="gdg-table-empty">
                                        Memuat data barang...
                                    </td>
                                </tr>
                            ) : barangList.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="gdg-table-empty">
                                        Tidak ada barang yang cocok dengan pencarian.
                                    </td>
                                </tr>
                            ) : (
                                barangList.map((b) => (
                                    <tr key={b.id}>
                                        <td className="gdg-code-cell">
                                            {b.kode}
                                        </td>
                                        <td>
                                            <strong>{b.nama}</strong>
                                            {b.legacy_id_brg && (
                                                <small style={{ display: 'block', color: '#64748b', fontSize: '0.72rem' }}>
                                                    Ref ID Legacy: #{b.legacy_id_brg}
                                                </small>
                                            )}
                                        </td>
                                        <td>
                                            <span className="gdg-badge slate">{b.golongan?.kode || '-'}</span>
                                        </td>
                                        <td>
                                            <span className="gdg-satuan-badge">
                                                {b.satuan_dasar?.kode || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            {b.kemasan_list && b.kemasan_list.length > 0 ? (
                                                b.kemasan_list.map((k, idx) => (
                                                    <span key={idx} className="gdg-kemasan-pill" title={`1 ${k.nama_kemasan} = ${k.isi_per_kemasan} ${b.satuan_dasar?.kode}`}>
                                                        {k.nama_kemasan} ({Number(k.isi_per_kemasan)} {b.satuan_dasar?.kode})
                                                    </span>
                                                ))
                                            ) : (
                                                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>1 {b.satuan_dasar?.kode}</span>
                                            )}
                                        </td>
                                        <td>{b.merk || '-'}</td>
                                        <td>
                                            <span className={`gdg-badge ${b.stok_saat_ini > 0 ? 'emerald' : b.is_stok_rendah ? 'rose' : 'slate'}`}>
                                                {Number(b.stok_saat_ini || 0).toLocaleString('id-ID')} {b.satuan_dasar?.kode}
                                            </span>
                                        </td>
                                        <td>{Number(b.stok_minimum || 0).toLocaleString('id-ID')} {b.satuan_dasar?.kode}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                <button
                                                    className="gdg-action-btn view"
                                                    onClick={() => handleOpenDetail(b)}
                                                    title="Lihat Detail & Riwayat"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                <button
                                                    className="gdg-action-btn edit"
                                                    onClick={() => handleOpenEdit(b)}
                                                    title="Edit Barang"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION */}
                <div className="gdg-pagination-wrap">
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={totalCount}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </div>

            {/* MODAL FORM TAMBAH / EDIT BARANG */}
            {showModalForm && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowModalForm(false)}>
                    <div className="gdg-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div className="gdg-modal-header-content">
                                <div className="gdg-modal-header-icon">
                                    <Package size={20} />
                                </div>
                                <div className="gdg-modal-header-text">
                                    <h3>{isEditMode ? 'Edit Master Barang' : 'Tambah Master Barang Baru'}</h3>
                                    <p>
                                        {isEditMode
                                            ? `Perbarui spesifikasi & konversi kemasan [${formData.kode || ''}]`
                                            : 'Lengkapi spesifikasi barang, golongan, satuan dasar, dan konversi multi-kemasan.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gdg-btn soft"
                                style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                                onClick={() => setShowModalForm(false)}
                                title="Tutup Modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitForm}>
                            <div className="gdg-modal-body">
                                <div className="gdg-form-group">
                                    <label>Nama Barang *</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: KERTAS HVS A4 70GR"
                                        value={formData.nama}
                                        onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <label>Golongan Barang *</label>
                                        <select
                                            value={formData.golongan_id}
                                            onChange={(e) => setFormData({ ...formData, golongan_id: e.target.value })}
                                            required
                                        >
                                            <option value="">-- Pilih Golongan --</option>
                                            {golonganList.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    {g.kode} - {g.nama}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="gdg-form-group">
                                        <label>Merk / Brand</label>
                                        <input
                                            type="text"
                                            placeholder="Contoh: SIDU, KENKO, JOYKO"
                                            value={formData.merk}
                                            onChange={(e) => setFormData({ ...formData, merk: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="gdg-form-row">
                                    <div className="gdg-form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label>Satuan Terkecil (Dasar) *</label>
                                            <button
                                                type="button"
                                                onClick={() => setShowAddSatuan(!showAddSatuan)}
                                                className="gdg-mini-link"
                                            >
                                                {showAddSatuan ? 'Tutup Form' : '+ Satuan Baru'}
                                            </button>
                                        </div>
                                        <select
                                            value={formData.satuan_dasar_id}
                                            onChange={(e) => setFormData({ ...formData, satuan_dasar_id: e.target.value })}
                                            required
                                        >
                                            <option value="">-- Pilih Satuan Dasar --</option>
                                            {satuanList.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.kode} - {s.nama}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="gdg-form-group">
                                        <label>Batas Minimum (Buffer Stock)</label>
                                        <div className="gdg-input-group">
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={formData.stok_minimum}
                                                onChange={(e) => setFormData({ ...formData, stok_minimum: e.target.value })}
                                                placeholder="0"
                                            />
                                            <span className="gdg-input-suffix">{currentSatuanKode}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* QUICK INLINE ADD SATUAN */}
                                {showAddSatuan && (
                                    <div className="gdg-quick-add-box">
                                        <div style={{ fontSize: '0.8rem', fontWeight: 650, color: '#0284c7', marginBottom: '8px' }}>
                                            Tambah Satuan Baku Baru ke Master Satuan:
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                placeholder="Kode (contoh: TUBE)"
                                                value={newSatuanKode}
                                                onChange={(e) => setNewSatuanKode(e.target.value.toUpperCase())}
                                                className="gdg-inline-input"
                                                style={{ width: '130px', textTransform: 'uppercase' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Nama Satuan (mis: Tube / Pasta)"
                                                value={newSatuanNama}
                                                onChange={(e) => setNewSatuanNama(e.target.value)}
                                                className="gdg-inline-input"
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleQuickAddSatuan}
                                                className="gdg-btn primary"
                                                style={{ height: '34px', padding: '0 12px', fontSize: '0.8rem' }}
                                            >
                                                Simpan Satuan
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* PACKAGING CONVERSIONS PANEL */}
                                <div className="gdg-conversion-panel">
                                    <div className="gdg-conversion-head">
                                        <div>
                                            <div className="gdg-conversion-head-title">
                                                Kemasan Pembelian & Faktor Konversi
                                            </div>
                                            <p className="gdg-conversion-head-desc">
                                                Digunakan saat faktur pembelian memakai satuan lebih besar. Contoh: 1 KARTON = 10 {currentSatuanKode}.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="gdg-btn soft"
                                            style={{ height: '32px', padding: '0 10px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                                            onClick={handleAddKemasanRow}
                                        >
                                            <Plus size={13} /> Tambah Kemasan
                                        </button>
                                    </div>

                                    {formData.kemasan_list.length === 0 ? (
                                        <div className="gdg-conversion-empty">
                                            Belum ada konversi kemasan (opsional). Klik <strong>+ Tambah Kemasan</strong> jika barang ini biasa dibeli per Karton/Box/Pack.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {formData.kemasan_list.map((k, index) => (
                                                <div key={index} className="gdg-conversion-row">
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                                                        1 Kemasan:
                                                    </span>
                                                    <input
                                                        type="text"
                                                        placeholder="mis: BOX / KARTON"
                                                        value={k.nama_kemasan}
                                                        onChange={(e) => handleKemasanChange(index, 'nama_kemasan', e.target.value.toUpperCase())}
                                                        className="gdg-inline-input"
                                                        style={{ flex: 1, minWidth: '110px', textTransform: 'uppercase' }}
                                                    />
                                                    <span className="gdg-conversion-eq">=</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            placeholder="Isi"
                                                            value={k.isi_per_kemasan}
                                                            onChange={(e) => handleKemasanChange(index, 'isi_per_kemasan', e.target.value)}
                                                            className="gdg-inline-input"
                                                            style={{ width: '75px', textAlign: 'center' }}
                                                        />
                                                        <span className="gdg-satuan-badge" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                            {currentSatuanKode}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="gdg-action-btn delete"
                                                        style={{ width: '28px', height: '28px' }}
                                                        onClick={() => handleRemoveKemasanRow(index)}
                                                        title="Hapus kemasan"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="gdg-modal-foot">
                                <button
                                    type="button"
                                    className="gdg-btn soft"
                                    onClick={() => setShowModalForm(false)}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="gdg-btn primary"
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <>
                                            <RefreshCw size={14} className="gdg-spin" />
                                            <span>Menyimpan...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check size={16} />
                                            <span>{isEditMode ? 'Simpan Perubahan' : 'Simpan Barang'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL DETAIL BARANG */}
            {showDetailModal && selectedBarang && createPortal(
                <div className="gdg-modal-backdrop" onClick={() => setShowDetailModal(false)}>
                    <div className="gdg-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="gdg-modal-head">
                            <div>
                                <h3 style={{ fontSize: '1.2rem' }}>{selectedBarang.nama}</h3>
                                <p style={{ color: '#38bdf8', fontFamily: 'monospace', margin: '4px 0 0 0' }}>
                                    Kode: {selectedBarang.kode} {selectedBarang.legacy_id_brg && `(Legacy ID: #${selectedBarang.legacy_id_brg})`}
                                </p>
                            </div>
                            <button className="gdg-btn soft" style={{ padding: '6px' }} onClick={() => setShowDetailModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gdg-modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <span className="gdg-detail-label">Golongan</span>
                                    <div className="gdg-detail-val">
                                        {selectedBarang.golongan?.kode} - {selectedBarang.golongan?.nama}
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-detail-label">Merk / Brand</span>
                                    <div className="gdg-detail-val">
                                        {selectedBarang.merk || '-'}
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-detail-label">Satuan Dasar</span>
                                    <div className="gdg-satuan-badge" style={{ marginTop: '2px' }}>
                                        {selectedBarang.satuan_dasar?.kode} ({selectedBarang.satuan_dasar?.nama})
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-detail-label">Batas Stok Minimum</span>
                                    <div className="gdg-detail-val">
                                        {selectedBarang.stok_minimum} {selectedBarang.satuan_dasar?.kode}
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-detail-label">Stok Fisik Tersedia</span>
                                    <div style={{ fontWeight: 700, fontSize: '1.2rem', color: selectedBarang.stok_saat_ini > 0 ? '#34d399' : '#f43f5e', marginTop: '2px' }}>
                                        {selectedBarang.stok_saat_ini} {selectedBarang.satuan_dasar?.kode}
                                    </div>
                                </div>
                                <div>
                                    <span className="gdg-detail-label">Nilai Rata-rata Unit</span>
                                    <div className="gdg-detail-val">
                                        Rp {Number(selectedBarang.nilai_rata_rata || 0).toLocaleString('id-ID')} / {selectedBarang.satuan_dasar?.kode}
                                    </div>
                                </div>
                            </div>

                            <div className="gdg-detail-divider">
                                <span className="gdg-detail-section-title">
                                    Daftar Kemasan Beli yang Terdaftar
                                </span>
                                {selectedBarang.kemasan_list && selectedBarang.kemasan_list.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                        {selectedBarang.kemasan_list.map((k, i) => (
                                            <div key={i} className="gdg-detail-box">
                                                <strong>{k.nama_kemasan}</strong>
                                                <span className="gdg-code-cell">1 {k.nama_kemasan} = {Number(k.isi_per_kemasan)} {selectedBarang.satuan_dasar?.kode}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="gdg-cell-muted" style={{ marginTop: '6px' }}>
                                        Belum ada variasi kemasan. Default: 1 {selectedBarang.satuan_dasar?.kode}.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="gdg-modal-foot">
                            <button
                                type="button"
                                className="gdg-btn primary"
                                onClick={() => {
                                    setShowDetailModal(false);
                                    navigate(`/gudang/kartu-stok?barang=${selectedBarang.id}`);
                                }}
                            >
                                Buka Kartu Stok & Riwayat →
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

