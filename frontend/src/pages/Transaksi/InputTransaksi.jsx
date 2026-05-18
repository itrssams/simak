import { useState, useEffect } from 'react';
import { useToastState } from '../../context/ToastContext';
import api from '../../api/axiosConfig';

const KATEGORI_ARUS = [
    { value: 'operasi', label: 'Aktivitas Operasi' },
    { value: 'investasi', label: 'Aktivitas Investasi & Kejadian Luar Biasa' },
    { value: 'keuangan', label: 'Aktivitas Keuangan' },
    { value: 'tidak_diklasifikasi', label: 'Tidak Diklasifikasi' },
];

const SUB_KATEGORI = {
    operasi: [
        { value: 'tagihan_muka_pelanggan', label: 'Tagihan Muka yang Diterima dari Pelanggan', jenis: 'masuk' },
        { value: 'kas_masuk_operasi', label: 'Uang Kas yang Diterima dari Kegiatan Operasi', jenis: 'masuk' },
        { value: 'tagihan_muka_pemasok', label: 'Tagihan Muka yang Dibuat untuk Pemasok', jenis: 'keluar' },
        { value: 'kas_keluar_operasi', label: 'Uang Kas yang Dibayar untuk Kegiatan Operasi', jenis: 'keluar' },
    ],
    investasi: [
        { value: 'kas_masuk_investasi', label: 'Kas Masuk Investasi', jenis: 'masuk' },
        { value: 'kas_keluar_investasi', label: 'Kas Keluar Investasi', jenis: 'keluar' },
    ],
    keuangan: [
        { value: 'kas_masuk_keuangan', label: 'Kas Masuk Keuangan', jenis: 'masuk' },
        { value: 'kas_keluar_keuangan', label: 'Kas Keluar Keuangan', jenis: 'keluar' },
    ],
    tidak_diklasifikasi: [
        { value: 'kas_masuk_lainnya', label: 'Kas Masuk Lainnya', jenis: 'masuk' },
        { value: 'kas_keluar_lainnya', label: 'Kas Keluar Lainnya', jenis: 'keluar' },
    ],
};

const initialForm = {
    tanggal: new Date().toISOString().split('T')[0],
    nomor_referensi: '',
    keterangan: '',
    kategori_arus: '',
    sub_kategori: '',
    jenis: '',
    akun: '',
    jumlah: '',
};

export default function InputTransaksi() {
    const [form, setForm] = useState(initialForm);
    const [akunList, setAkunList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');

    useEffect(() => {
        api.get('/keuangan/akun/').then((res) => setAkunList(res.data));
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'kategori_arus') {
            setForm({ ...form, kategori_arus: value, sub_kategori: '', jenis: '' });
            return;
        }

        if (name === 'sub_kategori') {
            const sub = SUB_KATEGORI[form.kategori_arus]?.find((s) => s.value === value);
            setForm({ ...form, sub_kategori: value, jenis: sub?.jenis || '' });
            return;
        }

        setForm({ ...form, [name]: value });
    };

    const handleSubmit = async () => {
        setError('');
        setSuccess('');

        if (!form.tanggal || !form.keterangan || !form.kategori_arus || !form.sub_kategori || !form.akun || !form.jumlah) {
            setError('Semua field wajib diisi kecuali Nomor Referensi.');
            return;
        }

        setLoading(true);
        try {
            await api.post('/keuangan/transaksi/', {
                ...form,
                jumlah: parseFloat(form.jumlah),
            });
            setSuccess('Transaksi berhasil disimpan!');
            setForm(initialForm);
        } catch (e) {
            setError('Gagal menyimpan transaksi. Periksa kembali data Anda.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const subKategoriList = SUB_KATEGORI[form.kategori_arus] || [];

    return (
        <div>
            <style>{`
                .form-input, .form-select, .form-textarea {
                    width: 100%;
                    padding: 10px 14px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b;
                    background: #fff;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .form-input:focus, .form-select:focus, .form-textarea:focus {
                    border-color: #2d6a4f;
                    box-shadow: 0 0 0 3px rgba(45,106,79,0.08);
                }
                .form-textarea { resize: vertical; min-height: 80px; }

                .submit-btn {
                    padding: 12px 32px;
                    background: #1a4731;
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .submit-btn:hover { background: #2d6a4f; }
                .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .reset-btn {
                    padding: 12px 24px;
                    background: #f1f5f9;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .reset-btn:hover { background: #e2e8f0; }
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Input Transaksi</h1>
                    <p style={styles.subtitle}>Tambah transaksi keuangan baru</p>
                </div>
            </div>

            {/* Form Card */}
            <div style={styles.card}>

                {/* Alert */}
                {success && <div style={styles.alertSuccess}>{success}</div>}
                {error && <div style={styles.alertError}>{error}</div>}

                <div style={styles.grid2}>
                    {/* Tanggal */}
                    <div style={styles.field}>
                        <label style={styles.label}>Tanggal <span style={styles.required}>*</span></label>
                        <input className="form-input" type="date" name="tanggal" value={form.tanggal} onChange={handleChange} />
                    </div>

                    {/* Nomor Referensi */}
                    <div style={styles.field}>
                        <label style={styles.label}>Nomor Referensi</label>
                        <input className="form-input" type="text" name="nomor_referensi" placeholder="Contoh: INV-001" value={form.nomor_referensi} onChange={handleChange} />
                    </div>
                </div>

                {/* Keterangan */}
                <div style={styles.field}>
                    <label style={styles.label}>Keterangan <span style={styles.required}>*</span></label>
                    <textarea className="form-textarea" name="keterangan" placeholder="Deskripsi transaksi..." value={form.keterangan} onChange={handleChange} />
                </div>

                <div style={styles.grid2}>
                    {/* Kategori Arus */}
                    <div style={styles.field}>
                        <label style={styles.label}>Kategori Arus Kas <span style={styles.required}>*</span></label>
                        <select className="form-select" name="kategori_arus" value={form.kategori_arus} onChange={handleChange}>
                            <option value="">-- Pilih Kategori --</option>
                            {KATEGORI_ARUS.map((k) => (
                                <option key={k.value} value={k.value}>{k.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sub Kategori */}
                    <div style={styles.field}>
                        <label style={styles.label}>Sub Kategori <span style={styles.required}>*</span></label>
                        <select className="form-select" name="sub_kategori" value={form.sub_kategori} onChange={handleChange} disabled={!form.kategori_arus}>
                            <option value="">-- Pilih Sub Kategori --</option>
                            {subKategoriList.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={styles.grid2}>
                    {/* Jenis (auto) */}
                    <div style={styles.field}>
                        <label style={styles.label}>Jenis Transaksi</label>
                        <div style={{
                            ...styles.jenisBadge,
                            background: form.jenis === 'masuk' ? '#dcfce7' : form.jenis === 'keluar' ? '#fee2e2' : '#f1f5f9',
                            color: form.jenis === 'masuk' ? '#166534' : form.jenis === 'keluar' ? '#991b1b' : '#94a3b8',
                        }}>
                            {form.jenis === 'masuk' ? '↑ Kas Masuk' : form.jenis === 'keluar' ? '↓ Kas Keluar' : 'Otomatis terisi'}
                        </div>
                    </div>

                    {/* Akun */}
                    <div style={styles.field}>
                        <label style={styles.label}>Akun <span style={styles.required}>*</span></label>
                        <select className="form-select" name="akun" value={form.akun} onChange={handleChange}>
                            <option value="">-- Pilih Akun --</option>
                            {akunList.map((a) => (
                                <option key={a.id} value={a.id}>{a.kode_akun} - {a.nama_akun}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Jumlah */}
                <div style={styles.field}>
                    <label style={styles.label}>Jumlah (Rp) <span style={styles.required}>*</span></label>
                    <input
                        className="form-input"
                        type="number"
                        name="jumlah"
                        placeholder="0"
                        min="0"
                        value={form.jumlah}
                        onChange={handleChange}
                        style={{ fontSize: '18px', fontWeight: '600' }}
                    />
                </div>

                {/* Buttons */}
                <div style={styles.btnRow}>
                    <button className="reset-btn" onClick={() => { setForm(initialForm); setSuccess(''); setError(''); }}>
                        Reset
                    </button>
                    <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Menyimpan...' : 'Simpan Transaksi'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    header: {
        marginBottom: '28px',
    },
    title: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#1a2e1a',
    },
    subtitle: {
        fontSize: '14px',
        color: '#64748b',
        marginTop: '4px',
    },
    card: {
        background: '#fff',
        borderRadius: '14px',
        padding: '32px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        border: '1px solid #f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '800px',
    },
    grid2: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    label: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#475569',
    },
    required: {
        color: '#ef4444',
    },
    jenisBadge: {
        padding: '10px 14px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        border: '1px solid transparent',
    },
    btnRow: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        paddingTop: '8px',
        borderTop: '1px solid #f1f5f9',
    },
    alertSuccess: {
        background: '#dcfce7',
        border: '1px solid #86efac',
        borderRadius: '8px',
        color: '#166534',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
    },
    alertError: {
        background: '#fee2e2',
        border: '1px solid #fca5a5',
        borderRadius: '8px',
        color: '#991b1b',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
    },
};