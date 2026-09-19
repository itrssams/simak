import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  UserCheck
} from 'lucide-react';
import './IzinMeninggalkanKerja.css';

const KATEGORI_CONFIG = {
  dinas: { label: 'Dinas Luar', class: 'dinas' },
  pribadi: { label: 'Urusan Pribadi', class: 'pribadi' },
  sakit: { label: 'Sakit / Berobat', class: 'sakit' },
};

const STATUS_CONFIG = {
  berjalan: { label: 'Sedang di Luar', class: 'berjalan' },
  selesai: { label: 'Sudah Kembali', class: 'selesai' },
  dibatalkan: { label: 'Dibatalkan', class: 'dibatalkan' },
};

export default function IzinMeninggalkanKerja() {
  const { user } = useAuth();
  const toast = useToast();
  const hasSdmAccess = Boolean(
    user?.is_superuser ||
    user?.is_sdm ||
    ['direktur', 'wakil_direktur'].includes(user?.role)
  );

  const [activeTab, setActiveTab] = useState('saya');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data states
  const [izinSaya, setIzinSaya] = useState([]);
  const [rekapData, setRekapData] = useState([]);
  const [stats, setStats] = useState(null);
  const [units, setUnits] = useState([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [logsModalItem, setLogsModalItem] = useState(null);

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
    if (!hasSdmAccess) return;
    try {
      const res = await api.get('/users/units/');
      setUnits(res.data || []);
    } catch (err) {
      console.error('Gagal mengambil daftar unit:', err);
    }
  }, [hasSdmAccess]);

  // Initial Load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPersonalPermits(),
      fetchStats(),
      hasSdmAccess ? fetchUnits() : Promise.resolve(),
      hasSdmAccess ? fetchRekapData() : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [fetchPersonalPermits, fetchStats, fetchUnits, fetchRekapData, hasSdmAccess]);

  // Active Permit of Current User
  const activeMine = useMemo(() => {
    return izinSaya.find((i) => i.status === 'berjalan');
  }, [izinSaya]);

  const activeDuration = useMemo(() => {
    if (!activeMine?.jam_keluar || !activeMine?.jam_kembali) return null;
    const [h1, m1] = activeMine.jam_keluar.slice(0, 5).split(':').map(Number);
    const [h2, m2] = activeMine.jam_kembali.slice(0, 5).split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h > 0 && m > 0) return `${h} Jam ${m} Menit`;
    if (h > 0) return `${h} Jam`;
    return `${m} Menit`;
  }, [activeMine]);

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
      showToast('Izin meninggalkan tempat kerja berhasil dicatat.');
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
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.jam_kembali || err.response?.data?.detail || 'Gagal menyimpan izin.';
      showToast(Array.isArray(msg) ? msg[0] : msg, true);
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
    if (alasan.length < 3) {
      return showToast('Alasan penyesuaian minimal 3 karakter.', true);
    }
    if (adjustForm.jam_keluar && adjustForm.jam_kembali && adjustForm.jam_kembali <= adjustForm.jam_keluar) {
      return showToast('Jam kembali harus lebih besar dari jam keluar.', true);
    }

    setActionLoading(true);
    try {
      await api.post(`/sdm/izin-keluar/${adjustModalItem.id}/sesuaikan-jam/`, {
        ...adjustForm,
        alasan_penyesuaian: alasan,
      });
      showToast('Penyesuaian jam berhasil dicatat ke dalam histori.');
      setAdjustModalItem(null);
      fetchPersonalPermits();
      fetchStats();
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Gagal menyesuaikan jam.';
      if (data) {
        if (typeof data === 'string') {
          msg = data;
        } else if (data.error) {
          msg = data.error;
        } else if (data.detail) {
          msg = data.detail;
        } else if (typeof data === 'object') {
          const firstVal = Object.values(data)[0];
          msg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
        }
      }
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Return Confirmation Modal
  const openReturnModal = (item) => {
    setReturnModalItem(item);
    const d = new Date();
    const curTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setReturnForm({
      jam_kembali_aktual: curTime,
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
        } else if (typeof data === 'object') {
          const firstVal = Object.values(data)[0];
          msg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
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
      if (hasSdmAccess) fetchRekapData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Gagal membatalkan izin.';
      showToast(msg, true);
    } finally {
      setActionLoading(false);
    }
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

  return (
    <div className="sdm-wrapper">
      {/* ════════════════ HERO HEADER (SIMAK STANDARD) ════════════════ */}
      <div className="sdm-hero">
        <div className="sdm-hero-main">
          <div className="sdm-title">
            <span>
              <LogOut size={24} />
            </span>
            <div>
              <h1>Izin Meninggalkan Tempat Kerja</h1>
              <p>
                Pencatatan izin dinas luar & urusan pribadi, mitigasi penyesuaian jam kerja, dan rekapitulasi kepegawaian
              </p>
            </div>
          </div>
          <div className="sdm-hero-actions">
            <button
              type="button"
              className="sdm-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} />
              <span>Ajukan Izin Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs (Segmented Control Pill Style) ── */}
      <div className="sdm-tabs">
        <button
          type="button"
          className={`sdm-tab-btn ${activeTab === 'saya' ? 'active' : ''}`}
          onClick={() => setActiveTab('saya')}
        >
          <FileText size={15} />
          <span>Izin Saya</span>
          {activeMine && <span className="sdm-tab-badge">Aktif</span>}
        </button>

        {hasSdmAccess && (
          <button
            type="button"
            className={`sdm-tab-btn ${activeTab === 'rekap' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('rekap');
              fetchRekapData();
            }}
          >
            <Building2 size={15} />
            <span>Rekapitulasi SDM & Direksi</span>
            {stats?.today_sedang_keluar > 0 && (
              <span className="sdm-tab-badge danger">
                {stats.today_sedang_keluar} Staf di Luar
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── TAB 1: IZIN SAYA ── */}
      {activeTab === 'saya' && (
        <>
          {/* Active Permit Hero Card */}
          {activeMine ? (
            <div className="sdm-active-hero">
              <div className="sdm-active-top">
                <div className="sdm-active-status-group">
                  <div className="sdm-live-pill">
                    <span className="sdm-live-dot" />
                    <span>SEDANG DI LUAR TEMPAT KERJA</span>
                  </div>
                  <span className={`sdm-badge ${activeMine.kategori}`}>
                    {activeMine.kategori_label}
                  </span>
                </div>

                <div className="sdm-active-date-tag">
                  <Calendar size={14} />
                  <span>{formatTanggalIndo(activeMine.tanggal)}</span>
                </div>
              </div>

              <div className="sdm-active-body">
                <div className="sdm-active-info">
                  <div className="sdm-active-keperluan-container">
                    <span className="sdm-active-keperluan-label">KEPERLUAN / KEGIATAN:</span>
                    <h3 className="sdm-active-keperluan">{activeMine.keperluan}</h3>
                  </div>

                  <div className="sdm-active-timeline">
                    <div className="sdm-timeline-node">
                      <div className="sdm-timeline-icon out">
                        <LogOut size={16} />
                      </div>
                      <div className="sdm-timeline-details">
                        <span className="sdm-timeline-lbl">Jam Keluar</span>
                        <strong className="sdm-timeline-val">
                          {activeMine.jam_keluar?.slice(0, 5)} <small>WIB</small>
                        </strong>
                      </div>
                    </div>

                    <div className="sdm-timeline-connector">
                      <div className="sdm-timeline-line" />
                      {activeDuration && (
                        <span className="sdm-timeline-duration" title="Estimasi total durasi keluar kantor">
                          <Clock size={12} />
                          {activeDuration}
                        </span>
                      )}
                      <ArrowRight size={14} className="sdm-timeline-arrow" />
                    </div>

                    <div className="sdm-timeline-node">
                      <div className="sdm-timeline-icon in">
                        <Clock size={16} />
                      </div>
                      <div className="sdm-timeline-details">
                        <span className="sdm-timeline-lbl">Rencana Kembali</span>
                        <strong className="sdm-timeline-val">
                          {activeMine.jam_kembali?.slice(0, 5)} <small>WIB</small>
                        </strong>
                      </div>
                    </div>
                  </div>

                  {activeMine.is_adjusted && (
                    <div className="sdm-adjusted-banner">
                      <div className="sdm-adjusted-banner-left">
                        <span className="sdm-adjusted-tag">JADWAL DISESUAIKAN</span>
                        <span>
                          Rencana awal: <strong>{activeMine.jam_keluar_awal?.slice(0, 5)} – {activeMine.jam_kembali_awal?.slice(0, 5)} WIB</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sdm-btn-history-link"
                        onClick={() => setLogsModalItem(activeMine)}
                      >
                        <History size={13} />
                        Lihat Log Audit
                      </button>
                    </div>
                  )}
                </div>

                <div className="sdm-active-actions">
                  <div className="sdm-actions-header">
                    <span>Aksi Cepat</span>
                  </div>
                  <button
                    type="button"
                    className="sdm-btn-kembali"
                    onClick={() => openReturnModal(activeMine)}
                  >
                    <CheckCircle2 size={18} />
                    <span>Sudah Kembali</span>
                  </button>
                  <button
                    type="button"
                    className="sdm-btn-sesuaikan"
                    onClick={() => openAdjustModal(activeMine)}
                  >
                    <Clock size={16} />
                    <span>Sesuaikan Jam</span>
                  </button>
                  <button
                    type="button"
                    className="sdm-btn-batalkan"
                    onClick={() => handleCancelPermit(activeMine)}
                  >
                    <X size={14} />
                    <span>Batalkan Izin Ini</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="sdm-kpi-card" style={{ padding: '24px', alignItems: 'center', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="sdm-kpi-icon-box green" style={{ width: '52px', height: '52px' }}>
                  <UserCheck size={28} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Anda sedang berada di tempat kerja</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                    Jika perlu keluar kantor untuk tugas dinas atau urusan mendesak, silakan klik tombol <strong>Ajukan Izin Keluar</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabel Riwayat Izin Saya */}
          <div className="sdm-table-card">
            <div className="sdm-table-header-title">
              <span>Riwayat Izin Meninggalkan Kerja Saya</span>
              <button
                className="sdm-btn-outline"
                onClick={fetchPersonalPermits}
                title="Muat ulang riwayat"
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="sdm-table-responsive">
              <table className="sdm-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Keperluan</th>
                    <th>Waktu Rencana Awal</th>
                    <th>Waktu Aktif</th>
                    <th>Jam Kembali Riil</th>
                    <th>Status</th>
                    <th>Penyesuaian</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {izinSaya.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="sdm-empty-state">
                          <FileText size={36} />
                          <p>Belum ada riwayat izin keluar yang tercatat.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    izinSaya.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.tanggal}</strong>
                        </td>
                        <td>
                          <span className={`sdm-badge ${item.kategori}`}>
                            {item.kategori_label}
                          </span>
                        </td>
                        <td style={{ maxWidth: '280px' }}>{item.keperluan}</td>
                        <td>
                          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                            {item.jam_keluar_awal?.slice(0, 5)} - {item.jam_kembali_awal?.slice(0, 5)}
                          </span>
                        </td>
                        <td>
                          <strong>
                            {item.jam_keluar?.slice(0, 5)} - {item.jam_kembali?.slice(0, 5)}
                          </strong>
                        </td>
                        <td>
                          {item.jam_kembali_aktual ? (
                            <span style={{ color: '#059669', fontWeight: 700 }}>
                              {item.jam_kembali_aktual.slice(0, 5)} WIB
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span className={`sdm-badge ${item.status}`}>
                            {item.status_label}
                          </span>
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
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {item.status === 'berjalan' ? (
                              <>
                                <button
                                  className="sdm-btn-outline"
                                  style={{ color: '#059669', borderColor: '#a7f3d0' }}
                                  onClick={() => openReturnModal(item)}
                                >
                                  Kembali
                                </button>
                                <button
                                  className="sdm-btn-outline"
                                  onClick={() => openAdjustModal(item)}
                                >
                                  Sesuaikan
                                </button>
                              </>
                            ) : (
                              <button
                                className="sdm-btn-outline"
                                onClick={() => setLogsModalItem(item)}
                                title="Lihat detail jejak audit"
                              >
                                <History size={14} />
                                <span>Detail</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB 2: REKAPITULASI SDM & DIREKSI ── */}
      {activeTab === 'rekap' && hasSdmAccess && (
        <>
          {/* KPI Statistic Cards */}
          <div className="sdm-kpi-grid">
            <div className="sdm-kpi-card">
              <div className="sdm-kpi-info">
                <span className="sdm-kpi-lbl">Sedang di Luar Hari Ini</span>
                <span className="sdm-kpi-val" style={{ color: '#dc2626' }}>
                  {stats?.today_sedang_keluar ?? 0}
                </span>
              </div>
              <div className="sdm-kpi-icon-box blue">
                <LogOut size={22} />
              </div>
            </div>

            <div className="sdm-kpi-card">
              <div className="sdm-kpi-info">
                <span className="sdm-kpi-lbl">Sudah Kembali Hari Ini</span>
                <span className="sdm-kpi-val" style={{ color: '#059669' }}>
                  {stats?.today_sudah_kembali ?? 0}
                </span>
              </div>
              <div className="sdm-kpi-icon-box green">
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div className="sdm-kpi-card">
              <div className="sdm-kpi-info">
                <span className="sdm-kpi-lbl">Total Izin Bulan Ini</span>
                <span className="sdm-kpi-val">{stats?.month_total ?? 0}</span>
              </div>
              <div className="sdm-kpi-icon-box indigo">
                <Calendar size={22} />
              </div>
            </div>

            <div className="sdm-kpi-card">
              <div className="sdm-kpi-info">
                <span className="sdm-kpi-lbl">Ada Penyesuaian Jam</span>
                <span className="sdm-kpi-val" style={{ color: '#d97706' }}>
                  {stats?.month_adjusted ?? 0}
                </span>
              </div>
              <div className="sdm-kpi-icon-box amber">
                <Clock size={22} />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="sdm-filter-bar">
            <div className="sdm-filter-row">
              <div className="sdm-filter-inputs">
                {/* Search */}
                <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="sdm-input"
                    style={{ paddingLeft: '32px', width: '100%' }}
                    placeholder="Cari nama pegawai / keperluan..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  />
                </div>

                {/* Unit */}
                <select
                  className="sdm-select"
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

                {/* Kategori */}
                <select
                  className="sdm-select"
                  value={filters.kategori}
                  onChange={(e) => setFilters({ ...filters, kategori: e.target.value })}
                >
                  <option value="">Semua Kategori</option>
                  <option value="dinas">Dinas Luar</option>
                  <option value="pribadi">Urusan Pribadi</option>
                  <option value="sakit">Sakit / Berobat</option>
                </select>

                {/* Status */}
                <select
                  className="sdm-select"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">Semua Status</option>
                  <option value="berjalan">Sedang di Luar</option>
                  <option value="selesai">Sudah Kembali</option>
                  <option value="dibatalkan">Dibatalkan</option>
                </select>

                {/* Date Range Picker */}
                <DateRangePicker
                  dari={filters.start_date}
                  sampai={filters.end_date}
                  onChange={({ dari, sampai }) => setFilters({ ...filters, start_date: dari, end_date: sampai })}
                  placeholder="Pilih Rentang Tanggal"
                />

                {/* Checkbox penyesuaian */}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.adjusted}
                    onChange={(e) => setFilters({ ...filters, adjusted: e.target.checked })}
                  />
                  <span>Hanya Penyesuaian Jam</span>
                </label>
              </div>

              {/* Action Export */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="sdm-btn-outline"
                  onClick={() => {
                    setFilters({
                      unit: '',
                      kategori: '',
                      status: '',
                      start_date: '',
                      end_date: '',
                      search: '',
                      adjusted: false,
                    });
                  }}
                >
                  Reset
                </button>
                <button
                  className="sdm-btn-excel"
                  onClick={handleExportExcel}
                  title="Unduh data tabel ke file Excel"
                >
                  <Download size={16} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Full RS Recap Table */}
          <div className="sdm-table-card">
            <div className="sdm-table-header-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Rekapitulasi Izin Seluruh Unit ({rekapData.length} data)</span>
              </div>
              <button
                className="sdm-btn-outline"
                onClick={fetchRekapData}
                title="Muat ulang tabel"
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="sdm-table-responsive">
              <table className="sdm-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Pegawai & Unit</th>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Keperluan</th>
                    <th>Waktu Awal</th>
                    <th>Waktu Disesuaikan</th>
                    <th>Kembali Riil</th>
                    <th>Status</th>
                    <th>Penyesuaian</th>
                    <th style={{ textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rekapData.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        <div className="sdm-empty-state">
                          <FileText size={36} />
                          <p>Tidak ada data izin yang sesuai dengan filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rekapData.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {item.foto ? (
                              <img
                                src={item.foto}
                                alt={item.nama_lengkap}
                                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  background: '#e2e8f0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  color: '#475569',
                                }}
                              >
                                {item.nama_lengkap?.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong style={{ display: 'block', fontSize: '0.88rem' }}>
                                {item.nama_lengkap}
                              </strong>
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                {item.unit_nama}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{item.tanggal}</strong>
                        </td>
                        <td>
                          <span className={`sdm-badge ${item.kategori}`}>
                            {item.kategori_label}
                          </span>
                        </td>
                        <td style={{ maxWidth: '240px' }}>{item.keperluan}</td>
                        <td>
                          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                            {item.jam_keluar_awal?.slice(0, 5)} - {item.jam_kembali_awal?.slice(0, 5)}
                          </span>
                        </td>
                        <td>
                          <strong>
                            {item.jam_keluar?.slice(0, 5)} - {item.jam_kembali?.slice(0, 5)}
                          </strong>
                        </td>
                        <td>
                          {item.jam_kembali_aktual ? (
                            <span style={{ color: '#059669', fontWeight: 700 }}>
                              {item.jam_kembali_aktual.slice(0, 5)} WIB
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span className={`sdm-badge ${item.status}`}>
                            {item.status_label}
                          </span>
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
          </div>
        </>
      )}

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
                    Waktu rencana awal ini akan disimpan permanen sebagai referensi kepatuhan jam kerja.
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
                  {actionLoading ? 'Menyimpan...' : 'Simpan & Keluar Kantor'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 2: SESUAIKAN JAM (MITIGATION OF TIME ADJUSTMENT) ── */}
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
                <div className="sdm-adjusted-alert" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  <Clock size={16} />
                  <span>
                    Rencana jam awal (<strong>{adjustModalItem.jam_keluar_awal?.slice(0, 5)} - {adjustModalItem.jam_kembali_awal?.slice(0, 5)}</strong>) tetap tersimpan utuh di sistem. Perubahan ini akan dicatat sebagai jejak audit.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Jam Keluar Disesuaikan</label>
                    <input
                      type="time"
                      className="sdm-input"
                      value={adjustForm.jam_keluar}
                      onChange={(e) => setAdjustForm({ ...adjustForm, jam_keluar: e.target.value })}
                      required
                    />
                  </div>
                  <div className="sdm-form-group">
                    <label className="sdm-label">Jam Kembali Disesuaikan</label>
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
                  <label className="sdm-label">Alasan Penyesuaian Jam (Wajib)</label>
                  <textarea
                    rows={3}
                    className="sdm-input"
                    placeholder="Contoh: Terjebak kemacetan di jalan raya, antrean bank memanjang, pembahasan meeting dinas molor."
                    value={adjustForm.alasan_penyesuaian}
                    onChange={(e) => setAdjustForm({ ...adjustForm, alasan_penyesuaian: e.target.value })}
                    required
                    minLength={3}
                  />
                  <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
                    *Minimal 3 karakter untuk pencatatan log audit.
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
                  style={{ background: '#d97706' }}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Penyesuaian Jam'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 3: KONFIRMASI SUDAH KEMBALI ── */}
      {returnModalItem && createPortal(
        <div className="sdm-modal-overlay" onClick={() => setReturnModalItem(null)}>
          <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sdm-modal-head">
              <h3 className="sdm-modal-title">Konfirmasi Kembali ke Kantor</h3>
              <button className="sdm-modal-close" onClick={() => setReturnModalItem(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="sdm-modal-body">
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Konfirmasi Keberadaan Anda</h4>
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Waktu kedatangan riil akan dicatat dan status izin diselesaikan.
                  </p>
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
                </div>

                <div className="sdm-form-group">
                  <label className="sdm-label">Catatan Tambahan (Opsional)</label>
                  <input
                    type="text"
                    className="sdm-input"
                    placeholder="Contoh: Tugas dinas selesai dengan baik."
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
                  style={{ background: '#10b981' }}
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
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Pegawai:</div>
                <strong style={{ fontSize: '0.95rem' }}>{logsModalItem.nama_lengkap || logsModalItem.username}</strong>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                  Unit: <strong>{logsModalItem.unit_nama || '-'}</strong> | Tanggal: <strong>{logsModalItem.tanggal}</strong>
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: 6 }}>
                  Rencana Awal:{' '}
                  <span style={{ fontWeight: 800, color: '#1e40af' }}>
                    {logsModalItem.jam_keluar_awal?.slice(0, 5)} - {logsModalItem.jam_kembali_awal?.slice(0, 5)} WIB
                  </span>
                </div>
              </div>

              <h4 style={{ margin: '10px 0 0', fontSize: '0.9rem', fontWeight: 800 }}>Kronologi Perubahan:</h4>

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
                        })} WIB • Oleh: {lg.created_by_name}
                      </div>
                      <div className="sdm-timeline-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 750 }}>
                          <span style={{ color: '#94a3b8' }}>
                            {lg.jam_keluar_sebelum?.slice(0, 5)} - {lg.jam_kembali_sebelum?.slice(0, 5)}
                          </span>
                          <ArrowRight size={14} color="#64748b" />
                          <span style={{ color: '#2563eb' }}>
                            {lg.jam_keluar_sesudah?.slice(0, 5)} - {lg.jam_kembali_sesudah?.slice(0, 5)} WIB
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: '0.82rem', color: '#334155' }}>
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
    </div>
  );
}
