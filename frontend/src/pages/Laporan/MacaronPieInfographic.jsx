import React, { useState, useMemo } from 'react';
import {
    Pencil,
    Laptop,
    Printer,
    Package,
    Phone,
    Paperclip,
    Copy,
    ScrollText,
    Plane,
    GraduationCap,
    SearchCheck,
    Building2,
    Car,
    Stethoscope,
    Utensils,
    Wifi,
    Shirt,
    Zap,
    Fuel,
    Users,
    Hospital,
    Droplets,
    BatteryCharging,
    Hammer,
    Wrench,
    Leaf,
    Receipt,
} from 'lucide-react';
import './MacaronPieInfographic.css';

// Harmonious Enterprise Donut & Chart Palette (Stripe / Linear style)
export const MACARON_PALETTE = [
    {
        color: '#635bff',
        gradStart: '#635bff',
        gradEnd: '#635bff',
        bg: 'rgba(99, 91, 255, 0.1)',
        text: '#635bff',
        border: 'rgba(99, 91, 255, 0.25)',
        name: 'Indigo Accent',
    },
    {
        color: '#0ea5e9',
        gradStart: '#0ea5e9',
        gradEnd: '#0ea5e9',
        bg: 'rgba(14, 165, 233, 0.1)',
        text: '#0284c7',
        border: 'rgba(14, 165, 233, 0.25)',
        name: 'Sky Blue',
    },
    {
        color: '#10b981',
        gradStart: '#10b981',
        gradEnd: '#10b981',
        bg: 'rgba(16, 185, 129, 0.1)',
        text: '#059669',
        border: 'rgba(16, 185, 129, 0.25)',
        name: 'Emerald',
    },
    {
        color: '#f59e0b',
        gradStart: '#f59e0b',
        gradEnd: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.1)',
        text: '#d97706',
        border: 'rgba(245, 158, 11, 0.25)',
        name: 'Amber Gold',
    },
    {
        color: '#8b5cf6',
        gradStart: '#8b5cf6',
        gradEnd: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.1)',
        text: '#7c3aed',
        border: 'rgba(139, 92, 246, 0.25)',
        name: 'Soft Violet',
    },
    {
        color: '#ec4899',
        gradStart: '#ec4899',
        gradEnd: '#ec4899',
        bg: 'rgba(236, 72, 153, 0.1)',
        text: '#db2777',
        border: 'rgba(236, 72, 153, 0.25)',
        name: 'Rose',
    },
    {
        color: '#14b8a6',
        gradStart: '#14b8a6',
        gradEnd: '#14b8a6',
        bg: 'rgba(20, 184, 166, 0.1)',
        text: '#0d9488',
        border: 'rgba(20, 184, 166, 0.25)',
        name: 'Teal',
    },
    {
        color: '#f97316',
        gradStart: '#f97316',
        gradEnd: '#f97316',
        bg: 'rgba(249, 115, 22, 0.1)',
        text: '#ea580c',
        border: 'rgba(249, 115, 22, 0.25)',
        name: 'Tangerine',
    },
    {
        color: '#06b6d4',
        gradStart: '#06b6d4',
        gradEnd: '#06b6d4',
        bg: 'rgba(6, 182, 212, 0.1)',
        text: '#0891b2',
        border: 'rgba(6, 182, 212, 0.25)',
        name: 'Cyan',
    },
    {
        color: '#84cc16',
        gradStart: '#84cc16',
        gradEnd: '#84cc16',
        bg: 'rgba(132, 204, 22, 0.1)',
        text: '#65a30d',
        border: 'rgba(132, 204, 22, 0.25)',
        name: 'Sage Lime',
    },
    {
        color: '#e11d48',
        gradStart: '#e11d48',
        gradEnd: '#e11d48',
        bg: 'rgba(225, 29, 72, 0.1)',
        text: '#be123c',
        border: 'rgba(225, 29, 72, 0.25)',
        name: 'Crimson',
    },
    {
        color: '#64748b',
        gradStart: '#64748b',
        gradEnd: '#64748b',
        bg: 'rgba(100, 116, 139, 0.1)',
        text: '#475569',
        border: 'rgba(100, 116, 139, 0.25)',
        name: 'Neutral Slate',
    },
];

// 🎀 Mapping Vector Icon Representatif untuk Setiap Akun Biaya Petty Cash (Seragam di semua OS)
export const getAccountCuteMeta = (kode, nama = '') => {
    const k = String(kode || '').replace(/\D/g, '');
    const n = (nama || '').toLowerCase();

    const makeMeta = (IconComp, label, badge) => ({
        icon: IconComp,
        Icon: IconComp,
        label,
        badge,
    });

    if (k === '531201' || n.includes('alat tulis') || n.includes('atk')) {
        return makeMeta(Pencil, 'Alat Tulis', 'ATK');
    }
    if (k === '531202' || n.includes('komputer') || n.includes('supplies')) {
        return makeMeta(Laptop, 'IT & Komputer', 'IT');
    }
    if (k === '531203' || n.includes('cetakan') || n.includes('cetak')) {
        return makeMeta(Printer, 'Cetakan Form', 'Cetak');
    }
    if (k === '531204' || n.includes('pos') || n.includes('paket') || n.includes('ekspedisi')) {
        return makeMeta(Package, 'Pos & Ekspedisi', 'Kirim');
    }
    if (k === '531205' || n.includes('telepon') || n.includes('pulsa')) {
        return makeMeta(Phone, 'Telepon / Pulsa', 'Telko');
    }
    if (k === '531206' || n.includes('peralatan kantor')) {
        return makeMeta(Paperclip, 'Peralatan Kantor', 'Office');
    }
    if (k === '531207' || n.includes('photo copy') || n.includes('fotokopi') || n.includes('fotocopy')) {
        return makeMeta(Copy, 'Fotokopi / Jilid', 'Copy');
    }
    if (k === '531208' || n.includes('pengurusan ijin') || n.includes('izin') || n.includes('legalitas')) {
        return makeMeta(ScrollText, 'Pengurusan Izin', 'Legal');
    }
    if (k === '531209' || n.includes('perjalanan dinas') || n.includes('sppd') || n.includes('dinas luar')) {
        return makeMeta(Plane, 'Perjalanan Dinas', 'Dinas');
    }
    if (k === '531210' || n.includes('training') || n.includes('pelatihan') || n.includes('seminar')) {
        return makeMeta(GraduationCap, 'Pelatihan / Diklat', 'SDM');
    }
    if (k === '531211' || n.includes('audit')) {
        return makeMeta(SearchCheck, 'Biaya Audit', 'Audit');
    }
    if (k === '532101' || n.includes('sewa kantor') || n.includes('sewa gedung')) {
        return makeMeta(Building2, 'Sewa Kantor', 'Sewa');
    }
    if (k === '532102' || n.includes('sewa kendaraan') || n.includes('rental')) {
        return makeMeta(Car, 'Sewa Kendaraan', 'Mobil');
    }
    if (k === '532103' || n.includes('sewa alat kesehatan') || n.includes('sewa alkes')) {
        return makeMeta(Stethoscope, 'Sewa Alkes', 'Alkes');
    }
    if (k === '532105' || n.includes('catering') || n.includes('konsumsi') || n.includes('snack') || n.includes('makan')) {
        return makeMeta(Utensils, 'Catering & Konsumsi', 'Makan');
    }
    if (k === '532106' || n.includes('internet') || n.includes('wifi') || n.includes('indihome') || n.includes('provider')) {
        return makeMeta(Wifi, 'Internet / WiFi', 'WiFi');
    }
    if (k === '532107' || n.includes('loundry') || n.includes('laundry') || n.includes('linen')) {
        return makeMeta(Shirt, 'Laundry & Linen', 'Cuci');
    }
    if (k === '532108' || n.includes('listrik') || n.includes('pln')) {
        return makeMeta(Zap, 'Biaya Listrik (PLN)', 'PLN');
    }
    if (k === '532109' || n.includes('keperluan rt') || n.includes('kebersihan') || n.includes('rumah tangga')) {
        return makeMeta(Users, 'Keperluan RT / Sanitasi', 'Umum');
    }
    if (k === '532110' || (n.includes('bahan bakar') && !n.includes('genset')) || n.includes('bbm') || n.includes('bensin') || n.includes('pertalite') || n.includes('pertamax')) {
        return makeMeta(Fuel, 'Bahan Bakar (BBM)', 'BBM');
    }
    if (k === '532114' || n.includes('rapat') || n.includes('pertemuan') || n.includes('meeting')) {
        return makeMeta(Users, 'Rapat & Pertemuan', 'Rapat');
    }
    if (k === '532115' || n.includes('operasional r.s') || n.includes('operasional rs')) {
        return makeMeta(Hospital, 'Operasional RS', 'RS');
    }
    if (k === '532116' || n.includes('air') || n.includes('pdam')) {
        return makeMeta(Droplets, 'Pemakaian Air (PDAM)', 'Air');
    }
    if (k === '532117' || n.includes('genset') || n.includes('solar genset')) {
        return makeMeta(BatteryCharging, 'Bahan Bakar Genset', 'Genset');
    }
    if (k === '532201' || n.includes('pemel. alat kesehatan') || n.includes('servis alkes')) {
        return makeMeta(Wrench, 'Pemel. Alkes', 'Servis');
    }
    if (k === '532202' || n.includes('pemel. kantor') || n.includes('perbaikan kantor')) {
        return makeMeta(Hammer, 'Pemel. Kantor', 'Gedung');
    }
    if (k === '532203' || n.includes('pemel. kendaraan') || n.includes('servis mobil') || n.includes('bengkel')) {
        return makeMeta(Car, 'Pemel. Kendaraan', 'Mobil');
    }
    if (k === '532204' || n.includes('pemel. lingkungan') || n.includes('taman') || n.includes('kebun')) {
        return makeMeta(Leaf, 'Pemel. Lingkungan', 'Taman');
    }
    if (k === '532205' || n.includes('pemel. bangunan rs')) {
        return makeMeta(Hospital, 'Pemel. Bangunan RS', 'RS');
    }
    if (k === '532206' || n.includes('pemel. alat kantor')) {
        return makeMeta(Wrench, 'Pemel. Alat Kantor', 'Alat');
    }
    if (k === '532207' || n.includes('pemel. komputer') || n.includes('servis pc')) {
        return makeMeta(Laptop, 'Pemel. Komputer', 'PC');
    }

    return makeMeta(Receipt, nama || 'Akun Biaya', 'Biaya');
};

// Math helpers for SVG annular sectors
const polarToCartesian = (cx, cy, r, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: cx + r * Math.cos(angleInRadians),
        y: cy + r * Math.sin(angleInRadians),
    };
};

const createDonutSlicePath = (cx, cy, rInner, rOuter, startAngle, endAngle) => {
    const diff = Math.min(endAngle - startAngle, 359.99);
    const actualEnd = startAngle + diff;

    const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
    const endOuter = polarToCartesian(cx, cy, rOuter, actualEnd);
    const startInner = polarToCartesian(cx, cy, rInner, actualEnd);
    const endInner = polarToCartesian(cx, cy, rInner, startAngle);

    const largeArcFlag = diff <= 180 ? '0' : '1';

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${startInner.x} ${startInner.y}`,
        `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
        'Z',
    ].join(' ');
};

const fmtRupiah = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

export default function MacaronPieInfographic({
    rekapAkun = [],
    totalBelanja = 0,
}) {
    const [chartLimit, setChartLimit] = useState(5);
    const [activeIdx, setActiveIdx] = useState(null);

    // Compute clean uniform Donut slices (cutout: 68%) with automatic "Lainnya" grouping
    const chartData = useMemo(() => {
        if (!rekapAkun.length) return [];

        let items = [];
        if (chartLimit === 'all' || chartLimit >= rekapAkun.length) {
            items = [...rekapAkun];
        } else {
            const topSlice = rekapAkun.slice(0, chartLimit);
            const others = rekapAkun.slice(chartLimit);
            if (others.length > 0) {
                const othersTotal = others.reduce((sum, item) => sum + Number(item.total || 0), 0);
                const totalBeban = Number(totalBelanja || 1);
                const othersPct = Number(((othersTotal / totalBeban) * 100).toFixed(1));
                items = [
                    ...topSlice,
                    {
                        kode_akun: 'LAINNYA',
                        nama_akun: `Lainnya (${others.length} Akun)`,
                        pos_biaya: 'Akun Biaya Lainnya',
                        total: othersTotal,
                        persentase: othersPct,
                        jumlah_transaksi: others.reduce((sum, item) => sum + (item.jumlah_transaksi || 0), 0),
                        isOthers: true,
                    },
                ];
            } else {
                items = topSlice;
            }
        }

        const totalSum = items.reduce((acc, it) => acc + Number(it.total || 0), 0) || 1;
        let currentAngle = 0;

        // Uniform Donut geometry: cutout 68% -> rInner = 0.68 * rOuter
        const rOuter = 152;
        const rInner = Math.round(rOuter * 0.68); // 103 (~68% cutout)

        return items.map((item, idx) => {
            const pct = Number(item.persentase || ((item.total / totalSum) * 100).toFixed(1));
            const sliceAngle = (Number(item.total || 0) / totalSum) * 360;

            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;
            currentAngle += sliceAngle;

            const pal = item.isOthers
                ? MACARON_PALETTE[MACARON_PALETTE.length - 1]
                : MACARON_PALETTE[idx % (MACARON_PALETTE.length - 1)];

            return {
                ...item,
                idx,
                pct,
                sliceAngle,
                startAngle,
                endAngle,
                rInner,
                rOuter,
                pal,
                sliceColor: pal.color,
            };
        });
    }, [rekapAkun, chartLimit, totalBelanja]);

    if (!rekapAkun.length) {
        return null;
    }

    const activeItem = activeIdx !== null ? chartData[activeIdx] : null;

    return (
        <div className="mpi-card">
            {/* ── Header ── */}
            <div className="mpi-header">
                <div className="mpi-title-wrap">
                    <div className="mpi-title-row">
                        <h3>Infografis Pengeluaran Akun Biaya</h3>
                    </div>
                    <p>Visualisasi proporsi beban kas kecil per pos akun</p>
                </div>

                <div className="mpi-actions-row">
                    <div className="mpi-limit-pills" role="tablist" aria-label="Batas tampilan pos akun">
                        <button
                            type="button"
                            className={`mpi-limit-pill ${chartLimit === 5 ? 'active' : ''}`}
                            onClick={() => setChartLimit(5)}
                        >
                            Top 5
                        </button>
                        <button
                            type="button"
                            className={`mpi-limit-pill ${chartLimit === 7 ? 'active' : ''}`}
                            onClick={() => setChartLimit(7)}
                        >
                            Top 7
                        </button>
                        <button
                            type="button"
                            className={`mpi-limit-pill ${chartLimit === 'all' ? 'active' : ''}`}
                            onClick={() => setChartLimit('all')}
                        >
                            Semua ({rekapAkun.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main Layout: Clean Donut Chart + Flat Interactive Legend ── */}
            <div className="mpi-content-grid">
                {/* ── Left Column: Clean Donut Chart (cutout 68%) ── */}
                <div className="mpi-svg-container">
                    <svg
                        viewBox="0 0 360 360"
                        className="mpi-svg"
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <g className="mpi-slices-group">
                            {chartData.map((d, idx) => {
                                const isHovered = activeIdx === idx;
                                const isAnyHovered = activeIdx !== null;
                                const pathD = createDonutSlicePath(
                                    180,
                                    180,
                                    d.rInner,
                                    isHovered ? d.rOuter + 5 : d.rOuter,
                                    d.startAngle,
                                    d.endAngle
                                );

                                return (
                                    <path
                                        key={`slice-${idx}`}
                                        d={pathD}
                                        fill={d.sliceColor}
                                        opacity={!isAnyHovered || isHovered ? 1 : 0.35}
                                        stroke="var(--lpc-canvas, #f8fafc)"
                                        strokeWidth={chartData.length > 1 ? 2.5 : 0}
                                        strokeLinejoin="round"
                                        className={`mpi-slice-path ${isHovered ? 'active' : ''}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onMouseLeave={() => setActiveIdx(null)}
                                        onClick={() => setActiveIdx(isHovered ? null : idx)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                );
                            })}
                        </g>
                    </svg>

                    {/* Clean Center Metric Overlay (HTML text for crisp tabular-nums & wrapping) */}
                    <div className="mpi-donut-center-overlay" aria-live="polite">
                        {activeItem ? (
                            <>
                                <span className="mpi-center-sub mpi-center-sub-active" title={activeItem.nama_akun}>
                                    {activeItem.nama_akun}
                                </span>
                                <span className="mpi-center-total">{fmtRupiah(activeItem.total)}</span>
                                <span
                                    className="mpi-center-count"
                                    style={{ color: activeItem.sliceColor, fontWeight: 600 }}
                                >
                                    {activeItem.pct}% &bull; {activeItem.jumlah_transaksi}x transaksi
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="mpi-center-sub">TOTAL BEBAN</span>
                                <span className="mpi-center-total">{fmtRupiah(totalBelanja)}</span>
                                <span className="mpi-center-count">{rekapAkun.length} Pos Akun</span>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Right Column: Flat Interactive Legend List ── */}
                <div className="mpi-legend-column">
                    <div className="mpi-legend-head">
                        <span className="mpi-legend-head-title">RINCIAN SLICE INFOGRAFIS</span>
                        <span className="mpi-legend-hint">Sorot baris untuk highlight slice</span>
                    </div>

                    <div className="mpi-legend-list">
                        {chartData.map((d, idx) => {
                            const isHovered = activeIdx === idx;
                            const isDimmed = activeIdx !== null && !isHovered;

                            return (
                                <div
                                    key={`legend-${idx}`}
                                    className={`mpi-legend-row ${isHovered ? 'active' : ''} ${isDimmed ? 'dimmed' : ''}`}
                                    onMouseEnter={() => setActiveIdx(idx)}
                                    onMouseLeave={() => setActiveIdx(null)}
                                    onClick={() => setActiveIdx(isHovered ? null : idx)}
                                >
                                    <span
                                        className="mpi-legend-dot"
                                        style={{ backgroundColor: d.sliceColor }}
                                    />

                                    <div className="mpi-legend-info">
                                        <div className="mpi-legend-name" title={d.nama_akun}>
                                            {d.nama_akun}
                                        </div>
                                        <div className="mpi-legend-meta-row">
                                            <span className="mpi-legend-code">{d.kode_akun}</span>
                                            <span>&bull;</span>
                                            <span>{d.jumlah_transaksi}x transaksi</span>
                                        </div>
                                    </div>

                                    <div className="mpi-legend-val-wrap">
                                        <span className="mpi-legend-amount">{fmtRupiah(d.total)}</span>
                                        <span className="mpi-legend-pct-text">{d.pct}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
