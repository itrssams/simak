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
          <div className="disiplin-title-pill" style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
            <BarChart3 size={14} />
            <span>MODUL SDM • STEP 7</span>
          </div>
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

      {/* Summary Cards */}
      <div className="disiplin-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="disiplin-kpi-card total">
          <div className="kpi-icon-wrap blue"><Building2 size={20} /></div>
          <div>
            <div className="kpi-val">{summary.total_unit || 0}</div>
            <div className="kpi-lbl">Total Unit / Instalasi RS</div>
          </div>
        </div>

        <div className="disiplin-kpi-card total">
          <div className="kpi-icon-wrap green"><Users size={20} /></div>
          <div>
            <div className="kpi-val">{summary.total_pegawai || 0}</div>
            <div className="kpi-lbl">Total Seluruh Pegawai</div>
          </div>
        </div>

        <div className="disiplin-kpi-card total">
          <div className="kpi-icon-wrap green"><TrendingUp size={20} /></div>
          <div>
            <div className="kpi-val">{summary.rata_rata_kehadiran || 0}%</div>
            <div className="kpi-lbl">Rata-rata Kehadiran RS</div>
          </div>
        </div>

        <div className="disiplin-kpi-card total">
          <div className="kpi-icon-wrap red"><Clock size={20} /></div>
          <div>
            <div className="kpi-val">{summary.total_menit_terlambat_semua || 0} m</div>
            <div className="kpi-lbl">Total Menit Terlambat</div>
          </div>
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
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{rowNum}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Building2 size={15} />
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{u.unit_nama}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 650 }}>{u.total_pegawai} staf</td>
                    <td style={{ textAlign: 'center' }}>{u.total_dinas} hr</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>{u.total_hadir} hr</td>
                    <td style={{ textAlign: 'center' }}>
                      {u.total_terlambat_kali > 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 650 }}>{u.total_terlambat_kali}x</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {u.total_menit_terlambat > 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 650 }}>{u.total_menit_terlambat} mnt</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {u.total_alfa > 0 ? (
                        <span className="alfa-count-badge">{u.total_alfa} hr</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{u.total_jam_kerja} jam</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: isGood ? '#059669' : isWarning ? '#d97706' : '#dc2626' }}>
                          {pct}%
                        </span>
                        <div style={{ width: 60, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
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
                      <span
                        className="disiplin-status-badge"
                        style={{
                          background: isGood ? '#ecfdf5' : isWarning ? '#fefce8' : '#fef2f2',
                          color: isGood ? '#059669' : isWarning ? '#b45309' : '#dc2626',
                          borderColor: isGood ? '#a7f3d0' : isWarning ? '#fef08a' : '#fecaca'
                        }}
                      >
                        {u.status_rating}
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

