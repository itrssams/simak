import React, { useState, useMemo } from 'react';
import {
    Sparkles,
    PieChart,
    SlidersHorizontal,
    Info,
    Wallet,
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
    Tag,
} from 'lucide-react';
import './MacaronPieInfographic.css';

// 🧁 Palet Warna Macaron Prancis (Vibrant Pastel Candy)
export const MACARON_PALETTE = [
    {
        color: '#FF6B8B',
        gradStart: '#FF8FAB',
        gradEnd: '#E63956',
        bg: '#FFF0F5',
        text: '#B8002D',
        border: '#FFC2D1',
        name: 'Strawberry Macaron',
    },
    {
        color: '#00C2FF',
        gradStart: '#70D6FF',
        gradEnd: '#0090D9',
        bg: '#F0F9FF',
        text: '#0284C7',
        border: '#BAE6FD',
        name: 'Blue Sky Macaron',
    },
    {
        color: '#FFB703',
        gradStart: '#FFD166',
        gradEnd: '#F77F00',
        bg: '#FEFCE8',
        text: '#B45309',
        border: '#FDE68A',
        name: 'Lemon Custard',
    },
    {
        color: '#06D6A0',
        gradStart: '#52EDC7',
        gradEnd: '#00A878',
        bg: '#ECFDF5',
        text: '#047857',
        border: '#A7F3D0',
        name: 'Pistachio Mint',
    },
    {
        color: '#A259FF',
        gradStart: '#C084FC',
        gradEnd: '#7E22CE',
        bg: '#FAF5FF',
        text: '#6B21A8',
        border: '#E9D5FF',
        name: 'Taro Lavender',
    },
    {
        color: '#FF7A59',
        gradStart: '#FF9770',
        gradEnd: '#E65100',
        bg: '#FFF7ED',
        text: '#C2410C',
        border: '#FED7AA',
        name: 'Peach Apricot',
    },
    {
        color: '#84CC16',
        gradStart: '#A3E635',
        gradEnd: '#65A30D',
        bg: '#F7FEE7',
        text: '#4D7C0F',
        border: '#D9F99D',
        name: 'Matcha Green',
    },
    {
        color: '#F43F5E',
        gradStart: '#FB7185',
        gradEnd: '#BE123C',
        bg: '#FFF1F2',
        text: '#9F1239',
        border: '#FECDD3',
        name: 'Raspberry Rose',
    },
    {
        color: '#14B8A6',
        gradStart: '#2DD4BF',
        gradEnd: '#0D9488',
        bg: '#F0FDFA',
        text: '#0F766E',
        border: '#99F6E4',
        name: 'Tiffany Seafoam',
    },
    {
        color: '#8B5CF6',
        gradStart: '#A78BFA',
        gradEnd: '#6D28D9',
        bg: '#F5F3FF',
        text: '#5B21B6',
        border: '#DDD6FE',
        name: 'Blueberry Jam',
    },
    {
        color: '#EC4899',
        gradStart: '#F472B6',
        gradEnd: '#BE185D',
        bg: '#FDF2F8',
        text: '#9D174D',
        border: '#FBCFE8',
        name: 'Bubblegum Pink',
    },
    {
        color: '#EAB308',
        gradStart: '#FACC15',
        gradEnd: '#CA8A04',
        bg: '#FEFCE8',
        text: '#854D0E',
        border: '#FEF08A',
        name: 'Vanilla Caramel',
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
        return makeMeta(Sparkles, 'Keperluan RT / Sanitasi', 'Umum');
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
    const [chartLimit, setChartLimit] = useState(5); // Default 5 slices like the infographic reference
    const [isSteppedRadius, setIsSteppedRadius] = useState(true); // Stepped radius like Infographic image
    const [activeIdx, setActiveIdx] = useState(null);

    // Compute display data with automatic "Lainnya" grouping
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
        const maxPct = Math.max(...items.map((it) => Number(it.persentase || 0)), 1);

        let currentAngle = 0;
        const gap = items.length > 1 ? 2.8 : 0;

        return items.map((item, idx) => {
            const pct = Number(item.persentase || ((item.total / totalSum) * 100).toFixed(1));
            const sliceAngle = (Number(item.total || 0) / totalSum) * 360;

            const startAngle = currentAngle + gap / 2;
            const endAngle = currentAngle + sliceAngle - gap / 2;
            currentAngle += sliceAngle;

            const midAngle = (startAngle + endAngle) / 2;

            // Stepped radius effect (higher percentage extends further out like Image 1)
            const minOuter = 190;
            const maxOuter = 236;
            const rOuter = isSteppedRadius
                ? minOuter + (pct / maxPct) * (maxOuter - minOuter)
                : 215;

            const rInner = 86;

            // Position for in-slice content
            const midRadius = rInner + (rOuter - rInner) * 0.52;
            const contentPos = polarToCartesian(280, 280, midRadius, midAngle);

            const pal = MACARON_PALETTE[idx % MACARON_PALETTE.length];
            const meta = getAccountCuteMeta(item.kode_akun, item.nama_akun);

            return {
                ...item,
                idx,
                pct,
                sliceAngle,
                startAngle,
                endAngle,
                midAngle,
                rInner,
                rOuter,
                contentPos,
                pal,
                meta,
            };
        });
    }, [rekapAkun, chartLimit, totalBelanja, isSteppedRadius]);

    if (!rekapAkun.length) {
        return null;
    }

    const activeItem = activeIdx !== null ? chartData[activeIdx] : null;

    return (
        <div className="mpi-card">
            {/* ── Header ── */}
            <div className="mpi-header">
                <div className="mpi-title-wrap">
                    <div className="mpi-icon-badge">
                        <PieChart size={22} />
                    </div>
                    <div>
                        <div className="mpi-title-row">
                            <h3>Infografis Pengeluaran Akun Biaya</h3>
                            <span className="mpi-cute-pill">
                                <Sparkles size={12} />
                                Macaron Pie Infographic
                            </span>
                        </div>
                        <p>Visualisasi proporsi beban kas kecil per pos akun dengan icon vektor tematik & warna macaron</p>
                    </div>
                </div>

                <div className="mpi-actions-row">
                    {/* Stepped radius toggle */}
                    <button
                        type="button"
                        className={`mpi-toggle-btn ${isSteppedRadius ? 'active' : ''}`}
                        onClick={() => setIsSteppedRadius(!isSteppedRadius)}
                        title="Beralih antara variasi jari-jari (stepped rose) dan donut reguler"
                    >
                        <SlidersHorizontal size={13} />
                        <span>{isSteppedRadius ? 'Stepped Radius' : 'Uniform Donut'}</span>
                    </button>

                    {/* Slices count filter */}
                    <div className="mpi-limit-pills">
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

            {/* ── Main Layout: SVG Pie + Interactive Legend ── */}
            <div className="mpi-content-grid">
                {/* ── Left Column: The Custom SVG Pie Infographic ── */}
                <div className="mpi-svg-container">
                    <svg
                        viewBox="0 0 560 560"
                        className="mpi-svg"
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <defs>
                            {/* Gradients for slices */}
                            {chartData.map((d, i) => (
                                <linearGradient
                                    key={`grad-${i}`}
                                    id={`mpi-grad-${i}`}
                                    x1="0%"
                                    y1="0%"
                                    x2="100%"
                                    y2="100%"
                                >
                                    <stop offset="0%" stopColor={d.pal.gradStart} />
                                    <stop offset="100%" stopColor={d.pal.gradEnd} />
                                </linearGradient>
                            ))}

                            {/* Drop shadow filters */}
                            <filter id="mpi-shadow" x="-15%" y="-15%" width="130%" height="130%">
                                <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.16" />
                            </filter>
                            <filter id="mpi-active-glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="8" stdDeviation="12" floodOpacity="0.32" />
                            </filter>
                        </defs>

                        {/* Outer Glow / Base Background circle */}
                        <circle cx="280" cy="280" r="82" fill="none" opacity="0.1" />

                        {/* ── Slices Rendering ── */}
                        <g className="mpi-slices-group">
                            {chartData.map((d, idx) => {
                                const isHovered = activeIdx === idx;
                                const isAnyHovered = activeIdx !== null;
                                const pathD = createDonutSlicePath(
                                    280,
                                    280,
                                    d.rInner,
                                    isHovered ? d.rOuter + 8 : d.rOuter,
                                    d.startAngle,
                                    d.endAngle
                                );

                                const SliceIcon = d.meta.icon;
                                const iconSize = d.sliceAngle >= 26 ? 16 : 13;

                                return (
                                    <g
                                        key={`slice-${idx}`}
                                        className={`mpi-slice-item ${isHovered ? 'active' : ''}`}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onMouseLeave={() => setActiveIdx(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <path
                                            d={pathD}
                                            fill={`url(#mpi-grad-${idx})`}
                                            filter={isHovered ? 'url(#mpi-active-glow)' : 'url(#mpi-shadow)'}
                                            opacity={!isAnyHovered || isHovered ? 1 : 0.45}
                                            stroke={isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.4)'}
                                            strokeWidth={isHovered ? 3.5 : 1.5}
                                            className="mpi-slice-path"
                                        />

                                        {/* In-Slice Label & Vector Icon */}
                                        {d.sliceAngle >= 14 && (
                                            <g
                                                transform={`translate(${d.contentPos.x}, ${d.contentPos.y})`}
                                                className="mpi-slice-content"
                                                pointerEvents="none"
                                            >
                                                {/* White Icon Bubble Disc */}
                                                <circle
                                                    r={d.sliceAngle >= 26 ? 16 : 13}
                                                    cy={d.sliceAngle >= 26 ? -16 : -8}
                                                    fill="#ffffff"
                                                    filter="drop-shadow(0 2px 5px rgba(0,0,0,0.22))"
                                                />
                                                {/* Vector Icon in Center of Disc */}
                                                <g
                                                    transform={
                                                        d.sliceAngle >= 26
                                                            ? `translate(${-iconSize / 2}, ${-16 - iconSize / 2})`
                                                            : `translate(${-iconSize / 2}, ${-8 - iconSize / 2})`
                                                    }
                                                >
                                                    <SliceIcon
                                                        size={iconSize}
                                                        color={d.pal.text}
                                                        strokeWidth={2.4}
                                                    />
                                                </g>

                                                {/* Percentage Bold Number */}
                                                <text
                                                    textAnchor="middle"
                                                    y={d.sliceAngle >= 26 ? 8 : 10}
                                                    className="mpi-slice-pct-text"
                                                    fontSize={d.sliceAngle >= 32 ? 16 : 13}
                                                    fontWeight="900"
                                                    fill="#ffffff"
                                                    filter="drop-shadow(0 1.5px 3px rgba(0,0,0,0.55))"
                                                >
                                                    {d.pct}%
                                                </text>

                                                {/* Short Account Name (only for wide slices) */}
                                                {d.sliceAngle >= 38 && (
                                                    <text
                                                        textAnchor="middle"
                                                        y={22}
                                                        className="mpi-slice-label-text"
                                                        fontSize="10"
                                                        fontWeight="750"
                                                        fill="#ffffff"
                                                        filter="drop-shadow(0 1px 2px rgba(0,0,0,0.6))"
                                                    >
                                                        {d.nama_akun.length > 14
                                                            ? d.nama_akun.slice(0, 12) + '…'
                                                            : d.nama_akun}
                                                    </text>
                                                )}
                                            </g>
                                        )}
                                    </g>
                                );
                            })}
                        </g>

                        {/* ── Center White Circle (Image 1 Infographic Center) ── */}
                        <g className="mpi-center-group" pointerEvents="none">
                            {/* Outer decorative ring */}
                            <circle
                                cx="280"
                                cy="280"
                                r="82"
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.8)"
                                strokeWidth="4"
                            />
                            {/* Main Center Disc */}
                            <circle
                                cx="280"
                                cy="280"
                                r="76"
                                className="mpi-center-disc"
                            />

                            {activeItem ? (
                                /* Active Hover State */
                                <g className="mpi-center-active-text">
                                    <g transform="translate(267, 222)" className="mpi-center-icon-wrap">
                                        <activeItem.meta.icon
                                            size={26}
                                            color={activeItem.pal.color}
                                            strokeWidth={2.4}
                                        />
                                    </g>
                                    <text
                                        x="280"
                                        y="266"
                                        textAnchor="middle"
                                        className="mpi-center-title"
                                    >
                                        {activeItem.nama_akun.length > 15
                                            ? activeItem.nama_akun.slice(0, 14) + '…'
                                            : activeItem.nama_akun}
                                    </text>
                                    <text
                                        x="280"
                                        y="288"
                                        textAnchor="middle"
                                        className="mpi-center-pct"
                                        fill={activeItem.pal.color}
                                    >
                                        {activeItem.pct}%
                                    </text>
                                    <text
                                        x="280"
                                        y="306"
                                        textAnchor="middle"
                                        className="mpi-center-val"
                                    >
                                        {fmtRupiah(activeItem.total)}
                                    </text>
                                </g>
                            ) : (
                                /* Default State */
                                <g className="mpi-center-default-text">
                                    <g transform="translate(267, 223)" className="mpi-center-icon-wrap">
                                        <Wallet
                                            size={26}
                                            color="#4F46E5"
                                            strokeWidth={2.3}
                                        />
                                    </g>
                                    <text
                                        x="280"
                                        y="266"
                                        textAnchor="middle"
                                        className="mpi-center-sub"
                                    >
                                        TOTAL BEBAN
                                    </text>
                                    <text
                                        x="280"
                                        y="288"
                                        textAnchor="middle"
                                        className="mpi-center-total"
                                    >
                                        {fmtRupiah(totalBelanja)}
                                    </text>
                                    <text
                                        x="280"
                                        y="305"
                                        textAnchor="middle"
                                        className="mpi-center-count"
                                    >
                                        {rekapAkun.length} Pos Akun
                                    </text>
                                </g>
                            )}
                        </g>
                    </svg>
                </div>

                {/* ── Right Column: Interactive Legend Cards ── */}
                <div className="mpi-legend-column">
                    <div className="mpi-legend-head">
                        <span className="mpi-legend-head-title">Rincian Slice Infografis:</span>
                        <span className="mpi-legend-hint">
                            <Info size={12} /> Sorot kartu untuk highlight slice
                        </span>
                    </div>

                    <div className="mpi-legend-list">
                        {chartData.map((d, idx) => {
                            const isHovered = activeIdx === idx;
                            const CardIcon = d.meta.icon;

                            return (
                                <div
                                    key={`legend-${idx}`}
                                    className={`mpi-legend-card ${isHovered ? 'active' : ''}`}
                                    onMouseEnter={() => setActiveIdx(idx)}
                                    onMouseLeave={() => setActiveIdx(null)}
                                    style={{
                                        borderColor: isHovered ? d.pal.color : undefined,
                                        boxShadow: isHovered
                                            ? `0 8px 24px -4px ${d.pal.color}50`
                                            : undefined,
                                    }}
                                >
                                    {/* Icon Box with Macaron Background */}
                                    <div
                                        className="mpi-legend-icon-wrap"
                                        style={{
                                            background: d.pal.bg,
                                            borderColor: d.pal.border,
                                            color: d.pal.text,
                                        }}
                                    >
                                        <CardIcon size={19} strokeWidth={2.2} />
                                    </div>

                                    {/* Account Info */}
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

                                    {/* Percentage Pill & Nominal */}
                                    <div className="mpi-legend-val-wrap">
                                        <span
                                            className="mpi-legend-pct-pill"
                                            style={{
                                                background: d.pal.color,
                                                color: '#ffffff',
                                                boxShadow: `0 2px 8px ${d.pal.color}45`,
                                            }}
                                        >
                                            {d.pct}%
                                        </span>
                                        <span className="mpi-legend-amount">{fmtRupiah(d.total)}</span>
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
