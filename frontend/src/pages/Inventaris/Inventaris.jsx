import { useEffect, useMemo, useState } from 'react';
import { Image, Package, Pencil, Plus, RefreshCw, Save, Search, Settings2, Trash2, X } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { compressImage, formatFileSize, validateImageFile } from '../../utils/imageCompression';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination';

const OPTION_TYPES = [
    { value: 'unit', label: 'Unit' },
    { value: 'category', label: 'Kategori Aset' },
    { value: 'condition', label: 'Status Kelayakan' },
    { value: 'ownership', label: 'Status Kepemilikan' },
];

const emptyAsset = {
    description: '',
    unit: '',
    brand: '',
    location: '',
    category: '',
    condition_status: '',
    manufacture_year: '',
    purchase_year: '',
    purchase_price: '',
    recommended_action: '',
    ownership_status: '',
};

const emptyOption = {
    option_type: 'unit',
    name: '',
    is_active: true,
    sort_order: 0,
};

const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
}).format(Number(value || 0));

const getOptionTypeLabel = (value) => OPTION_TYPES.find((type) => type.value === value)?.label || value;

export default function Inventaris() {
    const toast = useToast();
    const [tab, setTab] = useState('assets');
    const [assets, setAssets] = useState([]);
    const [options, setOptions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [assetModal, setAssetModal] = useState(false);
    const [optionModal, setOptionModal] = useState(false);
    const [editingAsset, setEditingAsset] = useState(null);
    const [editingOption, setEditingOption] = useState(null);
    const [assetForm, setAssetForm] = useState(emptyAsset);
    const [optionForm, setOptionForm] = useState(emptyOption);
    const [fotoFile, setFotoFile] = useState(null);
    const [fotoPreview, setFotoPreview] = useState('');
    const [imagePreview, setImagePreview] = useState(null);
    const [compressionInfo, setCompressionInfo] = useState('');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ unit: '', category: '', condition_status: '', ownership_status: '' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const groupedOptions = useMemo(() => {
        const groups = { unit: [], category: [], condition: [], ownership: [] };
        options.forEach((item) => {
            if (groups[item.option_type]) groups[item.option_type].push(item);
        });
        return groups;
    }, [options]);

    const activeOptions = useMemo(() => {
        const groups = { unit: [], category: [], condition: [], ownership: [] };
        Object.entries(groupedOptions).forEach(([key, items]) => {
            groups[key] = items.filter((item) => item.is_active);
        });
        return groups;
    }, [groupedOptions]);

    const fetchOptions = async () => {
        const res = await api.get('/keuangan/inventory/options/', { params: { page_size: 100 } });
        setOptions(getResults(res.data));
    };

    const fetchAssets = async () => {
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, { search, ...filters });
            Object.keys(params).forEach((key) => {
                if (!params[key]) delete params[key];
            });
            const [assetRes, summaryRes] = await Promise.all([
                api.get('/keuangan/inventory/assets/', { params }),
                api.get('/keuangan/inventory/assets/summary/', { params: { search, ...filters } }),
            ]);
            setAssets(getResults(assetRes.data));
            setTotal(getCount(assetRes.data));
            setSummary(summaryRes.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Gagal memuat data inventaris.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOptions().catch(() => toast.error('Gagal memuat dropdown inventaris.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchAssets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, search, filters]);

    const openAssetModal = (asset = null) => {
        setEditingAsset(asset);
        setFotoFile(null);
        setCompressionInfo('');
        setFotoPreview(asset?.foto_url || '');
        setAssetForm(asset ? {
            description: asset.description || '',
            unit: asset.unit || '',
            brand: asset.brand || '',
            location: asset.location || '',
            category: asset.category || '',
            condition_status: asset.condition_status || '',
            manufacture_year: asset.manufacture_year || '',
            purchase_year: asset.purchase_year || '',
            purchase_price: asset.purchase_price || '',
            recommended_action: asset.recommended_action || '',
            ownership_status: asset.ownership_status || '',
        } : emptyAsset);
        setAssetModal(true);
    };

    const openOptionModal = (option = null, optionType = 'unit') => {
        setEditingOption(option);
        setOptionForm(option ? {
            option_type: option.option_type,
            name: option.name || '',
            is_active: Boolean(option.is_active),
            sort_order: option.sort_order || 0,
        } : { ...emptyOption, option_type: optionType });
        setOptionModal(true);
    };

    const handleFoto = async (file) => {
        if (!file) return;
        const validation = validateImageFile(file);
        if (!validation.isValid) {
            toast.error(validation.error);
            return;
        }
        try {
            const compressed = await compressImage(file, { maxSizeMB: 0.7, maxWidthOrHeight: 1920, quality: 0.75 });
            setFotoFile(compressed);
            setFotoPreview(URL.createObjectURL(compressed));
            setCompressionInfo(`${formatFileSize(file.size)} menjadi ${formatFileSize(compressed.size)}`);
        } catch {
            toast.error('Gagal mengompres foto.');
        }
    };

    const saveAsset = async (e) => {
        e.preventDefault();
        const payload = new FormData();
        Object.entries(assetForm).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') return;
            payload.append(key, value);
        });
        if (!assetForm.purchase_price) payload.append('purchase_price', 0);
        if (fotoFile) payload.append('foto', fotoFile);
        try {
            if (editingAsset) {
                await api.patch(`/keuangan/inventory/assets/${editingAsset.id}/`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success('Aset berhasil diperbarui.');
            } else {
                await api.post('/keuangan/inventory/assets/', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success('Aset berhasil ditambahkan.');
            }
            setAssetModal(false);
            fetchAssets();
        } catch (err) {
            const data = err.response?.data;
            toast.error(typeof data === 'string' ? data : data?.detail || data?.error || 'Gagal menyimpan aset.');
        }
    };

    const saveOption = async (e) => {
        e.preventDefault();
        try {
            if (editingOption) {
                await api.patch(`/keuangan/inventory/options/${editingOption.id}/`, optionForm);
                toast.success('Dropdown berhasil diperbarui.');
            } else {
                await api.post('/keuangan/inventory/options/', optionForm);
                toast.success('Dropdown berhasil ditambahkan.');
            }
            setOptionModal(false);
            await fetchOptions();
            fetchAssets();
        } catch (err) {
            const data = err.response?.data;
            toast.error(data?.name?.[0] || data?.non_field_errors?.[0] || data?.detail || 'Gagal menyimpan dropdown.');
        }
    };

    const deleteAsset = async (asset) => {
        if (!window.confirm(`Hapus aset "${asset.description}"?`)) return;
        try {
            await api.delete(`/keuangan/inventory/assets/${asset.id}/`);
            toast.success('Aset berhasil dihapus.');
            fetchAssets();
        } catch {
            toast.error('Gagal menghapus aset.');
        }
    };

    const deleteOption = async (option) => {
        if (!window.confirm(`Hapus pilihan "${option.name}"?`)) return;
        try {
            await api.delete(`/keuangan/inventory/options/${option.id}/`);
            toast.success('Dropdown berhasil dihapus.');
            await fetchOptions();
        } catch {
            toast.error('Dropdown tidak bisa dihapus jika sudah dipakai aset.');
        }
    };

    const selectControl = (key, label, items) => (
        <label className="inv-field">
            <span>{label}</span>
            <select value={filters[key]} onChange={(e) => { setPage(1); setFilters((v) => ({ ...v, [key]: e.target.value })); }}>
                <option value="">Semua</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
        </label>
    );

    return (
        <div className="inv-page">
            <style>{STYLE}</style>
            <section className="inv-hero">
                <div>
                    <div className="inv-kicker"><Package size={16} /> Inventaris</div>
                    <h1>Daftar Inventaris Aset</h1>
                    <p>Kelola aset, status kelayakan, lokasi, foto, dan master dropdown inventaris.</p>
                </div>
                <div className="inv-hero-actions">
                    <button className="inv-secondary" onClick={() => { fetchOptions(); fetchAssets(); }} type="button"><RefreshCw size={16} /> Refresh</button>
                    <button className="inv-primary" onClick={() => openAssetModal()} type="button"><Plus size={16} /> Tambah Aset</button>
                </div>
            </section>

            <section className="inv-summary">
                <div><span>Total Aset</span><strong>{summary?.total || 0}</strong></div>
                <div><span>Nilai Pembelian</span><strong>{formatCurrency(summary?.total_value)}</strong></div>
                <div><span>Status Terbanyak</span><strong>{summary?.by_condition?.[0]?.name || '-'}</strong></div>
                <div><span>Kategori Terbanyak</span><strong>{summary?.by_category?.[0]?.name || '-'}</strong></div>
            </section>

            <div className="inv-tabs">
                <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')} type="button"><Package size={16} /> Daftar Aset</button>
                <button className={tab === 'master' ? 'active' : ''} onClick={() => setTab('master')} type="button"><Settings2 size={16} /> Master Dropdown</button>
            </div>

            {tab === 'assets' ? (
                <section className="inv-panel">
                    <div className="inv-toolbar">
                        <label className="inv-search">
                            <Search size={16} />
                            <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Cari aset, merek, lokasi, unit..." />
                        </label>
                        <div className="inv-filter-grid">
                            {selectControl('unit', 'Unit', activeOptions.unit)}
                            {selectControl('category', 'Kategori', activeOptions.category)}
                            {selectControl('condition_status', 'Kelayakan', activeOptions.condition)}
                            {selectControl('ownership_status', 'Kepemilikan', activeOptions.ownership)}
                        </div>
                    </div>

                    <div className="inv-table-wrap">
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th>Foto</th>
                                    <th>Deskripsi Aset</th>
                                    <th>Unit</th>
                                    <th>Merek</th>
                                    <th>Lokasi</th>
                                    <th>Kategori</th>
                                    <th>Kelayakan</th>
                                    <th>Tahun</th>
                                    <th>Harga Beli</th>
                                    <th>Kepemilikan</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="11" className="inv-empty">Memuat data...</td></tr>
                                ) : assets.length === 0 ? (
                                    <tr><td colSpan="11" className="inv-empty">Belum ada data inventaris.</td></tr>
                                ) : assets.map((asset) => (
                                    <tr key={asset.id}>
                                        <td className="inv-photo-cell">
                                            {asset.foto_url ? (
                                                <button
                                                    className="inv-thumb-btn"
                                                    onClick={() => setImagePreview({ src: asset.foto_url, title: asset.description })}
                                                    type="button"
                                                    title="Preview foto"
                                                >
                                                    <img className="inv-thumb" src={asset.foto_url} alt="" />
                                                </button>
                                            ) : (
                                                <span className="inv-no-photo"><Image size={16} /></span>
                                            )}
                                        </td>
                                        <td><strong>{asset.description}</strong><small>{asset.recommended_action || '-'}</small></td>
                                        <td>{asset.unit_name}</td>
                                        <td>{asset.brand || '-'}</td>
                                        <td>{asset.location || '-'}</td>
                                        <td>{asset.category_name}</td>
                                        <td><span className="inv-badge">{asset.condition_status_name}</span></td>
                                        <td>{asset.manufacture_year || '-'} / {asset.purchase_year || '-'}</td>
                                        <td>{formatCurrency(asset.purchase_price)}</td>
                                        <td>{asset.ownership_status_name}</td>
                                        <td className="inv-action-cell">
                                            <div className="inv-actions">
                                                <button onClick={() => openAssetModal(asset)} title="Edit" type="button"><Pencil size={15} /></button>
                                                <button onClick={() => deleteAsset(asset)} title="Hapus" type="button"><Trash2 size={15} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <SimplePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} buttonClassName="inv-page-btn" selectClassName="inv-page-select" />
                </section>
            ) : (
                <section className="inv-master-grid">
                    {OPTION_TYPES.map((type) => (
                        <div className="inv-master-card" key={type.value}>
                            <div className="inv-master-head">
                                <h3>{type.label}</h3>
                                <button onClick={() => openOptionModal(null, type.value)} type="button"><Plus size={15} /> Tambah</button>
                            </div>
                            <div className="inv-option-list">
                                {(groupedOptions[type.value] || []).map((item) => (
                                    <div className="inv-option-row" key={item.id}>
                                        <div>
                                            <strong>{item.name}</strong>
                                            <span>{item.is_active ? 'Aktif' : 'Nonaktif'} - Urutan {item.sort_order}</span>
                                        </div>
                                        <div className="inv-actions">
                                            <button onClick={() => openOptionModal(item)} type="button"><Pencil size={14} /></button>
                                            <button onClick={() => deleteOption(item)} type="button"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                                {(groupedOptions[type.value] || []).length === 0 && <div className="inv-empty small">Belum ada pilihan.</div>}
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {assetModal && (
                <div className="inv-overlay">
                    <form className="inv-modal" onSubmit={saveAsset}>
                        <div className="inv-modal-head">
                            <div>
                                <h2>{editingAsset ? 'Edit Aset' : 'Tambah Aset'}</h2>
                                <p>Lengkapi detail inventaris dan foto aset jika ada.</p>
                            </div>
                        </div>
                        <div className="inv-form-grid">
                            <label className="inv-field wide"><span>Deskripsi Aset</span><textarea required value={assetForm.description} onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })} /></label>
                            <label className="inv-field"><span>Unit</span><select required value={assetForm.unit} onChange={(e) => setAssetForm({ ...assetForm, unit: e.target.value })}><option value="">Pilih unit</option>{activeOptions.unit.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                            <label className="inv-field"><span>Kategori Aset</span><select required value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}><option value="">Pilih kategori</option>{activeOptions.category.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                            <label className="inv-field"><span>Status Kelayakan</span><select required value={assetForm.condition_status} onChange={(e) => setAssetForm({ ...assetForm, condition_status: e.target.value })}><option value="">Pilih status</option>{activeOptions.condition.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                            <label className="inv-field"><span>Status Kepemilikan</span><select required value={assetForm.ownership_status} onChange={(e) => setAssetForm({ ...assetForm, ownership_status: e.target.value })}><option value="">Pilih kepemilikan</option>{activeOptions.ownership.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                            <label className="inv-field"><span>Merek</span><input value={assetForm.brand} onChange={(e) => setAssetForm({ ...assetForm, brand: e.target.value })} /></label>
                            <label className="inv-field"><span>Lokasi</span><input value={assetForm.location} onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })} /></label>
                            <label className="inv-field"><span>Tahun Pembuatan</span><input type="number" min="1900" max="2100" value={assetForm.manufacture_year} onChange={(e) => setAssetForm({ ...assetForm, manufacture_year: e.target.value })} /></label>
                            <label className="inv-field"><span>Tahun Beli</span><input type="number" min="1900" max="2100" value={assetForm.purchase_year} onChange={(e) => setAssetForm({ ...assetForm, purchase_year: e.target.value })} /></label>
                            <label className="inv-field"><span>Harga Beli</span><input type="number" min="0" value={assetForm.purchase_price} onChange={(e) => setAssetForm({ ...assetForm, purchase_price: e.target.value })} /></label>
                            <label className="inv-field wide"><span>Rekomendasi Tindakan</span><textarea value={assetForm.recommended_action} onChange={(e) => setAssetForm({ ...assetForm, recommended_action: e.target.value })} /></label>
                            <div className="inv-upload wide">
                                <div className="inv-preview">{fotoPreview ? <img src={fotoPreview} alt="Preview aset" /> : <Image size={34} />}</div>
                                <div>
                                    <label className="inv-file-btn">
                                        Pilih Foto
                                        <input type="file" accept="image/*" onChange={(e) => handleFoto(e.target.files?.[0])} />
                                    </label>
                                    <p>{compressionInfo || 'Foto opsional. File akan dikompres otomatis sebelum upload.'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="inv-modal-foot">
                            <button className="inv-secondary" type="button" onClick={() => setAssetModal(false)}>Batal</button>
                            <button className="inv-primary" type="submit"><Save size={16} /> Simpan</button>
                        </div>
                    </form>
                </div>
            )}

            {optionModal && (
                <div className="inv-overlay">
                    <form className="inv-modal small-modal" onSubmit={saveOption}>
                        <div className="inv-modal-head">
                            <div>
                                <h2>{editingOption ? 'Edit Dropdown' : 'Tambah Dropdown'}</h2>
                                <p>Kelola pilihan yang muncul di form inventaris.</p>
                            </div>
                        </div>
                        <div className="inv-form-grid single">
                            <div className="inv-type-info">
                                <span>Jenis Dropdown</span>
                                <strong>{getOptionTypeLabel(optionForm.option_type)}</strong>
                            </div>
                            <label className="inv-field"><span>Nama Pilihan</span><input required value={optionForm.name} onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })} /></label>
                            <label className="inv-field"><span>Urutan</span><input type="number" min="0" value={optionForm.sort_order} onChange={(e) => setOptionForm({ ...optionForm, sort_order: Number(e.target.value || 0) })} /></label>
                            <label className="inv-check"><input type="checkbox" checked={optionForm.is_active} onChange={(e) => setOptionForm({ ...optionForm, is_active: e.target.checked })} /><span>Aktif ditampilkan di dropdown</span></label>
                        </div>
                        <div className="inv-modal-foot">
                            <button className="inv-secondary" type="button" onClick={() => setOptionModal(false)}>Batal</button>
                            <button className="inv-primary" type="submit"><Save size={16} /> Simpan</button>
                        </div>
                    </form>
                </div>
            )}

            {imagePreview && (
                <div className="inv-image-overlay" onClick={() => setImagePreview(null)}>
                    <div className="inv-image-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="inv-image-head">
                            <div>
                                <h3>Preview Foto Aset</h3>
                                <p>{imagePreview.title}</p>
                            </div>
                            <button type="button" onClick={() => setImagePreview(null)} aria-label="Tutup preview">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="inv-image-body">
                            <img src={imagePreview.src} alt={imagePreview.title || 'Preview foto aset'} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const STYLE = `
.inv-page { display: flex; flex-direction: column; gap: 18px; color: #17251d; }
.inv-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 22px; background: #fff; border: 1px solid #dfeae4; border-radius: 8px; box-shadow: 0 10px 28px rgba(15,23,42,.06); }
.inv-kicker { display: inline-flex; align-items: center; gap: 8px; color: #1a4731; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
.inv-hero h1 { margin: 8px 0 6px; font-size: 26px; line-height: 1.15; }
.inv-hero p { color: #64748b; font-size: 14px; }
.inv-hero-actions, .inv-actions, .inv-tabs, .inv-master-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.inv-primary, .inv-secondary, .inv-master-head button, .inv-page-btn, .inv-file-btn { border: none; border-radius: 8px; height: 38px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 900; cursor: pointer; font-size: 13px; }
.inv-primary { background: #1f7a4d; color: #fff; }
.inv-secondary { background: #f3f8f5; color: #1a4731; border: 1px solid #dce8e2; }
.inv-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.inv-summary div { background: #fff; border: 1px solid #dfeae4; border-radius: 8px; padding: 16px; }
.inv-summary span { display: block; color: #64748b; font-size: 12px; font-weight: 800; }
.inv-summary strong { display: block; margin-top: 8px; font-size: 20px; color: #102016; }
.inv-tabs button { border: 1px solid #dce8e2; background: #fff; color: #475569; border-radius: 8px; height: 40px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; font-weight: 900; cursor: pointer; }
.inv-tabs button.active { background: #123d2a; color: #fff; border-color: #123d2a; }
.inv-panel, .inv-master-card { background: #fff; border: 1px solid #dfeae4; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 28px rgba(15,23,42,.05); }
.inv-toolbar { padding: 16px; border-bottom: 1px solid #edf2f7; display: grid; gap: 12px; }
.inv-search { height: 42px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid #dce8e2; border-radius: 8px; background: #fbfdfc; }
.inv-search input { border: none; background: transparent; width: 100%; font: inherit; font-weight: 700; color: #17251d; }
.inv-filter-grid, .inv-form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.inv-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 900; color: #475569; }
.inv-field input, .inv-field select, .inv-field textarea { width: 100%; border: 1px solid #dce8e2; border-radius: 8px; min-height: 40px; padding: 9px 11px; font: inherit; font-size: 13px; font-weight: 700; color: #17251d; background: #fff; }
.inv-field textarea { min-height: 92px; resize: vertical; }
.inv-field.wide { grid-column: 1 / -1; }
.inv-table-wrap { overflow-x: auto; }
.inv-table { width: 100%; border-collapse: collapse; min-width: 1180px; }
.inv-table th, .inv-table td { border: 1px solid #e5ece8; padding: 11px 12px; text-align: left; vertical-align: top; font-size: 13px; }
.inv-table th:first-child, .inv-table th:last-child,
.inv-table td.inv-photo-cell, .inv-table td.inv-action-cell { text-align: center; vertical-align: middle; }
.inv-table th:last-child, .inv-table td.inv-action-cell { width: 96px; min-width: 96px; padding-left: 8px; padding-right: 8px; }
.inv-table th { background: #f7faf8; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.inv-table td strong { display: block; max-width: 280px; line-height: 1.35; }
.inv-table td small { display: block; color: #64748b; margin-top: 4px; max-width: 280px; line-height: 1.35; }
.inv-thumb-btn { width: 52px; height: 52px; padding: 0; border: none; border-radius: 8px; background: transparent; cursor: zoom-in; display: inline-flex; align-items: center; justify-content: center; }
.inv-thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
.inv-thumb-btn:hover .inv-thumb { border-color: #1f7a4d; box-shadow: 0 0 0 3px rgba(31, 122, 77, .12); }
.inv-no-photo { width: 52px; height: 52px; border-radius: 8px; background: #f3f8f5; color: #789; display: grid; place-items: center; }
.inv-badge { display: inline-flex; padding: 5px 8px; border-radius: 999px; background: #eaf7ef; color: #166534; font-size: 12px; font-weight: 900; white-space: nowrap; }
.inv-actions { justify-content: center; align-items: center; flex-wrap: nowrap; width: 100%; min-height: 34px; margin: 0 auto; }
.inv-actions button { width: 32px; height: 32px; min-width: 32px; padding: 0; line-height: 0; border: 1px solid #dce8e2; background: #fff; color: #1a4731; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.inv-actions button svg { display: block; width: 15px; height: 15px; margin: 0; flex-shrink: 0; }
.inv-actions button:hover { background: #f3f8f5; }
.inv-empty { text-align: center !important; color: #64748b; padding: 28px !important; font-weight: 800; }
.inv-empty.small { padding: 16px !important; text-align: left !important; }
.inv-page-btn { width: 34px; padding: 0; border: 1px solid #dce8e2; background: #fff; color: #1a4731; }
.inv-page-btn:disabled { opacity: .45; cursor: not-allowed; }
.inv-page-select { height: 34px; border: 1px solid #dce8e2; border-radius: 8px; padding: 0 10px; font-weight: 800; color: #17251d; }
.inv-master-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.inv-master-card { padding: 16px; }
.inv-master-head { justify-content: space-between; margin-bottom: 12px; }
.inv-master-head h3 { font-size: 16px; }
.inv-master-head button { background: #f3f8f5; color: #1a4731; border: 1px solid #dce8e2; height: 34px; }
.inv-option-list { display: grid; gap: 8px; }
.inv-option-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid #edf2f7; border-radius: 8px; padding: 10px; }
.inv-option-row strong, .inv-option-row span { display: block; }
.inv-option-row span { margin-top: 3px; color: #64748b; font-size: 12px; font-weight: 800; }
.inv-overlay { position: fixed; inset: 0; z-index: 999; background: rgba(10, 22, 16, .38); backdrop-filter: blur(7px); display: flex; align-items: center; justify-content: center; padding: 18px; }
.inv-modal { width: min(980px, 100%); max-height: min(90vh, calc(100vh - 36px)); overflow-y: auto; background: #fff; border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.24); }
.inv-modal.small-modal { width: min(520px, 100%); }
.inv-modal-head { padding: 20px 22px 12px; border-bottom: 1px solid #edf2f7; }
.inv-modal-head h2 { font-size: 20px; margin-bottom: 4px; }
.inv-modal-head p { color: #64748b; font-size: 13px; font-weight: 700; }
.inv-form-grid { padding: 18px 22px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.inv-form-grid.single { grid-template-columns: 1fr; }
.inv-type-info { border: 1px solid #dce8e2; border-radius: 8px; background: #f8fbf9; padding: 12px; }
.inv-type-info span { display: block; color: #64748b; font-size: 12px; font-weight: 900; margin-bottom: 5px; }
.inv-type-info strong { display: block; color: #102016; font-size: 14px; }
.inv-upload { grid-column: 1 / -1; border: 1px dashed #bfd5ca; border-radius: 8px; padding: 12px; display: flex; gap: 14px; align-items: center; background: #fbfdfc; }
.inv-preview { width: 110px; height: 90px; border-radius: 8px; background: #f3f8f5; color: #789; display: grid; place-items: center; overflow: hidden; border: 1px solid #e2e8f0; flex-shrink: 0; }
.inv-preview img { width: 100%; height: 100%; object-fit: cover; }
.inv-file-btn { position: relative; background: #123d2a; color: #fff; margin-bottom: 8px; }
.inv-file-btn input { display: none; }
.inv-upload p { color: #64748b; font-size: 12px; font-weight: 800; }
.inv-check { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 900; color: #17251d; }
.inv-check input { width: 18px; height: 18px; accent-color: #1f7a4d; }
.inv-modal-foot { position: sticky; bottom: 0; padding: 14px 22px; border-top: 1px solid #edf2f7; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 25%); display: flex; justify-content: flex-end; gap: 10px; }
.inv-image-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(10, 22, 16, .42); backdrop-filter: blur(7px); display: flex; align-items: center; justify-content: center; padding: 18px; }
.inv-image-modal { width: min(920px, 100%); max-height: min(92vh, calc(100vh - 30px)); background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 24px 80px rgba(15,23,42,.26); display: flex; flex-direction: column; }
.inv-image-head { min-height: 62px; padding: 12px 14px 12px 18px; border-bottom: 1px solid #edf2f7; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.inv-image-head h3 { font-size: 16px; margin: 0 0 3px; }
.inv-image-head p { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; max-width: 680px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-image-head button { width: 36px; height: 36px; min-width: 36px; padding: 0; line-height: 0; border: 1px solid #dce8e2; border-radius: 8px; background: #fff; color: #1a4731; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.inv-image-head button svg { display: block; width: 18px; height: 18px; margin: 0; flex-shrink: 0; }
.inv-image-head button:hover { background: #f3f8f5; }
.inv-image-body { min-height: 240px; overflow: auto; padding: 14px; display: grid; place-items: center; background: #f8fbf9; }
.inv-image-body img { max-width: 100%; max-height: calc(92vh - 120px); object-fit: contain; border-radius: 8px; box-shadow: 0 8px 26px rgba(15,23,42,.14); }
@media (max-width: 900px) {
    .inv-hero { align-items: flex-start; flex-direction: column; }
    .inv-summary, .inv-filter-grid, .inv-master-grid { grid-template-columns: 1fr; }
    .inv-form-grid { grid-template-columns: 1fr; }
}
`;
