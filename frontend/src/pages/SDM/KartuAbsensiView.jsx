import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import {
  FileText,
  Printer,
  Calendar,
  User,
  Search,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2
} from 'lucide-react';
import './KartuAbsensiView.css';

export default function KartuAbsensiView() {
  const { showToast } = useToast();

  const [pegawaiList, setPegawaiList] = useState([]);
  const [selectedPegawaiId, setSelectedPegawaiId] = useState('');
  const [bulan, setBulan] = useState(10);
  const [tahun, setTahun] = useState(2026);
  const [searchPegawai, setSearchPegawai] = useState('');

  const [loading, setLoading] = useState(false);
  const [kartuData, setKartuData] = useState(null);

  // Fetch Pegawai Dropdown
  useEffect(() => {
    const fetchPegawai = async () => {
      try {
        const res = await api.get('/sdm/pegawai/');
        const list = res.data?.results || res.data || [];
        setPegawaiList(list);
        if (list.length > 0 && !selectedPegawaiId) {
          setSelectedPegawaiId(list[0].id);
        }
      } catch (err) {
        console.error('Gagal mengambil daftar pegawai:', err);
      }
    };
    fetchPegawai();
  }, []);

  // Fetch Kartu Absensi Data
  const fetchKartuAbsensi = useCallback(async () => {
    if (!selectedPegawaiId) return;
    setLoading(true);
    try {
      const res = await api.get('/sdm/presensi/kartu_absensi/', {
        params: {
          pegawai_id: selectedPegawaiId,
          bulan,
          tahun
        }
      });
      setKartuData(res.data);
    } catch (err) {
      console.error('Gagal memuat kartu absensi:', err);
      showToast('Gagal memuat kartu absensi pegawai.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedPegawaiId, bulan, tahun, showToast]);

  useEffect(() => {
    fetchKartuAbsensi();
  }, [fetchKartuAbsensi]);

  const handlePrint = () => {
    window.print();
  };

  const filteredPegawai = useMemo(() => {
    if (!searchPegawai) return pegawaiList;
    const q = searchPegawai.toLowerCase();
    return pegawaiList.filter(
      (p) =>
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.pin && String(p.pin).includes(q)) ||
        (p.unit_kerja && p.unit_kerja.toLowerCase().includes(q))
    );
  }, [pegawaiList, searchPegawai]);

  const pInfo = kartuData?.pegawai || {};
  const periode = kartuData?.periode || {};
  const summary = kartuData?.summary || {};
  const rows = kartuData?.daily_rows || [];

  return (
    <div className="kartu-absensi-root">
      {/* ── Control Bar (No-Print) ── */}
      <div className="kartu-controls-card no-print">
        <div className="kartu-controls-left">
          {/* Pilih Pegawai */}
          <div className="control-item">
            <span className="control-label">Pilih Pegawai:</span>
            <select
              className="kartu-select pegawai-select"
              value={selectedPegawaiId}
              onChange={(e) => setSelectedPegawaiId(e.target.value)}
            >
              {filteredPegawai.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama} (PIN #{p.pin || '-'}) - {p.unit_kerja || 'Umum'}
                </option>
              ))}
            </select>
          </div>

          {/* Periode Bulan */}
          <div className="control-item">
            <span className="control-label">Bulan:</span>
            <select
              className="kartu-select"
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
            >
              <option value={10}>Oktober 2026 (Master)</option>
              <option value={11}>November 2026 (Aktif)</option>
              <option value={12}>Desember 2026</option>
              <option value={1}>Januari 2026</option>
            </select>
          </div>

          {/* Periode Tahun */}
          <div className="control-item">
            <span className="control-label">Tahun:</span>
            <select
              className="kartu-select"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>

        <div className="kartu-controls-right">
          <button
            type="button"
            className="btn-print-kartu"
            onClick={handlePrint}
            title="Cetak Kartu Absensi format A4 Resmi"
          >
            <Printer size={15} />
            <span>Cetak Kartu Absensi</span>
          </button>
        </div>
      </div>

      {/* ── Lembar Kartu Absensi (A4 Print Area) ── */}
      {loading ? (
        <div className="kartu-loading-box no-print">
          <RefreshCw size={28} className="spin" style={{ color: '#4f46e5', margin: '0 auto 12px' }} />
          <p>Menyiapkan kartu absensi pegawai...</p>
        </div>
      ) : kartuData ? (
        <div className="kartu-print-sheet" id="kartu-absensi-print-area">
          {/* KOP RESMI RS SIAGA AL MUNAWWARAH */}
          <div className="kartu-kop-header">
            <div className="kartu-kop-logo">
              <img src="/logo.png" alt="Logo SIMAK" className="kartu-kop-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
            <div className="kartu-kop-text">
              <div className="kartu-kop-rs">RS SIAGA AL MUNAWWARAH SAMARINDA</div>
              <div className="kartu-kop-alamat">
                Jl. Ramania No. 3 Samarinda, Kalimantan Timur 75123 &bull; Telp: (0541) 743000
              </div>
              <div className="kartu-kop-judul">KARTU PRESENSI & KEHADIRAN BULANAN PEGAWAI</div>
            </div>
          </div>
          <div className="kartu-kop-divider" />

          {/* INFO IDENTITAS PEGAWAI & PERIODE */}
          <div className="kartu-info-grid">
            <div className="info-col">
              <div className="info-row">
                <span className="info-lbl">Nama Pegawai</span>
                <span className="info-colon">:</span>
                <span className="info-val bold">{pInfo.nama}</span>
              </div>
              <div className="info-row">
                <span className="info-lbl">PIN Mesin / NIK</span>
                <span className="info-colon">:</span>
                <span className="info-val">#{pInfo.pin} / {pInfo.nik || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-lbl">Unit Kerja / Ruang</span>
                <span className="info-colon">:</span>
                <span className="info-val">{pInfo.unit_kerja}</span>
              </div>
            </div>

            <div className="info-col">
              <div className="info-row">
                <span className="info-lbl">Jabatan</span>
                <span className="info-colon">:</span>
                <span className="info-val">{pInfo.jabatan}</span>
              </div>
              <div className="info-row">
                <span className="info-lbl">Periode Kehadiran</span>
                <span className="info-colon">:</span>
                <span className="info-val bold">{periode.nama_bulan} {periode.tahun}</span>
              </div>
              <div className="info-row">
                <span className="info-lbl">Tingkat Kehadiran</span>
                <span className="info-colon">:</span>
                <span className="info-val badge-pct">{summary.persentase_kehadiran}%</span>
              </div>
            </div>
          </div>

          {/* TABEL PRESENSI 31 HARI */}
          <table className="kartu-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>Tgl</th>
                <th style={{ width: 55 }}>Hari</th>
                <th style={{ width: 45 }}>Shift</th>
                <th style={{ width: 85 }}>Jam Shift</th>
                <th style={{ width: 68 }}>Tap Masuk</th>
                <th style={{ width: 68 }}>Tap Pulang</th>
                <th style={{ width: 55 }}>Telat</th>
                <th style={{ width: 55 }}>Cepat</th>
                <th style={{ width: 60 }}>Jam Kerja</th>
                <th>Status Kehadiran</th>
                <th style={{ width: 95 }}>Paraf / Catatan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isLibur = r.is_libur;
                const isTelat = r.menit_terlambat > 0;
                const isCepat = r.menit_pulang_cepat > 0;
                const isAlfa = r.status === 'tidak_hadir';

                return (
                  <tr key={r.day} className={isLibur ? 'row-libur' : isAlfa ? 'row-alfa' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 650 }}>{r.day}</td>
                    <td>{r.hari}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="shift-code-pill" style={{ borderColor: r.shift_warna }}>
                        {r.shift_kode}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 10.5 }}>
                      {r.shift_jam_masuk !== '-' ? `${r.shift_jam_masuk} - ${r.shift_jam_pulang}` : '-'}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: r.jam_masuk !== '-' ? 700 : 400 }}>
                      {r.jam_masuk}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: r.jam_pulang !== '-' ? 700 : 400 }}>
                      {r.jam_pulang}
                    </td>
                    <td style={{ textAlign: 'center', color: isTelat ? '#dc2626' : '#64748b', fontWeight: isTelat ? 700 : 400 }}>
                      {isTelat ? `${r.menit_terlambat}m` : '-'}
                    </td>
                    <td style={{ textAlign: 'center', color: isCepat ? '#ea580c' : '#64748b' }}>
                      {isCepat ? `${r.menit_pulang_cepat}m` : '-'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {r.total_jam_kerja > 0 ? `${r.total_jam_kerja}j` : '-'}
                    </td>
                    <td>
                      <span className={`status-kartu-tag ${r.status}`}>
                        {r.status_label}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, color: '#475569' }}>
                      {r.catatan !== '-' ? r.catatan : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* REKAPITULASI SUMMARY BOX */}
          <div className="kartu-summary-box">
            <div className="sum-item">
              <span className="lbl">Hari Dinas:</span>
              <strong className="val">{summary.total_hari_dinas} hr</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Hadir:</span>
              <strong className="val hadir">{summary.total_hadir} hr</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Terlambat:</span>
              <strong className="val telat">{summary.total_terlambat_kali}x ({summary.total_menit_terlambat} mnt)</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Alfa / Belum Tap:</span>
              <strong className="val alfa">{summary.total_alfa} hr</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Libur:</span>
              <strong className="val">{summary.total_libur} hr</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Cuti / Sakit / Izin:</span>
              <strong className="val">{summary.total_cuti + summary.total_sakit + summary.total_izin} hr</strong>
            </div>
            <div className="sum-item">
              <span className="lbl">Total Jam Kerja:</span>
              <strong className="val">{summary.total_jam_kerja} Jam</strong>
            </div>
          </div>

          {/* LEMBAR PENGESAHAN TANDA TANGAN (3 KOLOM RESMI) */}
          <div className="kartu-ttd-section">
            <div className="ttd-col">
              <div className="ttd-title">Pegawai Yang Bersangkutan,</div>
              <div className="ttd-space" />
              <div className="ttd-name bold">{pInfo.nama}</div>
              <div className="ttd-nip">PIN Mesin: #{pInfo.pin}</div>
            </div>

            <div className="ttd-col">
              <div className="ttd-title">Mengetahui,<br />Kepala Ruangan / Instalasi,</div>
              <div className="ttd-space" />
              <div className="ttd-name">( .................................................... )</div>
              <div className="ttd-nip">NIP. .................................................</div>
            </div>

            <div className="ttd-col">
              <div className="ttd-title">Samarinda, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br />Kasubag Kepegawaian & SDM,</div>
              <div className="ttd-space" />
              <div className="ttd-name bold">Hj. Siti Nurlaila, S.Kep., Ns.</div>
              <div className="ttd-nip">NIP. 19820412 200801 2 015</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

