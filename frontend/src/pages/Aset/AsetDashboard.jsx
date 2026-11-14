import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, List } from 'lucide-react';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import './Aset.css';
import AsetFormModal from './AsetFormModal';
import UpdateKelayakanModal from './UpdateKelayakanModal';

export default function AsetDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [summary, setSummary] = useState(null);
    const [urgentAssets, setUrgentAssets] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedAsetForUpdate, setSelectedAsetForUpdate] = useState(null);

    const isAsetAdmin = Boolean(
        user?.is_superuser ||
        user?.is_aset_admin ||
        ['manajer', 'wakil_direktur', 'direktur'].includes(user?.role) ||
        (user?.role === 'kepala_seksi' && user?.unit?.nama?.toLowerCase().includes('umum'))
    );

    const isFinancialViewer = Boolean(isAsetAdmin || user?.is_akuntansi);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        setLoading(true);
        try {
            const [sumRes, urgRes] = await Promise.all([
                api.get('/aset/aset/dashboard_summary/'),
                api.get('/aset/aset/?status_kelayakan=D&status_kelayakan=E'),
            ]);
            setSummary(sumRes.data);
            setUrgentAssets(urgRes.data.results || urgRes.data || []);
        } catch (err) {
            console.error('Failed to load asset dashboard', err);
        } finally {
            setLoading(false);
        }
    };

    const formatRp = (val) => {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    const formatKelayakanText = (label) => {
        if (!label) return '-';
        return String(label).replace(/\s+-\s+/, ' • ');
    };

    const totalAsetCount = Number(summary?.total_aset || 0);
    const perluTindakanCount = Number(summary?.perlu_tindakan_count || 0);
    const belumLengkapCount = Number(summary?.belum_lengkap_count || 0);

    return (
        <div className="aset-dash-root" aria-busy={loading}>
            {/* ── Clean Enterprise Page Header ── */}
            <div className="aset-dash-header">
                <div className="aset-dash-title-area">
                    <h1>Dashboard Manajemen Aset</h1>
                    <p>
                        Monitoring inventaris fisik, kondisi kelayakan unit, dan kalkulasi penyusutan PMK 72/2023.
                    </p>
                </div>
                <div className="aset-dash-actions">
                    <Link to="/aset/daftar" className="aset-btn-stripe secondary">
                        <List size={14} strokeWidth={1.75} /> Buka Daftar Aset
                    </Link>
                    {isAsetAdmin && (
                        <button
                            type="button"
                            className="aset-btn-stripe primary"
                            onClick={() => setIsFormOpen(true)}
                        >
                            <Plus size={14} strokeWidth={1.75} /> Tambah Aset
                        </button>
                    )}
                </div>
            </div>

            {/* ── Flat Horizontal KPI Stat-Bar (6 Metrik) ── */}
            <div className={`aset-stat-bar${!isFinancialViewer ? ' is-compact' : ''}`}>
                <div className="aset-stat-cell">
                    <span className="aset-stat-label">Total Unit Aset</span>
                    <strong className="aset-stat-val">
                        {totalAsetCount.toLocaleString('id-ID')} <span className="aset-stat-unit">Unit</span>
                    </strong>
                </div>

                {isFinancialViewer && (
                    <div className="aset-stat-cell">
                        <span className="aset-stat-label">Total Nilai Perolehan</span>
                        <strong className="aset-stat-val" title={formatRp(summary?.total_harga_perolehan)}>
                            {formatRp(summary?.total_harga_perolehan)}
                        </strong>
                    </div>
                )}

                {isFinancialViewer && (
                    <div className="aset-stat-cell">
                        <span className="aset-stat-label">Akumulasi Penyusutan</span>
                        <strong className="aset-stat-val" title={formatRp(summary?.total_akumulasi_penyusutan)}>
                            {formatRp(summary?.total_akumulasi_penyusutan)}
                        </strong>
                    </div>
                )}

                {isFinancialViewer && (
                    <div className="aset-stat-cell">
                        <span className="aset-stat-label">Nilai Buku Bersih (NBV)</span>
                        <strong className="aset-stat-val" title={formatRp(summary?.total_nilai_buku)}>
                            {formatRp(summary?.total_nilai_buku)}
                        </strong>
                    </div>
                )}

                <div className="aset-stat-cell">
                    <span className="aset-stat-label">Perlu Tindakan / Servis</span>
                    <strong className={`aset-stat-val${perluTindakanCount > 0 ? ' is-danger' : ''}`}>
                        {perluTindakanCount.toLocaleString('id-ID')} <span className="aset-stat-unit">Unit</span>
                    </strong>
                </div>

                <div className="aset-stat-cell">
                    <span className="aset-stat-label">Data Belum Lengkap</span>
                    <strong className={`aset-stat-val${belumLengkapCount > 0 ? ' is-warning' : ''}`}>
                        {belumLengkapCount.toLocaleString('id-ID')} <span className="aset-stat-unit">Unit</span>
                    </strong>
                </div>
            </div>

            {/* ── Flat 2-Column Split: Status Kelayakan Fisik & Sebaran Aset per Unit ── */}
            <div className="aset-split-grid">
                <div className="aset-split-col">
                    <div className="aset-split-head">
                        <h2>Status Kelayakan Fisik</h2>
                        <span className="aset-split-sub">Standar Grade A - E</span>
                    </div>

                    <div className="aset-flat-list">
                        {[
                            { grade: 'A', label: 'Sangat Layak (A)', color: '#10b981', count: summary?.kelayakan_counts?.A || 0 },
                            { grade: 'B', label: 'Layak (B)', color: '#38bdf8', count: summary?.kelayakan_counts?.B || 0 },
                            { grade: 'C', label: 'Cukup Layak (C)', color: '#eab308', count: summary?.kelayakan_counts?.C || 0 },
                            { grade: 'D', label: 'Kurang Layak (D)', color: '#f97316', count: summary?.kelayakan_counts?.D || 0 },
                            { grade: 'E', label: 'Tidak Layak (E)', color: '#ef4444', count: summary?.kelayakan_counts?.E || 0 },
                        ].map(item => {
                            const pct = summary?.total_aset ? ((item.count / summary.total_aset) * 100).toFixed(1) : '0.0';
                            return (
                                <button
                                    type="button"
                                    key={item.grade}
                                    className="aset-flat-row"
                                    onClick={() => navigate(`/aset/daftar?status_kelayakan=${item.grade}`)}
                                >
                                    <div className="aset-flat-row-left">
                                        <span className="aset-status-dot" style={{ background: item.color }} />
                                        <span className="aset-flat-label">{item.label}</span>
                                    </div>
                                    <div className="aset-flat-row-right">
                                        <span className="aset-flat-pct">{pct}%</span>
                                        <span className="aset-flat-count">
                                            {Number(item.count || 0).toLocaleString('id-ID')} unit
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="aset-split-col">
                    <div className="aset-split-head">
                        <h2>Sebaran Aset per Unit</h2>
                        <Link to="/aset/daftar" className="aset-split-link">
                            Semua Unit &rarr;
                        </Link>
                    </div>

                    <div className="aset-flat-list is-scrollable">
                        {summary?.unit_counts?.slice(0, 7).map(u => (
                            <button
                                type="button"
                                key={u.unit__id}
                                className="aset-flat-row"
                                onClick={() => navigate(`/aset/daftar?unit_id=${u.unit__id}`)}
                            >
                                <div className="aset-flat-row-left">
                                    <span className="aset-flat-label">{u.unit__nama}</span>
                                </div>
                                <div className="aset-flat-row-right">
                                    <span className="aset-flat-count">
                                        {Number(u.total || 0).toLocaleString('id-ID')} unit
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Borderless Urgent Assets Table (Grade D & E) ── */}
            {urgentAssets.length > 0 && (
                <section className="aset-dash-section">
                    <div className="aset-dash-section-head">
                        <h2>Aset Memerlukan Perhatian (Grade D &amp; E)</h2>
                        <span className="aset-dash-section-sub">
                            {urgentAssets.length} unit aset dilaporkan sering rusak / tidak layak
                        </span>
                    </div>

                    <div className="aset-table-borderless">
                        <table className="aset-table-stripe">
                            <thead>
                                <tr>
                                    <th>Kode Aset</th>
                                    <th>Deskripsi / Merk</th>
                                    <th>Unit &amp; Ruangan</th>
                                    <th>Status Kelayakan</th>
                                    <th>Rekomendasi Tindakan</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {urgentAssets.map(item => (
                                    <tr key={item.id}>
                                        <td className="aset-code-cell">{item.kode_aset}</td>
                                        <td>
                                            <div className="aset-cell-title">{item.deskripsi}</div>
                                            <div className="aset-cell-sub">{item.merk} {item.spesifikasi}</div>
                                        </td>
                                        <td>
                                            <div className="aset-cell-title">{item.unit_nama}</div>
                                            <div className="aset-cell-sub">{item.lokasi_teks || item.ruangan_nama || '—'}</div>
                                        </td>
                                        <td>
                                            <span className={`aset-status-text ${item.status_kelayakan === 'E' ? 'rose' : 'amber'}`}>
                                                <span className="aset-status-dot" />
                                                {formatKelayakanText(item.status_kelayakan_label)}
                                            </span>
                                        </td>
                                        <td className="aset-cell-muted">
                                            {item.rekomendasi_tindakan || '—'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                className="aset-btn-ghost"
                                                onClick={() => setSelectedAsetForUpdate(item)}
                                            >
                                                Update Kondisi
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Modal Tambah Aset */}
            <AsetFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSuccess={loadDashboard}
            />

            {/* Modal Update Kelayakan */}
            <UpdateKelayakanModal
                aset={selectedAsetForUpdate}
                isOpen={Boolean(selectedAsetForUpdate)}
                onClose={() => setSelectedAsetForUpdate(null)}
                onSuccess={loadDashboard}
            />
        </div>
    );
}


