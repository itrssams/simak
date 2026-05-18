import { useState, useEffect } from 'react';
import api from '../../api/axiosConfig';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';

const formatRupiah = (value) => {
    return 'Rp ' + Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2 });
};

const formatTanggal = (value) => {
    return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const LABEL_KATEGORI = {
    operasi: 'Operasi',
    investasi: 'Investasi',
    keuangan: 'Keuangan',
    tidak_diklasifikasi: 'Tidak Diklasifikasi',
};

export default function ListTransaksi() {
    const [transaksi, setTransaksi] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filterJenis, setFilterJenis] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchTransaksi();
    }, [page, pageSize]);

    const fetchTransaksi = async () => {
        setLoading(true);
        try {
            const res = await api.get('/keuangan/transaksi/', { params: pageParams(page, pageSize) });
            setTransaksi(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (id) => {
        setDeleteId(id);
        setConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            await api.delete(`/keuangan/transaksi/${deleteId}/`);
            setTransaksi(transaksi.filter((t) => t.id !== deleteId));
        } catch (e) {
            console.error(e);
        } finally {
            setConfirmOpen(false);
            setDeleteId(null);
        }
    };

    const filtered = transaksi.filter((t) => {
        const matchSearch = t.keterangan.toLowerCase().includes(search.toLowerCase()) ||
            (t.nomor_referensi || '').toLowerCase().includes(search.toLowerCase());
        const matchJenis = filterJenis ? t.jenis === filterJenis : true;
        return matchSearch && matchJenis;
    });

    const totalMasuk = filtered.filter(t => t.jenis === 'masuk').reduce((a, b) => a + Number(b.jumlah), 0);
    const totalKeluar = filtered.filter(t => t.jenis === 'keluar').reduce((a, b) => a + Number(b.jumlah), 0);

    return (
        <div>
            <style>{`
                .search-input {
                    padding: 9px 14px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b;
                    outline: none;
                    width: 280px;
                    transition: border-color 0.15s;
                }
                .search-input:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }

                .filter-select {
                    padding: 9px 14px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    color: #1e293b;
                    outline: none;
                    background: #fff;
                    transition: border-color 0.15s;
                }
                .filter-select:focus { border-color: #2d6a4f; }

                .list-table { width: 100%; border-collapse: collapse; }
                .list-table thead tr { background: #f8fafc; }
                .list-table thead th {
                    padding: 12px 16px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 2px solid #e2e8f0;
                }
                .list-table tbody tr { transition: background 0.1s; }
                .list-table tbody tr:hover td { background: #f8fafb; }
                .list-table tbody td {
                    padding: 12px 16px;
                    font-size: 13px;
                    color: #334155;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                }

                .badge-masuk {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 99px;
                    background: #dcfce7;
                    color: #166534;
                    font-size: 12px;
                    font-weight: 600;
                }
                .badge-keluar {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 99px;
                    background: #fee2e2;
                    color: #991b1b;
                    font-size: 12px;
                    font-weight: 600;
                }

                .delete-btn {
                    padding: 5px 12px;
                    background: #fff;
                    border: 1px solid #fca5a5;
                    border-radius: 6px;
                    color: #dc2626;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    transition: background 0.15s;
                }
                .delete-btn:hover { background: #fee2e2; }

                .confirm-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999;
                }
                .confirm-box {
                    background: #fff;
                    border-radius: 14px;
                    padding: 32px;
                    width: 360px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                }
                .confirm-yes {
                    padding: 10px 24px;
                    background: #dc2626;
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .confirm-yes:hover { background: #b91c1c; }
                .confirm-no {
                    padding: 10px 24px;
                    background: #f1f5f9;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .confirm-no:hover { background: #e2e8f0; }
                .page-btn,.page-size{height:34px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;padding:0 10px}
                .page-btn{min-width:34px;cursor:pointer}.page-btn:disabled{opacity:.45;cursor:not-allowed}
            `}</style>

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>List Transaksi</h1>
                    <p style={styles.subtitle}>{transaksi.length} transaksi ditemukan</p>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={styles.summaryRow}>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Total Kas Masuk</div>
                    <div style={{ ...styles.summaryValue, color: '#166534' }}>{formatRupiah(totalMasuk)}</div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Total Kas Keluar</div>
                    <div style={{ ...styles.summaryValue, color: '#991b1b' }}>{formatRupiah(totalKeluar)}</div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Selisih</div>
                    <div style={{ ...styles.summaryValue, color: (totalMasuk - totalKeluar) >= 0 ? '#166534' : '#991b1b' }}>
                        {formatRupiah(totalMasuk - totalKeluar)}
                    </div>
                </div>
            </div>

            {/* Table Card */}
            <div style={styles.tableCard}>
                {/* Filter Bar */}
                <div style={styles.filterBar}>
                    <input
                        className="search-input"
                        type="text"
                        placeholder="Cari keterangan / no. referensi..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select className="filter-select" value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)}>
                        <option value="">Semua Jenis</option>
                        <option value="masuk">Kas Masuk</option>
                        <option value="keluar">Kas Keluar</option>
                    </select>
                </div>

                {loading ? (
                    <div style={styles.emptyState}>Memuat data...</div>
                ) : filtered.length === 0 ? (
                    <div style={styles.emptyState}>Tidak ada transaksi ditemukan.</div>
                ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}><table className="list-table">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>No. Referensi</th>
                                <th>Keterangan</th>
                                <th>Kategori</th>
                                <th>Akun</th>
                                <th>Jenis</th>
                                <th style={{ textAlign: 'right' }}>Jumlah</th>
                                <th style={{ textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((t) => (
                                <tr key={t.id}>
                                    <td>{formatTanggal(t.tanggal)}</td>
                                    <td style={{ color: '#94a3b8' }}>{t.nomor_referensi || '-'}</td>
                                    <td style={{ maxWidth: '200px' }}>{t.keterangan}</td>
                                    <td>
                                        <span style={styles.kategoriTag}>
                                            {LABEL_KATEGORI[t.kategori_arus] || t.kategori_arus}
                                        </span>
                                    </td>
                                    <td style={{ color: '#475569' }}>
                                        {t.akun_detail ? `${t.akun_detail.kode_akun} - ${t.akun_detail.nama_akun}` : '-'}
                                    </td>
                                    <td>
                                        <span className={t.jenis === 'masuk' ? 'badge-masuk' : 'badge-keluar'}>
                                            {t.jenis === 'masuk' ? '↑ Masuk' : '↓ Keluar'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '600', color: t.jenis === 'masuk' ? '#166534' : '#991b1b' }}>
                                        {t.jenis === 'keluar' ? '-' : ''}{formatRupiah(t.jumlah)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button className="delete-btn" onClick={() => handleDeleteClick(t.id)}>
                                            Hapus
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table></div>
                )}
                <SimplePagination page={page} pageSize={pageSize} total={search || filterJenis ? filtered.length : total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="page-btn" selectClassName="page-size" />
            </div>

            {/* Confirm Delete Modal */}
            {confirmOpen && (
                <div className="confirm-overlay">
                    <div className="confirm-box">
                        <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>
                            Hapus Transaksi?
                        </h3>
                        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
                            Transaksi ini akan dihapus permanen dan tidak bisa dikembalikan.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button className="confirm-no" onClick={() => setConfirmOpen(false)}>Batal</button>
                            <button className="confirm-yes" onClick={handleDeleteConfirm}>Ya, Hapus</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    header: { marginBottom: '24px' },
    title: { fontSize: '24px', fontWeight: '700', color: '#1a2e1a' },
    subtitle: { fontSize: '14px', color: '#64748b', marginTop: '4px' },
    summaryRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px',
    },
    summaryCard: {
        background: '#fff',
        borderRadius: '12px',
        padding: '20px 24px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        border: '1px solid #f1f5f9',
    },
    summaryLabel: { fontSize: '13px', color: '#94a3b8', fontWeight: '500', marginBottom: '6px' },
    summaryValue: { fontSize: '20px', fontWeight: '700' },
    tableCard: {
        background: '#fff',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        border: '1px solid #f1f5f9',
    },
    filterBar: {
        display: 'flex',
        gap: '12px',
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9',
        flexWrap: 'wrap',
    },
    emptyState: {
        padding: '60px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '14px',
    },
    kategoriTag: {
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '6px',
        background: '#e8f5ee',
        color: '#1a4731',
        fontSize: '11px',
        fontWeight: '600',
    },
};
