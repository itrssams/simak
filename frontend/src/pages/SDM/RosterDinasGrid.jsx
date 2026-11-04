import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Building2,
  X,
  AlertCircle,
  HelpCircle,
  Moon,
  Sun,
  FileSpreadsheet
} from 'lucide-react';
import './RosterDinasGrid.css';
import SdmPagination from './SdmPagination';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const KELOMPOK_LABELS = {
  UMUM: 'Medis & Umum',
  CS: 'Cleaning Service (CS)',
  SECURITY_DRIVER: 'Security & Driver',
  MITRA: 'Mitra & Kerohanian',
};

const JENIS_KOREKSI_OPTIONS = [
  { value: 'manual', label: 'Koreksi Manual SDM' },
  { value: 'tukar_shift', label: 'Tukar Shift (Hari Sama)' },
  { value: 'tukar_hari', label: 'Tukar Hari Libur / Off' },
  { value: 'ganti_jaga', label: 'Ganti Jaga / Backup' },
  { value: 'izin', label: 'Izin (I / IP / IS / IM)' },
  { value: 'sakit', label: 'Sakit (S)' },
  { value: 'cuti', label: 'Cuti (CT / CM / CL / Cap)' },
];

function getKelompokPegawai(pegawai) {
  if (!pegawai) return 'UMUM';
  if (pegawai.kelompok) return pegawai.kelompok;
  if (['CS', 'SECURITY_DRIVER', 'MITRA'].includes(pegawai.kategori)) {
    return pegawai.kategori;
  }
  return 'UMUM';
}

export default function RosterDinasGrid({ hasSdmAccess = true, activeShifts = [] }) {
  const { showToast } = useToast();

  // Selected Month & Year (Default to October 2026 where imported data lives)
  const [bulan, setBulan] = useState(10);
  const [tahun, setTahun] = useState(2026);
  const [viewMode, setViewMode] = useState('final'); // 'final' | 'master'
  const [legendKelompok, setLegendKelompok] = useState('UMUM');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => { setPage(1); }, [bulan, tahun, selectedUnit, searchQuery, viewMode]);

  // Matrix Data State
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Cell Editor Modal State
  const [selectedCell, setSelectedCell] = useState(null); // { pegawai, day, dateStr, currentShift }
  const [savingCell, setSavingCell] = useState(false);
  const [resettingCell, setResettingCell] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [selectedJenisKoreksi, setSelectedJenisKoreksi] = useState('manual');
  const [cellCatatan, setCellCatatan] = useState('');

  // Copy Month Modal State
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyForm, setCopyForm] = useState({
    from_bulan: 10,
    from_tahun: 2026,
    to_bulan: 11,
    to_tahun: 2026,
    unit: '',
    overwrite: true,
  });
  const [copyingMonth, setCopyingMonth] = useState(false);

  // Master Shifts Lookup
  const [masterShifts, setMasterShifts] = useState(activeShifts || []);

  // Fetch shifts if not provided
  useEffect(() => {
    if (!activeShifts || activeShifts.length === 0) {
      api.get('/sdm/shift/?is_active=true')
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : (res.data.results || []);
          setMasterShifts(list);
        })
        .catch(err => console.error('Error fetching master shifts:', err));
    } else {
      setMasterShifts(activeShifts);
    }
  }, [activeShifts]);

  // Fetch Monthly Matrix Data
  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        bulan,
        tahun,
        mode: viewMode,
      };
      if (selectedUnit) params.unit = selectedUnit;
      if (searchQuery) params.search = searchQuery;

      const res = await api.get('/sdm/roster/matrix/', { params });
      setMatrixData(res.data);
    } catch (err) {
      console.error('Error fetching roster matrix:', err);
      showToast('Gagal memuat jadwal dinas bulanan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, viewMode, selectedUnit, searchQuery, showToast]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix, refreshKey]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (bulan === 1) {
      setBulan(12);
      setTahun(prev => prev - 1);
    } else {
      setBulan(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (bulan === 12) {
      setBulan(1);
      setTahun(prev => prev + 1);
    } else {
      setBulan(prev => prev + 1);
    }
  };

  // Distinct units from matrix data for filtering
  const distinctUnits = useMemo(() => {
    if (!matrixData?.pegawai_rows) return [];
    const units = new Set();
    matrixData.pegawai_rows.forEach(p => {
      if (p.unit_kerja && p.unit_kerja !== '-') {
        units.add(p.unit_kerja);
      }
    });
    return Array.from(units).sort();
  }, [matrixData]);

  // Handle Cell Click to Open Shift Picker
  const handleCellClick = (pegawai, dayMeta) => {
    if (!hasSdmAccess) return;
    const currentShift = pegawai.shifts[String(dayMeta.day)];
    setSelectedCell({
      pegawai,
      day: dayMeta.day,
      dayName: dayMeta.day_name,
      dateStr: dayMeta.date_str,
      currentShift,
    });
    setSelectedShiftId(currentShift ? currentShift.shift_id : null);
    setSelectedJenisKoreksi(currentShift?.jenis_koreksi || 'manual');
    setCellCatatan(currentShift ? (currentShift.alasan || currentShift.catatan || '') : '');
  };

  // Save Selected Shift for Single Cell
  const handleSaveCell = async () => {
    if (!selectedCell || !selectedShiftId) {
      showToast('Pilih pola shift terlebih dahulu.', 'warning');
      return;
    }

    setSavingCell(true);
    try {
      const payload = {
        pegawai_id: selectedCell.pegawai.id,
        tanggal: selectedCell.dateStr,
        shift_id: selectedShiftId,
        catatan: cellCatatan,
        mode: viewMode,
        jenis: selectedJenisKoreksi,
      };

      await api.post('/sdm/roster/update_cell/', payload);

      showToast(
        viewMode === 'master'
          ? `Jadwal Master ${selectedCell.pegawai.nama} tgl ${selectedCell.day} diperbarui!`
          : `Koreksi Jadwal ${selectedCell.pegawai.nama} tgl ${selectedCell.day} disimpan!`,
        'success'
      );
      setSelectedCell(null);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error updating shift cell:', err);
      showToast(err.response?.data?.detail || 'Gagal menyimpan perubahan shift.', 'error');
    } finally {
      setSavingCell(false);
    }
  };

  // Reset Cell to Master
  const handleResetCell = async () => {
    if (!selectedCell) return;
    setResettingCell(true);
    try {
      await api.post('/sdm/roster/reset_cell/', {
        pegawai_id: selectedCell.pegawai.id,
        tanggal: selectedCell.dateStr,
      });
      showToast(`Jadwal ${selectedCell.pegawai.nama} tgl ${selectedCell.day} dikembalikan ke Jadwal Master.`, 'success');
      setSelectedCell(null);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error resetting shift cell:', err);
      showToast(err.response?.data?.detail || 'Gagal mereset ke jadwal master.', 'error');
    } finally {
      setResettingCell(false);
    }
  };

  // Copy Month Handler
  const handleCopyMonthSubmit = async (e) => {
    e.preventDefault();
    setCopyingMonth(true);
    try {
      const res = await api.post('/sdm/roster/copy_month/', copyForm);
      showToast(res.data.detail || 'Jadwal dinas berhasil disalin!', 'success');
      setIsCopyModalOpen(false);
      setBulan(copyForm.to_bulan);
      setTahun(copyForm.to_tahun);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error copying roster month:', err);
      showToast(err.response?.data?.detail || 'Gagal menyalin jadwal dinas.', 'error');
    } finally {
      setCopyingMonth(false);
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const params = new URLSearchParams({
      bulan: String(bulan),
      tahun: String(tahun),
    });
    if (selectedUnit) params.append('unit', selectedUnit);
    if (searchQuery) params.append('search', searchQuery);

    const downloadUrl = `/api/sdm/roster/export_excel/?${params.toString()}`;
    window.open(downloadUrl, '_blank');
  };

  // Shifts filtered for the selected employee's kelompok in the modal
  const modalFilteredShifts = useMemo(() => {
    if (!selectedCell?.pegawai) return masterShifts;
    const kel = getKelompokPegawai(selectedCell.pegawai);
    return masterShifts.filter(s => s.kelompok === kel);
  }, [masterShifts, selectedCell]);

  // Shifts for dynamic legend bar based on selected legendKelompok
  const legendShifts = useMemo(() => {
    return masterShifts.filter(s => s.kelompok === legendKelompok);
  }, [masterShifts, legendKelompok]);

  return (
    <div className="roster-grid-container">
      {/* ════════════════ TOOLBAR & CONTROLS ════════════════ */}
      <div className="roster-toolbar">
        <div className="roster-toolbar-left">
          {/* Mode Toggle: Jadwal Berjalan (Final) vs Jadwal Master */}
          {hasSdmAccess && (
            <div className="roster-mode-toggle" title="Pilih layer jadwal yang ditampilkan">
              <button
                type="button"
                className={`roster-mode-btn ${viewMode === 'final' ? 'active' : ''}`}
                onClick={() => setViewMode('final')}
              >
                Jadwal Final
              </button>
              <button
                type="button"
                className={`roster-mode-btn ${viewMode === 'master' ? 'active is-master' : ''}`}
                onClick={() => setViewMode('master')}
              >
                Master
              </button>
            </div>
          )}

          {/* Month / Year Navigator */}
          <div className="roster-month-nav">
            <button
              type="button"
              className="roster-month-btn"
              onClick={handlePrevMonth}
              title="Bulan Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="roster-month-title">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </div>
            <button
              type="button"
              className="roster-month-btn"
              onClick={handleNextMonth}
              title="Bulan Berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Quick Jump to October 2026 */}
          {(bulan !== 10 || tahun !== 2026) && (
            <button
              type="button"
              className="btn-secondary-sdm"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => {
                setBulan(10);
                setTahun(2026);
              }}
            >
              <Calendar size={13} style={{ marginRight: '4px' }} />
              Ke Data Roster Okt 2026
            </button>
          )}

          {/* Unit Filter */}
          <div className="filter-input roster-filter-box">
            <Building2 size={14} />
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="roster-filter-select"
            >
              <option value="">Semua Unit Kerja RS</option>
              {distinctUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="filter-input roster-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Cari Staf / PIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="roster-search-clear"
                onClick={() => setSearchQuery('')}
                title="Bersihkan pencarian"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="roster-toolbar-right">
          {hasSdmAccess && (
            <button
              type="button"
              className="btn-secondary-sdm"
              onClick={() => setIsCopyModalOpen(true)}
              style={{ padding: '7px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
              title="Salin Jadwal Master dari bulan lain"
            >
              <Copy size={14} style={{ marginRight: '6px' }} />
              Salin Master
            </button>
          )}

          <button
            type="button"
            className="btn-secondary-sdm"
            onClick={handleExportExcel}
            style={{ padding: '7px 12px', fontSize: '12px', color: '#10b981', whiteSpace: 'nowrap' }}
            title="Download Jadwal Dinas Bulanan (Final, Master & Koreksi) format Excel (.xlsx)"
          >
            <FileSpreadsheet size={14} style={{ marginRight: '6px' }} />
            Export Excel
          </button>

          <button
            type="button"
            className="btn-secondary-sdm"
            onClick={() => setRefreshKey(prev => prev + 1)}
            disabled={loading}
            style={{ padding: '7px 10px', fontSize: '12px' }}
            title="Segarkan data jadwal"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ════════════════ INTERACTIVE ROSTER TABLE GRID ════════════════ */}
      <div className="roster-table-wrapper">
        {loading && !matrixData ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
            <p style={{ fontWeight: '600' }}>Memuat jadwal dinas bulanan...</p>
          </div>
        ) : !matrixData || matrixData.pegawai_rows?.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 10px auto', display: 'block', color: '#94a3b8' }} />
            <p style={{ fontWeight: '600', fontSize: '14px' }}>Belum ada jadwal dinas pada periode ini.</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>
              Klik tombol "Salin Master Bulan Lalu" untuk menduplikasi jadwal master secara otomatis.
            </p>
          </div>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th className="col-sticky-no">No</th>
                <th className="col-sticky-pin">PIN</th>
                <th className="col-sticky-name">Nama Pegawai RS</th>
                <th className="col-sticky-unit">Unit Kerja</th>
                {matrixData.days.map(d => (
                  <th
                    key={d.day}
                    className={`col-day ${d.is_sunday ? 'is-sunday' : d.is_weekend ? 'is-saturday' : ''}`}
                    title={`${d.day_name}, ${d.date_str}`}
                  >
                    <div>{d.day}</div>
                    <div style={{ fontSize: '9px', fontWeight: 'normal', opacity: 0.85 }}>
                      {d.day_name.substring(0, 3)}
                    </div>
                  </th>
                ))}
                <th className="col-stat" title="Total Hari Kerja">Kerja</th>
                <th className="col-stat" title="Total Hari Libur">Libur</th>
              </tr>
            </thead>
            <tbody>
              {(pageSize === 'all' ? matrixData.pegawai_rows : matrixData.pegawai_rows.slice((page - 1) * pageSize, page * pageSize)).map((pegawai, pIdx) => {
                const rowNum = (pageSize === 'all' ? 0 : (page - 1) * pageSize) + pIdx + 1;
                return (
                  <tr key={pegawai.id}>
                    <td className="col-sticky-no">
                      <span className="roster-row-num">{rowNum}</span>
                    </td>
                    <td className="col-sticky-pin">
                      <span className="roster-pin-code">
                        {pegawai.pin || '-'}
                      </span>
                    </td>
                    <td className="col-sticky-name">
                      <div className="roster-emp-name">
                        {pegawai.nama}
                      </div>
                      <div className="roster-emp-role">
                        {pegawai.jabatan}
                      </div>
                    </td>
                    <td className="col-sticky-unit">
                      <span className="roster-emp-unit">
                        {pegawai.unit_kerja}
                      </span>
                    </td>

                    {/* Day Cells 1 to 31 */}
                    {matrixData.days.map(d => {
                      const shift = pegawai.shifts[String(d.day)];
                      const isKoreksi = viewMode === 'final' && shift?.sumber === 'koreksi';
                      let cellTooltip = `${pegawai.nama}\n${d.day_name}, ${d.day} ${NAMA_BULAN[bulan - 1]} ${tahun}`;
                      if (shift) {
                        cellTooltip += `\nShift: ${shift.kode} - ${shift.nama} (${shift.jam_masuk || '-'} - ${shift.jam_pulang || '-'})`;
                        if (isKoreksi) {
                          cellTooltip += `\n⚡ Koreksi: Master ${shift.shift_master_kode || '-'} → Final ${shift.kode}`;
                          if (shift.jenis_koreksi_label) {
                            cellTooltip += ` (${shift.jenis_koreksi_label}${shift.alasan ? ` — ${shift.alasan}` : ''})`;
                          }
                        } else if (shift.catatan) {
                          cellTooltip += `\nCatatan: ${shift.catatan}`;
                        }
                      } else {
                        cellTooltip += `\nKlik untuk atur shift`;
                      }

                      return (
                        <td
                          key={d.day}
                          className={`col-day-cell ${d.is_sunday ? 'is-sunday-cell' : ''} ${isKoreksi ? 'is-koreksi-cell' : ''}`}
                          onClick={() => handleCellClick(pegawai, d)}
                          title={cellTooltip}
                        >
                          {shift ? (
                            <div
                              className={`roster-shift-pill ${shift.is_libur ? 'is-libur' : ''} ${isKoreksi ? 'is-koreksi' : ''}`}
                              style={{
                                background: shift.warna || (shift.is_libur ? '#94a3b8' : '#3b82f6'),
                              }}
                            >
                              {shift.kode}
                              {isKoreksi && <span className="roster-koreksi-dot" />}
                            </div>
                          ) : (
                            <span className="roster-empty-cell">-</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Row Statistics */}
                    <td className="col-stat">
                      <span className="roster-stat-pill kerja">
                        {pegawai.stats?.total_kerja || 0}
                      </span>
                    </td>
                    <td className="col-stat">
                      <span className="roster-stat-pill libur">
                        {pegawai.stats?.total_libur || 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {matrixData && matrixData.pegawai_rows?.length > 0 && (
        <SdmPagination
          totalItems={matrixData.pegawai_rows.length}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          label="staf"
        />
      )}

      {/* ════════════════ DYNAMIC SHIFT LEGEND BAR (DI BAWAH TABEL) ════════════════ */}
      <div className="roster-legend-bar">
        <div className="roster-legend-list">
          <span className="roster-legend-title">Legenda Shift:</span>
          <select
            value={legendKelompok}
            onChange={(e) => setLegendKelompok(e.target.value)}
            className="roster-legend-group-select"
            title="Pilih kelompok pola shift untuk ditampilkan di legenda"
          >
            {Object.entries(KELOMPOK_LABELS).map(([k, lbl]) => (
              <option key={k} value={k}>{lbl}</option>
            ))}
          </select>

          {legendShifts.map(s => (
            <div key={s.id} className="roster-legend-item" title={s.nama}>
              <div
                className="roster-legend-color-dot"
                style={{ background: s.warna || (s.is_libur ? '#94a3b8' : '#3b82f6') }}
              />
              <span>
                <strong>{s.kode}</strong>{' '}
                {s.is_libur
                  ? `(${s.nama})`
                  : `(${s.jam_masuk ? s.jam_masuk.substring(0, 5) : '-'} - ${s.jam_pulang ? s.jam_pulang.substring(0, 5) : '-'})`}
              </span>
            </div>
          ))}
        </div>

        {viewMode === 'final' && (
          <div className="roster-legend-meta">
            <span className="roster-legend-koreksi-badge" title="Sel dengan titik kuning menandakan ada perubahan dari Jadwal Master (Tukar Shift / Izin / Koreksi)">
              <span className="roster-koreksi-dot-inline" />
              Koreksi / Tukar Shift: <strong>{matrixData?.summary?.total_koreksi || 0}</strong> sel
            </span>
          </div>
        )}
      </div>

      {/* ════════════════ SHIFT PICKER MODAL ════════════════ */}
      {selectedCell && createPortal(
        <div className="roster-modal-backdrop" onClick={() => setSelectedCell(null)}>
          <div className="roster-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} style={{ color: '#3b82f6' }} />
                <div>
                  <div className="roster-modal-title">
                    {viewMode === 'master' ? 'Ubah Jadwal Dasar (Master)' : 'Koreksi Jadwal Berjalan (Final)'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {selectedCell.pegawai.nama} ({selectedCell.pegawai.unit_kerja}) • Kelompok:{' '}
                    <strong>{KELOMPOK_LABELS[getKelompokPegawai(selectedCell.pegawai)]}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="roster-modal-close-btn"
              >
                <X size={18} />
              </button>
            </div>

            <div className="roster-modal-body">
              <div className="roster-modal-info-box">
                <div>
                  <strong>Tanggal:</strong> {selectedCell.dayName}, {selectedCell.day} {NAMA_BULAN[bulan - 1]} {tahun}
                </div>
                {selectedCell.currentShift && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Shift Aktif ({viewMode === 'master' ? 'Master' : 'Final'}):</strong>{' '}
                    <span style={{ color: selectedCell.currentShift.warna, fontWeight: '700' }}>
                      {selectedCell.currentShift.kode} - {selectedCell.currentShift.nama}
                    </span>{' '}
                    ({selectedCell.currentShift.jam_masuk || '-'} s/d {selectedCell.currentShift.jam_pulang || '-'})
                  </div>
                )}
                {viewMode === 'final' && selectedCell.currentShift?.sumber === 'koreksi' && (
                  <div className="roster-koreksi-alert">
                    ⚡ <strong>Sel ini hasil Koreksi / Tukar Shift:</strong> Jadwal Master awal adalah{' '}
                    <strong>{selectedCell.currentShift.shift_master_kode || 'Kosong'}</strong>
                    {selectedCell.currentShift.jenis_koreksi_label ? ` (${selectedCell.currentShift.jenis_koreksi_label})` : ''}
                  </div>
                )}
              </div>

              <div>
                <label className="roster-modal-label">
                  Pilih Pola Shift ({KELOMPOK_LABELS[getKelompokPegawai(selectedCell.pegawai)]}):
                </label>
                <div className="roster-shift-options-grid">
                  {modalFilteredShifts.map(s => {
                    const isSelected = selectedShiftId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`roster-shift-option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedShiftId(s.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span
                            style={{
                              background: s.warna || '#3b82f6',
                              color: '#fff',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: '800',
                              fontSize: '11px'
                            }}
                          >
                            {s.kode}
                          </span>
                          {isSelected && <CheckCircle2 size={16} style={{ color: '#2563eb' }} />}
                        </div>
                        <div className="roster-shift-opt-name">
                          {s.nama}
                        </div>
                        <div className="roster-shift-opt-time">
                          {s.is_libur ? 'Libur / Non-Hadir' : `${s.jam_masuk ? s.jam_masuk.substring(0, 5) : ''} - ${s.jam_pulang ? s.jam_pulang.substring(0, 5) : ''}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {viewMode === 'final' && (
                <div>
                  <label className="roster-modal-label">
                    Jenis Koreksi Jadwal:
                  </label>
                  <select
                    value={selectedJenisKoreksi}
                    onChange={(e) => setSelectedJenisKoreksi(e.target.value)}
                    className="roster-modal-input"
                  >
                    {JENIS_KOREKSI_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="roster-modal-label">
                  {viewMode === 'master' ? 'Catatan Master (Opsional):' : 'Alasan / Keterangan Koreksi:'}
                </label>
                <input
                  type="text"
                  placeholder={viewMode === 'master' ? 'Catatan jadwal dasar...' : 'Misal: Tukar shift dengan rekan, izin mendadak, dll.'}
                  value={cellCatatan}
                  onChange={(e) => setCellCatatan(e.target.value)}
                  className="roster-modal-input"
                />
              </div>
            </div>

            <div className="roster-modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                {viewMode === 'final' && selectedCell.currentShift?.sumber === 'koreksi' && (
                  <button
                    type="button"
                    className="btn-secondary-sdm"
                    style={{ color: '#d97706', borderColor: '#fcd34d' }}
                    onClick={handleResetCell}
                    disabled={resettingCell || savingCell}
                  >
                    {resettingCell ? 'Mereset...' : `Reset ke Master (${selectedCell.currentShift.shift_master_kode || '-'})`}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary-sdm"
                  onClick={() => setSelectedCell(null)}
                  disabled={savingCell || resettingCell}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-primary-sdm"
                  onClick={handleSaveCell}
                  disabled={savingCell || resettingCell || !selectedShiftId}
                >
                  {savingCell ? 'Menyimpan...' : viewMode === 'master' ? 'Simpan Master' : 'Simpan Koreksi'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ SALIN BULAN MODAL ════════════════ */}
      {isCopyModalOpen && createPortal(
        <div className="roster-modal-backdrop" onClick={() => setIsCopyModalOpen(false)}>
          <div className="roster-modal-content" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCopyMonthSubmit}>
              <div className="roster-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Copy size={20} style={{ color: '#3b82f6' }} />
                  <div>
                    <div className="roster-modal-title">Salin Jadwal Master Dari Bulan Lain</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Duplikasi susunan Jadwal Master staf lalu bangun ulang Jadwal Final otomatis
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCopyModalOpen(false)}
                  className="roster-modal-close-btn"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="roster-modal-body">
                <div className="roster-copy-period-grid">
                  {/* Source Month/Year */}
                  <div className="roster-copy-period-card">
                    <label className="roster-modal-label">
                      Sumber Master (Dari):
                    </label>
                    <div className="roster-copy-select-row">
                      <select
                        value={copyForm.from_bulan}
                        onChange={(e) => setCopyForm({ ...copyForm, from_bulan: parseInt(e.target.value) })}
                        className="roster-modal-input"
                      >
                        {NAMA_BULAN.map((m, idx) => (
                          <option key={idx + 1} value={idx + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={copyForm.from_tahun}
                        onChange={(e) => setCopyForm({ ...copyForm, from_tahun: parseInt(e.target.value) })}
                        className="roster-modal-input"
                      >
                        {[2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Target Month/Year */}
                  <div className="roster-copy-period-card">
                    <label className="roster-modal-label">
                      Tujuan Master (Ke):
                    </label>
                    <div className="roster-copy-select-row">
                      <select
                        value={copyForm.to_bulan}
                        onChange={(e) => setCopyForm({ ...copyForm, to_bulan: parseInt(e.target.value) })}
                        className="roster-modal-input"
                      >
                        {NAMA_BULAN.map((m, idx) => (
                          <option key={idx + 1} value={idx + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={copyForm.to_tahun}
                        onChange={(e) => setCopyForm({ ...copyForm, to_tahun: parseInt(e.target.value) })}
                        className="roster-modal-input"
                      >
                        {[2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="roster-modal-label">
                    Batasi Unit Kerja Tertentu (Opsional):
                  </label>
                  <select
                    value={copyForm.unit}
                    onChange={(e) => setCopyForm({ ...copyForm, unit: e.target.value })}
                    className="roster-modal-input"
                  >
                    <option value="">Seluruh Unit Kerja Rumah Sakit (Semua Staf)</option>
                    {distinctUnits.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>

                <label htmlFor="overwrite-check" className="roster-overwrite-banner">
                  <input
                    type="checkbox"
                    id="overwrite-check"
                    checked={copyForm.overwrite}
                    onChange={(e) => setCopyForm({ ...copyForm, overwrite: e.target.checked })}
                  />
                  <span>
                    Timpa Jadwal Master yang sudah ada di bulan tujuan jika ada bentrok
                  </span>
                </label>
              </div>

              <div className="roster-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-sdm"
                  onClick={() => setIsCopyModalOpen(false)}
                  disabled={copyingMonth}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-primary-sdm"
                  disabled={copyingMonth}
                >
                  {copyingMonth ? 'Menyalin Master...' : 'Mulai Salin Master'}
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

