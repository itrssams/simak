import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  CheckCircle2,
  Calendar,
  ArrowLeftRight,
  Fingerprint,
  Clock,
  FileText,
  UserCheck,
  BarChart3,
  CalendarPlus,
  Network,
  CircleDollarSign,
  Coins,
  Stethoscope,
  Receipt,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import './SdmLayout.css';

export default function SdmLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Role permissions
  const hasSdmAccess = Boolean(
    user?.is_superuser ||
    user?.is_sdm ||
    ['direktur', 'wakil_direktur'].includes(user?.role)
  );

  const isApprover = Boolean(
    hasSdmAccess ||
    ['kepala_seksi', 'manajer'].includes(user?.role)
  );

  // Persistent sidebar collapse state
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('simak_sdm_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('simak_sdm_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Helper to determine if a menu item is active
  const isItemActive = (targetPath, targetTab = null) => {
    const currentPath = location.pathname;
    const currentTab = searchParams.get('tab');

    if (targetTab) {
      if (currentPath === targetPath) {
        if (targetTab === 'rekap') {
          return !currentTab || currentTab === 'rekap';
        }
        return currentTab === targetTab;
      }
      return false;
    }

    if (targetPath === '/sdm/izin-kerja') {
      return (currentPath === '/sdm/izin-kerja' && currentTab !== 'approval') || currentPath === '/sdm/pengajuan-izin';
    }

    if (targetPath === '/sdm/approval') {
      return currentPath === '/sdm/approval' || (currentPath === '/sdm/izin-kerja' && currentTab === 'approval');
    }

    return currentPath === targetPath;
  };

  const handleNavigate = (path, tab = null) => {
    if (tab) {
      navigate(`${path}?tab=${tab}`);
    } else {
      navigate(path);
    }
  };

  return (
    <div className="sdm-module-root">
      {/* ── Dedicated Internal SDM Sidebar ── */}
      <aside className={`sdm-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Navigasi Modul SDM">
        {/* Header & Toggle Button */}
        <div className="sdm-sb-head">
          {!collapsed && (
            <div className="sdm-sb-title-wrap">
              <div className="sdm-sb-title-icon" title="Modul SDM">
                <Users size={15} strokeWidth={2.3} />
              </div>
              <span className="sdm-sb-title-text">Menu SDM</span>
            </div>
          )}

          <button
            type="button"
            className="sdm-sb-toggle-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Lebarkan Sidebar (Buka)' : 'Ciutkan Sidebar (Lega)'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Scrollable Menu Items without search input */}
        <nav className="sdm-sb-nav">
          {/* GROUP 1: KEHADIRAN & DINAS */}
          <div className="sdm-sb-group">
            <span className="sdm-sb-label">Kehadiran & Dinas</span>

            <button
              type="button"
              className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'rekap') ? 'active' : ''}`}
              onClick={() => handleNavigate('/sdm/presensi', 'rekap')}
              title={collapsed ? 'Rekap Presensi' : undefined}
            >
              <span className="sdm-sb-icon"><CheckCircle2 size={16} /></span>
              <span className="sdm-sb-text">Rekap Presensi</span>
            </button>

            <button
              type="button"
              className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'roster') ? 'active' : ''}`}
              onClick={() => handleNavigate('/sdm/presensi', 'roster')}
              title={collapsed ? 'Roster Dinas Bulanan' : undefined}
            >
              <span className="sdm-sb-icon"><Calendar size={16} /></span>
              <span className="sdm-sb-text">Roster Dinas Bulanan</span>              
            </button>

            <button
              type="button"
              className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'tukar_dinas') ? 'active' : ''}`}
              onClick={() => handleNavigate('/sdm/presensi', 'tukar_dinas')}
              title={collapsed ? 'Tukar Dinas' : undefined}
            >
              <span className="sdm-sb-icon"><ArrowLeftRight size={16} /></span>
              <span className="sdm-sb-text">Tukar Dinas</span>
            </button>

            {hasSdmAccess && (
              <>
                <button
                  type="button"
                  className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'raw_logs') ? 'active' : ''}`}
                  onClick={() => handleNavigate('/sdm/presensi', 'raw_logs')}
                  title={collapsed ? 'Log Mesin Fingerprint' : undefined}
                >
                  <span className="sdm-sb-icon"><Fingerprint size={16} /></span>
                  <span className="sdm-sb-text">Log Mesin Fingerprint</span>
                </button>

                <button
                  type="button"
                  className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'shift') ? 'active' : ''}`}
                  onClick={() => handleNavigate('/sdm/presensi', 'shift')}
                  title={collapsed ? 'Master Pola Shift' : undefined}
                >
                  <span className="sdm-sb-icon"><Clock size={16} /></span>
                  <span className="sdm-sb-text">Master Pola Shift</span>
                </button>
              </>
            )}
          </div>

          {/* GROUP 2: PERIZINAN & IMTK */}
          <div className="sdm-sb-group">
            <span className="sdm-sb-label">Perizinan</span>

            <button
              type="button"
              className={`sdm-sb-item ${isItemActive('/sdm/izin-kerja') ? 'active' : ''}`}
              onClick={() => handleNavigate('/sdm/izin-kerja')}
              title={collapsed ? 'Izin Meninggalkan (IMTK)' : undefined}
            >
              <span className="sdm-sb-icon"><FileText size={16} /></span>
              <span className="sdm-sb-text">Izin Kerja (IMTK)</span>
            </button>

            {isApprover && (
              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/approval') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/approval')}
                title={collapsed ? 'Approval Atasan' : undefined}
              >
                <span className="sdm-sb-icon"><UserCheck size={16} /></span>
                <span className="sdm-sb-text">Approval Atasan</span>
              </button>
            )}

            {hasSdmAccess && (
              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/rekapitulasi') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/rekapitulasi')}
                title={collapsed ? 'Rekapitulasi Izin' : undefined}
              >
                <span className="sdm-sb-icon"><BarChart3 size={16} /></span>
                <span className="sdm-sb-text">Rekapitulasi Izin</span>
              </button>
            )}

            <button
              type="button"
              className="sdm-sb-item disabled"
              title="Cuti & Izin Sakit (Tahap Pengembangan Selanjutnya)"
            >
              <span className="sdm-sb-icon"><CalendarPlus size={16} /></span>
              <span className="sdm-sb-text">Cuti & Izin Sakit</span>
              <span className="sdm-sb-badge badge-amber">Soon</span>
            </button>
          </div>

          {/* GROUP 3: KEPEGAWAIAN */}
          <div className="sdm-sb-group">
            <span className="sdm-sb-label">Kepegawaian</span>

            {hasSdmAccess && (
              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'pegawai') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/presensi', 'pegawai')}
                title={collapsed ? 'Data Pegawai & PIN Mesin' : undefined}
              >
                <span className="sdm-sb-icon"><Users size={16} /></span>
                <span className="sdm-sb-text">Data Pegawai & PIN</span>
              </button>
            )}

            <button
              type="button"
              className={`sdm-sb-item ${isItemActive('/sdm/struktur') ? 'active' : ''}`}
              onClick={() => handleNavigate('/sdm/struktur')}
              title={collapsed ? 'Struktur Organisasi RS' : undefined}
            >
              <span className="sdm-sb-icon"><Network size={16} /></span>
              <span className="sdm-sb-text">Struktur Organisasi RS</span>
            </button>
          </div>

          {/* GROUP 4: REMUNERASI & PAYROLL (ROADMAP FUTURE) */}
          <div className="sdm-sb-group">
            <span className="sdm-sb-label">Remunerasi & Payroll</span>

            <button
              type="button"
              className="sdm-sb-item disabled"
              title="Penggajian Bulanan / Payroll (Rencana Pengembangan)"
            >
              <span className="sdm-sb-icon"><CircleDollarSign size={16} /></span>
              <span className="sdm-sb-text">Penggajian / Payroll</span>
              <span className="sdm-sb-badge badge-amber">Roadmap</span>
            </button>

            <button
              type="button"
              className="sdm-sb-item disabled"
              title="Jasa Pelayanan (Jaspel)"
            >
              <span className="sdm-sb-icon"><Coins size={16} /></span>
              <span className="sdm-sb-text">Jasa Pelayanan (Jaspel)</span>
              <span className="sdm-sb-badge badge-amber">Roadmap</span>
            </button>

            <button
              type="button"
              className="sdm-sb-item disabled"
              title="Jasa Medis Dokter (Jasmed)"
            >
              <span className="sdm-sb-icon"><Stethoscope size={16} /></span>
              <span className="sdm-sb-text">Jasmed Dokter</span>
              <span className="sdm-sb-badge badge-amber">Roadmap</span>
            </button>

            <button
              type="button"
              className="sdm-sb-item disabled"
              title="Slip Gaji Mandiri"
            >
              <span className="sdm-sb-icon"><Receipt size={16} /></span>
              <span className="sdm-sb-text">Slip Gaji Online</span>
              <span className="sdm-sb-badge badge-amber">Roadmap</span>
            </button>
          </div>

          {/* GROUP 5: LAPORAN & EVALUASI */}
          {hasSdmAccess && (
            <div className="sdm-sb-group">
              <span className="sdm-sb-label">Laporan & Evaluasi</span>

              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'disiplin') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/presensi', 'disiplin')}
                title={collapsed ? 'Evaluasi Disiplin & SP' : undefined}
              >
                <span className="sdm-sb-icon"><ShieldAlert size={16} /></span>
                <span className="sdm-sb-text">Disiplin & Surat Binaan</span>
              </button>

              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'kartu_absensi') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/presensi', 'kartu_absensi')}
                title={collapsed ? 'Kartu Absensi Bulanan Pegawai' : undefined}
              >
                <span className="sdm-sb-icon"><FileText size={16} /></span>
                <span className="sdm-sb-text">Kartu Absensi Bulanan</span>
              </button>

              <button
                type="button"
                className={`sdm-sb-item ${isItemActive('/sdm/presensi', 'rekap_unit') ? 'active' : ''}`}
                onClick={() => handleNavigate('/sdm/presensi', 'rekap_unit')}
                title={collapsed ? 'Rekapitulasi Unit Kerja' : undefined}
              >
                <span className="sdm-sb-icon"><BarChart3 size={16} /></span>
                <span className="sdm-sb-text">Rekapitulasi Unit RS</span>
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Footer Indicator */}
        <div className="sdm-sb-foot" title={collapsed ? 'Mesin Absen Online (v2.0)' : undefined}>
          <div className="sdm-sb-foot-online">
            <span className="sdm-sb-dot-pulse" />
            {!collapsed && <span className="sdm-sb-foot-text">Mesin Absen Online</span>}
          </div>
          {!collapsed && <span className="sdm-sb-foot-ver" style={{ opacity: 0.6, fontSize: '10px' }}>v2.0</span>}
        </div>
      </aside>

      {/* ── Main Content Workspace Area ── */}
      <div className="sdm-content-area">
        {children}
      </div>
    </div>
  );
}

