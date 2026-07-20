import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    Ambulance,
    BadgeDollarSign,
    BadgePercent,
    Banknote,
    BarChart3,
    BedSingle,
    CalendarCheck,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Dumbbell,
    FilePlus2,
    FlaskConical,
    HeartPulse,
    Eye,
    FileSpreadsheet,
    FileText,
    MessageSquareText,
    MoreHorizontal,
    PackageCheck,
    Pencil,
    Pill,
    Printer,
    ReceiptText,
    Search,
    Send,
    ScanLine,
    Stethoscope,
    Trash2,
    Wrench,
    X,
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getInvoiceDisplayAmounts } from './invoiceDisplayUtils';
import { getCount, getResults, pageParams, SimplePagination } from '../../utils/pagination.jsx';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import SearchablePembiayaanSelect from '../../components/SearchablePembiayaanSelect';
import TableSkeleton from '../../components/TableSkeleton';
import './InvoicePembiayaan.css';

const STATUS_OPTIONS = [
    { value: '', label: 'Semua Status' },
    { value: 'belum_bayar', label: 'Belum Bayar' },
    { value: 'bayar_sebagian', label: 'Bayar Sebagian' },
    { value: 'lunas', label: 'Lunas' },
    { value: 'batal', label: 'Batal' },
];

const COST_FIELDS = [
    ['adm', 'Administrasi'],
    ['jasa', 'Jasa'],
    ['farmasi', 'Farmasi'],
    ['tindakan', 'Tindakan'],
    ['fisio', 'Fisioterapi'],
    ['lab', 'Laboratorium'],
    ['rad', 'Radiologi'],
    ['kamar', 'Kamar'],
    ['bhp', 'BHP'],
    ['ambulan', 'Ambulan'],
    ['alat', 'Sewa Alat'],
    ['lainnya', 'Lain-lain'],
];

const COST_ICONS = {
    adm: BadgeDollarSign,
    jasa: Stethoscope,
    farmasi: Pill,
    tindakan: HeartPulse,
    fisio: Dumbbell,
    lab: FlaskConical,
    rad: ScanLine,
    kamar: BedSingle,
    bhp: PackageCheck,
    ambulan: Ambulance,
    alat: Wrench,
    lainnya: MoreHorizontal,
};

const emptyInvoice = {
    nomor_faktur: '',
    tanggal: new Date().toISOString().slice(0, 10),
    id_pembiayaan: '',
    jenis: '',
    periode: '',
    beban: '',
    keterangan: '',
    xround: 'N',
    adm: '',
    jasa: '',
    farmasi: '',
    tindakan: '',
    fisio: '',
    lab: '',
    rad: '',
    kamar: '',
    bhp: '',
    ambulan: '',
    alat: '',
    lainnya: '',
};

const emptyPayment = {
    tanggal: new Date().toISOString().slice(0, 10),
    jumlah: '',
    metode: 'transfer',
    keterangan: '',
    bayar_penuh: false,
};

const money = (value) => `Rp\u00a0${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const todayISO = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value) => String(value || '').slice(0, 10);
const parseMoneyInput = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value || '').replace(/[^\d.,-]/g, '');
    if (!raw) return 0;
    const negative = raw.startsWith('-');
    const unsigned = raw.replace(/-/g, '');
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    let normalized = unsigned;

    if (lastComma >= 0 && lastDot >= 0) {
        const decimalSep = lastComma > lastDot ? ',' : '.';
        const thousandSep = decimalSep === ',' ? '.' : ',';
        normalized = unsigned.split(thousandSep).join('').replace(decimalSep, '.');
    } else {
        const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
        if (sep) {
            const parts = unsigned.split(sep);
            const fraction = parts[parts.length - 1] || '';
            normalized = fraction.length > 0 && fraction.length <= 2
                ? `${parts.slice(0, -1).join('')}.${fraction}`
                : parts.join('');
        }
    }

    const parsed = Number(`${negative ? '-' : ''}${normalized}`);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoneyInput = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const raw = String(value);
    const draftMatch = raw.match(/^(-?\d+)(\.(\d{0,2})?)$/);
    if (draftMatch) {
        const [, integer, decimal = ''] = draftMatch;
        return `Rp ${Number(integer || 0).toLocaleString('id-ID')}${decimal ? ',' + decimal.slice(1) : ''}`;
    }
    const amount = parseMoneyInput(value);
    if (!amount) return raw.endsWith('.') || raw.endsWith(',') ? 'Rp 0,' : '';
    const hasDecimal = !Number.isInteger(amount);
    return `Rp ${amount.toLocaleString('id-ID', {
        minimumFractionDigits: hasDecimal ? 2 : 0,
        maximumFractionDigits: 2,
    })}`;
};
const normalizeMoneyDraft = (value) => {
    const raw = String(value || '').replace(/[^\d.,]/g, '');
    if (!raw) return '';
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma >= 0 || lastDot >= 0) {
        const decimalIndex = Math.max(lastComma, lastDot);
        const afterSeparator = raw.slice(decimalIndex + 1).replace(/\D/g, '');
        const beforeSeparator = raw.slice(0, decimalIndex).replace(/\D/g, '');
        const hasMultipleSeparators = (raw.match(/[.,]/g) || []).length > 1;
        if (decimalIndex === raw.length - 1) {
            return `${beforeSeparator || '0'}.`;
        }
        const isDecimalDraft = afterSeparator.length <= 2 && (!hasMultipleSeparators || afterSeparator.length > 0);

        if (!isDecimalDraft) {
            return raw.replace(/\D/g, '');
        }

        const integer = beforeSeparator || '0';
        const fraction = afterSeparator.slice(0, 2);
        return `${integer}.${fraction}`;
    }
    return raw.replace(/\D/g, '');
};
const addDaysToDate = (value, days) => {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return '';
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const errorMessage = (err, fallback) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail || data.error) return data.detail || data.error;
    return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`).join(' | ') || fallback;
};



export default function InvoicePembiayaan() {
    const toast = useToast();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [pembiayaan, setPembiayaan] = useState([]);
    const [alokasi, setAlokasi] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [paying, setPaying] = useState(false);
    const [verifyingPaymentId, setVerifyingPaymentId] = useState(null);
    const [sendingInvoice, setSendingInvoice] = useState(false);
    const [deletingPaymentId, setDeletingPaymentId] = useState(null);
    const [paymentToDelete, setPaymentToDelete] = useState(null);
    const [paymentToVerify, setPaymentToVerify] = useState(null);
    const [visitToRemove, setVisitToRemove] = useState(null);
    const [removingVisitNo, setRemovingVisitNo] = useState(null);
    const [paymentDateTouched, setPaymentDateTouched] = useState(false);
    const [invoiceToCancel, setInvoiceToCancel] = useState(null);
    const [cancelingInvoiceId, setCancelingInvoiceId] = useState(null);
    const [sendTarget, setSendTarget] = useState(null);
    const [sentInfoTarget, setSentInfoTarget] = useState(null);
    const [sendForm, setSendForm] = useState({ tgl_kirim: '', jatuh_tempo: '' });
    const [createOpen, setCreateOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [printMenuOpen, setPrintMenuOpen] = useState(false);
    const [rekapOpen, setRekapOpen] = useState(false);
    const [rekapForm, setRekapForm] = useState({ tgl1: '', tgl2: '' });
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptSelection, setReceiptSelection] = useState(() => new Set());
    const [receiptSelectionDetails, setReceiptSelectionDetails] = useState(() => new Map());
    const [receiptForm, setReceiptForm] = useState({ perusahaan: '', tanggal: new Date().toISOString().slice(0, 10) });
    const [form, setForm] = useState({ ...emptyInvoice });
    const [payment, setPayment] = useState(emptyPayment);
    const [filters, setFilters] = useState({
        search: searchParams.get('search') || '',
        status: searchParams.get('status') || '',
        id_pembiayaan: searchParams.get('id_pembiayaan') || '',
        dari: searchParams.get('dari') || '',
        sampai: searchParams.get('sampai') || '',
        aging: searchParams.get('aging') || '',
    });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const fetchOptions = useCallback(async () => {
        try {
            const [pbiayaRes, alokasiRes] = await Promise.all([
                api.get('/keuangan/pembiayaan-options/'),
                api.get('/keuangan/alokasi-dana/'),
            ]);
            setPembiayaan(getResults(pbiayaRes.data));
            setAlokasi(getResults(alokasiRes.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat data pembiayaan.'));
        }
    }, [toast]);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const params = pageParams(page, pageSize, Object.fromEntries(
                Object.entries(filters).filter(([, value]) => value),
            ));
            const res = await api.get('/keuangan/faktur/', { params });
            setItems(getResults(res.data));
            setTotal(getCount(res.data));
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat invoice.'));
        } finally {
            setLoading(false);
        }
    }, [filters, page, pageSize, toast]);

    const fetchDetail = useCallback(async (invoiceId) => {
        if (!invoiceId) {
            setSelected(null);
            return;
        }
        setDetailLoading(true);
        try {
            const res = await api.get(`/keuangan/faktur/${invoiceId}/`);
            setSelected(res.data);
            setPaymentDateTouched(false);
            setPayment({ ...emptyPayment, tanggal: todayISO() });
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat detail invoice.'));
            navigate('/keuangan/invoices');
        } finally {
            setDetailLoading(false);
        }
    }, [navigate, toast]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);
    useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
    useEffect(() => { fetchDetail(id); }, [fetchDetail, id]);
    useEffect(() => {
        setFilters((prev) => ({
            ...prev,
            search: searchParams.get('search') || '',
            status: searchParams.get('status') || '',
            id_pembiayaan: searchParams.get('id_pembiayaan') || '',
            dari: searchParams.get('dari') || '',
            sampai: searchParams.get('sampai') || '',
            aging: searchParams.get('aging') || '',
        }));
    }, [searchParams]);
    useEffect(() => { setPage(1); }, [filters, pageSize]);

    useEffect(() => {
        if (!createOpen && !selected && !sendTarget && !sentInfoTarget && !invoiceToCancel && !paymentToDelete && !paymentToVerify && !visitToRemove && !rekapOpen && !receiptOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [createOpen, selected, sendTarget, sentInfoTarget, invoiceToCancel, paymentToDelete, paymentToVerify, visitToRemove, rekapOpen, receiptOpen]);

    const selectedPembiayaan = pembiayaan.find((item) => String(item.id_pembiayaan) === String(form.id_pembiayaan));
    const pembiayaanNameById = useMemo(() => {
        const map = new Map();
        pembiayaan.forEach((item) => map.set(String(item.id_pembiayaan), item.nama));
        return map;
    }, [pembiayaan]);
    const resolvePembiayaanName = useCallback((invoice) => {
        const storedName = String(invoice?.nama_pembiayaan || '').trim();
        if (storedName && storedName.toLowerCase() !== 'unknown') return storedName;
        return pembiayaanNameById.get(String(invoice?.id_pembiayaan || '')) || storedName || invoice?.pelanggan_detail?.nama || '-';
    }, [pembiayaanNameById]);
    const getInvoicePatientNames = useCallback((invoice) => {
        const names = (invoice?.pasien_invoice || [])
            .map((item) => String(item?.nama || '').trim())
            .filter(Boolean);
        return [...new Set(names)];
    }, []);
    const selectedPatientNames = useMemo(() => getInvoicePatientNames(selected), [getInvoicePatientNames, selected]);
    const totalForm = useMemo(() => COST_FIELDS.reduce((sum, [key]) => sum + parseMoneyInput(form[key]), 0), [form]);
    const selectedReceiptInvoices = useMemo(
        () => Array.from(receiptSelectionDetails.values()),
        [receiptSelectionDetails],
    );
    const selectedReceiptTotal = useMemo(
        () => selectedReceiptInvoices.reduce((sum, item) => sum + Number(item.total_piutang ?? item.total_tagihan ?? 0), 0),
        [selectedReceiptInvoices],
    );
    const allPageInvoicesSelected = items.length > 0 && items.every((item) => receiptSelection.has(item.id));

    const alokasiOptions = useMemo(() => {
        if (!selected?.id_pembiayaan) return [];
        return alokasi
            .filter((item) => String(item.id_pembiayaan) === String(selected.id_pembiayaan) && Number(item.sisa_alokasi || 0) > 0)
            .sort((a, b) => new Date(a.tanggal_penerimaan) - new Date(b.tanggal_penerimaan));
    }, [alokasi, selected]);
    const latestAlokasiUpdateDate = useMemo(() => {
        const latest = [...alokasiOptions]
            .filter((item) => item.updated_at || item.created_at || item.tanggal_penerimaan)
            .sort((a, b) => {
                const aTime = new Date(a.updated_at || a.created_at || a.tanggal_penerimaan || 0).getTime();
                const bTime = new Date(b.updated_at || b.created_at || b.tanggal_penerimaan || 0).getTime();
                return bTime - aTime;
            })[0];
        return dateOnly(latest?.tanggal_penerimaan || latest?.updated_at || latest?.created_at) || todayISO();
    }, [alokasiOptions]);

    useEffect(() => {
        if (!selected?.id || paymentDateTouched) return;
        setPayment((prev) => ({ ...prev, tanggal: latestAlokasiUpdateDate }));
    }, [latestAlokasiUpdateDate, paymentDateTouched, selected?.id]);

    const walletSaldo = useMemo(
        () => alokasiOptions.reduce((sum, item) => sum + Number(item.sisa_alokasi || 0), 0),
        [alokasiOptions],
    );
    const pendingPaymentTotal = useMemo(
        () => (selected?.pembayaran || [])
            .filter((item) => item.status_verifikasi === 'menunggu')
            .reduce((sum, item) => sum + Number(item.jumlah || 0), 0),
        [selected],
    );
    const paymentSequenceById = useMemo(() => {
        const sequence = new Map();
        [...(selected?.pembayaran || [])]
            .sort((a, b) => {
                const aTime = new Date(a.created_at || a.tanggal || 0).getTime();
                const bTime = new Date(b.created_at || b.tanggal || 0).getTime();
                if (aTime !== bTime) return aTime - bTime;
                return Number(a.id || 0) - Number(b.id || 0);
            })
            .forEach((pay, index) => {
                sequence.set(pay.id, index + 1);
            });
        return sequence;
    }, [selected]);
    const selectedDisplayAmounts = useMemo(() => getInvoiceDisplayAmounts(selected), [selected]);
    const paymentLimit = Math.max(0, Math.min(selectedDisplayAmounts.sisa, walletSaldo) - pendingPaymentTotal);
    const isFinanceManager = Boolean(user?.is_superuser || (user?.is_keuangan && ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role)));

    const openCreate = () => {
        setEditingInvoice(null);
        setForm({ ...emptyInvoice });
        setCreateOpen(true);
    };

    const toggleReceiptSelection = (invoice, checked) => {
        setReceiptSelection((prev) => {
            const next = new Set(prev);
            if (checked) next.add(invoice.id);
            else next.delete(invoice.id);
            return next;
        });
        setReceiptSelectionDetails((prev) => {
            const next = new Map(prev);
            if (checked) next.set(invoice.id, invoice);
            else next.delete(invoice.id);
            return next;
        });
    };

    const togglePageReceiptSelection = (checked) => {
        setReceiptSelection((prev) => {
            const next = new Set(prev);
            items.forEach((item) => {
                if (checked) next.add(item.id);
                else next.delete(item.id);
            });
            return next;
        });
        setReceiptSelectionDetails((prev) => {
            const next = new Map(prev);
            items.forEach((item) => {
                if (checked) next.set(item.id, item);
                else next.delete(item.id);
            });
            return next;
        });
    };

    const openReceiptDialog = () => {
        if (receiptSelection.size === 0) {
            toast.error('Pilih minimal satu invoice untuk tanda terima.');
            return;
        }
        const firstInvoice = selectedReceiptInvoices[0];
        setReceiptForm({
            perusahaan: firstInvoice ? resolvePembiayaanName(firstInvoice) : '',
            tanggal: new Date().toISOString().slice(0, 10),
        });
        setReceiptOpen(true);
    };

    const closeReceiptDialog = () => setReceiptOpen(false);

    const closeCreate = () => {
        setCreateOpen(false);
        setEditingInvoice(null);
        setForm({ ...emptyInvoice });
    };

    const closeDetail = () => {
        setPrintMenuOpen(false);
        setSelected(null);
        navigate('/keuangan/invoices');
    };

    const openEditInvoice = (invoice, event) => {
        event?.stopPropagation();
        if (invoice.tgl_kirim) {
            toast.error('Invoice sudah dikirim. Buka status kirim dulu kalau mau edit.');
            return;
        }
        if ((invoice.pembayaran || []).length > 0) {
            toast.error('Invoice yang sudah punya pengajuan pembayaran tidak bisa diedit.');
            return;
        }
        setEditingInvoice(invoice);
        setForm({
            ...emptyInvoice,
            nomor_faktur: invoice.nomor_faktur || '',
            tanggal: invoice.tanggal || new Date().toISOString().slice(0, 10),
            id_pembiayaan: invoice.id_pembiayaan || '',
            jenis: invoice.jenis || '',
            periode: invoice.periode || '',
            beban: invoice.beban || '',
            keterangan: invoice.keterangan || '',
            xround: invoice.xround || 'N',
            adm: String(invoice.adm || ''),
            jasa: String(invoice.jasa || ''),
            farmasi: String(invoice.farmasi || ''),
            tindakan: String(invoice.tindakan || ''),
            fisio: String(invoice.fisio || ''),
            lab: String(invoice.lab || ''),
            rad: String(invoice.rad || ''),
            kamar: String(invoice.kamar || ''),
            bhp: String(invoice.bhp || ''),
            ambulan: String(invoice.ambulan || ''),
            alat: String(invoice.alat || ''),
            lainnya: String(invoice.lainnya || ''),
        });
        setCreateOpen(true);
    };

    const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
    const setCost = (key, value) => setForm((prev) => ({ ...prev, [key]: normalizeMoneyDraft(value) }));
    const setTanggalKirimInvoice = (value) => {
        setSendForm({
            tgl_kirim: value,
            jatuh_tempo: addDaysToDate(value, 45),
        });
    };

    const saveInvoice = async (event) => {
        event.preventDefault();
        if (!form.id_pembiayaan) return toast.error('Pembiayaan wajib dipilih.');
        if (!form.tanggal) return toast.error('Tanggal faktur wajib diisi.');
        if (totalForm <= 0) return toast.error('Total tagihan harus lebih dari nol.');
        setSaving(true);
        try {
            const payload = {
                ...form,
                nama_pembiayaan: selectedPembiayaan?.nama || '',
                pelanggan: null,
                status: 'belum_bayar',
            };
            COST_FIELDS.forEach(([key]) => {
                payload[key] = parseMoneyInput(form[key]);
            });

            if (!editingInvoice) {
                delete payload.nomor_faktur;
            }

            if (editingInvoice) {
                await api.patch(`/keuangan/faktur/${editingInvoice.id}/`, payload);
                toast.success('Invoice berhasil diperbarui.');
            } else {
                await api.post('/keuangan/faktur/', payload);
                toast.success('Invoice berhasil ditambahkan.');
            }
            closeCreate();
            await fetchInvoices();
        } catch (err) {
            toast.error(errorMessage(err, editingInvoice ? 'Gagal memperbarui invoice.' : 'Gagal menyimpan invoice.'));
        } finally {
            setSaving(false);
        }
    };

    const openSendInvoice = (invoice, event) => {
        event?.stopPropagation();
        if (invoice.tgl_kirim) {
            setSentInfoTarget(invoice);
            return;
        }
        const tanggalKirim = invoice.tgl_kirim || new Date().toISOString().slice(0, 10);
        setSendTarget(invoice);
        setSendForm({
            tgl_kirim: tanggalKirim,
            jatuh_tempo: addDaysToDate(tanggalKirim, 45),
        });
    };

    const closeSentInfo = () => setSentInfoTarget(null);

    const openDetail = (invoice) => {
        navigate(`/keuangan/invoices/${invoice.id}`);
    };

    const requestRemoveVisit = (visit) => {
        if (selected?.tgl_kirim) {
            toast.error('Invoice yang sudah dikirim tidak bisa diubah kunjungannya.');
            return;
        }
        setVisitToRemove(visit);
    };

    const closeRemoveVisit = () => {
        if (removingVisitNo) return;
        setVisitToRemove(null);
    };

    const confirmRemoveVisit = async () => {
        if (!selected || !visitToRemove) return;
        setRemovingVisitNo(visitToRemove.no);
        try {
            const res = await api.delete('/keuangan/kunjungan-invoice/', {
                data: { nomor_faktur: selected.nomor_faktur, no: visitToRemove.no },
            });
            toast.success(`Kunjungan ${visitToRemove.no} berhasil dilepas dari invoice.`);
            setVisitToRemove(null);
            setSelected(res.data);
            await Promise.all([fetchInvoices(), fetchOptions()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal melepas kunjungan dari invoice.'));
        } finally {
            setRemovingVisitNo(null);
        }
    };

    const requestCancelInvoice = (invoice, event) => {
        event?.stopPropagation();
        setInvoiceToCancel(invoice);
    };

    const closeCancelInvoice = () => {
        if (cancelingInvoiceId) return;
        setInvoiceToCancel(null);
    };

    const confirmCancelInvoice = async () => {
        if (!invoiceToCancel) return;
        setCancelingInvoiceId(invoiceToCancel.id);
        try {
            const res = await api.post(`/keuangan/faktur/${invoiceToCancel.id}/batal/`);
            toast.success('Invoice berhasil dibatalkan.');
            setInvoiceToCancel(null);
            if (selected?.id === invoiceToCancel.id) setSelected(res.data);
            await fetchInvoices();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan invoice.'));
        } finally {
            setCancelingInvoiceId(null);
        }
    };

    const closeSendInvoice = () => {
        if (sendingInvoice) return;
        setSendTarget(null);
        setSendForm({ tgl_kirim: '', jatuh_tempo: '' });
    };

    const confirmSendInvoice = async (event) => {
        event.preventDefault();
        if (!sendTarget) return;
        if (!sendForm.tgl_kirim || !sendForm.jatuh_tempo) return toast.error('Tanggal kirim invoice wajib diisi.');
        setSendingInvoice(true);
        try {
            const res = await api.post(`/keuangan/faktur/${sendTarget.id}/kirim/`, { tgl_kirim: sendForm.tgl_kirim });
            if (selected?.id === sendTarget.id) setSelected(res.data);
            toast.success('Pengiriman invoice berhasil dicatat.');
            setSendTarget(null);
            setSendForm({ tgl_kirim: '', jatuh_tempo: '' });
            await fetchInvoices();
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mencatat pengiriman invoice.'));
        } finally {
            setSendingInvoice(false);
        }
    };

    const printInvoice = (mode = 'invoice') => {
        if (!selected) return;
        const modes = {
            invoice: 'invoice',
            invoice_ppn: 'invoice_ppn',
            rincian: 'rincian',
            rincian_ppn: 'rincian_ppn',
            kwitansi: 'kwitansi',
        };
        const baseURL = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
        const printMode = modes[mode] || modes.invoice;
        const printWindow = window.open(`${baseURL}/keuangan/faktur/${selected.id}/print/?mode=${printMode}`, '_blank');
        if (!printWindow) {
            toast.error('Popup cetak diblokir browser.');
            return;
        }
        setPrintMenuOpen(false);
    };

    const recordPayment = async (event) => {
        event.preventDefault();
        const jumlah = parseMoneyInput(payment.jumlah);
        if (!selected?.tgl_kirim) return toast.error('Invoice harus dikirim dulu sebelum bisa dibayar.');
        if (!payment.tanggal) return toast.error('Tanggal bayar wajib diisi.');
        if (jumlah <= 0) return toast.error('Jumlah bayar harus lebih dari nol.');
        if (jumlah > selectedDisplayAmounts.sisa) return toast.error('Jumlah bayar melebihi sisa tagihan.');
        if (jumlah > walletSaldo) return toast.error('Jumlah bayar melebihi saldo pembiayaan.');
        setPaying(true);
        try {
            await api.post(`/keuangan/faktur/${selected.id}/bayar/`, {
                faktur: selected.id,
                tanggal: payment.tanggal,
                jumlah,
                metode: payment.metode,
                keterangan: payment.keterangan,
            });
            toast.success('Pembayaran diajukan. Menunggu verifikasi manajer keuangan.');
            await Promise.all([fetchDetail(selected.id), fetchInvoices(), fetchOptions()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal mencatat pembayaran.'));
        } finally {
            setPaying(false);
        }
    };

    const requestDeletePayment = (pay) => {
        if (!selected || !pay) return;
        setPaymentToDelete(pay);
    };

    const requestVerifyPayment = (pay) => {
        if (!selected || !pay) return;
        setPaymentToVerify(pay);
    };

    const closeVerifyPayment = () => {
        if (verifyingPaymentId) return;
        setPaymentToVerify(null);
    };

    const confirmVerifyPayment = async () => {
        const pay = paymentToVerify;
        if (!selected || !pay) return;
        setVerifyingPaymentId(pay.id);
        try {
            const res = await api.post(`/keuangan/faktur/${selected.id}/pembayaran/${pay.id}/verifikasi/`);
            setSelected(res.data);
            setPaymentToVerify(null);
            toast.success('Pembayaran berhasil diverifikasi.');
            await Promise.all([fetchInvoices(), fetchOptions()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal verifikasi pembayaran.'));
        } finally {
            setVerifyingPaymentId(null);
        }
    };

    const closeDeletePayment = () => {
        if (deletingPaymentId) return;
        setPaymentToDelete(null);
    };

    const confirmDeletePayment = async () => {
        const pay = paymentToDelete;
        if (!selected || !pay) return;
        setDeletingPaymentId(pay.id);
        try {
            const res = await api.post(`/keuangan/faktur/${selected.id}/pembayaran/${pay.id}/batal/`);
            setSelected(res.data);
            setPaymentToDelete(null);
            toast.success('Pembayaran dibatalkan. Riwayat tetap tersimpan.');
            await Promise.all([fetchInvoices(), fetchOptions()]);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal membatalkan pembayaran.'));
        } finally {
            setDeletingPaymentId(null);
        }
    };

    const changeFullPayment = (checked) => {
        setPayment((prev) => ({
            ...prev,
            bayar_penuh: checked,
            jumlah: checked && paymentLimit > 0 ? String(paymentLimit) : prev.jumlah,
        }));
    };

    const openRekapDialog = () => {
        const today = new Date().toISOString().slice(0, 10);
        setRekapForm({ tgl1: today, tgl2: today });
        setRekapOpen(true);
    };

    const closeRekapDialog = () => {
        setRekapOpen(false);
        setRekapForm({ tgl1: '', tgl2: '' });
    };

    const printRekap = () => {
        if (!rekapForm.tgl1 || !rekapForm.tgl2) {
            toast.error('Tanggal awal dan akhir wajib diisi.');
            return;
        }

        if (new Date(rekapForm.tgl1) > new Date(rekapForm.tgl2)) {
            toast.error('Tanggal awal harus sebelum tanggal akhir.');
            return;
        }

        const baseURL = String(api.defaults.baseURL || '/api').replace(/\/$/, '');

        const rekapUrl =
            `${baseURL}/keuangan/faktur/rekap/?dari=${rekapForm.tgl1}&sampai=${rekapForm.tgl2}`;

        console.log('================================');
        console.log('REKAP URL :', rekapUrl);
        console.log('BASE URL  :', baseURL);
        console.log('TGL AWAL  :', rekapForm.tgl1);
        console.log('TGL AKHIR :', rekapForm.tgl2);
        console.log('================================');

        const printWindow = window.open(rekapUrl, '_blank');

        if (!printWindow) {
            toast.error('Popup cetak diblokir browser.');
            return;
        }

        closeRekapDialog();
    };

    const exportRekapExcel = () => {
        if (!rekapForm.tgl1 || !rekapForm.tgl2) {
            toast.error('Tanggal awal dan akhir wajib diisi.');
            return;
        }

        if (new Date(rekapForm.tgl1) > new Date(rekapForm.tgl2)) {
            toast.error('Tanggal awal harus sebelum tanggal akhir.');
            return;
        }

        const baseURL = String(api.defaults.baseURL || '/api').replace(/\/$/, '');

        window.open(
            `${baseURL}/keuangan/faktur/rekap/excel/?dari=${rekapForm.tgl1}&sampai=${rekapForm.tgl2}`,
            '_blank'
        );
    };

    const printReceipt = (event) => {
        event.preventDefault();
        const ids = Array.from(receiptSelection);
        if (!ids.length) return toast.error('Pilih minimal satu invoice untuk tanda terima.');
        if (!receiptForm.perusahaan.trim()) return toast.error('Nama perusahaan wajib diisi.');
        if (!receiptForm.tanggal) return toast.error('Tanggal tanda terima wajib diisi.');

        const baseURL = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
        const params = new URLSearchParams({
            ids: ids.join(','),
            perusahaan: receiptForm.perusahaan.trim(),
            tanggal: receiptForm.tanggal,
        });
        const printWindow = window.open(`${baseURL}/keuangan/faktur/tanda-terima/print/?${params.toString()}`, '_blank');
        if (!printWindow) {
            toast.error('Popup cetak diblokir browser.');
            return;
        }
        closeReceiptDialog();
    };


    const invoiceStats = useMemo(() => {
        const totalTagihan = items.reduce((sum, item) => sum + Number(item.total_tagihan || 0), 0);
        const totalDibayar = items.reduce((sum, item) => sum + Number(item.total_dibayar || 0), 0);
        const totalSisa = items.reduce((sum, item) => sum + Number(item.sisa_tagihan || 0), 0);
        const belumBayar = items.filter((item) => item.status === 'belum_bayar').length;
        const lunas = items.filter((item) => item.status === 'lunas').length;
        return { totalTagihan, totalDibayar, totalSisa, belumBayar, lunas };
    }, [items]);

    const pembiayaanOptions = useMemo(
        () => [
            { value: '', label: 'Semua Pembiayaan' },
            ...pembiayaan.map((item) => ({
                value: String(item.id_pembiayaan),
                label: `${item.nama} - ID ${item.id_pembiayaan}`,
            })),
        ],
        [pembiayaan],
    );

    return (
        <div className="inv-page">
            <div className="inv-hero">
                <div className="inv-title">
                    <span><ReceiptText size={22} /></span>
                    <div>
                        <h1>Invoice Pembiayaan</h1>
                        <p>Kelola tagihan, pengiriman invoice, pembayaran, dan rekapitulasi pembiayaan.</p>
                    </div>
                </div>
            </div>

            <div className="inv-card table">
                <div className="inv-card-head">
                    <div className="inv-card-title">
                        <h2>Daftar Invoice</h2>
                        <p>{total} invoice tercatat. Filter data, cek status kirim, lalu kelola pembayaran invoice.</p>
                    </div>
                    <div className="inv-card-actions">
                        {/* <div className="inv-chip">
                            <ReceiptText size={14} /> {filters.status ? STATUS_OPTIONS.find((item) => item.value === filters.status)?.label || 'Status Invoice' : 'Semua Status'}
                        </div> */}
                        <button className="inv-btn soft" type="button" onClick={openRekapDialog}>
                            <BarChart3 size={16} /> Rekapitulasi
                        </button>
                        <button className="inv-btn soft" type="button" onClick={openReceiptDialog}>
                            <Printer size={16} /> Cetak Tanda Terima
                        </button>
                        <button className="inv-btn primary" type="button" onClick={openCreate}>
                            <FilePlus2 size={16} /> Buat Invoice
                        </button>
                    </div>
                </div>

                <div className="dki-filter inv-filter">
                    <div className="inv-filter-row">
                        <label className="dki-search">
                            <Search size={16} />
                            <input
                                placeholder="Cari no faktur / penagih / pembiayaan..."
                                value={filters.search}
                                onChange={(e) => setFilter('search', e.target.value)}
                            />
                        </label>

                        <SearchablePembiayaanSelect
                            className="dki-filter-pembiayaan"
                            options={pembiayaanOptions}
                            value={filters.id_pembiayaan}
                            onChange={(value) => setFilter('id_pembiayaan', value)}
                            placeholder="Semua Pembiayaan"
                        />

                        <select
                            className="dki-select dki-filter-status"
                            value={filters.status}
                            onChange={(e) => setFilter('status', e.target.value)}
                        >
                            {STATUS_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>

                        <DateRangePicker
                            dari={filters.dari}
                            sampai={filters.sampai}
                            onChange={({ dari, sampai }) => {
                                setFilters((prev) => ({ ...prev, dari, sampai }));
                            }}
                            placeholder="Pilih Periode Tanggal"
                        />

                        <button
                            className="dki-filter-reset"
                            type="button"
                            onClick={() => setFilters({
                                search: '',
                                status: '',
                                id_pembiayaan: '',
                                dari: '',
                                sampai: '',
                                aging: '',
                            })}
                            title="Reset filter"
                        >
                            <X size={16} /> Reset
                        </button>
                    </div>
                </div>

                {loading ? (
                    <TableSkeleton text="Memuat daftar invoice..." />
                ) : items.length === 0 ? (
                    <div className="inv-empty">Belum ada invoice sesuai filter.</div>
                ) : (
                    <div className="inv-table-wrap table-fade-in">
                        <table className="inv-table invoice-list">
                            <thead>
                                <tr>
                                    <th className="inv-check-col">
                                        <input
                                            type="checkbox"
                                            checked={allPageInvoicesSelected}
                                            onChange={(e) => togglePageReceiptSelection(e.target.checked)}
                                            title="Pilih semua invoice di halaman ini"
                                        />
                                    </th>
                                    <th>No</th>
                                    <th>Tanggal</th>
                                    <th>Pembiayaan</th>
                                    <th className="inv-right">Total Tagihan</th>
                                    <th className="inv-right">Total Piutang</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const hasPaymentRequest = (item.pembayaran || []).length > 0;
                                    return (
                                        <tr key={item.id} className={receiptSelection.has(item.id) ? 'inv-row-selected' : ''}>
                                            <td className="inv-check-col">
                                                <input
                                                    type="checkbox"
                                                    checked={receiptSelection.has(item.id)}
                                                    onChange={(e) => toggleReceiptSelection(item, e.target.checked)}
                                                    onClick={(event) => event.stopPropagation()}
                                                    title={`Pilih ${item.nomor_faktur} untuk tanda terima`}
                                                />
                                            </td>
                                            <td className="inv-mono inv-strong">{item.nomor_faktur}</td>
                                            <td className="inv-date-cell">{dateLabel(item.tanggal)}</td>
                                            <td>
                                                <div className="inv-name-cell">
                                                    <div>
                                                        <strong>{resolvePembiayaanName(item)}</strong>
                                                        <small>ID Pembiayaan: {item.id_pembiayaan || '-'}</small>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="inv-right inv-mono">{money(item.total_tagihan)}</td>
                                            <td className="inv-right inv-mono">{money(item.total_piutang ?? item.total_tagihan)}</td>
                                            <td><StatusBadge status={item.status} label={item.status_label} /></td>
                                            <td>
                                                <div className="inv-action-group">
                                                    <button
                                                        className="inv-action-btn detail"
                                                        type="button"
                                                        onClick={() => openDetail(item)}
                                                        title={item.status === 'lunas' || item.status === 'batal' ? 'Lihat detail invoice' : 'Detail dan pembayaran'}
                                                    >
                                                        {item.status === 'lunas' || item.status === 'batal' ? <Eye size={16} /> : <Banknote size={16} />}
                                                    </button>
                                                    <button
                                                        className={`inv-action-btn send ${item.tgl_kirim ? 'sent' : ''}`}
                                                        type="button"
                                                        onClick={(event) => openSendInvoice(item, event)}
                                                        title={item.tgl_kirim ? `Terkirim ${dateLabel(item.tgl_kirim)}` : 'Kirim invoice'}
                                                    >
                                                        {item.tgl_kirim ? <CalendarCheck size={16} /> : <Send size={16} />}
                                                    </button>
                                                    <button
                                                        className="inv-action-btn edit"
                                                        type="button"
                                                        disabled={Boolean(item.tgl_kirim) || hasPaymentRequest}
                                                        onClick={(event) => openEditInvoice(item, event)}
                                                        title={item.tgl_kirim ? 'Invoice terkirim tidak bisa diedit' : hasPaymentRequest ? 'Invoice yang sudah punya pengajuan pembayaran tidak bisa diedit' : 'Edit invoice'}
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        className="inv-action-btn danger"
                                                        type="button"
                                                        disabled={Boolean(item.tgl_kirim) || hasPaymentRequest || item.status === 'batal' || item.status === 'lunas'}
                                                        onClick={(event) => requestCancelInvoice(item, event)}
                                                        title={item.tgl_kirim ? 'Invoice terkirim tidak bisa dibatalkan' : hasPaymentRequest ? 'Invoice yang sudah punya pengajuan pembayaran tidak bisa dibatalkan' : item.status === 'batal' ? 'Invoice sudah dibatalkan' : item.status === 'lunas' ? 'Invoice lunas tidak bisa dibatalkan' : 'Batalkan invoice'}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="inv-pagination-wrap">
                            <SimplePagination
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPageChange={setPage}
                                onPageSizeChange={setPageSize}
                                buttonClassName="inv-page-btn"
                                selectClassName="inv-page-size"
                            />
                        </div>
                    </div>
                )}
            </div>

            {createOpen && createPortal(
                <div className="inv-modal-backdrop" role="presentation" onMouseDown={closeCreate}>
                    <div className="inv-modal create inv-create-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-modal-head">
                            <span className="inv-modal-head-icon"><FilePlus2 size={20} /></span>
                            <div>
                                <h2>{editingInvoice ? 'Edit Invoice' : 'Tambah Invoice'}</h2>
                                <p>{editingInvoice ? 'Perbarui informasi invoice sebelum dikirim.' : 'Isi informasi invoice dan rincian tagihan pembiayaan.'}</p>
                            </div>
                        </div>
                        <form className="inv-modal-body" onSubmit={saveInvoice}>
                            <div className="inv-form-grid inv-create-grid">
                                <label>No Invoice
                                    <input
                                        className="inv-input"
                                        value={editingInvoice ? form.nomor_faktur : 'Otomatis saat disimpan'}
                                        readOnly
                                    />
                                </label>
                                <label className="inv-date-compact">
                                    <span className="inv-field-label"><CalendarDays size={15} /> Tanggal Faktur</span>
                                    <DateInput value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
                                </label>
                                <label className="span-2">Pembiayaan
                                    <SearchablePembiayaanSelect
                                        options={[
                                            { value: '', label: 'Pilih pembiayaan' },
                                            ...pembiayaan.map((item) => ({
                                                value: String(item.id_pembiayaan),
                                                label: `${item.nama} - ID ${item.id_pembiayaan}`,
                                            })),
                                        ]}
                                        value={form.id_pembiayaan}
                                        onChange={(value) => setForm({ ...form, id_pembiayaan: value })}
                                        placeholder="Pilih pembiayaan"
                                    />
                                </label>
                                <label>Jenis
                                    <textarea
                                        className="inv-input inv-jenis-textarea"
                                        rows="2"
                                        value={form.jenis}
                                        onChange={(e) => setForm({ ...form, jenis: e.target.value })}
                                        placeholder="Rawat jalan / lainnya"
                                    />
                                </label>
                                <label>Periode<input className="inv-input" value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} /></label>
                                <label>Beban<input className="inv-input" value={form.beban} onChange={(e) => setForm({ ...form, beban: e.target.value })} /></label>
                                <label>Pembulatan
                                    <select className="inv-input" value={form.xround} onChange={(e) => setForm({ ...form, xround: e.target.value })}>
                                        <option value="N">Tidak</option>
                                        <option value="Y">Ya</option>
                                    </select>
                                </label>
                            </div>
                            <div className="inv-section-title inv-create-section"><ClipboardList size={16} /> Rincian Tagihan</div>
                            <div className="inv-cost-grid inv-create-cost-grid">
                                {COST_FIELDS.map(([key, label]) => (
                                    <label key={key} className={`inv-cost-card cost-${key}`}>
                                        <CostLabel fieldKey={key} label={label} />
                                        <input className="inv-input inv-input-right" type="text" inputMode="decimal" value={formatMoneyInput(form[key])} onChange={(e) => setCost(key, e.target.value)} />
                                    </label>
                                ))}
                            </div>
                            <div className="inv-total-box inv-create-total">
                                <span><ReceiptText size={17} /> Total Tagihan</span>
                                <strong>{money(totalForm)}</strong>
                            </div>
                            <label className="inv-note">Keterangan
                                <textarea className="inv-input" rows="3" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
                            </label>
                            <div className="inv-modal-actions">
                                <button className="inv-btn soft" type="button" onClick={closeCreate}>Batal</button>
                                <button className="inv-btn primary" type="submit" disabled={saving}>
                                    {editingInvoice ? <Pencil size={16} /> : <FilePlus2 size={16} />} {saving ? 'Menyimpan...' : editingInvoice ? 'Simpan Perubahan' : 'Simpan Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body,
            )}

            {(selected || detailLoading) && createPortal(
                <div className="inv-modal-backdrop" role="presentation" onMouseDown={closeDetail}>
                    <div className="inv-modal detail" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                        {detailLoading || !selected ? <div className="inv-empty">Memuat detail invoice...</div> : (
                            <>
                                <div className="inv-modal-head inv-detail-head">
                                    <div className="inv-detail-title">
                                        <span className="inv-modal-head-icon detail"><ReceiptText size={20} /></span>
                                        <div>
                                            <h2>{selected.nomor_faktur}</h2>
                                            <p>{resolvePembiayaanName(selected)} - ID {selected.id_pembiayaan || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="inv-detail-actions">
                                        {/* <div className="inv-print-menu">
                                            <button className="inv-print-btn" type="button" onClick={() => setPrintMenuOpen((value) => !value)}>
                                                <Printer size={16} /> Cetak
                                            </button>
                                            {printMenuOpen && (
                                                <div className="inv-print-dropdown">
                                                    <button type="button" onClick={() => printInvoice('invoice')}><Printer size={15} /> Invoice</button>
                                                    <button type="button" onClick={() => printInvoice('invoice_ppn')}><FileText size={15} /> Invoice PPN</button>
                                                    <button type="button" onClick={() => printInvoice('rincian')}><ReceiptText size={15} /> Rincian</button>
                                                    <button type="button" onClick={() => printInvoice('rincian_ppn')}><ClipboardList size={15} /> Rincian PPN</button>
                                                    <button type="button" onClick={() => printInvoice('kwitansi')}><ReceiptText size={15} /> Kwitansi</button>
                                                </div>
                                            )}
                                        </div> */}
                                        <button className="inv-print-btn" type="button" onClick={() => printInvoice('invoice')}><Printer size={15} /> Invoice</button>
                                        <button className="inv-print-btn" type="button" onClick={() => printInvoice('rincian')}><ReceiptText size={15} /> Rincian</button>
                                        <button className="inv-print-btn" type="button" onClick={() => printInvoice('kwitansi')}><ReceiptText size={15} /> Kwitansi</button>
                                        <button className="inv-print-btn" type="button" onClick={() => printInvoice('invoice_ppn')}><FileText size={15} /> Invoice PPN</button>
                                        <button className="inv-print-btn" type="button" onClick={() => printInvoice('rincian_ppn')}><ClipboardList size={15} /> Rincian PPN</button>
                                        <button className="inv-close" type="button" onClick={closeDetail}>Tutup</button>
                                    </div>
                                </div>
                                <div className="inv-detail-body">
                                    <section className="inv-detail-section inv-info-section">
                                        <HeaderLine title="Info Invoice" icon={ReceiptText} />
                                        <div className="inv-info-grid">
                                            <Info label="Tanggal" value={dateLabel(selected.tanggal)} />
                                            <Info label="Tanggal Kirim" value={dateLabel(selected.tgl_kirim)} />
                                            <Info label="Jatuh Tempo" value={selected.tgl_kirim ? dateLabel(selected.jatuh_tempo) : '-'} />
                                            <Info label="Jenis" value={selected.jenis || '-'} />
                                            <Info label="Periode" value={selected.periode || '-'} />
                                            <Info label="Beban" value={selected.beban || '-'} />
                                            <div className="inv-info-item inv-patient-info">
                                                <span>Pasien</span>
                                                <PatientNamesList names={selectedPatientNames} />
                                            </div>
                                            <Info label="Status" value={<StatusBadge status={selected.status} label={selected.status_label} />} />
                                        </div>
                                    </section>
                                    <section className="inv-detail-section inv-visit-section">
                                        <HeaderLine title="Kunjungan Invoice" icon={ClipboardList} />
                                        {selected.pasien_invoice?.length ? (
                                            <div className="inv-visit-list">
                                                {selected.pasien_invoice.map((visit) => {
                                                    const isSent = Boolean(selected.tgl_kirim);
                                                    const hasPayment = (selected.pembayaran || []).length > 0;
                                                    const locked = isSent || hasPayment || selected.status === 'lunas' || selected.status === 'batal';
                                                    return (
                                                        <div className="inv-visit-row" key={visit.no}>
                                                            <div>
                                                                <strong>{visit.nama}</strong>
                                                                <span>No {visit.no} | RM {visit.noreg}</span>
                                                            </div>
                                                            <div className="inv-visit-total">
                                                                <span>Total Piutang</span>
                                                                <strong>{money(visit.total_piutang)}</strong>
                                                                {Number(visit.total_dibayar_pasien || 0) > 0 && (
                                                                    <em>Bayar pasien {money(visit.total_dibayar_pasien)}</em>
                                                                )}
                                                            </div>
                                                            <button
                                                                className="inv-action-btn danger"
                                                                type="button"
                                                                onClick={() => requestRemoveVisit(visit)}
                                                                disabled={locked}
                                                                title={isSent ? 'Invoice terkirim tidak bisa diubah kunjungannya' : hasPayment ? 'Invoice yang sudah punya pengajuan pembayaran tidak bisa diubah' : 'Hapus kunjungan dari invoice'}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="inv-empty compact">Belum ada kunjungan terhubung.</div>
                                        )}
                                    </section>
                                    <section className="inv-detail-section inv-breakdown-section">
                                        <HeaderLine title="Breakdown Biaya" icon={ClipboardList} />
                                        <div className="inv-breakdown-grid">
                                            {COST_FIELDS.map(([key, label]) => <Info key={key} label={<CostLabel fieldKey={key} label={label} />} value={money(selected[key])} mono />)}
                                        </div>
                                        <div className="inv-balance-strip">
                                            <span>Total: <strong>{money(selectedDisplayAmounts.total)}</strong></span>
                                            <span>Dibayar: <strong>{money(selectedDisplayAmounts.dibayar)}</strong></span>
                                            <span>Sisa: <strong>{money(selectedDisplayAmounts.sisa)}</strong></span>
                                        </div>
                                    </section>
                                    <section className="inv-payment-card">
                                        <HeaderLine title="Ajukan Pembayaran" icon={Banknote} />
                                        {!selected.tgl_kirim && (
                                            <div className="inv-pay-locked">
                                                <Send size={16} />
                                                Invoice belum dikirim. Catat tanggal kirim invoice dulu sebelum pembayaran bisa direkam.
                                            </div>
                                        )}
                                        <div className="inv-pay-summary">
                                            <div className="patient">
                                                <span>Pasien</span>
                                                <PatientNamesList names={selectedPatientNames} />
                                            </div>
                                            <div className="due">
                                                <span>Sisa Tagihan</span>
                                                <strong>{money(selectedDisplayAmounts.sisa)}</strong>
                                            </div>
                                            <div className="wallet">
                                                <span>Saldo Pembiayaan</span>
                                                <strong>{money(walletSaldo)}</strong>
                                            </div>
                                            <div className="limit">
                                                <span>Maksimal Bayar</span>
                                                <strong>{money(paymentLimit)}</strong>
                                            </div>
                                            <div className="pending">
                                                <span>Menunggu Verifikasi</span>
                                                <strong>{money(pendingPaymentTotal)}</strong>
                                            </div>
                                        </div>
                                        <form className="inv-pay-form" onSubmit={recordPayment}>
                                            <div className="inv-pay-fields wallet">
                                                <label>
                                                    <span className="inv-field-label"><CalendarDays size={15} /> Tgl Bayar</span>
                                                    <DateInput value={payment.tanggal} onChange={(e) => {
                                                        setPaymentDateTouched(true);
                                                        setPayment({ ...payment, tanggal: e.target.value });
                                                    }} disabled={!selected.tgl_kirim} />
                                                </label>
                                                <label>
                                                    <span className="inv-field-label"><Banknote size={15} /> Jumlah</span>
                                                    <input className="inv-input inv-input-right" type="text" inputMode="decimal" value={formatMoneyInput(payment.jumlah)} disabled={!selected.tgl_kirim} onChange={(e) => setPayment({ ...payment, jumlah: normalizeMoneyDraft(e.target.value), bayar_penuh: false })} />
                                                    <small>Maks: {money(paymentLimit)}</small>
                                                </label>
                                                <label className="inv-pay-note">
                                                    <span className="inv-field-label"><MessageSquareText size={15} /> Catatan</span>
                                                    <input className="inv-input" value={payment.keterangan} disabled={!selected.tgl_kirim} onChange={(e) => setPayment({ ...payment, keterangan: e.target.value })} />
                                                </label>
                                            </div>
                                            <div className="inv-pay-footer">
                                                <label className="inv-check">
                                                    <input type="checkbox" checked={payment.bayar_penuh} onChange={(e) => changeFullPayment(e.target.checked)} disabled={!selected.tgl_kirim || paymentLimit <= 0} />
                                                    <span>
                                                        <strong>Bayar Penuh</strong>
                                                        <small>Isi otomatis sesuai batas maksimal pembayaran.</small>
                                                    </span>
                                                </label>
                                                <button className="inv-pay-submit" type="submit" disabled={!selected.tgl_kirim || paying || paymentLimit <= 0 || selected.status === 'lunas' || selected.status === 'batal'}>
                                                    <Banknote size={18} /> {paying ? 'Mengajukan...' : 'Ajukan Pembayaran'}
                                                </button>
                                            </div>
                                        </form>
                                    </section>
                                    <section className="inv-detail-section inv-history-section">
                                        <HeaderLine title="Riwayat Pembayaran" icon={CalendarCheck} />
                                        <div className="inv-table-wrap">
                                            <table className="inv-table history">
                                                <thead><tr><th>Tgl</th><th className="inv-right">Jumlah</th><th>Keterangan</th><th>User</th><th>Status</th><th>Aksi</th></tr></thead>
                                                <tbody>
                                                    {(selected.pembayaran || []).length === 0 ? (
                                                        <tr><td colSpan="6" className="inv-center">Belum ada pembayaran.</td></tr>
                                                    ) : selected.pembayaran.map((pay, index) => (
                                                        <tr key={pay.id}>
                                                            <td>{dateLabel(pay.tanggal)}</td>
                                                            <td className="inv-right inv-mono inv-strong">{money(pay.jumlah)}</td>
                                                            <td>{pay.keterangan || `Pembayaran ke-${paymentSequenceById.get(pay.id) || index + 1}`}</td>
                                                            <td>{pay.created_by_name || '-'}</td>
                                                            <td><PaymentVerifyBadge pay={pay} /></td>
                                                            <td>
                                                                <div className="inv-payment-actions">
                                                                    {pay.status_verifikasi === 'menunggu' && isFinanceManager && (
                                                                        <button
                                                                            className="inv-icon-btn verify"
                                                                            type="button"
                                                                            disabled={verifyingPaymentId === pay.id}
                                                                            title="Verifikasi pembayaran"
                                                                            onClick={() => requestVerifyPayment(pay)}
                                                                        >
                                                                            <CheckCircle2 size={15} />
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        className="inv-icon-btn danger"
                                                                        type="button"
                                                                        disabled={deletingPaymentId === pay.id || pay.status_verifikasi === 'dibatalkan'}
                                                                        title={pay.status_verifikasi === 'dibatalkan' ? 'Pembayaran sudah dibatalkan' : 'Batalkan pembayaran'}
                                                                        onClick={() => requestDeletePayment(pay)}
                                                                    >
                                                                        <X size={15} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body,
            )}

            {visitToRemove && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeRemoveVisit}>
                    <div className="inv-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="inv-remove-visit-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon">
                            <Trash2 size={24} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2 id="inv-remove-visit-title">Hapus Kunjungan dari Invoice?</h2>
                            <p>
                                Kunjungan <strong>{visitToRemove.no}</strong> atas nama {visitToRemove.nama} akan dilepas dari invoice <strong>{selected?.nomor_faktur}</strong>.
                                Status kunjungan akan kembali menjadi belum invoice.
                            </p>
                        </div>
                        <div className="inv-confirm-detail">
                            <span>Nomor RM</span>
                            <strong>{visitToRemove.noreg || '-'}</strong>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeRemoveVisit} disabled={Boolean(removingVisitNo)}>Batal</button>
                            <button className="inv-danger-btn" type="button" onClick={confirmRemoveVisit} disabled={Boolean(removingVisitNo)}>
                                <Trash2 size={16} /> {removingVisitNo ? 'Menghapus...' : 'Hapus Kunjungan'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {paymentToDelete && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeDeletePayment}>
                    <div className="inv-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="inv-delete-payment-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon">
                            <AlertTriangle size={22} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2 id="inv-delete-payment-title">Batalkan Pembayaran?</h2>
                            <p>
                                Pembayaran sebesar <strong>{money(paymentToDelete.jumlah)}</strong> pada {dateLabel(paymentToDelete.tanggal)} akan dibatalkan.
                                {paymentToDelete.status_verifikasi === 'terverifikasi'
                                    ? ' Saldo pembiayaan akan kembali dan sisa tagihan invoice bertambah.'
                                    : ' Pengajuan yang belum diverifikasi akan berubah menjadi dibatalkan.'}
                                {' '}Riwayat pembayaran tetap tersimpan.
                            </p>
                        </div>
                        <div className="inv-confirm-detail">
                            <span>Keterangan</span>
                            <strong>{paymentToDelete.keterangan || 'Pembayaran invoice'}</strong>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeDeletePayment} disabled={Boolean(deletingPaymentId)}>Batal</button>
                            <button className="inv-danger-btn" type="button" onClick={confirmDeletePayment} disabled={Boolean(deletingPaymentId)}>
                                <X size={16} /> {deletingPaymentId ? 'Membatalkan...' : 'Batalkan Pembayaran'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {paymentToVerify && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeVerifyPayment}>
                    <div className="inv-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="inv-verify-payment-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon send">
                            <CheckCircle2 size={22} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2 id="inv-verify-payment-title">Verifikasi Pembayaran?</h2>
                            <p>
                                Pembayaran sebesar <strong>{money(paymentToVerify.jumlah)}</strong> pada {dateLabel(paymentToVerify.tanggal)} akan diverifikasi.
                                Setelah diverifikasi, saldo pembiayaan akan terpotong dan invoice otomatis terbayarkan.
                            </p>
                        </div>
                        <div className="inv-confirm-detail">
                            <span>Keterangan</span>
                            <strong>{paymentToVerify.keterangan || 'Pembayaran invoice'}</strong>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeVerifyPayment} disabled={Boolean(verifyingPaymentId)}>Batal</button>
                            <button className="inv-btn primary" type="button" onClick={confirmVerifyPayment} disabled={Boolean(verifyingPaymentId)}>
                                <CheckCircle2 size={16} /> {verifyingPaymentId ? 'Memverifikasi...' : 'Verifikasi'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {invoiceToCancel && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeCancelInvoice}>
                    <div className="inv-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="inv-cancel-invoice-title" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon">
                            <AlertTriangle size={22} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2 id="inv-cancel-invoice-title">Batalkan Invoice?</h2>
                            <p>
                                Invoice <strong>{invoiceToCancel.nomor_faktur}</strong> atas nama {resolvePembiayaanName(invoiceToCancel)} akan diberi status batal.
                                Data invoice tetap tersimpan sebagai track record.
                            </p>
                        </div>
                        <div className="inv-confirm-detail">
                            <span>Total Tagihan</span>
                            <strong>{money(invoiceToCancel.total_tagihan)}</strong>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeCancelInvoice} disabled={Boolean(cancelingInvoiceId)}>Kembali</button>
                            <button className="inv-danger-btn" type="button" onClick={confirmCancelInvoice} disabled={Boolean(cancelingInvoiceId)}>
                                <X size={16} /> {cancelingInvoiceId ? 'Membatalkan...' : 'Batalkan Invoice'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {sentInfoTarget && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeSentInfo}>
                    <div className="inv-sent-info-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon send">
                            <CalendarCheck size={22} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2>Invoice Terkirim</h2>
                            <p>
                                Invoice <strong>{sentInfoTarget.nomor_faktur}</strong> sudah dicatat terkirim untuk {resolvePembiayaanName(sentInfoTarget)}.
                            </p>
                        </div>
                        <div className="inv-sent-info-grid">
                            <div>
                                <span>Tanggal Kirim</span>
                                <strong>{dateLabel(sentInfoTarget.tgl_kirim)}</strong>
                            </div>
                            <div>
                                <span>Jatuh Tempo</span>
                                <strong>{dateLabel(sentInfoTarget.jatuh_tempo)}</strong>
                            </div>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn primary" type="button" onClick={closeSentInfo}>Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {sendTarget && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeSendInvoice}>
                    <form className="inv-send-modal" role="dialog" aria-modal="true" onSubmit={confirmSendInvoice} onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon send">
                            <Send size={22} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2>Kirim Invoice</h2>
                            <p>
                                Isi tanggal kirim untuk <strong>{sendTarget.nomor_faktur}</strong>. Tanggal jatuh tempo otomatis dihitung 45 hari dari tanggal kirim.
                            </p>
                        </div>
                        <div className="inv-send-fields">
                            <label>
                                <span className="inv-field-label"><CalendarDays size={15} /> Tanggal Kirim</span>
                                <DateInput value={sendForm.tgl_kirim} onChange={(e) => setTanggalKirimInvoice(e.target.value)} />
                            </label>
                            <label>
                                <span className="inv-field-label"><CalendarCheck size={15} /> Jatuh Tempo</span>
                                <DateInput value={sendForm.jatuh_tempo} onChange={() => { }} disabled />
                            </label>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeSendInvoice} disabled={sendingInvoice}>Batal</button>
                            <button className="inv-btn primary" type="submit" disabled={sendingInvoice}>
                                <Send size={16} /> {sendingInvoice ? 'Menyimpan...' : 'Konfirmasi Kirim'}
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {receiptOpen && createPortal(
                <div className="inv-confirm-backdrop" role="presentation" onMouseDown={closeReceiptDialog}>
                    <form className="inv-send-modal inv-receipt-modal" role="dialog" aria-modal="true" onSubmit={printReceipt} onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-confirm-icon send">
                            <Printer size={23} />
                        </div>
                        <div className="inv-confirm-copy">
                            <h2>Cetak Tanda Terima</h2>
                            <p>{receiptSelection.size} invoice dipilih dengan total {money(selectedReceiptTotal)}.</p>
                        </div>
                        <div className="inv-send-fields">
                            <label>Nama Perusahaan
                                <input
                                    className="inv-input"
                                    list="receipt-company-options"
                                    value={receiptForm.perusahaan}
                                    onChange={(e) => setReceiptForm({ ...receiptForm, perusahaan: e.target.value })}
                                    placeholder="Pilih atau ketik nama perusahaan"
                                />
                                <datalist id="receipt-company-options">
                                    {pembiayaan.map((item) => (
                                        <option key={item.id_pembiayaan} value={item.nama} />
                                    ))}
                                </datalist>
                            </label>
                            <label>Tanggal
                                <DateInput value={receiptForm.tanggal} onChange={(e) => setReceiptForm({ ...receiptForm, tanggal: e.target.value })} />
                            </label>
                        </div>
                        <div className="inv-confirm-actions">
                            <button className="inv-btn soft" type="button" onClick={closeReceiptDialog}>Batal</button>
                            <button className="inv-btn primary" type="submit">
                                <Printer size={16} /> Cetak
                            </button>
                        </div>
                    </form>
                </div>,
                document.body,
            )}

            {rekapOpen && createPortal(
                <div className="inv-modal-backdrop" role="presentation" onMouseDown={closeRekapDialog}>
                    <div className="inv-modal rekap-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="inv-modal-head compact">
                            <div className="rekap-head-left">
                                <span className="inv-modal-head-icon rekap"><BarChart3 size={20} /></span>
                                <div>
                                    <h2>Rekapitulasi Invoice</h2>
                                </div>
                            </div>
                        </div>
                        <div className="inv-modal-body rekap-body">
                            <form className="inv-modal-form rekap-form" onSubmit={(e) => { e.preventDefault(); printRekap(); }}>
                                <div className="rekap-picker-card">
                                    <label className="rekap-field-label">Periode Tanggal</label>
                                    <DateRangePicker
                                        dari={rekapForm.tgl1}
                                        sampai={rekapForm.tgl2}
                                        onChange={({ dari, sampai }) => setRekapForm({ tgl1: dari, tgl2: sampai })}
                                        placeholder="Pilih Periode Tanggal"
                                    />
                                </div>
                                <div className="inv-modal-actions rekap-actions">
                                    <button className="inv-btn soft" type="button" onClick={closeRekapDialog}>
                                        Batal
                                    </button>
                                    <button className="inv-btn primary" type="submit">
                                        <Printer size={16} /> Cetak Rekap
                                    </button>
                                    <button
                                        className="inv-btn excel-btn"
                                        type="button"
                                        onClick={exportRekapExcel}
                                    >
                                        <FileSpreadsheet size={16} /> Export Excel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}


function SummaryCard({ icon = ReceiptText, label, value, sub, mono = false }) {
    const Icon = icon;
    return (
        <div className="inv-summary-card">
            <span className="inv-summary-icon"><Icon size={18} /></span>
            <div>
                <small>{label}</small>
                <strong className={mono ? 'inv-mono' : ''}>{value}</strong>
                {sub && <em>{sub}</em>}
            </div>
        </div>
    );
}

function CostLabel({ fieldKey, label }) {
    const Icon = COST_ICONS[fieldKey] || BadgePercent;
    return <span className={`inv-field-label inv-cost-label cost-${fieldKey}`}><span><Icon size={15} /></span> {label}</span>;
}

function HeaderLine({ title, icon = Banknote }) {
    const SectionIcon = icon;
    return <h3 className="inv-section-title"><SectionIcon size={16} /> {title}</h3>;
}

function Info({ label, value, mono = false }) {
    return (
        <div className="inv-info-item">
            <span>{label}</span>
            <strong className={mono ? 'inv-mono' : ''}>{value}</strong>
        </div>
    );
}

function PatientNamesList({ names }) {
    if (!names?.length) return <strong>-</strong>;
    if (names.length === 1) return <strong>{names[0]}</strong>;

    return (
        <ul className="inv-patient-list">
            {names.map((name) => <li key={name}>{name}</li>)}
        </ul>
    );
}

function StatusBadge({ status, label }) {
    return <span className={`inv-status ${status || 'unknown'}`}>{label || status || '-'}</span>;
}

function PaymentVerifyBadge({ pay }) {
    const isVerified = pay?.status_verifikasi === 'terverifikasi';
    const isCanceled = pay?.status_verifikasi === 'dibatalkan' || pay?.status_verifikasi === 'ditolak';
    const Icon = isVerified ? CheckCircle2 : isCanceled ? X : Clock3;
    return (
        <span className={`inv-verify-badge ${isVerified ? 'verified' : isCanceled ? 'canceled' : 'pending'}`}>
            <Icon size={13} />
            {pay?.status_verifikasi_label || (isVerified ? 'Terverifikasi' : isCanceled ? 'Dibatalkan' : 'Menunggu')}
        </span>
    );
}

function DateInput({ value, onChange, disabled = false }) {
    return <DateField value={value} onChange={(nextValue) => onChange({ target: { value: nextValue } })} disabled={disabled} />;
}
