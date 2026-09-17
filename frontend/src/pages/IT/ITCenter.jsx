import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import {
    Archive, CalendarClock, CheckCircle2, ClipboardList, DatabaseBackup, Edit3, Eye, EyeOff,
    FileText, Image, KeyRound, Laptop, Link as LinkIcon, Paperclip, Plus, RefreshCw, Search, ShieldCheck,
    Trash2, X
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';
import './ITCenter.css';

const tabs = [
    { key: 'backups', label: 'Backup', icon: DatabaseBackup },
    { key: 'tickets', label: 'Perbaikan', icon: ClipboardList },
    { key: 'credentials', label: 'Akun & Link', icon: KeyRound },
    { key: 'remote', label: 'Remote Access', icon: Laptop },
    { key: 'subscriptions', label: 'Langganan', icon: CalendarClock },
];

const endpoints = {
    backups: '/keuangan/it/backups/',
    tickets: '/keuangan/it/repair-requests/',
    credentials: '/keuangan/it/credentials/',
    remote: '/keuangan/it/remote-access/',
    subscriptions: '/keuangan/it/subscriptions/',
};

const toLocalInputValue = (date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const emptyForms = {
    backups: {
        backup_type: 'database',
        status: 'success',
        file_name: '',
        storage_path: '',
        file_size_mb: '',
        started_at: '',
        finished_at: '',
        notes: '',
    },
    tickets: {
        title: '',
        requester_user: '',
        requester_name: '',
        unit: '',
        category: 'other',
        priority: 'normal',
        status: 'open',
        description: '',
        resolution: '',
        sparepart: '',
        cost: '',
        foto: null,
        requested_at: toLocalInputValue(),
        completed_at: '',
    },
    credentials: {
        name: '',
        category: 'website',
        url: '',
        username: '',
        password: '',
        owner: '',
        notes: '',
        is_active: true,
    },
    remote: {
        device_name: '',
        user_owner: '',
        unit: '',
        location: '',
        anydesk_id: '',
        rustdesk_id: '',
        access_password: '',
        status: 'active',
        notes: '',
    },
    subscriptions: {
        name: '',
        service_type: 'software',
        vendor: '',
        account_ref: '',
        url: '',
        pic: '',
        start_date: '',
        end_date: '',
        billing_cycle: 'yearly',
        cost: '',
        status: 'active',
        reminder_days: 30,
        notes: '',
    },
};

const optionSets = {
    backup_type: [
        ['database', 'Database'],
        ['media', 'Media Upload'],
        ['full', 'Database + Media'],
        ['config', 'Konfigurasi'],
        ['other', 'Lainnya'],
    ],
    backup_status: [
        ['scheduled', 'Terjadwal'],
        ['running', 'Berjalan'],
        ['success', 'Berhasil'],
        ['failed', 'Gagal'],
        ['verified', 'Terverifikasi'],
    ],
    ticket_category: [
        ['hardware', 'Hardware'],
        ['software', 'Software'],
        ['network', 'Jaringan'],
        ['printer', 'Printer'],
        ['account', 'Akun / Akses'],
        ['simak', 'SIMAK'],
        ['other', 'Lainnya'],
    ],
    priority: [
        ['low', 'Rendah'],
        ['normal', 'Normal'],
        ['high', 'Tinggi'],
        ['urgent', 'Darurat'],
    ],
    ticket_status: [
        ['open', 'Baru'],
        ['in_progress', 'Diproses'],
        ['waiting', 'Menunggu'],
        ['done', 'Selesai'],
        ['cancelled', 'Dibatalkan'],
    ],
    credential_category: [
        ['website', 'Website'],
        ['server', 'Server'],
        ['database', 'Database'],
        ['email', 'Email'],
        ['device', 'Perangkat'],
        ['vendor', 'Vendor'],
        ['other', 'Lainnya'],
    ],
    remote_status: [
        ['active', 'Aktif'],
        ['inactive', 'Nonaktif'],
        ['maintenance', 'Maintenance'],
    ],
    subscription_type: [
        ['domain', 'Domain'],
        ['hosting', 'Hosting'],
        ['ssl', 'SSL'],
        ['internet', 'Internet'],
        ['software', 'Software / Lisensi'],
        ['vendor', 'Vendor / Support'],
        ['other', 'Lainnya'],
    ],
    billing_cycle: [
        ['monthly', 'Bulanan'],
        ['quarterly', 'Triwulan'],
        ['semester', 'Semester'],
        ['yearly', 'Tahunan'],
        ['one_time', 'Sekali Bayar'],
    ],
    subscription_status: [
        ['active', 'Aktif'],
        ['expiring', 'Hampir Habis'],
        ['expired', 'Expired'],
        ['cancelled', 'Dibatalkan'],
    ],
};

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};

const toDateTimeLocal = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const cleanPayload = (tab, form) => {
    const payload = { ...form };
    ['started_at', 'finished_at', 'requested_at', 'completed_at'].forEach((key) => {
        if (key in payload && !payload[key]) payload[key] = null;
    });
    if (tab === 'backups' && payload.file_size_mb === '') payload.file_size_mb = null;
    if (tab === 'tickets' && payload.cost === '') payload.cost = 0;
    if (tab === 'subscriptions' && payload.cost === '') payload.cost = 0;
    if (tab === 'subscriptions' && payload.reminder_days === '') payload.reminder_days = 30;
    if ((tab === 'credentials' || tab === 'remote') && payload.password === '') delete payload.password;
    if (tab === 'remote' && payload.access_password === '') delete payload.access_password;
    return payload;
};

const buildTicketFormData = (payload) => {
    const data = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (key === 'foto_url' || key.endsWith('_label') || key.endsWith('_name') || key === 'created_by' || key === 'created_by_name') return;
        if (key === 'foto' && !(value instanceof File)) return;
        data.append(key, value);
    });
    return data;
};

function Badge({ children, tone = 'neutral' }) {
    return <span className={`pc-it-badge ${tone}`}>{children}</span>;
}

function Field({ label, children, wide }) {
    return (
        <label className={wide ? 'pc-field wide' : 'pc-field'}>
            <span className="pc-label">{label}</span>
            {children}
        </label>
    );
}

export default function ITCenter() {
    const { category } = useParams();
    const activeTab = category || 'backups';
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(emptyForms.backups);
    const [secret, setSecret] = useState(null);
    const [users, setUsers] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [ticketFotoInfo, setTicketFotoInfo] = useState(null);

    const currentTab = useMemo(() => tabs.find((tab) => tab.key === activeTab), [activeTab]);
    const CurrentIcon = currentTab?.icon || ShieldCheck;

    const fetchRows = useCallback(async () => {
        if (!endpoints[activeTab]) {
            setRows([]);
            setCount(0);
            return;
        }
        setLoading(true);
        try {
            const res = await api.get(endpoints[activeTab], {
                params: pageParams(page, pageSize, { search: search || undefined }),
            });
            setRows(getResults(res.data));
            setCount(getCount(res.data));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Data IT gagal dimuat.');
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, pageSize, search, toast]);



    useEffect(() => {
        fetchRows();
    }, [fetchRows]);


    useEffect(() => {
        api.get('/users/', { params: { page_size: 100 } })
            .then((res) => setUsers(getResults(res.data).filter((u) => u.is_active)))
            .catch(() => setUsers([]));
    }, []);


    const openCreate = () => {
        setModal({ mode: 'create', tab: activeTab });
        setForm(activeTab === 'tickets' ? { ...emptyForms.tickets, requested_at: toLocalInputValue() } : emptyForms[activeTab]);
        setSecret(null);
        setTicketFotoInfo(null);
    };

    const openEdit = (row) => {
        setModal({ mode: 'edit', tab: activeTab, id: row.id });
        setSecret(null);
        setForm({
            ...emptyForms[activeTab],
            ...row,
            started_at: toDateTimeLocal(row.started_at),
            finished_at: toDateTimeLocal(row.finished_at),
            requested_at: toDateTimeLocal(row.requested_at),
            completed_at: toDateTimeLocal(row.completed_at),
            password: '',
            access_password: '',
            foto: null,
        });
        setTicketFotoInfo(null);
    };

    const openComplete = (row) => {
        setModal({ mode: 'complete', tab: 'tickets', id: row.id, row });
        setForm({
            ...emptyForms.tickets,
            ...row,
            completed_at: toLocalInputValue(),
            resolution: row.resolution || '',
            sparepart: row.sparepart || '',
            cost: row.cost || '',
            foto: null,
        });
        setSecret(null);
        setTicketFotoInfo(null);
    };

    const openDetail = (row) => {
        setModal({ mode: 'detail', tab: activeTab, row });
        setSecret(null);
        setTicketFotoInfo(null);
    };

    const handleTicketFotoChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            setForm((prev) => ({ ...prev, foto: null }));
            setTicketFotoInfo(null);
            return;
        }
        const validation = validateImageFile(file);
        if (!validation.isValid) {
            toast.error(validation.error);
            event.target.value = '';
            return;
        }
        try {
            const [compressed] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
            setForm((prev) => ({ ...prev, foto: compressed }));
            setTicketFotoInfo({
                name: compressed.name,
                originalSize: formatFileSize(file.size),
                compressedSize: formatFileSize(compressed.size),
                reduction: Math.max(0, Math.round((1 - compressed.size / file.size) * 100)),
                compressed: true,
            });
        } catch {
            setForm((prev) => ({ ...prev, foto: file }));
            setTicketFotoInfo({
                name: file.name,
                originalSize: formatFileSize(file.size),
                compressedSize: formatFileSize(file.size),
                reduction: 0,
                compressed: false,
            });
        }
    };

    const saveForm = async (e) => {
        e.preventDefault();
        const payload = cleanPayload(activeTab, form);
        try {
            if (modal.mode === 'complete') {
                await api.post(`${endpoints.tickets}${modal.id}/selesai/`, {
                    completed_at: payload.completed_at,
                    resolution: payload.resolution || '',
                    sparepart: payload.sparepart || '',
                    cost: payload.cost || 0,
                });
                toast.success('Catatan perbaikan ditandai selesai.');
            } else if (modal.mode === 'edit') {
                const body = activeTab === 'tickets' ? buildTicketFormData(payload) : payload;
                await api.patch(`${endpoints[activeTab]}${modal.id}/`, body, activeTab === 'tickets' ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
                toast.success('Catatan IT berhasil diperbarui.');
            } else {
                const body = activeTab === 'tickets' ? buildTicketFormData(payload) : payload;
                await api.post(endpoints[activeTab], body, activeTab === 'tickets' ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
                toast.success('Catatan IT berhasil ditambahkan.');
            }
            setModal(null);
            setTicketFotoInfo(null);
            fetchRows();
        } catch (err) {
            const data = err.response?.data;
            toast.error(typeof data === 'string' ? data : data?.error || 'Catatan IT gagal disimpan.');
        }
    };

    const deleteRow = async (row) => {
        const label = row.title || row.name || row.device_name || row.file_name || `ID ${row.id}`;
        if (!window.confirm(`Hapus catatan "${label}"?`)) return;
        try {
            await api.delete(`${endpoints[activeTab]}${row.id}/`);
            toast.success('Catatan IT berhasil dihapus.');
            fetchRows();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Catatan IT gagal dihapus.');
        }
    };

    const revealSecret = async (tab, row) => {
        try {
            const res = await api.get(`${endpoints[tab]}${row.id}/reveal/`);
            setSecret({ tab, id: row.id, data: res.data });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Data rahasia gagal dibuka.');
        }
    };

    return (
        <div className="pc-page it-page">
            <section className="pc-list-area">
                <div className="pc-list-head" style={{ marginBottom: '16px' }}>
                    <div>
                        <p className="pc-list-title">Administrasi {currentTab?.label || 'IT'}</p>
                        <p className="pc-list-subtitle">Kelola dan filter data {currentTab?.label || ''} sesuai kebutuhan audit IT.</p>
                    </div>
                </div>

                <div className="pc-section-card">
                    <div className="pc-table-titlebar">
                        <div>
                            <p className="pc-table-heading">{currentTab.label}</p>
                            <p className="pc-table-subheading">{count} catatan ditemukan</p>
                        </div>
                        <div className="pc-hero-actions">
                            <button className="pc-action-primary" onClick={openCreate}><Plus size={16} /> Tambah {currentTab.label}</button>
                        </div>
                    </div>

                    <div className="pc-filter-bar">
                        <div className="pc-filter-row">
                            <div className="pc-filter-search">
                                <Search size={16} />
                                <input className="pc-filter-input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari catatan IT..." />
                            </div>
                            <button className="pc-btn-sm n" onClick={() => { fetchRows(); }}><RefreshCw size={15} /> Refresh</button>
                        </div>
                    </div>

                    <div className="pc-table-wrap">
                        <table className="pc-table">
                            <thead>{renderHead(activeTab)}</thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" className="pc-empty-state">Memuat data...</td></tr>
                                ) : rows.length ? rows.map((row, idx) => renderRow(activeTab, row, openEdit, deleteRow, revealSecret, secret, openComplete, openDetail, setPreviewImage, idx)) : (
                                    <tr><td colSpan="8" className="pc-empty-state">Belum ada data.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={count}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        className="pc-pagination"
                        buttonClassName="pc-page-btn"
                        selectClassName="pc-filter-select"
                    />
                </div>
            </section>

            {modal && createPortal(
                <div className="pc-overlay">
                    <form className="pc-modal lg" onSubmit={saveForm}>
                        <ModalHead
                            icon={modal.mode === 'complete' ? <CheckCircle2 size={18} /> : <CurrentIcon size={18} />}
                            title={`${modal.mode === 'complete' ? 'Selesaikan' : modal.mode === 'edit' ? 'Edit' : 'Tambah'} ${currentTab.label}`}
                            subtitle={modal.mode === 'complete' ? 'Isi jam selesai dan solusi pekerjaan.' : 'Isi data yang dibutuhkan untuk dokumentasi IT.'}
                        />
                        {modal.mode === 'detail'
                            ? <DetailContent tab={activeTab} row={modal.row} onPreview={setPreviewImage} />
                            : renderForm(activeTab, form, setForm, users, modal?.mode, ticketFotoInfo, handleTicketFotoChange, setPreviewImage)}
                        <div className="pc-modal-footer">
                            <button type="button" className="pc-btn-ghost" onClick={() => setModal(null)}>{modal.mode === 'detail' ? 'Tutup' : 'Batal'}</button>
                            {modal.mode !== 'detail' && <button className="pc-btn-primary" type="submit">Simpan</button>}
                        </div>
                    </form>
                </div>,
                document.body
            )}
            {previewImage && createPortal(
                <div className="pc-overlay" onClick={() => setPreviewImage(null)}>
                    <div className="it-image-preview" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="pc-btn-sm n" onClick={() => setPreviewImage(null)}><X size={18} /></button>
                        <img src={previewImage} alt="Preview gangguan" />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}



function ModalHead({ icon, title, subtitle }) {
    return (
        <div className="pc-modal-head">
            <span className="pc-modal-title-icon">{icon}</span>
            <div className="pc-modal-head-copy">
                <h2 className="pc-modal-head-title">{title}</h2>
                {subtitle && <p className="pc-modal-head-subtitle">{subtitle}</p>}
            </div>
        </div>
    );
}

function ModalSummary({ label, value, description, meta }) {
    return (
        <div className="pc-modal-summary">
            <div>
                <p className="pc-modal-summary-label">{label}</p>
                <p className="pc-modal-summary-value">{value}</p>
                {description && <p className="pc-modal-summary-desc">{description}</p>}
                {meta && <p className="pc-modal-summary-meta">{meta}</p>}
            </div>
        </div>
    );
}

function ModalSection({ icon, title, children }) {
    return (
        <section className="pc-modal-section">
            {title && <p className="pc-modal-section-title">{icon}{title}</p>}
            {children}
        </section>
    );
}

function DetailGrid({ items }) {
    return (
        <div className="pc-detail-grid">
            {items.map(([label, value]) => (
                <div className="pc-detail-item" key={label}>
                    <p className="pc-detail-label">{label}</p>
                    <p className="pc-detail-value">{value}</p>
                </div>
            ))}
        </div>
    );
}

function renderHead(tab) {
    const heads = {
        backups: ['Jenis', 'Status', 'File', 'Lokasi', 'Selesai', 'Aksi'],
        tickets: ['Gangguan', 'Pelapor', 'Prioritas', 'Status', 'Foto', 'Aksi'],
        credentials: ['Nama', 'Kategori', 'Username', 'Link', 'Password', 'Aksi'],
        remote: ['Perangkat', 'User/Unit', 'AnyDesk', 'RustDesk', 'Status', 'Aksi'],
        subscriptions: ['Layanan', 'Vendor', 'Masa Aktif', 'Biaya', 'Status', 'Aksi'],
    };
    return <tr>{heads[tab].map((head) => <th key={head}>{head}</th>)}</tr>;
}

function renderRow(tab, row, openEdit, deleteRow, revealSecret, secret, openComplete, openDetail, setPreviewImage, idx = 0) {
    if (tab === 'backups') {
        return (
            <tr key={row.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                <td>{row.backup_type_label}</td>
                <td><Badge tone={row.status}>{row.status_label}</Badge></td>
                <td><strong>{row.file_name || '-'}</strong><small>{row.file_size_mb ? `${row.file_size_mb} MB` : ''}</small></td>
                <td>{row.storage_path || '-'}</td>
                <td>{formatDate(row.finished_at || row.created_at)}</td>
                <ActionCell row={row} openEdit={openEdit} deleteRow={deleteRow} onDetail={() => openDetail(row)} />
            </tr>
        );
    }
    if (tab === 'tickets') {
        return (
            <tr key={row.id}>
                <td><strong>{row.title}</strong><small>{row.category_label} - {formatDate(row.requested_at)}</small></td>
                <td>{row.requester_name || row.requester_user_name || '-'}<small>{row.unit || row.requester_user_unit || ''}</small></td>
                <td><Badge tone={row.priority}>{row.priority_label}</Badge></td>
                <td><Badge tone={row.status}>{row.status_label}</Badge><small>{row.completed_at ? `Selesai ${formatDate(row.completed_at)}` : row.description || ''}</small></td>
                <td>{row.foto_url ? <button className="pc-btn-sm n" onClick={() => setPreviewImage(row.foto_url)}><Image size={14} /> Preview</button> : '-'}</td>
                <ActionCell row={row} openEdit={openEdit} deleteRow={deleteRow} onDetail={() => openDetail(row)} onComplete={row.status !== 'done' ? () => openComplete(row) : null} />
            </tr>
        );
    }
    if (tab === 'credentials') {
        const visible = secret?.tab === tab && secret?.id === row.id;
        return (
            <tr key={row.id}>
                <td><strong>{row.name}</strong><small>{row.owner || ''}</small></td>
                <td>{row.category_label}</td>
                <td>{row.username || '-'}</td>
                <td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer"><LinkIcon size={14} /> Buka</a> : '-'}</td>
                <td>{visible ? <code>{secret.data.password_value || '-'}</code> : row.has_password ? 'Tersimpan' : '-'}</td>
                <ActionCell row={row} openEdit={openEdit} deleteRow={deleteRow} onDetail={() => openDetail(row)} onReveal={() => revealSecret(tab, row)} revealIcon={visible ? EyeOff : Eye} />
            </tr>
        );
    }
    if (tab === 'subscriptions') {
        const daysLeft = row.days_left;
        const daysText = daysLeft === null || daysLeft === undefined ? '' : daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} hari` : `${daysLeft} hari lagi`;
        return (
            <tr key={row.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                <td><strong>{row.name}</strong><small>{row.service_type_label || row.service_type}</small></td>
                <td>{row.vendor || '-'}<small>{row.account_ref || row.pic || ''}</small></td>
                <td>{row.end_date || '-'}<small>{daysText}</small></td>
                <td>Rp {Number(row.cost || 0).toLocaleString('id-ID')}<small>{row.billing_cycle_label || row.billing_cycle}</small></td>
                <td><Badge tone={row.status}>{row.status_label}</Badge></td>
                <ActionCell row={row} openEdit={openEdit} deleteRow={deleteRow} onDetail={() => openDetail(row)} />
            </tr>
        );
    }
    const visible = secret?.tab === tab && secret?.id === row.id;
    return (
        <tr key={row.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
            <td><strong>{row.device_name}</strong><small>{row.location || ''}</small></td>
            <td>{row.user_owner || '-'}<small>{row.unit || ''}</small></td>
            <td>{row.anydesk_id || '-'}</td>
            <td>{row.rustdesk_id || '-'}</td>
            <td><Badge tone={row.status}>{row.status_label}</Badge>{visible && <small><code>{secret.data.access_password_value || '-'}</code></small>}</td>
            <ActionCell row={row} openEdit={openEdit} deleteRow={deleteRow} onDetail={() => openDetail(row)} onReveal={() => revealSecret(tab, row)} revealIcon={visible ? EyeOff : Eye} />
        </tr>
    );
}

function ActionCell({ row, openEdit, deleteRow, onReveal, revealIcon: RevealIcon, onComplete, onDetail }) {
    return (
        <td style={{ textAlign: 'right' }}>
            <div className="pc-action-cell">
                {onComplete && <button className="pc-btn-sm g" title="Selesai" onClick={onComplete}><CheckCircle2 size={14} /> Selesai</button>}
                {onDetail && <button className="pc-btn-sm n" title="Detail" onClick={onDetail}><FileText size={14} /> Detail</button>}
                {onReveal && <button className="pc-btn-sm n" title="Lihat rahasia" onClick={onReveal}><RevealIcon size={14} /> Lihat</button>}
                <button className="pc-btn-sm b" title="Edit" onClick={() => openEdit(row)}><Edit3 size={14} /> Edit</button>
                <button className="pc-btn-sm r" title="Hapus" onClick={() => deleteRow(row)}><Trash2 size={14} /> Hapus</button>
            </div>
        </td>
    );
}

function Select({ value, onChange, options }) {
    return <select className="pc-select" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}

function DetailContent({ tab, row, onPreview }) {
    if (!row) return null;
    const common = tab === 'tickets'
        ? [
            ['Pelapor', row.requester_name || row.requester_user_name || '-'],
            ['Unit', row.unit || row.requester_user_unit || '-'],
            ['Kategori', row.category_label || '-'],
            ['Prioritas', row.priority_label || '-'],
            ['Status', row.status_label || '-'],
            ['Tanggal/Jam', formatDate(row.requested_at)],
            ['Selesai', formatDate(row.completed_at)],
            ['Biaya', `Rp ${Number(row.cost || 0).toLocaleString('id-ID')}`],
        ]
        : tab === 'backups'
            ? [
                ['Jenis', row.backup_type_label || '-'],
                ['Status', row.status_label || '-'],
                ['File', row.file_name || '-'],
                ['Ukuran', row.file_size_mb ? `${row.file_size_mb} MB` : '-'],
                ['Mulai', formatDate(row.started_at)],
                ['Selesai', formatDate(row.finished_at)],
            ]
            : tab === 'credentials'
                ? [
                    ['Nama', row.name || '-'],
                    ['Kategori', row.category_label || '-'],
                    ['Username', row.username || '-'],
                    ['Pemilik', row.owner || '-'],
                    ['Link', row.url || '-'],
                    ['Status', row.is_active ? 'Aktif' : 'Nonaktif'],
                ]
                : tab === 'subscriptions'
                    ? [
                        ['Jenis', row.service_type_label || '-'],
                        ['Vendor', row.vendor || '-'],
                        ['Akun/Kontrak', row.account_ref || '-'],
                        ['PIC', row.pic || '-'],
                        ['Mulai', row.start_date || '-'],
                        ['Berakhir', row.end_date || '-'],
                        ['Siklus', row.billing_cycle_label || '-'],
                        ['Biaya', `Rp ${Number(row.cost || 0).toLocaleString('id-ID')}`],
                        ['Status', row.status_label || '-'],
                        ['Reminder', `${row.reminder_days || 0} hari sebelum jatuh tempo`],
                    ]
                    : [
                    ['Perangkat', row.device_name || '-'],
                    ['User', row.user_owner || '-'],
                    ['Unit', row.unit || '-'],
                    ['Lokasi', row.location || '-'],
                    ['AnyDesk', row.anydesk_id || '-'],
                    ['RustDesk', row.rustdesk_id || '-'],
                    ['Status', row.status_label || '-'],
                ];

    return (
        <>
            <ModalSummary
                label={tab === 'tickets' ? 'Detail Perbaikan IT' : tab === 'subscriptions' ? 'Detail Langganan' : 'Detail Catatan IT'}
                value={tab === 'tickets' ? (row.title || '-') : (row.name || row.device_name || row.file_name || '-')}
                description={tab === 'tickets' ? (row.description || 'Tidak ada keluhan tertulis.') : (row.notes || '')}
                meta={tab === 'tickets' ? `${row.status_label || '-'} | ${formatDate(row.requested_at)}` : formatDate(row.updated_at || row.created_at)}
            />
            <ModalSection icon={<FileText size={15} />} title="Informasi Utama">
                <DetailGrid items={common} />
            </ModalSection>
            {tab === 'tickets' && (
                <>
                    <ModalSection icon={<ClipboardList size={15} />} title="Keluhan">
                        <p className="pc-detail-value">{row.description || '-'}</p>
                    </ModalSection>
                    <ModalSection icon={<CheckCircle2 size={15} />} title="Solusi">
                        <p className="pc-detail-value">{row.resolution || '-'}</p>
                        {row.sparepart && <p className="pc-detail-value" style={{ marginTop: 10 }}>Sparepart: {row.sparepart}</p>}
                    </ModalSection>
                    {row.foto_url && (
                        <ModalSection icon={<Image size={15} />} title="Foto Gangguan">
                            <ExistingTicketPhoto url={row.foto_url} onPreview={onPreview} />
                        </ModalSection>
                    )}
                </>
            )}
            {tab !== 'tickets' && row.notes && (
                <ModalSection icon={<FileText size={15} />} title="Catatan">
                    <p className="pc-detail-value">{row.notes}</p>
                </ModalSection>
            )}
        </>
    );
}

function ExistingTicketPhoto({ url, onPreview }) {
    if (!url) return null;
    return (
        <div className="pc-upload-preview">
            <img className="pc-upload-thumb" src={url} alt="Foto gangguan" onClick={() => onPreview(url)} />
            <div className="pc-upload-meta">
                <p className="pc-upload-name">Foto gangguan tersimpan</p>
                <p className="pc-upload-info">Klik preview untuk melihat foto tanpa membuka tab baru.</p>
            </div>
            <button className="pc-btn-sm n" type="button" onClick={() => onPreview(url)}>Preview</button>
        </div>
    );
}

function TicketUploadPreview({ file, info, existingUrl, onPreview }) {
    const url = useMemo(() => {
        if (!file || !file.type?.startsWith('image/')) return '';
        return URL.createObjectURL(file);
    }, [file]);

    useEffect(() => {
        if (!url) return undefined;
        return () => URL.revokeObjectURL(url);
    }, [url]);

    const previewUrl = url || existingUrl;
    if (!file && !existingUrl) return null;

    return (
        <div className="pc-upload-preview">
            {previewUrl ? (
                <img className="pc-upload-thumb" src={previewUrl} alt={info?.name || 'Foto gangguan'} onClick={() => onPreview(previewUrl)} />
            ) : (
                <div className="pc-upload-doc"><Image size={20} /></div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{info?.name || 'Foto gangguan tersimpan'}</p>
                <p className="pc-upload-info">
                    {info
                        ? info.compressed
                            ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)`
                            : `${info.originalSize} - tidak dikompres`
                        : 'Foto yang sudah tersimpan'}
                </p>
            </div>
            {previewUrl && <button className="pc-btn-sm n" type="button" onClick={() => onPreview(previewUrl)}>Preview</button>}
        </div>
    );
}

function TicketFilePicker({ file, info, existingUrl, onChange, onPreview }) {
    return (
        <>
            <label className={`pc-file-zone${file || existingUrl ? ' has-file' : ''}`}>
                <input type="file" accept="image/*" onChange={onChange} />
                <span className="pc-file-icon"><Paperclip size={20} /></span>
                <span className="pc-file-main">
                    <span className="pc-file-title">{file ? file.name : existingUrl ? 'Foto gangguan tersimpan' : 'Upload foto gangguan'}</span>
                    <span className="pc-file-subtitle">
                        {info
                            ? info.compressed
                                ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)`
                                : `${info.originalSize} - tidak dikompres`
                            : 'Opsional, JPG/PNG akan dikompres otomatis.'}
                    </span>
                </span>
                <span className="pc-file-pick">{file || existingUrl ? 'Ganti' : 'Pilih File'}</span>
            </label>
            <TicketUploadPreview file={file} info={info} existingUrl={existingUrl} onPreview={onPreview} />
        </>
    );
}

function renderForm(tab, form, setForm, users = [], mode = 'create', ticketFotoInfo = null, onTicketFotoChange, onPreview) {
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const setRequester = (value) => {
        const selected = users.find((u) => String(u.id) === String(value));
        setForm((prev) => ({
            ...prev,
            requester_user: value,
            requester_name: selected ? `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || selected.username : prev.requester_name,
            unit: selected ? (selected.unit_nama || selected.role_label || selected.role || '') : prev.unit,
        }));
    };
    if (tab === 'backups') {
        return (
            <>
                <ModalSummary
                    label={mode === 'edit' ? 'Edit Catatan Backup' : 'Catatan Backup Baru'}
                    value={form.file_name || 'Backup IT'}
                    description="Dokumentasikan lokasi backup, status, dan catatan verifikasi agar audit restore lebih mudah."
                    meta={form.finished_at ? `Selesai ${formatDate(form.finished_at)}` : 'Catatan backup dan restore'}
                />
                <ModalSection icon={<DatabaseBackup size={15} />} title="Informasi Backup">
                    <div className="pc-grid2">
                        <Field label="Jenis"><Select value={form.backup_type} onChange={(v) => set('backup_type', v)} options={optionSets.backup_type} /></Field>
                        <Field label="Status"><Select value={form.status} onChange={(v) => set('status', v)} options={optionSets.backup_status} /></Field>
                        <Field label="Nama file"><input className="pc-input" value={form.file_name} onChange={(e) => set('file_name', e.target.value)} /></Field>
                        <Field label="Ukuran MB"><input className="pc-input" type="number" step="0.01" value={form.file_size_mb || ''} onChange={(e) => set('file_size_mb', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<CheckCircle2 size={15} />} title="Waktu dan Lokasi">
                    <div className="pc-grid2">
                        <Field label="Mulai"><input className="pc-input" type="datetime-local" value={form.started_at || ''} onChange={(e) => set('started_at', e.target.value)} /></Field>
                        <Field label="Selesai"><input className="pc-input" type="datetime-local" value={form.finished_at || ''} onChange={(e) => set('finished_at', e.target.value)} /></Field>
                        <Field label="Lokasi penyimpanan" wide><input className="pc-input" value={form.storage_path} onChange={(e) => set('storage_path', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<FileText size={15} />} title="Catatan">
                    <Field label="Catatan"><textarea className="pc-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
                </ModalSection>
            </>
        );
    }
    if (tab === 'tickets') {
        if (mode === 'complete') {
            return (
                <>
                    <ModalSummary
                        label="Proses Penyelesaian"
                        value={form.title || 'Gangguan IT'}
                        description={form.description || 'Isi jam selesai dan solusi pekerjaan sebagai catatan audit.'}
                        meta={`${form.requester_name || 'Pelapor'} | ${form.unit || 'Unit'}`}
                    />
                    <ModalSection icon={<CheckCircle2 size={15} />} title="Hasil Penanganan">
                        <div className="pc-grid2">
                            <Field label="Jam selesai"><input className="pc-input" type="datetime-local" value={form.completed_at || ''} onChange={(e) => set('completed_at', e.target.value)} /></Field>
                            <Field label="Biaya"><input className="pc-input" type="number" step="0.01" value={form.cost || ''} onChange={(e) => set('cost', e.target.value)} /></Field>
                            <Field label="Sparepart diganti" wide><input className="pc-input" value={form.sparepart || ''} onChange={(e) => set('sparepart', e.target.value)} placeholder="Opsional" /></Field>
                            <Field label="Solusi" wide><textarea className="pc-textarea" required value={form.resolution || ''} onChange={(e) => set('resolution', e.target.value)} /></Field>
                        </div>
                    </ModalSection>
                </>
            );
        }
        return (
            <>
                <ModalSummary
                    label={mode === 'edit' ? 'Edit Catatan Perbaikan' : 'Catatan Perbaikan Baru'}
                    value={form.title || 'Gangguan IT'}
                    description="Data ini akan menjadi dasar tracking gangguan, audit pekerjaan IT, dan laporan perbaikan."
                    meta={form.requested_at ? `Tanggal masuk ${formatDate(form.requested_at)}` : ''}
                />
                <ModalSection icon={<ClipboardList size={15} />} title="Identitas Pelapor">
                    <div className="pc-grid2">
                        <Field label="Pelapor">
                            <select className="pc-select" value={form.requester_user || ''} onChange={(e) => setRequester(e.target.value)}>
                                <option value="">Pilih pelapor</option>
                                {users.map((u) => {
                                    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                                    const unit = u.unit_nama || u.role_label || u.role || '-';
                                    return <option key={u.id} value={u.id}>{name} - {unit}</option>;
                                })}
                            </select>
                        </Field>
                        <Field label="Unit"><input className="pc-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
                        <Field label="Tanggal masuk"><input className="pc-input" type="datetime-local" value={form.requested_at || ''} onChange={(e) => set('requested_at', e.target.value)} /></Field>
                        <Field label="Status"><Select value={form.status} onChange={(v) => set('status', v)} options={optionSets.ticket_status} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<ShieldCheck size={15} />} title="Klasifikasi">
                    <div className="pc-grid2">
                        <Field label="Kategori"><Select value={form.category} onChange={(v) => set('category', v)} options={optionSets.ticket_category} /></Field>
                        <Field label="Prioritas"><Select value={form.priority} onChange={(v) => set('priority', v)} options={optionSets.priority} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<FileText size={15} />} title="Keluhan dan Dokumentasi">
                    <div className="pc-grid2">
                        <Field label="Judul" wide><input className="pc-input" required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
                        <Field label="Keluhan" wide><textarea className="pc-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
                        <div className="pc-field wide">
                            <span className="pc-label">Foto Gangguan</span>
                            <TicketFilePicker
                                file={form.foto instanceof File ? form.foto : null}
                                info={ticketFotoInfo}
                                existingUrl={!form.foto ? form.foto_url : ''}
                                onChange={onTicketFotoChange}
                                onPreview={onPreview}
                            />
                        </div>
                    </div>
                </ModalSection>
            </>
        );
    }
    if (tab === 'credentials') {
        return (
            <>
                <ModalSummary
                    label={mode === 'edit' ? 'Edit Akun dan Link' : 'Catatan Akun dan Link Baru'}
                    value={form.name || 'Akses Sistem'}
                    description="Simpan link, username, dan password penting dalam catatan IT yang bisa diaudit."
                    meta={form.owner ? `Pemilik ${form.owner}` : 'Akun, website, server, database, dan vendor'}
                />
                <ModalSection icon={<KeyRound size={15} />} title="Identitas Akses">
                    <div className="pc-grid2">
                        <Field label="Nama" wide><input className="pc-input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
                        <Field label="Kategori"><Select value={form.category} onChange={(v) => set('category', v)} options={optionSets.credential_category} /></Field>
                        <Field label="Pemilik"><input className="pc-input" value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
                        <Field label="Link" wide><input className="pc-input" value={form.url} onChange={(e) => set('url', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<ShieldCheck size={15} />} title="Credential">
                    <div className="pc-grid2">
                        <Field label="Username"><input className="pc-input" value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
                        <Field label="Password"><input className="pc-input" type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} placeholder="Kosongkan jika tidak diubah" /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<FileText size={15} />} title="Catatan">
                    <Field label="Catatan"><textarea className="pc-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
                </ModalSection>
            </>
        );
    }
    if (tab === 'subscriptions') {
        return (
            <>
                <ModalSummary
                    label={mode === 'edit' ? 'Edit Langganan' : 'Catatan Langganan Baru'}
                    value={form.name || 'Layanan Berlangganan'}
                    description="Pantau masa aktif domain, hosting, SSL, lisensi, internet, dan layanan vendor supaya tidak terlewat saat perpanjangan."
                    meta={form.end_date ? `Berakhir ${form.end_date}` : 'Masa aktif dan biaya berlangganan'}
                />
                <ModalSection icon={<CalendarClock size={15} />} title="Identitas Layanan">
                    <div className="pc-grid2">
                        <Field label="Nama layanan" wide><input className="pc-input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
                        <Field label="Jenis"><Select value={form.service_type} onChange={(v) => set('service_type', v)} options={optionSets.subscription_type} /></Field>
                        <Field label="Status"><Select value={form.status} onChange={(v) => set('status', v)} options={optionSets.subscription_status} /></Field>
                        <Field label="Vendor"><input className="pc-input" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
                        <Field label="PIC"><input className="pc-input" value={form.pic} onChange={(e) => set('pic', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<KeyRound size={15} />} title="Akses dan Referensi">
                    <div className="pc-grid2">
                        <Field label="Nomor akun/kontrak"><input className="pc-input" value={form.account_ref} onChange={(e) => set('account_ref', e.target.value)} /></Field>
                        <Field label="Portal / Link"><input className="pc-input" value={form.url} onChange={(e) => set('url', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<CheckCircle2 size={15} />} title="Masa Aktif dan Biaya">
                    <div className="pc-grid2">
                        <Field label="Tanggal mulai"><input className="pc-input" type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
                        <Field label="Tanggal berakhir"><input className="pc-input" type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
                        <Field label="Siklus tagihan"><Select value={form.billing_cycle} onChange={(v) => set('billing_cycle', v)} options={optionSets.billing_cycle} /></Field>
                        <Field label="Biaya"><input className="pc-input" type="number" step="0.01" value={form.cost || ''} onChange={(e) => set('cost', e.target.value)} /></Field>
                        <Field label="Reminder hari"><input className="pc-input" type="number" min="0" value={form.reminder_days || ''} onChange={(e) => set('reminder_days', e.target.value)} /></Field>
                    </div>
                </ModalSection>
                <ModalSection icon={<FileText size={15} />} title="Catatan">
                    <Field label="Catatan"><textarea className="pc-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
                </ModalSection>
            </>
        );
    }
    return (
        <>
            <ModalSummary
                label={mode === 'edit' ? 'Edit Remote Access' : 'Catatan Remote Access Baru'}
                value={form.device_name || 'Perangkat Remote'}
                description="Catat nomor AnyDesk/RustDesk dan akses remote supaya penanganan perangkat lebih cepat."
                meta={form.user_owner || form.unit ? `${form.user_owner || 'User'} | ${form.unit || 'Unit'}` : 'AnyDesk, RustDesk, dan password akses'}
            />
            <ModalSection icon={<Laptop size={15} />} title="Identitas Perangkat">
                <div className="pc-grid2">
                    <Field label="Nama perangkat" wide><input className="pc-input" required value={form.device_name} onChange={(e) => set('device_name', e.target.value)} /></Field>
                    <Field label="User"><input className="pc-input" value={form.user_owner} onChange={(e) => set('user_owner', e.target.value)} /></Field>
                    <Field label="Unit"><input className="pc-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
                    <Field label="Lokasi"><input className="pc-input" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
                    <Field label="Status"><Select value={form.status} onChange={(v) => set('status', v)} options={optionSets.remote_status} /></Field>
                </div>
            </ModalSection>
            <ModalSection icon={<KeyRound size={15} />} title="Akses Remote">
                <div className="pc-grid2">
                    <Field label="AnyDesk ID"><input className="pc-input" value={form.anydesk_id} onChange={(e) => set('anydesk_id', e.target.value)} /></Field>
                    <Field label="RustDesk ID"><input className="pc-input" value={form.rustdesk_id} onChange={(e) => set('rustdesk_id', e.target.value)} /></Field>
                    <Field label="Password akses" wide><input className="pc-input" type="password" value={form.access_password || ''} onChange={(e) => set('access_password', e.target.value)} placeholder="Kosongkan jika tidak diubah" /></Field>
                </div>
            </ModalSection>
            <ModalSection icon={<FileText size={15} />} title="Catatan">
                <Field label="Catatan"><textarea className="pc-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            </ModalSection>
        </>
    );
}
