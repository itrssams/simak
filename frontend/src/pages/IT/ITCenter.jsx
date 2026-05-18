import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Archive, CalendarClock, CheckCircle2, ClipboardList, DatabaseBackup, Edit3, Eye, EyeOff,
    FileText, Image, KeyRound, Laptop, Link as LinkIcon, Paperclip, Plus, RefreshCw, Search, ShieldCheck,
    Trash2, X
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';

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

const ideas = [
    'Inventaris perangkat dan masa garansi',
    'Checklist maintenance server, PC, printer, dan jaringan',
    'Monitoring domain, SSL, hosting, dan lisensi aplikasi',
    'Knowledge base solusi gangguan yang sering terjadi',
    'Jadwal backup otomatis dan uji restore berkala',
    'Daftar vendor, kontak teknis, dan riwayat pekerjaan vendor',
];

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
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('backups');
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(emptyForms.backups);
    const [secret, setSecret] = useState(null);
    const [summary, setSummary] = useState({});
    const [users, setUsers] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [ticketFotoInfo, setTicketFotoInfo] = useState(null);

    const currentTab = useMemo(() => tabs.find((tab) => tab.key === activeTab), [activeTab]);
    const CurrentIcon = currentTab?.icon || ShieldCheck;

    const fetchRows = useCallback(async () => {
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

    const fetchSummary = useCallback(async () => {
        try {
            const [backupRes, ticketRes, subscriptionRes] = await Promise.all([
                api.get(`${endpoints.backups}summary/`),
                api.get(`${endpoints.tickets}summary/`),
                api.get(`${endpoints.subscriptions}summary/`),
            ]);
            setSummary({ backups: backupRes.data, tickets: ticketRes.data, subscriptions: subscriptionRes.data });
        } catch {
            setSummary({});
        }
    }, []);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useEffect(() => {
        api.get('/users/', { params: { page_size: 100 } })
            .then((res) => setUsers(getResults(res.data).filter((u) => u.is_active)))
            .catch(() => setUsers([]));
    }, []);

    const switchTab = (tab) => {
        setActiveTab(tab);
        setPage(1);
        setSearch('');
        setSecret(null);
    };

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
            fetchSummary();
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
            fetchSummary();
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
            <style>{styles}</style>
            <section className="pc-hero">
                <div className="pc-hero-main">
                    <div>
                        <div className="pc-eyebrow"><ShieldCheck size={16} /> Area IT</div>
                        <h1 className="pc-title">IT Center</h1>
                        <p className="pc-subtitle">Kelola backup, audit operasional IT, permintaan perbaikan, akun penting, dan nomor remote access.</p>
                    </div>
                </div>
            </section>

            <section className="pc-stats-mini">
                <Metric icon={Archive} label="Catatan Backup" value={summary.backups?.total || 0} sub={`${summary.backups?.failed || 0} gagal`} color="#1d4ed8" bg="#eff6ff" />
                <Metric icon={ClipboardList} label="Tiket Terbuka" value={(summary.tickets?.open || 0) + (summary.tickets?.in_progress || 0)} sub={`${summary.tickets?.urgent || 0} darurat`} color="#c2410c" bg="#fff7ed" />
                <Metric icon={CheckCircle2} label="Tiket Selesai" value={summary.tickets?.done || 0} sub="Riwayat tersimpan" color="#166534" bg="#f0fdf4" />
                <Metric icon={CalendarClock} label="Langganan" value={summary.subscriptions?.total || 0} sub={`${summary.subscriptions?.expiring || 0} hampir habis`} color="#7c3aed" bg="#f5f3ff" />
            </section>

            <section className="pc-list-area">
                <div className="pc-list-head">
                    <div>
                        <p className="pc-list-title">Administrasi IT</p>
                        <p className="pc-list-subtitle">Pilih kategori catatan, filter data, lalu proses sesuai kebutuhan audit IT.</p>
                    </div>
                    <div className="pc-tabs">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button key={tab.key} className={`pc-tab-pill${activeTab === tab.key ? ' active' : ''}`} onClick={() => switchTab(tab.key)}>
                                    <Icon size={15} /> {tab.label}
                                </button>
                            );
                        })}
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
                            <button className="pc-btn-sm n" onClick={() => { fetchRows(); fetchSummary(); }}><RefreshCw size={15} /> Refresh</button>
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

            <section className="pc-section-card it-ideas">
                <h2>Ide menu IT berikutnya</h2>
                <div className="it-idea-grid">
                    {ideas.map((idea) => <div key={idea}><CheckCircle2 size={16} /> {idea}</div>)}
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

function Metric({ icon: Icon, label, value, sub, color, bg }) {
    return (
        <div className="pc-stat-mini">
            <div className="pc-stat-icon" style={{ background: bg }}><Icon size={18} color={color} /></div>
            <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</p>
            </div>
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

const styles = `
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.it-page{display:flex;flex-direction:column;gap:18px;color:#0f172a;animation:fadeInUp .4s ease both}
.pc-hero{position:relative;overflow:hidden;border:1px solid #dfe9e4;border-radius:18px;background:linear-gradient(135deg,#f8fbf9 0%,#eef7f1 52%,#fffaf0 100%);padding:24px;box-shadow:0 14px 38px rgba(22,44,31,.08)}
.pc-hero::after{content:'';position:absolute;right:-72px;top:-96px;width:260px;height:260px;border-radius:50%;background:rgba(26,71,49,.07);pointer-events:none}
.pc-hero-main{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.pc-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#1a4731;background:#e7f4ed;border:1px solid #cfe8da;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.pc-title{font-size:28px;font-weight:800;color:#12251a;letter-spacing:0;line-height:1.18;margin:0}
.pc-subtitle{font-size:14px;color:#63766d;line-height:1.6;margin-top:8px;max-width:680px}
.pc-hero-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.pc-action-primary,.pc-action-soft{height:40px;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,box-shadow .15s,background .15s,border-color .15s;white-space:nowrap}
.pc-action-primary{padding:0 15px;background:#1a4731;color:#fff;border:1px solid #1a4731;box-shadow:0 10px 22px rgba(26,71,49,.2)}
.pc-action-primary:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(26,71,49,.25)}
.pc-action-soft{padding:0 14px;background:#fff;color:#1a4731;border:1px solid #cfe8da}
.pc-action-soft:hover{background:#f0fdf4;border-color:#9dd8b8}
.pc-action-soft.gold{background:#c9a84c;color:#17251d;border-color:#c9a84c}.pc-action-soft.gold:hover{background:#b8923d}
.pc-stats-mini{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.pc-stat-mini{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 8px 24px rgba(15,23,42,.05);border:1px solid #e7eee9;display:flex;align-items:center;gap:14px;animation:fadeInUp .3s ease both}
.pc-stat-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pc-list-area{margin-top:4px;padding:14px;border:1px solid #e1ece6;border-radius:20px;background:linear-gradient(180deg,#f8fbf9,#eef5f1);box-shadow:inset 0 1px 0 rgba(255,255,255,.75)}
.pc-list-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.pc-list-title{font-size:16px;font-weight:800;color:#17251d;margin:0}
.pc-list-subtitle{font-size:12px;color:#7b8d85;margin-top:4px}
.pc-tabs{display:flex;gap:6px;margin:6px 0 0;background:#eaf1ed;border:1px solid #dce8e2;border-radius:14px;padding:5px;width:100%;max-width:720px}
.pc-tab-pill{flex:1;padding:11px 18px;border:none;border-radius:10px;font-size:13.5px;font-weight:800;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;background:transparent;color:#64748b;transition:background .18s,color .18s,box-shadow .18s;display:inline-flex;align-items:center;justify-content:center;gap:7px;outline:none}
.pc-tab-pill.active{background:#fff;color:#1a4731;box-shadow:0 8px 18px rgba(15,23,42,.08)}
.pc-tab-pill:hover:not(.active){color:#334155;background:rgba(0,0,0,.04)}
.pc-section-card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px rgba(15,23,42,.07);border:1px solid #e1ece6;margin-top:14px}
.pc-table-titlebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #edf3ef;background:linear-gradient(135deg,#fbfdfc,#f2f8f5)}
.pc-table-titlebar p{margin:0}.pc-table-heading{font-size:15px;font-weight:800;color:#17251d}.pc-table-subheading{font-size:12px;color:#8aa097;margin-top:3px!important}
.pc-filter-bar{display:flex;flex-direction:column;gap:8px;padding:16px 18px;border-bottom:1px solid #edf3ef;background:#fff}
.pc-filter-row{display:flex;gap:10px;align-items:center;flex-wrap:nowrap}
.pc-filter-search{display:flex;align-items:center;gap:8px;min-width:260px;flex:1;border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:0 11px;color:#94a3b8;transition:border-color .15s,box-shadow .15s}
.pc-filter-search:focus-within{border-color:#2d6a4f;box-shadow:0 0 0 3px rgba(45,106,79,.08)}
.pc-filter-input{padding:7px 11px;border:1px solid #e2e8f0;border-radius:7px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s;min-width:0;box-sizing:border-box;flex:1}
.pc-filter-search .pc-filter-input{border:none!important;padding:8px 0!important;box-shadow:none!important;background:transparent!important}
.pc-filter-select{height:38px;padding:7px 12px;border:1px solid #e2e8f0;border-radius:9px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;outline:none;background:#fff;transition:border-color .15s;flex-shrink:0}
.pc-input,.pc-select,.pc-textarea{width:100%;padding:12px 14px;border:1px solid #dce8e2;border-radius:11px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#1e293b;background:linear-gradient(180deg,#fff,#fbfdfc);outline:none;transition:border-color .15s,box-shadow .15s,background .15s;box-sizing:border-box}
.pc-input:hover,.pc-select:hover,.pc-textarea:hover{border-color:#c8dcd1}.pc-input:focus,.pc-select:focus,.pc-textarea:focus{border-color:#2d6a4f;background:#fff;box-shadow:0 0 0 4px rgba(45,106,79,.09)}
.pc-input:disabled{background:#f8fafc;color:#64748b}.pc-file-input{height:auto}.pc-textarea{resize:vertical;min-height:96px;line-height:1.55}
.pc-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}.pc-field.wide{grid-column:1/-1}.pc-label{font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em}
.pc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pc-it-form-grid{margin-top:8px}
.pc-btn-primary{padding:10px 22px;background:linear-gradient(135deg,#1a4731 0%,#236348 100%);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 4px 12px rgba(26,71,49,.2)}
.pc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(26,71,49,.3)}
.pc-btn-ghost{padding:10px 20px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:background .15s}
.pc-btn-ghost:hover{background:#e2e8f0}
.pc-btn-sm{min-height:30px;padding:6px 11px;border-radius:8px;font-size:11.5px;font-weight:800;cursor:pointer;border:1px solid;font-family:'Plus Jakarta Sans',sans-serif;transition:background .14s,transform .1s,box-shadow .14s,border-color .14s;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.pc-btn-sm:hover{transform:translateY(-1px)}.pc-btn-sm.n{border-color:#dce8e2;color:#475569;background:#fff}.pc-btn-sm.n:hover{background:#f8fbf9;border-color:#bfd5c9}.pc-btn-sm.g{border-color:#1a4731;color:#fff;background:#1a4731;box-shadow:0 8px 18px rgba(26,71,49,.18)}.pc-btn-sm.g:hover{background:#236348;border-color:#236348}.pc-btn-sm.b{border-color:#1d4ed8;color:#fff;background:#1d4ed8;box-shadow:0 8px 18px rgba(29,78,216,.16)}.pc-btn-sm.b:hover{background:#1e40af;border-color:#1e40af}.pc-btn-sm.r{border-color:#fecaca;color:#dc2626;background:#fff}.pc-btn-sm.r:hover{background:#fef2f2}
.pc-action-cell{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap;min-width:210px}
.pc-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.pc-table{width:100%;min-width:880px;border-collapse:separate;border-spacing:0}.pc-table thead th{padding:14px 16px;text-align:left;font-size:11px;font-weight:800;color:#6b7c74;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e6eee9;background:#f8fbf9}.pc-table tbody td{padding:14px 16px;font-size:13px;color:#334155;border-bottom:1px solid #edf3ef;vertical-align:middle;background:#fff}.pc-table tbody tr:last-child td{border-bottom:none}.pc-table tbody tr:hover td{background:#f7fbf9}.pc-table strong{display:block}.pc-table small{display:block;color:#94a3b8;margin-top:3px}
.pc-empty-state{padding:54px 24px!important;text-align:center!important;color:#8aa097!important;background:linear-gradient(180deg,#fff,#fbfdfc)!important}
.pc-pagination{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:14px 16px!important;border-top:1px solid #f1f5f9!important;flex-wrap:wrap!important;gap:10px!important}.pc-page-btn{width:32px;height:32px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;color:#475569;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;transition:all .14s}.pc-page-btn:hover:not(:disabled){border-color:#2d6a4f;color:#1a4731;background:#f0fdf4}.pc-page-btn:disabled{opacity:.4;cursor:not-allowed}
.pc-it-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:850;white-space:nowrap;background:#f1f5f9;color:#475569}.pc-it-badge.success,.pc-it-badge.verified,.pc-it-badge.done,.pc-it-badge.active{background:#dcfce7;color:#166534}.pc-it-badge.failed,.pc-it-badge.urgent,.pc-it-badge.cancelled,.pc-it-badge.expired{background:#fee2e2;color:#b91c1c}.pc-it-badge.running,.pc-it-badge.in_progress,.pc-it-badge.high,.pc-it-badge.maintenance,.pc-it-badge.expiring{background:#ffedd5;color:#c2410c}.pc-it-badge.scheduled,.pc-it-badge.waiting{background:#e0f2fe;color:#075985}
.pc-overlay{position:fixed;inset:0;width:100vw;height:100vh;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .18s ease;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);padding:18px}
.pc-modal{background:linear-gradient(180deg,#fff,#fbfdfc);border-radius:20px;padding:30px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 26px 70px rgba(15,23,42,.24);animation:slideUp .22s ease}.pc-modal.lg{max-width:760px}
.pc-modal-head{display:flex;align-items:flex-start;gap:12px;margin:0 0 18px}.pc-modal-title-icon{width:38px;height:38px;border-radius:12px;background:#e7f4ed;color:#1a4731;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}.pc-modal-head-copy{min-width:0;flex:1}.pc-modal-head-title{margin:0;color:#13251b;font-size:20px;font-weight:800;letter-spacing:0;line-height:1.25}.pc-modal-head-subtitle{margin:4px 0 0;color:#7b8d85;font-size:12.5px;line-height:1.55}
.pc-modal-summary{background:linear-gradient(135deg,#f8fbf9,#fff);border:1px solid #e1ece6;border-radius:16px;padding:16px 18px;margin-bottom:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}.pc-modal-summary-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#819189;margin:0 0 7px}.pc-modal-summary-value{font-size:24px;font-weight:800;color:#17251d;line-height:1.15;margin:0}.pc-modal-summary-desc{font-size:13px;color:#64748b;line-height:1.55;margin:9px 0 0}.pc-modal-summary-meta{font-size:12px;color:#8aa097;margin:7px 0 0}
.pc-modal-section{border:1px solid #e7eee9;background:#fff;border-radius:16px;padding:16px 18px;margin-bottom:16px}.pc-modal-section-title{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:800;color:#17251d;text-transform:uppercase;letter-spacing:.045em}.pc-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;margin-bottom:0}.pc-detail-item{min-width:0}.pc-detail-label{font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px}.pc-detail-value{font-size:14px;color:#1e293b;line-height:1.55;font-weight:600;margin:0;word-break:break-word}
.pc-file-zone{position:relative;display:flex;align-items:center;gap:12px;width:100%;border:1.5px dashed #cfdcd5;border-radius:14px;background:#fbfdfc;padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s}.pc-file-zone:hover{border-color:#2d6a4f;background:#f5fbf7}.pc-file-zone.has-file{border-style:solid;background:#f8fbf9}.pc-file-zone input{position:absolute;inset:0;opacity:0;cursor:pointer}.pc-file-icon{width:38px;height:38px;border-radius:12px;background:#e7f4ed;color:#1a4731;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}.pc-file-main{min-width:0;flex:1}.pc-file-title{display:block;font-size:13px;font-weight:800;color:#17251d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pc-file-subtitle{display:block;font-size:11.5px;color:#8aa097;margin-top:3px}.pc-file-pick{position:relative;z-index:1;flex-shrink:0;border:1px solid #dce8e2;background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:800;color:#1a4731}
.pc-upload-preview{display:flex;gap:12px;align-items:center;border:1px solid #e1ece6;background:#fbfdfc;border-radius:14px;padding:10px 12px;margin:10px 0 0}.pc-upload-thumb{width:54px;height:54px;border-radius:12px;object-fit:cover;border:1px solid #dce8e2;cursor:pointer}.pc-upload-doc{width:54px;height:54px;border-radius:12px;background:#eef7f1;color:#1a4731;display:flex;align-items:center;justify-content:center;flex-shrink:0}.pc-upload-meta{min-width:0;flex:1}.pc-upload-name{font-size:13px;font-weight:800;color:#17251d;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pc-upload-info{font-size:11.5px;color:#8aa097;margin:4px 0 0;line-height:1.4}
.pc-modal-footer{display:flex;gap:12px;justify-content:flex-end;position:sticky;bottom:-30px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 28%);margin:18px -30px -30px;padding:18px 30px 22px;border-top:1px solid rgba(225,236,230,.75)}
.it-ideas{padding:16px}.it-ideas h2{font-size:18px;margin:0 0 12px;color:#17251d}.it-idea-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.it-idea-grid div{display:flex;align-items:center;gap:8px;padding:11px;border:1px solid #edf2f7;border-radius:10px;color:#334155;background:#f8fafc;font-weight:700}
.it-image-preview{position:relative;width:min(920px,94vw);height:min(86vh,760px);display:grid;place-items:center}.it-image-preview img{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 22px 70px rgba(15,23,42,.28)}.it-image-preview .pc-btn-sm{position:absolute;right:12px;top:12px}
code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 6px}
@media(max-width:900px){.pc-stats-mini,.it-idea-grid{grid-template-columns:1fr}.pc-hero-actions{justify-content:flex-start}.pc-tabs{max-width:none;overflow:auto}.pc-filter-row{flex-wrap:wrap}.pc-filter-search{min-width:100%}.pc-grid2,.pc-detail-grid{grid-template-columns:1fr}.pc-field.wide{grid-column:auto}.pc-action-primary,.pc-action-soft{width:100%}.pc-modal-summary-value{font-size:20px}.pc-modal-section{padding:14px;margin-bottom:12px}.pc-file-zone{align-items:flex-start}.pc-file-pick{display:none}.pc-upload-preview{align-items:flex-start}}
`;
