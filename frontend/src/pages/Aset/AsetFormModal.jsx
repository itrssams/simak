import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, Package, Lock, Image as ImageIcon, Camera, Trash2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DateField from '../../components/DateField';
import useBodyScrollLock from './useBodyScrollLock';
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

export default function AsetFormModal({ isOpen, onClose, onSuccess, initialData = null }) {
    const toast = useToast();
    const isEdit = Boolean(initialData);

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
                setHargaDisplay('');
                setFotoAwalPreview(null);
                setFotoTerkiniPreview(null);
            }
            setFotoAwalFile(null);
            setFotoTerkiniFile(null);
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
        } catch (err) {
            toast.error('Gagal memuat master data aset.');
        }
    };

    // Saat jenis aset dipilih, OTOMATIS menentukan Kelas Aset & Masa Manfaat
    const handleJenisChange = (e) => {
        const val = e.target.value;
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

    const handleUnitChange = (e) => {
        const val = e.target.value;
        setFormData(prev => ({
            ...prev,
            unit: val,
            ruangan: '', // reset ruangan jika unit berubah
        }));
    };

    const handleRuanganChange = (e) => {
        const val = e.target.value;
        const rObj = ruanganList.find(r => String(r.id) === String(val));
        setFormData(prev => ({
            ...prev,
            ruangan: val,
            lokasi_teks: rObj ? rObj.nama : prev.lokasi_teks,
        }));
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
        setLoading(true);
        try {
            const data = new FormData();
            // Field teks yang harus tetap dikirim meskipun string kosong ""
            // agar bisa dikosongkan/direset oleh pengguna saat edit (misal rekomendasi tindakan)
            const textFieldsAllowedBlank = [
                'rekomendasi_tindakan',
                'catatan',
                'spesifikasi',
                'nomor_seri',
                'nomor_registrasi',
                'lokasi_teks',
                'merk',
            ];

            Object.keys(formData).forEach(key => {
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
                toast.success('Data aset berhasil diperbarui.');
            } else {
                await api.post('/aset/aset/', data, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success('Aset baru berhasil didaftarkan.');
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Gagal menyimpan data aset.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredRuangan = formData.unit
        ? ruanganList.filter(r => String(r.unit) === String(formData.unit))
        : ruanganList;

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
                        {/* Baris 1: Jenis Aset & Kode Aset */}
                        <div className="aset-form-grid-2">
                            <div className="aset-form-group">
                                <label className="aset-form-label">Jenis Barang / Klasifikasi *</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.jenis}
                                    onChange={handleJenisChange}
                                    required
                                >
                                    <option value="">-- Pilih Jenis Barang --</option>
                                    {jenisList.map(j => (
                                        <option key={j.id} value={j.id}>
                                            {j.nama} [{j.kode}] - {j.kategori_nama || j.kategori_kode}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">
                                    Kode Aset Fisik <span style={{ fontSize: '11px', color: '#94a3b8' }}>(Kosongkan untuk auto-generate)</span>
                                </label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: AM.USG.0001"
                                    value={formData.kode_aset}
                                    onChange={e => setFormData({ ...formData, kode_aset: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Baris 2: Deskripsi, Merek, Spesifikasi */}
                        <div className="aset-form-grid-3">
                            <div className="aset-form-group">
                                <label className="aset-form-label">Deskripsi / Nama Barang *</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: AC Daikin / Tempat Tidur Pasien"
                                    value={formData.deskripsi}
                                    onChange={e => setFormData({ ...formData, deskripsi: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Merek (Merk)</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: Sharp / Daikin / Philips / Mindray"
                                    value={formData.merk}
                                    onChange={e => setFormData({ ...formData, merk: e.target.value })}
                                />
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Spesifikasi / Kapasitas</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: 2 PK / 32 inch / Electric 3 Crank"
                                    value={formData.spesifikasi}
                                    onChange={e => setFormData({ ...formData, spesifikasi: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Baris 2.5: Nomor Seri, Nomor Registrasi & Toggle Kalibrasi */}
                        <div className="aset-form-section aset-form-grid-3" style={{ padding: '12px', margin: '0 0 14px' }}>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Nomor Seri / S/N</label>
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
                                <label className="aset-form-label">Unit Penanggung Jawab *</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.unit}
                                    onChange={handleUnitChange}
                                    required
                                >
                                    <option value="">-- Pilih Unit --</option>
                                    {unitList.map(u => (
                                        <option key={u.id} value={u.id}>{u.nama}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Ruangan Master</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.ruangan}
                                    onChange={handleRuanganChange}
                                >
                                    <option value="">-- Pilih Ruangan --</option>
                                    {filteredRuangan.map(r => (
                                        <option key={r.id} value={r.id}>{r.nama}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Lokasi Akurat / Keterangan Ruang</label>
                                <input
                                    type="text"
                                    className="aset-form-input"
                                    placeholder="Contoh: Ruang VIP 1 / Nurse Station"
                                    value={formData.lokasi_teks}
                                    onChange={e => setFormData({ ...formData, lokasi_teks: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Baris 4: Kelayakan, Status Aset, Kepemilikan */}
                        <div className="aset-form-grid-3">
                            <div className="aset-form-group">
                                <label className="aset-form-label">Tingkat Kelayakan</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.status_kelayakan}
                                    onChange={e => setFormData({ ...formData, status_kelayakan: e.target.value })}
                                >
                                    <option value="A">Sangat Layak (A)</option>
                                    <option value="B">Layak (B)</option>
                                    <option value="C">Cukup Layak (C)</option>
                                    <option value="D">Kurang Layak (D)</option>
                                    <option value="E">Tidak Layak (E)</option>
                                </select>
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Status Operasional</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.status_aset}
                                    onChange={e => setFormData({ ...formData, status_aset: e.target.value })}
                                >
                                    <option value="aktif">Aktif</option>
                                    <option value="dalam_perbaikan">Dalam Perbaikan</option>
                                    <option value="tidak_digunakan">Tidak Digunakan</option>
                                    <option value="afkir">Afkir / Dihapuskan</option>
                                </select>
                            </div>
                            <div className="aset-form-group">
                                <label className="aset-form-label">Status Kepemilikan</label>
                                <select
                                    className="aset-form-select"
                                    value={formData.status_kepemilikan}
                                    onChange={e => setFormData({ ...formData, status_kepemilikan: e.target.value })}
                                >
                                    <option value="milik_sendiri">Milik Sendiri</option>
                                    <option value="sewa">Sewa</option>
                                    <option value="pinjam_pakai">Pinjam Pakai</option>
                                    <option value="hibah">Hibah</option>
                                    <option value="kso">KSO</option>
                                </select>
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
                                    <label className="aset-form-label">Tanggal Perolehan</label>
                                    <DateField
                                        value={formData.bulan_perolehan}
                                        onChange={val => setFormData({ ...formData, bulan_perolehan: val })}
                                        placeholder="Pilih tanggal..."
                                    />
                                </div>
                                <div className="aset-form-group" style={{ margin: 0 }}>
                                    <label className="aset-form-label">Harga Perolehan</label>
                                    <input
                                        type="text"
                                        className="aset-form-input"
                                        style={{ height: '38px', fontWeight: 600, letterSpacing: '0.02em' }}
                                        placeholder="Rp 0"
                                        value={hargaDisplay}
                                        onChange={handleHargaChange}
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
                                <label className="aset-form-label">Rekomendasi Tindakan</label>
                                <textarea
                                    className="aset-form-input"
                                    rows="2"
                                    placeholder="Contoh: Perlu pembersihan filter rutin tiap 3 bulan"
                                    value={formData.rekomendasi_tindakan}
                                    onChange={e => setFormData({ ...formData, rekomendasi_tindakan: e.target.value })}
                                />
                            </div>
                            <div className="aset-form-group" style={{ margin: 0 }}>
                                <label className="aset-form-label">Catatan Tambahan</label>
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
