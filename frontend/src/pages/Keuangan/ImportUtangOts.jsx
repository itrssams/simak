import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  Upload,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter,
  Database,
  RefreshCw,
  Info,
  DollarSign,
  Layers,
  FileText,
  ChevronLeft,
  ChevronRight,
  RotateCcw
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
  const [rollingBack, setRollingBack] = useState(false);

  // Staging state
  const [stagedData, setStagedData] = useState(null); // { summary: {}, items: [] }
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'anomali' | 'unpaid' | 'lunas'

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedKategori, setSelectedKategori] = useState('all');

  // Client-side pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
      const res = await api.post('/keuangan/utang-supplier/ots-preview/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStagedData(res.data);
      setPage(1);
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

  // Paginated items
  const totalFilteredRows = filteredItems.length;
  const totalPages = Math.ceil(totalFilteredRows / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

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
      const res = await api.post('/keuangan/utang-supplier/ots-commit/', { items: stagedData.items });
      toast.success(res.data.message || 'Berhasil meng-upload data ke database!');
      navigate('/keuangan/catatan-utang/obat-bhp');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Gagal menyimpan data ke database.');
    } finally {
      setCommitting(false);
    }
  };

  // Rollback / Undo Import from DB
  const handleRollbackImport = async () => {
    if (!window.confirm('PERINGATAN UNDO IMPORT!\n\nApakah Anda yakin ingin menghapus SELURUH data utang hasil import Excel OTS dari database SIMAK dan mengembalikan database ke kondisi semula sebelum import?')) {
      return;
    }

    setRollingBack(true);
    try {
      const res = await api.post('/keuangan/utang-supplier/ots-rollback/');
      toast.success(res.data.message || 'Berhasil mengembalikan data ke sebelum import.');
      setStagedData(null);
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Gagal melakukan undo import.');
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="import-ots-page">
      {/* Header Navigation */}
      <div className="import-ots-header">
        <div className="header-top-row">
          <button className="btn-back" onClick={() => navigate('/keuangan/catatan-utang/obat-bhp')}>
            <ArrowLeft size={16} /> Kembali ke Catatan Utang
          </button>
          
          <button className="btn-rollback" onClick={handleRollbackImport} disabled={rollingBack}>
            {rollingBack ? <RefreshCw className="spin" size={16} /> : <RotateCcw size={16} />}
            {rollingBack ? ' Mengembalikan Data...' : ' Undo / Hapus Data Import OTS (Rollback)'}
          </button>
        </div>

        <div className="title-section">
          <h1>
            <FileSpreadsheet size={26} className="icon-title" /> Import & Rekonsiliasi Data Utang Excel OTS
          </h1>
          <p>
            Staging area lokal untuk memverifikasi, menyaring, dan menyelesaikan anomali data utang Excel sebelum di-commit ke database SIMAK.
          </p>
        </div>
      </div>

      {/* Step 1: Upload Dropzone */}
      {!stagedData ? (
        <div className="upload-box-container card">
          <div className="upload-box-inner">
            <Upload size={52} className="upload-icon" />
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
              <div className="card-icon total"><FileText size={22} /></div>
              <div className="card-info">
                <span className="card-label">TOTAL FAKTUR STAGING</span>
                <span className="card-value">{stagedData.summary.total_rows.toLocaleString('id-ID')} faktur</span>
              </div>
            </div>

            <div className="summary-card nominal">
              <div className="card-icon nominal"><DollarSign size={22} /></div>
              <div className="card-info">
                <span className="card-label">TOTAL NOMINAL FAKTUR</span>
                <span className="card-value">{formatRupiah(stagedData.summary.total_nominal)}</span>
              </div>
            </div>

            <div className="summary-card unpaid">
              <div className="card-icon unpaid"><AlertTriangle size={22} /></div>
              <div className="card-info">
                <span className="card-label">SISA UTANG AKTIF</span>
                <span className="card-value text-danger">{formatRupiah(stagedData.summary.total_sisa_utang)}</span>
                <span className="card-sub">{stagedData.summary.total_utang_aktif} faktur aktif</span>
              </div>
            </div>

            <div className="summary-card anomali">
              <div className="card-icon anomali"><Info size={22} /></div>
              <div className="card-info">
                <span className="card-label">PERLU REVIEW / ANOMALI</span>
                <span className="card-value text-warning">{stagedData.summary.total_anomali} faktur</span>
                <span className="card-sub">Daftar duplikat & status mismatch</span>
              </div>
            </div>
          </div>

          {/* Controls Bar: Tabs & Search & Filters */}
          <div className="ots-controls-bar card">
            <div className="controls-top-row">
              <div className="tab-buttons">
                <button
                  className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('all'); setPage(1); }}
                >
                  <Layers size={15} /> Semua Data ({stagedData.items.length})
                </button>
                <button
                  className={`tab-btn anomali ${activeTab === 'anomali' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('anomali'); setPage(1); }}
                >
                  <AlertTriangle size={15} /> Anomali & Duplikat ({stagedData.summary.total_anomali})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'unpaid' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('unpaid'); setPage(1); }}
                >
                  Utang Aktif ({stagedData.summary.total_utang_aktif})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'lunas' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('lunas'); setPage(1); }}
                >
                  Lunas ({stagedData.summary.total_lunas})
                </button>
              </div>

              <button className="btn-secondary btn-reset-upload" onClick={() => setStagedData(null)} title="Upload ulang file Excel">
                <RefreshCw size={15} /> Upload Ulang
              </button>
            </div>

            <div className="controls-filter-row">
              <DebouncedSearchInput
                value={search}
                onChange={(val) => { setSearch(val); setPage(1); }}
                placeholder="Cari Vendor, SPB, No Faktur, Row..."
                className="ots-search-input"
              />

              <div className="filter-dropdown">
                <Filter size={14} />
                <select value={selectedVendor} onChange={(e) => { setSelectedVendor(e.target.value); setPage(1); }}>
                  <option value="all">Semua Vendor ({vendorList.length})</option>
                  {vendorList.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="filter-dropdown">
                <select value={selectedKategori} onChange={(e) => { setSelectedKategori(e.target.value); setPage(1); }}>
                  <option value="all">Semua Kategori ({kategoriList.length})</option>
                  {kategoriList.map((k) => (
                    <option key={k} value={k}>{k || 'Lain-lain'}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Special Banner for Anomali Tab */}
          {activeTab === 'anomali' && (
            <div className="anomali-banner card">
              <div className="banner-text">
                <AlertTriangle size={20} className="icon-warn" />
                <span>
                  <strong>Area Verifikasi Manual Anomali:</strong> Terdapat <b>{stagedData.summary.total_anomali}</b> faktur yang terindikasi ganda, status ragu, atau tanpa nomor SPB.
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
            <div className="table-scroll-wrapper">
              <table className="ots-table">
                <thead>
                  <tr>
                    <th className="col-row">Row</th>
                    <th className="col-vendor">Vendor / Distributor</th>
                    <th className="col-kategori">Kategori</th>
                    <th className="col-spb">No. SPB</th>
                    <th className="col-faktur">No. Faktur Supplier</th>
                    <th className="col-tgl">Tgl Faktur</th>
                    <th className="col-tgl">Tgl Titip</th>
                    <th className="col-nominal text-right">Nominal</th>
                    <th className="col-bayar text-right">Dibayar</th>
                    <th className="col-sisa text-right">Sisa Utang</th>
                    <th className="col-status">Status SIMAK</th>
                    <th className="col-aksi text-center">Aksi Verifikasi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-5 text-muted">
                        Tidak ada data faktur yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`row-item ${item.is_anomali ? 'has-anomali' : ''} ${item.user_action === 'abaikan' ? 'ignored' : ''}`}
                      >
                        <td className="col-row font-mono text-muted">#{item.row_idx}</td>
                        <td className="col-vendor">
                          <div className="vendor-name">{item.vendor_nama}</div>
                          {item.is_green && <span className="badge badge-excel-green">Excel Hijau</span>}
                        </td>
                        <td className="col-kategori">
                          <span className="badge badge-kategori">{item.kategori || 'OBAT/BHP'}</span>
                        </td>
                        <td className="col-spb"><code className="code-spb">{item.no_spb || '-'}</code></td>
                        <td className="col-faktur"><span className="font-mono text-sm">{item.no_faktur}</span></td>
                        <td className="col-tgl">{item.tgl_faktur || '-'}</td>
                        <td className="col-tgl">{item.tgl_titip || item.tgl_faktur || '-'}</td>
                        <td className="col-nominal text-right font-medium">{formatRupiah(item.nominal)}</td>
                        <td className="col-bayar text-right text-success">{formatRupiah(item.jumlah_bayar)}</td>
                        <td className={`col-sisa text-right font-bold ${item.sisa_utang > 0 ? 'text-danger' : 'text-muted'}`}>
                          {formatRupiah(item.sisa_utang)}
                        </td>
                        <td className="col-status">
                          {item.status_ditentukan === 'lunas' ? (
                            <span className="status-pill lunas">Lunas</span>
                          ) : item.status_ditentukan === 'sebagian' ? (
                            <span className="status-pill sebagian">Sebagian</span>
                          ) : (
                            <span className="status-pill belum">Belum Dibayar</span>
                          )}

                          {item.is_anomali && (
                            <div className="anomali-reasons-list">
                              {item.anomali_reasons.map((r, idx) => (
                                <div key={idx} className="reason-item">
                                  <AlertTriangle size={11} /> {r}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="col-aksi text-center">
                          <div className="action-buttons-group">
                            <button
                              className={`btn-action btn-accept ${item.user_action === 'terima' ? 'active' : ''}`}
                              onClick={() => handleSetAction(item.id, 'terima')}
                              title="Terima Faktur Ini"
                            >
                              <CheckCircle size={14} /> Terima
                            </button>

                            <button
                              className={`btn-action btn-ignore ${item.user_action === 'abaikan' ? 'active' : ''}`}
                              onClick={() => handleSetAction(item.id, 'abaikan')}
                              title="Abaikan / Lewati Faktur Ini"
                            >
                              <XCircle size={14} /> Abaikan
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalFilteredRows > 0 && (
              <div className="ots-pagination-bar">
                <div className="pagination-info">
                  Menampilkan <b>{Math.min((page - 1) * pageSize + 1, totalFilteredRows)}</b> - <b>{Math.min(page * pageSize, totalFilteredRows)}</b> dari <b>{totalFilteredRows}</b> faktur
                </div>

                <div className="pagination-controls">
                  <button
                    className="btn-page"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>

                  <span className="page-current">Halaman <b>{page}</b> / {totalPages}</span>

                  <button
                    className="btn-page"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next <ChevronRight size={16} />
                  </button>

                  <select
                    className="select-page-size"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    <option value={25}>25 / hal</option>
                    <option value={50}>50 / hal</option>
                    <option value={100}>100 / hal</option>
                    <option value={250}>250 / hal</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Floating Commit Action Bar */}
          <div className="bottom-commit-bar">
            <div className="commit-info">
              <Database size={22} className="icon-db" />
              <div>
                <strong>Siap Meng-upload Data ke Database SIMAK:</strong>
                <span>
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
