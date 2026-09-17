import React, { useState, useEffect } from 'react';
import { 
    Search, User, Activity, Clock, ShieldCheck, Stethoscope, 
    Pill, Syringe, FileText, Bed, TestTube, Microscope, Wrench, 
    MoreHorizontal, Edit, ArrowRightLeft, Lock, Unlock, Zap, Trash, Hash
} from 'lucide-react';
import api from '../../api/axiosConfig';
import { useToast } from '../../context/ToastContext';
import './ITCenter.css';

const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(number);
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

export default function TransactionCorrection() {
    const toast = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const [noKunj, setNoKunj] = useState(null);
    const [patientData, setPatientData] = useState(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    // Modals state
    const [isDateModalOpen, setIsDateModalOpen] = useState(false);
    const [dateForm, setDateForm] = useState({ table: '', item_no: '', new_date: '' });
    
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveForm, setMoveForm] = useState({ apt_no: '', target_kunj: '' });

    const [isQtyModalOpen, setIsQtyModalOpen] = useState(false);
    const [qtyForm, setQtyForm] = useState({ table: '', item_no: '', name: '', new_qty: 1 });
    
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery) return;
        setIsSearching(true);
        try {
            const res = await api.get(`/it/transaction-correction/search/?q=${searchQuery}`);
            setSearchResults(res.data);
            if (res.data.length === 1) {
                loadDetail(res.data[0].no);
            }
        } catch (err) {
            toast.error("Gagal mencari data");
        } finally {
            setIsSearching(false);
        }
    };

    const loadDetail = async (no) => {
        setIsLoadingDetail(true);
        try {
            const res = await api.get(`/it/transaction-correction/detail/?no_kunj=${no}`);
            setPatientData(res.data);
            setNoKunj(no);
            setSearchResults([]);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal memuat detail kunjungan");
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleUpdateDate = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Yakin mengubah tanggal item ${dateForm.item_no}?`)) return;
        try {
            const res = await api.post(`/it/transaction-correction/update-date/`, {
                ...dateForm,
                no_kunj: noKunj
            });
            toast.success(res.data.message);
            setIsDateModalOpen(false);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal mengubah tanggal");
        }
    };

    const handleUpdateQty = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Yakin mengubah Qty untuk ${qtyForm.name || qtyForm.item_no} menjadi ${qtyForm.new_qty}?`)) return;
        try {
            const res = await api.post(`/it/transaction-correction/update-qty/`, {
                ...qtyForm,
                no_kunj: noKunj
            });
            toast.success(res.data.message);
            setIsQtyModalOpen(false);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal mengubah qty");
        }
    };

    const handleBatchSync = async () => {
        if(!patientData?.pasien?.tgl_masuk) return;
        const targetDate = patientData.pasien.tgl_masuk.split('.')[0]; // trim milliseconds
        
        let items = [];
        // Just as an example, we can collect all Jasa and Farmasi items that don't match the target date's YYYY-MM-DD
        const targetYMD = targetDate.split('T')[0];
        
        patientData.jasa?.forEach(i => {
            if (i.tgl && !i.tgl.startsWith(targetYMD)) items.push({table: 'jasa', item_no: i.no});
        });
        patientData.farmasi?.forEach(fh => {
            if (fh.tgl && !fh.tgl.startsWith(targetYMD)) items.push({table: 'farmasi', item_no: fh.no_resep});
        });

        if (items.length === 0) {
            toast.info("Semua tanggal Jasa dan Farmasi sudah sesuai dengan tanggal masuk.");
            return;
        }

        if (!window.confirm(`Yakin menyamakan ${items.length} item ke tanggal ${targetDate}?`)) return;
        
        try {
            const res = await api.post(`/it/transaction-correction/batch-sync-date/`, {
                no_kunj: noKunj,
                target_date: targetDate,
                items: items
            });
            toast.success(res.data.message);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal sinkronisasi tanggal");
        }
    };

    const handleMovePrescription = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Yakin memindah resep ${moveForm.apt_no} ke ${moveForm.target_kunj}?`)) return;
        try {
            const res = await api.post(`/it/transaction-correction/move-prescription/`, {
                apt_no: moveForm.apt_no,
                target_kunj: moveForm.target_kunj,
                old_kunj: noKunj
            });
            toast.success(res.data.message);
            setIsMoveModalOpen(false);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal memindah resep");
        }
    };

    const handleToggleLock = async (currentStatus) => {
        const newStatus = currentStatus === 1 ? 0 : 1;
        const statusText = newStatus === 1 ? "Kunci (Tutup)" : "Buka Kunci";
        if (!window.confirm(`Yakin ingin ${statusText} billing ini?`)) return;
        
        try {
            const res = await api.post(`/it/transaction-correction/toggle-lock/`, {
                no_kunj: noKunj,
                new_status: newStatus
            });
            toast.success(res.data.message);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal mengubah status lock");
        }
    };

    const handleDeleteItem = async (table, itemNo) => {
        if (!window.confirm(`HAPUS ITEM: Yakin menghapus ${itemNo} secara permanen? Aksi ini akan mengubah subtotal billing.`)) return;
        try {
            const res = await api.post(`/it/transaction-correction/delete-item/`, {
                table,
                item_no: itemNo,
                no_kunj: noKunj
            });
            toast.success(res.data.message);
            loadDetail(noKunj);
        } catch (err) {
            toast.error(err.response?.data?.error || "Gagal menghapus item");
        }
    }

    const renderTable = (headers, rows, renderRow, emptyMessage) => {
        if (!rows || rows.length === 0) return (
            <div style={{ padding: '16px 20px', color: '#64748b', fontSize: '13px', fontStyle: 'italic', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                {emptyMessage}
            </div>
        );
        return (
            <div className="tc-table-wrapper">
                <table className="tc-table">
                    <thead>
                        <tr>
                            {headers.map((h, i) => <th key={i}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => renderRow(row, i))}
                    </tbody>
                </table>
            </div>
        );
    };

    const cellStyle = {};

    return (
        <div className="pc-page it-page" style={{ paddingBottom: '60px' }}>
            <section className="pc-hero" style={{ marginBottom: '24px' }}>
                <div className="pc-hero-main">
                    <div>
                        <div className="pc-eyebrow">
                            <Wrench size={15} /> Utilitas IT & SIMRS
                        </div>
                        <h1 className="pc-title">Koreksi Data Transaksi</h1>
                        <p className="pc-subtitle">
                            Koreksi tanggal, pindah kunjungan, dan update rincian biaya langsung ke database legacy rssams.
                        </p>
                    </div>
                </div>
            </section>

            {/* Search Section */}
            <div className="pc-section-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                        <input 
                            type="text" 
                            className="pc-input"
                            style={{ paddingLeft: '38px', height: '40px' }}
                            placeholder="Masukkan No. Kunjungan, No. RM, atau No. Resep (APT-xxxx)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="pc-btn-primary" style={{ height: '40px' }} disabled={isSearching}>
                        {isSearching ? 'Mencari...' : 'Cari Data'}
                    </button>
                </form>

                {searchResults.length > 0 && (
                    <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        {searchResults.map(res => (
                            <div 
                                key={res.no} 
                                style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                                onClick={() => loadDetail(res.no)}
                                className="search-result-row"
                            >
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{res.no} - {res.nama}</div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>RM: {res.noreg} | Masuk: {formatDate(res.tgl_masuk)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isLoadingDetail && <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Memuat detail kunjungan...</div>}

            {patientData?.pasien && (
                <>
                    {/* Patient Header */}
                    <div className="pc-section-card" style={{ padding: '24px', marginBottom: '24px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        {patientData.pasien.nama} 
                                    </h2>
                                    <span style={{ padding: '2px 8px', background: '#e2e8f0', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                                        RM: {patientData.pasien.noreg}
                                    </span>
                                    {patientData.pasien.cek === 1 ? (
                                        <span style={{ padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }} title="Kasir sudah tutup transaksi ini">
                                            <Lock size={12}/> Terkunci
                                        </span>
                                    ) : (
                                        <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: '12px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Unlock size={12}/> Terbuka
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '14px', color: '#475569', display: 'flex', gap: '16px' }}>
                                    <span><strong>No. Kunj:</strong> {patientData.pasien.no}</span>
                                    <span><strong>SEP:</strong> {patientData.pasien.no_sep || '-'}</span>
                                    <span><strong>Penjamin:</strong> {patientData.pasien.pembiayaan}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="pc-btn-secondary" onClick={() => handleToggleLock(patientData.pasien.cek)}>
                                    {patientData.pasien.cek === 1 ? <Unlock size={14}/> : <Lock size={14}/>} 
                                    {patientData.pasien.cek === 1 ? "Buka Kunci" : "Tutup Kunci"}
                                </button>
                                <button className="pc-btn-primary" style={{ background: '#0284c7', borderColor: '#0284c7' }} onClick={handleBatchSync}>
                                    <Zap size={14}/> Sync ke Tgl Masuk
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div><div style={{ fontSize: '12px', color: '#64748b' }}>Tgl Masuk</div><div style={{ fontWeight: 600 }}>{formatDate(patientData.pasien.tgl_masuk)}</div></div>
                            <div><div style={{ fontSize: '12px', color: '#64748b' }}>Tgl Keluar</div><div style={{ fontWeight: 600 }}>{formatDate(patientData.pasien.tgl_keluar)}</div></div>
                            <div><div style={{ fontSize: '12px', color: '#64748b' }}>Kelas</div><div style={{ fontWeight: 600 }}>{patientData.pasien.kelas_nama || '-'}</div></div>
                            <div><div style={{ fontSize: '12px', color: '#64748b' }}>DPJP</div><div style={{ fontWeight: 600 }}>{patientData.pasien.dpjp || '-'}</div></div>
                        </div>

                        {/* Summary Bar */}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['adm','jasa','farmasi','tindakan','bhp','lab','rad','kamar'].map(k => (
                                <div key={k} className="tc-summary-pill">
                                    <span className="label">{k}:</span> 
                                    <span className="val">{formatRupiah(patientData.pasien[k] || 0)}</span>
                                </div>
                            ))}
                            <div className="tc-summary-pill total">
                                <span className="label">TOTAL JMLBYR:</span>
                                <span className="val">{formatRupiah(patientData.pasien.jmlbyr || 0)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Section: Biaya Jasa */}
                    <div className="pc-section-card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                            <Stethoscope size={18} color="#0284c7" /> Biaya Jasa
                        </h3>
                        {renderTable(
                            ['Tanggal', 'Uraian Jasa', 'Petugas', 'Tarif', 'Qty', 'Total', 'Aksi'],
                            patientData.jasa,
                            (row, i) => (
                                <tr key={i}>
                                    <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                    <td style={cellStyle}>{row.uraian}</td>
                                    <td style={cellStyle}>{row.nama_petugas}</td>
                                    <td style={cellStyle}>{formatRupiah(row.harga)}</td>
                                    <td style={cellStyle}>{row.qty}</td>
                                    <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                    <td style={cellStyle}>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'jasa', item_no: row.no, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }} title="Ubah Tanggal"><Edit size={13} /></button>
                                            <button className="tc-action-btn delete" onClick={() => handleDeleteItem('jasa', row.no)} title="Hapus"><Trash size={13} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ),
                            "Tidak ada biaya jasa."
                        )}
                    </div>

                    {/* Section: Biaya Farmasi */}
                    <div className="pc-section-card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                            <Pill size={18} color="#16a34a" /> Biaya Farmasi
                        </h3>
                        {(!patientData.farmasi || patientData.farmasi.length === 0) ? (
                            <div style={{ padding: '16px', color: '#64748b', fontSize: '14px', fontStyle: 'italic', background: '#f8fafc', borderRadius: '6px' }}>Tidak ada biaya farmasi.</div>
                        ) : (
                            patientData.farmasi.map((resep, ri) => (
                                <div key={ri} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden', background: '#fff' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{resep.no_resep}</span>
                                            <span style={{ marginLeft: '12px', fontSize: '13px', color: '#64748b' }}>{formatDate(resep.tgl)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ marginRight: '8px', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>Total: {formatRupiah(resep.total)}</span>
                                            <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'farmasi', item_no: resep.no_resep, new_date: resep.tgl.split('.')[0]}); setIsDateModalOpen(true); }}><Edit size={13} /> Tanggal</button>
                                            <button className="tc-action-btn move" onClick={() => { setMoveForm({apt_no: resep.no_resep, target_kunj: ''}); setIsMoveModalOpen(true); }}><ArrowRightLeft size={13} /> Pindah</button>
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 16px' }}>
                                        {renderTable(
                                            ['ID', 'Nama Obat', 'Qty', 'Satuan', 'Harga', 'Total', 'Aksi'],
                                            resep.items,
                                            (row, i) => (
                                                <tr key={i}>
                                                    <td style={cellStyle}>{row.no}</td>
                                                    <td style={cellStyle}>{row.nama_barang}</td>
                                                    <td style={{...cellStyle, fontWeight: 600}}>{row.qty}</td>
                                                    <td style={cellStyle}>{row.satuan}</td>
                                                    <td style={cellStyle}>{formatRupiah(row.harga)}</td>
                                                    <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                                    <td style={cellStyle}>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button className="tc-action-btn edit" onClick={() => { setQtyForm({table: 'farmasi_detail', item_no: row.no, new_qty: row.qty, name: row.nama_barang}); setIsQtyModalOpen(true); }} title="Ubah Qty"><Edit size={13} /></button>
                                                            <button className="tc-action-btn delete" onClick={() => handleDeleteItem('farmasi_detail', row.no)} title="Hapus Item Obat"><Trash size={13} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ),
                                            "Kosong"
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Section: Biaya Tindakan */}
                    <div className="pc-section-card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                            <Syringe size={18} color="#e11d48" /> Biaya Tindakan
                        </h3>
                        {renderTable(
                            ['Mulai', 'Uraian', 'Operator', 'Tarif', 'Qty', 'Total', 'Aksi'],
                            patientData.tindakan,
                            (row, i) => (
                                <tr key={i}>
                                    <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                    <td style={cellStyle}>{row.uraian}</td>
                                    <td style={cellStyle}>{row.nama_petugas}</td>
                                    <td style={cellStyle}>{formatRupiah(row.harga)}</td>
                                    <td style={{...cellStyle, fontWeight: 600}}>{row.qty}</td>
                                    <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                    <td style={cellStyle}>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'tindakan', item_no: row.no, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }} title="Ubah Tanggal"><Calendar size={13} /></button>
                                            <button className="tc-action-btn edit" onClick={() => { setQtyForm({table: 'tindakan', item_no: row.no, new_qty: row.qty, name: row.uraian}); setIsQtyModalOpen(true); }} title="Ubah Qty"><Edit size={13} /></button>
                                            <button className="tc-action-btn delete" onClick={() => handleDeleteItem('tindakan', row.no)} title="Hapus"><Trash size={13} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ),
                            "Tidak ada biaya tindakan."
                        )}
                    </div>
                    
                    {/* Section: Biaya Administrasi & BHP */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                        <div className="pc-section-card" style={{ padding: '24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                                <FileText size={18} color="#475569" /> Biaya Administrasi
                            </h3>
                            {renderTable(
                                ['Tanggal', 'Uraian', 'Harga', 'Aksi'],
                                patientData.adm,
                                (row, i) => (
                                    <tr key={i}>
                                        <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                        <td style={cellStyle}>{row.uraian}</td>
                                        <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                        <td style={cellStyle}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'adm', item_no: row.no, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }}><Edit size={13} /></button>
                                                <button className="tc-action-btn delete" onClick={() => handleDeleteItem('adm', row.no)}><Trash size={13} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ),
                                "Tidak ada biaya adm."
                            )}
                        </div>
                        <div className="pc-section-card" style={{ padding: '24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                                <Wrench size={18} color="#d97706" /> Biaya BHP
                            </h3>
                            {renderTable(
                                ['Tanggal', 'Uraian', 'Harga', 'Aksi'],
                                patientData.bhp,
                                (row, i) => (
                                    <tr key={i}>
                                        <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                        <td style={cellStyle}>{row.uraian}</td>
                                        <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                        <td style={cellStyle}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'bhp', item_no: row.no, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }}><Edit size={13} /></button>
                                                <button className="tc-action-btn delete" onClick={() => handleDeleteItem('bhp', row.no)}><Trash size={13} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ),
                                "Tidak ada biaya BHP."
                            )}
                        </div>
                    </div>

                    {/* Section: Penunjang */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                        <div className="pc-section-card" style={{ padding: '24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                                <TestTube size={18} color="#8b5cf6" /> Laboratorium
                            </h3>
                            {renderTable(
                                ['Tgl Order', 'No Lab', 'Total', 'Aksi'],
                                patientData.lab,
                                (row, i) => (
                                    <tr key={i}>
                                        <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                        <td style={cellStyle}>{row.no_lab}</td>
                                        <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                        <td style={cellStyle}>
                                            <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'lab', item_no: row.no_lab, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }}><Edit size={13} /></button>
                                        </td>
                                    </tr>
                                ),
                                "Tidak ada order Lab."
                            )}
                        </div>
                        <div className="pc-section-card" style={{ padding: '24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', margin: '0 0 16px', color: '#0f172a' }}>
                                <Microscope size={18} color="#ec4899" /> Radiologi
                            </h3>
                            {renderTable(
                                ['Tgl Order', 'No Rad', 'Total', 'Aksi'],
                                patientData.rad,
                                (row, i) => (
                                    <tr key={i}>
                                        <td style={cellStyle}>{formatDate(row.tgl)}</td>
                                        <td style={cellStyle}>{row.no_rad}</td>
                                        <td style={{...cellStyle, fontWeight: 600}}>{formatRupiah(row.total)}</td>
                                        <td style={cellStyle}>
                                            <button className="tc-action-btn edit" onClick={() => { setDateForm({table: 'rad', item_no: row.no_rad, new_date: row.tgl.split('.')[0]}); setIsDateModalOpen(true); }}><Edit size={13} /></button>
                                        </td>
                                    </tr>
                                ),
                                "Tidak ada order Rad."
                            )}
                        </div>
                    </div>

                </>
            )}

            {/* Modals */}
            {isDateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Ubah Tanggal Item</h3>
                        <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px', color: '#475569' }}>
                            <div>Tabel: <strong>{dateForm.table}</strong></div>
                            <div style={{ marginTop: '4px' }}>No Item: <strong>{dateForm.item_no}</strong></div>
                        </div>
                        <form onSubmit={handleUpdateDate}>
                            <div className="pc-form-group" style={{ marginBottom: '20px' }}>
                                <label className="pc-label">Tanggal & Jam Baru</label>
                                <input 
                                    type="datetime-local" 
                                    className="pc-input" 
                                    value={dateForm.new_date}
                                    onChange={e => setDateForm({...dateForm, new_date: e.target.value})}
                                    step="1"
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" className="pc-btn-secondary" onClick={() => setIsDateModalOpen(false)}>Batal</button>
                                <button type="submit" className="pc-btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isMoveModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Pindah Kunjungan Resep</h3>
                        <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Memindahkan resep:</div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px', marginTop: '2px' }}>{moveForm.apt_no}</div>
                        </div>
                        <form onSubmit={handleMovePrescription}>
                            <div className="pc-form-group" style={{ marginBottom: '20px' }}>
                                <label className="pc-label">No. Kunjungan Tujuan</label>
                                <input 
                                    type="text" 
                                    className="pc-input" 
                                    placeholder="Contoh: 26045602"
                                    value={moveForm.target_kunj}
                                    onChange={e => setMoveForm({...moveForm, target_kunj: e.target.value})}
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" className="pc-btn-secondary" onClick={() => setIsMoveModalOpen(false)}>Batal</button>
                                <button type="submit" className="pc-btn-primary" style={{ background: '#ea580c', borderColor: '#ea580c' }}>Pindahkan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isQtyModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Ubah Jumlah (Qty)</h3>
                        <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                            <div style={{ color: '#64748b', fontSize: '12px' }}>Item:</div>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{qtyForm.name || qtyForm.item_no}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Tabel: {qtyForm.table} (ID: {qtyForm.item_no})</div>
                        </div>
                        <form onSubmit={handleUpdateQty}>
                            <div className="pc-form-group" style={{ marginBottom: '20px' }}>
                                <label className="pc-label">Jumlah / Qty Baru</label>
                                <input 
                                    type="number" 
                                    step="any"
                                    min="0.01"
                                    className="pc-input" 
                                    placeholder="Contoh: 1"
                                    value={qtyForm.new_qty}
                                    onChange={e => setQtyForm({...qtyForm, new_qty: e.target.value})}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" className="pc-btn-secondary" onClick={() => setIsQtyModalOpen(false)}>Batal</button>
                                <button type="submit" className="pc-btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
