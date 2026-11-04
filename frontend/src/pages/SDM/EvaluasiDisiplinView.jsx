import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import {
  AlertTriangle,
  FileText,
  Printer,
  X,
  Search,
  Filter,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  UserX,
  Users,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Award
} from 'lucide-react';
import './EvaluasiDisiplinView.css';
import SdmPagination from './SdmPagination';

export default function EvaluasiDisiplinView() {
  const { showToast } = useToast();

  const [bulan, setBulan] = useState(10);
  const [tahun, setTahun] = useState(2026);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => { setPage(1); }, [bulan, tahun, searchQuery, statusFilter]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ kpi: {}, results: [] });

  // Modal Surat Binaan State
  const [selectedPegawai, setSelectedPegawai] = useState(null);
  const [suratLoading, setSuratLoading] = useState(false);
  const [suratData, setSuratData] = useState(null);
  const [selectedTingkat, setSelectedTingkat] = useState('SP_1');
  const [modalTab, setModalTab] = useState('surat'); // 'surat' | 'rincian'

  const fetchEvaluasi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sdm/presensi/evaluasi_disiplin/', {
        params: {
          bulan,
          tahun,
          status_disiplin: statusFilter || undefined,
          search: searchQuery || undefined
        }
      });
      setData(res.data);
    } catch (err) {
      console.error('Gagal mengambil data evaluasi disiplin:', err);
      showToast('Gagal memuat evaluasi disiplin pegawai.', 'error');
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, statusFilter, searchQuery, showToast]);

  useEffect(() => {
    fetchEvaluasi();
  }, [fetchEvaluasi]);

  // Fetch Surat Binaan Detail
  const handleOpenSuratModal = async (pegawai, tingkatDefault = null) => {
    setSelectedPegawai(pegawai);
    const tingkat = tingkatDefault || (pegawai.status_disiplin === 'SP_2' ? 'SP_2' : pegawai.status_disiplin === 'TEGURAN_LISAN' ? 'TEGURAN_LISAN' : 'SP_1');
    setSelectedTingkat(tingkat);
    setModalTab('surat');
    setSuratLoading(true);

    try {
      const res = await api.get('/sdm/presensi/cetak_surat_binaan/', {
        params: {
          pegawai_id: pegawai.pegawai_id,
          bulan,
          tahun,
          tingkat
        }
      });
      setSuratData(res.data);
    } catch (err) {
      console.error('Gagal memuat draft surat binaan:', err);
      showToast('Gagal memuat draft surat pembinaan.', 'error');
    } finally {
      setSuratLoading(false);
    }
  };

  const handleTingkatChange = async (newTingkat) => {
    if (!selectedPegawai) return;
    setSelectedTingkat(newTingkat);
    setSuratLoading(true);
    try {
      const res = await api.get('/sdm/presensi/cetak_surat_binaan/', {
        params: {
          pegawai_id: selectedPegawai.pegawai_id,
          bulan,
          tahun,
          tingkat: newTingkat
        }
      });
      setSuratData(res.data);
    } catch (err) {
      showToast('Gagal memperbarui klausul surat.', 'error');
    } finally {
      setSuratLoading(false);
    }
  };

  // Export Excel Bulanan
  const handleExportExcel = async () => {
    try {
      const res = await api.get('/sdm/presensi/export_excel_bulanan/', {
        params: { bulan, tahun },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Rekap_Disiplin_SDM_${tahun}_${String(bulan).padStart(2, '0')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Laporan kedisiplinan bulanan berhasil diunduh.', 'success');
    } catch (err) {
      showToast('Gagal mengunduh laporan Excel.', 'error');
    }
  };

  const handlePrintSurat = () => {
    window.print();
  };

  const kpi = data.kpi || {};

  return (
    <div className="disiplin-view-root">
      {/* ── Top Header Bar ── */}
      <div className="disiplin-header-card">
        <div>
          <div className="disiplin-title-pill">
            <ShieldAlert size={14} />
            <span>MODUL SDM • STEP 6</span>
          </div>
          <h2 className="disiplin-title">Evaluasi Kedisiplinan & Surat Pembinaan</h2>
          <p className="disiplin-subtitle">
            Monitoring pelanggaran jam kerja, keterlambatan akumulatif, ketidakhadiran (alfa), dan penerbitan Surat Peringatan (SP) resmi RS Siaga Al Munawwarah Samarinda.
          </p>
        </div>

        <div className="disiplin-header-actions">
          <button
            type="button"
            className="btn-excel-disiplin"
            onClick={handleExportExcel}
            title="Ekspor Rekapitulasi Disiplin ke Excel"
          >
            <Download size={15} />
            <span>Unduh Rekap Excel</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="disiplin-kpi-grid">
        <div className="disiplin-kpi-card total">
          <div className="kpi-icon-wrap blue"><Users size={20} /></div>
          <div>
            <div className="kpi-val">{kpi.total_pegawai || 0}</div>
            <div className="kpi-lbl">Total Pegawai Dievaluasi</div>
          </div>
        </div>

        <div className="disiplin-kpi-card baik" onClick={() => setStatusFilter('BAIK')} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrap green"><CheckCircle size={20} /></div>
          <div>
            <div className="kpi-val">{kpi.disiplin_baik || 0}</div>
            <div className="kpi-lbl">Disiplin Sangat Baik</div>
          </div>
        </div>

        <div className="disiplin-kpi-card ringan" onClick={() => setStatusFilter('TEGURAN_LISAN')} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrap yellow"><AlertCircle size={20} /></div>
          <div>
            <div className="kpi-val">{kpi.perlu_pembinaan_ringan || 0}</div>
            <div className="kpi-lbl">Perlu Teguran / Binaan</div>
          </div>
        </div>

        <div className="disiplin-kpi-card sp1" onClick={() => setStatusFilter('SP_1')} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrap orange"><AlertTriangle size={20} /></div>
          <div>
            <div className="kpi-val">{kpi.perlu_sp_1 || 0}</div>
            <div className="kpi-lbl">Pelanggaran SP - I</div>
          </div>
        </div>

        <div className="disiplin-kpi-card sp2" onClick={() => setStatusFilter('SP_2')} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrap red"><ShieldAlert size={20} /></div>
          <div>
            <div className="kpi-val">{kpi.perlu_sp_2 || 0}</div>
            <div className="kpi-lbl">Pelanggaran Berat (SP - II)</div>
          </div>
        </div>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="disiplin-toolbar">
        <div className="disiplin-toolbar-left">
          {/* Periode Bulan */}
          <div className="disiplin-filter-group">
            <span className="filter-label">Bulan:</span>
            <select
              className="disiplin-select"
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
            >
              <option value={10}>Oktober 2026 (Data Master)</option>
              <option value={11}>November 2026 (Data Berjalan)</option>
              <option value={12}>Desember 2026</option>
              <option value={1}>Januari 2026</option>
            </select>
          </div>

          {/* Filter Status Disiplin */}
          <div className="disiplin-filter-group">
            <span className="filter-label">Status:</span>
            <select
              className="disiplin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Semua Status Pegawai</option>
              <option value="SP_2">Pelanggaran Berat (SP-2)</option>
              <option value="SP_1">Pelanggaran Sedang (SP-1)</option>
              <option value="TEGURAN_LISAN">Perlu Pembinaan Ringan</option>
              <option value="BAIK">Disiplin Baik</option>
            </select>
          </div>

          {/* Quick pills */}
          <div className="disiplin-pills">
            <button
              type="button"
              className={`disiplin-pill ${statusFilter === '' ? 'active' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              Semua ({kpi.total_pegawai || 0})
            </button>
            <button
              type="button"
              className={`disiplin-pill danger ${statusFilter === 'SP_2' ? 'active' : ''}`}
              onClick={() => setStatusFilter('SP_2')}
            >
              SP-II ({kpi.perlu_sp_2 || 0})
            </button>
            <button
              type="button"
              className={`disiplin-pill warning ${statusFilter === 'SP_1' ? 'active' : ''}`}
              onClick={() => setStatusFilter('SP_1')}
            >
              SP-I ({kpi.perlu_sp_1 || 0})
            </button>
            <button
              type="button"
              className={`disiplin-pill info ${statusFilter === 'TEGURAN_LISAN' ? 'active' : ''}`}
              onClick={() => setStatusFilter('TEGURAN_LISAN')}
            >
              Teguran ({kpi.perlu_pembinaan_ringan || 0})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="disiplin-search-wrap">
          <Search size={14} color="#64748b" />
          <input
            type="text"
            placeholder="Cari nama pegawai, PIN, NIK..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Evaluation Table ── */}
      <div className="disiplin-table-card">
        {loading ? (
          <div className="disiplin-loading-state">
            <RefreshCw size={28} className="spin" style={{ color: '#4f46e5' }} />
            <p>Menganalisis data kehadiran & keterlambatan pegawai...</p>
          </div>
        ) : data.results.length === 0 ? (
          <div className="disiplin-empty-state">
            <Award size={36} color="#10b981" />
            <h3>Tidak Ada Pegawai dengan Kriteria Ini</h3>
            <p>Semua pegawai berada dalam batas disiplin atau tidak cocok dengan filter pencarian.</p>
          </div>
        ) : (
          <>
          <table className="disiplin-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>No</th>
                <th>Pegawai</th>
                <th>Unit Kerja</th>
                <th style={{ textAlign: 'center' }}>Hari Dinas</th>
                <th style={{ textAlign: 'center' }}>Hadir</th>
                <th style={{ textAlign: 'center' }}>Keterlambatan</th>
                <th style={{ textAlign: 'center' }}>Pulang Cepat</th>
                <th style={{ textAlign: 'center' }}>Alfa</th>
                <th style={{ textAlign: 'center' }}>% Kehadiran</th>
                <th style={{ textAlign: 'center' }}>Status Evaluasi Disiplin</th>
                <th style={{ textAlign: 'center', width: 140 }}>Aksi Binaan</th>
              </tr>
            </thead>
            <tbody>
              {(pageSize === 'all' ? data.results : data.results.slice((page - 1) * pageSize, page * pageSize)).map((row, idx) => {
                const isNeedSP = row.status_disiplin === 'SP_1' || row.status_disiplin === 'SP_2';
                const isTeguran = row.status_disiplin === 'TEGURAN_LISAN';
                const rowNum = (pageSize === 'all' ? 0 : (page - 1) * pageSize) + idx + 1;

                return (
                  <tr key={row.pegawai_id} className={isNeedSP ? 'row-flagged' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                      {rowNum}
                    </td>
                    <td>
                      <div className="pegawai-cell">
                        <div className="pegawai-avatar-circle" style={{ background: row.badge_color + '22', color: row.badge_color }}>
                          {row.nama ? row.nama.charAt(0).toUpperCase() : 'P'}
                        </div>
                        <div>
                          <div className="pegawai-name-txt">{row.nama}</div>
                          <div className="pegawai-pin-sub">
                            PIN: <strong>#{row.pin}</strong> {row.jabatan && `• ${row.jabatan}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="unit-name-txt">{row.unit_kerja}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 650 }}>
                      {row.total_hari_dinas} hr
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                      {row.total_hadir} hr
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.total_terlambat_kali > 0 ? (
                        <div className="telat-info-badge">
                          <strong>{row.total_terlambat_kali}x</strong>
                          <span>({row.total_menit_terlambat} mnt)</span>
                        </div>
                      ) : (
                        <span style={{ color: '#10b981', fontSize: 12 }}>Tepat Waktu</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.total_pulang_cepat_kali > 0 ? (
                        <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
                          {row.total_pulang_cepat_kali}x ({row.total_menit_pulang_cepat}m)
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.total_alfa > 0 ? (
                        <span className="alfa-count-badge">{row.total_alfa} hr</span>
                      ) : (
                        <span style={{ color: '#10b981', fontSize: 12 }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 750, fontSize: 13, color: row.persentase_kehadiran >= 90 ? '#059669' : row.persentase_kehadiran >= 75 ? '#d97706' : '#dc2626' }}>
                          {row.persentase_kehadiran}%
                        </span>
                        <div style={{ width: 48, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(row.persentase_kehadiran, 100)}%`,
                              height: '100%',
                              background: row.persentase_kehadiran >= 90 ? '#10b981' : row.persentase_kehadiran >= 75 ? '#f59e0b' : '#ef4444'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className="disiplin-status-badge"
                        style={{
                          background: row.badge_color + '18',
                          color: row.badge_color,
                          borderColor: row.badge_color + '44'
                        }}
                      >
                        {row.status_disiplin_label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn-binaan-action"
                        onClick={() => handleOpenSuratModal(row)}
                        title="Lihat rincian pelanggaran dan generate draft surat pembinaan/SP"
                      >
                        <FileText size={13} />
                        <span>Surat Binaan</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SdmPagination
            totalItems={data.results.length}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            label="pegawai"
          />
          </>
        )}
      </div>

      {/* ════════════════ MODAL: PREVIEW & CETAK SURAT PEMBINAAN / SP ════════════════ */}
      {selectedPegawai && createPortal(
        <div className="surat-modal-overlay">
          <div className="surat-modal-card">
            {/* Modal Header */}
            <div className="surat-modal-header no-print">
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750 }}>
                  Surat Pembinaan Kedisiplinan Pegawai
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  {selectedPegawai.nama} • PIN #{selectedPegawai.pin} • {selectedPegawai.unit_kerja}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Tingkat SP Selector */}
                <select
                  className="tingkat-select"
                  value={selectedTingkat}
                  onChange={(e) => handleTingkatChange(e.target.value)}
                >
                  <option value="TEGURAN_LISAN">Teguran Lisan / Binaan Internal</option>
                  <option value="SP_1">Surat Peringatan I (SP - I)</option>
                  <option value="SP_2">Surat Peringatan II (SP - II)</option>
                </select>

                <button
                  type="button"
                  className="btn-print-primary"
                  onClick={handlePrintSurat}
                  title="Cetak Surat Pembinaan Resmi"
                >
                  <Printer size={15} />
                  <span>Cetak Surat</span>
                </button>

                <button
                  type="button"
                  className="btn-close-modal"
                  onClick={() => setSelectedPegawai(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Subtabs */}
            <div className="surat-modal-subtabs no-print">
              <button
                type="button"
                className={`subtab-btn ${modalTab === 'surat' ? 'active' : ''}`}
                onClick={() => setModalTab('surat')}
              >
                <FileText size={14} />
                <span>Format Surat Resmi (Siap Cetak)</span>
              </button>
              <button
                type="button"
                className={`subtab-btn ${modalTab === 'rincian' ? 'active' : ''}`}
                onClick={() => setModalTab('rincian')}
              >
                <Clock size={14} />
                <span>Rincian Tanggal Pelanggaran ({selectedPegawai.pelanggaran_dates?.length || 0})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="surat-modal-body">
              {suratLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <RefreshCw size={28} className="spin" style={{ color: '#4f46e5', margin: '0 auto 12px' }} />
                  <p>Memuat draf surat pembinaan resmi...</p>
                </div>
              ) : modalTab === 'rincian' ? (
                /* TAB 2: RINCIAN PELANGGARAN */
                <div className="rincian-pelanggaran-wrap">
                  <div className="rincian-header-box">
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14 }}>Daftar Kasus Keterlambatan & Ketidakhadiran</h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        Ditemukan total <strong>{selectedPegawai.pelanggaran_dates?.length || 0} catatan pelanggaran</strong> pada periode {suratData?.surat?.periode}.
                      </p>
                    </div>
                  </div>

                  {selectedPegawai.pelanggaran_dates && selectedPegawai.pelanggaran_dates.length > 0 ? (
                    <table className="rincian-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Tanggal</th>
                          <th>Hari</th>
                          <th>Shift</th>
                          <th>Jenis Pelanggaran</th>
                          <th>Keterangan Pelanggaran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPegawai.pelanggaran_dates.map((pel, pIdx) => (
                          <tr key={pIdx}>
                            <td style={{ textAlign: 'center', width: 40 }}>{pIdx + 1}</td>
                            <td style={{ fontWeight: 650 }}>{pel.tanggal}</td>
                            <td>{pel.hari}</td>
                            <td>
                              <span className="badge-shift-mini">{pel.shift}</span>
                            </td>
                            <td>
                              <span className={`badge-pelanggaran ${pel.jenis.toLowerCase()}`}>
                                {pel.jenis}
                              </span>
                            </td>
                            <td style={{ fontSize: 12.5 }}>{pel.keterangan}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                      Tidak ditemukan catatan pelanggaran tanggal pada pegawai ini.
                    </p>
                  )}
                </div>
              ) : suratData ? (
                /* TAB 1: FORMAT CETAK RESMI SURAT PEMBINAAN / SP */
                <div className="lembar-surat-kertas" id="print-surat-area">
                  {/* KOP SURAT RESMI */}
                  <div className="kop-surat">
                    <div className="kop-logo-area">
                      <img src="/logo.png" alt="Logo SIMAK" className="kop-logo-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                    <div className="kop-teks">
                      <div className="kop-rs">{suratData.kop.badan}</div>
                      <div className="kop-alamat">{suratData.kop.alamat}</div>
                      <div className="kop-kontak">{suratData.kop.kontak}</div>
                    </div>
                  </div>
                  <div className="kop-garis-ganda" />

                  {/* JUDUL SURAT */}
                  <div className="surat-judul-block">
                    <div className="surat-judul-utama">{suratData.surat.judul}</div>
                    <div className="surat-nomor">Nomor: {suratData.surat.nomor}</div>
                  </div>

                  {/* ISI SURAT */}
                  <div className="surat-isi-text">
                    <p>
                      Sehubungan dengan rekapitulasi data kehadiran fingerprint dan evaluasi disiplin kerja pegawai RS Siaga Al Munawwarah Samarinda pada periode <strong>{suratData.surat.periode}</strong>, dengan ini Manajemen Rumah Sakit menerbitkan Surat Pembinaan Kedisiplinan kepada:
                    </p>

                    <div className="surat-data-pegawai">
                      <div className="row-identitas">
                        <span className="label">Nama Pegawai</span>
                        <span className="titik">:</span>
                        <span className="val bold">{suratData.surat.pegawai.nama}</span>
                      </div>
                      <div className="row-identitas">
                        <span className="label">Nomor Induk Karyawan</span>
                        <span className="titik">:</span>
                        <span className="val">{suratData.surat.pegawai.nik}</span>
                      </div>
                      <div className="row-identitas">
                        <span className="label">PIN Absen Mesin</span>
                        <span className="titik">:</span>
                        <span className="val">#{suratData.surat.pegawai.pin}</span>
                      </div>
                      <div className="row-identitas">
                        <span className="label">Unit Kerja / Ruangan</span>
                        <span className="titik">:</span>
                        <span className="val">{suratData.surat.pegawai.unit_kerja}</span>
                      </div>
                      <div className="row-identitas">
                        <span className="label">Jabatan</span>
                        <span className="titik">:</span>
                        <span className="val">{suratData.surat.pegawai.jabatan}</span>
                      </div>
                    </div>

                    <p>
                      Berdasarkan hasil pemantauan mesin absensi dan rekonsiliasi roster dinas, yang bersangkutan telah terbukti melakukan pelanggaran disiplin kerja berupa:
                    </p>

                    <div className="surat-ringkasan-pelanggaran">
                      <div className="ringkasan-box">
                        <span>Tidak Hadir Tanpa Keterangan Sah (Alfa)</span>
                        <strong>{suratData.surat.ringkasan.total_alfa_hari} Hari</strong>
                      </div>
                      <div className="ringkasan-box">
                        <span>Akumulasi Waktu Keterlambatan</span>
                        <strong>{suratData.surat.ringkasan.total_terlambat_menit} Menit</strong>
                      </div>
                    </div>

                    {suratData.surat.rincian_pelanggaran && suratData.surat.rincian_pelanggaran.length > 0 && (
                      <div className="surat-detail-list">
                        <p style={{ fontWeight: 650, margin: '8px 0 4px', fontSize: 12 }}>
                          Rincian catatan kejadian pelanggaran:
                        </p>
                        <ol style={{ margin: '4px 0 12px', paddingLeft: 22, fontSize: 11.5 }}>
                          {suratData.surat.rincian_pelanggaran.slice(0, 7).map((item, i) => (
                            <li key={i} style={{ marginBottom: 3 }}>
                              Tanggal <strong>{item.tanggal}</strong> ({item.hari}, Shift {item.shift}): {item.keterangan}
                            </li>
                          ))}
                          {suratData.surat.rincian_pelanggaran.length > 7 && (
                            <li style={{ fontStyle: 'italic', color: '#64748b' }}>
                              ... dan {suratData.surat.rincian_pelanggaran.length - 7} kejadian keterlambatan lainnya terlampir pada arsip SDM.
                            </li>
                          )}
                        </ol>
                      </div>
                    )}

                    <div className="surat-klausul-sanksi">
                      <strong>Keputusan & Tindakan Pembinaan:</strong>
                      <p style={{ margin: '4px 0 0' }}>{suratData.surat.sanksi}</p>
                    </div>

                    <p style={{ marginTop: 12 }}>
                      Demikian surat ini disampaikan untuk diperhatikan dan menjadi bahan perbaikan kedisiplinan kerja demi menjaga standar pelayanan kesehatan RS Siaga Al Munawwarah Samarinda.
                    </p>
                  </div>

                  {/* TANDA TANGAN */}
                  <div className="surat-ttd-row">
                    <div className="ttd-box pegawai">
                      <div className="ttd-jabatan">Pegawai Yang Bersangkutan,</div>
                      <div className="ttd-space" />
                      <div className="ttd-nama">{suratData.surat.pegawai.nama}</div>
                      <div className="ttd-nip">PIN Mesin: #{suratData.surat.pegawai.pin}</div>
                    </div>

                    <div className="ttd-box direktur">
                      <div className="ttd-kota">Samarinda, {suratData.surat.penandatangan.tanggal}</div>
                      <div className="ttd-jabatan">{suratData.surat.penandatangan.pejabat_jabatan}</div>
                      <div className="ttd-space" />
                      <div className="ttd-nama bold">{suratData.surat.penandatangan.pejabat_nama}</div>
                      <div className="ttd-nip">NIP. {suratData.surat.penandatangan.nip}</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="surat-modal-footer no-print">
              <button
                type="button"
                className="btn-secondary-sdm"
                onClick={() => setSelectedPegawai(null)}
              >
                Tutup
              </button>
              <button
                type="button"
                className="btn-print-primary"
                onClick={handlePrintSurat}
              >
                <Printer size={15} />
                <span>Cetak Lembar Surat</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

