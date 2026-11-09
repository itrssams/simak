import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/axiosConfig';
import {
  Fingerprint,
  RefreshCw,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Filter,
  Link as LinkIcon,
  Unlink,
  Server,
  Zap,
  Activity,
  UserCheck,
  Building2,
  X,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Plus,
  Edit2,
  Trash2,
  Moon,
  Sun,
  Tag,
  Send,
  ArrowLeftRight,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import './PresensiPegawai.css';
import './IzinMeninggalkanKerja.css';
import RosterDinasGrid from './RosterDinasGrid';
import TukarDinasView from './TukarDinasView';
import EvaluasiDisiplinView from './EvaluasiDisiplinView';
import KartuAbsensiView from './KartuAbsensiView';
import RekapUnitView from './RekapUnitView';
import SdmPagination from './SdmPagination';
import DateField from '../../components/DateField';

export default function PresensiPegawai() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Access rights
  const hasSdmAccess = Boolean(user?.is_superuser || user?.is_sdm || ['direktur', 'wakil_direktur'].includes(user?.role));

  // State Date & Filters - Default ke '2026-10-02' (data aktif hasil rekonsiliasi engine & roster)
  const [selectedDate, setSelectedDate] = useState('2026-10-02');
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Data State
  const [mesinList, setMesinList] = useState([]);
  const [mesin, setMesin] = useState(null);
  const [presensiList, setPresensiList] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingConn, setTestingConn] = useState(null);

  // Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [mappingSearch, setMappingSearch] = useState('');
  const [simakUsers, setSimakUsers] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Raw Log Modal State
  const [selectedEmployeeLog, setSelectedEmployeeLog] = useState(null);
  const [rawLogs, setRawLogs] = useState([]);
  const [rawLogsLoading, setRawLogsLoading] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const normalizedInitialTab = tabFromUrl === 'tukar_dinas' ? 'tukar' : (tabFromUrl || 'rekap');

  // Sub-View Tabs: 'rekap' | 'raw_logs' | 'pegawai' | 'shift' | 'roster' | 'tukar'
  const [activeViewTab, setActiveViewTab] = useState(normalizedInitialTab);

  // Sinkronisasi saat tab URL berubah (misal diklik dari SDM Sidebar)
  useEffect(() => {
    if (tabFromUrl) {
      const mapped = tabFromUrl === 'tukar_dinas' ? 'tukar' : tabFromUrl;
      setActiveViewTab(mapped);
      if (mapped === 'raw_logs') fetchRealtimeLogs();
      else if (mapped === 'pegawai') fetchPegawaiList();
      else if (mapped === 'shift') fetchShiftList();
    }
  }, [tabFromUrl]);

  const handleSwitchTab = (newTab) => {
    setActiveViewTab(newTab);
    const urlParam = newTab === 'tukar' ? 'tukar_dinas' : newTab;
    setSearchParams(urlParam === 'rekap' ? {} : { tab: urlParam }, { replace: true });
    if (newTab === 'raw_logs') fetchRealtimeLogs();
    else if (newTab === 'pegawai') fetchPegawaiList();
    else if (newTab === 'shift') fetchShiftList();
  };

  // Realtime Logs State
  const [realtimeLogs, setRealtimeLogs] = useState([]);
  const [realtimeLogsLoading, setRealtimeLogsLoading] = useState(false);
  const [logPeriodFilter, setLogPeriodFilter] = useState('hari_ini'); // 'hari_ini' | 'bulan_ini' | 'semua' | 'custom'
  const [logMachineFilter, setLogMachineFilter] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Direktori Pegawai RS State
  const [pegawaiList, setPegawaiList] = useState([]);
  const [pegawaiLoading, setPegawaiLoading] = useState(false);
  const [pegawaiKategoriFilter, setPegawaiKategoriFilter] = useState('');
  const [pegawaiTelegramFilter, setPegawaiTelegramFilter] = useState('');
  const [pegawaiSearchQuery, setPegawaiSearchQuery] = useState('');
  const [testingTelegramId, setTestingTelegramId] = useState(null);

  // Master Shift State
  const [shiftList, setShiftList] = useState([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftKelompokFilter, setShiftKelompokFilter] = useState('');
  const [shiftSearchQuery, setShiftSearchQuery] = useState('');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftFormData, setShiftFormData] = useState({
    kode: '',
    nama: '',
    kelompok: 'UMUM',
    is_libur: false,
    jam_masuk: '07:30',
    jam_pulang: '14:30',
    is_overnight: false,
    toleransi_terlambat_menit: 15,
    toleransi_pulang_cepat_menit: 0,
    warna: '#10b981',
    keterangan: '',
    is_active: true
  });

  // Pagination States
  const [rekapPage, setRekapPage] = useState(1);
  const [rekapPageSize, setRekapPageSize] = useState(15);

  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(15);

  const [pegawaiPage, setPegawaiPage] = useState(1);
  const [pegawaiPageSize, setPegawaiPageSize] = useState(15);

  const [shiftPage, setShiftPage] = useState(1);
  const [shiftPageSize, setShiftPageSize] = useState(15);

  const [mappingPage, setMappingPage] = useState(1);
  const [mappingPageSize, setMappingPageSize] = useState(15);

  // Reset halaman ke 1 saat filter berubah
  useEffect(() => { setRekapPage(1); }, [selectedDate, statusFilter, searchQuery]);
  useEffect(() => { setLogPage(1); }, [selectedDate, logPeriodFilter, logMachineFilter, logSearchQuery]);
  useEffect(() => { setPegawaiPage(1); }, [pegawaiKategoriFilter, pegawaiTelegramFilter, pegawaiSearchQuery]);
  useEffect(() => { setShiftPage(1); }, [shiftKelompokFilter, shiftSearchQuery]);
  useEffect(() => { setMappingPage(1); }, [mappingSearch]);

  // Fetch Mesin Info
  const fetchMesin = useCallback(async () => {
    try {
      const res = await api.get('/sdm/mesin/');
      const rawData = res.data?.results || res.data || [];
      // Filter hanya mesin absensi nyata RS (bukan ZKTeco dummy)
      const data = rawData.filter(
        (m) => !String(m.nama || '').toLowerCase().includes('zkteco') && m.ip_address !== '192.168.1.201'
      );
      setMesinList(data);
      if (data.length > 0) {
        setMesin(data[0]);
      }
    } catch (err) {
      console.error('Gagal mengambil data mesin absen:', err);
    }
  }, []);

  const [recalculating, setRecalculating] = useState(false);

  // Fetch Dashboard Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/sdm/presensi/dashboard_stat/', { params: { tanggal: selectedDate } });
      setStats(res.data);
    } catch (err) {
      console.error('Gagal mengambil statistik presensi:', err);
    }
  }, [selectedDate]);

  // Handle Recalculate Engine (Jalankan Attendance Engine untuk mencocokkan tap & roster)
  const handleRecalculateEngine = async () => {
    setRecalculating(true);
    try {
      const res = await api.post('/sdm/presensi/recalculate/', { tanggal: selectedDate });
      const d = res.data;
      showToast(`Kalkulasi selesai! ${d.total_processed || 0} presensi dihitung ulang.`, 'success');
      fetchPresensi();
      fetchStats();
    } catch (err) {
      console.error('Gagal hitung ulang engine:', err);
      showToast('Gagal menjalankan engine presensi.', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  // Live Realtime Auto-Update States
  const [isLiveActive, setIsLiveActive] = useState(true);

  // Fetch Presensi List (SIMAK Rekapitulasi)
  const fetchPresensi = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const params = { tanggal: selectedDate };
      if (unitFilter) params.unit_id = unitFilter;
      if (statusFilter) params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;

      const res = await api.get('/sdm/presensi/', { params });
      setPresensiList(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data presensi:', err);
      if (!isBackground) showToast('Gagal memuat data presensi harian.', 'error');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [selectedDate, unitFilter, statusFilter, searchQuery, showToast]);

  // Fetch Realtime Machine Logs
  const fetchRealtimeLogs = useCallback(async (isBackground = false) => {
    if (!isBackground) setRealtimeLogsLoading(true);
    try {
      const params = {};
      if (logPeriodFilter === 'hari_ini') {
        const d = new Date();
        params.tanggal = d.toISOString().split('T')[0];
      } else if (logPeriodFilter === 'bulan_ini') {
        const d = new Date();
        params.bulan = d.getMonth() + 1;
        params.tahun = d.getFullYear();
      } else if (logPeriodFilter === 'custom') {
        if (selectedDate) params.tanggal = selectedDate;
      }

      if (logMachineFilter) params.mesin_id = logMachineFilter;
      if (logSearchQuery) params.search = logSearchQuery;

      const res = await api.get('/sdm/logs/', { params });
      setRealtimeLogs(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil log tap real-time:', err);
    } finally {
      if (!isBackground) setRealtimeLogsLoading(false);
    }
  }, [selectedDate, logPeriodFilter, logMachineFilter, logSearchQuery]);

  // Fetch Direktori Pegawai RS
  const fetchPegawaiList = useCallback(async () => {
    setPegawaiLoading(true);
    try {
      const res = await api.get('/sdm/pegawai/');
      setPegawaiList(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil daftar pegawai RS:', err);
    } finally {
      setPegawaiLoading(false);
    }
  }, []);

  // Fetch Master Shift List
  const fetchShiftList = useCallback(async () => {
    setShiftLoading(true);
    try {
      const res = await api.get('/sdm/shift/');
      setShiftList(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data master shift:', err);
    } finally {
      setShiftLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    fetchMesin();
    fetchStats();
    fetchPresensi();
    fetchRealtimeLogs();
    fetchPegawaiList();
    fetchShiftList();
  }, [fetchMesin, fetchStats, fetchPresensi, fetchRealtimeLogs, fetchPegawaiList, fetchShiftList]);

  // Live Auto-Update Polling (Setiap 10 Detik)
  useEffect(() => {
    if (!isLiveActive) return;

    // Hanya auto-refresh jika melihat data hari ini (atau default tanggal kosong)
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = !selectedDate || selectedDate === todayStr;
    if (!isToday) return;

    const intervalId = setInterval(() => {
      // Istirahat jika tab browser sedang di-minimize/background
      if (document.hidden) return;

      fetchStats();
      fetchPresensi(true); // silent background update tanpa spinner
      if (activeViewTab === 'raw_logs') {
        fetchRealtimeLogs(true);
      }
      fetchMesin();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [isLiveActive, selectedDate, activeViewTab, fetchStats, fetchPresensi, fetchRealtimeLogs, fetchMesin]);

  // Handle Sync Now (Sync all active machines)
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/sdm/mesin/sync_semua/');
      const d = res.data;
      showToast(d.message || `Sinkronisasi Berhasil! ${d.total_new_logs} log baru ditarik.`, 'success');
      fetchMesin();
      fetchStats();
      fetchPresensi();
      fetchRealtimeLogs();
      fetchPegawaiList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Gagal menghubungi mesin absen.';
      showToast(msg, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Handle Test Connection
  const handleTestConnection = async (mesinId) => {
    const targetId = mesinId || mesin?.id;
    if (!targetId) return;
    setTestingConn(targetId);
    try {
      const res = await api.post(`/sdm/mesin/${targetId}/test_koneksi/`);
      showToast(res.data?.message || 'Mesin absen terhubung dan merespons port 4370!', 'success');
      fetchMesin();
    } catch (err) {
      const msg = err.response?.data?.message || 'Koneksi ke mesin absen gagal.';
      showToast(msg, 'error');
      fetchMesin();
    } finally {
      setTestingConn(null);
    }
  };

  // Fetch Mappings & Users
  const openMappingModal = async () => {
    setShowMappingModal(true);
    setMappingLoading(true);
    try {
      const [resMap, resUsers] = await Promise.all([
        api.get('/sdm/mapping-karyawan/'),
        api.get('/users/?is_active=true&all=true')
      ]);
      setMappings(resMap.data?.results || resMap.data || []);
      setSimakUsers(resUsers.data?.results || resUsers.data || []);
    } catch (err) {
      console.error('Gagal memuat mapping karyawan:', err);
      showToast('Gagal memuat data pemetaan karyawan.', 'error');
    } finally {
      setMappingLoading(false);
    }
  };

  // Link User to PIN
  const handleLinkUser = async (mappingId, userId) => {
    try {
      await api.post(`/sdm/mapping-karyawan/${mappingId}/link_user/`, { user_id: userId || null });
      showToast('Mapping karyawan berhasil diperbarui!', 'success');
      const resMap = await api.get('/sdm/mapping-karyawan/');
      setMappings(resMap.data?.results || resMap.data || []);
      fetchPresensi();
      fetchRealtimeLogs();
    } catch (err) {
      showToast('Gagal mengubah mapping karyawan.', 'error');
    }
  };

  // Auto-Match All
  const handleAutoMatch = async () => {
    try {
      const res = await api.post('/sdm/mapping-karyawan/auto_match_all/');
      showToast(res.data?.message || 'Pencocokan nama selesai!', 'success');
      const resMap = await api.get('/sdm/mapping-karyawan/');
      setMappings(resMap.data?.results || resMap.data || []);
      fetchPresensi();
      fetchRealtimeLogs();
      fetchPegawaiList();
    } catch (err) {
      showToast('Gagal menjalankan auto-match.', 'error');
    }
  };

  // View Raw Logs Detail Modal
  const handleViewRawLogs = async (item) => {
    setSelectedEmployeeLog(item);
    setRawLogsLoading(true);
    try {
      const params = { tanggal: item.tanggal || selectedDate };
      if (item.pegawai_id) params.pegawai_id = item.pegawai_id;
      if (item.pegawai_pin && String(item.pegawai_pin).trim() !== '-') params.pin = item.pegawai_pin;
      if (item.user_id) params.user_id = item.user_id;

      const res = await api.get('/sdm/logs/', { params });
      setRawLogs(res.data?.results || res.data || []);
    } catch (err) {
      showToast('Gagal memuat log tap mentah.', 'error');
    } finally {
      setRawLogsLoading(false);
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const res = await api.get('/sdm/presensi/export_excel/', {
        params: { tanggal: selectedDate },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Rekap_Presensi_${selectedDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('File Excel rekap presensi berhasil diunduh.', 'success');
    } catch (err) {
      showToast('Gagal mengunduh file Excel.', 'error');
    }
  };

  // Filtered Mappings
  const filteredMappings = useMemo(() => {
    if (!mappingSearch) return mappings;
    const q = mappingSearch.toLowerCase();
    return mappings.filter(m =>
      (m.pin && m.pin.toLowerCase().includes(q)) ||
      (m.nama_di_mesin && m.nama_di_mesin.toLowerCase().includes(q)) ||
      (m.nama_lengkap && m.nama_lengkap.toLowerCase().includes(q)) ||
      (m.username && m.username.toLowerCase().includes(q))
    );
  }, [mappings, mappingSearch]);

  // Filtered Pegawai RS
  const filteredPegawai = useMemo(() => {
    let list = pegawaiList;
    if (pegawaiKategoriFilter) {
      list = list.filter(p => p.kategori === pegawaiKategoriFilter);
    }
    if (pegawaiTelegramFilter === 'terhubung') {
      list = list.filter(p => Boolean(p.telegram_chat_id));
    } else if (pegawaiTelegramFilter === 'belum') {
      list = list.filter(p => !p.telegram_chat_id);
    }
    if (pegawaiSearchQuery) {
      const q = pegawaiSearchQuery.toLowerCase();
      list = list.filter(p =>
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.pin && p.pin.toLowerCase().includes(q)) ||
        (p.nik && p.nik.toLowerCase().includes(q)) ||
        (p.unit_kerja && p.unit_kerja.toLowerCase().includes(q)) ||
        (p.jabatan && p.jabatan.toLowerCase().includes(q)) ||
        (p.telegram_username && p.telegram_username.toLowerCase().includes(q))
      );
    }
    return list;
  }, [pegawaiList, pegawaiKategoriFilter, pegawaiTelegramFilter, pegawaiSearchQuery]);

  // Handler Telegram Test & Reset SDM
  const handleTestTelegram = async (pegawaiId, nama) => {
    setTestingTelegramId(pegawaiId);
    try {
      const res = await api.post(`/sdm/pegawai/${pegawaiId}/test-telegram/`);
      if (res.data?.success) {
        showToast(`Pesan uji coba berhasil dikirim ke Telegram ${nama}!`, 'success');
      } else {
        showToast(res.data?.message || 'Gagal mengirim pesan uji coba.', 'warning');
      }
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Gagal mengirim pesan uji coba.', 'error');
    } finally {
      setTestingTelegramId(null);
    }
  };

  const handleResetTelegram = async (pegawaiId, nama) => {
    if (!window.confirm(`Apakah Anda yakin ingin memutuskan tautan Telegram untuk pegawai '${nama}'?\n\nPegawai dapat menautkan kembali akunnya melalui perintah /hubungkan di bot.`)) {
      return;
    }
    try {
      const res = await api.post(`/sdm/pegawai/${pegawaiId}/reset-telegram/`);
      showToast(res.data?.message || `Tautan Telegram ${nama} berhasil diputuskan.`, 'success');
      fetchPegawaiList();
    } catch (err) {
      showToast(err.response?.data?.error || 'Gagal memutuskan tautan Telegram.', 'error');
    }
  };

  // Filtered Shifts RS
  const filteredShifts = useMemo(() => {
    let list = shiftList;
    if (shiftKelompokFilter) {
      list = list.filter(s => s.kelompok === shiftKelompokFilter);
    }
    if (shiftSearchQuery) {
      const q = shiftSearchQuery.toLowerCase();
      list = list.filter(s =>
        (s.kode && s.kode.toLowerCase().includes(q)) ||
        (s.nama && s.nama.toLowerCase().includes(q)) ||
        (s.keterangan && s.keterangan.toLowerCase().includes(q))
      );
    }
    return list;
  }, [shiftList, shiftKelompokFilter, shiftSearchQuery]);

  // Master Shift Modal Handlers
  const handleOpenCreateShift = () => {
    setEditingShift(null);
    setShiftFormData({
      kode: '',
      nama: '',
      kelompok: shiftKelompokFilter || 'UMUM',
      is_libur: false,
      jam_masuk: '07:30',
      jam_pulang: '14:30',
      batas_tepat_waktu: '07:30',
      is_overnight: false,
      toleransi_terlambat_menit: 0,
      toleransi_pulang_cepat_menit: 0,
      warna: '#10b981',
      keterangan: '',
      is_active: true
    });
    setShowShiftModal(true);
  };

  const handleOpenEditShift = (shift) => {
    setEditingShift(shift);
    setShiftFormData({
      kode: shift.kode,
      nama: shift.nama,
      kelompok: shift.kelompok,
      is_libur: shift.is_libur,
      jam_masuk: shift.jam_masuk ? shift.jam_masuk.slice(0, 5) : '',
      jam_pulang: shift.jam_pulang ? shift.jam_pulang.slice(0, 5) : '',
      batas_tepat_waktu: shift.batas_tepat_waktu ? shift.batas_tepat_waktu.slice(0, 5) : (shift.jam_masuk ? shift.jam_masuk.slice(0, 5) : ''),
      is_overnight: shift.is_overnight,
      toleransi_terlambat_menit: shift.toleransi_terlambat_menit || 0,
      toleransi_pulang_cepat_menit: shift.toleransi_pulang_cepat_menit || 0,
      warna: shift.warna || '#10b981',
      keterangan: shift.keterangan || '',
      is_active: shift.is_active
    });
    setShowShiftModal(true);
  };

  const handleSaveShift = async (e) => {
    e.preventDefault();
    if (!shiftFormData.kode || !shiftFormData.nama) {
      showToast('Kode dan nama shift wajib diisi!', 'error');
      return;
    }
    setShiftSaving(true);
    try {
      const payload = {
        ...shiftFormData,
        jam_masuk: shiftFormData.is_libur ? null : (shiftFormData.jam_masuk ? `${shiftFormData.jam_masuk}:00` : null),
        jam_pulang: shiftFormData.is_libur ? null : (shiftFormData.jam_pulang ? `${shiftFormData.jam_pulang}:00` : null),
        batas_tepat_waktu: shiftFormData.is_libur ? null : (shiftFormData.batas_tepat_waktu ? `${shiftFormData.batas_tepat_waktu}:00` : null),
      };
      if (editingShift) {
        await api.put(`/sdm/shift/${editingShift.id}/`, payload);
        showToast('Shift berhasil diperbarui!', 'success');
      } else {
        await api.post('/sdm/shift/', payload);
        showToast('Shift baru berhasil dibuat!', 'success');
      }
      setShowShiftModal(false);
      fetchShiftList();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Gagal menyimpan shift.';
      showToast(msg, 'error');
    } finally {
      setShiftSaving(false);
    }
  };

  const handleDuplicateShiftToGroups = async (shift) => {
    if (!window.confirm(`Duplikat kode shift [${shift.kode}] (${shift.nama}) ke kelompok profesi lain yang belum memilikinya?`)) return;
    try {
      const res = await api.post(`/sdm/shift/${shift.id}/duplicate_to_groups/`);
      showToast(res.data?.detail || `Shift [${shift.kode}] berhasil diduplikat.`, 'success');
      fetchShiftList();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal menduplikat shift.', 'error');
    }
  };

  const handleDeleteShift = async (shift) => {
    if (!window.confirm(`Hapus master shift [${shift.kode}] ${shift.nama}?`)) return;
    try {
      await api.delete(`/sdm/shift/${shift.id}/`);
      showToast(`Shift [${shift.kode}] berhasil dihapus.`, 'success');
      fetchShiftList();
    } catch (err) {
      showToast('Gagal menghapus shift.', 'error');
    }
  };

  const unitsList = useMemo(() => {
    const s = new Set();
    presensiList.forEach(p => {
      if (p.unit_nama && p.unit_nama !== '-') s.add(p.unit_nama);
    });
    return Array.from(s);
  }, [presensiList]);

  return (
    <div className="sdm-wrapper presensi-container">
      {/* ════════════════ HERO HEADER ════════════════ */}
      <div className="sdm-hero">
        <div className="sdm-hero-main">
          <div className="sdm-title">
            <span style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
              <Fingerprint size={26} />
            </span>
            <div>
              <h1>Presensi Pegawai &amp; Mesin Absen</h1>
              <p>Sinkronisasi otomatis multi-mesin sidik jari RS Siaga (Gerbang Depan SE21-C &amp; Gerbang Belakang S-IPC), pemantauan jam hadir, dan konsolidasi data</p>
            </div>
          </div>
          <div className="sdm-hero-actions">
            <button
              type="button"
              className={`live-sync-pill ${isLiveActive ? 'active' : 'paused'}`}
              onClick={() => setIsLiveActive(!isLiveActive)}
              title={isLiveActive ? 'Live Realtime Aktif (Pembaruan tiap 10s). Klik untuk jeda.' : 'Live Realtime Dijeda. Klik untuk mengaktifkan kembali.'}
            >
              <span className="live-pulse-dot" />
              <span>{isLiveActive ? 'Live Realtime Aktif' : 'Live Dijeda'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={openMappingModal}
              title="Hubungkan PIN mesin absen dengan data user SIMAK"
            >
              <LinkIcon size={15} />
              <span>Mapping PIN ({mappings.length || 736})</span>
            </button>
            <button
              type="button"
              className="btn-sync-now"
              onClick={handleSyncNow}
              disabled={syncing}
            >
              <RefreshCw size={15} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Menyinkronkan...' : 'Tarik Data Mesin'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={handleExportExcel}
            >
              <Download size={15} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Multi-Machine Status Cards */}
        <div className="presensi-multi-machine-grid">
          {(mesinList.length > 0 ? mesinList : [
            { id: 1, nama: 'Mesin Absen Gerbang Belakang (S-IPC)', ip_address: '192.168.44.120', port: 4370, device_name: 'S-IPC', status_koneksi: 'connected', total_user_mesin: 376, last_sync_at: '12.18 WITA' },
            { id: 2, nama: 'Mesin Absen Gerbang Depan (SE21-C)', ip_address: '192.168.44.121', port: 4370, device_name: 'SE21-C', status_koneksi: 'connected', total_user_mesin: 360, last_sync_at: '12.17 WITA' }
          ]).map((m) => (
            <div key={m.id} className="mesin-status-bar">
              <div className="mesin-info">
                <span className="mesin-icon">
                  <Server size={19} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="mesin-name">{m.nama}</span>
                    <span className={`badge-status-koneksi ${m.status_koneksi === 'connected' ? 'online' : 'offline'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 650, background: m.status_koneksi === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: m.status_koneksi === 'connected' ? '#059669' : '#dc2626' }}>
                      ● {m.status_koneksi === 'connected' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="mesin-meta">
                    <span>IP: <strong>{m.ip_address}:{m.port}</strong></span>
                    <span style={{ margin: '0 6px' }}>•</span>
                    <span>Model: {m.device_name || 'Secure'}</span>
                    <span style={{ margin: '0 6px' }}>•</span>
                    <span>Tersimpan: {m.total_user_mesin || 0} User</span>
                    {m.last_sync_at && (
                      <>
                        <span style={{ margin: '0 6px' }}>•</span>
                        <span>Sinkron: {typeof m.last_sync_at === 'string' && (m.last_sync_at.includes('WIB') || m.last_sync_at.includes('WITA')) ? m.last_sync_at : new Date(m.last_sync_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WITA'}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-test-ping"
                  onClick={() => handleTestConnection(m.id)}
                  disabled={testingConn === m.id}
                >
                  <Activity size={12} className={testingConn === m.id ? 'spin' : ''} />
                  <span>{testingConn === m.id ? 'Ping...' : 'Tes Ping'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════ STAT CARDS (Daily Presensi) ════════════════ */}
      {['rekap', 'raw_logs'].includes(activeViewTab) && (
        <div className="presensi-stats-grid">
          <div className="presensi-stat-card">
            <div className="stat-icon total"><Users size={22} /></div>
            <div className="stat-info">
              <div className="stat-num">{stats?.total_pegawai || 0}</div>
              <div className="stat-lbl">Total Pegawai SIMAK</div>
            </div>
          </div>
          <div className="presensi-stat-card">
            <div className="stat-icon hadir"><CheckCircle2 size={22} /></div>
            <div className="stat-info">
              <div className="stat-num">{stats?.hadir_tepat || 0}</div>
              <div className="stat-lbl">Hadir Tepat Waktu</div>
            </div>
          </div>
          <div className="presensi-stat-card">
            <div className="stat-icon telat"><Clock size={22} /></div>
            <div className="stat-info">
              <div className="stat-num">{stats?.terlambat || 0}</div>
              <div className="stat-lbl">Terlambat (&gt; 08:15)</div>
            </div>
          </div>
          <div className="presensi-stat-card">
            <div className="stat-icon izin"><AlertTriangle size={22} /></div>
            <div className="stat-info">
              <div className="stat-num">{stats?.izin_keluar || 0}</div>
              <div className="stat-lbl">Izin Meninggalkan Kerja</div>
            </div>
          </div>
          <div className="presensi-stat-card">
            <div className="stat-icon alfa"><AlertCircle size={22} /></div>
            <div className="stat-info">
              <div className="stat-num">{stats?.belum_absen || 0}</div>
              <div className="stat-lbl">Belum Tap / Tidak Hadir</div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ FILTER TOOLBAR ════════════════ */}
      {['rekap', 'raw_logs', 'pegawai', 'shift'].includes(activeViewTab) && (
        <div className="presensi-filter-toolbar">
          {activeViewTab === 'rekap' ? (
          <>
            <div className="filter-left">
              <div className="filter-input">
                <Calendar size={15} color="#64748b" />
                <DateField
                  value={selectedDate}
                  onChange={(val) => setSelectedDate(val)}
                  placeholder="Pilih tanggal"
                />
              </div>
              <div className="filter-input">
                <Filter size={15} color="#64748b" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Semua Status Kehadiran</option>
                  <option value="hadir">Hadir Tepat Waktu</option>
                  <option value="terlambat">Terlambat</option>
                  <option value="pulang_cepat">Pulang Cepat</option>
                  <option value="libur">Libur / Off Duty</option>
                  <option value="cuti">Cuti</option>
                  <option value="sakit">Sakit</option>
                  <option value="izin">Izin Resmi</option>
                  <option value="izin_keluar">Izin Meninggalkan Kerja (IMTK)</option>
                  <option value="tidak_hadir">Tidak Hadir / Belum Tap</option>
                </select>
              </div>
              <div className="filter-input" style={{ minWidth: 240 }}>
                <Search size={15} color="#64748b" />
                <input
                  type="text"
                  placeholder="Cari nama pegawai / unit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="filter-right">
              <button
                type="button"
                className="btn-engine-recalc"
                onClick={handleRecalculateEngine}
                disabled={recalculating}
                title="Jalankan Attendance Engine untuk mencocokkan log mesin dan roster dinas"
              >
                <RefreshCw size={13} className={recalculating ? 'spin' : ''} />
                <span>{recalculating ? 'Menghitung...' : 'Hitung Ulang Engine'}</span>
              </button>
            </div>
          </>
        ) : activeViewTab === 'raw_logs' ? (
          <>
            <div className="filter-left" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className={`log-period-pill ${logPeriodFilter === 'hari_ini' ? 'active' : ''}`}
                onClick={() => setLogPeriodFilter('hari_ini')}
              >
                Hari Ini ({stats?.total_logs_today || 0})
              </button>
              <button
                type="button"
                className={`log-period-pill ${logPeriodFilter === 'bulan_ini' ? 'active' : ''}`}
                onClick={() => setLogPeriodFilter('bulan_ini')}
              >
                Bulan Ini ({stats?.total_logs_month || 0})
              </button>
              <button
                type="button"
                className={`log-period-pill ${logPeriodFilter === 'semua' ? 'active' : ''}`}
                onClick={() => setLogPeriodFilter('semua')}
              >
                Semua Riwayat Log ({stats?.total_logs_all || 0})
              </button>
              <button
                type="button"
                className={`log-period-pill ${logPeriodFilter === 'custom' ? 'active' : ''}`}
                onClick={() => setLogPeriodFilter('custom')}
              >
                Pilih Tanggal
              </button>

              {logPeriodFilter === 'custom' && (
                <div className="filter-input">
                  <Calendar size={15} color="#64748b" />
                  <DateField
                    value={selectedDate}
                    onChange={(val) => setSelectedDate(val)}
                    placeholder="Pilih tanggal"
                  />
                </div>
              )}

              <div className="filter-input">
                <Server size={15} color="#64748b" />
                <select
                  value={logMachineFilter}
                  onChange={(e) => setLogMachineFilter(e.target.value)}
                >
                  <option value="">Semua Mesin</option>
                  {mesinList.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-right" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="filter-input" style={{ minWidth: 240 }}>
                <Search size={15} color="#64748b" />
                <input
                  type="text"
                  placeholder="Cari PIN / nama di mesin..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={fetchRealtimeLogs}
                disabled={realtimeLogsLoading}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <RefreshCw size={13} className={realtimeLogsLoading ? 'spin' : ''} />
                <span>Segarkan Log</span>
              </button>
            </div>
          </>
        ) : activeViewTab === 'pegawai' ? (
          <>
            <div className="filter-left" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div className="filter-input">
                <Filter size={15} color="#64748b" />
                <select
                  value={pegawaiKategoriFilter}
                  onChange={(e) => setPegawaiKategoriFilter(e.target.value)}
                >
                  <option value="">Semua Kategori ({pegawaiList.length})</option>
                  <option value="SHIFT">Shift - Medis / Pelayanan</option>
                  <option value="NON_SHIFT">Non-Shift - Kantor / Direksi</option>
                  <option value="CS">Cleaning Service</option>
                  <option value="SECURITY_DRIVER">Security &amp; Driver</option>
                  <option value="MITRA">Mitra Kerohanian</option>
                </select>
              </div>
              <div className="filter-input">
                <Send size={15} color="#64748b" />
                <select
                  value={pegawaiTelegramFilter}
                  onChange={(e) => setPegawaiTelegramFilter(e.target.value)}
                >
                  <option value="">Semua Status Bot ({pegawaiList.length})</option>
                  <option value="terhubung">🟢 Terhubung Bot ({pegawaiList.filter(p => Boolean(p.telegram_chat_id)).length})</option>
                  <option value="belum">⚪ Belum Terhubung ({pegawaiList.filter(p => !p.telegram_chat_id).length})</option>
                </select>
              </div>
            </div>
            <div className="filter-right" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="filter-input" style={{ minWidth: 260 }}>
                <Search size={15} color="#64748b" />
                <input
                  type="text"
                  placeholder="Cari nama, NIK, PIN, unit..."
                  value={pegawaiSearchQuery}
                  onChange={(e) => setPegawaiSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={fetchPegawaiList}
                disabled={pegawaiLoading}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <RefreshCw size={13} className={pegawaiLoading ? 'spin' : ''} />
                <span>Segarkan Pegawai</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="filter-left" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div className="filter-input">
                <Filter size={15} color="#64748b" />
                <select
                  value={shiftKelompokFilter}
                  onChange={(e) => setShiftKelompokFilter(e.target.value)}
                >
                  <option value="">Semua Kelompok Profesi ({shiftList.length})</option>
                  <option value="UMUM">Umum / Medis / Nakes / Kantor</option>
                  <option value="CS">Cleaning Service (CS)</option>
                  <option value="SECURITY_DRIVER">Security &amp; Driver</option>
                  <option value="MITRA">Mitra Kerohanian</option>
                </select>
              </div>
            </div>
            <div className="filter-right" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="filter-input" style={{ minWidth: 220 }}>
                <Search size={15} color="#64748b" />
                <input
                  type="text"
                  placeholder="Cari kode shift atau nama..."
                  value={shiftSearchQuery}
                  onChange={(e) => setShiftSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={fetchShiftList}
                disabled={shiftLoading}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <RefreshCw size={13} className={shiftLoading ? 'spin' : ''} />
                <span>Segarkan Shift</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCreateShift}
                style={{
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 650,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                }}
              >
                <Plus size={14} />
                <span>Tambah Shift Baru</span>
              </button>
            </div>
          </>
        )}
        </div>
      )}

      {/* ════════════════ ACTIVE VIEW: REKAPITULASI PEGAWAI SIMAK ════════════════ */}
      {activeViewTab === 'rekap' && (
        <div className="presensi-table-card">
          {loading ? (
            <div className="sdm-empty" style={{ padding: '40px 0' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
              <p>Memuat rekapitulasi presensi...</p>
            </div>
          ) : presensiList.length === 0 ? (
            <div className="sdm-empty" style={{ padding: '48px 0', textAlign: 'center' }}>
              <Fingerprint size={36} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Belum Ada Data Presensi pada Tanggal Ini</h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                Klik tombol <strong>"Tarik Data Mesin"</strong> di atas untuk menyinkronkan data tap terbaru dari mesin absen.
              </p>
            </div>
          ) : (
            <>
              <table className="presensi-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: 'center' }}>No</th>
                    <th>Nama Pegawai</th>
                    <th>Unit Kerja</th>
                    <th style={{ textAlign: 'center' }}>Shift Dinas</th>
                    <th>Jam Masuk</th>
                    <th>Jam Pulang</th>
                    <th>Durasi Kerja</th>
                    <th>Status Kehadiran</th>
                    <th>Izin Terkait</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(rekapPageSize === 'all' ? presensiList : presensiList.slice((rekapPage - 1) * rekapPageSize, rekapPage * rekapPageSize)).map((item, idx) => {
                    const rowNum = (rekapPageSize === 'all' ? 0 : (rekapPage - 1) * rekapPageSize) + idx + 1;
                    return (
                      <tr key={item.id || item.user_id || idx}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{rowNum}</td>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar-small">
                              {item.foto ? (
                                <img src={item.foto} alt="" />
                              ) : (
                                (item.nama_lengkap || item.username).charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="user-cell-info">
                              <span className="user-cell-name">{item.nama_lengkap}</span>
                              <span className="user-cell-unit">
                                {item.pegawai_pin && item.pegawai_pin !== '-' ? `PIN: ${item.pegawai_pin}` : `@${item.username}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{item.unit_nama}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.shift_kode ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                backgroundColor: `${item.shift_warna || '#6366f1'}22`,
                                color: item.shift_warna || '#6366f1',
                                border: `1px solid ${item.shift_warna || '#6366f1'}55`,
                                whiteSpace: 'nowrap'
                              }}
                              title={`${item.shift_nama || ''} (${item.shift_jam_masuk ? item.shift_jam_masuk.slice(0, 5) : ''} - ${item.shift_jam_pulang ? item.shift_jam_pulang.slice(0, 5) : ''})`}
                            >
                              <span>{item.shift_kode}</span>
                              {item.shift_jam_masuk && (
                                <span style={{ fontSize: '10px', opacity: 0.85, fontWeight: 500 }}>
                                  {item.shift_jam_masuk.slice(0, 5)}-{item.shift_jam_pulang ? item.shift_jam_pulang.slice(0, 5) : ''}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          {item.jam_masuk ? (
                            <span className="time-pill">
                              <Clock size={13} color="#10b981" />
                              {item.jam_masuk.slice(0, 8)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>- Belum Tap -</span>
                          )}
                        </td>
                        <td>
                          {item.jam_pulang ? (
                            <span className="time-pill">
                              <Clock size={13} color="#6366f1" />
                              {item.jam_pulang.slice(0, 8)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>- Belum Tap -</span>
                          )}
                        </td>
                        <td>
                          {Number(item.total_jam_kerja) > 0 ? (
                            <span>{item.total_jam_kerja} Jam</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge-status-presensi ${item.status}`}>
                            {item.status === 'hadir' && <CheckCircle2 size={13} />}
                            {item.status === 'terlambat' && <Clock size={13} />}
                            {item.status === 'pulang_cepat' && <Clock size={13} />}
                            {item.status === 'izin_keluar' && <AlertTriangle size={13} />}
                            {item.status === 'tidak_hadir' && <AlertCircle size={13} />}
                            {['libur', 'cuti', 'sakit', 'izin'].includes(item.status) && <CheckCircle2 size={13} />}
                            <span>{item.status_label || item.status}</span>
                            {item.menit_keterlambatan > 0 && (
                              <span style={{ fontSize: 11, opacity: 0.85 }}> (+{item.menit_keterlambatan} mnt)</span>
                            )}
                            {item.menit_pulang_cepat > 0 && (
                              <span style={{ fontSize: 11, opacity: 0.85 }}> (-{item.menit_pulang_cepat} mnt)</span>
                            )}
                          </span>
                        </td>
                        <td>
                          {item.izin_info ? (
                            <span className="badge-status-presensi izin_keluar" title={item.izin_info.keperluan}>
                              <ExternalLink size={12} />
                              <span>Izin: {item.izin_info.kategori} ({item.izin_info.jam_keluar.slice(0, 5)} - {item.izin_info.jam_kembali.slice(0, 5)})</span>
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary-sdm"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => handleViewRawLogs(item)}
                          >
                            Log Tap
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={presensiList.length}
                page={rekapPage}
                setPage={setRekapPage}
                pageSize={rekapPageSize}
                setPageSize={setRekapPageSize}
                label="pegawai"
              />
            </>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVE VIEW: LOG TAP MESIN REAL-TIME ════════════════ */}
      {activeViewTab === 'raw_logs' && (
        <div className="presensi-table-card">
          {realtimeLogsLoading ? (
            <div className="sdm-empty" style={{ padding: '40px 0' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
              <p>Memuat log tap mesin real-time...</p>
            </div>
          ) : realtimeLogs.length === 0 ? (
            <div className="sdm-empty" style={{ padding: '48px 0', textAlign: 'center' }}>
              <Fingerprint size={36} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Belum Ada Tap Mesin pada Tanggal Ini</h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                Klik tombol <strong>"Tarik Data Mesin"</strong> di atas untuk mengambil riwayat tap terbaru dari seluruh mesin absen.
              </p>
            </div>
          ) : (
            <>
              <table className="presensi-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: 'center' }}>No</th>
                    <th>Waktu Tap</th>
                    <th>Mesin Absen</th>
                    <th>PIN Mesin</th>
                    <th>Nama di Mesin</th>
                    <th>Status Akun SIMAK</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(logPageSize === 'all' ? realtimeLogs : realtimeLogs.slice((logPage - 1) * logPageSize, logPage * logPageSize)).map((log, idx) => {
                    const rowNum = (logPageSize === 'all' ? 0 : (logPage - 1) * logPageSize) + idx + 1;
                    return (
                      <tr key={log.id}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{rowNum}</td>
                        <td>
                          <span className="time-pill">
                            <Clock size={13} color="#6366f1" />
                            {logPeriodFilter !== 'hari_ini'
                              ? `${new Date(log.waktu).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} • ${new Date(log.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WITA`
                              : `${new Date(log.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WITA`
                            }
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Server size={14} color="#64748b" />
                            {log.mesin_nama}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', background: 'rgba(99,102,241,0.08)', borderRadius: 4, color: '#4f46e5' }}>
                            PIN {log.pin}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 650 }}>{log.nama_di_mesin || '-'}</span>
                        </td>
                        <td>
                          {log.user ? (
                            <span className="badge-status-presensi hadir">
                              <CheckCircle2 size={13} />
                              <span>Terhubung: {log.nama_lengkap} (@{log.username})</span>
                            </span>
                          ) : log.pegawai_id ? (
                            <span className="badge-status-presensi hadir" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid #a7f3d0' }}>
                              <CheckCircle2 size={13} />
                              <span>Pegawai RS: {log.nama_lengkap} ({log.unit_nama || log.jabatan || 'Staf RS'})</span>
                            </span>
                          ) : (
                            <span className="badge-status-presensi" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>
                              <AlertCircle size={13} />
                              <span>Staf RS / Nakes (Belum Terhubung SIMAK)</span>
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {(!log.user && !log.pegawai_id) ? (
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              onClick={() => {
                                setMappingSearch(log.pin);
                                openMappingModal();
                              }}
                            >
                              Petakan PIN
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Tercatat</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={realtimeLogs.length}
                page={logPage}
                setPage={setLogPage}
                pageSize={logPageSize}
                setPageSize={setLogPageSize}
                label="log tap"
              />
            </>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVE VIEW: DIREKTORI PEGAWAI RS ════════════════ */}
      {activeViewTab === 'pegawai' && (
        <div className="presensi-table-card">
          {pegawaiLoading ? (
            <div className="sdm-empty" style={{ padding: '40px 0' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
              <p>Memuat direktori master pegawai RS...</p>
            </div>
          ) : filteredPegawai.length === 0 ? (
            <div className="sdm-empty" style={{ padding: '48px 0', textAlign: 'center' }}>
              <Users size={36} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Pegawai Tidak Ditemukan</h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                Coba sesuaikan kata kunci pencarian atau filter kategori di atas.
              </p>
            </div>
          ) : (
            <>
              <table className="presensi-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: 'center' }}>No</th>
                    <th>PIN Mesin</th>
                    <th>Nama Lengkap Pegawai</th>
                    <th>NIK</th>
                    <th>Jabatan &amp; Unit Kerja</th>
                    <th>Kategori Shift</th>
                    <th>Status Akun SIMAK</th>
                    <th>Status Bot Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {(pegawaiPageSize === 'all' ? filteredPegawai : filteredPegawai.slice((pegawaiPage - 1) * pegawaiPageSize, pegawaiPage * pegawaiPageSize)).map((p, idx) => {
                    const rowNum = (pegawaiPageSize === 'all' ? 0 : (pegawaiPage - 1) * pegawaiPageSize) + idx + 1;
                    return (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{rowNum}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', background: 'rgba(99,102,241,0.08)', borderRadius: 4, color: '#4f46e5' }}>
                            PIN {p.pin}
                          </span>
                        </td>
                        <td>
                          <div className="user-cell" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="user-avatar-mini" style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                              {p.nama.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 650, color: '#0f172a' }}>{p.nama}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: p.nik ? '#0f172a' : '#94a3b8', fontSize: 12.5 }}>
                          {p.nik || '-'}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.jabatan || p.unit_kerja || '-'}</div>
                          {p.unit_kerja && p.unit_kerja !== p.jabatan && (
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>Unit: {p.unit_kerja}</div>
                          )}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: p.kategori === 'NON_SHIFT' ? 'rgba(99,102,241,0.1)' :
                                        p.kategori === 'CS' ? 'rgba(234,88,12,0.1)' :
                                        p.kategori === 'SECURITY_DRIVER' ? 'rgba(202,138,4,0.1)' :
                                        p.kategori === 'MITRA' ? 'rgba(168,85,247,0.1)' :
                                        'rgba(16,185,129,0.1)',
                            color: p.kategori === 'NON_SHIFT' ? '#4f46e5' :
                                   p.kategori === 'CS' ? '#ea580c' :
                                   p.kategori === 'SECURITY_DRIVER' ? '#ca8a04' :
                                   p.kategori === 'MITRA' ? '#9333ea' :
                                   '#059669',
                          }}>
                            {p.kategori_label || p.kategori}
                          </span>
                        </td>
                        <td>
                          {p.user_username ? (
                            <span className="badge-status-presensi hadir" style={{ fontSize: 11.5 }}>
                              <CheckCircle2 size={13} />
                              <span>Akun: @{p.user_username}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
                              Profil RS (Tanpa Login)
                            </span>
                          )}
                        </td>
                        <td>
                          {p.telegram_chat_id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                className="badge-status-presensi hadir"
                                style={{
                                  fontSize: 11.5,
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  color: '#059669',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: 6
                                }}
                                title={`Chat ID: ${p.telegram_chat_id}`}
                              >
                                <Send size={11} />
                                <span>{p.telegram_username || `ID: ${p.telegram_chat_id}`}</span>
                              </span>
                              <button
                                type="button"
                                className="btn-secondary-sdm"
                                title="Tes kirim notifikasi ke Telegram pegawai"
                                onClick={() => handleTestTelegram(p.id, p.nama)}
                                disabled={testingTelegramId === p.id}
                                style={{ padding: '3px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                {testingTelegramId === p.id ? <RefreshCw size={11} className="spin" /> : <Send size={11} color="#0284c7" />}
                                <span>Tes</span>
                              </button>
                              <button
                                type="button"
                                className="btn-secondary-sdm"
                                title="Putuskan / Reset tautan Telegram pegawai ini"
                                onClick={() => handleResetTelegram(p.id, p.nama)}
                                style={{ padding: '3px 7px', fontSize: 11, color: '#e11d48', borderColor: '#fecdd3', background: '#fff1f2' }}
                              >
                                <Unlink size={11} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertCircle size={12} color="#cbd5e1" />
                              <span>Belum Terhubung</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={filteredPegawai.length}
                page={pegawaiPage}
                setPage={setPegawaiPage}
                pageSize={pegawaiPageSize}
                setPageSize={setPegawaiPageSize}
                label="pegawai"
              />
            </>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVE VIEW: MASTER POLA SHIFT RS ════════════════ */}
      {activeViewTab === 'shift' && (
        <div className="presensi-table-card">
          {/* Quick Group Filter Pills */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.18)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Kelompok Pola Shift (Sesuai Sheet Excel):</span>
            {[
              { key: '', label: `Semua Kelompok (${shiftList.length})` },
              { key: 'UMUM', label: `Medis & Umum (${shiftList.filter(s => s.kelompok === 'UMUM').length})` },
              { key: 'CS', label: `Khusus CS (${shiftList.filter(s => s.kelompok === 'CS').length})` },
              { key: 'SECURITY_DRIVER', label: `Security & Driver (${shiftList.filter(s => s.kelompok === 'SECURITY_DRIVER').length})` },
              { key: 'MITRA', label: `Mitra Kerohanian (${shiftList.filter(s => s.kelompok === 'MITRA').length})` },
            ].map(grp => (
              <button
                key={grp.key}
                type="button"
                className={`log-period-pill ${shiftKelompokFilter === grp.key ? 'active' : ''}`}
                onClick={() => {
                  setShiftKelompokFilter(grp.key);
                  setShiftPage(1);
                }}
              >
                {grp.label}
              </button>
            ))}
          </div>

          {shiftLoading ? (
            <div className="sdm-empty" style={{ padding: '40px 0' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: '#f59e0b' }} />
              <p>Memuat master shift RS...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="sdm-empty" style={{ padding: '48px 0', textAlign: 'center' }}>
              <Clock size={36} style={{ margin: '0 auto 12px', color: '#94a3b8' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Shift Tidak Ditemukan</h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                Coba sesuaikan kata kunci pencarian atau filter kelompok profesi di atas.
              </p>
            </div>
          ) : (
            <>
              <table className="presensi-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: 'center' }}>No</th>
                    <th style={{ width: 90 }}>Kode Shift</th>
                    <th>Nama Shift</th>
                    <th>Kelompok Profesi</th>
                    <th>Jam Kerja</th>
                    <th>Batas Tepat Waktu</th>
                    <th>Keterangan</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(shiftPageSize === 'all' ? filteredShifts : filteredShifts.slice((shiftPage - 1) * shiftPageSize, shiftPage * shiftPageSize)).map((s, idx) => {
                    const rowNum = (shiftPageSize === 'all' ? 0 : (shiftPage - 1) * shiftPageSize) + idx + 1;
                    return (
                      <tr key={s.id}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{rowNum}</td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 44,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 750,
                            fontFamily: 'monospace',
                            fontSize: 13,
                            background: s.warna || '#10b981',
                            color: '#ffffff',
                            boxShadow: `0 2px 4px ${s.warna}44`
                          }}>
                            {s.kode}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 650, color: '#0f172a' }}>{s.nama}</div>
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#475569'
                          }}>
                            {s.kelompok_label || s.kelompok}
                          </span>
                        </td>
                        <td>
                          {s.is_libur ? (
                            <span style={{ color: '#64748b', fontWeight: 600, fontSize: 12 }}>
                              Libur / Off Duty
                            </span>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
                              <Clock size={13} color="#6366f1" />
                              <span>{s.jam_kerja_display}</span>
                              {s.is_overnight && (
                                <span title="Shift lintas hari (overnight)" style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(99,102,241,0.1)', color: '#4f46e5', padding: '1px 5px', borderRadius: 4, fontSize: 10.5 }}>
                                  <Moon size={11} style={{ marginRight: 2 }} /> Overnight
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          {s.is_libur ? '-' : (
                            <span style={{ fontSize: 12.5, fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                              &le; {s.batas_tepat_waktu ? s.batas_tepat_waktu.slice(0, 8) : (s.jam_masuk ? s.jam_masuk.slice(0, 5) : '-')}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {s.keterangan || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              style={{ padding: '4px 8px' }}
                              title="Edit Shift"
                              onClick={() => handleOpenEditShift(s)}
                            >
                              <Edit2 size={13} color="#4f46e5" />
                            </button>
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700 }}
                              title="Duplikat kode shift ini ke kelompok lain"
                              onClick={() => handleDuplicateShiftToGroups(s)}
                            >
                              +Grup
                            </button>
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              style={{ padding: '4px 8px' }}
                              title="Hapus Shift"
                              onClick={() => handleDeleteShift(s)}
                            >
                              <Trash2 size={13} color="#ef4444" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={filteredShifts.length}
                page={shiftPage}
                setPage={setShiftPage}
                pageSize={shiftPageSize}
                setPageSize={setShiftPageSize}
                label="shift"
              />
            </>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVE VIEW: ROSTER JADWAL DINAS BULANAN ════════════════ */}
      {activeViewTab === 'roster' && (
        <RosterDinasGrid
          hasSdmAccess={hasSdmAccess}
          activeShifts={shiftList}
        />
      )}

      {/* ════════════════ ACTIVE VIEW: TUKAR DINAS STAF ════════════════ */}
      {activeViewTab === 'tukar' && (
        <TukarDinasView
          hasSdmAccess={hasSdmAccess}
          activeShifts={shiftList}
          pegawaiList={pegawaiList}
        />
      )}

      {/* ════════════════ ACTIVE VIEW: DISIPLIN & SURAT BINAAN (STEP 6) ════════════════ */}
      {activeViewTab === 'disiplin' && (
        <EvaluasiDisiplinView />
      )}

      {/* ════════════════ ACTIVE VIEW: KARTU ABSENSI BULANAN PEGAWAI (STEP 7) ════════════════ */}
      {activeViewTab === 'kartu_absensi' && (
        <KartuAbsensiView />
      )}

      {/* ════════════════ ACTIVE VIEW: REKAPITULASI UNIT KERJA RS (STEP 7) ════════════════ */}
      {activeViewTab === 'rekap_unit' && (
        <RekapUnitView />
      )}

      {/* ════════════════ MODAL: CREATE / EDIT SHIFT RS ════════════════ */}
      {showShiftModal && createPortal(
        <div className="presensi-modal-overlay">
          <div className="presensi-modal-card" style={{ maxWidth: 540 }}>
            <div className="presensi-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>
                  {editingShift ? `Edit Master Shift [${editingShift.kode}]` : 'Tambah Master Shift Baru'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Atur kode shift, nama, jam masuk/pulang, dan toleransi kedisiplinan
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                style={{ padding: '6px' }}
                onClick={() => setShowShiftModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveShift}>
              <div className="presensi-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                      Kode Shift *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. P, S, M, P1"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'monospace', fontWeight: 700 }}
                      value={shiftFormData.kode}
                      onChange={(e) => setShiftFormData({ ...shiftFormData, kode: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                      Nama Shift *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Shift Pagi Pelayanan"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                      value={shiftFormData.nama}
                      onChange={(e) => setShiftFormData({ ...shiftFormData, nama: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                    Kelompok Profesi *
                  </label>
                  <select
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={shiftFormData.kelompok}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, kelompok: e.target.value })}
                  >
                    <option value="UMUM">Umum / Medis / Nakes / Kantor</option>
                    <option value="CS">Cleaning Service (CS)</option>
                    <option value="SECURITY_DRIVER">Security &amp; Driver</option>
                    <option value="MITRA">Mitra Kerohanian</option>
                  </select>
                </div>

                <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 650, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={shiftFormData.is_libur}
                      onChange={(e) => setShiftFormData({ ...shiftFormData, is_libur: e.target.checked })}
                    />
                    <span>Status Libur / Cuti / Izin (Off Duty - Tanpa Jam Masuk &amp; Pulang)</span>
                  </label>
                </div>

                {!shiftFormData.is_libur && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                          Jam Masuk
                        </label>
                        <input
                          type="time"
                          required={!shiftFormData.is_libur}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                          value={shiftFormData.jam_masuk}
                          onChange={(e) => setShiftFormData({ ...shiftFormData, jam_masuk: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                          Jam Pulang
                        </label>
                        <input
                          type="time"
                          required={!shiftFormData.is_libur}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                          value={shiftFormData.jam_pulang}
                          onChange={(e) => setShiftFormData({ ...shiftFormData, jam_pulang: e.target.value })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                          Batas Tap Tepat Waktu (Excel)
                        </label>
                        <input
                          type="time"
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                          value={shiftFormData.batas_tepat_waktu || shiftFormData.jam_masuk || ''}
                          onChange={(e) => setShiftFormData({ ...shiftFormData, batas_tepat_waktu: e.target.value })}
                        />
                      </div>
                      <div style={{ paddingTop: 18 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={shiftFormData.is_overnight}
                            onChange={(e) => setShiftFormData({ ...shiftFormData, is_overnight: e.target.checked })}
                          />
                          <span>Lintas Hari (Overnight / Malam)</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 6 }}>
                    Warna Badge Shift di Kalender Roster
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { hex: '#10b981', label: 'Emerald' },
                      { hex: '#f59e0b', label: 'Amber' },
                      { hex: '#6366f1', label: 'Indigo' },
                      { hex: '#0284c7', label: 'Sky' },
                      { hex: '#8b5cf6', label: 'Purple' },
                      { hex: '#14b8a6', label: 'Teal' },
                      { hex: '#ec4899', label: 'Pink' },
                      { hex: '#64748b', label: 'Slate' },
                      { hex: '#3b82f6', label: 'Blue' },
                      { hex: '#ef4444', label: 'Rose' },
                      { hex: '#f97316', label: 'Orange' },
                    ].map((col) => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setShiftFormData({ ...shiftFormData, warna: col.hex })}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: col.hex,
                          border: shiftFormData.warna === col.hex ? '3px solid #0f172a' : '2px solid #fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          cursor: 'pointer'
                        }}
                        title={col.label}
                      />
                    ))}
                    <input
                      type="color"
                      value={shiftFormData.warna}
                      onChange={(e) => setShiftFormData({ ...shiftFormData, warna: e.target.value })}
                      style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer' }}
                      title="Pilih Warna Kustom"
                    />
                    <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 650, color: shiftFormData.warna }}>
                      {shiftFormData.warna}
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 650, display: 'block', marginBottom: 4 }}>
                    Keterangan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Catatan tambahan mengenai jadwal dinas ini..."
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                    value={shiftFormData.keterangan}
                    onChange={(e) => setShiftFormData({ ...shiftFormData, keterangan: e.target.value })}
                  />
                </div>
              </div>

              <div className="presensi-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-sdm"
                  onClick={() => setShowShiftModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={shiftSaving}
                  style={{
                    padding: '7px 16px',
                    fontSize: 13,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 650,
                    cursor: 'pointer'
                  }}
                >
                  {shiftSaving ? 'Menyimpan...' : (editingShift ? 'Simpan Perubahan' : 'Buat Shift')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ MODAL: MAPPING KARYAWAN MESIN ════════════════ */}
      {showMappingModal && createPortal(
        <div className="presensi-modal-overlay">
          <div className="presensi-modal-card">
            <div className="presensi-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>
                  Pemetaan Karyawan Mesin Absen (PIN &rarr; Akun SIMAK)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Hubungkan nomor Enroll ID/PIN pada mesin absen dengan data akun pegawai di SIMAK
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                style={{ padding: '6px' }}
                onClick={() => setShowMappingModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="presensi-modal-body">
              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
                <div className="filter-input" style={{ width: 280 }}>
                  <Search size={15} color="#64748b" />
                  <input
                    type="text"
                    placeholder="Cari PIN atau nama..."
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-sync-now"
                  style={{ fontSize: 13, padding: '7px 14px' }}
                  onClick={handleAutoMatch}
                >
                  <Zap size={15} />
                  <span>Auto-Match Nama Mesin</span>
                </button>
              </div>

              {/* Table Mappings */}
              {mappingLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
                  <p>Memuat data mapping...</p>
                </div>
              ) : (
                <>
                  <table className="presensi-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>PIN</th>
                        <th>Nama di Mesin</th>
                        <th>Akun Pegawai SIMAK</th>
                        <th>Unit Kerja</th>
                        <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mappingPageSize === 'all' ? filteredMappings : filteredMappings.slice((mappingPage - 1) * mappingPageSize, mappingPage * mappingPageSize)).map((map) => (
                        <tr key={map.id}>
                          <td><strong>#{map.pin}</strong></td>
                          <td>{map.nama_di_mesin || '-'}</td>
                          <td>
                            <select
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                fontSize: 12.5,
                                background: map.user ? 'rgba(16, 185, 129, 0.05)' : '#ffffff'
                              }}
                              value={map.user || ''}
                              onChange={(e) => handleLinkUser(map.id, e.target.value)}
                            >
                              <option value="">-- Pilih Akun Pegawai SIMAK --</option>
                              {simakUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : u.username} ({u.unit?.nama || 'Tanpa Unit'})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>{map.unit_nama || '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {map.user ? (
                              <span className="badge-status-presensi hadir" style={{ fontSize: 11, padding: '2px 8px' }}>
                                Terhubung
                              </span>
                            ) : (
                              <span className="badge-status-presensi terlambat" style={{ fontSize: 11, padding: '2px 8px' }}>
                                Belum Link
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <SdmPagination
                    totalItems={filteredMappings.length}
                    page={mappingPage}
                    setPage={setMappingPage}
                    pageSize={mappingPageSize}
                    setPageSize={setMappingPageSize}
                    label="data PIN"
                  />
                </>
              )}
            </div>

            <div className="presensi-modal-footer">
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={() => setShowMappingModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ MODAL: DETAIL RAW LOG TAP ════════════════ */}
      {selectedEmployeeLog && createPortal(
        <div className="presensi-modal-overlay">
          <div className="presensi-modal-card" style={{ maxWidth: 540 }}>
            <div className="presensi-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750 }}>
                  Riwayat Tap Absen: {selectedEmployeeLog.nama_lengkap || selectedEmployeeLog.pegawai_nama}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  Tanggal: {selectedEmployeeLog.tanggal || selectedDate} {selectedEmployeeLog.pegawai_pin && selectedEmployeeLog.pegawai_pin !== '-' ? `• PIN #${selectedEmployeeLog.pegawai_pin}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary-sdm"
                style={{ padding: '6px' }}
                onClick={() => setSelectedEmployeeLog(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="presensi-modal-body" style={{ maxHeight: 360 }}>
              {rawLogsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
                  <p>Mengambil log tap...</p>
                </div>
              ) : rawLogs.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', margin: '20px 0' }}>
                  Tidak ada catatan tap mentah tersimpan untuk pegawai ini pada tanggal tersebut.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rawLogs.map((log, index) => {
                    const timeStr = new Date(log.waktu).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZone: 'Asia/Makassar'
                    });
                    const dateStr = new Date(log.waktu).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Makassar'
                    });
                    const isNextDay = selectedEmployeeLog.tanggal && !log.waktu.startsWith(selectedEmployeeLog.tanggal);

                    return (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: '#f8fafc',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                            {index + 1}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>
                              {timeStr} WITA {isNextDay && <span style={{ fontSize: 11, fontWeight: 500, color: '#f59e0b' }}>({dateStr})</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>
                              Mesin: {log.mesin_nama || 'Mesin Absen RS'} • PIN #{log.pin}
                            </div>
                          </div>
                        </div>
                        <span className="badge-status-presensi hadir" style={{ fontSize: 11 }}>
                          {log.status_verifikasi === 4 ? 'Wajah / Face' : 'Fingerprint'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="presensi-modal-footer">
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={() => setSelectedEmployeeLog(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
