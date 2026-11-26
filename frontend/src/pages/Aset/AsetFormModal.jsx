import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Package, Sparkles, Loader2, Camera, Trash2, Lock } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import SearchableSelect from '../../components/SearchableSelect';
import useBodyScrollLock from './useBodyScrollLock';
import { isAsetManagerUser, getUserUnitId } from './asetPermissions';
import './Aset.css';
import resolveMediaUrl from '../../utils/resolveMediaUrl';

// Helper konversi angka ke format Rupiah Indonesia (Rp pemisah ribuan titik dan koma desimal)
const formatRupiahDisplay = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const clean = String(val).replace(/Rp\s?/i, '').trim();
    if (!clean) return '';

    let intRaw = '';
    let decDigits = '';
    let hasTrailingComma = false;

    if (clean.includes(',')) {
        const parts = clean.split(',');
        intRaw = parts[0].replace(/\D/g, '');
        decDigits = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
        hasTrailingComma = clean.endsWith(',');
    } else if (clean.includes('.') && clean.split('.').length === 2 && clean.split('.')[1].length <= 2) {
        // Format desimal backend, contoh '2500000.00' atau '750000.50'
        const parts = clean.split('.');
        intRaw = parts[0].replace(/\D/g, '');
        decDigits = parts[1].replace(/\D/g, '').slice(0, 2);
    } else {
        intRaw = clean.replace(/\D/g, '');
    }

    if (!intRaw && !decDigits) return '';

    const intFormatted = intRaw ? new Intl.NumberFormat('id-ID').format(Number(intRaw)) : '0';
    let result = `Rp ${intFormatted}`;

    if (hasTrailingComma && !decDigits) {
        result += ',';
    } else if (decDigits && decDigits !== '00') {
        result += `,${decDigits}`;
    }

    return result;
};

// Helper parsing string Rupiah ke numeric string untuk disimpan ke database (e.g. '15000000' atau '15000000.50')
const parseRupiahRaw = (displayStr) => {
    if (!displayStr) return '';
    const clean = String(displayStr).replace(/Rp\s?/i, '').trim();
    if (!clean) return '';

    let parts = clean.split(',');
    let intPart = parts[0].replace(/\D/g, '');
    let decPart = parts.length > 1 ? parts[1].replace(/\D/g, '').slice(0, 2) : '';

    if (!intPart && !decPart) return '';
    if (decPart && decPart !== '00') {
        return `${intPart || '0'}.${decPart}`;
    }
    return intPart;
};

const KELAYAKAN_OPTIONS = [
    { value: 'A', label: 'Sangat Layak (A)', subtext: 'Kondisi prima, siap pakai penuh' },
    { value: 'B', label: 'Layak (B)', subtext: 'Berfungsi baik dengan pemakaian normal' },
    { value: 'C', label: 'Cukup Layak (C)', subtext: 'Perlu pemantauan / servis ringan' },
    { value: 'D', label: 'Kurang Layak (D)', subtext: 'Membutuhkan perbaikan signifikan' },
    { value: 'E', label: 'Tidak Layak (E)', subtext: 'Rusak berat / rekomendasi afkir' },
];

const STATUS_ASET_OPTIONS = [
    { value: 'aktif', label: 'Aktif', subtext: 'Aset beroperasi di unit' },
    { value: 'dalam_perbaikan', label: 'Dalam Perbaikan', subtext: 'Sedang ditangani teknisi' },
    { value: 'tidak_digunakan', label: 'Tidak Digunakan', subtext: 'Standby / belum dimanfaatkan' },
    { value: 'afkir', label: 'Afkir / Dihapuskan', subtext: 'Sudah tidak digunakan permanen' },
];

const KEPEMILIKAN_OPTIONS = [
    { value: 'milik_sendiri', label: 'Milik Sendiri', subtext: 'Aset inventaris milik RS' },    
    { value: 'pinjam_pakai', label: 'Pinjam Pakai', subtext: 'Kerja sama pinjam pakai' },
    { value: 'hibah', label: 'Hibah', subtext: 'Penerimaan hibah' },
    { value: 'kso', label: 'KSO', subtext: 'Kerja Sama Operasional' },
];

export default function AsetFormModal({ isOpen, onClose, onSuccess, initialData = null }) {
    const { user } = useAuth();
    const toast = useToast();
    const isEdit = Boolean(initialData);
    const isAsetAdmin = isAsetManagerUser(user);
    const userUnitId = getUserUnitId(user);
    const lockUnitToUser = !isAsetAdmin && Boolean(userUnitId);

    // Kunci scroll halaman belakang saat modal pendaftaran aset terbuka
    useBodyScrollLock(isOpen, onClose);

    const [jenisList, setJenisList] = useState([]);
    const [kelompokList, setKelompokList] = useState([]);
    const [unitList, setUnitList] = useState([]);
    const [ruanganList, setRuanganList] = useState([]);

    const [formData, setFormData] = useState({
        kode_aset: '',
        jenis: '',
        deskripsi: '',
        merk: '',
        spesifikasi: '',
        nomor_seri: '',
        nomor_registrasi: '',
        perlu_kalibrasi: false,
        unit: '',
        ruangan: '',
        lokasi_teks: '',
        status_kelayakan: 'A',
        status_aset: 'aktif',
        status_kepemilikan: 'milik_sendiri',
        bulan_perolehan: '',
        harga_perolehan: '',
        kelompok: '',
        masa_manfaat_bulan: '',
        rekomendasi_tindakan: '',
        catatan: '',
    });

    const [hargaDisplay, setHargaDisplay] = useState('');

    const [fotoAwalFile, setFotoAwalFile] = useState(null);
    const [fotoAwalPreview, setFotoAwalPreview] = useState(null);
    const [fotoTerkiniFile, setFotoTerkiniFile] = useState(null);
    const [fotoTerkiniPreview, setFotoTerkiniPreview] = useState(null);

    const fotoAwalInputRef = useRef(null);
    const fotoTerkiniInputRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [showAiPopover, setShowAiPopover] = useState(false);
    const aiPopoverRef = useRef(null);

    // Tutup popover rekomendasi AI saat klik di luar
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (aiPopoverRef.current && !aiPopoverRef.current.contains(e.target)) {
                setShowAiPopover(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadMasterData();
            if (initialData) {
                setFormData({
                    kode_aset: initialData.kode_aset || '',
                    jenis: initialData.jenis || '',
                    deskripsi: initialData.deskripsi || '',
                    merk: initialData.merk || '',
                    spesifikasi: initialData.spesifikasi || '',
                    nomor_seri: initialData.nomor_seri || '',
                    nomor_registrasi: initialData.nomor_registrasi || '',
                    perlu_kalibrasi: Boolean(initialData.perlu_kalibrasi),
                    unit: initialData.unit || '',
                    ruangan: initialData.ruangan || '',
                    lokasi_teks: initialData.lokasi_teks || '',
                    status_kelayakan: initialData.status_kelayakan || 'A',
                    status_aset: initialData.status_aset || 'aktif',
                    status_kepemilikan: initialData.status_kepemilikan || 'milik_sendiri',
                    bulan_perolehan: initialData.bulan_perolehan || '',
                    harga_perolehan: initialData.harga_perolehan || '',
                    kelompok: initialData.kelompok || '',
                    masa_manfaat_bulan: initialData.masa_manfaat_bulan || '',
                    rekomendasi_tindakan: initialData.rekomendasi_tindakan || '',
                    catatan: initialData.catatan || '',
                });
                setHargaDisplay(formatRupiahDisplay(initialData.harga_perolehan));
                setFotoAwalPreview(initialData.foto_awal || initialData.foto || null);
                setFotoTerkiniPreview(initialData.foto_terkini || null);
            } else {
                setFormData({
                    kode_aset: '',
                    jenis: '',
                    deskripsi: '',
                    merk: '',
                    spesifikasi: '',
                    nomor_seri: '',
                    nomor_registrasi: '',
                    perlu_kalibrasi: false,
                    unit: (!isAsetAdmin && userUnitId) ? String(userUnitId) : '',
                    ruangan: '',
                    lokasi_teks: '',
                    status_kelayakan: 'A',
                    status_aset: 'aktif',
                    status_kepemilikan: 'milik_sendiri',
                    bulan_perolehan: '',
                    harga_perolehan: '',
                    kelompok: '',
                    masa_manfaat_bulan: '',
                    rekomendasi_tindakan: '',
                    catatan: '',
                });
                setHargaDisplay('');
                setFotoAwalPreview(null);
                setFotoTerkiniPreview(null);
            }
            setFotoAwalFile(null);
            setFotoTerkiniFile(null);
            setAiEnabled(false);
            setShowAiPopover(false);
            setAiSuggestions([]);
        }
    }, [isOpen, initialData]);

    const loadMasterData = async () => {
        try {
            const [jRes, kRes, uRes, rRes] = await Promise.all([
                api.get('/aset/jenis/'),
                api.get('/aset/kelompok/'),
                api.get('/users/units/'),
                api.get('/aset/ruangan/'),
            ]);
            setJenisList(jRes.data.results || jRes.data || []);
            setKelompokList(kRes.data.results || kRes.data || []);
            setUnitList(uRes.data.results || uRes.data || []);
            setRuanganList(rRes.data.results || rRes.data || []);
        } catch {
            toast.error('Gagal memuat master data aset.');
        }
    };

    // Saat jenis aset dipilih, OTOMATIS menentukan Kelas Aset & Masa Manfaat
    const handleJenisSelect = (val) => {
        const jObj = jenisList.find(j => String(j.id) === String(val));
        const isMedis = jObj?.kategori_kode === 'AM' ||
            jObj?.kategori_nama?.toLowerCase().includes('medis') ||
            jObj?.kategori_nama?.toLowerCase().includes('alkes');

        setFormData(prev => ({
            ...prev,
            jenis: val,
            deskripsi: prev.deskripsi || jObj?.nama || '',
            kelompok: jObj?.kelompok_default || prev.kelompok,
            masa_manfaat_bulan: jObj?.masa_manfaat_bulan || prev.masa_manfaat_bulan,
            perlu_kalibrasi: isMedis ? true : prev.perlu_kalibrasi,
        }));
    };

    // Handler input Harga Perolehan dengan format Rupiah otomatis (Rp 1.000.000,00)
    const handleHargaChange = (e) => {
        const inputVal = e.target.value;
        if (!inputVal || inputVal === 'Rp' || inputVal === 'Rp ') {
            setHargaDisplay('');
            setFormData(prev => ({ ...prev, harga_perolehan: '' }));
            return;
        }
        const formatted = formatRupiahDisplay(inputVal);
        const raw = parseRupiahRaw(inputVal);
        setHargaDisplay(formatted);
        setFormData(prev => ({ ...prev, harga_perolehan: raw }));
    };

    const handleUnitSelect = (val) => {
        setFormData(prev => ({
            ...prev,
            unit: val,
            ruangan: '', // reset ruangan jika unit berubah
        }));
    };

    const handleRuanganSelect = (val) => {
        const rObj = ruanganList.find(r => String(r.id) === String(val));
        setFormData(prev => ({
            ...prev,
            ruangan: val,
            lokasi_teks: prev.lokasi_teks || (rObj ? rObj.nama : ''),
        }));
    };

    // Hit API Bantuan AI Rekomendasi Alkes & Jenis Aset (HANYA saat diklik)
    const fetchAiSuggestions = async () => {
        const query = (formData.deskripsi || '').trim();
        if (query.length < 2) {
            toast.info('Ketik nama barang / deskripsi (minimal 2 karakter), lalu klik tombol Bantuan AI / Cari AI.');
            return;
        }

        setAiLoading(true);
        try {
            const res = await api.get('/aset/jenis/suggest/', { params: { q: query } });
            const results = res.data?.results || [];
            if (results.length === 0) {
                toast.info('Tidak ada rekomendasi alkes/aset yang cocok untuk nama tersebut.');
                setShowAiPopover(false);
            } else {
                setAiSuggestions(results);
                setShowAiPopover(true);
            }
        } catch {
            toast.error('Gagal mengambil rekomendasi AI.');
        } finally {
            setAiLoading(false);
        }
    };

    const handleToggleAi = () => {
        if (aiLoading) return;
        const nextEnabled = !aiEnabled;
        setAiEnabled(nextEnabled);
        if (nextEnabled) {
            fetchAiSuggestions();
        } else {
            setShowAiPopover(false);
        }
    };

    const handleSelectAiSuggestion = (item) => {
        const matched = jenisList.find(j =>
            (item.kode && j.kode.toLowerCase() === item.kode.toLowerCase()) ||
            (item.nama && j.nama.toLowerCase().includes(item.nama.toLowerCase()))
        );

        if (matched) {
            handleJenisSelect(matched.id);
            toast.success(`Jenis barang diterapkan: ${matched.nama} [${matched.kode}]`);
        } else {
            toast.info(`Rekomendasi alkes: ${item.nama} [${item.kode || '-'}]`);
        }
        setShowAiPopover(false);
    };

    const handleFotoAwalChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoAwalFile(file);
            setFotoAwalPreview(URL.createObjectURL(file));
        }
    };

    const handleFotoTerkiniChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFotoTerkiniFile(file);
            setFotoTerkiniPreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveFotoAwal = (e) => {
        e.stopPropagation();
        setFotoAwalFile(null);
        setFotoAwalPreview(null);
        if (fotoAwalInputRef.current) fotoAwalInputRef.current.value = '';
    };

    const handleRemoveFotoTerkini = (e) => {
        e.stopPropagation();
        setFotoTerkiniFile(null);
        setFotoTerkiniPreview(null);
        if (fotoTerkiniInputRef.current) fotoTerkiniInputRef.current.value = '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validasi Mandatori Seluruh Kolom Pendaftaran Aset Baru / Edit
        if (!formData.jenis) {
            toast.error('Jenis Barang / Klasifikasi wajib dipilih.');
            return;
        }
        if (!formData.deskripsi.trim()) {
            toast.error('Deskripsi / Nama Barang wajib diisi.');
            return;
        }
        if (!formData.merk.trim()) {
            toast.error('Merek (Merk) wajib diisi.');
            return;
        }
        if (!formData.spesifikasi.trim()) {
            toast.error('Spesifikasi / Kapasitas wajib diisi.');
            return;
        }
        if (!formData.unit) {
            toast.error('Unit Penanggung Jawab wajib dipilih.');
            return;
        }
        if (!formData.ruangan) {
            toast.error('Ruangan Master wajib dipilih.');
            return;
        }
        if (!formData.lokasi_teks.trim()) {
            toast.error('Lokasi Akurat / Keterangan Ruang wajib diisi.');
            return;
        }
        if (!isEdit && !fotoAwalFile) {
            toast.error('Foto Kondisi Awal (Saat Registrasi) wajib diunggah saat pendaftaran aset baru.');
            return;
        }

        setLoading(true);
        try {
            const data = new FormData();
            // Kolom opsional yang boleh dikirim kosong agar dapat direset saat edit
            const textFieldsAllowedBlank = [
                'nomor_seri',
                'nomor_registrasi',
                'rekomendasi_tindakan',
                'catatan',
            ];

            Object.keys(formData).forEach(key => {
                if (key === 'bulan_perolehan' || key === 'harga_perolehan') {
                    // Kolom sementara dinonaktifkan — pertahankan nilai eksisting saat edit tanpa memaksa input
                    return;
                }
                if (key === 'perlu_kalibrasi') {
                    data.append('perlu_kalibrasi', formData.perlu_kalibrasi ? 'true' : 'false');
                } else if (textFieldsAllowedBlank.includes(key)) {
                    data.append(key, formData[key] ?? '');
                } else if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
                    data.append(key, formData[key]);
                }
            });

            if (fotoAwalFile) {
                data.append('foto_awal', fotoAwalFile);
                data.append('foto', fotoAwalFile);
            }
            if (fotoTerkiniFile) {
                data.append('foto_terkini', fotoTerkiniFile);
            }

            if (isEdit) {
                await api.patch(`/aset/aset/${initialData.id}/`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success(
                    isAsetAdmin
                        ? 'Data aset berhasil diperbarui.'
                        : 'Perubahan aset berhasil disimpan dan diajukan ulang untuk verifikasi.'
                );
            } else {
                await api.post('/aset/aset/', data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success(
                    isAsetAdmin
                        ? 'Aset baru berhasil didaftarkan.'
                        : 'Pengajuan aset berhasil dikirim dan menunggu verifikasi Admin Aset.'
                );
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            const dataErr = err.response?.data;
            if (dataErr && typeof dataErr === 'object') {
                const firstKey = Object.keys(dataErr)[0];
                const msg = Array.isArray(dataErr[firstKey]) ? dataErr[firstKey][0] : dataErr[firstKey];
                toast.error(typeof msg === 'string' ? msg : 'Gagal menyimpan data aset.');
            } else {
                toast.error('Gagal menyimpan data aset.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Hitung options SEBELUM early return agar hook order selalu konsisten
    const filteredRuangan = useMemo(() => {
        return formData.unit
            ? ruanganList.filter(r => String(r.unit) === String(formData.unit))
            : ruanganList;
    }, [ruanganList, formData.unit]);

    const jenisOptions = useMemo(() => {
        return jenisList.map(j => ({
            value: j.id,
            label: `${j.nama} [${j.kode}]`,
            subtext: `${j.kategori_nama || j.kategori_kode || ''} • Kelas: ${j.kelompok_nama || '-'}`,
        }));
    }, [jenisList]);

    const unitOptions = useMemo(() => {
        return unitList.map(u => ({
            value: u.id,
            label: u.nama,
            subtext: u.kode ? `Kode: ${u.kode}` : 'Unit RS',
        }));
    }, [unitList]);

    const ruanganOptions = useMemo(() => {
        return filteredRuangan.map(r => ({
            value: r.id,
            label: r.nama,
            subtext: r.lantai_gedung ? `Lantai / Gedung: ${r.lantai_gedung}` : 'Ruangan Unit',
        }));
    }, [filteredRuangan]);

    if (!isOpen) return null;

    // Temukan objek kelas aset terpilih untuk display read-only
    const selectedJenis = jenisList.find(j => String(j.id) === String(formData.jenis));
    const selectedKelompokId = formData.kelompok || selectedJenis?.kelompok_default;
    const selectedKelompok = kelompokList.find(k => String(k.id) === String(selectedKelompokId));

    return createPortal(
        <div className="aset-modal-overlay">
            <div className="aset-modal-content aset-modal-lg">
                <div className="aset-modal-header">
                    <h3>
                        <Package size={18} color="#6366f1" />
                        {isEdit ? `Edit Aset: ${initialData.kode_aset}` : 'Pendaftaran Aset Baru'}
                    </h3>
                    <button className="aset-modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="aset-modal-body">
                        {!isAsetAdmin && (
                            <div className={`aset-verif-note ${initialData?.status_verifikasi === 'ditolak' ? 'is-rejected' : ''}`}>
                                {initialData?.status_verifikasi === 'ditolak' ? (
                                    <>
                                        <strong>Pengajuan Perlu Perbaikan:</strong>{' '}
                                        {initialData.catatan_verifikasi || 'Silakan perbaiki data sesuai catatan Admin Aset dan simpan untuk verifikasi ulang.'}
                                    </>
                                ) : (
                                    <>
                                        <strong>Pendaftaran Aset Unit:</strong>{' '}
                                        Aset yang didaftarkan berstatus <em>Menunggu Verifikasi</em> oleh Admin Aset (Mas Febry / Pak Edy / Bu Nevi) sebelum masuk ke KIR dan laporan resmi. Anda tetap dapat mengedit data selama belum diverifikasi.
                                    </>
                                )}
                            </div>
                        )}
                        {/* Baris 1: Jenis Aset & Kode Aset */}
                        <div className="aset-form-grid-2">
                            <div className="aset-form-group">
                                <label className="aset-form-label">Jenis Barang / Klasifikasi *</label>
                                <SearchableSelect
                                    options={jenisOptions}
                                    value={formData.jenis}
                                    onChange={handleJenisSelect}
                                    placeholder="-- Cari / Pilih Jenis Barang --"
                                    searchPlaceholder="Ketik nama alkes atau kode..."
                                    required
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">
                                    Kode Aset Fisik <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Kosongkan untuk auto-generate)</span>
                                </label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: AM.USG.2026.0001"
                                    value={formData.kode_aset}
                                    onChange={e => setFormData({ ...formData, kode_aset: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Baris 2: Deskripsi, Merek, Spesifikasi */}
                        <div className="aset-form-grid-3" style={{ gridTemplateColumns: '1.25fr 1fr 1fr' }}>
                            <div className="aset-form-group" style={{ position: 'relative' }} ref={aiPopoverRef}>
                                <div className="aset-label-row">
                                    <label className="aset-form-label" title="Deskripsi / Nama Barang">Deskripsi / Nama *</label>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                        {aiEnabled && (
                                            <button
                                                type="button"
                                                onClick={fetchAiSuggestions}
                                                disabled={aiLoading}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap',
                                                    background: 'rgba(99, 102, 241, 0.14)',
                                                    border: '1px solid rgba(99, 102, 241, 0.45)',
                                                    color: '#818cf8',
                                                    cursor: aiLoading ? 'wait' : 'pointer',
                                                }}
                                                title="Cari saran AI berdasarkan deskripsi saat ini"
                                            >
                                                {aiLoading ? <Loader2 size={10} className="aset-spin" /> : <Sparkles size={10} />}
                                                <span>Cari AI</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={aiEnabled}
                                            onClick={handleToggleAi}
                                            disabled={aiLoading}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '1px 6px',
                                                borderRadius: '999px',
                                                fontSize: '10.5px',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                lineHeight: '16px',
                                                background: aiEnabled
                                                    ? 'rgba(139, 92, 246, 0.18)'
                                                    : 'rgba(148, 163, 184, 0.12)',
                                                border: aiEnabled
                                                    ? '1px solid #8b5cf6'
                                                    : '1px solid rgba(148, 163, 184, 0.35)',
                                                color: aiEnabled ? '#c084fc' : '#94a3b8',
                                                cursor: aiLoading ? 'wait' : 'pointer',
                                                transition: 'all 0.15s ease',
                                            }}
                                            title={aiEnabled ? 'Matikan Bantuan AI' : 'Aktifkan & Hit API Bantuan AI'}
                                        >
                                            {aiLoading ? <Loader2 size={10} className="aset-spin" /> : <Sparkles size={10} />}
                                            <span>Bantuan AI</span>
                                            <span style={{
                                                width: '20px',
                                                height: '11px',
                                                borderRadius: '999px',
                                                background: aiEnabled ? '#8b5cf6' : '#475569',
                                                position: 'relative',
                                                display: 'inline-block',
                                                flexShrink: 0,
                                                transition: 'background 0.15s ease',
                                            }}>
                                                <span style={{
                                                    position: 'absolute',
                                                    top: '1.5px',
                                                    left: aiEnabled ? '10.5px' : '1.5px',
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: '#ffffff',
                                                    transition: 'left 0.15s ease',
                                                }} />
                                            </span>
                                        </button>
                                    </div>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        placeholder="Contoh: AC Daikin / Tempat Tidur Pasien / USG"
                                        value={formData.deskripsi}
                                        onChange={e => setFormData({ ...formData, deskripsi: e.target.value })}
                                        required
                                    />
                                    {showAiPopover && aiSuggestions.length > 0 && (
                                        <div className="aset-autocomplete-dropdown" style={{ zIndex: 9999 }}>
                                            <div className="aset-autocomplete-header">
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Sparkles size={12} color="#a855f7" /> Rekomendasi Cerdas AI
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAiPopover(false)}
                                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                            {aiSuggestions.map((s, idx) => (
                                                <div
                                                    key={idx}
                                                    className="aset-autocomplete-item"
                                                    onClick={() => handleSelectAiSuggestion(s)}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 600 }}>{s.nama}</span>
                                                        <span style={{ fontSize: '10.5px', color: '#6366f1', fontFamily: 'monospace' }}>
                                                            [{s.kode}] &bull; {s.kategori_kode || ''}
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
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Merek (Merk) *</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: Sharp / Daikin / Philips / Mindray"
                                    value={formData.merk}
                                    onChange={e => setFormData({ ...formData, merk: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Spesifikasi / Kapasitas *</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: 2 PK / 32 inch / Electric 3 Crank"
                                    value={formData.spesifikasi}
                                    onChange={e => setFormData({ ...formData, spesifikasi: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        {/* Baris 2.5: Nomor Seri, Nomor Registrasi & Toggle Kalibrasi */}
                        <div className="aset-form-section aset-form-grid-3" style={{ padding: '12px', margin: '0 0 14px' }}>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Nomor Seri / S/N <span style={{ fontSize: '11px', opacity: 0.75 }}>(Opsional)</span></label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: SN-829381928"
                                    value={formData.nomor_seri}
                                    onChange={e => setFormData({ ...formData, nomor_seri: e.target.value })}
                                />
                            </div>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">
                                    Nomor Registrasi <span style={{ fontSize: '11px', opacity: 0.75 }}>(Opsional)</span>
                                </label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: AKL / AKD / No. Reg Unit"
                                    value={formData.nomor_registrasi}
                                    onChange={e => setFormData({ ...formData, nomor_registrasi: e.target.value })}
                                />
                            </div>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Perlu Kalibrasi Berkala</label>
                                <div
                                    className={`aset-toggle-box ${formData.perlu_kalibrasi ? 'active' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, perlu_kalibrasi: !prev.perlu_kalibrasi }))}
                                >
                                    <span className="aset-toggle-label">
                                        {formData.perlu_kalibrasi ? '⚡ Wajib Kalibrasi' : 'Tidak Perlu'}
                                    </span>
                                    <div className="aset-toggle-track" title="Klik untuk toggle kalibrasi">
                                        <div className="aset-toggle-thumb" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Baris 3: Unit, Ruangan, Lokasi Teks */}
                        <div className="aset-form-grid-3">
                            <div className="aset-form-group">
                                <label className="aset-form-label">
                                    Unit Penanggung Jawab * {lockUnitToUser && <Lock size={11} style={{ display: 'inline', marginLeft: 4 }} />}
                                </label>
                                <SearchableSelect
                                    options={unitOptions}
                                    value={formData.unit}
                                    onChange={handleUnitSelect}
                                    placeholder="-- Pilih / Cari Unit --"
                                    searchPlaceholder="Ketik nama unit..."
                                    required
                                    disabled={lockUnitToUser}
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Ruangan Master *</label>
                                <SearchableSelect
                                    options={ruanganOptions}
                                    value={formData.ruangan}
                                    onChange={handleRuanganSelect}
                                    placeholder="-- Pilih / Cari Ruangan --"
                                    searchPlaceholder="Ketik nama ruangan..."
                                    required
                                    disabled={!formData.unit}
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Lokasi Akurat / Keterangan Ruang *</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: Ruang VIP 1 / Nurse Station"
                                    value={formData.lokasi_teks}
                                    onChange={e => setFormData({ ...formData, lokasi_teks: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        {/* Baris 4: Kelayakan, Status Aset, Kepemilikan */}
                        <div className="aset-form-grid-3">
                            <div className="aset-form-group">
                                <label className="aset-form-label">Tingkat Kelayakan *</label>
                                <SearchableSelect
                                    options={KELAYAKAN_OPTIONS}
                                    value={formData.status_kelayakan}
                                    onChange={val => setFormData({ ...formData, status_kelayakan: val })}
                                    placeholder="-- Pilih Kelayakan --"
                                    searchPlaceholder="Cari tingkat kelayakan..."
                                    required
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Status Operasional *</label>
                                <SearchableSelect
                                    options={STATUS_ASET_OPTIONS}
                                    value={formData.status_aset}
                                    onChange={val => setFormData({ ...formData, status_aset: val })}
                                    placeholder="-- Pilih Status Operasional --"
                                    searchPlaceholder="Cari status operasional..."
                                    required
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Status Kepemilikan *</label>
                                <SearchableSelect
                                    options={KEPEMILIKAN_OPTIONS}
                                    value={formData.status_kepemilikan}
                                    onChange={val => setFormData({ ...formData, status_kepemilikan: val })}
                                    placeholder="-- Pilih Kepemilikan --"
                                    searchPlaceholder="Cari status kepemilikan..."
                                    required
                                />
                            </div>
                        </div>

                        {/* Baris 5: Finansial & Parameter Penyusutan (KELAS ASET READ ONLY) */}
                        <div className="aset-form-section">
                            <div className="aset-form-section-title">
                                <span>PARAMETER PENYUSUTAN & PAJAK (PMK 72/2023)</span>
                                <span style={{ fontSize: '10.5px', fontWeight: 500, opacity: 0.75, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Lock size={11} /> Kelas Aset Ditentukan Otomatis dari Jenis Barang
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '175px 1.1fr 1.6fr', gap: '12px' }}>
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label" title="Sementara dinonaktifkan">
                                        Tanggal Perolehan
                                    </label>
                                    <DateField
                                        value={formData.bulan_perolehan}
                                        onChange={val => setFormData({ ...formData, bulan_perolehan: val })}
                                        placeholder="Sementara dikunci"
                                        disabled
                                    />
                                </div>
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label" title="Sementara dinonaktifkan">
                                        Harga Perolehan
                                    </label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        style={{ fontWeight: 600, letterSpacing: '0.02em' }}
                                        placeholder="Sementara dikunci"
                                        value={hargaDisplay}
                                        onChange={handleHargaChange}
                                        disabled
                                        title="Kolom Harga Perolehan sementara dinonaktifkan"
                                    />
                                </div>
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>Kelas Aset</span>
                                        <Lock size={11} color="#fbbf24" title="Terkunci (Read-Only) sesuai PMK 72/2023" />
                                    </label>
                                    <div className="aset-readonly-box">
                                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', marginRight: '8px' }}>
                                            {selectedKelompok ? selectedKelompok.nama : 'Pilih jenis barang terlebih dahulu'}
                                        </span>
                                        {selectedKelompok && (
                                            <span style={{ fontSize: '11px', color: '#0284c7', fontFamily: 'monospace', flexShrink: 0 }}>
                                                {selectedKelompok.masa_manfaat_tahun} Thn ({selectedKelompok.tarif_garis_lurus}%)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Baris 6: Dua Slot Foto (Kondisi Awal vs Kondisi Terkini) */}
                        <div className="aset-form-section">
                            <div className="aset-form-section-title purple">
                                DOKUMENTASI FOTO (KONDISI AWAL VS TERKINI UNIT)
                            </div>
                            <div className="aset-form-grid-2">
                                {/* Slot 1: Foto Awal Registrasi */}
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Camera size={13} color="#818cf8" />
                                        <span>Foto Kondisi Awal (Saat Registrasi) *</span>
                                    </label>
                                    <input
                                        ref={fotoAwalInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFotoAwalChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        className="aset-file-dropzone"
                                        onClick={() => fotoAwalInputRef.current?.click()}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <Camera size={15} color="#818cf8" style={{ flexShrink: 0 }} />
                                            <span style={{ fontSize: '11.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {fotoAwalFile ? fotoAwalFile.name : (fotoAwalPreview ? 'Foto Terpasang (Klik untuk Ganti)' : 'Pilih / Ambil Foto Awal...')}
                                            </span>
                                        </div>
                                        <span className="aset-file-dropzone-badge">
                                            Browse
                                        </span>
                                    </div>
                                    {fotoAwalPreview && (
                                        <div className="aset-file-preview-card">
                                            <img
                                                src={resolveMediaUrl(fotoAwalPreview)}
                                                alt="Preview Foto Awal"
                                                style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '11px', fontWeight: 600 }}>Foto Registrasi Awal</div>
                                                <div style={{ fontSize: '10px', opacity: 0.75 }}>
                                                    {fotoAwalFile ? `${(fotoAwalFile.size / 1024).toFixed(0)} KB` : 'Tersimpan di server'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFotoAwal}
                                                className="aset-modal-close"
                                                style={{ color: '#ef4444', padding: '4px' }}
                                                title="Hapus Foto"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Slot 2: Foto Terkini dari Unit */}
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <ImageIcon size={13} color="#34d399" />
                                        <span>Foto Kondisi Terkini (Unit / Ruangan)</span>
                                        <span style={{ fontSize: '10px', opacity: 0.75 }}>(Opsional)</span>
                                    </label>
                                    <input
                                        ref={fotoTerkiniInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFotoTerkiniChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        className="aset-file-dropzone"
                                        onClick={() => fotoTerkiniInputRef.current?.click()}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <ImageIcon size={15} color="#34d399" style={{ flexShrink: 0 }} />
                                            <span style={{ fontSize: '11.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {fotoTerkiniFile ? fotoTerkiniFile.name : (fotoTerkiniPreview ? 'Foto Terpasang (Klik untuk Ganti)' : 'Pilih / Ambil Foto Terkini...')}
                                            </span>
                                        </div>
                                        <span className="aset-file-dropzone-badge">
                                            Browse
                                        </span>
                                    </div>
                                    {fotoTerkiniPreview && (
                                        <div className="aset-file-preview-card">
                                            <img
                                                src={resolveMediaUrl(fotoTerkiniPreview)}
                                                alt="Preview Foto Terkini"
                                                style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>Foto Kondisi Terkini</div>
                                                <div style={{ fontSize: '10px', opacity: 0.75 }}>
                                                    {fotoTerkiniFile ? `${(fotoTerkiniFile.size / 1024).toFixed(0)} KB` : 'Tersimpan di server'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFotoTerkini}
                                                className="aset-modal-close"
                                                style={{ color: '#ef4444', padding: '4px' }}
                                                title="Hapus Foto"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Baris 7: Catatan & Rekomendasi */}
                        <div className="aset-form-grid-2" style={{ marginTop: '12px' }}>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Rekomendasi Tindakan (Opsional)</label>
                                <textarea
                                    className="aset-form-input"
                                    rows="2"
                                    placeholder="Contoh: Perlu pembersihan filter rutin tiap 3 bulan"
                                    value={formData.rekomendasi_tindakan}
                                    onChange={e => setFormData({ ...formData, rekomendasi_tindakan: e.target.value })}
                                />
                            </div>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Catatan Tambahan (Opsional)</label>
                                <textarea
                                    className="aset-form-input"
                                    rows="2"
                                    placeholder="Catatan inventaris ruangan / keterangan garansi"
                                    value={formData.catatan}
                                    onChange={e => setFormData({ ...formData, catatan: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="aset-modal-footer">
                        <button type="button" className="btn-aset btn-aset-secondary" onClick={onClose} disabled={loading}>
                            Batal
                        </button>
                        <button type="submit" className="btn-aset btn-aset-primary" disabled={loading}>
                            <Save size={14} />
                            {loading ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Daftarkan Aset')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
