import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    BadgeCheck,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Eye,
    FilePlus2,
    Filter,
    ReceiptText,
    Search,
    Stethoscope,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
import { useToast } from '../../context/ToastContext';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import './DaftarKunjunganInvoice.css';

const JENIS_OPTIONS = [
    { value: 'rawat_jalan', label: 'Rawat Jalan' },
    { value: 'rawat_inap', label: 'Rawat Inap' },
    { value: 'ugd', label: 'UGD' },
    { value: 'vk', label: 'VK' },
    { value: 'ok', label: 'OK' },
];

const DONE_OPTIONS = [
    { value: '', label: 'Semua Status' },
    { value: '1', label: 'Sudah Done' },
    { value: '0', label: 'Belum Done' },
];

const INVOICE_OPTIONS = [
    { value: 'belum', label: 'Belum Invoice' },
    { value: '', label: 'Semua Invoice' },
    { value: 'sudah', label: 'Sudah Invoice' },
];

const COST_FIELDS = [
    ['adm', 'Administrasi'],
    ['jasa', 'Jasa'],
    ['farmasi', 'Farmasi'],
    ['tindakan', 'Tindakan'],
    ['fisio', 'Fisioterapi'],
    ['lab', 'Laboratorium'],
    ['lab_pa', 'Lab PA'],
    ['rad', 'Radiologi'],
    ['kamar', 'Kamar'],
    ['bhp', 'BHP'],
    ['ambulan', 'Ambulan'],
    ['alat', 'Alat'],
    ['lainnya', 'Lain-lain'],
];

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `Rp ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const getError = (err, fallback) => err?.response?.data?.error || err?.response?.data?.detail || fallback;


export default function DaftarKunjunganInvoice() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [pembiayaan, setPembiayaan] = useState([]);
    const [selectedNos, setSelectedNos] = useState([]);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({ jenis: '', periode: '' });
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [filters, setFilters] = useState({
        jenis: 'rawat_jalan',
        search: '',
        id_pembiayaan: '',
        done: '',
        invoice_status: 'belum',
        dari: '',
        sampai: '',
    });

    const selectedRows = useMemo(
        () => rows.filter((row) => selectedNos.includes(String(row.no))),
        [rows, selectedNos],
    );
    const selectedTotal = useMemo(
        () => selectedRows.reduce((sum, row) => sum + Number(row.total_biaya || 0), 0),
        [selectedRows],
    );
    const selectedPembiayaanName = selectedRows[0]?.nama_pembiayaan || '';

    const pembiayaanOptions = useMemo(
        () => [
            { value: '', label: 'Semua Pembiayaan' },
            { value: 'non_bpjs', label: 'Non BPJS' },
            ...pembiayaan.map((item) => ({
                value: String(item.id_pembiayaan),
                label: `${item.nama} - ID ${item.id_pembiayaan}`,
            })),
        ],
        [pembiayaan],
    );

    const fetchOptions = useCallback(async () => {
        try {
            const res = await api.get('/keuangan/pembiayaan-options/');
            setPembiayaan(getResults(res.data));
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat opsi pembiayaan.'));
        }
    }, [toast]);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
                ...pageParams(page, pageSize),
            };
            const res = await api.get('/keuangan/kunjungan-invoice/', { params });
            setRows(getResults(res.data));
            setTotal(getCount(res.data));
            setSelectedNos((prev) => prev.filter((no) => getResults(res.data).some((row) => String(row.no) === no)));
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat daftar kunjungan.'));
        } finally {
            setLoading(false);
        }
    }, [filters, page, pageSize, toast]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);
    useEffect(() => { fetchRows(); }, [fetchRows]);
    useEffect(() => { setPage(1); setSelectedNos([]); }, [filters, pageSize]);
    useEffect(() => {
        if (!detail && !invoiceDialogOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [detail, invoiceDialogOpen]);

    const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

    const openDetail = async (row) => {
        setDetail(row);
        setDetailLoading(true);
        try {
            const res = await api.get('/keuangan/kunjungan-invoice/', { params: { no: row.no } });
            setDetail(res.data);
        } catch (err) {
            toast.error(getError(err, 'Gagal memuat detail kunjungan.'));
        } finally {
            setDetailLoading(false);
        }
    };

    const toggleSelected = (row) => {
        const no = String(row.no);
        setSelectedNos((prev) => prev.includes(no) ? prev.filter((item) => item !== no) : [...prev, no]);
    };

    const validateInvoiceSelection = () => {
        if (selectedRows.length === 0) {
            toast.error('Pilih minimal satu kunjungan.');
            return false;
        }
        if (selectedRows.some((row) => !row.status_done)) {
            toast.error('Semua transaksi yang dipilih harus sudah done.');
            return false;
        }
        if (selectedRows.some((row) => row.status_invoice === 'sudah')) {
            toast.error('Kunjungan yang sudah masuk invoice tidak bisa dipilih.');
            return false;
        }
        if (selectedRows.some((row) => Number(row.total_biaya || 0) <= 0)) {
            toast.error('Kunjungan dengan total biaya Rp 0.00 belum bisa dibuat invoice.');
            return false;
        }
        const pembiayaanSet = new Set(selectedRows.map((row) => String(row.id_pembiayaan || '')));
        if (pembiayaanSet.size > 1) {
            toast.error('Pilih kunjungan dengan pembiayaan yang sama.');
            return false;
        }
        return true;
    };

    const openInvoiceDialog = () => {
        if (!validateInvoiceSelection()) return;
        setInvoiceForm({ jenis: '', periode: '' });
        setInvoiceDialogOpen(true);
    };

    const closeInvoiceDialog = () => {
        if (creating) return;
        setInvoiceDialogOpen(false);
        setInvoiceForm({ jenis: '', periode: '' });
    };

    const createInvoice = async (event) => {
        event.preventDefault();
        if (!validateInvoiceSelection()) return;
        if (!invoiceForm.jenis.trim()) {
            toast.error('Jenis invoice wajib diisi.');
            return;
        }
        if (!invoiceForm.periode.trim()) {
            toast.error('Periode invoice wajib diisi.');
            return;
        }

        setCreating(true);
        try {
            const res = await api.post('/keuangan/kunjungan-invoice/', {
                nomor_kunjungan: selectedNos,
                tanggal: today(),
                jenis: invoiceForm.jenis.trim(),
                periode: invoiceForm.periode.trim(),
                beban: selectedPembiayaanName || 'PEMBIAYAAN',
            });

            toast.success(`Invoice ${res.data.nomor_faktur} berhasil dibuat.`);
            setInvoiceDialogOpen(false);
            setInvoiceForm({ jenis: '', periode: '' });
            setSelectedNos([]);
            await fetchRows();
        } catch (err) {
            toast.error(getError(err, 'Gagal membuat invoice dari kunjungan.'));
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="dki-page">        
            <div className="inv-hero">
                <div className="inv-title">
                    <span><ReceiptText size={22} /></span>
                    <div>                        
                        <h1>Daftar Kunjungan</h1>
                        <p>Pilih transaksi pasien yang sudah done untuk dibuatkan invoice pembiayaan.</p>
                    </div>
                </div>                
            </div>

            <section className="dki-summary">
                <SummaryCard icon={ReceiptText} label="Dipilih" value={`${selectedNos.length} kunjungan`} />
                <SummaryCard icon={BadgeCheck} label="Total Terpilih" value={money(selectedTotal)} accent />
                <SummaryCard icon={Activity} label="Data Tampil" value={`${total} kunjungan`} />
            </section>

            <section className="dki-card">
                <div className="dki-card-head">
                    <div className="dki-card-title">
                        <h2>Transaksi Kunjungan</h2>
                        <p>Filter data, cek biaya, lalu pilih kunjungan yang valid untuk invoice.</p>
                    </div>
                    <div className="dki-card-actions">
                        <div className="dki-chip">
                            <Filter size={14} /> {filters.invoice_status === 'belum' ? 'Belum Invoice' : filters.invoice_status === 'sudah' ? 'Sudah Invoice' : 'Semua Invoice'}
                        </div>
                        <button
                            className="dki-primary dki-create-btn"
                            type="button"
                            disabled={selectedNos.length === 0 || creating}
                            onClick={openInvoiceDialog}
                        >
                            <FilePlus2 size={16} /> {creating ? 'Membuat...' : `Buat Invoice (${selectedNos.length})`}
                        </button>
                    </div>
                </div>

                <div className="dki-filter">
                    <div className="dki-filter-row-1">
                        <label className="dki-search">
                            <Search size={16} />
                            <input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Cari no kunjungan / RM / pasien..." />
                        </label>                        

                        <div className="dki-date-range">
                            <label>
                                <span>Dari</span>
                                <DateField value={filters.dari} onChange={(value) => setFilter('dari', value)} />
                            </label>
                            <label>
                                <span>Sampai</span>
                                <DateField value={filters.sampai} onChange={(value) => setFilter('sampai', value)} />
                            </label>
                        </div>
                    </div>

                    <div className="dki-filter-row-2">

                        <SearchablePembiayaanSelect
                            className="dki-filter-pembiayaan"
                            options={pembiayaanOptions}
                            value={filters.id_pembiayaan}
                            onChange={(value) => setFilter('id_pembiayaan', value)}
                            placeholder="Semua Pembiayaan"
                        />

                        <select
                            className="dki-select dki-filter-jenis"
                            value={filters.jenis}
                            onChange={(e) => setFilter('jenis', e.target.value)}
                        >
                            {JENIS_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>

                        <select
                            className="dki-select dki-filter-status"
                            value={filters.done}
                            onChange={(e) => setFilter('done', e.target.value)}
                        >
                            {DONE_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>

                        <select
                            className="dki-select dki-filter-invoice"
                            value={filters.invoice_status}
                            onChange={(e) => setFilter('invoice_status', e.target.value)}
                        >
                            {INVOICE_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>

                        <button
                            className="dki-filter-reset"
                            type="button"
                            onClick={() => {
                                setFilters({
                                    jenis: 'rawat_jalan',
                                    search: '',
                                    id_pembiayaan: '',
                                    done: '',
                                    invoice_status: 'belum',
                                    dari: '',
                                    sampai: '',
                                });
                            }}
                            title="Reset semua filter"
                        >
                            <X size={16} /> Reset
                        </button>
                    </div>
                </div>

                <div className="dki-table-wrap">
                    <table className="dki-table">
                        <thead>
                            <tr>
                                <th className="check">Pilih</th>
                                <th>No Kunjungan</th>
                                <th>Tanggal</th>
                                <th>Pasien</th>
                                <th>Pembiayaan</th>
                                <th className="right">Total Biaya</th>
                                <th>Status</th>
                                <th>Invoice</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="9" className="center dki-state-cell">Memuat daftar kunjungan...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan="9" className="center dki-state-cell">Belum ada kunjungan sesuai filter.</td></tr>
                            ) : rows.map((row) => {
                                const noCharge = Number(row.total_biaya || 0) <= 0;
                                const disabled = !row.status_done || row.status_invoice === 'sudah' || noCharge;
                                return (
                                    <tr key={row.no} className={`${selectedNos.includes(String(row.no)) ? 'selected' : ''}${noCharge ? ' no-charge' : ''}`}>
                                        <td className="check">
                                            <label className="dki-check">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedNos.includes(String(row.no))}
                                                    disabled={disabled}
                                                    onChange={() => toggleSelected(row)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span />
                                            </label>
                                        </td>
                                        <td className="mono dki-visit-no">{row.no}</td>
                                        <td>{dateLabel(row.tgl_masuk)}</td>
                                        <td>
                                            <strong>{row.nama}</strong>
                                            <small>RM {row.noreg} | {row.jenis_label}</small>
                                        </td>
                                        <td>
                                            <strong>{row.nama_pembiayaan || '-'}</strong>
                                            <small>ID Pembiayaan: {row.id_pembiayaan || '-'}</small>
                                        </td>
                                        <td className="right mono dki-money-cell">
                                            {money(row.total_biaya)}
                                            {noCharge && <small className="dki-warning-text">Belum ada biaya</small>}
                                        </td>
                                        <td><StatusBadge done={row.status_done} /></td>
                                        <td><InvoiceBadge row={row} /></td>
                                        <td>
                                            <button className="dki-icon-btn" type="button" onClick={() => openDetail(row)} title="Lihat detail">
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="dki-pagination-wrap">
                    <SimplePagination
                        page={page}
                        pageSize={pageSize}
                        total={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        buttonClassName="dki-page-btn"
                        selectClassName="dki-page-size"
                    />
                </div>
            </section>

            {invoiceDialogOpen && (
                <div className="dki-modal-backdrop" onMouseDown={closeInvoiceDialog}>
                    <form className="dki-modal dki-create-modal" onSubmit={createInvoice} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="dki-modal-head">
                            <div>
                                <span><FilePlus2 size={21} /></span>
                                <div>
                                    <small>Tambah Invoice</small>
                                    <h2>Lengkapi Data Invoice</h2>
                                    <p>{selectedNos.length} kunjungan dipilih untuk {selectedPembiayaanName || 'pembiayaan ini'}.</p>
                                </div>
                            </div>
                            <button type="button" onClick={closeInvoiceDialog} disabled={creating}><X size={18} /> Tutup</button>
                        </div>
                        <div className="dki-create-body">
                            <div className="dki-create-summary">
                                <Info label="Pembiayaan" value={selectedPembiayaanName || '-'} icon={Filter} />
                                <Info label="Total Terpilih" value={money(selectedTotal)} icon={ReceiptText} strong />
                            </div>
                            <div className="dki-form-grid">
                                <label className="dki-field">
                                    <span>Jenis</span>
                                    <input
                                        value={invoiceForm.jenis}
                                        onChange={(e) => setInvoiceForm((prev) => ({ ...prev, jenis: e.target.value }))}
                                        placeholder="Contoh: Rawat Jalan"
                                        autoFocus
                                    />
                                </label>
                                <label className="dki-field">
                                    <span>Periode</span>
                                    <input
                                        value={invoiceForm.periode}
                                        onChange={(e) => setInvoiceForm((prev) => ({ ...prev, periode: e.target.value }))}
                                        placeholder="Contoh: 01 SD 31 Mei 2026"
                                    />
                                </label>
                                <label className="dki-field span-2">
                                    <span>Beban</span>
                                    <input value={selectedPembiayaanName || '-'} readOnly />
                                </label>
                            </div>
                            <div className="dki-modal-actions">
                                <button className="dki-secondary" type="button" onClick={closeInvoiceDialog} disabled={creating}>Batal</button>
                                <button className="dki-primary" type="submit" disabled={creating}>
                                    <FilePlus2 size={16} /> {creating ? 'Membuat...' : 'Buat Invoice'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {detail && (
                <div className="dki-modal-backdrop" onMouseDown={() => setDetail(null)}>
                    <div className="dki-modal" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="dki-modal-head">
                            <div>
                                <span><Stethoscope size={21} /></span>
                                <div>
                                    <small>Detail Kunjungan</small>
                                    <h2>{detail.no}</h2>
                                    <p>{detail.nama} | RM {detail.noreg}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setDetail(null)}><X size={18} /> Tutup</button>
                        </div>

                        {detailLoading ? (
                            <div className="dki-detail-empty">Memuat detail kunjungan...</div>
                        ) : (
                            <div className="dki-detail-body">
                                <div className="dki-detail-grid">
                                    <Info label="Tanggal Masuk" value={dateLabel(detail.tgl_masuk)} icon={CalendarDays} />
                                    <Info label="Pembiayaan" value={`${detail.nama_pembiayaan || '-'} (${detail.id_pembiayaan || '-'})`} icon={Filter} />
                                    <Info label="Total Biaya" value={money(detail.total_biaya)} icon={ReceiptText} strong />
                                    <Info label="Status" value={detail.status_done ? 'Sudah Done' : 'Belum Done'} icon={CheckCircle2} />
                                </div>
                                <div className="dki-section-title">
                                    <h3>Rincian Biaya</h3>
                                    <p>Komponen biaya dari kunjungan pasien.</p>
                                </div>
                                <div className="dki-cost-grid">
                                    {COST_FIELDS.map(([key, label]) => (
                                        <div key={key} className="dki-cost">
                                            <small>{label}</small>
                                            <strong>{money(detail[key])}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ icon, label, value, accent }) {
    const IconComponent = icon;
    return (
        <div className={`dki-summary-card${accent ? ' accent' : ''}`}>
            <span><IconComponent size={20} /></span>
            <div>
                <small>{label}</small>
                <strong>{value}</strong>
            </div>
        </div>
    );
}

function StatusBadge({ done }) {
    return <span className={`dki-badge ${done ? 'done' : 'pending'}`}>{done ? 'Done' : 'Belum Done'}</span>;
}

function InvoiceBadge({ row }) {
    if (row.status_invoice === 'sudah') {
        return <span className="dki-badge invoiced">{row.no_invoice || 'Sudah Invoice'}</span>;
    }
    return <span className="dki-badge open">Belum Invoice</span>;
}

function Info({ label, value, icon, strong }) {
    const IconComponent = icon;
    return (
        <div className={`dki-info${strong ? ' strong' : ''}`}>
            <IconComponent size={18} />
            <div>
                <small>{label}</small>
                <strong>{value}</strong>
            </div>
        </div>
    );
}
