import { useState, useEffect } from 'react';
import { useToastState } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';

const formatRupiah = (value) => {
    const num = Number(value);
    if (!num) return '-';
    return num.toLocaleString('id-ID', { minimumFractionDigits: 2 });
};

const formatTanggal = (value) => {
    return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const emptyItem = { akun: '', keterangan: '', debit: '', kredit: '' };

const generateNomor = () => {
    const now = new Date();
    return `JRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getTime()).slice(-4)}`;
};

export default function EntriJurnal() {
    const [akunList, setAkunList] = useState([]);
    const [jurnalList, setJurnalList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('list'); // list | form | detail
    const [selectedJurnal, setSelectedJurnal] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useToastState('error');
    const [success, setSuccess] = useToastState('success');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const [form, setForm] = useState({
        nomor_jurnal: generateNomor(),
        tanggal: new Date().toISOString().split('T')[0],
        keterangan: '',
        status: 'draft',
        items: [{ ...emptyItem }, { ...emptyItem }],
    });

    useEffect(() => {
        fetchData();
    }, [page, pageSize]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [akunRes, jurnalRes] = await Promise.all([
                api.get('/keuangan/akun/'),
                api.get('/keuangan/jurnal/', { params: pageParams(page, pageSize) }),
            ]);
            setAkunList(getResults(akunRes.data));
            setJurnalList(getResults(jurnalRes.data));
            setTotal(getCount(jurnalRes.data));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const totalDebit = form.items.reduce((a, b) => a + (Number(b.debit) || 0), 0);
    const totalKredit = form.items.reduce((a, b) => a + (Number(b.kredit) || 0), 0);
    const isBalanced = totalDebit === totalKredit && totalDebit > 0;

    const handleItemChange = (index, field, value) => {
        const items = [...form.items];
        items[index] = { ...items[index], [field]: value };
        setForm({ ...form, items });
    };

    const addItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });

    const removeItem = (index) => {
        if (form.items.length <= 2) return;
        setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
    };

    const handleSave = async () => {
        setError('');
        if (!form.nomor_jurnal || !form.tanggal || !form.keterangan) {
            setError('Nomor jurnal, tanggal, dan keterangan wajib diisi.');
            return;
        }
        const validItems = form.items.filter(i => i.akun && (Number(i.debit) > 0 || Number(i.kredit) > 0));
        if (validItems.length < 2) {
            setError('Minimal 2 baris item jurnal dengan akun dan nilai.');
            return;
        }
        if (!isBalanced) {
            setError(`Jurnal tidak seimbang! Total Debit: ${formatRupiah(totalDebit)}, Total Kredit: ${formatRupiah(totalKredit)}`);
            return;
        }
        setSaving(true);
        try {
            await api.post('/keuangan/jurnal/', {
                ...form,
                items: validItems.map(i => ({
                    akun: i.akun,
                    keterangan: i.keterangan,
                    debit: Number(i.debit) || 0,
                    kredit: Number(i.kredit) || 0,
                })),
            });
            setSuccess('Jurnal berhasil disimpan!');
            setView('list');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch {
            setError('Gagal menyimpan jurnal. Pastikan nomor jurnal belum dipakai.');
        } finally { setSaving(false); }
    };

    const handlePosting = async (id) => {
        try {
            await api.post(`/keuangan/jurnal/${id}/posting/`);
            setSuccess('Jurnal berhasil diposting!');
            fetchData();
            if (selectedJurnal?.id === id) {
                const res = await api.get(`/keuangan/jurnal/${id}/`);
                setSelectedJurnal(res.data);
            }
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError(e.response?.data?.error || 'Gagal posting jurnal.');
            setTimeout(() => setError(''), 4000);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Hapus jurnal ini?')) return;
        try {
            await api.delete(`/keuangan/jurnal/${id}/`);
            setSuccess('Jurnal dihapus!');
            setView('list');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch { setError('Gagal menghapus jurnal.'); }
    };

    const openForm = () => {
        setForm({
            nomor_jurnal: generateNomor(),
            tanggal: new Date().toISOString().split('T')[0],
            keterangan: '',
            status: 'draft',
            items: [{ ...emptyItem }, { ...emptyItem }],
        });
        setError('');
        setView('form');
    };

    return (
        <div>
            <style>{`
                .form-input, .form-select, .form-textarea {
                    width: 100%; padding: 9px 12px; border: 1px solid #e2e8f0;
                    border-radius: 7px; font-size: 13px; font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b; background: #fff; outline: none; transition: border-color 0.15s;
                }
                .form-input:focus, .form-select:focus, .form-textarea:focus {
                    border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08);
                }
                .primary-btn {
                    padding: 9px 20px; background: #1a4731; color: #fff; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .primary-btn:hover { background: #2d6a4f; }
                .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                .secondary-btn {
                    padding: 9px 18px; background: #f1f5f9; color: #475569;
                    border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;
                    font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .secondary-btn:hover { background: #e2e8f0; }

                .gold-btn {
                    padding: 9px 20px; background: #c9a84c; color: #fff; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s;
                }
                .gold-btn:hover { background: #b8923d; }

                .danger-btn {
                    padding: 9px 18px; background: #fff; color: #dc2626;
                    border: 1px solid #fca5a5; border-radius: 8px; font-size: 14px;
                    font-weight: 600; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .danger-btn:hover { background: #fee2e2; }

                .jurnal-table { width: 100%; border-collapse: collapse; }
                .jurnal-table thead th {
                    padding: 11px 16px; text-align: left; font-size: 12px; font-weight: 700;
                    color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
                    border-bottom: 2px solid #e2e8f0; background: #f8fafc;
                }
                .jurnal-table tbody td {
                    padding: 12px 16px; font-size: 13px; color: #334155;
                    border-bottom: 1px solid #f1f5f9; vertical-align: middle;
                }
                .jurnal-table tbody tr:hover td { background: #f8fafb; cursor: pointer; }

                .item-table { width: 100%; border-collapse: collapse; }
                .item-table th {
                    padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700;
                    color: #64748b; text-transform: uppercase; background: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                }
                .item-table td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9; }
                .page-btn,.page-size{height:34px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;padding:0 10px}
                .page-btn{min-width:34px;cursor:pointer}.page-btn:disabled{opacity:.45;cursor:not-allowed}
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Entri Jurnal</h1>
                    <p style={styles.subtitle}>{jurnalList.length} jurnal tercatat</p>
                </div>
                {view === 'list' && <button className="primary-btn" onClick={openForm}>+ Jurnal Baru</button>}
                {view !== 'list' && <button className="secondary-btn" onClick={() => setView('list')}>← Kembali</button>}
            </div>

            {success && <div style={styles.alertSuccess}>{success}</div>}
            {error && <div style={styles.alertError}>{error}</div>}

            {/* LIST VIEW */}
            {view === 'list' && (
                <div style={styles.card}>
                    {loading ? (
                        <div style={styles.empty}>Memuat data...</div>
                    ) : jurnalList.length === 0 ? (
                        <div style={styles.empty}>Belum ada jurnal. Klik "+ Jurnal Baru" untuk mulai.</div>
                    ) : (
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="jurnal-table">
                            <thead>
                                <tr>
                                    <th>No. Jurnal</th>
                                    <th>Tanggal</th>
                                    <th>Keterangan</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Total Debit</th>
                                    <th style={{ textAlign: 'right' }}>Total Kredit</th>
                                    <th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jurnalList.map(j => (
                                    <tr key={j.id} onClick={() => { setSelectedJurnal(j); setView('detail'); }}>
                                        <td style={{ fontWeight: '600', color: '#1a4731', fontFamily: 'monospace' }}>{j.nomor_jurnal}</td>
                                        <td>{formatTanggal(j.tanggal)}</td>
                                        <td>{j.keterangan}</td>
                                        <td>
                                            <span style={j.status === 'posted' ? styles.postedBadge : styles.draftBadge}>
                                                {j.status === 'posted' ? '✓ Diposting' : '○ Draft'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatRupiah(j.total_debit)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatRupiah(j.total_kredit)}</td>
                                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                {j.status === 'draft' && (
                                                    <button className="gold-btn" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={() => handlePosting(j.id)}>
                                                        Posting
                                                    </button>
                                                )}
                                                {j.status === 'draft' && (
                                                    <button className="danger-btn" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={() => handleDelete(j.id)}>
                                                        Hapus
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table></div>
                    )}
                    <SimplePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="page-btn" selectClassName="page-size" />
                </div>
            )}

            {/* FORM VIEW */}
            {view === 'form' && (
                <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Jurnal Baru</h2>

                    <div style={styles.formGrid3}>
                        <div style={styles.field}>
                            <label style={styles.label}>Nomor Jurnal *</label>
                            <input className="form-input" value={form.nomor_jurnal} onChange={e => setForm({ ...form, nomor_jurnal: e.target.value })} />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Tanggal *</label>
                            <input className="form-input" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Status</label>
                            <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="draft">Draft</option>
                                <option value="posted">Langsung Posting</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ ...styles.field, marginBottom: '24px' }}>
                        <label style={styles.label}>Keterangan *</label>
                        <input className="form-input" placeholder="Deskripsi jurnal..." value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} />
                    </div>

                    {/* Items Table */}
                    <div style={styles.itemsCard}>
                        <div style={styles.itemsHeader}>
                            <span style={styles.sectionTitle}>Baris Jurnal</span>
                            <button className="secondary-btn" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={addItem}>+ Tambah Baris</button>
                        </div>
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="item-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '35%' }}>Akun</th>
                                    <th style={{ width: '30%' }}>Keterangan</th>
                                    <th style={{ width: '14%', textAlign: 'right' }}>Debit</th>
                                    <th style={{ width: '14%', textAlign: 'right' }}>Kredit</th>
                                    <th style={{ width: '7%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.items.map((item, i) => (
                                    <tr key={i}>
                                        <td>
                                            <select className="form-select" value={item.akun} onChange={e => handleItemChange(i, 'akun', e.target.value)}>
                                                <option value="">-- Pilih Akun --</option>
                                                {akunList.map(a => <option key={a.id} value={a.id}>{a.kode_akun} - {a.nama_akun}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <input className="form-input" placeholder="Keterangan..." value={item.keterangan} onChange={e => handleItemChange(i, 'keterangan', e.target.value)} />
                                        </td>
                                        <td>
                                            <input className="form-input" type="number" min="0" placeholder="0" value={item.debit} onChange={e => handleItemChange(i, 'debit', e.target.value)} style={{ textAlign: 'right' }} />
                                        </td>
                                        <td>
                                            <input className="form-input" type="number" min="0" placeholder="0" value={item.kredit} onChange={e => handleItemChange(i, 'kredit', e.target.value)} style={{ textAlign: 'right' }} />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}>×</button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Total Row */}
                                <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={2} style={{ padding: '10px 12px', fontWeight: '700', fontSize: '13px', color: '#1a2e1a' }}>Total</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', color: '#166534' }}>
                                        {formatRupiah(totalDebit)}
                                    </td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', color: '#991b1b' }}>
                                        {formatRupiah(totalKredit)}
                                    </td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table></div>

                        {/* Balance Indicator */}
                        <div style={{ padding: '12px 16px', background: isBalanced ? '#dcfce7' : '#fee2e2', borderTop: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: isBalanced ? '#166534' : '#991b1b' }}>
                                {isBalanced ? '✓ Jurnal seimbang' : `✗ Tidak seimbang — Selisih: ${formatRupiah(Math.abs(totalDebit - totalKredit))}`}
                            </span>
                        </div>
                    </div>

                    <div style={styles.btnRow}>
                        <button className="secondary-btn" onClick={() => setView('list')}>Batal</button>
                        <button className="primary-btn" onClick={handleSave} disabled={saving}>
                            {saving ? 'Menyimpan...' : 'Simpan Jurnal'}
                        </button>
                    </div>
                </div>
            )}

            {/* DETAIL VIEW */}
            {view === 'detail' && selectedJurnal && (
                <div style={styles.card}>
                    <div style={styles.detailHeader}>
                        <div>
                            <h2 style={styles.sectionTitle}>{selectedJurnal.nomor_jurnal}</h2>
                            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>{selectedJurnal.keterangan}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={selectedJurnal.status === 'posted' ? styles.postedBadge : styles.draftBadge}>
                                {selectedJurnal.status === 'posted' ? '✓ Diposting' : '○ Draft'}
                            </span>
                            {selectedJurnal.status === 'draft' && (
                                <button className="gold-btn" onClick={() => handlePosting(selectedJurnal.id)}>Posting</button>
                            )}
                            {selectedJurnal.status === 'draft' && (
                                <button className="danger-btn" onClick={() => handleDelete(selectedJurnal.id)}>Hapus</button>
                            )}
                        </div>
                    </div>

                    <div style={styles.detailMeta}>
                        <div><span style={styles.metaLabel}>Tanggal</span><span style={styles.metaValue}>{formatTanggal(selectedJurnal.tanggal)}</span></div>
                        <div><span style={styles.metaLabel}>Dibuat oleh</span><span style={styles.metaValue}>{selectedJurnal.created_by_name}</span></div>
                        <div><span style={styles.metaLabel}>Seimbang</span><span style={{ ...styles.metaValue, color: selectedJurnal.is_balanced ? '#166534' : '#dc2626' }}>{selectedJurnal.is_balanced ? '✓ Ya' : '✗ Tidak'}</span></div>
                    </div>

                    <table className="item-table">
                        <thead>
                            <tr>
                                <th>Akun</th>
                                <th>Keterangan</th>
                                <th style={{ textAlign: 'right' }}>Debit</th>
                                <th style={{ textAlign: 'right' }}>Kredit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedJurnal.items?.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ fontFamily: 'monospace', color: '#1a4731', fontWeight: '600' }}>
                                        {item.akun_detail?.kode_akun} - {item.akun_detail?.nama_akun}
                                    </td>
                                    <td style={{ color: '#64748b' }}>{item.keterangan || '-'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#166534', fontWeight: '600' }}>
                                        {Number(item.debit) > 0 ? formatRupiah(item.debit) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#991b1b', fontWeight: '600' }}>
                                        {Number(item.kredit) > 0 ? formatRupiah(item.kredit) : '-'}
                                    </td>
                                </tr>
                            ))}
                            <tr style={{ background: '#f8fafc' }}>
                                <td colSpan={2} style={{ padding: '10px 12px', fontWeight: '700' }}>Total</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', color: '#166534' }}>{formatRupiah(selectedJurnal.total_debit)}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', color: '#991b1b' }}>{formatRupiah(selectedJurnal.total_kredit)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const styles = {
    header: { marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: '24px', fontWeight: '700', color: '#1a2e1a' },
    subtitle: { fontSize: '14px', color: '#64748b', marginTop: '4px' },
    alertSuccess: { background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', padding: '12px 16px', fontSize: '14px', marginBottom: '16px' },
    alertError: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', padding: '12px 16px', fontSize: '14px', marginBottom: '16px' },
    card: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', padding: '28px' },
    empty: { padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' },
    sectionTitle: { fontSize: '16px', fontWeight: '700', color: '#1a2e1a', marginBottom: '20px', display: 'block' },
    formGrid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px' },
    label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
    itemsCard: { border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '24px' },
    itemsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' },
    btnRow: { display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' },
    draftBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: '99px', background: '#fef9c3', color: '#854d0e', fontSize: '12px', fontWeight: '600' },
    postedBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: '99px', background: '#dcfce7', color: '#166534', fontSize: '12px', fontWeight: '600' },
    detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
    detailMeta: { display: 'flex', gap: '32px', marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px' },
    metaLabel: { fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' },
    metaValue: { fontSize: '14px', fontWeight: '600', color: '#1e293b' },
};
