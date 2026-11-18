import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import DateRangePicker from '../../components/DateRangePicker';
import DateField from '../../components/DateField';
import {
  LogOut,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Filter,
  Download,
  Search,
  Plus,
  History,
  Building2,
  RefreshCw,
  X,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  Check,
  Network,
  Edit3,
  Users,
  ChevronRight,
  XCircle,
  AlertCircle
} from 'lucide-react';
import './IzinMeninggalkanKerja.css';
import './PresensiPegawai.css';
import OrgTreeChart from './OrgTreeChart';
import SdmPagination from './SdmPagination';
import { SimplePagination } from '../../utils/pagination.jsx';

const KATEGORI_CONFIG = {
  dinas: { label: 'Dinas Luar', class: 'dinas' },
  pribadi: { label: 'Urusan Pribadi', class: 'pribadi' },
  sakit: { label: 'Sakit / Berobat', class: 'sakit' },
};

const STATUS_CONFIG = {
  menunggu_approval: { label: 'Menunggu Persetujuan', class: 'menunggu_approval' },
  disetujui: { label: 'Disetujui', class: 'disetujui' },
  ditolak: { label: 'Ditolak', class: 'ditolak' },
  berjalan: { label: 'Sedang di Luar', class: 'berjalan' },
  selesai: { label: 'Sudah Kembali', class: 'selesai' },
  dibatalkan: { label: 'Dibatalkan', class: 'dibatalkan' },
};

export default function IzinMeninggalkanKerja() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data states
  const [izinSaya, setIzinSaya] = useState([]);
  const [approvalData, setApprovalData] = useState([]);
  const [rekapData, setRekapData] = useState([]);
  const [stats, setStats] = useState(null);
  const [units, setUnits] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Pagination states
  const [sayaPage, setSayaPage] = useState(1);
  const [sayaPageSize, setSayaPageSize] = useState(10);
  const [apprPage, setApprPage] = useState(1);
  const [apprPageSize, setApprPageSize] = useState(10);
  const [rekapIzinPage, setRekapIzinPage] = useState(1);
  const [rekapIzinPageSize, setRekapIzinPageSize] = useState(15);

  // Hak Approval & Akses SDM
  const isApprover = useMemo(() => {
    return Boolean(
      user?.is_superuser ||
      user?.is_sdm ||
      ['kepala_seksi', 'manajer', 'wakil_direktur', 'direktur'].includes(user?.role) ||
      stats?.is_approver
    );
  }, [user, stats?.is_approver]);

  const hasSdmAccess = Boolean(
    user?.is_superuser ||
    user?.is_sdm ||
    ['direktur', 'wakil_direktur'].includes(user?.role)
  );

  // Tab internal untuk halaman Pengajuan Izin (/sdm/izin-kerja & /sdm/approval)
  const [innerTab, setInnerTab] = useState(() => {
    if (location.pathname === '/sdm/approval') return 'approval';
    const tabParam = searchParams.get('tab');
    if (tabParam === 'approval') return 'approval';
    return 'saya';
  });

  // Sinkronisasi jika parameter URL berubah
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'approval' && isApprover) {
      setInnerTab('approval');
    } else if (tabParam === 'saya') {
      setInnerTab('saya');
    }
  }, [searchParams, isApprover]);

  // Tab efektif yang aktif
  const activeTab = useMemo(() => {
    // Jika tidak memiliki akses SDM, jangan tampilkan rekap atau struktur
    if (location.pathname === '/sdm/rekapitulasi') return hasSdmAccess ? 'rekap' : 'saya';
    if (location.pathname === '/sdm/struktur') return hasSdmAccess ? 'struktur' : 'saya';
    // Khusus user biasa yang TIDAK memiliki hak approval, tab switcher disembunyikan dan selalu ke 'saya'
    if (!isApprover) return 'saya';
    if (location.pathname === '/sdm/approval') return 'approval';
    return innerTab;
  }, [location.pathname, hasSdmAccess, isApprover, innerTab]);

  const handleTabChange = (targetTab) => {
    setInnerTab(targetTab);
    if (location.pathname === '/sdm/izin-kerja' || location.pathname === '/sdm/approval') {
      setSearchParams(targetTab === 'approval' ? { tab: 'approval' } : {}, { replace: true });
    }
  };

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [logsModalItem, setLogsModalItem] = useState(null);

  // Approval Modals
  const [approveModalItem, setApproveModalItem] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Unit Organization Modal
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitModalItem, setUnitModalItem] = useState(null);
  const [unitForm, setUnitForm] = useState({
    nama: '',
    kategori: 'unit',
    parent: '',
    kepala_unit: '',
    is_active: true,
  });

  // Form states
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentTimeStr = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  const [createForm, setCreateForm] = useState({
    tanggal: todayStr,
    kategori: 'dinas',
    jam_keluar: currentTimeStr,
    jam_kembali: '',
    keperluan: '',
  });

  const [adjustForm, setAdjustForm] = useState({
    jam_keluar: '',
    jam_kembali: '',
    alasan_penyesuaian: '',
  });

  const [returnForm, setReturnForm] = useState({
    jam_kembali_aktual: '',
    catatan_kembali: '',
  });

  // Filter states for SDM tab
  const [filters, setFilters] = useState({
    unit: '',
    kategori: '',
    status: '',
    start_date: '',
    end_date: '',
    search: '',
    adjusted: false,
  });

  const showToast = (msg, isError = false) => {
    if (isError) {
      toast.error(msg);
    } else {
      toast.success(msg);
    }
  };

  // Fetch Personal Permits
  const fetchPersonalPermits = useCallback(async () => {
    try {
      const res = await api.get('/sdm/izin-keluar/?mine=1');
      setIzinSaya(res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data izin saya:', err);
    }
  }, []);

  // Fetch Team Approval Queue
  const fetchApprovalData = useCallback(async () => {
    try {
      const res = await api.get('/sdm/izin-keluar/?need_approval=1');
      setApprovalData(res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data antrean persetujuan:', err);
    }
  }, []);

  // Fetch SDM Recap Data
  const fetchRekapData = useCallback(async () => {
    if (!hasSdmAccess) return;
    try {
      const params = new URLSearchParams();
      if (filters.unit) params.append('unit', filters.unit);
      if (filters.kategori) params.append('kategori', filters.kategori);
      if (filters.status) params.append('status', filters.status);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.search) params.append('search', filters.search);
      if (filters.adjusted) params.append('adjusted', '1');

      const res = await api.get(`/sdm/izin-keluar/?${params.toString()}`);
      setRekapData(res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data rekap SDM:', err);
    }
  }, [hasSdmAccess, filters]);

  // Fetch Statistics
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/sdm/izin-keluar/statistik/');
      setStats(res.data || null);
    } catch (err) {
      console.error('Gagal mengambil statistik SDM:', err);
    }
  }, []);

  // Fetch Units
  const fetchUnits = useCallback(async () => {
    try {
      const res = await api.get('/users/units/');
      const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setUnits(list);
    } catch (err) {
      console.error('Gagal mengambil daftar unit:', err);
    }
  }, []);

  // Fetch Users for Leader Assignment
  const fetchAllUsers = useCallback(async () => {
    if (!hasSdmAccess) return;
    try {
      const res = await api.get('/users/?page_size=200');
      const list = res.data?.results ? res.data.results : res.data;
      setAllUsers(list || []);
    } catch (err) {
      console.error('Gagal mengambil daftar user:', err);
    }
  }, [hasSdmAccess]);

  // Initial Load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPersonalPermits(),
      fetchStats(),
      fetchUnits(),
      isApprover ? fetchApprovalData() : Promise.resolve(),
      hasSdmAccess ? fetchRekapData() : Promise.resolve(),
      hasSdmAccess ? fetchAllUsers() : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [fetchPersonalPermits, fetchStats, fetchUnits, fetchApprovalData, fetchRekapData, fetchAllUsers, hasSdmAccess, isApprover]);

  const formatTanggalIndo = (tglStr) => {
    if (!tglStr) return '-';
    try {
      const [y, m, d] = tglStr.split('-');
      const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${d} ${bulan[parseInt(m, 10) - 1]} ${y}`;
    } catch {
      return tglStr;
    }
  };

  // Handle Create Permit
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.jam_keluar || !createForm.jam_kembali) {
      return showToast('Jam keluar dan jam kembali rencana wajib diisi.', true);
    }
    if (!createForm.keperluan.trim()) {
      return showToast('Keperluan izin wajib diisi secara jelas.', true);
    }

    setActionLoading(true);
    try {
      await api.post('/sdm/izin-keluar/', createForm);
      showToast('Izin meninggalkan tempat kerja berhasil diajukan dan diteruskan ke atasan.');
      setShowCreateModal(false);
      setCreateForm({
        tanggal: todayStr,
        kategori: 'dinas',
        jam_keluar: currentTimeStr,
        jam_kembali: '',
        keperluan: '',
      });
      fetchPersonalPermits();
      fetchStats();
      if (isApprover) fetchApprovalData();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.jam_kembali || err.response?.data?.detail || 'Gagal menyimpan izin.';
      showToast(Array.isArray(msg) ? msg[0] : msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Approve Permit (Single Approval)
  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveModalItem) return;
    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${approveModalItem.id}/approve/`, {
        catatan_approval: approveNotes,
      });
      showToast(`Izin untuk ${approveModalItem.nama_lengkap || 'staf'} berhasil disetujui.`);
      setApproveModalItem(null);
      setApproveNotes('');
      fetchApprovalData();
      fetchPersonalPermits();
      fetchStats();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Gagal menyetujui izin.';
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Permit
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectReason.trim()) {
      return showToast('Wajib mengisi alasan penolakan izin.', true);
    }
    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${rejectModalItem.id}/reject/`, {
        catatan_approval: rejectReason.trim(),
      });
      showToast(`Izin untuk ${rejectModalItem.nama_lengkap || 'staf'} telah ditolak.`);
      setRejectModalItem(null);
      setRejectReason('');
      fetchApprovalData();
      fetchPersonalPermits();
      fetchStats();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Gagal menolak izin.';
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Adjust Modal
  const openAdjustModal = (item) => {
    setAdjustModalItem(item);
    setAdjustForm({
      jam_keluar: item.jam_keluar || '',
      jam_kembali: item.jam_kembali || '',
      alasan_penyesuaian: '',
    });
  };

  // Handle Adjust Submit
  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    const alasan = (adjustForm.alasan_penyesuaian || '').trim();
    if (!alasan) {
      return showToast('Wajib mengisi alasan penyesuaian jam.', true);
    }

    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${adjustModalItem.id}/sesuaikan-jam/`, adjustForm);
      showToast('Penyesuaian jam berhasil disimpan dan dicatat ke log.');
      setAdjustModalItem(null);
      fetchPersonalPermits();
      fetchStats();
      if (isApprover) fetchApprovalData();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Gagal menyesuaikan jam.';
      if (data) {
        if (typeof data === 'string') {
          msg = data;
        } else if (data.error) {
          msg = data.error;
        } else if (data.jam_kembali) {
          msg = Array.isArray(data.jam_kembali) ? data.jam_kembali[0] : data.jam_kembali;
        } else if (data.detail) {
          msg = data.detail;
        }
      }
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Return Modal
  const openReturnModal = (item) => {
    setReturnModalItem(item);
    setReturnForm({
      jam_kembali_aktual: currentTimeStr,
      catatan_kembali: '',
    });
  };

  // Handle Return Submit
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${returnModalItem.id}/konfirmasi-kembali/`, returnForm);
      showToast('Konfirmasi kepulangan berhasil dicatat. Status izin selesai.');
      setReturnModalItem(null);
      fetchPersonalPermits();
      fetchStats();
      if (isApprover) fetchApprovalData();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Gagal konfirmasi kepulangan.';
      if (data) {
        if (typeof data === 'string') {
          msg = data;
        } else if (data.error) {
          msg = data.error;
        } else if (data.detail) {
          msg = data.detail;
        }
      }
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel Permit
  const handleCancelPermit = async (item) => {
    if (!window.confirm('Apakah Anda yakin ingin membatalkan izin keluar ini?')) return;
    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${item.id}/batalkan/`);
      showToast('Izin keluar berhasil dibatalkan.');
      fetchPersonalPermits();
      fetchStats();
      if (isApprover) fetchApprovalData();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Gagal membatalkan izin.';
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Save / Edit Unit Organisasi
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.nama.trim()) return showToast('Nama unit / bagian wajib diisi.', true);

    setActionLoading(true);
    try {
      const payload = {
        nama: unitForm.nama.trim(),
        kategori: unitForm.kategori,
        parent: unitForm.parent ? Number(unitForm.parent) : null,
        kepala_unit: unitForm.kepala_unit ? Number(unitForm.kepala_unit) : null,
        is_active: unitForm.is_active,
      };

      if (unitModalItem) {
        await api.patch(`/users/units/${unitModalItem.id}/`, payload);
        showToast(`Unit ${payload.nama} berhasil diperbarui.`);
      } else {
        await api.post('/users/units/', payload);
        showToast(`Unit ${payload.nama} berhasil ditambahkan.`);
      }
      setShowUnitModal(false);
      setUnitModalItem(null);
      fetchUnits();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Gagal menyimpan unit organisasi.';
      if (data) {
        if (data.error) msg = data.error;
        else if (data.nama) msg = Array.isArray(data.nama) ? data.nama[0] : data.nama;
      }
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Unit Modal for Create or Edit
  const openUnitModal = (item = null, defaultParentId = null) => {
    setUnitModalItem(item);
    if (item) {
      setUnitForm({
        nama: item.nama || '',
        kategori: item.kategori || 'unit',
        parent: item.parent || '',
        kepala_unit: item.kepala_unit || '',
        is_active: item.is_active ?? true,
      });
    } else {
      let defaultKategori = 'unit';
      if (defaultParentId) {
        const parentUnit = units.find((u) => u.id === Number(defaultParentId));
        if (parentUnit) {
          if (parentUnit.kategori === 'direktorat') defaultKategori = 'bidang';
          else if (parentUnit.kategori === 'bidang') defaultKategori = 'seksi';
          else if (parentUnit.kategori === 'seksi') defaultKategori = 'unit';
        }
      }
      setUnitForm({
        nama: '',
        kategori: defaultKategori,
        parent: defaultParentId ? String(defaultParentId) : '',
        kepala_unit: '',
        is_active: true,
      });
    }
    setShowUnitModal(true);
  };

  // Handle Excel Export (SDM & Direksi)
  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.unit) params.append('unit', filters.unit);
      if (filters.kategori) params.append('kategori', filters.kategori);
      if (filters.status) params.append('status', filters.status);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.search) params.append('search', filters.search);
      if (filters.adjusted) params.append('adjusted', '1');

      const res = await api.get(`/sdm/izin-keluar/export-excel/?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Rekap_Izin_Keluar_${todayStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('File Excel rekapitulasi izin berhasil diunduh.');
    } catch (err) {
      console.error('Gagal export excel:', err);
      showToast('Gagal mengunduh file Excel.', true);
    }
  };

  const heroInfo = useMemo(() => {
    switch (activeTab) {
      case 'approval':
        return {
          title: 'Persetujuan Pengajuan Izin',
          subtitle: 'Daftar pengajuan izin meninggalkan kerja bawahan & staf yang memerlukan persetujuan (*Single Approval*)',
          Icon: UserCheck,
        };
      case 'rekap':
        return {
          title: 'Dashboard Izin Meninggalkan Tempat Kerja',
          subtitle: 'Monitoring menyeluruh seluruh izin keluar pegawai, kepatuhan jam kerja, dan laporan rekapitulasi',
          Icon: Building2,
        };
      case 'struktur':
        return {
          title: 'Struktur Organisasi & Unit Kerja',
          subtitle: 'Bagan hierarki unit kerja rumah sakit, pejabat struktural, dan pemetaan penanggung jawab (*approver*)',
          Icon: Network,
        };
      default:
        return {
          title: hasSdmAccess ? 'Pengajuan Izin Meninggalkan Tempat Kerja' : 'Izin Meninggalkan Tempat Kerja',
          subtitle: 'Pengajuan dan riwayat izin meninggalkan tempat kerja sementara pada jam dinas',
          Icon: LogOut,
        };
    }
  }, [activeTab]);

  return (
    <div className="sdm-wrapper imtk-stripe-page">
      {/* ════════════════ HERO HEADER (STRIPE CLEAN) ════════════════ */}
      <div className="sdm-hero imtk-hero">
        <div className="sdm-hero-main">
          <div className="sdm-title imtk-title">
            <div>
              <h1>{heroInfo.title}</h1>
              <p>{heroInfo.subtitle}</p>
            </div>
          </div>
          <div className="sdm-hero-actions">
            <button
              type="button"
              className="imtk-btn primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={15} />
              <span>Ajukan Izin Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab Switcher: HANYA DITAMPILKAN JIKA USER MEMILIKI HAK APPROVAL ── */}
      {isApprover && (location.pathname === '/sdm/izin-kerja' || location.pathname === '/sdm/approval' || location.pathname === '/sdm/pengajuan-izin') && (
        <div className="sdm-tabs" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={`sdm-tab-btn ${activeTab === 'saya' ? 'active' : ''}`}
            onClick={() => handleTabChange('saya')}
          >
            <LogOut size={15} />
            <span>Izin Saya</span>
          </button>
          <button
            type="button"
            className={`sdm-tab-btn ${activeTab === 'approval' ? 'active' : ''}`}
            onClick={() => handleTabChange('approval')}
          >
            <UserCheck size={15} />
            <span>Persetujuan Izin</span>
            {stats?.need_approval_count > 0 && (
              <span className="sdm-tab-badge danger">
                {stats.need_approval_count}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ════════════════ TAB 1: IZIN SAYA ════════════════ */}
      {activeTab === 'saya' && (
        <>
          {/* History Table Izin Saya */}
          <section className="imtk-table-section">
            <div className="imtk-table-header">
              <div>
                <h3 className="imtk-table-title">Riwayat Izin Keluar Saya</h3>
                <p className="imtk-table-desc">Daftar semua izin meninggalkan tempat kerja yang pernah Anda ajukan</p>
              </div>
              <button
                type="button"
                className="imtk-btn secondary"
                onClick={fetchPersonalPermits}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'imtk-spin' : ''} />
                <span>Segarkan</span>
              </button>
            </div>

            <div className="imtk-table-wrap">
              <table className="imtk-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Keperluan</th>
                    <th>Rencana Jam</th>
                    <th>Jam Aktif</th>
                    <th>Kembali Riil</th>
                    <th>Status</th>
                    <th>Persetujuan Atasan</th>
                    <th>Penyesuaian</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {izinSaya.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="imtk-table-empty">
                        <div className="imtk-empty-inner">
                          <FileText size={28} strokeWidth={1.5} className="imtk-icon-muted" />
                          <span>Belum ada riwayat izin keluar yang tercatat.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    izinSaya.slice((sayaPage - 1) * sayaPageSize, sayaPage * sayaPageSize).map((item) => {
                      const dotColor =
                        item.status === 'menunggu_approval'
                          ? '#f59e0b'
                          : item.status === 'ditolak' || item.status === 'dibatalkan'
                            ? '#f43f5e'
                            : '#10b981';

                      return (
                        <tr key={item.id}>
                          <td className="imtk-tabular">
                            <strong>{item.tanggal}</strong>
                          </td>
                          <td>{item.kategori_label}</td>
                          <td style={{ maxWidth: '240px' }}>{item.keperluan}</td>
                          <td className="imtk-tabular imtk-muted">
                            {item.jam_keluar_awal?.slice(0, 5)} – {item.jam_kembali_awal?.slice(0, 5)}
                          </td>
                          <td className="imtk-tabular">
                            <strong>
                              {item.jam_keluar?.slice(0, 5)} – {item.jam_kembali?.slice(0, 5)}
                            </strong>
                          </td>
                          <td className="imtk-tabular">
                            {item.jam_kembali_aktual ? (
                              <span style={{ color: '#10b981', fontWeight: 600 }}>
                                {item.jam_kembali_aktual.slice(0, 5)}
                              </span>
                            ) : (
                              <span className="imtk-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="imtk-status-text">
                              <span className="imtk-dot" style={{ background: dotColor }} />
                              <span>{item.status_label}</span>
                            </span>
                          </td>
                          <td>
                            {item.approved_by_nama ? (
                              <div style={{ fontSize: '12.5px' }}>
                                <strong style={{ color: '#10b981', display: 'block' }}>{item.approved_by_nama}</strong>
                                {item.catatan_approval && (
                                  <span className="imtk-muted" style={{ fontStyle: 'italic', fontSize: '11.5px' }}>
                                    "{item.catatan_approval}"
                                  </span>
                                )}
                              </div>
                            ) : item.status === 'ditolak' ? (
                              <div style={{ fontSize: '12.5px', color: '#f43f5e' }}>
                                <strong>Ditolak:</strong> {item.catatan_approval || '-'}
                              </div>
                            ) : item.status === 'menunggu_approval' ? (
                              <span style={{ color: '#f59e0b', fontSize: '12.5px', fontWeight: 500 }}>
                                Menunggu atasan
                              </span>
                            ) : (
                              <span className="imtk-muted">—</span>
                            )}
                          </td>
                          <td>
                            {item.is_adjusted ? (
                              <button
                                type="button"
                                className="imtk-link-btn"
                                onClick={() => setLogsModalItem(item)}
                                title="Klik untuk melihat riwayat perubahan"
                              >
                                <History size={12} />
                                <span>{item.logs?.length || 1}x Diubah</span>
                              </button>
                            ) : (
                              <span className="imtk-muted" style={{ fontSize: '12px' }}>Sesuai Rencana</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'flex-end' }}>
                              {item.status === 'menunggu_approval' ? (
                                <button
                                  type="button"
                                  className="imtk-row-btn danger"
                                  onClick={() => handleCancelPermit(item)}
                                >
                                  Batalkan
                                </button>
                              ) : item.status === 'disetujui' || item.status === 'berjalan' ? (
                                <>
                                  <button
                                    type="button"
                                    className="imtk-row-btn success"
                                    onClick={() => openReturnModal(item)}
                                  >
                                    Kembali
                                  </button>
                                  <button
                                    type="button"
                                    className="imtk-row-btn"
                                    onClick={() => openAdjustModal(item)}
                                  >
                                    Sesuaikan
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="imtk-row-btn"
                                  onClick={() => setLogsModalItem(item)}
                                  title="Lihat detail jejak audit"
                                >
                                  <History size={13} />
                                  <span>Detail</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {izinSaya.length > 0 && (
              <SimplePagination
                className="imtk-pagination"
                page={sayaPage}
                totalCount={izinSaya.length}
                pageSize={sayaPageSize}
                onPageChange={setSayaPage}
                onPageSizeChange={(n) => { setSayaPageSize(n); setSayaPage(1); }}
              />
            )}
          </section>
        </>
      )}

      {/* ════════════════ TAB 2: PERSETUJUAN (SINGLE APPROVAL) ════════════════ */}
      {activeTab === 'approval' && isApprover && (
        <div className="sdm-table-section">
          <div className="sdm-table-header">
            <div>
              <h3 className="sdm-table-title">Antrean Persetujuan Pengajuan Izin</h3>
              <p className="sdm-table-desc">
                Persetujuan tunggal (*Single Approval*) untuk staf di bawah unit kerja atau hierarki Anda. Cukup satu kali disetujui untuk mengesahkan izin.
              </p>
            </div>
            <button
              type="button"
              className="sdm-btn-outline"
              onClick={fetchApprovalData}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <span>Segarkan Antrean</span>
            </button>
          </div>

          <div className="sdm-table-responsive">
            <table className="sdm-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>No</th>
                  <th>Pegawai</th>
                  <th>Tanggal</th>
                  <th>Kategori</th>
                  <th>Keperluan</th>
                  <th>Rencana Jam</th>
                  <th>Atasan Berwenang</th>
                  <th style={{ textAlign: 'center', width: 170 }}>Aksi Persetujuan</th>
                </tr>
              </thead>
              <tbody>
                {approvalData.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="sdm-empty-state">
                        <CheckCircle2 size={40} color="#10b981" />
                        <h4 style={{ margin: '8px 0 2px', fontWeight: 800 }}>Semua Pengajuan Sudah Disetujui</h4>
                        <p>Tidak ada pengajuan izin yang menunggu persetujuan Anda saat ini.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  approvalData.slice((apprPage - 1) * apprPageSize, apprPage * apprPageSize).map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--sdm-muted, #94a3b8)', fontSize: '0.8rem' }} className="imtk-tabular">{(apprPage - 1) * apprPageSize + idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="sdm-avatar-neutral">
                            {item.foto ? (
                              <img src={item.foto} alt={item.nama_lengkap} />
                            ) : (
                              item.nama_lengkap?.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <strong style={{ display: 'block', fontSize: '13px' }}>
                              {item.nama_lengkap}
                            </strong>
                            <span className="imtk-muted" style={{ fontSize: '11.5px' }}>
                              {item.unit_nama || '-'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="imtk-tabular">
                        <strong>{formatTanggalIndo(item.tanggal)}</strong>
                      </td>
                      <td>
                        <span className="sdm-status-inline">
                          <span
                            className={`sdm-dot ${
                              item.kategori === 'dinas'
                                ? 'is-indigo'
                                : item.kategori === 'sakit'
                                  ? 'is-red'
                                  : 'is-amber'
                            }`}
                          />
                          <span>{item.kategori_label}</span>
                        </span>
                      </td>
                      <td style={{ maxWidth: 260 }}>{item.keperluan}</td>
                      <td>
                        <strong>
                          {item.jam_keluar?.slice(0, 5)} - {item.jam_kembali?.slice(0, 5)}
                        </strong>
                      </td>
                      <td>
                        <div className="sdm-approvers-preview">
                          {item.approvers_list && item.approvers_list.length > 0 ? (
                            item.approvers_list.map((ap) => (
                              <span key={ap.id} className="sdm-approver-chip" title={ap.role}>
                                {ap.nama}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>-</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="sdm-btn-approve"
                            onClick={() => {
                              setApproveModalItem(item);
                              setApproveNotes('');
                            }}
                          >
                            <Check size={14} />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            className="sdm-btn-reject"
                            onClick={() => {
                              setRejectModalItem(item);
                              setRejectReason('');
                            }}
                          >
                            <X size={14} />
                            <span>Tolak</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <SdmPagination
            totalItems={approvalData.length}
            currentPage={apprPage}
            pageSize={apprPageSize}
            onPageChange={setApprPage}
            onPageSizeChange={setApprPageSize}
            label="antrean approval"
          />
        </div>
      )}

      {/* ════════════════ TAB 3: REKAPITULASI SDM & DIREKSI ════════════════ */}
      {activeTab === 'rekap' && hasSdmAccess && (
        <>
          {/* Flat KPI Stat-Bar */}
          <div className="sdm-stat-bar sdm-stat-bar-4">
            <div className="sdm-stat-item">
              <span className="sdm-stat-lbl">Menunggu Approval</span>
              <span className="sdm-stat-val is-amber">
                {stats?.today_menunggu_approval ?? 0}
              </span>
            </div>

            <div className="sdm-stat-item">
              <span className="sdm-stat-lbl">Sedang di Luar Hari Ini</span>
              <span className="sdm-stat-val is-red">
                {stats?.today_sedang_keluar ?? 0}
              </span>
            </div>

            <div className="sdm-stat-item">
              <span className="sdm-stat-lbl">Sudah Kembali Hari Ini</span>
              <span className="sdm-stat-val is-green">
                {stats?.today_sudah_kembali ?? 0}
              </span>
            </div>

            <div className="sdm-stat-item">
              <span className="sdm-stat-lbl">Total Izin Bulan Ini</span>
              <span className="sdm-stat-val">{stats?.month_total ?? 0}</span>
            </div>
          </div>

          {/* Table Rekapitulasi SDM */}
          <div className="sdm-table-section">
            <div className="sdm-table-header">
              <div>
                <h3 className="sdm-table-title">Monitoring & Rekapitulasi Izin Karyawan</h3>
                <p className="sdm-table-desc">
                  Seluruh data pengajuan izin keluar pegawai rumah sakit, persetujuan atasan, dan kepatuhan waktu
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={handleExportExcel}
                >
                  <Download size={14} />
                  <span>Unduh Excel</span>
                </button>
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={fetchRekapData}
                  disabled={loading}
                >
                  <RefreshCw size={14} />
                  <span>Segarkan</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="sdm-filter-bar">
              <div className="sdm-filter-item">
                <label>Unit Kerja</label>
                <select
                  className="sdm-select-sm"
                  value={filters.unit}
                  onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
                >
                  <option value="">Semua Unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sdm-filter-item">
                <label>Kategori</label>
                <select
                  className="sdm-select-sm"
                  value={filters.kategori}
                  onChange={(e) => setFilters({ ...filters, kategori: e.target.value })}
                >
                  <option value="">Semua Kategori</option>
                  <option value="dinas">Dinas Luar</option>
                  <option value="pribadi">Urusan Pribadi</option>
                  <option value="sakit">Sakit / Berobat</option>
                </select>
              </div>

              <div className="sdm-filter-item">
                <label>Status</label>
                <select
                  className="sdm-select-sm"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">Semua Status</option>
                  <option value="menunggu_approval">Menunggu Persetujuan</option>
                  <option value="disetujui">Disetujui</option>
                  <option value="berjalan">Sedang di Luar</option>
                  <option value="selesai">Sudah Kembali</option>
                  <option value="ditolak">Ditolak</option>
                  <option value="dibatalkan">Dibatalkan</option>
                </select>
              </div>

              <div className="sdm-filter-item" style={{ minWidth: 260 }}>
                <label>Rentang Tanggal</label>
                <DateRangePicker
                  dari={filters.start_date}
                  sampai={filters.end_date}
                  onChange={({ dari, sampai }) =>
                    setFilters({ ...filters, start_date: dari, end_date: sampai })
                  }
                  placeholder="Pilih Periode Tanggal"
                />
              </div>

              <div className="sdm-filter-item search">
                <label>Pencarian</label>
                <div className="sdm-search-input-wrap">
                  <Search size={14} className="sdm-search-icon" />
                  <input
                    type="text"
                    className="sdm-input-search"
                    placeholder="Nama pegawai, keperluan..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="sdm-table-responsive">
              <table className="sdm-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>No</th>
                    <th>Pegawai</th>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Keperluan</th>
                    <th>Jam Rencana</th>
                    <th>Jam Aktif</th>
                    <th>Kembali Riil</th>
                    <th>Status</th>
                    <th>Approver</th>
                    <th>Histori Jam</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rekapData.length === 0 ? (
                    <tr>
                      <td colSpan={12}>
                        <div className="sdm-empty-state">
                          <FileText size={36} />
                          <p>Tidak ada data izin yang sesuai dengan filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rekapData.slice((rekapIzinPage - 1) * rekapIzinPageSize, rekapIzinPage * rekapIzinPageSize).map((item, idx) => (
                      <tr key={item.id}>
                        <td className="imtk-muted imtk-tabular" style={{ fontSize: '12px' }}>{(rekapIzinPage - 1) * rekapIzinPageSize + idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="sdm-avatar-neutral">
                              {item.foto ? (
                                <img src={item.foto} alt={item.nama_lengkap} />
                              ) : (
                                item.nama_lengkap?.slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <strong style={{ display: 'block', fontSize: '13px' }}>
                                {item.nama_lengkap}
                              </strong>
                              <span className="imtk-muted" style={{ fontSize: '11.5px' }}>
                                {item.unit_nama || '-'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="imtk-tabular">
                          <strong>{item.tanggal}</strong>
                        </td>
                        <td>
                          <span className="sdm-status-inline">
                            <span
                              className={`sdm-dot ${
                                item.kategori === 'dinas'
                                  ? 'is-indigo'
                                  : item.kategori === 'sakit'
                                    ? 'is-red'
                                    : 'is-amber'
                              }`}
                            />
                            <span>{item.kategori_label}</span>
                          </span>
                        </td>
                        <td style={{ maxWidth: 220 }}>{item.keperluan}</td>
                        <td className="imtk-tabular">
                          <span className="imtk-muted" style={{ fontSize: '12px' }}>
                            {item.jam_keluar_awal?.slice(0, 5)} - {item.jam_kembali_awal?.slice(0, 5)}
                          </span>
                        </td>
                        <td className="imtk-tabular">
                          <strong>
                            {item.jam_keluar?.slice(0, 5)} - {item.jam_kembali?.slice(0, 5)}
                          </strong>
                        </td>
                        <td className="imtk-tabular">
                          {item.jam_kembali_aktual ? (
                            <span style={{ color: '#10b981', fontWeight: 600 }}>
                              {item.jam_kembali_aktual.slice(0, 5)}
                            </span>
                          ) : (
                            <span className="imtk-muted">-</span>
                          )}
                        </td>
                        <td>
                          <span className="sdm-status-inline">
                            <span
                              className={`sdm-dot ${
                                item.status === 'menunggu_approval'
                                  ? 'is-amber'
                                  : item.status === 'ditolak' || item.status === 'dibatalkan'
                                    ? 'is-red'
                                    : 'is-green'
                              }`}
                            />
                            <span>{item.status_label}</span>
                          </span>
                        </td>
                        <td>
                          {item.approved_by_nama ? (
                            <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
                              {item.approved_by_nama}
                            </span>
                          ) : item.status === 'ditolak' ? (
                            <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>
                              Ditolak: {item.catatan_approval || '-'}
                            </span>
                          ) : item.status === 'menunggu_approval' ? (
                            <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 650 }}>
                              Menunggu
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          {item.is_adjusted ? (
                            <button
                              className="sdm-adjusted-badge"
                              onClick={() => setLogsModalItem(item)}
                              title="Klik untuk melihat riwayat perubahan"
                            >
                              <History size={12} />
                              <span>{item.logs?.length || 1}x Diubah</span>
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sesuai Rencana</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="sdm-btn-outline"
                            onClick={() => setLogsModalItem(item)}
                            title="Lihat jejak audit"
                          >
                            <History size={14} />
                            <span>Audit Log</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <SdmPagination
              totalItems={rekapData.length}
              currentPage={rekapIzinPage}
              pageSize={rekapIzinPageSize}
              onPageChange={setRekapIzinPage}
              onPageSizeChange={setRekapIzinPageSize}
              label="data izin"
            />
          </div>
        </>
      )}

      {/* ════════════════ TAB 4: STRUKTUR ORGANISASI ════════════════ */}
      {activeTab === 'struktur' && (
        <div className="sdm-table-section sdm-org-section">
          <div className="sdm-org-header">
            <div>
              <h3 className="sdm-table-title">Bagan Pohon Struktur Organisasi & Penanggung Jawab Unit</h3>
              <p className="sdm-table-desc">
                Hierarki unit kerja rumah sakit dan pejabat penyetuju (*approver*). Alur persetujuan izin otomatis mengikuti bagan pohon ini.
              </p>
            </div>
          </div>

          <OrgTreeChart
            units={units}
            onEditUnit={openUnitModal}
            onAddSubUnit={(parentId) => openUnitModal(null, parentId)}
            onAddRootUnit={() => openUnitModal(null)}
            hasSdmAccess={hasSdmAccess}
            onRefresh={fetchUnits}
            loading={loading}
          />
        </div>
      )}

      {/* ════════════════ MODALS ════════════════ */}

      {/* ── MODAL 1: FORM AJUKAN IZIN KELUAR ── */}
      {showCreateModal && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Ajukan Izin Meninggalkan Kerja</h3>
              <button className="sdm-modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="sdm-modal-body">
                <div className="sdm-form-group">
                  <label className="sdm-label">Tanggal Izin</label>
                  <DateField
                    value={createForm.tanggal}
                    onChange={(val) => setCreateForm({ ...createForm, tanggal: val })}
                    placeholder="Pilih Tanggal Izin"
                  />
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Kategori Izin</label>
                  <select
                    className="sdm-select"
                    value={createForm.kategori}
                    onChange={(e) => setCreateForm({ ...createForm, kategori: e.target.value })}
                  >
                    <option value="dinas">Dinas Luar / Tugas Kantor</option>
                    <option value="pribadi">Urusan Pribadi Mendesak</option>
                    <option value="sakit">Sakit / Berobat Sementara</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Rencana Jam Keluar</label>
                    <input
                      type="time"
                      className="sdm-input"
                      value={createForm.jam_keluar}
                      onChange={(e) => setCreateForm({ ...createForm, jam_keluar: e.target.value })}
                      required
                    />
                  </div>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Rencana Jam Kembali</label>
                    <input
                      type="time"
                      className="sdm-input"
                      value={createForm.jam_kembali}
                      onChange={(e) => setCreateForm({ ...createForm, jam_kembali: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Keperluan / Keterangan</label>
                  <textarea
                    rows={3}
                    className="sdm-input"
                    placeholder="Contoh: Mengantar berkas akreditasi ke Dinas Kesehatan, urusan bank, dll."
                    value={createForm.keperluan}
                    onChange={(e) => setCreateForm({ ...createForm, keperluan: e.target.value })}
                    required
                  />
                  <span className="sdm-helper-note">
                    Pengajuan akan otomatis diteruskan ke atasan struktural unit Anda untuk persetujuan (*single approval*).
                  </span>
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Menyimpan...' : 'Kirim Pengajuan Izin'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 2: SESUAIKAN JAM KERJA ── */}
      {adjustModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setAdjustModalItem(null)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Sesuaikan Jam Keluar / Kembali</h3>
              <button className="sdm-modal-close" onClick={() => setAdjustModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit}>
              <div className="sdm-modal-body">
                <div className="sdm-modal-info-box">
                  <div className="sdm-modal-info-lbl">Rencana Jam Semula:</div>
                  <strong className="sdm-modal-info-val">
                    {adjustModalItem.jam_keluar?.slice(0, 5)} – {adjustModalItem.jam_kembali?.slice(0, 5)}
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Jam Keluar Baru</label>
                    <input
                      type="time"
                      className="sdm-input"
                      value={adjustForm.jam_keluar}
                      onChange={(e) => setAdjustForm({ ...adjustForm, jam_keluar: e.target.value })}
                      required
                    />
                  </div>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Jam Kembali Baru</label>
                    <input
                      type="time"
                      className="sdm-input"
                      value={adjustForm.jam_kembali}
                      onChange={(e) => setAdjustForm({ ...adjustForm, jam_kembali: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Alasan Penyesuaian</label>
                  <textarea
                    rows={3}
                    className="sdm-input"
                    placeholder="Contoh: Terjebak antrean di Dinas, rapat diperpanjang oleh mitra kerja..."
                    value={adjustForm.alasan_penyesuaian}
                    onChange={(e) => setAdjustForm({ ...adjustForm, alasan_penyesuaian: e.target.value })}
                    required
                  />
                  <span className="sdm-helper-note">
                    Alasan ini wajib diisi dan akan dicatat secara transparan pada log audit kepegawaian.
                  </span>
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setAdjustModalItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Penyesuaian'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 3: KONFIRMASI KEPULANGAN ── */}
      {returnModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setReturnModalItem(null)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Konfirmasi Sudah Kembali ke Kantor</h3>
              <button className="sdm-modal-close" onClick={() => setReturnModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="sdm-modal-body">
                <div className="sdm-modal-info-box">
                  <div className="sdm-modal-info-lbl">Keperluan Izin:</div>
                  <strong className="sdm-modal-info-val">{returnModalItem.keperluan}</strong>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                    Rencana kembali: <strong>{returnModalItem.jam_kembali?.slice(0, 5)}</strong>
                  </div>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Jam Kembali Aktual</label>
                  <input
                    type="time"
                    className="sdm-input"
                    value={returnForm.jam_kembali_aktual}
                    onChange={(e) => setReturnForm({ ...returnForm, jam_kembali_aktual: e.target.value })}
                    required
                  />
                  <span className="sdm-helper-note">Waktu saat ini otomatis terisi. Sesuaikan jika Anda sudah tiba lebih awal.</span>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Catatan Tambahan (Opsional)</label>
                  <textarea
                    rows={2}
                    className="sdm-input"
                    placeholder="Contoh: Tugas luar selesai sesuai rencana..."
                    value={returnForm.catatan_kembali}
                    onChange={(e) => setReturnForm({ ...returnForm, catatan_kembali: e.target.value })}
                  />
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setReturnModalItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Menyimpan...' : 'Saya Sudah di Kantor'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 4: AUDIT TRAIL / RIWAYAT PERUBAHAN JAM ── */}
      {logsModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setLogsModalItem(null)}>
          <div className="sdm-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Jejak Audit Penyesuaian Jam</h3>
              <button className="sdm-modal-close" onClick={() => setLogsModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="sdm-modal-body">
              <div className="sdm-modal-info-box">
                <div className="sdm-modal-info-lbl">Pegawai:</div>
                <strong className="sdm-modal-info-val">{logsModalItem.nama_lengkap || logsModalItem.username}</strong>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                  Unit: <strong>{logsModalItem.unit_nama || '-'}</strong> | Tanggal: <strong>{logsModalItem.tanggal}</strong>
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: 6 }}>
                  Rencana Awal:{' '}
                  <span className="imtk-tabular" style={{ fontWeight: 700, color: '#635bff' }}>
                    {logsModalItem.jam_keluar_awal?.slice(0, 5)} - {logsModalItem.jam_kembali_awal?.slice(0, 5)}
                  </span>
                </div>
              </div>

              <h4 style={{ margin: '14px 0 8px', fontSize: '0.9rem', fontWeight: 600 }}>Kronologi Perubahan:</h4>

              {logsModalItem.logs && logsModalItem.logs.length > 0 ? (
                <div className="sdm-timeline">
                  {logsModalItem.logs.map((lg) => (
                    <div className="sdm-timeline-item" key={lg.id}>
                      <span className="sdm-timeline-dot" />
                      <div className="sdm-timeline-time">
                        {new Date(lg.created_at).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}  • Oleh: {lg.created_by_name}
                      </div>
                      <div className="sdm-timeline-card">
                        <div className="imtk-tabular" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <span className="imtk-muted">
                            {lg.jam_keluar_sebelum?.slice(0, 5)} - {lg.jam_kembali_sebelum?.slice(0, 5)}
                          </span>
                          <ArrowRight size={14} className="imtk-muted" />
                          <span style={{ color: '#635bff' }}>
                            {lg.jam_keluar_sesudah?.slice(0, 5)} - {lg.jam_kembali_sesudah?.slice(0, 5)}
                          </span>
                        </div>
                        <div className="imtk-muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>
                          <strong>Alasan:</strong> "{lg.alasan_penyesuaian}"
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sdm-empty-state" style={{ padding: '20px 0' }}>
                  <CheckCircle2 size={32} color="#10b981" />
                  <p>Tidak ada penyesuaian jam pada izin ini. Waktu tetap sesuai rencana awal.</p>
                </div>
              )}
            </div>
            <div className="sdm-modal-foot">
              <button
                type="button"
                className="sdm-btn-primary"
                onClick={() => setLogsModalItem(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 5: PERSETUJUAN (APPROVE) ── */}
      {approveModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setApproveModalItem(null)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Setujui Izin Meninggalkan Kerja</h3>
              <button className="sdm-modal-close" onClick={() => setApproveModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleApproveSubmit}>
              <div className="sdm-modal-body">
                <div className="sdm-modal-info-box success">
                  <div className="sdm-modal-info-lbl">Pegawai:</div>
                  <strong className="sdm-modal-info-val">{approveModalItem.nama_lengkap}</strong>
                  <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    Unit: <strong>{approveModalItem.unit_nama}</strong> | Kategori: <strong>{approveModalItem.kategori_label}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: 6 }}>
                    Waktu: <strong>{approveModalItem.jam_keluar?.slice(0, 5)} – {approveModalItem.jam_kembali?.slice(0, 5)}</strong> ({formatTanggalIndo(approveModalItem.tanggal)})
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.88rem' }}>
                    <strong>Keperluan:</strong> "{approveModalItem.keperluan}"
                  </div>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Catatan / Dispensasi Penyetuju (Opsional)</label>
                  <textarea
                    rows={2}
                    className="sdm-input"
                    placeholder="Contoh: Disetujui, harap kembali sebelum briefing sore..."
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                  />
                  <span className="sdm-helper-note">
                    Sebagai perwakilan atasan (*Single Approval*), izin ini akan langsung dinyatakan sah begitu Anda menyetujuinya.
                  </span>
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setApproveModalItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Memproses...' : 'Setujui Izin'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 6: TOLAK IZIN (REJECT) ── */}
      {rejectModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setRejectModalItem(null)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title" style={{ color: '#dc2626' }}>Tolak Pengajuan Izin</h3>
              <button className="sdm-modal-close" onClick={() => setRejectModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="sdm-modal-body">
                <div className="sdm-modal-info-box danger">
                  <div className="sdm-modal-info-lbl">Pegawai:</div>
                  <strong className="sdm-modal-info-val">{rejectModalItem.nama_lengkap}</strong>
                  <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    Unit: <strong>{rejectModalItem.unit_nama}</strong> | Waktu: <strong>{rejectModalItem.jam_keluar?.slice(0, 5)} – {rejectModalItem.jam_kembali?.slice(0, 5)}</strong>
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
                    Keperluan: "{rejectModalItem.keperluan}"
                  </div>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Alasan Penolakan (Wajib Diisi)</label>
                  <textarea
                    rows={3}
                    className="sdm-input"
                    placeholder="Contoh: Ada rapat mendesak internal unit, sedang jam sibuk pelayanan..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                  />
                  <span className="sdm-helper-note">
                    Alasan ini akan disampaikan kepada pegawai agar mereka memahami pertimbangan penolakan.
                  </span>
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setRejectModalItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  style={{ background: '#ef4444' }}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Memproses...' : 'Tolak Izin'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 7: KELOLA STRUKTUR ORGANISASI (UNIT) ── */}
      {showUnitModal && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setShowUnitModal(false)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">
                {unitModalItem ? 'Edit Unit & Penanggung Jawab' : 'Tambah Unit / Bidang Baru'}
              </h3>
              <button className="sdm-modal-close" onClick={() => setShowUnitModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveUnit}>
              <div className="sdm-modal-body">
                <div className="sdm-form-group">
                  <label className="sdm-label">Nama Bagian / Unit Kerja</label>
                  <input
                    type="text"
                    className="sdm-input"
                    placeholder="Contoh: Bidang Pelayanan Medis, Unit Farmasi, Seksi Logistik"
                    value={unitForm.nama}
                    onChange={(e) => setUnitForm({ ...unitForm, nama: e.target.value })}
                    required
                  />
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Tingkatan / Level Jabatan</label>
                  <select
                    className="sdm-select"
                    value={unitForm.kategori}
                    onChange={(e) => setUnitForm({ ...unitForm, kategori: e.target.value })}
                  >
                    <option value="direksi">Direksi / Direktur Utama</option>
                    <option value="direktorat">Direktorat / Wadir</option>
                    <option value="bidang">Bidang / Bagian (Tingkat Manajer)</option>
                    <option value="seksi">Seksi / Sub-Bagian (Tingkat Kasi)</option>
                    <option value="unit">Unit / Instalasi Pelaksana</option>
                  </select>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Unit Induk (Parent Organization)</label>
                  <select
                    className="sdm-select"
                    value={unitForm.parent}
                    onChange={(e) => setUnitForm({ ...unitForm, parent: e.target.value })}
                  >
                    <option value="">(Tanpa Induk / Tingkat Tertinggi Direksi)</option>
                    {units
                      .filter((u) => !unitModalItem || u.id !== unitModalItem.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nama} ({u.kategori_label || u.kategori})
                        </option>
                      ))}
                  </select>
                  <span className="sdm-helper-note">
                    Jika atasan langsung kosong, approval akan otomatis dieskalasi ke unit induk ini.
                  </span>
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Kepala / Pejabat Penanggung Jawab</label>
                  <select
                    className="sdm-select"
                    value={unitForm.kepala_unit}
                    onChange={(e) => setUnitForm({ ...unitForm, kepala_unit: e.target.value })}
                  >
                    <option value="">(Kosongkan jika belum ada pejabat definitif)</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username} ({u.role_label || u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sdm-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    id="unit_active_check"
                    checked={unitForm.is_active}
                    onChange={(e) => setUnitForm({ ...unitForm, is_active: e.target.checked })}
                  />
                  <label htmlFor="unit_active_check" style={{ fontSize: '0.88rem', fontWeight: 650, cursor: 'pointer' }}>
                    Status Unit Aktif
                  </label>
                </div>
              </div>
              <div className="sdm-modal-foot">
                <button
                  type="button"
                  className="sdm-btn-outline"
                  onClick={() => setShowUnitModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sdm-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Data Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
