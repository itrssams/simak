import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import {
  Building2,
  Users,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import './EvaluasiDisiplinView.css';
import SdmPagination from './SdmPagination';

export default function RekapUnitView() {
  const { showToast } = useToast();

  const [bulan, setBulan] = useState(10);
  const [tahun, setTahun] = useState(2026);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [rekapData, setRekapData] = useState({ summary: {}, results: [] });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => { setPage(1); }, [bulan, tahun, searchQuery]);

  const fetchRekapUnit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sdm/presensi/rekap_bulanan_unit/', {
        params: { bulan, tahun }
      });
      setRekapData(res.data);
    } catch (err) {
      console.error('Gagal mengambil rekap unit:', err);
      showToast('Gagal memuat rekapitulasi unit kerja.', 'error');
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, showToast]);

  useEffect(() => {
    fetchRekapUnit();
  }, [fetchRekapUnit]);

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const res = await api.get('/sdm/presensi/export_excel_bulanan/', {
        params: { bulan, tahun },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Rekap_Unit_SDM_${tahun}_${String(bulan).padStart(2, '0')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Laporan Excel rekap unit berhasil diunduh.', 'success');
    } catch (err) {
      showToast('Gagal mengunduh laporan Excel.', 'error');
    }
  };

  const filteredResults = (rekapData.results || []).filter((u) =>
    !searchQuery || u.unit_nama.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const summary = rekapData.summary || {};

  return (
    <div className="disiplin-view-root">
      {/* Header */}
      <div className="disiplin-header-card">
        <div>
          <h2 className="disiplin-title">Rekapitulasi Kehadiran Per Unit Kerja</h2>
          <p className="disiplin-subtitle">
            Evaluasi persentase kehadiran, kedisiplinan jam kerja, dan produktivitas per instalasi/ruangan di RS Siaga Al Munawwarah Samarinda.
          </p>
        </div>

        <div className="disiplin-header-actions">
          <button
            type="button"
            className="btn-excel-disiplin"
            onClick={handleExportExcel}
            title="Unduh Rekapitulasi Lengkap Excel"
          >
            <Download size={15} />
            <span>Unduh Rekap Excel</span>
          </button>
        </div>
      </div>

      {/* Flat Stat-Bar */}
      <div className="sdm-stat-bar sdm-stat-bar-4">
        <div className="sdm-stat-item">
          <span className="sdm-stat-lbl">Total Unit / Instalasi RS</span>
          <span className="sdm-stat-val">{summary.total_unit || 0}</span>
        </div>

        <div className="sdm-stat-item">
          <span className="sdm-stat-lbl">Total Seluruh Pegawai</span>
          <span className="sdm-stat-val">{summary.total_pegawai || 0}</span>
        </div>

        <div className="sdm-stat-item">
          <span className="sdm-stat-lbl">Rata-rata Kehadiran RS</span>
          <span className="sdm-stat-val is-green">{summary.rata_rata_kehadiran || 0}%</span>
        </div>

        <div className="sdm-stat-item">
          <span className="sdm-stat-lbl">Total Menit Terlambat</span>
          <span className="sdm-stat-val is-red">{summary.total_menit_terlambat_semua || 0} m</span>
        </div>
      </div>

      {/* Toolbar Filter */}
      <div className="disiplin-toolbar">
        <div className="disiplin-toolbar-left">
          <div className="disiplin-filter-group">
            <span className="filter-label">Periode Bulan:</span>
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

          <div className="disiplin-filter-group">
            <span className="filter-label">Tahun:</span>
            <select
              className="disiplin-select"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>

        <div className="disiplin-search-wrap">
          <Search size={14} color="#64748b" />
          <input
            type="text"
            placeholder="Cari nama unit / ruangan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="disiplin-table-card">
        {loading ? (
          <div className="disiplin-loading-state">
            <RefreshCw size={28} className="spin" style={{ color: '#4f46e5', margin: '0 auto 12px' }} />
            <p>Mengkalkulasi rekapitulasi per unit kerja...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="disiplin-empty-state">
            <Building2 size={36} color="#94a3b8" />
            <h3>Tidak Ada Data Unit Kerja</h3>
          </div>
        ) : (
          <>
          <table className="disiplin-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>No</th>
                <th>Unit Kerja / Instalasi</th>
                <th style={{ textAlign: 'center' }}>Pegawai</th>
                <th style={{ textAlign: 'center' }}>Total Dinas</th>
                <th style={{ textAlign: 'center' }}>Hadir</th>
                <th style={{ textAlign: 'center' }}>Kasus Telat</th>
                <th style={{ textAlign: 'center' }}>Akumulasi Telat</th>
                <th style={{ textAlign: 'center' }}>Alfa</th>
                <th style={{ textAlign: 'center' }}>Total Jam Kerja</th>
                <th style={{ textAlign: 'center', width: 140 }}>Tingkat Kehadiran</th>
                <th style={{ textAlign: 'center' }}>Rating Disiplin</th>
              </tr>
            </thead>
            <tbody>
              {(pageSize === 'all' ? filteredResults : filteredResults.slice((page - 1) * pageSize, page * pageSize)).map((u, i) => {
                const pct = u.persentase_kehadiran;
                const isGood = pct >= 90;
                const isWarning = pct >= 75 && pct < 90;
                const rowNum = (pageSize === 'all' ? 0 : (page - 1) * pageSize) + i + 1;

                return (
                  <tr key={u.unit_nama}>
                    <td style={{ textAlign: 'center' }} className="sdm-cell-muted sdm-tabular">{rowNum}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="sdm-avatar-neutral">
                          {u.unit_nama ? u.unit_nama.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <span className="unit-name-txt" style={{ fontWeight: 600 }}>{u.unit_nama}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }} className="sdm-tabular">{u.total_pegawai} staf</td>
                    <td style={{ textAlign: 'center' }} className="sdm-tabular">{u.total_dinas} hr</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#10b981' }} className="sdm-tabular">{u.total_hadir} hr</td>
                    <td style={{ textAlign: 'center' }} className="sdm-tabular">
                      {u.total_terlambat_kali > 0 ? (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{u.total_terlambat_kali}x</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }} className="sdm-tabular">
                      {u.total_menit_terlambat > 0 ? (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{u.total_menit_terlambat} mnt</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }} className="sdm-tabular">
                      {u.total_alfa > 0 ? (
                        <span className="sdm-status-inline" style={{ justifyContent: 'center' }}>
                          <span className="sdm-dot is-red" />
                          <strong style={{ color: '#ef4444' }}>{u.total_alfa} hr</strong>
                        </span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }} className="sdm-tabular">{u.total_jam_kerja} jam</td>
                    <td style={{ textAlign: 'center' }} className="sdm-tabular">
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: isGood ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444' }}>
                          {pct}%
                        </span>
                        <div className="disiplin-pct-track">
                          <div
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: '100%',
                              background: isGood ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="sdm-status-inline" style={{ justifyContent: 'center' }}>
                        <span className={`sdm-dot ${isGood ? 'is-green' : isWarning ? 'is-amber' : 'is-red'}`} />
                        <span>{u.status_rating}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SdmPagination
            totalItems={filteredResults.length}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            label="unit kerja"
          />
          </>
        )}
      </div>
    </div>
  );
}

