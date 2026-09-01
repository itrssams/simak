import { useState, useEffect, useRef, useMemo } from 'react';
import { useToastState } from '../../context/ToastContext';
import { createPortal } from 'react-dom';
import { Clock, Check, Search, BookOpen, X, AlertTriangle, Paperclip, ClipboardList, User, ArrowRight, AlertCircle, Wallet, Receipt, DollarSign, Plus, History, FileText, Trash2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { getCount, getResults, pageCount, pageParams, RowSizeSelect } from '../../utils/pagination.jsx';
import './PettyCash.css';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import { compressImages, formatFileSize, validateImageFile } from '../../utils/imageCompression';
import { AKUN_BIAYA_PETTY_CASH, AKUN_MAP } from './pettyCashAccounts';
import SearchableAkunBiayaSelect from './SearchableAkunBiayaSelect';

const fmt = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtTgl = (s) => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDT = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};
const dateToStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayStr = () => dateToStr(new Date());
const resolveMediaUrl = (url) => {
    if (!url) return '';
    let clean = String(url).trim();
    // Jika URL mengandung host internal docker seperti http://backend:8000/... atau http://simak-backend:8000/...
    if (clean.includes('://backend') || clean.includes('://simak-backend')) {
        try {
            const parsed = new URL(clean);
            clean = parsed.pathname + parsed.search;
        } catch {
            clean = clean.replace(/^https?:\/\/[^/]+/, '');
        }
    }
    if (clean.startsWith('blob:') || clean.startsWith('data:')) {
        return clean;
    }
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
        return clean;
    }
    return clean.startsWith('/') ? clean : `/${clean}`;
};
const RIWAYAT_SALDO_PER_PAGE = 8;

const PC_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dicairkan: { label: 'Dicairkan', bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    menunggu_approval_laporan: { label: 'Menunggu Approval Laporan', bg: '#eef2ff', color: '#4338ca', dot: '#6366f1' },
    dilaporkan: { label: 'Dilaporkan', bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
    menunggu_pengembalian: { label: 'Menunggu Kembali', bg: '#fefce8', color: '#a16207', dot: '#eab308' },
    selesai: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    dibatalkan: { label: 'Dibatalkan', bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};
const RB_STATUS = {
    pending: { label: 'Pending', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    disetujui: { label: 'Disetujui', bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    ditolak: { label: 'Ditolak', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    dicairkan: { label: 'Selesai', bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    dibatalkan: { label: 'Dibatalkan', bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};
const PC_STEPS = [
    { key: 'pending', label: 'Diajukan' },
    { key: 'disetujui', label: 'Disetujui' },
    { key: 'dicairkan', label: 'Dicairkan' },
    { key: 'menunggu_approval_laporan', label: 'Approval Laporan' },
    { key: 'menunggu_pengembalian', label: 'Kembalian' },
    { key: 'selesai', label: 'Selesai' },
];
const ORDER = ['pending', 'disetujui', 'dicairkan', 'menunggu_approval_laporan', 'dilaporkan', 'menunggu_pengembalian', 'selesai'];

function StableFilterBar({ searchVal, onSearch, statusVal, onStatus, statusCfg, dariVal, onDari, sampaiVal, onSampai, onReset, hasFilter }) {
    return (
        <div className="pc-filter-bar">
            <div className="pc-filter-row">
                <div className="pc-filter-search">
                    <Search size={15} />
                    <input className="pc-filter-input" placeholder="Cari nomor atau keperluan..." value={searchVal} onChange={e => onSearch(e.target.value)} />
                </div>
                <select className="pc-filter-select" value={statusVal} onChange={e => onStatus(e.target.value)}>
                    <option value="">Semua Status</option>
                    {Object.entries(statusCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <DateRangePicker
                    dari={dateToStr(dariVal)}
                    sampai={dateToStr(sampaiVal)}
                    onChange={({ dari, sampai }) => {
                        onDari(dari ? new Date(dari) : null);
                        onSampai(sampai ? new Date(sampai) : null);
                    }}
                    placeholder="Pilih Periode Tanggal"
                />
                {hasFilter && <button className="pc-filter-reset" onClick={onReset}>Reset</button>}
            </div>
        </div>
    );
}

export default function PettyCash() {
    const { user } = useAuth();
    const isManajer = user?.is_superuser || ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role);
    const isDirekturWadir = user?.is_superuser || ['wakil_direktur', 'direktur'].includes(user?.role);
    const isPettyCashCashier = user?.is_superuser || Boolean(user?.is_petty_cash_cashier);
    const canSeeSaldo = isManajer;

    const [activeTab, setActiveTab] = useState('pc');
    const [success, setSuccess] = useToastState('success');
    const [error, setError] = useToastState('error');
    const [saving, setSaving] = useState(false);

    // Saldo state
    const [saldo, setSaldo] = useState(null);
    const [riwayatSaldo, setRiwayatSaldo] = useState([]);
    const [listPenambahan, setListPenambahan] = useState([]);
    const [riwayatSaldoPage, setRiwayatSaldoPage] = useState(1);
    const [modalSaldo, setModalSaldo] = useState(false);
    const [modalAjukanSaldo, setModalAjukanSaldo] = useState(false);
    const [modalApprovalSaldo, setModalApprovalSaldo] = useState(null);
    const [formSaldo, setFormSaldo] = useState({ tanggal: '', nominal_diajukan: '', alasan: '' });
    const [formApvSaldo, setFormApvSaldo] = useState({ aksi: 'setujui', nominal_diajukan: '', catatan_tolak: '' });

    // PC state
    const [listPC, setListPC] = useState([]);
    const [loadingPC, setLoadingPC] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDari, setFilterDari] = useState(null);
    const [filterSampai, setFilterSampai] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSizePC, setPageSizePC] = useState(10);
    const [totalPC, setTotalPC] = useState(0);

    const [modalBuat, setModalBuat] = useState(false);
    const [modalDetail, setModalDetail] = useState(null);
    const [modalApproval, setModalApproval] = useState(null);
    const [modalCairkan, setModalCairkan] = useState(null);
    const [modalLaporan, setModalLaporan] = useState(null);
    const [modalApprovalLaporan, setModalApprovalLaporan] = useState(null);
    const [modalKonfirmasi, setModalKonfirmasi] = useState(null);
    const [modalRevisi, setModalRevisi] = useState(null);
    const [modalBatal, setModalBatal] = useState(null);
    const [formBatal, setFormBatal] = useState({ alasan: '' });

    const [formPC, setFormPC] = useState({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' });
    const [berkasPC, setBerkasPC] = useState(null);
    const [berkasPCInfo, setBerkasPCInfo] = useState(null);
    const [formLaporan, setFormLaporan] = useState({ tanggal_laporan: todayStr(), tanggal_nota: todayStr(), nominal_digunakan: '', rincian: '' });
    const [laporanItems, setLaporanItems] = useState([
        { kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }
    ]);
    const [notaList, setNotaList] = useState([]);
    const [approvalForm, setApprovalForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const [approvalLaporanForm, setApprovalLaporanForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const berkasRef = useRef(); const notaRef = useRef();

    const addLaporanItem = () => {
        setLaporanItems(prev => [...prev, { kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
    };

    const updateLaporanItem = (index, field, value) => {
        setLaporanItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            if (field === 'kode_akun') {
                const acc = AKUN_MAP[value];
                if (acc) {
                    next[index].nama_akun = acc.nama;
                    next[index].pos_biaya = acc.pos;
                } else {
                    next[index].nama_akun = '';
                    next[index].pos_biaya = '';
                }
            }
            return next;
        });
    };

    const removeLaporanItem = (index) => {
        setLaporanItems(prev => {
            if (prev.length <= 1) {
                return [{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }];
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const totalLaporanItems = useMemo(() => {
        return laporanItems.reduce((sum, it) => sum + (Number(it.nilai) || 0), 0);
    }, [laporanItems]);

    // RB state
    const [listRB, setListRB] = useState([]);
    const [loadingRB, setLoadingRB] = useState(true);
    const [searchRB, setSearchRB] = useState('');
    const [filterStatusRB, setFilterStatusRB] = useState('');
    const [filterDariRB, setFilterDariRB] = useState(null);
    const [filterSampaiRB, setFilterSampaiRB] = useState(null);
    const [pageRB, setPageRB] = useState(1);
    const [pageSizeRB, setPageSizeRB] = useState(10);
    const [totalRB, setTotalRB] = useState(0);

    const [modalBuatRB, setModalBuatRB] = useState(false);
    const [modalDetailRB, setModalDetailRB] = useState(null);
    const [modalApprovalRB, setModalApprovalRB] = useState(null);
    const [modalCairkanRB, setModalCairkanRB] = useState(null);
    const [modalRevisiRB, setModalRevisiRB] = useState(null);
    const [modalBatalRB, setModalBatalRB] = useState(null);
    const [formBatalRB, setFormBatalRB] = useState({ alasan: '' });

    const [formRB, setFormRB] = useState({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
    const [berkasRB, setBerkasRB] = useState(null);
    const [berkasRBInfo, setBerkasRBInfo] = useState(null);
    const [approvalRBForm, setApprovalRBForm] = useState({ aksi: 'setujui', catatan_tolak: '' });
    const berkasRBRef = useRef();
    const [imagePreview, setImagePreview] = useState(null);

    const anyModalOpen = Boolean(
        modalBuat || modalDetail || modalApproval || modalCairkan || modalLaporan || modalApprovalLaporan || modalKonfirmasi || modalRevisi || modalBatal ||
        modalBuatRB || modalDetailRB || modalApprovalRB || modalCairkanRB || modalRevisiRB || modalBatalRB ||
        modalSaldo || modalAjukanSaldo || modalApprovalSaldo || imagePreview
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchAll(); }, [page, pageSizePC, filterStatus, filterDari, filterSampai, pageRB, pageSizeRB, filterStatusRB, filterDariRB, filterSampaiRB]);
    useEffect(() => {
        if (!anyModalOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [anyModalOpen]);

    const fetchAll = async () => {
        setLoadingPC(true); setLoadingRB(true);
        try {
            const promises = [
                api.get('/keuangan/petty-cash/', { params: pageParams(page, pageSizePC, { status: filterStatus || undefined, dari: dateToStr(filterDari), sampai: dateToStr(filterSampai) }) }),
                api.get('/keuangan/reimbursement/', { params: pageParams(pageRB, pageSizeRB, { status: filterStatusRB || undefined, dari: dateToStr(filterDariRB), sampai: dateToStr(filterSampaiRB) }) }),
            ];
            if (canSeeSaldo) {
                promises.push(api.get('/keuangan/saldo-petty-cash/'));
                promises.push(api.get('/keuangan/penambahan-saldo/'));
            }
            const results = await Promise.all(promises);
            setListPC(getResults(results[0].data));
            setTotalPC(getCount(results[0].data));
            setListRB(getResults(results[1].data));
            setTotalRB(getCount(results[1].data));
            if (canSeeSaldo && results[2]) {
                setSaldo(results[2].data.saldo);
                setRiwayatSaldo(results[2].data.riwayat || []);
            }
            if (canSeeSaldo && results[3]) {
                setListPenambahan(getResults(results[3].data));
            }
        } catch (e) { console.error(e); }
        finally { setLoadingPC(false); setLoadingRB(false); }
    };

    const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };
    const resetError = () => setError('');

    // Filtered PC
    const filteredPC = useMemo(() => listPC.filter(i => {
        if (filterStatus && i.status !== filterStatus) return false;
        if (search) { const q = search.toLowerCase(); if (!i.no_pengajuan?.toLowerCase().includes(q) && !i.keperluan?.toLowerCase().includes(q)) return false; }
        if (filterDari && new Date(i.tanggal) < filterDari) return false;
        if (filterSampai) { const s = new Date(filterSampai); s.setHours(23, 59, 59); if (new Date(i.tanggal) > s) return false; }
        return true;
    }), [listPC, filterStatus, search, filterDari, filterSampai]);

    const totalPagesPC = pageCount(search ? filteredPC.length : totalPC, pageSizePC);
    const pagedPC = search ? filteredPC : filteredPC;
    useEffect(() => setPage(1), [search, filterStatus, filterDari, filterSampai]);

    // Filtered RB
    const filteredRB = useMemo(() => listRB.filter(i => {
        if (filterStatusRB && i.status !== filterStatusRB) return false;
        if (searchRB) { const q = searchRB.toLowerCase(); if (!i.no_reimbursement?.toLowerCase().includes(q) && !i.keperluan?.toLowerCase().includes(q)) return false; }
        if (filterDariRB && new Date(i.tanggal) < filterDariRB) return false;
        if (filterSampaiRB) { const s = new Date(filterSampaiRB); s.setHours(23, 59, 59); if (new Date(i.tanggal) > s) return false; }
        return true;
    }), [listRB, filterStatusRB, searchRB, filterDariRB, filterSampaiRB]);

    const totalPagesRB = pageCount(searchRB ? filteredRB.length : totalRB, pageSizeRB);
    const pagedRB = searchRB ? filteredRB : filteredRB;
    useEffect(() => setPageRB(1), [searchRB, filterStatusRB, filterDariRB, filterSampaiRB]);

    // Stats
    const pendingPC = listPC.filter(i => ['pending', 'menunggu_approval_laporan'].includes(i.status)).length;
    const pendingRB = listRB.filter(i => i.status === 'pending').length;
    const berjalanPC = listPC.filter(i => ['dicairkan', 'menunggu_approval_laporan', 'dilaporkan', 'menunggu_pengembalian'].includes(i.status)).length;
    const selesaiPC = listPC.filter(i => i.status === 'selesai').length;
    // Handlers PC
    const handleBuatPC = async () => {
        setError('');
        const tgl = formPC.tanggal || todayStr();
        if (!tgl || !formPC.keperluan || !formPC.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formPC.nominal) > 999999) return setError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.');
        if (Number(formPC.nominal) <= 0) return setError('Nominal harus lebih dari 0.');
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal', tgl);
            fd.append('keperluan', formPC.keperluan);
            fd.append('nominal', formPC.nominal);
            if (formPC.keterangan) fd.append('keterangan', formPC.keterangan);
            if (berkasPC) fd.append('berkas', berkasPC);
            await api.post('/keuangan/petty-cash/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan petty cash berhasil disubmit!');
            setModalBuat(false); setFormPC({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' }); setBerkasPC(null); setBerkasPCInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleApprovalPC = async () => {
        setError('');
        if (approvalForm.aksi === 'tolak' && !approvalForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalApproval.id}/approval/`, approvalForm);
            showSuccess(`Pengajuan berhasil ${approvalForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApproval(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleCairkanPC = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalCairkan.id}/cairkan/`);
            showSuccess('Dana berhasil dicairkan!');
            setModalCairkan(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencairkan.'); }
        finally { setSaving(false); }
    };

    const handleLaporanPC = async () => {
        setError('');
        const tglLaporan = formLaporan.tanggal_laporan || todayStr();
        if (!tglLaporan || !formLaporan.tanggal_nota) {
            return setError('Tanggal laporan dan tanggal nota belanja wajib diisi.');
        }

        const validItems = laporanItems.filter(it => it.kode_akun && it.deskripsi && it.nilai && Number(it.nilai) > 0);
        if (validItems.length === 0) {
            return setError('Minimal harus ada 1 baris rincian belanja dengan Kategori Akun Biaya, Deskripsi, dan Nilai yang valid.');
        }

        const nominalDigunakan = validItems.reduce((acc, it) => acc + Number(it.nilai), 0);
        if (nominalDigunakan <= 0) {
            return setError('Total nominal belanja yang digunakan harus lebih dari Rp 0.');
        }
        if (nominalDigunakan > Number(modalLaporan.nominal)) {
            return setError(`Total nominal digunakan (${fmt(nominalDigunakan)}) melebihi dana dicairkan (${fmt(modalLaporan.nominal)}).`);
        }

        if (!notaList || notaList.length === 0) {
            return setError('Minimal harus ada 1 file nota / struk bukti pengeluaran belanja yang diunggah.');
        }

        const rincianText = validItems.map(it => `[${it.kode_akun} ${it.nama_akun}] ${it.deskripsi} (${fmt(it.nilai)})`).join('; ');

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tanggal_laporan', tglLaporan);
            fd.append('tanggal_nota', formLaporan.tanggal_nota);
            fd.append('nominal_digunakan', String(nominalDigunakan));
            fd.append('rincian', rincianText);
            fd.append('items', JSON.stringify(validItems));

            // Append all nota files
            notaList.forEach(it => {
                fd.append('nota', it.file);
            });

            await api.post(`/keuangan/petty-cash/${modalLaporan.id}/laporan/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Laporan penggunaan berhasil disubmit!');
            setModalLaporan(null);
            setFormLaporan({ tanggal_laporan: todayStr(), tanggal_nota: todayStr(), nominal_digunakan: '', rincian: '' });
            setLaporanItems([{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
            clearNotaList();
            fetchAll();
        } catch (e) {
            setError(e.response?.data?.error || e.response?.data?.detail || 'Gagal submit laporan.');
        } finally {
            setSaving(false);
        }
    };

    const handleApprovalLaporanPC = async () => {
        setError('');
        if (approvalLaporanForm.aksi === 'tolak' && !approvalLaporanForm.catatan_tolak.trim()) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalApprovalLaporan.id}/approval-laporan/`, approvalLaporanForm);
            showSuccess(`Laporan penggunaan berhasil ${approvalLaporanForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalLaporan(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal approve laporan penggunaan.'); }
        finally { setSaving(false); }
    };

    const handleKonfirmasiPC = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalKonfirmasi.id}/konfirmasi-pengembalian/`);
            showSuccess('Pengembalian dikonfirmasi. Petty cash selesai!');
            setModalKonfirmasi(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal konfirmasi.'); }
        finally { setSaving(false); }
    };

    const handleRevisiPC = async () => {
        setError('');
        if (!formPC.tanggal || !formPC.keperluan || !formPC.nominal) return setError('Semua field wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formPC).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (berkasPC) fd.append('berkas', berkasPC);
            await api.post(`/keuangan/petty-cash/${modalRevisi.id}/revisi/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan berhasil direvisi!');
            setModalRevisi(null); setFormPC({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasPC(null); setBerkasPCInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal merevisi.'); }
        finally { setSaving(false); }
    };

    const handleBatalPC = async () => {
        setError('');
        if (!formBatal.alasan || !formBatal.alasan.trim()) {
            return setError('Alasan pembatalan wajib diisi.');
        }
        setSaving(true);
        try {
            await api.post(`/keuangan/petty-cash/${modalBatal.id}/batal/`, {
                alasan_batal: formBatal.alasan.trim(),
                alasan: formBatal.alasan.trim(),
            });
            showSuccess('Pengajuan berhasil dibatalkan.');
            setModalBatal(null);
            setFormBatal({ alasan: '' });
            fetchAll();
        } catch (e) {
            setError(e.response?.data?.detail || e.response?.data?.error || 'Gagal membatalkan pengajuan.');
        } finally {
            setSaving(false);
        }
    };

    // Handlers RB
    const handleBuatRB = async () => {
        setError('');
        if (!formRB.tanggal || !formRB.keperluan || !formRB.nominal) return setError('Tanggal, keperluan, dan nominal wajib diisi.');
        if (Number(formRB.nominal) > 999999) return setError('Nominal maksimal Rp 999.999. Pengajuan di atas itu langsung ke bagian keuangan.');
        if (Number(formRB.nominal) <= 0) return setError('Nominal harus lebih dari 0.');
        if (!berkasRB) return setError('Berkas bukti wajib dilampirkan.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formRB).forEach(([k, v]) => { if (v) fd.append(k, v); });
            fd.append('berkas', berkasRB);
            await api.post('/keuangan/reimbursement/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Pengajuan reimbursement berhasil disubmit!');
            setModalBuatRB(false); setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasRB(null); setBerkasRBInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || e.response?.data?.berkas?.[0] || 'Gagal menyimpan.'); }
        finally { setSaving(false); }
    };

    const handleApprovalRB = async () => {
        setError('');
        if (approvalRBForm.aksi === 'tolak' && !approvalRBForm.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalApprovalRB.id}/approval/`, approvalRBForm);
            showSuccess(`Reimbursement berhasil ${approvalRBForm.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalRB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleCairkanRB = async () => {
        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalCairkanRB.id}/cairkan/`);
            showSuccess('Reimbursement berhasil dicairkan!');
            setModalCairkanRB(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal mencairkan.'); }
        finally { setSaving(false); }
    };

    const handleRevisiRB = async () => {
        setError('');
        if (!formRB.tanggal || !formRB.keperluan || !formRB.nominal) return setError('Semua field wajib diisi.');
        setSaving(true);
        try {
            const fd = new FormData();
            Object.entries(formRB).forEach(([k, v]) => { if (v) fd.append(k, v); });
            if (berkasRB) fd.append('berkas', berkasRB);
            await api.post(`/keuangan/reimbursement/${modalRevisiRB.id}/revisi/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showSuccess('Reimbursement berhasil direvisi!');
            setModalRevisiRB(null); setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' }); setBerkasRB(null); setBerkasRBInfo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal merevisi.'); }
        finally { setSaving(false); }
    };

    const handleBatalRB = async () => {
        setError('');
        if (!formBatalRB.alasan || !formBatalRB.alasan.trim()) {
            return setError('Alasan pembatalan wajib diisi.');
        }
        setSaving(true);
        try {
            await api.post(`/keuangan/reimbursement/${modalBatalRB.id}/batal/`, {
                alasan_batal: formBatalRB.alasan.trim(),
                alasan: formBatalRB.alasan.trim(),
            });
            showSuccess('Reimbursement berhasil dibatalkan.');
            setModalBatalRB(null);
            setFormBatalRB({ alasan: '' });
            fetchAll();
        } catch (e) {
            setError(e.response?.data?.detail || e.response?.data?.error || 'Gagal membatalkan reimbursement.');
        } finally {
            setSaving(false);
        }
    };

    // Handlers saldo
    const handleAjukanSaldo = async () => {
        setError('');
        if (!formSaldo.tanggal || !formSaldo.nominal_diajukan || !formSaldo.alasan) {
            return setError('Tanggal, nominal, dan keterangan pengisian kembali wajib diisi.');
        }
        if (Number(formSaldo.nominal_diajukan) <= 0) {
            return setError('Nominal pengisian kembali harus lebih dari 0.');
        }
        setSaving(true);
        try {
            await api.post('/keuangan/penambahan-saldo/', formSaldo);
            showSuccess('Pengajuan pengisian kembali saldo berhasil disubmit!');
            setModalAjukanSaldo(false); setFormSaldo({ tanggal: '', nominal_diajukan: '', alasan: '' }); fetchAll();
        } catch (e) { setError(e.response?.data?.detail || 'Gagal mengajukan pengisian kembali saldo.'); }
        finally { setSaving(false); }
    };

    const handleApprovalSaldo = async () => {
        setError('');
        if (formApvSaldo.aksi === 'setujui' && !formApvSaldo.nominal_diajukan) return setError('Nominal wajib diisi.');
        if (formApvSaldo.aksi === 'tolak' && !formApvSaldo.catatan_tolak) return setError('Catatan tolak wajib diisi.');
        setSaving(true);
        try {
            await api.post(`/keuangan/penambahan-saldo/${modalApprovalSaldo.id}/approval/`, formApvSaldo);
            showSuccess(`Pengajuan berhasil ${formApvSaldo.aksi === 'setujui' ? 'disetujui' : 'ditolak'}!`);
            setModalApprovalSaldo(null); fetchAll();
        } catch (e) { setError(e.response?.data?.error || 'Gagal memproses.'); }
        finally { setSaving(false); }
    };

    const handleAttachmentChange = async (e, setFile, setInfo) => {
        setError('');
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            if (file.type.startsWith('image/')) {
                const validation = validateImageFile(file);
                if (!validation.isValid) return setError(validation.error);
                const [compressed] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
                const reduction = Math.max(0, (1 - compressed.size / file.size) * 100).toFixed(1);
                setFile(compressed);
                setInfo({
                    name: file.name,
                    originalSize: formatFileSize(file.size),
                    compressedSize: formatFileSize(compressed.size),
                    reduction,
                    compressed: true,
                });
            } else {
                setFile(file);
                setInfo({
                    name: file.name,
                    originalSize: formatFileSize(file.size),
                    compressedSize: formatFileSize(file.size),
                    reduction: '0.0',
                    compressed: false,
                });
            }
        } catch (err) {
            setError(`Gagal memproses file: ${err.message}`);
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    const handleMultipleNotaChange = async (e) => {
        setError('');
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;

        try {
            const processedItems = [];
            for (const file of selectedFiles) {
                if (file.type.startsWith('image/')) {
                    const validation = validateImageFile(file);
                    if (!validation.isValid) {
                        setError(`File "${file.name}": ${validation.error}`);
                        continue;
                    }
                    const [compressed] = await compressImages([file], { maxSizeMB: 0.5, maxWidthOrHeight: 1920, quality: 0.75 });
                    const reduction = Math.max(0, (1 - compressed.size / file.size) * 100).toFixed(1);
                    const previewUrl = URL.createObjectURL(compressed);
                    processedItems.push({
                        file: compressed,
                        url: previewUrl,
                        name: file.name,
                        originalSize: formatFileSize(file.size),
                        compressedSize: formatFileSize(compressed.size),
                        reduction,
                        compressed: true
                    });
                } else {
                    const previewUrl = URL.createObjectURL(file);
                    processedItems.push({
                        file,
                        url: previewUrl,
                        name: file.name,
                        originalSize: formatFileSize(file.size),
                        compressedSize: formatFileSize(file.size),
                        reduction: '0.0',
                        compressed: false
                    });
                }
            }

            if (processedItems.length > 0) {
                setNotaList(prev => [...prev, ...processedItems]);
            }
        } catch (err) {
            setError(`Gagal memproses file nota: ${err.message}`);
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    const removeNotaItem = (index) => {
        setNotaList(prev => {
            const target = prev[index];
            if (target?.url) {
                try { URL.revokeObjectURL(target.url); } catch {}
            }
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const clearNotaList = () => {
        setNotaList(prev => {
            prev.forEach(it => {
                if (it?.url) {
                    try { URL.revokeObjectURL(it.url); } catch {}
                }
            });
            return [];
        });
    };

    // Saldo info
    const saldoNominal = saldo ? Number(saldo.saldo) : 0;
    const saldoPct = Math.min((saldoNominal / 10000000) * 100, 100).toFixed(1);
    const saldoKritis = saldoNominal < 1000000;
    const pendingSaldo = listPenambahan.filter(i => i.status === 'pending').length;
    const saldoStats = useMemo(() => ({
        pending: listPenambahan.filter(i => i.status === 'pending').length,
        disetujui: listPenambahan.filter(i => i.status === 'disetujui').length,
        ditolak: listPenambahan.filter(i => i.status === 'ditolak').length,
    }), [listPenambahan]);
    const saldoTotalMasuk = useMemo(
        () => riwayatSaldo.filter(i => i.jenis === 'penambahan').reduce((sum, i) => sum + Number(i.jumlah || 0), 0),
        [riwayatSaldo]
    );
    const saldoTotalKeluar = useMemo(
        () => riwayatSaldo.filter(i => i.jenis === 'pengurangan').reduce((sum, i) => sum + Number(i.jumlah || 0), 0),
        [riwayatSaldo]
    );
    const saldoActor = (r) => ({
        nama: r.nama_pengaju || r.created_by_name || 'Tidak diketahui',
        unit: r.unit_pengaju || r.created_by_unit || '',
    });
    const totalRiwayatSaldoPages = Math.max(1, Math.ceil(riwayatSaldo.length / RIWAYAT_SALDO_PER_PAGE));
    const pagedRiwayatSaldo = riwayatSaldo.slice(
        (riwayatSaldoPage - 1) * RIWAYAT_SALDO_PER_PAGE,
        riwayatSaldoPage * RIWAYAT_SALDO_PER_PAGE
    );
    useEffect(() => setRiwayatSaldoPage(1), [riwayatSaldo.length]);
    const approvalUsageTotal = modalApprovalSaldo?.riwayat_snapshot?.reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;
    const approvalSaldoAfter = saldoNominal + Number(formApvSaldo.nominal_diajukan || 0);
    const penambahanStatusLabel = (status) => ({
        pending: 'Menunggu',
        disetujui: 'Disetujui',
        ditolak: 'Ditolak',
    }[status] || status || '-');

    const renderPages = (cur, total, setFn) => {
        const btns = [];
        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= cur - 1 && i <= cur + 1)) btns.push(i);
            else if (btns[btns.length - 1] !== '...') btns.push('...');
        }
        return btns.map((btn, i) => btn === '...'
            ? <span key={i} style={{ padding: '0 4px', color: '#94a3b8', lineHeight: '32px' }}>...</span>
            : <button key={i} className={`pc-page-btn${cur === btn ? ' active' : ''}`} onClick={() => setFn(btn)}>{btn}</button>
        );
    };

    const StepTracker = ({ status }) => {
        if (status === 'ditolak') return (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 16px', marginBottom: 24, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                Pengajuan ini ditolak
            </div>
        );
        const curIdx = ORDER.indexOf(status);
        return (
            <div className="pc-steps">
                {PC_STEPS.map((s, i) => {
                    const idx = ORDER.indexOf(s.key);
                    const done = curIdx >= idx;
                    const active = curIdx === idx;
                    return (
                        <div key={s.key} className="pc-step">
                            {i < PC_STEPS.length - 1 && <div className="pc-step-line" style={{ background: done ? '#1a4731' : '#e2e8f0' }} />}
                            <div className="pc-step-dot" style={{ background: done ? '#1a4731' : '#f1f5f9', color: done ? '#fff' : '#94a3b8', border: active ? '2px solid #1a4731' : 'none', boxSizing: 'border-box' }}>
                                {done ? <Check size={12} /> : i + 1}
                            </div>
                            <div className="pc-step-label" style={{ color: done ? '#1a4731' : '#94a3b8' }}>{s.label}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="pc-page pc-shell">

            <div className="pc-hero">
                <div className="pc-hero-main">
                    <div className="pc-page-title">
                        <span><Wallet size={22} /></span>
                        <div>
                            <h1 className="pc-title">Petty Cash & Reimbursement</h1>
                            <p className="pc-subtitle">Pantau saldo kas kecil, proses pengajuan, dan cek reimbursement dalam satu halaman kerja yang ringkas.</p>
                        </div>
                    </div>
                </div>
            </div>

            {success && <div className="pc-alert-ok"><Check size={16} /> {success}</div>}

            {/* Saldo cards untuk manajer ke atas */}
            {canSeeSaldo && saldo && (() => {
                const totalMasuk = riwayatSaldo.filter(r => r.jenis === 'penambahan').reduce((s, r) => s + Number(r.jumlah), 0);
                const totalKeluar = riwayatSaldo.filter(r => r.jenis === 'pengurangan').reduce((s, r) => s + Number(r.jumlah), 0);
                return (
                    <div className="pc-saldo-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 28 }}>

                        {/* Card Saldo Utama */}
                        <div className="pc-balance-card">
                            <div className="pc-balance-inner">
                                <div>
                                    <div className="pc-balance-top">
                                        <div>
                                            <p className="pc-balance-label">Saldo Petty Cash</p>
                                            <p className="pc-balance-value">{fmt(saldoNominal)}</p>
                                            {saldo.updated_by_name && <p className="pc-balance-meta">Diperbarui oleh {saldo.updated_by_name}</p>}
                                        </div>
                                        <div className="pc-balance-icon"><Wallet size={23} /></div>
                                    </div>
                                    <div className="pc-balance-progress">
                                        <span style={{ width: `${saldoPct}%`, background: saldoKritis ? 'linear-gradient(90deg,#f87171,#ef4444)' : 'linear-gradient(90deg,#6ee7b7,#34d399)' }} />
                                    </div>
                                    <div className="pc-balance-foot">
                                        <span>{saldoPct}% dari Rp 10.000.000</span>
                                        {saldoKritis && <span className="pc-warning-pill"><AlertTriangle size={13} /> Menipis</span>}
                                    </div>
                                </div>
                                <div className="pc-balance-actions">
                                    <button className="pc-action-dark" onClick={() => setModalSaldo(true)}>
                                        <ClipboardList size={15} />
                                        Daftar Pengisian Kembali Saldo
                                        {pendingSaldo > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '2px 7px', lineHeight: 1.4 }}>{pendingSaldo}</span>}
                                    </button>
                                    {isManajer && (
                                        <button className="pc-action-dark" onClick={() => { setFormSaldo({ tanggal: '', nominal_diajukan: '', alasan: '' }); resetError(); setModalAjukanSaldo(true); }}>
                                            <Plus size={15} />
                                            Pengisian Kembali
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Card Total Masuk */}
                        <div className="pc-money-card pc-money-masuk">
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(34,197,94,.06)', pointerEvents: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div className="pc-card-icon pc-icon-masuk"><ArrowRight size={18} style={{ transform: 'rotate(-45deg)' }} /></div>
                                <span className="pc-card-badge pc-badge-masuk">MASUK</span>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Total Penambahan</p>
                            <p className="pc-masuk-amt" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{fmt(totalMasuk)}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{riwayatSaldo.filter(r => r.jenis === 'penambahan').length} kali penambahan</p>
                            <div className="pc-progress-track">
                                <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#86efac,#22c55e)', width: `${Math.min((totalMasuk / (totalMasuk + totalKeluar || 1)) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                            </div>
                        </div>

                        {/* Card Total Keluar */}
                        <div className="pc-money-card pc-money-keluar">
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(239,68,68,.06)', pointerEvents: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div className="pc-card-icon pc-icon-keluar"><ArrowRight size={18} style={{ transform: 'rotate(45deg)' }} /></div>
                                <span className="pc-card-badge pc-badge-keluar">KELUAR</span>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Total Penggunaan</p>
                            <p className="pc-keluar-amt" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{fmt(totalKeluar)}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{riwayatSaldo.filter(r => r.jenis === 'pengurangan').length} kali penggunaan</p>
                            <div className="pc-progress-track">
                                <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#fca5a5,#ef4444)', width: `${Math.min((totalKeluar / (totalMasuk + totalKeluar || 1)) * 100, 100).toFixed(0)}%`, transition: 'width 1s ease' }} />
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Stats row kalau tidak ada saldo banner (karyawan) */}
            {/* Stats mini */}
            <div className="pc-stats-mini" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                {[
                    { Icon: Clock, label: 'Pending Approval', val: pendingPC + pendingRB, iconClass: 'pc-stat-icon-pending', valClass: 'pc-stat-val-pending' },
                    { Icon: Wallet, label: 'Sedang Berjalan', val: berjalanPC, iconClass: 'pc-stat-icon-berjalan', valClass: 'pc-stat-val-berjalan' },
                    { Icon: Check, label: 'Selesai', val: selesaiPC, iconClass: 'pc-stat-icon-selesai', valClass: 'pc-stat-val-selesai' },
                ].map((s, i) => (
                    <div className="pc-stat-mini" key={i}>
                        <div className={`pc-stat-icon ${s.iconClass}`}><s.Icon size={18} strokeWidth={1.5} /></div>
                        <div style={{ minWidth: 0 }}>
                            <p className="pc-stat-mini-label">{s.label}</p>
                            <p className={`pc-stat-mini-val ${s.valClass}`}>{s.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="pc-list-area">
                <div className="pc-list-head">
                    <div>
                        <p className="pc-list-title">Pengajuan Operasional</p>
                        <p className="pc-list-subtitle">Pilih jenis pengajuan, filter data, lalu proses sesuai role Anda.</p>
                    </div>
                    <div className="pc-tabs">
                        <button className={`pc-tab-pill${activeTab === 'pc' ? ' active' : ''}`} onClick={() => setActiveTab('pc')}>
                            Petty Cash {pendingPC > 0 && <span className="pc-tab-count">{pendingPC}</span>}
                        </button>
                        <button className={`pc-tab-pill${activeTab === 'rb' ? ' active' : ''}`} onClick={() => setActiveTab('rb')}>
                            Reimbursement {pendingRB > 0 && <span className="pc-tab-count">{pendingRB}</span>}
                        </button>
                    </div>
                </div>

            {/* ══ TAB PETTY CASH ══ */}
            {activeTab === 'pc' && (
                <div className="pc-section-card">
                    <div className="pc-table-titlebar">
                        <div>
                            <p className="pc-table-heading">Daftar Petty Cash</p>
                            <p className="pc-table-subheading">{search ? filteredPC.length : totalPC} pengajuan ditemukan</p>
                        </div>
                        <button className="pc-action-primary" onClick={() => {
                            setFormPC({ tanggal: todayStr(), keperluan: '', nominal: '', keterangan: '' });
                            setBerkasPC(null);
                            setBerkasPCInfo(null);
                            resetError();
                            setModalBuat(true);
                        }}>
                            <Plus size={16} />
                            Ajukan Petty Cash
                        </button>
                    </div>
                    <StableFilterBar searchVal={search} onSearch={setSearch} statusVal={filterStatus} onStatus={setFilterStatus}
                        statusCfg={PC_STATUS} dariVal={filterDari} onDari={setFilterDari} sampaiVal={filterSampai} onSampai={setFilterSampai}
                        hasFilter={!!(search || filterStatus || filterDari || filterSampai)}
                        onReset={() => { setSearch(''); setFilterStatus(''); setFilterDari(null); setFilterSampai(null); }} />

                    {loadingPC ? <div className="pc-empty-state">Memuat data...</div>
                        : pagedPC.length === 0 ? <div className="pc-empty-state">Tidak ada data.</div>
                            : <div className="pc-table-wrap"><table className="pc-table">
                                <thead><tr>
                                    <th>No. Pengajuan</th><th>Tanggal</th><th>Keperluan</th><th>Nominal</th><th>Status</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr></thead>
                                <tbody>
                                    {pagedPC.map((item, idx) => (
                                        <tr key={item.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                            <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a4731', fontSize: 13 }}>{item.no_pengajuan}</span></td>
                                            <td style={{ color: '#94a3b8' }}>{fmtTgl(item.tanggal)}</td>
                                            <td style={{ maxWidth: 200 }}>
                                                <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keperluan}</p>
                                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_by_name}</p>
                                            </td>
                                            <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                            <td><StatusBadge cfg={PC_STATUS} status={item.status} /></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="pc-action-cell">
                                                    {isDirekturWadir && item.status === 'pending' && (
                                                        <button className="pc-btn-sm g" onClick={() => { setApprovalForm({ aksi: 'setujui', catatan_tolak: '' }); resetError(); setModalApproval(item); }}>Proses</button>
                                                    )}
                                                    {isPettyCashCashier && item.status === 'disetujui' && (
                                                        <button className="pc-btn-sm b" onClick={() => { resetError(); setModalCairkan(item); }}>Cairkan</button>
                                                    )}
                                                    {item.status === 'dicairkan' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm p" onClick={() => {
                                                            setFormLaporan({ tanggal_laporan: todayStr(), tanggal_nota: item.tanggal ? String(item.tanggal) : todayStr(), nominal_digunakan: '', rincian: '' });
                                                            setLaporanItems([{ kode_akun: '', nama_akun: '', pos_biaya: '', deskripsi: '', nilai: '' }]);
                                                            clearNotaList();
                                                            resetError();
                                                            setModalLaporan(item);
                                                        }}>Laporan</button>
                                                    )}
                                                    {isDirekturWadir && item.status === 'menunggu_approval_laporan' && (
                                                        <button className="pc-btn-sm g" onClick={() => { setApprovalLaporanForm({ aksi: 'setujui', catatan_tolak: '' }); resetError(); setModalApprovalLaporan(item); }}>Approve Laporan</button>
                                                    )}
                                                    {isPettyCashCashier && ['dilaporkan', 'menunggu_pengembalian'].includes(item.status) && (
                                                        <button className="pc-btn-sm y" onClick={() => { resetError(); setModalKonfirmasi(item); }}>Konfirmasi</button>
                                                    )}
                                                    <button className="pc-btn-sm n" onClick={() => setModalDetail(item)}>Detail</button>
                                                    {item.status === 'ditolak' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm b revision" onClick={() => { setFormPC({ tanggal: item.tanggal, keperluan: item.keperluan, nominal: item.nominal, keterangan: item.keterangan || '' }); setBerkasPC(null); setBerkasPCInfo(null); resetError(); setModalRevisi(item); }}>Revisi</button>
                                                    )}
                                                    {item.status !== 'dibatalkan' && (item.created_by === user?.id || isPettyCashCashier || isDirekturWadir) && (
                                                        <button className="pc-btn-sm r" onClick={() => { resetError(); setFormBatal({ alasan: '' }); setModalBatal(item); }} title="Batalkan Pengajuan">Batal</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>}

                    {(search ? filteredPC.length : totalPC) > 0 && (
                        <div className="pc-pagination">
                            <span className="pc-page-info">Hal {page} dari {totalPagesPC} - {search ? filteredPC.length : totalPC} data</span>
                            <div className="pc-page-btns">
                                <RowSizeSelect className="pc-filter-select" value={pageSizePC} onChange={(size) => { setPageSizePC(size); setPage(1); }} />
                                <button className="pc-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>&lt;</button>
                                {renderPages(page, totalPagesPC, setPage)}
                                <button className="pc-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPagesPC}>&gt;</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ TAB REIMBURSEMENT ══ */}
            {activeTab === 'rb' && (
                <div className="pc-section-card">
                    <div className="pc-table-titlebar">
                        <div>
                            <p className="pc-table-heading">Daftar Reimbursement</p>
                            <p className="pc-table-subheading">{searchRB ? filteredRB.length : totalRB} pengajuan ditemukan</p>
                        </div>
                        <button className="pc-action-primary" onClick={() => {
                            setFormRB({ tanggal: '', keperluan: '', nominal: '', keterangan: '' });
                            setBerkasRB(null);
                            setBerkasRBInfo(null);
                            resetError();
                            setModalBuatRB(true);
                        }}>
                            <Plus size={16} />
                            Ajukan Reimbursement
                        </button>
                    </div>
                    <StableFilterBar searchVal={searchRB} onSearch={setSearchRB} statusVal={filterStatusRB} onStatus={setFilterStatusRB}
                        statusCfg={RB_STATUS} dariVal={filterDariRB} onDari={setFilterDariRB} sampaiVal={filterSampaiRB} onSampai={setFilterSampaiRB}
                        hasFilter={!!(searchRB || filterStatusRB || filterDariRB || filterSampaiRB)}
                        onReset={() => { setSearchRB(''); setFilterStatusRB(''); setFilterDariRB(null); setFilterSampaiRB(null); }} />

                    {loadingRB ? <div className="pc-empty-state">Memuat data...</div>
                        : pagedRB.length === 0 ? <div className="pc-empty-state">Tidak ada data.</div>
                            : <div className="pc-table-wrap"><table className="pc-table">
                                <thead><tr>
                                    <th>No. Reimburse</th><th>Tanggal</th><th>Keperluan</th><th>Nominal</th><th>Status</th><th style={{ textAlign: 'center' }}>Aksi</th>
                                </tr></thead>
                                <tbody>
                                    {pagedRB.map((item, idx) => (
                                        <tr key={item.id} className="pc-tr" style={{ animationDelay: `${idx * .03}s` }}>
                                            <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a4731', fontSize: 13 }}>{item.no_reimbursement}</span></td>
                                            <td style={{ color: '#94a3b8' }}>{fmtTgl(item.tanggal)}</td>
                                            <td style={{ maxWidth: 200 }}>
                                                <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keperluan}</p>
                                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_by_name}</p>
                                            </td>
                                            <td style={{ fontWeight: 700, color: '#1a4731' }}>{fmt(item.nominal)}</td>
                                            <td><StatusBadge cfg={RB_STATUS} status={item.status} /></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="pc-action-cell">
                                                    {isDirekturWadir && item.status === 'pending' && (
                                                        <button className="pc-btn-sm g" onClick={() => { setApprovalRBForm({ aksi: 'setujui', catatan_tolak: '' }); resetError(); setModalApprovalRB(item); }}>Proses</button>
                                                    )}
                                                    {isManajer && item.status === 'disetujui' && (
                                                        <button className="pc-btn-sm b" onClick={() => { resetError(); setModalCairkanRB(item); }}>Cairkan</button>
                                                    )}
                                                    <button className="pc-btn-sm n" onClick={() => setModalDetailRB(item)}>Detail</button>
                                                    {item.status === 'ditolak' && (item.created_by === user?.id || isDirekturWadir) && (
                                                        <button className="pc-btn-sm b revision" onClick={() => { setFormRB({ tanggal: item.tanggal, keperluan: item.keperluan, nominal: item.nominal, keterangan: item.keterangan || '' }); setBerkasRB(null); setBerkasRBInfo(null); resetError(); setModalRevisiRB(item); }}>Revisi</button>
                                                    )}
                                                    {item.status !== 'dibatalkan' && (item.created_by === user?.id || isPettyCashCashier || isDirekturWadir) && (
                                                        <button className="pc-btn-sm r" onClick={() => { resetError(); setFormBatalRB({ alasan: '' }); setModalBatalRB(item); }} title="Batalkan Reimbursement">Batal</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>}

                    {(searchRB ? filteredRB.length : totalRB) > 0 && (
                        <div className="pc-pagination">
                            <span className="pc-page-info">Hal {pageRB} dari {totalPagesRB} - {searchRB ? filteredRB.length : totalRB} data</span>
                            <div className="pc-page-btns">
                                <RowSizeSelect className="pc-filter-select" value={pageSizeRB} onChange={(size) => { setPageSizeRB(size); setPageRB(1); }} />
                                <button className="pc-page-btn" onClick={() => setPageRB(p => p - 1)} disabled={pageRB === 1}>&lt;</button>
                                {renderPages(pageRB, totalPagesRB, setPageRB)}
                                <button className="pc-page-btn" onClick={() => setPageRB(p => p + 1)} disabled={pageRB === totalPagesRB}>&gt;</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            </div>

            {/* ════ MODALS PETTY CASH ════ */}

            {/* Buat / Revisi PC */}
            {(modalBuat || modalRevisi) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-modal-native-scroll">
                        <ModalHeader
                            icon={<Wallet size={18} />}
                            title={modalRevisi ? `Revisi - ${modalRevisi.no_pengajuan}` : 'Ajukan Petty Cash'}
                            subtitle="Isi data pengajuan, nominal, kebutuhan dana, dan lampiran bila ada."
                        />
                        {modalRevisi?.catatan_tolak && <div className="pc-rejection"><strong>Alasan ditolak:</strong> {modalRevisi.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Pengajuan">
                            <div className="pc-field">
                                <label className="pc-label">Nama Pengaju</label>
                                <div className="pc-input-readonly">
                                    <User size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span>{modalRevisi ? (modalRevisi.created_by_name || '-') : (user?.full_name || user?.nama || user?.username || '-')}</span>
                                    {(user?.unit_nama || user?.unit?.nama) && (
                                        <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                                            {user?.unit_nama || user?.unit?.nama}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Pengajuan</label>
                                    <DateField value={formPC.tanggal || todayStr()} disabled placeholder="Pilih tanggal..." />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal (Rp) *</label>
                                    <input className="pc-input" type="number" placeholder="0" value={formPC.nominal} onChange={e => setFormPC({ ...formPC, nominal: e.target.value })} />
                                    {Number(formPC.nominal) > 999999 && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Melebihi batas. Maksimal Rp 999.999</p>}
                                    {!formPC.nominal && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Maks. Rp 999.999</p>}
                                </div>
                            </div>
                            <div className="pc-field"><label className="pc-label">Keperluan *</label><textarea className="pc-textarea" placeholder="Jelaskan keperluan..." value={formPC.keperluan} onChange={e => setFormPC({ ...formPC, keperluan: e.target.value })} /></div>
                            <div className="pc-field"><label className="pc-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label><textarea className="pc-textarea" style={{ minHeight: 60 }} placeholder="Catatan atau keterangan tambahan (opsional)..." value={formPC.keterangan} onChange={e => setFormPC({ ...formPC, keterangan: e.target.value })} /></div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran">
                            <input ref={berkasRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => handleAttachmentChange(e, setBerkasPC, setBerkasPCInfo)} />
                            <FileUploadZone file={berkasPC} label="Lampirkan Berkas (opsional)" hint="PDF, JPG, atau PNG. Gambar otomatis dikompres." onPick={() => berkasRef.current.click()} />
                            <AttachmentPreview file={berkasPC} info={berkasPCInfo} onPreview={setImagePreview} />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBuat(false); setModalRevisi(null); setBerkasPC(null); setBerkasPCInfo(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={modalRevisi ? handleRevisiPC : handleBuatPC} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Detail PC */}
            {modalDetail && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<ClipboardList size={18} />}
                            title="Detail Petty Cash"
                            subtitle="Ringkasan pengajuan, status proses, lampiran, dan laporan penggunaan dana."
                        />
                        <ModalSummary
                            label={modalDetail.no_pengajuan}
                            value={fmt(modalDetail.nominal)}
                            description={modalDetail.keperluan}
                            meta={`Tanggal pengajuan ${fmtTgl(modalDetail.tanggal)}`}
                            side={<StatusBadge cfg={PC_STATUS} status={modalDetail.status} />}
                        />
                        <StepTracker status={modalDetail.status} />
                        <ModalSection icon={<User size={14} />} title="Data Pengajuan">
                            <DetailGrid items={[
                                ['No. Pengajuan', modalDetail.no_pengajuan],
                                ['Tanggal', fmtTgl(modalDetail.tanggal)],
                                ['Nominal', fmt(modalDetail.nominal)],
                                ['Status', PC_STATUS[modalDetail.status]?.label],
                                ['Diajukan Oleh', modalDetail.created_by_name],
                                ['Disetujui Oleh', modalDetail.disetujui_oleh_name || '-'],
                                ['Dicairkan Oleh', modalDetail.dicairkan_oleh_name || '-'],
                            ]} />
                            <InfoBlock label="Keperluan" value={modalDetail.keperluan} />
                            {modalDetail.keterangan && <InfoBlock label="Keterangan" value={modalDetail.keterangan} />}
                            {modalDetail.catatan_tolak && (
                                <div className="pc-rejection">
                                    <strong>{modalDetail.status === 'dibatalkan' ? 'Alasan Pembatalan:' : 'Catatan Tolak:'}</strong> {modalDetail.catatan_tolak.replace(/^Dibatalkan:\s*/, '')}
                                </div>
                            )}
                        </ModalSection>
                        {modalDetail.berkas_url && (
                            <ModalSection icon={<Paperclip size={14} />} title="Lampiran Pengajuan">
                                <ExistingAttachmentPreview url={modalDetail.berkas_url} label="Berkas Pengajuan" onPreview={setImagePreview} />
                            </ModalSection>
                        )}
                        {modalDetail.laporan && (
                            <ModalSection icon={<FileText size={14} />} title="Laporan Penggunaan">
                                <DetailGrid items={[
                                    ['Tgl Laporan', fmtTgl(modalDetail.laporan.tanggal_laporan)],
                                    ['Tgl Nota / Belanja', fmtTgl(modalDetail.laporan.tanggal_nota || modalDetail.laporan.tanggal_laporan)],
                                    ['Nominal Digunakan', fmt(modalDetail.laporan.nominal_digunakan)],
                                    ['Selisih / Kembalian', fmt(modalDetail.laporan.selisih)],
                                    ['Approval Laporan', modalDetail.laporan_disetujui_oleh_name || '-'],
                                    ['Tgl Approval', fmtDT(modalDetail.laporan_disetujui_at)],
                                    ['Dikonfirmasi', modalDetail.laporan.dikonfirmasi_oleh_name || 'Belum'],
                                ]} />
                                {modalDetail.laporan.items && modalDetail.laporan.items.length > 0 ? (
                                    <div style={{ marginTop: 12 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                            Rincian Akun Biaya Pengeluaran:
                                        </p>
                                        <div className="pc-items-table-wrapper">
                                            <table className="pc-items-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '36px', textAlign: 'center' }}>No</th>
                                                        <th style={{ width: '38%' }}>Akun Biaya</th>
                                                        <th>Deskripsi Belanja</th>
                                                        <th style={{ textAlign: 'right', width: '130px' }}>Nilai</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalDetail.laporan.items.map((it, idx) => (
                                                        <tr key={it.id || idx}>
                                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                                            <td>
                                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.kode_akun} - {it.nama_akun}</div>
                                                                {it.pos_biaya && <div style={{ fontSize: '11px', color: '#64748b' }}>{it.pos_biaya}</div>}
                                                            </td>
                                                            <td style={{ color: '#334155' }}>{it.deskripsi}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(it.nilai)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b', padding: '10px 12px' }}>Total Digunakan</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb', padding: '10px 12px' }}>{fmt(modalDetail.laporan.nominal_digunakan)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <InfoBlock label="Rincian Penggunaan" value={modalDetail.laporan.rincian} />
                                )}
                                <ExistingAttachmentsList
                                    list={modalDetail.laporan.berkas_nota_list}
                                    fallbackUrl={modalDetail.laporan.nota_url}
                                    label="Nota / Struk Bukti Belanja"
                                    onPreview={setImagePreview}
                                />
                            </ModalSection>
                        )}
                        <div className="pc-modal-footer">
                            {modalDetail.status !== 'dibatalkan' && (modalDetail.created_by === user?.id || isPettyCashCashier || isDirekturWadir) && (
                                <button
                                    className="pc-btn-primary danger"
                                    style={{ marginRight: 'auto' }}
                                    onClick={() => {
                                        const target = modalDetail;
                                        setModalDetail(null);
                                        resetError();
                                        setFormBatal({ alasan: '' });
                                        setModalBatal(target);
                                    }}
                                >
                                    <X size={15} /> Batalkan Pengajuan
                                </button>
                            )}
                            <button className="pc-btn-ghost" onClick={() => setModalDetail(null)}>Tutup</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Approval PC */}
            {modalApproval && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Proses Pengajuan</h2>
                        <div className="pc-approval-summary">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <p className="pc-approval-no">{modalApproval.no_pengajuan}</p>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalApproval.tanggal)}</span>
                            </div>
                            <p className="pc-approval-amount">{fmt(modalApproval.nominal)}</p>
                            <div className="pc-popup-applicant-block">
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalApproval.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalApproval.keperluan}
                                </div>
                                {modalApproval.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalApproval.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Saldo warning */}
                        {canSeeSaldo && saldo && (
                            <div style={{ background: saldoNominal < Number(modalApproval.nominal) ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saldoNominal < Number(modalApproval.nominal) ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                                <span style={{ fontWeight: 600, color: saldoNominal < Number(modalApproval.nominal) ? '#991b1b' : '#166534' }}>
                                    {saldoNominal < Number(modalApproval.nominal)
                                        ? `Saldo tidak mencukupi. Saldo: ${fmt(saldoNominal)}, dibutuhkan: ${fmt(modalApproval.nominal)}`
                                        : `Saldo mencukupi. Sisa setelah approve: ${fmt(saldoNominal - Number(modalApproval.nominal))}`
                                    }
                                </span>
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalForm.aksi === 'setujui' ? ' active' : ''}`} style={{ opacity: canSeeSaldo && saldoNominal < Number(modalApproval.nominal) ? .4 : 1 }}>
                                    <input type="radio" name="aksi_pc" value="setujui" checked={approvalForm.aksi === 'setujui'}
                                        disabled={canSeeSaldo && saldoNominal < Number(modalApproval.nominal)}
                                        onChange={() => setApprovalForm({ ...approvalForm, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input type="radio" name="aksi_pc" value="tolak" checked={approvalForm.aksi === 'tolak'} onChange={() => setApprovalForm({ ...approvalForm, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                </label>
                            </div>
                            {canSeeSaldo && saldoNominal < Number(modalApproval.nominal) && (
                                <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Ajukan penambahan saldo terlebih dahulu untuk menyetujui pengajuan ini.</p>
                            )}
                        </div>
                        {approvalForm.aksi === 'tolak' && <div className="pc-field"><label className="pc-label">Catatan Tolak *</label><textarea className="pc-textarea" placeholder="Alasan penolakan..." value={approvalForm.catatan_tolak} onChange={e => setApprovalForm({ ...approvalForm, catatan_tolak: e.target.value })} /></div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApproval(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${approvalForm.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalPC} disabled={saving || (approvalForm.aksi === 'setujui' && canSeeSaldo && saldoNominal < Number(modalApproval.nominal))}>
                                {saving ? 'Memproses...' : approvalForm.aksi === 'setujui' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Cairkan PC */}
            {modalCairkan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Cairkan Dana</h2>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <p style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600, margin: 0 }}>Konfirmasi pencairan dana:</p>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalCairkan.tanggal)}</span>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>{modalCairkan.no_pengajuan}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', margin: '4px 0 8px' }}>{fmt(modalCairkan.nominal)}</p>
                            <div className="pc-popup-applicant-block" style={{ borderTopColor: '#bfdbfe' }}>
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalCairkan.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalCairkan.keperluan}
                                </div>
                                {modalCairkan.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalCairkan.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Pastikan dana sudah diberikan kepada pengaju sebelum melanjutkan.</p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalCairkan(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary blue" onClick={handleCairkanPC} disabled={saving}>{saving ? 'Memproses...' : 'Konfirmasi Cairkan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Upload Laporan */}
            {modalLaporan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal xl">
                        <ModalHeader
                            icon={<FileText size={18} />}
                            title="Upload Laporan Penggunaan"
                            subtitle="Isi realisasi dana, rincian penggunaan, dan unggah nota bila ada."
                        />
                        <ModalSummary
                            label="Dana yang dicairkan"
                            value={fmt(modalLaporan.nominal)}
                            description={modalLaporan.keperluan}
                            meta={
                                <span>
                                    <strong>{modalLaporan.no_pengajuan}</strong> • Diajukan Oleh: <strong>{modalLaporan.created_by_name || '-'}</strong>
                                    {modalLaporan.keterangan ? ` • Ket: ${modalLaporan.keterangan}` : ''}
                                </span>
                            }
                        />
                        {modalLaporan.catatan_tolak && <div className="pc-rejection"><strong>Catatan penolakan laporan:</strong> {modalLaporan.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Laporan">
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Laporan (Hari Ini)</label>
                                    <DateField value={formLaporan.tanggal_laporan || todayStr()} disabled placeholder="Pilih tanggal..." />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal Nota / Pembelian *</label>
                                    <DateField value={formLaporan.tanggal_nota} onChange={tanggal_nota => setFormLaporan({ ...formLaporan, tanggal_nota })} placeholder="Pilih tanggal nota..." />
                                </div>
                            </div>

                            {/* Tabel 3 Kolom: Kategori (Akun Biaya), Deskripsi, Nilai */}
                            <div style={{ marginTop: 8 }}>
                                <label className="pc-label" style={{ marginBottom: 6 }}>
                                    Rincian Pengeluaran Belanja (Akun Biaya) <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <div className="pc-items-table-wrapper">
                                    <table className="pc-items-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '38px', textAlign: 'center' }}>No</th>
                                                <th style={{ width: '36%' }}>Kategori (Akun Biaya) <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th>Deskripsi Belanja <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th style={{ width: '160px', textAlign: 'right' }}>Nilai (Rp) <span style={{ color: '#dc2626' }}>*</span></th>
                                                <th style={{ width: '46px', textAlign: 'center' }}>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {laporanItems.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                                                    <td>
                                                        <SearchableAkunBiayaSelect
                                                            value={item.kode_akun}
                                                            onChange={(kode) => updateLaporanItem(idx, 'kode_akun', kode)}
                                                            placeholder="Pilih Akun Biaya"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="pc-input-table"
                                                            placeholder="Contoh: Kertas F4 2 rim & pulpen..."
                                                            value={item.deskripsi}
                                                            onChange={(e) => updateLaporanItem(idx, 'deskripsi', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="pc-input-table text-right"
                                                            placeholder="0"
                                                            value={item.nilai}
                                                            onChange={(e) => updateLaporanItem(idx, 'nilai', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            className="pc-btn-delete-row"
                                                            onClick={() => removeLaporanItem(idx)}
                                                            title="Hapus baris ini"
                                                            disabled={laporanItems.length === 1 && !item.kode_akun && !item.deskripsi && !item.nilai}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
                                    <button type="button" className="pc-btn-add-item" onClick={addLaporanItem}>
                                        <Plus size={14} /> Tambah Baris Pengeluaran
                                    </button>
                                </div>

                                {/* Summary Kalkulasi Otomatis */}
                                <div className="pc-report-calc-card">
                                    <div className="pc-report-calc-row">
                                        <span>Dana Awal Dicairkan:</span>
                                        <strong>{fmt(modalLaporan.nominal)}</strong>
                                    </div>
                                    <div className="pc-report-calc-row highlight">
                                        <span>Total Nilai Digunakan (Otomatis):</span>
                                        <strong style={{ color: '#2563eb', fontSize: '15px' }}>{fmt(totalLaporanItems)}</strong>
                                    </div>
                                    <div className="pc-report-calc-divider" />
                                    <div className="pc-report-calc-row">
                                        <span>Sisa Kembalian ke Kasir:</span>
                                        <strong style={{
                                            color: (Number(modalLaporan.nominal) - totalLaporanItems) >= 0 ? '#16a34a' : '#dc2626',
                                            fontSize: '16px'
                                        }}>
                                            {fmt(Number(modalLaporan.nominal) - totalLaporanItems)}
                                        </strong>
                                    </div>
                                    {totalLaporanItems > Number(modalLaporan.nominal) && (
                                        <div className="pc-report-warn">
                                            <AlertTriangle size={14} /> Total nilai digunakan melebihi dana dicairkan. Maksimal {fmt(modalLaporan.nominal)}.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran Laporan (Bisa Lebih Dari 1 Nota)">
                            <input
                                ref={notaRef}
                                type="file"
                                multiple
                                accept=".pdf,.jpg,.jpeg,.png"
                                style={{ display: 'none' }}
                                onChange={handleMultipleNotaChange}
                            />
                            <MultiAttachmentUploader
                                items={notaList}
                                onRemove={removeNotaItem}
                                onPreview={setImagePreview}
                                onPick={() => notaRef.current?.click()}
                            />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalLaporan(null); clearNotaList(); resetError(); }}>Batal</button>
                            <button
                                className="pc-btn-primary"
                                onClick={handleLaporanPC}
                                disabled={saving || notaList.length === 0 || totalLaporanItems <= 0 || totalLaporanItems > Number(modalLaporan.nominal)}
                            >
                                {saving ? 'Menyimpan...' : 'Submit Laporan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Approval Laporan Penggunaan */}
            {modalApprovalLaporan && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<Check size={18} />}
                            title="Approve Laporan Penggunaan"
                            subtitle="Review realisasi dana sebelum proses petty cash bisa dilanjutkan."
                        />
                        {modalApprovalLaporan.laporan && (
                            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                                    <div>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalApprovalLaporan.no_pengajuan}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                            <User size={13} style={{ color: '#10b981' }} />
                                            <span>Diajukan Oleh: <strong style={{ color: '#1e293b' }}>{modalApprovalLaporan.created_by_name || '-'}</strong></span>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalApprovalLaporan.tanggal)}</span>
                                </div>
                                <div style={{ fontSize: 13, color: '#334155', marginBottom: 12, lineHeight: 1.45 }}>
                                    <div><strong>Keperluan:</strong> {modalApprovalLaporan.keperluan}</div>
                                    {modalApprovalLaporan.keterangan && (
                                        <div className="pc-popup-keterangan" style={{ marginTop: 6 }}>
                                            <strong>Keterangan Pengajuan:</strong> {modalApprovalLaporan.keterangan}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={S.dk}>Tgl Laporan</p><p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalApprovalLaporan.laporan.tanggal_laporan)}</p></div>
                                    <div><p style={S.dk}>Tgl Nota / Belanja</p><p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtTgl(modalApprovalLaporan.laporan.tanggal_nota || modalApprovalLaporan.laporan.tanggal_laporan)}</p></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={S.dk}>Dana Dicairkan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalApprovalLaporan.nominal)}</p></div>
                                    <div><p style={S.dk}>Dana Digunakan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalApprovalLaporan.laporan.nominal_digunakan)}</p></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: Number(modalApprovalLaporan.laporan.selisih) > 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${Number(modalApprovalLaporan.laporan.selisih) > 0 ? '#86efac' : '#f1f5f9'}`, marginBottom: 12 }}>
                                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Selisih / Kembalian</p>
                                    <p style={{ fontSize: 20, fontWeight: 700, color: Number(modalApprovalLaporan.laporan.selisih) > 0 ? '#166534' : '#475569' }}>{fmt(modalApprovalLaporan.laporan.selisih)}</p>
                                </div>
                                {modalApprovalLaporan.laporan.items && modalApprovalLaporan.laporan.items.length > 0 ? (
                                    <div style={{ marginBottom: 14 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                            Rincian Akun Biaya Pengeluaran:
                                        </p>
                                        <div className="pc-items-table-wrapper">
                                            <table className="pc-items-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '36px', textAlign: 'center' }}>No</th>
                                                        <th style={{ width: '38%' }}>Akun Biaya</th>
                                                        <th>Deskripsi Belanja</th>
                                                        <th style={{ textAlign: 'right', width: '130px' }}>Nilai</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalApprovalLaporan.laporan.items.map((it, idx) => (
                                                        <tr key={it.id || idx}>
                                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                                            <td>
                                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.kode_akun} - {it.nama_akun}</div>
                                                                {it.pos_biaya && <div style={{ fontSize: '11px', color: '#64748b' }}>{it.pos_biaya}</div>}
                                                            </td>
                                                            <td style={{ color: '#334155' }}>{it.deskripsi}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(it.nilai)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b', padding: '10px 12px' }}>Total Digunakan</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb', padding: '10px 12px' }}>{fmt(modalApprovalLaporan.laporan.nominal_digunakan)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <InfoBlock label="Rincian Penggunaan" value={modalApprovalLaporan.laporan.rincian} />
                                )}
                                <ExistingAttachmentsList
                                    list={modalApprovalLaporan.laporan.berkas_nota_list}
                                    fallbackUrl={modalApprovalLaporan.laporan.nota_url}
                                    label="Nota / Struk Bukti Belanja"
                                    onPreview={setImagePreview}
                                />
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalLaporanForm.aksi === 'setujui' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_laporan_pc"
                                        value="setujui"
                                        checked={approvalLaporanForm.aksi === 'setujui'}
                                        onChange={() => setApprovalLaporanForm({ ...approvalLaporanForm, aksi: 'setujui' })}
                                    /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalLaporanForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="aksi_laporan_pc"
                                        value="tolak"
                                        checked={approvalLaporanForm.aksi === 'tolak'}
                                        onChange={() => setApprovalLaporanForm({ ...approvalLaporanForm, aksi: 'tolak' })}
                                    /> <X size={15} /> Tolak
                                </label>
                            </div>
                        </div>
                        {approvalLaporanForm.aksi === 'tolak' && (
                            <div className="pc-field">
                                <label className="pc-label">Catatan Tolak *</label>
                                <textarea
                                    className="pc-textarea"
                                    placeholder="Jelaskan bagian laporan yang perlu diperbaiki..."
                                    value={approvalLaporanForm.catatan_tolak}
                                    onChange={e => setApprovalLaporanForm({ ...approvalLaporanForm, catatan_tolak: e.target.value })}
                                />
                            </div>
                        )}
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
                            {approvalLaporanForm.aksi === 'setujui'
                                ? 'Setelah disetujui, laporan bisa dilanjutkan ke proses penerimaan kembalian oleh petugas kas petty cash.'
                                : 'Jika ditolak, user bisa upload laporan penggunaan ulang dari pengajuan yang sama.'}
                        </p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalLaporan(null); resetError(); }}>Batal</button>
                            <button
                                className={`pc-btn-primary${approvalLaporanForm.aksi === 'tolak' ? ' danger' : ''}`}
                                onClick={handleApprovalLaporanPC}
                                disabled={saving}
                            >
                                {saving ? 'Memproses...' : approvalLaporanForm.aksi === 'setujui' ? <><Check size={15} /> Setujui Laporan</> : <><X size={15} /> Tolak Laporan</>}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Konfirmasi Pengembalian */}
            {modalKonfirmasi && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <h2 style={S.mt}>Konfirmasi Pengembalian</h2>
                        {modalKonfirmasi.laporan && (
                            <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                                    <div>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalKonfirmasi.no_pengajuan}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                            <User size={13} style={{ color: '#10b981' }} />
                                            <span>Diajukan Oleh: <strong style={{ color: '#1e293b' }}>{modalKonfirmasi.created_by_name || '-'}</strong></span>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalKonfirmasi.tanggal)}</span>
                                </div>
                                <div style={{ fontSize: 13, color: '#334155', marginBottom: 12, lineHeight: 1.45 }}>
                                    <div><strong>Keperluan:</strong> {modalKonfirmasi.keperluan}</div>
                                    {modalKonfirmasi.keterangan && (
                                        <div className="pc-popup-keterangan" style={{ marginTop: 6 }}>
                                            <strong>Keterangan:</strong> {modalKonfirmasi.keterangan}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div><p style={S.dk}>Dana Dicairkan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalKonfirmasi.nominal)}</p></div>
                                    <div><p style={S.dk}>Dana Digunakan</p><p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{fmt(modalKonfirmasi.laporan.nominal_digunakan)}</p></div>
                                </div>
                                <div style={{ padding: '10px 14px', background: Number(modalKonfirmasi.laporan.selisih) > 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${Number(modalKonfirmasi.laporan.selisih) > 0 ? '#86efac' : '#f1f5f9'}` }}>
                                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Kembalian ke Kasir</p>
                                    <p style={{ fontSize: 20, fontWeight: 700, color: Number(modalKonfirmasi.laporan.selisih) > 0 ? '#166534' : '#475569' }}>{fmt(modalKonfirmasi.laporan.selisih)}</p>
                                </div>
                                {modalKonfirmasi.laporan.items && modalKonfirmasi.laporan.items.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                            Rincian Akun Biaya Pengeluaran:
                                        </p>
                                        <div className="pc-items-table-wrapper">
                                            <table className="pc-items-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '36px', textAlign: 'center' }}>No</th>
                                                        <th style={{ width: '38%' }}>Akun Biaya</th>
                                                        <th>Deskripsi Belanja</th>
                                                        <th style={{ textAlign: 'right', width: '130px' }}>Nilai</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalKonfirmasi.laporan.items.map((it, idx) => (
                                                        <tr key={it.id || idx}>
                                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                                            <td>
                                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.kode_akun} - {it.nama_akun}</div>
                                                                {it.pos_biaya && <div style={{ fontSize: '11px', color: '#64748b' }}>{it.pos_biaya}</div>}
                                                            </td>
                                                            <td style={{ color: '#334155' }}>{it.deskripsi}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(it.nilai)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b', padding: '10px 12px' }}>Total Digunakan</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb', padding: '10px 12px' }}>{fmt(modalKonfirmasi.laporan.nominal_digunakan)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
                            {Number(modalKonfirmasi.laporan?.selisih) > 0
                                ? 'Pastikan uang kembalian sudah diterima dari karyawan.'
                                : 'Tidak ada kembalian. Klik konfirmasi untuk menyelesaikan.'}
                        </p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalKonfirmasi(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleKonfirmasiPC} disabled={saving}>{saving ? 'Memproses...' : <><Check size={15} /> Konfirmasi Selesai</>}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Batal PC */}
            {modalBatal && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Batalkan Pengajuan</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 4, fontWeight: 600 }}>Konfirmasi pembatalan pengajuan petty cash:</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalBatal.no_pengajuan}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', margin: '4px 0 8px' }}>{fmt(modalBatal.nominal)}</p>
                            <div className="pc-popup-applicant-block" style={{ borderTopColor: '#fca5a5' }}>
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalBatal.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalBatal.keperluan}
                                </div>
                                {modalBatal.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalBatal.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field" style={{ marginBottom: 16 }}>
                            <label className="pc-label">Alasan Pembatalan <span style={{ color: '#dc2626' }}>*</span></label>
                            <textarea
                                className="pc-textarea"
                                required
                                style={{ minHeight: 80 }}
                                placeholder="Tuliskan alasan pembatalan pengajuan ini..."
                                value={formBatal.alasan}
                                onChange={(e) => setFormBatal({ alasan: e.target.value })}
                            />
                        </div>

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBatal(null); setFormBatal({ alasan: '' }); resetError(); }}>Kembali</button>
                            <button className="pc-btn-primary danger" onClick={handleBatalPC} disabled={saving || !formBatal.alasan.trim()}>
                                {saving ? 'Memproses...' : 'Ya, Batalkan Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ════ MODALS REIMBURSEMENT ════ */}

            {/* Buat / Revisi RB */}
            {(modalBuatRB || modalRevisiRB) && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title={modalRevisiRB ? `Revisi - ${modalRevisiRB.no_reimbursement}` : 'Ajukan Reimbursement'}
                            subtitle="Isi data reimbursement, nominal pengeluaran, dan bukti transaksi."
                        />
                        {modalRevisiRB?.catatan_tolak && <div className="pc-rejection"><strong>Alasan ditolak:</strong> {modalRevisiRB.catatan_tolak}</div>}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <ModalSection icon={<ClipboardList size={14} />} title="Data Pengajuan">
                            <div className="pc-field">
                                <label className="pc-label">Nama Pengaju</label>
                                <div className="pc-input-readonly">
                                    <User size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span>{modalRevisiRB ? (modalRevisiRB.created_by_name || '-') : (user?.full_name || user?.nama || user?.username || '-')}</span>
                                    {(user?.unit_nama || user?.unit?.nama) && (
                                        <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                                            {user?.unit_nama || user?.unit?.nama}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="pc-grid2">
                                <div className="pc-field">
                                    <label className="pc-label">Tanggal *</label>
                                    <DateField value={formRB.tanggal} onChange={tanggal => setFormRB({ ...formRB, tanggal })} placeholder="Pilih tanggal..." />
                                </div>
                                <div className="pc-field">
                                    <label className="pc-label">Nominal (Rp) *</label>
                                    <input className="pc-input" type="number" placeholder="0" value={formRB.nominal} onChange={e => setFormRB({ ...formRB, nominal: e.target.value })} />
                                    {Number(formRB.nominal) > 999999 && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Melebihi batas. Maksimal Rp 999.999</p>}
                                    {!formRB.nominal && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Maks. Rp 999.999</p>}
                                </div>
                            </div>
                            <div className="pc-field"><label className="pc-label">Keperluan *</label><textarea className="pc-textarea" placeholder="Jelaskan keperluan reimbursement..." value={formRB.keperluan} onChange={e => setFormRB({ ...formRB, keperluan: e.target.value })} /></div>
                            <div className="pc-field"><label className="pc-label">Keterangan <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opsional)</span></label><textarea className="pc-textarea" style={{ minHeight: 60 }} placeholder="Catatan atau keterangan tambahan (opsional)..." value={formRB.keterangan} onChange={e => setFormRB({ ...formRB, keterangan: e.target.value })} /></div>
                        </ModalSection>
                        <ModalSection icon={<Paperclip size={14} />} title="Lampiran">
                            <input ref={berkasRBRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => handleAttachmentChange(e, setBerkasRB, setBerkasRBInfo)} />
                            <FileUploadZone file={berkasRB} label="Upload Bukti Pengeluaran (wajib)" hint="PDF, JPG, atau PNG. Gambar otomatis dikompres." onPick={() => berkasRBRef.current.click()} />
                            <AttachmentPreview file={berkasRB} info={berkasRBInfo} onPreview={setImagePreview} />
                        </ModalSection>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBuatRB(false); setModalRevisiRB(null); setBerkasRB(null); setBerkasRBInfo(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={modalRevisiRB ? handleRevisiRB : handleBuatRB} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Detail RB */}
            {modalDetailRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal lg">
                        <ModalHeader
                            icon={<Receipt size={18} />}
                            title="Detail Reimbursement"
                            subtitle="Ringkasan reimbursement, status proses, dan bukti pengeluaran."
                        />
                        <ModalSummary
                            label={modalDetailRB.no_reimbursement}
                            value={fmt(modalDetailRB.nominal)}
                            description={modalDetailRB.keperluan}
                            meta={`Tanggal pengajuan ${fmtTgl(modalDetailRB.tanggal)}`}
                            side={<StatusBadge cfg={RB_STATUS} status={modalDetailRB.status} />}
                        />
                        <ModalSection icon={<User size={14} />} title="Data Pengajuan">
                            <DetailGrid items={[
                                ['No. Reimburse', modalDetailRB.no_reimbursement],
                                ['Tanggal', fmtTgl(modalDetailRB.tanggal)],
                                ['Nominal', fmt(modalDetailRB.nominal)],
                                ['Status', RB_STATUS[modalDetailRB.status]?.label],
                                ['Diajukan Oleh', modalDetailRB.created_by_name],
                                ['Disetujui Oleh', modalDetailRB.disetujui_oleh_name || '-'],
                                ['Dicairkan Oleh', modalDetailRB.dicairkan_oleh_name || '-'],
                            ]} />
                            <InfoBlock label="Keperluan" value={modalDetailRB.keperluan} />
                            {modalDetailRB.keterangan && <InfoBlock label="Keterangan" value={modalDetailRB.keterangan} />}
                            {modalDetailRB.catatan_tolak && (
                                <div className="pc-rejection">
                                    <strong>{modalDetailRB.status === 'dibatalkan' ? 'Alasan Pembatalan:' : 'Catatan Tolak:'}</strong> {modalDetailRB.catatan_tolak.replace(/^Dibatalkan:\s*/, '')}
                                </div>
                            )}
                        </ModalSection>
                        {modalDetailRB.berkas_url && (
                            <ModalSection icon={<Paperclip size={14} />} title="Lampiran Pengajuan">
                                <ExistingAttachmentPreview url={modalDetailRB.berkas_url} label="Bukti Pengeluaran" onPreview={setImagePreview} />
                            </ModalSection>
                        )}
                        <div className="pc-modal-footer">
                            {modalDetailRB.status !== 'dibatalkan' && (modalDetailRB.created_by === user?.id || isPettyCashCashier || isDirekturWadir) && (
                                <button
                                    className="pc-btn-primary danger"
                                    style={{ marginRight: 'auto' }}
                                    onClick={() => {
                                        const target = modalDetailRB;
                                        setModalDetailRB(null);
                                        resetError();
                                        setFormBatalRB({ alasan: '' });
                                        setModalBatalRB(target);
                                    }}
                                >
                                    <X size={15} /> Batalkan Reimbursement
                                </button>
                            )}
                            <button className="pc-btn-ghost" onClick={() => setModalDetailRB(null)}>Tutup</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Approval RB */}
            {modalApprovalRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Proses Reimbursement</h2>
                        <div className="pc-approval-summary">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <p className="pc-approval-no">{modalApprovalRB.no_reimbursement}</p>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalApprovalRB.tanggal)}</span>
                            </div>
                            <p className="pc-approval-amount">{fmt(modalApprovalRB.nominal)}</p>
                            <div className="pc-popup-applicant-block">
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalApprovalRB.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalApprovalRB.keperluan}
                                </div>
                                {modalApprovalRB.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalApprovalRB.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Saldo warning */}
                        {canSeeSaldo && saldo && (
                            <div style={{ background: saldoNominal < Number(modalApprovalRB.nominal) ? '#fef2f2' : '#f0fdf4', border: `1px solid ${saldoNominal < Number(modalApprovalRB.nominal) ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                                <span style={{ fontWeight: 600, color: saldoNominal < Number(modalApprovalRB.nominal) ? '#991b1b' : '#166534' }}>
                                    {saldoNominal < Number(modalApprovalRB.nominal)
                                        ? `Saldo tidak mencukupi. Saldo: ${fmt(saldoNominal)}, dibutuhkan: ${fmt(modalApprovalRB.nominal)}`
                                        : `Saldo mencukupi. Sisa setelah cairkan: ${fmt(saldoNominal - Number(modalApprovalRB.nominal))}`
                                    }
                                </span>
                            </div>
                        )}
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Keputusan</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <label className={`pc-radio-card approve${approvalRBForm.aksi === 'setujui' ? ' active' : ''}`} style={{ opacity: canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal) ? .4 : 1 }}>
                                    <input type="radio" name="aksi_rb" value="setujui" checked={approvalRBForm.aksi === 'setujui'}
                                        disabled={canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal)}
                                        onChange={() => setApprovalRBForm({ ...approvalRBForm, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                </label>
                                <label className={`pc-radio-card reject${approvalRBForm.aksi === 'tolak' ? ' active' : ''}`}>
                                    <input type="radio" name="aksi_rb" value="tolak" checked={approvalRBForm.aksi === 'tolak'} onChange={() => setApprovalRBForm({ ...approvalRBForm, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                </label>
                            </div>
                            {canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal) && (
                                <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Ajukan penambahan saldo terlebih dahulu untuk menyetujui reimbursement ini.</p>
                            )}
                        </div>
                        {approvalRBForm.aksi === 'tolak' && <div className="pc-field"><label className="pc-label">Catatan Tolak *</label><textarea className="pc-textarea" placeholder="Alasan penolakan..." value={approvalRBForm.catatan_tolak} onChange={e => setApprovalRBForm({ ...approvalRBForm, catatan_tolak: e.target.value })} /></div>}
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalRB(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${approvalRBForm.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalRB}
                                disabled={saving || (approvalRBForm.aksi === 'setujui' && canSeeSaldo && saldoNominal < Number(modalApprovalRB.nominal))}>
                                {saving ? 'Memproses...' : approvalRBForm.aksi === 'setujui' ? 'Setujui Reimbursement' : 'Tolak Reimbursement'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Cairkan RB */}
            {modalCairkanRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Cairkan Reimbursement</h2>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <p style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600, margin: 0 }}>Konfirmasi pembayaran reimbursement:</p>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTgl(modalCairkanRB.tanggal)}</span>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>{modalCairkanRB.no_reimbursement}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', margin: '4px 0 8px' }}>{fmt(modalCairkanRB.nominal)}</p>
                            <div className="pc-popup-applicant-block" style={{ borderTopColor: '#bfdbfe' }}>
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalCairkanRB.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalCairkanRB.keperluan}
                                </div>
                                {modalCairkanRB.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalCairkanRB.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Pastikan pembayaran sudah dilakukan sebelum melanjutkan.</p>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalCairkanRB(null); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary blue" onClick={handleCairkanRB} disabled={saving}>{saving ? 'Memproses...' : 'Konfirmasi Cairkan'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Batal RB */}
            {modalBatalRB && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal sm">
                        <h2 style={S.mt}>Batalkan Reimbursement</h2>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                            <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 4, fontWeight: 600 }}>Konfirmasi pembatalan reimbursement:</p>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{modalBatalRB.no_reimbursement}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', margin: '4px 0 8px' }}>{fmt(modalBatalRB.nominal)}</p>
                            <div className="pc-popup-applicant-block" style={{ borderTopColor: '#fca5a5' }}>
                                <div className="pc-popup-applicant-row">
                                    <User size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                                    <span>Diajukan Oleh: <strong>{modalBatalRB.created_by_name || '-'}</strong></span>
                                </div>
                                <div className="pc-popup-desc">
                                    <strong>Keperluan:</strong> {modalBatalRB.keperluan}
                                </div>
                                {modalBatalRB.keterangan && (
                                    <div className="pc-popup-keterangan">
                                        <strong>Keterangan:</strong> {modalBatalRB.keterangan}
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && <div className="pc-alert-err">{error}</div>}

                        <div className="pc-field" style={{ marginBottom: 16 }}>
                            <label className="pc-label">Alasan Pembatalan <span style={{ color: '#dc2626' }}>*</span></label>
                            <textarea
                                className="pc-textarea"
                                required
                                style={{ minHeight: 80 }}
                                placeholder="Tuliskan alasan pembatalan reimbursement ini..."
                                value={formBatalRB.alasan}
                                onChange={(e) => setFormBatalRB({ alasan: e.target.value })}
                            />
                        </div>

                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalBatalRB(null); setFormBatalRB({ alasan: '' }); resetError(); }}>Kembali</button>
                            <button className="pc-btn-primary danger" onClick={handleBatalRB} disabled={saving || !formBatalRB.alasan.trim()}>
                                {saving ? 'Memproses...' : 'Ya, Batalkan Reimbursement'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* ════ MODALS SALDO ════ */}

            {/* Modal Riwayat & Penambahan Saldo */}
            {modalSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-saldo-modal">
                        <div className="pc-saldo-modal-body">
                            <div className="pc-saldo-head">
                                <div className="pc-saldo-title">
                                    <span className="pc-modal-title-icon"><ClipboardList size={18} /></span>
                                    <div>
                                        <h2>Saldo Petty Cash</h2>
                                        <p>Pengajuan penambahan dan riwayat perubahan saldo.</p>
                                    </div>
                                </div>
                                <button className="pc-btn-ghost" onClick={() => setModalSaldo(false)}>Tutup</button>
                            </div>

                            <div className="pc-saldo-dashboard">
                                <div className="pc-saldo-balance">
                                    <p className="pc-saldo-balance-label">Saldo Saat Ini</p>
                                    <p className="pc-saldo-balance-value">{fmt(saldoNominal)}</p>
                                    <p className="pc-saldo-balance-note">
                                        {saldoKritis ? 'Saldo sudah di bawah batas aman.' : 'Saldo masih dalam kondisi aman.'}
                                    </p>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Menunggu</p>
                                    <p className="pc-saldo-kpi-value">{saldoStats.pending}</p>
                                    <small>Pengajuan perlu diproses</small>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Masuk</p>
                                    <p className="pc-saldo-kpi-value">{fmt(saldoTotalMasuk)}</p>
                                    <small>Dari 20 riwayat terakhir</small>
                                </div>
                                <div className="pc-saldo-kpi">
                                    <p className="pc-saldo-kpi-label">Keluar</p>
                                    <p className="pc-saldo-kpi-value">{fmt(saldoTotalKeluar)}</p>
                                    <small>Dari 20 riwayat terakhir</small>
                                </div>
                            </div>

                            <section className="pc-saldo-section">
                                <div className="pc-saldo-section-head">
                                    <div>
                                        <p className="pc-saldo-section-title"><Plus size={15} /> Pengajuan Pengisian Kembali Saldo</p>
                                        <p className="pc-saldo-section-sub">Daftar permintaan top up / pengisian kembali saldo petty cash.</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                        <span className="pc-saldo-badge pending">{saldoStats.pending} Menunggu</span>
                                        <span className="pc-saldo-badge disetujui">{saldoStats.disetujui} Disetujui</span>
                                        <span className="pc-saldo-badge ditolak">{saldoStats.ditolak} Ditolak</span>
                                    </div>
                                </div>
                                {listPenambahan.length === 0 ? (
                                    <div className="pc-saldo-empty">Belum ada pengajuan pengisian kembali saldo.</div>
                                ) : (
                                    <div className="pc-saldo-table-wrap">
                                        <table className="pc-saldo-table">
                                            <thead>
                                                <tr>
                                                    <th>No Pengajuan</th>
                                                    <th>Tanggal</th>
                                                    <th>Pemohon</th>
                                                    <th>Keterangan</th>
                                                    <th>Nominal</th>
                                                    <th>Status</th>
                                                    <th>Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {listPenambahan.map(item => (
                                                    <tr key={item.id}>
                                                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1a4731' }}>{item.no_pengajuan}</td>
                                                        <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtTgl(item.tanggal)}</td>
                                                        <td>
                                                            <div className="pc-saldo-actor">
                                                                <strong>{item.created_by_name || 'Tidak diketahui'}</strong>
                                                                <span>{item.created_by_unit || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.alasan}>{item.alasan || '-'}</td>
                                                        <td style={{ fontWeight: 800, color: '#1a4731', whiteSpace: 'nowrap' }}>{item.nominal_diajukan ? fmt(item.nominal_diajukan) : '-'}</td>
                                                        <td>
                                                            <span className={`pc-saldo-badge ${item.status || 'pending'}`}>
                                                                {penambahanStatusLabel(item.status)}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            {isDirekturWadir && item.status === 'pending' ? (
                                                                <button className="pc-btn-sm g" onClick={() => { setFormApvSaldo({ aksi: 'setujui', nominal_diajukan: item.nominal_diajukan || '', catatan_tolak: '' }); resetError(); setModalApprovalSaldo(item); }}>Proses</button>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8' }}>-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            <section className="pc-saldo-section">
                                <div className="pc-saldo-section-head">
                                    <div>
                                        <p className="pc-saldo-section-title"><History size={15} /> Riwayat Perubahan Saldo</p>
                                        <p className="pc-saldo-section-sub">Nama dan unit memakai pemohon transaksi, bukan hanya akun yang memproses.</p>
                                    </div>
                                </div>
                                {riwayatSaldo.length === 0 ? (
                                    <div className="pc-saldo-empty">Belum ada riwayat perubahan saldo.</div>
                                ) : (
                                    <div className="pc-saldo-table-wrap" style={{ maxHeight: 330 }}>
                                        <table className="pc-saldo-table">
                                            <thead>
                                                <tr>
                                                    <th>Waktu</th>
                                                    <th>Jenis</th>
                                                    <th>Jumlah</th>
                                                    <th>Nama / Unit</th>
                                                    <th>Saldo Sesudah</th>
                                                    <th>Keterangan</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagedRiwayatSaldo.map((r, i) => {
                                                    const actor = saldoActor(r);
                                                    return (
                                                        <tr key={r.id || i}>
                                                            <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDT(r.created_at)}</td>
                                                            <td>
                                                                <span className={`pc-saldo-badge ${r.jenis === 'penambahan' ? 'disetujui' : 'ditolak'}`}>
                                                                    {r.jenis === 'penambahan' ? 'Tambah' : 'Kurang'}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontWeight: 800, color: r.jenis === 'penambahan' ? '#166534' : '#dc2626', whiteSpace: 'nowrap' }}>
                                                                {r.jenis === 'penambahan' ? '+' : '-'}{fmt(r.jumlah)}
                                                            </td>
                                                            <td>
                                                                <div className="pc-saldo-actor" title={`${actor.nama}${actor.unit ? ` - ${actor.unit}` : ''}`}>
                                                                    <strong>{actor.nama}</strong>
                                                                    <span>{actor.unit || '-'}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.saldo_sesudah)}</td>
                                                            <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }} title={r.keterangan || ''}>{r.keterangan || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {riwayatSaldo.length > RIWAYAT_SALDO_PER_PAGE && (
                                    <div className="pc-pagination">
                                        <span className="pc-page-info">
                                            Menampilkan {(riwayatSaldoPage - 1) * RIWAYAT_SALDO_PER_PAGE + 1}-{Math.min(riwayatSaldoPage * RIWAYAT_SALDO_PER_PAGE, riwayatSaldo.length)} dari {riwayatSaldo.length} riwayat
                                        </span>
                                        <div className="pc-page-btns">
                                            <button className="pc-page-btn" disabled={riwayatSaldoPage === 1} onClick={() => setRiwayatSaldoPage(p => Math.max(1, p - 1))}>&lt;</button>
                                            {renderPages(riwayatSaldoPage, totalRiwayatSaldoPages, setRiwayatSaldoPage)}
                                            <button className="pc-page-btn" disabled={riwayatSaldoPage === totalRiwayatSaldoPages} onClick={() => setRiwayatSaldoPage(p => Math.min(totalRiwayatSaldoPages, p + 1))}>&gt;</button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal Ajukan Pengisian Kembali Saldo */}
            {modalAjukanSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal">
                        <h2 style={S.mt}>Pengisian Kembali Saldo</h2>
                        <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Saldo saat ini</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: saldoKritis ? '#dc2626' : '#1a4731' }}>{fmt(saldoNominal)}</p>
                            {saldoKritis && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} /> Saldo menipis</p>}
                        </div>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Isi tanggal, nominal yang dibutuhkan, dan alasan pengisian kembali saldo.</p>
                        {error && <div className="pc-alert-err">{error}</div>}
                        <div className="pc-field">
                            <label className="pc-label">Nama Pengaju</label>
                            <div className="pc-input-readonly">
                                <User size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                                <span>{user?.full_name || user?.nama || user?.username || '-'}</span>
                                {(user?.unit_nama || user?.unit?.nama) && (
                                    <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>
                                        {user?.unit_nama || user?.unit?.nama}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="pc-grid2">
                            <div className="pc-field">
                                <label className="pc-label">Tanggal *</label>
                                <DateField value={formSaldo.tanggal} onChange={tanggal => setFormSaldo({ ...formSaldo, tanggal })} placeholder="Pilih tanggal..." />
                            </div>
                            <div className="pc-field">
                                <label className="pc-label">Nominal Pengisian (Rp) *</label>
                                <input
                                    className="pc-input"
                                    type="number"
                                    placeholder="0"
                                    value={formSaldo.nominal_diajukan}
                                    onChange={e => setFormSaldo({ ...formSaldo, nominal_diajukan: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="pc-field">
                            <label className="pc-label">Keterangan *</label>
                            <textarea
                                className="pc-textarea"
                                style={{ minHeight: 90 }}
                                placeholder="Contoh: Pengisian kembali saldo petty cash periode 1 - 15 Agustus 2026..."
                                value={formSaldo.alasan}
                                onChange={e => setFormSaldo({ ...formSaldo, alasan: e.target.value })}
                            />
                        </div>
                        <div className="pc-modal-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalAjukanSaldo(false); resetError(); }}>Batal</button>
                            <button className="pc-btn-primary" onClick={handleAjukanSaldo} disabled={saving}>{saving ? 'Menyimpan...' : 'Submit Pengisian Kembali'}</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal Approval Saldo */}
            {modalApprovalSaldo && createPortal(
                <div className="pc-overlay">
                    <div className="pc-modal pc-approval-saldo">
                        <div className="pc-approval-body">
                            <div className="pc-approval-head">
                                <div className="pc-approval-title">
                                    <span className="pc-modal-title-icon"><Wallet size={18} /></span>
                                    <div>
                                        <h2>Persetujuan Pengisian Kembali Saldo</h2>
                                        <p>Review pengajuan dan pemakaian saldo sejak top up terakhir.</p>
                                    </div>
                                </div>
                                <button className="pc-btn-ghost" onClick={() => { setModalApprovalSaldo(null); resetError(); }}>Tutup</button>
                            </div>

                            <div className="pc-approval-grid">
                                <section className="pc-approval-card">
                                    <div className="pc-approval-card-head">
                                        <p className="pc-approval-card-title"><FileText size={15} /> Detail Pengajuan</p>
                                    </div>
                                    <div className="pc-approval-content">
                                        <div className="pc-approval-request">
                                            <div className="pc-approval-row">
                                                <div>
                                                    <p className="pc-approval-no">{modalApprovalSaldo.no_pengajuan}</p>
                                                    <p className="pc-approval-meta">{fmtTgl(modalApprovalSaldo.tanggal)}</p>
                                                </div>
                                                <span className="pc-saldo-badge pending">Menunggu</span>
                                            </div>
                                            <div className="pc-approval-user">
                                                <div className="pc-approval-avatar"><User size={16} /></div>
                                                <div>
                                                    <strong>{modalApprovalSaldo.created_by_name || 'Tidak diketahui'}</strong>
                                                    <span>{modalApprovalSaldo.created_by_unit || '-'}</span>
                                                </div>
                                            </div>
                                            {modalApprovalSaldo.nominal_diajukan && (
                                                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                                                    <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>Nominal Diajukan:</span>
                                                    <p style={{ fontSize: 18, fontWeight: 800, color: '#166534', margin: '2px 0 0' }}>{fmt(modalApprovalSaldo.nominal_diajukan)}</p>
                                                </div>
                                            )}
                                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Keterangan:</span>
                                                <p style={{ fontSize: 13, color: '#1e293b', margin: '3px 0 0', lineHeight: 1.5 }}>{modalApprovalSaldo.alasan || '-'}</p>
                                            </div>
                                        </div>

                                        {error && <div className="pc-alert-err">{error}</div>}

                                        <div className="pc-field">
                                            <label className="pc-label">Keputusan</label>
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <label className={`pc-radio-card approve${formApvSaldo.aksi === 'setujui' ? ' active' : ''}`}>
                                                    <input type="radio" name="aksi_saldo" value="setujui" checked={formApvSaldo.aksi === 'setujui'} onChange={() => setFormApvSaldo({ ...formApvSaldo, aksi: 'setujui' })} /> <Check size={15} /> Setujui
                                                </label>
                                                <label className={`pc-radio-card reject${formApvSaldo.aksi === 'tolak' ? ' active' : ''}`}>
                                                    <input type="radio" name="aksi_saldo" value="tolak" checked={formApvSaldo.aksi === 'tolak'} onChange={() => setFormApvSaldo({ ...formApvSaldo, aksi: 'tolak' })} /> <X size={15} /> Tolak
                                                </label>
                                            </div>
                                        </div>

                                        {formApvSaldo.aksi === 'setujui' && (
                                            <>
                                                <div className="pc-field">
                                                    <label className="pc-label">Nominal Penambahan (Rp) *</label>
                                                    <input className="pc-input" type="number" placeholder="0" value={formApvSaldo.nominal_diajukan} onChange={e => setFormApvSaldo({ ...formApvSaldo, nominal_diajukan: e.target.value })} />
                                                </div>
                                                <div className="pc-approval-result">
                                                    <strong>Simulasi saldo setelah disetujui</strong>
                                                    <p>{fmt(approvalSaldoAfter)}</p>
                                                    <span style={{ display: 'block', fontSize: 12, color: '#819189', marginTop: 6 }}>Saldo saat ini {fmt(saldoNominal)}</span>
                                                </div>
                                            </>
                                        )}

                                        {formApvSaldo.aksi === 'tolak' && (
                                            <div className="pc-field">
                                                <label className="pc-label">Catatan Tolak *</label>
                                                <textarea className="pc-textarea" placeholder="Alasan penolakan..." value={formApvSaldo.catatan_tolak} onChange={e => setFormApvSaldo({ ...formApvSaldo, catatan_tolak: e.target.value })} />
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="pc-approval-card">
                                    <div className="pc-approval-card-head">
                                        <p className="pc-approval-card-title"><History size={15} /> Pemakaian Sejak Top Up Terakhir</p>
                                        <p className="pc-saldo-section-sub">
                                            {modalApprovalSaldo.riwayat_snapshot_start
                                                ? `Sejak ${fmtDT(modalApprovalSaldo.riwayat_snapshot_start)}`
                                                : 'Belum ada penambahan saldo sebelumnya'}
                                        </p>
                                    </div>
                                    <div className="pc-usage-summary">
                                        <div className="pc-usage-kpi"><span>Transaksi</span><strong>{modalApprovalSaldo.riwayat_snapshot?.length || 0}</strong></div>
                                        <div className="pc-usage-kpi"><span>Total Terpakai</span><strong>{fmt(approvalUsageTotal)}</strong></div>
                                        <div className="pc-usage-kpi"><span>Saldo Saat Ini</span><strong>{fmt(saldoNominal)}</strong></div>
                                    </div>

                                    {!modalApprovalSaldo.riwayat_snapshot?.length ? (
                                        <div className="pc-saldo-empty">Belum ada pemakaian saldo sejak top up terakhir.</div>
                                    ) : (
                                        <div className="pc-usage-table-wrap">
                                            <table className="pc-usage-table">
                                                <thead>
                                                    <tr>
                                                        <th>Waktu</th>
                                                        <th>Pemohon</th>
                                                        <th>Jumlah</th>
                                                        <th>Saldo Sesudah</th>
                                                        <th>Keterangan</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modalApprovalSaldo.riwayat_snapshot.map((r, i) => {
                                                        const actor = saldoActor(r);
                                                        return (
                                                            <tr key={r.id || i}>
                                                                <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDT(r.created_at)}</td>
                                                                <td>
                                                                    <div className="pc-saldo-actor" title={`${actor.nama}${actor.unit ? ` - ${actor.unit}` : ''}`}>
                                                                        <strong>{actor.nama}</strong>
                                                                        <span>{actor.unit || '-'}</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>-{fmt(r.jumlah)}</td>
                                                                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.saldo_sesudah)}</td>
                                                                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }} title={r.keterangan || ''}>{r.keterangan || '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>

                        <div className="pc-approval-footer">
                            <button className="pc-btn-ghost" onClick={() => { setModalApprovalSaldo(null); resetError(); }}>Batal</button>
                            <button className={`pc-btn-primary${formApvSaldo.aksi === 'tolak' ? ' danger' : ''}`} onClick={handleApprovalSaldo} disabled={saving}>
                                {saving ? 'Memproses...' : formApvSaldo.aksi === 'setujui' ? 'Setujui & Tambah Saldo' : 'Tolak Pengajuan'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}
            {imagePreview && createPortal(
                <div
                    className="pc-overlay"
                    onClick={() => setImagePreview(null)}
                    style={{ zIndex: 10005, backdropFilter: 'blur(6px)', background: 'rgba(15, 23, 42, 0.78)', padding: '20px' }}
                >
                    <div
                        style={{
                            position: 'relative',
                            width: 'min(95vw, 1000px)',
                            maxHeight: '92vh',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0f172a',
                            borderRadius: '16px',
                            padding: '16px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            const rawUrl = typeof imagePreview === 'object' && imagePreview !== null ? imagePreview.url : imagePreview;
                            const title = typeof imagePreview === 'object' && imagePreview !== null ? imagePreview.name : 'Preview Berkas';
                            const fullUrl = resolveMediaUrl(rawUrl);
                            const isPdf = Boolean(
                                (title && title.toLowerCase().endsWith('.pdf')) ||
                                (rawUrl && rawUrl.toLowerCase().includes('.pdf')) ||
                                (typeof imagePreview === 'object' && imagePreview?.file?.type === 'application/pdf')
                            );

                            return (
                                <>
                                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
                                            {title}
                                        </span>
                                        <button
                                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={() => setImagePreview(null)}
                                            title="Tutup"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div style={{ width: '100%', maxHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                                        {isPdf ? (
                                            <iframe
                                                src={fullUrl}
                                                title={title}
                                                style={{ width: '100%', height: '74vh', border: 'none', borderRadius: 8, background: '#fff' }}
                                            />
                                        ) : (
                                            <img
                                                src={fullUrl}
                                                alt={title}
                                                style={{ maxWidth: '100%', maxHeight: '74vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: '8px' }}
                                            />
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                                        <a
                                            href={fullUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', borderRadius: '8px', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
                                        >
                                            Buka di Tab Baru
                                        </a>
                                        <button
                                            style={{ padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => setImagePreview(null)}
                                        >
                                            Tutup Preview
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function isImageFile(file) {
    return file?.type?.startsWith('image/');
}

function isImageUrl(url) {
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url || '');
}

function FileUploadZone({ file, label, hint, onPick }) {
    return (
        <div className={`pc-file-zone${file ? ' has' : ''}`}>
            <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: file ? '#166534' : '#475569', marginBottom: 2 }}>
                    {file ? file.name : label}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</p>
            </div>
            <span className="pc-file-pick" onClick={onPick}>{file ? 'Ganti' : 'Pilih File'}</span>
        </div>
    );
}

function ModalHeader({ icon, title, subtitle }) {
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

function ModalSummary({ label, value, description, meta, side }) {
    return (
        <div className="pc-modal-summary">
            <div>
                <p className="pc-modal-summary-label">{label}</p>
                <p className="pc-modal-summary-value">{value}</p>
                {description && <p className="pc-modal-summary-desc">{description}</p>}
                {meta && <p className="pc-modal-summary-meta">{meta}</p>}
            </div>
            {side}
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

function AttachmentPreview({ file, info, onPreview }) {
    const [url, setUrl] = useState('');

    useEffect(() => {
        if (!file || !isImageFile(file)) {
            setUrl('');
            return undefined;
        }
        const objUrl = URL.createObjectURL(file);
        setUrl(objUrl);
        return () => {
            URL.revokeObjectURL(objUrl);
        };
    }, [file]);

    if (!file) return null;

    return (
        <div className="pc-upload-preview">
            {url ? (
                <img className="pc-upload-thumb" src={url} alt={file.name} onClick={() => onPreview({ url, name: info?.name || file.name, file })} />
            ) : (
                <div className="pc-upload-doc"><Paperclip size={20} /></div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{info?.name || file.name}</p>
                <p className="pc-upload-info">
                    {info?.compressed
                        ? `${info.originalSize} -> ${info.compressedSize} (${info.reduction}% lebih kecil)`
                        : `${formatFileSize(file.size)} - tidak dikompres`}
                </p>
            </div>
            {url && <button className="pc-btn-sm n" type="button" onClick={() => onPreview({ url, name: info?.name || file.name, file })}>Preview</button>}
        </div>
    );
}

function MultiAttachmentItemPreview({ item, onRemove, onPreview }) {
    const isImage = isImageFile(item?.file) || isImageUrl(item?.name || item?.url);
    const displayUrl = item?.url;

    return (
        <div className="pc-upload-preview" style={{ marginBottom: 0 }}>
            {isImage && displayUrl ? (
                <img
                    className="pc-upload-thumb"
                    src={displayUrl}
                    alt={item.name}
                    onClick={() => onPreview({ url: displayUrl, name: item.name, file: item.file })}
                />
            ) : (
                <div
                    className="pc-upload-doc"
                    onClick={() => displayUrl && onPreview({ url: displayUrl, name: item.name, file: item.file })}
                    style={{ cursor: displayUrl ? 'pointer' : 'default' }}
                >
                    <Paperclip size={20} />
                </div>
            )}
            <div className="pc-upload-meta">
                <p className="pc-upload-name">{item.name}</p>
                <p className="pc-upload-info">
                    {item.compressed
                        ? `${item.originalSize} -> ${item.compressedSize} (${item.reduction}% lebih kecil)`
                        : `${item.originalSize} - tidak dikompres`}
                </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {displayUrl && (
                    <button
                        className="pc-btn-sm n"
                        type="button"
                        onClick={() => onPreview({ url: displayUrl, name: item.name, file: item.file })}
                    >
                        Preview
                    </button>
                )}
                <button
                    className="pc-btn-sm r"
                    type="button"
                    onClick={onRemove}
                    title="Hapus file ini"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function MultiAttachmentUploader({ items, onRemove, onPreview, onPick }) {
    return (
        <div>
            <div className="pc-file-zone" onClick={onPick} style={{ cursor: 'pointer' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: items.length > 0 ? '#166534' : '#475569', marginBottom: 2 }}>
                        {items.length > 0 ? `${items.length} file nota / struk dipilih` : 'Upload Nota / Struk Bukti Belanja (Wajib) *'}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>
                        Bisa pilih lebih dari 1 file nota (PDF, JPG, PNG). Gambar otomatis dikompres.
                    </p>
                </div>
                <span className="pc-file-pick">
                    {items.length > 0 ? '+ Tambah Nota' : 'Pilih File'}
                </span>
            </div>

            {items.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((it, idx) => (
                        <MultiAttachmentItemPreview
                            key={idx}
                            item={it}
                            onRemove={() => onRemove(idx)}
                            onPreview={onPreview}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ExistingAttachmentsList({ list, fallbackUrl, label = 'Nota / Struk', onPreview }) {
    const items = (list && list.length > 0)
        ? list
        : (fallbackUrl ? [{ id: 'main', url: fallbackUrl, name: label }] : []);

    if (items.length === 0) return null;

    return (
        <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {label} ({items.length} berkas)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((item, idx) => (
                    <ExistingAttachmentPreview
                        key={item.id || idx}
                        url={item.url}
                        label={item.name ? `${item.name}` : `${label} #${idx + 1}`}
                        onPreview={onPreview}
                    />
                ))}
            </div>
        </div>
    );
}

function ExistingAttachmentPreview({ url, label, onPreview }) {
    if (!url) return null;
    const fullUrl = resolveMediaUrl(url);
    if (isImageUrl(fullUrl)) {
        return (
            <div className="pc-upload-preview">
                <img className="pc-upload-thumb" src={fullUrl} alt={label} onClick={() => onPreview({ url: fullUrl, name: label })} />
                <div className="pc-upload-meta">
                    <p className="pc-upload-name">{label}</p>
                    <p className="pc-upload-info">Klik preview untuk melihat berkas tanpa membuka tab baru.</p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="pc-btn-sm n" type="button" onClick={() => onPreview({ url: fullUrl, name: label })}>Preview</button>
                    <a href={fullUrl} target="_blank" rel="noreferrer" className="pc-btn-sm n" title="Buka di tab baru">Buka File</a>
                </div>
            </div>
        );
    }
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <a href={fullUrl} target="_blank" rel="noreferrer" className="pc-form-link" style={{ margin: 0 }}>
                <Paperclip size={15} /> Lihat {label}
            </a>
            <button className="pc-btn-sm n" type="button" onClick={() => onPreview({ url: fullUrl, name: label })}>Preview</button>
        </div>
    );
}

function StatusBadge({ cfg, status }) {
    const s = cfg[status] || { label: status, bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.color, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}
        </span>
    );
}

function InfoBlock({ label, value }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.6 }}>{value}</p>
        </div>
    );
}

const S = {
    mt: { fontSize: 18, fontWeight: 700, color: '#1a2e1a', marginBottom: 24 },
    dk: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
    dv: { fontSize: 14, color: '#1e293b', fontWeight: 500 },
};
