import { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, ChevronRight, ChevronDown, Edit3, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToastState } from '../../context/ToastContext';
import { TIPE_AKUN_OPTIONS, formatRp } from './akuntansiUtils';

const INITIAL_FORM = {
    kode_akun: '',
    nama_akun: '',
    parent: '',
    tipe: 'aset_lancar',
    kategori_laporan: 'neraca',
    saldo_normal: 'debit',
    is_postable: true,
    is_reconcilable: false,
    is_kas_setara: false,
    is_active: true,
    keterangan: '',
};

export default function CoATab({ onAccountsChanged, onOpenLedger }) {
    const [tree, setTree] = useState([]);
    const [flatAccounts, setFlatAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterKategori, setFilterKategori] = useState('');
    const [collapsedIds, setCollapsedIds] = useState({});

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(INITIAL_FORM);

    const [, setError] = useToastState('error');
    const [, setSuccess] = useToastState('success');

    const fetchTree = async () => {
        setLoading(true);
        try {
            const [treeRes, listRes] = await Promise.all([
                api.get('/keuangan/akun/tree/', { params: { include_inactive: true } }),
                api.get('/keuangan/akun/', { params: { include_inactive: true } }),
            ]);
            setTree(treeRes.data?.tree || []);
            const rawList = Array.isArray(listRes.data)
                ? listRes.data
                : listRes.data?.results || [];
            setFlatAccounts(rawList);
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal memuat pohon Chart of Accounts.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTree();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const headerAccounts = useMemo(
        () => flatAccounts.filter((a) => !a.is_postable),
        [flatAccounts]
    );

    const toggleCollapse = (id) => {
        setCollapsedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    // Flatten tree for rendering with depth indentation
    const visibleRows = useMemo(() => {
        const rows = [];
        const q = search.trim().toLowerCase();

        const nodeMatches = (node) => {
            const selfMatch =
                (!q ||
                    node.kode_akun.toLowerCase().includes(q) ||
                    node.nama_akun.toLowerCase().includes(q)) &&
                (!filterKategori || node.kategori_laporan === filterKategori);
            const childMatch = (node.children || []).some(nodeMatches);
            return selfMatch || childMatch;
        };

        const walk = (nodes, depth = 0) => {
            (nodes || []).forEach((node) => {
                if (!nodeMatches(node)) return;
                const hasChildren = (node.children || []).length > 0;
                const isCollapsed = Boolean(collapsedIds[node.id]) && !q;
                rows.push({ ...node, depth, hasChildren, isCollapsed });
                if (hasChildren && !isCollapsed) {
                    walk(node.children, depth + 1);
                }
            });
        };

        walk(tree, 0);
        return rows;
    }, [tree, search, filterKategori, collapsedIds]);

    const openCreateModal = (parentNode = null) => {
        const defaultTipe = parentNode ? parentNode.tipe : 'aset_lancar';
        const tipeMeta = TIPE_AKUN_OPTIONS.find((t) => t.value === defaultTipe) || TIPE_AKUN_OPTIONS[0];
        setEditId(null);
        setForm({
            ...INITIAL_FORM,
            parent: parentNode ? String(parentNode.id) : '',
            tipe: defaultTipe,
            kategori_laporan: tipeMeta.kategori,
            saldo_normal: parentNode ? parentNode.saldo_normal : tipeMeta.saldo_normal,
        });
        setModalOpen(true);
    };

    const openEditModal = (node) => {
        const full = flatAccounts.find((a) => a.id === node.id) || node;
        setEditId(node.id);
        setForm({
            kode_akun: full.kode_akun || '',
            nama_akun: full.nama_akun || '',
            parent: full.parent || full.parent_id ? String(full.parent || full.parent_id) : '',
            tipe: full.tipe || 'aset_lancar',
            kategori_laporan: full.kategori_laporan || 'neraca',
            saldo_normal: full.saldo_normal || 'debit',
            is_postable: Boolean(full.is_postable),
            is_reconcilable: Boolean(full.is_reconcilable),
            is_kas_setara: Boolean(full.is_kas_setara),
            is_active: full.is_active !== false,
            keterangan: full.keterangan || '',
        });
        setModalOpen(true);
    };

    const handleTipeChange = (val) => {
        const meta = TIPE_AKUN_OPTIONS.find((t) => t.value === val);
        setForm({
            ...form,
            tipe: val,
            kategori_laporan: meta ? meta.kategori : form.kategori_laporan,
            saldo_normal: meta ? meta.saldo_normal : form.saldo_normal,
        });
    };

    const handleSaveAccount = async () => {
        if (!form.kode_akun.trim() || !form.nama_akun.trim()) {
            setError('Kode Akun dan Nama Akun wajib diisi.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                kode_akun: form.kode_akun.trim(),
                nama_akun: form.nama_akun.trim(),
                parent: form.parent ? Number(form.parent) : null,
            };
            if (editId) {
                await api.put(`/keuangan/akun/${editId}/`, payload);
                setSuccess(`Akun ${payload.kode_akun} berhasil diperbarui.`);
            } else {
                await api.post('/keuangan/akun/', payload);
                setSuccess(`Akun ${payload.kode_akun} berhasil ditambahkan.`);
            }
            setModalOpen(false);
            await fetchTree();
            if (onAccountsChanged) onAccountsChanged();
        } catch (err) {
            const msg =
                err.response?.data?.kode_akun?.[0] ||
                err.response?.data?.parent?.[0] ||
                err.response?.data?.error ||
                JSON.stringify(err.response?.data || 'Gagal menyimpan akun.');
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const stats = useMemo(() => {
        const totalAcc = flatAccounts.length;
        const postableCount = flatAccounts.filter((a) => a.is_postable).length;
        const headerCount = flatAccounts.filter((a) => !a.is_postable).length;
        const reconcilableCount = flatAccounts.filter((a) => a.is_reconcilable).length;
        return { totalAcc, postableCount, headerCount, reconcilableCount };
    }, [flatAccounts]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Unboxed Stat-Bar */}
            <div className="akt-stat-bar">
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Total Akun Terdaftar</span>
                    <span className="akt-stat-value">{stats.totalAcc}</span>
                    <span className="akt-stat-sub">Standar CoA Rumah Sakit</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Akun Detail (Postable Leaf)</span>
                    <span className="akt-stat-value">{stats.postableCount}</span>
                    <span className="akt-stat-sub">Dapat dipilih di baris jurnal</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Akun Induk (Header Roll-up)</span>
                    <span className="akt-stat-value">{stats.headerCount}</span>
                    <span className="akt-stat-sub">Akumulasi otomatis dari sub-akun</span>
                </div>
                <div className="akt-stat-item">
                    <span className="akt-stat-label">Akun Buku Pembantu (Reconcilable)</span>
                    <span className="akt-stat-value">{stats.reconcilableCount}</span>
                    <span className="akt-stat-sub">Piutang, Utang, Bank & Deposit</span>
                </div>
            </div>

            {/* 2. Compact 32px Filter Toolbar */}
            <div className="akt-toolbar">
                <div className="akt-toolbar-left">
                    <input
                        type="text"
                        className="akt-input"
                        style={{ width: 250 }}
                        placeholder="Cari kode atau nama akun..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="akt-select"
                        value={filterKategori}
                        onChange={(e) => setFilterKategori(e.target.value)}
                    >
                        <option value="">Semua Kategori Laporan</option>
                        <option value="neraca">Neraca (Balance Sheet)</option>
                        <option value="laba_rugi">Laba Rugi (Income Statement)</option>
                    </select>
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={() => setCollapsedIds({})}
                    >
                        Expand Semua
                    </button>
                    <button
                        type="button"
                        className="akt-btn akt-btn-secondary"
                        onClick={fetchTree}
                        title="Segarkan CoA"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>

                <div className="akt-toolbar-right">
                    <button
                        type="button"
                        className="akt-btn akt-btn-primary"
                        onClick={() => openCreateModal(null)}
                    >
                        <Plus size={14} /> Tambah Akun CoA
                    </button>
                </div>
            </div>

            {/* 3. Hierarchical CoA Table */}
            <div className="akt-table-wrap">
                <table className="akt-table">
                    <thead>
                        <tr>
                            <th>Kode & Struktur Akun</th>
                            <th>Tipe Akun</th>
                            <th>Laporan</th>
                            <th>Saldo Normal</th>
                            <th>Klasifikasi</th>
                            <th className="akt-num">Saldo Berjalan</th>
                            <th style={{ textAlign: 'right' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="akt-empty">
                                    Memuat pohon Chart of Accounts...
                                </td>
                            </tr>
                        ) : visibleRows.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="akt-empty">
                                    Tidak ditemukan akun yang cocok.
                                </td>
                            </tr>
                        ) : (
                            visibleRows.map((node) => (
                                <tr
                                    key={node.id}
                                    style={
                                        !node.is_postable
                                            ? {
                                                  fontWeight: 600,
                                                  background: 'var(--pu-surface-2)',
                                              }
                                            : undefined
                                    }
                                >
                                    <td style={{ paddingLeft: 12 + node.depth * 20 }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            {node.hasChildren ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCollapse(node.id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: 0,
                                                        color: 'var(--pu-muted)',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                    }}
                                                >
                                                    {node.isCollapsed ? (
                                                        <ChevronRight size={14} />
                                                    ) : (
                                                        <ChevronDown size={14} />
                                                    )}
                                                </button>
                                            ) : (
                                                <span style={{ width: 14, display: 'inline-block' }} />
                                            )}

                                            {node.is_postable ? (
                                                <button
                                                    type="button"
                                                    className="akt-mono"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: 0,
                                                        color: 'var(--pu-accent)',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                    onClick={() => onOpenLedger && onOpenLedger(node.id)}
                                                    title="Buka di Buku Besar"
                                                >
                                                    {node.kode_akun}
                                                </button>
                                            ) : (
                                                <span className="akt-mono">{node.kode_akun}</span>
                                            )}

                                            <span>{node.nama_akun}</span>
                                        </div>
                                    </td>
                                    <td>{node.tipe_label || node.tipe}</td>
                                    <td>
                                        <span className="akt-badge akt-badge-muted">
                                            {node.kategori_laporan === 'laba_rugi' ? 'Laba Rugi' : 'Neraca'}
                                        </span>
                                    </td>
                                    <td style={{ textTransform: 'uppercase', fontSize: 11.5, fontWeight: 600 }}>
                                        {node.saldo_normal}
                                    </td>
                                    <td>
                                        <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                                            {node.is_postable ? (
                                                <span className="akt-badge akt-badge-posted">Postable</span>
                                            ) : (
                                                <span className="akt-badge akt-badge-info">Header</span>
                                            )}
                                            {node.is_reconcilable && (
                                                <span className="akt-badge akt-badge-draft">Reconcilable</span>
                                            )}
                                            {!node.is_active && (
                                                <span className="akt-badge akt-badge-reversed">Nonaktif</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="akt-num" style={{ fontWeight: !node.is_postable ? 600 : 400 }}>
                                        {formatRp(node.saldo_berjalan || 0)}
                                    </td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'inline-flex', gap: 6 }}>
                                            {!node.is_postable && (
                                                <button
                                                    type="button"
                                                    className="akt-btn-neutral"
                                                    onClick={() => openCreateModal(node)}
                                                    title="Tambah Sub-Akun di bawah Header ini"
                                                >
                                                    + Sub
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="akt-btn-neutral"
                                                onClick={() => openEditModal(node)}
                                                title="Edit Akun"
                                            >
                                                <Edit3 size={12} style={{ marginRight: 3, verticalAlign: 'text-bottom' }} />
                                                Edit
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Tambah / Edit Akun */}
            {modalOpen && (
                <div className="akt-modal-backdrop" onClick={() => setModalOpen(false)}>
                    <div className="akt-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="akt-modal-header">
                            <h3>{editId ? 'Edit Akun Chart of Accounts' : 'Tambah Akun Baru'}</h3>
                            <button
                                type="button"
                                className="akt-btn-neutral"
                                onClick={() => setModalOpen(false)}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="akt-modal-body">
                            <div className="akt-form-grid">
                                <div className="akt-field">
                                    <label>Kode Akun</label>
                                    <input
                                        type="text"
                                        className="akt-input akt-mono"
                                        placeholder="Contoh: 6205"
                                        value={form.kode_akun}
                                        onChange={(e) => setForm({ ...form, kode_akun: e.target.value })}
                                    />
                                </div>
                                <div className="akt-field">
                                    <label>Akun Induk (Parent Header)</label>
                                    <select
                                        className="akt-select"
                                        value={form.parent}
                                        onChange={(e) => setForm({ ...form, parent: e.target.value })}
                                    >
                                        <option value="">— Root (Tanpa Induk) —</option>
                                        {headerAccounts
                                            .filter((h) => h.id !== editId)
                                            .map((h) => (
                                                <option key={h.id} value={h.id}>
                                                    {h.kode_akun} - {h.nama_akun}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            <div className="akt-field">
                                <label>Nama Akun</label>
                                <input
                                    type="text"
                                    className="akt-input"
                                    placeholder="Contoh: Beban Pemeliharaan Alat Medis"
                                    value={form.nama_akun}
                                    onChange={(e) => setForm({ ...form, nama_akun: e.target.value })}
                                />
                            </div>

                            <div className="akt-form-grid">
                                <div className="akt-field">
                                    <label>Tipe Akun</label>
                                    <select
                                        className="akt-select"
                                        value={form.tipe}
                                        onChange={(e) => handleTipeChange(e.target.value)}
                                    >
                                        {TIPE_AKUN_OPTIONS.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="akt-field">
                                    <label>Saldo Normal</label>
                                    <select
                                        className="akt-select"
                                        value={form.saldo_normal}
                                        onChange={(e) => setForm({ ...form, saldo_normal: e.target.value })}
                                    >
                                        <option value="debit">Debit</option>
                                        <option value="kredit">Kredit</option>
                                    </select>
                                </div>
                                <div className="akt-field">
                                    <label>Kategori Laporan</label>
                                    <select
                                        className="akt-select"
                                        value={form.kategori_laporan}
                                        onChange={(e) =>
                                            setForm({ ...form, kategori_laporan: e.target.value })
                                        }
                                    >
                                        <option value="neraca">Neraca</option>
                                        <option value="laba_rugi">Laba Rugi</option>
                                    </select>
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: 10,
                                    padding: '10px 12px',
                                    border: '1px solid var(--pu-border)',
                                    borderRadius: 6,
                                }}
                            >
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_postable}
                                        onChange={(e) =>
                                            setForm({ ...form, is_postable: e.target.checked })
                                        }
                                    />
                                    <span>
                                        <strong>Akun Detail (Postable)</strong> — matikan jika akun ini adalah Header
                                    </span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_reconcilable}
                                        onChange={(e) =>
                                            setForm({ ...form, is_reconcilable: e.target.checked })
                                        }
                                    />
                                    <span>
                                        <strong>Reconcilable (Buku Pembantu)</strong> — wajib Partner (AR/AP)
                                    </span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_kas_setara}
                                        onChange={(e) =>
                                            setForm({ ...form, is_kas_setara: e.target.checked })
                                        }
                                    />
                                    <span>Kas & Setara Kas (Rekening Bank / Kas Kecil)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                    />
                                    <span>Status Akun Aktif</span>
                                </label>
                            </div>
                        </div>

                        <div className="akt-modal-footer">
                            <button
                                type="button"
                                className="akt-btn akt-btn-secondary"
                                onClick={() => setModalOpen(false)}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="akt-btn akt-btn-primary"
                                disabled={saving}
                                onClick={handleSaveAccount}
                            >
                                {saving ? 'Menyimpan...' : 'Simpan Akun'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
