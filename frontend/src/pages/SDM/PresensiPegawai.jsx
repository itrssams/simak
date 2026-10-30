import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
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
  ExternalLink
} from 'lucide-react';
import './PresensiPegawai.css';
import './IzinMeninggalkanKerja.css';

export default function PresensiPegawai() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Access rights
  const hasSdmAccess = Boolean(user?.is_superuser || user?.is_sdm || ['direktur', 'wakil_direktur'].includes(user?.role));

  // State
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Data State
  const [mesin, setMesin] = useState(null);
  const [presensiList, setPresensiList] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingConn, setTestingConn] = useState(false);

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

  // Fetch Mesin Info
  const fetchMesin = useCallback(async () => {
    try {
      const res = await api.get('/sdm/mesin/');
      const data = res.data?.results || res.data || [];
      if (data.length > 0) {
        setMesin(data[0]);
      }
    } catch (err) {
      console.error('Gagal mengambil data mesin absen:', err);
    }
  }, []);

  // Fetch Dashboard Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/sdm/presensi/dashboard_stat/');
      setStats(res.data);
    } catch (err) {
      console.error('Gagal mengambil statistik presensi:', err);
    }
  }, []);

  // Fetch Presensi List
  const fetchPresensi = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tanggal: selectedDate };
      if (unitFilter) params.unit_id = unitFilter;
      if (statusFilter) params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;

      const res = await api.get('/sdm/presensi/', { params });
      setPresensiList(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil data presensi:', err);
      showToast('Gagal memuat data presensi harian.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, unitFilter, statusFilter, searchQuery, showToast]);

  // Initial Load
  useEffect(() => {
    fetchMesin();
    fetchStats();
    fetchPresensi();
  }, [fetchMesin, fetchStats, fetchPresensi]);

  // Handle Sync Now
  const handleSyncNow = async () => {
    if (!mesin) return;
    setSyncing(true);
    try {
      const res = await api.post(`/sdm/mesin/${mesin.id}/sync_sekarang/`);
      const d = res.data;
      showToast(`Sinkronisasi Berhasil! ${d.total_users_machine} User & ${d.total_logs_machine} Log terdeteksi (${d.new_logs_saved} log baru).`, 'success');
      fetchMesin();
      fetchStats();
      fetchPresensi();
    } catch (err) {
      const msg = err.response?.data?.message || 'Gagal menghubungi mesin absen.';
      showToast(msg, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Handle Test Connection
  const handleTestConnection = async () => {
    if (!mesin) return;
    setTestingConn(true);
    try {
      const res = await api.post(`/sdm/mesin/${mesin.id}/test_koneksi/`);
      showToast(res.data?.message || 'Mesin absen terhubung dan merespons port 4370!', 'success');
      fetchMesin();
    } catch (err) {
      const msg = err.response?.data?.message || 'Koneksi ke mesin absen gagal.';
      showToast(msg, 'error');
      fetchMesin();
    } finally {
      setTestingConn(false);
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
      // Refresh local mappings
      const resMap = await api.get('/sdm/mapping-karyawan/');
      setMappings(resMap.data?.results || resMap.data || []);
      fetchPresensi();
      fetchStats();
    } catch (err) {
      showToast('Gagal mengubah mapping karyawan.', 'error');
    }
  };

  // Auto Match All
  const handleAutoMatch = async () => {
    try {
      const res = await api.post('/sdm/mapping-karyawan/auto_match_all/');
      showToast(res.data?.message || 'Pencocokan otomatis selesai!', 'success');
      const resMap = await api.get('/sdm/mapping-karyawan/');
      setMappings(resMap.data?.results || resMap.data || []);
      fetchPresensi();
      fetchStats();
    } catch (err) {
      showToast('Gagal melakukan pencocokan otomatis.', 'error');
    }
  };

  // View Raw Punch Logs
  const handleViewRawLogs = async (item) => {
    setSelectedEmployeeLog(item);
    setRawLogsLoading(true);
    try {
      const res = await api.get('/sdm/logs/', {
        params: {
          user_id: item.user_id,
          tanggal: item.tanggal
        }
      });
      setRawLogs(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Gagal mengambil detail punch log:', err);
      showToast('Gagal memuat riwayat tap.', 'error');
    } finally {
      setRawLogsLoading(false);
    }
  };

  // Handle Export Excel
  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('tanggal', selectedDate);
      if (unitFilter) params.append('unit_id', unitFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await api.get(`/sdm/presensi/export_excel/?${params.toString()}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
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
              <h1>Presensi Pegawai & Mesin Absen</h1>
              <p>Sinkronisasi otomatis mesin sidik jari RS Siaga (SECURE S-IPC), pemantauan jam hadir, dan rekap jam kerja</p>
            </div>
          </div>
          <div className="sdm-hero-actions">
            <button
              type="button"
              className="btn-sync-now"
              onClick={handleSyncNow}
              disabled={syncing}
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Menarik Data...' : 'Tarik Data Mesin'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={handleExportExcel}
            >
              <FileSpreadsheet size={16} color="#10b981" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div className="sdm-tabs">
        <button
          type="button"
          className="sdm-tab-btn active"
          onClick={() => navigate('/sdm/presensi')}
        >
          <Fingerprint size={15} />
          <span>Presensi Mesin Absen</span>
        </button>
        <button
          type="button"
          className="sdm-tab-btn"
          onClick={() => navigate('/sdm/izin-kerja')}
        >
          <Clock size={15} />
          <span>Izin Meninggalkan Kerja</span>
        </button>
        {hasSdmAccess && (
          <button
            type="button"
            className="sdm-tab-btn"
            onClick={() => navigate('/sdm/rekapitulasi')}
          >
            <Building2 size={15} />
            <span>Rekapitulasi Izin SDM</span>
          </button>
        )}
        <button
          type="button"
          className="sdm-tab-btn"
          onClick={() => navigate('/sdm/struktur')}
        >
          <Users size={15} />
          <span>Struktur Organisasi</span>
        </button>
      </div>

      {/* ════════════════ MACHINE STATUS BAR ════════════════ */}
      <div className="presensi-machine-card">
        <div className="machine-left">
          <div className={`machine-icon-box ${mesin?.status_koneksi === 'connected' ? '' : 'offline'}`}>
            <Server size={24} />
          </div>
          <div className="machine-details">
            <h3>
              {mesin?.nama || 'Mesin Absen Utama (SECURE S-IPC)'}
              <span className={`machine-status-badge ${mesin?.status_koneksi === 'connected' ? '' : 'offline'}`}>
                <span className={`pulse-dot ${mesin?.status_koneksi === 'connected' ? '' : 'offline'}`} />
                {mesin?.status_koneksi === 'connected' ? 'Terhubung (Online)' : 'Terputus (Offline)'}
              </span>
            </h3>
            <div className="machine-meta">
              <span><strong>IP:</strong> {mesin?.ip_address || '192.168.44.120'}:{mesin?.port || 4370}</span>
              <span>•</span>
              <span><strong>Model:</strong> {mesin?.device_name || 'S-IPC'}</span>
              <span>•</span>
              <span><strong>SN:</strong> {mesin?.serial_number || 'A8ME230660078'}</span>
              <span>•</span>
              <span><strong>Tersimpan di Mesin:</strong> {mesin?.total_user_mesin || 0} User / {mesin?.total_log_mesin || 0} Tap</span>
              <span>•</span>
              <span><strong>Terakhir Sinkron:</strong> {mesin?.last_sync_at ? new Date(mesin.last_sync_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'Belum pernah'}</span>
            </div>
          </div>
        </div>
        <div className="machine-actions">
          <button
            type="button"
            className="btn-secondary-sdm"
            onClick={handleTestConnection}
            disabled={testingConn}
          >
            <Activity size={15} className={testingConn ? 'spin' : ''} />
            <span>{testingConn ? 'Mengecek...' : 'Tes Ping'}</span>
          </button>
          {hasSdmAccess && (
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={openMappingModal}
            >
              <LinkIcon size={15} />
              <span>Mapping PIN Karyawan ({mappings.length || mesin?.total_user_mesin || 0})</span>
            </button>
          )}
        </div>
      </div>

      {/* ════════════════ STAT CARDS ════════════════ */}
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

      {/* ════════════════ FILTER TOOLBAR ════════════════ */}
      <div className="presensi-filter-toolbar">
        <div className="filter-left">
          <div className="filter-input">
            <Calendar size={15} color="#64748b" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
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
              <option value="izin_keluar">Izin Meninggalkan Kerja</option>
            </select>
          </div>
        </div>
        <div className="filter-right">
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
      </div>

      {/* ════════════════ PRESENSI TABLE ════════════════ */}
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
          <table className="presensi-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>No</th>
                <th>Nama Pegawai</th>
                <th>Unit Kerja</th>
                <th>Jam Masuk</th>
                <th>Jam Pulang</th>
                <th>Durasi Kerja</th>
                <th>Status Kehadiran</th>
                <th>Izin Terkait</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {presensiList.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
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
                        <span className="user-cell-unit">@{item.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{item.unit_nama}</span>
                  </td>
                  <td>
                    <span className="time-pill">
                      <Clock size={13} color="#10b981" />
                      {item.jam_masuk || '-'}
                    </span>
                  </td>
                  <td>
                    {item.jam_pulang ? (
                      <span className="time-pill">
                        <Clock size={13} color="#6366f1" />
                        {item.jam_pulang}
                      </span>
                    ) : (
                      <span className="time-pill empty">- Belum Tap -</span>
                    )}
                  </td>
                  <td>
                    <strong>{item.total_jam_kerja > 0 ? `${item.total_jam_kerja} Jam` : '-'}</strong>
                  </td>
                  <td>
                    <span className={`badge-status-presensi ${item.status}`}>
                      {item.status === 'hadir' && <CheckCircle2 size={13} />}
                      {item.status === 'terlambat' && <Clock size={13} />}
                      {item.status === 'izin_keluar' && <AlertTriangle size={13} />}
                      <span>{item.status_label}</span>
                      {item.menit_keterlambatan > 0 && (
                        <span>(+{item.menit_keterlambatan} mnt)</span>
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
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                    {filteredMappings.map((map) => (
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
                  Riwayat Tap Absen: {selectedEmployeeLog.nama_lengkap}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  Tanggal: {selectedEmployeeLog.tanggal}
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
                  Tidak ada catatan tap mentah tersimpan.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rawLogs.map((log, index) => {
                    const timeStr = new Date(log.waktu).toLocaleTimeString('id-ID');
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
                              {timeStr} WIB
                            </div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>
                              Mesin: {log.mesin_nama} • PIN #{log.pin}
                            </div>
                          </div>
                        </div>
                        <span className="badge-status-presensi hadir" style={{ fontSize: 11 }}>
                          Fingerprint
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

