import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus2, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DebouncedSearchInput from '../../components/DebouncedSearchInput';
import TableSkeleton from '../../components/TableSkeleton';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './CatatanUtangObatBhp.css';

const VENDOR_CATEGORIES = [
    'OBAT DAN BHP',
    'ALAT KESEHATAN',
    'PINJAMAN MODAL',
    'PELAYANAN RUJUKAN DAN LABORATORIUM',
    'PENUNJANG PELAYANAN RS',
    'BIAYA ATK, CETAKAN, BHP RUMAH TANGGA DLL.',
    'IURAN BPJS KESEHATAN DAN BPJS KETENAGAKERJAAN',
    'KAS NEGARA',
    'BIAYA RUTIN GAJI KARYAWAN',
    'BIAYA RUTIN JASA MEDIS',
    'BIAYA RUTIN JASA PELAYANAN DLL',
    'BIAYA RUTIN BULANAN',
    'BIAYA LAIN-LAIN',
];

const emptyVendor = { id: null, nama: '', sumber: 'farmasi', kategori: '', telp: '', alamat: '', kc: '' };

const errorMessage = (err, fallback) =>
    err?.response?.data?.detail ||
    err?.response?.data?.error ||
    Object.values(err?.response?.data || {}).flat().join(' ') ||
    fallback;

export default function MasterVendorUtang() {
    const toast = useToast();
    const { user } = useAuth();
    const canManage = Boolean(user?.is_superuser || user?.akses_catatan_utang);

    const [rows, setRows] = useState([]);
    const [allVendorOptions, setAllVendorOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [search, setSearch] = useState('');
    const [sumberFilter, setSumberFilter] = useState('all');
    const [kategoriFilter, setKategoriFilter] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const [formModal, setFormModal] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const fetchOptions = useCallback(async () => {
        try {
            const res = await api.get('/keuangan/catatan-utang/vendor/options/?sumber=farmasi_manual');
            setAllVendorOptions(getResults(res.data));
        } catch {
            // Abaikan error non-kritis untuk stat-bar
        }
    }, []);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, {
                search,
                sumber: sumberFilter === 'all' ? 'farmasi_manual' : sumberFilter,
            });
            if (kategoriFilter) params.kategori = kategoriFilter;
            const res = await api.get('/keuangan/catatan-utang/vendor/', { params });
            setRows(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat data master vendor.'));
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, sumberFilter, kategoriFilter, toast]);

    useEffect(() => {
        fetchOptions();
    }, [fetchOptions]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const vendorStats = useMemo(() => {
        const list = allVendorOptions || [];
        return {
            total: list.length,
            farmasi: list.filter((v) => v.sumber === 'farmasi').length,
            manual: list.filter((v) => v.sumber === 'manual').length,
            belumDiatur: list.filter((v) => !String(v.kategori || '').trim()).length,
        };
    }, [allVendorOptions]);

    const openCreate = () => {
        const defaultSumber = ['farmasi', 'manual'].includes(sumberFilter) ? sumberFilter : 'farmasi';
        setFormModal({ ...emptyVendor, sumber: defaultSumber });
    };

    const openEdit = (row) => {
        setFormModal({
            id: row.id,
            nama: row.nama || '',
            sumber: row.sumber === 'manual' ? 'manual' : 'farmasi',
            kategori: row.kategori || '',
            telp: row.telp || '',
            alamat: row.alamat || '',
            kc: row.kc || '',
        });
    };

    const submitVendor = async (event) => {
        event.preventDefault();
        if (!formModal) return;
        setSaving(true);
        try {
            if (formModal.id) {
                await api.patch(`/keuangan/catatan-utang/vendor/${formModal.id}/`, formModal);
            } else {
                await api.post('/keuangan/catatan-utang/vendor/', formModal);
            }
            toast.success('Vendor berhasil disimpan.');
            setFormModal(null);
            await Promise.all([fetchOptions(), fetchRows()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menyimpan data vendor.'));
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async (event) => {
        event.preventDefault();
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await api.delete(`/keuangan/catatan-utang/vendor/${deleteTarget.id}/`);
            toast.success('Vendor berhasil dihapus.');
            setDeleteTarget(null);
            await Promise.all([fetchOptions(), fetchRows()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal menghapus vendor.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="utang-page">
            <section className="utang-hero">
                <div className="utang-title">
                    <div>
                        <h1>Master Vendor</h1>
                        <p>Kelola master vendor dan kategori rekanan untuk Catatan Utang (Farmasi &amp; Manual).</p>
                    </div>
                </div>
                <div className="utang-hero-actions">
                    <button className="utang-btn secondary" type="button" onClick={() => { fetchOptions(); fetchRows(); }}>
                        <RefreshCw size={15} /> Refresh
                    </button>
                    {canManage && (
                        <button className="utang-btn primary" type="button" onClick={openCreate}>
                            <FilePlus2 size={15} /> Tambah Vendor
                        </button>
                    )}
                </div>
            </section>

            <section className="utang-stat-bar cols-4">
                <div className="utang-stat-cell">
                    <span className="utang-stat-label">Total Rekanan</span>
                    <strong className="utang-stat-value utang-mono">{vendorStats.total.toLocaleString('id-ID')}</strong>
                    <span className="utang-stat-sub">Vendor aktif Catatan Utang</span>
                </div>
                <div className="utang-stat-cell">
                    <span className="utang-stat-label">Sumber Farmasi</span>
                    <strong className="utang-stat-value utang-mono">{vendorStats.farmasi.toLocaleString('id-ID')}</strong>
                    <span className="utang-stat-sub">Rekanan supplier farmasi</span>
                </div>
                <div className="utang-stat-cell">
                    <span className="utang-stat-label">Sumber Manual</span>
                    <strong className="utang-stat-value utang-mono">{vendorStats.manual.toLocaleString('id-ID')}</strong>
                    <span className="utang-stat-sub">Rekanan input manual</span>
                </div>
                <div className="utang-stat-cell">
                    <span className="utang-stat-label">Kategori Belum Diatur</span>
                    <strong className={`utang-stat-value utang-mono ${vendorStats.belumDiatur > 0 ? 'warn' : ''}`}>
                        {vendorStats.belumDiatur.toLocaleString('id-ID')}
                    </strong>
                    <span className="utang-stat-sub">Perlu penyesuaian kategori</span>
                </div>
            </section>

            <section className="utang-card table">
                <div className="dki-filter utang-filter">
                    <div className="utang-filter-row">
                        <DebouncedSearchInput
                            value={search}
                            onChange={(val) => {
                                setPage(1);
                                setSearch(val);
                            }}
                            placeholder="Cari nama vendor / alamat / kontak / PIC..."
                            className="utang-tab-search utang-vendor-search"
                        />
                        <select
                            className="dki-select utang-vendor-cat-select"
                            value={kategoriFilter}
                            onChange={(e) => {
                                setPage(1);
                                setKategoriFilter(e.target.value);
                            }}
                            title="Filter berdasarkan kategori vendor"
                        >
                            <option value="">Semua Kategori</option>
                            <option value="__empty__">Belum Diatur (Kosong)</option>
                            {VENDOR_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <div className="utang-vendor-seg" role="group" aria-label="Filter sumber vendor">
                            <button
                                type="button"
                                className={sumberFilter === 'all' ? 'active' : ''}
                                onClick={() => { setPage(1); setSumberFilter('all'); }}
                            >
                                Semua Vendor
                            </button>
                            <button
                                type="button"
                                className={sumberFilter === 'farmasi' ? 'active' : ''}
                                onClick={() => { setPage(1); setSumberFilter('farmasi'); }}
                            >
                                Khusus Farmasi
                            </button>
                            <button
                                type="button"
                                className={sumberFilter === 'manual' ? 'active' : ''}
                                onClick={() => { setPage(1); setSumberFilter('manual'); }}
                            >
                                Khusus Manual
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <TableSkeleton text="Memuat master vendor..." />
                ) : rows.length === 0 ? (
                    <div className="utang-empty">Belum ada vendor sesuai filter.</div>
                ) : (
                    <div className="utang-table-wrap table-fade-in">
                        <table className="utang-table">
                            <thead>
                                <tr>
                                    <th>Nama Rekanan / Vendor</th>
                                    <th>Kategori Rekanan</th>
                                    <th>Sumber</th>
                                    <th>Alamat</th>
                                    <th>Kontak &amp; PIC</th>
                                    <th className="utang-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td className="utang-name-cell">
                                            <strong style={{ display: 'block' }}>{r.nama}</strong>
                                            {r.id && <small className="utang-subtext utang-mono">ID: #{r.id}</small>}
                                        </td>
                                        <td>
                                            {r.kategori && r.kategori.trim() ? (
                                                <span className="utang-kategori-meta">{r.kategori.trim()}</span>
                                            ) : (
                                                <span className="utang-kategori-meta empty">Belum Diatur</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="utang-sumber-meta">
                                                {r.sumber === 'manual' ? 'Manual' : 'Farmasi'}
                                            </span>
                                        </td>
                                        <td>{r.alamat || '-'}</td>
                                        <td>
                                            <div>{r.telp || '-'}</div>
                                            {r.kc && <small className="utang-subtext">PIC: {r.kc}</small>}
                                        </td>
                                        <td className="utang-right">
                                            <div className="utang-action-group">
                                                <button
                                                    className="utang-action-btn"
                                                    type="button"
                                                    onClick={() => openEdit(r)}
                                                    title="Edit vendor & kategori"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    className="utang-action-btn danger"
                                                    type="button"
                                                    onClick={() => setDeleteTarget(r)}
                                                    title="Hapus vendor"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <SimplePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    className="utang-pagination-wrap"
                    buttonClassName="utang-page-btn"
                    selectClassName="utang-page-size"
                />
            </section>

            {formModal && createPortal(
                <div className="utang-modal-backdrop" role="presentation" onMouseDown={() => setFormModal(null)}>
                    <form
                        className="utang-modal"
                        role="dialog"
                        aria-modal="true"
                        onSubmit={submitVendor}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ maxWidth: 620, width: '92vw' }}
                    >
                        <div className="utang-modal-head">
                            <div className="utang-modal-head-text">
                                <div className="utang-modal-head-title-row">
                                    <h2>{formModal.id ? 'Edit Vendor' : 'Tambah Vendor'}</h2>
                                </div>
                                <p className="utang-modal-head-subtitle">Lengkapi data rekanan, PIC, kategori, dan sumber.</p>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setFormModal(null)} aria-label="Tutup">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="utang-modal-body">
                            <div className="utang-form-grid">
                                <label>
                                    <span>Nama Vendor <span className="utang-req">*</span></span>
                                    <input
                                        className="utang-input"
                                        required
                                        value={formModal.nama}
                                        onChange={(e) => setFormModal({ ...formModal, nama: e.target.value })}
                                        placeholder="Contoh: PT ANTAR MITRA SEMBADA"
                                    />
                                </label>
                                <label>
                                    <span>Sumber Vendor <span className="utang-req">*</span></span>
                                    <select
                                        className="utang-input"
                                        required
                                        value={formModal.sumber}
                                        onChange={(e) => setFormModal({ ...formModal, sumber: e.target.value })}
                                    >
                                        <option value="farmasi">Farmasi</option>
                                        <option value="manual">Manual</option>
                                    </select>
                                </label>
                                <label className="span-2">
                                    <span>Kategori Rekanan <span className="utang-req">*</span></span>
                                    <select
                                        className="utang-input"
                                        required
                                        value={formModal.kategori}
                                        onChange={(e) => setFormModal({ ...formModal, kategori: e.target.value })}
                                    >
                                        <option value="">-- Pilih Kategori --</option>
                                        {VENDOR_CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span>Telepon</span>
                                    <input
                                        className="utang-input"
                                        value={formModal.telp}
                                        onChange={(e) => setFormModal({ ...formModal, telp: e.target.value })}
                                        placeholder="Nomor telepon rekanan"
                                    />
                                </label>
                                <label>
                                    <span>Nama PIC</span>
                                    <input
                                        className="utang-input"
                                        value={formModal.kc}
                                        onChange={(e) => setFormModal({ ...formModal, kc: e.target.value })}
                                        placeholder="Nama kontak / sales PIC"
                                    />
                                </label>
                                <label className="span-2">
                                    <span>Alamat</span>
                                    <input
                                        className="utang-input"
                                        value={formModal.alamat}
                                        onChange={(e) => setFormModal({ ...formModal, alamat: e.target.value })}
                                        placeholder="Alamat lengkap rekanan"
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="utang-modal-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setFormModal(null)}>
                                Batal
                            </button>
                            <button className="utang-btn primary" type="submit" disabled={saving}>
                                {saving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {deleteTarget && createPortal(
                <div className="utang-confirm-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
                    <form
                        className="utang-confirm-modal"
                        role="dialog"
                        aria-modal="true"
                        onSubmit={confirmDelete}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="utang-confirm-head">
                            <div className="utang-confirm-head-copy">
                                <div>
                                    <h2>Hapus Vendor / Rekanan?</h2>
                                    <p>Vendor akan dinonaktifkan dari daftar aktif</p>
                                </div>
                            </div>
                            <button className="utang-confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Tutup">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="utang-confirm-body">
                            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--utang-text)' }}>
                                Apakah Anda yakin ingin menghapus vendor <strong>&quot;{deleteTarget.nama}&quot;</strong>?
                            </p>
                        </div>
                        <div className="utang-confirm-actions">
                            <button className="utang-btn soft" type="button" disabled={saving} onClick={() => setDeleteTarget(null)}>
                                Batal
                            </button>
                            <button className="utang-btn danger" type="submit" disabled={saving}>
                                {saving ? 'Menghapus...' : 'Hapus Vendor'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}
        </div>
    );
}
