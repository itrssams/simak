import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import {
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  User,
  Building2,
  X,
  AlertCircle,
  HelpCircle,
  Check,
  FileText
} from 'lucide-react';
import './TukarDinasView.css';
import SdmPagination from './SdmPagination';
import DateField from '../../components/DateField';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const JENIS_KOREKSI_OPTIONS = [
  { value: 'tukar_shift', label: 'Tukar Shift (Hari Sama)' },
  { value: 'tukar_hari', label: 'Tukar Hari Libur / Off' },
  { value: 'ganti_jaga', label: 'Ganti Jaga / Backup' },
  { value: 'izin', label: 'Izin (I / IP / IS / IM)' },
  { value: 'sakit', label: 'Sakit (S)' },
  { value: 'cuti', label: 'Cuti (CT / CM / CL / Cap)' },
  { value: 'manual', label: 'Koreksi Manual SDM' },
];

function getKelompokPegawai(pegawai) {
  if (!pegawai) return 'UMUM';
  if (pegawai.kelompok_shift) return pegawai.kelompok_shift;
  if (pegawai.kelompok) return pegawai.kelompok;
  if (['CS', 'SECURITY_DRIVER', 'MITRA'].includes(pegawai.kategori)) {
    return pegawai.kategori;
  }
  return 'UMUM';
}

export default function TukarDinasView({ hasSdmAccess = true, activeShifts = [], pegawaiList = [] }) {
  const { showToast } = useToast();

  // Sub-tab: 'koreksi' (Sheet TUKAR SHIF / JadwalKoreksi) | 'tukar' (Pengajuan Berpasangan TukarDinas)
  const [subTab, setSubTab] = useState('koreksi');

  // Filter States
  const [bulan, setBulan] = useState(10);
  const [tahun, setTahun] = useState(2026);
  const [statusFilter, setStatusFilter] = useState('');
  const [jenisKoreksiFilter, setJenisKoreksiFilter] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => { setPage(1); }, [subTab, bulan, tahun, statusFilter, jenisKoreksiFilter, selectedUnit, searchQuery]);

  // Data States
  const [tukarList, setTukarList] = useState([]);
  const [koreksiList, setKoreksiList] = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Modal Create Tukar Dinas Berpasangan
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    pemohon_id: '',
    tanggal_pemohon: '2026-10-15',
    shift_asal_pemohon_id: '',
    shift_tujuan_pemohon_id: '',
    pengganti_id: '',
    tanggal_pengganti: '2026-10-15',
    shift_asal_pengganti_id: '',
    shift_tujuan_pengganti_id: '',
    jenis: 'tukar_shift',
    alasan: '',
  });

  // Modal Create Koreksi Jadwal (Tukar Shift / Izin / Sakit / Cuti / Manual)
  const [isKoreksiModalOpen, setIsKoreksiModalOpen] = useState(false);
  const [creatingKoreksi, setCreatingKoreksi] = useState(false);
  const [koreksiForm, setKoreksiForm] = useState({
    pegawai_id: '',
    tanggal: '2026-10-15',
    shift_id: '',
    jenis: 'tukar_shift',
    alasan: '',
  });

  // Local Master Data (Fallback if not passed as props)
  const [allPegawai, setAllPegawai] = useState(pegawaiList || []);
  const [allShifts, setAllShifts] = useState(activeShifts || []);

  useEffect(() => {
    if (!pegawaiList || pegawaiList.length === 0) {
      api.get('/sdm/pegawai/?is_active=true')
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : (res.data.results || []);
          setAllPegawai(list);
        })
        .catch(err => console.error('Error fetching pegawai for tukar dinas:', err));
    } else {
      setAllPegawai(pegawaiList);
    }
  }, [pegawaiList]);

  useEffect(() => {
    if (!activeShifts || activeShifts.length === 0) {
      api.get('/sdm/shift/?is_active=true')
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : (res.data.results || []);
          setAllShifts(list);
        })
        .catch(err => console.error('Error fetching shifts for tukar dinas:', err));
    } else {
      setAllShifts(activeShifts);
    }
  }, [activeShifts]);

  // Fetch Tukar Dinas & JadwalKoreksi List
  const fetchTukarList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { bulan, tahun };
      if (statusFilter) params.status = statusFilter;
      if (selectedUnit) params.unit = selectedUnit;
      if (searchQuery) params.search = searchQuery;

      const korParams = { bulan, tahun };
      if (jenisKoreksiFilter) korParams.jenis = jenisKoreksiFilter;
      if (selectedUnit) korParams.unit = selectedUnit;
      if (searchQuery) korParams.search = searchQuery;

      const [resList, resStats, resKor] = await Promise.all([
        api.get('/sdm/tukar-dinas/', { params }),
        api.get('/sdm/tukar-dinas/summary_stats/', { params: { bulan, tahun } }),
        api.get('/sdm/jadwal-koreksi/', { params: korParams }),
      ]);

      const list = Array.isArray(resList.data) ? resList.data : (resList.data.results || []);
      const korList = Array.isArray(resKor.data) ? resKor.data : (resKor.data.results || []);
      setTukarList(list);
      setKoreksiList(korList);
      setSummaryStats(resStats.data);
    } catch (err) {
      console.error('Error fetching tukar dinas:', err);
      showToast('Gagal memuat data koreksi & tukar dinas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, statusFilter, jenisKoreksiFilter, selectedUnit, searchQuery, showToast]);

  useEffect(() => {
    fetchTukarList();
  }, [fetchTukarList]);

  // Handle Approve Action
  const handleApprove = async (item) => {
    if (!window.confirm(`Setujui tukar dinas ${item.pemohon_nama} dengan ${item.pengganti_nama}? Jadwal efektif di kalender roster akan otomatis diperbarui.`)) {
      return;
    }

    setActionLoadingId(item.id);
    try {
      await api.post(`/sdm/tukar-dinas/${item.id}/approve/`, {
        catatan_atasan: 'Disetujui oleh Supervisor / SDM SIMAK'
      });
      showToast(`Tukar dinas ${item.pemohon_nama} berhasil disetujui!`, 'success');
      fetchTukarList();
    } catch (err) {
      console.error('Error approving tukar dinas:', err);
      showToast(err.response?.data?.detail || 'Gagal menyetujui tukar dinas.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Reject Action
  const handleReject = async (item) => {
    const alasan = window.prompt('Masukkan alasan penolakan tukar dinas (opsional):', 'Jadwal unit tidak mencukupi');
    if (alasan === null) return;

    setActionLoadingId(item.id);
    try {
      await api.post(`/sdm/tukar-dinas/${item.id}/reject/`, {
        catatan_atasan: alasan || 'Ditolak oleh atasan'
      });
      showToast('Pengajuan tukar dinas telah ditolak.', 'info');
      fetchTukarList();
    } catch (err) {
      console.error('Error rejecting tukar dinas:', err);
      showToast(err.response?.data?.detail || 'Gagal menolak tukar dinas.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Cancel Action (Revert to Jadwal Master)
  const handleCancelTukar = async (item) => {
    if (!window.confirm(`Batalkan tukar dinas ${item.pemohon_nama} dan kembalikan jadwal dinas ke Jadwal Master?`)) {
      return;
    }

    setActionLoadingId(item.id);
    try {
      await api.post(`/sdm/tukar-dinas/${item.id}/cancel/`, {
        catatan_atasan: 'Dibatalkan oleh SDM, dikembalikan ke Jadwal Master'
      });
      showToast('Tukar dinas dibatalkan & jadwal dikembalikan ke Master.', 'info');
      fetchTukarList();
    } catch (err) {
      console.error('Error canceling tukar dinas:', err);
      showToast(err.response?.data?.detail || 'Gagal membatalkan tukar dinas.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Create Koreksi Jadwal
  const handleCreateKoreksiSubmit = async (e) => {
    e.preventDefault();
    if (!koreksiForm.pegawai_id || !koreksiForm.tanggal || !koreksiForm.shift_id) {
      showToast('Pegawai, tanggal, dan pola shift wajib dipilih.', 'warning');
      return;
    }

    setCreatingKoreksi(true);
    try {
      await api.post('/sdm/jadwal-koreksi/', {
        pegawai: parseInt(koreksiForm.pegawai_id),
        tanggal: koreksiForm.tanggal,
        shift: parseInt(koreksiForm.shift_id),
        jenis: koreksiForm.jenis,
        alasan: koreksiForm.alasan || 'Koreksi Jadwal SDM',
      });
      showToast('Koreksi jadwal berhasil disimpan & Jadwal Final diperbarui!', 'success');
      setIsKoreksiModalOpen(false);
      fetchTukarList();
    } catch (err) {
      console.error('Error creating jadwal koreksi:', err);
      showToast(err.response?.data?.detail || 'Gagal menyimpan koreksi jadwal.', 'error');
    } finally {
      setCreatingKoreksi(false);
    }
  };

  // Handle Delete Koreksi (Revert to Master)
  const handleDeleteKoreksi = async (item) => {
    if (!window.confirm(`Hapus koreksi shift ${item.shift_kode} milik ${item.pegawai_nama} (${item.tanggal}) dan kembalikan ke Jadwal Master?`)) {
      return;
    }
    setActionLoadingId(`kor-${item.id}`);
    try {
      await api.delete(`/sdm/jadwal-koreksi/${item.id}/`);
      showToast(`Koreksi dihapus & jadwal ${item.pegawai_nama} dikembalikan ke Master.`, 'info');
      fetchTukarList();
    } catch (err) {
      console.error('Error deleting jadwal koreksi:', err);
      showToast(err.response?.data?.detail || 'Gagal menghapus koreksi jadwal.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Submit Create Form
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pemohon_id || !formData.tanggal_pemohon || !formData.shift_tujuan_pemohon_id) {
      showToast('Pemohon, tanggal dinas, dan shift tujuan wajib diisi.', 'warning');
      return;
    }

    setCreating(true);
    try {
      const payload = {
        pemohon: parseInt(formData.pemohon_id),
        tanggal_pemohon: formData.tanggal_pemohon,
        shift_asal_pemohon: formData.shift_asal_pemohon_id ? parseInt(formData.shift_asal_pemohon_id) : parseInt(formData.shift_tujuan_pengganti_id),
        shift_tujuan_pemohon: parseInt(formData.shift_tujuan_pemohon_id),
        pengganti: formData.pengganti_id ? parseInt(formData.pengganti_id) : null,
        tanggal_pengganti: formData.tanggal_pengganti || formData.tanggal_pemohon,
        shift_asal_pengganti: formData.shift_asal_pengganti_id ? parseInt(formData.shift_asal_pengganti_id) : (formData.shift_tujuan_pemohon_id ? parseInt(formData.shift_tujuan_pemohon_id) : null),
        shift_tujuan_pengganti: formData.shift_tujuan_pengganti_id ? parseInt(formData.shift_tujuan_pengganti_id) : (formData.shift_asal_pemohon_id ? parseInt(formData.shift_asal_pemohon_id) : null),
        jenis: formData.jenis,
        alasan: formData.alasan || 'Tukar Dinas Antar Pegawai',
        status: hasSdmAccess ? 'disetujui' : 'menunggu_atasan',
      };

      const res = await api.post('/sdm/tukar-dinas/', payload);

      // If created by SDM, auto-approve immediately
      if (hasSdmAccess && res.data?.id) {
        await api.post(`/sdm/tukar-dinas/${res.data.id}/approve/`, {
          catatan_atasan: 'Dibuat dan diverifikasi langsung oleh SDM'
        });
      }

      showToast('Pengajuan tukar dinas berhasil disimpan!', 'success');
      setIsCreateModalOpen(false);
      fetchTukarList();
    } catch (err) {
      console.error('Error creating tukar dinas:', err);
      showToast(err.response?.data?.detail || 'Gagal membuat pengajuan tukar dinas.', 'error');
    } finally {
      setCreating(false);
    }
  };

  // Distinct units from pegawai
  const distinctUnits = useMemo(() => {
    const units = new Set();
    allPegawai.forEach(p => {
      if (p.unit_kerja) units.add(p.unit_kerja);
    });
    return Array.from(units).sort();
  }, [allPegawai]);

  // Shifts filtered by selected employee in modals
  const pemohonShifts = useMemo(() => {
    const p = allPegawai.find(x => String(x.id) === String(formData.pemohon_id));
    const kel = getKelompokPegawai(p);
    return allShifts.filter(s => s.kelompok === kel);
  }, [allPegawai, allShifts, formData.pemohon_id]);

  const penggantiShifts = useMemo(() => {
    const p = allPegawai.find(x => String(x.id) === String(formData.pengganti_id));
    const kel = getKelompokPegawai(p);
    return allShifts.filter(s => s.kelompok === kel);
  }, [allPegawai, allShifts, formData.pengganti_id]);

  const koreksiShifts = useMemo(() => {
    const p = allPegawai.find(x => String(x.id) === String(koreksiForm.pegawai_id));
    const kel = getKelompokPegawai(p);
    return allShifts.filter(s => s.kelompok === kel);
  }, [allPegawai, allShifts, koreksiForm.pegawai_id]);

  return (
    <div className="tukar-dinas-container">
      {/* ════════════════ SUMMARY STAT CARDS ════════════════ */}
      <div className="tukar-stat-grid">
        <div className="tukar-stat-card" onClick={() => setSubTab('koreksi')} style={{ cursor: 'pointer' }}>
          <div className="tukar-stat-icon blue">
            <FileText size={22} />
          </div>
          <div className="tukar-stat-info">
            <div className="tukar-stat-num">{koreksiList.length}</div>
            <div className="tukar-stat-lbl">Total Koreksi &amp; Tukar Shift Aktif</div>
          </div>
        </div>

        <div className="tukar-stat-card" onClick={() => setSubTab('tukar')} style={{ cursor: 'pointer' }}>
          <div className="tukar-stat-icon yellow">
            <Clock size={22} />
          </div>
          <div className="tukar-stat-info">
            <div className="tukar-stat-num">{summaryStats?.menunggu_atasan || 0}</div>
            <div className="tukar-stat-lbl">Menunggu Verifikasi Karu/SDM</div>
          </div>
        </div>

        <div className="tukar-stat-card">
          <div className="tukar-stat-icon green">
            <CheckCircle2 size={22} />
          </div>
          <div className="tukar-stat-info">
            <div className="tukar-stat-num">{(summaryStats?.disetujui || 0) + koreksiList.length}</div>
            <div className="tukar-stat-lbl">Efektif di Jadwal Final</div>
          </div>
        </div>

        <div className="tukar-stat-card">
          <div className="tukar-stat-icon red">
            <XCircle size={22} />
          </div>
          <div className="tukar-stat-info">
            <div className="tukar-stat-num">{(summaryStats?.ditolak || 0) + (summaryStats?.dibatalkan || 0)}</div>
            <div className="tukar-stat-lbl">Ditolak / Dibatalkan</div>
          </div>
        </div>
      </div>

      {/* ════════════════ SUB-TAB SWITCHER ════════════════ */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={subTab === 'koreksi' ? 'btn-primary-sdm' : 'btn-secondary-sdm'}
          onClick={() => setSubTab('koreksi')}
          style={{ padding: '7px 14px', fontSize: '12.5px' }}
        >
          <FileText size={14} style={{ marginRight: '6px' }} />
          Daftar Koreksi Jadwal &amp; Tukar Shift ({koreksiList.length})
        </button>
        <button
          type="button"
          className={subTab === 'tukar' ? 'btn-primary-sdm' : 'btn-secondary-sdm'}
          onClick={() => setSubTab('tukar')}
          style={{ padding: '7px 14px', fontSize: '12.5px' }}
        >
          <ArrowLeftRight size={14} style={{ marginRight: '6px' }} />
          Pengajuan Tukar Dinas Berpasangan ({tukarList.length})
        </button>
      </div>

      {/* ════════════════ TOOLBAR & CONTROLS ════════════════ */}
      <div className="tukar-toolbar">
        <div className="tukar-toolbar-left">
          {/* Month / Year */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} color="#64748b" />
            <select
              value={bulan}
              onChange={(e) => setBulan(parseInt(e.target.value))}
              className="form-control-sdm"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            >
              {NAMA_BULAN.map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={tahun}
              onChange={(e) => setTahun(parseInt(e.target.value))}
              className="form-control-sdm"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {subTab === 'tukar' ? (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-control-sdm"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            >
              <option value="">Semua Status Pengajuan</option>
              <option value="menunggu_atasan">Menunggu Verifikasi</option>
              <option value="disetujui">Disetujui</option>
              <option value="ditolak">Ditolak</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          ) : (
            <select
              value={jenisKoreksiFilter}
              onChange={(e) => setJenisKoreksiFilter(e.target.value)}
              className="form-control-sdm"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            >
              <option value="">Semua Jenis Koreksi</option>
              {JENIS_KOREKSI_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {/* Unit Filter */}
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="form-control-sdm"
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            <option value="">Semua Unit Kerja</option>
            {distinctUnits.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Cari Nama / PIN / Alasan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control-sdm"
              style={{ paddingLeft: '32px', fontSize: '12px', height: '34px' }}
            />
          </div>
        </div>

        <div className="tukar-toolbar-right">
          {hasSdmAccess && (
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={() => setIsKoreksiModalOpen(true)}
              style={{ padding: '7px 14px', fontSize: '12.5px' }}
            >
              <Plus size={15} style={{ marginRight: '5px' }} />
              Catat Koreksi / Izin / Cuti
            </button>
          )}

          <button
            type="button"
            className="btn-primary-sdm"
            onClick={() => setIsCreateModalOpen(true)}
            style={{ padding: '7px 14px', fontSize: '12.5px' }}
          >
            <Plus size={15} style={{ marginRight: '6px' }} />
            Ajukan Tukar Dinas
          </button>

          <button
            type="button"
            className="btn-secondary-sdm"
            onClick={fetchTukarList}
            disabled={loading}
            style={{ padding: '7px 12px', fontSize: '12px' }}
            title="Segarkan data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ════════════════ TABLE DATA: SUB-TAB KOREKSI (TUKAR SHIF) ════════════════ */}
      {subTab === 'koreksi' ? (
        <div className="tukar-table-card">
          {loading && koreksiList.length === 0 ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
              <p style={{ fontWeight: '600' }}>Memuat daftar koreksi jadwal &amp; tukar shift...</p>
            </div>
          ) : koreksiList.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
              <FileText size={36} style={{ margin: '0 auto 12px auto', display: 'block', color: '#94a3b8' }} />
              <h4 style={{ margin: 0, fontSize: 16 }}>Belum Ada Koreksi Jadwal pada Periode Ini</h4>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                Seluruh jadwal berjalan sesuai Jadwal Master. Gunakan tombol "+ Catat Koreksi / Izin / Cuti" untuk menambahkan perubahan.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tukar-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>No</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                    <th style={{ width: 80 }}>PIN</th>
                    <th>Nama Pegawai &amp; Unit</th>
                    <th>Shift Koreksi (Baru)</th>
                    <th>Jenis Koreksi</th>
                    <th>Keterangan / Alasan</th>
                    {hasSdmAccess && <th style={{ width: 120, textAlign: 'center' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {(pageSize === 'all' ? koreksiList : koreksiList.slice((page - 1) * pageSize, page * pageSize)).map((item, idx) => {
                    const rowNum = (pageSize === 'all' ? 0 : (page - 1) * pageSize) + idx + 1;
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b' }}>
                          {rowNum}
                        </td>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>
                          {item.tanggal}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>
                          {item.pegawai_pin || '-'}
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>
                            {item.pegawai_nama}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {item.pegawai_unit || '-'}
                          </div>
                        </td>
                        <td>
                          <div className="swap-badge-flow">
                            <span className="shift-tag" style={{ background: item.shift_warna || '#3b82f6' }}>
                              {item.shift_kode}
                            </span>
                            <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#334155' }}>
                              {item.shift_nama}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="tukar-status-pill disetujui">
                            {item.jenis_label}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#334155' }}>
                          {item.alasan || '-'}
                        </td>
                        {hasSdmAccess && (
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              onClick={() => handleDeleteKoreksi(item)}
                              disabled={actionLoadingId === `kor-${item.id}`}
                              style={{ padding: '4px 10px', fontSize: '11px', color: '#ef4444' }}
                              title="Hapus koreksi ini dan kembalikan ke Jadwal Master"
                            >
                              Reset ke Master
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={koreksiList.length}
                page={page}
                setPage={setPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                label="koreksi jadwal"
              />
            </div>
          )}
        </div>
      ) : (
        /* ════════════════ TABLE DATA: SUB-TAB PENGAJUAN TUKAR DINAS BERPASANGAN ════════════════ */
        <div className="tukar-table-card">
          {loading && tukarList.length === 0 ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
              <p style={{ fontWeight: '600' }}>Memuat riwayat tukar dinas...</p>
            </div>
          ) : tukarList.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
              <ArrowLeftRight size={36} style={{ margin: '0 auto 12px auto', display: 'block', color: '#94a3b8' }} />
              <h4 style={{ margin: 0, fontSize: 16 }}>Belum Ada Pengajuan Tukar Dinas Berpasangan</h4>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                Gunakan tombol "+ Ajukan Tukar Dinas" di atas untuk mengajukan pertukaran shift antar staf, atau buka tab "Daftar Koreksi Jadwal" untuk melihat seluruh 171+ log koreksi shift.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tukar-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>No</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                    <th>Pemohon &amp; Perubahan Shift</th>
                    <th style={{ width: 36, textAlign: 'center' }}>↔</th>
                    <th>Rekan Pengganti &amp; Shift</th>
                    <th>Jenis &amp; Alasan</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th>Verifikasi</th>
                    <th style={{ width: 115, textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(pageSize === 'all' ? tukarList : tukarList.slice((page - 1) * pageSize, page * pageSize)).map((item, idx) => {
                    const rowNum = (pageSize === 'all' ? 0 : (page - 1) * pageSize) + idx + 1;
                    return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b' }}>
                        {rowNum}
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {item.tanggal_pemohon}
                        </div>
                        {item.tanggal_pengganti && item.tanggal_pengganti !== item.tanggal_pemohon && (
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                            vs {item.tanggal_pengganti}
                          </div>
                        )}
                      </td>

                      {/* Pemohon */}
                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {item.pemohon_nama}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {item.pemohon_unit}
                        </div>
                        <div className="swap-badge-flow" style={{ marginTop: '4px' }}>
                          <span className="shift-tag" style={{ background: item.shift_asal_pemohon_warna || '#64748b' }}>
                            {item.shift_asal_pemohon_kode}
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>➔</span>
                          <span className="shift-tag" style={{ background: item.shift_tujuan_pemohon_warna || '#3b82f6' }}>
                            {item.shift_tujuan_pemohon_kode}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                            {item.shift_tujuan_pemohon_nama}
                          </span>
                        </div>
                      </td>

                      {/* Swap Arrow */}
                      <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                        <ArrowLeftRight size={16} />
                      </td>

                      {/* Pengganti */}
                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {item.pengganti_nama}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {item.pengganti_unit}
                        </div>
                        {item.shift_tujuan_pengganti_kode && item.shift_tujuan_pengganti_kode !== '-' ? (
                          <div className="swap-badge-flow" style={{ marginTop: '4px' }}>
                            <span className="shift-tag" style={{ background: item.shift_asal_pengganti_warna || '#64748b' }}>
                              {item.shift_asal_pengganti_kode}
                            </span>
                            <span style={{ fontSize: '10px', color: '#64748b' }}>➔</span>
                            <span className="shift-tag" style={{ background: item.shift_tujuan_pengganti_warna || '#3b82f6' }}>
                              {item.shift_tujuan_pengganti_kode}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                              {item.shift_tujuan_pengganti_nama}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                            Pengganti Tunggal
                          </span>
                        )}
                      </td>

                      {/* Jenis & Alasan */}
                      <td>
                        <div style={{ fontSize: '11.5px', fontWeight: '600', color: '#475569' }}>
                          {item.jenis_label}
                        </div>
                        <div style={{ fontSize: '12px', color: '#0f172a', marginTop: '2px' }}>
                          {item.alasan || '-'}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`tukar-status-pill ${item.status}`}>
                          {item.status === 'disetujui' && <CheckCircle2 size={13} />}
                          {item.status === 'menunggu_atasan' && <Clock size={13} />}
                          {(item.status === 'ditolak' || item.status === 'dibatalkan') && <XCircle size={13} />}
                          {item.status_label}
                        </span>
                      </td>

                      {/* Verifikasi */}
                      <td>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                          {item.disetujui_oleh_name || '-'}
                        </div>
                        {item.catatan_atasan && (
                          <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                            "{item.catatan_atasan}"
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }}>
                        {item.status === 'menunggu_atasan' && hasSdmAccess ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="btn-primary-sdm"
                              onClick={() => handleApprove(item)}
                              disabled={actionLoadingId === item.id}
                              style={{ padding: '4px 8px', fontSize: '11px', background: '#10b981' }}
                              title="Setujui dan Perbarui Roster Otomatis"
                            >
                              <Check size={12} />
                              Setujui
                            </button>
                            <button
                              type="button"
                              className="btn-secondary-sdm"
                              onClick={() => handleReject(item)}
                              disabled={actionLoadingId === item.id}
                              style={{ padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}
                              title="Tolak Pengajuan"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : item.status === 'disetujui' && hasSdmAccess ? (
                          <button
                            type="button"
                            className="btn-secondary-sdm"
                            onClick={() => handleCancelTukar(item)}
                            disabled={actionLoadingId === item.id}
                            style={{ padding: '4px 10px', fontSize: '11px', color: '#d97706' }}
                            title="Batalkan Tukar Dinas & Kembalikan ke Jadwal Master"
                          >
                            Batalkan
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <SdmPagination
                totalItems={tukarList.length}
                page={page}
                setPage={setPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                label="pengajuan tukar dinas"
              />
            </div>
          )}
        </div>
      )}

      {/* ════════════════ MODAL: CATAT KOREKSI JADWAL (TUNGGAL / IZIN / SAKIT / CUTI) ════════════════ */}
      {isKoreksiModalOpen && createPortal(
        <div className="tukar-modal-backdrop" onClick={() => setIsKoreksiModalOpen(false)}>
          <div className="tukar-modal-content" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateKoreksiSubmit}>
              <div className="tukar-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} style={{ color: '#2563eb' }} />
                  <div>
                    <div className="tukar-modal-title">Catat Koreksi Jadwal / Izin / Cuti</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Tersimpan di layer Koreksi tanpa merusak Jadwal Master bulanan
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsKoreksiModalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="tukar-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                      Pilih Pegawai:
                    </label>
                    <select
                      value={koreksiForm.pegawai_id}
                      onChange={(e) => setKoreksiForm({ ...koreksiForm, pegawai_id: e.target.value, shift_id: '' })}
                      className="form-control-sdm"
                      style={{ width: '100%' }}
                      required
                    >
                      <option value="">-- Pilih Pegawai --</option>
                      {allPegawai.map(p => (
                        <option key={p.id} value={p.id}>{p.nama} ({p.unit_kerja || '-'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                      Tanggal Dinas:
                    </label>
                    <DateField
                      value={koreksiForm.tanggal}
                      onChange={(val) => setKoreksiForm({ ...koreksiForm, tanggal: val })}
                      placeholder="Pilih tanggal"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                      Jenis Koreksi:
                    </label>
                    <select
                      value={koreksiForm.jenis}
                      onChange={(e) => setKoreksiForm({ ...koreksiForm, jenis: e.target.value })}
                      className="form-control-sdm"
                      style={{ width: '100%' }}
                    >
                      {JENIS_KOREKSI_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                      Shift Koreksi (Sesuai Kelompok Pegawai):
                    </label>
                    <select
                      value={koreksiForm.shift_id}
                      onChange={(e) => setKoreksiForm({ ...koreksiForm, shift_id: e.target.value })}
                      className="form-control-sdm"
                      style={{ width: '100%' }}
                      required
                    >
                      <option value="">-- Pilih Shift Baru --</option>
                      {koreksiShifts.map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.kode}] {s.nama} {s.is_libur ? '(Non-Hadir/Libur)' : `(${s.jam_masuk ? s.jam_masuk.substring(0, 5) : ''} - ${s.jam_pulang ? s.jam_pulang.substring(0, 5) : ''})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11.5px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                    Alasan / Keterangan:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Tukar shift dengan Chopipah, Cuti Tahunan, Izin Pagi, dll."
                    value={koreksiForm.alasan}
                    onChange={(e) => setKoreksiForm({ ...koreksiForm, alasan: e.target.value })}
                    className="form-control-sdm"
                    style={{ width: '100%', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div className="tukar-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-sdm"
                  onClick={() => setIsKoreksiModalOpen(false)}
                  disabled={creatingKoreksi}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sdm"
                  disabled={creatingKoreksi}
                >
                  {creatingKoreksi ? 'Menyimpan...' : 'Simpan Koreksi'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ MODAL: AJUKAN TUKAR DINAS ════════════════ */}
      {isCreateModalOpen && createPortal(
        <div className="tukar-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="tukar-modal-content" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateSubmit}>
              <div className="tukar-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ArrowLeftRight size={20} style={{ color: '#2563eb' }} />
                  <div>
                    <div className="tukar-modal-title">Form Pengajuan Tukar Dinas Staf</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Pilih pemohon dan rekan pengganti untuk pertukaran shift resmi
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="tukar-modal-body">
                {/* Jenis Pertukaran */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                    Jenis Pertukaran Dinas:
                  </label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                    className="form-control-sdm"
                    style={{ width: '100%' }}
                  >
                    <option value="tukar_shift">Tukar Shift (Pada Tanggal yang Sama)</option>
                    <option value="tukar_hari">Tukar Hari Dinas (Lintas Tanggal Berbeda)</option>
                    <option value="ganti_jaga">Ganti Jaga / Pengganti Tunggal</option>
                  </select>
                </div>

                {/* Section 1: Pemohon */}
                <div className="tukar-section-box">
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6', marginBottom: '8px', display: 'block' }}>
                    1. Data Pemohon (Staf Pertama):
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Pilih Pegawai:</label>
                      <select
                        value={formData.pemohon_id}
                        onChange={(e) => setFormData({ ...formData, pemohon_id: e.target.value, shift_tujuan_pemohon_id: '' })}
                        className="form-control-sdm"
                        style={{ width: '100%', marginTop: '2px' }}
                        required
                      >
                        <option value="">-- Pilih Pemohon --</option>
                        {allPegawai.map(p => (
                          <option key={p.id} value={p.id}>{p.nama} ({p.unit_kerja || '-'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '2px' }}>Tanggal Dinas:</label>
                      <DateField
                        value={formData.tanggal_pemohon}
                        onChange={(val) => setFormData({ ...formData, tanggal_pemohon: val })}
                        placeholder="Pilih tanggal"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Shift Baru yang Dituju Pemohon:</label>
                    <select
                      value={formData.shift_tujuan_pemohon_id}
                      onChange={(e) => setFormData({ ...formData, shift_tujuan_pemohon_id: e.target.value })}
                      className="form-control-sdm"
                      style={{ width: '100%', marginTop: '2px' }}
                      required
                    >
                      <option value="">-- Pilih Shift Tujuan --</option>
                      {pemohonShifts.map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.kode}] {s.nama} ({s.jam_masuk ? s.jam_masuk.substring(0, 5) : ''} - {s.jam_pulang ? s.jam_pulang.substring(0, 5) : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section 2: Rekan Pengganti */}
                <div className="tukar-section-box">
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'block' }}>
                    2. Data Rekan Pengganti (Staf Kedua):
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Pilih Rekan Pengganti:</label>
                      <select
                        value={formData.pengganti_id}
                        onChange={(e) => setFormData({ ...formData, pengganti_id: e.target.value, shift_tujuan_pengganti_id: '' })}
                        className="form-control-sdm"
                        style={{ width: '100%', marginTop: '2px' }}
                        required
                      >
                        <option value="">-- Pilih Rekan Pengganti --</option>
                        {allPegawai.map(p => (
                          <option key={p.id} value={p.id}>{p.nama} ({p.unit_kerja || '-'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '2px' }}>Tanggal Dinas Rekan:</label>
                      <DateField
                        value={formData.tanggal_pengganti}
                        onChange={(val) => setFormData({ ...formData, tanggal_pengganti: val })}
                        placeholder="Pilih tanggal"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Shift Baru yang Dituju Rekan:</label>
                    <select
                      value={formData.shift_tujuan_pengganti_id}
                      onChange={(e) => setFormData({ ...formData, shift_tujuan_pengganti_id: e.target.value })}
                      className="form-control-sdm"
                      style={{ width: '100%', marginTop: '2px' }}
                    >
                      <option value="">-- Pilih Shift Tujuan Rekan --</option>
                      {penggantiShifts.map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.kode}] {s.nama} ({s.jam_masuk ? s.jam_masuk.substring(0, 5) : ''} - {s.jam_pulang ? s.jam_pulang.substring(0, 5) : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section 3: Alasan */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                    Alasan Tukar Dinas:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Keperluan keluarga mendesak, jadwal kuliah, dll."
                    value={formData.alasan}
                    onChange={(e) => setFormData({ ...formData, alasan: e.target.value })}
                    className="form-control-sdm"
                    style={{ width: '100%', fontSize: '12.5px' }}
                    required
                  />
                </div>
              </div>

              <div className="tukar-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-sdm"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creating}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sdm"
                  disabled={creating}
                >
                  {creating ? 'Menyimpan...' : 'Simpan & Ajukan'}
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

