import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Boxes,
    Package,
    TrendingDown,
    DollarSign,
    AlertTriangle,
    FileQuestion,
    Plus,
    List,
    Building2,
    CheckCircle2,
    AlertCircle,
    ArrowRight
} from 'lucide-react';
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

    return (
        <div className="aset-container">
            {/* Header */}
            <div className="aset-header">
                <div className="aset-title-area">
                    <h1>
                        <Boxes size={22} color="#818cf8" />
                        Dashboard Manajemen Aset
                    </h1>
                    <p className="aset-subtitle">
                        Monitoring inventaris fisik, kondisi kelayakan unit, dan kalkulasi penyusutan PMK 72/2023.
                    </p>
                </div>
                <div className="aset-actions">
                    <Link to="/aset/daftar" className="btn-aset btn-aset-secondary">
                        <List size={14} /> Buka Daftar Aset
                    </Link>
                    {isAsetAdmin && (
                        <button className="btn-aset btn-aset-primary" onClick={() => setIsFormOpen(true)}>
                            <Plus size={14} /> Tambah Aset
                        </button>
                    )}
                </div>
            </div>

            {/* Stat Cards Grid */}
            <div className="aset-stats-grid">
                {/* 1. Total Aset */}
                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                        <Package size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Total Unit Aset</div>
                        <div className="aset-stat-value">{summary?.total_aset || 0} Unit</div>
                        <div className="aset-stat-subtext">Inventaris aktif terdaftar</div>
                    </div>
                </div>

                {/* 2. Total Nilai Perolehan (Finansial) */}
                {isFinancialViewer && (
                    <div className="aset-stat-card">
                        <div className="aset-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                            <DollarSign size={20} />
                        </div>
                        <div className="aset-stat-info">
                            <div className="aset-stat-label">Total Nilai Perolehan</div>
                            <div className="aset-stat-value" style={{ fontSize: '15px' }}>
                                {formatRp(summary?.total_harga_perolehan)}
                            </div>
                            <div className="aset-stat-subtext">Akumulasi harga beli aset</div>
                        </div>
                    </div>
                )}

                {/* 3. Akumulasi Penyusutan (Finansial) */}
                {isFinancialViewer && (
                    <div className="aset-stat-card">
                        <div className="aset-stat-icon" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c' }}>
                            <TrendingDown size={20} />
                        </div>
                        <div className="aset-stat-info">
                            <div className="aset-stat-label">Akumulasi Penyusutan</div>
                            <div className="aset-stat-value" style={{ fontSize: '15px' }}>
                                {formatRp(summary?.total_akumulasi_penyusutan)}
                            </div>
                            <div className="aset-stat-subtext">Garis lurus s/d bulan ini</div>
                        </div>
                    </div>
                )}

                {/* 4. Nilai Buku Bersih (Finansial) */}
                {isFinancialViewer && (
                    <div className="aset-stat-card">
                        <div className="aset-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                            <Boxes size={20} />
                        </div>
                        <div className="aset-stat-info">
                            <div className="aset-stat-label">Nilai Buku Bersih (NBV)</div>
                            <div className="aset-stat-value" style={{ fontSize: '15px', color: '#38bdf8' }}>
                                {formatRp(summary?.total_nilai_buku)}
                            </div>
                            <div className="aset-stat-subtext">Sisa nilai buku aktif</div>
                        </div>
                    </div>
                )}

                {/* 5. Perlu Tindakan (Kondisi D & E) */}
                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Perlu Tindakan / Servis</div>
                        <div className="aset-stat-value" style={{ color: '#f87171' }}>
                            {summary?.perlu_tindakan_count || 0} Unit
                        </div>
                        <div className="aset-stat-subtext">Kondisi Kurang / Tidak Layak</div>
                    </div>
                </div>

                {/* 6. Data Belum Lengkap */}
                <div className="aset-stat-card">
                    <div className="aset-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                        <FileQuestion size={20} />
                    </div>
                    <div className="aset-stat-info">
                        <div className="aset-stat-label">Data Belum Lengkap</div>
                        <div className="aset-stat-value" style={{ color: '#fbbf24' }}>
                            {summary?.belum_lengkap_count || 0} Unit
                        </div>
                        <div className="aset-stat-subtext">Belum ada harga / tgl beli</div>
                    </div>
                </div>
            </div>

            {/* Grid 2 Kolom: Distribusi Kelayakan & Distribusi Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                {/* Kartu Status Kelayakan */}
                <div className="aset-dashboard-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 className="aset-dashboard-card-title">
                            Status Kelayakan Fisik
                        </h3>
                        <span className="aset-dashboard-card-sub">Standar Grade A - E</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { grade: 'A', label: 'Sangat Layak (A)', color: '#10b981', count: summary?.kelayakan_counts?.A || 0 },
                            { grade: 'B', label: 'Layak (B)', color: '#38bdf8', count: summary?.kelayakan_counts?.B || 0 },
                            { grade: 'C', label: 'Cukup Layak (C)', color: '#eab308', count: summary?.kelayakan_counts?.C || 0 },
                            { grade: 'D', label: 'Kurang Layak (D)', color: '#f97316', count: summary?.kelayakan_counts?.D || 0 },
                            { grade: 'E', label: 'Tidak Layak (E)', color: '#ef4444', count: summary?.kelayakan_counts?.E || 0 },
                        ].map(item => {
                            const pct = summary?.total_aset ? ((item.count / summary.total_aset) * 100).toFixed(1) : 0;
                            return (
                                <div
                                    key={item.grade}
                                    className="aset-kelayakan-item"
                                    onClick={() => navigate(`/aset/daftar?status_kelayakan=${item.grade}`)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                                        <span className="aset-kelayakan-label">{item.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="aset-dashboard-card-sub">{pct}%</span>
                                        <span style={{ fontWeight: 700, fontSize: '12.5px', color: item.color }}>
                                            {item.count} unit
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Kartu Sebaran per Unit */}
                <div className="aset-dashboard-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 className="aset-dashboard-card-title">
                            Sebaran Aset per Unit
                        </h3>
                        <Link to="/aset/daftar" className="aset-link-all">
                            Semua Unit &rarr;
                        </Link>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '230px', overflowY: 'auto' }}>
                        {summary?.unit_counts?.slice(0, 7).map(u => (
                            <div
                                key={u.unit__id}
                                className="aset-sebaran-item"
                                onClick={() => navigate(`/aset/daftar?unit_id=${u.unit__id}`)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Building2 size={13} color="#94a3b8" />
                                    <span className="aset-sebaran-label">{u.unit__nama}</span>
                                </div>
                                <span className="badge-unit" style={{ fontWeight: 700 }}>
                                    {u.total} unit
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabel Aset Memerlukan Perhatian */}
            {urgentAssets.length > 0 && (
                <div className="aset-dashboard-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 className="aset-dashboard-card-title danger" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={16} /> Aset Memerlukan Perhatian (Grade D & E)
                        </h3>
                        <span className="aset-dashboard-card-sub">
                            {urgentAssets.length} unit aset dilaporkan sering rusak / tidak layak
                        </span>
                    </div>

                    <div className="aset-table-wrapper">
                        <table className="aset-table">
                            <thead>
                                <tr>
                                    <th>Kode Aset</th>
                                    <th>Deskripsi / Merk</th>
                                    <th>Unit & Ruangan</th>
                                    <th>Status Kelayakan</th>
                                    <th>Rekomendasi Tindakan</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {urgentAssets.map(item => (
                                    <tr key={item.id}>
                                        <td style={{ fontWeight: 700, color: '#818cf8' }}>{item.kode_aset}</td>
                                        <td>
                                            <div className="aset-table-item-title">{item.deskripsi}</div>
                                            <div className="aset-table-item-sub">{item.merk} {item.spesifikasi}</div>
                                        </td>
                                        <td>
                                            <span className="badge-unit">{item.unit_nama}</span>
                                            <div className="aset-table-item-sub" style={{ marginTop: '2px' }}>
                                                {item.lokasi_teks || item.ruangan_nama}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge-kelayakan badge-kelayakan-${item.status_kelayakan}`}>
                                                {item.status_kelayakan_label}
                                            </span>
                                        </td>
                                        <td style={{ color: '#d97706', fontSize: '11.5px', fontWeight: 600 }}>
                                            {item.rekomendasi_tindakan || '-'}
                                        </td>
                                        <td>
                                            <button
                                                className="btn-aset btn-aset-secondary"
                                                style={{ padding: '3px 8px', fontSize: '11px' }}
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
                </div>
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

