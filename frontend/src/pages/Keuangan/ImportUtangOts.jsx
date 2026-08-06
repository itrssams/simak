import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  Upload,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit3,
  Search,
  Filter,
  Database,
  RefreshCw,
  Info,
  DollarSign,
  Layers,
  FileText
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import DebouncedSearchInput from '../../components/DebouncedSearchInput';
import './ImportUtangOts.css';

const formatRupiah = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(val);
};

export default function ImportUtangOts() {
  const navigate = useNavigate();
  const toast = useToast();

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Staging state
  const [stagedData, setStagedData] = useState(null); // { summary: {}, items: [] }
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'anomali' | 'unpaid' | 'lunas'

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedKategori, setSelectedKategori] = useState('all');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndPreview = async () => {
    if (!file) {
      toast.error('Pilih file Excel OTS terlebih dahulu.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/api/keuangan/catatan-utang/ots-preview/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStagedData(res.data);
      toast.success(`Berhasil membaca ${res.data.summary.total_rows} data faktur dari Excel.`);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Gagal memproses file Excel.');
    } finally {
      setLoading(false);
    }
  };

  // Vendor & Kategori lists for filter dropdown
  const vendorList = useMemo(() => {
    if (!stagedData?.items) return [];
    const setV = new Set(stagedData.items.map((i) => i.vendor_nama).filter(Boolean));
    return Array.from(setV).sort();
  }, [stagedData]);

  const kategoriList = useMemo(() => {
    if (!stagedData?.items) return [];
    const setK = new Set(stagedData.items.map((i) => i.kategori).filter(Boolean));
    return Array.from(setK).sort();
  }, [stagedData]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!stagedData?.items) return [];
    return stagedData.items.filter((item) => {
      // Tab filter
      if (activeTab === 'anomali' && !item.is_anomali) return false;
      if (activeTab === 'unpaid' && item.status_ditentukan === 'lunas') return false;
      if (activeTab === 'lunas' && item.status_ditentukan !== 'lunas') return false;

      // Dropdown filters
      if (selectedVendor !== 'all' && item.vendor_nama !== selectedVendor) return false;
      if (selectedKategori !== 'all' && item.kategori !== selectedKategori) return false;

      // Search filter
      if (search) {
        const needle = search.toLowerCase();
        const matchVendor = (item.vendor_nama || '').toLowerCase().includes(needle);
        const matchSpb = (item.no_spb || '').toLowerCase().includes(needle);
        const matchFaktur = (item.no_faktur || '').toLowerCase().includes(needle);
        const matchRow = String(item.row_idx).includes(needle);
        if (!matchVendor && !matchSpb && !matchFaktur && !matchRow) return false;
      }

      return true;
    });
  }, [stagedData, activeTab, selectedVendor, selectedKategori, search]);

  // Update item user_action
  const handleSetAction = (itemId, action) => {
    setStagedData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((item) => {
        if (item.id === itemId) {
          return { ...item, user_action: action };
        }
        return item;
      });
      return { ...prev, items: updatedItems };
    });
  };

  // Bulk action on tab anomali
  const handleBulkActionAnomali = (action) => {
    setStagedData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((item) => {
        if (item.is_anomali) {
          return { ...item, user_action: action };
        }
        return item;
      });
      return { ...prev, items: updatedItems };
    });
    toast.info?.(`Seluruh item anomali diubah aksinya ke '${action}'.`) || toast.success(`Seluruh item anomali diubah aksinya ke '${action}'.`);
  };

  // Commit to DB
  const handleCommitToDatabase = async () => {
    if (!stagedData?.items) return;

    const activeItems = stagedData.items.filter((i) => i.user_action !== 'abaikan');
    if (activeItems.length === 0) {
      toast.error('Tidak ada faktur aktif yang dipilih untuk di-upload.');
      return;
    }

    if (!window.confirm(`Konfirmasi: Anda akan meng-upload ${activeItems.length} data faktur utang dari area staging ke database SIMAK permanen. Lanjutkan?`)) {
      return;
    }

    setCommitting(true);
    try {
      const res = await api.post('/api/keuangan/catatan-utang/ots-commit/', { items: stagedData.items });
      toast.success(res.data.message || 'Berhasil meng-upload data ke database!');
      navigate('/keuangan/catatan-utang/obat-bhp');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Gagal menyimpan data ke database.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="import-ots-page">
      {/* Header Navigation */}
      <div className="import-ots-header">
        <button className="btn-back" onClick={() => navigate('/keuangan/catatan-utang/obat-bhp')}>
          <ArrowLeft size={18} /> Kembali ke Catatan Utang
        </button>
        <div className="title-section">
          <h1>
            <FileSpreadsheet size={28} className="icon-title" /> Import & Rekonsiliasi Data Utang Excel OTS
          </h1>
          <p>
            Staging area lokal untuk memverifikasi, menyaring, dan menyelesaikan anomali data utang Excel sebelum di-commit ke database SIMAK.
          </p>
        </div>
      </div>

      {/* Step 1: Upload Dropzone (If no data loaded yet or want to re-upload) */}
      {!stagedData ? (
        <div className="upload-box-container card">
          <div className="upload-box-inner">
            <Upload size={48} className="upload-icon" />
            <h3>Pilih File Excel OTS Gabungan 2026</h3>
            <p>Format yang didukung: <code>.xlsx</code> / <code>.xls</code> (Sheet utama <b>LIST FAKTUR</b>)</p>

            <div className="file-input-wrapper">
              <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} id="ots-file-input" />
              <label htmlFor="ots-file-input" className="btn-select-file">
                {file ? file.name : 'Pilih File Excel...'}
              </label>
            </div>

            {file && (
              <button
                className="btn-primary btn-process"
                onClick={handleUploadAndPreview}
                disabled={loading}
              >
                {loading ? <RefreshCw className="spin" size={18} /> : <Layers size={18} />}
                {loading ? ' Membaca & Menganalisis Excel...' : ' Proses & Analisis Staging Data'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="ots-summary-grid">
            <div className="summary-card total">
              <div className="card-icon"><FileText size={22} /></div>
              <div className="card-info">
                <span className="card-label">Total Faktur Staging</span>
                <span className="card-value">{stagedData.summary.total_rows} faktur</span>
              </div>
            </div>

            <div className="summary-card nominal">
              <div className="card-icon"><DollarSign size={22} /></div>
              <div className="card-info">
                <span className="card-label">Total Nominal Faktur</span>
                <span className="card-value">{formatRupiah(stagedData.summary.total_nominal)}</span>
              </div>
            </div>

            <div className="summary-card unpaid">
              <div className="card-icon"><AlertTriangle size={22} /></div>
              <div className="card-info">
                <span className="card-label">Sisa Utang Aktif</span>
                <span className="card-value">{formatRupiah(stagedData.summary.total_sisa_utang)}</span>
                <span className="card-sub">{stagedData.summary.total_utang_aktif} faktur aktif</span>
              </div>
            </div>

            <div className="summary-card anomali">
              <div className="card-icon"><Info size={22} /></div>
              <div className="card-info">
                <span className="card-label">Perlu Review / Anomali</span>
                <span className="card-value">{stagedData.summary.total_anomali} faktur</span>
                <span className="card-sub">Daftar duplikat & status mismatch</span>
              </div>
            </div>
          </div>

          {/* Controls Bar: Search & Filter */}
          <div className="ots-controls-bar card">
            <div className="controls-left">
              <div className="tab-buttons">
                <button
                  className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  <Layers size={16} /> Semua Data ({stagedData.items.length})
                </button>
                <button
                  className={`tab-btn anomali ${activeTab === 'anomali' ? 'active' : ''}`}
                  onClick={() => setActiveTab('anomali')}
                >
                  <AlertTriangle size={16} /> Anomali & Duplikat ({stagedData.summary.total_anomali})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'unpaid' ? 'active' : ''}`}
                  onClick={() => setActiveTab('unpaid')}
                >
                  Utang Aktif ({stagedData.summary.total_utang_aktif})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'lunas' ? 'active' : ''}`}
                  onClick={() => setActiveTab('lunas')}
                >
                  Lunas ({stagedData.summary.total_lunas})
                </button>
              </div>
            </div>

            <div className="controls-right">
              <DebouncedSearchInput
                value={search}
                onChange={(val) => setSearch(val)}
                placeholder="Cari Vendor, SPB, No Faktur, Row..."
                className="ots-search-input"
              />

              <div className="filter-dropdown">
                <Filter size={15} />
                <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)}>
                  <option value="all">Semua Vendor ({vendorList.length})</option>
                  {vendorList.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="filter-dropdown">
                <select value={selectedKategori} onChange={(e) => setSelectedKategori(e.target.value)}>
                  <option value="all">Semua Kategori ({kategoriList.length})</option>
                  {kategoriList.map((k) => (
                    <option key={k} value={k}>{k || 'Lain-lain'}</option>
                  ))}
                </select>
              </div>

              <button className="btn-secondary btn-reset-upload" onClick={() => setStagedData(null)} title="Upload ulang file Excel">
                <RefreshCw size={16} /> Reset
              </button>
            </div>
          </div>

          {/* Special Toolbar for Anomali Tab */}
          {activeTab === 'anomali' && (
            <div className="anomali-banner card">
              <div className="banner-text">
                <AlertTriangle size={20} className="icon-warn" />
                <span>
                  <strong>Area Verifikasi Manual Anomali:</strong> Terdapat <b>{stagedData.summary.total_anomali}</b> faktur yang terindikasi ganda, status ragu, atau tanpa nomor SPB. Pilih tindakan per item di bawah.
                </span>
              </div>
              <div className="banner-actions">
                <button className="btn-small accept-all" onClick={() => handleBulkActionAnomali('terima')}>
                  <CheckCircle size={14} /> Terima Semua Anomali
                </button>
                <button className="btn-small skip-all" onClick={() => handleBulkActionAnomali('abaikan')}>
                  <XCircle size={14} /> Abaikan Semua Anomali
                </button>
              </div>
            </div>
          )}

          {/* Staging Data Table */}
          <div className="table-container card">
            <table className="ots-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Row</th>
                  <th>Vendor / Distributor</th>
                  <th>Kategori</th>
                  <th>No. SPB</th>
                  <th>No. Faktur Supplier</th>
                  <th>Tgl Faktur</th>
                  <th style={{ textAlign: 'right' }}>Nominal</th>
                  <th style={{ textAlign: 'right' }}>Dibayar</th>
                  <th style={{ textAlign: 'right' }}>Sisa Utang</th>
                  <th>Status SIMAK</th>
                  <th>Aksi Verifikasi</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-4">
                      Tidak ada data faktur yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`row-item ${item.is_anomali ? 'has-anomali' : ''} ${item.user_action === 'abaikan' ? 'ignored' : ''}`}
                    >
                      <td className="font-mono text-muted">#{item.row_idx}</td>
                      <td>
                        <div className="vendor-name font-semibold">{item.vendor_nama}</div>
                        {item.is_green && <span className="badge badge-green-fill">Excel Hijau</span>}
                      </td>
                      <td><span className="badge badge-kategori">{item.kategori || 'OBAT/BHP'}</span></td>
                      <td><code className="code-spb">{item.no_spb || '-'}</code></td>
                      <td><span className="font-mono text-sm">{item.no_faktur}</span></td>
                      <td>{item.tgl_faktur || '-'}</td>
                      <td className="text-right font-medium">{formatRupiah(item.nominal)}</td>
                      <td className="text-right text-success">{formatRupiah(item.jumlah_bayar)}</td>
                      <td className="text-right font-bold text-danger">{formatRupiah(item.sisa_utang)}</td>
                      <td>
                        {item.status_ditentukan === 'lunas' ? (
                          <span className="badge badge-success">Lunas</span>
                        ) : item.status_ditentukan === 'sebagian' ? (
                          <span className="badge badge-warning">Sebagian</span>
                        ) : (
                          <span className="badge badge-danger">Belum Dibayar</span>
                        )}

                        {item.is_anomali && (
                          <div className="anomali-reasons-list">
                            {item.anomali_reasons.map((r, idx) => (
                              <div key={idx} className="reason-item">
                                <AlertTriangle size={12} /> {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons-cell">
                          <button
                            className={`btn-action btn-accept ${item.user_action === 'terima' ? 'active' : ''}`}
                            onClick={() => handleSetAction(item.id, 'terima')}
                            title="Terima & Masukkan ke Database"
                          >
                            <CheckCircle size={15} /> Terima
                          </button>

                          <button
                            className={`btn-action btn-ignore ${item.user_action === 'abaikan' ? 'active' : ''}`}
                            onClick={() => handleSetAction(item.id, 'abaikan')}
                            title="Abaikan / Lewati Faktur Ini"
                          >
                            <XCircle size={15} /> Abaikan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Floating Commit Action Bar */}
          <div className="bottom-commit-bar">
            <div className="commit-info">
              <Database size={22} className="icon-db" />
              <div>
                <strong>Siap Meng-upload Data ke Database SIMAK:</strong>
                <span>
                  {' '}
                  <b>{stagedData.items.filter((i) => i.user_action !== 'abaikan').length}</b> faktur diterima,{' '}
                  <b>{stagedData.items.filter((i) => i.user_action === 'abaikan').length}</b> faktur diabaikan.
                </span>
              </div>
            </div>

            <button
              className="btn-commit-db"
              onClick={handleCommitToDatabase}
              disabled={committing}
            >
              {committing ? <RefreshCw className="spin" size={18} /> : <CheckCircle size={18} />}
              {committing ? ' Menyimpan ke Database...' : ' Konfirmasi Upload ke Database SIMAK'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
